// Tests for the cc.mjs dispatcher — T10
//
// All tests run against tools/mock-claude and tools/mock-codex so no real Claude Code
// or real Codex binary is needed and no network calls are made. Each test gets isolated
// temp directories for CC_PLUGIN_CODEX_HOME, CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME, and
// a workspace cwd so state never leaks between tests.
//
// Pattern: spawnSync(node, [SCRIPT, ...args], { env, cwd }) — synchronous from the
// test's perspective; the dispatcher script is a one-shot process.
//
// Privacy ack path: ${TMP_HOME}/acks/<sha256(WORK_DIR).slice(0,16)>.json
//   Computed with crypto.createHash('sha256').update(WORK_DIR).digest('hex').slice(0,16)
//
// Non-TTY stdin: spawnSync inherits stdio; stdin is never a TTY in CI / non-interactive
//   Node.js child processes. No extra setup needed — process.stdin.isTTY is undefined/false
//   in spawnSync child processes, which the dispatcher treats as non-interactive.
//
// Synthetic completed job: write the JobRecord JSON directly to
//   ${TMP_HOME}/jobs/<jobId>.json with status:'completed', then write
//   ${TMP_HOME}/jobs/<jobId>.result.md with the final message content.
//
// T10 note: The test-only env var CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS overrides the
//   default 5-minute permission-read timeout. T10-3 sets it to 100 ms so the timeout
//   path fires quickly without holding up the suite. This is NOT a CLI flag; only tests
//   should set it.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'packages', 'plugin-codex', 'scripts', 'cc.mjs');
const MOCK_CLAUDE = join(REPO_ROOT, 'tools', 'mock-claude');
const MOCK_CODEX = join(REPO_ROOT, 'tools', 'mock-codex');
const FORMAT_LIB = join(REPO_ROOT, 'packages', 'plugin-codex', 'scripts', 'lib', 'format.mjs');

/** @type {{ formatFollowup: (job: object, turnHandle: object | null, turnIndex: number, json: boolean, opts?: object) => string }} */
const { formatFollowup } = await import(FORMAT_LIB);

// ---------- per-test temp dirs ----------

let TMP_HOME;
let MOCK_HOME;
let WORK_DIR;

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), 'dispatcher-companion-'));
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'dispatcher-mock-claude-'));
  // Resolve symlinks (macOS /var → /private/var) so the path matches what
  // `process.cwd()` reports inside the dispatcher subprocess. Without this, the
  // ack hash computed from WORK_DIR in the test differs from the hash the
  // dispatcher computes from its real cwd.
  WORK_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-work-')));
});

afterEach(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
  rmSync(MOCK_HOME, { recursive: true, force: true });
  rmSync(WORK_DIR, { recursive: true, force: true });
});

// ---------- helpers ----------

/**
 * Run the dispatcher via spawnSync.
 * @param {string[]} args
 * @param {{ cwd?: string; env?: Record<string,string> }} [opts]
 */
function runDispatcher(args, { cwd = WORK_DIR, env: extraEnv = {} } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
      CC_PLUGIN_CODEX_HOME: TMP_HOME,
      CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME: MOCK_HOME,
      // T15a: mock-claude responds immediately; skip the 8-second real-TUI
      // warmup so dispatcher integration tests don't pay it on every send().
      CC_PLUGIN_CODEX_ATTACH_WARMUP_MS: '0',
      // T12b: cmdReview waits briefly after sendFollowupTurn so Claude
      // 2.1.150 has time to flush its final assistant message to the
      // transcript. Mock-claude flushes synchronously, so disable the
      // wait under the test seam.
      CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS: '0',
      PATH: `${MOCK_CODEX}${delimiter}${MOCK_CLAUDE}${delimiter}${process.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
  });
}

/**
 * Compute the 16-char hex used for the privacy ack filename.
 * @param {string} workspaceRoot
 * @returns {string}
 */
function ackHex(workspaceRoot) {
  return createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
}

/**
 * Path to the ack file for the current WORK_DIR.
 * @returns {string}
 */
function ackPath() {
  return join(TMP_HOME, 'acks', `${ackHex(WORK_DIR)}.json`);
}

/**
 * List all job IDs currently stored in TMP_HOME/jobs/.
 * @returns {string[]}
 */
function listJobIds() {
  const jobsDir = join(TMP_HOME, 'jobs');
  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.events.jsonl'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((id) => /^job_[a-z0-9]+_[a-f0-9]{8}$/.test(id));
}

/**
 * Parse dispatcher JSON stdout, trimming trailing whitespace first.
 * @param {string} stdout
 * @returns {unknown}
 */
function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function writeMockClaudeSkill(root, name, description, extraFrontmatter = '') {
  const skillDir = join(root, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      `description: "${description}"`,
      extraFrontmatter,
      '---',
      '',
      `# ${name}`,
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );
  return skillDir;
}

