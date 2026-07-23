import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QwenCodeDriver,
  buildQwenArgs,
  parseQwenTranscriptJsonl,
  readQwenState,
} from '../dist/index.js';

const here = fileURLToPath(import.meta.url);
const packageRoot = resolve(here, '..', '..');
const mockQwen = join(packageRoot, 'test', 'fixtures', 'mock-qwen.mjs');

let delegationHome;
let workspace;
let active;

beforeEach(() => {
  chmodSync(mockQwen, 0o755);
  delegationHome = mkdtempSync(join(tmpdir(), 'qwen-driver-home-'));
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'qwen-driver-workspace-')));
  process.env.CODEX_DELEGATION_HOME = delegationHome;
  active = [];
});

afterEach(async () => {
  for (const { driver, handle } of active) await driver.stop(handle).catch(() => undefined);
  delete process.env.CODEX_DELEGATION_HOME;
  rmSync(delegationHome, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

async function tracked(driver, opts) {
  const handle = await driver.startSession(opts);
  active.push({ driver, handle });
  return handle;
}

async function waitStatus(driver, handle, expected, timeout = 4000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const status = await driver.status(handle);
    if (expected.includes(status.value)) return status;
    if (Date.now() >= deadline) assert.fail(`last status: ${status.value}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
}

describe('Qwen probe and arguments', () => {
  it('reports only supported supervised headless capabilities', async () => {
    const caps = await new QwenCodeDriver({ executable: mockQwen, cwd: workspace }).probe();
    assert.equal(caps.driverName, 'qwen-code');
    assert.equal(caps.cliVersion, '0.20.1');
    assert.equal(caps.execution, 'supervised-process');
    assert.equal(caps.features.followup, true);
    assert.equal(caps.features.liveInput, false);
    assert.equal(caps.features.permissionHandoff, false);
    assert.equal(caps.attach, false);
    assert.equal(caps.permissions, 'cli-policy');
    assert.equal(caps.health.status, 'warn');
  });

  it('maps Qwen flags without shell interpolation', () => {
    assert.deepEqual(
      buildQwenArgs({
        cwd: workspace,
        prompt: 'inspect --resume literally',
        model: 'qwen-test',
        addDirs: ['/one', '/two'],
        permissionMode: 'plan',
        sandbox: true,
        safeMode: true,
        systemPrompt: 'system',
      }),
      [
        '--output-format',
        'stream-json',
        '--model',
        'qwen-test',
        '--system-prompt',
        'system',
        '--sandbox',
        '--safe-mode',
        '--approval-mode',
        'plan',
        '--include-directories',
        '/one',
        '--include-directories',
        '/two',
        'inspect --resume literally',
      ],
    );
  });
});

describe('Qwen transcript', () => {
  it('normalizes assistant, tools, usage, user, and errors while excluding thinking', () => {
    const parsed = parseQwenTranscriptJsonl(
      [
        JSON.stringify({
          type: 'user',
          message: { content: 'hello' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'private' },
              { type: 'tool_use', name: 'write_file', input: { path: 'x' } },
              { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
              { type: 'text', text: 'visible' },
            ],
            usage: { input_tokens: 5, output_tokens: 2 },
          },
        }),
        JSON.stringify({
          type: 'result',
          is_error: true,
          error: { message: 'bad result' },
        }),
        '{bad',
      ].join('\n'),
    );
    assert.deepEqual(
      parsed.events.map((event) => event.type),
      [
        'message.completed',
        'tool.started',
        'tool.completed',
        'message.completed',
        'usage.updated',
        'error',
      ],
    );
    assert.doesNotMatch(JSON.stringify(parsed.events), /private/);
    assert.equal(parsed.warnings.length, 1);
  });
});

describe('Qwen lifecycle', () => {
  it('runs detached, captures exact session identity, transcript, and atomic state', async () => {
    const driver = new QwenCodeDriver({ executable: mockQwen, cwd: workspace });
    const handle = await tracked(driver, { cwd: workspace, prompt: 'first' });
    const status = await waitStatus(driver, handle, ['idle']);
    assert.equal(status.sessionId, '123e4567-e89b-12d3-a456-426614174000');
    assert.match(readFileSync(handle.resultPath, 'utf8'), /Qwen completed: first/);
    const state = await readQwenState(handle.statePath);
    assert.equal(state.completedTurnIndex, 0);
    assert.equal(state.status, 'idle');
  });

  it('uses the captured exact --resume id for follow-up', async () => {
    const invocations = join(delegationHome, 'invocations.jsonl');
    const driver = new QwenCodeDriver({
      executable: mockQwen,
      cwd: workspace,
      env: { ...process.env, MOCK_QWEN_INVOCATIONS: invocations },
    });
    const handle = await tracked(driver, { cwd: workspace, prompt: 'first' });
    await waitStatus(driver, handle, ['idle']);
    const turn = await driver.send(handle, { type: 'text', text: 'second' });
    assert.equal(turn.status, 'completed');
    assert.equal(turn.finalMessage, 'Qwen completed: second');
    const rows = readFileSync(invocations, 'utf8').trim().split('\n').map(JSON.parse);
    const followup = rows[1].args;
    assert.deepEqual(
      followup.slice(followup.indexOf('--resume'), followup.indexOf('--resume') + 2),
      ['--resume', '123e4567-e89b-12d3-a456-426614174000'],
    );
    assert.equal(followup.includes('--continue'), false);
  });

  it('rejects concurrent follow-ups with a per-job lock', async () => {
    const driver = new QwenCodeDriver({
      executable: mockQwen,
      cwd: workspace,
      env: { ...process.env, MOCK_QWEN_DELAY_MS: '250' },
    });
    const handle = await tracked(driver, { cwd: workspace, prompt: 'first' });
    await waitStatus(driver, handle, ['idle']);
    const first = driver.send(handle, { type: 'text', text: 'one' });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
    await assert.rejects(
      driver.send(handle, { type: 'text', text: 'two' }),
      /another Qwen follow-up/,
    );
    await first;
  });

  it('stops an active child and records stopped state', async () => {
    const driver = new QwenCodeDriver({
      executable: mockQwen,
      cwd: workspace,
      env: { ...process.env, MOCK_QWEN_DELAY_MS: '5000' },
      stopTimeoutMs: 1000,
    });
    const handle = await tracked(driver, { cwd: workspace, prompt: 'slow' });
    await waitStatus(driver, handle, ['working']);
    await driver.stop(handle);
    assert.equal((await driver.status(handle)).value, 'stopped');
  });

  it('reports provider failure and stderr', async () => {
    const driver = new QwenCodeDriver({
      executable: mockQwen,
      cwd: workspace,
      env: { ...process.env, MOCK_QWEN_FAIL: '1' },
    });
    const handle = await tracked(driver, { cwd: workspace, prompt: 'fail' });
    await waitStatus(driver, handle, ['failed']);
    assert.match(readFileSync(handle.errorPath, 'utf8'), /mock failure/);
  });
});
