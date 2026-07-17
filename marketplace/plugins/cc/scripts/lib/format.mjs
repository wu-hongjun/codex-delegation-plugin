// format.mjs — human-readable and JSON output formatters for each subcommand.

// ---------- T7 helpers (module-private) ----------

/**
 * Produce a human-readable annotation for a review-job row.
 * Returns a string like " (review of <jobId>)" or " (review of <jobId> turn N)"
 * when `reviewOf` is set; returns '' otherwise.
 *
 * Design choice: `turnIndex` is included when present (informative for
 * cross-referencing which turn was reviewed).
 *
 * @param {import('@cc-plugin-codex/runtime').ReviewOfContext | undefined} reviewOf
 * @returns {string}
 */
function reviewOfLabel(reviewOf) {
  if (!reviewOf) return '';
  if (reviewOf.turnIndex !== undefined) {
    return ` (review of ${reviewOf.jobId} turn ${reviewOf.turnIndex})`;
  }
  return ` (review of ${reviewOf.jobId})`;
}

/**
 * Classify a turn's kind based on its `prompt.summary` prefix.
 * Returns `'review'`, `'adversarial_review'`, or `undefined` (no `kind` key
 * emitted for non-review turns).
 *
 * @param {{ prompt?: { summary?: string } } | undefined} turn
 * @returns {'review' | 'adversarial_review' | undefined}
 */
function classifyTurnKind(turn) {
  const summary = turn?.prompt?.summary ?? '';
  if (summary.startsWith('[review] ')) return 'review';
  if (summary.startsWith('[adversarial-review] ')) return 'adversarial_review';
  return undefined;
}

function isBlockingReview(review) {
  if (review.verdict === 'fail') return true;
  return review.findings.some((f) => f.severity === 'high' || f.severity === 'blocker');
}

function isNonTerminalJobStatus(status) {
  return (
    status === 'queued' ||
    status === 'starting' ||
    status === 'running' ||
    status === 'needs_input' ||
    status === 'awaiting_followup'
  );
}

function isFinalResultStatus(status) {
  return status === 'completed' || status === 'awaiting_followup';
}

function shellQuote(value) {
  return JSON.stringify(value);
}

function exactDispatcherCommand(dispatcherPath, command) {
  return dispatcherPath ? `node ${shellQuote(dispatcherPath)} ${command}` : command;
}

function displayDispatcherCommand(dispatcherPath, command, wrapperCommand = null) {
  if (dispatcherPath) return exactDispatcherCommand(dispatcherPath, command);
  return wrapperCommand ?? command;
}

function jobSession(job) {
  return job.session ?? { ...job.claude, provider: 'claude' };
}

function jobProvider(job) {
  return jobSession(job).provider === 'agy' || job.driver?.name === 'agy-cli' ? 'agy' : 'claude';
}

function providerUi(job) {
  const provider = jobProvider(job);
  const session = jobSession(job);
  if (provider === 'agy') {
    return {
      provider,
      name: 'Antigravity',
      sessionLabel: 'Agy process',
      skillPrefix: 'agy',
      supportsFollowup: false,
      attachCommand: null,
      logsCommand: session.logsCommand ?? null,
    };
  }
  return {
    provider,
    name: 'Claude',
    sessionLabel: 'Claude session',
    skillPrefix: 'claude',
    supportsFollowup: true,
    attachCommand: session.shortId ? `claude attach ${session.shortId}` : null,
    logsCommand: session.logsCommand ?? (session.shortId ? `claude logs ${session.shortId}` : null),
  };
}

function classifyResultState(job, hasResult, latestTurnResultState) {
  if (!hasResult) return 'none';
  if (latestTurnResultState === 'final') return 'final_result_available';
  if (job.status === 'orphaned') return 'orphaned_partial_result_available';
  return 'partial_result_available';
}

function recommendedNextAction(job, hasResult, resultState) {
  const ui = providerUi(job);
  if (resultState === 'orphaned_partial_result_available') return 'result --partial';
  if (job.status === 'needs_input')
    return ui.attachCommand ? 'attach | stop | restart' : 'stop | restart';
  if (job.status === 'awaiting_followup') return ui.supportsFollowup ? 'followup' : 'result';
  if (job.status === 'completed') return hasResult ? 'result' : 'logs';
  if (hasResult && resultState === 'partial_result_available') return 'result --partial';
  if (job.status === 'orphaned') return ui.logsCommand ? 'logs' : 'stop';
  if (isNonTerminalJobStatus(job.status)) return 'status';
  return hasResult ? 'result' : 'status';
}

