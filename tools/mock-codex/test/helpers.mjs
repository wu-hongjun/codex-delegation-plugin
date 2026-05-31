import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const MOCK_DIR = resolve(here, '..', '..');

export function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'mock-codex-test-'));
}

export function writeConfig(dir, config) {
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify(config, null, 2));
  return p;
}

export function runCodex(args, opts = {}) {
  const env = {
    ...process.env,
    ...(opts.env ?? {}),
    PATH: `${MOCK_DIR}${delimiter}${process.env.PATH ?? ''}`,
  };
  return spawnSync('codex', args, { env, encoding: 'utf8' });
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function withTempDir(fn) {
  const dir = makeTempDir();
  try {
    return fn(dir);
  } finally {
    cleanup(dir);
  }
}
