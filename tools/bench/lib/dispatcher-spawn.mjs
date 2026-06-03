/**
 * Dispatcher spawn wrapper for Plan 0004 benchmark harness.
 *
 * Wraps invocations of the plugin dispatcher:
 *   node <repo-root>/packages/plugin-codex/scripts/claude-companion.mjs <subcommand> [args...]
 *
 * Exports: runDispatcher(opts), getRepoRoot()
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const _thisDir = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from startDir until we find a package.json whose "name" field
 * equals "cc-plugin-codex" (the workspace root).
 *
 * @param {string} startDir
 * @returns {string}
 */
function findRepoRootSync(startDir) {
  let dir = startDir;
  // Guard against infinite loops on degenerate file systems.
  for (let i = 0; i < 64; i++) {
    const candidate = resolve(dir, 'package.json');
    if (existsSync(candidate)) {
      let pkg = null;
      try {
        pkg = JSON.parse(readFileSync(candidate, 'utf8'));
      } catch {
        // malformed package.json — keep walking up
      }
      if (pkg?.name === 'cc-plugin-codex') {
        return dir;
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      break; // reached filesystem root
    }
    dir = parent;
  }
  throw new Error(
    `Could not find repo root (package.json with name "cc-plugin-codex") walking up from: ${startDir}`,
  );
}

/** @type {string | null} */
let _cachedRepoRoot = null;

/**
 * Return the workspace root directory (cached after the first call).
 * @returns {string}
 */
export function getRepoRoot() {
  if (_cachedRepoRoot === null) {
    _cachedRepoRoot = findRepoRootSync(_thisDir);
  }
  return _cachedRepoRoot;
}

/**
 * Run the plugin dispatcher as a child process.
 *
 * @param {object} opts
 * @param {string} opts.subcommand                  e.g., 'delegate', 'status', 'result', 'review', 'adversarial-review', 'followup', 'stop'
 * @param {string[]} opts.args                      Positional args + flags (e.g., ['--yes', '--json', '--', 'prompt text'])
 * @param {string} opts.cwd                         Working directory (typically the fixture root)
 * @param {NodeJS.ProcessEnv} opts.env              Environment variables; should include isolated CC_PLUGIN_CODEX_HOME
 * @param {number} opts.timeoutMs                   Hard timeout for the child process
 * @param {Function=} opts.spawn                    Override for tests (default: node:child_process.spawnSync)
 * @returns {{ status: number, stdout: string, stderr: string, timedOut: boolean }}
 */
export function runDispatcher({ subcommand, args, cwd, env, timeoutMs, spawn }) {
  const dispatcherPath = resolve(
    getRepoRoot(),
    'packages',
    'plugin-codex',
    'scripts',
    'claude-companion.mjs',
  );

  const spawnFn = spawn ?? spawnSync;
  const cmdArgs = [dispatcherPath, subcommand, ...args];

  // Node's spawnSync timeout option requires a non-negative integer.
  // Runners compute timeouts as `deadline - performance.now()` which is a
  // float (performance.now() has fractional milliseconds). If the deadline
  // has already passed, the value is also negative. Coerce to a positive
  // integer (minimum 1ms) so spawn fires and timeouts immediately if the
  // deadline is exhausted.
  const coercedTimeoutMs = Math.max(1, Math.floor(Number(timeoutMs) || 0));

  const result = spawnFn('node', cmdArgs, {
    cwd,
    env,
    timeout: coercedTimeoutMs,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10 MB
  });

  // spawnSync result shape: { status, stdout, stderr, signal, error }
  const status = result.status ?? 1;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';

  // Detect timeout: spawnSync sets error.code to 'ETIMEDOUT' or signal to 'SIGTERM'
  // when the timeout fires, depending on the Node version.
  const timedOut =
    result.error?.code === 'ETIMEDOUT' ||
    result.error?.code === 'ERR_CHILD_PROCESS_TIMEOUT' ||
    result.signal === 'SIGTERM' ||
    result.signal === 'SIGKILL';

  return { status, stdout, stderr, timedOut };
}
