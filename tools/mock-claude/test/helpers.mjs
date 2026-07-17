// Test helpers for the mock-claude binary. Each test gets an isolated state HOME
// so tests do not share session data.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const MOCK_DIR = resolve(here, '..', '..');

export function makeTempHome() {
  return mkdtempSync(join(tmpdir(), 'mock-claude-test-'));
}

export function writeConfig(home, config) {
  const path = join(home, 'config.json');
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}

export function runClaude(args, opts = {}) {
  const env = {
    ...process.env,
    ...(opts.env ?? {}),
    PATH: `${MOCK_DIR}${delimiter}${process.env.PATH ?? ''}`,
  };
  return spawnSync('claude', args, {
    env,
    encoding: 'utf8',
    cwd: opts.cwd,
  });
}

export function cleanup(home) {
  rmSync(home, { recursive: true, force: true });
}

export function withIsolatedHome(fn) {
  const home = makeTempHome();
  let result;
  try {
    result = fn({
      home,
      env: { CODEX_DELEGATION_MOCK_CLAUDE_HOME: home },
    });
  } catch (err) {
    cleanup(home);
    throw err;
  }
  // If fn returned a Promise (async callback), defer cleanup until it settles.
  if (result != null && typeof result.then === 'function') {
    return result.then(
      (v) => {
        cleanup(home);
        return v;
      },
      (err) => {
        cleanup(home);
        throw err;
      },
    );
  }
  // Synchronous path: cleanup immediately.
  cleanup(home);
  return result;
}
