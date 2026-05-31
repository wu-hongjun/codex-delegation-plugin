// `DriverEvent` — turn-level event union surfaced by `Driver.watch()`. v1 deliberately
// has no per-token deltas and no PTY events. Token granularity is added later when /
// if a driver exposes a stable token stream.

import type { SessionStatus } from './driver.js';

export type DriverEvent =
  | {
      type: 'session.started';
      sessionId?: string;
      shortId: string;
      cwd: string;
      startedAt: string;
    }
  | {
      type: 'session.status';
      status: SessionStatus;
      at: string;
    }
  | {
      type: 'message.completed';
      role: 'assistant' | 'user';
      content: string;
      at: string;
      raw?: unknown;
    }
  | {
      type: 'tool.started';
      tool: string;
      input?: unknown;
      at: string;
      raw?: unknown;
    }
  | {
      type: 'tool.completed';
      tool: string;
      ok: boolean;
      resultPreview?: string;
      at: string;
      raw?: unknown;
    }
  | {
      type: 'file.changed';
      path: string;
      op: 'add' | 'modify' | 'delete';
      at: string;
      raw?: unknown;
    }
  | {
      type: 'usage.updated';
      cacheRead?: number;
      cacheCreate?: number;
      input?: number;
      output?: number;
      at: string;
      raw?: unknown;
    }
  | {
      type: 'session.completed';
      sessionId?: string;
      shortId: string;
      at: string;
    }
  | {
      type: 'session.stopped';
      sessionId?: string;
      shortId: string;
      reason: string;
      at: string;
    }
  | {
      type: 'error';
      message: string;
      cause?: unknown;
      at: string;
    };
