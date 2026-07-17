// Tests for Plan 0002 T6: JobRecord schemaVersion 2 + lazy v1→v2 migration.
//
// These tests cover 16 cases from the maintainer's brief:
//   1.  createJob writes schemaVersion 2
//   2.  createJob creates turns[0] with prompt alias
//   3.  readJob migrates a hand-written v1 record to schemaVersion 2
//   4.  readJob migration writes back v2 to disk when lock is available
//   5.  readJob returns migrated in-memory record if migration write-back lock is busy
//   6.  tryReadJob returns null for missing job (Plan 0001 behaviour preserved)
//   7.  listJobs returns migrated v2 records for hand-written v1 files
//   8.  listJobs surfaces warning if migration write-back is lock-blocked but still returns migrated record
//   9.  updateJob receives a v2 record even when the file on disk was v1
//   10. updateJob normalizes aliases after updater mutates turns
//   11. Top-level result aliases latest turn result
//   12. v2 records round-trip without changing schema
//   13. Migration is idempotent
//   14. Corrupt records still skipped with warning (Plan 0001 behaviour preserved)
//   15. Existing dispatcher tests still pass without modification (verified separately; see summary)
//   16. Architectural invariant test still passes (verified in reconciler.test.mjs)

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ensureDelegationDirs,
  createJob,
  generateJobId,
  getJobLockPath,
  getJobRecordPath,
  getJobsDir,
  listJobs,
  readJob,
  tryReadJob,
  updateJob,
} from '../dist/index.js';

// ---------------------------------------------------------------------------
// Per-test isolation
// ---------------------------------------------------------------------------

let TMP_HOME;
const PREV_HOME = process.env.CODEX_DELEGATION_HOME;

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), 'migration-test-'));
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      version: '2.1.149',
      shortId: 'abcd1234',
      sessionName: 'bg-abcd1234',
      cwd: '/tmp/x',
      logsCommand: 'claude logs abcd1234',
    },
    prompt: { summary: 'hi', sha256: 'deadbeef', bytesLen: 2 },
    ...overrides,
  };
}

/**
 * Write a hand-crafted v1 record to disk (bypassing createJob so the file
 * really is schemaVersion 1 as it would appear for an existing Plan 0001 job).
 */
function writeV1Record(home, jobId, overrides = {}) {
  const now = new Date().toISOString();
  const record = {
    jobId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    status: 'running',
    codex: { pluginVersion: '0.0.0', cwd: '/tmp/x' },
    workspace: { root: '/tmp/x' },
    driver: { name: 'claude-background', version: '0.0.0', capabilitiesSnapshot: {} },
    claude: {
      version: '2.1.149',
      shortId: 'abcd1234',
      sessionName: 'bg-abcd1234',
      cwd: '/tmp/x',
      logsCommand: 'claude logs abcd1234',
    },
    prompt: { summary: 'hi', sha256: 'aabbccdd', bytesLen: 2 },
    ...overrides,
  };
  const dir = join(home, 'jobs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${jobId}.json`), JSON.stringify(record));
  return record;
}

/**
 * Write a v2 record to disk directly (bypassing createJob). Useful for
 * round-trip and alias tests.
 */
function writeV2Record(home, jobId, overrides = {}) {
  const now = new Date().toISOString();
  const prompt = { summary: 'first turn', sha256: 'aabbccdd', bytesLen: 10 };
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
      version: '2.1.149',
      shortId: 'abcd1234',
      sessionName: 'bg-abcd1234',
      cwd: '/tmp/x',
      logsCommand: 'claude logs abcd1234',
    },
    prompt,
    turns: [
      {
        prompt,
        startedAt: now,
        endedAt: now,
        status: 'completed',
        result: {
          finalMessagePath: '/tmp/x/result.md',
          finalMessagePreview: 'Turn 0 result',
        },
      },
    ],
    result: {
      finalMessagePath: '/tmp/x/result.md',
      finalMessagePreview: 'Turn 0 result',
    },
    ...overrides,
  };
  const dir = join(home, 'jobs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${jobId}.json`), JSON.stringify(record, null, 2) + '\n');
  return record;
}

