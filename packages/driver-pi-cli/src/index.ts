import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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
import { probePiCliDriver } from './probe.js';
import { readPiState, writePiState } from './state.js';
import { readPiTranscript } from './transcript.js';
import { DRIVER_NAME } from './types.js';
import type { PiCliDriverOptions, PiLaunchRequest, PiRunnerState } from './types.js';

export { probePiCliDriver } from './probe.js';
export { readPiState, writePiState } from './state.js';
export * from './transcript.js';
export { DRIVER_NAME, DRIVER_VERSION } from './types.js';
export type { PiCliDriverOptions, PiRunnerState } from './types.js';

const RUNNER_PATH = fileURLToPath(new URL('./runner.js', import.meta.url));
const TERMINAL = new Set<PiRunnerState['status']>(['completed', 'failed', 'stopped']);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function exists(pid?: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, 80) || 'pi';
}
function executable(opts: PiCliDriverOptions): string {
  return opts.executable ?? opts.env?.['PI_CLI_PATH'] ?? opts.env?.['OMP_CLI_PATH'] ?? 'omp';
}

export function buildPiResumeArgs(opts: StartSessionOpts, sessionDir: string): string[] {
  const args = ['--print', '--mode', 'json', '--session-dir', sessionDir];
  if (opts.model) args.push('--model', opts.model);
  if (opts.effort) args.push('--thinking', opts.effort);
  if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
  if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt);
  if (opts.allowedTools?.length) args.push('--tools', opts.allowedTools.join(','));
  else if (opts.tools) args.push('--tools', opts.tools);
  if (opts.disallowedTools?.length) {
    throw new DriverError('pi does not support a disallowed-tools CLI list', {
      driverName: DRIVER_NAME,
      operation: 'startSession',
    });
  }
  if (opts.bare) args.push('--no-extensions', '--no-skills', '--no-rules');
  if (opts.permissionMode === 'plan') {
    throw new DriverError(
      'pi does not expose an enforceable read-only mapping for permission mode "plan"',
      { driverName: DRIVER_NAME, operation: 'startSession' },
    );
  }
  if (opts.dangerouslySkipPermissions || opts.permissionMode === 'bypassPermissions') {
    args.push('--approval-mode', 'yolo');
  } else if (opts.permissionMode === 'acceptEdits' || opts.allowEdit) {
    args.push('--approval-mode', 'write');
  } else if (opts.permissionMode && opts.permissionMode !== 'default') {
    throw new DriverError(`pi does not support permission mode "${opts.permissionMode}"`, {
      driverName: DRIVER_NAME,
      operation: 'startSession',
    });
  }
  return args;
}

export function buildPiArgs(opts: StartSessionOpts, sessionDir: string): string[] {
  const args = buildPiResumeArgs(opts, sessionDir);
  if (opts.conversationId) args.push('--resume', opts.conversationId);
  args.push(opts.prompt);
  return args;
}

function statusFrom(state: PiRunnerState): SessionStatus {
  const value: SessionStatus['value'] =
    state.status === 'running'
      ? 'working'
      : state.status === 'starting'
        ? 'starting'
        : state.status;
  return {
    value,
    shortId: state.shortId,
    sessionId: state.sessionId,
    sessionName: state.sessionName,
    cwd: state.cwd,
    pid: state.piPid ?? state.runnerPid,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    transcriptPath: state.transcriptPath,
    raw: state,
  };
}

async function waitState(path: string, timeout: number): Promise<PiRunnerState | null> {
  const deadline = Date.now() + timeout;
  do {
    const state = await readPiState(path);
    if (state) return state;
    await delay(20);
  } while (Date.now() < deadline);
  return null;
}

async function spawnRunner(
  requestPath: string,
  statePath: string,
  request: PiLaunchRequest,
  env: NodeJS.ProcessEnv,
): Promise<ChildProcess> {
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600 });
  try {
    const runner = spawn(process.execPath, [RUNNER_PATH, requestPath, statePath], {
      cwd: request.cwd,
      env,
      detached: true,
      shell: false,
      stdio: 'ignore',
    });
    await new Promise<void>((resolve, reject) => {
      runner.once('spawn', resolve);
      runner.once('error', reject);
    });
    runner.unref();
    return runner;
  } catch (error) {
    await unlink(requestPath).catch(() => undefined);
    throw error;
  }
}

export class PiCliDriver implements Driver {
  constructor(private readonly defaults: PiCliDriverOptions = {}) {}
  probe(): Promise<DriverCapabilities> {
    return probePiCliDriver(this.defaults);
  }

