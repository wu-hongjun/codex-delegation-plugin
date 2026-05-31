// Tests for the runtime doctor. Imports the compiled output from dist/. Each test gets
// its own isolated CC_PLUGIN_CODEX_HOME and CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME so probes
// never touch real state. PATH is shimmed to put tools/mock-codex and tools/mock-claude
// in front so spawn() resolves to the mocks.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getDoctorPath,
  probeClaudeAgentsJson,
  probeClaudeAuth,
  probeClaudeBgFlag,
  probeClaudeBinary,
  probeClaudeDaemon,
  probeClaudeLogs,
  probeClaudeVersion,
  probeCodexPluginTrust,
  probeCodexVersion,
  probeCompanionDirWritable,
  probeNodeVersion,
  probeTranscriptPath,
  runDoctor,
} from '../dist/index.js';

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const MOCK_CLAUDE_DIR = join(REPO_ROOT, 'tools', 'mock-claude');
const MOCK_CODEX_DIR = join(REPO_ROOT, 'tools', 'mock-codex');

const MOCK_PATH = `${MOCK_CODEX_DIR}${delimiter}${MOCK_CLAUDE_DIR}`;

let TMP_HOME;
let MOCK_HOME;
const PREV = {
  COMPANION_HOME: process.env.CC_PLUGIN_CODEX_HOME,
  MOCK_CLAUDE_HOME: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME,
  MOCK_CLAUDE_CONFIG: process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG,
  MOCK_CODEX_CONFIG: process.env.CC_PLUGIN_CODEX_MOCK_CODEX_CONFIG,
  MOCK_CODEX_TOML: process.env.CC_PLUGIN_CODEX_MOCK_CODEX_TOML,
};

function withMocksOnPath(extraEnv = {}) {
  return {
    ...process.env,
    ...extraEnv,
    PATH: `${MOCK_PATH}${delimiter}${process.env.PATH ?? ''}`,
  };
}

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), 'doctor-companion-'));
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'doctor-mock-claude-'));
  process.env.CC_PLUGIN_CODEX_HOME = TMP_HOME;
  process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME = MOCK_HOME;
  delete process.env.CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG;
  delete process.env.CC_PLUGIN_CODEX_MOCK_CODEX_CONFIG;
  delete process.env.CC_PLUGIN_CODEX_MOCK_CODEX_TOML;
});

