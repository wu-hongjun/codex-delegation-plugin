/**
 * Baseline-p runner for Plan 0004 benchmark harness.
 *
 * This runner exercises `claude -p` which the plugin explicitly does NOT use.
 * It exists solely as a billing/latency comparison anchor for Plan 0004
 * measurement and lives ONLY in this harness. No production code path
 * in cc-plugin-codex calls claude -p.
 *
 * Only invoked when `--include-baseline-p` is passed to the harness CLI.
 * The flow registry in the CLI (T2) gates this runner behind that flag.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { createEmptyRunResult, markError } from '../run-result.mjs';
import { aggregateUsage, transcriptDirForCwd } from '../transcript-usage.mjs';

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const STDOUT_EXCERPT_MAX = 200;

/**
 * Run claude -p directly as a billing/latency comparison anchor.
 *
 * This runner exercises `claude -p` which the plugin explicitly does NOT use.
 * It exists solely as a billing/latency comparison anchor for Plan 0004
 * measurement and lives ONLY in this harness. No production code path
 * in cc-plugin-codex calls claude -p.
 *
 * @param {{ id: string, prompt: string }} task    Task from tasks.mjs registry
 * @param {string} fixtureRoot                     Fixture root from createFixture().root
 * @param {NodeJS.ProcessEnv} env                  Base env; no CC_PLUGIN_CODEX_HOME isolation needed (-p is stateless)
 * @param {object=} opts
 * @param {number=} opts.timeoutMs                 Default 600_000 (10 min)
 * @param {Function=} opts.spawn                   Test seam for spawnSync
 * @returns {Promise<import('../run-result.mjs').RunResult>}
 */
export async function runBaselineP(task, fixtureRoot, env, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnFn = opts.spawn ?? spawnSync;

  const result = createEmptyRunResult({ flow: 'baseline-p', task: task.id, runIndex: 0 });

  // No CC_PLUGIN_CODEX_HOME isolation needed; `claude -p` is stateless.
  const runEnv = { ...env };

  const wallStart = performance.now();

  // Spawn `claude -p "<task.prompt>"` directly — NOT through the plugin dispatcher.
  const spawnResult = spawnFn('claude', ['-p', task.prompt], {
    cwd: fixtureRoot,
    env: runEnv,
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10 MB
  });

  result.wallClockMs = performance.now() - wallStart;
  result.turnsWallClockMs = [result.wallClockMs];

  // Detect timeout.
  const timedOut =
    spawnResult.error?.code === 'ETIMEDOUT' ||
    spawnResult.error?.code === 'ERR_CHILD_PROCESS_TIMEOUT' ||
    spawnResult.signal === 'SIGTERM' ||
    spawnResult.signal === 'SIGKILL';

  if (timedOut) {
    markError(result, 'timeout');
    return result;
  }

  const status = spawnResult.status ?? 1;
  const stdout = typeof spawnResult.stdout === 'string' ? spawnResult.stdout : '';
  const stderr = typeof spawnResult.stderr === 'string' ? spawnResult.stderr : '';

  if (status !== 0) {
    const errMsg = stderr.slice(0, 200).trim() || 'claude_p_failed';
    markError(result, errMsg);
    return result;
  }

  // Capture stdout as result text (preserve a ≤200 char excerpt in caveats for evidence).
  const excerpt = stdout.slice(0, STDOUT_EXCERPT_MAX);
  if (excerpt.length > 0) {
    result.caveats.push(
      `stdout excerpt (${Math.min(stdout.length, STDOUT_EXCERPT_MAX)} chars): ${excerpt}`,
    );
  }

  // tempoTransitions: null — no sidecar for `-p`; it's a single-shot CLI invocation.
  result.tempoTransitions = null;

  // reviewVerdict / findingsCount: null — not a review flow.
  result.reviewVerdict = null;
  result.findingsCount = null;

  // Best-effort: find the most-recently-modified transcript in the projects dir.
  const transcriptDir = transcriptDirForCwd(fixtureRoot);

  if (existsSync(transcriptDir)) {
    let entries = [];
    try {
      entries = readdirSync(transcriptDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          const p = join(transcriptDir, f);
          return { path: p, mtime: 0 };
        });
      // Sort by mtime descending to pick the most recent session.
      for (const entry of entries) {
        try {
          entry.mtime = statSync(entry.path).mtimeMs;
        } catch {
          // ignore
        }
      }
      entries.sort((a, b) => b.mtime - a.mtime);
    } catch {
      // ignore
    }

    if (entries.length > 0) {
      const usage = await aggregateUsage(entries[0].path);
      if (usage !== null) {
        result.tokenCounts = usage;
      } else {
        result.caveats.push(`transcript parse returned no usage: ${entries[0].path}`);
      }
    } else {
      result.caveats.push(`no .jsonl transcripts found in: ${transcriptDir}`);
    }
  } else {
    result.caveats.push(`transcript dir not found: ${transcriptDir}`);
    result.tokenCounts = null;
  }

  return result;
}
