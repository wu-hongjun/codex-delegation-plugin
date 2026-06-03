/**
 * Self-tests for the benchmark harness CLI skeleton.
 * Uses node:test + node:child_process#spawnSync only.
 * No third-party dependencies. No real Claude invocations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN_MJS = resolve(fileURLToPath(import.meta.url), '..', '..', 'run.mjs');

/**
 * Run run.mjs with the given args and return the spawnSync result.
 * @param {string[]} args
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function run(args) {
  return spawnSync('node', [RUN_MJS, ...args], { encoding: 'utf8' });
}

describe('bench CLI — --help', () => {
  it('exits 0 and stdout contains key flag strings', () => {
    const r = run(['--help']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    assert.ok(r.stdout.includes('--dry-run'), `missing --dry-run in help: ${r.stdout}`);
    assert.ok(
      r.stdout.includes('--include-baseline-p'),
      `missing --include-baseline-p in help: ${r.stdout}`,
    );
    assert.ok(r.stdout.includes('--cutover-phase'), `missing --cutover-phase in help: ${r.stdout}`);
    assert.ok(r.stdout.includes('--flows'), `missing --flows in help: ${r.stdout}`);
    assert.ok(r.stdout.includes('--tasks'), `missing --tasks in help: ${r.stdout}`);
    assert.ok(r.stdout.includes('--runs'), `missing --runs in help: ${r.stdout}`);
    assert.ok(r.stdout.includes('--output-dir'), `missing --output-dir in help: ${r.stdout}`);
  });
});

describe('bench CLI — --dry-run (default: all flows × all tasks)', () => {
  it('exits 0 and stdout has at least 12 cell rows (4 flows × 3 tasks)', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    // Count lines matching the cell pattern "  <flow> / <task> / N=..."
    const cellLines = r.stdout.split('\n').filter((l) => /^\s+\S.*\/.*\/.*N=/.test(l));
    assert.ok(
      cellLines.length >= 12,
      `expected >= 12 cell rows, got ${cellLines.length}:\n${r.stdout}`,
    );
  });

  it('prints "Plan 0004 benchmark harness — dry run" header', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0);
    assert.ok(
      r.stdout.includes('Plan 0004 benchmark harness — dry run'),
      `missing header: ${r.stdout.slice(0, 200)}`,
    );
  });

  it('prints Run ID, Output dir, Cutover phase, Total cells lines', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Run ID:'), `missing Run ID: ${r.stdout}`);
    assert.ok(r.stdout.includes('Output dir:'), `missing Output dir: ${r.stdout}`);
    assert.ok(r.stdout.includes('Cutover phase:'), `missing Cutover phase: ${r.stdout}`);
    assert.ok(r.stdout.includes('Total cells:'), `missing Total cells: ${r.stdout}`);
  });

  it('total cells is 12 with default N=5 (4 plugin flows × 3 tasks)', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0);
    const m = r.stdout.match(/Total cells:\s*(\d+)/);
    assert.ok(m, `could not find "Total cells:" in stdout: ${r.stdout}`);
    assert.equal(Number(m[1]), 12, `expected 12 total cells, got ${m[1]}`);
  });

  it('total invocations is 60 with default N=5', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0);
    const m = r.stdout.match(/\((\d+)\s+invocations\)/);
    assert.ok(m, `could not find invocations count in stdout: ${r.stdout}`);
    assert.equal(Number(m[1]), 60, `expected 60 invocations, got ${m[1]}`);
  });
});

describe('bench CLI — --dry-run with filters', () => {
  it('--dry-run --flows delegate --tasks summarize-todos --runs 3 prints exactly 3 cells', () => {
    const r = run([
      '--dry-run',
      '--flows',
      'delegate',
      '--tasks',
      'summarize-todos',
      '--runs',
      '3',
    ]);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    const cellLines = r.stdout.split('\n').filter((l) => /^\s+\S.*\/.*\/.*N=/.test(l));
    assert.equal(cellLines.length, 1, `expected 1 cell row, got ${cellLines.length}:\n${r.stdout}`);
    // The single row should have N=3
    assert.ok(cellLines[0].includes('N=3'), `expected N=3 in cell row: ${cellLines[0]}`);
    // Total cells: 1, invocations: 3
    const mCells = r.stdout.match(/Total cells:\s*(\d+)/);
    assert.ok(mCells, 'missing Total cells line');
    assert.equal(Number(mCells[1]), 1);
    const mInv = r.stdout.match(/\((\d+)\s+invocations\)/);
    assert.ok(mInv, 'missing invocations count');
    assert.equal(Number(mInv[1]), 3);
  });

  it('--dry-run --flows delegate,delegate-followup produces 6 cells (2 flows × 3 tasks)', () => {
    const r = run(['--dry-run', '--flows', 'delegate,delegate-followup']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    const cellLines = r.stdout.split('\n').filter((l) => /^\s+\S.*\/.*\/.*N=/.test(l));
    assert.equal(
      cellLines.length,
      6,
      `expected 6 cell rows, got ${cellLines.length}:\n${r.stdout}`,
    );
  });
});

describe('bench CLI — --include-baseline-p', () => {
  it('--dry-run --include-baseline-p includes the baseline-p flow in output', () => {
    const r = run(['--dry-run', '--include-baseline-p']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    assert.ok(
      r.stdout.includes('baseline-p'),
      `expected "baseline-p" in dry-run output: ${r.stdout}`,
    );
  });

  it('baseline-p only appears for summarize-todos task (OQ-A: 1 task × 5 runs = 5 invocations)', () => {
    const r = run(['--dry-run', '--include-baseline-p', '--flows', 'baseline-p']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    const cellLines = r.stdout.split('\n').filter((l) => /^\s+\S.*\/.*\/.*N=/.test(l));
    assert.equal(
      cellLines.length,
      1,
      `expected exactly 1 cell row for baseline-p, got ${cellLines.length}:\n${r.stdout}`,
    );
    assert.ok(
      cellLines[0].includes('summarize-todos'),
      `expected summarize-todos in baseline-p row: ${cellLines[0]}`,
    );
    const mInv = r.stdout.match(/\((\d+)\s+invocations\)/);
    assert.ok(mInv, 'missing invocations count');
    assert.equal(Number(mInv[1]), 5, `expected 5 invocations for baseline-p, got ${mInv[1]}`);
  });

  it('baseline-p is NOT included without --include-baseline-p', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0);
    assert.ok(
      !r.stdout.includes('baseline-p'),
      `baseline-p must not appear without --include-baseline-p: ${r.stdout}`,
    );
  });
});

describe('bench CLI — error handling', () => {
  it('--dry-run --flows unknown-flow exits non-zero with a clear error', () => {
    const r = run(['--dry-run', '--flows', 'unknown-flow']);
    assert.notEqual(r.status, 0, `expected non-zero exit, got 0; stdout=${r.stdout}`);
    assert.ok(
      r.stderr.includes('unknown-flow') || r.stderr.toLowerCase().includes('unknown'),
      `expected error about unknown flow in stderr: ${r.stderr}`,
    );
  });

  it('--dry-run --tasks unknown-task exits non-zero with a clear error', () => {
    const r = run(['--dry-run', '--tasks', 'unknown-task']);
    assert.notEqual(r.status, 0, `expected non-zero exit, got 0; stdout=${r.stdout}`);
    assert.ok(
      r.stderr.includes('unknown-task') || r.stderr.toLowerCase().includes('unknown'),
      `expected error about unknown task in stderr: ${r.stderr}`,
    );
  });

  it('--runs 0 exits non-zero with a clear error', () => {
    const r = run(['--dry-run', '--runs', '0']);
    assert.notEqual(r.status, 0, `expected non-zero exit, got 0; stdout=${r.stdout}`);
    assert.ok(
      r.stderr.toLowerCase().includes('runs') || r.stderr.toLowerCase().includes('positive'),
      `expected error about --runs in stderr: ${r.stderr}`,
    );
  });

  it('--cutover-phase invalid exits non-zero with a clear error', () => {
    const r = run(['--dry-run', '--cutover-phase', 'invalid']);
    assert.notEqual(r.status, 0, `expected non-zero exit, got 0; stdout=${r.stdout}`);
    assert.ok(
      r.stderr.includes('invalid') || r.stderr.toLowerCase().includes('cutover'),
      `expected error about --cutover-phase in stderr: ${r.stderr}`,
    );
  });

  it('--runs -1 exits non-zero', () => {
    const r = run(['--dry-run', '--runs', '-1']);
    assert.notEqual(r.status, 0, `expected non-zero exit for --runs -1`);
  });

  it('--runs abc exits non-zero', () => {
    const r = run(['--dry-run', '--runs', 'abc']);
    assert.notEqual(r.status, 0, `expected non-zero exit for --runs abc`);
  });
});

describe('bench CLI — --cutover-phase label', () => {
  it('--dry-run --cutover-phase pre prints "pre" in output', () => {
    const r = run(['--dry-run', '--cutover-phase', 'pre']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    assert.ok(r.stdout.includes('pre'), `expected "pre" in dry-run output: ${r.stdout}`);
  });

  it('--dry-run --cutover-phase post prints "post" in output', () => {
    const r = run(['--dry-run', '--cutover-phase', 'post']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    assert.ok(r.stdout.includes('post'), `expected "post" in dry-run output: ${r.stdout}`);
  });

  it('without --cutover-phase, output contains "(unspecified)"', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0);
    assert.ok(
      r.stdout.includes('(unspecified)'),
      `expected "(unspecified)" when no cutover-phase set: ${r.stdout}`,
    );
  });
});

// (T10) Removed obsolete pre-T10 test "bench CLI — no-op without --dry-run".
// Pre-T10, run.mjs without --dry-run printed "Live execution not yet implemented"
// and exited 1. Post-T10, run.mjs without --dry-run invokes the live execution
// loop against real Claude. Live behavior is covered by live-runner.test.mjs
// via DI (no real Claude invocations).
