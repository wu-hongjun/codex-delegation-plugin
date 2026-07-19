import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const companionRoot = resolve(here, '..', '..', 'antigravity-plugin');
const hook = join(companionRoot, 'hook.mjs');

let controlDir;

beforeEach(() => {
  controlDir = mkdtempSync(join(tmpdir(), 'agy-control-hook-'));
});

afterEach(() => {
  rmSync(controlDir, { recursive: true, force: true });
});

function invoke(event, input) {
  return spawnSync(process.execPath, [hook, event], {
    env: { ...process.env, CODEX_DELEGATION_AGY_CONTROL_DIR: controlDir },
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

describe('Antigravity companion hook', () => {
  it('ships five native subagent profiles without permission override hooks', () => {
    const expectedAgents = [
      'codex-delegation-batch',
      'codex-delegation-deep-research',
      'codex-delegation-fork',
      'codex-delegation-goal',
      'codex-delegation-workflow',
    ];
    assert.deepEqual(readdirSync(join(companionRoot, 'agents')).sort(), expectedAgents);
    for (const name of expectedAgents) {
      const path = join(companionRoot, 'agents', name, 'agent.md');
      assert.equal(existsSync(path), true);
      const definition = readFileSync(path, 'utf8');
      assert.match(definition, new RegExp(`^---\\nname: ${name}\\n`, 'm'));
      assert.match(definition, /Do not spawn another subagent/i);
    }
    const hooks = JSON.parse(readFileSync(join(companionRoot, 'hooks.json'), 'utf8'));
    const configured = Object.values(hooks)[0];
    assert.deepEqual(Object.keys(configured).sort(), ['PreInvocation', 'Stop']);
  });

  it('publishes lifecycle metadata without duplicating prompts or private payloads', () => {
    const conversationId = '11111111-2222-4333-8444-555555555555';
    const result = invoke('PreInvocation', {
      conversationId,
      transcriptPath: '/tmp/transcript.jsonl',
      artifactDirectoryPath: '/tmp/artifacts',
      invocationNum: 3,
      userMessage: 'SECRET_PROMPT_MUST_NOT_BE_STORED',
      privatePayload: { token: 'SECRET_TOKEN_MUST_NOT_BE_STORED' },
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { injectSteps: [] });

    const log = readFileSync(join(controlDir, 'hooks.jsonl'), 'utf8');
    assert.doesNotMatch(log, /SECRET_PROMPT|SECRET_TOKEN/);
    const record = JSON.parse(log);
    assert.equal(record.conversationId, conversationId);
    assert.equal(record.invocationNum, 3);

    const state = JSON.parse(readFileSync(join(controlDir, 'hook-state.json'), 'utf8'));
    assert.equal(state.status, 'working');
    assert.equal(state.conversationId, conversationId);
    assert.equal(state.transcriptPath, '/tmp/transcript.jsonl');
  });

  it('reports fully idle Stop state and leaves Antigravity authoritative', () => {
    const result = invoke('Stop', {
      fullyIdle: true,
      executionNum: 4,
      terminationReason: 'NO_TOOL_CALL',
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { decision: 'stop' });
    const state = JSON.parse(readFileSync(join(controlDir, 'hook-state.json'), 'utf8'));
    assert.equal(state.status, 'idle');
    assert.equal(state.fullyIdle, true);
    assert.equal(state.executionNum, 4);
    assert.equal(state.terminationReason, 'NO_TOOL_CALL');
  });

  it('keeps child hooks from replacing the owned parent lifecycle state', () => {
    const parentId = '11111111-2222-4333-8444-555555555555';
    const childId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    assert.equal(invoke('PreInvocation', { conversationId: parentId, invocationNum: 0 }).status, 0);
    assert.equal(invoke('Stop', { conversationId: childId, fullyIdle: true }).status, 0);

    const state = JSON.parse(readFileSync(join(controlDir, 'hook-state.json'), 'utf8'));
    assert.equal(state.conversationId, parentId);
    assert.equal(state.event, 'PreInvocation');
    assert.equal(state.status, 'working');
    assert.match(readFileSync(join(controlDir, 'hooks.jsonl'), 'utf8'), new RegExp(childId));
  });
});
