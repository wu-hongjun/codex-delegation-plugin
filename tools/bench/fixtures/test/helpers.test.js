import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../src/lib/helpers.js';

describe('withRetry', () => {
  it('returns the result of a successful function', () => {
    const result = withRetry(() => 42, 3);
    assert.equal(result, 42);
  });

  it('retries on error and eventually succeeds', () => {
    let calls = 0;
    const result = withRetry(() => {
      calls++;
      if (calls < 3) throw new Error('not yet');
      return 'ok';
    }, 5);
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws after exhausting all attempts', () => {
    assert.throws(() => withRetry(() => { throw new Error('fail'); }, 2), /fail/);
  });
});
