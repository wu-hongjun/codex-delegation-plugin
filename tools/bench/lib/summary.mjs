/**
 * Summary generator for Plan 0004 benchmark harness.
 * Produces a human-readable summary.md from ResultsJson.
 *
 * I/O boundary: formatSummary() is pure; writeSummary() performs disk writes.
 *
 * OQ4 discipline: output must NOT contain comparative cost/perf claims.
 * Forbidden tokens: 'saves money', 'cheaper than', 'reduces cost',
 * 'preserves prompt-cache savings', 'avoids the', 'more efficient than',
 * and patterns /\d+%\s*(faster|cheaper|less)/i, /\d+x\s*(faster|cheaper)/i,
 * /save[sd]?\s+\d+/i.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { summarizeLatency } from './aggregator.mjs';

/**
 * @typedef {import('./aggregator.mjs').ResultsJson} ResultsJson
 */

/**
 * Round a number to the nearest integer, returning 'N/A' for NaN/non-finite.
 * @param {number} n
 * @returns {string}
 */
function fmtMs(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'N/A';
  return String(Math.round(n));
}

/**
 * Build the per-flow median latency table.
 * Columns: Flow | Tasks | Median latency (ms) | IQR (ms) | Successful runs
 *
 * @param {ResultsJson} results
 * @returns {string}
 */
function buildFlowTable(results) {
  const lines = [];
  lines.push('| Flow | Tasks | Median latency (ms) | IQR (ms) | Successful runs |');
  lines.push('|---|---|---|---|---|');

  // Group cells by flow.
  const flowGroups = new Map();
  for (const cell of results.cells) {
    if (!flowGroups.has(cell.flow)) flowGroups.set(cell.flow, []);
    flowGroups.get(cell.flow).push(cell);
  }

  for (const flow of results.flows) {
    const cells = flowGroups.get(flow) || [];
    if (cells.length === 0) continue;

    const allRuns = cells.flatMap((c) => c.runs);
    const latencies = allRuns.map((r) => r.wallClockMs);
    const stats = summarizeLatency(latencies);
    const successCount = allRuns.filter((r) => r.error === null).length;
    const totalCount = allRuns.length;
    const taskCount = new Set(cells.map((c) => c.task)).size;
    const iqr = `${fmtMs(stats.p25)}-${fmtMs(stats.p75)}`;

    lines.push(
      `| ${flow} | ${taskCount} | ${fmtMs(stats.median)} | ${iqr} | ${successCount}/${totalCount} |`,
    );
  }

  return lines.join('\n');
}

/**
 * Build per-task breakdown tables.
 * One table per task, columns: Flow | Median latency (ms) | Errors
 *
 * @param {ResultsJson} results
 * @returns {string}
 */
