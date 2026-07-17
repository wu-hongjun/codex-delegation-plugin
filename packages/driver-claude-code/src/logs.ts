// logs.ts — `claude logs <id>` reader for ClaudeBackgroundDriver.
//
// Returns raw log text as a human-readable fallback. Does NOT parse into events.

import { DriverError } from '@codex-delegation/runtime';

import { DEFAULT_TIMEOUT_MS, runCommand } from './process.js';
import { DRIVER_NAME } from './types.js';

// ---------- public types ----------

export interface ClaudeLogsOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface ClaudeLogsResult {
  shortId: string;
  text: string; // == stdout
  stdout: string;
  stderr: string;
}

// ---------- readClaudeLogs ----------

export async function readClaudeLogs(
  shortId: string,
  options?: ClaudeLogsOptions,
): Promise<ClaudeLogsResult> {
  // 1. Validate shortId.
  if (!shortId || typeof shortId !== 'string' || shortId.trim().length === 0) {
    throw new DriverError('logs requires a non-empty shortId', {
      driverName: DRIVER_NAME,
      operation: 'logs',
    });
  }

  const timeoutMs = options?.timeoutMs;

  // 2. Run `claude logs <shortId>`.
  const result = await runCommand('claude', ['logs', shortId], {
    cwd: options?.cwd,
    env: options?.env,
    timeoutMs,
  });

  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 3. Spawn error (ENOENT etc.).
  if (result.spawnError) {
    throw new DriverError(
      `cannot run claude: ${result.spawnError.code ?? result.spawnError.message}`,
      {
        driverName: DRIVER_NAME,
        operation: 'logs',
        cause: result.spawnError,
      },
    );
  }

  // 4. Timeout.
  if (result.timedOut) {
    throw new DriverError(`claude logs timed out after ${effectiveTimeout}ms`, {
      driverName: DRIVER_NAME,
      operation: 'logs',
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  // 5. Non-zero exit.
  if (result.exitCode !== 0) {
    throw new DriverError(`claude logs ${shortId} exited ${result.exitCode}`, {
      driverName: DRIVER_NAME,
      operation: 'logs',
      exitCode: result.exitCode ?? undefined,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  // 6. Success.
  return {
    shortId,
    text: result.stdout,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
