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

export interface TurnHandle {
  driverName: string;
  session: SessionHandle;
  turnId?: string;
  startedAt: string;
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
}
