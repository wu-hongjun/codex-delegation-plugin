/**
 * Transcript JSONL parser for Plan 0004 benchmark harness.
 *
 * Claude Code stores session transcripts at:
 *   ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl
 *
 * Sanitization rule (per Plan 0003 research): replace every '/' with '-',
 * then prepend a leading '-' if the result does not already start with one.
 * Dots ('.') are preserved as-is (best-effort; Claude may do additional mangling
 * for paths with consecutive dots or trailing dots — such edge cases are not
 * handled here and will produce a caveat in the RunResult).
 */

import { createReadStream, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Compute the sanitized cwd path used by Claude Code for transcript storage.
 *
 * Rule: resolve realpath FIRST (on macOS, /var/folders is a symlink to
 * /private/var/folders; Claude Code stores transcripts under the realpath,
 * so we must do the same). Then replace all '/' with '-'. If the result
 * does not start with '-', prepend one. Dots are passed through unchanged
 * (best-effort).
 *
 * realpath failures (e.g., path no longer exists by the time we look) fall
 * back to the original cwd — better to compute a defensible best-effort
 * path than to throw.
 *
 * @param {string} cwd - absolute path, e.g. '/Users/hongjunwu/Repositories/Git/codex-delegation-plugin'
 * @returns {string} e.g. '-Users-hongjunwu-Repositories-Git-codex-delegation-plugin'
 */
export function sanitizeCwd(cwd) {
  let resolved = cwd;
  try {
    resolved = realpathSync(cwd);
  } catch {
    // Fall back to the original path if realpath fails (e.g., path was cleaned up).
  }
  const replaced = resolved.replace(/\//g, '-');
  return replaced.startsWith('-') ? replaced : `-${replaced}`;
}

/**
 * Build the expected transcript directory for a given cwd.
 *
 * @param {string} cwd
 * @returns {string} absolute path to the projects/<sanitized-cwd>/ directory
 */
export function transcriptDirForCwd(cwd) {
  return join(homedir(), '.claude', 'projects', sanitizeCwd(cwd));
}

/**
 * Find the most-recently-modified `.jsonl` transcript inside the Claude Code
 * projects directory for the given cwd. realpath-aware via `sanitizeCwd`.
 *
 * Returns the absolute path to the latest transcript file, or null if the
 * dir does not exist or contains no `.jsonl` files. Never throws.
 *
 * @param {string} cwd
 * @returns {string | null}
 */
export function findLatestTranscriptForCwd(cwd) {
  const dir = transcriptDirForCwd(cwd);
  if (!existsSync(dir)) return null;
  let entries;
  try {
    entries = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const p = join(dir, f);
        return { p, mtimeMs: statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return null;
  }
  return entries.length > 0 ? entries[0].p : null;
}

/**
 * Read a transcript JSONL file and aggregate message.usage fields.
 *
 * @param {string} transcriptPath - absolute path to the JSONL file
 * @returns {Promise<import('./run-result.mjs').TokenUsage | null>}
 *   null on missing/unreadable file or no usage entries found
 */
export async function aggregateUsage(transcriptPath) {
  if (!existsSync(transcriptPath)) {
    return null;
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheEphemeral1hInputTokens = 0;
  let cacheEphemeral5mInputTokens = 0;
  let messageCount = 0;

  /** @type {string | null} */
  let firstServiceTier = undefined;
  let mixedServiceTier = false;

  try {
    const rl = createInterface({
      input: createReadStream(transcriptPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        // skip malformed lines
        continue;
      }

      const usage = entry?.message?.usage;
      if (!usage) continue;

      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
      cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
      cacheEphemeral1hInputTokens += usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      cacheEphemeral5mInputTokens += usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
      messageCount += 1;

      const tier = entry?.message?.usage?.service_tier ?? null;
      if (firstServiceTier === undefined) {
        firstServiceTier = tier;
      } else if (!mixedServiceTier && tier !== firstServiceTier) {
        mixedServiceTier = true;
      }
    }
  } catch {
    return null;
  }

  if (messageCount === 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    cacheEphemeral1hInputTokens,
    cacheEphemeral5mInputTokens,
    messageCount,
    serviceTier: mixedServiceTier ? null : (firstServiceTier ?? null),
  };
}
