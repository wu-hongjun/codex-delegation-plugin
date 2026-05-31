// Tests for the runtime reconciler. Uses fake adapters (no real Claude spawning).
// Each test gets its own CC_PLUGIN_CODEX_HOME so state never leaks across tests.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createJob,
  getJobResultPath,
  readEvents,
  reconcileJob,
  reconcileJobsForWorkspace,
} from '../dist/index.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let TMP_HOME;
const PREV = process.env.CC_PLUGIN_CODEX_HOME;

beforeEach(() => {
  TMP_HOME = mkdtempSync(join(tmpdir(), 'reconciler-test-'));
  process.env.CC_PLUGIN_CODEX_HOME = TMP_HOME;
});

afterEach(() => {
  if (PREV === undefined) delete process.env.CC_PLUGIN_CODEX_HOME;
  else process.env.CC_PLUGIN_CODEX_HOME = PREV;
  rmSync(TMP_HOME, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobInput(overrides = {}) {
  return {
    codex: { pluginVersion: '0.0.0', cwd: '/repo' },
    workspace: { root: '/repo', ...(overrides.workspace ?? {}) },
    driver: { name: 'claude-background', version: '0.0.0', capabilitiesSnapshot: {} },
    claude: {
      version: '2.1.999-mock',
      shortId: 'abc123',
      sessionName: 'codex:repo:abc123',
      cwd: '/repo',
      logsCommand: 'claude logs abc123',
    },
    prompt: { summary: 'hi', sha256: 'deadbeef', bytesLen: 2 },
    ...overrides,
  };
}

function fakeAdapter({
  status,
  transcript,
  logs,
  statusThrows,
  transcriptThrows,
  logsThrows,
} = {}) {
  return {
    async status(ref) {
      if (statusThrows) throw statusThrows;
      return status ?? { value: 'working', shortId: ref.shortId, sessionId: ref.sessionId };
    },
    async readTranscriptEvents(_ref) {
      if (transcriptThrows) throw transcriptThrows;
      return transcript ?? { transcriptPath: null, events: [], warnings: [] };
    },
    async readLogs(_ref) {
      if (logsThrows) throw logsThrows;
      return logs ?? { text: '' };
    },
  };
}

const NOW = '2026-05-30T00:00:00.000Z';
const now = () => NOW;

// ---------------------------------------------------------------------------
// Status mapping tests
// ---------------------------------------------------------------------------

describe('status mapping', () => {
  it('value: completed maps job.status to completed and statusChanged is true', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'completed' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'completed');
    assert.equal(result.statusChanged, true);
    assert.equal(result.previousStatus, 'queued');
  });

  it('value: working maps to running', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'working' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'running');
  });

  it('value: idle maps to completed (plan 0001 start-only model)', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    // In plan 0001, every delegate is a fresh session for one task; driver-`idle`
    // means the agent has finished its turn and is awaiting input we won't send.
    // That state is effectively completed for the job.
    assert.equal(result.job.status, 'completed');
  });

  it('value: needs_input maps to needs_input', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'needs_input' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'needs_input');
  });

  it('value: orphaned maps to orphaned', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'orphaned' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'orphaned');
  });

  it('value: unknown on a running job keeps running', async () => {
    // First bring the job to running
    const job = await createJob(makeJobInput());
    const adapter1 = fakeAdapter({ status: { value: 'working' } });
    await reconcileJob(job.jobId, adapter1, { now });

    const adapter2 = fakeAdapter({ status: { value: 'unknown' } });
    const result = await reconcileJob(job.jobId, adapter2, { now });
    assert.equal(result.job.status, 'running');
  });

  it('value: unknown on a queued job maps to running', async () => {
    const job = await createJob(makeJobInput());
    assert.equal(job.status, 'queued');
    const adapter = fakeAdapter({ status: { value: 'unknown' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'running');
  });
});

// ---------------------------------------------------------------------------
// Metadata propagation
// ---------------------------------------------------------------------------

