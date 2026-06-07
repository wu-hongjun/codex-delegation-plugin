#!/usr/bin/env node
// cc.mjs — user-facing CLI dispatcher for the cc-plugin-codex plugin.
//
// Subcommands: setup | delegate | workflow | goal | status | result | stop
// Exit codes: 0 success, 1 failure, 2 usage error

import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runDoctor,
  createJob,
  readJob,
  updateJob,
  listJobsForWorkspace,
  listJobs,
  appendEvent,
  reconcileJob,
} from '@cc-plugin-codex/runtime';
import {
  ClaudeBackgroundDriver,
  DRIVER_VERSION,
  ptyBuildExtraProbe,
} from '@cc-plugin-codex/driver-claude-code';

import { parseArgs, resolveJobIdPrefix } from './lib/args.mjs';
import { listWorkflows, inspectWorkflow } from './lib/workflows-inspector.mjs';
import {
  formatSetup,
  formatDelegate,
  formatStatus,
  formatResult,
  formatStop,
  formatBulkStop,
  formatFollowup,
  formatReviewHuman,
  formatReviewJson,
  formatAdversarialReviewJson,
  formatError,
} from './lib/format.mjs';
import { makeClaudeAdapter } from './lib/adapter.mjs';
import { hasAck, recordAck, resolveWorkspaceAck } from './lib/ack.mjs';
import { makePromptMeta } from './lib/prompt-meta.mjs';
import { SAME_SESSION_REVIEW_PROMPT, ADVERSARIAL_REVIEW_PROMPT } from './lib/review-prompts.mjs';
import { parseReviewOutput } from './lib/review-parser.mjs';
import { readTurnFinalMessageOrFallback } from './lib/review-result-source.mjs';
import { parseClaudeVersion, meetsFloor } from './lib/claude-version.mjs';

// ---------- plugin version ----------

// Read the canonical plugin version from .codex-plugin/plugin.json (co-located with this
// script's package root) rather than from workspace package.json (which reports 0.0.0 in
// the monorepo root). This matches what `codex plugin list` reports.
function loadPluginVersion() {
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const pluginJsonPath = join(scriptDir, '..', '.codex-plugin', 'plugin.json');
    const raw = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
    return typeof raw.version === 'string' ? raw.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const PLUGIN_VERSION = loadPluginVersion();

// ---------- main ----------

const argv = process.argv.slice(2);
const parsed = parseArgs(argv);
const { command, flags, positional } = parsed;
const useJson = Boolean(flags['json']);

if (!command || flags['help']) {
  printUsage();
  // --help is a user request, not a usage error — exit 0. Only exit 2 when no
  // command was given AND no --help was requested.
  process.exit(flags['help'] ? 0 : 2);
}

try {
  switch (command) {
    case 'setup':
      await cmdSetup(flags, useJson);
      break;
    case 'delegate':
      await cmdDelegate(flags, positional, useJson);
      break;
    case 'workflow':
      await cmdWorkflow(flags, positional, useJson);
      break;
    case 'goal':
      await cmdGoal(flags, positional, useJson);
      break;
    case 'fork':
      await cmdFork(flags, positional, useJson);
      break;
    case 'batch':
      await cmdBatch(flags, positional, useJson);
      break;
    case 'deep-research':
      await cmdDeepResearch(flags, positional, useJson);
      break;
    case 'status':
      await cmdStatus(flags, useJson);
      break;
    case 'result':
      await cmdResult(flags, positional, useJson);
      break;
    case 'stop':
      await cmdStop(flags, positional, useJson);
      break;
    case 'followup':
      await cmdFollowup(flags, positional, useJson);
      break;
    case 'review':
      await cmdReview(flags, positional, useJson);
      break;
    case 'adversarial-review':
      await cmdAdversarialReview(flags, positional, useJson);
      break;
    case 'workflows':
      await cmdWorkflows(flags, positional, useJson);
      break;
    default:
      process.stderr.write(
        formatError(new Error(`Unknown command: ${command}`), '', useJson) + '\n',
      );
      printUsage();
      process.exit(2);
  }
} catch (err) {
  process.stderr.write(formatError(err, command, useJson) + '\n');
  process.exit(1);
}

// ---------- setup ----------

async function cmdSetup(_flags, json) {
  // Inject the driver-owned pty-build probe so the unified setup report covers both
  // Plan 0001 (delegate) and Plan 0002 (follow-up) capability groups. The runtime
  // never imports node-pty directly — the driver supplies the probe via DI.
  //
  // Plan 0007 T3: also inject three version-floor probes that report feature availability
  // based on the locally installed Claude Code version. Floors diverge per empirical
  // evidence on Claude Code v2.1.153: workflows are available, but --bg --exec is
  // silently dropped. Opus 4.8 is unverified at v2.1.153.
  const FLOOR_OPUS_4_8 = '2.1.154';
  const FLOOR_WORKFLOWS = '2.1.153';
  const FLOOR_BG_EXEC = '2.1.154';

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const opus48Probe = {
    name: 'opus-4-8-supported',
    capabilities: [],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      let stdout = '';
      try {
        const r = await execFileAsync('claude', ['--version'], {
          env: opts.env ?? process.env,
          timeout: 5000,
        });
        stdout = r.stdout.trim();
      } catch {
        stdout = '';
      }
      const version = parseClaudeVersion(stdout);
      if (version === null) {
        return {
          name: 'opus-4-8-supported',
          status: 'warn',
          detail: 'unparseable version',
        };
      }
      if (meetsFloor(version, FLOOR_OPUS_4_8)) {
        return {
          name: 'opus-4-8-supported',
          status: 'ok',
          detail: 'Opus 4.8 supported (--model claude-opus-4-8 available)',
        };
      }
      return {
        name: 'opus-4-8-supported',
        status: 'warn',
        detail: `Opus 4.8 requires Claude Code >= ${FLOOR_OPUS_4_8} (current ${stdout})`,
      };
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const workflowsProbe = {
    name: 'workflows-supported',
    capabilities: [],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      let stdout = '';
      try {
        const r = await execFileAsync('claude', ['--version'], {
          env: opts.env ?? process.env,
          timeout: 5000,
        });
        stdout = r.stdout.trim();
      } catch {
        stdout = '';
      }
      const version = parseClaudeVersion(stdout);
      if (version === null) {
        return {
          name: 'workflows-supported',
          status: 'warn',
          detail: 'unparseable version',
        };
      }
      if (meetsFloor(version, FLOOR_WORKFLOWS)) {
        return {
          name: 'workflows-supported',
          status: 'ok',
          detail: 'Dynamic workflows available via /workflows',
        };
      }
      return {
        name: 'workflows-supported',
        status: 'warn',
        detail: `Dynamic workflows require Claude Code >= ${FLOOR_WORKFLOWS} (current ${stdout})`,
      };
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const bgExecProbe = {
    name: 'bg-exec-supported',
    capabilities: [],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      let stdout = '';
      try {
        const r = await execFileAsync('claude', ['--version'], {
          env: opts.env ?? process.env,
          timeout: 5000,
        });
        stdout = r.stdout.trim();
      } catch {
        stdout = '';
      }
      const version = parseClaudeVersion(stdout);
      if (version === null) {
        return {
          name: 'bg-exec-supported',
          status: 'warn',
          detail: 'unparseable version',
        };
      }
      if (meetsFloor(version, FLOOR_BG_EXEC)) {
        return {
          name: 'bg-exec-supported',
          status: 'ok',
          detail: 'claude --bg --exec available',
        };
      }
      return {
        name: 'bg-exec-supported',
        status: 'warn',
        detail: `claude --bg --exec requires Claude Code >= ${FLOOR_BG_EXEC} (current ${stdout}); --exec is silently dropped on older versions`,
      };
    },
  };

  const report = await runDoctor({
    extraProbes: [ptyBuildExtraProbe, opus48Probe, workflowsProbe, bgExecProbe],
  });
  process.stdout.write(formatSetup(report, json) + '\n');
  if (report.status === 'fail') {
    process.exit(1);
  }
}

// ---------- delegate ----------

async function cmdDelegate(flags, positional, json) {
  // --allow-edit is accepted; no rejection here.
  await _runDelegateCore(flags, positional, json, {
    commandName: 'delegate',
    promptTransformer: (p) => p,
    extraOutput: null,
  });
}

// ---------- workflow ----------

async function cmdWorkflow(flags, positional, json) {
  // --allow-edit is not applicable to workflow; workflows are planning sessions.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to $claude-workflow.'),
        'workflow',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'workflow',
    promptTransformer: (p) => `ultracode: ${p}`,
    extraOutput: [
      '',
      'This is a Claude Code dynamic workflow request.',
      'Workflows present an interactive approval dialog (Yes / View raw script / No)',
      'inside the Claude Code TUI. To approve and start the workflow, attach:',
      '',
      '  claude attach <jobId>',
      '',
      'Workflows can spawn up to 16 concurrent agents and 1000 total per run. Token',
      "usage scales with the workflow's complexity.",
    ].join('\n'),
  });
}

