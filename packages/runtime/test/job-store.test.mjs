// Tests for the runtime job store. Imports the compiled output from dist/ so we exercise
// the same code path callers will see. Each test gets its own CODEX_DELEGATION_HOME so
// state never leaks across tests.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CorruptJobRecordError,
  InvalidJobIdError,
  JobLockError,
  JobNotFoundError,
  appendEvent,
  createJob,
  ensureDelegationDirs,
  generateJobId,
  getDelegationHome,
  getDoctorPath,
  getJobEventsPath,
  getJobLockPath,
  getJobRecordPath,
  getJobResultPath,
  getJobTurnResultPath,
  getJobsDir,
  getLogsDir,
  listJobs,
  listJobsForWorkspace,
  readEvents,
  readJob,
  tryReadJob,
  updateJob,
  validateJobId,
} from '../dist/index.js';

let TMP_HOME;
const PREV_HOME = process.env.CODEX_DELEGATION_HOME;

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), 'runtime-test-'));
  process.env.CODEX_DELEGATION_HOME = TMP_HOME;
});

afterEach(() => {
  if (PREV_HOME === undefined) {
    delete process.env.CODEX_DELEGATION_HOME;
  } else {
    process.env.CODEX_DELEGATION_HOME = PREV_HOME;
  }
  rmSync(TMP_HOME, { recursive: true, force: true });
});

function makeInput(overrides = {}) {
  return {
    codex: { pluginVersion: '0.0.0', cwd: '/some/cwd' },
    workspace: { root: '/repo' },
    driver: {
      name: 'claude-background',
      version: '0.0.0',
      capabilitiesSnapshot: {},
    },
    claude: {
      version: '2.1.999-mock',
      shortId: 'abc123',
      sessionName: 'codex:test:abc',
      cwd: '/repo',
      logsCommand: 'claude logs abc123',
    },
    prompt: { summary: 'hi', sha256: 'deadbeef', bytesLen: 2 },
    ...overrides,
  };
}

describe('paths', () => {
  it('resolve under CODEX_DELEGATION_HOME', () => {
    assert.equal(getDelegationHome(), TMP_HOME);
    assert.equal(getJobsDir(), join(TMP_HOME, 'jobs'));
    assert.equal(getLogsDir(), join(TMP_HOME, 'logs'));
    assert.equal(getDoctorPath(), join(TMP_HOME, 'doctor.json'));
  });

  it('do not create directories on their own', async () => {
    // Calling helpers should not touch the filesystem.
    getJobsDir();
    getLogsDir();
    // mkdir would have already been needed if the helpers were eager.
    const { jobs, warnings } = await listJobs();
    assert.deepEqual(jobs, []);
    assert.deepEqual(warnings, []);
  });

  it('ensureDelegationDirs creates jobs and logs dirs', async () => {
    const { readdirSync } = await import('node:fs');
    await ensureDelegationDirs();
    const entries = readdirSync(TMP_HOME).sort();
    assert.deepEqual(entries, ['jobs', 'logs']);
  });

  it('job-specific path helpers derive from job id', () => {
    const id = 'job_abc_12345678';
    assert.equal(getJobRecordPath(id), join(TMP_HOME, 'jobs', `${id}.json`));
    assert.equal(getJobEventsPath(id), join(TMP_HOME, 'jobs', `${id}.events.jsonl`));
    assert.equal(getJobResultPath(id), join(TMP_HOME, 'jobs', `${id}.result.md`));
    assert.equal(getJobTurnResultPath(id, 0), join(TMP_HOME, 'jobs', `${id}.turn-0.result.md`));
    assert.equal(getJobLockPath(id), join(TMP_HOME, 'jobs', `${id}.lock`));
  });
});

