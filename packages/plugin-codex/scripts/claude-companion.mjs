#!/usr/bin/env node
// claude-companion.mjs — user-facing CLI dispatcher for the cc-plugin-codex plugin.
//
// Subcommands: setup | delegate | status | result | stop
// Exit codes: 0 success, 1 failure, 2 usage error

import { readFile } from 'node:fs/promises';

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
import { ClaudeBackgroundDriver, DRIVER_VERSION } from '@cc-plugin-codex/driver-claude-code';

import { parseArgs, resolveJobIdPrefix } from './lib/args.mjs';
import {
  formatSetup,
  formatDelegate,
  formatStatus,
  formatResult,
  formatStop,
  formatError,
} from './lib/format.mjs';
import { makeClaudeAdapter } from './lib/adapter.mjs';
import { hasAck, recordAck } from './lib/ack.mjs';
import { makePromptMeta } from './lib/prompt-meta.mjs';

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
    case 'status':
      await cmdStatus(flags, useJson);
      break;
    case 'result':
      await cmdResult(flags, positional, useJson);
      break;
    case 'stop':
      await cmdStop(flags, positional, useJson);
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
  const report = await runDoctor();
  process.stdout.write(formatSetup(report, json) + '\n');
  if (report.status === 'fail') {
    process.exit(1);
  }
}

// ---------- delegate ----------

async function cmdDelegate(flags, positional, json) {
  // 1. Collect prompt from positionals (after -- or all remaining).
  const prompt = positional.join(' ').trim();
  if (!prompt) {
    process.stderr.write(
      formatError(
        new Error('prompt is required: claude-companion delegate -- "<prompt>"'),
        'delegate',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

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
      process.stderr.write(formatError(new Error(msg), 'delegate', json) + '\n');
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
      '\nRun: claude-companion setup',
    ].join('');
    process.stderr.write(formatError(new Error(detail), 'delegate', json) + '\n');
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
      pluginVersion: '0.0.0',
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
    process.stderr.write(
      formatError(new Error('usage: claude-companion result <jobId>'), 'result', json) + '\n',
    );
    process.exit(2);
  }

  const workspace = process.cwd();
  const result = await listJobs();
  const allIds = result.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : `No job found matching "${prefix}"`;
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

  const terminalStatuses = new Set(['completed', 'failed', 'stopped', 'orphaned']);
  if (!terminalStatuses.has(job.status)) {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is not complete yet (status: ${job.status}). Run: claude-companion status`,
        ),
        'result',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

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
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(new Error('usage: claude-companion stop <jobId>'), 'stop', json) + '\n',
    );
    process.exit(2);
  }

  const workspace = process.cwd();
  const listResult = await listJobs();
  const allIds = listResult.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? `Ambiguous job ID prefix "${prefix}". Matches: ${resolved.candidates.join(', ')}`
        : `No job found matching "${prefix}"`;
    process.stderr.write(formatError(new Error(msg), 'stop', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  const job = await readJob(jobId);

  // Reconstitute session handle from job record.
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.createdAt,
  };

  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  await driver.stop(sessionHandle);

  const now = new Date().toISOString();
  const stoppedJob = await updateJob(jobId, (current) => ({
    ...current,
    status: 'stopped',
  }));
  await appendEvent(jobId, { type: 'stop.requested', at: now });

  process.stdout.write(formatStop(stoppedJob, json) + '\n');
}

// ---------- usage ----------

function printUsage() {
  process.stdout.write(
    [
      'Usage: claude-companion <command> [options]',
      '',
      'Commands:',
      '  setup                        Run doctor probes and report status',
      '  delegate [flags] -- <prompt> Start a Claude background session',
      '  status [--all]               List jobs for current workspace',
      '  result <jobId>               Show final result of a completed job',
      '  stop <jobId>                 Stop a running job',
      '',
      'Flags:',
      '  --json                       Machine-readable JSON output',
      '  --yes                        Acknowledge privacy disclosure automatically',
      '  --name <name>                Session name for delegate',
      '  --model <model>              Model for delegate',
      '  --effort <effort>            Effort level for delegate',
      '  --permission-mode <mode>     Permission mode for delegate',
      '  --add-dir <dir>              Additional directory for delegate (repeatable)',
      '  --mcp-config <path>          MCP config file for delegate',
      '  --allow-edit                 Allow edit mode for delegate',
      '  --all                        Show all jobs (status command)',
      '  --help                       Show this help',
      '',
    ].join('\n'),
  );
}
