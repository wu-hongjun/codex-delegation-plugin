/**
 * Delegate-adversarial flow runner for Plan 0004 benchmark harness.
 *
 * Implements the two-turn $claude-delegate + $claude-adversarial-review invocation:
 *   1. Spawn delegate --yes --json -- <prompt>
 *   2. Poll status until terminal state with result populated
 *   3. If ineligible terminal state (no result), mark error='no_reviewable_result'
 *   4. Spawn adversarial-review <jobId> --yes --json (fresh session, 30-min timeout)
 *   5. Parse review verdict, findings count, and severity breakdown
 *   6. Aggregate transcript usage from BOTH the target job AND the review session
 *   7. Best-effort: sidecar tempo transitions for target job
 *   8. Cleanup: stop <jobId> for target; review session reconciled by plugin
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { createEmptyRunResult, markError } from '../run-result.mjs';
import { aggregateUsage, findLatestTranscriptForCwd } from '../transcript-usage.mjs';
import { runDispatcher } from '../dispatcher-spawn.mjs';

// Terminal states that have a reviewable result per Plan 0003.
const REVIEWABLE_TERMINAL_STATUSES = new Set([
  'completed',
  'awaiting_followup',
  'failed',
  'stopped',
  'orphaned',
]);

// Non-terminal / ineligible states.
const INELIGIBLE_STATUSES = new Set(['running', 'queued', 'starting', 'needs_input']);

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes for delegation + polling
const DEFAULT_REVIEW_TIMEOUT_MS = 1_800_000; // 30 minutes for adversarial review (DD-1)
const POLL_INTERVAL_MS = 3_000;

/**
 * Merge two TokenUsage objects by summing every numeric field.
 * serviceTier is kept only if both agree; null otherwise.
 *
 * @param {import('../run-result.mjs').TokenUsage} a
 * @param {import('../run-result.mjs').TokenUsage} b
 * @returns {import('../run-result.mjs').TokenUsage}
 */
function mergeTokenUsage(a, b) {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheEphemeral1hInputTokens: a.cacheEphemeral1hInputTokens + b.cacheEphemeral1hInputTokens,
    cacheEphemeral5mInputTokens: a.cacheEphemeral5mInputTokens + b.cacheEphemeral5mInputTokens,
    messageCount: a.messageCount + b.messageCount,
    serviceTier: a.serviceTier === b.serviceTier ? a.serviceTier : null,
  };
}

/**
 * Run the delegate-adversarial flow for a single task invocation.
 *
 * @param {{ id: string, prompt: string }} task    Task from tasks.mjs registry
 * @param {string} fixtureRoot                     Fixture root from createFixture().root
 * @param {NodeJS.ProcessEnv} env                  Base env; runner adds CC_PLUGIN_CODEX_HOME isolation
 * @param {object=} opts
 * @param {number=} opts.timeoutMs                 Delegation + polling timeout. Default 600_000 (10 min).
 * @param {number=} opts.reviewTimeoutMs           Adversarial review subprocess timeout. Default 1_800_000 (30 min).
 * @param {number=} opts.pollIntervalMs            Status poll interval. Default 3_000 ms.
 * @param {Function=} opts.spawn                   Test seam for runDispatcher
 * @returns {Promise<import('../run-result.mjs').RunResult>}
 */
