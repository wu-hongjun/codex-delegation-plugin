import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runClaude, withIsolatedHome, writeConfig } from './helpers.mjs';

// Helper: legacy config opts into the old mock schema/behavior so existing tests
// continue to pass unchanged.
function legacyConfig(home, extra = {}) {
  return writeConfig(home, {
    agentsJsonSchema: 'mock',
    bgStdoutStyle: 'started-session',
    daemonAvailable: true,
    helpListsBg: true,
    ...extra,
  });
}

describe('mock-claude', () => {
  describe('claude --version', () => {
    it('returns the default version when no config is set', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['--version'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        assert.match(r.stdout, /^Claude Code 2\.1\.999-mock\b/);
      });
    });

    it('returns the configured version when a config sets one', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { version: '2.2.0-test' });
        const r = runClaude(['--version'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0);
        assert.match(r.stdout, /Claude Code 2\.2\.0-test/);
      });
    });
  });

  describe('claude auth status', () => {
    it('succeeds when authenticated (default fixture)', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['auth', 'status'], { env });
        assert.equal(r.status, 0);
        assert.match(r.stdout, /Logged in/);
      });
    });

    it('fails when authStatus = unauthenticated', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { authStatus: 'unauthenticated' });
        const r = runClaude(['auth', 'status'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.notEqual(r.status, 0);
        assert.match(r.stdout, /Not logged in/);
      });
    });
  });

  describe('claude --bg (legacy mode)', () => {
    it('creates a session and prints a short ID', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const r = runClaude(['--bg', 'hi'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        const m = r.stdout.match(/Started background session ([0-9a-f]+)/);
        assert.ok(m, `did not find short id in stdout: ${r.stdout}`);
        assert.ok(m[1].length >= 4);
      });
    });

    it('accepts --name and persists state.json', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const r = runClaude(['--bg', '--name', 'codex:test:job1', 'do a thing'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0);
        const state = JSON.parse(readFileSync(`${home}/state.json`, 'utf8'));
        assert.equal(state.sessions.length, 1);
        const s = state.sessions[0];
        assert.equal(s.name, 'codex:test:job1');
        assert.equal(s.status, 'working');
        assert.equal(s.prompt, 'do a thing');
        assert.ok(existsSync(s.transcriptPath), 'transcript should exist');
        assert.ok(existsSync(s.logPath), 'log should exist');
      });
    });

    it('exits non-zero when bgFails fixture is set', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { bgFails: true });
        const r = runClaude(['--bg', 'will fail'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /Failed to start/);
      });
    });

    it('tolerates extra flags like --model and --permission-mode', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const r = runClaude(
          ['--bg', '--name', 'x', '--model', 'sonnet', '--permission-mode', 'default', 'hello'],
          { env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg } },
        );
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
      });
    });
  });

  describe('claude agents --json (legacy mode)', () => {
    it('returns parseable JSON containing a freshly started session', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };
        const start = runClaude(['--bg', 'hi'], { env: cfgEnv });
        const shortId = start.stdout.match(/session ([0-9a-f]+)/)[1];

        const r = runClaude(['agents', '--json'], { env: cfgEnv });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        const parsed = JSON.parse(r.stdout);
        assert.ok(Array.isArray(parsed));
        const match = parsed.find((s) => s.shortId === shortId);
        assert.ok(match, `freshly-started session ${shortId} not in agents --json`);
        assert.equal(match.status, 'working');
      });
    });

    it('returns an empty array when no sessions exist', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['agents', '--json'], { env });
        assert.equal(r.status, 0);
        assert.deepEqual(JSON.parse(r.stdout), []);
      });
    });

    it('returns malformed JSON when fixture says so', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { agentsJsonMalformed: true });
        const r = runClaude(['agents', '--json'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0);
        assert.throws(() => JSON.parse(r.stdout));
      });
    });

    it('exits non-zero with stderr when agentsJsonFails is set', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { agentsJsonFails: true });
        const r = runClaude(['agents', '--json'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /agents error/);
      });
    });
  });

  describe('claude logs (legacy mode)', () => {
    it('returns log text for a known session', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };
        const start = runClaude(['--bg', 'something'], { env: cfgEnv });
        const shortId = start.stdout.match(/session ([0-9a-f]+)/)[1];

        const r = runClaude(['logs', shortId], { env: cfgEnv });
        assert.equal(r.status, 0);
        assert.match(r.stdout, /Session [0-9a-f]+ started/);
        assert.match(r.stdout, /Prompt: something/);
      });
    });

    it('exits non-zero on unknown id', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['logs', 'no-such-id'], { env });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /unknown session/);
      });
    });

    it('exits non-zero when logsFail fixture is set', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };
        const start = runClaude(['--bg', 'x'], { env: cfgEnv });
        const shortId = start.stdout.match(/session ([0-9a-f]+)/)[1];
        const cfg2 = writeConfig(home, { logsFail: true });
        const r = runClaude(['logs', shortId], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg2 },
        });
        assert.notEqual(r.status, 0);
      });
    });
  });

  describe('claude stop (legacy mode)', () => {
    it('marks a session stopped and updates agents --json', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };
        const start = runClaude(['--bg', 'x'], { env: cfgEnv });
        const shortId = start.stdout.match(/session ([0-9a-f]+)/)[1];

        const stop = runClaude(['stop', shortId], { env: cfgEnv });
        assert.equal(stop.status, 0);
        assert.match(stop.stdout, new RegExp(`Stopped session ${shortId}`));

        const agents = runClaude(['agents', '--json'], { env: cfgEnv });
        const parsed = JSON.parse(agents.stdout);
        const match = parsed.find((s) => s.shortId === shortId);
        assert.equal(match.status, 'stopped');
      });
    });

    it('exits non-zero on unknown id', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['stop', 'no-such-id'], { env });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /unknown session/);
      });
    });
  });

  describe('claude daemon status (legacy mode)', () => {
    it('reports running in the legacy fixture (daemonAvailable: true)', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { daemonAvailable: true, daemonStatus: 'running' });
        const r = runClaude(['daemon', 'status'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0);
        assert.match(r.stdout, /Claude daemon: running/);
      });
    });

    it('reports stopped when fixture says so (daemonAvailable: true)', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { daemonAvailable: true, daemonStatus: 'stopped' });
        const r = runClaude(['daemon', 'status'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.notEqual(r.status, 0);
        assert.match(r.stdout, /Claude daemon: stopped/);
      });
    });
  });

  describe('unknown commands', () => {
    it('exit 2 with a usage hint', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['bogus'], { env });
        assert.equal(r.status, 2);
        assert.match(r.stderr, /unknown command/);
      });
    });
  });

  // -----------------------------------------------------------------------
  // New tests: real-2.1.149 schema (default mode)
  // -----------------------------------------------------------------------

  describe('claude --bg (real-2.1.149 mode, default)', () => {
    it('prints "backgrounded · <shortId>" where shortId is 8 hex chars', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['--bg', 'hello real'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        const m = r.stdout.match(/backgrounded · ([0-9a-f]{8})/);
        assert.ok(m, `expected "backgrounded · <8-hex>" in stdout: ${r.stdout}`);
        assert.match(m[1], /^[0-9a-f]{8}$/);
      });
    });

    it('prints the "Starting background service…" header line', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['--bg', 'hello real'], { env });
        assert.ok(
          r.stdout.includes('Starting background service'),
          `expected "Starting background service" in stdout: ${r.stdout}`,
        );
      });
    });

    it('the shortId in stdout equals first 8 hex of sessionId stored in state.json', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg', 'coherence check'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        const m = r.stdout.match(/backgrounded · ([0-9a-f]{8})/);
        assert.ok(m, `expected "backgrounded · <8-hex>" in stdout: ${r.stdout}`);
        const printedShortId = m[1];

        const state = JSON.parse(readFileSync(`${home}/state.json`, 'utf8'));
        assert.equal(state.sessions.length, 1);
        const sessionId = state.sessions[0].sessionId;
        const derivedShortId = sessionId.replace(/-/g, '').slice(0, 8);
        assert.equal(
          printedShortId,
          derivedShortId,
          `printed shortId ${printedShortId} should equal first 8 hex of sessionId ${sessionId}`,
        );
      });
    });
  });

  describe('claude agents --json (real-2.1.149 mode, default)', () => {
    it('returns entries with pid, cwd, kind, startedAt (number), sessionId (UUID), status', () => {
      withIsolatedHome(({ env }) => {
        const start = runClaude(['--bg', 'real schema test'], { env });
        assert.equal(start.status, 0);

        const r = runClaude(['agents', '--json'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        const parsed = JSON.parse(r.stdout);
        assert.ok(Array.isArray(parsed));
        assert.equal(parsed.length, 1);

        const entry = parsed[0];
        assert.equal(typeof entry.pid, 'number', 'pid must be a number');
        assert.equal(typeof entry.cwd, 'string', 'cwd must be a string');
        assert.equal(entry.kind, 'interactive', 'kind must be "interactive"');
        assert.equal(typeof entry.startedAt, 'number', 'startedAt must be a number (unix ms)');
        assert.match(
          entry.sessionId,
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          'sessionId must be UUID format',
        );
        assert.equal(typeof entry.status, 'string', 'status must be a string');
      });
    });

    it('does NOT include id, shortId, name, updatedAt, transcriptPath fields', () => {
      withIsolatedHome(({ env }) => {
        runClaude(['--bg', 'no extra fields'], { env });
        const r = runClaude(['agents', '--json'], { env });
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.length, 1);
        const entry = parsed[0];

        assert.equal(entry.id, undefined, 'id must NOT be present in real mode');
        assert.equal(entry.shortId, undefined, 'shortId must NOT be present in real mode');
        assert.equal(entry.name, undefined, 'name must NOT be present in real mode');
        assert.equal(entry.updatedAt, undefined, 'updatedAt must NOT be present in real mode');
        assert.equal(
          entry.transcriptPath,
          undefined,
          'transcriptPath must NOT be present in real mode',
        );
      });
    });

    it('the entry sessionId first 8 hex (hyphen-stripped) equals the shortId printed by --bg', () => {
      withIsolatedHome(({ env }) => {
        const start = runClaude(['--bg', 'coherence agents'], { env });
        assert.equal(start.status, 0);
        const bgMatch = start.stdout.match(/backgrounded · ([0-9a-f]{8})/);
        assert.ok(bgMatch, `expected "backgrounded · <8-hex>" in stdout: ${start.stdout}`);
        const printedShortId = bgMatch[1];

        const r = runClaude(['agents', '--json'], { env });
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.length, 1);
        const derivedShortId = parsed[0].sessionId.replace(/-/g, '').slice(0, 8);
        assert.equal(
          derivedShortId,
          printedShortId,
          `derived shortId ${derivedShortId} should equal printed shortId ${printedShortId}`,
        );
      });
    });
  });

  describe('claude --help (real-2.1.149 mode, default)', () => {
    it('does NOT contain "--bg" in help output', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['--help'], { env });
        assert.equal(r.status, 0);
        assert.ok(
          !r.stdout.includes('--bg'),
          `--help must not list --bg in real mode; got:\n${r.stdout}`,
        );
      });
    });
  });

  describe('claude --help (legacy mode, helpListsBg: true)', () => {
    it('contains "--bg" in help output when helpListsBg is true', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { helpListsBg: true });
        const r = runClaude(['--help'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0);
        assert.ok(
          r.stdout.includes('--bg'),
          `expected --bg in help when helpListsBg=true; got:\n${r.stdout}`,
        );
      });
    });
  });

  describe('claude daemon status (real-2.1.149 mode, default)', () => {
    it('exits non-zero with "not a known command" when daemonAvailable is false (default)', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['daemon', 'status'], { env });
        assert.notEqual(r.status, 0, 'daemon status should exit non-zero in real mode');
        assert.match(r.stderr, /not a known command/);
      });
    });
  });

  describe('claude agents --json (legacy mode explicit opt-in)', () => {
    it('returns the legacy schema (id, shortId, name, updatedAt, transcriptPath) when agentsJsonSchema=mock', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const cfgEnv = { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg };
        runClaude(['--bg', 'legacy schema check'], { env: cfgEnv });

        const r = runClaude(['agents', '--json'], { env: cfgEnv });
        assert.equal(r.status, 0);
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.length, 1);
        const entry = parsed[0];

        assert.equal(typeof entry.id, 'string', 'id must be present in legacy mode');
        assert.equal(typeof entry.shortId, 'string', 'shortId must be present in legacy mode');
        assert.equal(typeof entry.name, 'string', 'name must be present in legacy mode');
        assert.equal(typeof entry.updatedAt, 'string', 'updatedAt must be present in legacy mode');
        assert.equal(
          typeof entry.transcriptPath,
          'string',
          'transcriptPath must be present in legacy mode',
        );
        assert.equal(
          typeof entry.startedAt,
          'string',
          'startedAt must be ISO string in legacy mode',
        );
      });
    });
  });

  // Plan 0002 T2 — new mock subcommands and config flags.

  describe('claude attach --help (plan 0002)', () => {
    it('prints usage with the documented Ctrl+Z detach text and exits 0', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['attach', '--help'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        assert.match(r.stdout, /Usage:\s+claude attach/);
        assert.match(r.stdout, /Detach with Ctrl\+Z/);
      });
    });

    it('rejects with exit 1 when attachHelpAvailable=false', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { attachHelpAvailable: false });
        const r = runClaude(['attach', '--help'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 1);
        assert.match(r.stderr, /not a known command/);
      });
    });

    it('rejects bare `attach` (no PTY emulation in T2; lands in T3)', () => {
      withIsolatedHome(({ env }) => {
        const r = runClaude(['attach', 'abc123'], { env });
        assert.equal(r.status, 1);
        assert.match(r.stderr, /not implemented|cannot attach/);
      });
    });
  });

  describe('claude --bg --help (plan 0002)', () => {
    it('prints --bg usage and exits 0 without starting a session', () => {
      withIsolatedHome(({ home, env }) => {
        const r = runClaude(['--bg', '--help'], { env });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        assert.match(r.stdout, /Usage:\s+claude --bg/);
        // Ensure no session was actually created.
        const statePath = `${home}/state.json`;
        if (existsSync(statePath)) {
          const state = JSON.parse(readFileSync(statePath, 'utf8'));
          assert.equal(state.sessions.length, 0, 'claude --bg --help must not create a session');
        }
      });
    });

    it('rejects with exit 1 when bgNoPromptAvailable=false', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = writeConfig(home, { bgNoPromptAvailable: false });
        const r = runClaude(['--bg', '--help'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 1);
        assert.match(r.stderr, /no-prompt invocation rejected/);
      });
    });
  });

  describe('ensureHome creates the sidecar jobs directory (plan 0002)', () => {
    it('claude --bg creates <HOME>/jobs/ alongside projects/ and logs/', () => {
      withIsolatedHome(({ home, env }) => {
        const cfg = legacyConfig(home);
        const r = runClaude(['--bg', 'hi'], {
          env: { ...env, CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg },
        });
        assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
        assert.ok(existsSync(`${home}/jobs`), '<HOME>/jobs must exist after --bg');
        assert.ok(existsSync(`${home}/projects`), '<HOME>/projects must exist after --bg');
        assert.ok(existsSync(`${home}/logs`), '<HOME>/logs must exist after --bg');
      });
    });
  });
});
