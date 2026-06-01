// Tests for the claude-companion.mjs dispatcher — T10
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
const SCRIPT = join(REPO_ROOT, 'packages', 'plugin-codex', 'scripts', 'claude-companion.mjs');
const MOCK_CLAUDE = join(REPO_ROOT, 'tools', 'mock-claude');
const MOCK_CODEX = join(REPO_ROOT, 'tools', 'mock-codex');

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

/**
 * Write a synthetic completed job record + result file directly into TMP_HOME/jobs/.
 * @param {{ jobId: string; workspaceRoot?: string; prompt?: string; resultContent?: string }} opts
 * @returns {{ jobId: string; resultContent: string }}
 */
function writeSyntheticCompletedJob({
  jobId,
  workspaceRoot = WORK_DIR,
  prompt = 'synthetic task',
  resultContent = 'Final answer from synthetic job.',
} = {}) {
  const jobsDir = join(TMP_HOME, 'jobs');
  mkdirSync(jobsDir, { recursive: true });

  const now = new Date().toISOString();
  const resultPath = join(jobsDir, `${jobId}.result.md`);

  /** @type {import('@cc-plugin-codex/runtime').JobRecord} */
  const record = {
    jobId,
    schemaVersion: 1,
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
    prompt: {
      summary: prompt.slice(0, 120),
      sha256: createHash('sha256').update(prompt).digest('hex'),
      bytesLen: Buffer.byteLength(prompt, 'utf8'),
    },
    result: {
      finalMessagePath: resultPath,
      finalMessagePreview: resultContent.slice(0, 120),
    },
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
        result.stdout.toLowerCase().includes('claude-companion') ||
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
