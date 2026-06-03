/**
 * Self-tests for tools/bench/lib/live-runner.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * No real Claude/Codex invocations — all runners and I/O are injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runLive } from '../lib/live-runner.mjs';
import { createEmptyRunResult } from '../lib/run-result.mjs';

// ---------------------------------------------------------------------------
// DI helpers
// ---------------------------------------------------------------------------

/** Returns a deterministic fake fixture. cleanup is a spy. */
function makeFakeFixture(root) {
  let cleanupCalled = 0;
  const cleanup = () => {
    cleanupCalled++;
  };
  return {
    fixture: { root, cleanup },
    cleanupCallCount: () => cleanupCalled,
  };
}

/** Build a synthetic RunResult for a given flow/task/runIndex. */
function syntheticResult(flow, task, runIndex, wallClockMs = 100) {
  const r = createEmptyRunResult({ flow, task, runIndex });
  r.wallClockMs = wallClockMs;
  r.turnsWallClockMs = [wallClockMs];
  return r;
}

/** A stub aggregateFn that returns a minimal ResultsJson-shaped object. */
function stubAggregate(runs, metadata) {
  return {
    schemaVersion: 1,
    runId: metadata.runId,
    date: metadata.date,
    claudeCodeVersion: metadata.claudeCodeVersion,
    nodeVersion: metadata.nodeVersion,
    platform: metadata.platform,
    runsPerCell: metadata.runsPerCell,
    tasks: metadata.tasks,
    flows: metadata.flows,
    cells: [],
    metadata: {
      cutoverPhase: metadata.cutoverPhase,
      billingBucketObservation: null,
      caveats: [],
    },
    _runs: runs, // carry runs for assertion convenience
    _metadata: metadata,
  };
}

/** No-op writeSummaryFn. */
function noopWriteSummary() {}

