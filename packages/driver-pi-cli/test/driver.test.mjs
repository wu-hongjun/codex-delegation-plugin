import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PiCliDriver,
  buildPiArgs,
  parsePiTranscriptJsonl,
  probePiCliDriver,
  readPiState,
} from '../dist/index.js';

async function fixture(body) {
  const dir = await mkdtemp(join(tmpdir(), 'driver-pi-'));
  const executable = join(dir, 'omp');
  await writeFile(executable, `#!/usr/bin/env node\n${body}`, { mode: 0o700 });
  await chmod(executable, 0o700);
  return { dir, executable, env: { ...process.env, CODEX_DELEGATION_HOME: join(dir, 'state') } };
}

async function terminal(handle, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const state = await readPiState(handle.statePath);
    if (state && ['completed', 'failed', 'stopped'].includes(state.status)) return state;
    if (Date.now() >= deadline) throw new Error('timed out waiting for terminal state');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('buildPiArgs uses exact resume and maps supported policy flags', () => {
  assert.deepEqual(
    buildPiArgs(
      {
        cwd: '/work',
        prompt: 'next',
        conversationId: 'uuid-1',
        model: 'anthropic/sonnet',
        effort: 'high',
        allowedTools: ['read', 'bash'],
        permissionMode: 'bypassPermissions',
      },
      '/sessions',
    ),
    [
      '--print',
      '--mode',
      'json',
      '--session-dir',
      '/sessions',
      '--model',
      'anthropic/sonnet',
      '--thinking',
      'high',
      '--tools',
      'read,bash',
      '--approval-mode',
      'yolo',
      '--resume',
      'uuid-1',
      'next',
    ],
  );
});

test('buildPiArgs rejects unsupported deny lists', () => {
  assert.throws(
    () => buildPiArgs({ cwd: '/w', prompt: 'x', disallowedTools: ['bash'] }, '/s'),
    /does not support a disallowed-tools/,
  );
});

test('buildPiArgs fails closed for unsupported read-only plan mode', () => {
  assert.throws(
    () => buildPiArgs({ cwd: '/w', prompt: 'x', permissionMode: 'plan' }, '/s'),
    /does not expose an enforceable read-only mapping/,
  );
});

test('NDJSON parser extracts session, messages, and tool lifecycle while warning on bad rows', () => {
  const parsed = parsePiTranscriptJsonl(
    [
      JSON.stringify({ type: 'session', id: 'abc', timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'tool_execution_start', toolName: 'read', args: { path: 'a' } }),
      '{bad',
      JSON.stringify({
        type: 'tool_execution_end',
        toolName: 'read',
        result: 'ok',
        isError: false,
      }),
      JSON.stringify({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      }),
    ].join('\n'),
  );
  assert.equal(parsed.sessionId, 'abc');
  assert.equal(parsed.finalMessage, 'done');
  assert.deepEqual(
    parsed.events.map((event) => event.type),
    ['tool.started', 'tool.completed', 'message.completed'],
  );
  assert.equal(parsed.warnings.length, 1);
  assert.equal(parsed.warnings[0].line, 3);
});

test('probe reports truthful JSON/resume capabilities and omp version', async () => {
  const fx = await fixture(`
if (process.argv[2] === '--version') { console.log('omp 17.0.8'); process.exit(0); }
if (process.argv[2] === '--help') { console.log('--print --mode text|json|rpc --resume ID --approval-mode MODE'); process.exit(0); }
process.exit(2);
`);
  const result = await probePiCliDriver({ executable: fx.executable, env: fx.env });
  assert.equal(result.health.status, 'ok');
  assert.equal(result.cliVersion, 'omp 17.0.8');
  assert.equal(result.execution, 'supervised-process');
  assert.equal(result.features.followup, true);
  assert.equal(result.attach, false);
});

test('probe fails closed when omp lacks non-interactive print mode', async () => {
  const fx = await fixture(`
if (process.argv[2] === '--version') { console.log('omp 16.0.0'); process.exit(0); }
if (process.argv[2] === '--help') { console.log('--mode text|json|rpc --resume ID'); process.exit(0); }
process.exit(2);
`);
  const result = await probePiCliDriver({ executable: fx.executable, env: fx.env });
  assert.equal(result.health.status, 'fail');
  assert.equal(result.features.start, false);
  assert.equal(result.features.followup, false);
});

test('start captures session identity and send launches one exact --resume turn', async () => {
  const fx = await fixture(`
const fs = require('node:fs');
const args = process.argv.slice(2);
if (!args.includes('--print')) process.exit(8);
const resume = args.indexOf('--resume');
const id = resume >= 0 ? args[resume + 1] : 'session-123';
if (resume >= 0 && id !== 'session-123') process.exit(9);
console.log(JSON.stringify({type:'session',id,timestamp:new Date().toISOString(),cwd:process.cwd()}));
console.log(JSON.stringify({type:'tool_execution_start',toolName:'read',args:{path:'README.md'}}));
console.log(JSON.stringify({type:'tool_execution_end',toolName:'read',result:'ok',isError:false}));
console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:resume >= 0 ? 'followed' : 'started'}]}}));
`);
  process.env.CODEX_DELEGATION_HOME = join(fx.dir, 'state');
  const driver = new PiCliDriver({ executable: fx.executable, env: fx.env });
  const handle = await driver.startSession({ cwd: fx.dir, prompt: 'start' });
  const first = await terminal(handle);
  assert.equal(first.sessionId, 'session-123');
  const turn = await driver.send(
    { ...handle, sessionId: first.sessionId },
    { type: 'text', text: 'next' },
  );
  assert.equal(turn.status, 'completed');
  assert.equal(turn.finalMessage, 'followed');
  const second = await terminal(handle);
  assert.equal(second.turnIndex, 1);
  assert.match(await readFile(second.transcriptPath, 'utf8'), /followed/);
});

test('send lock rejects concurrent follow-ups without corrupting state', async () => {
  const fx = await fixture(`
const args = process.argv.slice(2); const resume = args.indexOf('--resume');
console.log(JSON.stringify({type:'session',id:'lock-session'}));
if (resume >= 0) setTimeout(() => {
 console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'ok'}]}}));
}, 300);
`);
  process.env.CODEX_DELEGATION_HOME = join(fx.dir, 'state');
  const driver = new PiCliDriver({ executable: fx.executable, env: fx.env });
  const handle = await driver.startSession({ cwd: fx.dir, prompt: 'start' });
  const first = await terminal(handle);
  const exact = { ...handle, sessionId: first.sessionId };
  const pending = driver.send(exact, { type: 'text', text: 'one' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  await assert.rejects(driver.send(exact, { type: 'text', text: 'two' }), /already in progress/);
  assert.equal((await pending).finalMessage, 'ok');
});

test('stop terminates a running provider and publishes a terminal state', async () => {
  const fx = await fixture(`
console.log(JSON.stringify({type:'session',id:'slow-session'}));
setInterval(() => {}, 1000);
`);
  process.env.CODEX_DELEGATION_HOME = join(fx.dir, 'state');
  const driver = new PiCliDriver({ executable: fx.executable, env: fx.env });
  const handle = await driver.startSession({ cwd: fx.dir, prompt: 'wait' });
  const started = Date.now();
  await driver.stop(handle);
  assert.ok(
    Date.now() - started < 1500,
    'supervisor should forward SIGTERM without fallback delay',
  );
  const state = await terminal(handle);
  assert.ok(['stopped', 'failed'].includes(state.status));
  assert.ok(['stopped', 'failed'].includes((await driver.status(handle)).value));
});
