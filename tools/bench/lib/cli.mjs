/**
 * CLI argument parsing for the Plan 0004 benchmark harness.
 * Uses node:util#parseArgs (built-in since Node 18.3).
 */

import { parseArgs } from 'node:util';

const USAGE = `\
Plan 0004 benchmark harness

Usage:
  node tools/bench/run.mjs [options]

Options:
  --dry-run                Print what would be executed without running
  --flows <list>           Comma-separated flow IDs (default: all four plugin flows)
  --tasks <list>           Comma-separated task IDs (default: all three)
  --runs <N>               Runs per cell (default: 5)
  --include-baseline-p     Include claude -p baseline flow (T8, opt-in)
  --output-dir <path>      Override output directory
                           (default: artifacts/bench-<YYYYMMDD>-<runId>/)
  --cutover-phase <phase>  Label for billing context (pre|post)
  --help                   Print usage
`;

/**
 * @typedef {{
 *   dryRun: boolean,
 *   flowIds: string[] | null,
 *   taskIds: string[] | null,
 *   runs: number,
 *   includeBaselineP: boolean,
 *   outputDir: string | null,
 *   cutoverPhase: string | null,
 *   help: boolean,
 * }} ParsedArgs
 */

/**
 * Parse process.argv (or a provided args array) and return structured options.
 * Throws with a descriptive message on validation errors.
 *
 * @param {string[]} [argv] - args to parse (default: process.argv.slice(2))
 * @returns {ParsedArgs}
 */
export function parseCliArgs(argv) {
  const args = argv ?? process.argv.slice(2);

  const { values } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: false },
      flows: { type: 'string' },
      tasks: { type: 'string' },
      runs: { type: 'string' },
      'include-baseline-p': { type: 'boolean', default: false },
      'output-dir': { type: 'string' },
      'cutover-phase': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  // --runs: must be a positive integer
  let runs = 5;
  if (values.runs !== undefined) {
    const parsed = Number(values.runs);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`--runs must be a positive integer, got: "${values.runs}"`);
    }
    runs = parsed;
  }

  // --cutover-phase: must be "pre" or "post" if provided
  let cutoverPhase = null;
  if (values['cutover-phase'] !== undefined) {
    const phase = values['cutover-phase'];
    if (phase !== 'pre' && phase !== 'post') {
      throw new Error(`--cutover-phase must be "pre" or "post", got: "${phase}"`);
    }
    cutoverPhase = phase;
  }

  return {
    dryRun: values['dry-run'],
    flowIds: values.flows
      ? values.flows
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    taskIds: values.tasks
      ? values.tasks
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    runs,
    includeBaselineP: values['include-baseline-p'],
    outputDir: values['output-dir'] ?? null,
    cutoverPhase,
    help: values.help,
  };
}

export { USAGE };