// ---------- goal ----------

async function cmdGoal(flags, positional, json) {
  // --allow-edit is not applicable to goal; goal sessions track a condition automatically.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to $claude-goal.'), 'goal', json) +
        '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'goal',
    promptTransformer: (p) => `/goal ${p}`,
    extraOutput: [
      '',
      'This is a Claude Code goal-condition request.',
      'The runtime tracks goal-completion automatically; attach via',
      '`claude attach <jobId>` to watch progress.',
    ].join('\n'),
  });
}

// ---------- fork ----------

async function cmdFork(flags, positional, json) {
  // --allow-edit is not applicable to fork; fork sessions spawn a subagent automatically.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to $claude-fork.'), 'fork', json) +
        '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'fork',
    promptTransformer: (p) => `/fork ${p}`,
    extraOutput: [
      '',
      'This is a Claude Code fork request.',
      'The runtime spawns a real subagent process to execute the directive.',
      'Note: /fork directives consume 20-30k tokens even for trivial directives.',
      'Attach via `claude attach <jobId>` to watch progress.',
    ].join('\n'),
  });
}

// ---------- batch ----------

async function cmdBatch(flags, positional, json) {
  // --allow-edit is not applicable to batch; batch sessions use the orchestration runtime.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to $claude-batch.'), 'batch', json) +
        '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'batch',
    promptTransformer: (p) => `/batch ${p}`,
    extraOutput: [
      '',
      'This is a Claude Code batch request.',
      'The runtime injects a "# Batch: Parallel Work Orchestration" system prompt.',
      'Batch sessions can spawn multiple parallel tool-calls and subagents.',
      'Attach via `claude attach <jobId>` to watch progress.',
    ].join('\n'),
  });
}

// ---------- deep-research ----------

async function cmdDeepResearch(flags, positional, json) {
  // --allow-edit is not applicable to deep-research; workflow-runtime operations are session-init.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to $claude-deep-research.'),
        'deep-research',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'deep-research',
    promptTransformer: (p) => `/deep-research ${p}`,
    extraOutput: [
      '',
      'This is a Claude Code deep-research request.',
      'The /deep-research runtime fans out parallel web searches, fetches sources,',
      'adversarially verifies claims, and synthesizes a cited report.',
      'WebSearch is auto-available in standard bg sessions.',
      'Attach via `claude attach <jobId>` to watch progress.',
    ].join('\n'),
  });
}

// ---------- _runDelegateCore (shared helper) ----------

/**
 * Shared implementation for cmdDelegate and cmdWorkflow.
 *
 * @param {Record<string, unknown>} flags
 * @param {string[]} positional
 * @param {boolean} json
 * @param {{
 *   commandName: string;
 *   promptTransformer: (raw: string) => string;
 *   extraOutput: string | null;
 * }} opts
 */
