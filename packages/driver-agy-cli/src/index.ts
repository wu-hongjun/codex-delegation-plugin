import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  Driver,
  DriverCapabilities,
  DriverEvent,
  SendInput,
  SendOpts,
  SessionHandle,
  SessionStatus,
  StartSessionOpts,
  TurnHandle,
  WatchOpts,
} from '@codex-delegation/runtime';
import { DriverError, ensureProviderSessionsDir } from '@codex-delegation/runtime';

import { probeAgyCliDriver } from './probe.js';
import {
  acquireAgySendLock,
  permissionAnswerKeys,
  sendAgyControlRequest,
  sendAgyKeys,
} from './control.js';
import { readAgyState, writeAgyState } from './state.js';
import { finalAgyAssistantMessage, readAgyTranscriptEvents } from './transcript.js';
import { DRIVER_NAME } from './types.js';
import type { AgyCliDriverOptions, AgyLaunchRequest, AgyRunnerState } from './types.js';

export { probeAgyCliDriver } from './probe.js';
export { readAgyState } from './state.js';
export * from './control.js';
export * from './attach.js';
export * from './transcript.js';
export { DRIVER_NAME, DRIVER_VERSION } from './types.js';
export type { AgyCliDriverOptions, AgyRunnerState } from './types.js';

const RUNNER_PATH = fileURLToPath(new URL('./runner.js', import.meta.url));
const TERMINAL = new Set<AgyRunnerState['status']>(['completed', 'failed', 'stopped']);
const ORPHAN_STATE_GRACE_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processExists(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, 80) || 'agy';
}

function modeFor(opts: StartSessionOpts): 'accept-edits' | 'plan' | undefined {
  const permissionMode =
    opts.permissionMode === 'acceptEdits'
      ? 'accept-edits'
      : opts.permissionMode === 'plan'
        ? 'plan'
        : undefined;
  if (
    opts.permissionMode !== undefined &&
    !['default', 'acceptEdits', 'plan', 'bypassPermissions'].includes(opts.permissionMode)
  ) {
    throw new DriverError(`agy does not support permission mode "${opts.permissionMode}"`, {
      driverName: DRIVER_NAME,
      operation: 'startSession',
    });
  }
  const requested = [opts.mode, permissionMode, opts.allowEdit ? 'accept-edits' : undefined].filter(
    (value): value is 'accept-edits' | 'plan' => value !== undefined,
  );
  if (new Set(requested).size > 1) {
    throw new DriverError('Conflicting Antigravity edit modes were requested', {
      driverName: DRIVER_NAME,
      operation: 'startSession',
    });
  }
  return requested[0];
}

function signalIfRunning(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid || !processExists(pid)) return;
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export function buildAgyArgs(opts: StartSessionOpts): string[] {
  const args = buildAgyResumeArgs(opts);
  if (opts.conversationId) args.push('--conversation', opts.conversationId);
  if (opts.logFile) args.push('--log-file', opts.logFile);
  args.push('--prompt-interactive', opts.prompt);
  return args;
}

/** Provider flags that must remain stable across resumed print turns. */
export function buildAgyResumeArgs(opts: StartSessionOpts): string[] {
  const args: string[] = [];
  if (opts.model) args.push('--model', opts.model);
  if (opts.agent) args.push('--agent', opts.agent);
  const workspaceDirs = Array.from(
    new Set(
      [opts.cwd, ...(opts.addDirs ?? [])].filter(
        (dir): dir is string => typeof dir === 'string' && dir.length > 0,
      ),
    ),
  );
  for (const dir of workspaceDirs) args.push('--add-dir', dir);
  const mode = modeFor(opts);
  if (mode) args.push('--mode', mode);
  if (opts.sandbox || opts.safeMode) args.push('--sandbox');
  if (opts.dangerouslySkipPermissions || opts.permissionMode === 'bypassPermissions') {
    args.push('--dangerously-skip-permissions');
  }
  if (opts.project) args.push('--project', opts.project);
  if (opts.newProject) args.push('--new-project');
  return args;
}

async function waitForState(path: string, timeoutMs: number): Promise<AgyRunnerState | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await readAgyState(path);
    if (state !== null) return state;
    if (Date.now() >= deadline) return null;
    await delay(20);
  }
}

