// Runtime reconciler — bridges the job-store with an injected `ReconcilerAdapter`.
//
// Architectural constraint: this file MUST NOT import from any driver package.
// All driver interaction is dependency-injected via `ReconcilerAdapter`.

import { readFile, writeFile } from 'node:fs/promises';

import {
  appendEvent,
  listJobsForWorkspace,
  readEvents,
  readJob,
  syncCompatAliases,
  updateJob,
} from './job-store.js';
import { ensureCompanionDirs, getJobResultPath, getJobTurnResultPath } from './paths.js';
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

  // 0. Sticky terminal: a deliberately-stopped job stays stopped. `cc stop`
  // writes `stopped`; the next reconcile sees the reaped session and would
  // otherwise flip it to `orphaned` (the isOrphan check below). A stopped job
  // cannot be resumed, so its status must reflect the user's action, not the
  // post-stop session state. Resumable states (awaiting_followup, needs_input)
  // are intentionally NOT sticky — if their session disappears, orphaned is
  // the correct outcome.
  if (previousJobStatus === 'stopped') return 'stopped';

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
      // Plan 0002 T15a: when driver is idle AND the sidecar shows the current
      // turn finished (state='done' + tempo='idle' + output.result populated),
      // treat any non-terminal turn status (queued/working/starting/injecting)
      // as 'completed'. The dispatcher path is start-only — cmdDelegate writes
      // turn[0].status='queued' and never updates it; only the reconciler can
      // observe completion via the sidecar.
      const sidecarSaysDone =
        sidecar != null &&
        sidecar.state === 'done' &&
        sidecar.tempo === 'idle' &&
        typeof sidecar.output?.result === 'string' &&
        sidecar.output.result.trim().length > 0;
      const effectiveTurnStatus: TurnStatus =
        sidecarSaysDone &&
        (latestTurnStatus === 'queued' ||
          latestTurnStatus === 'working' ||
          latestTurnStatus === 'starting' ||
          latestTurnStatus === 'injecting')
          ? 'completed'
          : latestTurnStatus;
      switch (effectiveTurnStatus) {
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
          // Defensive: a "queued" turn paired with idle driver and no sidecar
          // completion evidence means Claude hasn't actually finished yet
          // (e.g., the session settled to idle before the prompt was processed).
          // Keep as mid-work to avoid premature completion.
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
  if (a.finalMessagePath !== b.finalMessagePath) return false;
  if (a.finalMessagePreview !== b.finalMessagePreview) return false;
  if (!deepEqual(a.touchedFiles, b.touchedFiles)) return false;
  // Compare usageSnapshot too so changing token counts triggers an update.
  return deepEqual(a.usageSnapshot, b.usageSnapshot);
}

function latestTurnIndex(job: JobRecord): number | null {
  return job.turns.length > 0 ? job.turns.length - 1 : null;
}

function deriveShortIdFromSessionId(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const normalized = sessionId.replace(/-/g, '');
  if (!/^[a-fA-F0-9]{8,}$/.test(normalized)) return undefined;
  return normalized.slice(0, 8);
}

function shouldRepairPseudoShortId(current: string, derived: string | undefined): boolean {
  return derived !== undefined && current === 'claude';
}

async function writeResultArtifact(
  jobId: string,
  turnIndex: number | null,
  content: string,
): Promise<string> {
  await ensureCompanionDirs();
  const latestAliasPath = getJobResultPath(jobId);
  const resultPath = turnIndex === null ? latestAliasPath : getJobTurnResultPath(jobId, turnIndex);

  await writeFile(resultPath, content, 'utf8');
  if (resultPath !== latestAliasPath) {
    await writeFile(latestAliasPath, content, 'utf8');
  }
  return resultPath;
}

