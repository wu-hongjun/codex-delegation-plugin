/**
 * Self-tests for tools/bench/lib/summary.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { formatSummary, writeSummary } from '../lib/summary.mjs';
import { createEmptyRunResult } from '../lib/run-result.mjs';

/** Build a minimal valid ResultsJson for tests. */
function makeResults(overrides = {}) {
  const run = createEmptyRunResult({ flow: 'delegate', task: 'summarize-todos', runIndex: 0 });
  run.wallClockMs = 12345;
  run.turnsWallClockMs = [12345];

  return {
    schemaVersion: 1,
    runId: 'test-abc',
    date: '2026-06-14',
    claudeCodeVersion: '2.1.150',
    nodeVersion: 'v25.8.2',
    platform: 'darwin',
    runsPerCell: 5,
    tasks: ['summarize-todos'],
    flows: ['delegate'],
    cells: [
      { flow: 'delegate', task: 'summarize-todos', runs: [run] },
    ],
    metadata: {
      cutoverPhase: 'pre',
      billingBucketObservation: null,
      caveats: [],
    },
    ...overrides,
  };
}

/** Build results with review/adversarial cells. */
function makeResultsWithReview() {
  const makeRun = (flow, runIndex, verdict) => {
    const r = createEmptyRunResult({ flow, task: 'summarize-todos', runIndex });
    r.wallClockMs = 5000;
    r.turnsWallClockMs = [5000];
    r.reviewVerdict = verdict;
    return r;
  };

  return {
    schemaVersion: 1,
    runId: 'review-run',
    date: '2026-06-14',
    claudeCodeVersion: '2.1.150',
    nodeVersion: 'v25.8.2',
    platform: 'darwin',
    runsPerCell: 2,
    tasks: ['summarize-todos'],
    flows: ['delegate-review', 'delegate-adversarial'],
    cells: [
      {
        flow: 'delegate-review',
        task: 'summarize-todos',
        runs: [makeRun('delegate-review', 0, 'pass'), makeRun('delegate-review', 1, 'fail')],
      },
      {
        flow: 'delegate-adversarial',
        task: 'summarize-todos',
        runs: [makeRun('delegate-adversarial', 0, 'pass_with_findings')],
      },
    ],
    metadata: { cutoverPhase: null, billingBucketObservation: null, caveats: [] },
  };
}

/** Build results with tokenCounts populated. */
function makeResultsWithTokens() {
  const run = createEmptyRunResult({ flow: 'delegate', task: 'summarize-todos', runIndex: 0 });
  run.wallClockMs = 1000;
  run.turnsWallClockMs = [1000];
  run.tokenCounts = {
    inputTokens: 500,
    outputTokens: 200,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheEphemeral1hInputTokens: 0,
    cacheEphemeral5mInputTokens: 0,
    messageCount: 1,
    serviceTier: null,
  };

  return makeResults({
    cells: [{ flow: 'delegate', task: 'summarize-todos', runs: [run] }],
  });
}

// ---------------------------------------------------------------------------
// formatSummary() — structure
// ---------------------------------------------------------------------------

describe('formatSummary() — header', () => {
  it('produces a string starting with # Plan 0004 benchmark summary', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.startsWith('# Plan 0004 benchmark summary'), `got: ${out.slice(0, 60)}`);
  });

  it('summary contains runId', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('test-abc'), 'should contain runId');
  });

  it('summary contains date', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('2026-06-14'));
  });

  it('summary contains claudeCodeVersion', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('2.1.150'));
  });

  it('summary contains nodeVersion', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('v25.8.2'));
  });

  it('summary contains platform', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('darwin'));
  });

  it('summary contains runsPerCell value', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('5'));
  });
});

describe('formatSummary() — per-flow table', () => {
  it('per-flow median latency table is present with expected columns', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('Flow'));
    assert.ok(out.includes('Median latency (ms)'));
    assert.ok(out.includes('IQR (ms)'));
    assert.ok(out.includes('Successful runs'));
  });

  it('per-flow table lists the flow name', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('delegate'));
  });
});