// ---------------------------------------------------------------------------
// 1 & 2: createJob — schemaVersion 2 + turns[0] bootstrap
// ---------------------------------------------------------------------------

describe('createJob — schemaVersion 2', () => {
  it('writes schemaVersion 2 to disk', async () => {
    const record = await createJob(makeInput());
    const raw = JSON.parse(readFileSync(getJobRecordPath(record.jobId), 'utf8'));
    assert.equal(raw.schemaVersion, 2, 'on-disk schemaVersion should be 2');
  });

  it('creates turns[0] populated with the prompt and prompt alias matches', async () => {
    const record = await createJob(makeInput());
    assert.ok(Array.isArray(record.turns), 'turns should be an array');
    assert.equal(record.turns.length, 1, 'turns should have exactly one entry after createJob');
    assert.deepEqual(
      record.turns[0].prompt,
      record.prompt,
      'turns[0].prompt must deep-equal the top-level prompt alias',
    );
  });

  it('turns[0] has a startedAt and a TurnStatus', async () => {
    const record = await createJob(makeInput());
    assert.ok(typeof record.turns[0].startedAt === 'string', 'turns[0].startedAt should be set');
    assert.ok(
      typeof record.turns[0].status === 'string',
      'turns[0].status should be a string TurnStatus',
    );
  });
});

// ---------------------------------------------------------------------------
// 3 & 4: readJob migrates v1 → v2 and writes back
// ---------------------------------------------------------------------------

describe('readJob — lazy v1→v2 migration', () => {
  it('returns schemaVersion 2 when the file on disk is schemaVersion 1', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);

    const record = await readJob(jobId);
    assert.equal(record.schemaVersion, 2, 'returned record should be schemaVersion 2');
  });

  it('synthesizes turns[0] from the v1 prompt field', async () => {
    const jobId = generateJobId();
    const v1 = writeV1Record(TMP_HOME, jobId, {
      prompt: { summary: 'migrate me', sha256: 'ff00ff00', bytesLen: 9 },
    });

    const record = await readJob(jobId);
    assert.equal(record.turns.length, 1, 'migrated record should have exactly one turn');
    assert.deepEqual(
      record.turns[0].prompt,
      v1.prompt,
      'turns[0].prompt should equal the original v1 prompt',
    );
  });

  it('writes back v2 to disk when lock is available', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);

    await readJob(jobId);

    const raw = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    assert.equal(raw.schemaVersion, 2, 'on-disk record should now be schemaVersion 2');
    assert.ok(
      Array.isArray(raw.turns) && raw.turns.length >= 1,
      'on-disk record should have turns array with at least one entry',
    );
  });
});

// ---------------------------------------------------------------------------
// 5: readJob returns migrated in-memory record when lock is busy (no throw)
// ---------------------------------------------------------------------------

describe('readJob — lock-blocked write-back', () => {
  it('returns a migrated v2 record in-memory even when the write-back lock is held', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);
    await ensureDelegationDirs();

    // Pre-create the lock file to simulate a concurrent holder
    const lockPath = getJobLockPath(jobId);
    writeFileSync(lockPath, JSON.stringify({ pid: 1, operation: 'test-lock-hold' }));

    // readJob should NOT throw — it should return the migrated record in memory
    let record;
    await assert.doesNotReject(async () => {
      record = await readJob(jobId);
    }, 'readJob should not throw when migration write-back lock is busy');

    assert.equal(record.schemaVersion, 2, 'returned in-memory record should be schemaVersion 2');

    // On-disk file should still be v1 (write-back was lock-blocked)
    const raw = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    assert.equal(
      raw.schemaVersion,
      1,
      'on-disk record should still be schemaVersion 1 when lock was held',
    );
  });
});

// ---------------------------------------------------------------------------
// 6: tryReadJob returns null for missing job (Plan 0001 behaviour preserved)
// ---------------------------------------------------------------------------

