// Tests for ptyBuildExtraProbe (plan 0002 T2).
//
// Verifies the probe's shape, its capability metadata, and that it actually exercises
// node-pty end-to-end (load + spawn + collect output + clean exit). Runs under the
// PTY-dependent lane; if node-pty failed to build, this test will fail loudly — that's
// the intended Plan 0002 contract.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ptyBuildExtraProbe } from '../dist/index.js';

describe('ptyBuildExtraProbe (plan 0002)', () => {
  it('declares the correct shape (name, capabilities, run)', () => {
    assert.equal(ptyBuildExtraProbe.name, 'pty-build');
    assert.deepEqual(ptyBuildExtraProbe.capabilities, ['followup']);
    assert.equal(typeof ptyBuildExtraProbe.run, 'function');
  });

  it('returns status: "ok" when node-pty is healthy on this Node version', async () => {
    const result = await ptyBuildExtraProbe.run({});
    assert.equal(
      result.status,
      'ok',
      `pty-build probe expected ok but got ${result.status}: ${result.detail}`,
    );
    assert.equal(result.name, 'pty-build');
    assert.match(result.detail, /PTY smoke passed/i);
  });
});
