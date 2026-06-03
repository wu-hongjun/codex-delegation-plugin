/**
 * Delegate-review flow runner for Plan 0004 benchmark harness.
 *
 * Implements the two-turn $claude-delegate + $claude-review invocation:
 *   1. Spawn delegate --yes --json -- <prompt>
 *   2. Poll status until awaiting_followup (or another terminal → ttl_expired)
 *   3. Spawn review <jobId> --yes --json
 *   4. Parse review verdict and findings count
 *   5. Best-effort: parse transcript for token usage
 *   6. Best-effort: count sidecar tempo transitions
 *   7. Cleanup isolated CC_PLUGIN_CODEX_HOME
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
 * Run the delegate-review flow for a single task invocation.
 *
 * @param {{ id: string, prompt: string }} task    Task from tasks.mjs registry
 * @param {string} fixtureRoot                     Fixture root from createFixture().root
 * @param {NodeJS.ProcessEnv} env                  Base env; runner adds CC_PLUGIN_CODEX_HOME isolation
 * @param {object=} opts
 * @param {number=} opts.timeoutMs                 Default 600_000 (10 min)
 * @param {Function=} opts.spawn                   Test seam for runDispatcher
 * @returns {Promise<import('../run-result.mjs').RunResult>}
 */
export async function runDelegateReview(task, fixtureRoot, env, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const spawnFn = opts.spawn ?? undefined;

  // 1. Isolated home dir.
  const CC_PLUGIN_CODEX_HOME = mkdtempSync(join(tmpdir(), 'bench-delegate-review-home-'));

  // 2. Create result.
  const result = createEmptyRunResult({ flow: 'delegate-review', task: task.id, runIndex: 0 });

  const runEnv = { ...env, CC_PLUGIN_CODEX_HOME };

  const wallStart = performance.now();
  let jobId;

  try {
    // 3. Spawn delegate.
    const turn0Start = performance.now();
    const delegateResult = runDispatcher({
      subcommand: 'delegate',
      args: ['--yes', '--json', '--', task.prompt],
      cwd: fixtureRoot,
      env: runEnv,
      timeoutMs,
      spawn: spawnFn,
    });

    if (delegateResult.timedOut) {
      const elapsed = performance.now() - wallStart;
      result.wallClockMs = elapsed;
      result.turnsWallClockMs = [elapsed];
      markError(result, 'timeout');
      return result;
    }

    if (delegateResult.status !== 0) {
      const elapsed = performance.now() - wallStart;
      result.wallClockMs = elapsed;
      result.turnsWallClockMs = [elapsed];
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
    try {
      const parsed = JSON.parse(delegateResult.stdout);
      jobId = parsed?.job?.jobId;
    } catch {
      // ignore
    }

    if (!jobId) {
      const elapsed = performance.now() - wallStart;
      result.wallClockMs = elapsed;
      result.turnsWallClockMs = [elapsed];
      markError(result, 'delegate_failed: could not parse jobId from output');
      return result;
    }

    // 5. Poll status until awaiting_followup or another terminal.
    const deadline = wallStart + timeoutMs;
    let finalStatus = null;

    while (true) {
      const now = performance.now();
      if (now >= deadline) {
        result.wallClockMs = now - wallStart;
        result.turnsWallClockMs = [now - wallStart];
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
        finalStatus = job.status;
        break;
      }
    }

    // Record turn0 wall-clock (delegate + poll until awaiting_followup).
    const turn0Ms = performance.now() - turn0Start;

    // 6. If terminal state was not awaiting_followup, mark ttl_expired.
    if (finalStatus !== 'awaiting_followup') {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms];
      markError(result, 'ttl_expired');
      return result;
    }

    // 7. Spawn review.
    const turn1Start = performance.now();
    const reviewResult = runDispatcher({
      subcommand: 'review',
      args: ['--yes', '--json', jobId],
      cwd: fixtureRoot,
      env: runEnv,
      timeoutMs: Math.min(timeoutMs, deadline - performance.now()),
      spawn: spawnFn,
    });

    const turn1Ms = performance.now() - turn1Start;

    if (reviewResult.timedOut) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms, turn1Ms];
      markError(result, 'timeout');
      return result;
    }

    if (reviewResult.status !== 0) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms, turn1Ms];
      markError(result, 'review_failed');
      return result;
    }

    // 8. Parse review --json output.
    let reviewVerdict = null;
    let findingsCount = null;
    let reviewJobRecord = null;

    try {
      const parsed = JSON.parse(reviewResult.stdout);
      const review = parsed?.review ?? null;
      reviewVerdict = review?.verdict ?? null;
      const findings = review?.findings ?? null;
      if (Array.isArray(findings)) {
        findingsCount = findings.length;
      } else if (typeof review?.findingsCount === 'number') {
        findingsCount = review.findingsCount;
      }
      if (parsed?.job) {
        reviewJobRecord = parsed.job;
      }
    } catch {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms, turn1Ms];
      markError(result, 'review_parse_error');
      return result;
    }

    if (reviewVerdict === null) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms, turn1Ms];
      markError(result, 'review_parse_error');
      return result;
    }

    // 9. Stop wall-clock.
    result.wallClockMs = performance.now() - wallStart;
    result.turnsWallClockMs = [turn0Ms, turn1Ms];
    result.reviewVerdict = reviewVerdict;
    result.findingsCount = findingsCount;

    // 10. Best-effort: transcript usage.
    const shortId = reviewJobRecord?.claude?.shortId ?? null;
    const transcriptPath = reviewJobRecord?.claude?.transcriptPath ?? null;

    if (transcriptPath && existsSync(transcriptPath)) {
      const usage = await aggregateUsage(transcriptPath);
      if (usage !== null) {
        result.tokenCounts = usage;
      } else {
        result.caveats.push(`transcript parse returned no usage: ${transcriptPath}`);
      }
    } else if (shortId) {
      const sanitized = fixtureRoot.replace(/\//g, '-');
      const sanitizedCwd = sanitized.startsWith('-') ? sanitized : `-${sanitized}`;
      const transcriptDir = join(homedir(), '.claude', 'projects', sanitizedCwd);
      result.caveats.push(
        `transcript path not in job record; expected dir: ${transcriptDir}`,
      );
    } else {
      result.caveats.push('transcript not found: no transcriptPath and no shortId in job record');
    }

    // 11. Best-effort: sidecar tempo transitions.
    if (shortId) {
      const sidecarPath = join(homedir(), '.claude', 'jobs', shortId, 'state.json');
      if (existsSync(sidecarPath)) {
        try {
          const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
          const transitions = sidecar?.tempoTransitions ?? sidecar?.tempo_transitions ?? null;
          if (typeof transitions === 'number') {
            result.tempoTransitions = transitions;
          } else if (Array.isArray(sidecar?.events)) {
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

    return result;
  } finally {
    // 12. Best-effort stop.
    if (!spawnFn && jobId) {
      try {
        runDispatcher({
          subcommand: 'stop',
          args: [jobId],
          cwd: fixtureRoot,
          env: runEnv,
          timeoutMs: 10_000,
          spawn: undefined,
        });
      } catch {
        // ignore
      }
    }

    // 13. Cleanup isolated home.
    try {
      rmSync(CC_PLUGIN_CODEX_HOME, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
