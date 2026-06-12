import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cwd = '/Users/hongjunwu/Repositories/Git/cc-plugin-codex';
const dispatcher =
  '/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs';
const artifactDir = join(cwd, 'documentation/testing/artifacts/20260607-v030-deep/subagent-c');
mkdirSync(artifactDir, { recursive: true });

const terminalStatuses = new Set([
  'complete',
  'completed',
  'idle',
  'awaiting_followup',
  'failed',
  'stopped',
  'orphaned',
]);
const pollMs = 15_000;

const cases = [
  {
    id: '9a',
    family: 'workflow',
    variation: 'marker',
    args: ['workflow', '--yes', 'Print MARKER-W then stop. Be brief.'],
    existingJobId: 'job_mq48xsaf_e9b10e68',
    expect: 'MARKER-W',
    timeoutMs: 180_000,
  },
  {
    id: '9b',
    family: 'workflow',
    variation: 'lib fan-out exports',
    args: [
      'workflow',
      '--yes',
      'Audit every .mjs file under packages/plugin-codex/scripts/lib/ in parallel — one subagent per file — and report each file\'s exported function names. Use multiple subagents.',
    ],
    timeoutMs: 480_000,
    needsFanout: true,
  },
  {
    id: '9c',
    family: 'workflow',
    variation: 'json marker',
    args: ['workflow', '--yes', '--json', 'Print MARKER-W3 then stop.'],
    expect: 'MARKER-W3',
    timeoutMs: 180_000,
    jsonStart: true,
  },
  {
    id: '9d',
    family: 'workflow',
    variation: 'named marker',
    args: ['workflow', '--yes', '--name', 'wf-named-pr4', 'Print MARKER-W4 then stop.'],
    expect: 'MARKER-W4',
    timeoutMs: 180_000,
    expectName: 'wf-named-pr4',
  },
  {
    id: '10a',
    family: 'goal',
    variation: 'marker goal',
    args: ['goal', '--yes', 'Print MARKER-G then stop once printed.'],
    expect: 'MARKER-G',
    timeoutMs: 360_000,
    retryNeedsInputFirstPoll: true,
  },
  {
    id: '10b',
    family: 'goal',
    variation: 'RELEASING.md line count',
    args: [
      'goal',
      '--yes',
      'Count the lines in documentation/RELEASING.md, print the number, then stop.',
    ],
    timeoutMs: 360_000,
    retryNeedsInputFirstPoll: true,
  },
  {
    id: '10c',
    family: 'goal',
    variation: 'json marker goal',
    args: ['goal', '--yes', '--json', 'Print MARKER-G3 then stop.'],
    expect: 'MARKER-G3',
    timeoutMs: 360_000,
    jsonStart: true,
    retryNeedsInputFirstPoll: true,
  },
  {
    id: '11a',
    family: 'fork',
    variation: 'dispatch switch summary',
    args: [
      'fork',
      '--yes',
      'Read packages/plugin-codex/scripts/cc.mjs L1-L60 and summarize the dispatch switch in 3 bullets.',
    ],
    timeoutMs: 360_000,
  },
  {
    id: '11b',
    family: 'fork',
    variation: 'marker fork',
    args: ['fork', '--yes', 'Print MARKER-F then stop. One short turn.'],
    expect: 'MARKER-F',
    timeoutMs: 360_000,
  },
  {
    id: '11c',
    family: 'fork',
    variation: 'json marker fork',
    args: ['fork', '--yes', '--json', 'Print MARKER-F3 then stop.'],
    expect: 'MARKER-F3',
    timeoutMs: 360_000,
    jsonStart: true,
  },
];

const results = [];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}

function invocation(args) {
  return ['node', dispatcher, ...args].map(quoteArg).join(' ');
}

