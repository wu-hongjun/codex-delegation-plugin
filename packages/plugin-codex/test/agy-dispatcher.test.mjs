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
const dispatcher = join(repoRoot, 'packages', 'plugin-codex', 'scripts', 'cc.mjs');
const mockAgyDir = join(repoRoot, 'tools', 'mock-agy');

let companionHome;
let workspace;

beforeEach(() => {
  companionHome = mkdtempSync(join(tmpdir(), 'agy-dispatcher-home-'));
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'agy-dispatcher-workspace-')));
});

afterEach(() => {
  rmSync(companionHome, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [dispatcher, ...args], {
    cwd: workspace,
    env: {
      ...process.env,
      ...extraEnv,
      CC_PLUGIN_CODEX_HOME: companionHome,
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
    const ackDir = join(companionHome, 'acks');
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
    assert.equal(existsSync(join(companionHome, 'jobs')), false);
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
    assert.equal(existsSync(join(companionHome, 'jobs')), false);
  });

  it('delegates, waits, returns a result, and lists only agy jobs', () => {
    const delegated = json(
      run(['delegate', '--provider', 'agy', '--yes', '--json', '--compact', '--', 'inspect repo']),
    );
    assert.equal(delegated.job.provider, 'agy');
    assert.equal(delegated.job.status === 'starting' || delegated.job.status === 'running', true);

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

    const stored = JSON.parse(readFileSync(join(companionHome, 'jobs', `${jobId}.json`), 'utf8'));
    assert.equal(stored.driver.name, 'agy-cli');
    assert.equal(stored.session.provider, 'agy');
    assert.equal('claude' in stored, false);
  });

  it('auto selects agy when its print mode is available', () => {
    const delegated = json(
      run(['delegate', '--provider', 'auto', '--yes', '--json', '--compact', '--', 'auto task']),
    );
    assert.equal(delegated.job.provider, 'agy');
    json(run(['stop', delegated.job.jobId, '--json', '--compact']));
  });

  it('stops a running agy job and rejects conversation follow-up', () => {
    const configPath = join(companionHome, 'agy-config.json');
    writeFileSync(configPath, JSON.stringify({ delayMs: 10_000 }));
    const env = { CC_PLUGIN_CODEX_MOCK_AGY_CONFIG: configPath };
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
    assert.match(error.error.message, /stable conversation ID/);
  });
});
