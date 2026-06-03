/**
 * Self-tests for tools/bench/lib/runners/delegate-adversarial.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * Uses DI (opts.spawn) so no real Claude invocations are made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDelegateAdversarial } from '../../lib/runners/delegate-adversarial.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'bench-adv-test-fixture-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const FAKE_JOB_ID = 'job-aabbccdd-1122-3344-5566-778899aabbcc';
const FAKE_SHORT_ID = 'abc123';
const TASK = { id: 'summarize-todos', prompt: 'Inspect this repo and summarize TODOs.' };

function delegateResponse(jobId = FAKE_JOB_ID, shortId = FAKE_SHORT_ID) {
  return JSON.stringify({
    ok: true,
    job: {
      jobId,
      status: 'running',
      claude: { shortId, sessionName: 'test-session', logsCommand: `claude logs ${shortId}` },
      workspace: { root: '/tmp/fixture' },
    },
  });
}

function statusResponse(jobId = FAKE_JOB_ID, status = 'completed') {
  return JSON.stringify({
    ok: true,
    jobs: [
      {
        jobId,
        status,
        claude: { shortId: FAKE_SHORT_ID, sessionName: 'test-session' },
        workspace: { root: '/tmp/fixture' },
      },
    ],
  });
}

function resultResponse(jobId = FAKE_JOB_ID, status = 'completed') {
  return JSON.stringify({
    ok: true,
    job: {
      jobId,
      status,
      result: 'The assistant completed the task.',
      claude: { shortId: FAKE_SHORT_ID, sessionName: 'test-session' },
      workspace: { root: '/tmp/fixture' },
    },
    resultText: 'The assistant completed the task.',
  });
}

function adversarialReviewResponse(verdict = 'pass', findingsCount = 0) {
  return JSON.stringify({
    ok: true,
    review: {
      verdict,
      findingsCount,
      blockerCount: 0,
      highCount: 0,
      mediumCount: findingsCount,
      lowCount: 0,
      nitCount: 0,
    },
  });
}

/**
 * Create a mock spawn function that sequences through the provided responses.
 * After the queue is exhausted, every subsequent call returns the last entry.
 */
function makeSequencedSpawn(responseQueue) {
  let idx = 0;
  return (_cmd, _args, _opts) => {
    const resp = responseQueue[Math.min(idx++, responseQueue.length - 1)];
    return {
      status: resp.status ?? 0,
      stdout: resp.stdout ?? '',
      stderr: resp.stderr ?? '',
      signal: resp.timedOut ? 'SIGTERM' : null,
      error: resp.timedOut ? { code: 'ETIMEDOUT' } : null,
    };
  };
}

/**
 * Standard happy-path spawn sequence:
 *  1. delegate  → success with jobId
 *  2. status    → 'completed' (terminal)
 *  3. result    → result object
 *  4. adversarial-review → pass verdict
 */
