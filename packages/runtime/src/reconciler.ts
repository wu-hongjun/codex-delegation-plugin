// Runtime reconciler — bridges the job-store with an injected `ReconcilerAdapter`.
//
// Architectural constraint: this file MUST NOT import from any driver package.
// All driver interaction is dependency-injected via `ReconcilerAdapter`.

import { writeFile } from 'node:fs/promises';

import {
  appendEvent,
  listJobsForWorkspace,
  readEvents,
  readJob,
  syncCompatAliases,
  updateJob,
} from './job-store.js';
import { ensureCompanionDirs, getJobResultPath } from './paths.js';
import type { SessionStatus, SessionStatusValue } from './driver.js';
import type { DriverEvent } from './events.js';
import type { JobRecord, JobStatus, ResultContext } from './types.js';

// ---------- public interface types ----------

export interface ReconcilerSessionRef {
  driverName: string;
  shortId: string;
  sessionId?: string;
  sessionName: string;
  cwd: string;
  transcriptPath?: string;
}

export interface ReconcilerTranscriptResult {
  transcriptPath: string | null;
  events: DriverEvent[];
  warnings: unknown[];
}

export interface ReconcilerLogsResult {
  text: string;
  stdout?: string;
  stderr?: string;
}

export interface ReconcilerAdapter {
  status(session: ReconcilerSessionRef): Promise<SessionStatus>;
  readTranscriptEvents?(session: ReconcilerSessionRef): Promise<ReconcilerTranscriptResult>;
  readLogs?(session: ReconcilerSessionRef): Promise<ReconcilerLogsResult>;
}

export interface ReconcileOptions {
  /** default true */
  readArtifacts?: boolean;
  /** default true */
  appendEvents?: boolean;
  /** test hook; defaults to () => new Date().toISOString() */
  now?: () => string;
}

export interface ReconcileWarning {
  message: string;
  cause?: unknown;
}

export interface ReconcileResult {
  job: JobRecord;
  previousStatus: JobStatus;
  statusChanged: boolean;
  appendedEvents: number;
  warnings: ReconcileWarning[];
}

export interface ReconcileWorkspaceWarning {
  jobId?: string;
  message: string;
  cause?: unknown;
}

export interface ReconcileWorkspaceResult {
  results: ReconcileResult[];
  warnings: ReconcileWorkspaceWarning[];
}

// ---------- private helpers ----------

function refFromJob(job: JobRecord): ReconcilerSessionRef {
  return {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    transcriptPath: job.claude.transcriptPath,
  };
}

// Plan 0001 is start-only: each delegate call creates one fresh background session
// for one task. When the driver reports `idle` after that turn, the agent has
// finished the delegated work and is awaiting further input. With no companion-
// session reuse and no prompt injection in v1, that state is effectively `completed`
// for this job — so `result` works without requiring an explicit stop first.
// Plan 0002 may need a richer state model once session reuse exists.
const STATUS_MAP: Record<SessionStatusValue, JobStatus | 'keep' | 'queued-or-starting-to-running'> =
  {
    queued: 'queued',
    starting: 'starting',
    working: 'running',
    idle: 'completed',
    needs_input: 'needs_input',
    completed: 'completed',
    failed: 'failed',
    stopped: 'stopped',
    orphaned: 'orphaned',
    unknown: 'queued-or-starting-to-running',
  };

function mapSessionStatus(value: SessionStatusValue, previousStatus: JobStatus): JobStatus {
  const mapped = STATUS_MAP[value];
  if (mapped === 'keep') {
    return previousStatus;
  }
  if (mapped === 'queued-or-starting-to-running') {
    // unknown: keep previous unless it's queued/starting → then move to running
    if (previousStatus === 'queued' || previousStatus === 'starting') {
      return 'running';
    }
    return previousStatus;
  }
  return mapped;
}

const PREVIEW_MAX = 160;

function makePreview(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, PREVIEW_MAX) + '…';
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  // Distinguish arrays from plain objects so `deepEqual([1,2], {0:1,1:2})` is false.
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
      return false;
  }
  return true;
}

