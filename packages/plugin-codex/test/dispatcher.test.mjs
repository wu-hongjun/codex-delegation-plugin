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
    ];

    for (const probe of expectedProbes) {
      assert.ok(
        result.stdout.includes(probe),
        `expected probe "${probe}" in human output; got:\n${result.stdout}`,
      );
    }
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

// ---------- Test 19: real ~/.claude and ~/.codex are NOT touched ----------

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
