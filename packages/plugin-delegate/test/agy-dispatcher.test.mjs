import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
    assert.equal(result.version, '1.1.3');
    assert.equal(result.features.start, true);
    assert.equal(existsSync(join(delegationHome, 'jobs')), false);
  });

  it('reports exact-resume and headless-permission readiness through agy-doctor', () => {
    const report = json(run(['agy-doctor', '--json']));
    assert.equal(report.provider, 'agy');
    assert.equal(report.features.followup, true);
    assert.equal(report.status, 'warn');
    assert.ok(report.warnings.includes('headless-permissions'));

    const trusted = json(run(['agy-doctor', '--bypass-permissions', '--json']));
    assert.equal(
      trusted.checks.find((check) => check.name === 'headless-permissions').status,
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
    assert.equal(existsSync(join(delegationHome, 'jobs')), false);
  });

  it('delegates, waits, returns a result, and lists only agy jobs', () => {
    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'inspect repo']),
    );
    assert.equal(delegated.job.provider, 'agy');
    assert.equal(['starting', 'running', 'completed'].includes(delegated.job.status), true);

    const jobId = delegated.job.jobId;
    const waited = json(
      run(['wait', jobId, '--json', '--compact', '--timeout', '5s', '--interval', '25ms']),
    );
    assert.equal(waited.job.provider, 'agy');
    assert.equal(waited.job.status, 'completed');
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
      .map((line) => JSON.parse(line))
      .filter((invocation) => invocation.args.includes('--print'));
    assert.equal(invocations.length, 2);
    assert.deepEqual(
      invocations[1].args.slice(
        invocations[1].args.indexOf('--conversation'),
        invocations[1].args.indexOf('--conversation') + 2,
      ),
      ['--conversation', stored.session.sessionId],
    );

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
      .filter((invocation) => invocation.args.includes('--print'));
    assert.equal(modelInvocations.length, 2);
    assert.deepEqual(
      modelInvocations[1].args.slice(
        modelInvocations[1].args.indexOf('--conversation'),
        modelInvocations[1].args.indexOf('--conversation') + 2,
      ),
      ['--conversation', stored.session.sessionId],
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

  it('records every Antigravity orchestration surface and lists workflow-like jobs', () => {
    const invocationsPath = join(delegationHome, 'agy-workflow-invocations.jsonl');
    const env = { CODEX_DELEGATION_MOCK_AGY_INVOCATIONS: invocationsPath };
    const cases = [
      ['workflow', /deliberate multi-agent workflow/i],
      ['goal', /concrete completion condition/i],
      ['fork', /fresh independent Antigravity subagent/i],
      ['batch', /batch-parallel work orchestration/i],
      ['deep-research', /rigorous multi-agent deep research/i],
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

    const modelInvocations = readFileSync(invocationsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((invocation) => invocation.args.includes('--print'));
    assert.equal(modelInvocations.length, cases.length);
    for (let index = 0; index < cases.length; index++) {
      const prompt = modelInvocations[index].args.at(-1);
      assert.match(prompt, cases[index][1]);
    }

    const workflows = json(run(['workflows', '--provider', 'agy', '--json'], env));
    assert.deepEqual(new Set(workflows.workflows.map((job) => job.jobId)), new Set(jobIds));
    assert.deepEqual(
      new Set(workflows.workflows.map((job) => job.kind)),
      new Set(cases.map(([command]) => command)),
    );
    const detail = json(run(['workflows', '--provider', 'agy', jobIds[0], '--json'], env));
    assert.equal(detail.workflow.nativeSubagentInspection, false);
    assert.equal(detail.workflow.kind, 'workflow');
  });

  it('persists a failed job when agy auto-denies a headless permission request', () => {
    const configPath = join(delegationHome, 'agy-config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        response: '',
        stderr:
          'jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.',
      }),
    );
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
    assert.equal(waited.job.status, 'failed');

    const stored = JSON.parse(
      readFileSync(join(delegationHome, 'jobs', `${delegated.job.jobId}.json`), 'utf8'),
    );
    assert.equal(stored.status, 'failed');
    assert.equal(stored.turns.at(-1).status, 'failed');
    const runnerState = JSON.parse(readFileSync(stored.session.statePath, 'utf8'));
    assert.equal(runnerState.exitCode, 0);
    assert.match(runnerState.error, /auto-denied a headless permission request/i);
  });

  it('auto selects agy when its print mode is available', () => {
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