function resultContextEqual(a: ResultContext | undefined, b: ResultContext | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.finalMessagePreview !== b.finalMessagePreview) return false;
  if (!deepEqual(a.touchedFiles, b.touchedFiles)) return false;
  // Compare usageSnapshot too so changing token counts triggers an update.
  return deepEqual(a.usageSnapshot, b.usageSnapshot);
}

// ---------- main reconcileJob ----------

export async function reconcileJob(
  jobId: string,
  adapter: ReconcilerAdapter,
  options?: ReconcileOptions,
): Promise<ReconcileResult> {
  const now = options?.now ?? (() => new Date().toISOString());
  const readArtifacts = options?.readArtifacts !== false;
  const doAppendEvents = options?.appendEvents !== false;

  const warnings: ReconcileWarning[] = [];
  let appendedEvents = 0;

  // Step 1: read current job
  const job = await readJob(jobId);
  const previousStatus = job.status;
  const previousResult = job.result;

  // Working copy we'll mutate
  const patched: JobRecord = { ...job, claude: { ...job.claude } };

  // Step 2: call adapter.status
  let sessionStatus: SessionStatus | null = null;
  let statusCallFailed = false;
  try {
    sessionStatus = await adapter.status(refFromJob(job));
  } catch (err) {
    statusCallFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push({ message: `adapter.status failed: ${msg}`, cause: err });
  }

  // Step 3: compute next status
  let nextStatus: JobStatus = previousStatus;
  if (!statusCallFailed && sessionStatus !== null) {
    nextStatus = mapSessionStatus(sessionStatus.value, previousStatus);

    // Non-destructively update claude fields
    if (sessionStatus.sessionId != null) {
      patched.claude.sessionId = sessionStatus.sessionId;
    }
    if (sessionStatus.pid != null) {
      patched.claude.pid = sessionStatus.pid;
    }
    if (sessionStatus.transcriptPath != null) {
      patched.claude.transcriptPath = sessionStatus.transcriptPath;
    }
    if (sessionStatus.cwd && sessionStatus.cwd.length > 0) {
      patched.claude.cwd = sessionStatus.cwd;
    }
    // shortId and sessionName: do NOT replace — original handle is canonical
  }

  patched.status = nextStatus;

  // Step 4: read artifacts
  let newResult: ResultContext | undefined = previousResult;
  let transcriptEventsForResult: DriverEvent[] | null = null;

  if (readArtifacts) {
    // Try transcript first
    let transcriptAttempted = false;
    let transcriptSucceeded = false;

    if (adapter.readTranscriptEvents) {
      transcriptAttempted = true;
      try {
        const tr = await adapter.readTranscriptEvents(refFromJob(job));
        transcriptEventsForResult = tr.events;
        transcriptSucceeded = true;

        // Derive artifacts from transcript events
        let finalAssistantMessage:
          | (DriverEvent & { type: 'message.completed'; role: 'assistant' })
          | null = null;
        const touchedFilesOrdered: string[] = [];
        const touchedFilesSeen = new Set<string>();
        let lastUsage: (DriverEvent & { type: 'usage.updated' }) | null = null;
        let hasOnlyErrorEvents = true;

        for (const ev of tr.events) {
          if (ev.type !== 'error') hasOnlyErrorEvents = false;

          if (ev.type === 'message.completed' && ev.role === 'assistant' && ev.content.length > 0) {
            finalAssistantMessage = ev as DriverEvent & {
              type: 'message.completed';
              role: 'assistant';
            };
          }
          if (ev.type === 'file.changed') {
            if (!touchedFilesSeen.has(ev.path)) {
              touchedFilesSeen.add(ev.path);
              touchedFilesOrdered.push(ev.path);
            }
          }
          if (ev.type === 'usage.updated') {
            lastUsage = ev as DriverEvent & { type: 'usage.updated' };
          }
        }

        if (finalAssistantMessage !== null) {
          const resultPath = getJobResultPath(jobId);
          await ensureCompanionDirs();
          await writeFile(resultPath, finalAssistantMessage.content, 'utf8');

          const preview = makePreview(finalAssistantMessage.content);
          newResult = {
            finalMessagePath: resultPath,
            finalMessagePreview: preview,
            ...(touchedFilesOrdered.length > 0 ? { touchedFiles: touchedFilesOrdered } : {}),
            ...(lastUsage !== null ? { usageSnapshot: lastUsage } : {}),
          };
        } else if (hasOnlyErrorEvents && tr.events.length > 0) {
          // Only error events — do not overwrite existing result
          newResult = previousResult;
        }
        // else: no final assistant message, keep existing result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ message: `adapter.readTranscriptEvents failed: ${msg}`, cause: err });
      }
    }

    // Logs fallback: when no transcript OR transcript had no final assistant message
    const needsLogsFallback =
      !transcriptAttempted ||
      !transcriptSucceeded ||
      (transcriptEventsForResult !== null &&
        !transcriptEventsForResult.some(
          (ev) => ev.type === 'message.completed' && ev.role === 'assistant',
        ));

    if (needsLogsFallback && adapter.readLogs) {
      try {
        const logsResult = await adapter.readLogs(refFromJob(job));
        // Write logs result only when next status === 'completed' and text non-empty
        if (nextStatus === 'completed' && logsResult.text.trim().length > 0) {
          const resultPath = getJobResultPath(jobId);
          await ensureCompanionDirs();
          const MAX_LOG_CHARS = 8000;
          let logContent: string;
          if (logsResult.text.length > MAX_LOG_CHARS) {
            logContent = `Final result not available; see logs:\n\n${logsResult.text.slice(0, MAX_LOG_CHARS)}`;
          } else {
            logContent = logsResult.text;
          }
          await writeFile(resultPath, logContent, 'utf8');

          const preview = makePreview(logContent);
          // touchedFiles: do NOT infer from logs
          newResult = {
            finalMessagePath: resultPath,
            finalMessagePreview: preview,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({ message: `adapter.readLogs failed: ${msg}`, cause: err });
      }
    }
  }

  patched.result = newResult;

  // Mirror result to the last turn so turns[] stays in sync with compat aliases.
  // Also set turn endedAt and status when the job has reached a terminal state.
  if (patched.turns.length > 0) {
    const last = patched.turns[patched.turns.length - 1]!;
    if (newResult !== undefined) {
      last.result = newResult;
      last.usageSnapshot = newResult.usageSnapshot;
      last.endedAt = last.endedAt ?? new Date().toISOString();
    }
    if (nextStatus === 'completed') last.status = 'completed';
    if (nextStatus === 'failed') last.status = 'failed';
    syncCompatAliases(patched);
  }

  // Step 5: idempotency check — skip updateJob if nothing changed
  const statusChanged = nextStatus !== previousStatus;
  const resultChanged = !resultContextEqual(previousResult, newResult);
  const claudeChanged =
    patched.claude.sessionId !== job.claude.sessionId ||
    patched.claude.pid !== job.claude.pid ||
    patched.claude.transcriptPath !== job.claude.transcriptPath ||
    patched.claude.cwd !== job.claude.cwd;

  const needsUpdate = statusChanged || resultChanged || claudeChanged;

  let finalJob: JobRecord = patched;
  if (needsUpdate) {
    // Merge our patch onto the LOCKED current record (re-read by updateJob) so a
    // concurrent reconciler's writes are preserved. Only fields the reconciler owns
    // (`status`, `claude`, `result`) are overwritten; everything else is taken from
    // the locked read.
    finalJob = await updateJob(jobId, (current) => {
      // Build the merged record. current.turns is the locked on-disk version;
      // patched.turns carries the turn-level result/status/endedAt updates.
      // Use patched.turns whenever the reconciler mutated them — either because a
      // new result landed OR because the job transitioned to a terminal status
      // (completed/failed), which also stamps `turns[last].status` and `endedAt`.
      // Without the terminal-status branch, a status-only `running → failed`
      // transition would silently lose the last-turn status update (the in-memory
      // `patched.turns[last].status` would be set but never persisted).
      const turnsChanged =
        resultChanged || (statusChanged && (nextStatus === 'completed' || nextStatus === 'failed'));
      const mergedTurns = turnsChanged ? patched.turns : current.turns;
      const merged = {
        ...current,
        status: patched.status,
        claude: patched.claude,
        result: patched.result,
        turns: mergedTurns,
      };
      // updateJob will call syncCompatAliases itself, but be explicit for clarity
      return merged;
    });
  }

  // Step 6: append events
  if (doAppendEvents) {
    // Read existing events once for dedup checks
    let existingEvents: unknown[] = [];
    try {
      existingEvents = await readEvents(jobId);
    } catch {
      // non-fatal — proceed without dedup
    }

    // reconcile.status event — only if status changed
    if (statusChanged) {
      const alreadyEmitted = existingEvents.some(
        (ev) =>
          typeof ev === 'object' &&
          ev !== null &&
          (ev as Record<string, unknown>)['type'] === 'reconcile.status' &&
          (ev as Record<string, unknown>)['previousStatus'] === previousStatus &&
          (ev as Record<string, unknown>)['nextStatus'] === nextStatus,
      );
      if (!alreadyEmitted) {
        await appendEvent(jobId, {
          type: 'reconcile.status',
          at: now(),
          previousStatus,
          nextStatus,
        });
        appendedEvents++;
      }
    }

    // reconcile.result event — only if result actually changed
    if (resultChanged && newResult !== undefined) {
      const alreadyEmitted = existingEvents.some(
        (ev) =>
          typeof ev === 'object' &&
          ev !== null &&
          (ev as Record<string, unknown>)['type'] === 'reconcile.result' &&
          (ev as Record<string, unknown>)['finalMessagePath'] === newResult!.finalMessagePath,
      );
      if (!alreadyEmitted) {
        await appendEvent(jobId, {
          type: 'reconcile.result',
          at: now(),
          finalMessagePath: newResult.finalMessagePath,
          touchedFiles: newResult.touchedFiles,
        });
        appendedEvents++;
      }
    }

    // reconcile.warning events — once per unique warning message
    const emittedWarningMessages = new Set<string>();
    for (const w of warnings) {
      if (emittedWarningMessages.has(w.message)) continue;
      emittedWarningMessages.add(w.message);
      const alreadyEmitted = existingEvents.some(
        (ev) =>
          typeof ev === 'object' &&
          ev !== null &&
          (ev as Record<string, unknown>)['type'] === 'reconcile.warning' &&
          (ev as Record<string, unknown>)['message'] === w.message,
      );
      if (!alreadyEmitted) {
        await appendEvent(jobId, {
          type: 'reconcile.warning',
          at: now(),
          message: w.message,
          ...(w.cause !== undefined ? { cause: String(w.cause) } : {}),
        });
        appendedEvents++;
      }
    }
  }

  return {
    job: finalJob,
    previousStatus,
    statusChanged,
    appendedEvents,
    warnings,
  };
}

// ---------- reconcileJobsForWorkspace ----------

export async function reconcileJobsForWorkspace(
  workspaceRoot: string,
  adapter: ReconcilerAdapter,
  options?: ReconcileOptions,
): Promise<ReconcileWorkspaceResult> {
  const list = await listJobsForWorkspace(workspaceRoot);
  const results: ReconcileResult[] = [];
  const warnings: ReconcileWorkspaceWarning[] = [];

  // Forward job-store warnings
  for (const w of list.warnings) {
    warnings.push({ message: `job-store: ${w.kind}: ${'path' in w ? w.path : ''}` });
  }

  for (const job of list.jobs) {
    try {
      const result = await reconcileJob(job.jobId, adapter, options);
      results.push(result);
    } catch (err) {
      warnings.push({
        jobId: job.jobId,
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  return { results, warnings };
}
