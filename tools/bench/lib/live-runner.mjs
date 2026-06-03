/**
 * Live execution loop for Plan 0004 benchmark harness.
 *
 * Extracted into its own module for testability via dependency injection.
 * All I/O boundaries (runners, fixture creation, aggregation, file writes,
 * version detection) are injectable so tests can run without spawning real
 * Claude or Codex processes.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { platform, release } from 'node:os';

import { createFixture } from './fixture.mjs';
import { createEmptyRunResult, markError } from './run-result.mjs';
import { aggregate } from './aggregator.mjs';
import { writeSummary } from './summary.mjs';
import { formatEnvironment } from './environment.mjs';
import { runDelegate } from './runners/delegate.mjs';
import { runDelegateFollowup } from './runners/delegate-followup.mjs';
import { runDelegateReview } from './runners/delegate-review.mjs';
import { runDelegateAdversarial } from './runners/delegate-adversarial.mjs';
import { runBaselineP } from './runners/baseline-p.mjs';

/** Default runner map: flow.id → runner function */
const DEFAULT_RUNNERS = {
  delegate: runDelegate,
  'delegate-followup': runDelegateFollowup,
  'delegate-review': runDelegateReview,
  'delegate-adversarial': runDelegateAdversarial,
  'baseline-p': runBaselineP,
};

/**
 * Probe a CLI binary's version via spawnSync, with a timeout.
 * Returns the trimmed first line of stdout, or 'unknown' on any failure.
 *
 * @param {string} bin           Binary name (e.g. 'claude', 'codex', 'npm', 'git')
 * @param {string[]} args        Args to pass (e.g. ['--version'])
 * @param {NodeJS.ProcessEnv} env
 * @param {Function} spawnFn     Injected spawnSync (default: node's spawnSync)
 * @returns {string}
 */
