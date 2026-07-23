import { readFile, rename, writeFile } from 'node:fs/promises';
import type { PiRunnerState } from './types.js';

export async function readPiState(path: string): Promise<PiRunnerState | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as PiRunnerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writePiState(path: string, state: PiRunnerState): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state) + '\n', { mode: 0o600 });
  await rename(temporary, path);
}
