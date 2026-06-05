// Plan 0007 T3 — regression guard for the three new w22 doctor probes.
//
// These tests assert that:
//   1. The three new probes (opus-4-8-supported, workflows-supported,
//      bg-exec-supported) appear in `$claude-setup` output.
//   2. They appear in the listed order.
//   3. The existing `claude-version` probe still fires (regression guard).
//
// The tests invoke the dispatcher directly with `setup` and parse stdout.
// They do NOT mock the claude binary — they use whatever claude is on PATH.
// On a machine without claude installed, the dispatcher would still emit
// the three probes (each as `warn: unparseable version`), so the order
// assertion holds either way.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const DISPATCHER = resolve(here, '..', '..', 'scripts', 'claude-companion.mjs');

function runSetup() {
  const result = spawnSync('node', [DISPATCHER, 'setup'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return result.stdout + result.stderr;
}

describe('setup doctor — w22 version-floor probes (Plan 0007 T3)', () => {
  const output = runSetup();

  it('emits the opus-4-8-supported probe', () => {
    assert.match(output, /opus-4-8-supported/);
  });

  it('emits the workflows-supported probe', () => {
    assert.match(output, /workflows-supported/);
  });

  it('emits the bg-exec-supported probe', () => {
    assert.match(output, /bg-exec-supported/);
  });

  it('emits the three new probes in the listed order (opus → workflows → bg-exec)', () => {
    const opusIdx = output.indexOf('opus-4-8-supported');
    const workflowsIdx = output.indexOf('workflows-supported');
    const bgExecIdx = output.indexOf('bg-exec-supported');
    assert.ok(opusIdx >= 0, 'opus-4-8-supported probe must appear');
    assert.ok(workflowsIdx > opusIdx, 'workflows-supported must follow opus-4-8-supported');
    assert.ok(bgExecIdx > workflowsIdx, 'bg-exec-supported must follow workflows-supported');
  });

  it('still emits the existing claude-version probe (regression guard for R6)', () => {
    assert.match(output, /claude-version/);
  });
});
