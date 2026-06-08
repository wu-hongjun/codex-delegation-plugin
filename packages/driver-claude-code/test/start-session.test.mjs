// Tests for ClaudeBackgroundDriver.startSession() — T6
//
// All tests run against tools/mock-claude so no real Claude Code binary is needed
// and no network calls are made. Each test gets an isolated
// CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME directory so mock state never leaks between tests.
//
// Import strategy:
//   - ClaudeBackgroundDriver from '../dist/index.js'
//   - parseShortId from '../dist/background-session.js' (direct import; falls back to
//     indirect testing via mock fixtures if the export doesn't exist at run time)
//   - DriverError from '@cc-plugin-codex/runtime'

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@cc-plugin-codex/runtime';
import { ClaudeBackgroundDriver } from '../dist/index.js';

// parseShortId is a named export added by Subagent A. We attempt to import it;
// if it isn't exported the variable stays undefined and the parser tests fall back
// to the indirect path (test 10 uses mock fixtures via startSession instead).
let parseShortId;
try {
  const bgMod = await import('../dist/background-session.js');
  if (typeof bgMod.parseShortId === 'function') {
    parseShortId = bgMod.parseShortId;
  }
} catch {
  // module may not export parseShortId yet — indirect tests cover parsing instead.
}

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
  CC_PLUGIN_CODEX_HOME: process.env.CC_PLUGIN_CODEX_HOME,
  CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME,
  CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG,
};

let MOCK_HOME;

beforeEach(() => {
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'start-session-'));
  process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME = MOCK_HOME;
  delete process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG;
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
  return p;
}

// ---------- Test 1: returns a valid SessionHandle ----------

describe('startSession() returns a SessionHandle', () => {
  it('returns shortId, sessionName, cwd, startedAt, and driverName:claude-background', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'hello world' });

    assert.equal(handle.driverName, 'claude-background');
    assert.equal(typeof handle.shortId, 'string', 'shortId must be a string');
    assert.ok(handle.shortId.length > 0, 'shortId must be non-empty');
    assert.equal(typeof handle.sessionName, 'string', 'sessionName must be a string');
    assert.equal(handle.cwd, MOCK_HOME);
    assert.equal(typeof handle.startedAt, 'string', 'startedAt must be a string');
    // Verify startedAt is a valid ISO 8601 date.
    assert.ok(!Number.isNaN(Date.parse(handle.startedAt)), 'startedAt must be a valid ISO date');
  });
});

// ---------- Test 2: explicit name is passed through ----------

describe('startSession() with explicit name', () => {
  it('passes the name to the session handle (sessionName field)', async () => {
    const sessionName = 'codex:T6:test1';
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({
      cwd: MOCK_HOME,
      prompt: 'test explicit name',
      name: sessionName,
    });

    assert.equal(handle.sessionName, sessionName);

    // In real-2.1.149 mode, agents --json does not include name/shortId fields.
    // Verify the session exists by matching via sessionId (derived from the bg shortId).
    const agentsResult = spawnSync('claude', ['agents', '--json'], {
      env: envWithMockClaude(),
      encoding: 'utf8',
    });
    assert.equal(agentsResult.status, 0, `agents --json failed: ${agentsResult.stderr}`);
    const sessions = JSON.parse(agentsResult.stdout);
    assert.ok(sessions.length > 0, 'expected at least one session in agents --json');
    // Match by deriving shortId from sessionId (real mode: first 8 hex of sessionId).
    const found = sessions.find(
      (s) => s.sessionId && s.sessionId.replace(/-/g, '').slice(0, 8) === handle.shortId,
    );
    assert.ok(found, `session with derived shortId '${handle.shortId}' not found in agents --json`);
  });

  it('passes the name to the session and it appears in agents --json (legacy mode)', async () => {
    const sessionName = 'codex:T6:test1-legacy';
    // Opt into legacy mode so name and shortId appear in agents --json.
    const cfg = join(MOCK_HOME, 'legacy-cfg.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        agentsJsonSchema: 'mock',
        bgStdoutStyle: 'started-session',
        helpListsBg: true,
        daemonAvailable: true,
      }),
    );
    const legacyEnv = envWithMockClaude({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg });
    const driver = new ClaudeBackgroundDriver({ env: legacyEnv });
    const handle = await driver.startSession({
      cwd: MOCK_HOME,
      prompt: 'test explicit name legacy',
      name: sessionName,
    });

    assert.equal(handle.sessionName, sessionName);

    const agentsResult = spawnSync('claude', ['agents', '--json'], {
      env: legacyEnv,
      encoding: 'utf8',
    });
    assert.equal(agentsResult.status, 0, `agents --json failed: ${agentsResult.stderr}`);
    const sessions = JSON.parse(agentsResult.stdout);
    const found = sessions.find((s) => s.name === sessionName);
    assert.ok(found, `session with name '${sessionName}' not found in agents --json`);
    assert.equal(found.shortId, handle.shortId);
  });
});

