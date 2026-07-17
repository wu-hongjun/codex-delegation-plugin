/**
 * Self-tests for tools/bench/lib/runners/delegate.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * Uses DI (opts.spawn) so no real Claude invocations are made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDelegate } from '../../lib/runners/delegate.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory to act as fixtureRoot. Returns { root, cleanup }. */
function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'bench-delegate-test-fixture-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const FAKE_JOB_ID = 'job-aabbccdd-1122-3344-5566-778899aabbcc';
const FAKE_SHORT_ID = 'abc123';

/**
 * Build a fake delegate JSON response (what claude-delegation delegate --json emits).
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
 * Build a fake status JSON response (what claude-delegation status --json --all emits).
 * @param {string} status
 */
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
    resultText: 'The assistant completed the task.',
  });
}

/**
 * Create a mock spawn function that sequences through the provided responses.
 * Each call to the mock pops the next response from the queue.
 *
 * responseQueue: Array of { status, stdout, stderr, timedOut? }
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
 *  1. delegate → success with jobId
 *  2. status   → 'completed' (terminal)
 *  3. result   → result object
 */
function happyPathSpawn(jobId = FAKE_JOB_ID) {
  return makeSequencedSpawn([
    { status: 0, stdout: delegateResponse(jobId) },
    { status: 0, stdout: statusResponse(jobId, 'completed') },
    { status: 0, stdout: resultResponse(jobId) },
  ]);
}

const TASK = { id: 'summarize-todos', prompt: 'Inspect this repo and summarize TODOs.' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDelegate() — happy path', () => {
  it('returns a RunResult with error=null on success', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.error, null, `expected no error, got: ${result.error}`);
    } finally {
      cleanup();
    }
  });

  it('result has flow="delegate"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.flow, 'delegate');
    } finally {
      cleanup();
    }
  });

  it('result has task=task.id', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.task, TASK.id);
    } finally {
      cleanup();
    }
  });

  it('wallClockMs is a positive number', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.ok(typeof result.wallClockMs === 'number', 'wallClockMs should be a number');
      assert.ok(result.wallClockMs >= 0, 'wallClockMs should be >= 0');
    } finally {
      cleanup();
    }
  });

  it('turnsWallClockMs has exactly 1 element for single-turn delegate', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.turnsWallClockMs.length, 1);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegate() — failure paths', () => {
  it('returns RunResult with error populated when delegate exits non-zero', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: 1, stdout: '', stderr: 'Claude not found' }]);
      const result = await runDelegate(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error to be set');
    } finally {
      cleanup();
    }
  });

  it('error message reflects stderr content on delegate failure', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: 1, stdout: '', stderr: 'Claude not found' }]);
      const result = await runDelegate(TASK, root, {}, { spawn });
      assert.ok(
        result.error.includes('Claude not found') || result.error === 'delegate_failed',
        `unexpected error: ${result.error}`,
      );
    } finally {
      cleanup();
    }
  });

  it('returns RunResult with error="timeout" when spawn signals SIGTERM', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: null, timedOut: true, stdout: '', stderr: '' }]);
      const result = await runDelegate(TASK, root, {}, { spawn, timeoutMs: 100 });
      assert.equal(result.error, 'timeout');
    } finally {
      cleanup();
    }
  });

  it('returns error when delegate stdout cannot be parsed as JSON', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const spawn = makeSequencedSpawn([{ status: 0, stdout: 'not-json', stderr: '' }]);
      const result = await runDelegate(TASK, root, {}, { spawn });
      assert.ok(result.error !== null, 'expected error due to unparseable stdout');
    } finally {
      cleanup();
    }
  });
});

describe('runDelegate() — isolation', () => {
  it('CODEX_DELEGATION_HOME temp dir is cleaned up after the run', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedHome = null;
    const spawn = (_cmd, _args, opts) => {
      if (capturedHome === null && opts.env?.CODEX_DELEGATION_HOME) {
        capturedHome = opts.env.CODEX_DELEGATION_HOME;
      }
      // Return happy-path responses in sequence.
      return { status: 0, stdout: delegateResponse(), stderr: '', signal: null, error: null };
    };
    // Use a custom spawn that captures the home and always returns completed status.
    let callCount = 0;
    const seqSpawn = (_cmd, _args, opts) => {
      if (callCount === 0 && opts.env?.CODEX_DELEGATION_HOME) {
        capturedHome = opts.env.CODEX_DELEGATION_HOME;
      }
      const responses = [
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse() },
        { status: 0, stdout: resultResponse() },
      ];
      return {
        ...responses[Math.min(callCount++, responses.length - 1)],
        signal: null,
        error: null,
      };
    };
    try {
      await runDelegate(TASK, root, {}, { spawn: seqSpawn });
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

  it('two concurrent runDelegate calls get different CODEX_DELEGATION_HOME values', async () => {
    const { root: root1, cleanup: cleanup1 } = makeFixtureRoot();
    const { root: root2, cleanup: cleanup2 } = makeFixtureRoot();
    const homes = [];
    const makeCapturingSpawn = () => {
      let callCount = 0;
      return (_cmd, _args, opts) => {
        if (callCount === 0 && opts.env?.CODEX_DELEGATION_HOME) {
          homes.push(opts.env.CODEX_DELEGATION_HOME);
        }
        const responses = [
          { status: 0, stdout: delegateResponse() },
          { status: 0, stdout: statusResponse() },
          { status: 0, stdout: resultResponse() },
        ];
        return {
          ...responses[Math.min(callCount++, responses.length - 1)],
          signal: null,
          error: null,
        };
      };
    };
    try {
      await Promise.all([
        runDelegate(TASK, root1, {}, { spawn: makeCapturingSpawn() }),
        runDelegate(TASK, root2, {}, { spawn: makeCapturingSpawn() }),
      ]);
      assert.equal(homes.length, 2);
      assert.notEqual(homes[0], homes[1], 'each run should get a unique CODEX_DELEGATION_HOME');
    } finally {
      cleanup1();
      cleanup2();
    }
  });
});

describe('runDelegate() — caveats', () => {
  it('appends a caveat when transcript is not found', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      // Since no real transcript exists, at least one caveat should be present.
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
      const result = await runDelegate(TASK, root, {}, { spawn: happyPathSpawn() });
      assert.equal(result.tokenCounts, null);
    } finally {
      cleanup();
    }
  });
});