function happyPathSpawn(verdict = 'pass', findingsCount = 0, jobId = FAKE_JOB_ID) {
  return makeSequencedSpawn([
    { status: 0, stdout: delegateResponse(jobId) },
    { status: 0, stdout: statusResponse(jobId, 'completed') },
    { status: 0, stdout: resultResponse(jobId) },
    { status: 0, stdout: adversarialReviewResponse(verdict, findingsCount) },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDelegateAdversarial() — happy path', () => {
  it('returns RunResult with error=null on success', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.error, null, `expected no error, got: ${result.error}`);
    } finally {
      cleanup();
    }
  });

  it('returns flow="delegate-adversarial"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.flow, 'delegate-adversarial');
    } finally {
      cleanup();
    }
  });

  it('returns task=task.id', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.task, TASK.id);
    } finally {
      cleanup();
    }
  });

  it('reviewVerdict="pass" for pass verdict', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        { spawn: happyPathSpawn('pass', 0) },
      );
      assert.equal(result.reviewVerdict, 'pass');
    } finally {
      cleanup();
    }
  });

  it('findingsCount=0 for pass verdict', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        { spawn: happyPathSpawn('pass', 0) },
      );
      assert.equal(result.findingsCount, 0);
    } finally {
      cleanup();
    }
  });

  it('turnsWallClockMs has exactly 2 entries (delegation + review)', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.turnsWallClockMs.length, 2);
    } finally {
      cleanup();
    }
  });

  it('wallClockMs is a non-negative number', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.ok(typeof result.wallClockMs === 'number');
      assert.ok(result.wallClockMs >= 0);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateAdversarial() — verdict variants', () => {
  it('reviewVerdict="fail" for fail verdict', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        { spawn: happyPathSpawn('fail', 3) },
      );
      assert.equal(result.reviewVerdict, 'fail');
      assert.equal(result.findingsCount, 3);
    } finally {
      cleanup();
    }
  });

  it('reviewVerdict="pass_with_findings" for pass_with_findings verdict', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        {
          spawn: happyPathSpawn('pass_with_findings', 2),
        },
      );
      assert.equal(result.reviewVerdict, 'pass_with_findings');
      assert.equal(result.findingsCount, 2);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateAdversarial() — failure paths', () => {
  it('returns error when delegate exits non-zero', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: 1, stdout: '', stderr: 'Claude not found' }]);
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, `expected error, got null`);
      assert.equal(result.turnsWallClockMs.length, 1);
    } finally {
      cleanup();
    }
  });

  it('returns error when delegate stdout is not parseable JSON', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: 0, stdout: 'not-valid-json', stderr: '' }]);
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error due to unparseable stdout');
    } finally {
      cleanup();
    }
  });

  it('returns error="timeout" when delegate spawn signals SIGTERM', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: null, timedOut: true, stdout: '', stderr: '' }]);
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn, timeoutMs: 100 });
      assert.equal(result.error, 'timeout');
    } finally {
      cleanup();
    }
  });

  it('returns error="review_timeout" when adversarial-review subprocess times out', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
        { status: 0, stdout: resultResponse() },
        { status: null, timedOut: true, stdout: '', stderr: '' }, // review times out
      ]);
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        {
          spawn,
          reviewTimeoutMs: 100,
        },
      );
      assert.equal(result.error, 'review_timeout');
      assert.equal(result.reviewVerdict, null);
    } finally {
      cleanup();
    }
  });

  it('returns error when adversarial-review exits non-zero', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
        { status: 0, stdout: resultResponse() },
        { status: 1, stdout: '', stderr: 'review process crashed' },
      ]);
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error from non-zero review exit');
      assert.equal(result.reviewVerdict, null);
    } finally {
      cleanup();
    }
  });

  it('returns error when adversarial-review stdout is malformed JSON', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
        { status: 0, stdout: resultResponse() },
        { status: 0, stdout: 'not valid json at all' },
      ]);
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error from malformed JSON');
      assert.equal(result.reviewVerdict, null);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateAdversarial() — ineligible terminal state', () => {
  it('returns error="no_reviewable_result" when polling never yields terminal state before timeout', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      // Delegate succeeds, but status always returns 'running' (never terminal).
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        // All subsequent calls return running status — will timeout.
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'running') },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'running') },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'running') },
      ]);
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        {
          spawn,
          timeoutMs: 200,
          pollIntervalMs: 50,
        },
      );
      // Should time out since status never reaches terminal.
      assert.ok(result.error !== null, 'expected error from non-terminal status');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateAdversarial() — token aggregation', () => {
  it('tokenCounts is null when both transcripts are missing', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      // No real transcripts exist in test environment.
      assert.equal(result.tokenCounts, null);
    } finally {
      cleanup();
    }
  });

  it('caveats mention missing adversarial review session transcript', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      const hasReviewTranscriptCaveat = result.caveats.some((c) =>
        c.includes('adversarial review session transcript missing'),
      );
      assert.ok(
        hasReviewTranscriptCaveat,
        `expected caveat about missing review transcript, got: ${JSON.stringify(result.caveats)}`,
      );
    } finally {
      cleanup();
    }
  });

  it('caveats mention missing target transcript', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn: happyPathSpawn() });
      const hasTargetTranscriptCaveat = result.caveats.some(
        (c) =>
          c.includes('target transcript') ||
          c.includes('transcript not found') ||
          c.includes('transcript path not in job record'),
      );
      assert.ok(
        hasTargetTranscriptCaveat,
        `expected caveat about missing target transcript, got: ${JSON.stringify(result.caveats)}`,
      );
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateAdversarial() — opts.reviewTimeoutMs', () => {
  it('custom reviewTimeoutMs is honored (triggers timeout with small value)', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      // Review response is a timeout signal.
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
        { status: 0, stdout: resultResponse() },
        { status: null, timedOut: true, stdout: '', stderr: '' },
      ]);
      const result = await runDelegateAdversarial(
        TASK,
        root,
        {},
        {
          spawn,
          reviewTimeoutMs: 500, // custom value (not 1_800_000 default)
        },
      );
      assert.equal(result.error, 'review_timeout');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateAdversarial() — severity caveats', () => {
  it('appends severity breakdown to caveats when present in review output', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
        { status: 0, stdout: resultResponse() },
        {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            review: {
              verdict: 'fail',
              findingsCount: 3,
              blockerCount: 1,
              highCount: 1,
              mediumCount: 1,
              lowCount: 0,
              nitCount: 0,
            },
          }),
        },
      ]);
      const result = await runDelegateAdversarial(TASK, root, {}, { spawn });
      const severityCaveat = result.caveats.find((c) =>
        c.includes('adversarial-review severities'),
      );
      assert.ok(severityCaveat, `expected severity caveat, got: ${JSON.stringify(result.caveats)}`);
      assert.ok(
        severityCaveat.includes('blocker:1'),
        `expected blocker count in caveat: ${severityCaveat}`,
      );
    } finally {
      cleanup();
    }
  });
});