function classifyWaiting(waitingFor, opts = {}) {
  if (waitingFor == null || waitingFor === '') return null;
  const launchPolicy = opts.launchPolicy ?? {};
  const unattendedRequested =
    launchPolicy.unattendedRequested === true ||
    launchPolicy.dangerouslySkipPermissions === true ||
    launchPolicy.permissionMode === 'bypassPermissions';
  const text = String(waitingFor);
  const lower = text.toLowerCase();
  let parsed = null;
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value;
    }
  } catch {
    // waitingFor is commonly a plain string such as "permission prompt".
  }
  const browserRelated = /\b(browser|chrome|extension)\b/.test(lower);
  const selectionRelated = /\b(choose|pick|select|selection|which|browser\s+\d|let me pick)\b/.test(
    lower,
  );
  const category =
    browserRelated && selectionRelated
      ? 'browser_selection'
      : lower.includes('permission')
        ? 'permission_prompt'
        : lower.includes('blocked') || lower.includes('waiting') || lower.includes('input')
          ? 'input_prompt'
          : 'other';
  const kind = lower.includes('permission')
    ? 'permission'
    : category === 'browser_selection' ||
        lower.includes('blocked') ||
        lower.includes('waiting') ||
        lower.includes('input')
      ? 'input'
      : 'other';
  const requestedAction =
    typeof parsed?.command === 'string'
      ? parsed.command
      : typeof parsed?.tool === 'string'
        ? parsed.tool
        : typeof parsed?.action === 'string'
          ? parsed.action
          : null;
  const attachCommand = opts.shortId ? `claude attach ${opts.shortId}` : null;
  const note =
    category === 'browser_selection'
      ? 'Claude Code requires an interactive Chrome browser selection. Choose the browser with the logged-in session in the attached TUI; the cc wrapper cannot select it safely in the background.'
      : kind === 'permission'
        ? unattendedRequested
          ? 'Claude Code is waiting on a permission prompt even though unattended bypass was requested. The cc wrapper cannot safely approve it non-interactively; attach to inspect, or stop and rerun after fixing the underlying Claude Code/tool configuration.'
          : 'Claude Code is waiting on a permission prompt. The cc wrapper cannot approve it non-interactively; attach to the session or restart a trusted future run with an explicit permission mode.'
        : 'Claude Code is waiting for interactive input. Attach to the session to continue.';
  const futureUnattendedHint =
    category === 'browser_selection'
      ? 'For unattended Chrome work, connect only the intended Chrome browser before starting, or start attached; permission-mode flags do not choose between browsers.'
      : kind === 'permission' && !unattendedRequested
        ? 'For trusted unattended shell/tool work, start a new job with --bypass-permissions, --permission-mode bypassPermissions, or --dangerously-skip-permissions when appropriate.'
        : null;
  return {
    kind,
    category,
    detail: text,
    requestedAction,
    action: 'attach',
    manualInputRequired: true,
    canApproveNonInteractively: false,
    unattendedRequested,
    ...(attachCommand ? { userAction: attachCommand } : {}),
    note,
    ...(futureUnattendedHint ? { futureUnattendedHint } : {}),
  };
}

function operatorStateForJob(job, waiting) {
  if (job.status !== 'needs_input') return job.status;
  if (waiting?.category === 'browser_selection') return 'blocked_on_browser_selection';
  if (waiting?.kind === 'permission') return 'blocked_on_permission';
  return 'needs_manual_input';
}

const DEFAULT_STALE_AFTER_MS = 2 * 60 * 1000;

function timestampAgeSeconds(iso, now = Date.now()) {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / 1000));
}

function processFreshness(job, lastObservedAt) {
  const ageSeconds = timestampAgeSeconds(lastObservedAt);
  const nonTerminal = isNonTerminalJobStatus(job.status);
  const staleAfterSeconds = nonTerminal ? Math.floor(DEFAULT_STALE_AFTER_MS / 1000) : null;
  const stale = staleAfterSeconds != null && ageSeconds != null && ageSeconds >= staleAfterSeconds;
  return {
    lastObservedAt,
    ageSeconds,
    evaluated: nonTerminal,
    reason: nonTerminal ? 'non_terminal_process' : 'terminal_status',
    stale,
    ...(staleAfterSeconds != null ? { staleAfterSeconds } : {}),
    ...(stale ? { noNewOutputSince: lastObservedAt } : {}),
  };
}

function effectiveLatestTurnStatus(job, latestTurn, latestTurnResultState) {
  const rawStatus = latestTurn?.status ?? null;
  if (latestTurnResultState === 'final') return 'completed';
  if (latestTurnResultState === 'partial') return 'partial_result_available';
  if (job.status === 'orphaned' && rawStatus === 'queued') return 'orphaned';
  return rawStatus;
}

function formatAge(iso) {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) return '?';
  const elapsed = Math.max(0, Date.now() - ms);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Compact public job shape for automation. This intentionally does not spread
 * JobRecord: driver probes, auth diagnostics, workspace paths, prompts, and raw
 * usage snapshots can be large or sensitive.
 *
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {{ dispatcherPath?: string | null }} [opts]
 * @returns {object}
 */
