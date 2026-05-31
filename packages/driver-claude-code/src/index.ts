// ClaudeBackgroundDriver — v1 implements probe(), startSession(), status(), and stop().
// watch() streaming is deliberately deferred to a later plan (PTY attach / streaming)
// and throws `DriverNotImplementedError` until then.

import type {
  DoctorOptions,
  Driver,
  DriverCapabilities,
  DriverEvent,
  SessionHandle,
  SessionStatus,
  StartSessionOpts,
  TurnHandle,
  WatchOpts,
} from '@cc-plugin-codex/runtime';
import { DriverError, DriverNotImplementedError } from '@cc-plugin-codex/runtime';

import { startSession as bgStartSession } from './background-session.js';
import { statusForSession } from './agents-json.js';
import { probeClaudeBackgroundDriver } from './probe.js';
import { stopSession } from './stop.js';
import { DRIVER_NAME } from './types.js';
import type { ClaudeBackgroundDriverOptions } from './types.js';

export { probeClaudeBackgroundDriver } from './probe.js';
export type { ClaudeBackgroundDriverOptions } from './types.js';
export { DRIVER_NAME, DRIVER_VERSION } from './types.js';
export * from './transcript.js';
export * from './logs.js';
export * from './stop.js';
export * from './pty-probe.js';

export class ClaudeBackgroundDriver implements Driver {
  private readonly defaults: ClaudeBackgroundDriverOptions;

  constructor(options: ClaudeBackgroundDriverOptions = {}) {
    this.defaults = options;
  }

  probe(): Promise<DriverCapabilities> {
    const opts: DoctorOptions = {
      cwd: this.defaults.cwd,
      env: this.defaults.env,
      timeoutMs: this.defaults.timeoutMs,
    };
    return probeClaudeBackgroundDriver(opts);
  }

  startSession(opts: StartSessionOpts): Promise<SessionHandle> {
    return bgStartSession(opts, this.defaults);
  }

  watch(_target: SessionHandle | TurnHandle, _opts?: WatchOpts): AsyncIterable<DriverEvent> {
    throw new DriverNotImplementedError('watch', 'plan 0002+ (PTY attach / streaming)');
  }

  status(session: SessionHandle): Promise<SessionStatus> {
    if (!session.shortId && !session.sessionName) {
      return Promise.reject(
        new DriverError('status requires shortId or sessionName on the handle', {
          driverName: DRIVER_NAME,
          operation: 'status',
        }),
      );
    }
    return statusForSession(session, {
      cwd: this.defaults.cwd,
      env: this.defaults.env,
      timeoutMs: this.defaults.timeoutMs ?? 10000,
    });
  }

  stop(session: SessionHandle): Promise<void> {
    return stopSession(session, {
      cwd: this.defaults.cwd,
      env: this.defaults.env,
      timeoutMs: this.defaults.timeoutMs,
    });
  }

  async dispose(): Promise<void> {
    // v1 holds no persistent resources. Future PTY attach work in plan 0002 will need a
    // real teardown here.
  }
}
