import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '..', '..', '..', '..');
const dispatcher = join(repoRoot, 'packages', 'plugin-delegate', 'scripts', 'delegate.mjs');
const mockAgyDir = join(repoRoot, 'tools', 'mock-agy');

let delegationHome;
let workspace;

beforeEach(() => {
  delegationHome = mkdtempSync(join(tmpdir(), 'agy-dispatcher-home-'));
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'agy-dispatcher-workspace-')));
});

afterEach(() => {
  const jobsDir = join(delegationHome, 'jobs');
  if (existsSync(jobsDir)) {
    for (const file of readdirSync(jobsDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const job = JSON.parse(readFileSync(join(jobsDir, file), 'utf8'));
        if (
          ['queued', 'starting', 'running', 'needs_input', 'awaiting_followup'].includes(job.status)
        ) {
          run(['stop', job.jobId, '--json', '--compact']);
        }
      } catch {
        // Best-effort cleanup; the temp directory removal below handles incomplete fixtures.
      }
    }
  }
  rmSync(delegationHome, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [dispatcher, ...args], {
    cwd: workspace,
    env: {
      ...process.env,
      ...extraEnv,
      CODEX_DELEGATION_HOME: delegationHome,
      PATH: `${mockAgyDir}${delimiter}${process.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function json(result) {
  assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
  return JSON.parse(result.stdout);
}

describe('agy dispatcher integration', () => {
  it('requires an agy-specific privacy acknowledgement even when Claude is acknowledged', () => {
    const hash = createHash('sha256').update(workspace).digest('hex').slice(0, 16);
    const ackDir = join(delegationHome, 'acks');
    mkdirSync(ackDir, { recursive: true });
    writeFileSync(
      join(ackDir, `${hash}.json`),
      JSON.stringify({ workspaceRoot: workspace, provider: 'claude' }),
    );

    const rejected = run([
      'delegate',
      '--provider',
      'agy',
      '--json',
      '--compact',
      '--',
      'inspect repo',
    ]);
    assert.equal(rejected.status, 1);
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /privacy acknowledgement required/i);
    assert.equal(existsSync(join(ackDir, `${hash}.agy.json`)), false);

    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'inspect repo']),
    );
    const agyAck = JSON.parse(readFileSync(join(ackDir, `${hash}.agy.json`), 'utf8'));
    assert.equal(agyAck.provider, 'agy');
    json(run(['stop', delegated.job.jobId, '--json', '--compact']));
  });

  it('reports agy readiness without creating job state', () => {
    const result = json(run(['agy-setup', '--json']));
    assert.equal(result.provider, 'agy');
    assert.equal(result.version, '1.1.4');
    assert.equal(result.features.start, true);
    assert.equal(result.execution, 'supervised-interactive');
    assert.equal(result.features.permissionHandoff, true);
    assert.equal(result.features.childControl, true);
    assert.equal(result.controlPlugin.ok, true);
    assert.equal(existsSync(join(delegationHome, 'jobs')), false);
  });

  it('reports exact-resume and native permission handoff through agy-doctor', () => {
    const report = json(run(['agy-doctor', '--json']));
    assert.equal(report.provider, 'agy');
    assert.equal(report.features.followup, true);
    assert.equal(report.status, 'ok');
    assert.deepEqual(report.warnings, []);
    assert.equal(
      report.checks.find((check) => check.name === 'native-permission-handoff').status,
      'ok',
    );

    const trusted = json(run(['agy-doctor', '--bypass-permissions', '--json']));
    assert.equal(
      trusted.checks.find((check) => check.name === 'native-permission-handoff').status,
      'ok',
    );
    assert.deepEqual(trusted.blockers, []);
  });

  it('catalogs Antigravity project, user, and plugin skills without invoking a model', () => {
    const agyHome = join(delegationHome, 'mock-agy-home');
    const projectSkill = join(workspace, '.agents', 'skills', 'project-check');
    const userSkill = join(agyHome, 'config', 'skills', 'user-check');
    const pluginSkill = join(
      workspace,
      '.agents',
      'plugins',
      'audit-kit',
      'skills',
      'plugin-check',
    );
    for (const [dir, name] of [
      [projectSkill, 'project-check'],
      [userSkill, 'user-check'],
      [pluginSkill, 'plugin-check'],
    ]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n`);
    }

    const catalog = json(
      run(['skills', '--provider', 'agy', '--json'], {
        CODEX_DELEGATION_MOCK_AGY_HOME: agyHome,
      }),
    );
    assert.equal(catalog.provider, 'agy');
    assert.equal(catalog.counts.project, 1);
    assert.equal(catalog.counts.user, 1);
    assert.equal(catalog.counts.plugin, 1);
    assert.deepEqual(
      catalog.skills.map((skill) => skill.invocation),
      ['/plugin-check', '/project-check', '/user-check'],
    );
    assert.equal(existsSync(join(delegationHome, 'jobs')), false);
  });

  it('rejects Claude-only and conflicting startup flags before launching agy', () => {
    const unsupported = run([
      'delegate',
      '--provider',
      'agy',
      '--effort',
      'high',
      '--yes',
      '--json',
      '--',
      'inspect repo',
    ]);
    assert.equal(unsupported.status, 2);
    assert.match(`${unsupported.stdout}\n${unsupported.stderr}`, /does not support.*--effort/i);

    const conflicting = run([
      'delegate',
      '--provider',
      'agy',
      '--mode',
      'plan',
      '--allow-edit',
      '--yes',
      '--json',
      '--',
      'inspect repo',
    ]);
    assert.equal(conflicting.status, 2);
    assert.match(`${conflicting.stdout}\n${conflicting.stderr}`, /conflicting agy modes/i);

    const printOnly = run([
      'delegate',
      '--provider',
      'agy',
      '--print-timeout',
      '2m',
      '--yes',
      '--json',
      '--',
      'inspect repo',
    ]);
    assert.equal(printOnly.status, 2);
    assert.match(`${printOnly.stdout}\n${printOnly.stderr}`, /does not support.*--print-timeout/i);
    assert.equal(existsSync(join(delegationHome, 'jobs')), false);
  });

  it('delegates, waits, returns a result, and lists only agy jobs', () => {
    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'inspect repo']),
    );
    assert.equal(delegated.job.provider, 'agy');
    assert.equal(
      ['starting', 'running', 'awaiting_followup', 'completed'].includes(delegated.job.status),
      true,
    );

    const jobId = delegated.job.jobId;
    const waited = json(
      run(['wait', jobId, '--json', '--compact', '--timeout', '5s', '--interval', '25ms']),
    );
    assert.equal(waited.job.provider, 'agy');
    assert.equal(waited.job.status, 'awaiting_followup');
    assert.match(waited.resultText, /Antigravity completed: inspect repo/);

    const result = json(run(['result', jobId, '--json', '--compact']));
    assert.equal(result.job.provider, 'agy');
    assert.match(result.resultText, /Antigravity completed: inspect repo/);

    const status = json(run(['status', '--provider', 'agy', '--json', '--compact']));
    assert.deepEqual(
      status.jobs.map((job) => job.jobId),
      [jobId],
    );
    assert.equal(status.jobs[0].provider, 'agy');
    assert.match(status.jobs[0].exactActionHints.result, /result job_/);

    const stored = JSON.parse(readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'));
    assert.equal(stored.driver.name, 'agy-cli');
    assert.equal(stored.session.provider, 'agy');
    assert.equal(stored.session.sessionId, '11111111-2222-4333-8444-555555555555');
    assert.match(stored.session.logsCommand, /\.terminal\.log/);
    assert.equal('claude' in stored, false);
  });

  it('continues the exact agy conversation and records an immutable second turn', () => {
    const invocationsPath = join(delegationHome, 'agy-invocations.jsonl');
    const env = { CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const delegated = json(
      run(
        ['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'first turn'],
        env,
      ),
    );
    const jobId = delegated.job.jobId;
    json(run(['wait', jobId, '--json', '--compact', '--timeout', '5s', '--interval', '25ms'], env));

    const followup = json(
      run(['followup', jobId, '--provider', 'agy', '--yes', '--json', '--', 'second turn'], env),
    );
    assert.equal(followup.job.provider, 'agy');
    assert.equal(followup.job.turnCount, 2);
    assert.match(followup.job.resultPreview, /Antigravity completed: second turn/);

    const stored = JSON.parse(readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'));
    assert.equal(stored.turns.length, 2);
    assert.match(readFileSync(stored.turns[0].result.finalMessagePath, 'utf8'), /first turn/);
    assert.match(readFileSync(stored.turns[1].result.finalMessagePath, 'utf8'), /second turn/);

    const invocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const cliInvocations = invocations.filter(
      (invocation) =>
        Array.isArray(invocation.args) && invocation.args.includes('--prompt-interactive'),
    );
    const promptInvocations = invocations.filter((invocation) => invocation.kind === 'prompt');
    assert.equal(cliInvocations.length, 1);
    assert.equal(promptInvocations.length, 2);
    assert.deepEqual(
      promptInvocations.map((invocation) => invocation.conversationId),
      [stored.session.sessionId, stored.session.sessionId],
    );
    assert.equal(promptInvocations[1].prompt, 'second turn');

    const mismatchedProvider = run(
      ['followup', jobId, '--provider', 'claude', '--yes', '--json', '--', 'wrong runtime'],
      env,
    );
    assert.equal(mismatchedProvider.status, 2);
    assert.match(mismatchedProvider.stderr, /Job provider is agy/);
  });

  it('runs same-conversation structured review against the exact Antigravity conversation', () => {
    const configPath = join(delegationHome, 'agy-review-config.json');
    const invocationsPath = join(delegationHome, 'agy-review-invocations.jsonl');
    const env = {
      CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath,
      CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath,
    };
    writeFileSync(configPath, JSON.stringify({ response: 'implementation complete' }));
    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'build it'], env),
    );
    const jobId = delegated.job.jobId;
    json(run(['wait', jobId, '--json', '--timeout', '5s', '--interval', '25ms'], env));

    writeFileSync(
      configPath,
      JSON.stringify({
        response: '```json\n{"verdict":"pass","findings":[]}\n```\nReviewed the completed work.',
      }),
    );
    const review = json(run(['review', jobId, '--provider', 'agy', '--yes', '--json'], env));
    assert.equal(review.review.verdict, 'pass');
    assert.equal(review.review.findingsCount, 0);
    assert.equal(review.turn.index, 1);

    const stored = JSON.parse(readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'));
    assert.equal(stored.turns.length, 2);
    assert.match(stored.turns[1].prompt.summary, /^\[review\] /);
    const modelInvocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((invocation) => invocation.kind === 'prompt');
    assert.equal(modelInvocations.length, 2);
    assert.deepEqual(
      modelInvocations.map((invocation) => invocation.conversationId),
      [stored.session.sessionId, stored.session.sessionId],
    );
  });

  it('runs an independent Antigravity adversarial review in a fresh recorded conversation', () => {
    const configPath = join(delegationHome, 'agy-adversarial-config.json');
    const env = {
      CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath,
      CODEX_DELEGATION_ADVERSARIAL_REVIEW_POLL_MS: '25',
    };
    writeFileSync(configPath, JSON.stringify({ response: 'implementation complete' }));
    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'build it'], env),
    );
    const targetJobId = delegated.job.jobId;
    json(run(['wait', targetJobId, '--json', '--timeout', '5s', '--interval', '25ms'], env));

    const reviewConversationId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    writeFileSync(
      configPath,
      JSON.stringify({
        conversationId: reviewConversationId,
        response: '```json\n{"verdict":"pass","findings":[]}\n```',
      }),
    );
    const review = json(
      run(['adversarial-review', '--provider', 'agy', targetJobId, '--yes', '--json'], env),
    );
    assert.equal(review.review.verdict, 'pass');
    assert.equal(review.targetJob.jobId, targetJobId);
    assert.notEqual(review.job.jobId, targetJobId);

    const reviewJob = JSON.parse(
      readFileSync(join(delegationHome, 'jobs', `${review.job.jobId}.json`), 'utf8'),
    );
    assert.equal(reviewJob.provider, undefined);
    assert.equal(reviewJob.session.provider, 'agy');
    assert.equal(reviewJob.session.sessionId, reviewConversationId);
    assert.equal(reviewJob.kind, 'adversarial-review');
    assert.equal(reviewJob.reviewOf.jobId, targetJobId);
  });

  it('keeps every Antigravity orchestration surface on the native default parent', () => {
    const invocationsPath = join(delegationHome, 'agy-workflow-invocations.jsonl');
    const env = { CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const cases = [
      ['workflow', 'codex-delegation-workflow'],
      ['goal', 'codex-delegation-goal'],
      ['fork', 'codex-delegation-fork'],
      ['batch', 'codex-delegation-batch'],
      ['deep-research', 'codex-delegation-deep-research'],
    ];
    const jobIds = [];
    for (const [command] of cases) {
      const started = json(
        run(
          [command, '--provider', 'agy', '--yes', '--json', '--compact', '--', `${command} task`],
          env,
        ),
      );
      jobIds.push(started.job.jobId);
    }

    const invocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const modelInvocations = invocations.filter(
      (invocation) =>
        Array.isArray(invocation.args) && invocation.args.includes('--prompt-interactive'),
    );
    const promptInvocations = invocations.filter((invocation) => invocation.kind === 'prompt');
    assert.equal(modelInvocations.length, cases.length);
    assert.equal(promptInvocations.length, cases.length);
    for (let index = 0; index < cases.length; index++) {
      const [command, expectedAgent] = cases[index];
      assert.match(promptInvocations[index].prompt, new RegExp(`${command} task`, 'i'));
      assert.match(promptInvocations[index].prompt, new RegExp(expectedAgent, 'i'));
      const args = modelInvocations[index].args;
      assert.equal(args.includes('--agent'), false);
    }

    const workflows = json(run(['workflows', '--provider', 'agy', '--json'], env));
    assert.deepEqual(new Set(workflows.workflows.map((job) => job.jobId)), new Set(jobIds));
    assert.deepEqual(
      new Set(workflows.workflows.map((job) => job.kind)),
      new Set(cases.map(([command]) => command)),
    );
    const detail = json(run(['workflows', '--provider', 'agy', jobIds[0], '--json'], env));
    assert.equal(detail.workflow.nativeSubagentInspection, true);
    assert.equal(detail.workflow.childControl, 'native-tui');
    assert.match(detail.workflow.attachCommand, /attach job_/);
    assert.equal(detail.workflow.kind, 'workflow');
  });

  it('retains the explicit native orchestration contract when the companion profile is absent', () => {
    const configPath = join(delegationHome, 'agy-no-plugin.json');
    const invocationsPath = join(delegationHome, 'agy-no-plugin-invocations.jsonl');
    writeFileSync(configPath, JSON.stringify({ pluginInstalled: false }));
    const env = {
      CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath,
      CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath,
    };
    const started = json(
      run(
        ['workflow', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'fallback task'],
        env,
      ),
    );
    const invocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const launch = invocations.find(
      (entry) => Array.isArray(entry.args) && entry.args.includes('--prompt-interactive'),
    );
    const prompt = invocations.find((entry) => entry.kind === 'prompt');
    assert.equal(launch.args.includes('--agent'), false);
    assert.match(prompt.prompt, /deliberate multi-agent workflow/i);
    assert.equal(started.job.launchPolicy.agent, undefined);
  });

  it('preserves a native Antigravity permission request for human handoff', () => {
    const configPath = join(delegationHome, 'agy-config.json');
    writeFileSync(configPath, JSON.stringify({ permissionStall: true }));
    const env = { CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const delegated = json(
      run(
        ['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'inspect repo'],
        env,
      ),
    );

    const waited = json(
      run(
        [
          'wait',
          delegated.job.jobId,
          '--json',
          '--compact',
          '--timeout',
          '5s',
          '--interval',
          '25ms',
        ],
        env,
      ),
    );
    assert.equal(waited.job.status, 'needs_input');
    assert.match(waited.job.waitingFor, /permission/i);
    assert.match(waited.job.exactActionHints.attach, /attach job_/);

    const stored = JSON.parse(
      readFileSync(join(delegationHome, 'jobs', `${delegated.job.jobId}.json`), 'utf8'),
    );
    assert.equal(stored.status, 'needs_input');
    assert.equal(stored.turns.at(-1).status, 'needs_input');
    const runnerState = JSON.parse(readFileSync(stored.session.statePath, 'utf8'));
    assert.equal(runnerState.status, 'needs_input');
    assert.equal(runnerState.waitingFor, 'permission');
  });

  it('keeps a permission-blocked follow-up resumable and prevents duplicate prompts', () => {
    const configPath = join(delegationHome, 'agy-followup-permission.json');
    writeFileSync(configPath, JSON.stringify({ response: 'first turn complete' }));
    const env = { CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'first'], env),
    );
    const jobId = delegated.job.jobId;
    json(run(['wait', jobId, '--json', '--timeout', '5s', '--interval', '25ms'], env));

    writeFileSync(configPath, JSON.stringify({ permissionStall: true }));
    const blocked = run(
      ['followup', jobId, '--provider', 'agy', '--yes', '--json', '--', 'protected turn'],
      env,
    );
    assert.equal(blocked.status, 1);
    assert.match(`${blocked.stdout}\n${blocked.stderr}`, /attach.*do not send it again/is);
    const stored = JSON.parse(readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'));
    assert.equal(stored.status, 'needs_input');
    assert.equal(stored.turns.length, 2);
    assert.equal(stored.turns.at(-1).status, 'needs_input');

    const duplicate = run(
      ['followup', jobId, '--provider', 'agy', '--yes', '--json', '--', 'protected turn'],
      env,
    );
    assert.equal(duplicate.status, 1);
    assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /instead of duplicating the prompt/i);
    const unchanged = JSON.parse(
      readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'),
    );
    assert.equal(unchanged.turns.length, 2);
  });

  it('fails closed without Claude-specific assumptions if bypass still needs Antigravity input', () => {
    const configPath = join(delegationHome, 'agy-bypass-config.json');
    writeFileSync(configPath, JSON.stringify({ permissionStall: true }));
    const env = { CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const result = run(
      [
        'delegate',
        '--provider',
        'agy',
        '--bypass-permissions',
        '--yes',
        '--json',
        '--compact',
        '--',
        'inspect repo',
      ],
      env,
    );
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /Google Antigravity.*interactive input/i);
    const jobFile = readdirSync(join(delegationHome, 'jobs')).find((file) =>
      file.endsWith('.json'),
    );
    const stored = JSON.parse(readFileSync(join(delegationHome, 'jobs', jobFile), 'utf8'));
    assert.equal(stored.status, 'failed');
    assert.equal(stored.turns.at(-1).status, 'failed');
  });

  it('auto selects agy when its supervised interactive mode is available', () => {
    const delegated = json(
      run(['delegate', '--provider', 'auto', '--yes', '--json', '--compact', '--', 'auto task']),
    );
    assert.equal(delegated.job.provider, 'agy');
    json(run(['stop', delegated.job.jobId, '--json', '--compact']));
  });

  it('stops a running agy job and rejects follow-up after stop', () => {
    const configPath = join(delegationHome, 'agy-config.json');
    writeFileSync(configPath, JSON.stringify({ delayMs: 10_000 }));
    const env = { CODEX_DELEGATION_MOCK_AGY_CONFIG: configPath };
    const delegated = json(
      run(
        ['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'long task'],
        env,
      ),
    );
    const jobId = delegated.job.jobId;

    const stopped = json(run(['stop', jobId, '--json', '--compact'], env));
    assert.equal(stopped.job.status, 'stopped');
    assert.equal(stopped.job.provider, 'agy');

    const followup = run(['followup', jobId, '--yes', '--json', '--', 'continue'], env);
    assert.equal(followup.status, 1);
    const error = JSON.parse(followup.stdout || followup.stderr);
    assert.match(error.error.message, /is stopped/);
  });
});
