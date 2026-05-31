// process.ts — shared spawn helper for driver-claude-code.
//
// Internal module only. Do NOT re-export from index.ts.
// All driver sub-modules (background-session, agents-json, logs) import from here.

import { spawn } from 'node:child_process';

// ---------- public types ----------

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface RunCommandResult {
  command: string;
  args: string[];
  cwd?: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal?: NodeJS.Signals | string | null;
  spawnError?: NodeJS.ErrnoException;
}

// ---------- runCommand ----------
//
// Never throws — caller maps return value to domain errors (DriverError etc.).
// Uses shell: false, respects cwd/env/timeoutMs, captures stdout+stderr as utf-8.
// On timeout: SIGKILLs the process and sets timedOut: true.
// On ENOENT / sync throw from spawn(): returns spawnError populated.

/** Default command timeout. Exported so callers can format error messages with the same value. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<RunCommandResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = options?.cwd;
  const env = options?.env ?? process.env;

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(command, args, {
        cwd,
        env,
        shell: false,
      });
    } catch (err) {
      resolve({
        command,
        args,
        cwd,
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        signal: null,
        spawnError: err as NodeJS.ErrnoException,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let signal: NodeJS.Signals | string | null = null;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', (err) => {
      spawnError = err as NodeJS.ErrnoException;
    });
    proc.on('close', (code, sig) => {
      clearTimeout(timer);
      signal = sig;
      resolve({
        command,
        args,
        cwd,
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        signal,
        spawnError,
      });
    });
  });
}