describe('jobId validation', () => {
  it('rejects empty / wrong-shape strings', () => {
    assert.throws(() => validateJobId(''), InvalidJobIdError);
    assert.throws(() => validateJobId('not-a-job'), InvalidJobIdError);
    assert.throws(() => validateJobId('job__12345678'), InvalidJobIdError);
    assert.throws(() => validateJobId('job_abc_xyz'), InvalidJobIdError);
    assert.throws(() => validateJobId('job_abc_1234567'), InvalidJobIdError); // 7 hex
  });

  it('rejects path-traversal attempts', () => {
    assert.throws(() => validateJobId('../etc/passwd'), InvalidJobIdError);
    assert.throws(() => validateJobId('job_abc_12345678/../escape'), InvalidJobIdError);
    assert.throws(() => validateJobId('job_abc_12345678\0'), InvalidJobIdError);
  });

  it('accepts generated ids', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateJobId();
      assert.doesNotThrow(() => validateJobId(id));
      assert.match(id, /^job_[a-z0-9]+_[a-f0-9]{8}$/);
    }
  });
});

describe('createJob', () => {
  it('writes a record and round-trips through readJob', async () => {
    const record = await createJob(makeInput());
    assert.match(record.jobId, /^job_[a-z0-9]+_[a-f0-9]{8}$/);
    assert.equal(record.schemaVersion, 2); // T6: createJob now emits schemaVersion 2
    assert.equal(record.status, 'queued');
    assert.equal(record.workspace.root, '/repo');

    const round = await readJob(record.jobId);
    assert.deepEqual(round, record);
  });

  it('accepts an explicit jobId when provided', async () => {
    const id = 'job_explicit_aabbccdd';
    const record = await createJob({ ...makeInput(), jobId: id });
    assert.equal(record.jobId, id);
    const round = await readJob(id);
    assert.equal(round.jobId, id);
  });

  it('rejects an invalid explicit jobId', async () => {
    await assert.rejects(createJob({ ...makeInput(), jobId: '../escape' }), InvalidJobIdError);
  });

  it('writes record path matching getJobRecordPath', async () => {
    const record = await createJob(makeInput());
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(getJobRecordPath(record.jobId)));
  });
});

describe('readJob / tryReadJob', () => {
  it('tryReadJob returns null when the job does not exist', async () => {
    const id = 'job_missing_00000000';
    const result = await tryReadJob(id);
    assert.equal(result, null);
  });

  it('readJob throws JobNotFoundError for missing job', async () => {
    await assert.rejects(readJob('job_missing_00000000'), JobNotFoundError);
  });

  it('readJob throws CorruptJobRecordError for malformed JSON', async () => {
    await ensureDelegationDirs();
    const id = 'job_corrupt_00000000';
    writeFileSync(getJobRecordPath(id), '{not json}', 'utf8');
    await assert.rejects(readJob(id), CorruptJobRecordError);
  });

  it('rejects an invalid jobId before touching the filesystem', async () => {
    await assert.rejects(readJob('bogus'), InvalidJobIdError);
    await assert.rejects(tryReadJob('bogus'), InvalidJobIdError);
  });
});

describe('updateJob', () => {
  it('updates the record and bumps updatedAt', async () => {
    const initial = await createJob(makeInput());
    await new Promise((r) => setTimeout(r, 2));
    const updated = await updateJob(initial.jobId, (rec) => ({ ...rec, status: 'running' }));
    assert.equal(updated.status, 'running');
    assert.notEqual(updated.updatedAt, initial.updatedAt);

    const round = await readJob(initial.jobId);
    assert.equal(round.status, 'running');
  });

  it('releases the lock after a successful update', async () => {
    const { existsSync } = await import('node:fs');
    const initial = await createJob(makeInput());
    await updateJob(initial.jobId, (rec) => ({ ...rec, status: 'starting' }));
    assert.ok(!existsSync(getJobLockPath(initial.jobId)), 'lock should be released');
  });

  it('releases the lock even when the updater throws', async () => {
    const { existsSync } = await import('node:fs');
    const initial = await createJob(makeInput());
    await assert.rejects(
      updateJob(initial.jobId, () => {
        throw new Error('updater boom');
      }),
      /updater boom/,
    );
    assert.ok(!existsSync(getJobLockPath(initial.jobId)), 'lock should be released on throw');
  });

  it('throws JobLockError when the lock is already held', async () => {
    const initial = await createJob(makeInput());
    // Manually create a lock to simulate a concurrent holder.
    writeFileSync(getJobLockPath(initial.jobId), JSON.stringify({ pid: 1, operation: 'other' }));
    await assert.rejects(
      updateJob(initial.jobId, (rec) => ({ ...rec, status: 'running' })),
      JobLockError,
    );
  });
});