async function waitForConversationId(
  path: string,
  timeoutMs: number,
): Promise<AgyRunnerState | null> {
  const deadline = Date.now() + timeoutMs;
  let latest: AgyRunnerState | null = null;
  for (;;) {
    latest = await readAgyState(path);
    if (latest?.conversationId) return latest;
    if (latest?.status === 'needs_input') return latest;
    if (latest && TERMINAL.has(latest.status)) return latest;
    if (Date.now() >= deadline) return latest;
    await delay(20);
  }
}

function handleStatePath(session: SessionHandle): string {
  if (!session.statePath) {
    throw new DriverError('agy session handle is missing statePath', {
      driverName: DRIVER_NAME,
      operation: 'session',
    });
  }
  return session.statePath;
}

function stateToStatus(state: AgyRunnerState): SessionStatus {
  let value: SessionStatus['value'];
  switch (state.status) {
    case 'starting':
      value = 'starting';
      break;
    case 'running':
      value = 'working';
      break;
    case 'needs_input':
      value = 'needs_input';
      break;
    case 'idle':
      value = 'idle';
      break;
    case 'completed':
      value = 'completed';
      break;
    case 'failed':
      value = 'failed';
      break;
    case 'stopped':
      value = 'stopped';
      break;
  }
  return {
    value,
    shortId: state.shortId,
    sessionId: state.conversationId,
    sessionName: state.sessionName,
    cwd: state.cwd,
    pid: state.agyPid ?? state.runnerPid,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    ...(state.transcriptPath ? { transcriptPath: state.transcriptPath } : {}),
    ...(state.waitingFor ? { waitingFor: state.waitingFor } : {}),
    raw: state,
  };
}

