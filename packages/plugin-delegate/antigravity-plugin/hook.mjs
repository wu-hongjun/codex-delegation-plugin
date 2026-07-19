import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const event = process.argv[2] ?? 'unknown';
const controlDir = process.env.CODEX_DELEGATION_AGY_CONTROL_DIR;

let input = {};
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
} catch {
  input = {};
}

function writeControlEvent() {
  if (!controlDir) return;
  mkdirSync(controlDir, { recursive: true, mode: 0o700 });
  const at = new Date().toISOString();
  const record = {
    schemaVersion: 1,
    event,
    at,
    conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
    transcriptPath: typeof input.transcriptPath === 'string' ? input.transcriptPath : undefined,
    artifactDirectoryPath:
      typeof input.artifactDirectoryPath === 'string' ? input.artifactDirectoryPath : undefined,
    invocationNum: typeof input.invocationNum === 'number' ? input.invocationNum : undefined,
    executionNum: typeof input.executionNum === 'number' ? input.executionNum : undefined,
    terminationReason:
      typeof input.terminationReason === 'string' ? input.terminationReason : undefined,
    fullyIdle: input.fullyIdle === true,
    hasError: typeof input.error === 'string' && input.error.length > 0,
  };
  appendFileSync(join(controlDir, 'hooks.jsonl'), JSON.stringify(record) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });

  // Native subagents inherit the parent's environment, including this control
  // directory. The first parent event owns the bridge; child conversation hooks
  // remain in the audit log but must never replace the parent's lifecycle state.
  const target = join(controlDir, 'hook-state.json');
  try {
    const current = JSON.parse(readFileSync(target, 'utf8'));
    if (
      typeof current.conversationId === 'string' &&
      typeof record.conversationId === 'string' &&
      current.conversationId !== record.conversationId
    ) {
      return;
    }
  } catch {
    // The first event establishes ownership below.
  }

  const state = {
    schemaVersion: 1,
    event,
    at,
    eventId: `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    status: event === 'Stop' && input.fullyIdle === true ? 'idle' : 'working',
    conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
    transcriptPath: typeof input.transcriptPath === 'string' ? input.transcriptPath : undefined,
    artifactDirectoryPath:
      typeof input.artifactDirectoryPath === 'string' ? input.artifactDirectoryPath : undefined,
    modelName: typeof input.modelName === 'string' ? input.modelName : undefined,
    invocationNum: typeof input.invocationNum === 'number' ? input.invocationNum : undefined,
    executionNum: typeof input.executionNum === 'number' ? input.executionNum : undefined,
    terminationReason:
      typeof input.terminationReason === 'string' ? input.terminationReason : undefined,
    fullyIdle: input.fullyIdle === true,
    error: typeof input.error === 'string' && input.error ? input.error : undefined,
  };
  const temporary = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temporary, JSON.stringify(state) + '\n', { mode: 0o600 });
  renameSync(temporary, target);
}

try {
  writeControlEvent();
} catch {
  // Hooks are observability-only. Antigravity's own lifecycle and permission
  // engine remain authoritative if the bridge cannot write its state.
}

if (event === 'PreInvocation') {
  process.stdout.write(JSON.stringify({ injectSteps: [] }));
} else if (event === 'Stop') {
  process.stdout.write(JSON.stringify({ decision: 'stop' }));
} else {
  process.stdout.write('{}');
}