describe('runDelegate() — finally cleanup (P1-T1, P1-T2, P1-T3)', () => {
  it('P1-T1: stop <jobId> is called via spawn when an exception is thrown after job creation', async () => {
    const { root, cleanup } = makeFixtureRoot();
    const calls = [];
    let callCount = 0;
    const spy = (_cmd, args, _opts) => {
      calls.push([...args]);
      callCount++;
      // delegate call succeeds and returns a jobId
      if (callCount === 1) {
        return {
          status: 0,
          stdout: delegateResponse(FAKE_JOB_ID),
          stderr: '',
          signal: null,
          error: null,
        };
      }
      // status call throws to simulate failure after job creation
      if (callCount === 2) {
        throw new Error('status poll exploded');
      }
      // stop call (in finally) — succeeds
      return { status: 0, stdout: '', stderr: '', signal: null, error: null };
    };
    try {
      await assert.rejects(
        () => runDelegate(TASK, root, {}, { spawn: spy, pollIntervalMs: 0 }),
        /status poll exploded/,
      );
      // Verify that a stop call was recorded with the correct jobId
      const stopCall = calls.find(
        (args) => args[0] === 'stop' || (args.includes('--yes') && calls.indexOf(args) > 0),
      );
      // More direct: find a call whose first arg is FAKE_JOB_ID (after 'stop' subcommand)
      // The stop call args are [jobId, '--yes'] passed to runDispatcher as args
      const stopArgs = calls.find((args) => args.includes(FAKE_JOB_ID) && args.includes('--yes'));
      assert.ok(
        stopArgs !== undefined,
        `expected a stop call with jobId=${FAKE_JOB_ID}, got calls: ${JSON.stringify(calls)}`,
      );
    } finally {
      cleanup();
    }
  });

  it('P1-T2: if the stop spawn fails, the runner re-raises the original error (not the stop error)', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let callCount = 0;
    const spy = (_cmd, _args, _opts) => {
      callCount++;
      if (callCount === 1) {
        // delegate succeeds
        return {
          status: 0,
          stdout: delegateResponse(FAKE_JOB_ID),
          stderr: '',
          signal: null,
          error: null,
        };
      }
      if (callCount === 2) {
        // status poll throws the "original error"
        throw new Error('original inner error');
      }
      // stop call in finally — also throws
      throw new Error('stop failed too');
    };
    try {
      await assert.rejects(
        () => runDelegate(TASK, root, {}, { spawn: spy, pollIntervalMs: 0 }),
        (err) => {
          assert.equal(
            err.message,
            'original inner error',
            `expected original error, got: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      cleanup();
    }
  });

  it('P1-T3: CODEX_DELEGATION_HOME is cleaned up on success path', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedHome = null;
    let callCount = 0;
    const spy = (_cmd, _args, opts) => {
      if (callCount === 0 && opts?.env?.CODEX_DELEGATION_HOME) {
        capturedHome = opts.env.CODEX_DELEGATION_HOME;
      }
      const responses = [
        { status: 0, stdout: delegateResponse() },
        { status: 0, stdout: statusResponse() },
        { status: 0, stdout: resultResponse() },
        { status: 0, stdout: '' }, // stop
      ];
      return {
        ...responses[Math.min(callCount++, responses.length - 1)],
        signal: null,
        error: null,
      };
    };
    try {
      await runDelegate(TASK, root, {}, { spawn: spy });
      assert.ok(capturedHome !== null, 'expected CODEX_DELEGATION_HOME to be captured');
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

  it('P1-T3 (error path): CODEX_DELEGATION_HOME is cleaned up when an exception is thrown', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedHome = null;
    let callCount = 0;
    const spy = (_cmd, _args, opts) => {
      callCount++;
      if (callCount === 1 && opts?.env?.CODEX_DELEGATION_HOME) {
        capturedHome = opts.env.CODEX_DELEGATION_HOME;
        return {
          status: 0,
          stdout: delegateResponse(FAKE_JOB_ID),
          stderr: '',
          signal: null,
          error: null,
        };
      }
      if (callCount === 2) {
        throw new Error('injected error');
      }
      // stop in finally
      return { status: 0, stdout: '', stderr: '', signal: null, error: null };
    };
    try {
      await assert.rejects(
        () => runDelegate(TASK, root, {}, { spawn: spy, pollIntervalMs: 0 }),
        /injected error/,
      );
      assert.ok(capturedHome !== null, 'expected CODEX_DELEGATION_HOME to be captured');
      assert.ok(
        !existsSync(capturedHome),
        `expected CODEX_DELEGATION_HOME to be cleaned up on error path`,
      );
    } finally {
      cleanup();
      if (capturedHome && existsSync(capturedHome)) {
        rmSync(capturedHome, { recursive: true, force: true });
      }
    }
  });
});
