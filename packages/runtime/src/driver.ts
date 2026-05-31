// Public driver contract. v1 only implements `ClaudeBackgroundDriver`, but the interface
// is shaped so future drivers (Gemini, Grok, Qwen, DeepSeek) can plug in without runtime
// changes. v1-out methods (`startSession`, `watch`, `status`, `stop`) still appear here
// because they are part of the v1 contract — only their implementations are deferred to
// later tasks. See `documentation/plan/0001-20260530-initial-plan/1-plan.md` § 3.3.

import type { DoctorProbeResult, DoctorProbeStatus } from './doctor.js';
import type { DriverEvent } from './events.js';

// ---------- capabilities ----------

export interface DriverHealth {
  status: DoctorProbeStatus;
  probes: DoctorProbeResult[];
}

export interface DriverCapabilities {
  driverName: string;
  driverVersion: string;
  claudeVersion: string | null;
  backgroundSessions: boolean;
  agentsJson: boolean;
  logsCommand: boolean;
  transcriptPath: boolean;
  /** v1 always false. Flipped only when the driver supports `claude attach`. */
  attach: false;
  structuredStream: 'transcript' | 'none';
  toolEvents: 'transcript' | 'none';
  permissions: 'human-attach' | 'none';
  health: DriverHealth;
}

// ---------- session + turn handles ----------

export interface StartSessionOpts {
  cwd: string;
  prompt: string;
  name?: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
  allowEdit?: boolean;
  addDirs?: string[];
  mcpConfig?: string;
}

export interface SessionHandle {
  driverName: string;
  shortId: string;
  sessionId?: string;
  sessionName: string;
  cwd: string;
  startedAt: string;
}

export interface SendInput {
  type: 'text';
  text: string;
}

export type TurnStatus =
  | 'queued'
  | 'starting'
  | 'injecting'
  | 'working'
  | 'needs_input'
  | 'completed'
  | 'failed';

export interface SendOpts {
  /** Soft timeout for turn completion. Default 600_000 (10 min). */
  timeoutMs?: number;
  /** Abort the in-flight send. Best-effort detach + lock release on abort. */
  signal?: AbortSignal;
  /** Transport selection. 'auto' picks the best available; 'pty' forces PTY-attach. */
  mode?: 'auto' | 'pty';
  /**
   * Called when Claude enters a waiting / permission-required state while
   * the driver still owns the attached PTY. Return a single-line string to
   * write back into the PTY (no trailing newline; the driver adds \r), or
   * null to leave the session waiting (driver throws DriverError).
   */
  onPermissionRequest?: (request: { shortId: string; message?: string }) => Promise<string | null>;
}

export interface TurnHandle {
  /** Driver name (mirrors SessionHandle.driverName). */
  driverName: string;
  /** The session this turn was sent into. */
  session: SessionHandle;
  /** ISO timestamp when the send began (just before the PTY write). */
  startedAt: string;
  /** ISO timestamp when the turn was observed complete. Optional. */
  endedAt?: string;
  /** Final status from the driver's POV. */
  status: TurnStatus;
  /** Latest assistant message from sidecar.output.result, if available. */
  finalMessage?: string;
  /** Best-effort list of files the agent touched, if discoverable. */
  touchedFiles?: string[];
  /** Verbatim sidecar usage snapshot if present (driver does not normalize). */
  usageSnapshot?: unknown;
}

// ---------- session status ----------

export type SessionStatusValue =
  | 'queued'
  | 'starting'
  | 'working'
  | 'needs_input'
  | 'idle'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'orphaned'
  | 'unknown';

export interface SessionStatus {
  value: SessionStatusValue;
  shortId?: string;
  sessionId?: string;
  sessionName?: string;
  cwd?: string;
  pid?: number;
  startedAt?: string;
  updatedAt?: string;
  transcriptPath?: string;
  raw?: unknown;
}

// ---------- watch ----------

export interface WatchOpts {
  intervalMs?: number;
  signal?: AbortSignal;
}

// ---------- driver ----------

export interface Driver {
  probe(): Promise<DriverCapabilities>;
  startSession(opts: StartSessionOpts): Promise<SessionHandle>;
  watch(target: SessionHandle | TurnHandle, opts?: WatchOpts): AsyncIterable<DriverEvent>;
  status(session: SessionHandle): Promise<SessionStatus>;
  stop(session: SessionHandle): Promise<void>;
  dispose(): Promise<void>;
  send(session: SessionHandle, input: SendInput, opts?: SendOpts): Promise<TurnHandle>;
}