afterEach(() => {
  for (const [k, v] of Object.entries(PREV)) {
    const envKey = {
      COMPANION_HOME: 'CC_PLUGIN_CODEX_HOME',
      MOCK_CLAUDE_HOME: 'CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME',
      MOCK_CLAUDE_CONFIG: 'CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG',
      MOCK_CODEX_CONFIG: 'CC_PLUGIN_CODEX_MOCK_CODEX_CONFIG',
      MOCK_CODEX_TOML: 'CC_PLUGIN_CODEX_MOCK_CODEX_TOML',
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

describe('probeNodeVersion', () => {
  it('returns ok on current Node 20+', async () => {
    const r = await probeNodeVersion();
    assert.equal(r.name, 'node-version');
    assert.equal(r.status, 'ok');
    assert.match(r.detail, /Node /);
  });
});

describe('probeCodexVersion', () => {
  it('ok against the mock codex binary', async () => {
    const r = await probeCodexVersion({ env: withMocksOnPath() });
    assert.equal(r.name, 'codex-version');
    assert.equal(r.status, 'ok');
    assert.match(r.detail, /codex-cli/);
  });

  it('fail when versionFails fixture is set', async () => {
    const cfg = writeJsonTo(TMP_HOME, 'codex-config.json', { versionFails: true });
    const r = await probeCodexVersion({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CODEX_CONFIG: cfg }),
    });
    assert.equal(r.status, 'fail');
  });

  it('fail when codex is not on PATH', async () => {
    const r = await probeCodexVersion({ env: { ...process.env, PATH: '/nonexistent-bin' } });
    assert.equal(r.status, 'fail');
  });
});

describe('probeClaudeBinary / probeClaudeVersion', () => {
  it('both ok against the mock claude', async () => {
    const env = withMocksOnPath();
    const bin = await probeClaudeBinary({ env });
    const ver = await probeClaudeVersion({ env });
    assert.equal(bin.status, 'ok');
    assert.equal(ver.status, 'ok');
    assert.match(ver.detail, /Claude Code/);
  });

  it('fail when claude not on PATH', async () => {
    const env = { ...process.env, PATH: '/nonexistent-bin' };
    const bin = await probeClaudeBinary({ env });
    const ver = await probeClaudeVersion({ env });
    assert.equal(bin.status, 'fail');
    assert.equal(ver.status, 'fail');
  });
});

describe('probeClaudeAuth', () => {
  it('ok by default', async () => {
    const r = await probeClaudeAuth({ env: withMocksOnPath() });
    assert.equal(r.status, 'ok');
  });

  it('fail when authStatus = unauthenticated', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'claude-config.json', { authStatus: 'unauthenticated' });
    const r = await probeClaudeAuth({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(r.status, 'fail');
  });
});

describe('probeClaudeBgFlag', () => {
  it('warn when claude --help does NOT mention --bg (real-2.1.149 default)', async () => {
    // Real mode default: helpListsBg=false → --bg absent from help → probe returns warn.
    const r = await probeClaudeBgFlag({ env: withMocksOnPath() });
    assert.equal(r.status, 'warn');
  });

  it('ok when claude --help mentions --bg (legacy helpListsBg:true)', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'claude-config.json', { helpListsBg: true });
    const r = await probeClaudeBgFlag({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(r.status, 'ok');
  });
});

describe('probeClaudeAgentsJson', () => {
  it('ok on empty parseable JSON array', async () => {
    const r = await probeClaudeAgentsJson({ env: withMocksOnPath() });
    assert.equal(r.status, 'ok');
    assert.equal(r.evidence.sessionCount, 0);
  });

  it('fail when agents JSON is malformed', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', { agentsJsonMalformed: true });
    const r = await probeClaudeAgentsJson({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(r.status, 'fail');
    assert.match(r.detail, /malformed/);
  });
});

describe('probeClaudeLogs', () => {
  it('ok when claude logs --help works', async () => {
    const r = await probeClaudeLogs({ env: withMocksOnPath() });
    assert.equal(r.status, 'ok');
  });
});

describe('probeClaudeDaemon', () => {
  it('warn by default (real-2.1.149 mode: daemon subcommand absent → non-zero exit)', async () => {
    // Real mode default: daemonAvailable=false → daemon exits non-zero → probe returns warn.
    const r = await probeClaudeDaemon({ env: withMocksOnPath() });
    assert.equal(r.status, 'warn');
  });

  it('ok when daemonAvailable=true and daemonStatus=running (legacy mode)', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', {
      daemonAvailable: true,
      daemonStatus: 'running',
    });
    const r = await probeClaudeDaemon({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(r.status, 'ok');
  });

  it('warn when daemonAvailable=true but daemonStatus=stopped (non-zero exit → warn)', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', {
      daemonAvailable: true,
      daemonStatus: 'stopped',
    });
    const r = await probeClaudeDaemon({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(r.status, 'warn');
  });
});

describe('probeTranscriptPath', () => {
  it('warn when transcripts dir is missing', async () => {
    const r = await probeTranscriptPath({ env: withMocksOnPath() });
    assert.equal(r.status, 'warn');
  });

  it('ok when mock projects dir exists', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const r = await probeTranscriptPath({ env: withMocksOnPath() });
    assert.equal(r.status, 'ok');
    assert.match(r.detail, /projects$/);
  });
});

describe('probeCodexPluginTrust', () => {
  it('warn when codex config missing', async () => {
    const r = await probeCodexPluginTrust({
      env: { ...process.env, CC_PLUGIN_CODEX_MOCK_CODEX_TOML: join(TMP_HOME, 'nope.toml') },
    });
    assert.equal(r.status, 'warn');
    assert.match(r.detail, /not found/);
  });

  it('ok when codex config mentions the plugin and trust', async () => {
    const tomlPath = join(TMP_HOME, 'config.toml');
    writeFileSync(
      tomlPath,
      '[plugins."claude-companion"]\nenabled = true\ntrusted = true\n',
      'utf8',
    );
    const r = await probeCodexPluginTrust({
      env: { ...process.env, CC_PLUGIN_CODEX_MOCK_CODEX_TOML: tomlPath },
    });
    assert.equal(r.status, 'ok');
  });
});

describe('probeCompanionDirWritable', () => {
  it('ok in an isolated temp home', async () => {
    const r = await probeCompanionDirWritable();
    assert.equal(r.status, 'ok');
    assert.equal(r.detail, TMP_HOME);
  });
});

