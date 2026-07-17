/**
 * Delegate-followup flow runner for Plan 0004 benchmark harness.
 *
 * Implements the two-turn $claude-delegate + followup invocation:
 *   1. Spawn delegate --yes --json -- <prompt>
 *   2. Poll status until awaiting_followup (or other terminal)
 *   3. Spawn followup <jobId> --yes --json -- <followup-prompt>
 *   4. Poll status until awaiting_followup again or any terminal
 *   5. Fetch result
 *   6. Best-effort: parse transcript for token usage
 *   7. Best-effort: count sidecar tempo transitions
 *   8. Cleanup isolated CODEX_DELEGATION_HOME
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { createEmptyRunResult, markError } from '../run-result.mjs';
import { aggregateUsage, findLatestTranscriptForCwd } from '../transcript-usage.mjs';
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

const FOLLOWUP_PROMPT = 'Now confirm how many files you inspected.';

/**
 * Run the delegate-followup flow for a single task invocation.
 *
 * @param {{ id: string, prompt: string }} task    Task from tasks.mjs registry
 * @param {string} fixtureRoot                     Fixture root from createFixture().root
 * @param {NodeJS.ProcessEnv} env                  Base env; runner adds CODEX_DELEGATION_HOME isolation
 * @param {object=} opts
 * @param {number=} opts.timeoutMs                 Default 600_000 (10 min)
 * @param {Function=} opts.spawn                   Test seam for runDispatcher
 * @returns {Promise<import('../run-result.mjs').RunResult>}
 */
export async function runDelegateFollowup(task, fixtureRoot, env, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const spawnFn = opts.spawn ?? undefined;

  // 1. Isolated home dir.
  const CODEX_DELEGATION_HOME = mkdtempSync(join(tmpdir(), 'bench-delegate-followup-home-'));

  // 2. Create result.
  const result = createEmptyRunResult({ flow: 'delegate-followup', task: task.id, runIndex: 0 });

  const runEnv = { ...env, CODEX_DELEGATION_HOME };

  const wallStart = performance.now();
  const deadline = wallStart + timeoutMs;

  let jobId = null;

  try {
    // 3. Spawn delegate.
    const delegateResult = runDispatcher({
      subcommand: 'delegate',
      // --permission-mode acceptEdits: see comment in delegate.mjs. Required
      // for non-interactive bench runs against edit-requiring tasks.
      args: ['--yes', '--json', '--permission-mode', 'bypassPermissions', '--', task.prompt],
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
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [result.wallClockMs];
      markError(result, 'delegate_failed: could not parse jobId from output');
      return result;
    }

    // 5. Poll status until awaiting_followup (turn 0 done) or other terminal.
    const turn0Start = performance.now();
    let finalJobRecord = null;
    let reachedFollowupGate = false;

    while (true) {
      const now = performance.now();
      if (now >= deadline) {
        result.wallClockMs = now - wallStart;
        result.turnsWallClockMs = [now - turn0Start];
        markError(result, 'timeout');
        return result;
      }

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
        reachedFollowupGate = job.status === 'awaiting_followup';
        break;
      }
    }

    const turn0Ms = performance.now() - turn0Start;

    // 6. If the job ended in a non-followup terminal state, mark ttl_expired.
    if (!reachedFollowupGate) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms];
      markError(result, 'ttl_expired');
      return result;
    }

    // 7. Spawn followup.
    const turn1Start = performance.now();

    const followupResult = runDispatcher({
      subcommand: 'followup',
      args: [jobId, '--yes', '--json', '--', FOLLOWUP_PROMPT],
      cwd: fixtureRoot,
      env: runEnv,
      timeoutMs: Math.min(timeoutMs, deadline - performance.now()),
      spawn: spawnFn,
    });

    if (followupResult.timedOut) {
      const turn1Ms = performance.now() - turn1Start;
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms, turn1Ms];
      markError(result, 'timeout');
      return result;
    }

    if (followupResult.status !== 0) {
      const turn1Ms = performance.now() - turn1Start;
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0Ms, turn1Ms];
      let followupMessage = null;
      try {
        const parsed = JSON.parse(followupResult.stdout);
        followupMessage = parsed?.error ?? parsed?.message ?? null;
      } catch {
        // ignore
      }
      if (!followupMessage && followupResult.stderr) {
        followupMessage = followupResult.stderr.slice(0, 200).trim() || null;
      }
      markError(result, followupMessage || 'followup_failed');
      return result;
    }

    // 8. Poll status until awaiting_followup again (followup turn done) or any terminal.
    while (true) {
      const now = performance.now();
      if (now >= deadline) {
        const turn1Ms = now - turn1Start;
        result.wallClockMs = now - wallStart;
        result.turnsWallClockMs = [turn0Ms, turn1Ms];
        markError(result, 'timeout');
        return result;
      }

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

    const turn1Ms = performance.now() - turn1Start;

    // 9. Fetch result.
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

    // 10. Stop wall-clock.
    result.wallClockMs = performance.now() - wallStart;
    result.turnsWallClockMs = [turn0Ms, turn1Ms];

    // 11. Best-effort: transcript usage.
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
      const discovered = findLatestTranscriptForCwd(fixtureRoot);
      if (discovered) {
        const usage = await aggregateUsage(discovered);
        if (usage !== null) {
          result.tokenCounts = usage;
        } else {
          result.caveats.push(`transcript parse returned no usage: ${discovered}`);
        }
      } else {
        result.caveats.push(`no transcript found for cwd: ${fixtureRoot}`);
      }
    } else {
      result.caveats.push('transcript not found: no transcriptPath and no shortId in job record');
    }

    // 12. Best-effort: sidecar tempo transitions.
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
            result.caveats.push(
              `sidecar state.json has no tempo field: ~/.claude/jobs/${shortId}/state.json`,
            );
          }
        } catch {
          result.caveats.push(
            `failed to parse sidecar state.json: ~/.claude/jobs/${shortId}/state.json`,
          );
        }
      } else {
        result.caveats.push(`sidecar state.json not found: ~/.claude/jobs/${shortId}/state.json`);
      }
    }

    // 13. Mark failed status if job ended in a non-success terminal state.
    if (finalJobRecord?.status === 'failed') {
      markError(result, 'delegate_failed');
    } else if (finalJobRecord?.status === 'stopped') {
      markError(result, 'stopped');
    } else if (finalJobRecord?.status === 'orphaned') {
      markError(result, 'orphaned');
    }

    return result;
  } finally {
    // 14. Best-effort stop.
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

    // 15. Cleanup isolated home.
    try {
      rmSync(CODEX_DELEGATION_HOME, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