  async startSession(opts: StartSessionOpts): Promise<SessionHandle> {
    if (!opts.prompt.trim())
      throw new DriverError('startSession requires a non-empty prompt', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
      });
    const cwd = opts.cwd || this.defaults.cwd;
    if (!cwd)
      throw new DriverError('startSession requires cwd', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
      });
    const shortId = randomBytes(4).toString('hex');
    const sessionName = `${opts.name ? safe(opts.name) : `codex:pi:${safe(basename(cwd))}`}-${shortId}`;
    const root = await ensureProviderSessionsDir('pi');
    const base = join(root, shortId);
    const sessionDir = `${base}.sessions`;
    await mkdir(sessionDir, { recursive: true, mode: 0o700 });
    const statePath = `${base}.state.json`;
    const requestPath = `${base}.request.json`;
    const resultPath = `${base}.result.md`;
    const errorPath = `${base}.stderr.log`;
    const transcriptPath = `${base}.turn-0.jsonl`;
    const startedAt = new Date().toISOString();
    const resumeArgs = buildPiResumeArgs(opts, sessionDir);
    const state: PiRunnerState = {
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
      transcriptPath,
      sessionDir,
      resumeArgs,
      turnIndex: 0,
    };
    await Promise.all([
      writeFile(transcriptPath, '', { mode: 0o600 }),
      writeFile(errorPath, '', { mode: 0o600 }),
      writeFile(resultPath, '', { mode: 0o600 }),
    ]);
    let runner: ChildProcess;
    try {
      runner = await spawnRunner(
        requestPath,
        statePath,
        {
          executable: executable(this.defaults),
          args: [...resumeArgs, opts.prompt],
          cwd,
          state,
        },
        { ...process.env, ...this.defaults.env },
      );
    } catch (error) {
      throw new DriverError('Failed to start the pi supervisor', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
        cause: error,
      });
    }
    const observed = await waitState(statePath, this.defaults.timeoutMs ?? 3000);
    if (!observed) {
      if (runner.pid) process.kill(runner.pid, 'SIGTERM');
      throw new DriverError('pi supervisor did not publish state before timeout', {
        driverName: DRIVER_NAME,
        operation: 'startSession',
      });
    }
    return {
      driverName: DRIVER_NAME,
      shortId,
      sessionName,
      cwd,
      startedAt,
      ...(observed.sessionId ? { sessionId: observed.sessionId } : {}),
      pid: observed.piPid ?? runner.pid,
      statePath,
      resultPath,
      errorPath,
    };
  }

  async *watch(
    target: SessionHandle | TurnHandle,
    opts: WatchOpts = {},
  ): AsyncIterable<DriverEvent> {
    const session = 'session' in target ? target.session : target;
    let count = 0;
    let previous = '';
    for (;;) {
      if (opts.signal?.aborted) return;
      const state = session.statePath ? await readPiState(session.statePath) : null;
      if (state) {
        const parsed = await readPiTranscript(state.transcriptPath);
        while (count < parsed.events.length) yield parsed.events[count++]!;
      }
      const status = await this.status(session);
      if (status.value !== previous) {
        yield { type: 'session.status', status, at: new Date().toISOString() };
        previous = status.value;
      }
      if (['completed', 'failed', 'stopped', 'orphaned'].includes(status.value)) return;
      await delay(opts.intervalMs ?? 250);
    }
  }

  async status(session: SessionHandle): Promise<SessionStatus> {
    if (!session.statePath) return { value: 'unknown', shortId: session.shortId };
    const state = await readPiState(session.statePath);
    if (!state)
      return { value: exists(session.pid) ? 'starting' : 'orphaned', shortId: session.shortId };
    return !TERMINAL.has(state.status) && !exists(state.runnerPid)
      ? { ...statusFrom(state), value: 'orphaned' }
      : statusFrom(state);
  }

  async stop(session: SessionHandle): Promise<void> {
    if (!session.statePath) return;
    const state = await readPiState(session.statePath);
    if (!state || TERMINAL.has(state.status)) return;
    if (exists(state.runnerPid)) {
      try {
        process.kill(state.runnerPid, 'SIGTERM');
      } catch {
        /* raced exit */
      }
    } else if (exists(state.piPid)) {
      try {
        process.kill(state.piPid!, 'SIGTERM');
      } catch {
        /* raced exit */
      }
    }
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const current = await readPiState(session.statePath);
      if (!current || TERMINAL.has(current.status)) return;
      await delay(50);
    }
    const latest = (await readPiState(session.statePath)) ?? state;
    for (const pid of [latest.piPid, latest.runnerPid]) {
      if (exists(pid))
        try {
          process.kill(pid!, 'SIGKILL');
        } catch {
          /* raced exit */
        }
    }
    const now = new Date().toISOString();
    await writePiState(session.statePath, {
      ...latest,
      status: 'stopped',
      signal: 'SIGKILL',
      updatedAt: now,
      endedAt: now,
    });
  }

  async send(session: SessionHandle, input: SendInput, opts: SendOpts = {}): Promise<TurnHandle> {
    if (!input.text.trim() || !session.statePath)
      throw new DriverError('pi follow-up requires text and persisted state', {
        driverName: DRIVER_NAME,
        operation: 'send',
      });
    const lock = `${session.statePath}.send.lock`;
    try {
      await mkdir(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new DriverError('pi follow-up is already in progress', {
          driverName: DRIVER_NAME,
          operation: 'send',
          cause: error,
        });
      throw error;
    }
    const startedAt = new Date().toISOString();
    try {
      const previous = await readPiState(session.statePath);
      const sessionId = session.sessionId ?? previous?.sessionId;
      if (!previous || !TERMINAL.has(previous.status) || !sessionId)
        throw new DriverError(
          !sessionId ? 'pi session identity was not captured' : `pi job is ${previous?.status}`,
          { driverName: DRIVER_NAME, operation: 'send' },
        );
      const turnIndex = previous.turnIndex + 1;
      const transcriptPath = join(
        dirname(previous.transcriptPath),
        `${session.shortId}.turn-${turnIndex}.jsonl`,
      );
      await Promise.all([
        writeFile(transcriptPath, '', { mode: 0o600 }),
        writeFile(previous.errorPath, '', { mode: 0o600 }),
      ]);
      const next: PiRunnerState = {
        ...previous,
        status: 'starting',
        runnerPid: 0,
        piPid: undefined,
        transcriptPath,
        turnIndex,
        startedAt,
        updatedAt: startedAt,
        endedAt: undefined,
        exitCode: undefined,
        signal: undefined,
        error: undefined,
      };
      const requestPath = `${session.statePath}.request.${turnIndex}.json`;
      await spawnRunner(
        requestPath,
        session.statePath,
        {
          executable: executable(this.defaults),
          args: [...previous.resumeArgs, '--resume', sessionId, input.text],
          cwd: previous.cwd,
          state: next,
        },
        { ...process.env, ...this.defaults.env },
      );
      const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
      for (;;) {
        if (opts.signal?.aborted)
          throw new DriverError('pi follow-up wait aborted; process remains supervised', {
            driverName: DRIVER_NAME,
            operation: 'send',
          });
        const current = await readPiState(session.statePath);
        if (!current)
          throw new DriverError('pi state disappeared during follow-up', {
            driverName: DRIVER_NAME,
            operation: 'send',
          });
        // The detached runner publishes asynchronously. Do not mistake the
        // previous turn's terminal snapshot for completion of this turn.
        if (current.turnIndex < turnIndex) {
          if (Date.now() >= deadline)
            throw new DriverError('pi follow-up timed out before supervisor startup', {
              driverName: DRIVER_NAME,
              operation: 'send',
            });
          await delay(20);
          continue;
        }
        if (TERMINAL.has(current.status)) {
          const parsed = await readPiTranscript(current.transcriptPath);
          if (current.status !== 'completed') {
            const stderr = await readFile(current.errorPath, 'utf8').catch(() => '');
            throw new DriverError(current.error ?? `pi follow-up ${current.status}`, {
              driverName: DRIVER_NAME,
              operation: 'send',
              stderr,
            });
          }
          return {
            driverName: DRIVER_NAME,
            session: { ...session, sessionId },
            startedAt,
            endedAt: current.endedAt,
            status: 'completed',
            ...(parsed.finalMessage ? { finalMessage: parsed.finalMessage } : {}),
          };
        }
        if (Date.now() >= deadline)
          throw new DriverError('pi follow-up timed out; process remains supervised', {
            driverName: DRIVER_NAME,
            operation: 'send',
          });
        await delay(100);
      }
    } finally {
      await rmdir(lock).catch(() => undefined);
    }
  }
  async dispose(): Promise<void> {}
}
