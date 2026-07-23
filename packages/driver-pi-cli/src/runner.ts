import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { writePiState } from './state.js';
import { readPiTranscript } from './transcript.js';
import type { PiLaunchRequest, PiRunnerState } from './types.js';

const requestPath = process.argv[2] ?? '';
const statePath = process.argv[3] ?? '';
if (!requestPath || !statePath) process.exit(2);
let request: PiLaunchRequest;
try {
  request = JSON.parse(await readFile(requestPath, 'utf8')) as PiLaunchRequest;
} finally {
  await unlink(requestPath).catch(() => undefined);
}

let state: PiRunnerState = {
  ...request.state,
  runnerPid: process.pid,
  status: 'starting',
  updatedAt: new Date().toISOString(),
};
let writes = Promise.resolve();
function publish(patch: Partial<PiRunnerState>): Promise<void> {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  const snapshot = { ...state };
  writes = writes.then(() => writePiState(statePath, snapshot));
  return writes;
}
await publish({});
const output = createWriteStream(state.transcriptPath, { flags: 'a', mode: 0o600 });
const errors = createWriteStream(state.errorPath, { flags: 'a', mode: 0o600 });
const child = spawn(request.executable, request.args, {
  cwd: request.cwd,
  env: process.env,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await publish({ piPid: child.pid, status: 'running' });
let stopping = false;
const stop = (signal: NodeJS.Signals) => {
  stopping = true;
  if (child.pid) {
    try {
      process.kill(child.pid, signal);
    } catch {
      /* child already exited */
    }
  }
};
process.once('SIGTERM', () => stop('SIGTERM'));
process.once('SIGINT', () => stop('SIGINT'));
let tail = '';
child.stdout.on('data', (chunk: Buffer) => {
  output.write(chunk);
  tail = `${tail}${chunk.toString()}`;
  const lines = tail.split(/\r?\n/);
  tail = lines.pop() ?? '';
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row['type'] === 'session' && typeof row['id'] === 'string' && !state.sessionId) {
        void publish({ sessionId: row['id'] });
      }
    } catch {
      /* transcript parser reports malformed rows */
    }
  }
});
child.stderr.on('data', (chunk: Buffer) => errors.write(chunk));
child.once('error', async (error) => {
  await publish({ status: 'failed', error: error.message, endedAt: new Date().toISOString() });
});
child.once('close', async (code, signal) => {
  await Promise.all([
    new Promise<void>((resolve) => output.end(resolve)),
    new Promise<void>((resolve) => errors.end(resolve)),
  ]);
  const parsed = await readPiTranscript(state.transcriptPath);
  await writeFile(state.resultPath, parsed.finalMessage ?? '', { mode: 0o600 });
  const stopped = stopping || signal === 'SIGTERM' || signal === 'SIGKILL';
  await publish({
    status: stopped ? 'stopped' : code === 0 ? 'completed' : 'failed',
    exitCode: code,
    signal: signal as NodeJS.Signals | null,
    ...(code && !state.error ? { error: `omp exited with code ${code}` } : {}),
    endedAt: new Date().toISOString(),
  });
});
