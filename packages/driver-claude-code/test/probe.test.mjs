// Tests for ClaudeBackgroundDriver.probe() — Claude-only health, independent of Codex
// or whole-plugin doctor state.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DriverNotImplementedError } from '@cc-plugin-codex/runtime';
import { ClaudeBackgroundDriver, probeClaudeBackgroundDriver } from '../dist/index.js';

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const MOCK_CLAUDE_DIR = join(REPO_ROOT, 'tools', 'mock-claude');
const MOCK_CODEX_DIR = join(REPO_ROOT, 'tools', 'mock-codex');

let TMP_HOME;
let MOCK_HOME;
const PREV = {
  COMPANION_HOME: process.env.CC_PLUGIN_CODEX_HOME,
  MOCK_CLAUDE_HOME: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME,
  MOCK_CLAUDE_CONFIG: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG,
};

function pathWith(...dirs) {
  return `${dirs.join(delimiter)}${delimiter}${process.env.PATH ?? ''}`;
}

function envWithBothMocks(extra = {}) {
  return {
    ...process.env,
    ...extra,
    PATH: pathWith(MOCK_CODEX_DIR, MOCK_CLAUDE_DIR),
  };
}

function envWithClaudeOnly(extra = {}) {
  return {
    ...process.env,
    ...extra,
    PATH: pathWith(MOCK_CLAUDE_DIR),
  };
}

function envWithNothing(extra = {}) {
  return {
    ...process.env,
    ...extra,
    PATH: '/nonexistent-bin',
  };
}

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), 'driver-companion-'));
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'driver-mock-claude-'));
  process.env.CC_PLUGIN_CODEX_HOME = TMP_HOME;
  process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME = MOCK_HOME;
  delete process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG;
});

afterEach(() => {
  for (const [k, v] of Object.entries(PREV)) {
    const envKey = {
      COMPANION_HOME: 'CC_PLUGIN_CODEX_HOME',
      MOCK_CLAUDE_HOME: 'CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME',
      MOCK_CLAUDE_CONFIG: 'CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG',
    }[k];
    if (v === undefined) delete process.env[envKey];
    else process.env[envKey] = v;
  }
  rmSync(TMP_HOME, { recursive: true, force: true });
  rmSync(MOCK_HOME, { recursive: true, force: true });
});

function writeJsonTo(dir, name, body) {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(body, null, 2));
  return p;
}

describe('ClaudeBackgroundDriver.probe — healthy (real-2.1.149 defaults)', () => {
  it('returns backgroundSessions:true even when bg-flag is warn (agents-json ok compensates)', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const driver = new ClaudeBackgroundDriver({ env: envWithBothMocks() });
    const caps = await driver.probe();
    assert.equal(caps.driverName, 'claude-background');
    assert.equal(typeof caps.driverVersion, 'string');
    assert.ok(caps.claudeVersion?.includes('Claude Code'), `claudeVersion=${caps.claudeVersion}`);
    // backgroundSessions is true when bg-flag=warn AND agents-json=ok (real-2.1.149 path).
    assert.equal(caps.backgroundSessions, true);
    assert.equal(caps.agentsJson, true);
    assert.equal(caps.logsCommand, true);
    assert.equal(caps.transcriptPath, true);
    assert.equal(caps.attach, false);
    assert.equal(caps.structuredStream, 'transcript');
    assert.equal(caps.toolEvents, 'transcript');
    assert.equal(caps.permissions, 'human-attach');
    // In real mode: bg-flag=warn, daemon=warn → health is 'warn', not 'ok'.
    assert.equal(caps.health.status, 'warn');
    assert.ok(Array.isArray(caps.health.probes));
    // Probe count: claude probes only (no codex, no companion-dir, no plugin-trust).
    assert.equal(caps.health.probes.length, 8);
    // Confirm bg-flag is warn (not fail) and agents-json is ok.
    const bgFlag = caps.health.probes.find((p) => p.name === 'claude-bg-flag');
    const agentsJson = caps.health.probes.find((p) => p.name === 'claude-agents-json');
    assert.equal(bgFlag?.status, 'warn');
    assert.equal(agentsJson?.status, 'ok');
  });

  it('returns ok health against fully healthy legacy mocks (helpListsBg:true, daemonAvailable:true)', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', {
      helpListsBg: true,
      daemonAvailable: true,
      daemonStatus: 'running',
    });
    const driver = new ClaudeBackgroundDriver({
      env: envWithBothMocks({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    const caps = await driver.probe();
    assert.equal(caps.backgroundSessions, true);
    assert.equal(caps.health.status, 'ok');
  });

  it('exposes the standalone probe function with the same shape', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const caps = await probeClaudeBackgroundDriver({ env: envWithBothMocks() });
    assert.equal(caps.driverName, 'claude-background');
    // Real mode: bg-flag+daemon warn → health is warn.
    assert.ok(
      caps.health.status === 'ok' || caps.health.status === 'warn',
      `expected ok or warn, got ${caps.health.status}`,
    );
    assert.equal(caps.backgroundSessions, true);
  });
});

