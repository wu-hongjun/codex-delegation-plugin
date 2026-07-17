// Tests for ClaudeBackgroundDriver.stop() and the exported stopSession() function — T10
//
// All tests run against tools/mock-claude so no real Claude Code binary is needed
// and no network calls are made. Each test gets an isolated
// CODEX_DELEGATION_MOCK_CLAUDE_HOME directory so mock state never leaks between tests.
//
// Import strategy:
//   - ClaudeBackgroundDriver, stopSession from '../dist/index.js'
//   - DriverError from '@codex-delegation/runtime'

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@codex-delegation/runtime';
import { ClaudeBackgroundDriver, stopSession } from '../dist/index.js';

// ---------- path helpers ----------

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const MOCK_CLAUDE_DIR = join(REPO_ROOT, 'tools', 'mock-claude');

function envWithMockClaude(extra = {}) {
  return {
    ...process.env,
    ...extra,
    PATH: `${MOCK_CLAUDE_DIR}${delimiter}${process.env.PATH ?? ''}`,
  };
}

// ---------- env save / restore ----------

const PREV = {
  CODEX_DELEGATION_HOME: process.env.CODEX_DELEGATION_HOME,
  CODEX_DELEGATION_MOCK_CLAUDE_HOME: process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME,
  CODEX_DELEGATION_MOCK_CLAUDE_CONFIG: process.env.CODEX_DELEGATION_MOCK_CLAUDE_CONFIG,
};

let MOCK_HOME;

beforeEach(() => {
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'stop-test-'));
  process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME = MOCK_HOME;
  delete process.env.CODEX_DELEGATION_MOCK_CLAUDE_CONFIG;
});

afterEach(() => {
  for (const [key, val] of Object.entries(PREV)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  rmSync(MOCK_HOME, { recursive: true, force: true });
});

// ---------- helper ----------

function writeCfg(body) {
  const p = join(MOCK_HOME, 'cfg.json');
  writeFileSync(p, JSON.stringify(body));
  process.env.CODEX_DELEGATION_MOCK_CLAUDE_CONFIG = p;
  return p;
}

// ---------- Test 1: stopSession resolves after startSession ----------

describe('stopSession() — round-trip via mock-claude', () => {
  it('resolves without throwing after a successfully started session', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'x' });

    await assert.doesNotReject(
      () => stopSession(handle, { env: envWithMockClaude() }),
      'stopSession should resolve for a known session',
    );
  });
});

// ---------- Test 2: empty shortId → DriverError with operation === 'stop' ----------

describe('stopSession() — empty shortId', () => {
  it('rejects with DriverError carrying operation "stop" when shortId is empty', async () => {
    const emptyHandle = {
      driverName: 'claude-background',
      shortId: '',
      sessionName: 'codex:test:empty',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => stopSession(emptyHandle, { env: envWithMockClaude() }),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'stop');
        assert.equal(err.driverName, 'claude-background');
        assert.ok(
          err.message.includes('stop requires a non-empty shortId'),
          `unexpected message: "${err.message}"`,
        );
        return true;
      },
    );
  });

  it('rejects with DriverError when shortId is whitespace only', async () => {
    const handle = {
      driverName: 'claude-background',
      shortId: '   ',
      sessionName: 'codex:test:ws',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => stopSession(handle, { env: envWithMockClaude() }),
      (err) => {
        assert.ok(err instanceof DriverError);
        assert.equal(err.operation, 'stop');
        return true;
      },
    );
  });
});

// ---------- Test 3: unknown shortId → DriverError (non-zero exit) ----------

describe('stopSession() — unknown shortId', () => {
  it('rejects with DriverError when mock exits non-zero for an unknown session id', async () => {
    const unknownHandle = {
      driverName: 'claude-background',
      shortId: 'dead00',
      sessionName: 'codex:test:dead00',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => stopSession(unknownHandle, { env: envWithMockClaude() }),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'stop');
        assert.ok(
          typeof err.exitCode === 'number' && err.exitCode !== 0,
          `expected non-zero exitCode, got ${err.exitCode}`,
        );
        // The mock stderr says "unknown session: <id>"
        assert.ok(
          typeof err.stderr === 'string' && err.stderr.includes('unknown session'),
          `expected "unknown session" in stderr, got: "${err.stderr}"`,
        );
        return true;
      },
    );
  });
});

