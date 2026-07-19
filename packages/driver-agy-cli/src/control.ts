import { randomBytes } from 'node:crypto';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DriverError } from '@codex-delegation/runtime';

import type { AgyControlAck, AgyControlRequest, AgyRunnerState } from './types.js';
import { DRIVER_NAME } from './types.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestId(): string {
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function sendAgyControlRequest(
  state: AgyRunnerState,
  input: Omit<AgyControlRequest, 'schemaVersion' | 'id' | 'createdAt'>,
  timeoutMs = 5000,
): Promise<AgyControlAck> {
  if (!state.controlDir) {
    throw new DriverError('agy session has no interactive control directory', {
      driverName: DRIVER_NAME,
      operation: 'send',
    });
  }
  const id = requestId();
  const request: AgyControlRequest = {
    schemaVersion: 1,
    id,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const requestPath = join(state.controlDir, 'requests', `${id}.json`);
  const ackPath = join(state.controlDir, 'acks', `${id}.json`);
  await atomicWrite(requestPath, request);

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const ack = JSON.parse(await readFile(ackPath, 'utf8')) as AgyControlAck;
      await unlink(ackPath).catch(() => undefined);
      if (ack.error) {
        throw new DriverError(ack.error, {
          driverName: DRIVER_NAME,
          operation: 'send',
        });
      }
      return ack;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (Date.now() >= deadline) {
      throw new DriverError('agy interactive supervisor did not acknowledge input', {
        driverName: DRIVER_NAME,
        operation: 'send',
      });
    }
    await delay(20);
  }
}

export async function acquireAgySendLock(state: AgyRunnerState): Promise<() => Promise<void>> {
  if (!state.controlDir) {
    throw new DriverError('agy session has no interactive control directory', {
      driverName: DRIVER_NAME,
      operation: 'send',
    });
  }
  const path = join(state.controlDir, 'send.lock');
  try {
    const handle = await open(path, 'wx', 0o600);
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }) + '\n',
    );
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new DriverError('another process is already interacting with this agy session', {
        driverName: DRIVER_NAME,
        operation: 'send',
      });
    }
    throw error;
  }
  return async () => {
    await unlink(path).catch(() => undefined);
  };
}

export function permissionAnswerKeys(answer: string, waitingFor: string | undefined): string {
  const normalized = answer.trim().toLowerCase();
  if (waitingFor === 'workspace_trust') {
    if (['y', 'yes', '1', 'allow', 'approve'].includes(normalized)) return '\r';
    if (['n', 'no', '2', 'deny', 'reject'].includes(normalized)) return '\u001b[B\r';
  }
  if (waitingFor === 'permission') {
    if (['y', 'yes', '1', 'allow', 'approve'].includes(normalized)) return '1\r';
    if (['always', 'conversation', '2'].includes(normalized)) return '2\r';
    if (['persist', '3'].includes(normalized)) return '3\r';
    if (['n', 'no', '4', 'deny', 'reject'].includes(normalized)) return '4\r';
  }
  return answer + '\r';
}

export async function sendAgyKeys(
  state: AgyRunnerState,
  keys: string,
  timeoutMs?: number,
): Promise<AgyControlAck> {
  return sendAgyControlRequest(
    state,
    { type: 'keys', dataBase64: Buffer.from(keys, 'utf8').toString('base64') },
    timeoutMs,
  );
}
