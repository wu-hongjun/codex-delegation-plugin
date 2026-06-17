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

function classifyWaiting(waitingFor) {
  if (waitingFor == null || waitingFor === '') return null;
  const text = String(waitingFor);
  const lower = text.toLowerCase();
  const kind = lower.includes('permission')
    ? 'permission'
    : lower.includes('blocked') || lower.includes('waiting') || lower.includes('input')
      ? 'input'
      : 'other';
  return {
    kind,
    detail: text,
    action: 'attach',
  };
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
 * @returns {object}
 */
function summarizeJob(job) {
  const turnCount = Array.isArray(job.turns) ? job.turns.length : 0;
  const latestTurnIndex = turnCount > 0 ? turnCount - 1 : -1;
  const latestTurn = latestTurnIndex >= 0 ? job.turns[latestTurnIndex] : undefined;
  const latestKind = classifyTurnKind(latestTurn);
  const shortId = job.claude?.shortId ?? null;
  const waitingFor = job.claude?.waitingFor ?? null;
  const waiting = classifyWaiting(waitingFor);
  const hasResult = job.result !== undefined;
  const latestTurnHasResult = latestTurn?.result !== undefined;
  const latestTurnResultState = latestTurnHasResult
    ? latestTurn?.status === 'completed' || isFinalResultStatus(job.status)
      ? 'final'
      : 'partial'
    : 'none';
  const resultIsPartial = hasResult && latestTurnResultState !== 'final';
  const actionHints = {
    status: `cc status --job ${job.jobId} --json --compact`,
    result: `cc result ${job.jobId}`,
    ...(hasResult ? { partialResult: `cc result ${job.jobId} --partial` } : {}),
    ...(isNonTerminalJobStatus(job.status) ? { stop: `cc stop ${job.jobId}` } : {}),
    ...(job.status === 'awaiting_followup'
      ? { followup: `cc followup ${job.jobId} -- "<prompt>"` }
      : {}),
    ...(shortId != null ? { attach: `claude attach ${shortId}` } : {}),
    ...(shortId != null ? { logs: job.claude?.logsCommand ?? `claude logs ${shortId}` } : {}),
  };

  return {
    jobId: job.jobId,
    status: job.status,
    shortId,
    sessionName: job.claude?.sessionName ?? null,
    waitingFor,
    waiting,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.reviewOf !== undefined ? { reviewOf: job.reviewOf } : {}),
    actionHints,
    turnCount,
    latestTurn:
      latestTurnIndex >= 0
        ? {
            index: latestTurnIndex,
            status: latestTurn?.status ?? null,
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

function statusMeta(opts) {
  const meta = {};
  if (opts.storedStatusFilter != null) meta.storedStatusFilter = opts.storedStatusFilter;
  if (opts.limit != null) meta.limit = opts.limit;
  if (opts.hiddenCount != null && opts.hiddenCount > 0) meta.hiddenCount = opts.hiddenCount;
  if (opts.versionMismatch != null) meta.versionMismatch = opts.versionMismatch;
  return Object.keys(meta).length > 0 ? meta : null;
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
    return JSON.stringify({ ok: true, job: opts.compact ? summarizeJob(job) : job }, null, 2);
  }

  const logsCmd = job.claude.logsCommand ?? `claude logs ${job.claude.shortId}`;
  return [
    'Claude job started',
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `Claude session: ${job.claude.shortId}`,
    `Name:           ${job.claude.sessionName}`,
    `Raw logs:       ${logsCmd}`,
    'Run:',
    `  $claude-status`,
    `  $claude-result ${job.jobId}`,
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
        { ok: true, job: job ? summarizeJob(job) : null, ...(meta ? { meta } : {}) },
        null,
        2,
      );
    }
    if (opts.compact) {
      return JSON.stringify(
        { ok: true, jobs: jobs.map(summarizeJob), ...(meta ? { meta } : {}) },
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
    return 'No Claude jobs found for this workspace.';
  }

  if (opts.singleJob) {
    const j = jobs[0];
    const annotation = reviewOfLabel(j.reviewOf);
    const lines = [
      'Claude job',
      `Job ID:         ${j.jobId}`,
      `Status:         ${j.status}`,
      `Claude session: ${j.claude.shortId}`,
      `Name:           ${j.claude.sessionName}${annotation}`,
    ];
    if (j.result?.finalMessagePreview) {
      lines.push(`Result:         ${j.result.finalMessagePreview}`);
    }
    if (j.claude.waitingFor) {
      lines.push(`Waiting:        ${j.claude.waitingFor}`);
      lines.push(`Attach:         claude attach ${j.claude.shortId}`);
      if (j.result?.finalMessagePreview) {
        lines.push(`Partial result: cc result ${j.jobId} --partial`);
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

  const header = `Claude jobs for ${workspaceRoot}`;
  const columnHeader = [
    'JOB ID'.padEnd(32),
    'STATUS'.padEnd(14),
    'AGE'.padEnd(6),
    'CLAUDE'.padEnd(16),
    'NAME',
  ].join('  ');
  const rows = jobs.map((j) => {
    const annotation = reviewOfLabel(j.reviewOf);
    const waiting = j.claude.waitingFor ? ` (waiting: ${j.claude.waitingFor})` : '';
    const cols = [
      j.jobId.padEnd(32),
      j.status.padEnd(14),
      formatAge(j.updatedAt ?? j.createdAt).padEnd(6),
      (j.claude.shortId ?? '').padEnd(16),
      (j.claude.sessionName ?? '') + annotation + waiting,
    ];
    return `  ${cols.join('  ')}`.trimEnd();
  });

  const lines = [header, '', `  ${columnHeader}`, ...rows];

  // Footer hint when any job is awaiting a follow-up (human output only).
  const awaitingJob = jobs.find((j) => j.status === 'awaiting_followup');
  if (awaitingJob) {
    lines.push(
      '',
      `Follow-up available: run $claude-followup ${awaitingJob.jobId} -- "next instruction"`,
    );
  }

  const needsInputJob = jobs.find((j) => j.status === 'needs_input' && j.claude.shortId);
  if (needsInputJob) {
    lines.push('', `Input needed: run claude attach ${needsInputJob.claude.shortId}`);
  }

  if (opts.hiddenCount != null && opts.hiddenCount > 0) {
    lines.push(
      '',
      `${opts.hiddenCount} older Claude job${opts.hiddenCount === 1 ? '' : 's'} hidden by --limit ${opts.limit}. Use --limit 0 to show all matched jobs.`,
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
            ? { stalePreview: true, resultPending: true, previousTurnPreview }
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
        job: opts.compact ? summarizeJob(job) : job,
        resultText,
      },
      null,
      2,
    );
  }

  const transcriptLine = job.claude.transcriptPath ? job.claude.transcriptPath : '(none)';
  const logsCmd = job.claude.logsCommand ?? `claude logs ${job.claude.shortId}`;

  const lines = [
    `Job:        ${job.jobId}`,
    `Status:     ${job.status}`,
    ...(opts.partial ? ['Partial:    yes'] : []),
    `Transcript: ${transcriptLine}`,
    `Logs:       ${logsCmd}`,
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
 * @param {boolean} json
 * @param {{ compact?: boolean }} [opts]
 * @returns {string}
 */
export function formatStop(job, json, opts = {}) {
  if (json) {
    return JSON.stringify({ ok: true, job: opts.compact ? summarizeJob(job) : job }, null, 2);
  }

  return [
    'Claude job stopped',
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `Claude session: ${job.claude.shortId}`,
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
