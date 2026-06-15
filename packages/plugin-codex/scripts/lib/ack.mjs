// ack.mjs — privacy acknowledgement helpers.
//
// Acks are stored per-workspace as JSON files under
// <companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCompanionHome } from '@cc-plugin-codex/runtime';

/**
 * @param {string} workspaceRoot
 * @returns {string}
 */
function workspaceHash(workspaceRoot) {
  return createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
}

/**
 * @returns {string}
 */
function acksDir() {
  return join(getCompanionHome(), 'acks');
}

/**
 * @param {string} workspaceRoot
 * @returns {boolean}
 */
export function hasAck(workspaceRoot) {
  const path = join(acksDir(), `${workspaceHash(workspaceRoot)}.json`);
  return existsSync(path);
}

/**
 * @param {string} workspaceRoot
 */
export function recordAck(workspaceRoot) {
  mkdirSync(acksDir(), { recursive: true });
  const path = join(acksDir(), `${workspaceHash(workspaceRoot)}.json`);
  writeFileSync(
    path,
    JSON.stringify({ workspaceRoot, ackedAt: new Date().toISOString() }, null, 2),
  );
}

/**
 * Resolve the non-interactive privacy-ack decision for a workspace, given user
 * flags. Caller is responsible for any interactive TTY prompt before printing
 * + exiting on the 'rejected' verdict.
 *
 * - 'satisfied' — ack already on disk; proceed.
 * - 'recorded'  — no prior ack but --yes recorded one; proceed.
 * - 'rejected'  — no prior ack and no --yes; caller must prompt or fail.
 *
 * The workspaceRoot is echoed back in the result so callers can render the
 * target workspace path in error messages without re-deriving it.
 *
 * `isTTY` is accepted for compatibility with older call sites, but TTY status
 * alone must never record an acknowledgement.
 *
 * @param {{ workspaceRoot: string; useYes: boolean; isTTY: boolean }} input
 * @returns {{ verdict: 'satisfied' | 'recorded' | 'rejected'; workspaceRoot: string }}
 */
export function resolveWorkspaceAck({ workspaceRoot, useYes, isTTY: _isTTY }) {
  if (hasAck(workspaceRoot)) {
    return { verdict: 'satisfied', workspaceRoot };
  }
  if (useYes) {
    recordAck(workspaceRoot);
    return { verdict: 'recorded', workspaceRoot };
  }
  return { verdict: 'rejected', workspaceRoot };
}
