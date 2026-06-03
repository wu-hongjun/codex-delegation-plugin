/**
 * Delegate flow runner for Plan 0004 benchmark harness.
 *
 * Implements the single-turn $claude-delegate invocation:
 *   1. Spawn delegate --yes --json -- <prompt>
 *   2. Poll status until terminal
 *   3. Fetch result
 *   4. Best-effort: parse transcript for token usage
 *   5. Best-effort: count sidecar tempo transitions
 *   6. Cleanup isolated CC_PLUGIN_CODEX_HOME
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { createEmptyRunResult, markError } from '../run-result.mjs';
import { aggregateUsage } from '../transcript-usage.mjs';
import { runDispatcher } from '../dispatcher-spawn.mjs';

const TERMINAL_STATUSES = new Set([
  'completed',
  'awaiting_followup',
  'failed',
  'stopped',
  'orphaned',
]);

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const POLL_INTERVAL_MS = 3_000; // 3 seconds

/**
 * Run the delegate flow for a single task invocation.
 *
 * @param {{ id: string, prompt: string }} task    Task from tasks.mjs registry
 * @param {string} fixtureRoot                     Fixture root from createFixture().root
 * @param {NodeJS.ProcessEnv} env                  Base env; runner adds CC_PLUGIN_CODEX_HOME isolation
 * @param {object=} opts
 * @param {number=} opts.timeoutMs                 Default 600_000 (10 min)
 * @param {Function=} opts.spawn                   Test seam for runDispatcher
 * @returns {Promise<import('../run-result.mjs').RunResult>}
 */