export async function readAgyOutput(path: string | undefined): Promise<string> {
  if (!path) return '';
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

export class AgyCliDriver implements Driver {
  private readonly defaults: AgyCliDriverOptions;

  constructor(options: AgyCliDriverOptions = {}) {
    this.defaults = options;
  }

  probe(): Promise<DriverCapabilities> {
    return probeAgyCliDriver(this.defaults);
  }

  async startSession(opts: StartSessionOpts): Promise<SessionHandle> {
    if (!opts.prompt.trim()) {
      throw new DriverError('startSession requires a non-empty prompt', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
      });
    }
    const cwd = opts.cwd || this.defaults.cwd;
    if (!cwd) {
      throw new DriverError('startSession requires cwd', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
      });
    }

    const shortId = randomBytes(4).toString('hex');
    const prefix = opts.name ? safeName(opts.name) : `codex:agy:${safeName(basename(cwd))}`;
    const sessionName = `${prefix}-${shortId}`;
    const sessionsDir = await ensureProviderSessionsDir('agy');
    const base = join(sessionsDir, shortId);
    const requestPath = `${base}.request.json`;
    const statePath = `${base}.state.json`;
    const resultPath = `${base}.stdout.txt`;
    const errorPath = `${base}.stderr.txt`;
    const terminalPath = `${base}.terminal.log`;
    const controlDir = `${base}.control`;
    const diagnosticLogPath = opts.logFile ?? `${base}.agy.log`;
    const startedAt = new Date().toISOString();
    const state: AgyRunnerState = {
      schemaVersion: 1,
      driverName: DRIVER_NAME,
      shortId,
      sessionName,
      cwd,
      status: 'starting',
      runnerPid: 0,
      startedAt,
      updatedAt: startedAt,
      resultPath,
      errorPath,
      terminalPath,
      controlDir,
      diagnosticLogPath,
      resumeArgs: buildAgyResumeArgs(opts),
      turnIndex: 0,
    };
    const request: AgyLaunchRequest = {
      executable: this.defaults.executable ?? this.defaults.env?.['AGY_CLI_PATH'] ?? 'agy',
      args: buildAgyArgs({ ...opts, logFile: diagnosticLogPath }),
      cwd,
      state,
    };
    await Promise.all([
      mkdir(controlDir, { recursive: true, mode: 0o700 }),
      writeFile(requestPath, JSON.stringify(request), { mode: 0o600 }),
      writeFile(resultPath, '', { mode: 0o600 }),
      writeFile(errorPath, '', { mode: 0o600 }),
      writeFile(terminalPath, '', { mode: 0o600 }),
    ]);

    let runner: ChildProcess;
    try {
      runner = spawn(process.execPath, [RUNNER_PATH, requestPath, statePath], {
        cwd,
        env: {
          ...process.env,
          ...this.defaults.env,
          CODEX_DELEGATION_AGY_CONTROL_DIR: controlDir,
        },
        detached: true,
        shell: false,
        stdio: 'ignore',
      });
      await new Promise<void>((resolve, reject) => {
        runner.once('spawn', resolve);
        runner.once('error', reject);
      });
      runner.unref();
    } catch (error) {
      await unlink(requestPath).catch(() => undefined);
      throw new DriverError('Failed to start the agy supervisor', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
        cause: error,
      });
    }

    const observed = await waitForState(statePath, this.defaults.timeoutMs ?? 3000);
    if (observed?.status === 'failed') {
      const stderr = (await readAgyOutput(errorPath)) || (await readAgyOutput(terminalPath));
      throw new DriverError(observed.error ?? 'agy failed to start', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
        exitCode: observed.exitCode ?? undefined,
        stderr,
      });
    }
    if (observed === null) {
      if (runner.pid && processExists(runner.pid)) runner.kill('SIGTERM');
      throw new DriverError('agy supervisor did not publish state before the startup timeout', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
      });
    }

    const identified = await waitForConversationId(
      statePath,
      Math.max(this.defaults.timeoutMs ?? 3000, 5000),
    );

    return {
      driverName: DRIVER_NAME,
      shortId,
      ...(identified?.conversationId ? { sessionId: identified.conversationId } : {}),
      sessionName,
      cwd,
      startedAt,
      pid: observed.agyPid ?? runner.pid,
      statePath,
      resultPath: terminalPath,
      errorPath,
    };
  }

  async *watch(
    target: SessionHandle | TurnHandle,
    opts: WatchOpts = {},
  ): AsyncIterable<DriverEvent> {
    const session = 'session' in target ? target.session : target;
    let previous = '';
    for (;;) {
      if (opts.signal?.aborted) return;
      const status = await this.status(session);
      if (status.value !== previous) {
        yield { type: 'session.status', status, at: new Date().toISOString() };
        previous = status.value;
      }
      if (
        ['needs_input', 'idle', 'completed', 'failed', 'stopped', 'orphaned'].includes(status.value)
      )
        return;
      await delay(opts.intervalMs ?? 500);
    }
  }

  async status(session: SessionHandle): Promise<SessionStatus> {
    const statePath = handleStatePath(session);
    let state = await readAgyState(statePath);
    if (state === null) {
      return {
        value: processExists(session.pid) ? 'starting' : 'orphaned',
        shortId: session.shortId,
        sessionName: session.sessionName,
        cwd: session.cwd,
        pid: session.pid,
        startedAt: session.startedAt,
      };
    }
    if (!TERMINAL.has(state.status) && !processExists(state.runnerPid)) {
      // A detached supervisor can exit in the narrow interval between its final
      // child event and the atomic rename that publishes terminal state. Give
      // that write a bounded chance to become visible before calling it orphaned.
      const deadline = Date.now() + ORPHAN_STATE_GRACE_MS;
      while (Date.now() < deadline) {
        await delay(20);
        const current = await readAgyState(statePath);
        if (current === null) continue;
        state = current;
        if (TERMINAL.has(state.status) || processExists(state.runnerPid)) {
          return stateToStatus(state);
        }
      }
      return { ...stateToStatus(state), value: 'orphaned' };
    }
    return stateToStatus(state);
  }

  async stop(session: SessionHandle): Promise<void> {
    const statePath = handleStatePath(session);
    const state = await readAgyState(statePath);
    if (state === null || TERMINAL.has(state.status)) return;
    const targetPid = state.runnerPid > 0 ? state.runnerPid : session.pid;
    if (targetPid && processExists(targetPid)) {
      try {
        process.kill(targetPid, 'SIGTERM');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const current = await readAgyState(statePath);
      if (current === null || current.status === 'stopped' || TERMINAL.has(current.status)) return;
      await delay(50);
    }
    signalIfRunning(state.agyPid, 'SIGKILL');
    signalIfRunning(state.runnerPid, 'SIGKILL');
    const now = new Date().toISOString();
    await writeAgyState(statePath, {
      ...state,
      status: 'stopped',
      updatedAt: now,
      endedAt: now,
      signal: 'SIGKILL',
    });
  }

  async send(session: SessionHandle, input: SendInput, opts: SendOpts = {}): Promise<TurnHandle> {
    if (input.type !== 'text' || !input.text.trim()) {
      throw new DriverError('agy follow-up requires non-empty text', {
        driverName: DRIVER_NAME,
        operation: 'send',
      });
    }
    if (!session.statePath) {
      throw new DriverError('agy follow-up requires persisted supervisor state', {
        driverName: DRIVER_NAME,
        operation: 'send',
      });
    }

    const previous = await readAgyState(session.statePath);
    const conversationId = session.sessionId ?? previous?.conversationId;
    if (!conversationId) {
      throw new DriverError(
        'agy conversation identity was not captured; resolve any workspace-trust prompt, then retry',
        { driverName: DRIVER_NAME, operation: 'send' },
      );
    }
    if (!previous?.controlDir || !processExists(previous.runnerPid)) {
      throw new DriverError(
        'agy interactive supervisor is no longer running; start a new delegated job',
        {
          driverName: DRIVER_NAME,
          operation: 'send',
        },
      );
    }
    if (previous.status !== 'idle' && previous.status !== 'completed') {
      throw new DriverError(`agy job is ${previous.status}; wait for the current turn to finish`, {
        driverName: DRIVER_NAME,
        operation: 'send',
      });
    }

    const startedAt = new Date().toISOString();
    const targetTurnIndex = (previous.turnIndex ?? 0) + 1;
    const releaseLock = await acquireAgySendLock(previous);
    try {
      await sendAgyControlRequest(previous, {
        type: 'prompt',
        text: input.text,
        turnIndex: targetTurnIndex,
      });

      const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
      for (;;) {
        if (opts.signal?.aborted) {
          throw new DriverError(
            'agy follow-up wait was aborted; the interactive session is still running',
            {
              driverName: DRIVER_NAME,
              operation: 'send',
            },
          );
        }
        const current = await readAgyState(session.statePath);
        if (!current) {
          throw new DriverError('agy supervisor state disappeared during follow-up', {
            driverName: DRIVER_NAME,
            operation: 'send',
          });
        }
        if (current.status === 'failed' || current.status === 'stopped') {
          const stderr =
            (await readAgyOutput(session.errorPath)) || (await readAgyOutput(session.resultPath));
          throw new DriverError(current.error ?? `agy follow-up ${current.status}`, {
            driverName: DRIVER_NAME,
            operation: 'send',
            exitCode: current.exitCode ?? undefined,
            stderr,
          });
        }
        if (current.status === 'needs_input') {
          if (!opts.onPermissionRequest) {
            const error = new DriverError(
              `Antigravity requires ${current.waitingFor ?? 'interactive input'} but no response callback was supplied`,
              { driverName: DRIVER_NAME, operation: 'send' },
            );
            Object.assign(error, { permissionStall: true });
            throw error;
          }
          const answer = await opts.onPermissionRequest({
            shortId: session.shortId,
            message: current.waitingMessage ?? current.waitingFor,
          });
          if (answer === null) {
            const error = new DriverError('permission required but no response was provided', {
              driverName: DRIVER_NAME,
              operation: 'send',
            });
            Object.assign(error, { permissionStall: true });
            throw error;
          }
          await sendAgyKeys(current, permissionAnswerKeys(answer, current.waitingFor));
          continue;
        }
        if (
          (current.status === 'idle' || current.status === 'completed') &&
          (current.completedTurnIndex ?? -1) >= targetTurnIndex
        ) {
          const transcript = await readAgyTranscriptEvents({
            statePath: session.statePath,
            conversationId,
            env: this.defaults.env,
          });
          const finalMessage = finalAgyAssistantMessage(transcript.events);
          return {
            driverName: DRIVER_NAME,
            session: { ...session, sessionId: conversationId },
            startedAt,
            endedAt: new Date().toISOString(),
            status: 'completed',
            ...(finalMessage ? { finalMessage } : {}),
          };
        }
        if (Date.now() >= deadline) {
          throw new DriverError(
            'agy follow-up timed out; the interactive session may still be running',
            {
              driverName: DRIVER_NAME,
              operation: 'send',
            },
          );
        }
        await delay(100);
      }
    } finally {
      await releaseLock();
    }
  }

  async dispose(): Promise<void> {}
}