describe('events', () => {
  it('appendEvent / readEvents round-trip in order', async () => {
    const initial = await createJob(makeInput());
    await appendEvent(initial.jobId, { type: 'session.started', at: '2026-05-30T00:00:00.000Z' });
    await appendEvent(initial.jobId, { type: 'message.completed', role: 'assistant' });
    await appendEvent(initial.jobId, { type: 'session.completed' });
    const events = await readEvents(initial.jobId);
    assert.equal(events.length, 3);
    assert.equal(events[0].type, 'session.started');
    assert.equal(events[1].role, 'assistant');
    assert.equal(events[2].type, 'session.completed');
  });

  it('readEvents returns [] when no events have been written', async () => {
    const initial = await createJob(makeInput());
    const events = await readEvents(initial.jobId);
    assert.deepEqual(events, []);
  });
});

describe('listJobs', () => {
  it('returns empty when nothing exists', async () => {
    const { jobs, warnings } = await listJobs();
    assert.deepEqual(jobs, []);
    assert.deepEqual(warnings, []);
  });

  it('returns all jobs from the jobs dir', async () => {
    const a = await createJob(makeInput());
    const b = await createJob(makeInput());
    const { jobs, warnings } = await listJobs();
    assert.equal(jobs.length, 2);
    assert.deepEqual(jobs.map((j) => j.jobId).sort(), [a.jobId, b.jobId].sort());
    assert.deepEqual(warnings, []);
  });

  it('skips corrupt records and surfaces a warning', async () => {
    const good = await createJob(makeInput());
    await ensureDelegationDirs();
    writeFileSync(getJobRecordPath('job_corrupt_00000000'), '{not-json}', 'utf8');
    const { jobs, warnings } = await listJobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].jobId, good.jobId);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, 'corrupt-record');
    assert.match(warnings[0].path, /job_corrupt_00000000\.json$/);
  });

  it('warns on unrecognized json files in the jobs dir', async () => {
    await ensureDelegationDirs();
    writeFileSync(join(getJobsDir(), 'random.json'), '{}', 'utf8');
    const { jobs, warnings } = await listJobs();
    assert.deepEqual(jobs, []);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, 'unrecognized-file');
  });

  it('ignores in-flight .tmp files left by an atomic write', async () => {
    await createJob(makeInput());
    await ensureDelegationDirs();
    writeFileSync(join(getJobsDir(), 'job_x_12345678.json.99.deadbeef.tmp'), 'partial');
    const { jobs, warnings } = await listJobs();
    assert.equal(jobs.length, 1);
    assert.deepEqual(warnings, []);
  });
});

describe('listJobsForWorkspace', () => {
  it('filters by workspace.root', async () => {
    const a = await createJob({ ...makeInput(), workspace: { root: '/repo-a' } });
    const b = await createJob({ ...makeInput(), workspace: { root: '/repo-b' } });
    const a2 = await createJob({ ...makeInput(), workspace: { root: '/repo-a' } });
    const { jobs } = await listJobsForWorkspace('/repo-a');
    assert.equal(jobs.length, 2);
    assert.deepEqual(jobs.map((j) => j.jobId).sort(), [a.jobId, a2.jobId].sort());
    void b;
  });
});

// ---------------------------------------------------------------------------
// T5: reviewOf field on JobRecord (Plan 0003)
// ---------------------------------------------------------------------------

describe('reviewOf — createJob with reviewOf round-trips via readJob', () => {
  it('returns the same reviewOf shape deep-equal after readJob', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd', turnIndex: 2 };
    const created = await createJob(makeInput({ reviewOf }));
    assert.deepEqual(created.reviewOf, reviewOf, 'createJob return value should carry reviewOf');

    const round = await readJob(created.jobId);
    assert.deepEqual(round.reviewOf, reviewOf, 'readJob should return the same reviewOf shape');
  });
});

