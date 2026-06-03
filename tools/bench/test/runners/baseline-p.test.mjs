/**
 * Self-tests for tools/bench/lib/runners/baseline-p.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * Uses DI (opts.spawn) so no real Claude invocations are made.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runBaselineP } from '../../lib/runners/baseline-p.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUNNER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../lib/runners/baseline-p.mjs',
);

/** Create a temp directory to act as fixtureRoot. Returns { root, cleanup }. */
function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'bench-baseline-p-test-fixture-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const TASK = { id: 'summarize-todos', prompt: 'Inspect this repo and summarize TODOs.' };

/**
 * Build a successful spawnSync-like result.
 * @param {string} stdout
 */
function successSpawn(stdout = 'Some assistant output about TODOs.') {
  return (_cmd, _args, _opts) => ({
    status: 0,
    stdout,
    stderr: '',
    signal: null,
    error: null,
  });
}

/** Build a non-zero-exit spawnSync-like result. */
function failSpawn(stderr = 'error: claude binary not found', status = 1) {
  return (_cmd, _args, _opts) => ({
    status,
    stdout: '',
    stderr,
    signal: null,
    error: null,
  });
}

/** Build a SIGTERM (timeout) spawnSync-like result. */
function sigtermSpawn() {
  return (_cmd, _args, _opts) => ({
    status: null,
    stdout: '',
    stderr: '',
    signal: 'SIGTERM',
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runBaselineP() — happy path', () => {
  it('returns a RunResult with error=null on success', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      assert.equal(result.error, null, `expected no error, got: ${result.error}`);
    } finally {
      cleanup();
    }
  });

  it('result has flow="baseline-p"', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      assert.equal(result.flow, 'baseline-p');
    } finally {
      cleanup();
    }
  });

  it('wallClockMs is a positive number', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      assert.ok(typeof result.wallClockMs === 'number', 'wallClockMs should be a number');
      assert.ok(result.wallClockMs >= 0, 'wallClockMs should be >= 0');
    } finally {
      cleanup();
    }
  });

  it('turnsWallClockMs has exactly 1 element', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      assert.equal(result.turnsWallClockMs.length, 1);
    } finally {
      cleanup();
    }
  });

  it('wallClockMs reflects spawn duration', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      // turnsWallClockMs[0] should equal wallClockMs
      assert.equal(result.turnsWallClockMs[0], result.wallClockMs);
    } finally {
      cleanup();
    }
  });

  it('stdout is captured — caveats include excerpt', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(
        TASK,
        root,
        {},
        { spawn: successSpawn('Hello from claude -p') },
      );
      const excerptCaveat = result.caveats.find((c) => c.startsWith('stdout excerpt'));
      assert.ok(excerptCaveat !== undefined, 'expected stdout excerpt caveat');
      assert.ok(excerptCaveat.includes('Hello from claude -p'), 'excerpt should include stdout');
    } finally {
      cleanup();
    }
  });
});

describe('runBaselineP() — failure paths', () => {
  it('returns RunResult with error populated when spawn exits non-zero', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: failSpawn() });
      assert.ok(result.error !== null, 'expected error to be set');
    } finally {
      cleanup();
    }
  });

  it('error message reflects stderr content on failure', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(
        TASK,
        root,
        {},
        { spawn: failSpawn('claude: command not found') },
      );
      assert.ok(
        result.error !== null && result.error.includes('claude: command not found'),
        `unexpected error: ${result.error}`,
      );
    } finally {
      cleanup();
    }
  });

  it('error="timeout" when spawn signals SIGTERM', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: sigtermSpawn() });
      assert.equal(result.error, 'timeout');
    } finally {
      cleanup();
    }
  });
});

