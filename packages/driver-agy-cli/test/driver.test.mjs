import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@codex-delegation/runtime';
import { AgyCliDriver, buildAgyArgs, readAgyOutput } from '../dist/index.js';

const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '..', '..', '..', '..');
const mockAgy = join(repoRoot, 'tools', 'mock-agy', 'agy');

let testHome;
let workspace;

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), 'agy-driver-home-'));
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'agy-driver-workspace-')));
  process.env.CODEX_DELEGATION_HOME = testHome;
});

afterEach(() => {
  delete process.env.CODEX_DELEGATION_HOME;
  rmSync(testHome, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

async function waitFor(driver, handle, expected, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await driver.status(handle);
    if (expected.includes(status.value)) return status;
    if (Date.now() >= deadline) {
      assert.fail(`timed out waiting for ${expected.join(', ')}; last status=${status.value}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

describe('AgyCliDriver probe and arguments', () => {
  it('detects print-mode support without invoking a model', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const caps = await driver.probe();
    assert.equal(caps.driverName, 'agy-cli');
    assert.equal(caps.cliVersion, '1.1.3');
    assert.equal(caps.execution, 'supervised-process');
    assert.equal(caps.features.start, true);
    assert.equal(caps.features.followup, true);
  });

  it('maps supported Antigravity flags and keeps the prompt as one argv item', () => {
    assert.deepEqual(
      buildAgyArgs({
        cwd: workspace,
        prompt: 'review --provider literally',
        model: 'gemini-test',
        agent: 'reviewer',
        addDirs: ['/one', '/two'],
        mode: 'plan',
        sandbox: true,
        printTimeout: '2m',
        project: 'project-1',
        newProject: true,
        logFile: '/tmp/agy.log',
      }),
      [
        '--model',
        'gemini-test',
        '--agent',
        'reviewer',
        '--add-dir',
        workspace,
        '--add-dir',
        '/one',
        '--add-dir',
        '/two',
        '--mode',
        'plan',
        '--sandbox',
        '--print-timeout',
        '2m',
        '--project',
        'project-1',
        '--new-project',
        '--log-file',
        '/tmp/agy.log',
        '--print',
        'review --provider literally',
      ],
    );
  });

  it('maps --allow-edit and rejects conflicting provider modes', () => {
    assert.deepEqual(buildAgyArgs({ cwd: workspace, prompt: 'edit safely', allowEdit: true }), [
      '--add-dir',
      workspace,
      '--mode',
      'accept-edits',
      '--print',
      'edit safely',
    ]);
    assert.throws(
      () =>
        buildAgyArgs({
          cwd: workspace,
          prompt: 'conflict',
          mode: 'plan',
          allowEdit: true,
        }),
      (error) => error instanceof DriverError && error.operation === 'startSession',
    );
  });

  it('honors AGY_CLI_PATH consistently during probing', async () => {
    const driver = new AgyCliDriver({
      cwd: workspace,
      env: { ...process.env, AGY_CLI_PATH: mockAgy },
    });
    const caps = await driver.probe();
    assert.equal(caps.features.start, true);
    assert.equal(caps.cliVersion, '1.1.3');
  });
});

describe('AgyCliDriver lifecycle', () => {
  it('supervises a print job through completion and captures its result', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const handle = await driver.startSession({ cwd: workspace, prompt: 'finish this task' });
    assert.equal(handle.driverName, 'agy-cli');
    assert.match(handle.shortId, /^[0-9a-f]{8}$/);
    assert.ok(handle.statePath);
    assert.ok(handle.resultPath);

    const status = await waitFor(driver, handle, ['completed']);
    assert.equal(status.value, 'completed');
    assert.match(await readAgyOutput(handle.resultPath), /Antigravity completed: finish this task/);
  });

  it('binds the supervised agy process to the Codex workspace exactly once', async () => {
    const invocationsPath = join(testHome, 'invocations.jsonl');
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await driver.startSession({
      cwd: workspace,
      prompt: 'inspect workspace',
      addDirs: [workspace, '/extra'],
    });
    await waitFor(driver, handle, ['completed']);
    const invocation = JSON.parse(readFileSync(invocationsPath, 'utf8').trim());
    assert.equal(invocation.cwd, workspace);
    assert.deepEqual(
      invocation.args.filter((value, index, args) => args[index - 1] === '--add-dir'),
      [workspace, '/extra'],
    );
  });

  it('stops a running supervised process', async () => {
    const configPath = join(testHome, 'config.json');
    writeFileSync(configPath, JSON.stringify({ delayMs: 10_000 }));
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await driver.startSession({ cwd: workspace, prompt: 'long task' });
    await waitFor(driver, handle, ['working']);
    await driver.stop(handle);
    const status = await waitFor(driver, handle, ['stopped']);
    assert.equal(status.value, 'stopped');
    assert.equal(status.raw.status, 'stopped');
    assert.equal(status.raw.signal, 'SIGTERM');
  });

  it('reports non-zero agy exits as failed', async () => {
    const configPath = join(testHome, 'config.json');
    writeFileSync(configPath, JSON.stringify({ exitCode: 7, stderr: 'auth failed' }));
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await driver.startSession({ cwd: workspace, prompt: 'fail task' });
    const status = await waitFor(driver, handle, ['failed']);
    assert.equal(status.value, 'failed');
    assert.match(await readAgyOutput(handle.errorPath), /auth failed/);
  });

  it('reports exit-zero headless permission auto-denials as failed', async () => {
    const configPath = join(testHome, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        response: '',
        stderr:
          'jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.',
      }),
    );
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await driver.startSession({ cwd: workspace, prompt: 'inspect workspace' });
    const status = await waitFor(driver, handle, ['failed']);
    assert.equal(status.raw.exitCode, 0);
    assert.match(status.raw.error, /auto-denied a headless permission request/i);
  });

  it('resumes the exact captured conversation for a follow-up turn', async () => {
    const invocationsPath = join(testHome, 'followup-invocations.jsonl');
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await driver.startSession({ cwd: workspace, prompt: 'one turn' });
    await waitFor(driver, handle, ['completed']);
    assert.equal(handle.sessionId, '11111111-2222-4333-8444-555555555555');

    const turn = await driver.send(handle, { type: 'text', text: 'continue exactly' });
    assert.equal(turn.status, 'completed');
    assert.match(turn.finalMessage, /continue exactly/);

    const invocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(invocations.length, 2);
    const followupArgs = invocations[1].args;
    assert.deepEqual(
      followupArgs.slice(
        followupArgs.indexOf('--conversation'),
        followupArgs.indexOf('--conversation') + 2,
      ),
      ['--conversation', handle.sessionId],
    );
    assert.equal(followupArgs[followupArgs.indexOf('--print') + 1], 'continue exactly');
  });

  it('rejects follow-up when a legacy job has no captured conversation ID', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const handle = await driver.startSession({ cwd: workspace, prompt: 'one turn' });
    const legacyHandle = { ...handle, sessionId: undefined };
    const state = JSON.parse(readFileSync(handle.statePath, 'utf8'));
    delete state.conversationId;
    writeFileSync(handle.statePath, JSON.stringify(state));
    await assert.rejects(
      driver.send(legacyHandle, { type: 'text', text: 'continue' }),
      (error) => error instanceof DriverError && error.operation === 'send',
    );
  });
});