function excerpt(text, max = 1200) {
  const trimmed = (text ?? '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n... [truncated ${trimmed.length - max} chars]`;
}

function run(label, args, timeoutMs = 60_000, saveRaw = true) {
  const startedAt = new Date().toISOString();
  const proc = spawnSync('node', [dispatcher, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
  });
  const finishedAt = new Date().toISOString();
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  if (saveRaw) {
    writeFileSync(join(artifactDir, `${label}.stdout.txt`), stdout);
    writeFileSync(join(artifactDir, `${label}.stderr.txt`), stderr);
  }
  return {
    label,
    invocation: invocation(args),
    exitCode: proc.status,
    signal: proc.signal,
    error: proc.error ? String(proc.error) : null,
    startedAt,
    finishedAt,
    stdout,
    stderr,
    stdoutExcerpt: excerpt(stdout),
    stderrExcerpt: excerpt(stderr),
  };
}

function parseJobIdFromStart(runResult) {
  try {
    const parsed = JSON.parse(runResult.stdout);
    return parsed?.job?.jobId ?? null;
  } catch {
    const match = runResult.stdout.match(/Job ID:\s+(job_\S+)/);
    return match ? match[1] : null;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function statusForJob(jobId, label) {
  const statusRun = run(label, ['status', '--json'], 90_000, false);
  const parsed = parseJson(statusRun.stdout);
  const job = parsed?.jobs?.find((candidate) => candidate.jobId === jobId) ?? null;
  const slim = {
    label,
    invocation: statusRun.invocation,
    exitCode: statusRun.exitCode,
    signal: statusRun.signal,
    error: statusRun.error,
    jobId,
    status: job?.status ?? null,
    shortId: job?.claude?.shortId ?? null,
    sessionId: job?.claude?.sessionId ?? null,
    sessionName: job?.claude?.sessionName ?? null,
    turnStatuses: (job?.turns ?? []).map((turn, index) => ({
      index,
      status: turn.status,
      preview: turn.result?.finalMessagePreview ?? null,
    })),
    resultPreview: job?.result?.finalMessagePreview ?? null,
    stdoutBytes: statusRun.stdout.length,
    stderrExcerpt: statusRun.stderrExcerpt,
  };
  writeFileSync(join(artifactDir, `${label}.status.json`), JSON.stringify(slim, null, 2));
  return { run: statusRun, job, slim };
}

function resultForJob(jobId, label) {
  return run(label, ['result', jobId], 90_000, true);
}

function stopJob(jobId, label) {
  return run(label, ['stop', jobId], 90_000, true);
}

function workflowsList(label) {
  const workflowsRun = run(label, ['workflows', '--json'], 60_000, true);
  const parsed = parseJson(workflowsRun.stdout);
  return {
    run: workflowsRun,
    sessions: parsed?.sessions ?? [],
  };
}

function workflowDetail(jobId, label) {
  const detailRun = run(label, ['workflows', jobId, '--json'], 60_000, true);
  return {
    run: detailRun,
    detail: parseJson(detailRun.stdout),
  };
}

function sanitizeCwd(value) {
  return value.replace(/\//g, '-');
}

function directSubagentEvidence(job) {
  if (!job?.claude?.sessionId) return { subagents: [], jsonlExcerpts: [] };
  const projectDir = join(homedir(), '.claude', 'projects', sanitizeCwd(job.workspace?.root ?? cwd));
  const subagentDir = join(projectDir, job.claude.sessionId, 'subagents');
  const subagents = [];
  if (existsSync(subagentDir)) {
    for (const entry of readdirSync(subagentDir).filter((name) => name.endsWith('.meta.json'))) {
      try {
        const meta = JSON.parse(readFileSync(join(subagentDir, entry), 'utf8'));
        subagents.push({
          file: entry,
          agentId: meta.agentId ?? null,
          status: meta.status ?? null,
          tokens: meta.tokens ?? null,
          duration_ms: meta.duration_ms ?? null,
          tool_uses: meta.tool_uses ?? null,
          resultExcerpt: excerpt(String(meta.result ?? ''), 500),
        });
      } catch (error) {
        subagents.push({ file: entry, parseError: String(error) });
      }
    }
  }

  const jsonlPath = join(projectDir, `${job.claude.sessionId}.jsonl`);
  const jsonlExcerpts = [];
  if (existsSync(jsonlPath)) {
    const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      if (/subagent|Task|agent|workflow|parallel|fork|goal/i.test(line)) {
        jsonlExcerpts.push(excerpt(line, 700));
      }
      if (jsonlExcerpts.length >= 8) break;
    }
  }
  return { subagents, jsonlExcerpts };
}

function pollUntilTerminal(testCase, jobId, attempt) {
  const polls = [];
  const started = Date.now();
  let firstPoll = true;
  let finalStatus = null;
  let latestJob = null;

  while (Date.now() - started < testCase.timeoutMs) {
    sleep(pollMs);
    const poll = statusForJob(jobId, `${testCase.id}-attempt${attempt}-poll${polls.length + 1}`);
    polls.push(poll.slim);
    latestJob = poll.job;
    finalStatus = poll.slim.status;

    if (
      firstPoll &&
      testCase.retryNeedsInputFirstPoll &&
      finalStatus === 'needs_input'
    ) {
      return {
        polls,
        latestJob,
        finalStatus,
        retryBecauseNeedsInput: true,
        timedOut: false,
      };
    }

    firstPoll = false;

    if (terminalStatuses.has(finalStatus)) {
      return { polls, latestJob, finalStatus, retryBecauseNeedsInput: false, timedOut: false };
    }
  }

  return { polls, latestJob, finalStatus, retryBecauseNeedsInput: false, timedOut: true };
}

function runFreshAttempt(testCase, attempt) {
  const start =
    testCase.existingJobId && attempt === 1
      ? null
      : run(`${testCase.id}-attempt${attempt}-start`, testCase.args, 120_000, true);
  const jobId = testCase.existingJobId && attempt === 1 ? testCase.existingJobId : parseJobIdFromStart(start);
  if (!jobId) {
    return {
      attempt,
      start,
      jobId: null,
      polls: [],
      finalStatus: null,
      error: 'could not parse jobId from start output',
    };
  }

  const pollResult = pollUntilTerminal(testCase, jobId, attempt);
  let stop = null;
  if (pollResult.retryBecauseNeedsInput || pollResult.timedOut) {
    stop = stopJob(jobId, `${testCase.id}-attempt${attempt}-stop`);
  }

  let result = null;
  if (!pollResult.retryBecauseNeedsInput) {
    result = resultForJob(jobId, `${testCase.id}-attempt${attempt}-result`);
  }

  let finalStatusJob = pollResult.latestJob;
  if (!finalStatusJob) {
    const status = statusForJob(jobId, `${testCase.id}-attempt${attempt}-final-status`);
    finalStatusJob = status.job;
  }

  let workflows = null;
  if (testCase.family === 'workflow' && !pollResult.retryBecauseNeedsInput) {
    workflows = {
      list: workflowsList(`${testCase.id}-attempt${attempt}-workflows-list`),
      detail: workflowDetail(jobId, `${testCase.id}-attempt${attempt}-workflows-detail`),
    };
  }

  const subagentEvidence = directSubagentEvidence(finalStatusJob);

  return {
    attempt,
    start,
    jobId,
    polls: pollResult.polls,
    finalStatus: pollResult.finalStatus,
    timedOut: pollResult.timedOut,
    retryBecauseNeedsInput: pollResult.retryBecauseNeedsInput,
    stop,
    result,
    finalStatusJob,
    workflows,
    subagentEvidence,
  };
}

function evaluate(testCase, attemptResult) {
  const resultText = attemptResult.result?.stdout ?? '';
  const startText = attemptResult.start?.stdout ?? '';
  const status = attemptResult.finalStatus;
  const okTerminal = terminalStatuses.has(status);
  const expectOk = testCase.expect ? resultText.includes(testCase.expect) : true;
  const jsonOk = testCase.jsonStart ? Boolean(parseJson(startText)?.ok) : true;
  const nameOk = testCase.expectName
    ? attemptResult.finalStatusJob?.claude?.sessionName === testCase.expectName
    : true;
  const workflowSubagents =
    attemptResult.workflows?.detail?.detail?.subagents?.length ??
    attemptResult.subagentEvidence?.subagents?.length ??
    0;
  const fanoutOk = testCase.needsFanout ? workflowSubagents >= 2 : true;

  let statusLabel = 'pass';
  const notes = [];
  if (!okTerminal) {
    statusLabel = attemptResult.timedOut ? 'timeout' : 'fail';
    notes.push(`ended at non-terminal status ${status ?? 'unknown'}`);
  }
  if (!expectOk) {
    statusLabel = 'fail';
    notes.push(`expected marker/text not found: ${testCase.expect}`);
  }
  if (!jsonOk) {
    statusLabel = 'fail';
    notes.push('start output was not parseable JSON with ok=true');
  }
  if (!nameOk) {
    statusLabel = 'fail';
    notes.push(
      `expected name ${testCase.expectName}, got ${
        attemptResult.finalStatusJob?.claude?.sessionName ?? 'unknown'
      }`,
    );
  }
  if (!fanoutOk) {
    statusLabel = 'fail';
    notes.push(`expected >=2 workflow subagents, saw ${workflowSubagents}`);
  }
  if (attemptResult.result?.exitCode && attemptResult.result.exitCode !== 0) {
    notes.push(`result command exit ${attemptResult.result.exitCode}`);
  }
  if (attemptResult.stop) {
    notes.push(`stop exit ${attemptResult.stop.exitCode}`);
  }
  if (attemptResult.timedOut) {
    notes.push('stopped after timeout');
  }
  if (workflowSubagents > 0) {
    notes.push(`subagents recorded: ${workflowSubagents}`);
  }

  return { statusLabel, notes };
}

for (const testCase of cases) {
  console.log(`[${new Date().toISOString()}] ${testCase.id} ${testCase.family} ${testCase.variation}`);
  let attempt = runFreshAttempt(testCase, 1);
  const attempts = [attempt];

  if (attempt.retryBecauseNeedsInput && testCase.retryNeedsInputFirstPoll) {
    console.log(`  ${testCase.id}: needs_input on poll 1; retrying once`);
    attempt = runFreshAttempt({ ...testCase, existingJobId: null }, 2);
    attempts.push(attempt);
  }

  const finalAttempt = attempts[attempts.length - 1];
  const evaluation = evaluate(testCase, finalAttempt);

  const record = {
    id: testCase.id,
    family: testCase.family,
    variation: testCase.variation,
    exactInvocation: invocation(testCase.args),
    jobIds: attempts.map((a) => a.jobId).filter(Boolean),
    attempts: attempts.map((a) => ({
      attempt: a.attempt,
      start: a.start
        ? {
            invocation: a.start.invocation,
            exitCode: a.start.exitCode,
            stdoutExcerpt: a.start.stdoutExcerpt,
            stderrExcerpt: a.start.stderrExcerpt,
          }
        : {
            invocation: '(pre-existing job from manual 9a start)',
            exitCode: 0,
            stdoutExcerpt: `Using existing job ${a.jobId}`,
            stderrExcerpt: '',
          },
      jobId: a.jobId,
      polls: a.polls,
      finalStatus: a.finalStatus,
      timedOut: a.timedOut,
      retryBecauseNeedsInput: a.retryBecauseNeedsInput,
      stop: a.stop
        ? {
            invocation: a.stop.invocation,
            exitCode: a.stop.exitCode,
            stdoutExcerpt: a.stop.stdoutExcerpt,
            stderrExcerpt: a.stop.stderrExcerpt,
          }
        : null,
      result: a.result
        ? {
            invocation: a.result.invocation,
            exitCode: a.result.exitCode,
            stdoutExcerpt: a.result.stdoutExcerpt,
            stderrExcerpt: a.result.stderrExcerpt,
          }
        : null,
      finalSessionName: a.finalStatusJob?.claude?.sessionName ?? null,
      workflowDetail: a.workflows?.detail?.detail
        ? {
            invocation: a.workflows.detail.run.invocation,
            exitCode: a.workflows.detail.run.exitCode,
            subagentCount: a.workflows.detail.detail.subagents?.length ?? 0,
            subagents: a.workflows.detail.detail.subagents ?? [],
            phaseRecordCount: a.workflows.detail.detail.phaseRecords?.length ?? 0,
            phaseRecords: (a.workflows.detail.detail.phaseRecords ?? []).slice(0, 5),
          }
        : a.workflows?.detail
          ? {
              invocation: a.workflows.detail.run.invocation,
              exitCode: a.workflows.detail.run.exitCode,
              stdoutExcerpt: a.workflows.detail.run.stdoutExcerpt,
              stderrExcerpt: a.workflows.detail.run.stderrExcerpt,
            }
          : null,
      subagentEvidence: a.subagentEvidence,
    })),
    status: evaluation.statusLabel,
    notes: evaluation.notes,
  };
  results.push(record);
  writeFileSync(join(artifactDir, 'subagent-c-results.json'), JSON.stringify(results, null, 2));
}

const lines = ['# Subagent C Raw Summary', ''];
for (const result of results) {
  lines.push(`## ${result.id} ${result.family} - ${result.variation}`);
  lines.push('');
  lines.push(`- Status: ${result.status}`);
  lines.push(`- Invocation: \`${result.exactInvocation.replaceAll('`', '\\`')}\``);
  lines.push(`- Job IDs: ${result.jobIds.join(', ') || '(none)'}`);
  if (result.notes.length > 0) lines.push(`- Notes: ${result.notes.join('; ')}`);
  const finalAttempt = result.attempts[result.attempts.length - 1];
  lines.push(`- Final status: ${finalAttempt.finalStatus ?? 'unknown'}`);
  if (finalAttempt.result) {
    lines.push('- Result excerpt:');
    lines.push('');
    lines.push('```text');
    lines.push(finalAttempt.result.stdoutExcerpt || '(empty)');
    lines.push('```');
  }
  if (finalAttempt.workflowDetail) {
    lines.push(
      `- Workflow detail: exit ${finalAttempt.workflowDetail.exitCode}, subagents ${
        finalAttempt.workflowDetail.subagentCount ?? 'n/a'
      }, phase records ${finalAttempt.workflowDetail.phaseRecordCount ?? 'n/a'}`,
    );
  }
  if (finalAttempt.subagentEvidence?.subagents?.length) {
    lines.push(`- Direct subagent meta count: ${finalAttempt.subagentEvidence.subagents.length}`);
  }
  lines.push('');
}
writeFileSync(join(artifactDir, 'subagent-c-raw-summary.md'), `${lines.join('\n')}\n`);

console.log(`[${new Date().toISOString()}] done; wrote ${results.length} records`);
