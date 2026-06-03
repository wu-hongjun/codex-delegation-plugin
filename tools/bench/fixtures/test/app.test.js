import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processData, describe as appDescribe } from '../src/app.js';

describe('processData', () => {
  it('returns empty array for null input', () => {
    assert.deepEqual(processData(null), []);
  });

  it('tags each row with the app source name', () => {
    const result = processData([{ id: 1 }]);
    assert.equal(result[0].source, 'demo-app');
  });
});

describe('describe()', () => {
  it('returns a string containing the app name', () => {
    assert.match(appDescribe(), /demo-app/);
  });
});
