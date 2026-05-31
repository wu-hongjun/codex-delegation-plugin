// Job-store primitives for the cc-plugin-codex companion.
//
// - Atomic JSON writes (write temp + rename) so a crash mid-write never produces a
//   half-written record.
// - Exclusive lock files via `open(path, "wx")` so updateJob() callers cannot race each
//   other. Lock metadata records pid + hostname + operation so a future reconciler can
//   recognize stale locks (not implemented in v1 — conservative: existing lock fails).
// - Strict job ID validation prevents path traversal through user-supplied IDs.
// - listJobs() returns { jobs, warnings } so corrupt records do not crash status listing.

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
  ensureCompanionDirs,
  getJobEventsPath,
  getJobLockPath,
  getJobRecordPath,
  getJobsDir,
} from './paths.js';
import type { CreateJobInput, JobRecord, JobStoreWarning, ListJobsResult } from './types.js';

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

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  await ensureCompanionDirs();
  const jobId = input.jobId ?? generateJobId();
  validateJobId(jobId);
  const now = nowISO();
  const record: JobRecord = {
    jobId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    status: input.status ?? 'queued',
    codex: input.codex,
    workspace: input.workspace,
    driver: input.driver,
    claude: input.claude,
    prompt: input.prompt,
  };
  await atomicWriteJson(getJobRecordPath(jobId), record);
  return record;
}

export async function tryReadJob(jobId: string): Promise<JobRecord | null> {
  validateJobId(jobId);
  const path = getJobRecordPath(jobId);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw) as JobRecord;
  } catch (err) {
    throw new CorruptJobRecordError(path, err);
  }
}

export async function readJob(jobId: string): Promise<JobRecord> {
  const record = await tryReadJob(jobId);
  if (!record) throw new JobNotFoundError(jobId);
  return record;
}

export type JobUpdater = (record: JobRecord) => JobRecord | Promise<JobRecord>;

export async function updateJob(jobId: string, updater: JobUpdater): Promise<JobRecord> {
  validateJobId(jobId);
  await ensureCompanionDirs();
  const lock = await acquireLock(jobId, 'updateJob');
  try {
    const current = await readJob(jobId);
    const next = await updater(current);
    const stamped: JobRecord = { ...next, updatedAt: nowISO() };
    await atomicWriteJson(getJobRecordPath(jobId), stamped);
    return stamped;
  } finally {
    await lock.release();
  }
}

export async function appendEvent(jobId: string, event: unknown): Promise<void> {
  validateJobId(jobId);
  await ensureCompanionDirs();
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
    if (!entry.endsWith('.json') || entry.endsWith('.events.jsonl')) continue;
    if (entry.endsWith('.tmp')) continue; // in-flight atomic write artifact
    const jobId = entry.slice(0, -'.json'.length);
    const fullPath = join(getJobsDir(), entry);
    if (!JOB_ID_PATTERN.test(jobId)) {
      warnings.push({ kind: 'unrecognized-file', path: fullPath });
      continue;
    }
    let raw: string;
    try {
      raw = await readFile(fullPath, 'utf8');
    } catch (err) {
      warnings.push({
        kind: 'corrupt-record',
        path: fullPath,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    try {
      jobs.push(JSON.parse(raw) as JobRecord);
    } catch (err) {
      warnings.push({
        kind: 'corrupt-record',
        path: fullPath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
