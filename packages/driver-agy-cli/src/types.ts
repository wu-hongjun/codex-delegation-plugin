export const DRIVER_NAME = 'agy-cli';
export const DRIVER_VERSION = '0.0.0';

export interface AgyCliDriverOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  executable?: string;
}

export type AgyRunnerStatus =
  | 'starting'
  | 'running'
  | 'needs_input'
  | 'idle'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface AgyRunnerState {
  schemaVersion: 1;
  driverName: typeof DRIVER_NAME;
  shortId: string;
  sessionName: string;
  cwd: string;
  status: AgyRunnerStatus;
  runnerPid: number;
  agyPid?: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
  resultPath: string;
  errorPath: string;
  /** Raw ANSI terminal stream captured from the supervised Antigravity TUI. */
  terminalPath?: string;
  /** Per-session command and hook bridge directory. */
  controlDir?: string;
  /** Stable Antigravity conversation UUID used for exact resumed turns. */
  conversationId?: string;
  /** Structured Antigravity transcript discovered from the lifecycle hook. */
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  /** Per-job diagnostic log used to discover the UUID without global state. */
  diagnosticLogPath?: string;
  /** Provider launch options reused for subsequent headless turns. */
  resumeArgs?: string[];
  /** Zero-based turn number currently owned by the supervisor. */
  turnIndex?: number;
  /** Latest turn index for which a fully-idle Stop hook was observed. */
  completedTurnIndex?: number;
  /** Latest hook event identity consumed by the supervisor. */
  hookEventId?: string;
  /** Whether the companion hook has established parent-conversation ownership. */
  hookObserved?: boolean;
  /** Latest provider fully-idle signal for the owned parent conversation. */
  hookFullyIdle?: boolean;
  waitingFor?: 'permission' | 'workspace_trust' | 'input' | string;
  waitingMessage?: string;
}

export interface AgyLaunchRequest {
  executable: string;
  args: string[];
  cwd: string;
  state: AgyRunnerState;
}

export interface AgyControlRequest {
  schemaVersion: 1;
  id: string;
  type: 'prompt' | 'keys';
  createdAt: string;
  text?: string;
  dataBase64?: string;
  turnIndex?: number;
}

export interface AgyControlAck {
  schemaVersion: 1;
  id: string;
  acceptedAt: string;
  error?: string;
}

export interface AgyHookState {
  schemaVersion: 1;
  event: 'PreInvocation' | 'Stop' | string;
  at: string;
  eventId: string;
  status: 'working' | 'idle';
  conversationId?: string;
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  modelName?: string;
  invocationNum?: number;
  executionNum?: number;
  terminationReason?: string;
  fullyIdle?: boolean;
  error?: string;
}
