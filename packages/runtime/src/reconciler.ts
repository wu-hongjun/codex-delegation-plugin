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
import type { SessionStatus, SessionStatusValue, TurnStatus } from './driver.js';
import type { DriverEvent } from './events.js';
import type { JobRecord, JobStatus, ResultContext } from './types.js';

// ---------- public interface types ----------

/**
 * Runtime-local SidecarSnapshot. Intentionally NOT imported from the driver package
 * (architectural invariant: packages/runtime must not import driver packages).
 * This is a duck-typed subset of the driver-side SidecarSnapshot.
 */
export interface SidecarSnapshot {
  state?: string;
  tempo?: string;
  inFlight?: {
    tasks?: number;
    queued?: number;
    kinds?: string[];
  };
  output?: {
    result?: string;
  };
  linkScanPath?: string;
  resumeSessionId?: string;
  intent?: string;
  cliVersion?: string;
  cwd?: string;
  raw?: unknown;
}

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
  readSidecar?(session: ReconcilerSessionRef): Promise<SidecarSnapshot | null>;
}

export interface ReconcileOptions {
  /** default true */
  readArtifacts?: boolean;
  /** default true */
  appendEvents?: boolean;
  /** test hook; defaults to () => new Date().toISOString() */
  now?: () => string;
  /**
   * TTL after which an idle-with-completed-turn job leaves awaiting_followup → completed.
   * Default 30 * 60 * 1000 (30 minutes).
   */
  followupTtlMs?: number;
}

