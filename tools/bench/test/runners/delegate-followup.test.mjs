/**
 * Self-tests for tools/bench/lib/runners/delegate-followup.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * Uses DI (opts.spawn) so no real Claude invocations are made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDelegateFollowup } from '../../lib/runners/delegate-followup.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory to act as fixtureRoot. Returns { root, cleanup }. */
function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'bench-delegate-followup-test-fixture-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const FAKE_JOB_ID = 'job-aabbccdd-1122-3344-5566-778899aabbcc';
const FAKE_SHORT_ID = 'abc123';

/**
 * Build a fake delegate JSON response (what claude-companion delegate --json emits).
 */
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
 * Build a fake followup JSON response.
 */
function followupResponse(jobId = FAKE_JOB_ID) {
  return JSON.stringify({
    ok: true,
    job: {
      jobId,
      status: 'running',
      claude: { shortId: FAKE_SHORT_ID, sessionName: 'test-session' },
      workspace: { root: '/tmp/fixture' },
    },
  });
}

/**
 * Build a fake result JSON response.
 */
function resultResponse(jobId = FAKE_JOB_ID) {
  return JSON.stringify({
    ok: true,
    job: {
      jobId,
      status: 'completed',
      claude: { shortId: FAKE_SHORT_ID, sessionName: 'test-session' },
      workspace: { root: '/tmp/fixture' },
    },
    resultText: 'I inspected 3 files.',
  });
}

/**
 * Create a mock spawn function that sequences through the provided responses.
 * Each call to the mock pops the next response from the queue.
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
      error: null,
    };
  };
}

/**
 * Standard happy-path spawn sequence:
 *  1. delegate       → success with jobId
 *  2. status (poll1) → 'awaiting_followup'  (turn 0 done)
 *  3. followup       → success
 *  4. status (poll2) → 'awaiting_followup'  (turn 1 done)
 *  5. result         → result object
 */
function happyPathSpawn(jobId = FAKE_JOB_ID) {
  return makeSequencedSpawn([
    { status: 0, stdout: delegateResponse(jobId) },
    { status: 0, stdout: statusResponse(jobId, 'awaiting_followup') },
    { status: 0, stdout: followupResponse(jobId) },
    { status: 0, stdout: statusResponse(jobId, 'awaiting_followup') },
    { status: 0, stdout: resultResponse(jobId) },
  ]);
}

const TASK = { id: 'inspect-files', prompt: 'Inspect this repo and list all files.' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDelegateFollowup() — happy path', () => {
  it('returns a RunResult with error=null on success', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.error, null, `expected no error, got: ${result.error}`);
    } finally {
      cleanup();
    }
  });

  it('result has flow="delegate-followup"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.flow, 'delegate-followup');
    } finally {
      cleanup();
    }
  });

  it('result has task=task.id', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.task, TASK.id);
    } finally {
      cleanup();
    }
  });

  it('turnsWallClockMs has exactly 2 elements for two-turn flow', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.turnsWallClockMs.length, 2);
    } finally {
      cleanup();
    }
  });

  it('wallClockMs is a positive number', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.ok(typeof result.wallClockMs === 'number', 'wallClockMs should be a number');
      assert.ok(result.wallClockMs >= 0, 'wallClockMs should be >= 0');
    } finally {
      cleanup();
    }
  });

  it('both turnsWallClockMs entries are non-negative numbers', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.turnsWallClockMs.length, 2);
      assert.ok(result.turnsWallClockMs[0] >= 0, 'turn0Ms should be >= 0');
      assert.ok(result.turnsWallClockMs[1] >= 0, 'turn1Ms should be >= 0');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateFollowup() — failure paths', () => {
  it('delegate failure (non-zero) → error populated; turnsWallClockMs has 1 entry', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 1, stdout: '', stderr: 'Claude not found' },
      ]);
      const result = await runDelegateFollowup(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error to be set');
      assert.equal(result.turnsWallClockMs.length, 1, 'expected only 1 turn entry after delegate failure');
    } finally {
      cleanup();
    }
  });

  it('status reaches completed (not awaiting_followup) → error = "ttl_expired"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
      ]);
      const result = await runDelegateFollowup(TASK, root, {}, { spawn });
      assert.equal(result.error, 'ttl_expired');
    } finally {
      cleanup();
    }
  });

  it('status reaches failed (not awaiting_followup) → error = "ttl_expired"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'failed') },
      ]);
      const result = await runDelegateFollowup(TASK, root, {}, { spawn });
      assert.equal(result.error, 'ttl_expired');
    } finally {
      cleanup();
    }
  });

  it('ttl_expired path returns turnsWallClockMs with 1 entry', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'completed') },
      ]);
      const result = await runDelegateFollowup(TASK, root, {}, { spawn });
      assert.equal(result.turnsWallClockMs.length, 1, 'expected only 1 turn entry when ttl_expired');
    } finally {
      cleanup();
    }
  });

  it('followup failure (non-zero) → error populated; turnsWallClockMs has 2 entries', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
        { status: 1, stdout: '', stderr: 'followup command failed' },
      ]);
      const result = await runDelegateFollowup(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error to be set on followup failure');
      assert.equal(result.turnsWallClockMs.length, 2, 'expected 2 turn entries after followup failure');
    } finally {
      cleanup();
    }
  });

  it('overall timeout during delegate → error = "timeout"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([
        { status: null, timedOut: true, stdout: '', stderr: '' },
      ]);
      const result = await runDelegateFollowup(TASK, root, {}, { spawn, timeoutMs: 100 });
      assert.equal(result.error, 'timeout');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegateFollowup() — isolation', () => {
  it('CC_PLUGIN_CODEX_HOME temp dir is cleaned up after the run', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedHome = null;
    let callCount = 0;
    const seqSpawn = (_cmd, _args, opts) => {
      if (callCount === 0 && opts.env?.CC_PLUGIN_CODEX_HOME) {
        capturedHome = opts.env.CC_PLUGIN_CODEX_HOME;
      }
      const responses = [
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
        { status: 0, stdout: followupResponse() },
        { status: 0, stdout: statusResponse(FAKE_JOB_ID, 'awaiting_followup') },
        { status: 0, stdout: resultResponse() },
      ];
      return {
        ...(responses[Math.min(callCount++, responses.length - 1)]),
        signal: null,
        error: null,
      };
    };
    try {
      await runDelegateFollowup(TASK, root, {}, { spawn: seqSpawn });
      assert.ok(capturedHome !== null, 'expected CC_PLUGIN_CODEX_HOME to be set');
      assert.ok(
        !existsSync(capturedHome),
        `expected CC_PLUGIN_CODEX_HOME to be cleaned up, but ${capturedHome} still exists`,
      );
    } finally {
      cleanup();
      if (capturedHome && existsSync(capturedHome)) {
        rmSync(capturedHome, { recursive: true, force: true });
      }
    }
  });
});

describe('runDelegateFollowup() — caveats', () => {
  it('appends a caveat when transcript is not found', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
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
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.tokenCounts, null);
    } finally {
      cleanup();
    }
  });

  it('tempoTransitions is null when sidecar is missing', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegateFollowup(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.tempoTransitions, null);
    } finally {
      cleanup();
    }
  });
});
