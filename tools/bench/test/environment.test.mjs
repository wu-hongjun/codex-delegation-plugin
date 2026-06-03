/**
 * Self-tests for tools/bench/lib/environment.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * No real spawns — all version probing is pure string formatting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

import { formatEnvironment, writeEnvironment } from '../lib/environment.mjs';

// ---------------------------------------------------------------------------
// formatEnvironment()
// ---------------------------------------------------------------------------

describe('formatEnvironment()', () => {
  it('includes every key passed in the output', () => {
    const out = formatEnvironment({ date: '2026-06-03', platform: 'darwin' });
    assert.ok(out.includes('date: 2026-06-03'), 'should include date');
    assert.ok(out.includes('platform: darwin'), 'should include platform');
  });

  it('renders null/undefined values as "unknown"', () => {
    const out = formatEnvironment({ codexVersion: null, claudeVersion: undefined });
    assert.ok(out.includes('codexVersion: unknown'));
    assert.ok(out.includes('claudeVersion: unknown'));
  });

  it('renders boolean and number values as strings', () => {
    const out = formatEnvironment({ includeBaselineP: false, runsPerCell: 5 });
    assert.ok(out.includes('includeBaselineP: false'));
    assert.ok(out.includes('runsPerCell: 5'));
  });

  it('does NOT append "Redactions applied" when no HOME path present', () => {
    const out = formatEnvironment({ platform: 'linux', nodeVersion: 'v22.0.0' });
    assert.ok(!out.includes('Redactions applied'));
  });

  it('appends "Redactions applied: yes" when HOME appears in a value', () => {
    const home = homedir();
    const out = formatEnvironment({ claudeVersion: `${home}/bin/claude 2.1.0` });
    assert.ok(out.includes('Redactions applied: yes'));
  });

  it('replaces HOME path in value with <home redacted>', () => {
    const home = homedir();
    const out = formatEnvironment({ claudeVersion: `${home}/bin/claude 2.1.0` });
    assert.ok(!out.includes(home), 'raw HOME path should not appear');
    assert.ok(out.includes('<home redacted>'), 'redaction placeholder should appear');
  });

  it('output ends with a trailing newline', () => {
    const out = formatEnvironment({ x: 'y' });
    assert.ok(out.endsWith('\n'));
  });

  it('handles empty fields object without throwing', () => {
    assert.doesNotThrow(() => formatEnvironment({}));
  });
});

// ---------------------------------------------------------------------------
// writeEnvironment()
// ---------------------------------------------------------------------------

describe('writeEnvironment()', () => {
  it('writes environment.txt to the specified outputDir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-test-'));
    try {
      writeEnvironment(dir, { platform: 'linux', runsPerCell: 3 });
      const content = readFileSync(join(dir, 'environment.txt'), 'utf8');
      assert.ok(content.includes('platform: linux'));
      assert.ok(content.includes('runsPerCell: 3'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('written file contains "unknown" for null values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-test-'));
    try {
      writeEnvironment(dir, { codexVersion: null });
      const content = readFileSync(join(dir, 'environment.txt'), 'utf8');
      assert.ok(content.includes('codexVersion: unknown'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
