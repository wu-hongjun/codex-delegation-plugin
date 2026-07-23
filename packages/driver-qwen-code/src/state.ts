import { randomBytes } from 'node:crypto';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';

import type { QwenRunnerState } from './types.js';

export async function readQwenState(path: string): Promise<QwenRunnerState | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as QwenRunnerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeQwenState(path: string, state: QwenRunnerState): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function acquireQwenSendLock(statePath: string): Promise<() => Promise<void>> {
  const lockPath = `${statePath}.send.lock`;
  let handle;
  try {
    handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${process.pid}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('another Qwen follow-up is already in progress');
    }
    throw error;
  }
  return async () => {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  };
}