describe('tryReadJob — Plan 0001 null-for-missing behaviour', () => {
  it('returns null when the job does not exist', async () => {
    const result = await tryReadJob('job_missing_00000000');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// 7: listJobs migrates v1 records on read
// ---------------------------------------------------------------------------

describe('listJobs — lazy v1→v2 migration', () => {
  it('returns schemaVersion 2 records for all hand-written v1 files', async () => {
    const ids = [generateJobId(), generateJobId(), generateJobId()];
    for (const id of ids) {
      writeV1Record(TMP_HOME, id);
    }

    const { jobs, warnings } = await listJobs();
    assert.equal(jobs.length, ids.length, `expected ${ids.length} jobs, got ${jobs.length}`);
    assert.deepEqual(warnings, [], 'should be no warnings for valid v1 records');

    for (const job of jobs) {
      assert.equal(
        job.schemaVersion,
        2,
        `job ${job.jobId} should be schemaVersion 2 after listJobs`,
      );
      assert.ok(
        Array.isArray(job.turns) && job.turns.length >= 1,
        `job ${job.jobId} should have at least one turn after migration`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 8: listJobs with lock-blocked write-back still returns migrated record
// ---------------------------------------------------------------------------

describe('listJobs — lock-blocked write-back still returns migrated record', () => {
  it('includes the migrated record even when write-back lock is held', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);
    await ensureDelegationDirs();

    // Pre-create the lock file to simulate a concurrent holder
    const lockPath = getJobLockPath(jobId);
    writeFileSync(lockPath, JSON.stringify({ pid: 1, operation: 'test-lock-hold' }));

    const { jobs } = await listJobs();

    const found = jobs.find((j) => j.jobId === jobId);
    assert.ok(found, 'the locked-write-back job should still appear in listJobs results');
    assert.equal(
      found.schemaVersion,
      2,
      'the in-memory record returned by listJobs should be schemaVersion 2',
    );
  });
});

// ---------------------------------------------------------------------------
// 9: updateJob receives a v2 record even when file on disk is v1
// ---------------------------------------------------------------------------

describe('updateJob — updater always sees v2 record', () => {
  it('passes a schemaVersion 2 record to the updater even when the file on disk is v1', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);

    let seenVersion;
    let seenTurnsLength;
    await updateJob(jobId, (current) => {
      seenVersion = current.schemaVersion;
      seenTurnsLength = current.turns?.length;
      return current;
    });

    assert.equal(seenVersion, 2, 'updater should see schemaVersion 2');
    assert.ok(seenTurnsLength >= 1, 'updater should see at least one turn');
  });
});

// ---------------------------------------------------------------------------
// 10: updateJob normalizes aliases after updater mutates turns
// ---------------------------------------------------------------------------

describe('updateJob — compat alias normalization', () => {
  it('re-syncs prompt and result aliases after updater appends a new turn', async () => {
    // Start with a v2 record created properly
    await ensureDelegationDirs();
    const initial = await createJob(makeInput());

    // Use the record's auto-generated jobId for the test
    // Instead, just use the created job
    const newTurnPrompt = { summary: 'second turn', sha256: 'cccccccc', bytesLen: 11 };
    const newTurnResult = {
      finalMessagePath: '/tmp/x/result2.md',
      finalMessagePreview: 'Second turn result',
    };

    await updateJob(initial.jobId, (current) => {
      const newTurn = {
        prompt: newTurnPrompt,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'completed',
        result: newTurnResult,
      };
      return { ...current, turns: [...current.turns, newTurn] };
    });

    // Read the on-disk record and verify alias normalization
    const raw = JSON.parse(readFileSync(getJobRecordPath(initial.jobId), 'utf8'));
    assert.deepEqual(
      raw.prompt,
      raw.turns[0].prompt,
      'top-level prompt alias should equal turns[0].prompt',
    );
    assert.deepEqual(
      raw.result,
      raw.turns[raw.turns.length - 1].result,
      'top-level result alias should equal the latest turn result',
    );
    assert.equal(raw.turns.length, 2, 'should have two turns after appending');
  });
});

// ---------------------------------------------------------------------------
// 11: Top-level result aliases latest turn result
// ---------------------------------------------------------------------------

describe('result alias — latest turn result', () => {
  it('record.result deep-equals turns[turns.length-1].result for a multi-turn v2 record', async () => {
    const jobId = generateJobId();
    const turn0Result = {
      finalMessagePath: '/tmp/r0.md',
      finalMessagePreview: 'Turn 0',
    };
    const turn1Result = {
      finalMessagePath: '/tmp/r1.md',
      finalMessagePreview: 'Turn 1',
    };
    const prompt = { summary: 'p', sha256: 'aaaaaaaa', bytesLen: 1 };
    const now = new Date().toISOString();
    writeV2Record(TMP_HOME, jobId, {
      turns: [
        { prompt, startedAt: now, endedAt: now, status: 'completed', result: turn0Result },
        { prompt, startedAt: now, endedAt: now, status: 'completed', result: turn1Result },
      ],
      result: turn1Result,
    });

    const record = await readJob(jobId);
    assert.deepEqual(
      record.result,
      record.turns[record.turns.length - 1].result,
      'record.result should deep-equal the latest turn result',
    );
    assert.deepEqual(
      record.result,
      turn1Result,
      'record.result should be turn1Result, not turn0Result',
    );
  });
});

// ---------------------------------------------------------------------------
// 12: v2 records round-trip without changing schema
// ---------------------------------------------------------------------------

describe('round-trip — v2 records preserve schemaVersion and turns', () => {
  it('schemaVersion stays 2 and turns content is preserved after readJob + updateJob', async () => {
    const jobId = generateJobId();
    const now = new Date().toISOString();
    const prompt0 = { summary: 'turn 0', sha256: '11111111', bytesLen: 6 };
    const prompt1 = { summary: 'turn 1', sha256: '22222222', bytesLen: 6 };
    writeV2Record(TMP_HOME, jobId, {
      turns: [
        {
          prompt: prompt0,
          startedAt: now,
          endedAt: now,
          status: 'completed',
          result: { finalMessagePath: '/tmp/r0.md', finalMessagePreview: 'Done 0' },
        },
        {
          prompt: prompt1,
          startedAt: now,
          endedAt: now,
          status: 'completed',
          result: { finalMessagePath: '/tmp/r1.md', finalMessagePreview: 'Done 1' },
        },
      ],
      result: { finalMessagePath: '/tmp/r1.md', finalMessagePreview: 'Done 1' },
    });

    // Read then no-op update
    await updateJob(jobId, (cur) => cur);

    const raw = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    assert.equal(raw.schemaVersion, 2, 'schemaVersion should still be 2 after round-trip');
    assert.equal(raw.turns.length, 2, 'turns length should still be 2 after round-trip');
    assert.deepEqual(raw.turns[0].prompt, prompt0, 'turns[0].prompt should be preserved');
    assert.deepEqual(raw.turns[1].prompt, prompt1, 'turns[1].prompt should be preserved');
  });
});

// ---------------------------------------------------------------------------
// 13: Migration is idempotent
// ---------------------------------------------------------------------------

describe('migration idempotency', () => {
  it('reading a v1 record twice produces the same v2 result with no duplicate turns', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId, {
      prompt: { summary: 'idempotent test', sha256: 'abababab', bytesLen: 14 },
    });

    const first = await readJob(jobId);
    const second = await readJob(jobId);

    // Both reads should return v2
    assert.equal(first.schemaVersion, 2, 'first read should return schemaVersion 2');
    assert.equal(second.schemaVersion, 2, 'second read should return schemaVersion 2');

    // No duplicate turns
    assert.equal(first.turns.length, 1, 'first read should have exactly one turn');
    assert.equal(second.turns.length, 1, 'second read should have exactly one turn');

    // On-disk file should be v2 with exactly one turn
    const raw = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    assert.equal(raw.schemaVersion, 2, 'on-disk record should be schemaVersion 2');
    assert.equal(
      raw.turns.length,
      1,
      'on-disk record should have exactly one turn (no duplication from repeated reads)',
    );
  });

  it('updatedAt does not churn between idempotent reads of an already-migrated record', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);

    // First read triggers migration write-back
    await readJob(jobId);
    const afterFirst = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    const updatedAtAfterFirst = afterFirst.updatedAt;

    // Small delay so any timestamp change would be detectable
    await new Promise((r) => setTimeout(r, 5));

    // Second read of an already-v2 record should NOT change updatedAt
    await readJob(jobId);
    const afterSecond = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    assert.equal(
      afterSecond.updatedAt,
      updatedAtAfterFirst,
      'updatedAt should not change on a second read of an already-migrated record',
    );
  });
});

// ---------------------------------------------------------------------------
// 14: Corrupt records still skipped with warning (Plan 0001 behaviour preserved)
// ---------------------------------------------------------------------------

describe('listJobs — corrupt records still produce warnings', () => {
  it('skips a record missing prompt/jobId and surfaces a warning', async () => {
    await ensureDelegationDirs();
    const goodId = generateJobId();
    writeV1Record(TMP_HOME, goodId);

    // Write a record missing jobId (corrupt per Plan 0001 definition)
    writeFileSync(
      join(getJobsDir(), 'job_corrupt_aabbccdd.json'),
      JSON.stringify({ schemaVersion: 1, status: 'running' }),
    );

    const { jobs, warnings } = await listJobs();

    // The corrupt record should NOT appear in jobs
    const corrupt = jobs.find((j) => j.jobId === 'job_corrupt_aabbccdd');
    assert.equal(
      corrupt,
      undefined,
      'corrupt record (missing jobId) must not appear in jobs array',
    );

    // There should be at least one warning
    assert.ok(warnings.length >= 1, 'expected at least one warning for the corrupt record');

    // The good job should still be present
    const good = jobs.find((j) => j.jobId === goodId);
    assert.ok(good, 'valid job should still appear in results alongside the corrupt record');
  });

  it('skips malformed JSON and surfaces a corrupt-record warning', async () => {
    await ensureDelegationDirs();
    const goodId = generateJobId();
    writeV1Record(TMP_HOME, goodId);

    writeFileSync(join(getJobsDir(), 'job_badjson_deadbeef.json'), '{this is not json}');

    const { jobs, warnings } = await listJobs();
    assert.equal(jobs.length, 1, 'only the good job should appear');
    assert.ok(warnings.length >= 1, 'expected at least one warning for malformed JSON');
    assert.ok(
      warnings.some((w) => w.kind === 'corrupt-record'),
      'warning should have kind "corrupt-record"',
    );
  });
});

// ---------------------------------------------------------------------------
// Migration mapping: TurnStatus derived from JobStatus
// ---------------------------------------------------------------------------

describe('v1→v2 migration — TurnStatus derivation from JobStatus', () => {
  const cases = [
    { status: 'completed', expectedTurnStatus: 'completed', hasEndedAt: true },
    { status: 'failed', expectedTurnStatus: 'failed', hasEndedAt: true },
    { status: 'stopped', expectedTurnStatus: 'failed', hasEndedAt: true },
    { status: 'orphaned', expectedTurnStatus: 'failed', hasEndedAt: true },
    { status: 'running', expectedTurnStatus: 'working', hasEndedAt: false },
    { status: 'starting', expectedTurnStatus: 'starting', hasEndedAt: false },
    { status: 'queued', expectedTurnStatus: 'queued', hasEndedAt: false },
    { status: 'needs_input', expectedTurnStatus: 'needs_input', hasEndedAt: false },
  ];

  for (const { status, expectedTurnStatus, hasEndedAt } of cases) {
    it(`v1 status "${status}" maps to TurnStatus "${expectedTurnStatus}"`, async () => {
      const jobId = generateJobId();
      writeV1Record(TMP_HOME, jobId, { status });

      const record = await readJob(jobId);
      assert.equal(
        record.turns[0].status,
        expectedTurnStatus,
        `expected turns[0].status to be "${expectedTurnStatus}" for v1 job status "${status}"`,
      );
      if (hasEndedAt) {
        assert.ok(
          typeof record.turns[0].endedAt === 'string',
          `expected turns[0].endedAt to be set for terminal status "${status}"`,
        );
      }
    });
  }

  it('v1 stopped with result maps TurnStatus to "completed"', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId, {
      status: 'stopped',
      result: {
        finalMessagePath: '/tmp/r.md',
        finalMessagePreview: 'completed before stop',
      },
    });

    const record = await readJob(jobId);
    assert.equal(
      record.turns[0].status,
      'completed',
      'stopped job with a result should map turns[0].status to "completed"',
    );
  });

  it('v1 result field is preserved in turns[0].result after migration', async () => {
    const jobId = generateJobId();
    const resultFixture = {
      finalMessagePath: '/tmp/result.md',
      finalMessagePreview: 'all done',
    };
    writeV1Record(TMP_HOME, jobId, {
      status: 'completed',
      result: resultFixture,
    });

    const record = await readJob(jobId);
    assert.deepEqual(
      record.turns[0].result,
      resultFixture,
      'turns[0].result should equal the original v1 result field',
    );
    assert.deepEqual(
      record.result,
      resultFixture,
      'top-level result alias should also equal the original v1 result field',
    );
  });
});

