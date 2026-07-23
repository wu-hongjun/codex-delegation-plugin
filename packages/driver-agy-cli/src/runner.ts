import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeAgyState } from './state.js';
import type {
  AgyControlAck,
  AgyControlRequest,
  AgyHookState,
  AgyLaunchRequest,
  AgyRunnerState,
} from './types.js';

const requestPath = process.argv[2] ?? '';
const statePath = process.argv[3] ?? '';
if (!requestPath || !statePath) {
  process.stderr.write('agy runner requires launch request and state paths\n');
  process.exit(2);
}

let request: AgyLaunchRequest;
try {
  request = JSON.parse(await readFile(requestPath, 'utf8')) as AgyLaunchRequest;
} finally {
  await unlink(requestPath).catch(() => undefined);
}

if (!request.state.controlDir) {
  process.stderr.write('agy runner requires a control directory\n');
  process.exit(2);
}

const controlDir = request.state.controlDir;
const requestsDir = join(controlDir, 'requests');
const acksDir = join(controlDir, 'acks');
const hookStatePath = join(controlDir, 'hook-state.json');
await Promise.all([
  mkdir(controlDir, { recursive: true, mode: 0o700 }),
  mkdir(requestsDir, { recursive: true, mode: 0o700 }),
  mkdir(acksDir, { recursive: true, mode: 0o700 }),
]);

let state: AgyRunnerState = {
  ...request.state,
  runnerPid: process.pid,
  status: 'starting',
  updatedAt: new Date().toISOString(),
};

let stateWrites = Promise.resolve();
function publish(patch: Partial<AgyRunnerState>): Promise<void> {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  const snapshot = { ...state };
  stateWrites = stateWrites.then(() => writeAgyState(statePath, snapshot));
  return stateWrites;
}
await publish({});

const terminalPath = state.terminalPath ?? state.resultPath;
const terminalStream = createWriteStream(terminalPath, {
  flags: 'a',
  mode: 0o600,
});

let stopping = false;
let finished = false;
let terminal: import('node-pty').IPty | null = null;
let requestPolling = false;
let hookRefresh: Promise<void> | null = null;
let logPolling = false;
let terminalTextTail = '';

const CONVERSATION_ID =
  /(?:Created conversation\s+|Print mode:\s+conversation=|--conversation(?:=|\s+))([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function stripAnsi(value: string): string {
  return value
    .replace(
      // Terminal control bytes are intentionally matched and removed here.
      // eslint-disable-next-line no-control-regex
      /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
      '',
    )
    .replace(/\r/g, '');
}

function lastMarker(text: string): {
  index: number;
  status: AgyRunnerState['status'];
  waitingFor?: string;
  waitingMessage?: string;
} | null {
  const markers = [
    {
      marker: 'Do you trust the contents of this project?',
      status: 'needs_input' as const,
      waitingFor: 'workspace_trust',
      waitingMessage: 'Antigravity is asking whether to trust this workspace.',
    },
    {
      marker: 'Allow access to this',
      status: 'needs_input' as const,
      waitingFor: 'permission',
      waitingMessage: 'Antigravity is asking for access outside the current workspace.',
    },
    {
      marker: 'Do you want to proceed?',
      status: 'needs_input' as const,
      waitingFor: 'permission',
      waitingMessage: 'Antigravity is asking for tool permission.',
    },
    { marker: '? for shortcuts', status: 'idle' as const },
    { marker: 'esc to cancel', status: 'running' as const },
  ];
  let latest: ReturnType<typeof lastMarker> = null;
  for (const marker of markers) {
    const index = text.lastIndexOf(marker.marker);
    if (index < 0 || (latest && latest.index > index)) continue;
    latest = { index, ...marker };
  }
  return latest;
}

async function observeTerminal(chunk: string): Promise<void> {
  terminalStream.write(chunk);
  terminalTextTail = `${terminalTextTail}${stripAnsi(chunk)}`.slice(-32_768);
  const marker = lastMarker(terminalTextTail);
  if (!marker) return;
  if (marker.status === 'idle') {
    // Terminal output and hook delivery are independent streams. Refresh the
    // hook sidecar before trusting the visible prompt so a queued PreInvocation
    // or non-idle Stop event can veto the terminal's apparent idle state.
    await refreshHookState();
    // The native prompt is visible while a child agent is still working. Once
    // lifecycle hooks are active, only the owned parent's fullyIdle Stop event
    // may settle the turn.
    if (state.hookObserved && state.hookFullyIdle !== true) return;
    await publish({
      status: 'idle',
      completedTurnIndex: state.turnIndex ?? 0,
      waitingFor: undefined,
      waitingMessage: undefined,
    });
    return;
  }
  await publish({
    status: marker.status,
    waitingFor: marker.waitingFor,
    waitingMessage: marker.waitingMessage,
  });
}

async function explicitTranscriptTurnIndex(path: string | undefined): Promise<number | undefined> {
  if (!path) return undefined;
  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text) return undefined;
  let explicitTurns = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row['source'] === 'USER_EXPLICIT' && row['type'] === 'USER_INPUT') explicitTurns += 1;
    } catch {
      // A concurrently appended trailing row can be incomplete; the next hook
      // observation retries from the complete transcript.
    }
  }
  return explicitTurns > 0 ? explicitTurns - 1 : undefined;
}