describe('runDoctor', () => {
  it('returns ok against fully healthy mocks (legacy mode with all features enabled)', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const tomlPath = join(TMP_HOME, 'config.toml');
    writeFileSync(
      tomlPath,
      '[plugins."claude-companion"]\nenabled = true\ntrusted = true\n',
      'utf8',
    );
    // Use legacy mode so --help lists --bg and daemon subcommand is available.
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', {
      helpListsBg: true,
      daemonAvailable: true,
      daemonStatus: 'running',
    });
    const report = await runDoctor({
      env: withMocksOnPath({
        CC_PLUGIN_CODEX_MOCK_CODEX_TOML: tomlPath,
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg,
      }),
    });
    assert.equal(report.status, 'ok', JSON.stringify(report, null, 2));
    assert.equal(report.probes.length, 12);
    assert.ok(report.probes.every((p) => p.status !== 'fail'));
  });

  it('returns warn (not fail) against real-2.1.149 defaults (bg-flag warn, daemon warn)', async () => {
    mkdirSync(join(MOCK_HOME, 'projects'), { recursive: true });
    const tomlPath = join(TMP_HOME, 'config.toml');
    writeFileSync(
      tomlPath,
      '[plugins."claude-companion"]\nenabled = true\ntrusted = true\n',
      'utf8',
    );
    // Real mode defaults: helpListsBg=false, daemonAvailable=false → both probes warn.
    const report = await runDoctor({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CODEX_TOML: tomlPath }),
    });
    assert.equal(report.status, 'warn', JSON.stringify(report, null, 2));
    assert.ok(
      report.probes.every((p) => p.status !== 'fail'),
      'no probe should fail in real mode',
    );
    const bgProbe = report.probes.find((p) => p.name === 'claude-bg-flag');
    const daemonProbe = report.probes.find((p) => p.name === 'claude-daemon');
    assert.equal(bgProbe.status, 'warn');
    assert.equal(daemonProbe.status, 'warn');
  });

  it('writes doctor.json by default', async () => {
    await runDoctor({ env: withMocksOnPath() });
    assert.ok(existsSync(getDoctorPath()), 'doctor.json should exist');
    const snap = JSON.parse(readFileSync(getDoctorPath(), 'utf8'));
    assert.equal(typeof snap.status, 'string');
    assert.ok(Array.isArray(snap.probes));
  });

  it('does NOT write doctor.json when writeSnapshot=false', async () => {
    await runDoctor({ env: withMocksOnPath(), writeSnapshot: false });
    assert.ok(!existsSync(getDoctorPath()), 'doctor.json should not be written');
  });

  it('aggregates fail when claude-auth fails', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', { authStatus: 'unauthenticated' });
    const report = await runDoctor({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(report.status, 'fail');
    assert.ok(report.probes.find((p) => p.name === 'claude-auth' && p.status === 'fail'));
  });

  it('aggregates fail when agents JSON is malformed', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'cfg.json', { agentsJsonMalformed: true });
    const report = await runDoctor({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
    });
    assert.equal(report.status, 'fail');
  });

  it('aggregates warn (not fail) when daemon subcommand is unavailable (real mode default)', async () => {
    // Real mode: daemonAvailable=false → daemon exits non-zero → probe warns, not fails.
    const report = await runDoctor({ env: withMocksOnPath() });
    const daemonProbe = report.probes.find((p) => p.name === 'claude-daemon');
    assert.equal(daemonProbe.status, 'warn');
    // The aggregate should be warn, not fail (daemon warn does not escalate to fail).
    assert.notEqual(report.status, 'fail', 'daemon warn alone must not make aggregate fail');
  });

  it('aggregates warn — not fail — when only transcripts/plugin-trust/bg-flag/daemon warn', async () => {
    // Point the plugin-trust probe at a non-existent TOML so it always warns regardless of
    // whether a real ~/.codex/config.toml happens to exist on this machine.
    const report = await runDoctor({
      env: withMocksOnPath({
        CC_PLUGIN_CODEX_MOCK_CODEX_TOML: join(TMP_HOME, 'nonexistent.toml'),
      }),
    });
    // No projects dir, missing TOML, real mode defaults (bg-flag warn, daemon warn).
    const transcript = report.probes.find((p) => p.name === 'transcript-path');
    const trust = report.probes.find((p) => p.name === 'codex-plugin-trust');
    const bgFlag = report.probes.find((p) => p.name === 'claude-bg-flag');
    const daemon = report.probes.find((p) => p.name === 'claude-daemon');
    assert.equal(transcript.status, 'warn');
    assert.equal(trust.status, 'warn');
    assert.equal(bgFlag.status, 'warn');
    assert.equal(daemon.status, 'warn');
    assert.equal(report.status, 'warn');
  });

  it('timeout maps a slow probe to fail, not a hung test', async () => {
    const cfg = writeJsonTo(MOCK_HOME, 'slow.json', { sleepMs: 5000 });
    const r = await probeClaudeAgentsJson({
      env: withMocksOnPath({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfg }),
      timeoutMs: 50,
    });
    assert.equal(r.status, 'fail');
    assert.match(r.detail, /timed out/);
  });

  it('aggregates fail when codex is missing entirely', async () => {
    // PATH does not include MOCK_CODEX_DIR — mock-claude is still present so the auth/
    // agents/etc probes are happy.
    const env = {
      ...process.env,
      PATH: `${MOCK_CLAUDE_DIR}${delimiter}/usr/bin:/bin`,
    };
    const report = await runDoctor({ env });
    assert.equal(report.status, 'fail');
    const codex = report.probes.find((p) => p.name === 'codex-version');
    assert.equal(codex.status, 'fail');
  });
});