// ---------- Test 3: generated session name uses cwd basename ----------

describe('startSession() without a name', () => {
  it('generates a session name starting with codex:<cwd-basename>:', async () => {
    // Use MOCK_HOME itself as cwd so the basename is predictable.
    const cwdBasename = basename(MOCK_HOME);
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'generate name test' });

    assert.ok(
      handle.sessionName.startsWith(`codex:${cwdBasename}:`),
      `expected sessionName to start with "codex:${cwdBasename}:" but got "${handle.sessionName}"`,
    );
  });

  // Plan 0020 F1: the auto-generated name must be unique even when two sessions start
  // back-to-back in the same cwd (Date.now() alone has ms granularity → collisions →
  // session merge → cross-contamination, deep-test Finding 1).
  it('generates distinct names for two sessions in the same cwd (entropy)', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    const a = await driver.startSession({ cwd: MOCK_HOME, prompt: 'first' });
    const b = await driver.startSession({ cwd: MOCK_HOME, prompt: 'second' });
    assert.notEqual(
      a.sessionName,
      b.sessionName,
      `expected distinct auto-generated names, both were "${a.sessionName}"`,
    );
    // Names keep colons so parseShortId never mistakes them for a session id.
    assert.ok(a.sessionName.includes(':'), 'auto name must stay colon-delimited');
  });
});

// ---------- Test 4: optional flags are forwarded and session still succeeds ----------

describe('startSession() with optional flags', () => {
  it('accepts model, effort, permissionMode, addDirs, mcpConfig without error', async () => {
    const extraDir1 = mkdtempSync(join(tmpdir(), 'start-session-dir1-'));
    const extraDir2 = mkdtempSync(join(tmpdir(), 'start-session-dir2-'));
    let handle;
    try {
      const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
      handle = await driver.startSession({
        cwd: MOCK_HOME,
        prompt: 'test optional flags',
        model: 'claude-sonnet-4-5',
        effort: 'high',
        permissionMode: 'default',
        addDirs: [extraDir1, extraDir2],
        mcpConfig: join(MOCK_HOME, 'mcp.json'),
      });
    } finally {
      rmSync(extraDir1, { recursive: true, force: true });
      rmSync(extraDir2, { recursive: true, force: true });
    }
    assert.equal(handle.driverName, 'claude-background');
    assert.ok(handle.shortId.length > 0, 'shortId must be non-empty with optional flags');
  });
});

// ---------- Test 5: empty prompt rejects with DriverError ----------

describe('startSession() input validation — empty prompt', () => {
  it('rejects with DriverError when prompt is empty', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    await assert.rejects(
      () => driver.startSession({ cwd: MOCK_HOME, prompt: '' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'startSession');
        return true;
      },
    );
  });

  it('rejects with DriverError when prompt is whitespace only', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    await assert.rejects(
      () => driver.startSession({ cwd: MOCK_HOME, prompt: '   ' }),
      (err) => {
        assert.ok(err instanceof DriverError);
        assert.equal(err.operation, 'startSession');
        return true;
      },
    );
  });
});

// ---------- Test 6: empty cwd rejects with DriverError ----------

describe('startSession() input validation — empty cwd', () => {
  it('rejects with DriverError when cwd is empty string', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
    await assert.rejects(
      () => driver.startSession({ cwd: '', prompt: 'some prompt' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'startSession');
        return true;
      },
    );
  });
});

// ---------- Test 7: bgFails fixture → DriverError with exitCode and stderr ----------

describe('startSession() with bgFails fixture', () => {
  it('rejects with DriverError carrying non-zero exitCode and stderr containing "Failed to start"', async () => {
    const cfg = writeCfg({ bgFails: true });
    process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG = cfg;
    const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });

    await assert.rejects(
      () => driver.startSession({ cwd: MOCK_HOME, prompt: 'will fail' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'startSession');
        assert.ok(
          typeof err.exitCode === 'number' && err.exitCode !== 0,
          `expected non-zero exitCode, got ${err.exitCode}`,
        );
        assert.ok(
          typeof err.stderr === 'string' && err.stderr.includes('Failed to start'),
          `expected stderr to contain "Failed to start", got: ${err.stderr}`,
        );
        return true;
      },
    );
  });
});

// ---------- Test 8: missing claude on PATH → DriverError (not unhandled rejection) ----------

describe('startSession() when claude is not on PATH', () => {
  it('rejects with DriverError rather than throwing an unhandled ENOENT', async () => {
    const driver = new ClaudeBackgroundDriver({
      env: { ...process.env, PATH: '/nonexistent-bin' },
    });

    await assert.rejects(
      () => driver.startSession({ cwd: MOCK_HOME, prompt: 'test missing binary' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'startSession');
        return true;
      },
    );
  });
});

// ---------- Test 9: sleepMs + short timeoutMs → DriverError mentioning timeout ----------