async function captureConversationId(): Promise<void> {
  if (!state.diagnosticLogPath) return;
  const log = await readFile(state.diagnosticLogPath, 'utf8').catch(() => '');
  let match: RegExpExecArray | null = null;
  let latest: string | undefined;
  CONVERSATION_ID.lastIndex = 0;
  while ((match = CONVERSATION_ID.exec(log)) !== null) latest = match[1]?.toLowerCase();
  if (!latest || latest === state.conversationId) return;
  await publish({ conversationId: latest });
}

async function consumeHookState(): Promise<void> {
  const hook = JSON.parse(await readFile(hookStatePath, 'utf8')) as AgyHookState;
  if (!hook.eventId || hook.eventId === state.hookEventId) return;
  const patch: Partial<AgyRunnerState> = {
    hookEventId: hook.eventId,
    hookObserved: true,
    hookFullyIdle: hook.fullyIdle === true,
    ...(hook.conversationId ? { conversationId: hook.conversationId } : {}),
    ...(hook.transcriptPath ? { transcriptPath: hook.transcriptPath } : {}),
    ...(hook.artifactDirectoryPath ? { artifactDirectoryPath: hook.artifactDirectoryPath } : {}),
  };
  const transcriptTurnIndex = await explicitTranscriptTurnIndex(
    hook.transcriptPath ?? state.transcriptPath,
  );
  if (transcriptTurnIndex !== undefined) {
    patch.turnIndex = Math.max(state.turnIndex ?? 0, transcriptTurnIndex);
  }
  if (hook.status === 'working') {
    // PreInvocation precedes native TUI permission cards. Hook delivery and PTY
    // output are independent streams, so a delayed working hook must not erase
    // a newer needs_input marker observed in the terminal.
    if (state.status !== 'needs_input') {
      patch.status = 'running';
      patch.waitingFor = undefined;
      patch.waitingMessage = undefined;
    }
  } else if (hook.status === 'idle') {
    const completedTurnIndex = patch.turnIndex ?? state.turnIndex ?? 0;
    patch.status = 'idle';
    patch.turnIndex = completedTurnIndex;
    patch.completedTurnIndex = completedTurnIndex;
    patch.waitingFor = undefined;
    patch.waitingMessage = undefined;
    if (hook.error) patch.error = hook.error;
  }
  await publish(patch);
}

function refreshHookState(): Promise<void> {
  if (hookRefresh) return hookRefresh;
  const pending = consumeHookState()
    .catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        terminalStream.write(`\n[codex-delegation hook warning] ${String(error)}\n`);
      }
    })
    .finally(() => {
      if (hookRefresh === pending) hookRefresh = null;
    });
  hookRefresh = pending;
  return pending;
}