describe('metadata propagation', () => {
  it('sessionId, pid, and transcriptPath from status land in job.claude', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({
      status: {
        value: 'working',
        sessionId: 'session-xyz',
        pid: 12345,
        transcriptPath: '/tmp/transcript.jsonl',
      },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.claude.sessionId, 'session-xyz');
    assert.equal(result.job.claude.pid, 12345);
    assert.equal(result.job.claude.transcriptPath, '/tmp/transcript.jsonl');
  });

  it('pre-set sessionId is NOT erased when adapter returns undefined sessionId', async () => {
    const job = await createJob(
      makeJobInput({
        claude: {
          version: '2.1.999-mock',
          shortId: 'abc123',
          sessionName: 'codex:repo:abc123',
          cwd: '/repo',
          logsCommand: 'claude logs abc123',
          sessionId: 'pre-existing-session',
        },
      }),
    );
    // Adapter returns no sessionId (undefined)
    const adapter = fakeAdapter({ status: { value: 'working', shortId: 'abc123' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.claude.sessionId, 'pre-existing-session');
  });
});

// ---------------------------------------------------------------------------
// Transcript artifact tests
// ---------------------------------------------------------------------------

describe('transcript artifacts', () => {
  it('writes result.md with assistant content, touchedFiles, and usageSnapshot', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [
        { type: 'message.completed', role: 'user', content: 'do it', at: NOW },
        { type: 'message.completed', role: 'assistant', content: 'All done.', at: NOW },
        { type: 'file.changed', path: 'README.md', op: 'modify', at: NOW },
        { type: 'usage.updated', cacheRead: 100, input: 10, output: 5, at: NOW },
      ],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript,
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    const resultPath = getJobResultPath(job.jobId);
    assert.ok(existsSync(resultPath), 'result.md should exist');
    const contents = readFileSync(resultPath, 'utf8');
    assert.ok(contents.includes('All done.'), 'result.md should contain the assistant message');
    assert.equal(result.job.result.finalMessagePath, resultPath);
    assert.ok(result.job.result.finalMessagePreview.includes('All done.'));
    assert.deepEqual(result.job.result.touchedFiles, ['README.md']);
    assert.equal(result.job.result.usageSnapshot.cacheRead, 100);
  });

  it('de-duplicates touched files preserving encounter order', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [
        { type: 'message.completed', role: 'assistant', content: 'done', at: NOW },
        { type: 'file.changed', path: 'a.ts', op: 'modify', at: NOW },
        { type: 'file.changed', path: 'a.ts', op: 'modify', at: NOW },
        { type: 'file.changed', path: 'b.ts', op: 'add', at: NOW },
      ],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript,
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    assert.deepEqual(result.job.result.touchedFiles, ['a.ts', 'b.ts']);
  });

  it('uses the LAST usage.updated event, not the first', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [
        { type: 'usage.updated', cacheRead: 10, input: 1, output: 1, at: NOW },
        { type: 'message.completed', role: 'assistant', content: 'done', at: NOW },
        { type: 'usage.updated', cacheRead: 999, input: 50, output: 25, at: NOW },
      ],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript,
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    assert.equal(result.job.result.usageSnapshot.cacheRead, 999);
  });

  it('transcript with only error events does not create a result', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [{ type: 'error', message: 'something went wrong', at: NOW }],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'failed' },
      transcript,
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    const resultPath = getJobResultPath(job.jobId);
    // Either result is absent or finalMessagePath is not set
    const hasResult = result.job.result != null && result.job.result.finalMessagePath != null;
    if (hasResult) {
      // If a result was written, the result.md must NOT have been created from the error event alone
      // The result file should not contain the error message as the assistant message
      assert.ok(
        !existsSync(resultPath) ||
          !readFileSync(resultPath, 'utf8').includes('something went wrong as final message'),
      );
    } else {
      assert.equal(result.job.result, undefined);
    }
    assert.ok(
      !existsSync(resultPath),
      'result.md should not be created for error-only transcripts',
    );
  });
});

// ---------------------------------------------------------------------------
// Logs fallback tests
// ---------------------------------------------------------------------------