function summarizeJob(job, opts = {}) {
  const turnCount = Array.isArray(job.turns) ? job.turns.length : 0;
  const latestTurnIndex = turnCount > 0 ? turnCount - 1 : -1;
  const latestTurn = latestTurnIndex >= 0 ? job.turns[latestTurnIndex] : undefined;
  const latestKind = classifyTurnKind(latestTurn);
  const session = jobSession(job);
  const ui = providerUi(job);
  const shortId = session.shortId ?? null;
  const waitingFor = job.status === 'needs_input' ? (session.waitingFor ?? null) : null;
  const rawLaunchPolicy = session.launchPolicy ?? {};
  const launchPolicy = {
    permissionMode: rawLaunchPolicy.permissionMode ?? null,
    dangerouslySkipPermissions: rawLaunchPolicy.dangerouslySkipPermissions === true,
    allowDangerouslySkipPermissions: rawLaunchPolicy.allowDangerouslySkipPermissions === true,
    unattendedRequested:
      rawLaunchPolicy.unattendedRequested === true ||
      rawLaunchPolicy.dangerouslySkipPermissions === true ||
      rawLaunchPolicy.permissionMode === 'bypassPermissions',
  };
  const waiting = classifyWaiting(waitingFor, { shortId, launchPolicy });
  const hasResult = job.result !== undefined;
  const latestTurnHasResult = latestTurn?.result !== undefined;
  const latestTurnResultState = latestTurnHasResult
    ? latestTurn?.status === 'completed' || isFinalResultStatus(job.status)
      ? 'final'
      : 'partial'
    : 'none';
  const resultIsPartial = hasResult && latestTurnResultState !== 'final';
  const resultState = classifyResultState(job, hasResult, latestTurnResultState);
  const recommended = recommendedNextAction(job, hasResult, resultState);
  const lastObservedAt = job.updatedAt ?? job.createdAt ?? null;
  const freshness = processFreshness(job, lastObservedAt);
  const operatorState = operatorStateForJob(job, waiting);
  const latestTurnRawStatus = latestTurn?.status ?? null;
  const latestTurnEffectiveStatus = effectiveLatestTurnStatus(
    job,
    latestTurn,
    latestTurnResultState,
  );
  const exactActionHints =
    opts.dispatcherPath == null
      ? null
      : {
          status: exactDispatcherCommand(
            opts.dispatcherPath,
            `status --job ${job.jobId} --json --compact`,
          ),
          result: exactDispatcherCommand(opts.dispatcherPath, `result ${job.jobId}`),
          ...(hasResult
            ? {
                partialResult: exactDispatcherCommand(
                  opts.dispatcherPath,
                  `result ${job.jobId} --partial`,
                ),
              }
            : {}),
          ...(isNonTerminalJobStatus(job.status)
            ? { stop: exactDispatcherCommand(opts.dispatcherPath, `stop ${job.jobId}`) }
            : {}),
          ...(job.status === 'needs_input'
            ? {
                restart: exactDispatcherCommand(
                  opts.dispatcherPath,
                  `restart ${job.jobId} -- "<prompt>"`,
                ),
                restartWithBypass: exactDispatcherCommand(
                  opts.dispatcherPath,
                  `restart ${job.jobId} --bypass-permissions -- "<prompt>"`,
                ),
                cleanupBlocked: exactDispatcherCommand(
                  opts.dispatcherPath,
                  'stop --all-needs-input',
                ),
              }
            : {}),
          ...(job.status === 'awaiting_followup' && ui.supportsFollowup
            ? {
                followup: exactDispatcherCommand(
                  opts.dispatcherPath,
                  `followup ${job.jobId} -- "<prompt>"`,
                ),
              }
            : {}),
          ...(ui.attachCommand ? { attach: ui.attachCommand } : {}),
          ...(ui.logsCommand ? { logs: ui.logsCommand } : {}),
        };
  const actionHints = {
    status: displayDispatcherCommand(
      opts.dispatcherPath,
      `status --job ${job.jobId} --json --compact`,
      `$${ui.skillPrefix}-status --job ${job.jobId} --json --compact`,
    ),
    result: displayDispatcherCommand(
      opts.dispatcherPath,
      `result ${job.jobId}`,
      `$${ui.skillPrefix}-result ${job.jobId}`,
    ),
    ...(hasResult
      ? {
          partialResult: displayDispatcherCommand(
            opts.dispatcherPath,
            `result ${job.jobId} --partial`,
            `$${ui.skillPrefix}-result ${job.jobId} --partial`,
          ),
        }
      : {}),
    ...(isNonTerminalJobStatus(job.status)
      ? {
          stop: displayDispatcherCommand(
            opts.dispatcherPath,
            `stop ${job.jobId}`,
            `$${ui.skillPrefix}-stop ${job.jobId}`,
          ),
        }
      : {}),
    ...(job.status === 'needs_input'
      ? {
          restart: displayDispatcherCommand(
            opts.dispatcherPath,
            `restart ${job.jobId} -- "<prompt>"`,
          ),
          restartWithBypass: displayDispatcherCommand(
            opts.dispatcherPath,
            `restart ${job.jobId} --bypass-permissions -- "<prompt>"`,
          ),
          cleanupBlocked: displayDispatcherCommand(
            opts.dispatcherPath,
            'stop --all-needs-input',
            '$claude-stop --all-needs-input',
          ),
        }
      : {}),
    ...(job.status === 'awaiting_followup' && ui.supportsFollowup
      ? {
          followup: displayDispatcherCommand(
            opts.dispatcherPath,
            `followup ${job.jobId} -- "<prompt>"`,
            `$claude-followup ${job.jobId} -- "<prompt>"`,
          ),
        }
      : {}),
    ...(ui.attachCommand ? { attach: ui.attachCommand } : {}),
    ...(ui.logsCommand ? { logs: ui.logsCommand } : {}),
  };

  return {
    jobId: job.jobId,
    provider: ui.provider,
    status: job.status,
    operatorState,
    ...(job.status === 'needs_input'
      ? {
          blockedOn: {
            category: waiting?.category ?? 'unknown',
            kind: waiting?.kind ?? 'unknown',
            since: lastObservedAt,
            ageSeconds: freshness.ageSeconds,
            detail: waitingFor,
            manualInputRequired: waiting?.manualInputRequired ?? true,
            canApproveNonInteractively: false,
            unattendedRequested: launchPolicy.unattendedRequested,
          },
        }
      : {}),
    launchPolicy,
    process: {
      state: job.status,
      shortId,
      lastObservedAt,
      lastObservedAgeSeconds: freshness.ageSeconds,
      freshnessEvaluated: freshness.evaluated,
      freshnessReason: freshness.reason,
      stale: freshness.stale,
      ...(freshness.staleAfterSeconds != null
        ? { staleAfterSeconds: freshness.staleAfterSeconds }
        : {}),
      ...(freshness.noNewOutputSince ? { noNewOutputSince: freshness.noNewOutputSince } : {}),
      orphaned: job.status === 'orphaned',
    },
    freshness,
    resultState,
    recommendedNextAction: recommended,
    shortId,
    sessionName: session.sessionName ?? null,
    waitingFor,
    waiting,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.reviewOf !== undefined ? { reviewOf: job.reviewOf } : {}),
    actionHints,
    ...(exactActionHints != null ? { exactActionHints } : {}),
    turnCount,
    latestTurn:
      latestTurnIndex >= 0
        ? {
            index: latestTurnIndex,
            status: latestTurnEffectiveStatus,
            rawStatus: latestTurnRawStatus,
            ...(latestKind !== undefined ? { kind: latestKind } : {}),
            startedAt: latestTurn?.startedAt ?? null,
            endedAt: latestTurn?.endedAt ?? null,
            hasResult: latestTurnHasResult,
            resultState: latestTurnResultState,
            finalMessagePreview: latestTurn?.result?.finalMessagePreview ?? null,
          }
        : null,
    result: {
      hasResult,
      isPartial: resultIsPartial,
      finalMessagePreview: job.result?.finalMessagePreview ?? null,
      finalMessagePath: job.result?.finalMessagePath ?? null,
      touchedFiles: Array.isArray(job.result?.touchedFiles) ? job.result.touchedFiles : [],
    },
  };
}

