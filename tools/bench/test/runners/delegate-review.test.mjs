/**
 * Self-tests for tools/bench/lib/runners/delegate-review.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * Uses DI (opts.spawn) so no real Claude invocations are made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDelegateReview } from '../../lib/runners/delegate-review.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory to act as fixtureRoot. Returns { root, cleanup }. */
function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'bench-delegate-review-test-fixture-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const FAKE_JOB_ID = 'job-aabbccdd-1122-3344-5566-778899aabbcc';
const FAKE_SHORT_ID = 'abc123';

/** Build a fake delegate JSON response. */
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

/**
 * Build a fake status JSON response.
 * @param {string} jobId
 * @param {string} status
 */
function statusResponse(jobId = FAKE_JOB_ID, status = 'awaiting_followup') {
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

/**
 * Build a fake review JSON response.
 * @param {{ verdict?: string, findings?: any[] }} opts
 */
function reviewResponse({ verdict = 'pass', findings = [] } = {}) {
  return JSON.stringify({
    ok: true,
    job: {
      jobId: FAKE_JOB_ID,
      status: 'completed',
      claude: { shortId: FAKE_SHORT_ID, sessionName: 'test-session' },
      workspace: { root: '/tmp/fixture' },
    },
    review: {
      verdict,
      findings,
    },
  });
}

/**
 * Create a mock spawn function that sequences through the provided responses.
 * Each call pops the next response. After exhaustion, the last entry repeats.
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
      error: null,
    };
  };
}

/**
 * Standard happy-path spawn sequence for delegate-review:
 *  1. delegate → success with jobId
 *  2. status   → 'awaiting_followup'
 *  3. review   → success with verdict
 */
function happyPathSpawn({ verdict = 'pass', findings = [] } = {}) {
  return makeSequencedSpawn([
    { status: 0, stdout: delegateResponse() },
    { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
    { status: 0, stdout: reviewResponse({ verdict, findings }) },
  ]);
}

const TASK = { id: 'review-task', prompt: 'Inspect this repo and list issues.' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDelegateReview() — happy path', () => {
  it('returns RunResult with error=null on success', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.error, null, `expected no error, got: ${result.error}`);
    } finally {
      cleanup();
    }
  });

  it('result has flow="delegate-review"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.flow, 'delegate-review');
    } finally {
      cleanup();
    }
  });

  it('result has task=task.id', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.task, TASK.id);
    } finally {
      cleanup();
    }
  });

  it('turnsWallClockMs has exactly 2 elements for delegate-review flow', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.turnsWallClockMs.length, 2);
    } finally {
      cleanup();
    }
  });

  it('wallClockMs is a positive number', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.ok(typeof result.wallClockMs === 'number', 'wallClockMs should be a number');
      assert.ok(result.wallClockMs >= 0, 'wallClockMs should be >= 0');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateReview() — verdict parsing', () => {
  it('parses verdict "pass" correctly', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(
        TASK,
        root,
        {},
        {
          spawn: happyPathSpawn({ verdict: 'pass', findings: [] }),
        },
      );
      assert.equal(result.reviewVerdict, 'pass');
      assert.equal(result.error, null);
    } finally {
      cleanup();
    }
  });

  it('parses verdict "fail" correctly', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(
        TASK,
        root,
        {},
        {
          spawn: happyPathSpawn({ verdict: 'fail', findings: [{ id: 'f1' }] }),
        },
      );
      assert.equal(result.reviewVerdict, 'fail');
      assert.equal(result.error, null);
    } finally {
      cleanup();
    }
  });

  it('parses verdict "pass_with_findings" correctly', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(
        TASK,
        root,
        {},
        {
          spawn: happyPathSpawn({
            verdict: 'pass_with_findings',
            findings: [{ id: 'f1' }, { id: 'f2' }],
          }),
        },
      );
      assert.equal(result.reviewVerdict, 'pass_with_findings');
      assert.equal(result.error, null);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateReview() — findings count', () => {
  it('findingsCount=0 when findings array is empty', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(
        TASK,
        root,
        {},
        {
          spawn: happyPathSpawn({ verdict: 'pass', findings: [] }),
        },
      );
      assert.equal(result.findingsCount, 0);
    } finally {
      cleanup();
    }
  });

  it('findingsCount matches length of findings array (3 items)', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(
        TASK,
        root,
        {},
        {
          spawn: happyPathSpawn({
            verdict: 'fail',
            findings: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }],
          }),
        },
      );
      assert.equal(result.findingsCount, 3);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateReview() — failure paths', () => {
  it('returns error when delegate exits non-zero; turnsWallClockMs has 1 entry', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: 1, stdout: '', stderr: 'Claude not found' }]);
      const result = await runDelegateReview(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error to be set');
      assert.equal(result.turnsWallClockMs.length, 1);
    } finally {
      cleanup();
    }
  });

  it('returns error when review exits non-zero; reviewVerdict remains null', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
        { status: 1, stdout: '', stderr: 'review failed' },
      ]);
      const result = await runDelegateReview(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error to be set');
      assert.equal(result.reviewVerdict, null);
    } finally {
      cleanup();
    }
  });

  it('returns error="ttl_expired" when status reaches "completed" instead of "awaiting_followup"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
      ]);
      const result = await runDelegateReview(TASK, root, {}, { spawn });
      assert.equal(result.error, 'ttl_expired');
    } finally {
      cleanup();
    }
  });

  it('returns error when review stdout is malformed JSON; reviewVerdict=null', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
        { status: 0, stdout: 'not-valid-json' },
      ]);
      const result = await runDelegateReview(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error due to malformed JSON');
      assert.equal(result.reviewVerdict, null);
    } finally {
      cleanup();
    }
  });

  it('returns error="timeout" when delegate spawn signals SIGTERM', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: null, timedOut: true, stdout: '', stderr: '' }]);
      const result = await runDelegateReview(TASK, root, {}, { spawn, timeoutMs: 100 });
      assert.equal(result.error, 'timeout');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateReview() — isolation', () => {
  it('CODEX_DELEGATION_HOME temp dir is cleaned up after the run', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedHome = null;
    let callCount = 0;
    const seqSpawn = (_cmd, _args, opts) => {
      if (callCount === 0 && opts.env?.CODEX_DELEGATION_HOME) {
        capturedHome = opts.env.CODEX_DELEGATION_HOME;
      }
      const responses = [
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
        { status: 0, stdout: reviewResponse({ verdict: 'pass', findings: [] }) },
      ];
      return {
        ...responses[Math.min(callCount++, responses.length - 1)],
        signal: null,
        error: null,
      };
    };
    try {
      await runDelegateReview(TASK, root, {}, { spawn: seqSpawn });
      assert.ok(capturedHome !== null, 'expected CODEX_DELEGATION_HOME to be set');
      assert.ok(
        !existsSync(capturedHome),
        `expected CODEX_DELEGATION_HOME to be cleaned up, but ${capturedHome} still exists`,
      );
    } finally {
      cleanup();
      if (capturedHome && existsSync(capturedHome)) {
        rmSync(capturedHome, { recursive: true, force: true });
      }
    }
  });
});

describe('runDelegateReview() — caveats', () => {
  it('appends a caveat when transcript is not found', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.ok(
        result.caveats.length > 0,
        'expected at least one caveat when transcript is missing',
      );
    } finally {
      cleanup();
    }
  });

  it('tokenCounts is null when transcript is missing', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateReview(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.tokenCounts, null);
    } finally {
      cleanup();
    }
  });
});
