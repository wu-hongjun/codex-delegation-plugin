import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { finished } from 'node:stream/promises';

import { readQwenState, writeQwenState } from './state.js';
import type { QwenLaunchRequest, QwenRunnerState } from './types.js';

const [requestPath, statePath] = process.argv.slice(2);
if (!requestPath || !statePath) process.exit(2);

function now(): string {
  return new Date().toISOString();
}

function processExists(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let request: QwenLaunchRequest;
try {
  request = JSON.parse(await readFile(requestPath, 'utf8')) as QwenLaunchRequest;
} finally {
  await unlink(requestPath).catch(() => undefined);
}
let state: QwenRunnerState = {
  ...request.state,
  runnerPid: process.pid,
  status: 'running',
  updatedAt: now(),
};
await writeQwenState(statePath, state);

const stdout = createWriteStream(state.transcriptPath, { flags: 'a', mode: 0o600 });
const stderr = createWriteStream(state.errorPath, { flags: 'a', mode: 0o600 });
const child = spawn(request.executable, request.args, {
  cwd: request.cwd,
  env: process.env,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
state = { ...state, childPid: child.pid, updatedAt: now() };
await writeQwenState(statePath, state);

let carry = '';
let sessionId = state.sessionId;
child.stdout.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  stdout.write(text);
  carry += text;
  const lines = carry.split(/\r?\n/);
  carry = lines.pop() ?? '';
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (typeof row['session_id'] === 'string') sessionId = row['session_id'];
    } catch {
      // Transcript parser reports malformed provider output.
    }
  }
});
child.stderr.pipe(stderr);

let stopping = false;
const stop = (signal: NodeJS.Signals) => {
  stopping = true;
  if (processExists(child.pid)) child.kill(signal);
};
process.once('SIGTERM', () => stop('SIGTERM'));
process.once('SIGINT', () => stop('SIGINT'));

const outcome = await new Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}>((resolve) => {
  child.once('error', (error) => resolve({ code: null, signal: null, error }));
  child.once('close', (code, signal) => resolve({ code, signal }));
});
stdout.end();
await Promise.all([finished(stdout), finished(stderr)]);

const latest = (await readQwenState(statePath)) ?? state;
const endedAt = now();
const status = stopping ? 'stopped' : outcome.code === 0 ? 'idle' : 'failed';
await writeQwenState(statePath, {
  ...latest,
  status,
  ...(sessionId ? { sessionId } : {}),
  completedTurnIndex: outcome.code === 0 ? request.turnIndex : latest.completedTurnIndex,
  exitCode: outcome.code,
  signal: outcome.signal,
  ...(outcome.error ? { error: outcome.error.message } : {}),
  updatedAt: endedAt,
  endedAt,
});
