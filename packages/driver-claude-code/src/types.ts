// Driver-package-local types and constants. Public runtime types (Driver, DriverEvent,
// DriverCapabilities, etc.) live in `@codex-delegation/runtime`.

export const DRIVER_NAME = 'claude-background';
export const DRIVER_VERSION = '0.0.0';

export interface ClaudeBackgroundDriverOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
