// Runtime types shared across delegated providers. Capability snapshots remain unknown here
// so the job store does not import concrete driver packages.

export type JobSchemaVersion = 1 | 2;

export type JobStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'needs_input'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'orphaned'
  | 'awaiting_followup'; // NEW in T6 (type only; reconciler doesn't emit it yet)

// TurnStatus is defined in driver.ts (T5). Re-export it here so types.ts consumers
// can reach all runtime-public types from one place.
export type { TurnStatus } from './driver.js';

/**
 * Link from an adversarial-review job to the job whose output it
 * evaluates. Present only on adversarial-review jobs.
 */
export interface ReviewOfContext {
  jobId: string;
  /** Which turn was reviewed (default: latest completed non-review turn). */
  turnIndex?: number;
}

export interface CodexContext {
  pluginVersion: string;
  cwd: string;
  sessionId?: string;
}

export interface WorkspaceContext {
  root: string;
  gitBranch?: string;
  gitHead?: string;
  gitDirtyHash?: string;
}

export interface DriverContext {
  name: string;
  version: string;
  capabilitiesSnapshot: unknown;
}

export interface AgentLaunchPolicy {
  permissionMode?: string;
  dangerouslySkipPermissions?: boolean;
  allowDangerouslySkipPermissions?: boolean;
  unattendedRequested?: boolean;
  mode?: string;
  sandbox?: boolean;
}

export interface AgentSessionContext {
  provider: 'claude' | 'agy' | string;
  version: string;
  shortId: string;
  sessionId?: string;
  sessionName: string;
  pid?: number;
  cwd: string;
  startedAt?: string;
  transcriptPath?: string;
  waitingFor?: string;
  logsCommand?: string;
  statePath?: string;
  resultPath?: string;
  errorPath?: string;
  launchPolicy?: AgentLaunchPolicy;
}

/** @deprecated Use AgentLaunchPolicy. */
export type ClaudeLaunchPolicy = AgentLaunchPolicy;

/** @deprecated Use JobRecord.session. */
export interface ClaudeSessionContext extends AgentSessionContext {
  provider: 'claude';
  logsCommand: string;
}

export interface PromptContext {
  summary: string;
  sha256: string;
  bytesLen: number;
}

export interface ResultContext {
  finalMessagePath: string;
  finalMessagePreview: string;
  touchedFiles?: string[];
  usageSnapshot?: unknown;
}

export interface JobError {
  at: string;
  message: string;
  cause?: string;
}

export interface TurnRecord {
  prompt: PromptContext;
  startedAt: string; // ISO
  endedAt?: string;
  result?: ResultContext;
  usageSnapshot?: unknown;
  status: import('./driver.js').TurnStatus;
}

// Public JobRecord — schemaVersion is locked to 2 for the in-memory shape returned by
// readJob/listJobs/updateJob. v1 records exist only on disk before lazy migration.
export interface JobRecord {
  jobId: string;
  schemaVersion: 2;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  codex: CodexContext;
  workspace: WorkspaceContext;
  driver: DriverContext;
  session: AgentSessionContext;
  /** Compatibility alias retained on Claude jobs. */
  claude?: ClaudeSessionContext;
  /** @deprecated use turns[0].prompt */
  prompt: PromptContext; // compat alias of turns[0].prompt
  /** @deprecated use the explicit `turns[i].result` you care about */
  // Compat alias of the latest turn THAT HAS A RESULT (skipping in-flight follow-up
  // turns whose `result` is still undefined). This prevents a known prior-turn result
  // from disappearing the moment a new follow-up turn starts.
  result?: ResultContext;
  errors?: JobError[];
  turns: TurnRecord[]; // NEW; required, len >= 1
  /**
   * Optional link to the job this record reviews. Present on
   * adversarial-review jobs only.
   */
  reviewOf?: ReviewOfContext;
}

export interface CreateJobInput {
  jobId?: string;
  status?: JobStatus;
  codex: CodexContext;
  workspace: WorkspaceContext;
  driver: DriverContext;
  session?: AgentSessionContext;
  /** Legacy create shape accepted for compatibility. */
  claude?: ClaudeSessionContext;
  prompt: PromptContext;
  reviewOf?: ReviewOfContext;
}

export type JobStoreWarning =
  | { kind: 'corrupt-record'; path: string; message: string }
  | { kind: 'unrecognized-file'; path: string };

export interface ListJobsResult {
  jobs: JobRecord[];
  warnings: JobStoreWarning[];
}