export async function runDelegateAdversarial(task, fixtureRoot, env, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const reviewTimeoutMs = opts.reviewTimeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const spawnFn = opts.spawn ?? undefined;

  // 1. Isolated home dir.
  const CC_PLUGIN_CODEX_HOME = mkdtempSync(join(tmpdir(), 'bench-delegate-adversarial-home-'));

  // 2. Create result.
  const result = createEmptyRunResult({
    flow: 'delegate-adversarial',
    task: task.id,
    runIndex: 0,
  });

  const runEnv = { ...env, CC_PLUGIN_CODEX_HOME };

  const wallStart = performance.now();
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

    const turn0Ms = performance.now() - wallStart;

    if (delegateResult.timedOut) {
      result.wallClockMs = turn0Ms;
      result.turnsWallClockMs = [turn0Ms];
      markError(result, 'timeout');
      return result;
    }

    if (delegateResult.status !== 0) {
      result.wallClockMs = turn0Ms;
      result.turnsWallClockMs = [turn0Ms];
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
      jobId = parsed?.job?.jobId ?? null;
    } catch {
      // ignore
    }

    if (!jobId) {
      result.wallClockMs = turn0Ms;
      result.turnsWallClockMs = [turn0Ms];
      markError(result, 'delegate_failed: could not parse jobId from output');
      return result;
    }

    // 5. Poll status until terminal state with result or timeout.
    const deadline = wallStart + timeoutMs;
    let finalJobRecord = null;

    while (true) {
      const now = performance.now();
      if (now >= deadline) {
        result.wallClockMs = now - wallStart;
        result.turnsWallClockMs = [now - wallStart];
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

      if (REVIEWABLE_TERMINAL_STATUSES.has(job.status)) {
        finalJobRecord = job;
        break;
      }

      // If we land in a permanently ineligible non-terminal state (shouldn't happen
      // normally, but guard for clarity — actual timeout is handled above).
    }

    const turn0EndMs = performance.now() - wallStart;

    // 6. Check result is populated (all eligible terminal states should have result).
    // If the job result field is missing, mark no_reviewable_result.
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

    // Verify result is populated — adversarial review requires it.
    const hasResult =
      resultJobRecord?.result != null ||
      resultJobRecord?.resultText != null ||
      (resultJobRecord?.status && REVIEWABLE_TERMINAL_STATUSES.has(resultJobRecord.status));

    if (!hasResult && !finalJobRecord) {
      result.wallClockMs = performance.now() - wallStart;
      result.turnsWallClockMs = [turn0EndMs];
      markError(result, 'no_reviewable_result');
      return result;
    }

    // 7. Spawn adversarial-review <jobId> --yes --json.
    const reviewStart = performance.now();

    const reviewResult = runDispatcher({
      subcommand: 'adversarial-review',
      args: [jobId, '--yes', '--json'],
      cwd: fixtureRoot,
      env: runEnv,
      timeoutMs: reviewTimeoutMs,
      spawn: spawnFn,
    });

    const turn1Ms = performance.now() - reviewStart;
    const totalMs = performance.now() - wallStart;

    result.wallClockMs = totalMs;
    result.turnsWallClockMs = [turn0EndMs, turn1Ms];

    // 8. Handle review timeout.
    if (reviewResult.timedOut) {
      markError(result, 'review_timeout');
      // Still attempt transcript aggregation for the target job.
      await _aggregateTargetTranscript(result, resultJobRecord, finalJobRecord, fixtureRoot);
      result.caveats.push('adversarial review session transcript missing: review timed out');
      _aggregateSidecar(result, resultJobRecord, finalJobRecord);
      return result;
    }

    // 9. Handle review failure (non-zero exit).
    if (reviewResult.status !== 0) {
      let reviewMessage = null;
      try {
        const parsed = JSON.parse(reviewResult.stdout);
        reviewMessage = parsed?.error ?? parsed?.message ?? null;
      } catch {
        // ignore
      }
      if (!reviewMessage && reviewResult.stderr) {
        reviewMessage = reviewResult.stderr.slice(0, 200).trim() || null;
      }
      markError(result, reviewMessage || 'adversarial_review_failed');
      result.reviewVerdict = null;
      await _aggregateTargetTranscript(result, resultJobRecord, finalJobRecord, fixtureRoot);
      result.caveats.push('adversarial review session transcript missing: review failed');
      _aggregateSidecar(result, resultJobRecord, finalJobRecord);
      return result;
    }

    // 10. Parse adversarial-review --json output.
    let reviewVerdict = null;
    let findingsCount = null;
    let reviewTranscriptPath = null;

    try {
      const parsed = JSON.parse(reviewResult.stdout);
      const review = parsed?.review ?? parsed ?? null;
      reviewVerdict = review?.verdict ?? null;
      findingsCount = review?.findingsCount ?? null;

      // Capture severity counts as caveats / extra info.
      const severities = [];
      if (review?.blockerCount != null) severities.push(`blocker:${review.blockerCount}`);
      if (review?.highCount != null) severities.push(`high:${review.highCount}`);
      if (review?.mediumCount != null) severities.push(`medium:${review.mediumCount}`);
      if (review?.lowCount != null) severities.push(`low:${review.lowCount}`);
      if (review?.nitCount != null) severities.push(`nit:${review.nitCount}`);
      if (severities.length > 0) {
        result.caveats.push(`adversarial-review severities: ${severities.join(', ')}`);
      }

      // Transcript path for the review session (if provided in output).
      reviewTranscriptPath =
        parsed?.reviewSession?.transcriptPath ??
        parsed?.session?.transcriptPath ??
        review?.transcriptPath ??
        null;
    } catch {
      markError(result, 'adversarial_review_json_parse_failed');
      result.reviewVerdict = null;
      await _aggregateTargetTranscript(result, resultJobRecord, finalJobRecord, fixtureRoot);
      result.caveats.push('adversarial review session transcript missing: malformed JSON');
      _aggregateSidecar(result, resultJobRecord, finalJobRecord);
      return result;
    }

    result.reviewVerdict = reviewVerdict;
    result.findingsCount = findingsCount;

    // 11. Aggregate transcript usage from BOTH sessions.
    const targetUsage = await _aggregateTargetTranscriptUsage(
      result,
      resultJobRecord,
      finalJobRecord,
      fixtureRoot,
    );

    let reviewUsage = null;
    if (reviewTranscriptPath && existsSync(reviewTranscriptPath)) {
      reviewUsage = await aggregateUsage(reviewTranscriptPath);
      if (reviewUsage === null) {
        result.caveats.push(
          `adversarial review transcript parse returned no usage: ${reviewTranscriptPath}`,
        );
      }
    } else {
      result.caveats.push(
        'adversarial review session transcript missing: transcriptPath not in review output',
      );
    }

    if (targetUsage !== null && reviewUsage !== null) {
      result.tokenCounts = mergeTokenUsage(targetUsage, reviewUsage);
    } else if (targetUsage !== null) {
      result.tokenCounts = targetUsage;
    } else if (reviewUsage !== null) {
      result.tokenCounts = reviewUsage;
    }
    // else tokenCounts remains null

    // 12. Best-effort: sidecar tempo transitions for target job.
    _aggregateSidecar(result, resultJobRecord, finalJobRecord);

    // 13. Mark error if target job ended in a non-success terminal state.
    if (finalJobRecord?.status === 'failed') {
      markError(result, 'delegate_failed');
    } else if (finalJobRecord?.status === 'stopped') {
      markError(result, 'stopped');
    } else if (finalJobRecord?.status === 'orphaned') {
      markError(result, 'orphaned');
    }

    return result;
  } finally {
    // Cleanup: best-effort stop of target job; cleanup isolated home.
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

    try {
      rmSync(CC_PLUGIN_CODEX_HOME, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Aggregate transcript usage for the target job and attach to result.
 * Returns the usage object (or null) for further merging.
 *
 * @param {import('../run-result.mjs').RunResult} result
 * @param {object|null} resultJobRecord
 * @param {object|null} finalJobRecord
 * @param {string} fixtureRoot
 * @returns {Promise<import('../run-result.mjs').TokenUsage | null>}
 */
async function _aggregateTargetTranscriptUsage(
  result,
  resultJobRecord,
  finalJobRecord,
  fixtureRoot,
) {
  const transcriptPath = resultJobRecord?.claude?.transcriptPath ?? null;
  const shortId = resultJobRecord?.claude?.shortId ?? finalJobRecord?.claude?.shortId ?? null;

  if (transcriptPath && existsSync(transcriptPath)) {
    const usage = await aggregateUsage(transcriptPath);
    if (usage !== null) {
      return usage;
    } else {
      result.caveats.push(`target transcript parse returned no usage: ${transcriptPath}`);
      return null;
    }
  } else if (shortId) {
    // Job record had no transcriptPath; discover the latest .jsonl under
    // the fixture's projects dir (realpath-aware).
    const discovered = findLatestTranscriptForCwd(fixtureRoot);
    if (discovered) {
      const usage = await aggregateUsage(discovered);
      if (usage !== null) {
        return usage;
      } else {
        result.caveats.push(`target transcript parse returned no usage: ${discovered}`);
        return null;
      }
    } else {
      result.caveats.push(
        `no target transcript found for cwd: ${fixtureRoot}; shortId: ${shortId}`,
      );
      return null;
    }
  } else {
    result.caveats.push(
      'target transcript not found: no transcriptPath and no shortId in job record',
    );
    return null;
  }
}

/**
 * Convenience wrapper: attach transcript caveat only (no return value needed).
 * Used in early-exit error paths where we don't merge usages.
 */
async function _aggregateTargetTranscript(result, resultJobRecord, finalJobRecord, fixtureRoot) {
  const usage = await _aggregateTargetTranscriptUsage(
    result,
    resultJobRecord,
    finalJobRecord,
    fixtureRoot,
  );
  if (usage !== null) {
    result.tokenCounts = usage;
  }
}

/**
 * Best-effort sidecar tempo transitions for the target job.
 *
 * @param {import('../run-result.mjs').RunResult} result
 * @param {object|null} resultJobRecord
 * @param {object|null} finalJobRecord
 */
function _aggregateSidecar(result, resultJobRecord, finalJobRecord) {
  const shortId = resultJobRecord?.claude?.shortId ?? finalJobRecord?.claude?.shortId ?? null;
  if (!shortId) return;

  const sidecarPath = join(homedir(), '.claude', 'jobs', shortId, 'state.json');
  if (!existsSync(sidecarPath)) {
    result.caveats.push(`sidecar state.json not found: ~/.claude/jobs/${shortId}/state.json`);
    return;
  }

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
    result.caveats.push(`failed to parse sidecar state.json: ~/.claude/jobs/${shortId}/state.json`);
  }
}