describe('logs fallback', () => {
  it('creates result from logs when transcript path is null and status is completed', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript: { transcriptPath: null, events: [], warnings: [] },
      logs: { text: 'log contents from claude logs' },
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    assert.ok(result.job.result != null, 'result should be set');
    assert.ok(result.job.result.finalMessagePath != null, 'finalMessagePath should be set');
    const contents = readFileSync(result.job.result.finalMessagePath, 'utf8');
    assert.ok(contents.includes('log contents from claude logs'));
  });

  it('does NOT write result from logs when status is failed', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({
      status: { value: 'failed' },
      transcript: { transcriptPath: null, events: [], warnings: [] },
      logs: { text: 'some log output' },
    });
    await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    const resultPath = getJobResultPath(job.jobId);
    assert.ok(
      !existsSync(resultPath),
      'result.md should not be created for failed jobs via logs fallback',
    );
  });

  it('transcript wins over logs when assistant message is present in transcript', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [
        { type: 'message.completed', role: 'assistant', content: 'From transcript.', at: NOW },
      ],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript,
      logs: { text: 'from logs' },
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    const contents = readFileSync(result.job.result.finalMessagePath, 'utf8');
    assert.ok(contents.includes('From transcript.'), 'transcript content should win over logs');
    assert.ok(
      !contents.includes('from logs'),
      'logs should not appear when transcript has content',
    );
  });
});

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

describe('failure modes', () => {
  it('adapter.status throws: result.warnings has one entry, job.status unchanged, no throw', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ statusThrows: new Error('status boom') });
    let result;
    await assert.doesNotReject(async () => {
      result = await reconcileJob(job.jobId, adapter, { now });
    });
    assert.ok(result.warnings.length >= 1);
    assert.equal(result.job.status, job.status); // unchanged (queued)
  });

  it('adapter.readTranscriptEvents throws but readLogs succeeds: warning recorded, reconcile completes', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcriptThrows: new Error('transcript boom'),
      logs: { text: 'fallback log text' },
    });
    let result;
    await assert.doesNotReject(async () => {
      result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    });
    assert.ok(
      result.warnings.some((w) => w.message != null),
      'warning should be recorded for transcript failure',
    );
    // reconcile completes with status updated
    assert.equal(result.job.status, 'completed');
  });

  it('readArtifacts: false skips both transcript and logs reads', async () => {
    let transcriptCalled = false;
    let logsCalled = false;
    const job = await createJob(makeJobInput());
    const adapter = {
      async status() {
        return { value: 'completed' };
      },
      async readTranscriptEvents() {
        transcriptCalled = true;
        return { transcriptPath: null, events: [], warnings: [] };
      },
      async readLogs() {
        logsCalled = true;
        return { text: 'should not be called' };
      },
    };
    await reconcileJob(job.jobId, adapter, { readArtifacts: false, now });
    assert.equal(
      transcriptCalled,
      false,
      'readTranscriptEvents should not be called when readArtifacts is false',
    );
    assert.equal(logsCalled, false, 'readLogs should not be called when readArtifacts is false');
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('second reconcile call does not duplicate events or change result.md', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [{ type: 'message.completed', role: 'assistant', content: 'Finished!', at: NOW }],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript,
    });

    // First call
    const r1 = await reconcileJob(job.jobId, adapter, {
      readArtifacts: true,
      appendEvents: true,
      now,
    });
    assert.equal(r1.statusChanged, true);
    assert.equal(r1.previousStatus, 'queued');

    const resultPath = getJobResultPath(job.jobId);
    const contentAfterFirst = readFileSync(resultPath, 'utf8');
    const eventsAfterFirst = await readEvents(job.jobId);

    // Second call
    const r2 = await reconcileJob(job.jobId, adapter, {
      readArtifacts: true,
      appendEvents: true,
      now,
    });
    assert.equal(r2.statusChanged, false, 'second call should report no status change');
    assert.equal(r2.appendedEvents, 0, 'second call should append zero new events');

    const contentAfterSecond = readFileSync(resultPath, 'utf8');
    assert.equal(
      contentAfterSecond,
      contentAfterFirst,
      'result.md should be byte-identical after second call',
    );

    const eventsAfterSecond = await readEvents(job.jobId);
    // Count reconcile.status entries — should not grow
    const reconcileStatusCount = (events) =>
      events.filter((e) => e.type === 'reconcile.status').length;
    assert.equal(
      reconcileStatusCount(eventsAfterSecond),
      reconcileStatusCount(eventsAfterFirst),
      'reconcile.status event count should not grow on second call',
    );
  });
});

// ---------------------------------------------------------------------------
// Workspace reconciliation
// ---------------------------------------------------------------------------