async function _runDelegateCore(
  flags,
  positional,
  json,
  { commandName, promptTransformer, extraOutput },
) {
  // 1. Collect prompt from positionals (after -- or all remaining).
  const rawPrompt = positional.join(' ').trim();
  if (!rawPrompt) {
    process.stderr.write(
      formatError(
        new Error(`prompt is required: cc ${commandName} -- "<prompt>"`),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  const prompt = promptTransformer(rawPrompt);

  const workspace = process.cwd();
  const useYes = Boolean(flags['yes']);

  // 2. Privacy ack.
  if (!hasAck(workspace) && !useYes) {
    if (!process.stdin.isTTY) {
      const msg = [
        'Privacy acknowledgement required.',
        '',
        'This command will send your prompt to Claude Code as a background session.',
        'Claude Code will have access to files in the current workspace.',
        '',
        `Workspace: ${workspace}`,
        '',
        'Re-run with --yes to acknowledge and proceed.',
      ].join('\n');
      process.stderr.write(formatError(new Error(msg), commandName, json) + '\n');
      process.exit(1);
    }
    // TTY: interactive acknowledgement — record it and proceed.
    recordAck(workspace);
  } else if (useYes && !hasAck(workspace)) {
    recordAck(workspace);
  }

  // 3. Build driver.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });

  // 4. Probe.
  const caps = await driver.probe();
  if (caps.health.status === 'fail' || !caps.backgroundSessions || !caps.agentsJson) {
    const failedProbes = caps.health.probes
      .filter((p) => p.status === 'fail')
      .map((p) => `  - ${p.name}: ${p.detail}`)
      .join('\n');
    const detail = [
      'Claude Code is not ready for background sessions.',
      ...(failedProbes ? ['\nFailed probes:', failedProbes] : []),
      ...(!caps.backgroundSessions ? ['\n  - backgroundSessions: not supported'] : []),
      ...(!caps.agentsJson ? ['\n  - agentsJson: not supported'] : []),
      '\nRun: cc setup',
    ].join('');
    process.stderr.write(formatError(new Error(detail), commandName, json) + '\n');
    process.exit(1);
  }

  // 5. Prompt meta.
  const { summary, sha256, bytesLen } = makePromptMeta(prompt);

  // 6. Start session.
  const handle = await driver.startSession({
    cwd: workspace,
    prompt,
    name: typeof flags['name'] === 'string' ? flags['name'] : undefined,
    model: typeof flags['model'] === 'string' ? flags['model'] : undefined,
    effort: typeof flags['effort'] === 'string' ? flags['effort'] : undefined,
    permissionMode:
      typeof flags['permission-mode'] === 'string' ? flags['permission-mode'] : undefined,
    allowEdit: Boolean(flags['allow-edit']),
    addDirs: Array.isArray(flags['add-dir']) ? flags['add-dir'] : [],
    mcpConfig: typeof flags['mcp-config'] === 'string' ? flags['mcp-config'] : undefined,
  });

  // 7. Create job record.
  const job = await createJob({
    codex: {
      cwd: workspace,
      pluginVersion: PLUGIN_VERSION,
    },
    workspace: {
      root: workspace,
    },
    driver: {
      name: 'claude-background',
      version: DRIVER_VERSION,
      capabilitiesSnapshot: caps,
    },
    claude: {
      version: caps.claudeVersion ?? 'unknown',
      shortId: handle.shortId,
      sessionName: handle.sessionName,
      cwd: handle.cwd,
      startedAt: handle.startedAt,
      logsCommand: `claude logs ${handle.shortId}`,
    },
    prompt: { summary, sha256, bytesLen },
  });

  // 8. Build adapter.
  const adapter = makeClaudeAdapter(driver, {
    startedAt: handle.startedAt,
  });

  // 9. Reconcile once.
  let finalJob = job;
  try {
    const reconciled = await reconcileJob(job.jobId, adapter);
    finalJob = reconciled.job;
  } catch {
    // Non-fatal: job was created; reconcile warnings are acceptable on first run.
  }

  // 10. Print summary.
  process.stdout.write(formatDelegate(finalJob, json) + '\n');

  // 11. Workflow-specific note (appended after the standard job block).
  if (extraOutput !== null && !json) {
    process.stdout.write(extraOutput + '\n');
  }
}

// ---------- status ----------

async function cmdStatus(flags, json) {
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);

  let jobRecords;
  if (showAll) {
    const result = await listJobs();
    jobRecords = result.jobs;
  } else {
    const result = await listJobsForWorkspace(workspace);
    jobRecords = result.jobs;
  }

  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  const reconciled = [];
  for (const job of jobRecords) {
    try {
      const r = await reconcileJob(job.jobId, adapter);
      reconciled.push(r.job);
    } catch {
      reconciled.push(job);
    }
  }

  process.stdout.write(formatStatus(reconciled, json, workspace) + '\n');
}

// ---------- result ----------

async function cmdResult(flags, positional, json) {
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(formatError(new Error('usage: cc result <jobId>'), 'result', json) + '\n');
    process.exit(2);
  }

  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'result', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let job;
  try {
    const r = await reconcileJob(jobId, adapter);
    job = r.job;
  } catch {
    job = await readJob(jobId);
  }

  const terminalStatuses = new Set([
    'completed',
    'failed',
    'stopped',
    'orphaned',
    'awaiting_followup',
  ]);
  if (!terminalStatuses.has(job.status)) {
    process.stderr.write(
      formatError(
        new Error(`Job ${jobId} is not complete yet (status: ${job.status}). Run: cc status`),
        'result',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // Edge case (Plan 0012 T4): sendFollowupTurn sets turn.result.finalMessagePath='' (empty);
  // job.result.finalMessagePath is updated only by the reconciler. If reconciliation fails
  // after a followup on a never-completed initial job, this read returns stale data.
  let resultText = null;
  if (job.result?.finalMessagePath) {
    try {
      resultText = await readFile(job.result.finalMessagePath, 'utf8');
    } catch {
      resultText = null;
    }
  }

  process.stdout.write(formatResult(job, resultText, json) + '\n');
}

// ---------- stop ----------

async function cmdStop(flags, positional, json) {
  // Defense-in-depth: --all-idle is not implemented; reject it explicitly so it
  // doesn't silently consume a positional token via the generic flag parser.
  if (flags['all-idle'] !== undefined) {
    process.stderr.write(
      formatError(new Error('Unknown stop flag: --all-idle'), 'stop', json) + '\n',
    );
    process.exit(2);
  }

  const bulkAwaitingFollowup = Boolean(flags['all-awaiting-followup']);

  if (bulkAwaitingFollowup) {
    // Bulk path — no positional argument allowed.
    if (positional[0] !== undefined) {
      process.stderr.write(
        formatError(
          new Error('stop --all-awaiting-followup takes no positional argument'),
          'stop',
          json,
        ) + '\n',
      );
      process.exit(2);
    }

    const workspace = process.cwd();
    const showAll = Boolean(flags['all']);
    const candidates = showAll
      ? (await listJobs()).jobs
      : (await listJobsForWorkspace(workspace)).jobs;

    const driver = new ClaudeBackgroundDriver({ cwd: workspace });
    const adapter = makeClaudeAdapter(driver);

    /** @type {Array<{ jobId: string; shortId: string; status: string }>} */
    const stopped = [];
    /** @type {Array<{ jobId: string; status: string; reason: string }>} */
    const skipped = [];
    /** @type {Array<{ jobId: string; message: string }>} */
    const failed = [];

    const sorted = candidates.slice().sort((a, b) => a.jobId.localeCompare(b.jobId));

    for (const candidate of sorted) {
      // Reconcile to get fresh status, mirroring cmdFollowup pattern.
      let current;
      try {
        const r = await reconcileJob(candidate.jobId, adapter);
        current = r.job;
      } catch {
        current = await readJob(candidate.jobId);
      }

      if (current.status !== 'awaiting_followup') {
        skipped.push({
          jobId: current.jobId,
          status: current.status,
          reason: 'not awaiting_followup',
        });
        continue;
      }

      // claude.startedAt was added later; fall back to job.createdAt for records
      // written before then so old jobs can still be stopped.
      const sessionHandle = {
        driverName: current.driver.name,
        shortId: current.claude.shortId,
        sessionId: current.claude.sessionId,
        sessionName: current.claude.sessionName,
        cwd: current.claude.cwd,
        startedAt: current.claude.startedAt ?? current.createdAt,
      };

      try {
        await driver.stop(sessionHandle);
        const now = new Date().toISOString();
        await updateJob(current.jobId, (c) => ({ ...c, status: 'stopped' }));
        await appendEvent(current.jobId, { type: 'stop.completed', at: now });
        stopped.push({
          jobId: current.jobId,
          shortId: current.claude.shortId,
          status: 'stopped',
        });
      } catch (err) {
        failed.push({
          jobId: current.jobId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    process.stdout.write(formatBulkStop({ stopped, skipped, failed, showAll }, json) + '\n');
    process.exit(failed.length > 0 ? 1 : 0);
  }

  // Single-job path.
  const prefix = positional[0];
  if (!prefix) {
    // Bare --all without --all-awaiting-followup is not a valid stop shape; guide the user.
    if (flags['all'] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            'bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.',
          ),
          'stop',
          json,
        ) + '\n',
      );
      process.exit(2);
    }
    process.stderr.write(formatError(new Error('usage: cc stop <jobId>'), 'stop', json) + '\n');
    process.exit(2);
  }

  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listResult = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listResult.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'stop', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  const job = await readJob(jobId);

  // claude.startedAt was added later; fall back to job.createdAt for records
  // written before then so old jobs can still be stopped.
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.claude.startedAt ?? job.createdAt,
  };

  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  await driver.stop(sessionHandle);

  const now = new Date().toISOString();
  const stoppedJob = await updateJob(jobId, (current) => ({
    ...current,
    status: 'stopped',
  }));
  await appendEvent(jobId, { type: 'stop.completed', at: now });

  process.stdout.write(formatStop(stoppedJob, json) + '\n');
}

// ---------- sendFollowupTurn (shared helper) ----------

/**
 * Execute a single follow-up turn: append a TurnRecord, fire driver.send,
 * record turn events, and reconcile. Does NOT own: job lookup, eligibility
 * checks, privacy ack, argument parsing, or output formatting. Process exits
 * on permission-handoff timeout (0) and send failure (1) remain inside this
 * helper because they are intrinsic to driver.send's error-path side effects;
 * future review consumers reuse the same exit semantics.
 *
 * @param {{
 *   jobId: string;
 *   prompt: string;
 *   driver: import('@cc-plugin-codex/driver-claude-code').ClaudeBackgroundDriver;
 *   adapter: object;
 *   json: boolean;
 *   sessionHandle: object;
 *   job: object;
 *   promptSummaryPrefix?: string;
 * }} opts
 * @returns {Promise<{ finalJob: object; sendResult: object; newTurnIndex: number }>}
 */
async function sendFollowupTurn({
  jobId,
  prompt,
  driver,
  adapter,
  json,
  sessionHandle,
  job,
  promptSummaryPrefix,
}) {
  // 9. Build new TurnRecord and append to job.turns.
  const now = new Date().toISOString();
  const newTurnIndex = job.turns.length;
  const promptMeta = makePromptMeta(prompt);

  // Apply optional prefix to the turn's prompt.summary (e.g. '[review] ').
  const baseSummary = promptMeta.summary;
  const summary = promptSummaryPrefix ? `${promptSummaryPrefix}${baseSummary}` : baseSummary;
  const newTurn = {
    prompt: { ...promptMeta, summary },
    startedAt: now,
    status: 'injecting',
  };

  await updateJob(jobId, (current) => ({
    ...current,
    status: 'running',
    turns: [...current.turns, newTurn],
  }));

  // 10. Write turn.requested event.
  await appendEvent(jobId, { type: 'turn.requested', at: now, turnIndex: newTurnIndex });

  // 11. Build permission callback and call driver.send (T10 permission-handoff loop).
  //
  // The timeout default is 5 minutes (300_000 ms). Tests may override it via the
  // CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS environment variable. This is a test seam
  // only — do NOT expose it as a CLI flag.
  //
  // Defensive parse: a non-numeric, empty, zero, or negative env-var value falls
  // back to the 5-minute default rather than firing an immediate timeout (which
  // would silently change permission-handoff semantics in CI / misconfigured envs).
  const PERMISSION_TIMEOUT_DEFAULT_MS = 300_000;
  const rawTimeoutOverride = process.env.CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS;
  const parsedTimeoutOverride = rawTimeoutOverride ? Number(rawTimeoutOverride) : NaN;
  const PERMISSION_TIMEOUT_MS =
    Number.isFinite(parsedTimeoutOverride) && parsedTimeoutOverride > 0
      ? parsedTimeoutOverride
      : PERMISSION_TIMEOUT_DEFAULT_MS;

  // Flag set by the callback when the 5-minute read times out. Used in the outer
  // catch block to distinguish timeout (exit 0) from hard failures (exit 1).
  let permissionTimedOut = false;

  /**
   * Read one line from stdin with a soft timeout.
   * Returns { timedOut: false, line: string } or { timedOut: true }.
   * @param {number} timeoutMs
   */
  async function readPermissionAnswer(timeoutMs) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answerPromise = rl.question('> ');
      let timeoutHandle;
      const timeoutPromise = new Promise((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      });
      const winner = await Promise.race([
        answerPromise.then((line) => ({ timedOut: false, line })),
        timeoutPromise,
      ]);
      clearTimeout(timeoutHandle);
      return winner;
    } finally {
      rl.close();
    }
  }

  /**
   * onPermissionRequest callback passed to driver.send.
   * @param {{ shortId: string; message?: string }} request
   * @returns {Promise<string | null>}
   */
  async function onPermissionRequest({ shortId: reqShortId }) {
    // Non-TTY: fail closed immediately without printing the prompt.
    if (!process.stdin.isTTY) {
      return null;
    }

    // Print the prompt block to stdout (not stderr), as specified.
    process.stdout.write(
      [
        `Claude is asking for permission inside session ${reqShortId}.`,
        'Type your answer below; we will route it back into the session.',
        '(To abort, press Ctrl+C; the session keeps running.)',
        '',
      ].join('\n'),
    );

    const result = await readPermissionAnswer(PERMISSION_TIMEOUT_MS);

    if (result.timedOut) {
      process.stderr.write(
        `[followup] WARNING: timed out waiting for permission answer for session ${reqShortId}. ` +
          `The session is left in needs_input state. Run \`claude attach ${reqShortId}\` to respond manually.\n`,
      );
      permissionTimedOut = true;
      return null;
    }

    // Trim trailing newline; return the answer (empty string is acceptable).
    return result.line.replace(/\r?\n$/, '');
  }

  let sendResult;
  try {
    sendResult = await driver.send(
      sessionHandle,
      { type: 'text', text: prompt },
      { onPermissionRequest },
    );
  } catch (err) {
    // Check for permission stall.
    const msg = err instanceof Error ? err.message : String(err);
    const isPermissionStall =
      err != null &&
      typeof err === 'object' &&
      'permissionStall' in err &&
      /** @type {Record<string, unknown>} */ (err)['permissionStall'] === true;

    const endedAt = new Date().toISOString();

    // Mark turn failed.
    await updateJob(jobId, (current) => {
      const turns = [...current.turns];
      const failedTurn = turns[newTurnIndex];
      if (failedTurn) {
        turns[newTurnIndex] = { ...failedTurn, status: 'failed', endedAt };
      }
      return { ...current, turns };
    });
    await appendEvent(jobId, {
      type: 'turn.failed',
      at: endedAt,
      turnIndex: newTurnIndex,
      message: msg,
    });

    // Timeout path: the callback returned null after 5 min with no answer.
    // Exit 0 — the job stays in needs_input and the reconciler will surface it.
    if (permissionTimedOut) {
      process.stderr.write(
        `[followup] Permission handoff timed out. Job ${jobId} is left in needs_input state.\n`,
      );
      process.exit(0);
    }

    if (isPermissionStall) {
      process.stderr.write(
        formatError(
          new Error(
            `Claude is asking for permission. Run claude attach ${sessionHandle.shortId} to approve manually, then retry $claude-followup.`,
          ),
          'followup',
          json,
        ) + '\n',
      );
    } else if (msg.includes('permission required but no response')) {
      // Non-TTY null-return path: driver threw after callback returned null.
      process.stderr.write(
        formatError(
          new Error(
            `Permission required, but this dispatcher is non-interactive. Run \`claude attach ${sessionHandle.shortId}\` in your own terminal to approve manually.`,
          ),
          'followup',
          json,
        ) + '\n',
      );
    } else {
      process.stderr.write(formatError(err, 'followup', json) + '\n');
    }
    process.exit(1);
  }

  // 12. On success: update the new turn from sendResult.
  const endedAt = new Date().toISOString();
  const successTurnResult = sendResult.finalMessage
    ? {
        finalMessagePath: '',
        finalMessagePreview: sendResult.finalMessage.slice(0, 160),
        ...(sendResult.touchedFiles ? { touchedFiles: sendResult.touchedFiles } : {}),
        ...(sendResult.usageSnapshot ? { usageSnapshot: sendResult.usageSnapshot } : {}),
      }
    : undefined;

  const updatedJob = await updateJob(jobId, (current) => {
    const turns = [...current.turns];
    const doneTurn = turns[newTurnIndex];
    if (doneTurn) {
      turns[newTurnIndex] = {
        ...doneTurn,
        status: 'completed',
        endedAt,
        ...(successTurnResult ? { result: successTurnResult } : {}),
        ...(sendResult.usageSnapshot ? { usageSnapshot: sendResult.usageSnapshot } : {}),
      };
    }
    return { ...current, turns };
  });

  await appendEvent(jobId, {
    type: 'turn.completed',
    at: endedAt,
    turnIndex: newTurnIndex,
    ...(successTurnResult?.finalMessagePath
      ? { finalMessagePath: successTurnResult.finalMessagePath }
      : {}),
  });

  // 13. Best-effort reconcile after send.
  let finalJob = updatedJob;
  try {
    const r = await reconcileJob(jobId, adapter);
    finalJob = r.job;
  } catch {
    // Non-fatal: surface as warning only.
    process.stderr.write('[followup] warning: post-send reconcile failed\n');
  }

  return { finalJob, sendResult, newTurnIndex };
}

// ---------- followup ----------

async function cmdFollowup(flags, positional, json) {
  // Flags that are startup-only and must be rejected at parse time for followup.
  // Defined locally (not at module scope) because the top-level dispatch switch
  // runs before later module-scope `const` declarations are initialized; a
  // module-scope const referenced from inside an early-dispatch path would hit
  // the temporal-dead-zone (TDZ) and throw `Cannot access ... before initialization`.
  const FOLLOWUP_REJECTED_FLAGS = new Set([
    'model',
    'effort',
    'permission-mode',
    'add-dir',
    'mcp-config',
    'name',
  ]);
  // 1. Check for rejected startup-only flags.
  for (const flag of FOLLOWUP_REJECTED_FLAGS) {
    if (flags[flag] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            `--${flag} is a startup-only flag; use it with $claude-delegate, not $claude-followup.`,
          ),
          'followup',
          json,
        ) + '\n',
      );
      process.exit(2);
    }
  }

  // 2. jobId-or-prefix positional.
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error('usage: cc followup <jobId-or-prefix> [flags] -- "<prompt>"'),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 3. Prompt (remaining positionals after the prefix — everything after --).
  const promptParts = positional.slice(1);
  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    process.stderr.write(
      formatError(
        new Error(`prompt is required: cc followup <jobId-or-prefix> -- "<prompt>"`),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 4. Prefix resolution.
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'followup', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;

  // 5. Reconcile to get fresh status.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let job;
  try {
    const r = await reconcileJob(jobId, adapter);
    job = r.job;
  } catch {
    job = await readJob(jobId);
  }

  // 6. Status eligibility check.
  const { status } = job;

  if (status === 'running') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is running; wait for $claude-status to show awaiting_followup before sending a follow-up.`,
        ),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (
    status === 'queued' ||
    status === 'starting' ||
    status === 'failed' ||
    status === 'stopped' ||
    status === 'orphaned'
  ) {
    process.stderr.write(
      formatError(
        new Error(`Job ${jobId} is ${status}; start a new $claude-delegate job instead.`),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'completed') {
    // Require a live idle Claude session.
    const sessionHandle = {
      driverName: job.driver.name,
      shortId: job.claude.shortId,
      sessionId: job.claude.sessionId,
      sessionName: job.claude.sessionName,
      cwd: job.claude.cwd,
      startedAt: job.claude.startedAt ?? job.createdAt,
    };
    let driverStatus;
    try {
      driverStatus = await driver.status(sessionHandle);
    } catch {
      driverStatus = null;
    }
    if (!driverStatus || driverStatus.value !== 'idle') {
      process.stderr.write(
        formatError(
          new Error(
            `Job ${jobId} is completed and no live idle Claude session was found; start a new $claude-delegate job instead.`,
          ),
          'followup',
          json,
        ) + '\n',
      );
      process.exit(1);
    }
  }

  // At this point status must be awaiting_followup, needs_input, or completed-with-idle-session.

  // 7. Target-workspace privacy ack — MUST use job.workspace.root, not process.cwd().
  // The dispatcher already resolved the target job above; ack is scoped to the
  // job's workspace so that --all cannot inherit an ack across workspaces.
  const ackResult = resolveWorkspaceAck({
    workspaceRoot: job.workspace.root,
    useYes: Boolean(flags['yes']),
    isTTY: process.stdin.isTTY === true,
  });
  if (ackResult.verdict === 'rejected') {
    const msg = [
      'Privacy acknowledgement required for target workspace.',
      '',
      `This command will inject a follow-up prompt into job ${jobId}.`,
      "Claude Code's existing session has access to files in:",
      '',
      `Target workspace: ${ackResult.workspaceRoot}`,
      '',
      'Re-run with --yes to acknowledge and proceed.',
    ].join('\n');
    process.stderr.write(formatError(new Error(msg), 'followup', json) + '\n');
    process.exit(1);
  }

  // 8. Reconstitute session handle.
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.claude.startedAt ?? job.createdAt,
  };

  // 9-13. Send the follow-up turn and record all events (delegated to shared helper).
  const { finalJob, sendResult, newTurnIndex } = await sendFollowupTurn({
    jobId,
    prompt,
    driver,
    adapter,
    json,
    sessionHandle,
    job,
    promptSummaryPrefix: undefined, // T3: no prefix; T4 will pass '[review] '
  });

  // 14. Print result.
  process.stdout.write(formatFollowup(finalJob, sendResult, newTurnIndex, json) + '\n');
}

// ---------- review ----------

async function cmdReview(flags, positional, json) {
  // 1. Parse args: reject startup-only and inapplicable flags at parse time.

  // --allow-edit is categorically rejected for all review skills.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to review skills. Reviews are read-only.'),
        'review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // Startup-only flags rejected with the pinned review-specific message.
  const REVIEW_REJECTED_STARTUP_FLAGS = new Set([
    'model',
    'effort',
    'permission-mode',
    'add-dir',
    'mcp-config',
    'name',
  ]);
  for (const flag of REVIEW_REJECTED_STARTUP_FLAGS) {
    if (flags[flag] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            `--${flag} is a startup-only flag; use it with $claude-adversarial-review, not $claude-review.`,
          ),
          'review',
          json,
        ) + '\n',
      );
      process.exit(2);
    }
  }

  // 2. jobId-or-prefix positional (required).
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error('usage: cc review <jobId-or-prefix> [--all] [--json] [--yes]'),
        'review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // Reject unexpected freeform positional args beyond the job ID.
  if (positional.length > 1) {
    process.stderr.write(
      formatError(
        new Error(
          'review does not accept a freeform prompt; the dispatcher constructs the review prompt.',
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 3. Resolve job by prefix.
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    // Hint for likely misuse: user may have passed a freeform prompt instead of a jobId.
    if (prefix.includes(' ') || prefix.length > 50 || !prefix.startsWith('job_')) {
      process.stderr.write(
        '[review] Hint: $claude-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?\n',
      );
    }
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'review', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;

  // 4. Reconcile to get fresh status.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let job;
  try {
    const r = await reconcileJob(jobId, adapter);
    job = r.job;
  } catch {
    job = await readJob(jobId);
  }

  // 5. Status eligibility check (§ 3.6).
  const { status } = job;

  if (status === 'needs_input') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} needs input. Resolve the permission request first, then run $claude-review.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'running') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is running; wait for $claude-status to show awaiting_followup before running $claude-review.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'queued' || status === 'starting') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is ${status}; wait for the job to reach awaiting_followup before running $claude-review.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'failed' || status === 'stopped' || status === 'orphaned') {
    process.stderr.write(
      formatError(
        new Error(
          `$claude-review is not applicable to ${status} jobs; use $claude-adversarial-review for a fresh-session review of the prior output.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'completed') {
    // Require a live idle Claude session.
    const sessionHandleForStatus = {
      driverName: job.driver.name,
      shortId: job.claude.shortId,
      sessionId: job.claude.sessionId,
      sessionName: job.claude.sessionName,
      cwd: job.claude.cwd,
      startedAt: job.claude.startedAt ?? job.createdAt,
    };
    let driverStatus;
    try {
      driverStatus = await driver.status(sessionHandleForStatus);
    } catch {
      driverStatus = null;
    }
    if (!driverStatus || driverStatus.value !== 'idle') {
      process.stderr.write(
        formatError(
          new Error(
            `Job ${jobId} is completed and no live idle Claude session was found; use $claude-adversarial-review instead.`,
          ),
          'review',
          json,
        ) + '\n',
      );
      process.exit(1);
    }
  }

  // At this point status is awaiting_followup or completed-with-idle-session.

  // 6. Review target selection (§ 3.X): latest completed non-review turn with a result.
  let targetTurn = null;
  let targetTurnIndex = -1;
  for (let i = job.turns.length - 1; i >= 0; i--) {
    const t = job.turns[i];
    if (
      t.status === 'completed' &&
      t.result != null &&
      !t.prompt.summary.startsWith('[review] ') &&
      !t.prompt.summary.startsWith('[adversarial-review] ')
    ) {
      targetTurn = t;
      targetTurnIndex = i;
      break;
    }
  }

  if (targetTurn === null) {
    process.stderr.write(
      formatError(
        new Error('No reviewable non-review output found for this job.'),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 7. Privacy ack — target workspace, 4-step rule.
  const ackResult = resolveWorkspaceAck({
    workspaceRoot: job.workspace.root,
    useYes: Boolean(flags['yes']),
    isTTY: process.stdin.isTTY === true,
  });
  if (ackResult.verdict === 'rejected') {
    const msg = [
      'Privacy acknowledgement required for target workspace.',
      '',
      `This command will inject a review prompt into job ${jobId}.`,
      "Claude Code's existing session has access to files in:",
      '',
      `Target workspace: ${ackResult.workspaceRoot}`,
      '',
      'Re-run with --yes to acknowledge and proceed.',
    ].join('\n');
    process.stderr.write(formatError(new Error(msg), 'review', json) + '\n');
    process.exit(1);
  }

  // 8. Build review prompt.
  // SAME_SESSION_REVIEW_PROMPT accepts { targetTurnIndex?, targetTurnPromptSummary? }.
  // Same-session review relies on Claude's in-context memory; no content injection needed.
  const prompt = SAME_SESSION_REVIEW_PROMPT({
    targetTurnIndex,
    targetTurnPromptSummary: targetTurn.prompt.summary,
  });

  // 9. Reconstitute session handle.
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.claude.startedAt ?? job.createdAt,
  };

  // 10. Call shared helper to send the review turn.
  const { finalJob, sendResult, newTurnIndex } = await sendFollowupTurn({
    jobId,
    prompt,
    driver,
    adapter,
    json,
    sessionHandle,
    job,
    promptSummaryPrefix: '[review] ',
  });

  // 11. Plan 0003 T12b: parse structured findings from the *reconciled* review
  // turn's full result file, not from sendResult.finalMessage. The driver's
  // sendResult.finalMessage is sourced from sidecar `output.result`, which on
  // Claude Code 2.1.150 ends up as a short SUMMARY string ("review verdict:
  // pass — all TODOs found, no omissions") rather than the full assistant
  // message containing the fenced JSON block. The reconciler (transcript /
  // sidecar / logs path) populates `<jobId>.result.md` and mirrors it onto
  // `turn.result.finalMessagePath` — reading that file gives us the
  // structured JSON parseReviewOutput needs. Fall back to
  // sendResult.finalMessage only if the reconciled result file is missing
  // or empty (e.g., when sidecar emits the summary but logs/transcript are
  // not yet flushed). See lib/review-result-source.mjs for the resolver.
  // T12b: Claude Code 2.1.150 can take 3-5 s after the turn-complete state
  // flips to flush its final assistant message to the transcript file. The
  // reconcile inside sendFollowupTurn may race with that flush; this second
  // reconcile gives the transcript path a chance to land the structured
  // output before we read it. Bounded by a brief deterministic sleep so
  // mock-claude tests (which respond instantly) don't slow down.
  let reviewJobForParse = finalJob;
  // Brief pre-reconcile wait so Claude has a moment to flush. The wait is
  // bypassed entirely under the test seam CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS
  // (set to 0 by the mock-driven test env).
  const reviewWaitRaw = process.env.CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS;
  const reviewWaitParsed = reviewWaitRaw != null ? Number(reviewWaitRaw) : NaN;
  const REVIEW_RECONCILE_DELAY_MS = Number.isFinite(reviewWaitParsed)
    ? Math.max(0, reviewWaitParsed)
    : 8_000;
  if (REVIEW_RECONCILE_DELAY_MS > 0) {
    await new Promise((res) => setTimeout(() => res(undefined), REVIEW_RECONCILE_DELAY_MS));
  }
  try {
    const r2 = await reconcileJob(jobId, adapter);
    reviewJobForParse = r2.job;
  } catch {
    // Non-fatal: keep finalJob from sendFollowupTurn.
  }
  const reviewTurnAfter = reviewJobForParse.turns[newTurnIndex];
  const reviewTextSource = await readTurnFinalMessageOrFallback(
    reviewTurnAfter,
    sendResult.finalMessage,
  );

  const review = parseReviewOutput(reviewTextSource);

  // 12. Format and print.
  const reviewTurn = reviewJobForParse.turns[newTurnIndex];
  const turnMeta = {
    index: newTurnIndex,
    status: reviewTurn?.status ?? 'completed',
  };

  if (json) {
    process.stdout.write(
      formatReviewJson({ review, job: reviewJobForParse, turn: turnMeta }) + '\n',
    );
  } else {
    process.stdout.write(
      formatReviewHuman({ review, job: reviewJobForParse, turn: turnMeta }) + '\n',
    );
  }
}

// ---------- adversarial-review ----------

async function cmdAdversarialReview(flags, positional, json) {
  // 1. Parse args: reject inapplicable flags at parse time.

  // --allow-edit is categorically rejected for all review skills.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to review skills. Reviews are read-only.'),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // --name is not accepted; session names are auto-generated.
  if (flags['name'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error(
          '--name is not accepted for adversarial review; session names are generated automatically.',
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // --add-dir is not accepted; the review runs in the target job's workspace.
  if (flags['add-dir'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error(
          "--add-dir is not accepted by $claude-adversarial-review; the review session runs in the target job's workspace.",
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // --mcp-config is not accepted.
  if (flags['mcp-config'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--mcp-config is not accepted by $claude-adversarial-review.'),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 2. jobId-or-prefix positional (required).
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error(
          'usage: cc adversarial-review <jobId-or-prefix> [--all] [--json] [--yes] [--model <model>] [--effort <effort>] [--permission-mode <mode>]',
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // Reject unexpected freeform positional args beyond the job ID.
  if (positional.length > 1) {
    process.stderr.write(
      formatError(
        new Error(
          'adversarial-review does not accept a freeform prompt; the dispatcher constructs the review prompt.',
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 3. Resolve job by prefix.
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    // Hint for likely misuse: user may have passed a freeform prompt instead of a jobId.
    if (prefix.includes(' ') || prefix.length > 50 || !prefix.startsWith('job_')) {
      process.stderr.write(
        '[adversarial-review] Hint: $claude-adversarial-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?\n',
      );
    }
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'adversarial-review', json) + '\n');
    process.exit(1);
  }

  const targetJobId = resolved.match;

  // 4. Reconcile to get fresh status of the target job.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let targetJob;
  try {
    const r = await reconcileJob(targetJobId, adapter);
    targetJob = r.job;
  } catch {
    targetJob = await readJob(targetJobId);
  }

  // 5. Status eligibility check (§ 3.6).
  const { status } = targetJob;

  if (status === 'queued' || status === 'starting') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${targetJobId} is ${status}; wait for the job to produce a result before running $claude-adversarial-review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'running') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${targetJobId} is running; wait for it to produce a result before running $claude-adversarial-review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'needs_input') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${targetJobId} needs input. Resolve the permission request first, then run $claude-adversarial-review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // At this point status is awaiting_followup, completed, stopped, failed, or orphaned.
  // These statuses are allowed IF job.result exists.
  if (!targetJob.result) {
    process.stderr.write(
      formatError(
        new Error(`No reviewable output. The job ${status} before producing a result.`),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 6. Privacy ack — target workspace, 4-step rule.
  const ackResult = resolveWorkspaceAck({
    workspaceRoot: targetJob.workspace.root,
    useYes: Boolean(flags['yes']),
    isTTY: process.stdin.isTTY === true,
  });
  if (ackResult.verdict === 'rejected') {
    const msg = [
      'Privacy acknowledgement required for target workspace.',
      '',
      `This command will start an adversarial review session for job ${targetJobId}.`,
      'The review session will have access to files in:',
      '',
      `Target workspace: ${ackResult.workspaceRoot}`,
      '',
      'Re-run with --yes to acknowledge and proceed.',
    ].join('\n');
    process.stderr.write(formatError(new Error(msg), 'adversarial-review', json) + '\n');
    process.exit(1);
  }

  // 7. Review target selection (§ 3.X): latest completed non-review turn with a result.
  let targetTurn = null;
  let selectedTurnIndex = -1;
  for (let i = targetJob.turns.length - 1; i >= 0; i--) {
    const t = targetJob.turns[i];
    if (
      t.status === 'completed' &&
      t.result != null &&
      !t.prompt.summary.startsWith('[review] ') &&
      !t.prompt.summary.startsWith('[adversarial-review] ')
    ) {
      targetTurn = t;
      selectedTurnIndex = i;
      break;
    }
  }

  if (targetTurn === null) {
    process.stderr.write(
      formatError(
        new Error('No reviewable non-review output found for this job.'),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 8. Read the selected turn's content for prompt injection.
  const originalTaskSummary = targetTurn.prompt.summary;

  // Read finalMessage from the turn's result.finalMessagePath.
  const finalMessagePath = targetTurn.result?.finalMessagePath;
  if (!finalMessagePath) {
    process.stderr.write(
      formatError(
        new Error(
          `Reviewed output file is missing: (no path). Cannot construct adversarial review prompt.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  let finalMessage;
  try {
    finalMessage = await readFile(finalMessagePath, 'utf8');
  } catch {
    process.stderr.write(
      formatError(
        new Error(
          `Reviewed output file is missing: ${finalMessagePath}. Cannot construct adversarial review prompt.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  const touchedFiles = targetJob.result?.touchedFiles;

  // 9. Construct adversarial prompt via ADVERSARIAL_REVIEW_PROMPT.
  const adversarialPrompt = ADVERSARIAL_REVIEW_PROMPT({
    originalTask: originalTaskSummary,
    finalMessage,
    touchedFiles,
  });

  // 10. Start the review session via driver.startSession.
  const repoBasename = basename(targetJob.workspace.root);
  const targetJobIdShort = targetJobId.slice(0, 12);
  const reviewSessionName = `codex:${repoBasename}:review-${targetJobIdShort}`;

  const reviewHandle = await driver.startSession({
    cwd: targetJob.workspace.root,
    prompt: adversarialPrompt,
    name: reviewSessionName,
    model: typeof flags['model'] === 'string' ? flags['model'] : undefined,
    effort: typeof flags['effort'] === 'string' ? flags['effort'] : undefined,
    permissionMode:
      typeof flags['permission-mode'] === 'string' ? flags['permission-mode'] : undefined,
  });

  // 11. Create the review JobRecord via createJob.
  const promptMeta = makePromptMeta(adversarialPrompt);
  const prefixedSummary = `[adversarial-review] ${promptMeta.summary}`;

  const caps = await driver.probe();

  const reviewJob = await createJob({
    codex: {
      cwd: targetJob.workspace.root,
      pluginVersion: PLUGIN_VERSION,
    },
    workspace: {
      root: targetJob.workspace.root,
    },
    driver: {
      name: 'claude-background',
      version: DRIVER_VERSION,
      capabilitiesSnapshot: caps,
    },
    claude: {
      version: caps.claudeVersion ?? 'unknown',
      shortId: reviewHandle.shortId,
      sessionName: reviewHandle.sessionName,
      cwd: reviewHandle.cwd,
      startedAt: reviewHandle.startedAt,
      logsCommand: `claude logs ${reviewHandle.shortId}`,
    },
    prompt: { summary: prefixedSummary, sha256: promptMeta.sha256, bytesLen: promptMeta.bytesLen },
    reviewOf: { jobId: targetJobId, turnIndex: selectedTurnIndex },
  });

  // 12. Build review session handle for stop calls.
  const reviewSessionHandle = {
    driverName: reviewJob.driver.name,
    shortId: reviewHandle.shortId,
    sessionId: reviewHandle.sessionId,
    sessionName: reviewHandle.sessionName,
    cwd: reviewHandle.cwd,
    startedAt: reviewHandle.startedAt,
  };

  // 13. Reconcile loop with DD-1 timeout.
  //
  // Default timeout: 30 minutes (1_800_000 ms).
  // Env-var override: CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS.
  // Defensive parse: parseInt; NaN or <= 0 → use default.
  //
  // Poll interval default: 2000 ms. Override via CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS
  // (TEST SEAM ONLY — not user-facing).
  const ADVERSARIAL_REVIEW_TIMEOUT_DEFAULT_MS = 1_800_000;
  const rawTimeoutEnv = process.env.CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS;
  const parsedTimeoutEnv = rawTimeoutEnv ? parseInt(rawTimeoutEnv, 10) : NaN;
  const ADVERSARIAL_REVIEW_TIMEOUT_MS =
    !Number.isNaN(parsedTimeoutEnv) && parsedTimeoutEnv > 0
      ? parsedTimeoutEnv
      : ADVERSARIAL_REVIEW_TIMEOUT_DEFAULT_MS;

  const ADVERSARIAL_REVIEW_POLL_DEFAULT_MS = 2000;
  const rawPollEnv = process.env.CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS;
  const parsedPollEnv = rawPollEnv ? parseInt(rawPollEnv, 10) : NaN;
  const ADVERSARIAL_REVIEW_POLL_MS =
    !Number.isNaN(parsedPollEnv) && parsedPollEnv > 0
      ? parsedPollEnv
      : ADVERSARIAL_REVIEW_POLL_DEFAULT_MS;

  const reviewAdapter = makeClaudeAdapter(driver, {
    startedAt: reviewHandle.startedAt,
  });

  const startTime = Date.now();
  let currentReviewJob = reviewJob;
  let timedOut = false;

  while (true) {
    // Check timeout first.
    const elapsed = Date.now() - startTime;
    if (elapsed >= ADVERSARIAL_REVIEW_TIMEOUT_MS) {
      timedOut = true;
      break;
    }

    // Poll: wait then reconcile.
    await new Promise((resolve) => setTimeout(resolve, ADVERSARIAL_REVIEW_POLL_MS));

    try {
      const r = await reconcileJob(reviewJob.jobId, reviewAdapter);
      currentReviewJob = r.job;
    } catch {
      // Non-fatal; retry on next iteration.
    }

    // Success path: review job has a result.
    if (currentReviewJob.result) {
      break;
    }

    // Failure path: review job is in a terminal non-result status.
    if (
      currentReviewJob.status === 'failed' ||
      currentReviewJob.status === 'stopped' ||
      currentReviewJob.status === 'orphaned'
    ) {
      // Exit non-zero with the review job's status.
      process.stderr.write(
        formatError(
          new Error(
            `Adversarial review session ended with status: ${currentReviewJob.status}. No findings were produced.`,
          ),
          'adversarial-review',
          json,
        ) + '\n',
      );
      process.exit(1);
    }
  }

  // Timeout cleanup branch (per DD-1 + R16).
  if (timedOut) {
    // Best-effort: stop the review session (errors ignored).
    await driver.stop(reviewSessionHandle).catch(() => {});

    // Mark the review job failed.
    await updateJob(reviewJob.jobId, (current) => ({ ...current, status: 'failed' }));

    // Append review.failed event.
    const now = new Date().toISOString();
    await appendEvent(reviewJob.jobId, {
      type: 'review.failed',
      at: now,
      reason: 'timeout',
      timeoutMs: ADVERSARIAL_REVIEW_TIMEOUT_MS,
    });

    // Leave target job UNCHANGED.

    const timeoutMinutes = Math.round(ADVERSARIAL_REVIEW_TIMEOUT_MS / 60_000);
    process.stderr.write(
      formatError(
        new Error(`Adversarial review did not complete within ${timeoutMinutes} minutes.`),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 14. Parse + format results.
  // Read the final message from the review job's result.finalMessagePath.
  let reviewFinalMessage = '';
  if (currentReviewJob.result?.finalMessagePath) {
    try {
      reviewFinalMessage = await readFile(currentReviewJob.result.finalMessagePath, 'utf8');
    } catch {
      reviewFinalMessage = '';
    }
  }

  const review = parseReviewOutput(reviewFinalMessage);

  if (json) {
    process.stdout.write(
      formatAdversarialReviewJson({
        review,
        job: currentReviewJob,
        targetJob,
      }) + '\n',
    );
  } else {
    // Human format: reuse formatReviewHuman with a synthetic turn shape.
    const turnMeta = {
      index: 0,
      status: currentReviewJob.status,
    };
    process.stdout.write(
      formatReviewHuman({ review, job: currentReviewJob, turn: turnMeta }) + '\n',
    );
  }
}

// ---------- usage ----------

// ---------- workflows ----------

async function cmdWorkflows(flags, positional, json) {
  // --allow-edit is not applicable; this command is read-only.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to $claude-workflows.'),
        'workflows',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  const jobId = positional[0];

  if (jobId) {
    // Drill-in path: inspect a single workflow session.
    const detail = await inspectWorkflow(jobId);
    if (json) {
      process.stdout.write(JSON.stringify(detail, null, 2) + '\n');
    } else {
      const lines = [
        `Workflow session: ${detail.sessionId}`,
        `  Name:      ${detail.name}`,
        `  Status:    ${detail.status}`,
        `  CWD:       ${detail.cwd}`,
        `  StartedAt: ${detail.startedAt ? new Date(detail.startedAt).toISOString() : 'unknown'}`,
      ];
      if (detail.subagents.length > 0) {
        lines.push('', `  Subagents (${detail.subagents.length}):`);
        for (const sa of detail.subagents) {
          const parts = [`    - ${sa.agentId}`];
          if (sa.status) parts.push(`status=${sa.status}`);
          if (sa.tokens != null) parts.push(`tokens=${sa.tokens}`);
          if (sa.duration_ms != null) parts.push(`duration=${sa.duration_ms}ms`);
          if (sa.tool_uses != null) parts.push(`tool_uses=${sa.tool_uses}`);
          lines.push(parts.join(' '));
        }
      } else {
        lines.push('', '  Subagents: none recorded');
      }
      if (detail.phaseRecords.length > 0) {
        lines.push('', `  Phase records (first ${detail.phaseRecords.length} JSONL lines):`);
        for (const rec of detail.phaseRecords.slice(0, 5)) {
          lines.push(`    ${JSON.stringify(rec)}`);
        }
        if (detail.phaseRecords.length > 5) {
          lines.push(`    ... (${detail.phaseRecords.length - 5} more)`);
        }
      }
      process.stdout.write(lines.join('\n') + '\n');
    }
  } else {
    // List path: enumerate workflow sessions.
    const showAll = Boolean(flags['all']);
    const { sessions } = await listWorkflows({ all: showAll });
    if (json) {
      process.stdout.write(JSON.stringify({ sessions }, null, 2) + '\n');
    } else {
      if (sessions.length === 0) {
        process.stdout.write(
          [
            'No workflow sessions found.',
            '',
            'Workflow sessions are background jobs started via $claude-workflow.',
            'Use `cc status` to list all background sessions.',
          ].join('\n') + '\n',
        );
      } else {
        const lines = [`Workflow sessions (${sessions.length}):`];
        for (const s of sessions) {
          lines.push(`  ${s.shortId}  ${s.status.padEnd(10)}  ${s.name.slice(0, 60)}`);
        }
        lines.push('', 'Run `cc workflows <sessionId>` to drill into a session.');
        process.stdout.write(lines.join('\n') + '\n');
      }
    }
  }
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: cc <command> [options]',
      '',
      'Commands:',
      '  setup                                     Run doctor probes and report status',
      '  delegate [flags] -- <prompt>              Start a Claude background session',
      '  workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)',
      '  goal [flags] -- <condition>               Start a Claude Code background session with a /goal condition',
      '  fork [flags] -- <directive>               Fork a Claude Code subagent for a directive',
      '  batch [flags] -- <instruction>            Run a batch of parallel Claude Code instructions',
      '  deep-research [flags] -- <question>       Run a Claude Code /deep-research workflow (multi-agent fan-out with WebSearch)',
      '  status [--all] [--json]                   List jobs for current workspace',
      '  result <jobId> [--all] [--json]           Show final result of a completed job',
      '  stop <jobId> [--all] [--json]             Stop a running job',
      '  stop --all-awaiting-followup [--all]      Bulk-stop awaiting-followup jobs',
      '  followup <jobId> [flags] -- <prompt>      Send a follow-up prompt to an existing job',
      '  review <jobId-or-prefix> [--all] [--json] [--yes]',
      '                                            Same-session structured review of the latest non-review turn',
      '  adversarial-review <jobId-or-prefix> [--all] [--json] [--yes] [--model <model>] [--effort <effort>] [--permission-mode <mode>]',
      '                                            Fresh-session independent review of the latest non-review turn',
      '  workflows [<jobId>] [--all] [--json]      List workflow sessions or drill into one (read-only; no subprocess spawned)',
      '',
      'Flags:',
      '  --json                       Machine-readable JSON output (status/result/stop/followup/review/adversarial-review/goal/fork/batch/deep-research/workflows)',
      '  --yes                        Acknowledge privacy disclosure automatically (delegate/workflow/goal/fork/batch/deep-research/followup/review/adversarial-review)',
      '  --name <name>                Session name (delegate, workflow, goal, fork, batch, deep-research)',
      '  --model <model>              Model selection (delegate, workflow, goal, fork, batch, deep-research, adversarial-review)',
      '  --effort <effort>            Effort level (delegate, workflow, goal, fork, batch, deep-research, adversarial-review)',
      '  --permission-mode <mode>     Permission mode (delegate, workflow, goal, fork, batch, deep-research, adversarial-review)',
      '  --add-dir <dir>              Additional directory (delegate, workflow, goal, fork, batch, deep-research; repeatable)',
      '  --mcp-config <path>          MCP config file (delegate, workflow, goal, fork, batch, deep-research)',
      '  --allow-edit                 Policy/framing flag (delegate, followup); does NOT bypass the privacy acknowledgement and is rejected by review, adversarial-review, workflow, goal, fork, batch, deep-research, and workflows',
      '  --all                        Search all workspaces (status/result/stop/followup/review/adversarial-review)',
      '  --all-awaiting-followup      Bulk-stop all awaiting-followup jobs (stop only; combine with --all for every workspace)',
      '  --help                       Show this help',
      '',
    ].join('\n'),
  );
}