describe('formatSummary() — per-task breakdown', () => {
  it('per-task breakdown section is present', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('Per-task breakdown') || out.includes('summarize-todos'));
  });

  it('per-task breakdown contains the task name', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('summarize-todos'));
  });
});

describe('formatSummary() — review verdict matrix', () => {
  it('verdict matrix present for results with review cells', () => {
    const out = formatSummary(makeResultsWithReview());
    assert.ok(out.includes('Review Verdict'));
  });

  it('verdict matrix absent when no review cells', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.includes('Review Verdict Agreement Matrix'));
  });
});

describe('formatSummary() — token usage', () => {
  it('token usage section present when any run has tokenCounts', () => {
    const out = formatSummary(makeResultsWithTokens());
    assert.ok(out.includes('Token Usage'));
  });

  it('token usage section absent when all tokenCounts are null', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.includes('Token Usage'));
  });
});

describe('formatSummary() — caveats', () => {
  it('caveats section is present', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('Caveats'));
  });

  it('caveats section lists metadata caveats', () => {
    const results = makeResults();
    results.metadata.caveats = ['token counts unavailable'];
    const out = formatSummary(results);
    assert.ok(out.includes('token counts unavailable'));
  });

  it('caveats section shows None when no caveats', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('None'));
  });
});

describe('formatSummary() — billing-bucket', () => {
  it('billing-bucket section shows observation text when set', () => {
    const results = makeResults();
    results.metadata.billingBucketObservation = 'Observed bucket: standard';
    const out = formatSummary(results);
    assert.ok(out.includes('Observed bucket: standard'));
  });

  it('billing-bucket section says Not observed when null', () => {
    const out = formatSummary(makeResults());
    assert.ok(out.includes('Not observed in this run'));
  });
});

// ---------------------------------------------------------------------------
// OQ4 forbidden token checks
// ---------------------------------------------------------------------------

describe('formatSummary() — OQ4 forbidden tokens', () => {
  it('does not contain "saves money"', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.toLowerCase().includes('saves money'));
  });

  it('does not contain "cheaper than"', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.toLowerCase().includes('cheaper than'));
  });

  it('does not contain "reduces cost"', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.toLowerCase().includes('reduces cost'));
  });

  it('does not contain "preserves prompt-cache savings"', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.toLowerCase().includes('preserves prompt-cache savings'));
  });

  it('does not contain "avoids the"', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.toLowerCase().includes('avoids the'));
  });

  it('does not contain "more efficient than"', () => {
    const out = formatSummary(makeResults());
    assert.ok(!out.toLowerCase().includes('more efficient than'));
  });

  it('does not match /\\d+%\\s*(faster|cheaper|less)/i', () => {
    const out = formatSummary(makeResults());
    assert.ok(!/\d+%\s*(faster|cheaper|less)/i.test(out));
  });

  it('does not match /\\d+x\\s*(faster|cheaper)/i', () => {
    const out = formatSummary(makeResults());
    assert.ok(!/\d+x\s*(faster|cheaper)/i.test(out));
  });

  it('does not match /save[sd]?\\s+\\d+/i', () => {
    const out = formatSummary(makeResults());
    assert.ok(!/save[sd]?\s+\d+/i.test(out));
  });
});

// ---------------------------------------------------------------------------
// writeSummary()
// ---------------------------------------------------------------------------

describe('writeSummary()', () => {
  it('writes summary.md at the expected path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-summary-test-'));
    try {
      writeSummary(makeResults(), dir);
      assert.ok(existsSync(join(dir, 'summary.md')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('written file contains the header line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-summary-test-'));
    try {
      writeSummary(makeResults(), dir);
      const content = readFileSync(join(dir, 'summary.md'), 'utf8');
      assert.ok(content.startsWith('# Plan 0004 benchmark summary'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates outputDir if it does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'bench-summary-test-'));
    const dir = join(base, 'new-subdir', 'nested');
    try {
      writeSummary(makeResults(), dir);
      assert.ok(existsSync(join(dir, 'summary.md')));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
