#!/usr/bin/env node
// claude-companion.mjs — user-facing CLI dispatcher for the cc-plugin-codex plugin.
//
// Subcommands: setup | delegate | status | result | stop
// Exit codes: 0 success, 1 failure, 2 usage error

import { createInterface } from 'node:readline/promises';
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
import {
  ClaudeBackgroundDriver,
  DRIVER_VERSION,
  ptyBuildExtraProbe,
} from '@cc-plugin-codex/driver-claude-code';

import { parseArgs, resolveJobIdPrefix } from './lib/args.mjs';
import {
  formatSetup,
  formatDelegate,
  formatStatus,
  formatResult,
  formatStop,
  formatBulkStop,
  formatFollowup,
  formatError,
} from './lib/format.mjs';
import { makeClaudeAdapter } from './lib/adapter.mjs';
import { hasAck, recordAck, resolveWorkspaceAck } from './lib/ack.mjs';
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
    case 'followup':
      await cmdFollowup(flags, positional, useJson);
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
  const report = await runDoctor({ extraProbes: [ptyBuildExtraProbe] });
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

  // Single-job path (unchanged).
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(new Error('usage: claude-companion stop <jobId>'), 'stop', json) + '\n',
    );
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
        new Error('usage: claude-companion followup <jobId-or-prefix> [flags] -- "<prompt>"'),
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
        new Error(`prompt is required: claude-companion followup <jobId-or-prefix> -- "<prompt>"`),
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

  // 9. Build new TurnRecord and append to job.turns.
  const now = new Date().toISOString();
  const newTurnIndex = job.turns.length;
  const promptMeta = makePromptMeta(prompt);
  const newTurn = {
    prompt: promptMeta,
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

  // 14. Print result.
  process.stdout.write(formatFollowup(finalJob, sendResult, newTurnIndex, json) + '\n');
}

// ---------- usage ----------

function printUsage() {
  process.stdout.write(
    [
      'Usage: claude-companion <command> [options]',
      '',
      'Commands:',
      '  setup                                     Run doctor probes and report status',
      '  delegate [flags] -- <prompt>              Start a Claude background session',
      '  status [--all]                            List jobs for current workspace',
      '  result <jobId> [--all]                    Show final result of a completed job',
      '  stop <jobId> [--all]                      Stop a running job',
      '  followup <jobId> [flags] -- <prompt>      Send a follow-up prompt to an existing job',
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
      '  --allow-edit                 Allow edit mode for delegate/followup',
      '  --all                        Search all workspaces (status/result/stop/followup)',
      '  --all-awaiting-followup      Bulk-stop all awaiting-followup jobs (stop only; combine with --all for every workspace)',
      '  --help                       Show this help',
      '',
    ].join('\n'),
  );
}