function buildTaskBreakdown(results) {
  const sections = [];

  for (const task of results.tasks) {
    const taskCells = results.cells.filter((c) => c.task === task);
    if (taskCells.length === 0) continue;

    const lines = [];
    lines.push(`### Task: ${task}`);
    lines.push('');
    lines.push('| Flow | Median latency (ms) | Errors |');
    lines.push('|---|---|---|');

    for (const cell of taskCells) {
      const latencies = cell.runs.map((r) => r.wallClockMs);
      const stats = summarizeLatency(latencies);
      const errors = cell.runs.filter((r) => r.error !== null).map((r) => r.error);
      const errorStr = errors.length === 0 ? '0' : `${errors.length} (${[...new Set(errors)].join(', ')})`;
      lines.push(`| ${cell.flow} | ${fmtMs(stats.median)} | ${errorStr} |`);
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Build the review verdict agreement matrix.
 * Only included when delegate-review or delegate-adversarial cells are present.
 *
 * Rows: tasks; Columns: flows with verdicts; Values: verdict counts.
 *
 * @param {ResultsJson} results
 * @returns {string | null}
 */
function buildVerdictMatrix(results) {
  const reviewFlows = ['delegate-review', 'delegate-adversarial'];
  const reviewCells = results.cells.filter((c) => reviewFlows.includes(c.flow));
  if (reviewCells.length === 0) return null;

  // Collect all verdict values seen.
  const verdicts = new Set();
  for (const cell of reviewCells) {
    for (const run of cell.runs) {
      if (run.reviewVerdict !== null) verdicts.add(run.reviewVerdict);
    }
  }
  if (verdicts.size === 0) return null;

  const verdictList = [...verdicts].sort();
  const lines = [];
  lines.push('## Review Verdict Agreement Matrix');
  lines.push('');

  // Header: Task | <flow1> pass | <flow1> fail | ... per verdict per flow
  const headerCols = ['Task'];
  for (const flow of reviewFlows) {
    if (!reviewCells.find((c) => c.flow === flow)) continue;
    for (const v of verdictList) {
      headerCols.push(`${flow}: ${v}`);
    }
  }
  lines.push(`| ${headerCols.join(' | ')} |`);
  lines.push(`| ${headerCols.map(() => '---').join(' | ')} |`);

  for (const task of results.tasks) {
    const row = [task];
    for (const flow of reviewFlows) {
      const cell = reviewCells.find((c) => c.flow === flow && c.task === task);
      if (!cell) {
        // Flow not present for this task — fill with N/A.
        for (const _v of verdictList) row.push('N/A');
        continue;
      }
      // Only count cells that are actually present for this flow.
      if (!reviewCells.find((c) => c.flow === flow)) continue;
      for (const v of verdictList) {
        const count = cell.runs.filter((r) => r.reviewVerdict === v).length;
        row.push(String(count));
      }
    }
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * Build the token usage summary section.
 * Included only when at least one run has tokenCounts != null.
 *
 * @param {ResultsJson} results
 * @returns {string | null}
 */
function buildTokenSection(results) {
  const allRuns = results.cells.flatMap((c) => c.runs);
  const runsWithTokens = allRuns.filter((r) => r.tokenCounts !== null);
  if (runsWithTokens.length === 0) return null;

  const lines = [];
  lines.push('## Token Usage Summary');
  lines.push('');
  lines.push('| Flow | Total input tokens | Total output tokens | Runs with data |');
  lines.push('|---|---|---|---|');

  const flowGroups = new Map();
  for (const cell of results.cells) {
    if (!flowGroups.has(cell.flow)) flowGroups.set(cell.flow, []);
    flowGroups.get(cell.flow).push(cell);
  }

  for (const flow of results.flows) {
    const cells = flowGroups.get(flow) || [];
    const flowRuns = cells.flatMap((c) => c.runs).filter((r) => r.tokenCounts !== null);
    if (flowRuns.length === 0) continue;

    const totalInput = flowRuns.reduce((s, r) => s + r.tokenCounts.inputTokens, 0);
    const totalOutput = flowRuns.reduce((s, r) => s + r.tokenCounts.outputTokens, 0);
    lines.push(`| ${flow} | ${totalInput} | ${totalOutput} | ${flowRuns.length} |`);
  }

  return lines.join('\n');
}

/**
 * Collect all unique caveats from per-run data not already in metadata.caveats.
 *
 * @param {ResultsJson} results
 * @returns {string[]}
 */
function collectAllCaveats(results) {
  const seen = new Set(results.metadata.caveats);
  const extras = [];
  for (const cell of results.cells) {
    for (const run of cell.runs) {
      for (const caveat of run.caveats) {
        if (!seen.has(caveat)) {
          seen.add(caveat);
          extras.push(caveat);
        }
      }
    }
  }
  return [...results.metadata.caveats, ...extras];
}

/**
 * Generate a human-readable summary.md describing the benchmark results.
 * Pure function — no I/O.
 *
 * @param {ResultsJson} results
 * @returns {string} The markdown body
 */
export function formatSummary(results) {
  const { runId, date, claudeCodeVersion, nodeVersion, platform, runsPerCell } = results;
  const { cutoverPhase, billingBucketObservation } = results.metadata;
  const allCaveats = collectAllCaveats(results);

  const parts = [];

  // 1. Header
  parts.push('# Plan 0004 benchmark summary');
  parts.push('');
  parts.push(`| Field | Value |`);
  parts.push(`|---|---|`);
  parts.push(`| runId | ${runId} |`);
  parts.push(`| date | ${date} |`);
  parts.push(`| claudeCodeVersion | ${claudeCodeVersion} |`);
  parts.push(`| nodeVersion | ${nodeVersion} |`);
  parts.push(`| platform | ${platform} |`);
  parts.push(`| cutoverPhase | ${cutoverPhase ?? 'null'} |`);
  parts.push(`| runsPerCell | ${runsPerCell} |`);
  parts.push('');

  // 2. Per-flow median latency table
  parts.push('## Per-flow latency');
  parts.push('');
  parts.push(buildFlowTable(results));
  parts.push('');

  // 3. Per-task breakdown
  parts.push('## Per-task breakdown');
  parts.push('');
  const taskBreakdown = buildTaskBreakdown(results);
  if (taskBreakdown) {
    parts.push(taskBreakdown);
    parts.push('');
  }

  // 4. Review verdict agreement matrix (conditional)
  const verdictMatrix = buildVerdictMatrix(results);
  if (verdictMatrix) {
    parts.push(verdictMatrix);
    parts.push('');
  }

  // 5. Token usage (conditional)
  const tokenSection = buildTokenSection(results);
  if (tokenSection) {
    parts.push(tokenSection);
    parts.push('');
  }

  // 6. Caveats
  parts.push('## Caveats');
  parts.push('');
  if (allCaveats.length === 0) {
    parts.push('None.');
  } else {
    for (const caveat of allCaveats) {
      parts.push(`- ${caveat}`);
    }
  }
  parts.push('');

  // 7. Billing-bucket observation
  parts.push('## Billing-bucket observation');
  parts.push('');
  if (billingBucketObservation) {
    parts.push(billingBucketObservation);
  } else {
    parts.push('Not observed in this run (see OQ-I).');
  }
  parts.push('');

  return parts.join('\n');
}

/**
 * Format the summary and write it to outputDir/summary.md.
 * Creates outputDir if it does not exist.
 *
 * @param {ResultsJson} results
 * @param {string} outputDir
 * @returns {void}
 */
export function writeSummary(results, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const content = formatSummary(results);
  writeFileSync(join(outputDir, 'summary.md'), content, 'utf8');
}
