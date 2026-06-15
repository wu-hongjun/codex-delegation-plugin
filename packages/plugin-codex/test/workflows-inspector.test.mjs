// Unit tests for scripts/lib/workflows-inspector.mjs — Plan 0017 hotfix
//
// These tests verify the workflows inspector by writing job-store records
// to a temp CC_PLUGIN_CODEX_HOME directory and spawning cc.mjs with that
// env var set. The inspector reads from the job store (via the runtime
// listJobs / listJobsForWorkspace helpers); no `claude` binary is needed.
//
// Pre-Plan-0017 these tests stubbed `claude agents --json`, but the
// inspector no longer reads from there — the smoke-test bug (findings-
// 20260607.md) revealed that the session NAME field is set to
// `codex:<workspace>:<id>` by the driver, not to `ultracode:...`. The
// correct discriminator is `prompt.summary.startsWith('ultracode: ')`,
// stored in the local job record.

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
let TMP_HOME;
let JOBS_DIR;
let WORK_DIR;

beforeEach(() => {
  TMP_DIR = mkdtempSync(join(tmpdir(), 'wf-inspector-test-'));
  TMP_HOME = join(TMP_DIR, 'cc-plugin-codex');
  JOBS_DIR = join(TMP_HOME, 'jobs');
  WORK_DIR = join(TMP_DIR, 'work');
  mkdirSync(JOBS_DIR, { recursive: true });
  mkdirSync(WORK_DIR, { recursive: true });
});

