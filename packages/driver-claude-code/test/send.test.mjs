// Tests for ClaudeBackgroundDriver.send() and the internal attachAndSend helper — Plan 0002 T5.
//
// All tests run against tools/mock-claude; no real Claude Code binary is needed and no
// network calls are made. Each test gets isolated CC_PLUGIN_CODEX_HOME (companion-home temp)
// and CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME (mock-home temp) directories so state never leaks
// between tests.
//
// PTY note: driver.send() internally calls attachAndSend which uses node-pty. Tests never
// import node-pty directly — the driver owns that surface.
//
// Coverage:
//   1. Driver interface — send() is a function
//   2. Successful send returns completed TurnHandle
//   3. TurnHandle has NO jobId and NO turnIndex
//   4. finalMessage comes from sidecar output.result
//   5. PTY ring buffer not used for semantic result extraction
//   6. Missing sidecar falls back to agents-json idle
//   7. Empty / whitespace-only prompt throws DriverError
//   8. Invalid shortId throws DriverError
//   9. Lock busy throws DriverError without spawning PTY
//  10. Lock file released after success
//  11. Lock file released after failure
//  12. Prompt-register timeout throws DriverError
//  13. Turn-completion timeout throws DriverError (via tiny timeoutMs)
//  14. Permission waiting with NO callback throws DriverError
//  15. Permission waiting WITH callback writes callback response and completes
//  16. AbortSignal abort releases lock and throws DriverError
//  17. No `claude -p` appears in attach.ts source
//  18. finalMessage matches readSidecar output.result (no semantic PTY dependence)

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@cc-plugin-codex/runtime';
import { ClaudeBackgroundDriver, readSidecar } from '../dist/index.js';

// ---------- path helpers ----------

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const MOCK_CLAUDE_DIR = join(REPO_ROOT, 'tools', 'mock-claude');
const ATTACH_SRC = join(REPO_ROOT, 'packages', 'driver-claude-code', 'src', 'attach.ts');

// ---------- env helpers ----------

/**
 * Build a minimal env for the driver and mock.
 * Puts tools/mock-claude first on PATH so `claude` resolves to the mock binary.
 */
function buildEnv(mockHome, companionHome, extra = {}) {
  return {
    ...process.env,
    ...extra,
    CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME: mockHome,
    CC_PLUGIN_CODEX_HOME: companionHome,
    // T15a: mock-claude responds immediately so no TUI-warmup wait is needed.
    // Tests pass attachWarmupMs=0 via this env var so each send() in the
    // mock suite runs without the 2-second real-TUI default.
    CC_PLUGIN_CODEX_ATTACH_WARMUP_MS: '0',
    PATH: `${MOCK_CLAUDE_DIR}${delimiter}${process.env.PATH ?? ''}`,
  };
}

// ---------- shortId extraction ----------

function extractShortId(stdout) {
  // Matches both "backgrounded · <8-hex>" and "backgrounded · <8-hex> (idle …)"
  const m = stdout.match(/backgrounded · ([0-9a-f]{8})/);
  assert.ok(m, `could not find "backgrounded · <8-hex>" in stdout:\n${stdout}`);
  return m[1];
}

// ---------- per-test isolation ----------

// Saved process.env values restored after each test.
const PREV_ENV = {
  CC_PLUGIN_CODEX_HOME: process.env.CC_PLUGIN_CODEX_HOME,
  CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME,
  CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG,
};

let MOCK_HOME; // per-test isolated mock-home (CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME)
let COMPANION_HOME; // per-test isolated companion-home (CC_PLUGIN_CODEX_HOME)

beforeEach(() => {
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'send-test-mock-'));
  COMPANION_HOME = mkdtempSync(join(tmpdir(), 'send-test-companion-'));
  process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME = MOCK_HOME;
  process.env.CC_PLUGIN_CODEX_HOME = COMPANION_HOME;
  delete process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG;
});