export interface StatusMappingInput {
  driverValue: SessionStatusValue;
  latestTurnStatus: TurnStatus;
  previousJobStatus: JobStatus;
  ttlElapsed: boolean;
  isOrphan: boolean;
  sidecar?: SidecarSnapshot | null;
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

const DEFAULT_FOLLOWUP_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Determines whether the followup TTL has elapsed for a given job.
 *
 * Activity timestamp lookup order:
 *   1. latestTurn.endedAt
 *   2. latestTurn.startedAt
 *   3. job.updatedAt
 *   4. job.createdAt
 *
 * If the parsed timestamp is NaN → treat TTL as elapsed (defensive against bad data;
 * prevents stuck awaiting_followup).
 */
function computeTtlElapsed(job: JobRecord, nowMs: number, ttlMs: number): boolean {
  const latestTurn = job.turns.length > 0 ? job.turns[job.turns.length - 1] : undefined;

  const candidates = [latestTurn?.endedAt, latestTurn?.startedAt, job.updatedAt, job.createdAt];

  for (const ts of candidates) {
    if (ts == null) continue;
    const parsed = Date.parse(ts);
    if (Number.isNaN(parsed)) {
      // Bad data — treat TTL as elapsed to prevent stuck awaiting_followup
      return true;
    }
    // Future timestamps (clock skew or manual record edit) are also treated as
    // elapsed — defensive against a one-sided check that would leave such jobs
    // stuck in awaiting_followup until the system clock caught up.
    if (parsed > nowMs) return true;
    return nowMs - parsed >= ttlMs;
  }

  // No timestamps at all — treat TTL as elapsed
  return true;
}

/**
 * Context-aware status mapping (Plan 0002 T7).
 *
 * Replaces the Plan 0001 static STATUS_MAP with a function that considers:
 *   - The driver's reported session status value
 *   - The most recent turn's status
 *   - Whether the 30-minute TTL has elapsed
 *   - Whether the session is orphaned
 *   - Optional sidecar hints (best-effort; null/undefined → skip)
 *
 * Precedence order (top wins):
 *   1. isOrphan → orphaned
 *   2. Sidecar waiting hint → needs_input
 *   3. Sidecar inFlight tasks/queued > 0 (overrides driver-idle) → running
 *   4. Driver value mapping (see switch below)
 *   5. Default fallback: previousJobStatus
 */
export function mapStatus(input: StatusMappingInput): JobStatus {
  const { driverValue, latestTurnStatus, previousJobStatus, ttlElapsed, isOrphan, sidecar } = input;

  // 1. Orphan check
  if (isOrphan) return 'orphaned';

  // 2. Sidecar waiting hint
  if (sidecar != null) {
    if (sidecar.state === 'waiting' || sidecar.inFlight?.kinds?.includes('permission')) {
      return 'needs_input';
    }

    // 3. Sidecar inFlight tasks active — override driver-idle
    const tasks = sidecar.inFlight?.tasks ?? 0;
    const queued = sidecar.inFlight?.queued ?? 0;
    if ((tasks > 0 || queued > 0) && driverValue === 'idle') {
      return 'running';
    }
  }

  // 4. Driver value mapping
  switch (driverValue) {
    case 'working':
      return 'running';
    case 'needs_input':
      return 'needs_input';
    case 'idle': {
      switch (latestTurnStatus) {
        case 'injecting':
        case 'working':
        case 'starting':
          return 'running';
        case 'needs_input':
          return 'needs_input';
        case 'failed':
          return 'failed';
        case 'completed':
          return ttlElapsed ? 'completed' : 'awaiting_followup';
        case 'queued':
          // Defensive: a "queued" turn shouldn't pair with idle driver, treat as mid-work
          return 'running';
        default:
          return previousJobStatus;
      }
    }
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'stopped';
    case 'orphaned':
      return 'orphaned';
    case 'queued':
      return 'queued';
    case 'starting':
      return 'starting';
    case 'unknown':
      // Preserve previous unless it's queued/starting → then move to running
      if (previousJobStatus === 'queued' || previousJobStatus === 'starting') {
        return 'running';
      }
      return previousJobStatus;
    default:
      // Exhaustive fallback
      return previousJobStatus;
  }
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
  const followupTtlMs = options?.followupTtlMs ?? DEFAULT_FOLLOWUP_TTL_MS;
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

  // Step 2b: read sidecar (best-effort)
  let sidecar: SidecarSnapshot | null = null;
  if (adapter.readSidecar) {
    try {
      sidecar = await adapter.readSidecar(refFromJob(job));
      // null return means sidecar absent — no warning, just continue
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push({ message: `sidecar read failed: ${msg}`, cause: err });
      // sidecar stays null — continue without it
    }
  }

  // Step 3: compute next status
  let nextStatus: JobStatus = previousStatus;
  if (!statusCallFailed && sessionStatus !== null) {
    const latestTurn = job.turns.length > 0 ? job.turns[job.turns.length - 1] : undefined;
    const latestTurnStatus: TurnStatus = latestTurn?.status ?? 'queued';
    const nowMs = Date.parse(now());
    const ttlElapsed = computeTtlElapsed(job, nowMs, followupTtlMs);
    // isOrphan: driver reports orphaned value
    const isOrphan = sessionStatus.value === 'orphaned';

    nextStatus = mapStatus({
      driverValue: sessionStatus.value,
      latestTurnStatus,
      previousJobStatus: previousStatus,
      ttlElapsed,
      isOrphan,
      sidecar,
    });

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

    // Sidecar result source: if transcript produced no result, try sidecar.output.result
    const transcriptProducedResult =
      transcriptSucceeded &&
      transcriptEventsForResult !== null &&
      transcriptEventsForResult.some(
        (ev) => ev.type === 'message.completed' && ev.role === 'assistant',
      );

    if (!transcriptProducedResult && sidecar?.output?.result) {
      const sidecarResultText = sidecar.output.result;
      if (sidecarResultText.trim().length > 0) {
        const resultPath = getJobResultPath(jobId);
        await ensureCompanionDirs();
        await writeFile(resultPath, sidecarResultText, 'utf8');
        const preview = makePreview(sidecarResultText);
        newResult = {
          finalMessagePath: resultPath,
          finalMessagePreview: preview,
        };
      }
    }

    // Logs fallback: when no transcript AND no sidecar result
    const needsLogsFallback =
      !transcriptAttempted ||
      !transcriptSucceeded ||
      (transcriptEventsForResult !== null &&
        !transcriptEventsForResult.some(
          (ev) => ev.type === 'message.completed' && ev.role === 'assistant',
        ));

    // Skip logs fallback if sidecar already provided a non-empty result.
    // Use a `.trim()`-truthy check to mirror the write-gate at the sidecar-result
    // branch above: an empty-string `sidecar.output.result` was NOT written to
    // disk, so the logs fallback must still fire in that case.
    const sidecarProducedResult =
      !transcriptProducedResult &&
      typeof sidecar?.output?.result === 'string' &&
      sidecar.output.result.trim().length > 0;

    if (needsLogsFallback && !sidecarProducedResult && adapter.readLogs) {
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
  // Also sync turn status with the computed job status (T7 turn-status synchronization).
  if (patched.turns.length > 0) {
    const last = patched.turns[patched.turns.length - 1]!;
    if (newResult !== undefined) {
      last.result = newResult;
      last.usageSnapshot = newResult.usageSnapshot;
      last.endedAt = last.endedAt ?? new Date().toISOString();
    }

    // Turn status sync rules (T7):
    // - running: leave turn status alone (don't churn working/injecting/starting/queued)
    // - needs_input: propagate to turn
    // - failed: propagate to turn (T6 already did this)
    // - completed: propagate to turn (T6 already did this)
    // - awaiting_followup: the latest turn IS completed; the job is reusable → leave turn as-is
    // - stopped / orphaned: preserve whatever status the turn has
    if (nextStatus === 'needs_input') {
      last.status = 'needs_input';
    } else if (nextStatus === 'completed') {
      last.status = 'completed';
    } else if (nextStatus === 'failed') {
      last.status = 'failed';
    }
    // awaiting_followup, running, stopped, orphaned: do not force turn status

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
      // (completed/failed/needs_input/awaiting_followup), which also stamps turn state.
      // Without these branches, a status-only transition would silently lose the
      // last-turn status update (the in-memory patched.turns[last].status would be
      // set but never persisted).
      const turnsChanged =
        resultChanged ||
        (statusChanged &&
          (nextStatus === 'completed' ||
            nextStatus === 'failed' ||
            nextStatus === 'needs_input' ||
            nextStatus === 'awaiting_followup'));
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
