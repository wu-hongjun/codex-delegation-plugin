// format.mjs — human-readable and JSON output formatters for each subcommand.

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
        generatedAt: report.generatedAt,
        probes: report.probes,
      },
      null,
      2,
    );
  }

  const rows = report.probes.map((p) => {
    const icon = p.status === 'ok' ? 'ok  ' : p.status === 'warn' ? 'warn' : 'FAIL';
    return `  ${icon}  ${p.name.padEnd(30)} ${p.detail}`;
  });

  const overall = report.status === 'fail' ? 'FAIL' : report.status === 'warn' ? 'warn' : 'ok';
  return [
    `Claude companion setup — ${overall}`,
    '',
    ...rows,
    '',
    `Generated: ${report.generatedAt}`,
  ].join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {boolean} json
 * @returns {string}
 */
export function formatDelegate(job, json) {
  if (json) {
    return JSON.stringify({ ok: true, job }, null, 2);
  }

  const logsCmd = job.claude.logsCommand ?? `claude logs ${job.claude.shortId}`;
  return [
    'Claude job started',
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `Claude session: ${job.claude.shortId}`,
    `Name:           ${job.claude.sessionName}`,
    `Logs:           ${logsCmd}`,
    'Run:',
    `  $claude-status`,
    `  $claude-result ${job.jobId}`,
  ].join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord[]} jobs
 * @param {boolean} json
 * @param {string} workspaceRoot
 * @returns {string}
 */
export function formatStatus(jobs, json, workspaceRoot) {
  if (json) {
    return JSON.stringify({ ok: true, jobs }, null, 2);
  }

  if (jobs.length === 0) {
    return 'No Claude jobs found for this workspace.';
  }

  const header = `Claude jobs for ${workspaceRoot}`;
  const rows = jobs.map((j) => {
    const cols = [
      j.jobId.padEnd(32),
      j.status.padEnd(14),
      (j.claude.shortId ?? '').padEnd(16),
      j.claude.sessionName ?? '',
    ];
    return `  ${cols.join('  ')}`.trimEnd();
  });

  return [header, '', ...rows].join('\n');
}

/**
 * @param {import('@cc-plugin-codex/runtime').JobRecord} job
 * @param {string | null} resultText
 * @param {boolean} json
 * @returns {string}
 */
export function formatResult(job, resultText, json) {
  if (json) {
    return JSON.stringify({ ok: true, job, resultText }, null, 2);
  }

  const transcriptLine = job.claude.transcriptPath ? job.claude.transcriptPath : '(none)';
  const logsCmd = job.claude.logsCommand ?? `claude logs ${job.claude.shortId}`;

  const lines = [
    `Job:        ${job.jobId}`,
    `Status:     ${job.status}`,
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
 * @returns {string}
 */
export function formatStop(job, json) {
  if (json) {
    return JSON.stringify({ ok: true, job }, null, 2);
  }

  return [
    'Claude job stopped',
    `Job ID:         ${job.jobId}`,
    `Status:         ${job.status}`,
    `Claude session: ${job.claude.shortId}`,
  ].join('\n');
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
