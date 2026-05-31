// Tests for the PTY-attach + sidecar contract (Plan 0002 T3).
//
// These tests cover:
//   - Sidecar creation on `claude --bg "<prompt>"` (state.json + timeline.jsonl shape)
//   - Sidecar idle state on `claude --bg` (no prompt)
//   - `claude attach <unknown-id>` exits 1 with "unknown session"
//   - `claude attach --help` exit 0 with correct usage text
//   - PTY attach lifecycle (node-pty, single turn, Ctrl+Z detach)
//   - Multi-turn under a single attach session
//   - Permission stall (permissionStall: true)
//   - attachResponse template substitution
//   - `claude stop <shortId>` writes sidecar `stopped` transition
//
// Contract: the implementation (Subagent A) is the source of truth for behaviour;
// these tests are the source-of-truth verification.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaude, withIsolatedHome, writeConfig } from './helpers.mjs';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const here = fileURLToPath(import.meta.url);
const MOCK_DIR = resolve(dirname(here), '..');
const CLAUDE_BIN = resolve(MOCK_DIR, 'claude');

// node-pty is a CJS module; use createRequire to import it from the workspace root.
const requireCjs = createRequire(import.meta.url);
const pty = requireCjs('node-pty');
const ptySpawn = pty.spawn;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll `predicate()` every 50 ms up to `timeoutMs`.
 * Rejects with a descriptive error if the predicate has not become truthy by the deadline.
 */
function waitFor(predicate, timeoutMs, label = 'condition') {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`waitFor timed out after ${timeoutMs}ms waiting for: ${label}`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Read and parse a JSON file. Returns null if the file does not exist yet.
 */
function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Read all lines from a .jsonl file, returning an array of parsed objects.
 * Returns [] if the file does not exist.
 */
function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

/**
 * Extract the shortId from a `--bg` stdout line.
 * Works for both:
 *   "backgrounded · <shortId>"  (with-prompt mode)
 *   "backgrounded · <shortId> (idle …)"  (no-prompt mode)
 */
function extractShortId(stdout) {
  const m = stdout.match(/backgrounded · ([0-9a-f]{8})/);
  assert.ok(m, `could not find "backgrounded · <8-hex>" in stdout:\n${stdout}`);
  return m[1];
}

/**
 * Spawn the mock claude binary under node-pty with the given args and env.
 * Returns `{ term, exitPromise, getOut }` where:
 *   - `term` is the IPty instance
 *   - `exitPromise` resolves to `{ exitCode, signal }` on process exit
 *   - `getOut()` returns the accumulated stdout string so far
 */
function spawnPty(args, env) {
  let out = '';
  const term = ptySpawn(CLAUDE_BIN, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, ...env },
  });
  term.onData((d) => {
    out += d;
  });
  const exitPromise = new Promise((resolve) => {
    term.onExit((e) => resolve(e));
  });
  return { term, exitPromise, getOut: () => out };
}

// ---------------------------------------------------------------------------
// Sidecar path helpers
// ---------------------------------------------------------------------------

function sidecarStatePath(home, shortId) {
  return resolve(home, 'jobs', shortId, 'state.json');
}