afterEach(() => {
  if (TMP_DIR && existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

// ---------- helpers ----------

/**
 * Write a fixture job record to JOBS_DIR.
 *
 * @param {string} jobId
 * @param {object} fields
 *   - promptSummary: string (defaults to a workflow-flagged prompt)
 *   - workspaceRoot: string (defaults to WORK_DIR)
 *   - sessionId, sessionName, status, createdAt: optional
 */
function makeJobRecord(jobId, fields = {}) {
  // sha256 must be valid hex. Derive a unique hex string from the jobId
  // by replacing the (non-hex) prefix letters with 'f'.
  const sha256Hex = jobId
    .toLowerCase()
    .replace(/[^a-f0-9]/g, 'f')
    .padEnd(64, '0')
    .slice(0, 64);
  const promptObj = {
    summary: fields.promptSummary ?? `ultracode: ${jobId} test prompt`,
    sha256: sha256Hex,
    bytesLen: 100,
  };
  const record = {
    jobId,
    schemaVersion: 2,
    createdAt: fields.createdAt ?? '2026-06-07T00:00:00.000Z',
    updatedAt: '2026-06-07T00:00:00.000Z',
    status: fields.status ?? 'running',
    codex: {
      cwd: fields.workspaceRoot ?? WORK_DIR,
      pluginVersion: '0.2.0',
    },
    workspace: {
      root: fields.workspaceRoot ?? WORK_DIR,
    },
    driver: { name: 'claude-background', version: '0.0.0' },
    // Session identity lives under `claude.*` in real job records — NOT at the
    // top level. The v0.3.0 pre-release audit caught a regression where the
    // inspector read the (always-null) top-level fields and surfaced blanks.
    claude: {
      binaryPath: '/usr/local/bin/claude',
      version: '2.1.168',
      sessionId:
        fields.sessionId ?? `${jobId.slice(4, 12).padEnd(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`,
      sessionName: fields.sessionName ?? `codex:test:${jobId}`,
    },
    prompt: promptObj,
    turns: [
      {
        turnId: 'turn-0',
        prompt: promptObj,
        startedAt: fields.createdAt ?? '2026-06-07T00:00:00.000Z',
      },
    ],
  };
  writeFileSync(join(JOBS_DIR, `${jobId}.json`), JSON.stringify(record, null, 2));
}

/**
 * Run cc.mjs with given args and the test home env var set.
 */
function runDispatcher(args, overrideEnv = {}) {
  const env = {
    PATH: process.env.PATH,
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

describe('workflows: no sessions when jobs dir is empty', () => {
  it('exits 0 and prints "No workflow sessions found"', () => {
    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('No workflow sessions') || combined.includes('workflow'),
      `expected workflow-related output; got:\n${combined}`,
    );
  });
});

describe('workflows: filters to workflow-like prompt prefixes', () => {
  it('exits 0 and only lists jobs whose prompt.summary has a workflow-like prefix', () => {
    makeJobRecord('job_test01aa_aaaaaaaa', {
      promptSummary: 'ultracode: audit fetch calls',
      sessionName: 'codex:wflow:a1111111',
    });
    makeJobRecord('job_test02bb_bbbbbbbb', {
      promptSummary: 'Regular delegate prompt',
      sessionName: 'codex:nonwf:b2222222',
    });
    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('codex:wflow:a1111111') || result.stdout.includes('test01aa'),
      `workflow job should appear in output; stdout:\n${result.stdout}`,
    );
    assert.ok(
      !result.stdout.includes('codex:nonwf:b2222222'),
      `non-workflow job should NOT appear; stdout:\n${result.stdout}`,
    );
  });
});

describe('workflows: includes deep-research prompt jobs', () => {
  it('lists ultracode and /deep-research jobs, but excludes ordinary delegates', () => {
    makeJobRecord('job_wfkind1_aaaaaaaa', {
      promptSummary: 'ultracode: local workflow',
      sessionName: 'codex:wflow:kind1',
    });
    makeJobRecord('job_wfkind2_bbbbbbbb', {
      promptSummary: '/deep-research local question',
      sessionName: 'codex:research:kind2',
    });
    makeJobRecord('job_wfkind3_cccccccc', {
      promptSummary: 'Regular delegate prompt',
      sessionName: 'codex:delegate:kind3',
    });

    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('codex:wflow:kind1'), result.stdout);
    assert.ok(result.stdout.includes('codex:research:kind2'), result.stdout);
    assert.ok(!result.stdout.includes('codex:delegate:kind3'), result.stdout);
  });
});

describe('workflows <unknown-jobId>: exits 1', () => {
  it('exits 1 when the jobId does not match any job record', () => {
    const result = runDispatcher(['workflows', 'nonexistent-job-id-xyz']);
    assert.notEqual(result.status, 0, 'expected non-zero exit for unknown jobId');
    assert.equal(result.status, 1, `expected exit 1; got ${result.status}`);
  });
});

describe('workflows --json: produces parseable JSON with sessions array', () => {
  it('exits 0 and stdout is valid JSON with a "sessions" array', () => {
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

describe('workflows --json: emits workflow kind', () => {
  it('distinguishes dynamic workflow and deep-research sessions', () => {
    makeJobRecord('job_kindjson1_aaaaaaaa', {
      promptSummary: 'ultracode: json workflow',
      sessionName: 'codex:wflow:jsonkind',
    });
    makeJobRecord('job_kindjson2_bbbbbbbb', {
      promptSummary: '/deep-research json question',
      sessionName: 'codex:research:jsonkind',
    });

    const result = runDispatcher(['workflows', '--json']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    const kinds = new Set(parsed.sessions.map((s) => s.kind));
    assert.ok(kinds.has('dynamic_workflow'), `missing dynamic_workflow in ${result.stdout}`);
    assert.ok(kinds.has('deep_research'), `missing deep_research in ${result.stdout}`);
  });
});

describe('workflows --allow-edit: exits 2 with error mentioning --allow-edit', () => {
  it('exits 2 and prints error mentioning --allow-edit', () => {
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

// ---------- Plan 0017 hotfix regression tests ----------

describe('_sanitizeCwd: preserves leading hyphen to match Claude project dir format', async () => {
  const { _sanitizeCwd } = await import(
    resolve(REPO_ROOT, 'packages/plugin-codex/scripts/lib/workflows-inspector.mjs')
  );
  it('produces -Users-foo-bar (with leading hyphen) for /Users/foo/bar', () => {
    assert.equal(_sanitizeCwd('/Users/foo/bar'), '-Users-foo-bar');
  });
  it('produces -tmp for /tmp', () => {
    assert.equal(_sanitizeCwd('/tmp'), '-tmp');
  });
  it('produces empty string for empty input', () => {
    assert.equal(_sanitizeCwd(''), '');
  });
});

describe('workflows --all: includes workflow jobs from other workspaces (Plan 0017)', () => {
  it('with --all, lists workflow jobs whose workspace.root does NOT match cwd', () => {
    makeJobRecord('job_local03_aaaaaaaa', {
      promptSummary: 'ultracode: local workflow',
      workspaceRoot: WORK_DIR,
      sessionName: 'codex:localwflow:aa',
    });
    makeJobRecord('job_other04_bbbbbbbb', {
      promptSummary: 'ultracode: other-workspace workflow',
      workspaceRoot: '/some/other/workspace',
      sessionName: 'codex:otherwflow:bb',
    });
    const result = runDispatcher(['workflows', '--all']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('codex:localwflow:aa') || result.stdout.includes('local03'),
      `--all should include local workflow; stdout:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('codex:otherwflow:bb') || result.stdout.includes('other04'),
      `--all should include cross-workspace workflow; stdout:\n${result.stdout}`,
    );
  });
});

describe('workflows: excludes jobs from other workspaces without --all (Plan 0017)', () => {
  it('without --all, filters out workflow jobs whose workspace.root does NOT match cwd', () => {
    makeJobRecord('job_local03_aaaaaaaa', {
      promptSummary: 'ultracode: local workflow',
      workspaceRoot: WORK_DIR,
      sessionName: 'codex:localwflow:aa',
    });
    makeJobRecord('job_other04_bbbbbbbb', {
      promptSummary: 'ultracode: other-workspace workflow',
      workspaceRoot: '/some/other/workspace',
      sessionName: 'codex:otherwflow:bb',
    });
    const result = runDispatcher(['workflows']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('codex:localwflow:aa') || result.stdout.includes('local03'),
      `local workflow should appear; stdout:\n${result.stdout}`,
    );
    assert.ok(
      !result.stdout.includes('codex:otherwflow:bb') && !result.stdout.includes('other04'),
      `cross-workspace workflow should NOT appear without --all; stdout:\n${result.stdout}`,
    );
  });
});

describe('workflows <jobId>: drill-in succeeds for workflow jobs', () => {
  it('exits 0 and shows the workflow detail for a known workflow job', () => {
    makeJobRecord('job_drill05_cccccccc', {
      promptSummary: 'ultracode: drill target',
      sessionId: '11111111-2222-3333-4444-555555555555',
      sessionName: 'codex:test:drill',
      status: 'awaiting_followup',
    });
    const result = runDispatcher(['workflows', 'job_drill05_cccccccc']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Workflow session') || result.stdout.includes('Status'),
      `expected workflow detail output; got:\n${result.stdout}`,
    );
  });
});

describe('workflows <jobId>: drill-in succeeds for deep-research jobs', () => {
  it('exits 0 and shows detail for a /deep-research job', () => {
    makeJobRecord('job_drdeep_cccccccc', {
      promptSummary: '/deep-research drill target',
      sessionId: '22222222-3333-4444-5555-666666666666',
      sessionName: 'codex:test:deepdrill',
      status: 'awaiting_followup',
    });
    const result = runDispatcher(['workflows', 'job_drdeep_cccccccc']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('codex:test:deepdrill'), result.stdout);
    assert.ok(result.stdout.includes('deep_research'), result.stdout);
  });
});

describe('workflows <jobId>: drill-in surfaces claude.sessionId / claude.sessionName (v0.3.0 audit fix)', () => {
  it('shows the non-blank session id and name from the job record claude block', () => {
    makeJobRecord('job_drill07_eeeeeeee', {
      promptSummary: 'ultracode: drill metadata target',
      sessionId: '99999999-2222-3333-4444-555555555555',
      sessionName: 'codex:cc:metadatacheck',
      status: 'awaiting_followup',
    });
    const result = runDispatcher(['workflows', 'job_drill07_eeeeeeee']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    // Regression: these were blank when the inspector read top-level
    // job.sessionId / job.sessionName instead of job.claude.sessionId/Name.
    assert.ok(
      result.stdout.includes('99999999-2222-3333-4444-555555555555'),
      `drill-in must surface the claude.sessionId; got:\n${result.stdout}`,
    );
    assert.ok(
      result.stdout.includes('codex:cc:metadatacheck'),
      `drill-in must surface the claude.sessionName; got:\n${result.stdout}`,
    );
    assert.ok(
      !/Workflow session:\s*$/m.test(result.stdout),
      `"Workflow session:" line must not be blank; got:\n${result.stdout}`,
    );
  });
});

describe('workflows list: shortId comes from claude.sessionId (v0.3.0 audit fix)', () => {
  it('uses the 8-char Claude session prefix, not the job id, as shortId', () => {
    makeJobRecord('job_listid8_ffffffff', {
      promptSummary: 'ultracode: list shortId target',
      sessionId: 'abcd1234-2222-3333-4444-555555555555',
      sessionName: 'codex:cc:listcheck',
    });
    const result = runDispatcher(['workflows', '--all']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('abcd1234'),
      `list shortId must be the Claude session prefix; got:\n${result.stdout}`,
    );
  });
});

describe('workflows drill-in by session id / shortId (Plan 0019 B1)', () => {
  it('resolves a workflow by full Claude session id', () => {
    makeJobRecord('job_sidres1_aaaaaaaa', {
      promptSummary: 'ultracode: session-id lookup target',
      sessionId: 'deadbeef-1111-2222-3333-444444444444',
      sessionName: 'codex:cc:sidlookup',
    });
    const result = runDispatcher(['workflows', 'deadbeef-1111-2222-3333-444444444444']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('codex:cc:sidlookup'),
      `drill-in by full session id must resolve; got:\n${result.stdout}`,
    );
  });

  it('resolves a workflow by 8-char session shortId (as shown in the list)', () => {
    makeJobRecord('job_sidres2_bbbbbbbb', {
      promptSummary: 'ultracode: session shortId lookup target',
      sessionId: 'cafe9999-1111-2222-3333-444444444444',
      sessionName: 'codex:cc:shortidlookup',
    });
    // The list view prints the 8-char prefix "cafe9999"; passing it must work.
    const result = runDispatcher(['workflows', 'cafe9999']);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('codex:cc:shortidlookup'),
      `drill-in by 8-char session shortId must resolve; got:\n${result.stdout}`,
    );
  });
});

describe('workflows <jobId>: drill-in rejects non-workflow jobs', () => {
  it('exits 1 with a clear error when the matched job is not a workflow', () => {
    makeJobRecord('job_nonwf06_dddddddd', {
      promptSummary: 'Regular delegate prompt',
      sessionName: 'codex:test:nonwf',
    });
    const result = runDispatcher(['workflows', 'job_nonwf06_dddddddd']);
    assert.equal(result.status, 1, `expected exit 1; got ${result.status}`);
    const combined = result.stdout + result.stderr;
    assert.ok(
      combined.includes('not a workflow') || combined.includes('ultracode'),
      `expected error mentioning the non-workflow reason; got:\n${combined}`,
    );
  });
});
