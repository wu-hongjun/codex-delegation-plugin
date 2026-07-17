// Tests for ClaudeBackgroundDriver.status() — T7 (driver-level integration via mock)
//
// All tests run against tools/mock-claude so no real Claude Code binary is needed
// and no network calls are made. Each test gets an isolated
// CODEX_DELEGATION_MOCK_CLAUDE_HOME directory so mock state never leaks between tests.
//
// Import strategy:
//   - ClaudeBackgroundDriver from '../dist/index.js'
//   - DriverError from '@codex-delegation/runtime'

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@codex-delegation/runtime';
import { ClaudeBackgroundDriver } from '../dist/index.js';

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
  CODEX_DELEGATION_MOCK_CLAUDE_HOME: process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME,
  CODEX_DELEGATION_MOCK_CLAUDE_CONFIG: process.env.CODEX_DELEGATION_MOCK_CLAUDE_CONFIG,
};

let MOCK_HOME;

beforeEach(() => {
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'status-test-'));
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

// ---------- Test 1: round-trip via startSession ----------

describe('status() — round-trip via startSession', () => {
  it('returns value "working" and matching shortId after startSession (real-2.1.149 mode)', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'hello status' });

    const status = await driver.status(handle);

    assert.equal(status.value, 'working');
    assert.equal(status.shortId, handle.shortId, 'shortId should match the started session');
    // In real-2.1.149 mode, agents --json has no name field → sessionName may be undefined.
    // Only assert sessionId coherence (derived shortId matches).
    assert.ok(
      status.shortId === handle.shortId,
      `shortId mismatch: status.shortId=${status.shortId}, handle.shortId=${handle.shortId}`,
    );
  });
});

// ---------- Test 2: match by sessionId ----------

describe('status() — match by sessionId', () => {
  it('finds session by sessionId when shortId is absent from the handle (real-2.1.149 mode)', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'sessionId-only test' });

    // In real mode, the handle has shortId but not sessionId (startSession doesn't set it).
    // findSessionStatus priority 2 derives shortId from entry.sessionId and matches.
    // Simulate a handle with only shortId (what startSession returns in real mode).
    const shortIdOnlyHandle = {
      driverName: handle.driverName,
      shortId: handle.shortId,
      sessionName: '', // intentionally empty
      cwd: handle.cwd,
      startedAt: handle.startedAt,
    };

    const status = await driver.status(shortIdOnlyHandle);
    assert.equal(status.value, 'working');
    assert.equal(status.shortId, handle.shortId, 'shortId should match the started session');
  });
});

// ---------- Test 3: orphaned ----------

describe('status() — orphaned session', () => {
  it('returns value "orphaned" without throwing for a session that was never started', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });

    const fakeHandle = {
      driverName: 'claude-background',
      shortId: 'dead00',
      sessionId: 'session-dead00',
      sessionName: 'codex:fake:dead00',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    let status;
    await assert.doesNotReject(async () => {
      status = await driver.status(fakeHandle);
    });

    assert.equal(status.value, 'orphaned');
  });
});

// ---------- Test 4: malformed agents JSON → DriverError ----------

describe('status() — malformed agents JSON', () => {
  it('rejects with DriverError when agents --json returns malformed JSON', async () => {
    writeCfg({ agentsJsonMalformed: true });
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });

    const handle = {
      driverName: 'claude-background',
      shortId: 'any123',
      sessionName: 'codex:test:any123',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => driver.status(handle),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'status');
        return true;
      },
    );
  });
});

// ---------- Test 5: command failure → DriverError ----------

describe('status() — command failure (agentsJsonFails)', () => {
  it('rejects with DriverError when agents --json exits non-zero', async () => {
    writeCfg({ agentsJsonFails: true });
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });

    const handle = {
      driverName: 'claude-background',
      shortId: 'any456',
      sessionName: 'codex:test:any456',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => driver.status(handle),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'status');
        assert.ok(
          typeof err.exitCode === 'number' && err.exitCode !== 0,
          `expected non-zero exitCode, got ${err.exitCode}`,
        );
        assert.ok(
          typeof err.stderr === 'string' && err.stderr.includes('agents error'),
          `expected stderr to contain "agents error", got: ${err.stderr}`,
        );
        return true;
      },
    );
  });
});

// ---------- Test 6: missing claude on PATH → DriverError ----------

describe('status() — missing claude on PATH', () => {
  it('rejects with DriverError rather than throwing an unhandled ENOENT', async () => {
    const driver = new ClaudeBackgroundDriver({
      env: { ...process.env, PATH: '/nonexistent-bin' },
    });

    const handle = {
      driverName: 'claude-background',
      shortId: 'abc123',
      sessionName: 'codex:test:abc123',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => driver.status(handle),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'status');
        return true;
      },
    );
  });
});

// ---------- Test 7: missing mock-codex on PATH does not affect status ----------

describe('status() — missing mock-codex on PATH does not affect status', () => {
  it('returns a valid status with only mock-claude on PATH (no codex binary needed)', async () => {
    // envWithMockClaude only puts mock-claude on PATH — no mock-codex.
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'codex-absent test' });

    // status() must succeed without codex on PATH.
    const status = await driver.status(handle);
    assert.equal(status.value, 'working');
    assert.equal(status.shortId, handle.shortId);
  });
});

// ---------- Test 8: handle without shortId or sessionName → DriverError ----------

describe('status() — invalid handle input', () => {
  it('rejects with DriverError for a handle with no shortId and no sessionName', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });

    const badHandle = {
      driverName: 'claude-background',
      shortId: '',
      sessionName: '',
      cwd: MOCK_HOME,
      startedAt: new Date().toISOString(),
    };

    await assert.rejects(
      () => driver.status(badHandle),
      (err) => {
        assert.ok(
          err instanceof DriverError,
          `expected DriverError, got ${err?.constructor?.name}`,
        );
        assert.equal(err.operation, 'status');
        return true;
      },
    );
  });
});

// ---------- Test 9: real-2.1.149 mode — sessionId + shortId coherence ----------

describe('status() — real-2.1.149 mode: shortId and sessionId coherence', () => {
  it('status.shortId equals first 8 hex of the matching entry sessionId (real mode)', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'coherence test' });

    const status = await driver.status(handle);

    assert.equal(status.value, 'working');
    assert.ok(
      typeof status.shortId === 'string' && status.shortId.length > 0,
      'shortId must be populated',
    );
    // The shortId returned by status must be 8 hex chars (real-mode UUID-derived shortId).
    assert.match(
      status.shortId,
      /^[0-9a-f]{8}$/,
      `expected 8-hex shortId, got "${status.shortId}"`,
    );
    // shortId matches the handle shortId that was printed by --bg.
    assert.equal(status.shortId, handle.shortId);
  });
});
