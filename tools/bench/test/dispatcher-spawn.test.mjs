/**
 * Self-tests for tools/bench/lib/dispatcher-spawn.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * All tests use DI via opts.spawn — no real child process is spawned.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runDispatcher, getRepoRoot } from '../lib/dispatcher-spawn.mjs';

/** Build a mock spawnSync that returns the given synthetic result. */
function makeMockSpawn(override = {}) {
  return (_cmd, _args, _opts) => ({
    status: 0,
    stdout: '{}',
    stderr: '',
    signal: null,
    error: null,
    ...override,
  });
}

describe('runDispatcher() — basic contract', () => {
  it('returns the synthetic result from the mock spawn function', () => {
    const mock = makeMockSpawn({ status: 0, stdout: '{"ok":true}', stderr: '' });
    const result = runDispatcher({
      subcommand: 'status',
      args: ['--json'],
      cwd: '/tmp',
      env: {},
      timeoutMs: 5000,
      spawn: mock,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"ok":true}');
    assert.equal(result.stderr, '');
    assert.equal(result.timedOut, false);
  });

  it('passes the subcommand and args to spawn correctly', () => {
    let capturedArgs = null;
    const mockSpawn = (_cmd, args, _opts) => {
      capturedArgs = args;
      return { status: 0, stdout: '', stderr: '', signal: null, error: null };
    };
    runDispatcher({
      subcommand: 'delegate',
      args: ['--yes', '--json', '--', 'do something'],
      cwd: '/tmp',
      env: {},
      timeoutMs: 5000,
      spawn: mockSpawn,
    });
    assert.ok(capturedArgs !== null, 'capturedArgs should be set');
    // args layout: [dispatcherPath, 'delegate', '--yes', '--json', '--', 'do something']
    assert.equal(capturedArgs[1], 'delegate');
    assert.equal(capturedArgs[2], '--yes');
    assert.equal(capturedArgs[3], '--json');
    assert.equal(capturedArgs[4], '--');
    assert.equal(capturedArgs[5], 'do something');
  });

  it('passes the env object through to spawn', () => {
    let capturedEnv = null;
    const mockSpawn = (_cmd, _args, opts) => {
      capturedEnv = opts.env;
      return { status: 0, stdout: '', stderr: '', signal: null, error: null };
    };
    const env = { CC_PLUGIN_CODEX_HOME: '/tmp/isolated-home', PATH: '/usr/bin' };
    runDispatcher({
      subcommand: 'status',
      args: [],
      cwd: '/tmp',
      env,
      timeoutMs: 5000,
      spawn: mockSpawn,
    });
    assert.ok(capturedEnv !== null);
    assert.equal(capturedEnv.CC_PLUGIN_CODEX_HOME, '/tmp/isolated-home');
  });

  it('constructs the dispatcher path pointing at claude-companion.mjs', () => {
    let capturedArgs = null;
    const mockSpawn = (_cmd, args, _opts) => {
      capturedArgs = args;
      return { status: 0, stdout: '', stderr: '', signal: null, error: null };
    };
    runDispatcher({
      subcommand: 'status',
      args: [],
      cwd: '/tmp',
      env: {},
      timeoutMs: 5000,
      spawn: mockSpawn,
    });
    assert.ok(capturedArgs !== null);
    const dispatcherPath = capturedArgs[0];
    assert.ok(
      dispatcherPath.endsWith('claude-companion.mjs'),
      `expected path ending in claude-companion.mjs, got: ${dispatcherPath}`,
    );
    assert.ok(
      dispatcherPath.includes('plugin-codex'),
      `expected path containing plugin-codex, got: ${dispatcherPath}`,
    );
  });

  it('reports timedOut=true when spawn signals SIGTERM', () => {
    const mock = makeMockSpawn({ status: null, signal: 'SIGTERM', error: null });
    const result = runDispatcher({
      subcommand: 'delegate',
      args: [],
      cwd: '/tmp',
      env: {},
      timeoutMs: 1,
      spawn: mock,
    });
    assert.equal(result.timedOut, true);
  });

  it('reports timedOut=true when spawn returns ETIMEDOUT error code', () => {
    const err = new Error('timed out');
    err.code = 'ETIMEDOUT';
    const mock = makeMockSpawn({ status: null, signal: null, error: err });
    const result = runDispatcher({
      subcommand: 'delegate',
      args: [],
      cwd: '/tmp',
      env: {},
      timeoutMs: 1,
      spawn: mock,
    });
    assert.equal(result.timedOut, true);
  });
});

describe('getRepoRoot()', () => {
  it('returns a non-empty string path', () => {
    const root = getRepoRoot();
    assert.equal(typeof root, 'string');
    assert.ok(root.length > 0);
  });

  it('returned path contains a package.json with name "cc-plugin-codex"', () => {
    const root = getRepoRoot();
    const pkgPath = resolve(root, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, 'cc-plugin-codex');
  });
});