async function writeAck(ack: AgyControlAck): Promise<void> {
  const target = join(acksDir, `${ack.id}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(ack) + '\n', { mode: 0o600 });
  await rename(temporary, target);
}

async function consumeControlRequest(filename: string): Promise<void> {
  const path = join(requestsDir, filename);
  let control: AgyControlRequest;
  try {
    control = JSON.parse(await readFile(path, 'utf8')) as AgyControlRequest;
  } catch {
    await unlink(path).catch(() => undefined);
    return;
  }
  try {
    if (!terminal) throw new Error('Antigravity terminal is not running');
    if (control.type === 'prompt') {
      if (!control.text?.trim()) throw new Error('prompt request is empty');
      await publish({
        status: 'running',
        turnIndex: control.turnIndex ?? (state.turnIndex ?? 0) + 1,
        hookFullyIdle: false,
        waitingFor: undefined,
        waitingMessage: undefined,
      });
      terminal.write(`\u001b[200~${control.text}\u001b[201~\r`);
    } else {
      if (!control.dataBase64) throw new Error('keys request is empty');
      const data = Buffer.from(control.dataBase64, 'base64').toString('utf8');
      await publish({
        status: 'running',
        ...(state.status === 'idle' && /[\r\n]/.test(data) ? { hookFullyIdle: false } : {}),
        waitingFor: undefined,
        waitingMessage: undefined,
      });
      terminal.write(data);
    }
    await writeAck({
      schemaVersion: 1,
      id: control.id,
      acceptedAt: new Date().toISOString(),
    });
  } catch (error) {
    await writeAck({
      schemaVersion: 1,
      id: control.id,
      acceptedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

const requestTimer = setInterval(() => {
  if (requestPolling || finished) return;
  requestPolling = true;
  void readdir(requestsDir)
    .then(async (entries) => {
      for (const filename of entries.filter((entry) => entry.endsWith('.json')).sort()) {
        await consumeControlRequest(filename);
      }
    })
    .finally(() => {
      requestPolling = false;
    });
}, 25);

const hookTimer = setInterval(() => {
  if (finished) return;
  void refreshHookState();
}, 50);

const logTimer = setInterval(() => {
  if (logPolling || finished) return;
  logPolling = true;
  void captureConversationId()
    .catch(() => undefined)
    .finally(() => {
      logPolling = false;
    });
}, 50);

async function finish(status: AgyRunnerState['status'], exitCode: number): Promise<void> {
  if (finished) return;
  finished = true;
  await captureConversationId().catch(() => undefined);
  const now = new Date().toISOString();
  await publish({
    status,
    endedAt: now,
    exitCode,
    signal: stopping ? 'SIGTERM' : null,
    ...(status === 'failed' && !state.error
      ? { error: `agy interactive session exited ${exitCode}` }
      : {}),
  }).catch(() => undefined);
  clearInterval(requestTimer);
  clearInterval(hookTimer);
  clearInterval(logTimer);
  terminalStream.end();
}

try {
  const pty = await import('node-pty');
  terminal = pty.spawn(request.executable, request.args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 40,
    cwd: request.cwd,
    env: {
      ...process.env,
      CODEX_DELEGATION_AGY_CONTROL_DIR: controlDir,
    },
  });
  await publish({
    status: 'running',
    agyPid: terminal.pid,
  });
  terminal.onData((chunk) => {
    void observeTerminal(chunk);
  });
  terminal.onExit(({ exitCode }) => {
    const status = stopping
      ? 'stopped'
      : exitCode === 0 && state.completedTurnIndex !== undefined
        ? 'completed'
        : 'failed';
    void finish(status, exitCode ?? 0);
  });
} catch (error) {
  state.error = error instanceof Error ? error.message : String(error);
  await finish('failed', 1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
    terminal?.kill(signal);
  });
}
