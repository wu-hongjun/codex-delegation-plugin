// Job-store primitives for Codex Delegation runtime state.
//
// - Atomic JSON writes (write temp + rename) so a crash mid-write never produces a
//   half-written record.
// - Exclusive lock files via `open(path, "wx")` so updateJob() callers cannot race each
//   other. Lock metadata records pid + hostname + operation so a future reconciler can
//   recognize stale locks (not implemented in v1 — conservative: existing lock fails).
// - Strict job ID validation prevents path traversal through user-supplied IDs.
// - listJobs() returns { jobs, warnings } so corrupt records do not crash status listing.
// - Schema v2: JobRecord carries turns[]. v1 records on disk are lazily migrated on read.

import { randomBytes } from 'node:crypto';
import { appendFile, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';

import {
  CorruptJobRecordError,
  InvalidJobIdError,
  JobLockError,
  JobNotFoundError,
} from './errors.js';
import {
  ensureDelegationDirs,
  getJobEventsPath,
  getJobLockPath,
  getJobRecordPath,
  getJobsDir,
} from './paths.js';
import type {
  AgentSessionContext,
  ClaudeSessionContext,
  CreateJobInput,
  JobRecord,
  JobStatus,
  JobStoreWarning,
  ListJobsResult,
  PromptContext,
  ResultContext,
  TurnRecord,
} from './types.js';
import type { TurnStatus } from './driver.js';

// Strict job ID pattern. Locks down to ASCII alphanumerics + the literal `job_` prefix
// and `_<hex>` suffix so user-supplied IDs can never traverse paths.
const JOB_ID_PATTERN = /^job_[a-z0-9]+_[a-f0-9]{8}$/;

export function validateJobId(jobId: string): void {
  if (typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) {
    throw new InvalidJobIdError(jobId);
  }
}

export function generateJobId(): string {
  const ts = Date.now().toString(36);
  const rand = randomBytes(4).toString('hex');
  return `job_${ts}_${rand}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

interface LockInfo {
  pid: number;
  createdAt: string;
  hostname: string;
  operation: string;
}

interface LockHandle {
  release(): Promise<void>;
}

async function acquireLock(jobId: string, operation: string): Promise<LockHandle> {
  const lockPath = getJobLockPath(jobId);
  const info: LockInfo = {
    pid: process.pid,
    createdAt: nowISO(),
    hostname: hostname(),
    operation,
  };
  try {
    const handle = await open(lockPath, 'wx');
    try {
      await handle.writeFile(JSON.stringify(info, null, 2), 'utf8');
    } finally {
      await handle.close();
    }
  } catch (err) {
    if (isErrnoException(err) && err.code === 'EEXIST') {
      let existing: unknown = null;
      try {
        existing = JSON.parse(await readFile(lockPath, 'utf8')) as unknown;
      } catch {
        // ignore — surface as opaque lock info
      }
      throw new JobLockError(jobId, existing);
    }
    throw err;
  }
  return {
    async release() {
      try {
        await unlink(lockPath);
      } catch (err) {
        if (isErrnoException(err) && err.code === 'ENOENT') return;
        throw err;
      }
    },
  };
}

async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const tmpName = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmpName, JSON.stringify(data, null, 2) + '\n', 'utf8');
  try {
    await rename(tmpName, path);
  } catch (err) {
    try {
      await unlink(tmpName);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

// ---------- migration helpers ----------

// Internal shape for v1 records on disk. Never exported from the public package surface.
interface LegacyJobRecordV1 {
  jobId: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  codex: object;
  workspace: object;
  driver: object;
  claude: object;
  prompt: PromptContext;
  result?: ResultContext;
  errors?: unknown[];
}

function normalizeClaudeSession(value: unknown): ClaudeSessionContext {
  const raw = (value ?? {}) as Omit<ClaudeSessionContext, 'provider'> & { provider?: string };
  return {
    ...raw,
    provider: 'claude',
    logsCommand:
      typeof raw.logsCommand === 'string' ? raw.logsCommand : `claude logs ${raw.shortId ?? ''}`,
  } as ClaudeSessionContext;
}

function providerFromDriverName(name: unknown): string {
  return name === 'agy-cli' ? 'agy' : 'claude';
}

function normalizeSession(value: unknown, driverName: unknown): AgentSessionContext {
  const raw = (value ?? {}) as AgentSessionContext;
  return {
    ...raw,
    provider:
      typeof raw.provider === 'string' && raw.provider.length > 0
        ? raw.provider
        : providerFromDriverName(driverName),
  };
}

const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'stopped',
  'orphaned',
]);

/**
 * Maps a JobStatus to the appropriate TurnStatus for a synthesized turns[0] during
 * v1 → v2 migration.
 */
function deriveTurnStatusFromJobStatus(status: JobStatus): TurnStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'needs_input':
      return 'needs_input';
    case 'running':
      return 'working';
    case 'starting':
      return 'starting';
    case 'queued':
      return 'queued';
    case 'stopped':
      // stopped: completed if result exists (handled at call site), else failed
      return 'failed';
    case 'orphaned':
      return 'failed';
    case 'awaiting_followup':
      // Defensive: if a v1 record somehow had this status
      return 'completed';
  }
}

/**
 * Syncs compat aliases on a JobRecord so that:
 *   prompt = turns[0].prompt
 *   result = the latest turn's result (or omitted if no turn has a result)
 *
 * Mutates the record in-place and returns it.
 */
export function syncCompatAliases(record: JobRecord): JobRecord {
  // turns is guaranteed non-empty on a v2 JobRecord
  record.prompt = record.turns[0]!.prompt;
  const lastWithResult = [...record.turns].reverse().find((t) => t.result !== undefined);
  if (lastWithResult?.result !== undefined) {
    record.result = lastWithResult.result;
  } else {
    delete record.result;
  }
  if (record.session.provider === 'claude') {
    record.claude = normalizeClaudeSession(record.session);
  } else {
    delete record.claude;
  }
  return record;
}

/**
 * Parses raw disk JSON and migrates to a v2 JobRecord if necessary.
 *
 * Returns { record, migrated } where migrated is true when the record was changed
 * (v1 → v2 upgrade, or compat aliases were out of sync) and should be written back.
 *
 * Throws CorruptJobRecordError for fundamentally malformed records.
 */
function migrateJobRecord(raw: unknown, path: string): { record: JobRecord; migrated: boolean } {
  // 1. Must be a plain object
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CorruptJobRecordError(path, new Error('not a plain object'));
  }

  const obj = raw as Record<string, unknown>;

  // 2. Required fields
  if (typeof obj['jobId'] !== 'string' || obj['jobId'].length === 0) {
    throw new CorruptJobRecordError(path, new Error('missing or non-string jobId'));
  }
  if (obj['prompt'] == null) {
    throw new CorruptJobRecordError(path, new Error('missing prompt'));
  }
  if (obj['codex'] == null) {
    throw new CorruptJobRecordError(path, new Error('missing codex'));
  }
  if (obj['workspace'] == null) {
    throw new CorruptJobRecordError(path, new Error('missing workspace'));
  }
  if (obj['driver'] == null) {
    throw new CorruptJobRecordError(path, new Error('missing driver'));
  }
  if (obj['session'] == null && obj['claude'] == null) {
    throw new CorruptJobRecordError(path, new Error('missing provider session context'));
  }

  const schemaVersion = obj['schemaVersion'];

  // 3. Schema v2: validate turns and sync aliases
  if (schemaVersion === 2) {
    const turns = obj['turns'];
    if (!Array.isArray(turns) || turns.length === 0) {
      throw new CorruptJobRecordError(
        path,
        new Error('schemaVersion 2 record missing or empty turns array'),
      );
    }

    const driverName = (obj['driver'] as { name?: unknown })?.name;
    const hadSession = obj['session'] != null;
    const session = normalizeSession(obj['session'] ?? obj['claude'], driverName);
    const record = {
      ...(raw as JobRecord),
      session,
      ...(session.provider === 'claude' ? { claude: normalizeClaudeSession(session) } : {}),
    } as JobRecord;
    // Check if compat aliases are in sync; repair if not
    // turns is validated non-empty above
    const expectedPrompt = record.turns[0]!.prompt;
    const lastWithResult = [...record.turns].reverse().find((t) => t.result !== undefined);
    const expectedResult = lastWithResult?.result;

    const promptDrifted = JSON.stringify(record.prompt) !== JSON.stringify(expectedPrompt);
    const resultDrifted = JSON.stringify(record.result) !== JSON.stringify(expectedResult);

    if (promptDrifted || resultDrifted) {
      const repaired = { ...record };
      repaired.prompt = expectedPrompt;
      if (expectedResult !== undefined) {
        repaired.result = expectedResult;
      } else {
        const { result: _dropped, ...withoutResult } = repaired;
        void _dropped;
        return { record: syncCompatAliases({ ...withoutResult } as JobRecord), migrated: true };
      }
      return { record: syncCompatAliases(repaired), migrated: true };
    }

    return { record: syncCompatAliases(record), migrated: !hadSession };
  }

  // 4. Schema v1 (or missing schemaVersion treated as v1-shaped)
  if (schemaVersion === 1 || schemaVersion == null) {
    const v1 = raw as LegacyJobRecordV1;
    const jobStatus: JobStatus =
      typeof obj['status'] === 'string' ? (obj['status'] as JobStatus) : 'queued';

    let turnStatus: TurnStatus = deriveTurnStatusFromJobStatus(jobStatus);
    // Special case for 'stopped': completed if result present, else failed
    if (jobStatus === 'stopped') {
      turnStatus = v1.result !== undefined ? 'completed' : 'failed';
    }

    const isTerminal = TERMINAL_JOB_STATUSES.has(jobStatus);
    const turn0: TurnRecord = {
      prompt: v1.prompt,
      startedAt: v1.createdAt,
      ...(isTerminal ? { endedAt: v1.updatedAt } : {}),
      ...(v1.result !== undefined ? { result: v1.result } : {}),
      status: turnStatus,
    };

    const claude = normalizeClaudeSession(v1.claude);
    const record: JobRecord = {
      jobId: v1.jobId,
      schemaVersion: 2,
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      status: jobStatus,
      codex: v1.codex as JobRecord['codex'],
      workspace: v1.workspace as JobRecord['workspace'],
      driver: v1.driver as JobRecord['driver'],
      session: claude,
      claude,
      prompt: v1.prompt,
      turns: [turn0],
      ...(v1.result !== undefined ? { result: v1.result } : {}),
      ...(v1.errors !== undefined ? { errors: v1.errors as JobRecord['errors'] } : {}),
    };

    return { record, migrated: true };
  }

  // 5. Unrecognized schema shape
  throw new CorruptJobRecordError(
    path,
    new Error(`unrecognized schemaVersion: ${String(schemaVersion)}`),
  );
}

// ---------- write-back helper for lazy migration ----------

/**
 * Attempts to atomically write back a migrated record.
 * If the lock is busy (JobLockError), swallows the error and returns without writing.
 * This is intentional: the in-memory migrated record is still valid and usable.
 */
async function tryWriteBackMigrated(jobId: string, _record: JobRecord): Promise<void> {
  let lock: LockHandle | null = null;
  try {
    lock = await acquireLock(jobId, 'migrate-writeback');
  } catch (err) {
    if (err instanceof JobLockError) {
      // Lock busy — skip write-back; in-memory record is fine
      return;
    }
    throw err;
  }
  try {
    // Re-read under lock to be safe, then migrate again, then write
    const path = getJobRecordPath(jobId);
    let reRaw: unknown;
    try {
      reRaw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      // If we can't re-read, skip write-back
      return;
    }
    const { record: freshRecord } = migrateJobRecord(reRaw, path);
    await atomicWriteJson(path, freshRecord);
  } catch {
    // Best-effort; never throw from write-back
  } finally {
    await lock.release();
  }
}

// ---------- public API ----------

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  await ensureDelegationDirs();
  const jobId = input.jobId ?? generateJobId();
  validateJobId(jobId);
  const now = nowISO();
  const initialStatus: JobStatus = input.status ?? 'queued';
  const turn0: TurnRecord = {
    prompt: input.prompt,
    startedAt: now,
    status: deriveTurnStatusFromJobStatus(initialStatus),
  };
  const sessionInput = input.session ?? input.claude;
  if (sessionInput === undefined) {
    throw new CorruptJobRecordError(getJobRecordPath(jobId), new Error('missing session'));
  }
  const session = normalizeSession(sessionInput, input.driver.name);
  const record: JobRecord = {
    jobId,
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    status: initialStatus,
    codex: input.codex,
    workspace: input.workspace,
    driver: input.driver,
    session,
    ...(session.provider === 'claude' ? { claude: normalizeClaudeSession(session) } : {}),
    prompt: input.prompt, // compat alias = turns[0].prompt
    turns: [turn0],
    ...(input.reviewOf !== undefined ? { reviewOf: input.reviewOf } : {}),
  };
  await atomicWriteJson(getJobRecordPath(jobId), record);
  return record;
}

export async function tryReadJob(jobId: string): Promise<JobRecord | null> {
  validateJobId(jobId);
  const path = getJobRecordPath(jobId);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return null;
    if (err instanceof SyntaxError) throw new CorruptJobRecordError(path, err);
    throw err;
  }

  let record: JobRecord;
  let migrated: boolean;
  try {
    ({ record, migrated } = migrateJobRecord(raw, path));
  } catch (err) {
    if (err instanceof CorruptJobRecordError) throw err;
    throw new CorruptJobRecordError(path, err);
  }

  if (migrated) {
    // Best-effort write-back; swallows lock contention
    await tryWriteBackMigrated(jobId, record);
  }

  return record;
}

export async function readJob(jobId: string): Promise<JobRecord> {
  const record = await tryReadJob(jobId);
  if (!record) throw new JobNotFoundError(jobId);
  return record;
}

export type JobUpdater = (record: JobRecord) => JobRecord | Promise<JobRecord>;

export async function updateJob(jobId: string, updater: JobUpdater): Promise<JobRecord> {
  validateJobId(jobId);
  await ensureDelegationDirs();
  const lock = await acquireLock(jobId, 'updateJob');
  try {
    // Read + migrate in-memory (no write-back here; we're about to write ourselves)
    const path = getJobRecordPath(jobId);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch (err) {
      if (err instanceof SyntaxError) throw new CorruptJobRecordError(path, err);
      throw err;
    }
    const { record: current } = migrateJobRecord(raw, path);

    const beforeSession = JSON.stringify(current.session);
    const beforeClaude = JSON.stringify(current.claude);
    const updated = await updater(current);
    const sessionChanged = JSON.stringify(updated.session) !== beforeSession;
    const claudeChanged = JSON.stringify(updated.claude) !== beforeClaude;
    if (!sessionChanged && claudeChanged && updated.claude !== undefined) {
      updated.session = normalizeClaudeSession(updated.claude);
    }
    // Sync compat aliases in case updater touched turns[]
    syncCompatAliases(updated);
    const stamped: JobRecord = { ...updated, updatedAt: nowISO() };
    // Re-sync after stamping (updatedAt change doesn't affect aliases)
    await atomicWriteJson(getJobRecordPath(jobId), stamped);
    return stamped;
  } finally {
    await lock.release();
  }
}

export async function appendEvent(jobId: string, event: unknown): Promise<void> {
  validateJobId(jobId);
  await ensureDelegationDirs();
  const line = JSON.stringify(event) + '\n';
  await appendFile(getJobEventsPath(jobId), line, 'utf8');
}

export async function readEvents(jobId: string): Promise<unknown[]> {
  validateJobId(jobId);
  let raw: string;
  try {
    raw = await readFile(getJobEventsPath(jobId), 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return [];
    throw err;
  }
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

export async function listJobs(): Promise<ListJobsResult> {
  const jobs: JobRecord[] = [];
  const warnings: JobStoreWarning[] = [];
  let entries: string[];
  try {
    entries = await readdir(getJobsDir());
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return { jobs, warnings };
    throw err;
  }
  for (const entry of entries) {
    // Skip non-record files
    if (!entry.endsWith('.json')) continue;
    if (entry.endsWith('.tmp')) continue; // in-flight atomic write artifact
    const jobId = entry.slice(0, -'.json'.length);
    const fullPath = join(getJobsDir(), entry);
    if (!JOB_ID_PATTERN.test(jobId)) {
      warnings.push({ kind: 'unrecognized-file', path: fullPath });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(fullPath, 'utf8')) as unknown;
    } catch (err) {
      warnings.push({
        kind: 'corrupt-record',
        path: fullPath,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    let record: JobRecord;
    let migrated: boolean;
    try {
      ({ record, migrated } = migrateJobRecord(raw, fullPath));
    } catch (err) {
      warnings.push({
        kind: 'corrupt-record',
        path: fullPath,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (migrated) {
      // Best-effort write-back; swallows lock contention
      try {
        await tryWriteBackMigrated(jobId, record);
      } catch {
        warnings.push({
          kind: 'corrupt-record',
          path: fullPath,
          message: 'migration write-back failed',
        });
      }
    }
    jobs.push(record);
  }
  return { jobs, warnings };
}

export async function listJobsForWorkspace(workspaceRoot: string): Promise<ListJobsResult> {
  const all = await listJobs();
  return {
    jobs: all.jobs.filter((j) => j.workspace.root === workspaceRoot),
    warnings: all.warnings,
  };
}
