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
  getJobTurnResultPath,
  mapStatus,
  readEvents,
  reconcileJob,
  reconcileJobsForWorkspace,
  tryReadJob,
  updateJob,
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
  sidecar,
  statusThrows,
  transcriptThrows,
  logsThrows,
  sidecarThrows,
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
    async readSidecar(_ref) {
      if (sidecarThrows) throw sidecarThrows;
      return sidecar ?? null;
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

  it('value: idle on a freshly-queued job maps to running (plan 0002 T7: queued turn + idle driver → running)', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    // T7 changed the idle mapping to be turn-status-aware. A brand-new job has
    // turns[0].status = 'queued'. idle + queued → running (defensive: treat as
    // mid-work, not completed). The Plan 0001 "idle = completed" assumption no
    // longer holds; jobs now need turns[last].status = 'completed' for idle to
    // produce awaiting_followup or completed.
    assert.equal(result.job.status, 'running');
  });

  it('repairs nested pseudo shortId "claude" from the real sessionId', async () => {
    const sessionId = 'f9232581-2bc9-44c2-9cce-3e3093121fab';
    const job = await createJob(
      makeJobInput({
        claude: {
          version: '2.1.999-mock',
          shortId: 'claude',
          sessionName: 'codex:repo:nested',
          cwd: '/repo',
          logsCommand: 'claude logs claude',
        },
      }),
    );
    const adapter = fakeAdapter({
      status: {
        value: 'idle',
        shortId: 'f9232581',
        sessionId,
        sessionName: 'codex:repo:nested',
      },
    });

    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.claude.shortId, 'f9232581');
    assert.equal(result.job.claude.sessionId, sessionId);
    assert.equal(result.job.claude.logsCommand, 'claude logs f9232581');
    const stored = await tryReadJob(job.jobId);
    assert.equal(stored?.claude.shortId, 'f9232581');
    assert.equal(stored?.claude.logsCommand, 'claude logs f9232581');
  });

  it('value: needs_input maps to needs_input', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'needs_input' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'needs_input');
  });

  it('persists waitingFor while needs_input and clears it after the job resumes', async () => {
    const job = await createJob(makeJobInput());
    const waitingAdapter = fakeAdapter({
      status: {
        value: 'needs_input',
        shortId: 'abc123',
        waitingFor: 'permission: Bash(git status)',
      },
    });
    const waiting = await reconcileJob(job.jobId, waitingAdapter, { now });
    assert.equal(waiting.job.status, 'needs_input');
    assert.equal(waiting.job.claude.waitingFor, 'permission: Bash(git status)');

    const resumedAdapter = fakeAdapter({ status: { value: 'working', shortId: 'abc123' } });
    const resumed = await reconcileJob(job.jobId, resumedAdapter, { now });
    assert.equal(resumed.job.status, 'running');
    assert.equal(resumed.job.claude.waitingFor, undefined);
  });

  it('value: orphaned maps to orphaned', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'orphaned' } });
    const result = await reconcileJob(job.jobId, adapter, { now });
    assert.equal(result.job.status, 'orphaned');
  });

  // Plan 0019 B2: a deliberately-stopped job stays stopped even when its
  // session is later reaped (orphan detection must not reclassify it).
  describe('mapStatus sticky-terminal: stopped survives orphan (Plan 0019 B2)', () => {
    const base = {
      driverValue: 'orphaned',
      latestTurnStatus: 'completed',
      ttlElapsed: false,
      isOrphan: true,
      sidecar: null,
    };
    it('previousJobStatus=stopped + isOrphan → stays stopped', () => {
      assert.equal(mapStatus({ ...base, previousJobStatus: 'stopped' }), 'stopped');
    });
    it('previousJobStatus=running + isOrphan → orphaned (non-terminal not sticky)', () => {
      assert.equal(mapStatus({ ...base, previousJobStatus: 'running' }), 'orphaned');
    });
    it('previousJobStatus=awaiting_followup + isOrphan → orphaned (resumable not sticky)', () => {
      assert.equal(mapStatus({ ...base, previousJobStatus: 'awaiting_followup' }), 'orphaned');
    });
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

  // Plan 0002 T6 — Subagent C finding F2 (medium) regression guard.
  // When the reconciler transitions a job to a terminal status WITHOUT a new
  // result landing, the turn-level status mirror must still be persisted to
  // disk. Previously, `updateJob`'s merged-turns selector only adopted
  // `patched.turns` when `resultChanged` was true, so a status-only
  // `running → failed` transition silently lost the `turns[last].status =
  // 'failed'` update set in memory. T7's `awaiting_followup` semantics
  // depend on `turns[last].status` reflecting the job's terminal turn state.
  it('terminal status (failed) with no new result still persists turns[last].status = failed', async () => {
    // First bring the job to "running" so the transition is status-only.
    const job = await createJob(makeJobInput());
    const adapterRun = fakeAdapter({ status: { value: 'working' } });
    await reconcileJob(job.jobId, adapterRun, { now });

    // Now transition to failed without providing any transcript/result
    // artifacts. resultChanged should be false; statusChanged true.
    const adapterFail = fakeAdapter({ status: { value: 'failed' } });
    const result = await reconcileJob(job.jobId, adapterFail, { now });

    assert.equal(result.job.status, 'failed');
    assert.equal(result.statusChanged, true);

    // Re-read from disk to verify the turn-level status mirror was persisted,
    // not just set on the in-memory patched record.
    const reread = await tryReadJob(job.jobId);
    assert.ok(reread, 'job record should still be readable');
    assert.equal(
      reread.turns[reread.turns.length - 1].status,
      'failed',
      'turns[last].status must mirror the terminal job status when persisted to disk',
    );
  });

  it('terminal status (completed) with no new result still persists turns[last].status = completed', async () => {
    // Symmetric guard for the completed branch of the same fix (T6 F2 regression guard).
    // T7 note: we use driver value 'completed' directly (not 'idle') because
    // idle + working-turn → running under T7's turn-aware mapping. The 'completed'
    // driver value always maps to job-completed regardless of turn status.
    const job = await createJob(makeJobInput());
    const adapterRun = fakeAdapter({ status: { value: 'working' } });
    await reconcileJob(job.jobId, adapterRun, { now });

    const adapterCompleted = fakeAdapter({ status: { value: 'completed' } });
    const result = await reconcileJob(job.jobId, adapterCompleted, { now });
    assert.equal(result.job.status, 'completed');
    assert.equal(result.statusChanged, true);

    const reread = await tryReadJob(job.jobId);
    assert.ok(reread, 'job record should still be readable');
    assert.equal(
      reread.turns[reread.turns.length - 1].status,
      'completed',
      'turns[last].status must mirror the terminal job status when persisted to disk',
    );
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
    const turnResultPath = getJobTurnResultPath(job.jobId, 0);
    const latestAliasPath = getJobResultPath(job.jobId);
    assert.ok(existsSync(turnResultPath), 'turn result snapshot should exist');
    assert.ok(existsSync(latestAliasPath), 'latest result alias should exist');
    const contents = readFileSync(turnResultPath, 'utf8');
    assert.ok(
      contents.includes('All done.'),
      'turn result snapshot should contain the assistant message',
    );
    assert.equal(result.job.result.finalMessagePath, turnResultPath);
    assert.equal(readFileSync(latestAliasPath, 'utf8'), contents);
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

  it('extracts touched files from mutating tool.started inputs', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/transcript.jsonl',
      events: [
        {
          type: 'tool.started',
          tool: 'Edit',
          input: { file_path: 'src/runtime.ts' },
          at: NOW,
        },
        {
          type: 'tool.started',
          tool: 'Bash',
          input: { command: 'git status' },
          at: NOW,
        },
        { type: 'message.completed', role: 'assistant', content: 'done', at: NOW },
      ],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'completed' },
      transcript,
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    assert.deepEqual(result.job.result.touchedFiles, ['src/runtime.ts']);
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

  it('running job can expose a partial transcript result without ending the turn', async () => {
    const job = await createJob(makeJobInput());
    const transcript = {
      transcriptPath: '/fake/live-partial.jsonl',
      events: [
        {
          type: 'message.completed',
          role: 'assistant',
          content: 'partial live answer',
          at: NOW,
        },
      ],
      warnings: [],
    };
    const adapter = fakeAdapter({
      status: { value: 'working' },
      transcript,
    });

    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });
    const latest = result.job.turns[result.job.turns.length - 1];

    assert.equal(result.job.status, 'running');
    assert.equal(result.job.result?.finalMessagePreview, 'partial live answer');
    assert.equal(latest.result?.finalMessagePreview, 'partial live answer');
    assert.equal(latest.status, 'queued');
    assert.equal(latest.endedAt, undefined);
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

    const resultPath = r1.job.result.finalMessagePath;
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

describe('per-turn result snapshots', () => {
  it('writes immutable result files for separate turns while keeping latest alias current', async () => {
    const job = await createJob(makeJobInput());
    const turn0 = await reconcileJob(
      job.jobId,
      fakeAdapter({
        status: { value: 'completed' },
        transcript: {
          transcriptPath: '/fake/transcript.jsonl',
          events: [
            {
              type: 'message.completed',
              role: 'assistant',
              content: 'TURN0_SENTINEL',
              at: NOW,
            },
          ],
          warnings: [],
        },
      }),
      { readArtifacts: true, now },
    );

    await updateJob(job.jobId, (current) => ({
      ...current,
      status: 'running',
      turns: [
        ...current.turns,
        {
          prompt: { summary: 'second turn', sha256: 'feedface', bytesLen: 11 },
          startedAt: NOW,
          status: 'queued',
        },
      ],
    }));

    const turn1 = await reconcileJob(
      job.jobId,
      fakeAdapter({
        status: { value: 'completed' },
        transcript: {
          transcriptPath: '/fake/transcript.jsonl',
          events: [
            {
              type: 'message.completed',
              role: 'assistant',
              content: 'TURN1_SENTINEL',
              at: NOW,
            },
          ],
          warnings: [],
        },
      }),
      { readArtifacts: true, now },
    );

    const firstPath = turn1.job.turns[0].result.finalMessagePath;
    const secondPath = turn1.job.turns[1].result.finalMessagePath;
    assert.notEqual(firstPath, secondPath, 'each turn should have its own result snapshot');
    assert.equal(firstPath, turn0.job.turns[0].result.finalMessagePath);
    assert.equal(readFileSync(firstPath, 'utf8'), 'TURN0_SENTINEL');
    assert.equal(readFileSync(secondPath, 'utf8'), 'TURN1_SENTINEL');
    assert.equal(readFileSync(getJobResultPath(job.jobId), 'utf8'), 'TURN1_SENTINEL');
  });

  it('does not mirror a previous job result onto a new turn when no fresh artifact exists', async () => {
    const job = await createJob(makeJobInput());
    await reconcileJob(
      job.jobId,
      fakeAdapter({
        status: { value: 'completed' },
        transcript: {
          transcriptPath: '/fake/transcript.jsonl',
          events: [
            {
              type: 'message.completed',
              role: 'assistant',
              content: 'PREVIOUS_TURN_RESULT',
              at: NOW,
            },
          ],
          warnings: [],
        },
      }),
      { readArtifacts: true, now },
    );

    await updateJob(job.jobId, (current) => ({
      ...current,
      status: 'running',
      turns: [
        ...current.turns,
        {
          prompt: { summary: 'second turn', sha256: 'cafefeed', bytesLen: 11 },
          startedAt: NOW,
          status: 'queued',
        },
      ],
    }));

    const result = await reconcileJob(
      job.jobId,
      fakeAdapter({
        status: { value: 'working' },
        transcript: { transcriptPath: '/fake/transcript.jsonl', events: [], warnings: [] },
      }),
      { readArtifacts: true, now },
    );

    assert.equal(
      result.job.turns[1].result,
      undefined,
      'new turn should not inherit the previous turn result',
    );
    assert.equal(result.job.result.finalMessagePreview, 'PREVIOUS_TURN_RESULT');
  });

  it('replaces an empty-path followup sentinel even when the preview is unchanged', async () => {
    const job = await createJob(makeJobInput());
    await updateJob(job.jobId, (current) => ({
      ...current,
      status: 'running',
      turns: [
        ...current.turns,
        {
          prompt: { summary: 'second turn', sha256: '0ddba11', bytesLen: 11 },
          startedAt: NOW,
          status: 'completed',
          result: { finalMessagePath: '', finalMessagePreview: 'SAME_TEXT' },
        },
      ],
    }));

    const result = await reconcileJob(
      job.jobId,
      fakeAdapter({
        status: { value: 'completed' },
        transcript: {
          transcriptPath: '/fake/transcript.jsonl',
          events: [{ type: 'message.completed', role: 'assistant', content: 'SAME_TEXT', at: NOW }],
          warnings: [],
        },
      }),
      { readArtifacts: true, now },
    );

    const latest = result.job.turns[1];
    assert.equal(latest.result.finalMessagePreview, 'SAME_TEXT');
    assert.equal(latest.result.finalMessagePath, getJobTurnResultPath(job.jobId, 1));
    assert.ok(existsSync(latest.result.finalMessagePath));
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
// Context-aware status mapping (Plan 0002 T7)
// ---------------------------------------------------------------------------

describe('context-aware status mapping (plan 0002 T7)', () => {
  // Helper: fakeAdapter with optional readSidecar support
  function fakeAdapterWithSidecar({ status, transcript, logs, sidecar, sidecarThrows } = {}) {
    return {
      async status(ref) {
        return status ?? { value: 'idle', shortId: ref.shortId, sessionId: ref.sessionId };
      },
      async readTranscriptEvents(_ref) {
        return transcript ?? { transcriptPath: null, events: [], warnings: [] };
      },
      async readLogs(_ref) {
        return logs ?? { text: '' };
      },
      async readSidecar(_ref) {
        if (sidecarThrows) throw sidecarThrows;
        return sidecar !== undefined ? sidecar : null;
      },
    };
  }

  /**
   * Directly stamp turns[last].status = 'completed' and endedAt = activityTs on the
   * job record via updateJob. This is the reliable way to set up the pre-condition
   * for awaiting_followup tests without relying on multi-step reconcile chains
   * (idle + working-turn → running, not completed, which is correct reconciler
   * behaviour but not the pre-condition we need for TTL tests).
   */
  async function setupCompletedTurn(jobId, activityTs) {
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'completed', endedAt: activityTs } : t,
      );
      return { ...rec, status: 'completed', turns };
    });
  }

  // T7 test 1: idle + latestTurn completed + TTL not elapsed → awaiting_followup
  it('idle driver + latestTurn completed + TTL not elapsed → awaiting_followup', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';
    // now is 1ms after activity → TTL not elapsed (well within 30 min)
    const nowFn = () => '2026-05-31T12:00:00.001Z';

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
    });

    assert.equal(
      result.job.status,
      'awaiting_followup',
      'idle driver + completed turn + TTL not elapsed should yield awaiting_followup',
    );
  });

  // T7 test 2: idle + latestTurn completed + TTL elapsed → completed
  it('idle driver + latestTurn completed + TTL elapsed → completed', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';
    // now is 31 minutes after activity → TTL elapsed
    const nowFn = () => '2026-05-31T12:31:00.000Z';

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
    });

    assert.equal(
      result.job.status,
      'completed',
      'idle driver + completed turn + TTL elapsed (31min) should yield completed',
    );
  });

  // T7 test 3: idle + latestTurn injecting → running
  it('idle driver + latestTurn injecting → running', async () => {
    const job = await createJob(makeJobInput());
    // Use updateJob to set turns[0].status = 'injecting' directly
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'injecting' } : t,
      );
      return { ...rec, turns };
    });

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.status, 'running', 'idle driver + injecting turn should yield running');
  });

  // T7 test 4: idle + latestTurn working → running
  it('idle driver + latestTurn working → running', async () => {
    const job = await createJob(makeJobInput());
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'working' } : t,
      );
      return { ...rec, turns };
    });

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.status, 'running', 'idle driver + working turn should yield running');
  });

  // T7 test 5: idle + latestTurn failed → failed
  it('idle driver + latestTurn failed → failed', async () => {
    const job = await createJob(makeJobInput());
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'failed' } : t,
      );
      return { ...rec, turns };
    });

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.status, 'failed', 'idle driver + failed turn should yield failed');
  });

  // T7 test 6: busy/working driver → running
  it('working driver → running (regardless of turn status)', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'working' } });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.status, 'running', 'working driver value should always yield running');
  });

  // T7 test 7: needs_input driver → needs_input
  it('needs_input driver → needs_input', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'needs_input' } });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(
      result.job.status,
      'needs_input',
      'needs_input driver value should yield needs_input',
    );
  });

  // T7 test 8: sidecar inFlight.tasks > 0 overrides idle + completed → running
  it('sidecar inFlight.tasks > 0 overrides idle + completed turn → running', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';
    const nowFn = () => '2026-05-31T12:00:00.001Z'; // TTL not elapsed

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    // Reconcile with sidecar reporting inFlight.tasks: 1
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: { inFlight: { tasks: 1, queued: 0, kinds: [] } },
    });
    const result = await reconcileJob(job.jobId, adapter, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
    });

    assert.equal(
      result.job.status,
      'running',
      'sidecar inFlight.tasks > 0 should override idle+completed → running',
    );
  });

  // T7 test 9: sidecar waiting hint overrides idle → needs_input
  it('sidecar state: waiting overrides idle driver → needs_input', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: { state: 'waiting' },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(
      result.job.status,
      'needs_input',
      'sidecar state:waiting should override idle driver → needs_input',
    );
  });

  it('sidecar tempo: blocked overrides working driver → needs_input', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'working' },
      sidecar: {
        state: 'working',
        tempo: 'blocked',
        intent: 'permission prompt',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
      },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.status, 'needs_input');
    assert.equal(result.job.claude.waitingFor, 'permission prompt');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'needs_input');
  });

  it('sidecar inFlight.kinds includes permission overrides idle driver → needs_input', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: { inFlight: { tasks: 0, queued: 0, kinds: ['permission'] } },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(
      result.job.status,
      'needs_input',
      'sidecar inFlight.kinds=[permission] should override idle driver → needs_input',
    );
  });

  // T7 test 10: sidecar output.result populates result when transcript has no assistant message
  it('sidecar output.result populates job result when transcript yields no assistant message', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'completed' },
      transcript: { transcriptPath: null, events: [], warnings: [] },
      logs: { text: '' },
      sidecar: { output: { result: 'sidecar-derived answer' } },
    });
    const result = await reconcileJob(job.jobId, adapter, { readArtifacts: true, now });

    assert.ok(result.job.result != null, 'result should be set from sidecar output');
    assert.ok(
      result.job.result.finalMessagePreview.includes('sidecar-derived'),
      `expected sidecar-derived in preview; got: ${result.job.result.finalMessagePreview}`,
    );
    assert.ok(
      result.job.result.finalMessagePath != null,
      'finalMessagePath should be set when sidecar provides result',
    );

    // Verify the result file was written
    const { readFileSync: rfs, existsSync: efs } = await import('node:fs');
    assert.ok(
      efs(result.job.result.finalMessagePath),
      'result.md file should exist on disk when sidecar provides result',
    );
    const contents = rfs(result.job.result.finalMessagePath, 'utf8');
    assert.ok(
      contents.includes('sidecar-derived answer'),
      'result file should contain sidecar output text',
    );
  });

  // T7 test 11: sidecar failure produces warning, not throw
  it('sidecar readSidecar rejection produces a warning but reconcile does not throw', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'working' },
      sidecarThrows: new Error('sidecar read exploded'),
    });

    let result;
    await assert.doesNotReject(async () => {
      result = await reconcileJob(job.jobId, adapter, { now });
    }, 'reconcileJob should not throw when readSidecar rejects');

    assert.ok(
      result.warnings.some((w) => /sidecar/i.test(w.message)),
      `expected a sidecar-related warning; got: ${JSON.stringify(result.warnings)}`,
    );
  });

  // T7 test 12: sidecar null produces no noisy warning
  it('sidecar returning null produces no sidecar warning', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'working' },
      sidecar: null,
    });

    const result = await reconcileJob(job.jobId, adapter, { now });

    const sidecarWarnings = result.warnings.filter((w) => /sidecar/i.test(w.message));
    assert.equal(
      sidecarWarnings.length,
      0,
      `sidecar null should produce no sidecar warning; got: ${JSON.stringify(sidecarWarnings)}`,
    );
  });

  // T7 test 13: TTL uses injected now clock deterministically
  it('two reconciles with different injected now clocks produce awaiting_followup then completed', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    // First reconcile: now = 1ms after activity → awaiting_followup
    const adapterIdle1 = fakeAdapter({ status: { value: 'idle' } });
    const r1 = await reconcileJob(job.jobId, adapterIdle1, {
      now: () => '2026-05-31T12:00:00.001Z',
      followupTtlMs: 30 * 60 * 1000,
    });
    assert.equal(r1.job.status, 'awaiting_followup', 'first reconcile should be awaiting_followup');

    // Second reconcile: now = 31 minutes later → completed
    const adapterIdle2 = fakeAdapter({ status: { value: 'idle' } });
    const r2 = await reconcileJob(job.jobId, adapterIdle2, {
      now: () => '2026-05-31T12:31:00.000Z',
      followupTtlMs: 30 * 60 * 1000,
    });
    assert.equal(
      r2.job.status,
      'completed',
      'second reconcile with later clock should be completed',
    );
  });

  // T7 test 14: invalid timestamps treat TTL as elapsed
  it('invalid timestamps in turns/job cause TTL to be treated as elapsed → completed', async () => {
    const job = await createJob(makeJobInput());
    // Use updateJob to set bad timestamps and turns[last].status = 'completed'
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1
          ? { ...t, status: 'completed', endedAt: 'not-a-date', startedAt: 'also-bad' }
          : t,
      );
      return {
        ...rec,
        status: 'awaiting_followup',
        turns,
        updatedAt: 'also-bad',
        createdAt: 'also-bad',
      };
    });

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, {
      now: () => '2026-05-31T13:00:00.000Z',
      followupTtlMs: 30 * 60 * 1000,
    });

    assert.equal(
      result.job.status,
      'completed',
      'invalid timestamps should treat TTL as elapsed → completed',
    );
  });

  // T7 test 15: repeated awaiting_followup reconcile is idempotent
  it('repeated reconcile in awaiting_followup state is idempotent (statusChanged false, no duplicate events)', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';
    const nowFn = () => '2026-05-31T12:00:00.001Z';

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    // First reconcile → awaiting_followup
    const adapterIdle1 = fakeAdapter({ status: { value: 'idle' } });
    const r1 = await reconcileJob(job.jobId, adapterIdle1, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
      appendEvents: true,
    });
    assert.equal(r1.job.status, 'awaiting_followup', 'first reconcile should be awaiting_followup');

    // Second reconcile with same clock → no change
    const adapterIdle2 = fakeAdapter({ status: { value: 'idle' } });
    const r2 = await reconcileJob(job.jobId, adapterIdle2, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
      appendEvents: true,
    });
    assert.equal(r2.statusChanged, false, 'second reconcile should report statusChanged: false');
    assert.equal(r2.appendedEvents, 0, 'second reconcile should append 0 events');
  });

  // T7 test 16: TTL expiry awaiting_followup → completed appends one status event, no duplicates
  it('awaiting_followup → completed on TTL expiry appends exactly one event; third reconcile appends 0', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';
    const beforeTtl = () => '2026-05-31T12:00:00.001Z';
    const afterTtl = () => '2026-05-31T12:31:00.000Z';

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    // First reconcile: before TTL → awaiting_followup
    const adapterIdle1 = fakeAdapter({ status: { value: 'idle' } });
    await reconcileJob(job.jobId, adapterIdle1, {
      now: beforeTtl,
      followupTtlMs: 30 * 60 * 1000,
      appendEvents: true,
    });

    // Second reconcile: after TTL → completed; should append exactly 1 event
    const adapterIdle2 = fakeAdapter({ status: { value: 'idle' } });
    const r2 = await reconcileJob(job.jobId, adapterIdle2, {
      now: afterTtl,
      followupTtlMs: 30 * 60 * 1000,
      appendEvents: true,
    });
    assert.equal(r2.job.status, 'completed', 'second reconcile should yield completed');
    assert.equal(
      r2.appendedEvents,
      1,
      `second reconcile should append exactly 1 status event; got ${r2.appendedEvents}`,
    );

    // Third reconcile: same clock → no change
    const adapterIdle3 = fakeAdapter({ status: { value: 'idle' } });
    const r3 = await reconcileJob(job.jobId, adapterIdle3, {
      now: afterTtl,
      followupTtlMs: 30 * 60 * 1000,
      appendEvents: true,
    });
    assert.equal(r3.appendedEvents, 0, 'third reconcile with same clock should append 0 events');
  });

  // T7 test 17: v1 migrated records reconcile correctly
  it('v1 migrated record reconciles to awaiting_followup correctly', async () => {
    // Import helpers we need
    const { generateJobId, getJobsDir } = await import('../dist/index.js');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');

    // Write a hand-crafted v1 job record to disk (mirrors migration.test.mjs pattern)
    const jobId = generateJobId();
    const activityTs = '2026-05-31T12:00:00.000Z';
    const v1Record = {
      jobId,
      schemaVersion: 1,
      createdAt: activityTs,
      updatedAt: activityTs,
      status: 'completed',
      codex: { pluginVersion: '0.0.0', cwd: '/repo' },
      workspace: { root: '/repo' },
      driver: { name: 'claude-background', version: '0.0.0', capabilitiesSnapshot: {} },
      claude: {
        version: '2.1.149',
        shortId: 'abcd1234',
        sessionName: 'bg-abcd1234',
        cwd: '/repo',
        logsCommand: 'claude logs abcd1234',
      },
      prompt: { summary: 'v1 migration test', sha256: 'aabbccdd', bytesLen: 17 },
      result: {
        finalMessagePath: '/tmp/result.md',
        finalMessagePreview: 'v1 completed result',
      },
    };

    const jobsDir = getJobsDir();
    mkdirSync(jobsDir, { recursive: true });
    writeFileSync(pathJoin(jobsDir, `${jobId}.json`), JSON.stringify(v1Record));

    // Reconcile: adapter reports idle, now is 1ms after activity → should be awaiting_followup
    const nowFn = () => '2026-05-31T12:00:00.001Z';
    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(jobId, adapter, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
    });

    assert.equal(
      result.job.status,
      'awaiting_followup',
      'v1 migrated record with idle driver + completed turn + TTL not elapsed should yield awaiting_followup',
    );
    assert.equal(result.job.schemaVersion, 2, 'migrated record should be schemaVersion 2');
  });

  // T7 test: awaiting_followup does NOT force turns[last].status
  // (the latest turn IS completed; job is reusable — turn status should remain completed)
  it('awaiting_followup job leaves turns[last].status as completed (not overwritten)', async () => {
    const activityTs = '2026-05-31T12:00:00.000Z';
    const nowFn = () => '2026-05-31T12:00:00.001Z';

    const job = await createJob(makeJobInput());
    await setupCompletedTurn(job.jobId, activityTs);

    const adapter = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapter, {
      now: nowFn,
      followupTtlMs: 30 * 60 * 1000,
    });

    assert.equal(result.job.status, 'awaiting_followup');
    const lastTurn = result.job.turns[result.job.turns.length - 1];
    assert.equal(
      lastTurn.status,
      'completed',
      'awaiting_followup should leave turns[last].status = completed (not overwritten)',
    );
  });

  // T7 test: needs_input syncs to turns[last].status
  it('needs_input status propagates to turns[last].status', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapter({ status: { value: 'needs_input' } });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(result.job.status, 'needs_input');
    const lastTurn = result.job.turns[result.job.turns.length - 1];
    assert.equal(
      lastTurn.status,
      'needs_input',
      'needs_input should propagate to turns[last].status',
    );
  });

  // Plan 0002 T7 — Subagent C finding M1 regression guard.
  // Empty-string `sidecar.output.result` must NOT suppress the logs fallback.
  // The write-gate at the sidecar-result branch uses a truthy check (`""` is
  // falsy → no result file written), so the logs-fallback skip-gate must use
  // the same truthy semantics. If both gates disagree (one `!= null`, the
  // other truthy), an empty-string sidecar result silently drops the result
  // entirely — no result file from sidecar AND no logs fallback.
  it('empty-string sidecar.output.result does not suppress logs fallback', async () => {
    const job = await createJob(makeJobInput());
    // Bring job to running first
    const adapterRun = fakeAdapterWithSidecar({ status: { value: 'working' } });
    await reconcileJob(job.jobId, adapterRun, { now });

    // Now reconcile with completed driver + empty sidecar result + non-empty logs
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'completed' },
      sidecar: { output: { result: '' } },
      logs: { text: 'fallback message text from logs' },
    });
    const result = await reconcileJob(job.jobId, adapter, { now, readArtifacts: true });

    assert.equal(result.job.status, 'completed');
    // The result must be populated from the logs fallback (since the empty
    // sidecar result didn't write a file).
    assert.ok(result.job.result, 'result must be populated when logs fallback fires');
    assert.ok(
      result.job.result.finalMessagePreview.includes('fallback message text from logs'),
      `expected logs text in result preview, got: ${result.job.result.finalMessagePreview}`,
    );
    // And no result-related warnings should be emitted for the absence of a
    // sidecar result (sidecar returned a value, just empty — not null).
    const sidecarWarnings = result.warnings.filter((w) => /sidecar/i.test(w.message));
    assert.equal(
      sidecarWarnings.length,
      0,
      `no sidecar warnings expected for empty result, got: ${JSON.stringify(sidecarWarnings)}`,
    );
  });

  // Plan 0002 T7 — Subagent C finding M2 regression guard.
  // Future timestamps (e.g. clock skew between writers and readers) must be
  // treated as TTL-elapsed. Without this guard, a record whose `latestTurn.
  // endedAt` is in the future (relative to the injected `now`) would yield
  // `nowMs - parsed < 0 < ttlMs` and stay stuck in awaiting_followup until
  // the system clock caught up.
  it('future timestamps treat TTL as elapsed (defensive against clock skew)', async () => {
    const job = await createJob(makeJobInput());
    // Bring job to completed-turn so we can test the idle + completed + TTL branch.
    const adapterCompleted = fakeAdapter({ status: { value: 'completed' } });
    await reconcileJob(job.jobId, adapterCompleted, { now });

    // Now reconcile with idle adapter and an injected `now` BEFORE the job's
    // updatedAt (i.e., timestamps look "in the future" from the reconciler's
    // perspective). Pick a `now` well before the system clock so any
    // automatically-stamped real timestamps (createdAt, updatedAt) are in
    // the future too.
    const pastNow = () => '2000-01-01T00:00:00.000Z';
    const adapterIdle = fakeAdapter({ status: { value: 'idle' } });
    const result = await reconcileJob(job.jobId, adapterIdle, { now: pastNow });

    // Without the M2 fix this would land in `awaiting_followup`. With the
    // fix, future timestamps are treated as elapsed → `completed`.
    assert.equal(
      result.job.status,
      'completed',
      'future timestamps must be treated as TTL-elapsed (M2 defensive guard)',
    );
  });
});

