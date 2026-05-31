// Runtime type definitions. Keep this surface focused on what plan 0001 actually needs.
// Driver capability and event types live in the driver package(s); the runtime treats them
// as `unknown` in v1 to avoid circular design pressure.

export type JobStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'needs_input'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'orphaned';

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
  name: 'claude-background';
  version: string;
  capabilitiesSnapshot: unknown;
}

export interface ClaudeSessionContext {
  version: string;
  shortId: string;
  sessionId?: string;
  sessionName: string;
  pid?: number;
  cwd: string;
  transcriptPath?: string;
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

export interface JobRecord {
  jobId: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  codex: CodexContext;
  workspace: WorkspaceContext;
  driver: DriverContext;
  claude: ClaudeSessionContext;
  prompt: PromptContext;
  result?: ResultContext;
  errors?: JobError[];
}

export interface CreateJobInput {
  jobId?: string;
  status?: JobStatus;
  codex: CodexContext;
  workspace: WorkspaceContext;
  driver: DriverContext;
  claude: ClaudeSessionContext;
  prompt: PromptContext;
}

export type JobStoreWarning =
  | { kind: 'corrupt-record'; path: string; message: string }
  | { kind: 'unrecognized-file'; path: string };

export interface ListJobsResult {
  jobs: JobRecord[];
  warnings: JobStoreWarning[];
}