describe('startSession() with a slow mock and short timeout', () => {
  it('rejects with a DriverError when the spawn exceeds timeoutMs', async () => {
    const cfg = writeCfg({ sleepMs: 10000 });
    process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG = cfg;

    const driver = new ClaudeBackgroundDriver({
      env: envWithMockClaude(),
      timeoutMs: 50,
    });

    await assert.rejects(
      () => driver.startSession({ cwd: MOCK_HOME, prompt: 'slow session' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'startSession');
        // The error message or stderr should mention timeout.
        const text = `${err.message} ${err.stderr ?? ''}`.toLowerCase();
        assert.ok(
          text.includes('timeout') || text.includes('timed out'),
          `expected timeout mention in error, got: "${err.message}"`,
        );
        return true;
      },
    );
  });
});

// ---------- Test 10: parseShortId handles multiple stdout formats ----------

describe('parseShortId parser', () => {
  if (parseShortId) {
    // Direct import succeeded — test all formats without a round-trip through the mock.
    it('parses "Started background session abc123" format', () => {
      const id = parseShortId('Started background session abc123\n', '');
      assert.equal(id, 'abc123');
    });

    it('parses bare ID-only stdout format', () => {
      const id = parseShortId('abc123\n', '');
      assert.equal(id, 'abc123');
    });

    it('parses "Session abc123 started" format', () => {
      const id = parseShortId('Session abc123 started\n', '');
      assert.equal(id, 'abc123');
    });

    it('parses real-2.1.149 "backgrounded · 8f7f2405" format', () => {
      const stdout =
        'Starting background service…\nbackgrounded · 8f7f2405\n  claude agents             list sessions\n  claude attach 8f7f2405   open in this terminal\n  claude logs 8f7f2405     show recent output\n';
      const id = parseShortId(stdout, '');
      assert.equal(id, '8f7f2405');
    });

    it('throws or returns falsy when stdout contains no recognisable ID', () => {
      let threw = false;
      let result;
      try {
        result = parseShortId('no id here\n', '');
      } catch {
        threw = true;
      }
      assert.ok(
        threw || !result,
        'expected parseShortId to throw or return falsy for unknown output',
      );
    });

    // Plan 0020 F2: an ID-shaped --name echoed by Claude must not be captured as the
    // shortId when a real session id is also present.
    it('prefers the real hex over an ID-shaped session name (excludeName)', () => {
      const name = 'cc-v031-delegate-todos';
      // Claude echoes the name after "session", then reports the real bg id.
      const stdout = `Resuming session ${name}\nbackgrounded · 1a9e3671\n`;
      const id = parseShortId(stdout, '', name);
      assert.equal(id, '1a9e3671', 'real hex id should win over the echoed name');
    });

    it('falls back to the name when it is the only candidate (no regression to undefined)', () => {
      const name = 'cc-v031-delegate-todos';
      const stdout = `Started background session ${name}\n`;
      const id = parseShortId(stdout, '', name);
      assert.equal(id, name, 'name must still be returned when nothing else matches');
    });

    it('ignores excludeName when it does not appear in the output', () => {
      const id = parseShortId('backgrounded · 8f7f2405\n', '', 'some-unused-name');
      assert.equal(id, '8f7f2405');
    });
  } else {
    // Indirect path: verify that the default mock output (format 1) is handled by
    // running a real startSession against the mock and confirming a shortId is returned.
    it('startSession correctly extracts the shortId from mock stdout (format 1 indirect)', async () => {
      const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
      const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'parser format 1' });

      // The mock always emits "Started background session <hex>" — verify the driver
      // extracted a hex string.
      assert.match(handle.shortId, /^[0-9a-f]+$/, 'shortId should be a hex string from mock');
    });

    // Indirect format 2: bare-id format. We simulate it by checking the handle against
    // a custom mock output — since we cannot inject stdout directly without parseShortId,
    // we instead confirm the real mock format works and note that format 2 and 3 are
    // covered only if parseShortId is exported.
    it('shortId from mock matches the ID derivable from sessionId in agents --json (end-to-end format consistency)', async () => {
      const driver = new ClaudeBackgroundDriver({ env: envWithMockClaude() });
      const handle = await driver.startSession({ cwd: MOCK_HOME, prompt: 'format consistency' });

      const agentsResult = spawnSync('claude', ['agents', '--json'], {
        env: envWithMockClaude(),
        encoding: 'utf8',
      });
      const sessions = JSON.parse(agentsResult.stdout);
      assert.ok(sessions.length > 0, 'expected at least one session in agents --json');
      // In real mode, match by deriving shortId from sessionId (first 8 hex chars, hyphens stripped).
      const found = sessions.find(
        (s) =>
          (s.shortId && s.shortId === handle.shortId) ||
          (s.sessionId && s.sessionId.replace(/-/g, '').slice(0, 8) === handle.shortId),
      );
      assert.ok(
        found,
        `shortId ${handle.shortId} not found in agents --json (neither shortId field nor derived from sessionId)`,
      );
    });
  }
});

// ---------- Test 11: no test writes to real ~/.claude ----------

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
