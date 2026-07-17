// Tests for readClaudeLogs — T8
//
// All tests run against tools/mock-claude so no real Claude Code binary is needed
// and no network calls are made. Each test gets an isolated
// CODEX_DELEGATION_MOCK_CLAUDE_HOME directory so mock state never leaks between tests.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@codex-delegation/runtime';
import { ClaudeBackgroundDriver } from '../dist/index.js';
import { readClaudeLogs } from '../dist/logs.js';

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
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'logs-test-'));
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

// ============================================================
// 1. readClaudeLogs(shortId) returns text with expected content
// ============================================================

describe('readClaudeLogs — round-trip via startSession', () => {
  it('returns text containing "Session <shortId> started" and "Prompt: <prompt>"', async () => {
    const prompt = 'hello logs world';
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt });

    const result = await readClaudeLogs(handle.shortId, { env: envWithMockClaude() });

    assert.equal(result.shortId, handle.shortId);
    assert.ok(typeof result.text === 'string' && result.text.length > 0, 'text must be non-empty');
    assert.ok(
      result.text.includes(`Session ${handle.shortId} started`),
      `expected "Session ${handle.shortId} started" in text, got: ${result.text}`,
    );
    assert.ok(
      result.text.includes(`Prompt: ${prompt}`),
      `expected "Prompt: ${prompt}" in text, got: ${result.text}`,
    );
  });
});

// ============================================================
// 2. Empty shortId → DriverError with operation === 'logs'
// ============================================================

describe('readClaudeLogs — empty shortId', () => {
  it('rejects with DriverError when shortId is empty', async () => {
    await assert.rejects(
      () => readClaudeLogs('', { env: envWithMockClaude() }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.driverName, 'claude-background');
        assert.equal(err.operation, 'logs');
        return true;
      },
    );
  });
});

// ============================================================
// 3. Unknown shortId → DriverError (mock exits 1 with "unknown session")
// ============================================================

describe('readClaudeLogs — unknown shortId', () => {
  it('rejects with DriverError for a shortId that was never started', async () => {
    await assert.rejects(
      () => readClaudeLogs('dead00', { env: envWithMockClaude() }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.driverName, 'claude-background');
        assert.equal(err.operation, 'logs');
        assert.ok(
          typeof err.exitCode === 'number' && err.exitCode !== 0,
          `expected non-zero exitCode, got ${err.exitCode}`,
        );
        return true;
      },
    );
  });
});

// ============================================================
// 4. logsFail:true fixture → DriverError
// ============================================================

describe('readClaudeLogs — logsFail fixture', () => {
  it('rejects with DriverError when logsFail is true in config', async () => {
    // Start a real session first so a shortId exists
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'logs fail test' });

    // Now activate logsFail
    writeCfg({ logsFail: true });

    await assert.rejects(
      () => readClaudeLogs(handle.shortId, { env: envWithMockClaude() }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.driverName, 'claude-background');
        assert.equal(err.operation, 'logs');
        return true;
      },
    );
  });
});

// ============================================================
// 5. Missing claude on PATH → DriverError, not unhandled ENOENT
// ============================================================

describe('readClaudeLogs — missing claude on PATH', () => {
  it('rejects with DriverError rather than throwing an unhandled ENOENT', async () => {
    await assert.rejects(
      () => readClaudeLogs('abc123', { env: { ...process.env, PATH: '/nonexistent-bin' } }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.driverName, 'claude-background');
        assert.equal(err.operation, 'logs');
        return true;
      },
    );
  });
});

// ============================================================
// 6. sleepMs:5000 + timeoutMs:50 → DriverError with /timed out/
// ============================================================

describe('readClaudeLogs — timeout', () => {
  it('rejects with DriverError matching /timed out/ when the command exceeds timeoutMs', async () => {
    // Start a session without the sleep config so the session exists in state
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'slow logs test' });

    // Now activate the sleep so the next `claude logs` call will hang
    writeCfg({ sleepMs: 5000 });

    await assert.rejects(
      () =>
        readClaudeLogs(handle.shortId, {
          env: envWithMockClaude(),
          timeoutMs: 50,
        }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.driverName, 'claude-background');
        assert.equal(err.operation, 'logs');
        assert.match(
          err.message,
          /timed out/i,
          `expected /timed out/ in message, got: "${err.message}"`,
        );
        return true;
      },
    );
  });
});

// ============================================================
// 7. mock-codex absence on PATH does NOT affect readClaudeLogs
// ============================================================

describe('readClaudeLogs — codex absent on PATH does not matter', () => {
  it('succeeds when only mock-claude is on PATH (no codex binary needed)', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'codex absent test' });

    // envWithMockClaude only adds tools/mock-claude — no codex anywhere
    const result = await readClaudeLogs(handle.shortId, { env: envWithMockClaude() });

    assert.equal(result.shortId, handle.shortId);
    assert.ok(result.text.includes(`Session ${handle.shortId} started`));
  });
});