function sidecarTimelinePath(home, shortId) {
  return resolve(home, 'jobs', shortId, 'timeline.jsonl');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('attach + sidecar (plan 0002 T3)', () => {
  // -------------------------------------------------------------------------
  // 1. Sidecar created on `claude --bg "<prompt>"`
  // -------------------------------------------------------------------------
  describe('sidecar created on --bg with prompt', () => {
    it('state.json exists, parses, and has the expected shape after cmdBg', () => {
      withIsolatedHome(({ home, env }) => {
        const prompt = 'summarise the repo';
        const r = runClaude(['--bg', prompt], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);

        const shortId = extractShortId(r.stdout);
        const statePath = sidecarStatePath(home, shortId);
        assert.ok(existsSync(statePath), `state.json must exist at ${statePath}`);

        const state = readJson(statePath);
        assert.ok(state, 'state.json must parse as JSON');

        // Core state fields
        assert.equal(state.state, 'done', `state.state must be "done", got: ${state.state}`);
        assert.equal(state.tempo, 'idle', `state.tempo must be "idle", got: ${state.tempo}`);
        assert.equal(
          state.inFlight?.tasks,
          0,
          `inFlight.tasks must be 0, got: ${state.inFlight?.tasks}`,
        );
        assert.ok(
          state.output?.result && state.output.result.length > 0,
          `output.result must be non-empty, got: ${JSON.stringify(state.output)}`,
        );
        assert.equal(state.intent, prompt, `intent must equal the prompt`);
        assert.ok(
          state.linkScanPath && state.linkScanPath.length > 0,
          `linkScanPath must be non-empty, got: ${state.linkScanPath}`,
        );

        // All other documented fields must be present
        assert.equal(state.template, 'bg', `template must be "bg"`);
        assert.ok(state.name, `name must be present`);
        assert.ok(state.nameSource, `nameSource must be present`);
        assert.ok(state.sessionId, `sessionId must be present`);
        assert.ok(state.resumeSessionId, `resumeSessionId must be present`);
        assert.equal(state.daemonShort, shortId, `daemonShort must equal shortId`);
        assert.ok(state.cliVersion, `cliVersion must be present`);
        assert.ok(state.cwd, `cwd must be present`);
        assert.equal(state.backend, 'daemon', `backend must be "daemon"`);
      });
    });

    it('timeline.jsonl has at least 2 lines; the last line has state "done" with non-empty text', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg', 'do something useful'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);

        const shortId = extractShortId(r.stdout);
        const timelinePath = sidecarTimelinePath(home, shortId);
        assert.ok(existsSync(timelinePath), `timeline.jsonl must exist at ${timelinePath}`);

        const lines = readJsonl(timelinePath);
        assert.ok(
          lines.length >= 2,
          `timeline.jsonl must have at least 2 lines, got: ${lines.length}`,
        );

        const last = lines[lines.length - 1];
        assert.equal(
          last.state,
          'done',
          `last timeline line state must be "done", got: ${last.state}`,
        );
        assert.ok(last.at, `last timeline line must have an "at" field`);
        assert.ok(
          last.text && last.text.length > 0,
          `last timeline line must have non-empty "text", got: ${JSON.stringify(last.text)}`,
        );
      });
    });

    it('inFlight shape has tasks, queued, and kinds array', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg', 'check inFlight shape'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        const shortId = extractShortId(r.stdout);
        const state = readJson(sidecarStatePath(home, shortId));
        assert.ok(state.inFlight, 'inFlight must be present');
        assert.equal(typeof state.inFlight.tasks, 'number', 'inFlight.tasks must be a number');
        assert.equal(typeof state.inFlight.queued, 'number', 'inFlight.queued must be a number');
        assert.ok(Array.isArray(state.inFlight.kinds), 'inFlight.kinds must be an array');
        assert.deepEqual(state.inFlight.kinds, [], 'inFlight.kinds must be [] when done');
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Sidecar starts at `idle` on `claude --bg` (no prompt)
  // -------------------------------------------------------------------------
  describe('sidecar starts at idle on --bg with no prompt', () => {
    it('state.json has state "idle", intent "", inFlight.tasks 0', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);

        const shortId = extractShortId(r.stdout);
        const statePath = sidecarStatePath(home, shortId);
        assert.ok(existsSync(statePath), `state.json must exist at ${statePath}`);

        const state = readJson(statePath);
        assert.ok(state, 'state.json must parse as JSON');
        assert.equal(state.state, 'idle', `state.state must be "idle", got: ${state.state}`);
        assert.equal(state.intent, '', `intent must be empty string, got: ${state.intent}`);
        assert.equal(
          state.inFlight?.tasks,
          0,
          `inFlight.tasks must be 0, got: ${state.inFlight?.tasks}`,
        );
        // output.result should be absent or empty in idle state
        const result = state.output?.result;
        assert.ok(
          result === undefined || result === null || result === '',
          `output.result must be absent or empty in idle state, got: ${JSON.stringify(result)}`,
        );
      });
    });

    it('timeline.jsonl has exactly 1 line with state "idle"', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);

        const shortId = extractShortId(r.stdout);
        const timelinePath = sidecarTimelinePath(home, shortId);
        assert.ok(existsSync(timelinePath), `timeline.jsonl must exist at ${timelinePath}`);

        const lines = readJsonl(timelinePath);
        assert.equal(
          lines.length,
          1,
          `timeline.jsonl must have exactly 1 line, got: ${lines.length}`,
        );
        assert.equal(
          lines[0].state,
          'idle',
          `first timeline line state must be "idle", got: ${lines[0].state}`,
        );
        assert.ok(lines[0].at, `timeline line must have an "at" field`);
      });
    });

    it('stdout contains the idle banner with the shortId', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['--bg'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        assert.match(
          r.stdout,
          /backgrounded · [0-9a-f]{8}/,
          `expected "backgrounded · <8-hex>" in stdout: ${r.stdout}`,
        );
        assert.ok(
          r.stdout.includes('idle'),
          `idle banner must mention "idle" in stdout: ${r.stdout}`,
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. `claude attach <unknown-shortId>` exits 1
  // -------------------------------------------------------------------------
  describe('claude attach <unknown-shortId>', () => {
    it('exits 1 and stderr matches /unknown session/', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['attach', 'deadbeef'], { env });
        assert.equal(r.status, 1, `expected exit 1, got: ${r.status}`);
        assert.match(r.stderr, /unknown session/);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. `claude attach --help` exits 0 (regression on T2 behavior)
  // -------------------------------------------------------------------------
  describe('claude attach --help', () => {
    it('exits 0', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['attach', '--help'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
      });
    });

    it('stdout contains "Usage: claude attach"', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['attach', '--help'], { env });
        assert.match(
          r.stdout,
          /Usage:\s+claude attach/,
          `expected "Usage: claude attach" in stdout:\n${r.stdout}`,
        );
      });
    });

    it('stdout contains "Detach with Ctrl+Z"', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['attach', '--help'], { env });
        assert.ok(
          r.stdout.includes('Detach with Ctrl+Z'),
          `expected "Detach with Ctrl+Z" in stdout:\n${r.stdout}`,
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. PTY attach lifecycle (node-pty, single turn)
  // -------------------------------------------------------------------------
  describe('PTY attach lifecycle (node-pty)', () => {
    it(
      'write a prompt, wait for response, sidecar updates to done, Ctrl+Z exits 0',
      { timeout: 15000 },
      async () => {
        await withIsolatedHome(async ({ home, env }) => {
          // Start a no-prompt --bg session
          const bgResult = runClaude(['--bg'], { env });
          assert.equal(bgResult.status, 0, `--bg failed: ${bgResult.stderr}`);
          const shortId = extractShortId(bgResult.stdout);

          // Spawn the mock under PTY
          const { term, exitPromise, getOut } = spawnPty(['attach', shortId], env);

          // Write a prompt and wait for the response marker
          term.write('hello world\r');
          await waitFor(
            () => getOut().includes('[mock] Got:') && getOut().includes('hello world'),
            8000,
            '"[mock] Got: hello world" in PTY stdout',
          );

          // Verify sidecar state after the turn completes
          const statePath = sidecarStatePath(home, shortId);
          await waitFor(
            () => {
              const s = readJson(statePath);
              return s && s.state === 'done' && s.tempo === 'idle';
            },
            5000,
            'sidecar state.json to show state=done',
          );

          const state = readJson(statePath);
          assert.equal(state.state, 'done');
          assert.ok(
            state.output?.result?.includes('hello world'),
            `output.result must include "hello world", got: ${state.output?.result}`,
          );

          // Verify timeline
          const timelinePath = sidecarTimelinePath(home, shortId);
          const lines = readJsonl(timelinePath);
          const doneLine = lines.find((l) => l.state === 'done');
          assert.ok(doneLine, 'timeline.jsonl must have a "done" line');
          assert.ok(
            doneLine.text?.includes('hello world'),
            `timeline done line text must include "hello world", got: ${doneLine.text}`,
          );

          // Detach with Ctrl+Z
          term.write('\x1a');
          const { exitCode } = await exitPromise;
          assert.equal(exitCode, 0, `expected PTY exit 0, got: ${exitCode}`);

          // Session must still be listed in `claude agents --json` after detach
          const agents = runClaude(['agents', '--json'], { env });
          assert.equal(agents.status, 0, `agents --json failed: ${agents.stderr}`);
          const parsed = JSON.parse(agents.stdout);
          assert.ok(Array.isArray(parsed), 'agents --json must return an array');
          const sessionId = state.sessionId;
          const derivedShort = sessionId.replace(/-/g, '').slice(0, 8);
          const found = parsed.some(
            (entry) =>
              entry.sessionId === sessionId ||
              entry.sessionId?.replace(/-/g, '').slice(0, 8) === derivedShort,
          );
          assert.ok(
            found,
            `session ${shortId} / ${sessionId} must still appear in agents --json after detach`,
          );
        });
      },
    );
  });

  // -------------------------------------------------------------------------
  // 6. Multi-turn under a single attach
  // -------------------------------------------------------------------------
  describe('multi-turn under a single PTY attach', () => {
    it(
      'two prompts produce two done timeline entries with correct text fields',
      { timeout: 20000 },
      async () => {
        await withIsolatedHome(async ({ home, env }) => {
          // Start a no-prompt --bg session
          const bgResult = runClaude(['--bg'], { env });
          assert.equal(bgResult.status, 0, `--bg failed: ${bgResult.stderr}`);
          const shortId = extractShortId(bgResult.stdout);

          const { term, exitPromise, getOut } = spawnPty(['attach', shortId], env);

          // First turn
          term.write('first\r');
          await waitFor(
            () => getOut().includes('[mock] Got:') && getOut().includes('first'),
            8000,
            '"[mock] Got: ... first" in PTY stdout',
          );

          // Wait for sidecar to reflect done for first turn
          const statePath = sidecarStatePath(home, shortId);
          await waitFor(
            () => {
              const s = readJson(statePath);
              return s && s.state === 'done' && s.output?.result?.includes('first');
            },
            5000,
            'sidecar to show done with "first" in output',
          );

          // Second turn
          term.write('second\r');
          await waitFor(
            () => {
              const outSoFar = getOut();
              // The second response must appear AFTER the first response
              const firstIdx = outSoFar.indexOf('first');
              const secondIdx = outSoFar.indexOf('second', firstIdx + 1);
              return secondIdx !== -1 && outSoFar.includes('[mock] Got:');
            },
            8000,
            '"second" response in PTY stdout after "first" response',
          );

          // Wait for sidecar to reflect done for second turn
          await waitFor(
            () => {
              const s = readJson(statePath);
              return s && s.state === 'done' && s.output?.result?.includes('second');
            },
            5000,
            'sidecar to show done with "second" in output',
          );

          // Detach
          term.write('\x1a');
          const { exitCode } = await exitPromise;
          assert.equal(exitCode, 0, `expected PTY exit 0, got: ${exitCode}`);

          // Verify timeline has two done lines
          const timelinePath = sidecarTimelinePath(home, shortId);
          const lines = readJsonl(timelinePath);
          const doneLines = lines.filter((l) => l.state === 'done');
          assert.ok(
            doneLines.length >= 2,
            `expected at least 2 "done" lines in timeline, got: ${doneLines.length}`,
          );
          assert.ok(
            doneLines.some((l) => l.text?.includes('first')),
            `a done line must have text containing "first"`,
          );
          assert.ok(
            doneLines.some((l) => l.text?.includes('second')),
            `a done line must have text containing "second"`,
          );

          // Latest state.json must reflect the second (most recent) response
          const finalState = readJson(statePath);
          assert.ok(
            finalState.output?.result?.includes('second'),
            `state.json output.result must match the last (second) response, got: ${finalState.output?.result}`,
          );
        });
      },
    );
  });

  // -------------------------------------------------------------------------
  // 7. Permission stall (permissionStall: true)
  // -------------------------------------------------------------------------
  describe('permission stall (permissionStall: true)', () => {
    it(
      'first submit triggers waiting state; answering "y" resumes to done',
      { timeout: 20000 },
      async () => {
        await withIsolatedHome(async ({ home, env }) => {
          // Start no-prompt --bg with permissionStall: true
          const cfg = writeConfig(home, { permissionStall: true });
          const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };

          const bgResult = runClaude(['--bg'], { env: cfgEnv });
          assert.equal(bgResult.status, 0, `--bg failed: ${bgResult.stderr}`);
          const shortId = extractShortId(bgResult.stdout);

          const { term, exitPromise, getOut } = spawnPty(['attach', shortId], cfgEnv);

          // Submit a prompt — this should trigger the permission stall
          term.write('do thing\r');

          // Wait for the "Permission required." prompt on stdout
          await waitFor(
            () => getOut().includes('Permission required'),
            8000,
            '"Permission required" in PTY stdout',
          );

          // Sidecar must show state=waiting with inFlight.kinds including "permission"
          const statePath = sidecarStatePath(home, shortId);
          await waitFor(
            () => {
              const s = readJson(statePath);
              return s && s.state === 'waiting';
            },
            5000,
            'sidecar state.json to show state=waiting',
          );
          const waitingState = readJson(statePath);
          assert.equal(
            waitingState.state,
            'waiting',
            `state must be "waiting" during permission stall, got: ${waitingState.state}`,
          );
          assert.ok(
            Array.isArray(waitingState.inFlight?.kinds) &&
              waitingState.inFlight.kinds.includes('permission'),
            `inFlight.kinds must include "permission", got: ${JSON.stringify(waitingState.inFlight?.kinds)}`,
          );

          // Answer the permission prompt
          term.write('y\r');

          // Wait for the assistant response to appear
          await waitFor(
            () => getOut().includes('[mock] Got:') && getOut().includes('do thing'),
            8000,
            '"[mock] Got: ... do thing" in PTY stdout after answering permission',
          );

          // Sidecar must show done with the original prompt's output
          await waitFor(
            () => {
              const s = readJson(statePath);
              return s && s.state === 'done';
            },
            5000,
            'sidecar state.json to show state=done after permission answer',
          );
          const doneState = readJson(statePath);
          assert.equal(doneState.state, 'done');
          assert.ok(
            doneState.output?.result?.includes('do thing'),
            `output.result must include "do thing", got: ${doneState.output?.result}`,
          );

          // Detach
          term.write('\x1a');
          const { exitCode } = await exitPromise;
          assert.equal(exitCode, 0, `expected PTY exit 0, got: ${exitCode}`);
        });
      },
    );
  });

  // -------------------------------------------------------------------------
  // 8. `attachResponse` template substitution
  // -------------------------------------------------------------------------
  describe('attachResponse template substitution', () => {
    it(
      'response uses the configured template with ${prompt} substituted',
      { timeout: 15000 },
      async () => {
        await withIsolatedHome(async ({ home, env }) => {
          const cfg = writeConfig(home, { attachResponse: 'ECHOED: ${prompt}!' });
          const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };

          const bgResult = runClaude(['--bg'], { env: cfgEnv });
          assert.equal(bgResult.status, 0, `--bg failed: ${bgResult.stderr}`);
          const shortId = extractShortId(bgResult.stdout);

          const { term, exitPromise, getOut } = spawnPty(['attach', shortId], cfgEnv);

          term.write('abc\r');

          // Wait for the substituted response
          await waitFor(
            () => getOut().includes('ECHOED: abc!'),
            8000,
            '"ECHOED: abc!" in PTY stdout',
          );

          // Sidecar must reflect the substituted response
          const statePath = sidecarStatePath(home, shortId);
          await waitFor(
            () => {
              const s = readJson(statePath);
              return s && s.state === 'done';
            },
            5000,
            'sidecar state.json to show state=done',
          );

          const state = readJson(statePath);
          assert.equal(
            state.output?.result,
            'ECHOED: abc!',
            `output.result must equal "ECHOED: abc!", got: ${state.output?.result}`,
          );

          // Detach
          term.write('\x1a');
          const { exitCode } = await exitPromise;
          assert.equal(exitCode, 0, `expected PTY exit 0, got: ${exitCode}`);
        });
      },
    );

    it('default attachResponse is "[mock] Got: <prompt>"', { timeout: 15000 }, async () => {
      await withIsolatedHome(async ({ home, env }) => {
        const bgResult = runClaude(['--bg'], { env });
        assert.equal(bgResult.status, 0, `--bg failed: ${bgResult.stderr}`);
        const shortId = extractShortId(bgResult.stdout);

        const { term, exitPromise, getOut } = spawnPty(['attach', shortId], env);

        term.write('testprompt\r');

        await waitFor(
          () => getOut().includes('[mock] Got: testprompt'),
          8000,
          '"[mock] Got: testprompt" in PTY stdout',
        );

        term.write('\x1a');
        const { exitCode } = await exitPromise;
        assert.equal(exitCode, 0, `expected PTY exit 0, got: ${exitCode}`);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. `claude stop <shortId>` writes sidecar `stopped` transition
  // -------------------------------------------------------------------------
  describe('cmdStop writes sidecar stopped transition', () => {
    it('after stop, state.json has state "stopped", tempo "idle", inFlight.tasks 0', () => {
      withIsolatedHome(({ home, env }) => {
        // Start with a prompt so the session is in "done" before stop
        const r = runClaude(['--bg', 'will be stopped'], { env });
        assert.equal(r.status, 0, `--bg failed: ${r.stderr}`);
        const shortId = extractShortId(r.stdout);

        // Stop the session
        const stop = runClaude(['stop', shortId], { env });
        assert.equal(stop.status, 0, `stop failed: exit=${stop.status} stderr=${stop.stderr}`);

        // Verify sidecar state
        const statePath = sidecarStatePath(home, shortId);
        assert.ok(existsSync(statePath), `state.json must still exist after stop`);

        const state = readJson(statePath);
        assert.equal(state.state, 'stopped', `state must be "stopped", got: ${state.state}`);
        assert.equal(state.tempo, 'idle', `tempo must be "idle", got: ${state.tempo}`);
        assert.equal(
          state.inFlight?.tasks,
          0,
          `inFlight.tasks must be 0, got: ${state.inFlight?.tasks}`,
        );
      });
    });

    it('after stop, timeline.jsonl ends with a "stopped" line', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg', 'stop timeline test'], { env });
        assert.equal(r.status, 0, `--bg failed: ${r.stderr}`);
        const shortId = extractShortId(r.stdout);

        runClaude(['stop', shortId], { env });

        const timelinePath = sidecarTimelinePath(home, shortId);
        assert.ok(existsSync(timelinePath), `timeline.jsonl must exist after stop`);

        const lines = readJsonl(timelinePath);
        assert.ok(lines.length > 0, 'timeline.jsonl must have at least one line');

        const last = lines[lines.length - 1];
        assert.equal(
          last.state,
          'stopped',
          `last timeline line state must be "stopped", got: ${last.state}`,
        );
        assert.ok(last.at, `last timeline line must have an "at" field`);
      });
    });

    it('after stop on an idle (no-prompt) session, sidecar transitions to stopped', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg'], { env });
        assert.equal(r.status, 0, `--bg failed: ${r.stderr}`);
        const shortId = extractShortId(r.stdout);

        const stop = runClaude(['stop', shortId], { env });
        assert.equal(stop.status, 0, `stop failed: exit=${stop.status} stderr=${stop.stderr}`);

        const state = readJson(sidecarStatePath(home, shortId));
        assert.equal(state.state, 'stopped', `state must be "stopped", got: ${state.state}`);
      });
    });
  });
});
