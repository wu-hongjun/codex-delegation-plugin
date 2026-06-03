// prompt-meta.mjs — sha256, summary, bytesLen helpers for a prompt string.

import { createHash } from 'node:crypto';

/**
 * @param {string} prompt
 * @returns {{ summary: string; sha256: string; bytesLen: number }}
 */
export function makePromptMeta(prompt) {
  const summary = prompt.trim().replace(/\s+/g, ' ').slice(0, 120);
  const sha256 = createHash('sha256').update(prompt).digest('hex');
  const bytesLen = Buffer.byteLength(prompt, 'utf8');
  return { summary, sha256, bytesLen };
}