// ---------------------------------------------------------------------------
// T15a regression: sidecar-evidence-of-completion flips queued/working/etc
// turn status to completed so idle+queued doesn't trap the job in 'running'.
// ---------------------------------------------------------------------------

describe('T15a — sidecar-evidence-of-completion (plan 0002)', () => {
  function fakeAdapterWithSidecar({ status, sidecar } = {}) {
    return {
      async status(ref) {
        return status ?? { value: 'idle', shortId: ref.shortId, sessionId: ref.sessionId };
      },
      async readTranscriptEvents(_ref) {
        return { transcriptPath: null, events: [], warnings: [] };
      },
      async readLogs(_ref) {
        return { text: '' };
      },
      async readSidecar(_ref) {
        return sidecar ?? null;
      },
    };
  }

  const DONE_SIDECAR = {
    state: 'done',
    tempo: 'idle',
    inFlight: { tasks: 0, queued: 0, kinds: [] },
    output: { result: '3 TODOs found: app.js:1, README.md:2, README.md:3' },
    raw: {},
  };

  it('idle driver + queued turn + sidecar done → awaiting_followup, turn flipped to completed', async () => {
    const job = await createJob(makeJobInput());
    // Sanity: createJob defaults to status='queued', so turns[0].status='queued'
    assert.equal(job.status, 'queued');
    assert.equal(job.turns[0].status, 'queued');

    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: DONE_SIDECAR,
    });
    // Use a job-relative nowFn (1s after createJob) so the TTL is not
    // accidentally elapsed by the shared NOW='2026-05-30' clock vs real-time
    // createdAt stamps. (M2's future-timestamp guard would otherwise treat
    // real-time createdAt > NOW as TTL-elapsed.)
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();
    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(
      result.job.status,
      'awaiting_followup',
      'idle + queued + sidecar.state=done should yield awaiting_followup, not running',
    );
    assert.equal(
      result.job.turns[result.job.turns.length - 1].status,
      'completed',
      'turn[last].status must be flipped to completed when sidecar shows done',
    );
    assert.ok(
      result.job.turns[result.job.turns.length - 1].endedAt,
      'turn[last].endedAt must be stamped when status flips to completed',
    );
  });

  it('idle driver + blocked sidecar + queued turn + transcript result → awaiting_followup', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: {
        value: 'idle',
        shortId: job.claude.shortId,
        sessionId: 'acc0cfbd-983d-436a-b755-1c27cc930100',
        raw: {
          id: 'acc0cfbd',
          status: 'idle',
          state: 'blocked',
        },
      },
      sidecar: {
        state: 'blocked',
        tempo: 'blocked',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
        raw: {
          state: 'blocked',
          detail: "What's the next step?",
          tempo: 'blocked',
          output: null,
        },
      },
    });
    adapter.readTranscriptEvents = async () => ({
      transcriptPath: '/tmp/retry.jsonl',
      events: [
        {
          type: 'message.completed',
          role: 'assistant',
          content: 'RETRY_INITIAL_READY',
          at: job.createdAt,
        },
      ],
      warnings: [],
    });
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();

    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(result.job.status, 'awaiting_followup');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'completed');
    assert.equal(result.job.result?.finalMessagePreview, 'RETRY_INITIAL_READY');
  });

  it('idle driver + blocked sidecar + queued turn with existing latest result → awaiting_followup', async () => {
    const job = await createJob(makeJobInput());
    const resultPath = getJobResultPath(job.jobId);
    writeFileSync(resultPath, 'RETRY_INITIAL_READY');
    const resultCtx = {
      finalMessagePath: resultPath,
      finalMessagePreview: 'RETRY_INITIAL_READY',
    };
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'queued', result: resultCtx } : t,
      );
      return { ...rec, status: 'running', result: resultCtx, turns };
    });

    const adapter = fakeAdapterWithSidecar({
      status: {
        value: 'idle',
        shortId: job.claude.shortId,
        sessionId: 'acc0cfbd-983d-436a-b755-1c27cc930100',
        raw: { id: 'acc0cfbd', status: 'idle', state: 'blocked' },
      },
      sidecar: {
        state: 'blocked',
        tempo: 'blocked',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
        raw: { state: 'blocked', tempo: 'blocked', output: null },
      },
    });
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();

    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(result.job.status, 'awaiting_followup');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'completed');
    assert.equal(result.job.result?.finalMessagePreview, 'RETRY_INITIAL_READY');
  });

  it('idle driver + working turn + sidecar done → awaiting_followup, turn flipped to completed', async () => {
    const job = await createJob(makeJobInput());
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'working' } : t,
      );
      return { ...rec, turns };
    });

    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: DONE_SIDECAR,
    });
    // Use a job-relative nowFn (1s after createJob) so the TTL is not
    // accidentally elapsed by the shared NOW='2026-05-30' clock vs real-time
    // createdAt stamps. (M2's future-timestamp guard would otherwise treat
    // real-time createdAt > NOW as TTL-elapsed.)
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();
    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(result.job.status, 'awaiting_followup');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'completed');
  });

  it('idle driver + queued turn + sidecar WITHOUT output.result → still running (no false completion)', async () => {
    // Negative case: sidecar partially populated but no result yet.
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: {
        state: 'done',
        tempo: 'idle',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
        output: {}, // no result
        raw: {},
      },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(
      result.job.status,
      'running',
      'no output.result in sidecar must NOT trigger completion inference',
    );
    assert.equal(
      result.job.turns[result.job.turns.length - 1].status,
      'queued',
      'turn[last].status must stay queued without positive completion evidence',
    );
  });

  it('idle driver + queued turn + sidecar empty-string result → still running', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: {
        state: 'done',
        tempo: 'idle',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
        output: { result: '   ' }, // whitespace-only
        raw: {},
      },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(
      result.job.status,
      'running',
      'whitespace-only sidecar result must not trigger completion inference',
    );
  });

  it('idle driver + queued turn + sidecar state=working → still running', async () => {
    const job = await createJob(makeJobInput());
    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: {
        state: 'working', // not done
        tempo: 'idle',
        inFlight: { tasks: 0, queued: 0, kinds: [] },
        output: { result: 'partial output' },
        raw: {},
      },
    });
    const result = await reconcileJob(job.jobId, adapter, { now });

    assert.equal(
      result.job.status,
      'running',
      'sidecar state must be "done" (not "working") to trigger completion inference',
    );
  });

  it('idle driver + starting turn + sidecar done → awaiting_followup, turn flipped to completed', async () => {
    // T15a-7: 'starting' is treated identically to 'queued'/'working' in the
    // sidecar-evidence branch (reconciler.ts:228–235).
    const job = await createJob(makeJobInput());
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'starting' } : t,
      );
      return { ...rec, turns };
    });

    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: DONE_SIDECAR,
    });
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();
    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(result.job.status, 'awaiting_followup');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'completed');
  });

  it('idle driver + injecting turn + sidecar done → awaiting_followup, turn flipped to completed', async () => {
    // T15a-8: 'injecting' is treated identically to 'queued'/'working'/'starting'
    // in the sidecar-evidence branch (reconciler.ts:228–235).
    const job = await createJob(makeJobInput());
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'injecting' } : t,
      );
      return { ...rec, turns };
    });

    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: DONE_SIDECAR,
    });
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();
    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(result.job.status, 'awaiting_followup');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'completed');
  });

  it('idle driver + completed turn (Plan 0002 path) + sidecar done → awaiting_followup (no double-flip)', async () => {
    // The dispatcher's followup path already sets turn[last].status='completed'.
    // T15a should not regress that case.
    const job = await createJob(makeJobInput());
    const { updateJob: updateJobFn } = await import('../dist/index.js');
    await updateJobFn(job.jobId, (rec) => {
      const turns = rec.turns.map((t, i) =>
        i === rec.turns.length - 1 ? { ...t, status: 'completed', endedAt: job.createdAt } : t,
      );
      return { ...rec, status: 'completed', turns };
    });

    const adapter = fakeAdapterWithSidecar({
      status: { value: 'idle' },
      sidecar: DONE_SIDECAR,
    });
    // Use a job-relative nowFn (1s after createJob) so the TTL is not
    // accidentally elapsed by the shared NOW='2026-05-30' clock vs real-time
    // createdAt stamps. (M2's future-timestamp guard would otherwise treat
    // real-time createdAt > NOW as TTL-elapsed.)
    const nowFn = () => new Date(Date.parse(job.createdAt) + 1000).toISOString();
    const result = await reconcileJob(job.jobId, adapter, { now: nowFn });

    assert.equal(result.job.status, 'awaiting_followup');
    assert.equal(result.job.turns[result.job.turns.length - 1].status, 'completed');
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