/** Builds a minimal options object with full DI. */
function makeOpts(overrides = {}) {
  const outputDir = mkdtempSync(join(tmpdir(), 'live-runner-test-'));

  const flows = [{ id: 'delegate', label: 'delegate' }];
  const tasks = [{ id: 'summarize-todos', prompt: 'p1' }];

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'fake-fixture-'));
  const fixtureSpies = [];

  const createFixtureFn = async () => {
    const spy = makeFakeFixture(fixtureRoot);
    fixtureSpies.push(spy);
    return spy.fixture;
  };

  const runnerCalls = [];
  const fakeRunner = async (task, root, env) => {
    runnerCalls.push({ task: task.id, root });
    return syntheticResult('delegate', task.id, 0);
  };

  const writtenFiles = {};
  const writeFile = (path, content) => {
    writtenFiles[path] = content;
  };

  const mkdirCalls = [];
  const mkdirSyncFn = (path, opts) => {
    mkdirCalls.push(path);
  };

  const progressLines = [];
  const progress = (line) => {
    progressLines.push(line);
  };

  // Fake spawnFn that always returns 'unknown' for version probes.
  const spawnFn = (_bin, _args, _opts) => ({ status: 1, stdout: '', stderr: '' });

  const aggregateCalls = [];
  const aggregateFn = (runs, metadata) => {
    aggregateCalls.push({ runs: [...runs], metadata: { ...metadata } });
    return stubAggregate(runs, metadata);
  };

  const writeSummaryCalls = [];
  const writeSummaryFn = (results, dir) => {
    writeSummaryCalls.push({ results, dir });
  };

  return {
    opts: {
      flows,
      tasks,
      runs: 2,
      outputDir,
      cutoverPhase: 'pre',
      runId: 'testrun1',
      dateYYYYMMDD: '20260603',
      includeBaselineP: false,
      env: {},
      createFixtureFn,
      runnerOverrides: { delegate: fakeRunner },
      aggregateFn,
      writeSummaryFn,
      writeFile,
      mkdirSync: mkdirSyncFn,
      progress,
      spawnFn,
      ...overrides,
    },
    outputDir,
    fixtureSpies,
    runnerCalls,
    writtenFiles,
    mkdirCalls,
    progressLines,
    aggregateCalls,
    writeSummaryCalls,
    cleanup: () => {
      try {
        rmSync(outputDir, { recursive: true, force: true });
      } catch {}
      try {
        rmSync(fixtureRoot, { recursive: true, force: true });
      } catch {}
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runLive()', () => {
  it('calls mkdirSync for the outputDir', async () => {
    const { opts, mkdirCalls, cleanup } = makeOpts();
    try {
      await runLive(opts);
      assert.ok(mkdirCalls.includes(opts.outputDir), "outputDir should have been mkdir'd");
    } finally {
      cleanup();
    }
  });

  it('invokes runner flows×tasks×runs times (1 flow × 1 task × 2 runs = 2)', async () => {
    const { opts, runnerCalls, cleanup } = makeOpts();
    try {
      await runLive(opts);
      assert.equal(runnerCalls.length, 2);
    } finally {
      cleanup();
    }
  });

  it('sets runIndex correctly on each result (0, 1, ...)', async () => {
    const { opts, cleanup } = makeOpts();
    try {
      const { runs } = await runLive(opts);
      assert.equal(runs[0].runIndex, 0);
      assert.equal(runs[1].runIndex, 1);
    } finally {
      cleanup();
    }
  });

  it('patches runIndex even when runner returns wrong runIndex', async () => {
    const { opts, cleanup } = makeOpts({
      runnerOverrides: {
        delegate: async (task) => syntheticResult('delegate', task.id, 99),
      },
    });
    try {
      const { runs } = await runLive(opts);
      assert.equal(runs[0].runIndex, 0, 'first run should be patched to 0');
      assert.equal(runs[1].runIndex, 1, 'second run should be patched to 1');
    } finally {
      cleanup();
    }
  });

  it('cleanup() called for every fixture (including when runner throws)', async () => {
    let cleanupCount = 0;
    const outputDir = mkdtempSync(join(tmpdir(), 'live-runner-test-'));
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'fake-fixture-'));
    try {
      const opts = {
        flows: [{ id: 'delegate' }],
        tasks: [{ id: 'summarize-todos', prompt: 'p' }],
        runs: 3,
        outputDir,
        cutoverPhase: null,
        runId: 'r1',
        dateYYYYMMDD: '20260603',
        includeBaselineP: false,
        env: {},
        createFixtureFn: async () => ({
          root: fixtureRoot,
          cleanup: () => {
            cleanupCount++;
          },
        }),
        runnerOverrides: {
          delegate: async () => {
            throw new Error('boom');
          },
        },
        aggregateFn: stubAggregate,
        writeSummaryFn: noopWriteSummary,
        writeFile: () => {},
        mkdirSync: () => {},
        spawnFn: () => ({ status: 1, stdout: '' }),
      };
      await runLive(opts);
      assert.equal(cleanupCount, 3, 'cleanup should be called 3 times (once per run)');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('runner throw → result has error populated, loop continues', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'live-runner-test-'));
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'fake-fixture-'));
    try {
      let callCount = 0;
      const opts = {
        flows: [{ id: 'delegate' }],
        tasks: [{ id: 'summarize-todos', prompt: 'p' }],
        runs: 3,
        outputDir,
        cutoverPhase: null,
        runId: 'r1',
        dateYYYYMMDD: '20260603',
        includeBaselineP: false,
        env: {},
        createFixtureFn: async () => ({ root: fixtureRoot, cleanup: () => {} }),
        runnerOverrides: {
          delegate: async (task) => {
            callCount++;
            if (callCount === 2) throw new Error('mid-run failure');
            return syntheticResult('delegate', task.id, 0);
          },
        },
        aggregateFn: stubAggregate,
        writeSummaryFn: noopWriteSummary,
        writeFile: () => {},
        mkdirSync: () => {},
        spawnFn: () => ({ status: 1, stdout: '' }),
      };
      const { runs } = await runLive(opts);
      assert.equal(runs.length, 3, 'all 3 runs should be present');
      assert.equal(runs[1].error, 'runner threw: mid-run failure');
      assert.ok(runs[0].error === null, 'first run should succeed');
      assert.ok(runs[2].error === null, 'third run should succeed');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('passes assembled runs array to aggregateFn', async () => {
    const { opts, aggregateCalls, cleanup } = makeOpts();
    try {
      await runLive(opts);
      assert.equal(aggregateCalls.length, 1);
      assert.equal(aggregateCalls[0].runs.length, 2);
    } finally {
      cleanup();
    }
  });

  it('calls writeSummaryFn with (results, outputDir)', async () => {
    const { opts, writeSummaryCalls, cleanup } = makeOpts();
    try {
      await runLive(opts);
      assert.equal(writeSummaryCalls.length, 1);
      assert.equal(writeSummaryCalls[0].dir, opts.outputDir);
    } finally {
      cleanup();
    }
  });

  it('writes results.json', async () => {
    const { opts, writtenFiles, cleanup } = makeOpts();
    try {
      await runLive(opts);
      const key = join(opts.outputDir, 'results.json');
      assert.ok(key in writtenFiles, 'results.json should be written');
      const parsed = JSON.parse(writtenFiles[key]);
      assert.ok('schemaVersion' in parsed);
    } finally {
      cleanup();
    }
  });

  it('writes environment.txt', async () => {
    const { opts, writtenFiles, cleanup } = makeOpts();
    try {
      await runLive(opts);
      const key = join(opts.outputDir, 'environment.txt');
      assert.ok(key in writtenFiles, 'environment.txt should be written');
      assert.ok(writtenFiles[key].includes('platform:'));
    } finally {
      cleanup();
    }
  });

  it('writes run.txt with header and progress lines', async () => {
    const { opts, writtenFiles, cleanup } = makeOpts();
    try {
      await runLive(opts);
      const key = join(opts.outputDir, 'run.txt');
      assert.ok(key in writtenFiles, 'run.txt should be written');
      assert.ok(writtenFiles[key].includes('Plan 0004 benchmark run log'));
      assert.ok(writtenFiles[key].includes('Run ID: testrun1'));
    } finally {
      cleanup();
    }
  });

  it('baseline-p flow only runs task summarize-todos', async () => {
    const runnerCalls = [];
    const outputDir = mkdtempSync(join(tmpdir(), 'live-runner-test-'));
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'fake-fixture-'));
    try {
      const opts = {
        flows: [{ id: 'baseline-p' }],
        tasks: [
          { id: 'summarize-todos', prompt: 'p1' },
          { id: 'rename-variable', prompt: 'p2' },
          { id: 'answer-question', prompt: 'p3' },
        ],
        runs: 1,
        outputDir,
        cutoverPhase: null,
        runId: 'r2',
        dateYYYYMMDD: '20260603',
        includeBaselineP: true,
        env: {},
        createFixtureFn: async () => ({ root: fixtureRoot, cleanup: () => {} }),
        runnerOverrides: {
          'baseline-p': async (task) => {
            runnerCalls.push(task.id);
            return syntheticResult('baseline-p', task.id, 0);
          },
        },
        aggregateFn: stubAggregate,
        writeSummaryFn: noopWriteSummary,
        writeFile: () => {},
        mkdirSync: () => {},
        spawnFn: () => ({ status: 1, stdout: '' }),
      };
      await runLive(opts);
      assert.deepEqual(
        runnerCalls,
        ['summarize-todos'],
        'baseline-p should only run summarize-todos',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('non-baseline-p flow runs every selected task', async () => {
    const runnerCalls = [];
    const outputDir = mkdtempSync(join(tmpdir(), 'live-runner-test-'));
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'fake-fixture-'));
    try {
      const opts = {
        flows: [{ id: 'delegate' }],
        tasks: [
          { id: 'summarize-todos', prompt: 'p1' },
          { id: 'rename-variable', prompt: 'p2' },
        ],
        runs: 1,
        outputDir,
        cutoverPhase: null,
        runId: 'r3',
        dateYYYYMMDD: '20260603',
        includeBaselineP: false,
        env: {},
        createFixtureFn: async () => ({ root: fixtureRoot, cleanup: () => {} }),
        runnerOverrides: {
          delegate: async (task) => {
            runnerCalls.push(task.id);
            return syntheticResult('delegate', task.id, 0);
          },
        },
        aggregateFn: stubAggregate,
        writeSummaryFn: noopWriteSummary,
        writeFile: () => {},
        mkdirSync: () => {},
        spawnFn: () => ({ status: 1, stdout: '' }),
      };
      await runLive(opts);
      assert.deepEqual(runnerCalls, ['summarize-todos', 'rename-variable']);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('returns { results, outputDir, runs } shape', async () => {
    const { opts, cleanup } = makeOpts();
    try {
      const ret = await runLive(opts);
      assert.ok('results' in ret);
      assert.ok('outputDir' in ret);
      assert.ok('runs' in ret);
      assert.equal(ret.outputDir, opts.outputDir);
    } finally {
      cleanup();
    }
  });

  it('progress callback receives one line per run with flow/task/runIndex info', async () => {
    const { opts, progressLines, cleanup } = makeOpts();
    try {
      await runLive(opts);
      // 2 runs → 2 progress lines
      assert.equal(progressLines.length, 2);
      assert.ok(progressLines[0].includes('delegate'));
      assert.ok(progressLines[0].includes('summarize-todos'));
      assert.ok(progressLines[0].includes('run 1/2'));
      assert.ok(progressLines[1].includes('run 2/2'));
    } finally {
      cleanup();
    }
  });
});