describe('reconcileJobsForWorkspace', () => {
  it('reconciles jobs in the target workspace and skips jobs in other workspaces', async () => {
    const jobA = await createJob(makeJobInput({ workspace: { root: '/repo-a' } }));
    const jobB = await createJob(makeJobInput({ workspace: { root: '/repo-b' } }));

    let reconcileCount = 0;
    const adapter = {
      async status() {
        reconcileCount++;
        return { value: 'completed' };
      },
      async readTranscriptEvents() {
        return { transcriptPath: null, events: [], warnings: [] };
      },
      async readLogs() {
        return { text: '' };
      },
    };

    const wsResult = await reconcileJobsForWorkspace('/repo-a', adapter, { now });
    assert.equal(wsResult.results.length, 1, 'only one job should be reconciled for /repo-a');
    assert.equal(wsResult.results[0].job.jobId, jobA.jobId);
    assert.equal(reconcileCount, 1, 'adapter.status should be called once for /repo-a');
    void jobB;
  });

  it('continues reconciling remaining jobs when one returns warnings', async () => {
    const job1 = await createJob(makeJobInput({ workspace: { root: '/repo-x' } }));
    const job2 = await createJob(makeJobInput({ workspace: { root: '/repo-x' } }));

    let callCount = 0;
    const adapter = {
      async status() {
        callCount++;
        // First call returns unknown (triggers a warning path), second returns completed
        return callCount === 1 ? { value: 'unknown' } : { value: 'completed' };
      },
      async readTranscriptEvents() {
        return { transcriptPath: null, events: [], warnings: [] };
      },
      async readLogs() {
        return { text: '' };
      },
    };

    const wsResult = await reconcileJobsForWorkspace('/repo-x', adapter, { now });
    assert.equal(
      wsResult.results.length,
      2,
      'both jobs should be reconciled even when one has warnings',
    );
    void job1;
    void job2;
  });

  it('surfaces corrupt job warnings in workspace results while still reconciling valid jobs', async () => {
    const { getJobRecordPath, ensureCompanionDirs } = await import('../dist/index.js');
    await ensureCompanionDirs();

    const goodJob = await createJob(makeJobInput({ workspace: { root: '/repo-c' } }));
    // Write a corrupt record that listJobsForWorkspace will warn about
    writeFileSync(getJobRecordPath('job_corrupt_00000000'), '{not-json}', 'utf8');

    const adapter = fakeAdapter({ status: { value: 'completed' } });
    const wsResult = await reconcileJobsForWorkspace('/repo-c', adapter, { now });

    // Valid job should be reconciled
    assert.ok(
      wsResult.results.some((r) => r.job.jobId === goodJob.jobId),
      'valid job should appear in results',
    );
    // Corrupt file should surface as a warning (forwarded from listJobsForWorkspace)
    assert.ok(
      wsResult.warnings.length >= 1,
      'corrupt record warning should appear in workspace results',
    );
  });
});

// ---------------------------------------------------------------------------
// Architectural invariant: static assertion
// ---------------------------------------------------------------------------

describe('architectural invariant', () => {
  it('no runtime/src/**/*.ts file imports driver-claude-code or invokes claude directly', () => {
    const here = fileURLToPath(import.meta.url);
    const SRC_ROOT = resolve(here, '..', '..', 'src');
    // Plan 0002 T2: relaxed the literal `claude --bg` ban — runtime's doctor now
    // invokes `claude --bg --help` as a read-only feature probe (not a session start).
    // The remaining bans are the load-bearing ones: runtime must not import the driver
    // package, must not invoke the synchronous print-mode transport, and must not
    // import node-pty (driver-only dependency).
    const banned = ['driver-claude-code', 'claude -p', 'node-pty'];

    const tsFiles = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.ts')) tsFiles.push(full);
      }
    };
    walk(SRC_ROOT);
    assert.ok(tsFiles.length > 0, 'expected at least one .ts file under runtime/src');

    for (const file of tsFiles) {
      const src = readFileSync(file, 'utf8');
      for (const token of banned) {
        assert.equal(
          src.includes(token),
          false,
          `${file.slice(SRC_ROOT.length + 1)} must not contain "${token}"`,
        );
      }
    }
  });
});
