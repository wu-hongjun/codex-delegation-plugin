/**
 * Aggregator for Plan 0004 benchmark harness.
 * Converts per-run RunResult[] into the v1 results schema (§ 3.7).
 * Pure module — no I/O.
 */

/**
 * @typedef {import('./run-result.mjs').RunResult} RunResult
 */

/**
 * @typedef {Object} AggregateMetadata
 * @property {string} runId
 * @property {string} date                YYYY-MM-DD
 * @property {string} claudeCodeVersion   e.g. "2.1.150"
 * @property {string} nodeVersion         e.g. process.version
 * @property {string} platform            process.platform
 * @property {number} runsPerCell
 * @property {string[]} tasks
 * @property {string[]} flows
 * @property {string | null} cutoverPhase 'pre' | 'post' | null
 * @property {string | null} billingBucketObservation  manual observation note
 * @property {string[]} caveats
 */

/**
 * @typedef {Object} ResultsJson
 * @property {number} schemaVersion
 * @property {string} runId
 * @property {string} date
 * @property {string} claudeCodeVersion
 * @property {string} nodeVersion
 * @property {string} platform
 * @property {number} runsPerCell
 * @property {string[]} tasks
 * @property {string[]} flows
 * @property {Array<{flow: string, task: string, runs: RunResult[]}>} cells
 * @property {{ cutoverPhase: string|null, billingBucketObservation: string|null, caveats: string[] }} metadata
 */

/**
 * Error class for aggregation validation failures.
 */
export class BenchAggregateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BenchAggregateError';
  }
}

/** Required fields on every RunResult. */
const REQUIRED_RUN_RESULT_FIELDS = [
  'flow',
  'task',
  'runIndex',
  'wallClockMs',
  'turnsWallClockMs',
  'tempoTransitions',
  'tokenCounts',
  'reviewVerdict',
  'error',
  'caveats',
];

/**
 * Validate a RunResult has all required fields present.
 * Throws BenchAggregateError if any field is missing.
 *
 * @param {unknown} run
 * @param {number} index position in input array (for error messages)
 */
function validateRunResult(run, index) {
  if (run === null || typeof run !== 'object') {
    throw new BenchAggregateError(`runs[${index}] is not an object`);
  }
  for (const field of REQUIRED_RUN_RESULT_FIELDS) {
    if (!(field in run)) {
      throw new BenchAggregateError(`runs[${index}] is missing required field "${field}"`);
    }
  }
}

/**
 * Compute quartile statistics via linear interpolation (inclusive method).
 *
 * Percentile p in [0,100] is computed as follows:
 *   h = (n - 1) * p / 100   (0-based fractional index)
 *   result = values[floor(h)] + frac(h) * (values[ceil(h)] - values[floor(h)])
 *
 * This is equivalent to numpy's `percentile` with `method='linear'` (the default).
 * For odd-length arrays, the median equals the middle element.
 * For even-length arrays, the median equals the average of the two middle elements.
 * Q1 = 25th percentile, Q3 = 75th percentile, by linear interpolation.
 *
 * @param {number[]} values — must be pre-sorted ascending
 * @param {number} p — percentile in [0, 100]
 * @returns {number}
 */
function percentile(values, p) {
  const n = values.length;
  if (n === 0) return NaN;
  if (n === 1) return values[0];
  const h = ((n - 1) * p) / 100;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const frac = h - lo;
  return values[lo] + frac * (values[hi] - values[lo]);
}

/**
 * Summarize an array of latency values.
 * Returns median, p25, p75, and the sorted raw values.
 *
 * Quartile method: linear interpolation (inclusive), same as numpy default.
 * Median for even-length arrays: average of the two middle values.
 *
 * @param {number[]} values
 * @returns {{ median: number, p25: number, p75: number, raw: number[] }}
 */
export function summarizeLatency(values) {
  if (!values || values.length === 0) {
    return { median: NaN, p25: NaN, p75: NaN, raw: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 50),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    raw: sorted,
  };
}

/**
 * Aggregate per-run RunResult[] into the v1 results schema.
 *
 * Grouping: runs are grouped by (flow, task) into cells.
 * Cell ordering: follows the cartesian product of flows × tasks as declared
 *   in metadata.flows and metadata.tasks (stable across harness invocations).
 * Zero-run cells: cells with no matching runs are OMITTED from cells[].
 *   Rationale: sparse matrices (e.g. baseline-p × non-summarize tasks) are
 *   often intentionally absent; including empty cells would inflate the output
 *   and mislead consumers that expected runs were produced.
 * Caveats deduplication: per-run caveats are preserved in runs[].caveats.
 *   All unique per-run caveats are merged with metadata.caveats and deduplicated
 *   (using insertion order) at the top-level metadata.caveats in the output.
 *
 * @param {RunResult[]} runs
 * @param {AggregateMetadata} metadata
 * @returns {ResultsJson}
 */
export function aggregate(runs, metadata) {
  // Validate all inputs before doing any work.
  if (!Array.isArray(runs)) {
    throw new BenchAggregateError('runs must be an array');
  }
  runs.forEach((run, i) => validateRunResult(run, i));

  // Build a map: `${flow}::${task}` → RunResult[]
  const cellMap = new Map();
  for (const run of runs) {
    const key = `${run.flow}::${run.task}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(run);
  }

  // Build cells in flows × tasks cartesian order; omit zero-run pairs.
  const cells = [];
  for (const flow of metadata.flows) {
    for (const task of metadata.tasks) {
      const key = `${flow}::${task}`;
      const cellRuns = cellMap.get(key);
      if (!cellRuns || cellRuns.length === 0) continue;
      // Sort by runIndex to guarantee stable ordering within cell.
      const sortedRuns = [...cellRuns].sort((a, b) => a.runIndex - b.runIndex);
      cells.push({ flow, task, runs: sortedRuns });
    }
  }

  // Collect all unique per-run caveats and merge with metadata.caveats.
  const seenCaveats = new Set(metadata.caveats);
  const mergedCaveats = [...metadata.caveats];
  for (const run of runs) {
    for (const caveat of run.caveats) {
      if (!seenCaveats.has(caveat)) {
        seenCaveats.add(caveat);
        mergedCaveats.push(caveat);
      }
    }
  }

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
    cells,
    metadata: {
      cutoverPhase: metadata.cutoverPhase,
      billingBucketObservation: metadata.billingBucketObservation,
      caveats: mergedCaveats,
    },
  };
}