function waitTimeoutRecovery(compact, resultText) {
  const partialResultAvailable =
    compact.resultState === 'partial_result_available' ||
    compact.resultState === 'orphaned_partial_result_available' ||
    (typeof resultText === 'string' && resultText.length > 0);
  return {
    message:
      'Wait timed out before the job reached a terminal or follow-up state. The Claude job may still be healthy; inspect status or read the latest recorded partial output.',
    status: compact.actionHints?.status ?? null,
    partialResult: partialResultAvailable ? (compact.actionHints?.partialResult ?? null) : null,
    result: compact.actionHints?.result ?? null,
    stop: compact.actionHints?.stop ?? null,
    attach: compact.actionHints?.attach ?? null,
    lastObservedAt: compact.process?.lastObservedAt ?? null,
    lastObservedAgeSeconds: compact.process?.lastObservedAgeSeconds ?? null,
    resultState: compact.resultState,
    operatorState: compact.operatorState,
  };
}

function statusMeta(opts) {
  const meta = {};
  if (opts.storedStatusFilter != null) meta.storedStatusFilter = opts.storedStatusFilter;
  if (opts.limit != null) meta.limit = opts.limit;
  if (opts.hiddenCount != null && opts.hiddenCount > 0) meta.hiddenCount = opts.hiddenCount;
  if (opts.versionMismatch != null) meta.versionMismatch = opts.versionMismatch;
  if (opts.dispatcherPath != null) meta.dispatcherPath = opts.dispatcherPath;
  return Object.keys(meta).length > 0 ? meta : null;
}

function setupWarnings(report) {
  return report.probes
    .filter((p) => p.status === 'warn')
    .map((p) => ({ name: p.name, detail: p.detail }));
}

function setupSummary(report) {
  const warnings = setupWarnings(report).map((w) => w.name);
  const warningText = warnings.length > 0 ? warnings.join(', ') : 'none';
  return `delegate ${report.delegateCapability}; follow-up ${report.followupCapability}; warnings: ${warningText}`;
}

function setupWorkflow() {
  return ['delegate', 'status --job', 'result --partial/result', 'followup/stop'];
}

/**
 * @param {import('@cc-plugin-codex/runtime').DoctorReport} report
 * @param {boolean} json
 * @returns {string}
 */