async function preserveLegacySharedResultForPreviousTurn(
  jobId: string,
  patched: JobRecord,
  currentTurnIndex: number | null,
): Promise<boolean> {
  if (currentTurnIndex === null || currentTurnIndex <= 0) return false;

  const sharedPath = getJobResultPath(jobId);
  for (let i = currentTurnIndex - 1; i >= 0; i--) {
    const turn = patched.turns[i];
    if (!turn) continue;
    const result = turn.result;
    if (result?.finalMessagePath !== sharedPath) continue;

    let content: string;
    try {
      content = await readFile(sharedPath, 'utf8');
    } catch {
      return false;
    }

    const snapshotPath = getJobTurnResultPath(jobId, i);
    await ensureCompanionDirs();
    await writeFile(snapshotPath, content, 'utf8');

    patched.turns = [...patched.turns];
    patched.turns[i] = {
      ...turn,
      result: {
        ...result,
        finalMessagePath: snapshotPath,
        finalMessagePreview: result.finalMessagePreview ?? makePreview(content),
      },
    };
    return true;
  }

  return false;
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
  const latestIndexAtStart = latestTurnIndex(job);
  const latestTurnAtStart = latestIndexAtStart === null ? undefined : job.turns[latestIndexAtStart];
  const latestTurnHadResultAtStart = latestTurnAtStart?.result !== undefined;

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
  let latestTurnStatusForMapping: TurnStatus = 'queued';
  let statusMappingInput: StatusMappingInput | null = null;
  if (!statusCallFailed && sessionStatus !== null) {
    const latestTurn = job.turns.length > 0 ? job.turns[job.turns.length - 1] : undefined;
    latestTurnStatusForMapping = latestTurn?.status ?? 'queued';
    const nowMs = Date.parse(now());
    const ttlElapsed = computeTtlElapsed(job, nowMs, followupTtlMs);
    // isOrphan: driver reports orphaned value
    const isOrphan = sessionStatus.value === 'orphaned';

    statusMappingInput = {
      driverValue: sessionStatus.value,
      latestTurnStatus: latestTurnStatusForMapping,
      previousJobStatus: previousStatus,
      ttlElapsed,
      isOrphan,
      sidecar,
    };
    nextStatus = mapStatus(statusMappingInput);

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
    // Usually the original handle is canonical. Repair only the observed nested
    // Claude Code pseudo-id shape where `claude --bg` output was parsed as the
    // literal command word "claude"; the status row's sessionId gives us the real
    // first-8-hex short id used by attach/logs/stop.
    const derivedShortId = deriveShortIdFromSessionId(sessionStatus.sessionId);
    if (shouldRepairPseudoShortId(patched.claude.shortId, derivedShortId)) {
      const previousShortId = patched.claude.shortId;
      patched.claude.shortId = derivedShortId!;
      if (
        patched.claude.logsCommand === undefined ||
        patched.claude.logsCommand === `claude logs ${previousShortId}`
      ) {
        patched.claude.logsCommand = `claude logs ${derivedShortId}`;
      }
    }
  }

  patched.status = nextStatus;

  // Step 4: read artifacts
  let newResult: ResultContext | undefined = previousResult;
  let transcriptEventsForResult: DriverEvent[] | null = null;
  let completionEvidenceProducedFromCurrentArtifacts = false;
  let resultProducedForLatestTurn = false;
  let turnSnapshotsChanged = false;

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
          turnSnapshotsChanged =
            (await preserveLegacySharedResultForPreviousTurn(jobId, patched, latestIndexAtStart)) ||
            turnSnapshotsChanged;
          const resultPath = await writeResultArtifact(
            jobId,
            latestIndexAtStart,
            finalAssistantMessage.content,
          );

          const preview = makePreview(finalAssistantMessage.content);
          newResult = {
            finalMessagePath: resultPath,
            finalMessagePreview: preview,
            ...(touchedFilesOrdered.length > 0 ? { touchedFiles: touchedFilesOrdered } : {}),
            ...(lastUsage !== null ? { usageSnapshot: lastUsage } : {}),
          };
          completionEvidenceProducedFromCurrentArtifacts = true;
          resultProducedForLatestTurn = latestIndexAtStart !== null;
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
        turnSnapshotsChanged =
          (await preserveLegacySharedResultForPreviousTurn(jobId, patched, latestIndexAtStart)) ||
          turnSnapshotsChanged;
        const resultPath = await writeResultArtifact(jobId, latestIndexAtStart, sidecarResultText);
        const preview = makePreview(sidecarResultText);
        newResult = {
          finalMessagePath: resultPath,
          finalMessagePreview: preview,
        };
        resultProducedForLatestTurn = latestIndexAtStart !== null;
        if (sidecar.state === 'done' && sidecar.tempo === 'idle') {
          completionEvidenceProducedFromCurrentArtifacts = true;
        }
      }
    }

    // A real Claude Code 2.1.174 session can finish a turn, answer, then settle
    // as agents-json status=idle plus sidecar state=blocked/output=null
    // ("What's the next step?"). The first status map above runs before
    // transcript/result artifacts are read, so idle+queued correctly stays
    // conservative until this point. Once the latest turn has concrete result
    // evidence, remap it as completed so the job becomes awaiting_followup
    // inside the same reconcile pass.
    const currentArtifactsChangedResult =
      completionEvidenceProducedFromCurrentArtifacts &&
      !resultContextEqual(previousResult, newResult);
    const currentTurnHasCompletionEvidence =
      latestTurnHadResultAtStart ||
      (completionEvidenceProducedFromCurrentArtifacts &&
        (previousResult === undefined || currentArtifactsChangedResult));
    const pendingTurnStatus =
      latestTurnStatusForMapping === 'queued' ||
      latestTurnStatusForMapping === 'working' ||
      latestTurnStatusForMapping === 'starting' ||
      latestTurnStatusForMapping === 'injecting';

    if (
      statusMappingInput !== null &&
      sessionStatus?.value === 'idle' &&
      pendingTurnStatus &&
      currentTurnHasCompletionEvidence
    ) {
      nextStatus = mapStatus({
        ...statusMappingInput,
        latestTurnStatus: 'completed',
      });
      patched.status = nextStatus;
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
          const MAX_LOG_CHARS = 8000;
          let logContent: string;
          if (logsResult.text.length > MAX_LOG_CHARS) {
            logContent = `Final result not available; see logs:\n\n${logsResult.text.slice(0, MAX_LOG_CHARS)}`;
          } else {
            logContent = logsResult.text;
          }
          turnSnapshotsChanged =
            (await preserveLegacySharedResultForPreviousTurn(jobId, patched, latestIndexAtStart)) ||
            turnSnapshotsChanged;
          const resultPath = await writeResultArtifact(jobId, latestIndexAtStart, logContent);

          const preview = makePreview(logContent);
          // touchedFiles: do NOT infer from logs
          newResult = {
            finalMessagePath: resultPath,
            finalMessagePreview: preview,
          };
          resultProducedForLatestTurn = latestIndexAtStart !== null;
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
  const shouldMirrorResultToLatestTurn =
    newResult !== undefined && (latestTurnHadResultAtStart || resultProducedForLatestTurn);
  let turnStateChanged = false;
  if (patched.turns.length > 0) {
    const last = patched.turns[patched.turns.length - 1]!;
    if (shouldMirrorResultToLatestTurn && newResult !== undefined) {
      if (!resultContextEqual(last.result, newResult)) {
        turnStateChanged = true;
      }
      last.result = newResult;
      last.usageSnapshot = newResult.usageSnapshot;
      if (last.endedAt === undefined) {
        last.endedAt = new Date().toISOString();
        turnStateChanged = true;
      }
    }

    // Turn status sync rules (T7 + T15a):
    // - running: leave turn status alone (don't churn working/injecting/starting/queued)
    // - needs_input: propagate to turn
    // - failed: propagate to turn (T6 already did this)
    // - completed: propagate to turn (T6 already did this)
    // - awaiting_followup: the latest turn IS completed by definition; mirror
    //   that to turn[last].status. T15a fix: pre-T15a, "leave turn as-is" was
    //   wrong for first-turn jobs whose turn status was queued/working before
    //   sidecar evidence arrived — the job would stay reusable on disk but
    //   turns[0].status would remain stale, breaking subsequent reconciles.
    // - stopped / orphaned: preserve whatever status the turn has
    if (nextStatus === 'needs_input') {
      if (last.status !== 'needs_input') turnStateChanged = true;
      last.status = 'needs_input';
    } else if (nextStatus === 'completed' || nextStatus === 'awaiting_followup') {
      if (last.status !== 'completed') turnStateChanged = true;
      last.status = 'completed';
      if (last.endedAt === undefined) {
        last.endedAt = new Date().toISOString();
        turnStateChanged = true;
      }
    } else if (nextStatus === 'failed') {
      if (last.status !== 'failed') turnStateChanged = true;
      last.status = 'failed';
    }
    // running, stopped, orphaned: do not force turn status

    syncCompatAliases(patched);
  }

  // Step 5: idempotency check — skip updateJob if nothing changed
  const statusChanged = nextStatus !== previousStatus;
  const resultChanged = !resultContextEqual(previousResult, newResult);
  const claudeChanged =
    patched.claude.shortId !== job.claude.shortId ||
    patched.claude.sessionId !== job.claude.sessionId ||
    patched.claude.pid !== job.claude.pid ||
    patched.claude.logsCommand !== job.claude.logsCommand ||
    patched.claude.transcriptPath !== job.claude.transcriptPath ||
    patched.claude.cwd !== job.claude.cwd;

  const statusImpliesTurnSync =
    statusChanged &&
    (nextStatus === 'completed' ||
      nextStatus === 'failed' ||
      nextStatus === 'needs_input' ||
      nextStatus === 'awaiting_followup');
  const turnsChanged = turnSnapshotsChanged || turnStateChanged || statusImpliesTurnSync;

  const needsUpdate = statusChanged || resultChanged || claudeChanged || turnsChanged;

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