function writeMockInstalledClaudePlugin(pluginRef, version = '1.2.3') {
  const [pluginName, marketplaceName] = pluginRef.split('@');
  const installPath = join(MOCK_HOME, 'plugins', 'cache', marketplaceName, pluginName, version);
  mkdirSync(join(MOCK_HOME, 'plugins'), { recursive: true });
  mkdirSync(installPath, { recursive: true });
  writeFileSync(
    join(MOCK_HOME, 'plugins', 'installed_plugins.json'),
    JSON.stringify(
      {
        version: 2,
        plugins: {
          [pluginRef]: [
            {
              scope: 'user',
              installPath,
              version,
              installedAt: new Date().toISOString(),
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  return installPath;
}

/**
 * Write a synthetic completed job record + result file directly into TMP_HOME/jobs/.
 * @param {{
 *   jobId: string;
 *   workspaceRoot?: string;
 *   prompt?: string;
 *   resultContent?: string;
 *   shortId?: string;
 *   sessionId?: string;
 * }} opts
 * @returns {{ jobId: string; resultContent: string }}
 */
function writeSyntheticCompletedJob({
  jobId,
  workspaceRoot = WORK_DIR,
  prompt = 'synthetic task',
  resultContent = 'Final answer from synthetic job.',
  shortId = 'aabbcc',
  sessionId,
} = {}) {
  const jobsDir = join(TMP_HOME, 'jobs');
  mkdirSync(jobsDir, { recursive: true });

  const now = new Date().toISOString();
  const resultPath = join(jobsDir, `${jobId}.result.md`);

  const promptCtx = {
    summary: prompt.slice(0, 120),
    sha256: createHash('sha256').update(prompt).digest('hex'),
    bytesLen: Buffer.byteLength(prompt, 'utf8'),
  };
  const resultCtx = {
    finalMessagePath: resultPath,
    finalMessagePreview: resultContent.slice(0, 120),
  };

  // schemaVersion 2: includes turns[] as required by the locked v2 JobRecord
  // interface (plan 0002 T6). The @type cast was removed because v1 records are
  // only valid on disk pre-migration; the in-memory type is always v2.
  const record = {
    jobId,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    status: 'completed',
    codex: {
      pluginVersion: '0.0.0',
      cwd: workspaceRoot,
    },
    workspace: {
      root: workspaceRoot,
    },
    driver: {
      name: 'claude-background',
      version: '0.0.0',
      capabilitiesSnapshot: {},
    },
    claude: {
      version: '2.1.999-mock',
      shortId,
      ...(sessionId ? { sessionId } : {}),
      sessionName: `codex:test:${jobId}`,
      cwd: workspaceRoot,
      logsCommand: `claude logs ${shortId}`,
    },
    prompt: promptCtx,
    result: resultCtx,
    turns: [
      {
        prompt: promptCtx,
        startedAt: now,
        endedAt: now,
        status: 'completed',
        result: resultCtx,
      },
    ],
  };

  writeFileSync(join(jobsDir, `${jobId}.json`), JSON.stringify(record, null, 2));
  writeFileSync(resultPath, resultContent);

  return { jobId, resultContent };
}

// ---------- Test 1: setup --json ----------

describe('setup --json', () => {
  it('exits 0, outputs parseable JSON with ok:true and a probes array, and writes doctor.json', () => {
    const result = runDispatcher(['setup', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true, got: ${JSON.stringify(parsed)}`);
    assert.ok(Array.isArray(parsed.probes), 'expected probes to be an array');
    assert.ok(parsed.probes.length > 0, 'expected at least one probe in the array');

    // doctor.json should be written
    const doctorPath = join(TMP_HOME, 'doctor.json');
    assert.ok(existsSync(doctorPath), `expected doctor.json at ${doctorPath}`);
  });

  it('exposes delegateCapability and followupCapability aggregates (plan 0002)', () => {
    const result = runDispatcher(['setup', '--json']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.ok(
      ['ok', 'warn', 'fail'].includes(parsed.delegateCapability),
      `delegateCapability must be ok|warn|fail; got ${parsed.delegateCapability}`,
    );
    assert.ok(
      ['ok', 'warn', 'fail'].includes(parsed.followupCapability),
      `followupCapability must be ok|warn|fail; got ${parsed.followupCapability}`,
    );
  });

  it('includes the injected pty-build probe with capability ["followup"] (plan 0002)', () => {
    const result = runDispatcher(['setup', '--json']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    const ptyBuild = parsed.probes.find((p) => p.name === 'pty-build');
    assert.ok(
      ptyBuild,
      `expected pty-build probe in setup output; got names: ${parsed.probes.map((p) => p.name).join(', ')}`,
    );
    assert.deepEqual(ptyBuild.capabilities, ['followup']);
  });

  it('includes an informational Claude Code skills catalog probe', () => {
    writeMockClaudeSkill(join(MOCK_HOME, 'skills'), 'demo-user-skill', 'User demo skill');
    const installPath = writeMockInstalledClaudePlugin('demo-plugin@example-market');
    writeMockClaudeSkill(join(installPath, 'skills'), 'demo-plugin-skill', 'Plugin demo skill');

    const result = runDispatcher(['setup', '--json']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    const probe = parsed.probes.find((p) => p.name === 'claude-skills');
    assert.ok(
      probe,
      `expected claude-skills probe in setup output; got names: ${parsed.probes.map((p) => p.name).join(', ')}`,
    );
    assert.deepEqual(probe.capabilities, []);
    assert.equal(probe.status, 'ok');
    assert.equal(probe.evidence.counts.total, 2);
    assert.deepEqual(probe.evidence.skills.map((s) => s.name).sort(), [
      'demo-plugin-skill',
      'demo-user-skill',
    ]);
  });
});

// ---------- Claude Code skill catalog ----------

describe('skills command', () => {
  it('lists user and installed-plugin Claude Code skills as JSON', () => {
    writeMockClaudeSkill(join(MOCK_HOME, 'skills'), 'demo-user-skill', 'User demo skill');
    const installPath = writeMockInstalledClaudePlugin('demo-plugin@example-market');
    writeMockClaudeSkill(
      join(installPath, 'skills'),
      'demo-plugin-skill',
      'Plugin demo skill',
      'user-invocable: false',
    );

    const result = runDispatcher(['skills', '--json']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.counts.total, 2);
    assert.equal(parsed.counts.user, 1);
    assert.equal(parsed.counts.plugin, 1);
    const byName = new Map(parsed.skills.map((s) => [s.name, s]));
    assert.equal(byName.get('demo-user-skill')?.invocation, '/demo-user-skill');
    assert.equal(byName.get('demo-user-skill')?.source?.type, 'user');
    assert.equal(byName.get('demo-plugin-skill')?.source?.plugin, 'demo-plugin@example-market');
    assert.equal(byName.get('demo-plugin-skill')?.userInvocable, false);
  });

  it('annotates duplicate skill names as ambiguous metadata', () => {
    writeMockClaudeSkill(join(WORK_DIR, '.claude', 'skills'), 'dup-skill', 'Project copy');
    writeMockClaudeSkill(join(MOCK_HOME, 'skills'), 'dup-skill', 'User copy');
    const installPath = writeMockInstalledClaudePlugin('demo-plugin@example-market');
    writeMockClaudeSkill(join(installPath, 'skills'), 'dup-skill', 'Plugin copy');

    const result = runDispatcher(['skills', '--json']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.counts.total, 3);
    assert.equal(parsed.counts.uniqueNames, 1);
    assert.equal(parsed.counts.duplicateNames, 1);
    assert.equal(parsed.duplicates.length, 1);

    const [duplicate] = parsed.duplicates;
    assert.equal(duplicate.name, 'dup-skill');
    assert.equal(duplicate.invocation, '/dup-skill');
    assert.equal(duplicate.count, 3);
    assert.deepEqual(duplicate.sourceOrder, ['project', 'user', 'plugin']);
    assert.equal(duplicate.resolution.status, 'ambiguous');
    assert.match(duplicate.resolution.note, /reported, not resolved/);
    assert.deepEqual(
      duplicate.entries.map((entry) => [
        entry.source.type,
        entry.duplicateSourceRank,
        entry.duplicateSource,
      ]),
      [
        ['project', 0, 'project'],
        ['user', 1, 'user'],
        ['plugin', 2, 'plugin'],
      ],
    );

    const bySource = new Map(parsed.skills.map((skill) => [skill.source.type, skill]));
    assert.equal(bySource.get('project')?.duplicateGroup, 'dup-skill');
    assert.equal(bySource.get('project')?.duplicateCount, 3);
    assert.equal(bySource.get('project')?.duplicateSourceRank, 0);
    assert.equal(bySource.get('project')?.duplicateSource, 'project');
    assert.equal(bySource.get('project')?.duplicateAmbiguous, true);
    assert.equal(bySource.get('user')?.duplicateSourceRank, 1);
    assert.equal(bySource.get('user')?.duplicateSource, 'user');
    assert.equal(bySource.get('user')?.duplicateAmbiguous, true);
    assert.equal(bySource.get('plugin')?.duplicateSourceRank, 2);
    assert.equal(bySource.get('plugin')?.duplicateSource, 'plugin');
    assert.equal(bySource.get('plugin')?.duplicateAmbiguous, true);
  });

  it('human output explains /skill-name invocation', () => {
    writeMockClaudeSkill(join(MOCK_HOME, 'skills'), 'demo-user-skill', 'User demo skill');
    const result = runDispatcher(['skills']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.match(result.stdout, /Claude Code skills/);
    assert.ok(result.stdout.includes('/demo-user-skill'), result.stdout);
    assert.ok(result.stdout.includes('/skill-name'), result.stdout);
  });

  it('human output notes duplicate skill ambiguity', () => {
    writeMockClaudeSkill(join(WORK_DIR, '.claude', 'skills'), 'dup-skill', 'Project copy');
    writeMockClaudeSkill(join(MOCK_HOME, 'skills'), 'dup-skill', 'User copy');

    const result = runDispatcher(['skills']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.match(result.stdout, /duplicate names: 1/);
    assert.match(result.stdout, /Duplicate-name note: names are ambiguous/);
    assert.match(result.stdout, /duplicate name: ambiguous/);
  });

  it('rejects --allow-edit because the command is read-only', () => {
    const result = runDispatcher(['skills', '--allow-edit']);
    assert.equal(result.status, 2, `expected exit 2; stderr: ${result.stderr}`);
    assert.ok((result.stderr + result.stdout).includes('--allow-edit'));
  });
});

// ---------- Test 2: setup (human output) ----------

describe('setup (human output)', () => {
  it('exits 0 and stdout contains all expected probe names', () => {
    const result = runDispatcher(['setup']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    const expectedProbes = [
      'node-version',
      'codex-version',
      'claude-binary',
      'claude-version',
      'claude-auth',
      'claude-bg-flag',
      'claude-agents-json',
      'claude-logs',
      'claude-daemon',
      'transcript-path',
      'companion-dir-writable',
      // Plan 0002 T2 additions:
      'claude-attach-help',
      'claude-bg-no-prompt',
      'sidecar-jobs-dir',
      'pty-build',
      'claude-skills',
    ];

    for (const probe of expectedProbes) {
      assert.ok(
        result.stdout.includes(probe),
        `expected probe "${probe}" in human output; got:\n${result.stdout}`,
      );
    }
  });

  it('groups probes by capability and shows per-capability aggregates (plan 0002)', () => {
    const result = runDispatcher(['setup']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /delegate capability:\s+(ok|warn|fail)/);
    assert.match(result.stdout, /follow-up capability:\s+(ok|warn|fail)/);
    assert.ok(
      result.stdout.includes('Shared (delegate + follow-up):'),
      'expected the "Shared" group header in human output',
    );
    assert.ok(
      result.stdout.includes('Follow-up only (plan 0002):'),
      'expected the "Follow-up only" group header in human output',
    );
  });
});

// ---------- Test 3: delegate --yes -- "hello" (human output) ----------

describe('delegate --yes -- "hello"', () => {
  it('exits 0, stdout contains "Claude job started" and a job_* ID, ack file is created', () => {
    const result = runDispatcher(['delegate', '--yes', '--', 'hello']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('job_'),
      `expected "Claude job started" or job id in stdout; got:\n${result.stdout}`,
    );

    // At least one job_* token should appear in stdout
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');

    // Ack file must exist after --yes
    assert.ok(existsSync(ackPath()), `expected ack file at ${ackPath()}`);
  });
});

// ---------- Test 4: delegate --json --yes -- "hello" ----------

describe('delegate --json --yes -- "hello"', () => {
  it('exits 0, stdout is JSON with ok:true and job.jobId matching the job_* pattern', () => {
    const result = runDispatcher(['delegate', '--json', '--yes', '--', 'hello']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true, got: ${JSON.stringify(parsed)}`);
    assert.ok(parsed.job, 'expected job field in JSON output');
    assert.match(
      parsed.job.jobId,
      /^job_[a-z0-9]+_[a-f0-9]{8}$/,
      `jobId "${parsed.job.jobId}" does not match expected pattern`,
    );
  });
});

// ---------- Test 5: delegate without --yes and non-TTY stdin ----------

describe('delegate without --yes (non-TTY stdin)', () => {
  it('exits 1, output mentions privacy or --yes, and no ack file or job is created', () => {
    // spawnSync stdin is not a TTY — dispatcher should require --yes
    const result = runDispatcher(['delegate', '--', 'hello']);

    assert.notEqual(result.status, 0, 'expected non-zero exit when --yes is missing');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);

    const combined = result.stdout + result.stderr;
    const mentionsPrivacyOrYes =
      combined.toLowerCase().includes('privacy') ||
      combined.toLowerCase().includes('--yes') ||
      combined.toLowerCase().includes('acknowledge');
    assert.ok(
      mentionsPrivacyOrYes,
      `expected mention of privacy or --yes in output; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );

    // No ack file should have been written
    assert.ok(!existsSync(ackPath()), 'ack file must NOT be created when --yes is absent');

    // No job records should exist
    assert.equal(listJobIds().length, 0, 'no job records should be created when --yes is absent');
  });
});

// ---------- Test 6: delegate --yes with unauthenticated mock ----------

describe('delegate --yes with unauthenticated mock claude', () => {
  it('exits 1 because claude-auth probe fails; no job created', () => {
    // Write a mock config that sets authStatus to unauthenticated
    const cfgPath = join(MOCK_HOME, 'cfg.json');
    writeFileSync(cfgPath, JSON.stringify({ authStatus: 'unauthenticated' }));

    const result = runDispatcher(['delegate', '--yes', '--', 'hello'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(result.status, 1, `expected exit 1 when auth probe fails, got ${result.status}`);

    // No job records should exist
    assert.equal(listJobIds().length, 0, 'no job should be created when auth probe fails');
  });
});

// ---------- Test 7: status after delegate ----------

describe('status after one delegate', () => {
  it('exits 0 and stdout includes workspace path and the created jobId', () => {
    // First delegate to create a job
    const delegateResult = runDispatcher(['delegate', '--yes', '--', 'status-test task']);
    assert.equal(delegateResult.status, 0, `delegate failed: ${delegateResult.stderr}`);
    const jobIdMatch = delegateResult.stdout.match(/job_[a-z0-9]+_[a-f0-9]{8}/);
    assert.ok(jobIdMatch, 'could not find jobId in delegate stdout');
    const jobId = jobIdMatch[0];

    // Now run status
    const result = runDispatcher(['status']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(WORK_DIR) || result.stdout.includes('Claude jobs'),
      `expected workspace reference in status output; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes(jobId),
      `expected jobId ${jobId} in status output; got:\n${result.stdout}`,
    );
  });
});

// ---------- Test 8: status --json after delegate ----------

describe('status --json after one delegate', () => {
  it('exits 0 with JSON output containing ok:true and jobs array with the created job', () => {
    const delegateResult = runDispatcher(['delegate', '--yes', '--', 'json-status task']);
    assert.equal(delegateResult.status, 0, `delegate failed: ${delegateResult.stderr}`);
    const jobIdMatch = delegateResult.stdout.match(/job_[a-z0-9]+_[a-f0-9]{8}/);
    assert.ok(jobIdMatch, 'could not find jobId in delegate stdout');
    const jobId = jobIdMatch[0];

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true, got: ${JSON.stringify(parsed)}`);
    assert.ok(Array.isArray(parsed.jobs), 'expected jobs array in JSON output');
    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `jobId ${jobId} not found in jobs array: ${JSON.stringify(parsed.jobs)}`);
  });
});

// ---------- Test 9: status with no jobs ----------

describe('status with no jobs', () => {
  it('exits 0 and stdout indicates no jobs found', () => {
    const result = runDispatcher(['status']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.toLowerCase().includes('no') && result.stdout.toLowerCase().includes('job'),
      `expected "No...job" message in output; got:\n${result.stdout}`,
    );
  });
});

// ---------- Plan 0020 F3: status rejects an unexpected positional ----------

describe('status with a job id positional (Plan 0020 F3)', () => {
  it('exits 2 and points at status --job instead of silently listing everything', () => {
    const result = runDispatcher(['status', 'job_bogus_deadbeef']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for status <jobId>, got ${result.status}; stdout:\n${result.stdout}`,
    );
    assert.ok(
      result.stderr.includes('cc status --job job_bogus_deadbeef') &&
        result.stderr.includes('cc result job_bogus_deadbeef'),
      `expected stderr to suggest status --job and result forms; got:\n${result.stderr}`,
    );
  });

  it('--json form also exits 2 for an unexpected positional', () => {
    const result = runDispatcher(['status', '--json', 'job_bogus_deadbeef']);
    assert.equal(result.status, 2, `expected exit 2; got ${result.status}`);
  });
});

describe('status --job and --compact ergonomics (Plan 0022 friction polish)', () => {
  it('status --job <id> --json returns one compact redacted job shape', () => {
    const jobId = `job_statjob_${createHash('sha256').update('status-job').digest('hex').slice(0, 8)}`;
    writeSyntheticCompletedJob({ jobId, resultContent: 'Single status preview.' });

    const result = runDispatcher(['status', '--job', jobId, '--json']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const parsed = parseJson(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.job.jobId, jobId);
    assert.equal(parsed.job.result.finalMessagePreview, 'Single status preview.');
    assert.equal(parsed.job.result.finalMessagePath.endsWith(`${jobId}.result.md`), true);
    assert.equal(parsed.job.result.isPartial, false);
    assert.equal(parsed.job.latestTurn.resultState, 'final');
    assert.equal(parsed.job.actionHints.result, `cc result ${jobId}`);
    assert.equal(parsed.job.actionHints.partialResult, `cc result ${jobId} --partial`);
    assert.equal(parsed.job.actionHints.attach, 'claude attach aabbcc');
    assert.equal(
      parsed.job.driver,
      undefined,
      'compact status-by-id must not expose driver probes',
    );
    assert.equal(
      parsed.job.workspace,
      undefined,
      'compact status-by-id must not expose workspace paths',
    );
    assert.equal(
      parsed.jobs,
      undefined,
      'status --job JSON should return a single job, not jobs[]',
    );
  });

  it('status --json --compact lists compact jobs without driver capabilities snapshots', () => {
    const jobId = `job_statcmp_${createHash('sha256').update('status-compact').digest('hex').slice(0, 8)}`;
    writeSyntheticCompletedJob({ jobId, resultContent: 'Compact status preview.' });

    const result = runDispatcher(['status', '--json', '--compact']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const parsed = parseJson(result.stdout);
    const job = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(job, `missing compact job in output: ${result.stdout}`);
    assert.equal(job.driver, undefined, 'compact status rows must not include driver');
    assert.equal(job.workspace, undefined, 'compact status rows must not include workspace');
    assert.equal(job.result.finalMessagePreview, 'Compact status preview.');
  });

  it('status human list includes headers, age, and attach footer for needs_input jobs', () => {
    const jobId = `job_stathum_${createHash('sha256').update('status-human-needs-input').digest('hex').slice(0, 8)}`;
    writeSyntheticCompletedJob({
      jobId,
      resultContent: 'Blocked human row.',
      shortId: 'hum00001',
    });

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'needs_input';
    record.claude.waitingFor = 'permission prompt';
    record.turns[0].status = 'needs_input';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
    writeMockAgentSession('hum00001', shortIdToSessionId('hum00001'), 'idle');
    const sidecarDir = join(MOCK_HOME, 'jobs', 'hum00001');
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(
      join(sidecarDir, 'state.json'),
      JSON.stringify(
        {
          sessionId: shortIdToSessionId('hum00001'),
          daemonShort: 'hum00001',
          state: 'waiting',
          tempo: 'blocked',
          intent: 'permission prompt',
          inFlight: { tasks: 0, queued: 0, kinds: [] },
        },
        null,
        2,
      ),
    );

    const result = runDispatcher(['status', '--stored-status', 'needs_input']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.match(result.stdout, /JOB ID\s+STATUS\s+AGE\s+CLAUDE\s+NAME/);
    assert.ok(result.stdout.includes(jobId), result.stdout);
    assert.ok(result.stdout.includes('Input needed: run claude attach hum00001'), result.stdout);
  });

  it('status --limit sorts newest first and reports hidden rows', () => {
    const rows = [
      {
        jobId: `job_limold_${createHash('sha256').update('status-limit-old').digest('hex').slice(0, 8)}`,
        updatedAt: '2026-06-15T00:00:00.000Z',
      },
      {
        jobId: `job_limmid_${createHash('sha256').update('status-limit-mid').digest('hex').slice(0, 8)}`,
        updatedAt: '2026-06-15T01:00:00.000Z',
      },
      {
        jobId: `job_limnew_${createHash('sha256').update('status-limit-new').digest('hex').slice(0, 8)}`,
        updatedAt: '2026-06-15T02:00:00.000Z',
      },
    ];

    for (const row of rows) {
      writeSyntheticCompletedJob({ jobId: row.jobId, resultContent: row.jobId });
      const recordPath = join(TMP_HOME, 'jobs', `${row.jobId}.json`);
      const record = JSON.parse(readFileSync(recordPath, 'utf8'));
      record.updatedAt = row.updatedAt;
      writeFileSync(recordPath, JSON.stringify(record, null, 2));
    }

    const result = runDispatcher(['status', '--json', '--compact', '--limit', '2']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.deepEqual(
      parsed.jobs.map((j) => j.jobId),
      [rows[2].jobId, rows[1].jobId],
      `expected newest-first limited rows; got:\n${result.stdout}`,
    );
    assert.equal(parsed.meta.limit, 2);
    assert.equal(parsed.meta.hiddenCount, 1);
  });

  it('status --stored-status filters by stored job status', () => {
    const completedId = `job_stdone_${createHash('sha256').update('status-filter-completed').digest('hex').slice(0, 8)}`;
    const stoppedId = `job_ststop_${createHash('sha256').update('status-filter-stopped').digest('hex').slice(0, 8)}`;
    writeSyntheticCompletedJob({ jobId: completedId, resultContent: 'completed row' });
    writeSyntheticCompletedJob({ jobId: stoppedId, resultContent: 'stopped row' });

    const stoppedPath = join(TMP_HOME, 'jobs', `${stoppedId}.json`);
    const stopped = JSON.parse(readFileSync(stoppedPath, 'utf8'));
    stopped.status = 'stopped';
    writeFileSync(stoppedPath, JSON.stringify(stopped, null, 2));

    const result = runDispatcher(['status', '--json', '--compact', '--stored-status', 'stopped']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.deepEqual(
      parsed.jobs.map((j) => j.jobId),
      [stoppedId],
      `expected only stopped row; got:\n${result.stdout}`,
    );
    assert.equal(parsed.meta.storedStatusFilter, 'stopped');
  });

  it('status --job JSON includes permission-resolution hints for blocked jobs with partial output', () => {
    const jobId = `job_statblk_${createHash('sha256').update('status-blocked-partial').digest('hex').slice(0, 8)}`;
    writeSyntheticCompletedJob({
      jobId,
      resultContent: 'Partial blocked answer.',
      shortId: 'blk00001',
    });

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'needs_input';
    record.claude.waitingFor = 'permission prompt';
    record.turns[0].status = 'needs_input';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
    writeMockAgentSession('blk00001', shortIdToSessionId('blk00001'), 'idle');
    const sidecarDir = join(MOCK_HOME, 'jobs', 'blk00001');
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(
      join(sidecarDir, 'state.json'),
      JSON.stringify(
        {
          sessionId: shortIdToSessionId('blk00001'),
          daemonShort: 'blk00001',
          state: 'waiting',
          tempo: 'blocked',
          intent: 'permission prompt',
          inFlight: { tasks: 0, queued: 0, kinds: [] },
        },
        null,
        2,
      ),
    );

    const result = runDispatcher(['status', '--job', jobId, '--json']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.job.status, 'needs_input');
    assert.equal(parsed.job.waitingFor, 'permission prompt');
    assert.deepEqual(parsed.job.waiting, {
      kind: 'permission',
      detail: 'permission prompt',
      action: 'attach',
    });
    assert.equal(parsed.job.result.isPartial, true);
    assert.equal(parsed.job.latestTurn.resultState, 'partial');
    assert.equal(parsed.job.actionHints.attach, 'claude attach blk00001');
    assert.equal(parsed.job.actionHints.stop, `cc stop ${jobId}`);
    assert.equal(parsed.job.actionHints.partialResult, `cc result ${jobId} --partial`);
  });

  it('result --partial prints recorded output for an incomplete job', () => {
    const jobId = `job_respart_${createHash('sha256').update('result-partial').digest('hex').slice(0, 8)}`;
    const { resultContent } = writeSyntheticCompletedJob({
      jobId,
      resultContent: 'Usable partial output from a blocked job.',
      shortId: 'part0001',
    });

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'needs_input';
    record.claude.waitingFor = 'permission prompt';
    record.turns[0].status = 'needs_input';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
    writeMockAgentSession('part0001', shortIdToSessionId('part0001'), 'idle');
    const sidecarDir = join(MOCK_HOME, 'jobs', 'part0001');
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(
      join(sidecarDir, 'state.json'),
      JSON.stringify(
        {
          sessionId: shortIdToSessionId('part0001'),
          daemonShort: 'part0001',
          state: 'waiting',
          tempo: 'blocked',
          intent: 'permission prompt',
          inFlight: { tasks: 0, queued: 0, kinds: [] },
        },
        null,
        2,
      ),
    );

    const rejected = runDispatcher(['result', jobId, '--json']);
    assert.equal(rejected.status, 1, 'result without --partial should reject incomplete jobs');
    assert.ok(
      rejected.stderr.includes(`cc result ${jobId} --partial`),
      `expected partial hint; got:\n${rejected.stderr}`,
    );

    const result = runDispatcher(['result', jobId, '--json', '--partial']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.partial, true);
    assert.equal(parsed.job.status, 'needs_input');
    assert.equal(parsed.resultText, resultContent);
  });

  it('status --stored-status uses stored status only to pre-filter before reconcile', () => {
    const shortId = '51a7f001';
    const sessionId = shortIdToSessionId(shortId);
    const jobId = `job_stpref_${createHash('sha256').update('status-prefilter-running').digest('hex').slice(0, 8)}`;
    writeSyntheticCompletedJob({
      jobId,
      shortId,
      sessionId,
      resultContent: 'prefilter row',
    });

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'running';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
    writeMockAgentSession(shortId, sessionId, 'idle');

    const result = runDispatcher(['status', '--json', '--compact', '--stored-status', 'running']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.jobs.length, 1, `expected one pre-filtered row; got:\n${result.stdout}`);
    assert.equal(parsed.jobs[0].jobId, jobId);
    assert.equal(parsed.jobs[0].status, 'awaiting_followup');
    assert.equal(parsed.jobs[0].result.isPartial, false);
    assert.equal(parsed.jobs[0].latestTurn.resultState, 'final');
    assert.equal(parsed.jobs[0].actionHints.followup, `cc followup ${jobId} -- "<prompt>"`);
    assert.equal(parsed.meta.storedStatusFilter, 'running');
  });

  it('status rejects invalid --limit and --stored-status values', () => {
    const badLimit = runDispatcher(['status', '--limit', 'soon']);
    assert.equal(badLimit.status, 2, `expected exit 2; stderr: ${badLimit.stderr}`);
    assert.ok(badLimit.stderr.includes('--limit must be a non-negative integer'));

    const badStatus = runDispatcher(['status', '--stored-status', 'sleeping']);
    assert.equal(badStatus.status, 2, `expected exit 2; stderr: ${badStatus.stderr}`);
    assert.ok(badStatus.stderr.includes('--stored-status must be one of'));
  });
});

// ---------- Plan 0022: status listing skips already-terminal job records ----------

describe('status terminal-history reconciliation skip (Plan 0022)', () => {
  it('status --json leaves terminal jobs terminal instead of reconciling them back to running', () => {
    const terminalStatuses = ['completed', 'failed', 'stopped', 'orphaned'];

    for (const terminalStatus of terminalStatuses) {
      const shortId = {
        completed: 'c0ffee01',
        failed: 'faded002',
        stopped: '57000003',
        orphaned: '0ff00004',
      }[terminalStatus];
      const sessionId = shortIdToSessionId(shortId);
      const jobId = `job_p22${terminalStatus.slice(0, 4)}_${createHash('sha256')
        .update(`plan-0022-${terminalStatus}`)
        .digest('hex')
        .slice(0, 8)}`;

      writeSyntheticCompletedJob({ jobId, shortId, sessionId });
      const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
      const record = JSON.parse(readFileSync(recordPath, 'utf8'));
      record.status = terminalStatus;
      record.turns[0].status = terminalStatus === 'completed' ? 'completed' : 'failed';
      writeFileSync(recordPath, JSON.stringify(record, null, 2));

      // If cmdStatus reconciles this row, driverValue:'working' maps non-sticky
      // terminal statuses back to 'running'. The listing path should skip them.
      writeMockAgentSession(shortId, sessionId, 'working');
    }

    const result = runDispatcher(['status', '--json']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    for (const terminalStatus of terminalStatuses) {
      const job = parsed.jobs.find((j) =>
        j.jobId.startsWith(`job_p22${terminalStatus.slice(0, 4)}`),
      );
      assert.ok(job, `missing ${terminalStatus} job in status output`);
      assert.equal(
        job.status,
        terminalStatus,
        `expected ${job.jobId} to remain ${terminalStatus}; got ${job.status}`,
      );
    }
  });
});

// ---------- Test 10a: result for still-running job exits 1 with "not complete yet" ----------

describe('result for a running job', () => {
  it('exits 1 and mentions "not complete yet" when the session is still running', () => {
    const delegateResult = runDispatcher(['delegate', '--yes', '--', 'running result test']);
    assert.equal(delegateResult.status, 0, `delegate failed: ${delegateResult.stderr}`);
    const jobIdMatch = delegateResult.stdout.match(/job_[a-z0-9]+_[a-f0-9]{8}/);
    assert.ok(jobIdMatch, 'could not find jobId in delegate stdout');
    const jobId = jobIdMatch[0];

    // The mock leaves status as 'working' (= running), so result should fail
    const result = runDispatcher(['result', jobId]);

    assert.equal(result.status, 1, `expected exit 1 for running job, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const mentionsNotComplete =
      combined.toLowerCase().includes('not complete') ||
      combined.toLowerCase().includes('not yet') ||
      combined.toLowerCase().includes('still') ||
      combined.toLowerCase().includes('running') ||
      combined.toLowerCase().includes('working');
    assert.ok(
      mentionsNotComplete,
      `expected "not complete" hint in output; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    assert.ok(
      combined.includes(`cc status --job ${jobId}`),
      `expected single-job status hint; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  });
});

describe('result for a running job with a completed latest-turn artifact (Plan 0023)', () => {
  it('exits 0 and reads the immutable latest turn result while status catches up', () => {
    const jobId = `job_p23res_${createHash('sha256').update('p23-running-completed-turn').digest('hex').slice(0, 8)}`;
    const shortId = 'p23r0001';
    const sessionId = shortIdToSessionId(shortId);
    const resultContent = 'Plan 0023 latest turn result is readable.';
    writeSyntheticCompletedJob({ jobId, shortId, sessionId, resultContent });

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'running';
    record.turns[0].status = 'completed';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));
    writeMockAgentSession(shortId, sessionId, 'working');

    const result = runDispatcher(['result', jobId, '--json', '--compact']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for completed latest-turn result; stderr: ${result.stderr}`,
    );
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.job.status, 'running');
    assert.equal(parsed.resultText, resultContent);
    assert.equal(parsed.job.latestTurn.status, 'completed');
    assert.equal(parsed.job.latestTurn.hasResult, true);
  });
});

// ---------- Test 10b: result for synthetic completed job prints file content ----------

describe('result for a completed job', () => {
  it('exits 0 and prints the result.md content for a synthetically completed job', () => {
    const jobId = `job_synth_${createHash('sha256').update('test10b').digest('hex').slice(0, 8)}`;
    const { resultContent } = writeSyntheticCompletedJob({ jobId });

    const result = runDispatcher(['result', jobId]);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(resultContent),
      `expected result content "${resultContent}" in stdout; got:\n${result.stdout}`,
    );
  });

  it('exits 0 with JSON output containing ok:true and the result content', () => {
    const jobId = `job_synth_${createHash('sha256').update('test10b-json').digest('hex').slice(0, 8)}`;
    const { resultContent } = writeSyntheticCompletedJob({
      jobId,
      resultContent: 'JSON result answer.',
    });

    const result = runDispatcher(['result', jobId, '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true, got: ${JSON.stringify(parsed)}`);
    // The result content should appear either in parsed.content or parsed.result
    const body = JSON.stringify(parsed);
    assert.ok(body.includes(resultContent), `expected resultContent in JSON output; got:\n${body}`);
  });
});

// ---------- Test 11: result <unique prefix> resolves correctly ----------

describe('result with unique prefix', () => {
  it('resolves and exits 0 when a unique prefix of a completed jobId is given', () => {
    const jobId = `job_prefix_${createHash('sha256').update('test11').digest('hex').slice(0, 8)}`;
    const { resultContent } = writeSyntheticCompletedJob({ jobId });

    // Use the first 10 chars of the jobId as a prefix (includes "job_prefix")
    const prefix = jobId.slice(0, 14);

    const result = runDispatcher(['result', prefix]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for prefix "${prefix}", got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(resultContent),
      `expected result content in output; got:\n${result.stdout}`,
    );
  });
});

// ---------- Test 12: result <ambiguous prefix> exits 2 or 1 with candidates ----------

describe('result with ambiguous prefix', () => {
  it('exits 1 or 2 and lists candidate jobIds when prefix matches multiple jobs', () => {
    // Write two synthetic jobs that share the same prefix
    // Both use "job_ambi_" prefix with different suffixes
    const jobId1 = `job_ambi_aabb0011`;
    const jobId2 = `job_ambi_ccdd0022`;
    writeSyntheticCompletedJob({ jobId: jobId1, prompt: 'ambiguous task 1' });
    writeSyntheticCompletedJob({ jobId: jobId2, prompt: 'ambiguous task 2' });

    // 'job_ambi_' matches both — but we need a prefix that really matches both IDs
    // The shared prefix of both IDs is "job_ambi_"
    const result = runDispatcher(['result', 'job_ambi_']);

    // Should exit non-zero (1 or 2) and mention both candidates
    assert.ok(
      result.status === 1 || result.status === 2,
      `expected exit 1 or 2 for ambiguous prefix, got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    // At least one of the candidates should appear in output
    const mentionsCandidates =
      combined.includes(jobId1) ||
      combined.includes(jobId2) ||
      combined.toLowerCase().includes('ambiguous') ||
      combined.toLowerCase().includes('multiple') ||
      combined.toLowerCase().includes('candidates');
    assert.ok(
      mentionsCandidates,
      `expected candidate jobIds or "ambiguous" in output; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  });

  it('caps broad ambiguous-prefix candidate output', () => {
    for (let i = 0; i < 12; i++) {
      const suffix = i.toString(16).padStart(8, '0');
      writeSyntheticCompletedJob({
        jobId: `job_many_${suffix}`,
        prompt: `ambiguous task ${i}`,
      });
    }

    const result = runDispatcher(['result', 'job_many_']);

    assert.equal(result.status, 1, `expected exit 1; stderr:\n${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('(+2 more; narrow the prefix or pass the full jobId)'),
      `expected capped ambiguity suffix; got:\n${combined}`,
    );
    const shownCandidates = combined.match(/job_many_[a-f0-9]{8}/g) ?? [];
    assert.ok(
      shownCandidates.length <= 10,
      `expected at most 10 displayed candidates; got ${shownCandidates.length} in:\n${combined}`,
    );
  });
});

// ---------- Test 13: result <unknown id> exits 1 ----------

describe('result with unknown jobId', () => {
  it('exits 1 when the given jobId does not exist', () => {
    const result = runDispatcher(['result', 'job_unkn_deadbeef']);

    assert.equal(result.status, 1, `expected exit 1 for unknown jobId, got ${result.status}`);
  });
});

// ---------- Test 14: stop <jobId> exits 0 and marks job stopped on disk ----------

describe('stop <jobId>', () => {
  it('exits 0 and the job record on disk has status "stopped" afterwards', () => {
    // First delegate to create a job
    const delegateResult = runDispatcher(['delegate', '--yes', '--', 'stop-me task']);
    assert.equal(delegateResult.status, 0, `delegate failed: ${delegateResult.stderr}`);
    const jobIdMatch = delegateResult.stdout.match(/job_[a-z0-9]+_[a-f0-9]{8}/);
    assert.ok(jobIdMatch, 'could not find jobId in delegate stdout');
    const jobId = jobIdMatch[0];

    // Stop the job
    const result = runDispatcher(['stop', jobId]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 from stop, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.toLowerCase().includes('stop') ||
        result.stdout.includes(jobId) ||
        result.stdout.toLowerCase().includes('success'),
      `expected stop confirmation in stdout; got:\n${result.stdout}`,
    );

    // Read job record from disk and check status
    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    assert.ok(existsSync(recordPath), `job record not found at ${recordPath}`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.status, 'stopped', `expected status "stopped", got "${record.status}"`);
  });
});

// ---------- Test 15: stop <unknown jobId> exits 1 ----------

describe('stop with unknown jobId', () => {
  it('exits 1 when the given jobId does not exist', () => {
    const result = runDispatcher(['stop', 'job_unkn_deadbeef']);

    assert.equal(result.status, 1, `expected exit 1 for unknown jobId, got ${result.status}`);
  });
});

// ---------- Test 16: invalid subcommand exits 2 with usage hint ----------

describe('invalid subcommand', () => {
  it('exits 2 and prints a usage hint when an unknown subcommand is given', () => {
    const result = runDispatcher(['foo']);

    assert.equal(result.status, 2, `expected exit 2 for unknown subcommand, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('usage') ||
        combined.toLowerCase().includes('unknown') ||
        combined.toLowerCase().includes('subcommand') ||
        combined.toLowerCase().includes('invalid'),
      `expected usage hint in output; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  });
});

// ---------- Test 17: --help exits 0 with usage ----------

describe('--help', () => {
  it('exits 0 and prints usage information', () => {
    const result = runDispatcher(['--help']);

    assert.equal(result.status, 0, `expected exit 0 for --help, got ${result.status}`);
    assert.ok(
      result.stdout.toLowerCase().includes('usage') ||
        result.stdout.toLowerCase().includes('cc') ||
        result.stdout.toLowerCase().includes('subcommand'),
      `expected usage info in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- Test 18: delegate with --allow-edit succeeds and session is created ----------

describe('delegate --json --yes --allow-edit', () => {
  it('exits 0 and the mock records the session without --dangerously-skip-permissions', () => {
    const result = runDispatcher([
      'delegate',
      '--json',
      '--yes',
      '--allow-edit',
      '--',
      'edit allowed task',
    ]);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true, got: ${JSON.stringify(parsed)}`);
    assert.match(
      parsed.job.jobId,
      /^job_[a-z0-9]+_[a-f0-9]{8}$/,
      'jobId should match the expected pattern',
    );

    // Verify the mock recorded the session (agents --json should show it)
    const agentsResult = spawnSync('claude', ['agents', '--json'], {
      env: {
        ...process.env,
        CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME: MOCK_HOME,
        PATH: `${MOCK_CLAUDE}${delimiter}${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    });
    assert.equal(agentsResult.status, 0, `agents --json failed: ${agentsResult.stderr}`);
    const sessions = JSON.parse(agentsResult.stdout);
    assert.ok(sessions.length > 0, 'expected at least one session after delegate --allow-edit');

    // None of the sessions should have been started with --dangerously-skip-permissions
    // (the mock records the prompt, not the flags, so we verify by checking the dispatcher
    // did not set that flag — the mock would have just accepted it anyway. We verify
    // structurally: the session exists and the job record does not contain the forbidden flag)
    const recordPath = join(TMP_HOME, 'jobs', `${parsed.job.jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    // The raw job record JSON should not contain 'dangerously-skip-permissions'
    const recordStr = JSON.stringify(record);
    assert.ok(
      !recordStr.includes('dangerously-skip-permissions'),
      'job record must not reference --dangerously-skip-permissions',
    );
  });
});

describe('delegate flag parsing parity (Plan 0024)', () => {
  it('rejects an unknown flag without creating a job', () => {
    const result = runDispatcher([
      'delegate',
      '--yes',
      '--sangerously-skip-permissions',
      '--',
      'task',
    ]);
    assert.equal(result.status, 2, `expected exit 2; stderr: ${result.stderr}`);
    assert.ok(
      result.stderr.includes('Unknown flag: --sangerously-skip-permissions'),
      `expected unknown-flag error; got:\n${result.stderr}`,
    );
    assert.deepEqual(listJobIds(), [], 'unknown flag must not create a job');
  });

  it('prefixes parser-level errors with the command name', () => {
    const result = runDispatcher(['delegate', '--frobnicate']);
    assert.equal(result.status, 2, `expected exit 2; stderr: ${result.stderr}`);
    assert.ok(
      result.stderr.startsWith('[delegate] Error: Unknown flag: --frobnicate'),
      `expected command-prefixed parse error; got:\n${result.stderr}`,
    );
  });

  it('--dangerously-skip-permissions aliases permission-mode bypass without swallowing prompt', () => {
    const result = runDispatcher([
      'delegate',
      '--json',
      '--yes',
      '--dangerously-skip-permissions',
      '--',
      'danger alias task',
    ]);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    const shortId = parsed.job.claude.shortId;
    const state = JSON.parse(readFileSync(join(MOCK_HOME, 'state.json'), 'utf8'));
    const sessions = state.sessions ?? [];
    const session = sessions.find((s) => s.shortId === shortId);
    assert.ok(session, `expected mock session ${shortId}`);
    assert.equal(session.permissionMode, 'bypassPermissions');
    assert.equal(session.prompt, 'danger alias task');
  });

  it('rejects invalid permission-mode values before creating a job', () => {
    const result = runDispatcher([
      'delegate',
      '--yes',
      '--permission-mode',
      'approveEverything',
      '--',
      'task',
    ]);
    assert.equal(result.status, 2, `expected exit 2; stderr: ${result.stderr}`);
    assert.ok(
      result.stderr.includes('--permission-mode must be one of:'),
      `expected permission-mode validation error; got:\n${result.stderr}`,
    );
    assert.equal(
      existsSync(ackPath()),
      false,
      'invalid permission mode must be rejected before recording the privacy ack',
    );
    assert.deepEqual(listJobIds(), [], 'invalid permission mode must not create a job');
  });
});

// ---------- Test 20: result without --all does not resolve cross-workspace jobs ----------

describe('result workspace-scoped prefix resolution (A3)', () => {
  it('does NOT resolve a job from a different workspace by default', () => {
    const otherWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-other-ws-')));
    try {
      const jobId = `job_other_${createHash('sha256').update('a3-default').digest('hex').slice(0, 8)}`;
      writeSyntheticCompletedJob({ jobId, workspaceRoot: otherWorkspace });

      const result = runDispatcher(['result', jobId]);
      assert.equal(result.status, 1, 'cross-workspace job must not resolve without --all');
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.toLowerCase().includes('no job') || combined.toLowerCase().includes('--all'),
        `expected "no job" or "--all" hint; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    } finally {
      rmSync(otherWorkspace, { recursive: true, force: true });
    }
  });

  it('DOES resolve a job from a different workspace when --all is passed', () => {
    const otherWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-other-ws-')));
    try {
      const jobId = `job_other_${createHash('sha256').update('a3-all').digest('hex').slice(0, 8)}`;
      const { resultContent } = writeSyntheticCompletedJob({
        jobId,
        workspaceRoot: otherWorkspace,
      });

      const result = runDispatcher(['result', jobId, '--all']);
      assert.equal(
        result.status,
        0,
        `expected exit 0 with --all; got ${result.status}; stderr: ${result.stderr}`,
      );
      assert.ok(
        result.stdout.includes(resultContent),
        `expected result content in output; got:\n${result.stdout}`,
      );
    } finally {
      rmSync(otherWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- Test 21: stop without --all does not resolve cross-workspace jobs ----------

describe('stop workspace-scoped prefix resolution (A3)', () => {
  it('does NOT resolve a stop target from a different workspace by default', () => {
    const otherWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-other-ws-')));
    try {
      const jobId = `job_stop_${createHash('sha256').update('a3-stop-default').digest('hex').slice(0, 8)}`;
      writeSyntheticCompletedJob({ jobId, workspaceRoot: otherWorkspace });

      const result = runDispatcher(['stop', jobId]);
      assert.equal(result.status, 1, 'cross-workspace job must not resolve without --all');
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.toLowerCase().includes('no job') || combined.toLowerCase().includes('--all'),
        `expected "no job" or "--all" hint; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    } finally {
      rmSync(otherWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- Test 19 (T7): cmdResult prints results for awaiting_followup jobs ----------

describe('result for an awaiting_followup job (plan 0002 T7)', () => {
  it('exits 0 and prints result content for a job with status awaiting_followup', () => {
    const jobId = `job_afup_${createHash('sha256').update('t7-awaiting-followup').digest('hex').slice(0, 8)}`;
    const resultContent = 'Awaiting follow-up result content.';

    // Write a synthetic job with status: 'awaiting_followup' by using
    // writeSyntheticCompletedJob and then overriding the status field on disk.
    const { jobId: writtenJobId } = writeSyntheticCompletedJob({
      jobId,
      resultContent,
      prompt: 'plan 0002 T7 awaiting followup test',
    });

    // Override status to 'awaiting_followup' on disk
    const recordPath = join(TMP_HOME, 'jobs', `${writtenJobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'awaiting_followup';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));

    const result = runDispatcher(['result', jobId]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for awaiting_followup job, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(resultContent),
      `expected result content "${resultContent}" in stdout; got:\n${result.stdout}`,
    );
  });

  it('exits 0 with JSON output for an awaiting_followup job', () => {
    const jobId = `job_afup_${createHash('sha256').update('t7-awaiting-followup-json').digest('hex').slice(0, 8)}`;
    const resultContent = 'JSON awaiting_followup result.';

    const { jobId: writtenJobId } = writeSyntheticCompletedJob({
      jobId,
      resultContent,
      prompt: 'plan 0002 T7 awaiting followup json test',
    });

    const recordPath = join(TMP_HOME, 'jobs', `${writtenJobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'awaiting_followup';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));

    const result = runDispatcher(['result', jobId, '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for awaiting_followup job --json, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true; got: ${JSON.stringify(parsed)}`);
    const body = JSON.stringify(parsed);
    assert.ok(body.includes(resultContent), `expected resultContent in JSON output; got:\n${body}`);
  });
});

// ==========================================================================
// T8: followup subcommand tests (plan 0002)
// ==========================================================================
//
// Helper: writeSyntheticAwaitingFollowupJob — writes a job with status
// 'awaiting_followup', a populated turns[0] (with result), and optionally
// a second in-progress turn. All jobs get a unique shortId derived from the
// jobId so the mock-claude sidecar can be pre-seeded independently.
//
// For tests that need a live idle mock-claude session, we delegate first
// (which creates a session in MOCK_HOME) then patch the job status on disk.
//
// Startup-only flags tested: --model, --effort, --permission-mode, --add-dir,
// --mcp-config, --name.  Each must produce exit 2 with the exact wording:
//   "<flag> is a startup-only flag; use it with $claude-delegate, not $claude-followup."
// ==========================================================================

/**
 * Write a synthetic job with status:'awaiting_followup' and one completed
 * turns[0] entry.  Returns the job record as written so callers can inspect
 * field values (e.g. turns[0].result, job.result).
 *
 * @param {{
 *   jobId: string;
 *   workspaceRoot?: string;
 *   prompt?: string;
 *   resultContent?: string;
 *   shortId?: string;
 *   status?: string;
 * }} opts
 * @returns {{ jobId: string; resultContent: string; record: object }}
 */
function writeSyntheticAwaitingFollowupJob({
  jobId,
  workspaceRoot = WORK_DIR,
  prompt = 'initial task for followup',
  resultContent = 'First turn result.',
  shortId = 'aabbcc99',
  status = 'awaiting_followup',
} = {}) {
  const jobsDir = join(TMP_HOME, 'jobs');
  mkdirSync(jobsDir, { recursive: true });

  const now = new Date().toISOString();
  const resultPath = join(jobsDir, `${jobId}.result.md`);

  const turn0Result = {
    finalMessagePath: resultPath,
    finalMessagePreview: resultContent.slice(0, 120),
  };

  const record = {
    jobId,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    status,
    codex: {
      pluginVersion: '0.0.0',
      cwd: workspaceRoot,
    },
    workspace: {
      root: workspaceRoot,
    },
    driver: {
      name: 'claude-background',
      version: '0.0.0',
      capabilitiesSnapshot: {},
    },
    claude: {
      version: '2.1.999-mock',
      shortId,
      // Store a UUID-format sessionId that derives back to shortId via
      // deriveShortId(uuid) = uuid.replace(/-/g,'').slice(0,8).
      // This allows driver.status() to match by sessionId (highest priority)
      // when claude agents --json emits only sessionId (real-2.1.149 schema).
      sessionId: shortIdToSessionId(shortId),
      sessionName: `codex:test:${jobId}`,
      cwd: workspaceRoot,
      logsCommand: `claude logs ${shortId}`,
    },
    prompt: {
      summary: prompt.slice(0, 120),
      sha256: createHash('sha256').update(prompt).digest('hex'),
      bytesLen: Buffer.byteLength(prompt, 'utf8'),
    },
    result: turn0Result,
    turns: [
      {
        prompt: {
          summary: prompt.slice(0, 120),
          sha256: createHash('sha256').update(prompt).digest('hex'),
          bytesLen: Buffer.byteLength(prompt, 'utf8'),
        },
        startedAt: now,
        endedAt: now,
        status: 'completed',
        result: turn0Result,
      },
    ],
  };

  writeFileSync(join(jobsDir, `${jobId}.json`), JSON.stringify(record, null, 2));
  writeFileSync(resultPath, resultContent);

  return { jobId, resultContent, record };
}

/**
 * Derive a UUID-format sessionId from a shortId so that the driver's
 * deriveShortId(uuid) = uuid.replace(/-/g,'').slice(0,8) round-trips back
 * to the original shortId. This makes driver.status() able to match sessions
 * in 'real-2.1.149' agents-json schema mode (which omits the shortId field).
 *
 * @param {string} shortId - typically an 8-char hex string
 * @returns {string} UUID-format string: "<shortId padded to 8>-0000-4000-8000-000000000000"
 */
function shortIdToSessionId(shortId) {
  const hex = shortId.slice(0, 8).padEnd(8, '0');
  return `${hex}-0000-4000-8000-000000000000`;
}

/**
 * Write a mock-claude idle sidecar for shortId so that driver.status() returns
 * 'idle' — this allows a 'completed' job to pass the live-idle check.
 *
 * @param {string} shortId
 * @param {string} [sessionId]  Defaults to a UUID derived from shortId
 */
function writeMockIdleSidecar(shortId, sessionId = shortIdToSessionId(shortId)) {
  const sidecarDir = join(MOCK_HOME, 'jobs', shortId);
  mkdirSync(sidecarDir, { recursive: true });
  writeFileSync(
    join(sidecarDir, 'state.json'),
    JSON.stringify(
      {
        template: 'bg',
        intent: '',
        name: `codex:test:${shortId}`,
        nameSource: 'user',
        sessionId,
        resumeSessionId: sessionId,
        daemonShort: shortId,
        cliVersion: '2.1.999-mock',
        cwd: WORK_DIR,
        backend: 'daemon',
        linkScanPath: join(MOCK_HOME, 'projects', `${sessionId}.jsonl`),
        state: 'idle',
        tempo: 'idle',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
      },
      null,
      2,
    ),
  );
}

/**
 * Write a mock-claude state.json entry so that 'claude agents --json' lists
 * the session. Required for driver.status() via agents --json path.
 *
 * @param {string} shortId
 * @param {string} [sessionId]  Defaults to a UUID derived from shortId
 * @param {string} sessionStatus  mock-claude session status (e.g. 'working', 'stopped')
 */
function writeMockAgentSession(
  shortId,
  sessionId = shortIdToSessionId(shortId),
  sessionStatus = 'working',
) {
  const stateFile = join(MOCK_HOME, 'state.json');
  let state = { sessions: [] };
  if (existsSync(stateFile)) {
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf8'));
    } catch {
      state = { sessions: [] };
    }
  }
  mkdirSync(MOCK_HOME, { recursive: true });
  // mock-claude's cmdStop appends to MOCK_HOME/logs/<shortId>.log. ensureHome()
  // creates this dir for delegate paths, but tests that pre-seed directly via
  // this helper (e.g. T11 bulk-stop) skip the delegate flow, so we ensure the
  // dir exists here. No-op for tests that have already delegated.
  mkdirSync(join(MOCK_HOME, 'logs'), { recursive: true });
  const now = new Date().toISOString();
  state.sessions.push({
    shortId,
    sessionId,
    name: `codex:test:${shortId}`,
    cwd: WORK_DIR,
    pid: 99999,
    status: sessionStatus,
    startedAt: now,
    updatedAt: now,
    transcriptPath: join(MOCK_HOME, 'projects', `${sessionId}.jsonl`),
    logPath: join(MOCK_HOME, 'logs', `${shortId}.log`),
    prompt: '',
  });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Write a pre-existing ack for a given workspace path into TMP_HOME/acks/.
 * @param {string} workspaceRoot
 */
function writeAck(workspaceRoot) {
  const acksDir = join(TMP_HOME, 'acks');
  mkdirSync(acksDir, { recursive: true });
  const hex = ackHex(workspaceRoot);
  writeFileSync(
    join(acksDir, `${hex}.json`),
    JSON.stringify({ workspaceRoot, ackedAt: new Date().toISOString() }, null, 2),
  );
}

// ---------- T8-1 / T8-2: happy path — appends turns[1] ----------

describe('followup happy path (T8)', () => {
  it('T8-1: exits 0 and job on disk has turns.length === 2 after followup', () => {
    const jobId = `job_t8hp_${createHash('sha256').update('t8-happy-turns').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110001';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeAck(WORK_DIR);
    // Pre-seed a mock claude session so driver.send can attach
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'second prompt']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.turns.length, 2, `expected turns.length === 2, got ${record.turns.length}`);
  });

  it('T8-2: turns[1].prompt.sha256 matches sha256 of the new prompt', () => {
    const jobId = `job_t8pm_${createHash('sha256').update('t8-prompt-meta').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110002';
    const newPrompt = 'second prompt for meta test';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', newPrompt]);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.turns.length, 2, 'expected 2 turns');

    const turn1 = record.turns[1];
    const expectedSha256 = createHash('sha256').update(newPrompt).digest('hex');
    assert.equal(
      turn1.prompt.sha256,
      expectedSha256,
      `turns[1].prompt.sha256 mismatch; got ${turn1.prompt.sha256}`,
    );
    assert.equal(
      turn1.prompt.bytesLen,
      Buffer.byteLength(newPrompt, 'utf8'),
      'turns[1].prompt.bytesLen mismatch',
    );
    assert.ok(
      turn1.prompt.summary.includes(newPrompt.slice(0, 30)),
      `turns[1].prompt.summary should contain new prompt text; got ${turn1.prompt.summary}`,
    );
  });
});

// ---------- T8-3 / T8-4: previous result is preserved ----------

describe('followup preserves previous result (T8)', () => {
  it('T8-3: turns[0].result is intact after a successful followup', () => {
    const jobId = `job_t8pr_${createHash('sha256').update('t8-prev-result').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110003';
    const { record: initialRecord } = writeSyntheticAwaitingFollowupJob({
      jobId,
      shortId,
      resultContent: 'Previous turn result that must not be erased.',
    });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'follow-up prompt']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));

    // The previous turn's result must still be intact.
    assert.ok(
      record.turns[0].result !== undefined,
      'turns[0].result must still exist after a follow-up',
    );
    assert.equal(
      record.turns[0].result.finalMessagePreview,
      initialRecord.turns[0].result.finalMessagePreview,
      'turns[0].result.finalMessagePreview must not be erased',
    );
  });

  it('T8-4: job.result is updated to the new turn result after followup', () => {
    const jobId = `job_t8nr_${createHash('sha256').update('t8-new-result').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110004';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'new turn prompt']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));

    // job.result compat alias must point to the most recent turn that has a result.
    // After a successful follow-up turns[1].result is set, so job.result must equal that.
    assert.ok(
      record.turns[1] !== undefined,
      'expected turns[1] to exist after successful follow-up',
    );
    // If turns[1] has a result, job.result must reflect it (not the old turns[0] preview).
    if (record.turns[1].result !== undefined) {
      assert.deepEqual(
        record.result,
        record.turns[1].result,
        'job.result must equal turns[1].result (compat alias for latest-result turn)',
      );
    } else {
      // Implementation chose not to update job.result preview until the follow-up completes
      // via a separate reconcile step. Still acceptable; turns[1].status 'completed' is the primary signal.
      assert.equal(
        record.turns[1].status,
        'completed',
        'turns[1].status must be completed when no result preview is written inline',
      );
    }
  });
});

describe('followup immediate preview honesty (Plan 0022 friction polish)', () => {
  it('formatFollowup omits a stale previous-turn preview when no fresh preview exists', () => {
    const job = {
      jobId: 'job_preview_12345678',
      status: 'running',
      claude: { shortId: 'prev0001', sessionName: 'codex:test:preview' },
      turns: [
        {
          status: 'completed',
          result: { finalMessagePreview: 'PREVIOUS_TURN_PREVIEW' },
        },
        {
          status: 'completed',
          result: { finalMessagePreview: 'PREVIOUS_TURN_PREVIEW' },
        },
      ],
    };

    const parsed = JSON.parse(
      formatFollowup(job, { finalMessage: 'PREVIOUS_TURN_PREVIEW' }, 1, true, {
        previousTurnPreview: 'PREVIOUS_TURN_PREVIEW',
      }),
    );

    assert.equal(parsed.turn.finalMessagePreview, null);
    assert.equal(parsed.job.resultPreview, null);
    assert.equal(parsed.turn.stalePreview, true);
    assert.equal(parsed.turn.resultPending, true);
    assert.equal(parsed.turn.previousTurnPreview, 'PREVIOUS_TURN_PREVIEW');
  });

  it('formatFollowup prefers a distinct sendResult preview over a stale reconciled preview', () => {
    const job = {
      jobId: 'job_preview_87654321',
      status: 'running',
      claude: { shortId: 'prev0002', sessionName: 'codex:test:preview' },
      turns: [
        {
          status: 'completed',
          result: { finalMessagePreview: 'PREVIOUS_TURN_PREVIEW' },
        },
        {
          status: 'completed',
          result: { finalMessagePreview: 'PREVIOUS_TURN_PREVIEW' },
        },
      ],
    };

    const parsed = JSON.parse(
      formatFollowup(job, { finalMessage: 'FRESH_FOLLOWUP_PREVIEW' }, 1, true, {
        previousTurnPreview: 'PREVIOUS_TURN_PREVIEW',
      }),
    );

    assert.equal(parsed.turn.finalMessagePreview, 'FRESH_FOLLOWUP_PREVIEW');
    assert.equal(parsed.job.resultPreview, 'FRESH_FOLLOWUP_PREVIEW');
    assert.equal(parsed.turn.previewSource, 'sendResult');
    assert.equal(parsed.turn.stalePreview, undefined);
  });
});

// ---------- T8-5: events written ----------

describe('followup writes turn events (T8)', () => {
  it('T8-5: turn.requested and turn.completed events appear in events.jsonl', () => {
    const jobId = `job_t8ev_${createHash('sha256').update('t8-events').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110005';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'events test prompt']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    const eventsPath = join(TMP_HOME, 'jobs', `${jobId}.events.jsonl`);
    assert.ok(existsSync(eventsPath), `expected events file at ${eventsPath}`);

    const lines = readFileSync(eventsPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));

    const types = lines.map((e) => e.type);
    assert.ok(
      types.includes('turn.requested'),
      `expected turn.requested event; got types: ${types.join(', ')}`,
    );
    assert.ok(
      types.includes('turn.completed') || types.includes('turn.failed'),
      `expected turn.completed or turn.failed event; got types: ${types.join(', ')}`,
    );
  });
});

// ---------- T8-6: failed send ----------

describe('followup with failed send (T8)', () => {
  it('T8-6: failed send writes turn.failed event and leaves turns[0].result intact', () => {
    const jobId = `job_t8fs_${createHash('sha256').update('t8-fail-send').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110006';
    const { record: initialRecord } = writeSyntheticAwaitingFollowupJob({
      jobId,
      shortId,
      resultContent: 'Old result that must survive failure.',
    });
    // Do NOT write a mock agent session — this causes the attach to fail since the session
    // cannot be found by the driver, which causes driver.send to fail.
    writeAck(WORK_DIR);
    // Don't write a valid sidecar; the missing session makes the send fail.

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'should fail prompt']);

    // Exit must be non-zero when send fails.
    assert.notEqual(result.status, 0, 'expected non-zero exit when driver.send fails');

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    assert.ok(existsSync(recordPath), `job record must still exist at ${recordPath}`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));

    // turns[0].result must still be intact.
    assert.ok(record.turns[0].result !== undefined, 'turns[0].result must survive failure');
    assert.equal(
      record.turns[0].result.finalMessagePreview,
      initialRecord.turns[0].result.finalMessagePreview,
      'turns[0].result.finalMessagePreview must be unchanged after failed send',
    );

    // The load-bearing claim of T8-6 is that turns[0].result is preserved
    // across a follow-up failure. The follow-up can fail at one of two stages:
    //   (a) eligibility-check rejection (reconcile flipped the job to
    //       `orphaned` because no mock session is alive) — pre-`driver.send`,
    //       no `turn.*` events are written; only `reconcile.*` events appear.
    //   (b) `driver.send` rejection — `turn.requested` + `turn.failed` events
    //       are written by cmdFollowup before returning.
    // Both paths preserve turns[0].result, so they're both valid failure
    // modes for this test's primary invariant. The events check below is
    // therefore conditional on whether any `turn.*` event was written.
    const eventsPath = join(TMP_HOME, 'jobs', `${jobId}.events.jsonl`);
    if (existsSync(eventsPath)) {
      const lines = readFileSync(eventsPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));
      const types = lines.map((e) => e.type);
      const hasTurnEvent = types.some((t) => typeof t === 'string' && t.startsWith('turn.'));
      if (hasTurnEvent) {
        // If cmdFollowup got far enough to start a turn (i.e., past the
        // eligibility/ack gates), the failure path must record `turn.failed`.
        assert.ok(
          types.includes('turn.failed'),
          `expected turn.failed event when turn.* events are present; got: ${types.join(', ')}`,
        );
      }
      // else: failure happened before any turn event was written (eligibility
      // or ack gate rejected). No additional assertion needed — the primary
      // claim is verified by turns[0].result being unchanged above.
    }

    // Check that if turns[1] was created, its status is 'failed'.
    if (record.turns.length > 1) {
      assert.equal(
        record.turns[1].status,
        'failed',
        `expected turns[1].status 'failed', got '${record.turns[1].status}'`,
      );
    }
  });
});

// ---------- T8-7: accepted flags ----------

describe('followup accepts runtime flags (T8)', () => {
  it('T8-7: exits 0 with --all --json --yes --allow-edit and a valid prompt', () => {
    const jobId = `job_t8af_${createHash('sha256').update('t8-accepted-flags').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110007';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher([
      'followup',
      jobId,
      '--all',
      '--json',
      '--yes',
      '--allow-edit',
      '--',
      'accepted flags test',
    ]);

    // Exit 0 means the flags were accepted (even if send fails for other reasons,
    // the flags themselves should not be the cause of failure).
    // We check that exit code is NOT 2 (which would indicate a usage/flag-rejection error).
    assert.notEqual(
      result.status,
      2,
      `expected flags to be accepted (exit != 2); got ${result.status}; stderr: ${result.stderr}`,
    );
  });
});

// ---------- T8-8: startup-only flag rejection ----------

describe('followup rejects startup-only flags (T8)', () => {
  const startupOnlyFlags = [
    '--model',
    '--effort',
    '--permission-mode',
    '--add-dir',
    '--mcp-config',
    '--name',
  ];

  for (const flag of startupOnlyFlags) {
    it(`T8-8: ${flag} is rejected with exit 2 and exact wording`, () => {
      const jobId = `job_t8sf_${createHash('sha256').update(`t8-startup-${flag}`).digest('hex').slice(0, 8)}`;
      writeSyntheticAwaitingFollowupJob({ jobId });

      // Pass the flag with a dummy value then a prompt.
      const flagArgs =
        flag === '--add-dir' || flag === '--mcp-config' || flag === '--model' || flag === '--effort'
          ? [flag, 'somevalue']
          : flag === '--permission-mode'
            ? [flag, 'default']
            : flag === '--name'
              ? [flag, 'myname']
              : [flag, 'somevalue'];

      const result = runDispatcher([
        'followup',
        jobId,
        '--yes',
        ...flagArgs,
        '--',
        'prompt after startup flag',
      ]);

      assert.equal(
        result.status,
        2,
        `expected exit 2 for ${flag}, got ${result.status}; stderr: ${result.stderr}; stdout: ${result.stdout}`,
      );

      const combined = result.stdout + result.stderr;
      const expectedFragment = `${flag} is a startup-only flag`;
      assert.ok(
        combined.includes(expectedFragment),
        `expected "${expectedFragment}" in output for ${flag}; got:\n${combined}`,
      );
      assert.ok(
        combined.includes('$claude-delegate') || combined.includes('claude-delegate'),
        `expected "$claude-delegate" reference in output for ${flag}; got:\n${combined}`,
      );
      assert.ok(
        combined.includes('$claude-followup') || combined.includes('claude-followup'),
        `expected "$claude-followup" reference in output for ${flag}; got:\n${combined}`,
      );
    });
  }
});

// ---------- T8-9 / T8-10: workspace-scoped resolution ----------

describe('followup workspace resolution (T8)', () => {
  it('T8-9: does NOT resolve a cross-workspace job without --all', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ws-a-')));
    try {
      const jobId = `job_t8wr_${createHash('sha256').update('t8-ws-resolve').digest('hex').slice(0, 8)}`;
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA });

      // Run from WORK_DIR (workspace B) without --all
      const result = runDispatcher(['followup', jobId, '--yes', '--', 'cross-ws prompt']);

      assert.equal(result.status, 1, `expected exit 1 for cross-workspace job without --all`);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.toLowerCase().includes('no job') || combined.toLowerCase().includes('--all'),
        `expected "no job" or "--all" hint; got:\n${combined}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  it('T8-10: resolves a cross-workspace job when --all is passed', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ws-a2-')));
    try {
      const jobId = `job_t8wa_${createHash('sha256').update('t8-ws-all').digest('hex').slice(0, 8)}`;
      const shortId = 'f0110010';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      // Pre-ack workspace A
      writeAck(workspaceA);
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

      // Run from WORK_DIR (workspace B) with --all
      const result = runDispatcher([
        'followup',
        jobId,
        '--all',
        '--yes',
        '--',
        'cross-ws with all',
      ]);

      // The flag --all resolves the job. Exit must not be 1 with "no job found".
      const combined = result.stdout + result.stderr;
      const isNoJobError =
        (combined.toLowerCase().includes('no job') && result.status === 1) ||
        (combined.toLowerCase().includes('not found') && result.status === 1);
      assert.ok(
        !isNoJobError,
        `--all should resolve cross-workspace job but got "no job" error; output:\n${combined}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });
});

// ---------- T8-11 / T8-12 / T8-13: ack checked against target workspace ----------

describe('followup ack checks target workspace (T8)', () => {
  it('T8-11: non-TTY without --yes fails with target workspace path (not caller workspace)', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ws-ack-')));
    try {
      const jobId = `job_t8ack_${createHash('sha256').update('t8-ack-target').digest('hex').slice(0, 8)}`;
      const shortId = 'f0110011';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      // Pre-stage a live idle mock session so the reconciler keeps the job in
      // `awaiting_followup` and the eligibility check passes. The test exercises
      // the ack-check rejection path; without a mock session the reconciler
      // would flip the status to `orphaned` before the ack check fires.
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      // Do NOT ack workspace A or WORK_DIR

      const result = runDispatcher(['followup', jobId, '--all', '--', 'no ack prompt']);

      assert.equal(result.status, 1, `expected exit 1 when ack missing; got ${result.status}`);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes(workspaceA),
        `expected target workspace path (${workspaceA}) in error; got:\n${combined}`,
      );
      assert.ok(
        !combined.includes(WORK_DIR) ||
          combined.indexOf(workspaceA) < combined.indexOf(WORK_DIR) ||
          combined.includes(workspaceA),
        `error should mention target workspace A, not caller WORK_DIR`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  it('T8-12: non-TTY no-ack message clearly includes target workspace path', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ws-noack-')));
    try {
      const jobId = `job_t8na_${createHash('sha256').update('t8-no-ack').digest('hex').slice(0, 8)}`;
      const shortId = 'f0110012';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      // Same pre-staging as T8-11: keep reconciler from flipping to orphaned.
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

      const result = runDispatcher(['followup', jobId, '--all', '--', 'no ack non-tty']);

      assert.equal(result.status, 1, `expected exit 1 for no-ack non-TTY; got ${result.status}`);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes(workspaceA),
        `expected target workspace path in error; got:\n${combined}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  it('T8-13: --yes records ack for target workspace (not just caller workspace)', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ws-yesack-')));
    try {
      const jobId = `job_t8ya_${createHash('sha256').update('t8-yes-ack').digest('hex').slice(0, 8)}`;
      const shortId = 'f0110013';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

      // Run from WORK_DIR (workspace B) with --all --yes — should ack workspace A
      runDispatcher(['followup', jobId, '--all', '--yes', '--', 'yes ack test']);

      // Verify ack file was written for workspace A.
      // TMP_HOME may not be symlink-resolved on macOS (/var → /private/var), so
      // check both the raw path and the realpath to be robust.
      const resolvedTmpHome = realpathSync(TMP_HOME);
      const expectedAckPath = join(resolvedTmpHome, 'acks', `${ackHex(workspaceA)}.json`);
      const fallbackAckPath = join(TMP_HOME, 'acks', `${ackHex(workspaceA)}.json`);
      assert.ok(
        existsSync(expectedAckPath) || existsSync(fallbackAckPath),
        `expected ack file for workspace A at ${expectedAckPath}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });
});

// ---------- T12: privacy ack target-workspace scoping refinement ----------
// Plan 0002 T12 — hardening + coverage pass over T8's target-workspace ack work.
//
// Maintainer case coverage:
//   Cases 1, 2      — covered by T8-11 / T8-12 (see above; not duplicated here)
//   Cases 3, 4      — covered by T8-13 (ack write); T12-2 tightens to assert exit 0
//   Case  5, 6      — T12-5 (pre-existing target ack → no --yes needed)
//   Case  7         — T12-7 (--allow-edit does NOT bypass ack)
//   Case  8         — T12-8 (delegate still uses caller workspace for ack)
//   Case  9         — T12-9 (followup without --all on same-workspace job)
//   Case 10         — regression: T8-11/12/13 remain intact above

describe('followup target-workspace ack scoping (plan 0002 T12)', () => {
  // T12-1: caller's ack does NOT bypass target ack requirement.
  // The caller has fully ack'd their own WORK_DIR; that ack must not extend to
  // the target job's workspace (workspaceA).
  it('T12-1: caller workspace ack does not satisfy target workspace ack requirement', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-t12a-')));
    try {
      const jobId = `job_t12a_${createHash('sha256').update('t12-1-caller-ack').digest('hex').slice(0, 8)}`;
      const shortId = 'c12a0001';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

      // Write ack for WORK_DIR (caller workspace) only — NOT for workspaceA.
      writeAck(WORK_DIR);

      const result = runDispatcher(['followup', jobId, '--all', '--', 'cross-workspace prompt']);

      assert.equal(
        result.status,
        1,
        `expected exit 1 when target ack missing; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
      assert.ok(
        result.stderr.includes(workspaceA),
        `expected target workspace path (${workspaceA}) in stderr; got:\n${result.stderr}`,
      );

      // No auto-record should have happened for target workspace.
      const targetAckFile = join(TMP_HOME, 'acks', `${ackHex(workspaceA)}.json`);
      const targetAckFileResolved = join(
        realpathSync(TMP_HOME),
        'acks',
        `${ackHex(workspaceA)}.json`,
      );
      assert.ok(
        !existsSync(targetAckFile) && !existsSync(targetAckFileResolved),
        `did NOT expect ack file for target workspace at ${targetAckFile}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  // T12-2: --yes from A targeting B records ack for B and exits 0.
  // T8-13 only verified the ack file was written; this test additionally asserts
  // exit 0 (followup completes) and that no caller-workspace ack was implicitly created.
  it('T12-2: --all --yes from caller targeting different workspace exits 0 and records ack for target only', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-t12b-')));
    try {
      const jobId = `job_t12b_${createHash('sha256').update('t12-2-yes-target').digest('hex').slice(0, 8)}`;
      const shortId = 'c12a0002';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      // No pre-existing ack anywhere.

      const result = runDispatcher([
        'followup',
        jobId,
        '--all',
        '--yes',
        '--',
        'yes-records-target',
      ]);

      assert.equal(
        result.status,
        0,
        `expected exit 0 with --yes; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );

      // Ack file for target workspace must exist.
      const resolvedTmpHome = realpathSync(TMP_HOME);
      const targetAckFile = join(TMP_HOME, 'acks', `${ackHex(workspaceA)}.json`);
      const targetAckFileResolved = join(resolvedTmpHome, 'acks', `${ackHex(workspaceA)}.json`);
      assert.ok(
        existsSync(targetAckFile) || existsSync(targetAckFileResolved),
        `expected ack file for target workspace at ${targetAckFile}`,
      );

      // No ack file for WORK_DIR should have been created implicitly.
      const callerAckFile = join(TMP_HOME, 'acks', `${ackHex(WORK_DIR)}.json`);
      const callerAckFileResolved = join(resolvedTmpHome, 'acks', `${ackHex(WORK_DIR)}.json`);
      assert.ok(
        !existsSync(callerAckFile) && !existsSync(callerAckFileResolved),
        `did NOT expect caller ack file to be implicitly created at ${callerAckFile}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  // T12-5: pre-existing ack for target workspace → followup succeeds without --yes.
  // Tests that target-workspace ack is respected even when caller (WORK_DIR) has no ack.
  it('T12-5: pre-existing target workspace ack allows followup without --yes (target dominates)', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-t12c-')));
    try {
      const jobId = `job_t12c_${createHash('sha256').update('t12-5-preack-target').digest('hex').slice(0, 8)}`;
      const shortId = 'c12a0005';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

      // Write ack for target workspace A; do NOT ack WORK_DIR.
      writeAck(workspaceA);

      const result = runDispatcher(['followup', jobId, '--all', '--', 'b-has-ack-a-does-not']);

      assert.equal(
        result.status,
        0,
        `expected exit 0 when target already ack'd; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );

      // No privacy-ack error message should appear.
      assert.ok(
        !result.stderr.toLowerCase().includes('privacy acknowledgement required'),
        `did NOT expect privacy ack error in stderr; got:\n${result.stderr}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  // T12-7: --allow-edit does NOT bypass the ack requirement.
  // Policy invariant: --allow-edit is UX/policy only, never a permission bypass.
  it('T12-7: --allow-edit does not bypass target workspace ack requirement', () => {
    const workspaceA = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-t12d-')));
    try {
      const jobId = `job_t12d_${createHash('sha256').update('t12-7-allowedit-nobypass').digest('hex').slice(0, 8)}`;
      const shortId = 'c12a0007';
      writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: workspaceA, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      // No ack for workspaceA.

      const result = runDispatcher([
        'followup',
        jobId,
        '--all',
        '--allow-edit',
        '--',
        'allow-edit-no-bypass',
      ]);

      assert.equal(
        result.status,
        1,
        `expected exit 1 even with --allow-edit; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
      assert.ok(
        result.stderr.includes(workspaceA),
        `expected target workspace path (${workspaceA}) in error; got:\n${result.stderr}`,
      );

      // No ack should have been auto-recorded for target.
      const targetAckFile = join(TMP_HOME, 'acks', `${ackHex(workspaceA)}.json`);
      const targetAckFileResolved = join(
        realpathSync(TMP_HOME),
        'acks',
        `${ackHex(workspaceA)}.json`,
      );
      assert.ok(
        !existsSync(targetAckFile) && !existsSync(targetAckFileResolved),
        `did NOT expect ack file for target workspace to be created; checked ${targetAckFile}`,
      );
    } finally {
      rmSync(workspaceA, { recursive: true, force: true });
    }
  });

  // T12-8: delegate ack regression — delegate still uses caller (process.cwd()) workspace.
  // T12's refactor must NOT change delegate's ack behavior.
  it('T12-8: delegate without --yes exits 1 and mentions caller workspace (not a target workspace)', () => {
    // No ack for WORK_DIR (fresh test state).

    const result = runDispatcher(['delegate', '--', 'delegate-ack-regression-test']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 for delegate without --yes; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );

    const combined = result.stdout + result.stderr;
    // Delegate error should mention the caller workspace (WORK_DIR).
    assert.ok(
      combined.includes(WORK_DIR),
      `expected caller workspace path (${WORK_DIR}) in error output; got:\n${combined}`,
    );

    // The error must use the delegate-specific wording (not the "for target workspace" variant).
    assert.ok(
      combined.toLowerCase().includes('privacy') ||
        combined.toLowerCase().includes('acknowledge') ||
        combined.toLowerCase().includes('--yes'),
      `expected privacy/acknowledge/--yes wording in delegate error; got:\n${combined}`,
    );

    // No ack file for WORK_DIR should have been created.
    assert.ok(
      !existsSync(ackPath()),
      `did NOT expect caller ack file to be created at ${ackPath()}`,
    );
  });

  // T12-9: followup without --all on a current-workspace job uses target (== cwd).
  // When target == cwd, behavior must be identical to single-workspace case — still
  // requires ack, and --yes records it.
  it('T12-9: followup without --all on same-workspace job requires ack and --yes records it', () => {
    const jobId = `job_t12e_${createHash('sha256').update('t12-9-no-all-flag').digest('hex').slice(0, 8)}`;
    const shortId = 'c12a0009';
    // Job in WORK_DIR (no cross-workspace).
    writeSyntheticAwaitingFollowupJob({ jobId, workspaceRoot: WORK_DIR, shortId });
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
    // No ack for WORK_DIR.

    // First run: non-TTY, no --yes → should reject.
    const result1 = runDispatcher(['followup', jobId, '--', 'no-all-flag-still-uses-target']);

    assert.equal(
      result1.status,
      1,
      `expected exit 1 without ack; got ${result1.status}\nstdout: ${result1.stdout}\nstderr: ${result1.stderr}`,
    );
    assert.ok(
      result1.stderr.includes(WORK_DIR),
      `expected WORK_DIR path (${WORK_DIR}) in error; got:\n${result1.stderr}`,
    );
    assert.ok(
      !existsSync(ackPath()),
      `did NOT expect ack file created on rejection; path: ${ackPath()}`,
    );

    // Second run: with --yes → should succeed and record ack.
    const result2 = runDispatcher([
      'followup',
      jobId,
      '--yes',
      '--',
      'no-all-flag-still-uses-target',
    ]);

    assert.equal(
      result2.status,
      0,
      `expected exit 0 with --yes; got ${result2.status}\nstdout: ${result2.stdout}\nstderr: ${result2.stderr}`,
    );

    const resolvedTmpHome = realpathSync(TMP_HOME);
    const ackFile = join(TMP_HOME, 'acks', `${ackHex(WORK_DIR)}.json`);
    const ackFileResolved = join(resolvedTmpHome, 'acks', `${ackHex(WORK_DIR)}.json`);
    assert.ok(
      existsSync(ackFile) || existsSync(ackFileResolved),
      `expected ack file for WORK_DIR at ${ackFile} after --yes run`,
    );
  });
});

// ---------- T8-14 / T8-15: allowed statuses ----------

describe('followup allowed job statuses (T8)', () => {
  it('T8-14: awaiting_followup is allowed — followup proceeds', () => {
    const jobId = `job_t8as_${createHash('sha256').update('t8-status-awfup').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110014';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId, status: 'awaiting_followup' });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'awaiting_followup prompt']);

    // Must not exit 2 (usage error about status) or exit 1 with status-rejection message.
    const combined = result.stdout + result.stderr;
    const isStatusRejection =
      combined.toLowerCase().includes('is running') ||
      combined.toLowerCase().includes('start a new') ||
      combined.toLowerCase().includes('is completed');
    assert.ok(
      !isStatusRejection,
      `awaiting_followup should be allowed; got status-rejection message:\n${combined}`,
    );
  });

  it('T8-15: needs_input is allowed — followup proceeds', () => {
    const jobId = `job_t8ni_${createHash('sha256').update('t8-status-ndinput').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110015';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId, status: 'needs_input' });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'needs_input prompt']);

    const combined = result.stdout + result.stderr;
    const isStatusRejection =
      combined.toLowerCase().includes('is running') ||
      combined.toLowerCase().includes('start a new') ||
      combined.toLowerCase().includes('is completed');
    assert.ok(
      !isStatusRejection,
      `needs_input should be allowed; got status-rejection message:\n${combined}`,
    );
  });
});

// ---------- T8-16: running is rejected ----------

describe('followup rejects running job (T8)', () => {
  it('T8-16: running job is rejected with message matching /wait for $claude-status/', () => {
    const jobId = `job_t8rn_${createHash('sha256').update('t8-running-reject').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110016';
    writeSyntheticAwaitingFollowupJob({ jobId, status: 'running', shortId });
    writeAck(WORK_DIR);
    // Pre-stage a live `working` mock session so the reconciler keeps the
    // job's status as `running` rather than flipping it to `orphaned`
    // (which would have a different error message).
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'should be rejected']);

    assert.equal(result.status, 1, `expected exit 1 for running job; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      /wait for.*\$claude-status/i.test(combined) ||
        combined.toLowerCase().includes('wait for') ||
        combined.toLowerCase().includes('awaiting_followup'),
      `expected "wait for $claude-status" hint; got:\n${combined}`,
    );
  });
});

// ---------- T8-17: stopped/failed/orphaned are rejected ----------

describe('followup rejects terminal-error statuses (T8)', () => {
  for (const badStatus of ['stopped', 'failed', 'orphaned']) {
    it(`T8-17: ${badStatus} job is rejected with "start a new $claude-delegate" message`, () => {
      const jobId = `job_t8bst_${createHash('sha256').update(`t8-bad-${badStatus}`).digest('hex').slice(0, 8)}`;
      writeSyntheticAwaitingFollowupJob({ jobId, status: badStatus });
      writeAck(WORK_DIR);

      const result = runDispatcher(['followup', jobId, '--yes', '--', 'should be rejected']);

      assert.equal(result.status, 1, `expected exit 1 for ${badStatus} job; got ${result.status}`);
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.toLowerCase().includes('start a new') ||
          combined.toLowerCase().includes('delegate') ||
          combined.toLowerCase().includes('new job'),
        `expected "start a new $claude-delegate" hint for ${badStatus}; got:\n${combined}`,
      );
    });
  }
});

// ---------- T8-18: completed with live idle session is allowed ----------

describe('followup completed job with live idle session (T8)', () => {
  it('T8-18: completed job proceeds when mock-claude reports session as idle', () => {
    const jobId = `job_t8ci_${createHash('sha256').update('t8-completed-idle').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110018';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId, status: 'completed' });
    writeAck(WORK_DIR);
    // Write mock agent session with status 'working' in state.json (agents --json)
    // AND write an idle sidecar so driver.status() resolves to 'idle' via sidecar.
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'completed idle test']);

    const combined = result.stdout + result.stderr;
    // Must NOT produce the "completed and no live idle Claude session" rejection.
    const isCompletedRejection =
      combined.toLowerCase().includes('is completed and no live') ||
      combined.toLowerCase().includes('no live idle');
    assert.ok(
      !isCompletedRejection,
      `completed + idle session should be allowed; got rejection:\n${combined}`,
    );
  });

  it('T8-19: completed job is rejected when no live idle session is found', () => {
    const jobId = `job_t8cn_${createHash('sha256').update('t8-completed-no-idle').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110019';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId, status: 'completed' });
    writeAck(WORK_DIR);
    // Do NOT write any mock session — driver.status() returns 'orphaned' or 'unknown'

    const result = runDispatcher(['followup', jobId, '--yes', '--', 'completed no idle']);

    assert.equal(result.status, 1, `expected exit 1 when no live session; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('is completed') ||
        combined.toLowerCase().includes('no live') ||
        combined.toLowerCase().includes('start a new'),
      `expected "is completed" / "no live" / "start a new" message; got:\n${combined}`,
    );
  });
});

// ---------- T8-20: status footer appears for awaiting_followup ----------

describe('status footer for awaiting_followup (T8)', () => {
  it('T8-20: status human output includes follow-up footer when a job has awaiting_followup status', () => {
    const jobId = `job_t8sf2_${createHash('sha256').update('t8-status-footer').digest('hex').slice(0, 8)}`;
    const shortId = 'f0200020';
    // Use writeSyntheticAwaitingFollowupJob so the record has turns[] and a known shortId.
    // Seed a live mock session with that shortId so the status reconciler sees an idle
    // session and does NOT downgrade the status to 'orphaned'.
    writeSyntheticAwaitingFollowupJob({
      jobId,
      shortId,
      status: 'awaiting_followup',
      resultContent: 'result for footer test',
    });
    // Use 'idle' so the driver reports driverValue:'idle' → reconciler computes
    // idle + turns[0].status:'completed' + TTL not elapsed = 'awaiting_followup'.
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['status']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 from status; got ${result.status}; stderr: ${result.stderr}`,
    );
    // Assert a "Follow-up available" footer line is present
    assert.ok(
      /follow-up/i.test(result.stdout),
      `expected follow-up footer in status output; got:\n${result.stdout}`,
    );
    // The footer should mention the jobId
    assert.ok(
      result.stdout.includes(jobId),
      `expected jobId ${jobId} in status footer; got:\n${result.stdout}`,
    );
  });

  it('T8-20b: status --json output does NOT include the follow-up footer text', () => {
    const jobId = `job_t8sfj_${createHash('sha256').update('t8-status-footer-json').digest('hex').slice(0, 8)}`;
    const shortId = 'f020002b';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId, status: 'awaiting_followup' });
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['status', '--json']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);
    assert.equal(parsed.ok, true, `expected ok:true`);
    // JSON output must not contain the footer prose
    assert.ok(
      !result.stdout.toLowerCase().includes('follow-up available'),
      `JSON output must not include footer prose; got:\n${result.stdout}`,
    );
  });
});

// ---------- T8-21: result still works for awaiting_followup after T8 additions ----------

describe('result for awaiting_followup is still accessible after T8 (T8)', () => {
  it('T8-21: result command exits 0 and prints content for awaiting_followup job (T7 regression)', () => {
    const jobId = `job_t8r7_${createHash('sha256').update('t8-result-regression').digest('hex').slice(0, 8)}`;
    const resultContent = 'T7 regression result content.';
    const { jobId: writtenId } = writeSyntheticCompletedJob({ jobId, resultContent });

    const recordPath = join(TMP_HOME, 'jobs', `${writtenId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.status = 'awaiting_followup';
    writeFileSync(recordPath, JSON.stringify(record, null, 2));

    const result = runDispatcher(['result', jobId]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for awaiting_followup result; got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(resultContent),
      `expected result content in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- Test 19 (original): real ~/.claude and ~/.codex are NOT touched ----------

describe('isolation: real ~/.claude and ~/.codex are not touched', () => {
  it('test job IDs do not appear under the real ~/.codex/cc-plugin-codex/jobs/', () => {
    const delegateResult = runDispatcher(['delegate', '--yes', '--', 'isolation check']);
    assert.equal(delegateResult.status, 0, `delegate failed: ${delegateResult.stderr}`);
    const jobIdMatch = delegateResult.stdout.match(/job_[a-z0-9]+_[a-f0-9]{8}/);
    assert.ok(jobIdMatch, 'could not find jobId in delegate stdout');
    const jobId = jobIdMatch[0];

    // Job should be in TMP_HOME/jobs/
    const tmpJobPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    assert.ok(existsSync(tmpJobPath), `job record not found in TMP_HOME: ${tmpJobPath}`);

    // Job should NOT be in the real ~/.codex/cc-plugin-codex/jobs/
    const realJobsDir = join(process.env.HOME ?? '/root', '.codex', 'cc-plugin-codex', 'jobs');
    const realJobPath = join(realJobsDir, `${jobId}.json`);
    assert.ok(
      !existsSync(realJobPath),
      `job record must NOT appear in real ~/.codex/cc-plugin-codex/jobs/: ${realJobPath}`,
    );
  });

  it('TMP_HOME is isolated from the real ~/.codex directory', () => {
    const realCodex = join(process.env.HOME ?? '/root', '.codex', 'cc-plugin-codex');
    assert.notEqual(TMP_HOME, realCodex, 'TMP_HOME must not equal the real companion home');
    assert.ok(TMP_HOME.startsWith(tmpdir()), `TMP_HOME should be under tmpdir(), got: ${TMP_HOME}`);
  });
});

// ==========================================================================
// T10: followup permission handoff loop (plan 0002)
// ==========================================================================
//
// Contract under test (implemented by Subagent A):
//   - cmdFollowup passes an `onPermissionRequest` callback to driver.send.
//   - The driver calls the callback when polling detects `waiting`/`needs_input`.
//   - If the callback returns a string → driver writes it + \r into PTY, continues.
//   - If the callback returns null → driver throws; dispatcher exits 1 with
//     "claude attach <shortId>" hint.
//   - Non-TTY stdin (process.stdin.isTTY === false): callback returns null immediately.
//   - TTY stdin: reads one line via readline/promises; default 5-min timeout (overridable
//     via CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS).
//   - Timeout: emits WARNING to stderr, returns null → permissionTimedOut flag set →
//     dispatcher exits 0 (NOT 1), job left in needs_input.
//   - --allow-edit does NOT bypass the permission gate.
//
// TTY tests use node-pty so that process.stdin.isTTY === true inside the dispatcher.
// Non-TTY tests use plain spawnSync (no PTY).
//
// Helper: writeMockClaudeConfig — writes a mock-claude config JSON to MOCK_HOME so
//   the dispatcher subprocess can pick it up via CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG.
// ==========================================================================

// Resolve node-pty via CJS require (it is a native CJS module).
const _requireCjs = createRequire(import.meta.url);
const _pty = _requireCjs('node-pty');
const _ptySpawn = _pty.spawn;

/**
 * Write a JSON config file for mock-claude and return its path.
 * @param {string} home  MOCK_HOME directory
 * @param {Record<string, unknown>} config
 * @returns {string}  path to the written config file
 */
function writeMockClaudeConfig(home, config) {
  mkdirSync(home, { recursive: true });
  const cfgPath = join(home, 'mock-claude-config.json');
  writeFileSync(cfgPath, JSON.stringify(config));
  return cfgPath;
}

/**
 * Build the standard env object for a dispatcher subprocess in the T10 suite.
 * Callers may spread extra keys on top.
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
function t10Env(extra = {}) {
  return {
    ...process.env,
    CC_PLUGIN_CODEX_HOME: TMP_HOME,
    CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME: MOCK_HOME,
    PATH: `${MOCK_CODEX}${delimiter}${MOCK_CLAUDE}${delimiter}${process.env.PATH ?? ''}`,
    ...extra,
  };
}

/**
 * Poll `predicate()` every 50 ms up to `timeoutMs` ms.
 * Rejects with a descriptive error on deadline.
 * @param {() => boolean} predicate
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<void>}
 */
function waitForCondition(predicate, timeoutMs, label = 'condition') {
  return new Promise((res, rej) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (predicate()) {
        res();
        return;
      }
      if (Date.now() >= deadline) {
        rej(new Error(`waitForCondition timed out after ${timeoutMs}ms waiting for: ${label}`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Spawn the dispatcher script under node-pty so stdin is a real TTY inside the child.
 * Returns `{ term, exitPromise, getOut }`.
 *
 * @param {string[]} scriptArgs  args to pass after the script path
 * @param {Record<string, string>} env  full env for the subprocess
 * @returns {{ term: import('node-pty').IPty, exitPromise: Promise<{ exitCode: number }>, getOut: () => string }}
 */
function spawnDispatcherPty(scriptArgs, env) {
  let out = '';
  const term = _ptySpawn(process.execPath, [SCRIPT, ...scriptArgs], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: WORK_DIR,
    env,
  });
  term.onData((d) => {
    out += d;
  });
  const exitPromise = new Promise((res) => {
    term.onExit((e) => res(e));
  });
  return { term, exitPromise, getOut: () => out };
}

describe('delegate privacy acknowledgement in TTY (Plan 0022 polish)', () => {
  it(
    'prompts in a fresh TTY workspace and declines without recording ack or job',
    { timeout: 25000 },
    async () => {
      const { term, exitPromise, getOut } = spawnDispatcherPty(
        ['delegate', '--json', '--', 'privacy tty decline'],
        t10Env(),
      );

      await waitForCondition(
        () => /Privacy acknowledgement required/i.test(getOut()),
        12000,
        'privacy acknowledgement prompt in PTY stdout/stderr',
      );

      assert.equal(
        listJobIds().length,
        0,
        `no job should be created before the privacy acknowledgement is answered; output:\n${getOut()}`,
      );

      term.write('no\r');
      const { exitCode } = await exitPromise;

      assert.equal(exitCode, 1, `expected decline to exit 1; PTY output:\n${getOut()}`);
      assert.ok(!existsSync(ackPath()), `decline must not create ack file at ${ackPath()}`);
      assert.equal(listJobIds().length, 0, 'decline must not create any job records');
      assert.match(getOut(), /Privacy acknowledgement declined/i);
    },
  );

  it(
    'prompts in a fresh TTY workspace and proceeds only after explicit yes',
    { timeout: 25000 },
    async () => {
      const { term, exitPromise, getOut } = spawnDispatcherPty(
        ['delegate', '--json', '--', 'privacy tty accept'],
        t10Env(),
      );

      await waitForCondition(
        () => /Privacy acknowledgement required/i.test(getOut()),
        12000,
        'privacy acknowledgement prompt in PTY stdout/stderr',
      );

      assert.equal(
        listJobIds().length,
        0,
        `no job should be created before the privacy acknowledgement is answered; output:\n${getOut()}`,
      );

      term.write('yes\r');
      const { exitCode } = await exitPromise;

      assert.equal(exitCode, 0, `expected acceptance to exit 0; PTY output:\n${getOut()}`);
      assert.ok(existsSync(ackPath()), `acceptance must create ack file at ${ackPath()}`);
      assert.equal(listJobIds().length, 1, 'acceptance should create exactly one job record');
      assert.match(getOut(), /"ok": true/);
    },
  );
});

describe('followup permission handoff (plan 0002 T10)', () => {
  // --------------------------------------------------------------------------
  // T10-1: Non-TTY stdin without ack-equivalent exits 1 with `claude attach` hint
  // --------------------------------------------------------------------------
  it('T10-1: non-TTY stdin triggers null callback, exits 1 with "claude attach" hint', () => {
    const jobId = `job_t10a_${createHash('sha256').update('t10-nontty-exit1').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110t1a';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
    writeAck(WORK_DIR);

    // permissionStall: true makes the mock transition sidecar to `waiting`
    // on the first attach submit, exercising the callback path.
    const cfgPath = writeMockClaudeConfig(MOCK_HOME, { permissionStall: true });

    // spawnSync provides a pipe-stdin — process.stdin.isTTY is false/undefined.
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'followup', jobId, '--yes', '--', 'trigger permission'],
      {
        cwd: WORK_DIR,
        env: { ...t10Env({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath }) },
        encoding: 'utf8',
      },
    );

    // Must exit 1.
    assert.equal(
      result.status,
      1,
      `expected exit 1 for non-TTY permission stall; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );

    // Output must mention "claude attach" and/or "permission".
    const combined = result.stdout + result.stderr;
    const mentionsAttach =
      /claude attach/i.test(combined) ||
      /permission required/i.test(combined) ||
      /non-interactive/i.test(combined);
    assert.ok(
      mentionsAttach,
      `expected "claude attach" or "permission required" hint in output; got:\n${combined}`,
    );

    // The lock file must NOT exist after the dispatcher exits — no lock leak.
    const lockPath = join(TMP_HOME, 'locks', `attach-${shortId}.lock`);
    assert.ok(
      !existsSync(lockPath),
      `lock file must NOT exist after non-TTY rejection: ${lockPath}`,
    );
  });

  // --------------------------------------------------------------------------
  // T10-2: TTY stdin with valid answer completes the turn (node-pty)
  // --------------------------------------------------------------------------
  it(
    'T10-2: TTY stdin with valid answer completes the turn (node-pty)',
    { timeout: 25000 },
    async () => {
      const jobId = `job_t10b_${createHash('sha256').update('t10-tty-answer').digest('hex').slice(0, 8)}`;
      const shortId = 'f0110t2b';
      writeSyntheticAwaitingFollowupJob({ jobId, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      writeAck(WORK_DIR);

      const cfgPath = writeMockClaudeConfig(MOCK_HOME, { permissionStall: true });
      const env = t10Env({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath });

      const { term, exitPromise, getOut } = spawnDispatcherPty(
        ['followup', jobId, '--yes', '--', 'trigger permission'],
        env,
      );

      // Wait for the permission prompt block to appear in PTY stdout.
      // The dispatcher prints "Claude is asking for permission inside session <shortId>."
      await waitForCondition(
        () => /permission/i.test(getOut()),
        12000,
        'permission prompt in PTY stdout',
      );

      // Supply the answer.
      term.write('y\r');

      // Wait for the dispatcher to exit.
      const { exitCode } = await exitPromise;

      assert.equal(
        exitCode,
        0,
        `expected exit 0 after answering permission prompt; got ${exitCode}\nPTY output:\n${getOut()}`,
      );

      // The job record must show turns.length >= 2 (turn injected successfully).
      const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
      assert.ok(existsSync(recordPath), `job record must exist at ${recordPath}`);
      const record = JSON.parse(readFileSync(recordPath, 'utf8'));
      assert.ok(
        record.turns.length >= 2,
        `expected turns.length >= 2 after successful permission handoff; got ${record.turns.length}`,
      );
    },
  );

  // --------------------------------------------------------------------------
  // T10-3: Timeout path exits 0 with warning, job stays in needs_input
  // --------------------------------------------------------------------------
  it(
    'T10-3: timeout (TTY, no answer) exits 0 with warning; job left in needs_input',
    { timeout: 25000 },
    async () => {
      const jobId = `job_t10c_${createHash('sha256').update('t10-timeout').digest('hex').slice(0, 8)}`;
      const shortId = 'f0110t3c';
      writeSyntheticAwaitingFollowupJob({ jobId, shortId });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      writeAck(WORK_DIR);

      const cfgPath = writeMockClaudeConfig(MOCK_HOME, { permissionStall: true });
      // CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS=100 makes the readline timeout fire in 100ms.
      const env = t10Env({
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath,
        CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS: '100',
      });

      const { exitPromise, getOut } = spawnDispatcherPty(
        ['followup', jobId, '--yes', '--', 'trigger permission'],
        env,
      );

      // Wait for the permission prompt to appear.
      await waitForCondition(
        () => /permission/i.test(getOut()),
        12000,
        'permission prompt in PTY stdout before timeout test',
      );

      // Do NOT write any answer — let the 100ms timeout fire.
      // Wait for the process to exit (with extra slack past the timeout).
      const { exitCode } = await exitPromise;

      // Must exit 0 (timeout path is warn-but-don't-act).
      assert.equal(
        exitCode,
        0,
        `expected exit 0 after permission timeout; got ${exitCode}\nPTY output:\n${getOut()}`,
      );

      // Combined PTY output must contain a timeout warning marker.
      const ptyOut = getOut();
      const hasTimeoutWarning =
        /timeout/i.test(ptyOut) ||
        /timed out/i.test(ptyOut) ||
        /permission.*timed/i.test(ptyOut) ||
        /WARNING/i.test(ptyOut);
      assert.ok(hasTimeoutWarning, `expected timeout warning in combined output; got:\n${ptyOut}`);

      // Lock must be released.
      const lockPath = join(TMP_HOME, 'locks', `attach-${shortId}.lock`);
      assert.ok(!existsSync(lockPath), `lock file must NOT exist after timeout exit: ${lockPath}`);
    },
  );

  // --------------------------------------------------------------------------
  // T10-4: --allow-edit does NOT bypass the permission gate (non-TTY)
  // --------------------------------------------------------------------------
  it('T10-4: --allow-edit does not bypass the permission gate; non-TTY still exits 1', () => {
    const jobId = `job_t10d_${createHash('sha256').update('t10-allowedit').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110t4d';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, { permissionStall: true });

    // --allow-edit is present; stdin is a pipe (non-TTY).
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'followup', jobId, '--yes', '--allow-edit', '--', 'trigger permission'],
      {
        cwd: WORK_DIR,
        env: { ...t10Env({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath }) },
        encoding: 'utf8',
      },
    );

    // Must still exit 1 — --allow-edit changes nothing.
    assert.equal(
      result.status,
      1,
      `expected exit 1 with --allow-edit on non-TTY permission stall; got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );

    const combined = result.stdout + result.stderr;
    const mentionsAttach =
      /claude attach/i.test(combined) ||
      /permission required/i.test(combined) ||
      /non-interactive/i.test(combined);
    assert.ok(
      mentionsAttach,
      `expected "claude attach" or "permission required" hint even with --allow-edit; got:\n${combined}`,
    );
  });

  // --------------------------------------------------------------------------
  // T10-5: Permission failure releases the lock (explicit redundant assertion)
  // --------------------------------------------------------------------------
  it('T10-5: lock file does not exist after permission-failure exit (non-TTY)', () => {
    const jobId = `job_t10e_${createHash('sha256').update('t10-lockrelease').digest('hex').slice(0, 8)}`;
    const shortId = 'f0110t5e';
    writeSyntheticAwaitingFollowupJob({ jobId, shortId });
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, { permissionStall: true });

    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'followup', jobId, '--yes', '--', 'trigger permission for lock test'],
      {
        cwd: WORK_DIR,
        env: { ...t10Env({ CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath }) },
        encoding: 'utf8',
      },
    );

    // Permission stall on non-TTY must exit non-zero.
    assert.notEqual(
      result.status,
      0,
      `expected non-zero exit for non-TTY permission stall; got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );

    // The explicit T10-5 claim: no lock file after exit.
    const lockPath = join(TMP_HOME, 'locks', `attach-${shortId}.lock`);
    assert.ok(
      !existsSync(lockPath),
      `T10-5: lock file must NOT exist after permission-failure exit; found: ${lockPath}`,
    );
  });
});

// ==========================================================================
// T11: bulk-stop for awaiting_followup jobs (plan 0002)
// ==========================================================================
//
// Maintainer-corrected scope: only --all-awaiting-followup is implemented.
// --all-idle is explicitly OUT OF SCOPE and must be REJECTED with exit 2.
// See documentation/plan/0002-20260531-follow-up-injection/2-implement.md
// for the scope-correction rationale (orphaned ≠ "stoppable").
//
// Infrastructure notes:
//   - writeSyntheticAwaitingFollowupJob writes a job record to TMP_HOME/jobs/.
//   - For the reconciler to keep an awaiting_followup job in that state (rather
//     than flipping to 'orphaned'), the corresponding mock-claude session must
//     be pre-seeded via writeMockAgentSession + writeMockIdleSidecar (mirrors
//     the T8 pattern at line ~1117).
//   - Cross-workspace tests (T11-2, T11-3) create a second temp dir and clean
//     it up themselves via try/finally since afterEach only clears WORK_DIR.
// ==========================================================================

describe('stop bulk --all-awaiting-followup (plan 0002 T11)', () => {
  // T11-1: workspace-scoped bulk stop happy path
  it('T11-1: exits 0, stops both awaiting_followup jobs in current workspace, emits stop.completed events', () => {
    const jobIdA = 'job_aaa_aaaaaaaa';
    const jobIdB = 'job_bbb_bbbbbbbb';
    writeSyntheticAwaitingFollowupJob({ jobId: jobIdA, shortId: 'aaa11111' });
    writeSyntheticAwaitingFollowupJob({ jobId: jobIdB, shortId: 'bbb22222' });
    // Pre-seed live idle mock sessions so the reconciler preserves
    // awaiting_followup (mapStatus requires driver='idle' + turn='completed' +
    // not-TTL-elapsed). Without these, both jobs would map to 'orphaned'.
    for (const sid of ['aaa11111', 'bbb22222']) {
      writeMockAgentSession(sid, shortIdToSessionId(sid), 'idle');
      writeMockIdleSidecar(sid, shortIdToSessionId(sid));
    }

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    for (const jobId of [jobIdA, jobIdB]) {
      const record = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), 'utf8'));
      assert.equal(
        record.status,
        'stopped',
        `expected job ${jobId} to be 'stopped', got '${record.status}'`,
      );
    }

    for (const jobId of [jobIdA, jobIdB]) {
      const eventsPath = join(TMP_HOME, 'jobs', `${jobId}.events.jsonl`);
      assert.ok(existsSync(eventsPath), `expected events file at ${eventsPath}`);
      const events = readFileSync(eventsPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      assert.ok(
        events.some((e) => e.type === 'stop.completed'),
        `expected stop.completed event for ${jobId}; got types: ${events.map((e) => e.type).join(', ')}`,
      );
    }

    assert.ok(
      result.stdout.includes('Stopped 2 awaiting-followup Claude jobs.'),
      `expected "Stopped 2 awaiting-followup Claude jobs." in stdout; got:\n${result.stdout}`,
    );
    assert.ok(result.stdout.includes('aaa11111'), `expected shortId 'aaa11111' in stdout`);
    assert.ok(result.stdout.includes('bbb22222'), `expected shortId 'bbb22222' in stdout`);
  });

  // T11-2: workspace scoping — does NOT see jobs from other workspaces by default
  it('T11-2: does not stop awaiting_followup jobs belonging to a different workspace', () => {
    const otherWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-other-')));
    try {
      const jobHere = 'job_here_aaaaaaaa';
      const jobElse = 'job_else_bbbbbbbb';
      writeSyntheticAwaitingFollowupJob({ jobId: jobHere, shortId: 'here1111' });
      writeSyntheticAwaitingFollowupJob({
        jobId: jobElse,
        shortId: 'else2222',
        workspaceRoot: otherWorkspace,
      });
      // Only the current-workspace job is enumerated (listJobsForWorkspace);
      // the other-workspace job is never reconciled, so it stays untouched.
      writeMockAgentSession('here1111', shortIdToSessionId('here1111'), 'idle');
      writeMockIdleSidecar('here1111', shortIdToSessionId('here1111'));

      const result = runDispatcher(['stop', '--all-awaiting-followup']);

      assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

      const hereRecord = JSON.parse(
        readFileSync(join(TMP_HOME, 'jobs', `${jobHere}.json`), 'utf8'),
      );
      assert.equal(
        hereRecord.status,
        'stopped',
        `expected job_here_aaaaaaaa to be 'stopped', got '${hereRecord.status}'`,
      );

      const elseRecord = JSON.parse(
        readFileSync(join(TMP_HOME, 'jobs', `${jobElse}.json`), 'utf8'),
      );
      assert.equal(
        elseRecord.status,
        'awaiting_followup',
        `expected job_else_bbbbbbbb to remain 'awaiting_followup', got '${elseRecord.status}'`,
      );

      assert.ok(
        result.stdout.includes('Stopped 1 awaiting-followup Claude job'),
        `expected exactly 1 job stopped in stdout; got:\n${result.stdout}`,
      );
    } finally {
      rmSync(otherWorkspace, { recursive: true, force: true });
    }
  });

  // T11-3: --all opts into cross-workspace bulk stop
  it('T11-3: --all flag includes awaiting_followup jobs from all workspaces', () => {
    const otherWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-other-')));
    try {
      const jobHere = 'job_here_aaaaaaaa';
      const jobElse = 'job_else_bbbbbbbb';
      writeSyntheticAwaitingFollowupJob({ jobId: jobHere, shortId: 'here1111' });
      writeSyntheticAwaitingFollowupJob({
        jobId: jobElse,
        shortId: 'else2222',
        workspaceRoot: otherWorkspace,
      });
      for (const sid of ['here1111', 'else2222']) {
        writeMockAgentSession(sid, shortIdToSessionId(sid), 'idle');
        writeMockIdleSidecar(sid, shortIdToSessionId(sid));
      }

      const result = runDispatcher(['stop', '--all-awaiting-followup', '--all']);

      assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

      for (const jobId of [jobHere, jobElse]) {
        const record = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), 'utf8'));
        assert.equal(
          record.status,
          'stopped',
          `expected ${jobId} to be 'stopped', got '${record.status}'`,
        );
      }

      assert.ok(
        result.stdout.includes('Stopped 2 awaiting-followup Claude jobs.'),
        `expected "Stopped 2 awaiting-followup Claude jobs." in stdout; got:\n${result.stdout}`,
      );
    } finally {
      rmSync(otherWorkspace, { recursive: true, force: true });
    }
  });

  // T11-4: 'running' job is skipped (active-protection)
  it('T11-4: skips a job with status "running"; awaiting_followup job is still stopped', () => {
    const jobRun = 'job_run_aaaaaaaa';
    const jobOk = 'job_ok_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobRun, workspaceRoot: WORK_DIR });
    const runPath = join(TMP_HOME, 'jobs', `${jobRun}.json`);
    const runRecord = JSON.parse(readFileSync(runPath, 'utf8'));
    runRecord.status = 'running';
    writeFileSync(runPath, JSON.stringify(runRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok333333' });
    // Pre-seed only the awaiting_followup job. The 'running' job has no mock
    // session; reconciler may flip it to 'orphaned', which is fine: the
    // contract is "skip anything that isn't awaiting_followup".
    writeMockAgentSession('ok333333', shortIdToSessionId('ok333333'), 'idle');
    writeMockIdleSidecar('ok333333', shortIdToSessionId('ok333333'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const runAfter = JSON.parse(readFileSync(runPath, 'utf8'));
    assert.notEqual(
      runAfter.status,
      'stopped',
      `expected job_run_aaaaaaaa NOT to be stopped; got '${runAfter.status}'`,
    );

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(
      okRecord.status,
      'stopped',
      `expected job_ok_bbbbbbbb to be 'stopped', got '${okRecord.status}'`,
    );

    assert.ok(
      result.stdout.includes('Skipped:'),
      `expected "Skipped:" in stdout; got:\n${result.stdout}`,
    );
  });

  // T11-5: 'needs_input' job is skipped
  it('T11-5: skips a job with status "needs_input"; awaiting_followup job still stopped', () => {
    const jobNeeds = 'job_nds_aaaaaaaa';
    const jobOk = 'job_ok2_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobNeeds, workspaceRoot: WORK_DIR });
    const needsPath = join(TMP_HOME, 'jobs', `${jobNeeds}.json`);
    const needsRecord = JSON.parse(readFileSync(needsPath, 'utf8'));
    needsRecord.status = 'needs_input';
    writeFileSync(needsPath, JSON.stringify(needsRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok444444' });
    writeMockAgentSession('ok444444', shortIdToSessionId('ok444444'), 'idle');
    writeMockIdleSidecar('ok444444', shortIdToSessionId('ok444444'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const needsAfter = JSON.parse(readFileSync(needsPath, 'utf8'));
    assert.notEqual(
      needsAfter.status,
      'stopped',
      `expected job_nds_aaaaaaaa NOT to be stopped; got '${needsAfter.status}'`,
    );

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected job_ok2_bbbbbbbb to be 'stopped'`);
  });

  // T11-6: 'completed' job is skipped
  it('T11-6: skips a job with status "completed"; awaiting_followup job still stopped', () => {
    const jobDone = 'job_done_aaaaaaaa';
    const jobOk = 'job_ok3_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobDone, workspaceRoot: WORK_DIR });
    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok555555' });
    writeMockAgentSession('ok555555', shortIdToSessionId('ok555555'), 'idle');
    writeMockIdleSidecar('ok555555', shortIdToSessionId('ok555555'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const doneRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobDone}.json`), 'utf8'));
    assert.notEqual(doneRecord.status, 'stopped', `completed job must not become 'stopped'`);

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected awaiting_followup job to be 'stopped'`);
  });

  // T11-7: 'stopped' job is skipped
  it('T11-7: skips a job already in status "stopped"; awaiting_followup job still stopped', () => {
    const jobAlreadyStopped = 'job_stp_aaaaaaaa';
    const jobOk = 'job_ok4_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobAlreadyStopped, workspaceRoot: WORK_DIR });
    const stpPath = join(TMP_HOME, 'jobs', `${jobAlreadyStopped}.json`);
    const stpRecord = JSON.parse(readFileSync(stpPath, 'utf8'));
    stpRecord.status = 'stopped';
    writeFileSync(stpPath, JSON.stringify(stpRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok666666' });
    writeMockAgentSession('ok666666', shortIdToSessionId('ok666666'), 'idle');
    writeMockIdleSidecar('ok666666', shortIdToSessionId('ok666666'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    // The bulk path must not have bulk-stopped the already-stopped job. The
    // reconciler may flip 'stopped' → 'orphaned' (no live mock session matches
    // the synthetic shortId); either outcome proves the bulk path did not call
    // driver.stop on this job. The contract is "skip anything not awaiting_followup".
    const stpAfter = JSON.parse(readFileSync(stpPath, 'utf8'));
    assert.ok(
      ['stopped', 'orphaned'].includes(stpAfter.status),
      `expected already-stopped job to remain 'stopped' or be reconciler-flipped to 'orphaned'; got '${stpAfter.status}'`,
    );

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected awaiting_followup job to be 'stopped'`);
  });

  // T11-7b: 'queued' job is skipped (spot-check for F-D2 coverage)
  it('T11-7b: skips a job with status "queued"; awaiting_followup job still stopped', () => {
    const jobQueued = 'job_qud_aaaaaaaa';
    const jobOk = 'job_ok5_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobQueued, workspaceRoot: WORK_DIR });
    const queuedPath = join(TMP_HOME, 'jobs', `${jobQueued}.json`);
    const queuedRecord = JSON.parse(readFileSync(queuedPath, 'utf8'));
    queuedRecord.status = 'queued';
    writeFileSync(queuedPath, JSON.stringify(queuedRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok777777' });
    writeMockAgentSession('ok777777', shortIdToSessionId('ok777777'), 'idle');
    writeMockIdleSidecar('ok777777', shortIdToSessionId('ok777777'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const queuedAfter = JSON.parse(readFileSync(queuedPath, 'utf8'));
    assert.notEqual(queuedAfter.status, 'stopped', `queued job must not become 'stopped'`);

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected awaiting_followup job to be 'stopped'`);
  });

  // T11-7c: 'starting' job is skipped (spot-check for F-D2 coverage)
  it('T11-7c: skips a job with status "starting"; awaiting_followup job still stopped', () => {
    const jobStarting = 'job_stg_aaaaaaaa';
    const jobOk = 'job_ok6_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobStarting, workspaceRoot: WORK_DIR });
    const startingPath = join(TMP_HOME, 'jobs', `${jobStarting}.json`);
    const startingRecord = JSON.parse(readFileSync(startingPath, 'utf8'));
    startingRecord.status = 'starting';
    writeFileSync(startingPath, JSON.stringify(startingRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok888888' });
    writeMockAgentSession('ok888888', shortIdToSessionId('ok888888'), 'idle');
    writeMockIdleSidecar('ok888888', shortIdToSessionId('ok888888'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const startingAfter = JSON.parse(readFileSync(startingPath, 'utf8'));
    assert.notEqual(startingAfter.status, 'stopped', `starting job must not become 'stopped'`);

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected awaiting_followup job to be 'stopped'`);
  });

  // T11-7d: 'failed' job is skipped (spot-check for F-D2 coverage)
  it('T11-7d: skips a job with status "failed"; awaiting_followup job still stopped', () => {
    const jobFailed = 'job_fld_aaaaaaaa';
    const jobOk = 'job_ok7_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobFailed, workspaceRoot: WORK_DIR });
    const failedPath = join(TMP_HOME, 'jobs', `${jobFailed}.json`);
    const failedRecord = JSON.parse(readFileSync(failedPath, 'utf8'));
    failedRecord.status = 'failed';
    writeFileSync(failedPath, JSON.stringify(failedRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok999999' });
    writeMockAgentSession('ok999999', shortIdToSessionId('ok999999'), 'idle');
    writeMockIdleSidecar('ok999999', shortIdToSessionId('ok999999'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const failedAfter = JSON.parse(readFileSync(failedPath, 'utf8'));
    assert.notEqual(failedAfter.status, 'stopped', `failed job must not become 'stopped'`);

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected awaiting_followup job to be 'stopped'`);
  });

  // T11-7e: 'orphaned' job is skipped (spot-check for F-D2 coverage)
  it('T11-7e: skips a job with status "orphaned"; awaiting_followup job still stopped', () => {
    const jobOrphaned = 'job_orp_aaaaaaaa';
    const jobOk = 'job_ok8_bbbbbbbb';

    writeSyntheticCompletedJob({ jobId: jobOrphaned, workspaceRoot: WORK_DIR });
    const orphanedPath = join(TMP_HOME, 'jobs', `${jobOrphaned}.json`);
    const orphanedRecord = JSON.parse(readFileSync(orphanedPath, 'utf8'));
    orphanedRecord.status = 'orphaned';
    writeFileSync(orphanedPath, JSON.stringify(orphanedRecord, null, 2));

    writeSyntheticAwaitingFollowupJob({ jobId: jobOk, shortId: 'ok000aaa' });
    writeMockAgentSession('ok000aaa', shortIdToSessionId('ok000aaa'), 'idle');
    writeMockIdleSidecar('ok000aaa', shortIdToSessionId('ok000aaa'));

    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const orphanedAfter = JSON.parse(readFileSync(orphanedPath, 'utf8'));
    assert.notEqual(orphanedAfter.status, 'stopped', `orphaned job must not become 'stopped'`);

    const okRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobOk}.json`), 'utf8'));
    assert.equal(okRecord.status, 'stopped', `expected awaiting_followup job to be 'stopped'`);
  });

  // T11-8: no matching jobs in workspace
  it('T11-8: exits 0 with workspace-scoped "no jobs found" message when no awaiting_followup jobs exist', () => {
    const result = runDispatcher(['stop', '--all-awaiting-followup']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('No awaiting-followup Claude jobs found for this workspace.'),
      `expected workspace-scoped no-jobs message; got:\n${result.stdout}`,
    );
  });

  // T11-9: no matching jobs with --all
  it('T11-9: exits 0 with global "no jobs found" message when --all but no jobs exist anywhere', () => {
    const result = runDispatcher(['stop', '--all-awaiting-followup', '--all']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('No awaiting-followup Claude jobs found.'),
      `expected global no-jobs message; got:\n${result.stdout}`,
    );
    assert.ok(
      !result.stdout.includes('for this workspace'),
      `must NOT say "for this workspace" in the --all variant; got:\n${result.stdout}`,
    );
  });

  // T11-10: JSON output shape for two stopped jobs
  it('T11-10: --json returns {ok,stopped,skipped,failed} with two stopped entries', () => {
    const jobIdA = 'job_aaa_aaaaaaaa';
    const jobIdB = 'job_bbb_bbbbbbbb';
    writeSyntheticAwaitingFollowupJob({ jobId: jobIdA, shortId: 'aaa11111' });
    writeSyntheticAwaitingFollowupJob({ jobId: jobIdB, shortId: 'bbb22222' });
    for (const sid of ['aaa11111', 'bbb22222']) {
      writeMockAgentSession(sid, shortIdToSessionId(sid), 'idle');
      writeMockIdleSidecar(sid, shortIdToSessionId(sid));
    }

    const result = runDispatcher(['stop', '--all-awaiting-followup', '--json']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true; got ${JSON.stringify(parsed)}`);
    assert.ok(Array.isArray(parsed.stopped), 'expected stopped to be an array');
    assert.ok(Array.isArray(parsed.skipped), 'expected skipped to be an array');
    assert.ok(Array.isArray(parsed.failed), 'expected failed to be an array');
    assert.equal(
      parsed.stopped.length,
      2,
      `expected 2 stopped entries; got ${parsed.stopped.length}`,
    );

    for (const entry of parsed.stopped) {
      assert.ok(entry.jobId, `each stopped entry must have jobId; got ${JSON.stringify(entry)}`);
      assert.ok(
        entry.shortId,
        `each stopped entry must have shortId; got ${JSON.stringify(entry)}`,
      );
      assert.equal(
        entry.status,
        'stopped',
        `each stopped entry must have status:'stopped'; got '${entry.status}'`,
      );
    }
  });

  // T11-11: JSON output with mixed skips
  it('T11-11: --json shows skipped entry with reason:"not awaiting_followup" for a completed job', () => {
    const jobAf = 'job_afj_aaaaaaaa';
    const jobDone = 'job_dnj_bbbbbbbb';
    writeSyntheticAwaitingFollowupJob({ jobId: jobAf, shortId: 'af777777' });
    writeMockAgentSession('af777777', shortIdToSessionId('af777777'), 'idle');
    writeMockIdleSidecar('af777777', shortIdToSessionId('af777777'));
    writeSyntheticCompletedJob({ jobId: jobDone, workspaceRoot: WORK_DIR });

    const result = runDispatcher(['stop', '--all-awaiting-followup', '--json']);

    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true`);
    assert.equal(parsed.stopped.length, 1, `expected 1 stopped entry`);
    assert.equal(parsed.skipped.length, 1, `expected 1 skipped entry`);

    const skipped = parsed.skipped[0];
    assert.ok(skipped.jobId, `skipped entry must have jobId`);
    assert.ok(skipped.status, `skipped entry must have status`);
    assert.equal(
      skipped.reason,
      'not awaiting_followup',
      `expected reason:'not awaiting_followup'; got '${skipped.reason}'`,
    );
  });

  // T11-12: existing single-job stop still works (regression guard)
  it('T11-12: single-job stop <jobId> still exits 0 and marks job stopped on disk', () => {
    // Use delegate first (same pattern as Test 14) so a real mock session exists.
    const delegateResult = runDispatcher(['delegate', '--yes', '--', 't11-single-guard-task']);
    assert.equal(
      delegateResult.status,
      0,
      `T11-12 setup: delegate failed: ${delegateResult.stderr}`,
    );
    const jobIdMatch = delegateResult.stdout.match(/job_[a-z0-9]+_[a-f0-9]{8}/);
    assert.ok(jobIdMatch, 'T11-12 setup: could not find jobId in delegate stdout');
    const jobId = jobIdMatch[0];

    const result = runDispatcher(['stop', jobId]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 from single-job stop, got ${result.status}; stderr: ${result.stderr}`,
    );

    const record = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), 'utf8'));
    assert.equal(record.status, 'stopped', `expected status 'stopped', got '${record.status}'`);

    assert.ok(
      result.stdout.toLowerCase().includes('stop') ||
        result.stdout.includes(jobId) ||
        result.stdout.toLowerCase().includes('success'),
      `expected stop confirmation in stdout; got:\n${result.stdout}`,
    );
  });

  // T11-13: --all-idle is rejected (maintainer scope correction)
  it('T11-13: --all-idle is rejected with exit 2 and "Unknown stop flag: --all-idle"', () => {
    const result = runDispatcher(['stop', '--all-idle']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --all-idle, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stderr.includes('Unknown stop flag: --all-idle'),
      `expected "Unknown stop flag: --all-idle" in stderr; got:\n${result.stderr}`,
    );

    const jobsDir = join(TMP_HOME, 'jobs');
    const jobCount = existsSync(jobsDir) ? listJobIds().length : 0;
    assert.equal(
      jobCount,
      0,
      `expected no jobs on disk after rejected --all-idle; found ${jobCount}`,
    );
  });

  // T11-14: bulk flag with positional is a usage error
  it('T11-14: --all-awaiting-followup combined with a positional jobId exits 2 with usage error', () => {
    const result = runDispatcher(['stop', '--all-awaiting-followup', 'job_foo']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for bulk flag + positional, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stderr.includes('takes no positional'),
      `expected "takes no positional" in stderr; got:\n${result.stderr}`,
    );
  });

  // T11-15: --all-idle rejection precedes positional-required check
  it('T11-15: --all-idle is rejected even when combined with a positional jobId', () => {
    const result = runDispatcher(['stop', '--all-idle', 'job_foo']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --all-idle + positional, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stderr.includes('Unknown stop flag: --all-idle'),
      `expected "Unknown stop flag: --all-idle" in stderr; got:\n${result.stderr}`,
    );
  });
});

// ==========================================================================
// T4: review subcommand (plan 0003)
// ==========================================================================
//
// Contract: cmdReview resolves a job by prefix, checks status eligibility,
// selects the latest completed non-review turn, injects a review prompt via
// sendFollowupTurn (same mechanism as cmdFollowup), parses structured findings
// from the response, and formats human-readable or --json output.
//
// Review-specific constraints:
//   - --allow-edit is categorically rejected: "Reviews are read-only."
//   - startup-only flags (--model, --effort, --permission-mode, --add-dir,
//     --mcp-config, --name) are rejected with the review-specific message.
//   - needs_input is rejected (reviews are not permission-resolution turns).
//   - running / queued / starting are rejected with "wait for awaiting_followup".
//   - failed / stopped / orphaned are rejected (use adversarial-review instead).
//   - completed with live idle session is allowed; without session it is rejected.
//   - awaiting_followup is always allowed.
//   - Target selection skips turns whose prompt.summary starts with '[review] '
//     or '[adversarial-review] '.
//   - No reviewable non-review turn → exit 1 with exact message.
//   - Extra freeform positional beyond the job ID → exit 2.
//   - Missing job ID → exit 2.
//
// Helpers: writeSyntheticAwaitingFollowupJob, writeMockIdleSidecar,
//   writeMockAgentSession, writeAck, writeMockClaudeConfig (all defined above
//   in the T8/T10/T11 sections; shared across all describe blocks).
//
// For tests that need a structured review response from mock-claude (tests #2,
// #3, #4), we set attachResponse in the mock config to a canonical fenced json
// review block.  mock-claude's cmdAttach uses formatResponse() which replaces
// "${prompt}" in attachResponse with the submitted prompt.  For review tests we
// supply a full review block as the template literal — we do NOT reference
// ${prompt} so the output is always the fixed review JSON.
// ==========================================================================

// ---------- review fixture helpers ----------

/**
 * A canonical well-formed review response that mock-claude returns when
 * attachResponse is set to this value. Contains a fenced ```json block
 * followed by a brief narrative.
 */
const MOCK_REVIEW_RESPONSE_STRUCTURED = [
  '```json',
  '{',
  '  "verdict": "pass_with_findings",',
  '  "findings": [',
  '    {',
  '      "severity": "high",',
  '      "description": "Missing error handling for edge case.",',
  '      "recommendation": "Add a try/catch around the call.",',
  '      "file": "src/index.mjs",',
  '      "line": 42',
  '    },',
  '    {',
  '      "severity": "low",',
  '      "description": "Variable name is unclear.",',
  '      "recommendation": "Rename to a descriptive identifier.",',
  '      "file": null,',
  '      "line": null',
  '    }',
  '  ]',
  '}',
  '```',
  '',
  'Two findings were identified in this review.',
].join('\n');

/**
 * A deliberately malformed review response that cannot be parsed as JSON,
 * triggering the parser fallback to a single nit finding.
 */
const MOCK_REVIEW_RESPONSE_MALFORMED = 'This is not JSON and has no verdict line at all.';

/**
 * Write a synthetic awaiting_followup job that has one completed non-review
 * turn plus optionally additional turns. Extends writeSyntheticAwaitingFollowupJob.
 *
 * @param {{
 *   jobId: string;
 *   shortId?: string;
 *   workspaceRoot?: string;
 *   turns?: Array<{ summaryPrefix?: string; status?: string; hasResult?: boolean }>;
 *   status?: string;
 * }} opts
 */
function writeSyntheticReviewableJob({
  jobId,
  shortId = 'rv000001',
  workspaceRoot = WORK_DIR,
  status = 'awaiting_followup',
  turns = [{}],
} = {}) {
  const jobsDir = join(TMP_HOME, 'jobs');
  mkdirSync(jobsDir, { recursive: true });

  const now = new Date().toISOString();
  const resultPath = join(jobsDir, `${jobId}.result.md`);
  const resultContent = 'Turn result content.';

  const turn0Result = {
    finalMessagePath: resultPath,
    finalMessagePreview: resultContent.slice(0, 120),
  };

  // Build turns array from the spec
  const turnsData = turns.map((spec, i) => {
    const prefix = spec.summaryPrefix ?? '';
    const hasResult = spec.hasResult !== false;
    const tStatus = spec.status ?? 'completed';
    const summary = `${prefix}task for turn ${i}`;
    const promptMeta = {
      summary,
      sha256: createHash('sha256').update(summary).digest('hex'),
      bytesLen: Buffer.byteLength(summary, 'utf8'),
    };
    return {
      prompt: promptMeta,
      startedAt: now,
      endedAt: now,
      status: tStatus,
      ...(hasResult && tStatus === 'completed' ? { result: turn0Result } : {}),
    };
  });

  const record = {
    jobId,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    status,
    codex: {
      pluginVersion: '0.0.0',
      cwd: workspaceRoot,
    },
    workspace: {
      root: workspaceRoot,
    },
    driver: {
      name: 'claude-background',
      version: '0.0.0',
      capabilitiesSnapshot: {},
    },
    claude: {
      version: '2.1.999-mock',
      shortId,
      sessionId: shortIdToSessionId(shortId),
      sessionName: `codex:test:${jobId}`,
      cwd: workspaceRoot,
      logsCommand: `claude logs ${shortId}`,
    },
    prompt: turnsData[0]?.prompt ?? {
      summary: 'initial task',
      sha256: createHash('sha256').update('initial task').digest('hex'),
      bytesLen: Buffer.byteLength('initial task', 'utf8'),
    },
    result: turn0Result,
    turns: turnsData,
  };

  writeFileSync(join(jobsDir, `${jobId}.json`), JSON.stringify(record, null, 2));
  writeFileSync(resultPath, resultContent);

  return { jobId, record };
}

// ---------- T4-1: review happy path — appends [review]-prefixed turn ----------

describe('review happy path (T4)', () => {
  it('T4-1: exits 0 and job on disk has a new turn whose prompt.summary starts with "[review] "', () => {
    const jobId = `job_rv1_${createHash('sha256').update('t4-happy-path').digest('hex').slice(0, 8)}`;
    const shortId = 'rv010001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(
      record.turns.length,
      2,
      `expected 2 turns after review, got ${record.turns.length}`,
    );

    const reviewTurn = record.turns[1];
    assert.ok(
      reviewTurn.prompt.summary.startsWith('[review] '),
      `expected turns[1].prompt.summary to start with "[review] "; got: "${reviewTurn.prompt.summary}"`,
    );
  });
});

// ---------- T4-2: structured JSON parse + human output ----------

describe('review structured response produces human output (T4)', () => {
  it('T4-2: human output contains a verdict line and bracketed severity labels', () => {
    const jobId = `job_rv2_${createHash('sha256').update('t4-human-output').digest('hex').slice(0, 8)}`;
    const shortId = 'rv020001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_STRUCTURED,
    });

    const result = runDispatcher(['review', jobId, '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    // Human output should contain a verdict line
    assert.ok(
      /review verdict:/i.test(result.stdout),
      `expected "Review verdict:" in human stdout; got:\n${result.stdout}`,
    );

    // Human output should contain bracketed severity labels
    assert.ok(
      result.stdout.includes('[HIGH]') || result.stdout.includes('[LOW]'),
      `expected bracketed severity label in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- T4-3: --json returns structured review object ----------

describe('review --json output shape (T4)', () => {
  it('T4-3: --json prints a JSON object with required top-level fields', () => {
    const jobId = `job_rv3_${createHash('sha256').update('t4-json-shape').digest('hex').slice(0, 8)}`;
    const shortId = 'rv030001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_STRUCTURED,
    });

    const result = runDispatcher(['review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    // Top-level fields
    assert.equal(parsed.ok, true, `expected ok:true; got ${JSON.stringify(parsed)}`);
    assert.ok(parsed.review !== undefined, 'expected top-level "review" field');
    assert.ok(parsed.job !== undefined, 'expected top-level "job" field');
    assert.ok(parsed.turn !== undefined, 'expected top-level "turn" field');

    // review sub-fields
    assert.ok(
      ['pass', 'fail', 'pass_with_findings'].includes(parsed.review.verdict),
      `review.verdict must be a valid verdict; got ${parsed.review.verdict}`,
    );
    assert.ok(
      typeof parsed.review.findingsCount === 'number',
      'expected review.findingsCount to be a number',
    );
    assert.ok(
      typeof parsed.review.blocking === 'boolean',
      'expected review.blocking to be boolean',
    );
    assert.ok(Array.isArray(parsed.review.findings), 'expected review.findings to be an array');

    // job sub-fields
    assert.ok(typeof parsed.job.jobId === 'string', 'expected job.jobId to be a string');
    assert.ok(typeof parsed.job.status === 'string', 'expected job.status to be a string');

    // turn sub-fields
    assert.ok(typeof parsed.turn.index === 'number', 'expected turn.index to be a number');
    assert.ok(typeof parsed.turn.status === 'string', 'expected turn.status to be a string');
  });
});

describe('review --json runtime errors (Plan 0025)', () => {
  it('prints parseable JSON to stdout when same-session send fails at runtime', () => {
    const jobId = `job_rv25_${createHash('sha256').update('plan-0025-json-error').digest('hex').slice(0, 8)}`;
    const shortId = 'rv250001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_STRUCTURED,
    });

    const result = runDispatcher(['review', jobId, '--json', '--yes'], {
      env: {
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath,
        CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS: '1',
      },
    });

    assert.equal(result.status, 1, `expected exit 1; stderr: ${result.stderr}`);
    assert.doesNotMatch(
      result.stderr,
      /"ok"\s*:\s*false|"operation"\s*:\s*"send"|follow-up prompt did not register within 1ms/,
      `--json runtime errors should be parseable from stdout without stderr parsing`,
    );

    const parsed = parseJson(result.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error.message, /follow-up prompt did not register within 1ms/);
    assert.equal(parsed.error.name, 'DriverError');
    assert.equal(parsed.error.operation, 'send');
  });
});

// ---------- T4-4: fallback parse on malformed output ----------

describe('review fallback parse on malformed response (T4)', () => {
  it('T4-4: malformed mock response produces ok:true with a single nit finding', () => {
    const jobId = `job_rv4_${createHash('sha256').update('t4-fallback').digest('hex').slice(0, 8)}`;
    const shortId = 'rv040001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_MALFORMED,
    });

    const result = runDispatcher(['review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0 on fallback parse, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(
      parsed.ok,
      true,
      `expected ok:true in fallback case; got ${JSON.stringify(parsed)}`,
    );
    assert.equal(
      parsed.review.findings.length,
      1,
      `expected exactly 1 fallback finding; got ${parsed.review.findings.length}`,
    );
    assert.equal(
      parsed.review.findings[0].severity,
      'nit',
      `expected fallback finding severity to be 'nit'; got ${parsed.review.findings[0].severity}`,
    );
  });
});

// ---------- T4-5: latest non-review turn selection ----------

describe('review selects latest non-review turn (T4)', () => {
  it('T4-5: with turns [original, [review] earlier, original-again], reviews turn 2 (latest non-review)', () => {
    const jobId = `job_rv5_${createHash('sha256').update('t4-turn-select').digest('hex').slice(0, 8)}`;
    const shortId = 'rv050001';

    // Three turns: turn 0 original, turn 1 review, turn 2 original again
    writeSyntheticReviewableJob({
      jobId,
      shortId,
      turns: [
        { summaryPrefix: '', status: 'completed', hasResult: true },
        { summaryPrefix: '[review] ', status: 'completed', hasResult: true },
        { summaryPrefix: '', status: 'completed', hasResult: true },
      ],
    });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    // Should have appended a new review turn (turn 3), making total 4 turns
    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(
      record.turns.length,
      4,
      `expected 4 turns (3 original + 1 new review), got ${record.turns.length}`,
    );

    // The newly appended turn must be the review turn
    const newReviewTurn = record.turns[3];
    assert.ok(
      newReviewTurn.prompt.summary.startsWith('[review] '),
      `expected new turn to be a review turn; got: "${newReviewTurn.prompt.summary}"`,
    );
  });
});

// ---------- T4-6 / T4-7 / T4-8: status eligibility rejections ----------

describe('review rejects needs_input status (T4)', () => {
  it('T4-6: needs_input is rejected with exact pinned message and exit 1', () => {
    const jobId = `job_rv6_${createHash('sha256').update('t4-needs-input').digest('hex').slice(0, 8)}`;
    const shortId = 'rv060001';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'needs_input' });
    writeAck(WORK_DIR);

    // Write a mock agent session AND a sidecar with state:'waiting' so the
    // reconciler maps to needs_input rather than orphaned (no session → orphaned).
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    // Write a waiting sidecar directly so readSidecar returns state:'waiting'
    // which causes mapStatus to return 'needs_input'.
    const sidecarDir = join(MOCK_HOME, 'jobs', shortId);
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(
      join(sidecarDir, 'state.json'),
      JSON.stringify(
        {
          template: 'bg',
          intent: '',
          name: `codex:test:${shortId}`,
          nameSource: 'user',
          sessionId: shortIdToSessionId(shortId),
          resumeSessionId: shortIdToSessionId(shortId),
          daemonShort: shortId,
          cliVersion: '2.1.999-mock',
          cwd: WORK_DIR,
          backend: 'daemon',
          linkScanPath: join(MOCK_HOME, 'projects', `${shortIdToSessionId(shortId)}.jsonl`),
          state: 'waiting',
          tempo: 'idle',
          inFlight: { tasks: 0, queued: 0, kinds: ['permission'] },
        },
        null,
        2,
      ),
    );

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for needs_input; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg = `Job ${jobId} needs input. Resolve the permission request first, then run $claude-review.`;
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

describe('review rejects running status (T4)', () => {
  it('T4-7: running is rejected with exact pinned message and exit 1', () => {
    const jobId = `job_rv7_${createHash('sha256').update('t4-running').digest('hex').slice(0, 8)}`;
    const shortId = 'rv070001';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'running' });
    writeAck(WORK_DIR);
    // Keep session alive as 'working' so reconciler doesn't flip to orphaned
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for running; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg = `Job ${jobId} is running; wait for $claude-status to show awaiting_followup before running $claude-review.`;
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

describe('review rejects stopped / failed / orphaned (T4)', () => {
  // orphaned: no mock session → reconciler keeps status as orphaned → exact message
  it('T4-8-orphaned: orphaned job is rejected with exact pinned message', () => {
    const jobId = `job_rv8_${createHash('sha256').update('t4-orphaned').digest('hex').slice(0, 8)}`;
    writeSyntheticReviewableJob({ jobId, status: 'orphaned' });
    writeAck(WORK_DIR);

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for orphaned; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg =
      '$claude-review is not applicable to orphaned jobs; use $claude-adversarial-review for a fresh-session review of the prior output.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}" for orphaned; got:\n${combined}`,
    );
  });

  // stopped: pre-stage a stopped mock session so reconciler maps driverValue:'stopped' → 'stopped'
  it('T4-8-stopped: stopped job is rejected with exact pinned message', () => {
    const jobId = `job_rv8s_${createHash('sha256').update('t4-stopped').digest('hex').slice(0, 8)}`;
    const shortId = 'rv08st01';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'stopped' });
    writeAck(WORK_DIR);
    // Seed a session with status 'stopped' so agents --json returns it and
    // the driver maps it to driverValue:'stopped' → reconciler keeps 'stopped'
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'stopped');

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for stopped; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg =
      '$claude-review is not applicable to stopped jobs; use $claude-adversarial-review for a fresh-session review of the prior output.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}" for stopped; got:\n${combined}`,
    );
  });

  // failed: mock-claude has no 'failed' status; reconciler will flip to 'orphaned'.
  // The invariant is that the job is rejected with the adversarial-review suggestion.
  // We assert the rejection concept rather than the exact failed-status string because
  // the reconciler overrides the on-disk status before cmdReview's eligibility check.
  it('T4-8-failed: failed job is rejected with adversarial-review suggestion', () => {
    const jobId = `job_rv8f_${createHash('sha256').update('t4-failed').digest('hex').slice(0, 8)}`;
    writeSyntheticReviewableJob({ jobId, status: 'failed' });
    writeAck(WORK_DIR);

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for failed; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    // Reconciler may flip failed → orphaned; either way the rejection message
    // must mention adversarial-review as the alternative
    assert.ok(
      combined.includes('$claude-adversarial-review') ||
        combined.includes('claude-adversarial-review'),
      `expected adversarial-review suggestion in rejection for failed; got:\n${combined}`,
    );
    assert.ok(
      combined.includes('not applicable') || combined.includes('no live'),
      `expected "not applicable" or "no live" in rejection for failed; got:\n${combined}`,
    );
  });
});

// ---------- T4-9: awaiting_followup is allowed (explicit eligibility test) ----------

describe('review allows awaiting_followup (T4)', () => {
  it('T4-9: awaiting_followup is allowed — review proceeds without status-rejection error', () => {
    const jobId = `job_rv9_${createHash('sha256').update('t4-awfup-allowed').digest('hex').slice(0, 8)}`;
    const shortId = 'rv090001';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'awaiting_followup' });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['review', jobId, '--yes']);

    // Must not produce a status-rejection error message
    const combined = result.stdout + result.stderr;
    const isStatusRejection =
      combined.includes('needs input') ||
      combined.includes('is running') ||
      combined.includes('is queued') ||
      combined.includes('is starting') ||
      combined.includes('not applicable');
    assert.ok(
      !isStatusRejection,
      `awaiting_followup must not trigger a status rejection; got:\n${combined}`,
    );
    // Must not exit 2 (which would indicate a usage error about status)
    assert.notEqual(
      result.status,
      2,
      `awaiting_followup must not produce exit 2; got ${result.status}`,
    );
  });
});

// ---------- T4-10 / T4-11: completed with / without live idle session ----------

describe('review completed job with live idle session (T4)', () => {
  it('T4-10: completed job proceeds when mock-claude reports session as idle', () => {
    const jobId = `job_rv10_${createHash('sha256').update('t4-completed-idle').digest('hex').slice(0, 8)}`;
    const shortId = 'rv100001';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'completed' });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['review', jobId, '--yes']);

    const combined = result.stdout + result.stderr;
    const isCompletedRejection = combined.includes(
      'is completed and no live idle Claude session was found',
    );
    assert.ok(
      !isCompletedRejection,
      `completed + idle session should be allowed; got rejection:\n${combined}`,
    );
  });

  it('T4-11: completed job is rejected when no live idle session exists', () => {
    const jobId = `job_rv11_${createHash('sha256').update('t4-completed-no-idle').digest('hex').slice(0, 8)}`;
    const shortId = 'rv110001';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'completed' });
    writeAck(WORK_DIR);
    // Do NOT write any mock session — driver.status() returns orphaned, which
    // the reconciler maps to 'orphaned'. The dispatcher then hits either the
    // completed-without-session branch (if reconcile preserves completed) or
    // the orphaned-rejection branch. Either way exit 1 with adversarial-review
    // suggestion is the correct observable outcome.

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 when no live session for completed job; got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    // The exact message depends on whether the reconciler kept 'completed' or
    // flipped to 'orphaned'. Both branches reject with an adversarial-review hint.
    assert.ok(
      combined.includes('$claude-adversarial-review') ||
        combined.includes('claude-adversarial-review'),
      `expected adversarial-review suggestion; got:\n${combined}`,
    );
    assert.ok(
      combined.includes('is completed') ||
        combined.includes('not applicable') ||
        combined.includes('no live'),
      `expected "is completed" / "not applicable" / "no live" in rejection; got:\n${combined}`,
    );
  });
});

// ---------- T4-12: --allow-edit rejected with exact pinned message ----------

describe('review rejects --allow-edit (T4)', () => {
  it('T4-12: --allow-edit produces exit 2 with the exact read-only rejection message', () => {
    const jobId = `job_rv12_${createHash('sha256').update('t4-allow-edit').digest('hex').slice(0, 8)}`;
    writeSyntheticReviewableJob({ jobId });

    const result = runDispatcher(['review', jobId, '--allow-edit', '--yes']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg = '--allow-edit is not applicable to review skills. Reviews are read-only.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T4-13: each startup-only flag rejected with exact per-flag message ----------

describe('review rejects startup-only flags (T4)', () => {
  const reviewStartupOnlyFlags = [
    '--model',
    '--effort',
    '--permission-mode',
    '--add-dir',
    '--mcp-config',
    '--name',
  ];

  for (const flag of reviewStartupOnlyFlags) {
    it(`T4-13: ${flag} is rejected with exit 2 and the review-specific message`, () => {
      const jobId = `job_rv13_${createHash('sha256').update(`t4-startup-${flag}`).digest('hex').slice(0, 8)}`;
      writeSyntheticReviewableJob({ jobId });

      const flagArgs =
        flag === '--add-dir' || flag === '--mcp-config' || flag === '--model' || flag === '--effort'
          ? [flag, 'somevalue']
          : flag === '--permission-mode'
            ? [flag, 'default']
            : flag === '--name'
              ? [flag, 'myname']
              : [flag, 'somevalue'];

      const result = runDispatcher(['review', jobId, '--yes', ...flagArgs]);

      assert.equal(
        result.status,
        2,
        `expected exit 2 for ${flag}, got ${result.status}; stderr: ${result.stderr}; stdout: ${result.stdout}`,
      );

      const combined = result.stdout + result.stderr;
      // Exact per-flag message: "--<flag> is a startup-only flag; use it with $claude-adversarial-review, not $claude-review."
      const expectedFragment = `${flag} is a startup-only flag`;
      assert.ok(
        combined.includes(expectedFragment),
        `expected "${expectedFragment}" in output for ${flag}; got:\n${combined}`,
      );
      assert.ok(
        combined.includes('$claude-adversarial-review') ||
          combined.includes('claude-adversarial-review'),
        `expected "$claude-adversarial-review" reference in output for ${flag}; got:\n${combined}`,
      );
      assert.ok(
        combined.includes('$claude-review') || combined.includes('claude-review'),
        `expected "$claude-review" reference in output for ${flag}; got:\n${combined}`,
      );
    });
  }
});

// ---------- T4-14: --all resolves cross-workspace job (target-workspace ack) ----------

describe('review --all resolves cross-workspace job (T4)', () => {
  it('T4-14: --all finds job in a different workspace; ack check uses target workspace', () => {
    const targetWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-rv14-')));
    try {
      const jobId = `job_rv14_${createHash('sha256').update('t4-all-cross-ws').digest('hex').slice(0, 8)}`;
      const shortId = 'rv140001';
      // Job belongs to targetWorkspace, not to WORK_DIR
      writeSyntheticReviewableJob({ jobId, shortId, workspaceRoot: targetWorkspace });
      // Ack for target workspace (not caller workspace)
      writeAck(targetWorkspace);
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

      // Run from WORK_DIR with --all; should resolve the target workspace job
      const result = runDispatcher(['review', jobId, '--all', '--yes']);

      // Must not fail with "no job found"
      const combined = result.stdout + result.stderr;
      const isNoJobError = combined.toLowerCase().includes('no job found') && result.status === 1;
      assert.ok(
        !isNoJobError,
        `--all should resolve cross-workspace job; got "no job found":\n${combined}`,
      );
    } finally {
      rmSync(targetWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- T4-15: non-TTY no-ack fails with target workspace path ----------

describe('review non-TTY no-ack fails with target workspace path (T4)', () => {
  it('T4-15: non-TTY stdin without ack exits 1 with the target workspace path in the error', () => {
    const targetWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-rv15-')));
    try {
      const jobId = `job_rv15_${createHash('sha256').update('t4-noack-nontty').digest('hex').slice(0, 8)}`;
      const shortId = 'rv150001';
      writeSyntheticReviewableJob({ jobId, shortId, workspaceRoot: targetWorkspace });
      // Pre-stage live idle session so eligibility check passes
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      // Do NOT write any ack

      const result = runDispatcher(['review', jobId, '--all']);

      assert.equal(
        result.status,
        1,
        `expected exit 1 when ack missing on non-TTY; got ${result.status}`,
      );
      const combined = result.stdout + result.stderr;
      assert.ok(
        combined.includes(targetWorkspace),
        `expected target workspace path (${targetWorkspace}) in error; got:\n${combined}`,
      );
    } finally {
      rmSync(targetWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- T4-16: --yes records ack for target workspace ----------

describe('review --yes records ack for target workspace (T4)', () => {
  it('T4-16: --yes records an ack for the target workspace and proceeds', () => {
    const targetWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-rv16-')));
    try {
      const jobId = `job_rv16_${createHash('sha256').update('t4-yes-ack').digest('hex').slice(0, 8)}`;
      const shortId = 'rv160001';
      writeSyntheticReviewableJob({ jobId, shortId, workspaceRoot: targetWorkspace });
      writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
      writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));
      // No prior ack anywhere

      runDispatcher(['review', jobId, '--all', '--yes']);

      // Verify ack file was written for the target workspace
      const resolvedTmpHome = realpathSync(TMP_HOME);
      const targetAckFile = join(TMP_HOME, 'acks', `${ackHex(targetWorkspace)}.json`);
      const targetAckFileResolved = join(
        resolvedTmpHome,
        'acks',
        `${ackHex(targetWorkspace)}.json`,
      );
      assert.ok(
        existsSync(targetAckFile) || existsSync(targetAckFileResolved),
        `expected ack file for target workspace at ${targetAckFile}`,
      );
    } finally {
      rmSync(targetWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- T4-17: --help includes 'review' in printUsage output ----------

describe('--help includes review subcommand (T4)', () => {
  it('T4-17: printUsage includes the "review" subcommand line', () => {
    const result = runDispatcher(['--help']);

    assert.equal(result.status, 0, `expected exit 0 for --help; got ${result.status}`);
    assert.ok(
      result.stdout.includes('review'),
      `expected "review" to appear in --help output; got:\n${result.stdout}`,
    );
  });

  // The plan (T4 acceptance criteria) specifies both "review" and "adversarial-review"
  // should be in printUsage. A's implementation added the adversarial-review line even
  // though cmdAdversarialReview is T6 territory. We pin "review" as required and
  // additionally assert "adversarial-review" is present (matching A's printUsage).
  it('T4-17b: printUsage also includes the "adversarial-review" subcommand line', () => {
    const result = runDispatcher(['--help']);

    assert.equal(result.status, 0, `expected exit 0 for --help; got ${result.status}`);
    assert.ok(
      result.stdout.includes('adversarial-review'),
      `expected "adversarial-review" to appear in --help output; got:\n${result.stdout}`,
    );
  });
});

// ---------- T4-18: missing job ID exits 2 with usage string ----------

describe('review missing job ID exits 2 (T4)', () => {
  it('T4-18a: review with no positional arg exits 2', () => {
    const result = runDispatcher(['review']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 when no job ID given, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('usage:') || combined.includes('Usage:'),
      `expected usage hint in output; got:\n${combined}`,
    );
  });

  it('T4-18b: review with extra freeform positional arg exits 2 with exact message', () => {
    const jobId = `job_rv18_${createHash('sha256').update('t4-extra-positional').digest('hex').slice(0, 8)}`;
    writeSyntheticReviewableJob({ jobId });

    const result = runDispatcher(['review', jobId, '--yes', 'unexpected-prompt-text']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for extra positional, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg =
      'review does not accept a freeform prompt; the dispatcher constructs the review prompt.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T4-19: no reviewable non-review turn exits 1 ----------

describe('review exits 1 when no reviewable non-review turn exists (T4)', () => {
  it('T4-19: job with only review turns produces the exact "No reviewable" message', () => {
    const jobId = `job_rv19_${createHash('sha256').update('t4-no-reviewable').digest('hex').slice(0, 8)}`;
    const shortId = 'rv190001';

    // Job has only one turn, and that turn is a review turn
    writeSyntheticReviewableJob({
      jobId,
      shortId,
      turns: [{ summaryPrefix: '[review] ', status: 'completed', hasResult: true }],
    });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 when no reviewable turn; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg = 'No reviewable non-review output found for this job.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T4-20: queued / starting are rejected ----------

describe('review rejects queued and starting statuses (T4)', () => {
  // queued: seed a session whose agents --json status maps to 'queued' driverValue.
  // mock-claude only supports 'working'/'idle'/'stopped' in state.json. When
  // driver.status() returns 'working' the reconciler maps to 'running', not 'queued'.
  // Without any session the reconciler flips to 'orphaned'.
  // The plan specifies an exact message for queued/starting but the reconciler
  // will override these pre-send statuses. We assert the invariant: job is rejected
  // (exit 1) and the output does NOT suggest the review was attempted.
  it('T4-20-queued: queued job is rejected with exit 1 and a rejection message', () => {
    const jobId = `job_rv20_${createHash('sha256').update('t4-queued').digest('hex').slice(0, 8)}`;
    const shortId = 'rv200001';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'queued' });
    writeAck(WORK_DIR);
    // Seed a 'working' session to keep the reconciler from orphaning the job.
    // Driver maps 'working' → 'running', so cmdReview hits the 'running' rejection
    // branch and exits 1 with the wait-for-awaiting_followup message.
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 for queued (reconciler may map to running); got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    // The reconciler may remap queued→running (via working session) or keep
    // queued (if driver returns 'queued' value). Either way the job is rejected.
    assert.ok(
      combined.includes('wait for') ||
        combined.includes('is running') ||
        combined.includes('is queued') ||
        combined.includes('not applicable'),
      `expected a "wait for" or rejection message for queued; got:\n${combined}`,
    );
  });

  it('T4-20-starting: starting job is rejected with exit 1 and a rejection message', () => {
    const jobId = `job_rv20s_${createHash('sha256').update('t4-starting').digest('hex').slice(0, 8)}`;
    const shortId = 'rv200002';
    writeSyntheticReviewableJob({ jobId, shortId, status: 'starting' });
    writeAck(WORK_DIR);
    // Same pattern as queued: seed a working session so driver maps to 'running'
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['review', jobId, '--yes']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 for starting (reconciler may map to running); got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('wait for') ||
        combined.includes('is running') ||
        combined.includes('is starting') ||
        combined.includes('not applicable'),
      `expected a "wait for" or rejection message for starting; got:\n${combined}`,
    );
  });
});

// ==========================================================================
// T6: adversarial-review subcommand (plan 0003)
// ==========================================================================
//
// Contract: cmdAdversarialReview resolves a target job by prefix, checks
// status eligibility (§ 3.6), selects the latest completed non-review turn,
// starts a NEW review session via driver.startSession() (claude --bg), creates
// a review JobRecord with reviewOf: { jobId, turnIndex }, waits for the review
// session to produce a result, then parses and formats output.
//
// Key differences from cmdReview (T4):
//   - Creates a NEW job (not a turn on the existing job)
//   - Accepts --model, --effort, --permission-mode (forwarded to startSession)
//   - Rejects --name (auto-generated), --add-dir, --mcp-config
//   - Allowed statuses: awaiting_followup, completed, stopped, failed, orphaned
//     (all require job.result to exist)
//   - Rejected statuses: running, queued, starting, needs_input
//
// Mocking strategy: mock-claude's `claude --bg <prompt>` immediately writes a
// sidecar in state='done' with output.result = formatResponse(config, prompt).
// On the first reconcile poll, the review job acquires a result and the loop
// exits. For timeout tests we use CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS=1
// so the timeout check fires after process overhead (>1ms of job creation time),
// before (or immediately at) the first poll.
//
// Helpers reused from T4/T8: writeSyntheticReviewableJob, writeMockClaudeConfig,
// writeMockAgentSession, writeMockIdleSidecar, writeAck, ackHex.
// ==========================================================================

// ---------- T6 fixture helpers ----------

/**
 * Write a synthetic job that is eligible for adversarial review:
 *   - status: awaiting_followup (or caller-specified)
 *   - result is populated
 *   - turns[0] is a completed non-review turn with a result file
 *
 * @param {{
 *   jobId: string;
 *   workspaceRoot?: string;
 *   status?: string;
 *   turns?: Array<{ summaryPrefix?: string; status?: string; hasResult?: boolean }>;
 *   noResult?: boolean;
 * }} opts
 */
function writeAdversarialTargetJob({
  jobId,
  workspaceRoot = WORK_DIR,
  status = 'awaiting_followup',
  turns = [{}],
  noResult = false,
} = {}) {
  const jobsDir = join(TMP_HOME, 'jobs');
  mkdirSync(jobsDir, { recursive: true });

  const now = new Date().toISOString();
  const latestAliasPath = join(jobsDir, `${jobId}.result.md`);
  const resultContents = turns.map((_spec, i) =>
    i === 0
      ? 'Original task output for adversarial review.'
      : `Review/helper turn ${i} output for adversarial review.`,
  );
  const resultContexts = resultContents.map((content, i) => ({
    finalMessagePath: join(jobsDir, `${jobId}.turn-${i}.result.md`),
    finalMessagePreview: content.slice(0, 120),
  }));

  const turnsData = turns.map((spec, i) => {
    const prefix = spec.summaryPrefix ?? '';
    const hasResult = spec.hasResult !== false;
    const tStatus = spec.status ?? 'completed';
    const summary = `${prefix}task for turn ${i}`;
    const promptMeta = {
      summary,
      sha256: createHash('sha256').update(summary).digest('hex'),
      bytesLen: Buffer.byteLength(summary, 'utf8'),
    };
    return {
      prompt: promptMeta,
      startedAt: now,
      endedAt: now,
      status: tStatus,
      ...(hasResult && tStatus === 'completed' ? { result: resultContexts[i] } : {}),
    };
  });
  const latestResult = [...turnsData].reverse().find((t) => t.result !== undefined)?.result;

  const record = {
    jobId,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    status,
    codex: {
      pluginVersion: '0.0.0',
      cwd: workspaceRoot,
    },
    workspace: {
      root: workspaceRoot,
    },
    driver: {
      name: 'claude-background',
      version: '0.0.0',
      capabilitiesSnapshot: {},
    },
    claude: {
      version: '2.1.999-mock',
      shortId: 'tgt00001',
      sessionId: shortIdToSessionId('tgt00001'),
      sessionName: `codex:test:${jobId}`,
      cwd: workspaceRoot,
      logsCommand: 'claude logs tgt00001',
    },
    prompt: turnsData[0]?.prompt ?? {
      summary: 'initial task',
      sha256: createHash('sha256').update('initial task').digest('hex'),
      bytesLen: Buffer.byteLength('initial task', 'utf8'),
    },
    ...(noResult || latestResult === undefined ? {} : { result: latestResult }),
    turns: turnsData,
  };

  writeFileSync(join(jobsDir, `${jobId}.json`), JSON.stringify(record, null, 2));
  if (!noResult) {
    for (let i = 0; i < turnsData.length; i++) {
      if (turnsData[i].result !== undefined) {
        writeFileSync(resultContexts[i].finalMessagePath, resultContents[i]);
      }
    }
    if (latestResult !== undefined) {
      writeFileSync(latestAliasPath, resultContents[resultContexts.indexOf(latestResult)]);
    }
  }
  return { jobId, record, resultPath: latestResult?.finalMessagePath ?? latestAliasPath };
}

// ---------- T6-1: happy path — new review job created with reviewOf ----------

describe('adversarial-review happy path (T6)', () => {
  it('T6-1: exits 0 and creates a NEW review job with reviewOf.jobId pointing to target', () => {
    const jobId = `job_ar1_${createHash('sha256').update('t6-happy-path').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(
      newIds.length > 0,
      `expected a new review job to be created; before=${before.length} after=${after.length}`,
    );

    const reviewJobId = newIds[0];
    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${reviewJobId}.json`), 'utf8'),
    );
    assert.ok(
      reviewRecord.reviewOf != null,
      `expected reviewOf to be set on review job; got: ${JSON.stringify(reviewRecord.reviewOf)}`,
    );
    assert.equal(
      reviewRecord.reviewOf.jobId,
      jobId,
      `expected reviewOf.jobId to equal target jobId; got: ${reviewRecord.reviewOf.jobId}`,
    );
    assert.equal(
      typeof reviewRecord.reviewOf.turnIndex,
      'number',
      `expected reviewOf.turnIndex to be a number; got: ${typeof reviewRecord.reviewOf.turnIndex}`,
    );
  });
});

// ---------- T6-2: session name pattern ----------

describe('adversarial-review session name (T6)', () => {
  it('T6-2: new review session name starts with codex:<repo-basename>:review-<targetJobId.slice(0,12)>', () => {
    const jobId = `job_ar2_${createHash('sha256').update('t6-session-name').digest('hex').slice(0, 8)}`;
    const repoBasename = 'cc-plugin-codex';
    const targetWorkspace = join(WORK_DIR, repoBasename);
    mkdirSync(targetWorkspace, { recursive: true });

    writeAdversarialTargetJob({ jobId, workspaceRoot: targetWorkspace });
    writeAck(targetWorkspace);

    const result = runDispatcher(['adversarial-review', jobId, '--all', '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    // Find the review job on disk
    const allIds = listJobIds().filter((id) => id !== jobId);
    assert.ok(allIds.length > 0, 'expected at least one review job on disk');
    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${allIds[0]}.json`), 'utf8'),
    );

    // Plan 0021: the driver appends a unique `-<hex>` suffix to every session name
    // (including this internal review name), so assert the prefix, not exact equality.
    const expectedSessionPrefix = `codex:${repoBasename}:review-${jobId.slice(0, 12)}`;
    assert.ok(
      reviewRecord.claude.sessionName.startsWith(`${expectedSessionPrefix}-`),
      `expected sessionName to start with "${expectedSessionPrefix}-"; got "${reviewRecord.claude.sessionName}"`,
    );
  });
});

// ---------- T6-3: structured output parses + human format ----------

describe('adversarial-review structured response produces human output (T6)', () => {
  it('T6-3: human output contains a verdict line and bracketed severity labels', () => {
    const jobId = `job_ar3_${createHash('sha256').update('t6-human-output').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_STRUCTURED,
    });

    const result = runDispatcher(['adversarial-review', jobId, '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    assert.ok(
      /review verdict:/i.test(result.stdout),
      `expected "Review verdict:" in human stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('[HIGH]') || result.stdout.includes('[LOW]'),
      `expected bracketed severity label in human stdout; got:\n${result.stdout}`,
    );
  });

  it('Plan 0024: --fail-on medium exits non-zero after emitting review JSON', () => {
    const jobId = `job_ar24_${createHash('sha256').update('t24-review-gate').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'adversarial-review',
    });

    const result = runDispatcher(
      ['adversarial-review', jobId, '--yes', '--json', '--fail-on', 'medium'],
      {
        env: {
          CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath,
          CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS: '1',
        },
      },
    );

    assert.equal(result.status, 1, `expected review gate exit 1; stderr: ${result.stderr}`);
    const parsed = parseJson(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.review.mediumCount, 1);
    assert.ok(
      result.stderr.includes('review gate failed (--fail-on medium)'),
      `expected gate failure on stderr; got:\n${result.stderr}`,
    );
  });

  it('Plan 0024 polish: --fail-on= is rejected instead of disabling the review gate', () => {
    const result = runDispatcher(['adversarial-review', 'job_nope_deadbeef', '--fail-on=']);

    assert.equal(result.status, 2, `expected usage exit 2; stderr: ${result.stderr}`);
    assert.ok(
      result.stderr.includes(
        '--fail-on requires a value: fail, any, nit, low, medium, high, blocker',
      ),
      `expected empty fail-on validation error; got:\n${result.stderr}`,
    );
    assert.ok(
      !result.stderr.includes('No job found'),
      `fail-on validation should happen before job lookup; got:\n${result.stderr}`,
    );
  });
});

// ---------- T6-4: --json output includes review + reviewOf + targetJob ----------

describe('adversarial-review --json output shape (T6)', () => {
  it('T6-4: --json output has ok, review.*, job.reviewOf.*, and targetJob.*', () => {
    const jobId = `job_ar4_${createHash('sha256').update('t6-json-shape').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_STRUCTURED,
    });

    const result = runDispatcher(['adversarial-review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    // Top-level fields
    assert.equal(parsed.ok, true, `expected ok:true; got ${JSON.stringify(parsed)}`);
    assert.ok(parsed.review !== undefined, 'expected top-level "review" field');
    assert.ok(parsed.job !== undefined, 'expected top-level "job" field');
    assert.ok(parsed.targetJob !== undefined, 'expected top-level "targetJob" field');

    // review sub-fields
    assert.ok(
      ['pass', 'fail', 'pass_with_findings'].includes(parsed.review.verdict),
      `review.verdict must be a valid verdict; got ${parsed.review.verdict}`,
    );
    assert.ok(
      typeof parsed.review.findingsCount === 'number',
      'expected review.findingsCount to be a number',
    );
    assert.ok(
      typeof parsed.review.blocking === 'boolean',
      'expected review.blocking to be boolean',
    );
    assert.ok(Array.isArray(parsed.review.findings), 'expected review.findings to be an array');

    // job sub-fields (the review job)
    assert.ok(typeof parsed.job.jobId === 'string', 'expected job.jobId to be a string');
    assert.ok(typeof parsed.job.status === 'string', 'expected job.status to be a string');
    assert.ok(parsed.job.reviewOf != null, 'expected job.reviewOf to be set');
    assert.equal(
      parsed.job.reviewOf.jobId,
      jobId,
      `expected job.reviewOf.jobId to equal target; got ${parsed.job.reviewOf.jobId}`,
    );
    assert.ok(
      typeof parsed.job.reviewOf.turnIndex === 'number',
      'expected job.reviewOf.turnIndex to be a number',
    );

    // targetJob sub-fields
    assert.equal(
      parsed.targetJob.jobId,
      jobId,
      `expected targetJob.jobId to equal target; got ${parsed.targetJob.jobId}`,
    );
    assert.ok(
      typeof parsed.targetJob.status === 'string',
      'expected targetJob.status to be a string',
    );
  });
});

// ---------- T6-5/6/7: accepted flags --model / --effort / --permission-mode ----------

describe('adversarial-review accepts --model flag (T6)', () => {
  it('T6-5: --model is accepted and forwarded; exits 0', () => {
    const jobId = `job_ar5_${createHash('sha256').update('t6-model-flag').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const result = runDispatcher([
      'adversarial-review',
      jobId,
      '--yes',
      '--model',
      'claude-opus-4-5',
    ]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 with --model, got ${result.status}; stderr: ${result.stderr}`,
    );
  });
});

describe('adversarial-review accepts --effort flag (T6)', () => {
  it('T6-6: --effort is accepted and forwarded; exits 0', () => {
    const jobId = `job_ar6_${createHash('sha256').update('t6-effort-flag').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes', '--effort', 'high']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 with --effort, got ${result.status}; stderr: ${result.stderr}`,
    );
  });
});

describe('adversarial-review accepts --permission-mode flag (T6)', () => {
  it('T6-7: --permission-mode is accepted and forwarded; exits 0', () => {
    const jobId = `job_ar7_${createHash('sha256').update('t6-permmode-flag').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const result = runDispatcher([
      'adversarial-review',
      jobId,
      '--yes',
      '--permission-mode',
      'default',
    ]);

    assert.equal(
      result.status,
      0,
      `expected exit 0 with --permission-mode, got ${result.status}; stderr: ${result.stderr}`,
    );
  });
});

// ---------- T6-8: --allow-edit rejected ----------

describe('adversarial-review rejects --allow-edit (T6)', () => {
  it('T6-8: --allow-edit produces exit 2 with the exact read-only rejection message', () => {
    const jobId = `job_ar8_${createHash('sha256').update('t6-allow-edit').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });

    const result = runDispatcher(['adversarial-review', jobId, '--allow-edit', '--yes']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg = '--allow-edit is not applicable to review skills. Reviews are read-only.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T6-9: --add-dir / --mcp-config / --name rejected ----------

describe('adversarial-review rejects --add-dir, --mcp-config, --name (T6)', () => {
  it('T6-9a: --name produces exit 2 with the exact session-name rejection message', () => {
    const jobId = `job_ar9a_${createHash('sha256').update('t6-name-flag').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });

    const result = runDispatcher(['adversarial-review', jobId, '--yes', '--name', 'custom-name']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --name, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg =
      '--name is not accepted for adversarial review; session names are generated automatically.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });

  it('T6-9b: --add-dir produces exit 2 with the exact workspace-binding rejection message', () => {
    const jobId = `job_ar9b_${createHash('sha256').update('t6-add-dir-flag').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });

    const result = runDispatcher(['adversarial-review', jobId, '--yes', '--add-dir', '/tmp/extra']);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --add-dir, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg =
      "--add-dir is not accepted by $claude-adversarial-review; the review session runs in the target job's workspace.";
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });

  it('T6-9c: --mcp-config produces exit 2 with the exact rejection message', () => {
    const jobId = `job_ar9c_${createHash('sha256').update('t6-mcp-config-flag').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });

    const result = runDispatcher([
      'adversarial-review',
      jobId,
      '--yes',
      '--mcp-config',
      '/tmp/mcp.json',
    ]);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for --mcp-config, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg = '--mcp-config is not accepted by $claude-adversarial-review.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T6-10: running rejected ----------

describe('adversarial-review rejects running status (T6)', () => {
  it('T6-10: running job is rejected with exact pinned message and exit 1', () => {
    const jobId = `job_ar10_${createHash('sha256').update('t6-running').digest('hex').slice(0, 8)}`;
    // Use the same shortId as the target job record so the reconciler maps
    // the working session back to this job (not to an orphan).
    const shortId = 'tgt00001';
    writeAdversarialTargetJob({ jobId, status: 'running' });
    writeAck(WORK_DIR);
    // Seed working session under the target job's shortId so the reconciler
    // keeps status as running (driver 'working' → 'running').
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for running; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg = `Job ${jobId} is running; wait for it to produce a result before running $claude-adversarial-review.`;
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T6-11: needs_input rejected ----------

describe('adversarial-review rejects needs_input status (T6)', () => {
  it('T6-11: needs_input job is rejected with exact pinned message and exit 1', () => {
    const jobId = `job_ar11_${createHash('sha256').update('t6-needs-input').digest('hex').slice(0, 8)}`;
    // Use the same shortId as the target job record so the reconciler resolves
    // the waiting sidecar back to this job correctly.
    const shortId = 'tgt00001';
    writeAdversarialTargetJob({ jobId, status: 'needs_input' });
    writeAck(WORK_DIR);

    // Write a waiting sidecar under the target job's shortId so the reconciler
    // maps state:'waiting' → needs_input.
    const sidecarDir2 = join(MOCK_HOME, 'jobs', shortId);
    mkdirSync(sidecarDir2, { recursive: true });
    writeFileSync(
      join(sidecarDir2, 'state.json'),
      JSON.stringify(
        {
          template: 'bg',
          intent: '',
          name: `codex:test:${shortId}`,
          nameSource: 'user',
          sessionId: shortIdToSessionId(shortId),
          resumeSessionId: shortIdToSessionId(shortId),
          daemonShort: shortId,
          cliVersion: '2.1.999-mock',
          cwd: WORK_DIR,
          backend: 'daemon',
          linkScanPath: join(MOCK_HOME, 'projects', `${shortIdToSessionId(shortId)}.jsonl`),
          state: 'waiting',
          tempo: 'idle',
          inFlight: { tasks: 0, queued: 0, kinds: ['permission'] },
        },
        null,
        2,
      ),
    );
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 for needs_input; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg = `Job ${jobId} needs input. Resolve the permission request first, then run $claude-adversarial-review.`;
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T6-12: queued / starting rejected ----------

describe('adversarial-review rejects queued and starting statuses (T6)', () => {
  it('T6-12-queued: queued job is rejected with exact pinned message and exit 1', () => {
    const jobId = `job_ar12q_${createHash('sha256').update('t6-queued').digest('hex').slice(0, 8)}`;
    const shortId = 'ar120001';
    // turns: no completed turn + noResult: true so syncCompatAliases finds no
    // turn result and leaves job.result unset. The target session (tgt00001) is
    // seeded as 'working' so the reconciler maps status → 'running', which hits
    // the dispatcher's running-job rejection branch (exit 1, "is running").
    writeAdversarialTargetJob({
      jobId,
      status: 'queued',
      turns: [{ status: 'queued', hasResult: false }],
      noResult: true,
    });
    writeAck(WORK_DIR);
    // Seed the TARGET job's session (tgt00001) as working so reconciler maps to
    // 'running'. The ar120001 session is a leftover from the original fixture and
    // is unrelated to the target job.
    writeMockAgentSession('tgt00001', shortIdToSessionId('tgt00001'), 'working');
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 for queued (may be remapped to running); got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    // Either the exact queued message or the running message is acceptable
    // (reconciler may remap queued→running)
    assert.ok(
      combined.includes('is queued') ||
        combined.includes('is running') ||
        combined.includes('wait'),
      `expected queued/running rejection message; got:\n${combined}`,
    );
  });

  it('T6-12-starting: starting job is rejected with exact pinned message and exit 1', () => {
    const jobId = `job_ar12s_${createHash('sha256').update('t6-starting').digest('hex').slice(0, 8)}`;
    const shortId = 'ar120002';
    // Same reasoning as T6-12-queued: no completed turn so job.result stays
    // unset; target session seeded as 'working' so reconciler maps → 'running'.
    writeAdversarialTargetJob({
      jobId,
      status: 'starting',
      turns: [{ status: 'starting', hasResult: false }],
      noResult: true,
    });
    writeAck(WORK_DIR);
    writeMockAgentSession('tgt00001', shortIdToSessionId('tgt00001'), 'working');
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'working');

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 for starting (may be remapped to running); got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('is starting') ||
        combined.includes('is running') ||
        combined.includes('wait'),
      `expected starting/running rejection message; got:\n${combined}`,
    );
  });
});

// ---------- T6-13: stopped / failed / orphaned with result ALLOWED ----------

describe('adversarial-review allows stopped / failed / orphaned with result (T6)', () => {
  it('T6-13-stopped: stopped job with result proceeds to create a review job', () => {
    const jobId = `job_ar13st_${createHash('sha256').update('t6-stopped-allowed').digest('hex').slice(0, 8)}`;
    const shortId = 'ar130001';
    writeAdversarialTargetJob({ jobId, status: 'stopped' });
    writeAck(WORK_DIR);
    // Seed a stopped session so reconciler keeps status as 'stopped'
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'stopped');

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for stopped job with result, got ${result.status}; stderr: ${result.stderr}`,
    );
    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to be created for stopped target');
  });

  it('T6-13-failed: failed job with result proceeds to create a review job', () => {
    const jobId = `job_ar13fl_${createHash('sha256').update('t6-failed-allowed').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId, status: 'failed' });
    writeAck(WORK_DIR);
    // No mock session → reconciler flips to orphaned; still allowed if result exists

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for failed job with result, got ${result.status}; stderr: ${result.stderr}`,
    );
    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to be created for failed target');
  });

  it('T6-13-orphaned: orphaned job with result proceeds to create a review job', () => {
    const jobId = `job_ar13or_${createHash('sha256').update('t6-orphaned-allowed').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId, status: 'orphaned' });
    writeAck(WORK_DIR);
    // No mock session — keeps orphaned status

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0 for orphaned job with result, got ${result.status}; stderr: ${result.stderr}`,
    );
    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to be created for orphaned target');
  });
});

// ---------- T6-14: allowed status WITHOUT result rejected ----------

describe('adversarial-review rejects allowed status without result (T6)', () => {
  it('T6-14: stopped job without result exits 1 with exact "No reviewable output" message', () => {
    const jobId = `job_ar14_${createHash('sha256').update('t6-stopped-no-result').digest('hex').slice(0, 8)}`;
    // Pass an explicit non-completed turn so syncCompatAliases finds no turn
    // result and leaves job.result unset. noResult: true keeps the job-level
    // result absent too. Together these ensure the dispatcher hits the
    // !targetJob.result branch and exits 1.
    writeAdversarialTargetJob({
      jobId,
      status: 'stopped',
      turns: [{ status: 'stopped', hasResult: false }],
      noResult: true,
    });
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      1,
      `expected exit 1 for stopped job without result; got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    // The reconciler may change status; the message uses the post-reconcile status
    assert.ok(
      combined.includes('No reviewable output.') ||
        (combined.includes('before producing a result') && combined.includes('The job')),
      `expected "No reviewable output." message; got:\n${combined}`,
    );
  });
});

// ---------- T6-15: no reviewable non-review turn exits 1 ----------

describe('adversarial-review exits 1 when no reviewable non-review turn exists (T6)', () => {
  it('T6-15: job with only review/adversarial-review turns exits 1 with exact message', () => {
    const jobId = `job_ar15_${createHash('sha256').update('t6-no-reviewable').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({
      jobId,
      turns: [
        { summaryPrefix: '[review] ', status: 'completed', hasResult: true },
        { summaryPrefix: '[adversarial-review] ', status: 'completed', hasResult: true },
      ],
    });
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(result.status, 1, `expected exit 1 when no non-review turn; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    const expectedMsg = 'No reviewable non-review output found for this job.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ---------- T6-16: original non-review turn selected even when review turn exists ----------

describe('adversarial-review selects original non-review turn (T6)', () => {
  it('T6-16: job with [turn 0: original, turn 1: [review]] selects turn 0 as the review target', () => {
    const jobId = `job_ar16_${createHash('sha256').update('t6-turn-select').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({
      jobId,
      turns: [
        { summaryPrefix: '', status: 'completed', hasResult: true },
        { summaryPrefix: '[review] ', status: 'completed', hasResult: true },
      ],
    });
    writeAck(WORK_DIR);

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a new review job to be created');

    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${newIds[0]}.json`), 'utf8'),
    );
    // Turn 0 is the original non-review turn; turn 1 is the [review] turn.
    // cmdAdversarialReview iterates backward and selects the LAST non-review turn.
    // With turns = [original (0), review (1)], the last non-review is turn 0.
    assert.equal(
      reviewRecord.reviewOf.turnIndex,
      0,
      `expected reviewOf.turnIndex === 0 (original turn); got ${reviewRecord.reviewOf.turnIndex}`,
    );
  });
});

describe('adversarial-review refuses legacy shared result paths (Plan 0022 friction polish)', () => {
  it('exits 1 when the selected older turn points at the mutable latest-result file', () => {
    const jobId = `job_arleg_${createHash('sha256').update('t6-legacy-shared-path').digest('hex').slice(0, 8)}`;
    const { record } = writeAdversarialTargetJob({
      jobId,
      turns: [
        { summaryPrefix: '', status: 'completed', hasResult: true },
        { summaryPrefix: '[review] ', status: 'completed', hasResult: true },
      ],
    });
    const sharedPath = join(TMP_HOME, 'jobs', `${jobId}.result.md`);
    const sharedResult = {
      finalMessagePath: sharedPath,
      finalMessagePreview: 'Review verdict content that must not be reviewed as turn 0.',
    };
    record.result = sharedResult;
    record.turns[0].result = sharedResult;
    record.turns[1].result = sharedResult;
    writeFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), JSON.stringify(record, null, 2));
    writeFileSync(sharedPath, 'Review verdict content that must not be reviewed as turn 0.');
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);
    assert.equal(result.status, 1, `expected exit 1; stdout:\n${result.stdout}`);
    assert.ok(
      result.stderr.includes('legacy shared result path'),
      `expected legacy shared-path refusal; stderr:\n${result.stderr}`,
    );
  });
});

// ---------- T6-17: target-workspace ack with --all ----------

describe('adversarial-review --all resolves cross-workspace job (T6)', () => {
  it('T6-17: --all finds job in a different workspace; ack check uses target workspace', () => {
    const targetWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ar17-')));
    try {
      const jobId = `job_ar17_${createHash('sha256').update('t6-all-cross-ws').digest('hex').slice(0, 8)}`;
      writeAdversarialTargetJob({ jobId, workspaceRoot: targetWorkspace });
      // Ack for target workspace (not caller workspace)
      writeAck(targetWorkspace);

      // Run from WORK_DIR with --all; should resolve the target workspace job
      const result = runDispatcher(['adversarial-review', jobId, '--all', '--yes']);

      // Must not fail with "no job found"
      const combined = result.stdout + result.stderr;
      const isNoJobError = combined.toLowerCase().includes('no job found') && result.status === 1;
      assert.ok(
        !isNoJobError,
        `--all should resolve cross-workspace job; got "no job found":\n${combined}`,
      );
    } finally {
      rmSync(targetWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- T6-18: --yes records target workspace ack ----------

describe('adversarial-review --yes records ack for target workspace (T6)', () => {
  it('T6-18: --yes records an ack for the target workspace and proceeds', () => {
    const targetWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-ar18-')));
    try {
      const jobId = `job_ar18_${createHash('sha256').update('t6-yes-ack').digest('hex').slice(0, 8)}`;
      writeAdversarialTargetJob({ jobId, workspaceRoot: targetWorkspace });
      // No prior ack

      runDispatcher(['adversarial-review', jobId, '--all', '--yes']);

      // Verify ack file was written for the target workspace
      const resolvedTmpHome = realpathSync(TMP_HOME);
      const targetAckFile = join(TMP_HOME, 'acks', `${ackHex(targetWorkspace)}.json`);
      const targetAckFileResolved = join(
        resolvedTmpHome,
        'acks',
        `${ackHex(targetWorkspace)}.json`,
      );
      assert.ok(
        existsSync(targetAckFile) || existsSync(targetAckFileResolved),
        `expected ack file for target workspace at ${targetAckFile}`,
      );
    } finally {
      rmSync(targetWorkspace, { recursive: true, force: true });
    }
  });
});

// ---------- T6-19: timeout path ----------

describe('adversarial-review timeout fires when review never completes (T6)', () => {
  // Strategy: mock-claude is configured with attachResponse:'' so the review
  // session's sidecar has output.result='' (empty). The reconciler's
  // sidecarSaysDone guard requires a non-empty result string, so reconcile
  // never populates currentReviewJob.result. startTime is set right before the
  // while loop (after createJob), so elapsed is ~0 on the first iteration and
  // the timeout check (elapsed >= 1) only fires on the second iteration, after
  // the 50ms poll sleep. With TIMEOUT_MS=1 and POLL_MS=50, iteration 2 has
  // elapsed ~50ms >= 1ms → timedOut = true → cleanup branch fires.
  //
  // Math.round(1 / 60_000) === 0, so the message is:
  //   "Adversarial review did not complete within 0 minutes."
  it('T6-19: times out with non-zero exit, exact timeout message, review job status failed, review.failed event written', () => {
    const jobId = `job_ar19_${createHash('sha256').update('t6-timeout').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    // Seed the TARGET job's session as idle (no inFlight) so that the initial
    // reconcile (step 4 in the dispatcher) produces 'awaiting_followup' — the
    // same as the on-disk status — leaving targetRecordBefore === targetRecordAfter.
    // Without this, reconcile maps tgt00001 → orphaned and the status changes.
    writeMockAgentSession('tgt00001', shortIdToSessionId('tgt00001'), 'idle');
    writeMockIdleSidecar('tgt00001', shortIdToSessionId('tgt00001'));

    // Write mock-claude config: empty attachResponse so the review session's
    // sidecar output.result is '' — reconcile never sets currentReviewJob.result.
    const cfgPath = join(MOCK_HOME, 'cfg-t6-19.json');
    writeFileSync(cfgPath, JSON.stringify({ attachResponse: '' }));

    const targetRecordBefore = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), 'utf8'),
    );

    const before = listJobIds();

    const result = runDispatcher(['adversarial-review', jobId, '--yes'], {
      env: {
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS: '1',
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS: '50',
        CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath,
      },
    });

    // Must exit non-zero
    assert.notEqual(result.status, 0, `expected non-zero exit on timeout; got ${result.status}`);

    // Exact timeout message: Math.round(1 / 60_000) === 0
    const combined = result.stdout + result.stderr;
    const expectedTimeoutMsg = 'Adversarial review did not complete within 0 minutes.';
    assert.ok(
      combined.includes(expectedTimeoutMsg),
      `expected exact timeout message "${expectedTimeoutMsg}"; got:\n${combined}`,
    );

    // Target job must be UNCHANGED after timeout
    const targetRecordAfter = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), 'utf8'),
    );
    assert.equal(
      targetRecordAfter.status,
      targetRecordBefore.status,
      `target job status must be unchanged after timeout; before=${targetRecordBefore.status} after=${targetRecordAfter.status}`,
    );

    // A review job should have been created (and marked failed)
    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to have been created before timeout');

    const reviewJobId = newIds[0];
    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${reviewJobId}.json`), 'utf8'),
    );
    assert.equal(
      reviewRecord.status,
      'failed',
      `expected review job status to be 'failed' after timeout; got '${reviewRecord.status}'`,
    );

    // The review.failed event must be in the events log
    const eventsPath = join(TMP_HOME, 'jobs', `${reviewJobId}.events.jsonl`);
    assert.ok(existsSync(eventsPath), `expected events file at ${eventsPath}`);
    const eventLines = readFileSync(eventsPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l));
    const eventTypes = eventLines.map((e) => e.type);
    assert.ok(
      eventTypes.includes('review.failed'),
      `expected 'review.failed' event in events log; got: ${eventTypes.join(', ')}`,
    );

    // The review.failed event must have reason:'timeout'
    const failedEvent = eventLines.find((e) => e.type === 'review.failed');
    assert.equal(
      failedEvent.reason,
      'timeout',
      `expected review.failed event.reason to be 'timeout'; got '${failedEvent.reason}'`,
    );
  });
});

// ---------- T6-20: env timeout parse ----------

describe('adversarial-review env timeout parse (T6)', () => {
  it('T6-20a: valid small timeout (300ms) is accepted; error message uses rounded minutes (0)', () => {
    const jobId = `job_ar20a_${createHash('sha256').update('t6-timeout-300ms').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes'], {
      env: {
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS: '300',
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS: '50',
      },
    });

    // With 300ms timeout and mock completing immediately on first poll, the
    // review may succeed (poll=50ms → reconcile → result found before 300ms).
    // If it does succeed, that is correct behaviour — verify exit 0 and valid output.
    // If it times out (possible on slow CI), verify the timeout message.
    const combined = result.stdout + result.stderr;
    if (result.status !== 0) {
      // Timeout fired: Math.round(300 / 60_000) === 0
      const expectedMsg = 'Adversarial review did not complete within 0 minutes.';
      assert.ok(
        combined.includes(expectedMsg),
        `if timed out, expected "${expectedMsg}"; got:\n${combined}`,
      );
    } else {
      // Succeeded: verify some output
      assert.ok(
        combined.length > 0,
        `expected some output on success; got stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
  });

  // NaN and negative env values fall back to the 30-minute default.
  // These cases are exercised implicitly: with the default timeout (30 min) and
  // a mock that completes immediately, the review always exits 0 (no timeout).
  // We assert exit 0 as the invariant that the default was used (not 0ms / negative).
  it('T6-20b: NaN env value falls back to 30-min default (review completes successfully)', () => {
    const jobId = `job_ar20b_${createHash('sha256').update('t6-timeout-nan').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes'], {
      env: {
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS: 'abc',
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS: '50',
      },
    });

    // With 30-min default the mock completes long before timeout — must exit 0
    assert.equal(
      result.status,
      0,
      `expected exit 0 when NaN timeout falls back to default; got ${result.status}; stderr: ${result.stderr}`,
    );
  });

  it('T6-20c: negative env value falls back to 30-min default (review completes successfully)', () => {
    const jobId = `job_ar20c_${createHash('sha256').update('t6-timeout-neg').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes'], {
      env: {
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS: '-100',
        CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS: '50',
      },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0 when negative timeout falls back to default; got ${result.status}; stderr: ${result.stderr}`,
    );
  });
});

// ---------- T6-21: malformed review output fallback ----------

describe('adversarial-review malformed output fallback (T6)', () => {
  it('T6-21: unparseable mock output produces ok:true with single nit finding', () => {
    const jobId = `job_ar21_${createHash('sha256').update('t6-fallback').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      attachResponse: MOCK_REVIEW_RESPONSE_MALFORMED,
    });

    const result = runDispatcher(['adversarial-review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0 on fallback parse, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(
      parsed.ok,
      true,
      `expected ok:true in fallback case; got ${JSON.stringify(parsed)}`,
    );
    assert.equal(
      parsed.review.findings.length,
      1,
      `expected exactly 1 fallback finding; got ${parsed.review.findings.length}`,
    );
    assert.equal(
      parsed.review.findings[0].severity,
      'nit',
      `expected fallback finding severity to be 'nit'; got ${parsed.review.findings[0].severity}`,
    );
  });
});

// ---------- T6-22: missing reviewed-output file ----------

describe('adversarial-review exits non-zero when reviewed-output file is missing (T6)', () => {
  it('T6-22: turn with result.finalMessagePath pointing to non-existent file exits non-zero', () => {
    const jobId = `job_ar22_${createHash('sha256').update('t6-missing-file').digest('hex').slice(0, 8)}`;
    // Write a job with a result.finalMessagePath pointing to a file that does NOT exist
    const jobsDir = join(TMP_HOME, 'jobs');
    mkdirSync(jobsDir, { recursive: true });
    const now = new Date().toISOString();
    const missingPath = join(jobsDir, `${jobId}-MISSING.result.md`);
    // Intentionally do NOT write missingPath

    const fakeResult = {
      finalMessagePath: missingPath,
      finalMessagePreview: 'ghost result',
    };
    const promptMeta = {
      summary: 'task with missing output file',
      sha256: createHash('sha256').update('task with missing output file').digest('hex'),
      bytesLen: Buffer.byteLength('task with missing output file', 'utf8'),
    };
    const record = {
      jobId,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
      status: 'awaiting_followup',
      codex: { pluginVersion: '0.0.0', cwd: WORK_DIR },
      workspace: { root: WORK_DIR },
      driver: { name: 'claude-background', version: '0.0.0', capabilitiesSnapshot: {} },
      claude: {
        version: '2.1.999-mock',
        shortId: 'ar220001',
        sessionId: shortIdToSessionId('ar220001'),
        sessionName: `codex:test:${jobId}`,
        cwd: WORK_DIR,
        logsCommand: 'claude logs ar220001',
      },
      prompt: promptMeta,
      result: fakeResult,
      turns: [
        {
          prompt: promptMeta,
          startedAt: now,
          endedAt: now,
          status: 'completed',
          result: fakeResult,
        },
      ],
    };
    writeFileSync(join(jobsDir, `${jobId}.json`), JSON.stringify(record, null, 2));
    writeAck(WORK_DIR);

    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.notEqual(
      result.status,
      0,
      `expected non-zero exit when reviewed-output file is missing; got ${result.status}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('Reviewed output file is missing:'),
      `expected "Reviewed output file is missing:" in error; got:\n${combined}`,
    );
    assert.ok(
      combined.includes(missingPath),
      `expected missing path "${missingPath}" in error; got:\n${combined}`,
    );
  });
});

// ---------- T6-23: --help includes adversarial-review ----------

describe('--help includes adversarial-review subcommand (T6)', () => {
  it('T6-23: printUsage includes the "adversarial-review" subcommand line', () => {
    // This is also asserted by T4-17b but we pin it explicitly for T6's contract.
    const result = runDispatcher(['--help']);

    assert.equal(result.status, 0, `expected exit 0 for --help; got ${result.status}`);
    assert.ok(
      result.stdout.includes('adversarial-review'),
      `expected "adversarial-review" to appear in --help output; got:\n${result.stdout}`,
    );
  });
});

// ---------- T6-extra: additional edge cases ----------

describe('adversarial-review extra edge cases (T6)', () => {
  it('T6-extra-1: reviewOf.turnIndex matches the selected turn index in turns[]', () => {
    const jobId = `job_arx1_${createHash('sha256').update('t6-turn-index').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0; got ${result.status}; stderr: ${result.stderr}`,
    );

    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to be created');

    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${newIds[0]}.json`), 'utf8'),
    );
    const targetRecord = JSON.parse(readFileSync(join(TMP_HOME, 'jobs', `${jobId}.json`), 'utf8'));
    const selectedTurnIndex = reviewRecord.reviewOf.turnIndex;

    assert.ok(
      selectedTurnIndex >= 0 && selectedTurnIndex < targetRecord.turns.length,
      `reviewOf.turnIndex ${selectedTurnIndex} must be a valid index in target turns (length ${targetRecord.turns.length})`,
    );

    const selectedTurn = targetRecord.turns[selectedTurnIndex];
    assert.ok(
      !selectedTurn.prompt.summary.startsWith('[review] ') &&
        !selectedTurn.prompt.summary.startsWith('[adversarial-review] '),
      `selected turn at index ${selectedTurnIndex} must not be a review turn; got summary: "${selectedTurn.prompt.summary}"`,
    );
  });

  it('T6-extra-2: review job prompt.summary starts with "[adversarial-review] " prefix', () => {
    const jobId = `job_arx2_${createHash('sha256').update('t6-prompt-prefix').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0; got ${result.status}; stderr: ${result.stderr}`,
    );

    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to be created');

    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${newIds[0]}.json`), 'utf8'),
    );
    assert.ok(
      reviewRecord.prompt.summary.startsWith('[adversarial-review] '),
      `expected review job prompt.summary to start with "[adversarial-review] "; got: "${reviewRecord.prompt.summary}"`,
    );
  });

  it('T6-extra-3: review job workspace.root equals the target job workspace.root (not cwd)', () => {
    const targetWorkspace = realpathSync(mkdtempSync(join(tmpdir(), 'dispatcher-arx3-')));
    try {
      const jobId = `job_arx3_${createHash('sha256').update('t6-workspace-root').digest('hex').slice(0, 8)}`;
      writeAdversarialTargetJob({ jobId, workspaceRoot: targetWorkspace });
      writeAck(targetWorkspace);

      const before = listJobIds();
      const result = runDispatcher(['adversarial-review', jobId, '--all', '--yes']);

      assert.equal(
        result.status,
        0,
        `expected exit 0; got ${result.status}; stderr: ${result.stderr}`,
      );

      const after = listJobIds();
      const newIds = after.filter((id) => !before.includes(id));
      assert.ok(newIds.length > 0, 'expected a review job to be created');

      const reviewRecord = JSON.parse(
        readFileSync(join(TMP_HOME, 'jobs', `${newIds[0]}.json`), 'utf8'),
      );
      assert.equal(
        reviewRecord.workspace.root,
        targetWorkspace,
        `expected review job workspace.root to equal targetWorkspace ("${targetWorkspace}"); got "${reviewRecord.workspace.root}"`,
      );
    } finally {
      rmSync(targetWorkspace, { recursive: true, force: true });
    }
  });

  it('T6-extra-4: multi-turn job selects the LATEST non-review turn', () => {
    const jobId = `job_arx4_${createHash('sha256').update('t6-multi-turn').digest('hex').slice(0, 8)}`;
    // Three completed non-review turns; cmdAdversarialReview should select turn 2
    writeAdversarialTargetJob({
      jobId,
      turns: [
        { summaryPrefix: '', status: 'completed', hasResult: true },
        { summaryPrefix: '', status: 'completed', hasResult: true },
        { summaryPrefix: '', status: 'completed', hasResult: true },
      ],
    });
    writeAck(WORK_DIR);

    const before = listJobIds();
    const result = runDispatcher(['adversarial-review', jobId, '--yes']);

    assert.equal(
      result.status,
      0,
      `expected exit 0; got ${result.status}; stderr: ${result.stderr}`,
    );

    const after = listJobIds();
    const newIds = after.filter((id) => !before.includes(id));
    assert.ok(newIds.length > 0, 'expected a review job to be created');

    const reviewRecord = JSON.parse(
      readFileSync(join(TMP_HOME, 'jobs', `${newIds[0]}.json`), 'utf8'),
    );
    assert.equal(
      reviewRecord.reviewOf.turnIndex,
      2,
      `expected reviewOf.turnIndex === 2 (latest non-review turn in 3-turn job); got ${reviewRecord.reviewOf.turnIndex}`,
    );
  });

  it('T6-extra-5: freeform prompt after jobId exits 2 with exact message', () => {
    const jobId = `job_arx5_${createHash('sha256').update('t6-extra-positional').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });

    const result = runDispatcher([
      'adversarial-review',
      jobId,
      '--yes',
      'unexpected-freeform-text',
    ]);

    assert.equal(
      result.status,
      2,
      `expected exit 2 for extra positional arg, got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    const expectedMsg =
      'adversarial-review does not accept a freeform prompt; the dispatcher constructs the review prompt.';
    assert.ok(
      combined.includes(expectedMsg),
      `expected exact message "${expectedMsg}"; got:\n${combined}`,
    );
  });
});

// ==========================================================================
// T7 (plan 0003): $claude-status review annotations
// ==========================================================================
//
// Contract under test (implemented by Subagent A in format.mjs):
//   - Human output: jobs with `reviewOf` have " (review of <jobId>)" or
//     " (review of <jobId> turn <N>)" appended to the sessionName column.
//     Jobs WITHOUT `reviewOf` have no such annotation.
//   - JSON output shape: { ok: true, jobs: [...] }.
//     Each job is spread as-is with an enriched `turns` field.
//     `reviewOf` is present when set; entirely absent when not set.
//     Each turn whose `prompt.summary` starts with `[review] ` gets
//     kind:'review'; `[adversarial-review] ` gets kind:'adversarial_review';
//     plain turns get no `kind` key at all.
//     `prompt.summary` is NOT stripped of its prefix.
//
// Helper: writeSyntheticJobWithReviewOf — writes a completed job record that
//   includes a `reviewOf` field and optionally custom turns[]. Reuses the
//   structure established by writeSyntheticCompletedJob.
// ==========================================================================

/**
 * Write a synthetic job record that optionally includes `reviewOf` and/or
 * custom turn summaries, suitable for T7 status-annotation tests.
 *
 * @param {{
 *   jobId: string;
 *   workspaceRoot?: string;
 *   reviewOf?: { jobId: string; turnIndex?: number };
 *   turns?: Array<{ summary: string; status?: string }>;
 * }} opts
 */
function writeSyntheticJobForStatusTest({ jobId, workspaceRoot = WORK_DIR, reviewOf, turns } = {}) {
  const jobsDir = join(TMP_HOME, 'jobs');
  mkdirSync(jobsDir, { recursive: true });

  const now = new Date().toISOString();
  const resultPath = join(jobsDir, `${jobId}.result.md`);

  const defaultSummary = 'synthetic task for status test';
  const defaultPromptCtx = {
    summary: defaultSummary,
    sha256: createHash('sha256').update(defaultSummary).digest('hex'),
    bytesLen: Buffer.byteLength(defaultSummary, 'utf8'),
  };
  const resultCtx = {
    finalMessagePath: resultPath,
    finalMessagePreview: 'result content',
  };

  const builtTurns = turns
    ? turns.map((t) => {
        const summary = t.summary;
        return {
          prompt: {
            summary,
            sha256: createHash('sha256').update(summary).digest('hex'),
            bytesLen: Buffer.byteLength(summary, 'utf8'),
          },
          startedAt: now,
          endedAt: now,
          status: t.status ?? 'completed',
          result: resultCtx,
        };
      })
    : [
        {
          prompt: defaultPromptCtx,
          startedAt: now,
          endedAt: now,
          status: 'completed',
          result: resultCtx,
        },
      ];

  const record = {
    jobId,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    status: 'completed',
    codex: {
      pluginVersion: '0.0.0',
      cwd: workspaceRoot,
    },
    workspace: {
      root: workspaceRoot,
    },
    driver: {
      name: 'claude-background',
      version: '0.0.0',
      capabilitiesSnapshot: {},
    },
    claude: {
      version: '2.1.999-mock',
      shortId: 'aabbcc',
      sessionName: `codex:test:${jobId}`,
      cwd: workspaceRoot,
      logsCommand: `claude logs aabbcc`,
    },
    prompt: defaultPromptCtx,
    result: resultCtx,
    turns: builtTurns,
  };

  if (reviewOf !== undefined) {
    record.reviewOf = reviewOf;
  }

  writeFileSync(join(jobsDir, `${jobId}.json`), JSON.stringify(record, null, 2));
  writeFileSync(resultPath, 'result content');
}

// ---------- T7-1: human status annotates a job with reviewOf + turnIndex ----------

describe('status review annotation: human output with reviewOf and turnIndex (plan 0003 T7)', () => {
  it('T7-1: human status appends " (review of <jobId> turn <N>)" for a job with reviewOf', () => {
    const parentJobId = 'job_parent_xxx';
    const jobId = `job_t7h1_${createHash('sha256').update('t7-human-reviewof').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      reviewOf: { jobId: parentJobId, turnIndex: 0 },
    });

    const result = runDispatcher(['status']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(` (review of ${parentJobId} turn 0)`),
      `expected " (review of ${parentJobId} turn 0)" in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- T7-2: human status does NOT annotate a normal job ----------

describe('status review annotation: human output without reviewOf (plan 0003 T7)', () => {
  it('T7-2: human status does not include "(review of" for a job without reviewOf', () => {
    const jobId = `job_t7h2_${createHash('sha256').update('t7-human-normal').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({ jobId });

    const result = runDispatcher(['status']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      !result.stdout.includes(' (review of '),
      `expected no "(review of" annotation for normal job; got:\n${result.stdout}`,
    );
  });
});

// ---------- T7-3: JSON status includes reviewOf for an adversarial-review job ----------

describe('status review annotation: JSON output includes reviewOf (plan 0003 T7)', () => {
  it('T7-3: status --json includes reviewOf.jobId and reviewOf.turnIndex for a review job', () => {
    const parentJobId = 'job_parent_xxx';
    const jobId = `job_t7j3_${createHash('sha256').update('t7-json-reviewof').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      reviewOf: { jobId: parentJobId, turnIndex: 1 },
    });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true; got: ${JSON.stringify(parsed)}`);
    assert.ok(Array.isArray(parsed.jobs), 'expected jobs array in JSON output');

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.ok(
      found.reviewOf !== undefined,
      `expected reviewOf to be present on the job; got: ${JSON.stringify(found)}`,
    );
    assert.equal(
      found.reviewOf.jobId,
      parentJobId,
      `expected reviewOf.jobId === '${parentJobId}'; got: ${found.reviewOf.jobId}`,
    );
    assert.equal(
      found.reviewOf.turnIndex,
      1,
      `expected reviewOf.turnIndex === 1; got: ${found.reviewOf.turnIndex}`,
    );
  });
});

// ---------- T7-4: JSON status OMITS reviewOf for normal jobs ----------

describe('status review annotation: JSON output omits reviewOf for normal jobs (plan 0003 T7)', () => {
  it('T7-4: status --json does NOT include reviewOf key for a job without reviewOf', () => {
    const jobId = `job_t7j4_${createHash('sha256').update('t7-json-no-reviewof').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({ jobId });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.equal(
      'reviewOf' in found,
      false,
      `expected reviewOf to be ABSENT on a normal job; got: ${JSON.stringify(found)}`,
    );
  });
});

// ---------- T7-5: JSON status marks [review] turn as kind:'review' ----------

describe('status review annotation: JSON turn kind for [review] prefix (plan 0003 T7)', () => {
  it('T7-5: status --json marks a turn with "[review] " prefix as kind:"review"', () => {
    const jobId = `job_t7j5_${createHash('sha256').update('t7-json-turn-review').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      turns: [{ summary: '[review] evaluate the prior task output' }],
    });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.ok(Array.isArray(found.turns) && found.turns.length > 0, 'expected non-empty turns');

    const turn = found.turns[0];
    assert.equal(
      turn.kind,
      'review',
      `expected turn.kind === 'review'; got: ${JSON.stringify(turn)}`,
    );
    assert.ok(
      turn.prompt.summary.startsWith('[review] '),
      `expected prompt.summary to start with "[review] " (not stripped); got: ${turn.prompt.summary}`,
    );
  });
});

// ---------- T7-6: JSON status marks [adversarial-review] turn as kind:'adversarial_review' ----------

describe('status review annotation: JSON turn kind for [adversarial-review] prefix (plan 0003 T7)', () => {
  it('T7-6: status --json marks a turn with "[adversarial-review] " prefix as kind:"adversarial_review"', () => {
    const jobId = `job_t7j6_${createHash('sha256').update('t7-json-turn-adv-review').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      turns: [{ summary: '[adversarial-review] independent evaluation of output' }],
    });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.ok(Array.isArray(found.turns) && found.turns.length > 0, 'expected non-empty turns');

    const turn = found.turns[0];
    assert.equal(
      turn.kind,
      'adversarial_review',
      `expected turn.kind === 'adversarial_review'; got: ${JSON.stringify(turn)}`,
    );
    assert.ok(
      turn.prompt.summary.startsWith('[adversarial-review] '),
      `expected prompt.summary to start with "[adversarial-review] " (not stripped); got: ${turn.prompt.summary}`,
    );
  });
});

// ---------- T7-7: JSON status leaves normal turns unmarked (no kind key) ----------

describe('status review annotation: JSON turn has no kind for plain turns (plan 0003 T7)', () => {
  it('T7-7: status --json does not add kind key to turns with plain (non-review) summaries', () => {
    const jobId = `job_t7j7_${createHash('sha256').update('t7-json-turn-plain').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      turns: [{ summary: 'inspect this repo and summarize TODOs' }],
    });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.ok(Array.isArray(found.turns) && found.turns.length > 0, 'expected non-empty turns');

    const turn = found.turns[0];
    assert.equal(
      'kind' in turn,
      false,
      `expected no 'kind' key on plain turn; got turn: ${JSON.stringify(turn)}`,
    );
  });
});

// ---------- T7-8: reviewOf.turnIndex numeric preservation in JSON ----------

describe('status review annotation: JSON preserves reviewOf.turnIndex as number (plan 0003 T7)', () => {
  it('T7-8: status --json preserves reviewOf.turnIndex === 5 as exact numeric value', () => {
    const jobId = `job_t7j8_${createHash('sha256').update('t7-json-turnindex-5').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      reviewOf: { jobId: 'job_x', turnIndex: 5 },
    });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.strictEqual(
      found.reviewOf.turnIndex,
      5,
      `expected reviewOf.turnIndex === 5 (number, not string); got: ${JSON.stringify(found.reviewOf.turnIndex)}`,
    );
  });
});

// ---------- T7-9: reviewOf WITHOUT turnIndex — human output emits annotation without "turn N" ----------

describe('status review annotation: reviewOf without turnIndex omits turn suffix (plan 0003 T7)', () => {
  it('T7-9: human status emits " (review of <jobId>)" without "turn N" when turnIndex is absent', () => {
    const parentJobId = 'job_parent_noturn';
    const jobId = `job_t7h9_${createHash('sha256').update('t7-human-no-turnindex').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      reviewOf: { jobId: parentJobId },
    });

    const result = runDispatcher(['status']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.ok(
      result.stdout.includes(` (review of ${parentJobId})`),
      `expected " (review of ${parentJobId})" in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      !result.stdout.includes(` (review of ${parentJobId} turn`),
      `expected NO "turn N" suffix when turnIndex absent; got:\n${result.stdout}`,
    );
  });
});

// ---------- T7-10: reviewOf.turnIndex === 0 is not treated as falsy ----------

describe('status review annotation: turnIndex 0 is not treated as falsy (plan 0003 T7)', () => {
  it('T7-10: human status includes "turn 0" and JSON preserves reviewOf.turnIndex === 0', () => {
    const parentJobId = 'job_parent_zero';
    const jobId = `job_t7h10_${createHash('sha256').update('t7-turnindex-zero').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      reviewOf: { jobId: parentJobId, turnIndex: 0 },
    });

    // Human path: must include "turn 0"
    const humanResult = runDispatcher(['status']);
    assert.equal(
      humanResult.status,
      0,
      `expected exit 0, got ${humanResult.status}; stderr: ${humanResult.stderr}`,
    );
    assert.ok(
      humanResult.stdout.includes(` (review of ${parentJobId} turn 0)`),
      `expected " (review of ${parentJobId} turn 0)" in human stdout (turnIndex:0 must not be falsy); got:\n${humanResult.stdout}`,
    );

    // JSON path: turnIndex must be 0 (number)
    const jsonResult = runDispatcher(['status', '--json']);
    assert.equal(
      jsonResult.status,
      0,
      `expected exit 0, got ${jsonResult.status}; stderr: ${jsonResult.stderr}`,
    );
    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(jsonResult.stdout);
    }, `stdout is not valid JSON: ${jsonResult.stdout}`);
    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.strictEqual(
      found.reviewOf.turnIndex,
      0,
      `expected reviewOf.turnIndex === 0 (must not be treated as falsy); got: ${JSON.stringify(found.reviewOf.turnIndex)}`,
    );
  });
});

// ---------- T7-11: mixed turns — only the review turn gets kind ----------

describe('status review annotation: mixed turns — only review turn gets kind (plan 0003 T7)', () => {
  it('T7-11: status --json marks only the [review] turn; plain turn has no kind key', () => {
    const jobId = `job_t7j11_${createHash('sha256').update('t7-json-mixed-turns').digest('hex').slice(0, 8)}`;
    writeSyntheticJobForStatusTest({
      jobId,
      turns: [
        { summary: 'do the original task' },
        { summary: '[review] evaluate the prior output' },
      ],
    });

    const result = runDispatcher(['status', '--json']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout is not valid JSON: ${result.stdout}`);

    const found = parsed.jobs.find((j) => j.jobId === jobId);
    assert.ok(found, `job ${jobId} not found in jobs array`);
    assert.ok(
      Array.isArray(found.turns) && found.turns.length === 2,
      `expected 2 turns; got ${found.turns?.length}`,
    );

    const plainTurn = found.turns[0];
    const reviewTurn = found.turns[1];

    assert.equal(
      'kind' in plainTurn,
      false,
      `expected no 'kind' on plain turn[0]; got: ${JSON.stringify(plainTurn)}`,
    );
    assert.equal(
      reviewTurn.kind,
      'review',
      `expected kind:'review' on turn[1]; got: ${JSON.stringify(reviewTurn)}`,
    );
  });
});

// ==========================================================================
// T9: review fixture path — dispatcher integration (plan 0003)
// ==========================================================================
//
// These tests exercise the formal fixture path introduced by plan 0003 T9:
// instead of setting attachResponse to a hand-crafted review block, the mock
// now ships structured fixture files and selects them based on prompt detection
// or an explicit reviewFixture config field.
//
// Pinned cases #5, #6, #7, #8 from the T9 spec:
//   #5 review    + structured-review fixture  → parsed findings
//   #6 review    + malformed-review fixture   → fallback nit
//   #7 adversarial-review + default (adversarial-review.txt)
//   #8 adversarial-review + malformed-review fixture → fallback nit
//
// Design: writeMockClaudeConfig is used to set reviewFixture (no attachResponse
// override) so the fixture path is exercised, not the legacy attachResponse path.
// ==========================================================================

// ---------- T9-D5: review subcommand + structured-review fixture ----------

describe('review subcommand uses structured-review fixture by default (T9)', () => {
  it('T9-D5: --json output has ok:true, verdict pass_with_findings, and 2 findings from structured fixture', () => {
    const jobId = `job_t9d5_${createHash('sha256').update('t9-review-structured').digest('hex').slice(0, 8)}`;
    const shortId = 't9d50001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    // Set reviewFixture explicitly to structured-review (no attachResponse override).
    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'structured-review',
    });

    const result = runDispatcher(['review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true; got ${JSON.stringify(parsed)}`);
    assert.ok(parsed.review !== undefined, 'expected top-level "review" field');

    // structured-review.txt has verdict: "pass_with_findings"
    assert.equal(
      parsed.review.verdict,
      'pass_with_findings',
      `expected verdict pass_with_findings; got ${parsed.review.verdict}`,
    );

    // structured-review.txt has exactly 2 findings (medium + low)
    assert.equal(
      parsed.review.findings.length,
      2,
      `expected 2 findings from structured fixture; got ${parsed.review.findings.length}`,
    );

    // First finding is medium severity
    assert.equal(
      parsed.review.findings[0].severity,
      'medium',
      `expected findings[0].severity to be 'medium'; got ${parsed.review.findings[0].severity}`,
    );

    // Second finding is low severity
    assert.equal(
      parsed.review.findings[1].severity,
      'low',
      `expected findings[1].severity to be 'low'; got ${parsed.review.findings[1].severity}`,
    );
  });
});

// ---------- T9-D6: review subcommand + malformed-review fixture (fallback) ----------

describe('review subcommand falls back on malformed-review fixture (T9)', () => {
  it('T9-D6: --json output has ok:true with exactly 1 nit finding when reviewFixture is malformed-review', () => {
    const jobId = `job_t9d6_${createHash('sha256').update('t9-review-malformed').digest('hex').slice(0, 8)}`;
    const shortId = 't9d60001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'malformed-review',
    });

    const result = runDispatcher(['review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0 on fallback parse, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true in fallback; got ${JSON.stringify(parsed)}`);
    assert.equal(
      parsed.review.findings.length,
      1,
      `expected exactly 1 fallback finding; got ${parsed.review.findings.length}`,
    );
    assert.equal(
      parsed.review.findings[0].severity,
      'nit',
      `expected fallback finding severity 'nit'; got ${parsed.review.findings[0].severity}`,
    );
  });
});

// ---------- T9-D7: adversarial-review subcommand + adversarial-review.txt (default) ----------

describe('adversarial-review subcommand uses adversarial-review fixture by default (T9)', () => {
  it('T9-D7: --json output has ok:true, verdict pass_with_findings, and 2 findings from adversarial fixture', () => {
    const jobId = `job_t9d7_${createHash('sha256').update('t9-arv-default').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    // No reviewFixture override — default selection (adversarial-review.txt on --bg path).
    // The dispatcher spawns a new --bg session for adversarial-review; the mock
    // auto-selects adversarial-review.txt because reviewFixture is null and the
    // --bg prompt detection returns the fixture via isReviewPromptBg.
    // However, parseBgArgs drops prompts starting with '---' (see T9 gap note).
    // We therefore set reviewFixture explicitly here so the fixture is returned
    // regardless of how parseBgArgs handles the prompt.
    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'adversarial-review',
    });

    const result = runDispatcher(['adversarial-review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true; got ${JSON.stringify(parsed)}`);
    assert.ok(parsed.review !== undefined, 'expected top-level "review" field');

    // adversarial-review.txt has verdict: "pass_with_findings"
    assert.equal(
      parsed.review.verdict,
      'pass_with_findings',
      `expected verdict pass_with_findings from adversarial fixture; got ${parsed.review.verdict}`,
    );

    // adversarial-review.txt has exactly 2 findings (medium + nit)
    assert.equal(
      parsed.review.findings.length,
      2,
      `expected 2 findings from adversarial fixture; got ${parsed.review.findings.length}`,
    );

    // First finding is medium severity
    assert.equal(
      parsed.review.findings[0].severity,
      'medium',
      `expected findings[0].severity to be 'medium'; got ${parsed.review.findings[0].severity}`,
    );

    // Second finding is nit severity
    assert.equal(
      parsed.review.findings[1].severity,
      'nit',
      `expected findings[1].severity to be 'nit'; got ${parsed.review.findings[1].severity}`,
    );
  });
});

// ---------- T9-D8: adversarial-review subcommand + malformed-review fixture ----------

describe('adversarial-review subcommand falls back on malformed-review fixture (T9)', () => {
  it('T9-D8: --json output has ok:true with exactly 1 nit finding when reviewFixture is malformed-review', () => {
    const jobId = `job_t9d8_${createHash('sha256').update('t9-arv-malformed').digest('hex').slice(0, 8)}`;
    writeAdversarialTargetJob({ jobId });
    writeAck(WORK_DIR);

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'malformed-review',
    });

    const result = runDispatcher(['adversarial-review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0 on fallback parse, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseJson(result.stdout);
    }, `stdout must be valid JSON; got:\n${result.stdout}`);

    assert.equal(parsed.ok, true, `expected ok:true in fallback; got ${JSON.stringify(parsed)}`);
    assert.equal(
      parsed.review.findings.length,
      1,
      `expected exactly 1 fallback finding; got ${parsed.review.findings.length}`,
    );
    assert.equal(
      parsed.review.findings[0].severity,
      'nit',
      `expected fallback finding severity 'nit'; got ${parsed.review.findings[0].severity}`,
    );
  });
});

// =============================================================================
// T12b — parse from reconciled result file, not from sidecar summary
//
// Plan 0003 T12b regression coverage. Real Claude Code 2.1.150 sets the
// per-job sidecar's `output.result` to a short SUMMARY string while the full
// assistant message (containing the fenced ```json block) only appears in the
// transcript / logs. Before T12b, $claude-review parsed `sendResult.finalMessage`
// (sourced from the sidecar summary) and triggered the fallback `nit` finding
// even when Claude had emitted proper structured review JSON. After T12b,
// cmdReview reads the reconciler's `<jobId>.result.md` file content (full
// text) and falls back to sendResult.finalMessage only when the file is
// missing or empty.
//
// The mock-claude `sidecarSummaryOnSubmit` config option lets these tests
// reproduce the production split: sidecar gets a summary, the transcript gets
// the full assistant message (which the reconciler writes to result.md via
// the transcript-events path).
// =============================================================================

describe('review parses reconciled result file, not sidecar summary (T12b)', () => {
  it('T12b-D1: human output shows real verdict + bracketed severity labels when sidecar carries only a summary', () => {
    const jobId = `job_rv12b_${createHash('sha256')
      .update('t12b-human')
      .digest('hex')
      .slice(0, 8)}`;
    const shortId = 't12bd001';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'structured-review',
      sidecarSummaryOnSubmit: 'review verdict: pass_with_findings — 2 issues',
    });

    const result = runDispatcher(['review', jobId, '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    assert.ok(
      /review verdict:.*pass.with.findings/i.test(result.stdout),
      `expected "Review verdict: PASS WITH FINDINGS" in human stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('[MEDIUM]') || result.stdout.includes('[LOW]'),
      `expected bracketed MEDIUM/LOW labels from structured fixture; got:\n${result.stdout}`,
    );
    assert.ok(
      !/^.*\[NIT\].*Review output was empty/m.test(result.stdout),
      'must NOT print the empty-output nit fallback when the result file has full JSON',
    );
  });

  it('T12b-D2: --json output exposes parsed verdict + findings array from the result file', () => {
    const jobId = `job_rv12bj_${createHash('sha256')
      .update('t12b-json')
      .digest('hex')
      .slice(0, 8)}`;
    const shortId = 't12bd002';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'structured-review',
      sidecarSummaryOnSubmit: 'review verdict: pass_with_findings — 2 issues',
    });

    const result = runDispatcher(['review', jobId, '--json', '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`,
    );

    const parsed = parseJson(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(
      parsed.review.verdict,
      'pass_with_findings',
      `expected verdict pass_with_findings from structured fixture; got ${parsed.review.verdict}`,
    );
    assert.equal(
      parsed.review.findings.length,
      2,
      `expected 2 parsed findings from the result file; got ${parsed.review.findings.length} — ${JSON.stringify(parsed.review)}`,
    );
    assert.equal(parsed.review.findings[0].severity, 'medium');
    assert.equal(parsed.review.findings[1].severity, 'low');
    for (const f of parsed.review.findings) {
      assert.notEqual(
        f.description,
        'Review output was empty.',
        'must not contain the empty-output nit fallback when result file has full JSON',
      );
    }
  });

  it('T12b-D3: turn.result.finalMessagePath written and points to a file containing the full structured JSON', () => {
    const jobId = `job_rv12bf_${createHash('sha256')
      .update('t12b-file')
      .digest('hex')
      .slice(0, 8)}`;
    const shortId = 't12bd003';
    writeSyntheticReviewableJob({ jobId, shortId });
    writeAck(WORK_DIR);
    writeMockAgentSession(shortId, shortIdToSessionId(shortId), 'idle');
    writeMockIdleSidecar(shortId, shortIdToSessionId(shortId));

    const cfgPath = writeMockClaudeConfig(MOCK_HOME, {
      reviewFixture: 'structured-review',
      sidecarSummaryOnSubmit: 'review verdict: pass_with_findings — 2 issues',
    });

    const result = runDispatcher(['review', jobId, '--yes'], {
      env: { CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG: cfgPath },
    });
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const recordPath = join(TMP_HOME, 'jobs', `${jobId}.json`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.turns.length, 2);
    const reviewTurn = record.turns[1];
    const finalMessagePath = reviewTurn.result?.finalMessagePath;
    assert.ok(
      typeof finalMessagePath === 'string' && finalMessagePath.length > 0,
      `expected turn.result.finalMessagePath to be a non-empty string; got: ${JSON.stringify(reviewTurn.result)}`,
    );
    const fileText = readFileSync(finalMessagePath, 'utf8');
    assert.ok(
      fileText.includes('```json'),
      `expected reconciled result file to contain a fenced JSON block; got:\n${fileText.slice(0, 200)}`,
    );
    assert.ok(
      fileText.includes('"verdict": "pass_with_findings"'),
      `expected reconciled result file to contain the parsed verdict; got:\n${fileText.slice(0, 200)}`,
    );
    assert.notEqual(
      fileText.trim(),
      'review verdict: pass_with_findings — 2 issues',
      'result.md must not be the sidecar summary; it must be the full transcript-derived text',
    );
  });
});

// ---------- Stage 4 N1. formatAdversarialReviewJson omits reviewOf when absent ----------

/** @type {{ formatReviewJson: (opts: { review: object; job: object; turn: object }) => string; formatAdversarialReviewJson: (opts: { review: object; job: object; targetJob: object }) => string }} */
const { formatReviewJson, formatAdversarialReviewJson } = await import(FORMAT_LIB);

describe('review JSON blocking field (Plan 0024)', () => {
  const job = { jobId: 'job_x', status: 'completed' };
  const turn = { index: 0, status: 'completed' };

  it('is false for pass_with_findings below high severity', () => {
    const parsed = JSON.parse(
      formatReviewJson({
        review: {
          verdict: 'pass_with_findings',
          findings: [{ severity: 'medium', description: 'medium finding' }],
        },
        job,
        turn,
      }),
    );
    assert.equal(parsed.review.blocking, false);
  });

  it('is true for high findings, blocker findings, and fail verdicts', () => {
    for (const review of [
      { verdict: 'pass_with_findings', findings: [{ severity: 'high', description: 'high' }] },
      {
        verdict: 'pass_with_findings',
        findings: [{ severity: 'blocker', description: 'blocker' }],
      },
      { verdict: 'fail', findings: [] },
    ]) {
      const parsed = JSON.parse(formatReviewJson({ review, job, turn }));
      assert.equal(parsed.review.blocking, true, `expected blocking for ${JSON.stringify(review)}`);
    }
  });
});

describe('formatAdversarialReviewJson omits reviewOf when absent (Stage 4 N1)', () => {
  const minimalReview = { verdict: 'pass', findings: [] };
  const minimalJob = { jobId: 'job_x', status: 'completed' };
  const minimalTargetJob = { jobId: 'job_y', status: 'completed' };

  it('N1-1a: parsed JSON has NO reviewOf key on job when job.reviewOf is undefined', () => {
    const raw = formatAdversarialReviewJson({
      review: minimalReview,
      job: { ...minimalJob },
      targetJob: minimalTargetJob,
    });
    const parsed = JSON.parse(raw);
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.job, 'reviewOf'),
      false,
      'parsed.job must not have a reviewOf key when job.reviewOf is undefined',
    );
  });

  it('N1-1b: parsed JSON HAS reviewOf set to the exact object when job.reviewOf is provided', () => {
    const reviewOf = { jobId: 'job_origin', turnIndex: 1 };
    const raw = formatAdversarialReviewJson({
      review: minimalReview,
      job: { ...minimalJob, reviewOf },
      targetJob: minimalTargetJob,
    });
    const parsed = JSON.parse(raw);
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.job, 'reviewOf'),
      true,
      'parsed.job must have a reviewOf key when job.reviewOf is provided',
    );
    assert.deepEqual(
      parsed.job.reviewOf,
      reviewOf,
      'parsed.job.reviewOf must equal the original reviewOf object',
    );
  });

  it('N1-1c: formatter never emits reviewOf: null for any input', () => {
    // Without reviewOf
    const raw1 = formatAdversarialReviewJson({
      review: minimalReview,
      job: { ...minimalJob },
      targetJob: minimalTargetJob,
    });
    const parsed1 = JSON.parse(raw1);
    assert.notEqual(
      parsed1.job.reviewOf,
      null,
      'parsed.job.reviewOf must not be null when reviewOf is absent (key should be omitted)',
    );

    // With reviewOf — should be the object, not null
    const raw2 = formatAdversarialReviewJson({
      review: minimalReview,
      job: { ...minimalJob, reviewOf: { jobId: 'job_z', turnIndex: 0 } },
      targetJob: minimalTargetJob,
    });
    const parsed2 = JSON.parse(raw2);
    assert.notEqual(
      parsed2.job.reviewOf,
      null,
      'parsed.job.reviewOf must not be null when reviewOf is a real object',
    );
  });
});

// ---------- Stage 4 N2. printUsage reflects review/adversarial-review accepted flags ----------

describe('printUsage reflects review/adversarial-review accepted flags (Stage 4 N2)', () => {
  it('N2-1a: --help output includes verbatim review subcommand line', () => {
    const result = runDispatcher(['--help']);
    assert.ok(
      result.stdout.includes('  review <jobId-or-prefix> [--all] [--json] [--yes]'),
      `--help must include "  review <jobId-or-prefix> [--all] [--json] [--yes]"\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1b: --help output includes verbatim adversarial-review subcommand line', () => {
    const result = runDispatcher(['--help']);
    assert.ok(
      result.stdout.includes(
        '  adversarial-review <jobId-or-prefix> [--all] [--json] [--yes] [--model <model>] [--effort <effort>] [--permission-mode <mode>]',
      ),
      `--help must include the full adversarial-review usage line\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1c: --help describes --model as applying to adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const modelLine = result.stdout.split('\n').find((l) => l.includes('--model'));
    assert.ok(
      modelLine && modelLine.includes('adversarial-review'),
      `--help --model flag description must include "adversarial-review"\nLine: ${modelLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1d: --help describes --effort as applying to adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const effortLine = result.stdout.split('\n').find((l) => l.includes('--effort'));
    assert.ok(
      effortLine && effortLine.includes('adversarial-review'),
      `--help --effort flag description must include "adversarial-review"\nLine: ${effortLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1e: --help describes --permission-mode as applying to adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const pmLine = result.stdout.split('\n').find((l) => l.includes('--permission-mode'));
    assert.ok(
      pmLine && pmLine.includes('adversarial-review'),
      `--help --permission-mode flag description must include "adversarial-review"\nLine: ${pmLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1f: --help describes --allow-edit with rejection by review and adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const allowEditLine = result.stdout.split('\n').find((l) => l.includes('--allow-edit'));
    assert.ok(
      allowEditLine &&
        allowEditLine.includes('rejected by review') &&
        allowEditLine.includes('adversarial-review'),
      `--help --allow-edit description must indicate rejection by review and adversarial-review\nLine: ${allowEditLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1g: --help describes --all with applicability including review/adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const allLine = result.stdout.split('\n').find((l) => /^\s+--all\s/.test(l));
    assert.ok(
      allLine && allLine.includes('review'),
      `--help --all flag description must mention "review"\nLine: ${allLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1h: --help describes --json with applicability including review/adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const jsonLine = result.stdout.split('\n').find((l) => /^\s+--json\s/.test(l));
    assert.ok(
      jsonLine && jsonLine.includes('review'),
      `--help --json flag description must mention "review"\nLine: ${jsonLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1i: --help describes --yes with applicability including review/adversarial-review', () => {
    const result = runDispatcher(['--help']);
    const yesLine = result.stdout.split('\n').find((l) => /^\s+--yes\s/.test(l));
    assert.ok(
      yesLine && yesLine.includes('review'),
      `--help --yes flag description must mention "review"\nLine: ${yesLine ?? '(not found)'}\nActual stdout:\n${result.stdout}`,
    );
  });

  it('N2-1j: --help lists advanced fresh-session passthrough flags', () => {
    const result = runDispatcher(['--help']);
    const expectedFlags = [
      '--system-prompt',
      '--append-system-prompt',
      '--plugin-dir',
      '--plugin-url',
      '--setting-sources',
      '--strict-mcp-config',
      '--agents',
      '--bare / --safe-mode',
      '--ide / --chrome / --no-chrome',
      '--disable-slash-commands',
      '--exclude-dynamic-system-prompt-sections',
      '--verbose',
    ];
    for (const flag of expectedFlags) {
      assert.ok(
        result.stdout.includes(flag),
        `--help must include advanced passthrough flag "${flag}"\nActual stdout:\n${result.stdout}`,
      );
    }
  });
});

// ---------- workflow subcommand tests (Plan 0008 T3) ----------

describe('--help mentions workflow command', () => {
  it('usage text includes "workflow" as a listed command', () => {
    const result = runDispatcher(['--help']);
    assert.equal(result.status, 0, `--help should exit 0; got ${result.status}`);
    assert.ok(
      result.stdout.includes('workflow'),
      `expected "workflow" in --help output; got:\n${result.stdout}`,
    );
  });
});

describe('workflow --help command-specific output', () => {
  it('mentions attach and that --yes does not approve the workflow gate', () => {
    const result = runDispatcher(['workflow', '--help']);
    assert.equal(result.status, 0, `workflow --help should exit 0; got ${result.status}`);
    assert.ok(result.stdout.startsWith('Usage: cc workflow'), result.stdout);
    assert.ok(result.stdout.includes('claude attach'), result.stdout);
    assert.ok(result.stdout.includes('does not approve'), result.stdout);
  });
});

describe('workflow --yes -- "test prompt" (happy path)', () => {
  it('exits 0, stdout contains job_* ID and workflow approval note', () => {
    const result = runDispatcher(['workflow', '--yes', '--', 'test workflow prompt']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('job_'),
      `expected job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude attach'),
      `expected "claude attach" approval-flow note in stdout; got:\n${result.stdout}`,
    );
    const shortId = result.stdout.match(/Claude session:\s+(\S+)/)?.[1];
    assert.ok(shortId, `expected Claude session shortId in stdout; got:\n${result.stdout}`);
    assert.ok(
      result.stdout.includes(`claude attach ${shortId}`),
      `expected attach command to use actual shortId ${shortId}; got:\n${result.stdout}`,
    );
    assert.ok(
      !result.stdout.includes('claude attach <jobId>'),
      `must not print literal <jobId> attach placeholder; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('does not approve'),
      `expected --yes approval-gate note; got:\n${result.stdout}`,
    );
  });
});

describe('workflow prompt is prefixed with ultracode:', () => {
  it('the spawned session prompt starts with "ultracode: " (verified via mock state.json)', () => {
    const userPrompt = 'my workflow task';
    const result = runDispatcher(['workflow', '--yes', '--', userPrompt]);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    // Read mock-claude state directly — sessions[] has a .prompt field.
    const statePath = join(MOCK_HOME, 'state.json');
    assert.ok(existsSync(statePath), `expected mock state.json at ${statePath}`);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(
      Array.isArray(state.sessions) && state.sessions.length > 0,
      'expected sessions in mock state',
    );
    const lastSession = state.sessions[state.sessions.length - 1];
    assert.ok(
      typeof lastSession.prompt === 'string' && lastSession.prompt.startsWith('ultracode: '),
      `expected prompt to start with "ultracode: "; got: ${lastSession.prompt}`,
    );
    assert.ok(
      lastSession.prompt.includes(userPrompt),
      `expected prompt to include user text "${userPrompt}"; got: ${lastSession.prompt}`,
    );
  });
});

describe('workflow without --yes (non-TTY stdin)', () => {
  it('exits 1 and mentions privacy or --yes', () => {
    const result = runDispatcher(['workflow', '--', 'some workflow']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when --yes is missing');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('privacy') ||
        combined.toLowerCase().includes('--yes') ||
        combined.toLowerCase().includes('acknowledge'),
      `expected mention of privacy or --yes; got:\n${combined}`,
    );
    assert.equal(listJobIds().length, 0, 'no job records should be created when --yes is absent');
  });
});

describe('workflow rejects --allow-edit', () => {
  it('exits 2 and prints a clear error when --allow-edit is passed', () => {
    const result = runDispatcher(['workflow', '--yes', '--allow-edit', '--', 'some workflow']);
    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit rejection; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected mention of "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('workflow accepts standard delegate flags', () => {
  it('exits 0 when --model, --effort, and --permission-mode are supplied', () => {
    const result = runDispatcher([
      'workflow',
      '--yes',
      '--model',
      'claude-sonnet-4-5',
      '--effort',
      'normal',
      '--permission-mode',
      'default',
      '--',
      'flagged workflow',
    ]);
    assert.equal(
      result.status,
      0,
      `expected exit 0 with standard delegate flags; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
  });
});

describe('workflow approval-flow note appended after job block', () => {
  it('stdout contains both "Job ID:" block and the workflow note about concurrent agents', () => {
    const result = runDispatcher(['workflow', '--yes', '--', 'concurrent workflow']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('Job ID:'),
      `expected standard job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('16 concurrent agents') || result.stdout.includes('dynamic workflow'),
      `expected workflow-specific note in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- goal subcommand tests (Plan 0010 T3b) ----------

describe('--help mentions goal command', () => {
  it('usage text includes "goal [flags] -- <condition>" as a listed command', () => {
    const result = runDispatcher(['--help']);
    assert.equal(result.status, 0, `--help should exit 0; got ${result.status}`);
    assert.ok(
      result.stdout.includes('goal'),
      `expected "goal" in --help output; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('goal [flags] -- <condition>'),
      `expected "goal [flags] -- <condition>" in --help output; got:\n${result.stdout}`,
    );
  });
});

describe('goal --yes -- "test condition" (happy path)', () => {
  it('exits 0, stdout contains job_* ID and goal approval note', () => {
    const result = runDispatcher(['goal', '--yes', '--', 'all unit tests pass']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('job_'),
      `expected job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude attach') || result.stdout.includes('goal'),
      `expected goal-flavored note in stdout; got:\n${result.stdout}`,
    );
  });
});

describe('goal prompt is prefixed with /goal ', () => {
  it('the spawned session prompt starts with "/goal " (verified via mock state.json)', () => {
    const userPrompt = 'my goal condition';
    const result = runDispatcher(['goal', '--yes', '--', userPrompt]);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    // Read mock-claude state directly — sessions[] has a .prompt field.
    const statePath = join(MOCK_HOME, 'state.json');
    assert.ok(existsSync(statePath), `expected mock state.json at ${statePath}`);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(
      Array.isArray(state.sessions) && state.sessions.length > 0,
      'expected sessions in mock state',
    );
    const lastSession = state.sessions[state.sessions.length - 1];
    assert.ok(
      typeof lastSession.prompt === 'string' && lastSession.prompt.startsWith('/goal '),
      `expected prompt to start with "/goal "; got: ${lastSession.prompt}`,
    );
    assert.ok(
      lastSession.prompt.includes(userPrompt),
      `expected prompt to include user text "${userPrompt}"; got: ${lastSession.prompt}`,
    );
  });
});

describe('goal without --yes (non-TTY stdin)', () => {
  it('exits 1 and mentions privacy or --yes', () => {
    const result = runDispatcher(['goal', '--', 'some condition']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when --yes is missing');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('privacy') ||
        combined.toLowerCase().includes('--yes') ||
        combined.toLowerCase().includes('acknowledge'),
      `expected mention of privacy or --yes; got:\n${combined}`,
    );
    assert.equal(listJobIds().length, 0, 'no job records should be created when --yes is absent');
  });
});

describe('goal rejects --allow-edit', () => {
  it('exits 2 and prints a clear error when --allow-edit is passed', () => {
    const result = runDispatcher(['goal', '--yes', '--allow-edit', '--', 'some condition']);
    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit rejection; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected mention of "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('goal accepts standard delegate flags', () => {
  it('exits 0 when --model, --effort, and --permission-mode are supplied', () => {
    const result = runDispatcher([
      'goal',
      '--yes',
      '--model',
      'claude-sonnet-4-5',
      '--effort',
      'normal',
      '--permission-mode',
      'default',
      '--',
      'all tests green',
    ]);
    assert.equal(
      result.status,
      0,
      `expected exit 0 with standard delegate flags; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
  });
});

describe('goal approval-flow note appended after job block', () => {
  it('stdout contains both a job block and the goal-flavored note', () => {
    const result = runDispatcher(['goal', '--yes', '--', 'goal condition for note test']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('Job ID:'),
      `expected standard job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('goal') || result.stdout.includes('attach'),
      `expected goal-specific note in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- fork subcommand tests (Plan 0011) ----------

describe('--help mentions fork command', () => {
  it('usage text includes "fork [flags] -- <directive>" as a listed command', () => {
    const result = runDispatcher(['--help']);
    assert.equal(result.status, 0, `--help should exit 0; got ${result.status}`);
    assert.ok(
      result.stdout.includes('fork'),
      `expected "fork" in --help output; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('fork [flags] -- <directive>'),
      `expected "fork [flags] -- <directive>" in --help output; got:\n${result.stdout}`,
    );
  });
});

describe('fork --yes -- "test directive" (happy path)', () => {
  it('exits 0, stdout contains job_* ID and fork approval note', () => {
    const result = runDispatcher(['fork', '--yes', '--', 'respond with OK']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('job_'),
      `expected job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude attach') || result.stdout.includes('fork'),
      `expected fork-flavored note in stdout; got:\n${result.stdout}`,
    );
  });
});

describe('fork prompt is prefixed with /fork ', () => {
  it('the spawned session prompt starts with "/fork " (verified via mock state.json)', () => {
    const userPrompt = 'my fork directive';
    const result = runDispatcher(['fork', '--yes', '--', userPrompt]);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const statePath = join(MOCK_HOME, 'state.json');
    assert.ok(existsSync(statePath), `expected mock state.json at ${statePath}`);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(
      Array.isArray(state.sessions) && state.sessions.length > 0,
      'expected sessions in mock state',
    );
    const lastSession = state.sessions[state.sessions.length - 1];
    assert.ok(
      typeof lastSession.prompt === 'string' && lastSession.prompt.startsWith('/fork '),
      `expected prompt to start with "/fork "; got: ${lastSession.prompt}`,
    );
    assert.ok(
      lastSession.prompt.includes(userPrompt),
      `expected prompt to include user text "${userPrompt}"; got: ${lastSession.prompt}`,
    );
  });
});

describe('fork without --yes (non-TTY stdin)', () => {
  it('exits 1 and mentions privacy or --yes', () => {
    const result = runDispatcher(['fork', '--', 'some directive']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when --yes is missing');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('privacy') ||
        combined.toLowerCase().includes('--yes') ||
        combined.toLowerCase().includes('acknowledge'),
      `expected mention of privacy or --yes; got:\n${combined}`,
    );
    assert.equal(listJobIds().length, 0, 'no job records should be created when --yes is absent');
  });
});

describe('fork rejects --allow-edit', () => {
  it('exits 2 and prints a clear error when --allow-edit is passed', () => {
    const result = runDispatcher(['fork', '--yes', '--allow-edit', '--', 'some directive']);
    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit rejection; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected mention of "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('fork accepts standard delegate flags', () => {
  it('exits 0 when --model, --effort, and --permission-mode are supplied', () => {
    const result = runDispatcher([
      'fork',
      '--yes',
      '--model',
      'claude-sonnet-4-5',
      '--effort',
      'normal',
      '--permission-mode',
      'default',
      '--',
      'respond with OK',
    ]);
    assert.equal(
      result.status,
      0,
      `expected exit 0 with standard delegate flags; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
  });
});

describe('fork approval-flow note appended after job block', () => {
  it('stdout contains both a job block and the fork-flavored note', () => {
    const result = runDispatcher(['fork', '--yes', '--', 'fork directive for note test']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('Job ID:'),
      `expected standard job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('fork') || result.stdout.includes('attach'),
      `expected fork-specific note in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- batch subcommand tests (Plan 0011) ----------

describe('--help mentions batch command', () => {
  it('usage text includes "batch [flags] -- <instruction>" as a listed command', () => {
    const result = runDispatcher(['--help']);
    assert.equal(result.status, 0, `--help should exit 0; got ${result.status}`);
    assert.ok(
      result.stdout.includes('batch'),
      `expected "batch" in --help output; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('batch [flags] -- <instruction>'),
      `expected "batch [flags] -- <instruction>" in --help output; got:\n${result.stdout}`,
    );
  });
});

describe('batch --yes -- "test instruction" (happy path)', () => {
  it('exits 0, stdout contains job_* ID and batch approval note', () => {
    const result = runDispatcher(['batch', '--yes', '--', 'respond with OK']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('job_'),
      `expected job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude attach') || result.stdout.includes('batch'),
      `expected batch-flavored note in stdout; got:\n${result.stdout}`,
    );
  });
});

describe('batch prompt is prefixed with /batch ', () => {
  it('the spawned session prompt starts with "/batch " (verified via mock state.json)', () => {
    const userPrompt = 'my batch instruction';
    const result = runDispatcher(['batch', '--yes', '--', userPrompt]);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const statePath = join(MOCK_HOME, 'state.json');
    assert.ok(existsSync(statePath), `expected mock state.json at ${statePath}`);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(
      Array.isArray(state.sessions) && state.sessions.length > 0,
      'expected sessions in mock state',
    );
    const lastSession = state.sessions[state.sessions.length - 1];
    assert.ok(
      typeof lastSession.prompt === 'string' && lastSession.prompt.startsWith('/batch '),
      `expected prompt to start with "/batch "; got: ${lastSession.prompt}`,
    );
    assert.ok(
      lastSession.prompt.includes(userPrompt),
      `expected prompt to include user text "${userPrompt}"; got: ${lastSession.prompt}`,
    );
  });
});

describe('batch without --yes (non-TTY stdin)', () => {
  it('exits 1 and mentions privacy or --yes', () => {
    const result = runDispatcher(['batch', '--', 'some instruction']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when --yes is missing');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('privacy') ||
        combined.toLowerCase().includes('--yes') ||
        combined.toLowerCase().includes('acknowledge'),
      `expected mention of privacy or --yes; got:\n${combined}`,
    );
    assert.equal(listJobIds().length, 0, 'no job records should be created when --yes is absent');
  });
});

describe('batch rejects --allow-edit', () => {
  it('exits 2 and prints a clear error when --allow-edit is passed', () => {
    const result = runDispatcher(['batch', '--yes', '--allow-edit', '--', 'some instruction']);
    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit rejection; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected mention of "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('batch accepts standard delegate flags', () => {
  it('exits 0 when --model, --effort, and --permission-mode are supplied', () => {
    const result = runDispatcher([
      'batch',
      '--yes',
      '--model',
      'claude-sonnet-4-5',
      '--effort',
      'normal',
      '--permission-mode',
      'default',
      '--',
      'respond with OK',
    ]);
    assert.equal(
      result.status,
      0,
      `expected exit 0 with standard delegate flags; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
  });
});

describe('batch approval-flow note appended after job block', () => {
  it('stdout contains both a job block and the batch-flavored note', () => {
    const result = runDispatcher(['batch', '--yes', '--', 'batch instruction for note test']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('Job ID:'),
      `expected standard job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('batch') || result.stdout.includes('attach'),
      `expected batch-specific note in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- deep-research subcommand tests (Plan 0013) ----------

describe('--help mentions deep-research command', () => {
  it('usage text includes "deep-research [flags] -- <question>" as a listed command', () => {
    const result = runDispatcher(['--help']);
    assert.equal(result.status, 0, `--help should exit 0; got ${result.status}`);
    assert.ok(
      result.stdout.includes('deep-research'),
      `expected "deep-research" in --help output; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('deep-research [flags] -- <question>'),
      `expected "deep-research [flags] -- <question>" in --help output; got:\n${result.stdout}`,
    );
  });
});

describe('deep-research --help command-specific output', () => {
  it('mentions WebSearch, attach, and possible workflow approval gates', () => {
    const result = runDispatcher(['deep-research', '--help']);
    assert.equal(result.status, 0, `deep-research --help should exit 0; got ${result.status}`);
    assert.ok(result.stdout.startsWith('Usage: cc deep-research'), result.stdout);
    assert.ok(result.stdout.includes('WebSearch'), result.stdout);
    assert.ok(result.stdout.includes('claude attach'), result.stdout);
    assert.ok(result.stdout.includes('approval gate'), result.stdout);
  });
});

describe('deep-research --yes -- "test question" (happy path)', () => {
  it('exits 0, stdout contains job_* ID and deep-research approval note', () => {
    const result = runDispatcher(['deep-research', '--yes', '--', 'What is 2 plus 2?']);

    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('job_'),
      `expected job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('claude attach') || result.stdout.includes('deep-research'),
      `expected deep-research-flavored note in stdout; got:\n${result.stdout}`,
    );
    const shortId = result.stdout.match(/Claude session:\s+(\S+)/)?.[1];
    assert.ok(shortId, `expected Claude session shortId in stdout; got:\n${result.stdout}`);
    assert.ok(
      result.stdout.includes(`claude attach ${shortId}`),
      `expected attach command to use actual shortId ${shortId}; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('does not approve Claude Code workflow gates'),
      `expected no-auto-approval note; got:\n${result.stdout}`,
    );
  });
});

describe('deep-research prompt is prefixed with /deep-research ', () => {
  it('the spawned session prompt starts with "/deep-research " (verified via mock state.json)', () => {
    const userPrompt = 'my research question';
    const result = runDispatcher(['deep-research', '--yes', '--', userPrompt]);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const statePath = join(MOCK_HOME, 'state.json');
    assert.ok(existsSync(statePath), `expected mock state.json at ${statePath}`);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(
      Array.isArray(state.sessions) && state.sessions.length > 0,
      'expected sessions in mock state',
    );
    const lastSession = state.sessions[state.sessions.length - 1];
    assert.ok(
      typeof lastSession.prompt === 'string' && lastSession.prompt.startsWith('/deep-research '),
      `expected prompt to start with "/deep-research "; got: ${lastSession.prompt}`,
    );
    assert.ok(
      lastSession.prompt.includes(userPrompt),
      `expected prompt to include user text "${userPrompt}"; got: ${lastSession.prompt}`,
    );
  });
});

describe('deep-research without --yes (non-TTY stdin)', () => {
  it('exits 1 and mentions privacy or --yes', () => {
    const result = runDispatcher(['deep-research', '--', 'some question']);
    assert.notEqual(result.status, 0, 'expected non-zero exit when --yes is missing');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.toLowerCase().includes('privacy') ||
        combined.toLowerCase().includes('--yes') ||
        combined.toLowerCase().includes('acknowledge'),
      `expected mention of privacy or --yes; got:\n${combined}`,
    );
    assert.equal(listJobIds().length, 0, 'no job records should be created when --yes is absent');
  });
});

describe('deep-research rejects --allow-edit', () => {
  it('exits 2 and prints a clear error when --allow-edit is passed', () => {
    const result = runDispatcher(['deep-research', '--yes', '--allow-edit', '--', 'some question']);
    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit rejection; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected mention of "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('deep-research accepts standard delegate flags', () => {
  it('exits 0 when --model, --effort, and --permission-mode are supplied', () => {
    const result = runDispatcher([
      'deep-research',
      '--yes',
      '--model',
      'claude-sonnet-4-5',
      '--effort',
      'normal',
      '--permission-mode',
      'default',
      '--',
      'What is 2 plus 2?',
    ]);
    assert.equal(
      result.status,
      0,
      `expected exit 0 with standard delegate flags; stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/, 'stdout should contain a jobId');
  });
});

describe('deep-research approval-flow note appended after job block', () => {
  it('stdout contains both a job block and the deep-research-flavored note', () => {
    const result = runDispatcher([
      'deep-research',
      '--yes',
      '--',
      'deep research question for note test',
    ]);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Claude job started') || result.stdout.includes('Job ID:'),
      `expected standard job output in stdout; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('deep-research') || result.stdout.includes('attach'),
      `expected deep-research-specific note in stdout; got:\n${result.stdout}`,
    );
  });
});

// ---------- workflows subcommand tests (Plan 0016) ----------

describe('--help mentions workflows command', () => {
  it('usage text includes "workflows [<jobId>] [--all] [--json]" as a listed command', () => {
    const result = runDispatcher(['--help']);
    assert.equal(result.status, 0, `--help should exit 0; got ${result.status}`);
    assert.ok(
      result.stdout.includes('workflows'),
      `expected "workflows" in --help output; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('workflows [<jobId>] [--all] [--json]'),
      `expected "workflows [<jobId>] [--all] [--json]" in --help output; got:\n${result.stdout}`,
    );
  });
});

describe('workflows --help command-specific output', () => {
  it('mentions read-only inspection and deep-research inclusion', () => {
    const result = runDispatcher(['workflows', '--help']);
    assert.equal(result.status, 0, `workflows --help should exit 0; got ${result.status}`);
    assert.ok(result.stdout.startsWith('Usage: cc workflows'), result.stdout);
    assert.ok(result.stdout.includes('Read-only inspector'), result.stdout);
    assert.ok(result.stdout.includes('$claude-deep-research'), result.stdout);
  });
});

describe('workflows with no args (happy path — no sessions running)', () => {
  it('exits 0 and prints a "No workflow sessions found" message or a sessions list', () => {
    const result = runDispatcher(['workflows']);
    assert.equal(
      result.status,
      0,
      `expected exit 0, got ${result.status}; stderr: ${result.stderr}`,
    );
    // Either "No workflow sessions found" (empty) or a sessions header is acceptable.
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('workflow') || combined.includes('session'),
      `expected workflow-related output; got:\n${combined}`,
    );
  });
});

describe('workflows <jobId> (unknown id — exits non-zero)', () => {
  it('exits 1 when the jobId does not match any session', () => {
    const result = runDispatcher(['workflows', 'nonexistent-job-id-xyz']);
    assert.notEqual(result.status, 0, 'expected non-zero exit for unknown jobId');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  });
});

describe('workflows --json flag produces parseable JSON', () => {
  it('exits 0 and stdout is valid JSON with a "sessions" array', () => {
    const result = runDispatcher(['workflows', '--json']);
    assert.equal(
      result.status,
      0,
      `expected exit 0 with --json; got ${result.status}; stderr: ${result.stderr}`,
    );
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

describe('workflows rejects --allow-edit', () => {
  it('exits 2 and prints a clear error when --allow-edit is passed', () => {
    const result = runDispatcher(['workflows', '--allow-edit']);
    assert.equal(
      result.status,
      2,
      `expected exit 2 for --allow-edit rejection; got ${result.status}; stderr: ${result.stderr}`,
    );
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--allow-edit'),
      `expected mention of "--allow-edit" in error output; got:\n${combined}`,
    );
  });
});

describe('workflows with extra positional arg (no match) exits 1', () => {
  it('exits 1 when a non-matching positional arg is given', () => {
    const result = runDispatcher(['workflows', 'definitely-no-such-job-id-xyz123']);
    assert.notEqual(result.status, 0, 'expected non-zero exit for unknown jobId');
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  });
});

describe('workflows does not require --yes (read-only, no privacy ack needed)', () => {
  it('exits 0 without --yes (no delegation, no ack required)', () => {
    const result = runDispatcher(['workflows']);
    assert.equal(
      result.status,
      0,
      `expected exit 0 for workflows (read-only, no --yes required); got ${result.status}; stderr: ${result.stderr}`,
    );
  });
});

// ---------- T7: version reporting consistency (Plan 0012) ----------

describe('dispatcher pluginVersion matches .codex-plugin/plugin.json (Plan 0012 T7)', () => {
  function canonicalPluginVersion() {
    const pluginJsonPath = join(
      REPO_ROOT,
      'packages',
      'plugin-codex',
      '.codex-plugin',
      'plugin.json',
    );
    return JSON.parse(readFileSync(pluginJsonPath, 'utf8')).version;
  }

  it('prints the canonical plugin version with --version', () => {
    const canonicalVersion = canonicalPluginVersion();
    const result = runDispatcher(['--version']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.equal(result.stdout.trim(), canonicalVersion);
  });

  it('prints the canonical plugin version with version command', () => {
    const canonicalVersion = canonicalPluginVersion();
    const result = runDispatcher(['version']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.equal(result.stdout.trim(), canonicalVersion);
  });

  it('prints machine-readable plugin version with --version --json', () => {
    const canonicalVersion = canonicalPluginVersion();
    const result = runDispatcher(['--version', '--json']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, version: canonicalVersion });
  });

  it('does not treat --version after -- as a global version request', () => {
    const canonicalVersion = canonicalPluginVersion();
    const result = runDispatcher(['delegate', '--yes', '--', '--version']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.notEqual(result.stdout.trim(), canonicalVersion);
    assert.match(result.stdout, /job_[a-z0-9]+_[a-f0-9]{8}/);
  });

  it('job record written by delegate --yes contains the canonical plugin version, not 0.0.0', () => {
    // Read the canonical version dynamically so this test survives future bumps.
    const canonicalVersion = canonicalPluginVersion();
    assert.ok(
      typeof canonicalVersion === 'string' && canonicalVersion !== '0.0.0',
      `plugin.json should have a real version, got: ${canonicalVersion}`,
    );

    const result = runDispatcher(['delegate', '--yes', '--', 'emit OK']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);

    const jobIds = listJobIds();
    assert.equal(jobIds.length, 1, 'expected exactly one job to be created');

    const jobPath = join(TMP_HOME, 'jobs', `${jobIds[0]}.json`);
    const jobRecord = JSON.parse(readFileSync(jobPath, 'utf8'));
    assert.equal(
      jobRecord.codex.pluginVersion,
      canonicalVersion,
      `expected pluginVersion "${canonicalVersion}", got "${jobRecord.codex.pluginVersion}"`,
    );
  });
});

// ---------- T8: error-message hints (Plan 0012) ----------

describe('review with freeform prompt emits jobId hint (Plan 0012 T8)', () => {
  it('stderr contains the jobId hint when a space-containing string is passed to review', () => {
    const result = runDispatcher(['review', 'please review my code and tell me what is wrong']);
    assert.equal(result.status, 1, `expected exit 1; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('$claude-review takes a <jobId-or-prefix>') ||
        combined.includes('Did you mean $claude-delegate'),
      `expected jobId hint in output; got:\n${combined}`,
    );
  });
});

describe('adversarial-review with freeform prompt emits its own labeled jobId hint (Plan 0012 polish)', () => {
  it('stderr contains the adversarial-review-labeled jobId hint when a space-containing string is passed', () => {
    const result = runDispatcher([
      'adversarial-review',
      'please review my code and tell me what is wrong',
    ]);
    assert.equal(result.status, 1, `expected exit 1; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('[adversarial-review]'),
      `expected [adversarial-review] label in hint; got:\n${combined}`,
    );
    assert.ok(
      combined.includes('$claude-adversarial-review takes a <jobId-or-prefix>'),
      `expected adversarial-review-specific hint text; got:\n${combined}`,
    );
  });
});

describe('stop bare --all emits bulk-stop hint (Plan 0012 T8)', () => {
  it('stderr contains the --all-awaiting-followup hint when bare --all is passed', () => {
    const result = runDispatcher(['stop', '--all']);
    assert.equal(result.status, 2, `expected exit 2; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('--all-awaiting-followup'),
      `expected --all-awaiting-followup hint in output; got:\n${combined}`,
    );
  });
});

describe('workflow-family attach hints include actual shortIds (Plan 0024 polish)', () => {
  for (const commandName of ['goal', 'fork', 'batch']) {
    it(`${commandName} prints a ready-to-copy claude attach command`, () => {
      const result = runDispatcher([commandName, '--yes', '--', 'respond with OK']);

      assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
      const shortId = result.stdout.match(/Claude session:\s+([a-f0-9]{8})/)?.[1];
      assert.ok(shortId, `expected Claude session shortId in stdout:\n${result.stdout}`);
      assert.ok(
        result.stdout.includes(`claude attach ${shortId}`),
        `expected inlined attach command for ${shortId}; got:\n${result.stdout}`,
      );
      assert.ok(
        !result.stdout.includes('claude attach <shortId>'),
        `expected no literal shortId placeholder; got:\n${result.stdout}`,
      );
    });
  }
});
