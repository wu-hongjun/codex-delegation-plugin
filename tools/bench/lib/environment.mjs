/**
 * Environment record helpers for Plan 0004 benchmark harness.
 * Writes environment.txt to the output directory.
 *
 * Security: No PII, no API tokens, no orgIds, no emails.
 * If the user's HOME path appears in any captured value, it is redacted to
 * `<home redacted>` and a footer "Redactions applied: yes" is appended.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Redact the user's home directory from a string value, replacing it with
 * the literal `<home redacted>`.  Returns { value, redacted } where
 * `redacted` is true if any replacement occurred.
 *
 * @param {string} value
 * @returns {{ value: string, redacted: boolean }}
 */
function redactHome(value) {
  const home = homedir();
  if (!home || !value.includes(home)) {
    return { value, redacted: false };
  }
  // Replace all occurrences.
  const replaced = value.split(home).join('<home redacted>');
  return { value: replaced, redacted: true };
}

/**
 * Format an environment record as a multi-line key: value string.
 *
 * All values are coerced to strings. If any value contains the user's HOME
 * path it is redacted and a "Redactions applied: yes" footer is appended.
 *
 * @param {Object<string, string | number | boolean | null | undefined>} fields
 * @returns {string} Multi-line environment record (trailing newline included)
 */
export function formatEnvironment(fields) {
  let anyRedacted = false;
  const lines = [];

  for (const [key, raw] of Object.entries(fields)) {
    const str = raw == null ? 'unknown' : String(raw);
    const { value, redacted } = redactHome(str);
    if (redacted) anyRedacted = true;
    lines.push(`${key}: ${value}`);
  }

  if (anyRedacted) {
    lines.push('');
    lines.push('Redactions applied: yes');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Write an environment record to `outputDir/environment.txt`.
 *
 * @param {string} outputDir  Absolute path to the output directory (must exist).
 * @param {Object<string, string | number | boolean | null | undefined>} fields
 * @returns {void}
 */
export function writeEnvironment(outputDir, fields) {
  const content = formatEnvironment(fields);
  writeFileSync(join(outputDir, 'environment.txt'), content, 'utf8');
}
