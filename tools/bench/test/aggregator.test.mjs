/**
 * Self-tests for tools/bench/lib/aggregator.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { aggregate, summarizeLatency, BenchAggregateError } from '../lib/aggregator.mjs';
import { createEmptyRunResult } from '../lib/run-result.mjs';

/** Minimal valid metadata for tests. */
function makeMetadata(overrides = {}) {
  return {
    runId: 'test-run-1',
    date: '2026-06-14',
    claudeCodeVersion: '2.1.150',
    nodeVersion: 'v25.8.2',
    platform: 'darwin',
    runsPerCell: 5,
    tasks: ['summarize-todos', 'rename-variable', 'answer-question'],
    flows: ['delegate', 'delegate-followup', 'delegate-review', 'delegate-adversarial'],
    cutoverPhase: 'pre',
    billingBucketObservation: null,
    caveats: [],
    ...overrides,
  };
}

/** Create a minimal RunResult with overrides. */
function makeRun(overrides = {}) {
  const base = createEmptyRunResult({
    flow: 'delegate',
    task: 'summarize-todos',
    runIndex: 0,
  });
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// summarizeLatency
// ---------------------------------------------------------------------------

describe('summarizeLatency()', () => {
  it('returns median=3, p25=2, p75=4 for [1,2,3,4,5]', () => {
    const stats = summarizeLatency([1, 2, 3, 4, 5]);
    assert.equal(stats.median, 3);
    assert.equal(stats.p25, 2);
    assert.equal(stats.p75, 4);
  });

  it('returns sorted raw values', () => {
    const stats = summarizeLatency([5, 1, 3]);
    assert.deepEqual(stats.raw, [1, 3, 5]);
  });

  it('empty input returns NaN for all stats and empty raw', () => {
    const stats = summarizeLatency([]);
    assert.ok(Number.isNaN(stats.median));
    assert.ok(Number.isNaN(stats.p25));
    assert.ok(Number.isNaN(stats.p75));
    assert.deepEqual(stats.raw, []);
  });

  it('null/undefined input returns NaN for all stats and empty raw', () => {
    const stats = summarizeLatency(null);
    assert.ok(Number.isNaN(stats.median));
    assert.deepEqual(stats.raw, []);
  });

  it('median for even-length array uses average of two middle values', () => {
    // [2, 4, 6, 8] → middle two are 4 and 6 → median = 5
    const stats = summarizeLatency([2, 4, 6, 8]);
    assert.equal(stats.median, 5);
  });

  it('single-element array: median = p25 = p75 = that element', () => {
    const stats = summarizeLatency([42]);
    assert.equal(stats.median, 42);
    assert.equal(stats.p25, 42);
    assert.equal(stats.p75, 42);
  });

  it('two-element array median is average', () => {
    const stats = summarizeLatency([10, 20]);
    assert.equal(stats.median, 15);
  });
});

// ---------------------------------------------------------------------------
// aggregate() — schema and basic cases
// ---------------------------------------------------------------------------

describe('aggregate() — empty runs', () => {
  it('empty runs[] returns valid schema with cells: []', () => {
    const result = aggregate([], makeMetadata());
    assert.equal(result.schemaVersion, 1);
    assert.deepEqual(result.cells, []);
  });

  it('propagates runId from metadata', () => {
    const result = aggregate([], makeMetadata({ runId: 'my-run' }));
    assert.equal(result.runId, 'my-run');
  });

  it('propagates date, claudeCodeVersion, nodeVersion, platform from metadata', () => {
    const result = aggregate([], makeMetadata());
    assert.equal(result.date, '2026-06-14');
    assert.equal(result.claudeCodeVersion, '2.1.150');
    assert.equal(result.nodeVersion, 'v25.8.2');
    assert.equal(result.platform, 'darwin');
  });

  it('propagates runsPerCell from metadata', () => {
    const result = aggregate([], makeMetadata({ runsPerCell: 3 }));
    assert.equal(result.runsPerCell, 3);
  });
});

describe('aggregate() — single run', () => {
  it('single run produces one cell with one run entry', () => {
    const run = makeRun({ wallClockMs: 12345, turnsWallClockMs: [12345] });
    const result = aggregate([run], makeMetadata());
    assert.equal(result.cells.length, 1);
    assert.equal(result.cells[0].flow, 'delegate');
    assert.equal(result.cells[0].task, 'summarize-todos');
    assert.equal(result.cells[0].runs.length, 1);
    assert.equal(result.cells[0].runs[0].wallClockMs, 12345);
  });
});

describe('aggregate() — multiple runs per cell', () => {
  it('multiple runs for the same (flow, task) all land in one cell', () => {
    const runs = [0, 1, 2].map((i) => makeRun({ runIndex: i, wallClockMs: 1000 * (i + 1) }));
    const result = aggregate(runs, makeMetadata());
    assert.equal(result.cells.length, 1);
    assert.equal(result.cells[0].runs.length, 3);
  });

  it('runs within a cell are ordered by runIndex', () => {
    const runs = [2, 0, 1].map((i) => makeRun({ runIndex: i, wallClockMs: 1000 }));
    const result = aggregate(runs, makeMetadata());
    const indices = result.cells[0].runs.map((r) => r.runIndex);
    assert.deepEqual(indices, [0, 1, 2]);
  });
});

describe('aggregate() — cell ordering', () => {
  it('cell ordering follows flows × tasks cartesian product', () => {
    const meta = makeMetadata({
      flows: ['delegate', 'delegate-followup'],
      tasks: ['summarize-todos', 'rename-variable'],
    });
    const runs = [
      makeRun({ flow: 'delegate-followup', task: 'rename-variable', runIndex: 0 }),
      makeRun({ flow: 'delegate', task: 'rename-variable', runIndex: 0 }),
      makeRun({ flow: 'delegate-followup', task: 'summarize-todos', runIndex: 0 }),
      makeRun({ flow: 'delegate', task: 'summarize-todos', runIndex: 0 }),
    ];
    const result = aggregate(runs, meta);
    const order = result.cells.map((c) => `${c.flow}::${c.task}`);
    assert.deepEqual(order, [
      'delegate::summarize-todos',
      'delegate::rename-variable',
      'delegate-followup::summarize-todos',
      'delegate-followup::rename-variable',
    ]);
  });

  it('cells with zero runs are omitted from output', () => {
    // Only provide a run for delegate::summarize-todos; the rest should be absent.
    const meta = makeMetadata({
      flows: ['delegate', 'baseline-p'],
      tasks: ['summarize-todos', 'rename-variable'],
    });
    const runs = [makeRun({ flow: 'delegate', task: 'summarize-todos', runIndex: 0 })];
    const result = aggregate(runs, meta);
    assert.equal(result.cells.length, 1);
    assert.equal(result.cells[0].flow, 'delegate');
  });
});

describe('aggregate() — caveats', () => {
  it('per-run caveats are preserved in runs[].caveats', () => {
    const run = makeRun({ caveats: ['transcript missing'] });
    const result = aggregate([run], makeMetadata());
    assert.deepEqual(result.cells[0].runs[0].caveats, ['transcript missing']);
  });

  it('per-run caveats are merged into top-level metadata.caveats (deduplicated)', () => {
    const runs = [
      makeRun({ caveats: ['caveat A'] }),
      makeRun({ runIndex: 1, caveats: ['caveat A', 'caveat B'] }),
    ];
    const result = aggregate(runs, makeMetadata({ caveats: ['existing caveat'] }));
    assert.deepEqual(result.metadata.caveats, ['existing caveat', 'caveat A', 'caveat B']);
  });

  it('metadata.caveats already present are not duplicated', () => {
    const run = makeRun({ caveats: ['existing caveat'] });
    const result = aggregate([run], makeMetadata({ caveats: ['existing caveat'] }));
    assert.equal(result.metadata.caveats.filter((c) => c === 'existing caveat').length, 1);
  });
});

describe('aggregate() — cutoverPhase values', () => {
  it('accepts cutoverPhase: pre', () => {
    const result = aggregate([], makeMetadata({ cutoverPhase: 'pre' }));
    assert.equal(result.metadata.cutoverPhase, 'pre');
  });

  it('accepts cutoverPhase: post', () => {
    const result = aggregate([], makeMetadata({ cutoverPhase: 'post' }));
    assert.equal(result.metadata.cutoverPhase, 'post');
  });

  it('accepts cutoverPhase: null', () => {
    const result = aggregate([], makeMetadata({ cutoverPhase: null }));
    assert.equal(result.metadata.cutoverPhase, null);
  });
});

describe('aggregate() — validation', () => {
  it('throws BenchAggregateError when runs is not an array', () => {
    assert.throws(
      () => aggregate(null, makeMetadata()),
      (err) => err instanceof BenchAggregateError,
    );
  });

  it('throws BenchAggregateError when a RunResult is missing a required field', () => {
    const bad = { flow: 'delegate', task: 'summarize-todos' }; // missing runIndex etc.
    assert.throws(
      () => aggregate([bad], makeMetadata()),
      (err) => err instanceof BenchAggregateError,
    );
  });

  it('BenchAggregateError has name BenchAggregateError', () => {
    assert.throws(
      () => aggregate(null, makeMetadata()),
      (err) => err.name === 'BenchAggregateError',
    );
  });
});

describe('aggregate() — JSON round-trip', () => {
  it('JSON.parse(JSON.stringify(result)) round-trips cleanly', () => {
    const run = makeRun({ wallClockMs: 999, turnsWallClockMs: [999] });
    const result = aggregate([run], makeMetadata());
    const roundTripped = JSON.parse(JSON.stringify(result));
    assert.deepEqual(roundTripped.schemaVersion, result.schemaVersion);
    assert.deepEqual(roundTripped.cells.length, result.cells.length);
    assert.deepEqual(
      roundTripped.cells[0].runs[0].wallClockMs,
      result.cells[0].runs[0].wallClockMs,
    );
  });
});
