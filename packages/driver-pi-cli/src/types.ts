export const DRIVER_NAME = 'pi-cli';
export const DRIVER_VERSION = '0.0.0';

export interface PiCliDriverOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executable?: string;
  timeoutMs?: number;
}

export type PiRunnerStatus = 'starting' | 'running' | 'completed' | 'failed' | 'stopped';

export interface PiRunnerState {
  schemaVersion: 1;
  driverName: typeof DRIVER_NAME;
  shortId: string;
  sessionName: string;
  cwd: string;
  status: PiRunnerStatus;
  runnerPid: number;
  piPid?: number;
  sessionId?: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
  resultPath: string;
  errorPath: string;
  transcriptPath: string;
  sessionDir: string;
  resumeArgs: string[];
  turnIndex: number;
}

export interface PiLaunchRequest {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  state: PiRunnerState;
}