export function formatSetup(report, json) {
  if (json) {
    return JSON.stringify(
      {
        ok: report.status !== 'fail',
        status: report.status,
        delegateCapability: report.delegateCapability,
        followupCapability: report.followupCapability,
        summary: setupSummary(report),
        warnings: setupWarnings(report),
        workflow: setupWorkflow(),
        generatedAt: report.generatedAt,
        probes: report.probes,
      },
      null,
      2,
    );
  }

  const fmtIcon = (s) => (s === 'ok' ? 'ok  ' : s === 'warn' ? 'warn' : 'FAIL');
  const fmtRow = (p) => `  ${fmtIcon(p.status)}  ${p.name.padEnd(30)} ${p.detail}`;

  const overall = report.status === 'fail' ? 'FAIL' : report.status === 'warn' ? 'warn' : 'ok';

  // Group probes for human-readable output. A probe may belong to both capability groups,
  // be follow-up-specific, or be informational. We render three buckets:
  //   1) Shared / Plan 0001 delegate-and-followup probes (the bulk of the setup output)
  //   2) Plan 0002 follow-up-only probes
  //   3) Informational probes (gate neither capability)
  const includes = (p, cap) => Array.isArray(p.capabilities) && p.capabilities.includes(cap);
  const shared = report.probes.filter((p) => includes(p, 'delegate') && includes(p, 'followup'));
  const followupOnly = report.probes.filter(
    (p) => includes(p, 'followup') && !includes(p, 'delegate'),
  );
  const informational = report.probes.filter(
    (p) => !includes(p, 'delegate') && !includes(p, 'followup'),
  );

  const sections = [];
  sections.push(
    `Claude companion setup — ${overall}`,
    `  delegate capability: ${report.delegateCapability}`,
    `  follow-up capability: ${report.followupCapability}`,
    `  summary: ${setupSummary(report)}`,
    `  workflow: ${setupWorkflow().join(' -> ')}`,
  );
  if (shared.length > 0) {
    sections.push('', 'Shared (delegate + follow-up):', ...shared.map(fmtRow));
  }
  if (followupOnly.length > 0) {
    sections.push('', 'Follow-up only (plan 0002):', ...followupOnly.map(fmtRow));
  }
  if (informational.length > 0) {
    sections.push(
      '',
      'Informational (does not gate either capability):',
      ...informational.map(fmtRow),
    );
  }
  sections.push('', `Generated: ${report.generatedAt}`);
  return sections.join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {boolean} json
 * @param {{ compact?: boolean }} [opts]
 * @returns {string}
 */
export function formatDelegate(job, json, opts = {}) {
  if (json) {
    return JSON.stringify({ ok: true, job: opts.compact ? summarizeJob(job, opts) : job }, null, 2);
  }

  const session = jobSession(job);
  const ui = providerUi(job);
  return [
    `${ui.name} job started`,
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `${`${ui.sessionLabel}:`.padEnd(16)}${session.shortId}`,
    `Name:           ${session.sessionName}`,
    ...(ui.logsCommand ? [`Raw logs:       ${ui.logsCommand}`] : []),
    'Run:',
    `  $${ui.skillPrefix}-status`,
    `  $${ui.skillPrefix}-result ${job.jobId}`,
  ].join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord[]} jobs
 * @param {boolean} json
 * @param {string} workspaceRoot
 * @param {{ compact?: boolean; singleJob?: boolean; limit?: number | null; storedStatusFilter?: string | null; hiddenCount?: number }} [opts]
 * @returns {string}
 */
export function formatStatus(jobs, json, workspaceRoot, opts = {}) {
  if (json) {
    const meta = statusMeta(opts);
    if (opts.singleJob) {
      const job = jobs[0] ?? null;
      return JSON.stringify(
        { ok: true, job: job ? summarizeJob(job, opts) : null, ...(meta ? { meta } : {}) },
        null,
        2,
      );
    }
    if (opts.compact) {
      return JSON.stringify(
        { ok: true, jobs: jobs.map((job) => summarizeJob(job, opts)), ...(meta ? { meta } : {}) },
        null,
        2,
      );
    }
    // Enrich each job's turns with a `kind` field where applicable.
    // `reviewOf` is already part of JobRecord and serialises as-is (omitted when absent).
    const enrichedJobs = jobs.map((j) => {
      const enrichedTurns = Array.isArray(j.turns)
        ? j.turns.map((t) => {
            const kind = classifyTurnKind(t);
            if (kind !== undefined) {
              return { ...t, kind };
            }
            return t;
          })
        : j.turns;
      return { ...j, turns: enrichedTurns };
    });
    return JSON.stringify({ ok: true, jobs: enrichedJobs, ...(meta ? { meta } : {}) }, null, 2);
  }

  if (jobs.length === 0) {
    return 'No delegated jobs found for this workspace.';
  }

  if (opts.singleJob) {
    const j = jobs[0];
    const session = jobSession(j);
    const ui = providerUi(j);
    const annotation = reviewOfLabel(j.reviewOf);
    const lines = [
      `${ui.name} job`,
      `Job ID:         ${j.jobId}`,
      `Status:         ${j.status}`,
      `Process:        ${j.status}`,
      `${`${ui.sessionLabel}:`.padEnd(16)}${session.shortId}`,
      `Name:           ${session.sessionName}${annotation}`,
    ];
    const compact = summarizeJob(j, opts);
    lines.push(`Result state:   ${compact.resultState}`);
    lines.push(`Operator state: ${compact.operatorState}`);
    lines.push(`Next:           ${compact.recommendedNextAction}`);
    lines.push(`Last observed:  ${compact.process.lastObservedAt ?? '(unknown)'}`);
    if (j.result?.finalMessagePreview) {
      lines.push(`Result:         ${j.result.finalMessagePreview}`);
    }
    if (j.status === 'needs_input' && session.waitingFor) {
      const waiting = compact.waiting;
      lines.push(`Waiting:        ${session.waitingFor}`);
      if (waiting?.category) {
        lines.push(`Waiting type:   ${waiting.category}`);
      }
      lines.push(`Manual action:  ${waiting?.userAction ?? compact.actionHints.stop}`);
      if (waiting?.note) {
        lines.push(`Note:           ${waiting.note}`);
      }
      lines.push(`Stop:           ${compact.actionHints.stop}`);
      lines.push(`Restart:        ${compact.actionHints.restartWithBypass}`);
      lines.push(`Prompt summary: ${j.prompt?.summary ?? '(not recorded)'}`);
      if (j.result?.finalMessagePreview) {
        lines.push(`Partial result: ${compact.actionHints.partialResult}`);
      }
    }
    if (opts.versionMismatch) {
      lines.push(
        '',
        `Version warning: dispatcher ${opts.versionMismatch.dispatcherVersion} is running while this workspace declares ${opts.versionMismatch.worktreeVersion}. Refresh the installed cc plugin or use the workspace dispatcher directly.`,
      );
    }
    return lines.join('\n');
  }

  const header = `Delegated jobs for ${workspaceRoot}`;
  const columnHeader = [
    'JOB ID'.padEnd(32),
    'STATUS'.padEnd(14),
    'AGE'.padEnd(6),
    'PROVIDER'.padEnd(12),
    'SESSION'.padEnd(16),
    'NAME',
  ].join('  ');
  const rows = jobs.map((j) => {
    const session = jobSession(j);
    const ui = providerUi(j);
    const annotation = reviewOfLabel(j.reviewOf);
    const waiting =
      j.status === 'needs_input' && session.waitingFor ? ` (waiting: ${session.waitingFor})` : '';
    const cols = [
      j.jobId.padEnd(32),
      j.status.padEnd(14),
      formatAge(j.updatedAt ?? j.createdAt).padEnd(6),
      ui.provider.padEnd(12),
      (session.shortId ?? '').padEnd(16),
      (session.sessionName ?? '') + annotation + waiting,
    ];
    return `  ${cols.join('  ')}`.trimEnd();
  });

  const lines = [header, '', `  ${columnHeader}`, ...rows];

  // Footer hint when any job is awaiting a follow-up (human output only).
  const awaitingJob = jobs.find(
    (j) => j.status === 'awaiting_followup' && providerUi(j).supportsFollowup,
  );
  if (awaitingJob) {
    lines.push(
      '',
      `Follow-up available: run $claude-followup ${awaitingJob.jobId} -- "next instruction"`,
    );
  }

  const needsInputJob = jobs.find((j) => j.status === 'needs_input' && jobSession(j).shortId);
  if (needsInputJob) {
    const compact = summarizeJob(needsInputJob, opts);
    const waiting = compact.waiting;
    lines.push('', `Input needed: run ${waiting?.userAction ?? compact.actionHints.stop}`);
    if (waiting?.category === 'browser_selection') {
      lines.push('Chrome browser selection must be completed in the attached Claude Code TUI.');
    }
    lines.push(`Stop blocked job: ${compact.actionHints.stop}`);
    lines.push(`Restart with bypass: ${compact.actionHints.restartWithBypass}`);
    lines.push(`Cleanup all blocked jobs in this workspace: ${compact.actionHints.cleanupBlocked}`);
  }

  if (opts.hiddenCount != null && opts.hiddenCount > 0) {
    lines.push(
      '',
      `${opts.hiddenCount} older delegated job${opts.hiddenCount === 1 ? '' : 's'} hidden by --limit ${opts.limit}. Use --limit 0 to show all matched jobs.`,
    );
  }

  if (opts.versionMismatch) {
    lines.push(
      '',
      `Version warning: dispatcher ${opts.versionMismatch.dispatcherVersion} is running while this workspace declares ${opts.versionMismatch.worktreeVersion}. Refresh the installed cc plugin or use the workspace dispatcher directly.`,
    );
  }

  return lines.join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {import('@cc-plugin-codex/runtime').TurnHandle | null} turnHandle
 * @param {number} turnIndex
 * @param {boolean} json
 * @param {{ previousTurnPreview?: string | null }} [opts]
 * @returns {string}
 */
export function formatFollowup(job, turnHandle, turnIndex, json, opts = {}) {
  const turn = job.turns[turnIndex];
  const turnStatus = turn?.status ?? 'unknown';
  const turnPreview = turn?.result?.finalMessagePreview ?? null;
  const sendPreview = turnHandle?.finalMessage ? turnHandle.finalMessage.slice(0, 160) : null;
  const previousTurnPreview = opts.previousTurnPreview ?? null;
  const turnPreviewIsPrevious =
    turnPreview != null && previousTurnPreview != null && turnPreview === previousTurnPreview;
  const finalMessagePreview =
    turnPreviewIsPrevious && sendPreview != null && sendPreview !== previousTurnPreview
      ? sendPreview
      : turnPreviewIsPrevious
        ? null
        : (turnPreview ?? sendPreview);
  const previewSource =
    finalMessagePreview == null
      ? null
      : finalMessagePreview === turnPreview
        ? 'turn'
        : 'sendResult';
  const resultPending = finalMessagePreview == null && turnPreviewIsPrevious;

  if (json) {
    return JSON.stringify(
      {
        ok: true,
        job: {
          jobId: job.jobId,
          status: job.status,
          shortId: job.claude.shortId,
          sessionName: job.claude.sessionName,
          resultPreview: finalMessagePreview ?? null,
        },
        turn: {
          index: turnIndex,
          status: turnStatus,
          finalMessagePreview: finalMessagePreview ?? null,
          ...(previewSource !== null ? { previewSource } : {}),
          ...(resultPending
            ? {
                stalePreview: true,
                resultPending: true,
                previousTurnPreview,
                resultHint: `$claude-result ${job.jobId}`,
              }
            : {}),
        },
      },
      null,
      2,
    );
  }

  const lines = [
    'Claude follow-up sent',
    `Job ID:         ${job.jobId}`,
    `Turn:           ${turnIndex} (${turnStatus})`,
    `Claude session: ${job.claude.shortId}`,
    `Status:         ${job.status}`,
  ];

  if (finalMessagePreview) {
    lines.push('', finalMessagePreview);
  } else if (resultPending) {
    lines.push('', `Result preview pending; run $claude-result ${job.jobId} after status settles.`);
  }

  return lines.join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {string | null} resultText
 * @param {boolean} json
 * @param {{ compact?: boolean }} [opts]
 * @returns {string}
 */
export function formatResult(job, resultText, json, opts = {}) {
  if (json) {
    return JSON.stringify(
      {
        ok: true,
        ...(opts.partial ? { partial: true } : {}),
        job: opts.compact ? summarizeJob(job, opts) : job,
        resultText,
      },
      null,
      2,
    );
  }

  const session = jobSession(job);
  const ui = providerUi(job);
  const compact = summarizeJob(job, opts);

  const lines = [
    `Job:        ${job.jobId}`,
    `Status:     ${job.status}`,
    ...(opts.partial ? ['Partial:    yes'] : []),
    `Result:     ${compact.resultState}`,
    `Next:       ${compact.recommendedNextAction}`,
    ...(session.transcriptPath
      ? [`Transcript file: ${session.transcriptPath}`]
      : ['Transcript file: not captured']),
    ...(job.result?.finalMessagePath ? [`Result file: ${job.result.finalMessagePath}`] : []),
    ...(ui.logsCommand ? [`Logs:       ${ui.logsCommand}`] : []),
  ];

  if (job.result?.touchedFiles && job.result.touchedFiles.length > 0) {
    lines.push('');
    lines.push('Touched files:');
    for (const f of job.result.touchedFiles) {
      lines.push(`  ${f}`);
    }
  }

  if (resultText) {
    lines.push('');
    lines.push(resultText);
  }

  return lines.join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {string | null} resultText
 * @param {boolean} json
 * @param {{ compact?: boolean; timedOut?: boolean; timeoutMs?: number; dispatcherPath?: string; transcriptTail?: string[] | null }} [opts]
 * @returns {string}
 */
export function formatWait(job, resultText, json, opts = {}) {
  const compact = summarizeJob(job, { ...opts, compact: true });
  const timedOut = Boolean(opts.timedOut);
  const transcriptTail = opts.transcriptTail ?? null;
  const timeoutRecovery = timedOut ? waitTimeoutRecovery(compact, resultText) : null;

  if (json) {
    return JSON.stringify(
      {
        ok: !timedOut,
        timedOut,
        ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
        job: opts.compact ? compact : job,
        summary: compact,
        ...(timeoutRecovery ? { timeoutRecovery } : {}),
        resultText,
        transcriptTail,
      },
      null,
      2,
    );
  }

  const lines = [
    `${providerUi(job).name} wait`,
    `Timed out:      ${timedOut ? 'yes' : 'no'}`,
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `Operator state: ${compact.operatorState}`,
    `Result:         ${compact.resultState}`,
    `Next:           ${compact.recommendedNextAction}`,
  ];

  if (timeoutRecovery) {
    lines.push(
      '',
      'Timeout recovery:',
      `  Status:  ${timeoutRecovery.status}`,
      ...(timeoutRecovery.partialResult ? [`  Partial: ${timeoutRecovery.partialResult}`] : []),
      `  Result:  ${timeoutRecovery.result}`,
      ...(timeoutRecovery.stop ? [`  Stop:    ${timeoutRecovery.stop}`] : []),
      ...(timeoutRecovery.attach ? [`  Attach:  ${timeoutRecovery.attach}`] : []),
    );
  }

  if (compact.blockedOn) {
    lines.push(`Blocked on:     ${compact.blockedOn.category}`);
    lines.push(`Detail:         ${compact.blockedOn.detail}`);
    if (compact.waiting?.userAction) {
      lines.push(`Manual action:  ${compact.waiting.userAction}`);
    }
    if (compact.actionHints?.restartWithBypass) {
      lines.push(`Restart:        ${compact.actionHints.restartWithBypass}`);
    }
    if (compact.actionHints?.stop) {
      lines.push(`Stop:           ${compact.actionHints.stop}`);
    }
  }

  if (job.result?.finalMessagePath) {
    lines.push(`Result file:    ${job.result.finalMessagePath}`);
  }

  if (resultText) {
    lines.push('', resultText);
  }

  if (transcriptTail && transcriptTail.length > 0) {
    lines.push('', 'Transcript tail:', ...transcriptTail.map((line) => `  ${line}`));
  }

  return lines.join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {boolean} json
 * @param {{ compact?: boolean }} [opts]
 * @returns {string}
 */
export function formatStop(job, json, opts = {}) {
  if (json) {
    return JSON.stringify({ ok: true, job: opts.compact ? summarizeJob(job, opts) : job }, null, 2);
  }

  const session = jobSession(job);
  const ui = providerUi(job);
  return [
    `${ui.name} job stopped`,
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `${`${ui.sessionLabel}:`.padEnd(16)}${session.shortId}`,
  ].join('\n');
}

/**
 * Format the result of a bulk stop operation (--all-awaiting-followup).
 *
 * @param {{ stopped: Array<{ jobId: string; shortId: string; status: string }>; skipped: Array<{ jobId: string; status: string; reason: string }>; failed: Array<{ jobId: string; message: string }>; showAll: boolean }} result
 * @param {boolean} json
 * @returns {string}
 */
export function formatBulkStop(result, json) {
  const { stopped, skipped, failed, showAll } = result;

  if (json) {
    return JSON.stringify(
      {
        ok: failed.length === 0,
        stopped,
        skipped,
        failed,
      },
      null,
      2,
    );
  }

  const lines = [];

  if (stopped.length > 0) {
    lines.push(
      `Stopped ${stopped.length} awaiting-followup Claude job${stopped.length === 1 ? '' : 's'}.`,
    );
    lines.push('Stopped:');
    for (const s of stopped) {
      lines.push(`  ${s.jobId}  ${s.shortId}  ${s.status}`);
    }
  } else {
    lines.push(
      showAll
        ? 'No awaiting-followup Claude jobs found.'
        : 'No awaiting-followup Claude jobs found for this workspace.',
    );
  }

  if (skipped.length > 0) {
    lines.push('Skipped:');
    for (const s of skipped) {
      lines.push(`  ${s.jobId}  ${s.status}`);
    }
  }

  if (failed.length > 0) {
    lines.push('Failed:');
    for (const f of failed) {
      lines.push(`  ${f.jobId}  ${f.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format human-readable output for the `review` subcommand.
 *
 * @param {{ review: import('./review-parser.mjs').ReviewOutput; job: import('@cc-plugin-codex/runtime').JobRecord; turn: object }} opts
 * @returns {string}
 */
export function formatReviewHuman({ review, job, turn }) {
  const { verdict, findings } = review;
  const verdictLabel = verdict.toUpperCase().replace(/_/g, ' ');

  // No findings → render clean output regardless of the raw verdict label.
  // Guards against a mid-stream read yielding `pass_with_findings` with an
  // empty findings array, which otherwise prints "PASS WITH FINDINGS (0 findings: )".
  if (findings.length === 0) {
    return [
      `Review verdict: ${verdict === 'fail' ? 'FAIL' : 'PASS'}`,
      `Job ID:  ${job.jobId}`,
      `Turn:    ${turn.index} (${turn.status})`,
      '',
      'No findings.',
    ].join('\n');
  }

  const blockerCount = findings.filter((f) => f.severity === 'blocker').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;
  const nitCount = findings.filter((f) => f.severity === 'nit').length;

  const countParts = [];
  if (blockerCount > 0) countParts.push(`${blockerCount} blocker`);
  if (highCount > 0) countParts.push(`${highCount} high`);
  if (mediumCount > 0) countParts.push(`${mediumCount} medium`);
  if (lowCount > 0) countParts.push(`${lowCount} low`);
  if (nitCount > 0) countParts.push(`${nitCount} nit`);

  const countSummary =
    findings.length === 1
      ? `1 finding: ${countParts.join(', ')}`
      : `${findings.length} findings: ${countParts.join(', ')}`;

  const lines = [
    `Review verdict: ${verdictLabel} (${countSummary})`,
    `Job ID:  ${job.jobId}`,
    `Turn:    ${turn.index} (${turn.status})`,
    '',
    'Findings:',
  ];

  for (const f of findings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.description}`);
    if (f.recommendation) {
      lines.push(`    Recommendation: ${f.recommendation}`);
    }
    if (f.file) {
      const loc = f.line != null ? `${f.file}:${f.line}` : f.file;
      lines.push(`    File: ${loc}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format machine-readable JSON output for the `review` subcommand.
 *
 * @param {{ review: import('./review-parser.mjs').ReviewOutput; job: import('@cc-plugin-codex/runtime').JobRecord; turn: object }} opts
 * @returns {string}
 */
export function formatReviewJson({ review, job, turn }) {
  const { verdict, findings } = review;

  const blockerCount = findings.filter((f) => f.severity === 'blocker').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;
  const nitCount = findings.filter((f) => f.severity === 'nit').length;

  return JSON.stringify(
    {
      ok: true,
      review: {
        verdict,
        blocking: isBlockingReview(review),
        findingsCount: findings.length,
        blockerCount,
        highCount,
        mediumCount,
        lowCount,
        nitCount,
        findings,
      },
      job: {
        jobId: job.jobId,
        status: job.status,
      },
      turn: {
        index: turn.index,
        status: turn.status,
      },
    },
    null,
    2,
  );
}

/**
 * Format machine-readable JSON output for the `adversarial-review` subcommand.
 * Includes the nested `reviewOf` field and a `targetJob` block.
 *
 * @param {{ review: import('./review-parser.mjs').ReviewOutput; job: import('@cc-plugin-codex/runtime').JobRecord; targetJob: import('@cc-plugin-codex/runtime').JobRecord }} opts
 * @returns {string}
 */
export function formatAdversarialReviewJson({ review, job, targetJob }) {
  const { verdict, findings } = review;

  const blockerCount = findings.filter((f) => f.severity === 'blocker').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;
  const nitCount = findings.filter((f) => f.severity === 'nit').length;

  return JSON.stringify(
    {
      ok: true,
      review: {
        verdict,
        blocking: isBlockingReview(review),
        findingsCount: findings.length,
        blockerCount,
        highCount,
        mediumCount,
        lowCount,
        nitCount,
        findings,
      },
      job: {
        jobId: job.jobId,
        status: job.status,
        ...(job.reviewOf !== undefined ? { reviewOf: job.reviewOf } : {}),
      },
      targetJob: {
        jobId: targetJob.jobId,
        status: targetJob.status,
      },
    },
    null,
    2,
  );
}

/**
 * @param {unknown} err
 * @param {string} command
 * @param {boolean} json
 * @returns {string}
 */
export function formatError(err, command, json) {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.constructor.name : 'Error';
  const operation =
    err != null && typeof err === 'object' && 'operation' in err
      ? /** @type {Record<string, unknown>} */ (err)['operation']
      : undefined;

  if (json) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          message,
          name,
          ...(operation !== undefined ? { operation } : {}),
        },
      },
      null,
      2,
    );
  }

  const prefix = command ? `[${command}] ` : '';
  return `${prefix}Error: ${message}`;
}