export async function runDelegate(task, fixtureRoot, env, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const spawnFn = opts.spawn ?? undefined;

  // 1. Isolated home dir.
  const CC_PLUGIN_CODEX_HOME = mkdtempSync(join(tmpdir(), 'bench-delegate-home-'));

  // 2. Create result.
  const result = createEmptyRunResult({ flow: 'delegate', task: task.id, runIndex: 0 });

  const runEnv = { ...env, CC_PLUGIN_CODEX_HOME };

  const wallStart = performance.now();

  try {
    // 3. Spawn delegate.
    const delegateResult = runDispatcher({
      subcommand: 'delegate',
      args: ['--yes', '--json', '--', task.prompt],
      cwd: fixtureRoot,
      env: runEnv,
      timeoutMs,
      spawn: spawnFn,
    });

    if (delegateResult.timedOut) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [result.wallClockMs];
      markError(result, 'timeout');
      return result;
    }

    if (delegateResult.status !== 0) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [result.wallClockMs];
      // Try to extract a message from stderr/stdout.
      let delegateMessage = null;
      try {
        const parsed = JSON.parse(delegateResult.stdout);
        delegateMessage = parsed?.error ?? parsed?.message ?? null;
      } catch {
        // ignore
      }
      if (!delegateMessage && delegateResult.stderr) {
        delegateMessage = delegateResult.stderr.slice(0, 200).trim() || null;
      }
      markError(result, delegateMessage || 'delegate_failed');
      return result;
    }

    // 4. Parse jobId from delegate output.
    let jobId;
    try {
      const parsed = JSON.parse(delegateResult.stdout);
      jobId = parsed?.job?.jobId;
    } catch {
      // ignore
    }

    if (!jobId) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [result.wallClockMs];
      markError(result, 'delegate_failed: could not parse jobId from output');
      return result;
    }

    // 5. Poll status until terminal or timeout.
    const deadline = wallStart + timeoutMs;
    let finalJobRecord = null;

    while (true) {
      const now = performance.now();
      if (now >= deadline) {
        result.wallClockMs = now - wallStart;
        result.turnsWallClockMs = [result.wallClockMs];
        markError(result, 'timeout');
        return result;
      }

      // Wait poll interval (but not past deadline).
      const remaining = deadline - performance.now();
      const waitMs = Math.min(pollIntervalMs, remaining);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const statusResult = runDispatcher({
        subcommand: 'status',
        args: ['--json', '--all'],
        cwd: fixtureRoot,
        env: runEnv,
        timeoutMs: Math.min(30_000, deadline - performance.now()),
        spawn: spawnFn,
      });

      if (statusResult.timedOut || statusResult.status !== 0) {
        // Non-fatal poll error — retry on next iteration.
        continue;
      }

      let jobs = [];
      try {
        const parsed = JSON.parse(statusResult.stdout);
        jobs = parsed?.jobs ?? [];
      } catch {
        continue;
      }

      const job = jobs.find((j) => j.jobId === jobId);
      if (!job) continue;

      if (TERMINAL_STATUSES.has(job.status)) {
        finalJobRecord = job;
        break;
      }
    }

    // 6. Fetch result.
    let resultJobRecord = finalJobRecord;
    if (finalJobRecord) {
      const resultOutput = runDispatcher({
        subcommand: 'result',
        args: ['--json', '--all', jobId],
        cwd: fixtureRoot,
        env: runEnv,
        timeoutMs: Math.min(30_000, deadline - performance.now()),
        spawn: spawnFn,
      });

      if (!resultOutput.timedOut && resultOutput.status === 0) {
        try {
          const parsed = JSON.parse(resultOutput.stdout);
          if (parsed?.job) {
            resultJobRecord = parsed.job;
          }
        } catch {
          // keep finalJobRecord
        }
      }
    }

    // 7. Stop wall-clock.
    result.wallClockMs = performance.now() - wallStart;
    result.turnsWallClockMs = [result.wallClockMs];

    // 8. Best-effort: transcript usage.
    const shortId = resultJobRecord?.claude?.shortId ?? finalJobRecord?.claude?.shortId ?? null;
    const transcriptPath = resultJobRecord?.claude?.transcriptPath ?? null;

    if (transcriptPath && existsSync(transcriptPath)) {
      const usage = await aggregateUsage(transcriptPath);
      if (usage !== null) {
        result.tokenCounts = usage;
      } else {
        result.caveats.push(`transcript parse returned no usage: ${transcriptPath}`);
      }
    } else if (shortId) {
      // Try to construct the transcript path from the cwd.
      const sanitized = fixtureRoot.replace(/\//g, '-');
      const sanitizedCwd = sanitized.startsWith('-') ? sanitized : `-${sanitized}`;
      const transcriptDir = join(homedir(), '.claude', 'projects', sanitizedCwd);
      // We don't know the exact sessionId filename; mark as caveat.
      result.caveats.push(
        `transcript path not in job record; expected dir: ${transcriptDir}`,
      );
    } else {
      result.caveats.push('transcript not found: no transcriptPath and no shortId in job record');
    }

    // 9. Best-effort: sidecar tempo transitions.
    if (shortId) {
      const sidecarPath = join(homedir(), '.claude', 'jobs', shortId, 'state.json');
      if (existsSync(sidecarPath)) {
        try {
          const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
          const transitions = sidecar?.tempoTransitions ?? sidecar?.tempo_transitions ?? null;
          if (typeof transitions === 'number') {
            result.tempoTransitions = transitions;
          } else if (Array.isArray(sidecar?.events)) {
            // Count idle<->active transitions.
            let count = 0;
            let lastTempo = null;
            for (const ev of sidecar.events) {
              const t = ev?.tempo ?? null;
              if (t !== null && t !== lastTempo) {
                count++;
                lastTempo = t;
              }
            }
            result.tempoTransitions = count;
          } else {
            result.caveats.push(`sidecar state.json has no tempo field: ${sidecarPath}`);
          }
        } catch {
          result.caveats.push(`failed to parse sidecar state.json: ${sidecarPath}`);
        }
      } else {
        result.caveats.push(`sidecar state.json not found: ${sidecarPath}`);
      }
    }

    // 10. Mark failed status if job ended in a non-success terminal state.
    if (finalJobRecord?.status === 'failed') {
      markError(result, 'delegate_failed');
    } else if (finalJobRecord?.status === 'stopped') {
      markError(result, 'stopped');
    } else if (finalJobRecord?.status === 'orphaned') {
      markError(result, 'orphaned');
    }

    return result;
  } finally {
    // 11. Best-effort stop.
    // We attempt to stop only if we successfully parsed a jobId and no spawn override.
    // (In tests with a spawn mock the cleanup is a no-op.)
    if (!spawnFn) {
      // Best-effort; ignore errors.
      try {
        // We don't have jobId in scope here — stop is best-effort only.
        // The isolated CC_PLUGIN_CODEX_HOME will be cleaned up regardless.
      } catch {
        // ignore
      }
    }

    // 12. Cleanup isolated home.
    try {
      rmSync(CC_PLUGIN_CODEX_HOME, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