describe('reviewOf — createJob without reviewOf reads back as undefined', () => {
  it('returns reviewOf === undefined when createJob is called without reviewOf', async () => {
    const created = await createJob(makeInput());
    assert.equal(created.reviewOf, undefined, 'reviewOf should be undefined when not supplied');

    const round = await readJob(created.jobId);
    assert.equal(round.reviewOf, undefined, 'readJob should return reviewOf === undefined');
  });

  it('on-disk JSON does not contain a reviewOf key when reviewOf not supplied', async () => {
    const { readFileSync } = await import('node:fs');
    const created = await createJob(makeInput());
    const raw = JSON.parse(readFileSync(getJobRecordPath(created.jobId), 'utf8'));
    assert.ok(!('reviewOf' in raw), 'on-disk JSON must not contain a reviewOf key');
  });
});

describe('reviewOf — updateJob preserves reviewOf when updater changes unrelated fields', () => {
  it('reviewOf survives an updateJob that changes status', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd', turnIndex: 1 };
    const created = await createJob(makeInput({ reviewOf }));

    await updateJob(created.jobId, (rec) => ({ ...rec, status: 'completed' }));

    const round = await readJob(created.jobId);
    assert.equal(round.status, 'completed', 'status should be updated');
    assert.deepEqual(
      round.reviewOf,
      reviewOf,
      'reviewOf should be preserved after unrelated update',
    );
  });
});

describe('reviewOf — updateJob can modify reviewOf explicitly', () => {
  it('reads back the new reviewOf after updater replaces it', async () => {
    const initial = await createJob(
      makeInput({ reviewOf: { jobId: 'job_old_aabbccdd', turnIndex: 0 } }),
    );
    const newReviewOf = { jobId: 'job_new_aabbccdd', turnIndex: 5 };

    await updateJob(initial.jobId, (rec) => ({ ...rec, reviewOf: newReviewOf }));

    const round = await readJob(initial.jobId);
    assert.deepEqual(round.reviewOf, newReviewOf, 'reviewOf should reflect the updated value');
  });
});

describe('reviewOf — v2 record with reviewOf written directly to disk reads cleanly', () => {
  it('readJob returns reviewOf without migration warnings or errors', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const jobId = 'job_revof_aabbccdd';
    const now = new Date().toISOString();
    const prompt = { summary: 'direct write', sha256: 'deadbeef', bytesLen: 11 };
    const reviewOf = { jobId: 'job_target_11223344', turnIndex: 3 };
    const record = {
      jobId,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
      status: 'completed',
      codex: { pluginVersion: '0.0.0', cwd: '/tmp/x' },
      workspace: { root: '/tmp/x' },
      driver: { name: 'claude-background', version: '0.0.0', capabilitiesSnapshot: {} },
      claude: {
        version: '2.1.999-mock',
        shortId: 'aabb1122',
        sessionName: 'codex:test:aabb',
        cwd: '/tmp/x',
        logsCommand: 'claude logs aabb1122',
      },
      prompt,
      turns: [{ prompt, startedAt: now, endedAt: now, status: 'completed' }],
      reviewOf,
    };
    mkdirSync(join(TMP_HOME, 'jobs'), { recursive: true });
    writeFileSync(getJobRecordPath(jobId), JSON.stringify(record, null, 2) + '\n', 'utf8');

    const read = await readJob(jobId);
    assert.deepEqual(
      read.reviewOf,
      reviewOf,
      'readJob should return the reviewOf from the direct-written v2 file',
    );
  });
});

describe('reviewOf — listJobs returns reviewOf on jobs that have it', () => {
  it('job with reviewOf has it set; job without reviewOf has reviewOf === undefined', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd', turnIndex: 0 };
    const withReview = await createJob(makeInput({ reviewOf }));
    const withoutReview = await createJob(makeInput());

    const { jobs } = await listJobs();
    assert.equal(jobs.length, 2, 'listJobs should return both jobs');

    const found = jobs.find((j) => j.jobId === withReview.jobId);
    const plain = jobs.find((j) => j.jobId === withoutReview.jobId);
    assert.ok(found, 'job with reviewOf should appear in listJobs');
    assert.ok(plain, 'job without reviewOf should appear in listJobs');
    assert.deepEqual(
      found.reviewOf,
      reviewOf,
      'job with reviewOf should have it set in listJobs result',
    );
    assert.equal(
      plain.reviewOf,
      undefined,
      'job without reviewOf should have reviewOf === undefined in listJobs result',
    );
  });
});

