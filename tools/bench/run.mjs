#!/usr/bin/env node
/**
 * Plan 0004 benchmark harness entry point.
 *
 * Usage:
 *   node tools/bench/run.mjs [options]
 *
 * See --help for full option list.
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs, USAGE } from './lib/cli.mjs';
import { selectFlows } from './lib/flows.mjs';
import { selectTasks } from './lib/tasks.mjs';
import { runLive } from './lib/live-runner.mjs';

// Repo root: tools/bench/run.mjs → go up two levels
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

function yyyymmdd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function main() {
  let parsed;
  try {
    parsed = parseCliArgs();
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const runId = randomBytes(4).toString('hex');
  const outputDir =
    parsed.outputDir ?? resolve(REPO_ROOT, 'artifacts', `bench-${yyyymmdd()}-${runId}`);

  // Resolve flows and tasks (throws on unknown ids)
  let flows, tasks;
  try {
    flows = selectFlows({ flowIds: parsed.flowIds, includeBaselineP: parsed.includeBaselineP });
    tasks = selectTasks({ taskIds: parsed.taskIds });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  if (parsed.dryRun) {
    printDryRun({
      runId,
      outputDir,
      cutoverPhase: parsed.cutoverPhase,
      flows,
      tasks,
      runs: parsed.runs,
    });
    process.exit(0);
  }

  // Live execution.
  try {
    const { outputDir: finalDir } = await runLive({
      flows,
      tasks,
      runs: parsed.runs,
      outputDir,
      cutoverPhase: parsed.cutoverPhase,
      runId,
      dateYYYYMMDD: yyyymmdd(),
      includeBaselineP: parsed.includeBaselineP,
      progress: (line) => process.stdout.write(`  ${line}\n`),
    });
    process.stdout.write(`\nBenchmark complete. Artifacts: ${finalDir}\n`);
  } catch (err) {
    process.stderr.write(`Error: ${err.stack ?? err.message}\n`);
    process.exit(1);
  }
}

/**
 * Print the dry-run table to stdout.
 */
function printDryRun({ runId, outputDir, cutoverPhase, flows, tasks, runs }) {
  // For baseline-p, only summarize-todos is in scope (OQ-A resolution)
  const lines = [];
  for (const flow of flows) {
    const taskList =
      flow.id === 'baseline-p' ? tasks.filter((t) => t.id === 'summarize-todos') : tasks;
    for (const task of taskList) {
      lines.push({ flow: flow.id, task: task.id, runs });
    }
  }

  const totalCells = lines.length;
  const totalInvocations = lines.reduce((sum, l) => sum + l.runs, 0);

  const COL_FLOW = 24;
  const COL_TASK = 22;

  process.stdout.write('Plan 0004 benchmark harness — dry run\n');
  process.stdout.write(`Run ID: ${runId}\n`);
  process.stdout.write(`Output dir: ${outputDir}\n`);
  process.stdout.write(`Cutover phase: ${cutoverPhase ?? '(unspecified)'}\n`);
  process.stdout.write('\nCells:\n');

  for (const line of lines) {
    const flowCol = line.flow.padEnd(COL_FLOW);
    const taskCol = line.task.padEnd(COL_TASK);
    process.stdout.write(`  ${flowCol}/ ${taskCol}/ N=${line.runs}\n`);
  }

  process.stdout.write(`\nTotal cells: ${totalCells}  (${totalInvocations} invocations)\n`);
}

main().catch((err) => {
  process.stderr.write(`Unhandled error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