function probeVersion(bin, args, env, spawnFn) {
  try {
    const result = spawnFn(bin, args, {
      encoding: 'utf8',
      timeout: 5000,
      env,
    });
    if (result.status === 0 && typeof result.stdout === 'string') {
      return result.stdout.trim().split('\n')[0].trim() || 'unknown';
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

/**
 * Detect installed tool versions. All probes are best-effort; failures produce
 * 'unknown'. Uses an injected spawn function so tests never exec real binaries.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {Function} spawnFn  Injectable (default: spawnSync)
 * @returns {{ claudeVersion: string, codexVersion: string, npmVersion: string, gitCommit: string, unameInfo: string }}
 */
export function detectVersions(env, spawnFn = spawnSync) {
  const claudeVersion = probeVersion('claude', ['--version'], env, spawnFn);
  const codexVersion = probeVersion('codex', ['--version'], env, spawnFn);
  const npmVersion = probeVersion('npm', ['--version'], env, spawnFn);
  const gitCommit = probeVersion('git', ['rev-parse', '--short', 'HEAD'], env, spawnFn);
  const unameInfo = `${platform()} ${release()}`;
  return { claudeVersion, codexVersion, npmVersion, gitCommit, unameInfo };
}

/**
 * @typedef {Object} LiveRunOptions
 * @property {Array<{id:string,label?:string}>} flows           Selected flows from selectFlows()
 * @property {Array<{id:string,prompt:string}>} tasks           Selected tasks from selectTasks()
 * @property {number} runs                                       Runs per cell (default 5)
 * @property {string} outputDir                                  Absolute path to artifact directory
 * @property {string | null} cutoverPhase                        'pre' | 'post' | null
 * @property {string} runId
 * @property {string} dateYYYYMMDD
 * @property {boolean} includeBaselineP
 * @property {NodeJS.ProcessEnv=} env                            Default: process.env
 * @property {function=} createFixtureFn                         Default: createFixture from lib/fixture.mjs
 * @property {Object<string, function>=} runnerOverrides         Map flow.id → runner; default uses real runners
 * @property {function=} aggregateFn                             Default: aggregate from lib/aggregator.mjs
 * @property {function=} writeSummaryFn                          Default: writeSummary from lib/summary.mjs
 * @property {function=} writeFile                               Default: node:fs.writeFileSync
 * @property {function=} mkdirSync                               Default: node:fs.mkdirSync
 * @property {function=} progress                                Optional logging callback (line) => void
 * @property {function=} spawnFn                                 Default: node:child_process.spawnSync (for version detection)
 */

/**
 * Run the live benchmark loop end-to-end:
 *  1. mkdir outputDir
 *  2. for each (flow, task, runIndex 0..N-1):
 *     - createFixture
 *     - select runner by flow.id from runner map
 *     - call runner(task, fixtureRoot, runnerEnv, opts)
 *     - patch result.runIndex = runIndex  (resolves N1)
 *     - push to runs[]
 *     - cleanup fixture
 *  3. aggregate(runs, metadata)
 *  4. writeFile results.json
 *  5. writeSummary
 *  6. writeFile environment.txt
 *  7. writeFile run.txt (joined progress lines)
 *  8. return { results, outputDir, runs }
 *
 * @param {LiveRunOptions} opts
 * @returns {Promise<{ results: object, outputDir: string, runs: import('./run-result.mjs').RunResult[] }>}
 */
export async function runLive(opts) {
  const {
    flows,
    tasks,
    runs: runsPerCell = 5,
    outputDir,
    cutoverPhase = null,
    runId,
    dateYYYYMMDD,
    includeBaselineP = false,
    env = process.env,
    createFixtureFn = createFixture,
    runnerOverrides = {},
    aggregateFn = aggregate,
    writeSummaryFn = writeSummary,
    writeFile = writeFileSync,
    mkdirSync: mkdirSyncFn = mkdirSync,
    progress = undefined,
    spawnFn = spawnSync,
  } = opts;

  // 1. Create the output directory.
  mkdirSyncFn(outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const progressLines = [];

  /**
   * Emit a progress line to the callback and accumulate for run.txt.
   * @param {string} line
   */
  function emit(line) {
    progressLines.push(line);
    progress?.(line);
  }

  // 2. Outer loop over flows × tasks × runIndex.
  const allRuns = [];

  for (const flow of flows) {
    // baseline-p only runs with task 'summarize-todos' (OQ-A + OQ-C).
    const taskList =
      flow.id === 'baseline-p' ? tasks.filter((t) => t.id === 'summarize-todos') : tasks;

    for (const task of taskList) {
      for (let runIndex = 0; runIndex < runsPerCell; runIndex++) {
        let fixture = null;
        let result = null;

        try {
          // Create an isolated fixture for this run.
          fixture = await createFixtureFn();

          // Select runner: injected override takes precedence over defaults.
          const runner = runnerOverrides[flow.id] ?? DEFAULT_RUNNERS[flow.id];
          if (!runner) {
            throw new Error(`No runner registered for flow "${flow.id}"`);
          }

          // Invoke the runner.
          result = await runner(task, fixture.root, env);

          // N1 fix: patch runIndex onto the result regardless of what the runner set.
          result.runIndex = runIndex;
        } catch (err) {
          // Runner threw — build an error-shaped result and continue the loop.
          result = createEmptyRunResult({ flow: flow.id, task: task.id, runIndex });
          markError(result, `runner threw: ${err?.message ?? String(err)}`);
          result.caveats.push(`runner threw: ${err?.message ?? String(err)}`);
        } finally {
          // Always cleanup the fixture, even if the runner threw.
          if (fixture != null) {
            try {
              fixture.cleanup();
            } catch {
              // ignore cleanup errors
            }
          }
        }

        allRuns.push(result);

        const statusTag = result.error ? `ERR` : 'ok';
        const errDetail = result.error ? `  [error: ${result.error}]` : '';
        emit(
          `${flow.id.padEnd(24)} / ${task.id.padEnd(22)} / run ${runIndex + 1}/${runsPerCell} → ${statusTag} (${Math.round(result.wallClockMs)}ms)${errDetail}`,
        );
      }
    }
  }

  const completedAt = new Date().toISOString();

  // 3. Detect versions for metadata and environment.txt.
  const { claudeVersion, codexVersion, npmVersion, gitCommit, unameInfo } = detectVersions(
    env,
    spawnFn,
  );

  // 4. Build aggregate metadata.
  const metadata = {
    runId,
    date: dateYYYYMMDD,
    claudeCodeVersion: claudeVersion,
    nodeVersion: process.version,
    platform: process.platform,
    runsPerCell,
    tasks: tasks.map((t) => t.id),
    flows: flows.map((f) => f.id),
    cutoverPhase,
    billingBucketObservation: null,
    caveats: [],
  };

  // 5. Aggregate.
  const results = aggregateFn(allRuns, metadata);

  // 6. Write results.json.
  writeFile(join(outputDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');

  // 7. Write summary.md.
  writeSummaryFn(results, outputDir);

  // 8. Write environment.txt.
  const envFields = {
    date: new Date().toISOString(),
    gitCommit,
    nodeVersion: process.version,
    npmVersion,
    codexVersion,
    claudeVersion,
    platform: process.platform,
    unameRelease: unameInfo,
    cutoverPhase: cutoverPhase ?? 'null',
    runsPerCell,
    flowsIncluded: flows.map((f) => f.id).join(', '),
    tasksIncluded: tasks.map((t) => t.id).join(', '),
    includeBaselineP,
  };
  const envContent = formatEnvironment(envFields);
  writeFile(join(outputDir, 'environment.txt'), envContent, 'utf8');

  // 9. Write run.txt.
  const successCount = allRuns.filter((r) => r.error === null).length;
  const errorCount = allRuns.length - successCount;
  const totalCells = flows.reduce((sum, flow) => {
    const taskList =
      flow.id === 'baseline-p' ? tasks.filter((t) => t.id === 'summarize-todos') : tasks;
    return sum + taskList.length;
  }, 0);

  const logLines = [
    'Plan 0004 benchmark run log',
    `Run ID: ${runId}`,
    `Started: ${startedAt}`,
    `Output dir: ${outputDir}`,
    '',
    ...progressLines,
    '',
    `Completed: ${completedAt}`,
    `Total cells: ${totalCells}`,
    `Total invocations: ${allRuns.length}`,
    `Successful: ${successCount}`,
    `Errors: ${errorCount}`,
    '',
  ];
  writeFile(join(outputDir, 'run.txt'), logLines.join('\n'), 'utf8');

  return { results, outputDir, runs: allRuns };
}
