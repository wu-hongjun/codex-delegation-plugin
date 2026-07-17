// ack.mjs — privacy acknowledgement helpers.
//
// Acks are stored per-workspace and external provider as JSON files under
// <companionHome>/acks/. Claude keeps the legacy unsuffixed filename so
// existing acknowledgements remain valid; other providers use a suffix.

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
 * @param {string} provider
 * @returns {string}
 */
function ackPath(workspaceRoot, provider) {
  const normalizedProvider = String(provider || 'claude')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const suffix = normalizedProvider === 'claude' ? '' : `.${normalizedProvider}`;
  return join(acksDir(), `${workspaceHash(workspaceRoot)}${suffix}.json`);
}

/**
 * @param {string} workspaceRoot
 * @param {string} [provider]
 * @returns {boolean}
 */
export function hasAck(workspaceRoot, provider = 'claude') {
  return existsSync(ackPath(workspaceRoot, provider));
}

/**
 * @param {string} workspaceRoot
 * @param {string} [provider]
 */
export function recordAck(workspaceRoot, provider = 'claude') {
  mkdirSync(acksDir(), { recursive: true });
  const path = ackPath(workspaceRoot, provider);
  writeFileSync(
    path,
    JSON.stringify({ workspaceRoot, provider, ackedAt: new Date().toISOString() }, null, 2),
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
 * @param {{ workspaceRoot: string; useYes: boolean; isTTY: boolean; provider?: string }} input
 * @returns {{ verdict: 'satisfied' | 'recorded' | 'rejected'; workspaceRoot: string }}
 */
export function resolveWorkspaceAck({ workspaceRoot, useYes, isTTY: _isTTY, provider = 'claude' }) {
  if (hasAck(workspaceRoot, provider)) {
    return { verdict: 'satisfied', workspaceRoot };
  }
  if (useYes) {
    recordAck(workspaceRoot, provider);
    return { verdict: 'recorded', workspaceRoot };
  }
  return { verdict: 'rejected', workspaceRoot };
}