describe('reviewOf — listJobsForWorkspace returns reviewOf on jobs that have it', () => {
  it('job with reviewOf has it set; job without reviewOf has reviewOf === undefined', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd', turnIndex: 0 };
    const withReview = await createJob(
      makeInput({ reviewOf, workspace: { root: '/review-repo' } }),
    );
    const withoutReview = await createJob(makeInput({ workspace: { root: '/review-repo' } }));
    // different workspace — should not appear
    await createJob(makeInput({ workspace: { root: '/other-repo' } }));

    const { jobs } = await listJobsForWorkspace('/review-repo');
    assert.equal(jobs.length, 2, 'listJobsForWorkspace should return the two /review-repo jobs');

    const found = jobs.find((j) => j.jobId === withReview.jobId);
    const plain = jobs.find((j) => j.jobId === withoutReview.jobId);
    assert.ok(found, 'job with reviewOf should appear in listJobsForWorkspace');
    assert.ok(plain, 'job without reviewOf should appear in listJobsForWorkspace');
    assert.deepEqual(
      found.reviewOf,
      reviewOf,
      'reviewOf should be preserved through listJobsForWorkspace',
    );
    assert.equal(
      plain.reviewOf,
      undefined,
      'reviewOf should be undefined on the plain job in listJobsForWorkspace',
    );
  });
});

describe('reviewOf — invalid reviewOf is persisted as-is (no validation in T5)', () => {
  it('createJob accepts reviewOf with an empty jobId string without throwing', async () => {
    const invalidReviewOf = { jobId: '', turnIndex: 0 };
    // T5 does not add validation; the invalid value is persisted unchanged.
    const created = await createJob(makeInput({ reviewOf: invalidReviewOf }));
    assert.deepEqual(
      created.reviewOf,
      invalidReviewOf,
      'invalid reviewOf should be returned as-is by createJob',
    );
    const round = await readJob(created.jobId);
    assert.deepEqual(
      round.reviewOf,
      invalidReviewOf,
      'invalid reviewOf should round-trip unchanged via readJob',
    );
  });
});

describe('reviewOf — edge cases', () => {
  it('reviewOf with only jobId and no turnIndex round-trips with turnIndex === undefined', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd' };
    const created = await createJob(makeInput({ reviewOf }));
    const round = await readJob(created.jobId);
    assert.equal(round.reviewOf.jobId, 'job_parent_aabbccdd', 'jobId should be preserved');
    assert.equal(round.reviewOf.turnIndex, undefined, 'absent turnIndex should remain undefined');
  });

  it('reviewOf with turnIndex: 0 preserves 0 (not coerced to undefined)', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd', turnIndex: 0 };
    const created = await createJob(makeInput({ reviewOf }));
    const round = await readJob(created.jobId);
    assert.equal(
      round.reviewOf.turnIndex,
      0,
      'turnIndex 0 should be preserved as 0, not coerced to undefined',
    );
  });

  it('createJob with reviewOf and other standard fields round-trips without clobbering reviewOf', async () => {
    const reviewOf = { jobId: 'job_parent_aabbccdd', turnIndex: 1 };
    const errors = [{ at: 'some-phase', message: 'non-fatal warning' }];
    const created = await createJob(makeInput({ reviewOf, status: 'queued' }));
    // patch errors via updateJob to simulate a realistic record
    await updateJob(created.jobId, (rec) => ({ ...rec, errors }));
    const round = await readJob(created.jobId);
    assert.deepEqual(
      round.reviewOf,
      reviewOf,
      'reviewOf should survive an unrelated updateJob that adds errors',
    );
    assert.deepEqual(round.errors, errors, 'errors should be persisted alongside reviewOf');
  });
});
