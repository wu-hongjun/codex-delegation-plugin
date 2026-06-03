/**
 * Self-tests for tools/bench/lib/output-dir.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { defaultOutputDirName, createOutputDir } from '../lib/output-dir.mjs';

describe('defaultOutputDirName()', () => {
  it("returns 'bench-20260614-abc123' for ('20260614', 'abc123')", () => {
    assert.equal(defaultOutputDirName('20260614', 'abc123'), 'bench-20260614-abc123');
  });

  it('uses the exact date and runId provided', () => {
    assert.equal(defaultOutputDirName('20251231', 'xyz999'), 'bench-20251231-xyz999');
  });

  it('format is bench-<date>-<runId>', () => {
    const name = defaultOutputDirName('20260101', 'run42');
    assert.match(name, /^bench-\d{8}-[a-z0-9]+$/i);
  });
});

describe('createOutputDir() — absolutePath mode', () => {
  it('creates the directory at absolutePath verbatim', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    const target = join(base, 'my-output');
    try {
      const result = createOutputDir({ repoRoot: base, absolutePath: target });
      assert.ok(existsSync(target));
      assert.equal(result, target);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('returns the absolute path', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    const target = join(base, 'deep', 'nested', 'dir');
    try {
      const result = createOutputDir({ repoRoot: base, absolutePath: target });
      assert.equal(result, target);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('creates parent directories recursively', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    const target = join(base, 'level1', 'level2', 'level3');
    try {
      createOutputDir({ repoRoot: base, absolutePath: target });
      assert.ok(existsSync(target));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('createOutputDir() — date+runId mode', () => {
  it('places directory under repoRoot/artifacts/', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    try {
      const result = createOutputDir({
        repoRoot: base,
        dateYYYYMMDD: '20260614',
        runId: 'abc123',
      });
      assert.ok(result.startsWith(join(base, 'artifacts')));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('directory name matches defaultOutputDirName format', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    try {
      const result = createOutputDir({
        repoRoot: base,
        dateYYYYMMDD: '20260614',
        runId: 'abc123',
      });
      assert.ok(result.endsWith('bench-20260614-abc123'));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('directory is actually created on disk', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    try {
      const result = createOutputDir({
        repoRoot: base,
        dateYYYYMMDD: '20260101',
        runId: 'run1',
      });
      assert.ok(existsSync(result));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('returns an absolute path', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    try {
      const result = createOutputDir({
        repoRoot: base,
        dateYYYYMMDD: '20260101',
        runId: 'run1',
      });
      assert.ok(result.startsWith('/'), `expected absolute path, got: ${result}`);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('createOutputDir() — error cases', () => {
  it('throws a clear error when neither absolutePath nor date+runId are provided', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    try {
      assert.throws(
        () => createOutputDir({ repoRoot: base }),
        (err) => err instanceof Error && err.message.includes('absolutePath'),
      );
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('throws when only dateYYYYMMDD is set but runId is missing', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-od-test-'));
    try {
      assert.throws(
        () => createOutputDir({ repoRoot: base, dateYYYYMMDD: '20260614' }),
        (err) => err instanceof Error,
      );
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