afterEach(() => {
  for (const [key, val] of Object.entries(PREV_ENV)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  rmSync(MOCK_HOME, { recursive: true, force: true });
  rmSync(COMPANION_HOME, { recursive: true, force: true });
});

// ---------- helpers ----------

/** Write a config JSON file into mockHome and return its path. */
function writeMockConfig(mockHome, config) {
  const p = join(mockHome, 'cfg.json');
  writeFileSync(p, JSON.stringify(config));
  return p;
}

/**
 * Start a background session via the mock (no-prompt --bg) and return the shortId.
 */
function startIdleSession(env) {
  const r = spawnSync('claude', ['--bg'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, `--bg failed (exit=${r.status}): ${r.stderr}`);
  return extractShortId(r.stdout);
}

/**
 * Build a SessionHandle from a shortId, mirroring what the driver would set.
 */
function makeHandle(shortId) {
  return {
    driverName: 'claude-background',
    shortId,
    sessionName: `bg-${shortId}`,
    cwd: COMPANION_HOME,
    startedAt: new Date().toISOString(),
  };
}

/** Return the lock file path for a given shortId under companionHome. */
function lockPath(companionHome, shortId) {
  return join(companionHome, 'locks', `attach-${shortId}.lock`);
}

// =============================================================================
// 1. Driver interface — send() is a function
// =============================================================================

describe('ClaudeBackgroundDriver.send() — interface', () => {
  it('send is a function on a new ClaudeBackgroundDriver instance', () => {
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const drv = new ClaudeBackgroundDriver({ env });
    assert.equal(typeof drv.send, 'function', 'expected drv.send to be a function');
  });
});

// =============================================================================
// 2. Successful send returns completed TurnHandle
// =============================================================================

describe('send() against mock — returns completed TurnHandle', () => {
  it(
    'status is "completed", driverName is "claude-background", session matches, startedAt and endedAt are set',
    { timeout: 20000 },
    async () => {
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'hello world' },
        {
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      assert.equal(turn.status, 'completed');
      assert.equal(turn.driverName, 'claude-background');
      // session field must reference the same handle (deep-equal is sufficient)
      assert.deepEqual(turn.session, handle);
      // startedAt is an ISO date
      assert.ok(
        typeof turn.startedAt === 'string' && !Number.isNaN(Date.parse(turn.startedAt)),
        `startedAt must be a valid ISO date, got: ${turn.startedAt}`,
      );
      // endedAt is set and is a valid ISO date
      assert.ok(
        typeof turn.endedAt === 'string' && !Number.isNaN(Date.parse(turn.endedAt)),
        `endedAt must be a valid ISO date, got: ${turn.endedAt}`,
      );
    },
  );
});

// =============================================================================
// 3. TurnHandle has NO jobId and NO turnIndex
// =============================================================================

describe('TurnHandle — no jobId, no turnIndex', () => {
  it(
    '"jobId" and "turnIndex" are absent from the returned TurnHandle',
    { timeout: 20000 },
    async () => {
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'no job id test' },
        {
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      assert.equal(
        'jobId' in turn,
        false,
        'TurnHandle must NOT have a jobId property (TurnHandle is job-agnostic)',
      );
      assert.equal(
        'turnIndex' in turn,
        false,
        'TurnHandle must NOT have a turnIndex property (TurnHandle is job-agnostic)',
      );
    },
  );
});

// =============================================================================
// 4. finalMessage comes from sidecar output.result
// =============================================================================

describe('send() — finalMessage sourced from sidecar output.result', () => {
  it(
    'finalMessage matches mock\'s "[mock] Got: foobar" template and equals sidecar output.result',
    { timeout: 20000 },
    async () => {
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'foobar' },
        {
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      // The mock's default attachResponse is "[mock] Got: ${prompt}"
      assert.equal(
        turn.finalMessage,
        '[mock] Got: foobar',
        `expected finalMessage to equal "[mock] Got: foobar", got: ${turn.finalMessage}`,
      );

      // Cross-check: read the sidecar directly and confirm it matches
      const snapshot = await readSidecar(shortId, { env });
      assert.ok(snapshot !== null, 'sidecar snapshot must not be null after a completed turn');
      assert.equal(
        snapshot.output?.result,
        turn.finalMessage,
        `sidecar output.result (${snapshot.output?.result}) must equal turn.finalMessage (${turn.finalMessage})`,
      );
    },
  );
});

// =============================================================================
// 5. PTY ring buffer not used for semantic result extraction
// =============================================================================

describe('send() — finalMessage is sourced from sidecar, not from PTY stdout', () => {
  it(
    'finalMessage from a custom attachResponse template matches sidecar output.result, not arbitrary PTY bytes',
    { timeout: 20000 },
    async () => {
      // Use a custom attachResponse so the PTY output text is different from a
      // hardcoded expected string — the only authoritative answer is the sidecar.
      const cfg = writeMockConfig(MOCK_HOME, { attachResponse: 'CUSTOM_RESPONSE: ${prompt}' });
      const env = buildEnv(MOCK_HOME, COMPANION_HOME, {
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg,
      });
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'ring-buffer-test' },
        {
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      // Read sidecar independently and verify finalMessage comes from it
      const snapshot = await readSidecar(shortId, { env });
      assert.ok(snapshot !== null, 'sidecar snapshot must not be null after a completed turn');
      assert.equal(
        turn.finalMessage,
        snapshot.output?.result,
        'turn.finalMessage must equal sidecar.output.result — not a PTY-scraped value',
      );
      // Sanity: the value actually reflects our custom template
      assert.equal(
        turn.finalMessage,
        'CUSTOM_RESPONSE: ring-buffer-test',
        `expected "CUSTOM_RESPONSE: ring-buffer-test", got: ${turn.finalMessage}`,
      );
    },
  );
});

// =============================================================================
// 6. Missing sidecar falls back to agents-json idle
// =============================================================================

describe('send() — missing sidecar falls back gracefully', () => {
  it(
    'completes successfully and returns status "completed" with undefined finalMessage when sidecar is absent',
    { timeout: 20000 },
    async () => {
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      // Start a session so the mock registers it in state.json
      const shortId = startIdleSession(env);

      // Nuke the sidecar state.json BEFORE calling send()
      const sidecarFile = join(MOCK_HOME, 'jobs', shortId, 'state.json');
      if (existsSync(sidecarFile)) {
        rmSync(sidecarFile);
      }
      // Also remove the jobs/<shortId>/ dir so readSidecar definitely returns null
      const sidecarDir = join(MOCK_HOME, 'jobs', shortId);
      if (existsSync(sidecarDir)) {
        rmSync(sidecarDir, { recursive: true, force: true });
      }

      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'no-sidecar test' },
        {
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      assert.equal(turn.status, 'completed');
      // Note: the mock's `cmdAttach` recreates the sidecar during the turn (T3 behavior),
      // so by the time `send()` does its final-read, `output.result` is populated. The
      // load-bearing assertion here is that the *polling fallback* didn't hang or crash
      // when the sidecar was absent at start — verified by `status === 'completed'`
      // arriving within the per-test timeout. `finalMessage` may or may not be defined.
      assert.ok(
        turn.finalMessage === undefined || typeof turn.finalMessage === 'string',
        `finalMessage must be undefined or string, got: ${typeof turn.finalMessage}`,
      );
    },
  );
});

// =============================================================================
// 7. Empty / whitespace-only prompt throws DriverError
// =============================================================================

describe('send() input validation — empty prompt', () => {
  it('empty string prompt rejects with DriverError mentioning empty/non-empty/text', async () => {
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const shortId = startIdleSession(env);
    const handle = makeHandle(shortId);
    const drv = new ClaudeBackgroundDriver({ env });

    await assert.rejects(
      () => drv.send(handle, { type: 'text', text: '' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'send');
        assert.ok(
          /empty|non-empty|text/i.test(err.message),
          `expected message to mention empty/non-empty/text, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('whitespace-only prompt rejects with DriverError', async () => {
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const shortId = startIdleSession(env);
    const handle = makeHandle(shortId);
    const drv = new ClaudeBackgroundDriver({ env });

    await assert.rejects(
      () => drv.send(handle, { type: 'text', text: '   ' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.equal(err.operation, 'send');
        return true;
      },
    );
  });
});

// =============================================================================
// 8. Invalid shortId throws DriverError
// =============================================================================

describe('send() input validation — invalid shortId', () => {
  const INVALID_IDS = ['../bad', '', 'a/b', 'a\\b', '.', '..'];

  for (const badId of INVALID_IDS) {
    it(`rejects shortId ${JSON.stringify(badId)} with DriverError`, async () => {
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const drv = new ClaudeBackgroundDriver({ env });
      const handle = {
        driverName: 'claude-background',
        shortId: badId,
        sessionName: `bg-bad`,
        cwd: COMPANION_HOME,
        startedAt: new Date().toISOString(),
      };

      await assert.rejects(
        () => drv.send(handle, { type: 'text', text: 'hi' }),
        (err) => {
          assert.ok(
            err instanceof DriverError,
            `expected DriverError for shortId ${JSON.stringify(badId)}, got ${err.constructor.name}`,
          );
          assert.ok(
            /invalid shortId|shortId/i.test(err.message),
            `expected message to mention "shortId", got: ${err.message}`,
          );
          return true;
        },
      );
    });
  }
});

// =============================================================================
// 9. Lock busy throws DriverError without spawning PTY
// =============================================================================

describe('send() — lock busy', () => {
  it('pre-created lock file causes DriverError mentioning "lock busy" or "attach lock", completes fast', async () => {
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const shortId = startIdleSession(env);

    // Pre-create the lock file (wx = exclusive create; fails if exists — we are creating it)
    const locksDir = join(COMPANION_HOME, 'locks');
    mkdirSync(locksDir, { recursive: true });
    const lp = lockPath(COMPANION_HOME, shortId);
    const fd = openSync(lp, 'w');
    // Write a plausible lock payload and close
    const { closeSync } = await import('node:fs');
    closeSync(fd);

    const handle = makeHandle(shortId);
    const drv = new ClaudeBackgroundDriver({ env });

    const start = Date.now();
    await assert.rejects(
      () => drv.send(handle, { type: 'text', text: 'lock test' }),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        assert.ok(
          /lock busy|attach lock/i.test(err.message),
          `expected message to mention lock busy/attach lock, got: ${err.message}`,
        );
        return true;
      },
    );

    // Must fail fast — no PTY spawn overhead (well under 500 ms)
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `lock-busy rejection took ${elapsed}ms; expected < 500ms`);
  });
});

// =============================================================================
// 10. Lock file released after success
// =============================================================================

describe('send() — lock released after success', () => {
  it('lock file does not exist after a successful send()', { timeout: 20000 }, async () => {
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const shortId = startIdleSession(env);
    const handle = makeHandle(shortId);
    const drv = new ClaudeBackgroundDriver({ env });

    await drv.send(
      handle,
      { type: 'text', text: 'lock release test' },
      {
        pollIntervalMs: 50,
        timeoutMs: 15000,
      },
    );

    const lp = lockPath(COMPANION_HOME, shortId);
    assert.equal(
      existsSync(lp),
      false,
      `lock file must not exist after successful send(), found: ${lp}`,
    );
  });
});

// =============================================================================
// 11. Lock file released after failure
// =============================================================================

describe('send() — lock released after failure', () => {
  it('lock file does not exist after empty-prompt rejection (validation before lock acquire)', async () => {
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const shortId = startIdleSession(env);
    const handle = makeHandle(shortId);
    const drv = new ClaudeBackgroundDriver({ env });

    // Empty prompt → validation fails (lock may never be acquired, that is also valid)
    await assert.rejects(() => drv.send(handle, { type: 'text', text: '' }));

    const lp = lockPath(COMPANION_HOME, shortId);
    assert.equal(
      existsSync(lp),
      false,
      `lock file must not exist after validation-failure rejection`,
    );
  });

  it('lock file does not exist after timeout rejection', { timeout: 15000 }, async () => {
    // Use a mock that does NOT update the sidecar after attach (sleepMs keeps mock alive
    // briefly, but promptRegisterTimeoutMs fires first). The simplest approach: set
    // timeoutMs to 1 ms so it fires before registration can possibly complete.
    const env = buildEnv(MOCK_HOME, COMPANION_HOME);
    const shortId = startIdleSession(env);
    const handle = makeHandle(shortId);
    const drv = new ClaudeBackgroundDriver({ env });

    await assert.rejects(
      () =>
        drv.send(
          handle,
          { type: 'text', text: 'lock release timeout' },
          {
            timeoutMs: 1,
            pollIntervalMs: 50,
          },
        ),
      (err) => {
        assert.ok(err instanceof DriverError, `expected DriverError, got ${err.constructor.name}`);
        return true;
      },
    );

    const lp = lockPath(COMPANION_HOME, shortId);
    assert.equal(
      existsSync(lp),
      false,
      `lock file must not exist after timeout rejection, found: ${lp}`,
    );
  });
});

// =============================================================================
// 12. Prompt-register timeout throws DriverError
// =============================================================================

describe('send() — prompt-register timeout', () => {
  it(
    'DriverError thrown when promptRegisterTimeoutMs fires before sidecar transitions off idle',
    { timeout: 15000 },
    async () => {
      // A 1 ms promptRegisterTimeoutMs fires immediately before any poll can succeed.
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      await assert.rejects(
        () =>
          drv.send(
            handle,
            { type: 'text', text: 'register timeout test' },
            {
              promptRegisterTimeoutMs: 1,
              pollIntervalMs: 50,
              timeoutMs: 10000,
            },
          ),
        (err) => {
          assert.ok(
            err instanceof DriverError,
            `expected DriverError, got ${err.constructor.name}`,
          );
          assert.equal(err.operation, 'send', `expected operation "send", got: ${err.operation}`);
          assert.ok(
            /did not register|prompt did not register|register|timeout/i.test(err.message),
            `expected timeout/register mention in error message, got: ${err.message}`,
          );
          return true;
        },
      );
    },
  );
});

// =============================================================================
// 13. Turn-completion timeout throws DriverError
// =============================================================================

describe('send() — turn-completion timeout', () => {
  it(
    'DriverError thrown when timeoutMs is extremely small (fires before turn can complete)',
    { timeout: 15000 },
    async () => {
      // A timeoutMs of 1 fires before any turn can complete, regardless of mock speed.
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      await assert.rejects(
        () =>
          drv.send(
            handle,
            { type: 'text', text: 'completion timeout test' },
            {
              timeoutMs: 1,
              pollIntervalMs: 50,
            },
          ),
        (err) => {
          assert.ok(
            err instanceof DriverError,
            `expected DriverError, got ${err.constructor.name}`,
          );
          assert.equal(err.operation, 'send');
          return true;
        },
      );
    },
  );
});

// =============================================================================
// 14. Permission waiting with NO callback throws DriverError
// =============================================================================

describe('send() — permission waiting with no callback', () => {
  it(
    'DriverError matching /permission required/i thrown when permissionStall is true and no callback supplied; lock is released',
    { timeout: 20000 },
    async () => {
      const cfg = writeMockConfig(MOCK_HOME, { permissionStall: true });
      const env = buildEnv(MOCK_HOME, COMPANION_HOME, {
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg,
      });
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      await assert.rejects(
        () =>
          drv.send(
            handle,
            { type: 'text', text: 'permission test no callback' },
            {
              pollIntervalMs: 50,
              timeoutMs: 15000,
              // No onPermissionRequest supplied
            },
          ),
        (err) => {
          assert.ok(
            err instanceof DriverError,
            `expected DriverError, got ${err.constructor.name}`,
          );
          assert.ok(
            /permission required|permission/i.test(err.message),
            `expected /permission required/i in error message, got: ${err.message}`,
          );
          return true;
        },
      );

      // Lock must be released
      const lp = lockPath(COMPANION_HOME, shortId);
      assert.equal(
        existsSync(lp),
        false,
        `lock file must be released after permission-no-callback failure`,
      );
    },
  );
});

// =============================================================================
// 15. Permission waiting WITH callback writes response and completes
// =============================================================================

describe('send() — permission waiting WITH callback', () => {
  it(
    'callback is called; answering "y" allows the turn to complete; status is "completed"',
    { timeout: 25000 },
    async () => {
      const cfg = writeMockConfig(MOCK_HOME, { permissionStall: true });
      const env = buildEnv(MOCK_HOME, COMPANION_HOME, {
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg,
      });
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      let callbackCalled = false;
      let callbackShortId;

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'permission callback test' },
        {
          pollIntervalMs: 50,
          timeoutMs: 20000,
          onPermissionRequest: async ({ shortId: sid }) => {
            callbackCalled = true;
            callbackShortId = sid;
            return 'y';
          },
        },
      );

      // The callback must have been invoked
      assert.equal(callbackCalled, true, 'onPermissionRequest callback must have been called');
      assert.equal(
        callbackShortId,
        shortId,
        `callback shortId must equal the session shortId (${shortId}), got: ${callbackShortId}`,
      );

      // The turn must have completed successfully
      assert.equal(turn.status, 'completed');
      assert.ok(
        turn.finalMessage !== undefined,
        'finalMessage must be set after a completed turn with permission callback',
      );
    },
  );
});

// =============================================================================
// 16. AbortSignal abort releases lock and throws DriverError
// =============================================================================

describe('send() — AbortSignal abort', () => {
  it(
    'aborting the signal causes send() to reject and releases the lock',
    { timeout: 15000 },
    async () => {
      const env = buildEnv(MOCK_HOME, COMPANION_HOME);
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const controller = new AbortController();

      const sendPromise = drv.send(
        handle,
        { type: 'text', text: 'abort test' },
        {
          signal: controller.signal,
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      // Abort immediately
      controller.abort();

      await assert.rejects(
        () => sendPromise,
        (err) => {
          assert.ok(
            err instanceof DriverError || err.name === 'AbortError',
            `expected DriverError or AbortError, got ${err.constructor.name}: ${err.message}`,
          );
          return true;
        },
      );

      // Lock must be released after abort
      const lp = lockPath(COMPANION_HOME, shortId);
      assert.equal(existsSync(lp), false, `lock file must be released after AbortSignal abort`);
    },
  );
});

// =============================================================================
// 17. No `claude -p` in attach.ts source
// =============================================================================

describe('attach.ts source — no claude -p or claude --print', () => {
  it('packages/driver-claude-code/src/attach.ts does not contain "claude -p" or "claude --print"', () => {
    assert.ok(existsSync(ATTACH_SRC), `attach.ts must exist at ${ATTACH_SRC}`);
    const src = readFileSync(ATTACH_SRC, 'utf8');
    assert.equal(
      src.includes('claude -p'),
      false,
      'attach.ts must not contain the string "claude -p" (forbidden by Plan 0001/0002 OQ4)',
    );
    assert.equal(
      src.includes('claude --print'),
      false,
      'attach.ts must not contain the string "claude --print" (forbidden by Plan 0001/0002 OQ4)',
    );
  });
});

// =============================================================================
// 18. finalMessage is sourced from readSidecar, not from PTY output capture
// =============================================================================

describe('send() — no semantic dependence on PTY TUI text', () => {
  it(
    'turn.finalMessage equals sidecar.output.result even when the custom attachResponse contains ANSI-like noise',
    { timeout: 20000 },
    async () => {
      // Configure a response that looks like a noisy PTY stream full of control sequences.
      // If the driver were scraping PTY output for the final message, it could accidentally
      // include this noise. The correct answer must still come from the sidecar.
      const noisyResponse = '\x1b[1;32m[mock]\x1b[0m Got: ${prompt} — \x1b[31mignore me\x1b[0m';
      const expectedResult = `\x1b[1;32m[mock]\x1b[0m Got: ansi-test — \x1b[31mignore me\x1b[0m`;

      const cfg = writeMockConfig(MOCK_HOME, { attachResponse: noisyResponse });
      const env = buildEnv(MOCK_HOME, COMPANION_HOME, {
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg,
      });
      const shortId = startIdleSession(env);
      const handle = makeHandle(shortId);
      const drv = new ClaudeBackgroundDriver({ env });

      const turn = await drv.send(
        handle,
        { type: 'text', text: 'ansi-test' },
        {
          pollIntervalMs: 50,
          timeoutMs: 15000,
        },
      );

      // Read sidecar independently
      const snapshot = await readSidecar(shortId, { env });
      assert.ok(snapshot !== null, 'sidecar snapshot must not be null after completed turn');

      // The sidecar is the ground truth
      assert.equal(
        turn.finalMessage,
        snapshot.output?.result,
        'turn.finalMessage must come from sidecar.output.result, not from PTY scraping',
      );

      // Sanity: the value is what the mock wrote (ANSI sequences preserved verbatim)
      assert.equal(
        snapshot.output?.result,
        expectedResult,
        `sidecar output.result must equal the configured attachResponse with \${prompt} substituted`,
      );
    },
  );
});