describe('runBaselineP() — transcript handling', () => {
  it('tokenCounts is null when transcript dir does not exist', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      assert.equal(result.tokenCounts, null);
    } finally {
      cleanup();
    }
  });

  it('adds caveat when transcript dir is missing', async () => {
    const { root, cleanup } = makeFixtureRoot();
    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      const hasCaveat = result.caveats.some((c) => c.includes('transcript'));
      assert.ok(hasCaveat, 'expected at least one transcript-related caveat');
    } finally {
      cleanup();
    }
  });

  it('tokenCounts populated when transcript fixture exists', async () => {
    const { root, cleanup } = makeFixtureRoot();

    // Build the sanitized transcript dir path that the runner will look for.
    const sanitized = root.replace(/\//g, '-');
    const sanitizedCwd = sanitized.startsWith('-') ? sanitized : `-${sanitized}`;
    const { homedir } = await import('node:os');
    const transcriptDir = join(homedir(), '.claude', 'projects', sanitizedCwd);
    mkdirSync(transcriptDir, { recursive: true });

    // Write a minimal JSONL transcript with usage data.
    const transcriptPath = join(transcriptDir, 'session-test.jsonl');
    const usageLine = JSON.stringify({
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          service_tier: 'standard',
        },
      },
    });
    writeFileSync(transcriptPath, usageLine + '\n', 'utf8');

    try {
      const result = await runBaselineP(TASK, root, {}, { spawn: successSpawn() });
      assert.ok(result.tokenCounts !== null, 'expected tokenCounts to be populated');
      assert.equal(result.tokenCounts.inputTokens, 100);
      assert.equal(result.tokenCounts.outputTokens, 50);
      assert.equal(result.tokenCounts.messageCount, 1);
    } finally {
      cleanup();
      rmSync(transcriptDir, { recursive: true, force: true });
    }
  });
});

describe('runBaselineP() — architectural invariants', () => {
  it('runner invokes "claude -p" (not node <plugin-script>)', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedCmd = null;
    let capturedArgs = null;
    const spySpawn = (cmd, args, _opts) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return { status: 0, stdout: 'ok', stderr: '', signal: null, error: null };
    };
    try {
      await runBaselineP(TASK, root, {}, { spawn: spySpawn });
      assert.equal(capturedCmd, 'claude', 'expected cmd to be "claude"');
      assert.ok(
        Array.isArray(capturedArgs) && capturedArgs[0] === '-p',
        `expected first arg to be "-p", got: ${JSON.stringify(capturedArgs)}`,
      );
    } finally {
      cleanup();
    }
  });

  it('runner does NOT invoke node <plugin-root>/scripts/claude-companion.mjs', async () => {
    const { root, cleanup } = makeFixtureRoot();
    let capturedCmd = null;
    let capturedArgs = null;
    const spySpawn = (cmd, args, _opts) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return { status: 0, stdout: 'ok', stderr: '', signal: null, error: null };
    };
    try {
      await runBaselineP(TASK, root, {}, { spawn: spySpawn });
      // Should never call "node" with claude-companion.mjs
      const isCompanionSpawn =
        capturedCmd === 'node' &&
        Array.isArray(capturedArgs) &&
        capturedArgs.some((a) => typeof a === 'string' && a.includes('claude-companion.mjs'));
      assert.ok(!isCompanionSpawn, 'runner must not invoke claude-companion.mjs');
    } finally {
      cleanup();
    }
  });

  it('source file contains required architectural comment', () => {
    const src = readFileSync(RUNNER_PATH, 'utf8');
    assert.ok(
      src.includes('This runner exercises `claude -p` which the plugin explicitly does NOT use.'),
      'runner source must contain the required architectural comment',
    );
    assert.ok(
      src.includes('billing/latency comparison anchor'),
      'runner source must mention billing/latency comparison anchor',
    );
  });

  it('runner source does not import from packages/plugin-codex/scripts/', () => {
    const src = readFileSync(RUNNER_PATH, 'utf8');
    const hasPackagesImport = /from\s+['"][^'"]*packages\/plugin-codex\/scripts/.test(src);
    assert.ok(
      !hasPackagesImport,
      'runner must not import from packages/plugin-codex/scripts/',
    );
  });
});
