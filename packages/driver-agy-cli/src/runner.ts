import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';

import { writeAgyState } from './state.js';
import type { AgyLaunchRequest, AgyRunnerState } from './types.js';

const requestPath = process.argv[2] ?? '';
const statePath = process.argv[3] ?? '';
if (!requestPath || !statePath) {
  process.stderr.write('agy runner requires launch request and state paths\n');
  process.exit(2);
}

let request: AgyLaunchRequest;
try {
  request = JSON.parse(await readFile(requestPath, 'utf8')) as AgyLaunchRequest;
} finally {
  await unlink(requestPath).catch(() => undefined);
}

let state: AgyRunnerState = {
  ...request.state,
  runnerPid: process.pid,
  status: 'starting',
  updatedAt: new Date().toISOString(),
};
await writeAgyState(statePath, state);

const stdoutFd = openSync(state.resultPath, 'a', 0o600);
const stderrFd = openSync(state.errorPath, 'a', 0o600);
let stopping = false;
let finished = false;

const child = spawn(request.executable, request.args, {
  cwd: request.cwd,
  env: process.env,
  shell: false,
  stdio: ['ignore', stdoutFd, stderrFd],
});

async function finish(
  status: AgyRunnerState['status'],
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  error?: string,
): Promise<void> {
  if (finished) return;
  finished = true;
  const now = new Date().toISOString();
  state = {
    ...state,
    status,
    updatedAt: now,
    endedAt: now,
    exitCode,
    signal,
    ...(error ? { error } : {}),
  };
  await writeAgyState(statePath, state).catch(() => undefined);
  closeSync(stdoutFd);
  closeSync(stderrFd);
}

child.once('spawn', async () => {
  state = {
    ...state,
    status: 'running',
    agyPid: child.pid,
    updatedAt: new Date().toISOString(),
  };
  await writeAgyState(statePath, state);
});

child.once('error', async (error) => {
  await finish('failed', null, null, error.message);
});

child.once('close', async (code, signal) => {
  await finish(stopping ? 'stopped' : code === 0 ? 'completed' : 'failed', code, signal);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  });
}
