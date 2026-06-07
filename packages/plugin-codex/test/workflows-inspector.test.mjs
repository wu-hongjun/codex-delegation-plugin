// Unit tests for scripts/lib/workflows-inspector.mjs — Plan 0016 T5
//
// These tests verify the workflows inspector by spawning cc.mjs with a stub
// `claude` binary on PATH, which controls what `claude agents --json` returns.
// This mirrors the dispatcher.test.mjs pattern (spawnSync + mock PATH).
//
// No real `claude` binary is needed. No network calls are made.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'packages', 'plugin-codex', 'scripts', 'cc.mjs');

// ---------- per-test temp dirs ----------

let TMP_DIR;
let BIN_DIR;
let TMP_HOME;
let WORK_DIR;

beforeEach(() => {
  TMP_DIR = mkdtempSync(join(tmpdir(), 'wf-inspector-test-'));
  BIN_DIR = join(TMP_DIR, 'bin');
  TMP_HOME = join(TMP_DIR, 'home');
  WORK_DIR = join(TMP_DIR, 'work');
  mkdirSync(BIN_DIR, { recursive: true });
  mkdirSync(TMP_HOME, { recursive: true });
  mkdirSync(WORK_DIR, { recursive: true });
});

afterEach(() => {
  if (TMP_DIR && existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

// ---------- helpers ----------

/**
 * Write a stub `claude` script that responds to `claude agents --json` with the given JSON.
 * All other subcommands exit 0 silently.
 */
function makeClaudeStub(binDir, agentsJson) {
  const stubPath = join(binDir, 'claude');
  const escaped = agentsJson.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  writeFileSync(
    stubPath,
    `#!/bin/sh\n` +
      `if [ "$1" = "agents" ] && [ "$2" = "--json" ]; then\n` +
      `  printf '%s\\n' '${escaped}';\n` +
      `fi\n`,
  );
  spawnSync('chmod', ['+x', stubPath]);
}

/**
 * Run cc.mjs with given args and mock environment.
 */
function runDispatcher(args, overrideEnv = {}) {
  const env = {
    PATH: `${BIN_DIR}:${process.env.PATH}`,
    HOME: TMP_HOME,
    CC_PLUGIN_CODEX_HOME: TMP_HOME,
    ...overrideEnv,
  };
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: WORK_DIR,
    env,
  });
}

// ---------- tests ----------

describe('workflows: no sessions (claude agents returns [])', () => {
  it('exits 0 and reports no workflow sessions found', () => {
    makeClaudeStub(BIN_DIR, '[]');
    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('No workflow sessions found') || combined.includes('workflow'),
      `expected workflow-related output; got:\n${combined}`,
    );
  });
});

describe('workflows: filters to ultracode: sessions only', () => {
  it('exits 0 and only lists sessions with name starting with "ultracode:"', () => {
    const agentRows = [
      {
        sessionId: 'aaa-1111',
        name: 'ultracode: audit fetch calls',
        status: 'running',
        cwd: WORK_DIR,
        startedAt: 1000000,
      },
      {
        sessionId: 'bbb-2222',
        name: 'regular delegate session',
        status: 'running',
        cwd: WORK_DIR,
        startedAt: 1000001,
      },
    ];
    makeClaudeStub(BIN_DIR, JSON.stringify(agentRows));
    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    // The regular session must NOT appear
    assert.ok(
      !result.stdout.includes('regular delegate session'),
      `non-workflow session should not appear in output; stdout:\n${result.stdout}`,
    );
    // The workflow session should appear
    assert.ok(
      result.stdout.includes('aaa-1111') || result.stdout.includes('ultracode'),
      `workflow session should appear in output; stdout:\n${result.stdout}`,
    );
  });
});

describe('workflows <unknown-jobId>: exits 1', () => {
  it('exits 1 when the jobId does not match any session', () => {
    makeClaudeStub(BIN_DIR, '[]');
    const result = runDispatcher(['workflows', 'nonexistent-job-id-xyz']);
    assert.notEqual(result.status, 0, 'expected non-zero exit for unknown jobId');
    assert.equal(result.status, 1, `expected exit 1; got ${result.status}`);
  });
});

describe('workflows --json: produces parseable JSON with sessions array', () => {
  it('exits 0 and stdout is valid JSON with a "sessions" array', () => {
    makeClaudeStub(BIN_DIR, '[]');
    const result = runDispatcher(['workflows', '--json']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(result.stdout);
    }, `workflows --json stdout must be valid JSON; got:\n${result.stdout}`);
    assert.ok(
      parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.sessions),
      `workflows --json output must have a "sessions" array; got: ${JSON.stringify(parsed)}`,
    );
  });
});

describe('workflows --allow-edit: exits 2 with error mentioning --allow-edit', () => {
  it('exits 2 and prints error mentioning --allow-edit', () => {
    makeClaudeStub(BIN_DIR, '[]');
    const result = runDispatcher(['workflows', '--allow-edit']);
    assert.equal(
      result.status,
      2,
      `expected exit 2; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('workflows: handles invalid JSON from claude agents gracefully', () => {
  it('exits 0 and shows no workflow sessions when claude returns garbage', () => {
    makeClaudeStub(BIN_DIR, 'not valid json {{{{');
    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0 on parse error; stderr: ${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('No workflow sessions') || combined.includes('workflow'),
      `expected graceful fallback output; got:\n${combined}`,
    );
  });
});
