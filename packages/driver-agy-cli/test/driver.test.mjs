import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { DriverError } from '@codex-delegation/runtime';
import {
  AgyCliDriver,
  attachAgyTerminal,
  buildAgyArgs,
  parseAgyTranscriptJsonl,
  permissionAnswerKeys,
  readAgyOutput,
  readAgyState,
  sendAgyKeys,
} from '../dist/index.js';

const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '..', '..', '..', '..');
const mockAgy = join(repoRoot, 'tools', 'mock-agy', 'agy');

let testHome;
let workspace;
let activeSessions;

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), 'agy-driver-home-'));
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'agy-driver-workspace-')));
  process.env.CODEX_DELEGATION_HOME = testHome;
  activeSessions = [];
});

afterEach(async () => {
  for (const { driver, handle } of activeSessions) {
    await driver.stop(handle).catch(() => undefined);
  }
  delete process.env.CODEX_DELEGATION_HOME;
  rmSync(testHome, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

async function startTracked(driver, opts) {
  const handle = await driver.startSession(opts);
  activeSessions.push({ driver, handle });
  return handle;
}

async function waitFor(driver, handle, expected, timeoutMs = 4000, predicate = () => true) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await driver.status(handle);
    if (expected.includes(status.value) && predicate(status)) return status;
    if (Date.now() >= deadline) {
      assert.fail(`timed out waiting for ${expected.join(', ')}; last status=${status.value}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

describe('AgyCliDriver probe and arguments', () => {
  it('detects supervised interactive support without invoking a model', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const caps = await driver.probe();
    assert.equal(caps.driverName, 'agy-cli');
    assert.equal(caps.cliVersion, '1.1.4');
    assert.equal(caps.execution, 'supervised-interactive');
    assert.equal(caps.features.start, true);
    assert.equal(caps.features.followup, true);
    assert.equal(caps.features.permissionHandoff, true);
    assert.equal(caps.attach, true);
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
        '--project',
        'project-1',
        '--new-project',
        '--log-file',
        '/tmp/agy.log',
        '--prompt-interactive',
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
      '--prompt-interactive',
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
    assert.equal(caps.cliVersion, '1.1.4');
  });
});

describe('Agy transcript normalization', () => {
  it('surfaces assistant, tool, and file events without leaking private thinking', () => {
    const transcript = [
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-07-19T12:00:00.000Z',
        thinking: 'private chain of thought must never escape',
        content: 'Visible answer.',
        tool_calls: [
          {
            name: 'write_to_file',
            args: { TargetFile: '/tmp/example.ts', CodeContent: 'export {}' },
          },
        ],
      }),
      JSON.stringify({
        step_index: 2,
        type: 'WRITE_TO_FILE',
        status: 'DONE',
        created_at: '2026-07-19T12:00:01.000Z',
        content: 'Wrote /tmp/example.ts',
      }),
      '{invalid json',
    ].join('\n');

    const parsed = parseAgyTranscriptJsonl(transcript);
    assert.deepEqual(
      parsed.events.map((event) => event.type),
      ['tool.started', 'file.changed', 'message.completed', 'tool.completed'],
    );
    assert.equal(parsed.events[2].content, 'Visible answer.');
    assert.equal(parsed.events[1].path, '/tmp/example.ts');
    assert.equal(parsed.warnings.length, 1);
    assert.doesNotMatch(JSON.stringify(parsed.events), /private chain of thought/i);
  });
});

describe('AgyCliDriver lifecycle', () => {
  it('keeps a persistent PTY job idle after its first completed turn', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'finish this task' });
    assert.equal(handle.driverName, 'agy-cli');
    assert.match(handle.shortId, /^[0-9a-f]{8}$/);
    assert.ok(handle.statePath);
    assert.ok(handle.resultPath);

    const status = await waitFor(driver, handle, ['idle'], 4000, (observed) =>
      Boolean(observed.transcriptPath),
    );
    assert.equal(status.value, 'idle');
    assert.ok(status.transcriptPath);
    assert.match(await readAgyOutput(handle.resultPath), /Antigravity completed: finish this task/);
  });

  it('binds the supervised agy process to the Codex workspace exactly once', async () => {
    const invocationsPath = join(testHome, 'invocations.jsonl');
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await startTracked(driver, {
      cwd: workspace,
      prompt: 'inspect workspace',
      addDirs: [workspace, '/extra'],
    });
    await waitFor(driver, handle, ['idle']);
    const invocation = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((entry) => Array.isArray(entry.args));
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
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'long task' });
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
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'fail task' });
    const status = await waitFor(driver, handle, ['failed']);
    assert.equal(status.value, 'failed');
    assert.match(await readAgyOutput(handle.resultPath), /auth failed/);
  });

  it('allows a detached supervisor grace time to publish terminal state', async () => {
    const statePath = join(testHome, 'settling.state.json');
    const now = new Date().toISOString();
    const state = {
      schemaVersion: 1,
      driverName: 'agy-cli',
      shortId: 'settling',
      sessionName: 'settling-supervisor',
      cwd: workspace,
      status: 'running',
      runnerPid: 2_147_483_647,
      startedAt: now,
      updatedAt: now,
      resultPath: join(testHome, 'settling.stdout.txt'),
      errorPath: join(testHome, 'settling.stderr.txt'),
      turnIndex: 0,
    };
    writeFileSync(statePath, JSON.stringify(state));
    const terminalWrite = setTimeout(() => {
      const endedAt = new Date().toISOString();
      writeFileSync(
        statePath,
        JSON.stringify({ ...state, status: 'completed', updatedAt: endedAt, endedAt, exitCode: 0 }),
      );
    }, 50);

    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const status = await driver.status({
      driverName: 'agy-cli',
      shortId: state.shortId,
      sessionName: state.sessionName,
      cwd: workspace,
      startedAt: now,
      statePath,
    });
    clearTimeout(terminalWrite);
    assert.equal(status.value, 'completed');
  });

  it('surfaces and resolves native Antigravity permission input', async () => {
    const configPath = join(testHome, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        permissionStall: true,
      }),
    );
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'inspect workspace' });
    const status = await waitFor(driver, handle, ['needs_input']);
    assert.equal(status.waitingFor, 'permission');
    const state = await readAgyState(handle.statePath);
    await sendAgyKeys(state, permissionAnswerKeys('yes', state.waitingFor));
    await waitFor(driver, handle, ['idle']);
  });

  it('surfaces Antigravity non-workspace file-access cards as native permission input', async () => {
    const configPath = join(testHome, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        permissionStall: true,
        permissionPromptText: 'Allow access to this file?',
      }),
    );
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'inspect external file' });
    const status = await waitFor(driver, handle, ['needs_input']);
    assert.equal(status.waitingFor, 'permission');
    const state = await readAgyState(handle.statePath);
    assert.match(state.waitingMessage ?? '', /outside the current workspace/i);
    await sendAgyKeys(state, permissionAnswerKeys('yes', state.waitingFor));
    await waitFor(driver, handle, ['idle']);
  });

  it('replays and proxies the persistent native TUI until the local detach key', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'first attached turn' });
    await waitFor(driver, handle, ['idle']);

    const input = new PassThrough();
    input.isTTY = true;
    input.isRaw = false;
    input.setRawMode = (value) => {
      input.isRaw = value;
      return input;
    };
    input.pause();
    const output = new PassThrough();
    output.isTTY = true;
    let rendered = '';
    output.on('data', (chunk) => {
      rendered += chunk.toString('utf8');
    });

    const attached = attachAgyTerminal(handle, { input, output, pollMs: 10 });
    const attachDeadline = Date.now() + 2000;
    while (!rendered.includes('attached; press Ctrl+]')) {
      if (Date.now() >= attachDeadline) assert.fail('attach banner was not rendered');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    input.write('\u001b[200~native attached followup\u001b[201~\r');
    const turnDeadline = Date.now() + 4000;
    for (;;) {
      const state = await readAgyState(handle.statePath);
      if ((state?.completedTurnIndex ?? -1) >= 1) break;
      if (Date.now() >= turnDeadline) assert.fail('attached follow-up did not finish');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    input.write('\u001d');
    await attached;

    assert.match(rendered, /Antigravity completed: first attached turn/);
    assert.match(rendered, /detached; Antigravity keeps running/);
    assert.match(await readAgyOutput(handle.resultPath), /native attached followup/);
    assert.equal((await driver.status(handle)).value, 'idle');
    assert.equal(input.isPaused(), true);
  });

  it('does not settle the parent while a native subagent is still outstanding', async () => {
    const configPath = join(testHome, 'subagent-config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        delayMs: 100,
        subagentPause: true,
        subagentDelayMs: 150,
        intermediateResponse: 'Waiting for child.',
        response: 'Native child final result.',
      }),
    );
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'delegate to child' });

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    assert.equal((await driver.status(handle)).value, 'working');
    const settled = await waitFor(driver, handle, ['idle']);
    assert.equal(settled.value, 'idle');
    const state = await readAgyState(handle.statePath);
    assert.equal(state.completedTurnIndex, 0);
    const transcript = parseAgyTranscriptJsonl(readFileSync(state.transcriptPath, 'utf8'));
    const messages = transcript.events.filter((event) => event.type === 'message.completed');
    assert.equal(messages.at(-1)?.content, 'Native child final result.');
  });

  it('continues the exact captured conversation through the same persistent PTY', async () => {
    const invocationsPath = join(testHome, 'followup-invocations.jsonl');
    const env = { ...process.env, CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace, env });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'one turn' });
    await waitFor(driver, handle, ['idle']);
    assert.equal(handle.sessionId, '11111111-2222-4333-8444-555555555555');

    const turn = await driver.send(handle, { type: 'text', text: 'continue exactly' });
    assert.equal(turn.status, 'completed');
    assert.match(turn.finalMessage, /continue exactly/);

    const invocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const cliInvocations = invocations.filter((entry) => Array.isArray(entry.args));
    const promptInvocations = invocations.filter((entry) => entry.kind === 'prompt');
    assert.equal(cliInvocations.length, 1);
    assert.equal(promptInvocations.length, 2);
    assert.equal(promptInvocations[1].prompt, 'continue exactly');
    assert.equal(promptInvocations[1].conversationId, handle.sessionId);
  });

  it('rejects follow-up when a legacy job has no captured conversation ID', async () => {
    const driver = new AgyCliDriver({ executable: mockAgy, cwd: workspace });
    const handle = await startTracked(driver, { cwd: workspace, prompt: 'one turn' });
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