describe('ClaudeBackgroundDriver.probe — degraded', () => {
  it('missing transcript dir → health warn, structuredStream/toolEvents none', async () => {
    // Do NOT mkdir projects.
    const driver = new ClaudeBackgroundDriver({ env: envWithBothMocks() });
    const caps = await driver.probe();
    assert.equal(caps.transcriptPath, false);
    assert.equal(caps.structuredStream, 'none');
    assert.equal(caps.toolEvents, 'none');
    assert.equal(caps.health.status, 'warn');
    // No throw — degraded is fine.
  });

  it('unauthenticated claude → health fail, permissions none', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', { authStatus: 'unauthenticated' });
    const driver = new ClaudeBackgroundDriver({
      env: envWithBothMocks({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    const caps = await driver.probe();
    assert.equal(caps.permissions, 'none');
    assert.equal(caps.health.status, 'fail');
  });

  it('malformed agents JSON → agentsJson false, health fail', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', { agentsJsonMalformed: true });
    const driver = new ClaudeBackgroundDriver({
      env: envWithBothMocks({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    const caps = await driver.probe();
    assert.equal(caps.agentsJson, false);
    assert.equal(caps.health.status, 'fail');
  });

  it('missing claude on PATH → backgroundSessions false, claudeVersion null', async () => {
    const driver = new ClaudeBackgroundDriver({ env: envWithNothing() });
    const caps = await driver.probe();
    assert.equal(caps.backgroundSessions, false);
    assert.equal(caps.agentsJson, false);
    assert.equal(caps.logsCommand, false);
    assert.equal(caps.claudeVersion, null);
    assert.equal(caps.health.status, 'fail');
  });
});

describe('ClaudeBackgroundDriver.probe — independence from Codex', () => {
  it('missing codex on PATH does NOT affect driver probe health (no fail probes)', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const driver = new ClaudeBackgroundDriver({ env: envWithClaudeOnly() });
    const caps = await driver.probe();
    // The Claude probes still all pass (no fail). In real-2.1.149 mode bg-flag and daemon
    // return warn, so health is 'warn' — but it must NOT be 'fail'.
    assert.notEqual(
      caps.health.status,
      'fail',
      `health must not fail when only codex is missing; got: ${JSON.stringify(caps.health, null, 2)}`,
    );
    assert.ok(
      caps.health.probes.every((p) => p.status !== 'fail'),
      'no individual probe should fail when only codex is absent',
    );
    // No codex-* probe should appear in the driver health report.
    assert.ok(
      caps.health.probes.every((p) => !p.name.startsWith('codex-')),
      'driver probe must not include codex probes',
    );
    // Also no companion-dir / plugin-trust.
    assert.ok(
      caps.health.probes.every(
        (p) => p.name !== 'companion-dir-writable' && p.name !== 'codex-plugin-trust',
      ),
      'driver probe must not include companion/plugin-trust probes',
    );
  });
});

describe('ClaudeBackgroundDriver lifecycle stubs (deferred)', () => {
  const driver = new ClaudeBackgroundDriver();
  const fakeSession = {
    driverName: 'claude-background',
    shortId: 'abc',
    sessionName: 'codex:test:abc',
    cwd: '/x',
    startedAt: new Date().toISOString(),
  };

  // startSession (T6), status (T7), and stop (T10) are now implemented — their own
  // behavior is covered by start-session.test.mjs, status.test.mjs, and stop.test.mjs.
  // The remaining lifecycle method (watch) is still stubbed and continues to be tested here.

  it('watch throws DriverNotImplementedError synchronously', () => {
    assert.throws(() => driver.watch(fakeSession), DriverNotImplementedError);
  });

  it('dispose is a no-op', async () => {
    await driver.dispose();
    // No assertion needed beyond "did not throw".
  });

  it('the error carries the plan reference', () => {
    try {
      driver.watch(fakeSession);
      assert.fail('watch should have thrown');
    } catch (err) {
      assert.ok(err instanceof DriverNotImplementedError);
      assert.equal(err.methodName, 'watch');
      assert.match(err.planReference, /plan 0001 T8\/T9/);
    }
  });
});
