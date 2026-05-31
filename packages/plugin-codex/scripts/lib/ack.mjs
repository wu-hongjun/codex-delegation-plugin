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
