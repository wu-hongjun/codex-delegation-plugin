/**
 * Self-tests for tools/bench/lib/run-result.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyRunResult, markError } from '../lib/run-result.mjs';

describe('createEmptyRunResult()', () => {
  it('returns an object with the supplied flow/task/runIndex', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 'summarize-todos', runIndex: 0 });
    assert.equal(r.flow, 'delegate');
    assert.equal(r.task, 'summarize-todos');
    assert.equal(r.runIndex, 0);
  });

  it('wallClockMs defaults to 0', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.equal(r.wallClockMs, 0);
  });

  it('turnsWallClockMs defaults to empty array', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.deepEqual(r.turnsWallClockMs, []);
  });

  it('caveats defaults to empty array', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.deepEqual(r.caveats, []);
  });

  it('error defaults to null', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.equal(r.error, null);
  });

  it('tokenCounts defaults to null', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.equal(r.tokenCounts, null);
  });

  it('reviewVerdict and findingsCount default to null', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.equal(r.reviewVerdict, null);
    assert.equal(r.findingsCount, null);
  });

  it('tempoTransitions defaults to null', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    assert.equal(r.tempoTransitions, null);
  });
});

describe('markError()', () => {
  it('sets the error field on the result', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    markError(r, 'timeout');
    assert.equal(r.error, 'timeout');
  });

  it('returns the same result object (for chaining)', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    const returned = markError(r, 'spawn_error');
    assert.equal(returned, r);
  });

  it('preserves wallClockMs when marking error', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    r.wallClockMs = 1234;
    markError(r, 'timeout');
    assert.equal(r.wallClockMs, 1234);
  });

  it('preserves other fields when marking error', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 2 });
    r.turnsWallClockMs = [500];
    r.caveats = ['some caveat'];
    markError(r, 'delegate_failed');
    assert.equal(r.runIndex, 2);
    assert.deepEqual(r.turnsWallClockMs, [500]);
    assert.deepEqual(r.caveats, ['some caveat']);
  });

  it('overwrites a prior error value', () => {
    const r = createEmptyRunResult({ flow: 'delegate', task: 't', runIndex: 0 });
    markError(r, 'first_error');
    markError(r, 'second_error');
    assert.equal(r.error, 'second_error');
  });
});