// ---------- Test 4: missing claude on PATH → DriverError (not unhandled ENOENT) ----------

describe('stopSession() — missing claude on PATH', () => {
  it('rejects with DriverError rather than throwing an unhandled ENOENT', async () => {
    const handle = {
      driverName: 'claude-background',
      shortId: 'abc123',
      sessionName: 'codex:test:abc123',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => stopSession(handle, { env: { ...process.env, PATH: '/nonexistent-bin' } }),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'stop');
        // Should mention "cannot run claude"
        assert.ok(
          err.message.includes('cannot run claude'),
          `expected "cannot run claude" in message, got: "${err.message}"`,
        );
        return true;
      },
    );
  });
});

// ---------- Test 5: slow mock + short timeoutMs → DriverError mentioning timeout ----------

describe('stopSession() — timeout', () => {
  it('rejects with DriverError containing /timed out/ when command exceeds timeoutMs', async () => {
    // sleepMs: 5000 makes the mock block for 5 seconds.
    writeCfg({ sleepMs: 5000 });

    const handle = {
      driverName: 'claude-background',
      shortId: 'any999',
      sessionName: 'codex:test:any999',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () =>
        stopSession(handle, {
          env: envWithMockClaude(),
          timeoutMs: 50,
        }),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'stop');
        assert.match(err.message, /timed out/i);
        return true;
      },
    );
  });
});

// ---------- Test 6: driver.stop() round-trip — agents --json shows status: 'stopped' ----------

describe('ClaudeBackgroundDriver.stop() — round-trip', () => {
  it('marks session stopped in agents --json after driver.stop(handle)', async () => {
    const env = envWithMockClaude();
    const driver = new ClaudeBackgroundDriver({ env });

    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'round-trip stop' });

    // Confirm it's 'working' before stop.
    // In real-2.1.149 mode, agents --json has no shortId field; match via derived sessionId.
    const agentsBefore = spawnSync('claude', ['agents', '--json'], { env, encoding: 'utf8' });
    assert.equal(agentsBefore.status, 0, `agents --json failed: ${agentsBefore.stderr}`);
    const sessionsBefore = JSON.parse(agentsBefore.stdout);
    const before = sessionsBefore.find(
      (s) =>
        (s.shortId && s.shortId === handle.shortId) ||
        (s.sessionId && s.sessionId.replace(/-/g, '').slice(0, 8) === handle.shortId),
    );
    assert.ok(before, `session ${handle.shortId} not found before stop`);
    assert.equal(before.status, 'working', 'session should be working before stop');

    // Stop the session.
    await driver.stop(handle);

    // Confirm it's 'stopped' after.
    const agentsAfter = spawnSync('claude', ['agents', '--json'], { env, encoding: 'utf8' });
    assert.equal(agentsAfter.status, 0, `agents --json failed after stop: ${agentsAfter.stderr}`);
    const sessionsAfter = JSON.parse(agentsAfter.stdout);
    const after = sessionsAfter.find(
      (s) =>
        (s.shortId && s.shortId === handle.shortId) ||
        (s.sessionId && s.sessionId.replace(/-/g, '').slice(0, 8) === handle.shortId),
    );
    assert.ok(after, `session ${handle.shortId} not found after stop`);
    assert.equal(after.status, 'stopped', 'session should be stopped after driver.stop()');
  });
});

// ---------- Test 7: isolation check ----------

describe('isolation: no test touches real ~/.claude', () => {
  it('MOCK_HOME is a temp directory, not the real ~/.claude', () => {
    const realClaude = join(process.env.HOME ?? '/root', '.claude');
    assert.notEqual(MOCK_HOME, realClaude, 'MOCK_HOME must not equal the real ~/.claude directory');
    assert.ok(
      MOCK_HOME.startsWith(tmpdir()),
      `MOCK_HOME should be under tmpdir(), got: ${MOCK_HOME}`,
    );
  });
});