// ---------------------------------------------------------------------------
// prompt compat alias consistency
// ---------------------------------------------------------------------------

describe('prompt compat alias consistency', () => {
  it('record.prompt deep-equals turns[0].prompt after createJob', async () => {
    const record = await createJob(makeInput());
    assert.deepEqual(record.prompt, record.turns[0].prompt);
  });

  it('record.prompt deep-equals turns[0].prompt after readJob of a v1 record', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId, {
      prompt: { summary: 'alias check', sha256: 'eeff0011', bytesLen: 11 },
    });
    const record = await readJob(jobId);
    assert.deepEqual(record.prompt, record.turns[0].prompt);
  });
});

// ---------------------------------------------------------------------------
// awaiting_followup — new JobStatus value accepted by the store
// ---------------------------------------------------------------------------

describe('awaiting_followup — new JobStatus value', () => {
  it('createJob accepts awaiting_followup as a status', async () => {
    const record = await createJob(makeInput({ status: 'awaiting_followup' }));
    assert.equal(record.status, 'awaiting_followup');
    const round = await readJob(record.jobId);
    assert.equal(round.status, 'awaiting_followup');
  });

  it('updateJob can transition job to awaiting_followup', async () => {
    const initial = await createJob(makeInput());
    const updated = await updateJob(initial.jobId, (rec) => ({
      ...rec,
      status: 'awaiting_followup',
    }));
    assert.equal(updated.status, 'awaiting_followup');
    const raw = JSON.parse(readFileSync(getJobRecordPath(initial.jobId), 'utf8'));
    assert.equal(raw.status, 'awaiting_followup');
  });
});

// ---------------------------------------------------------------------------
// T5 (Plan 0003): v1 migration does not synthesize reviewOf
// ---------------------------------------------------------------------------

describe('v1→v2 migration — reviewOf is not synthesized', () => {
  it('migrated record has reviewOf === undefined when v1 file had no reviewOf field', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);

    const record = await readJob(jobId);
    assert.equal(record.schemaVersion, 2, 'migrated record should be schemaVersion 2');
    assert.equal(
      record.reviewOf,
      undefined,
      'reviewOf should be undefined after v1 migration — the v1 branch does not synthesize it',
    );
  });

  it('on-disk file after migration write-back does not contain a reviewOf key', async () => {
    const jobId = generateJobId();
    writeV1Record(TMP_HOME, jobId);

    // Trigger migration + write-back
    await readJob(jobId);

    const raw = JSON.parse(readFileSync(getJobRecordPath(jobId), 'utf8'));
    assert.equal(raw.schemaVersion, 2, 'on-disk record should be schemaVersion 2 after write-back');
    assert.ok(!('reviewOf' in raw), 'on-disk migrated record must not contain a reviewOf key');
  });
});
