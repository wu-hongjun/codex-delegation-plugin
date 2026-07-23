import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '..', '..', '..', '..');
const dispatcher = join(repoRoot, 'packages', 'plugin-delegate', 'scripts', 'delegate.mjs');
const mockBin = join(repoRoot, 'tools', 'mock-agy');

let delegationHome;
let workspace;

beforeEach(() => {
  delegationHome = mkdtempSync(join(tmpdir(), 'process-provider-home-'));
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'process-provider-workspace-')));
});

afterEach(() => {
  const jobsDir = join(delegationHome, 'jobs');
  if (existsSync(jobsDir)) {
    for (const file of readdirSync(jobsDir)) {
      if (!file.endsWith('.json') || file.endsWith('.events.jsonl')) continue;
      try {
        const job = JSON.parse(readFileSync(join(jobsDir, file), 'utf8'));
        if (['queued', 'starting', 'running', 'needs_input'].includes(job.status)) {
          run(['stop', job.jobId, '--json', '--compact']);
        }
      } catch {
        // Temp-directory cleanup below handles partial fixtures.
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
      PATH: `${mockBin}${delimiter}${process.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function json(result) {
  assert.equal(result.status, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
  return JSON.parse(result.stdout);
}

const providers = [
  {
    id: 'pi',
    label: /Pi|oh-my-pi/i,
    initialResult: /Pi completed: first task/,
    followupResult: /Pi completed: second task/,
    unsupportedFlag: '--add-dir',
  },
  {
    id: 'qwen',
    label: /Qwen Code/i,
    initialResult: /Qwen completed: first task/,
    followupResult: /Qwen completed: second task/,
    unsupportedFlag: '--effort',
  },
];

for (const provider of providers) {
  describe(`${provider.id} dispatcher lifecycle`, () => {
    it('reports setup and doctor readiness without creating jobs', () => {
      const setup = json(run(['setup', '--provider', provider.id, '--json']));
      assert.equal(setup.provider, provider.id);
      assert.equal(setup.ok, true);
      assert.match(setup.providerLabel, provider.label);
      assert.equal(setup.capabilities.features.start, true);

      const doctor = json(run(['doctor', '--provider', provider.id, '--json']));
      assert.equal(doctor.provider, provider.id);
      assert.equal(doctor.ok, true);
      assert.equal(doctor.capabilities.features.followup, true);
      assert.equal(doctor.cwd, workspace);
      assert.equal(existsSync(join(delegationHome, 'jobs')), false);
    });

    it('delegates, lists status, waits, returns a result, and exactly resumes follow-up', () => {
      const delegated = json(
        run([
          'delegate',
          '--provider',
          provider.id,
          '--yes',
          '--json',
          '--compact',
          '--',
          'first task',
        ]),
      );
      assert.equal(delegated.job.provider, provider.id);
      const jobId = delegated.job.jobId;

      const status = json(run(['status', '--provider', provider.id, '--json', '--compact']));
      assert.equal(
        status.jobs.some((job) => job.jobId === jobId && job.provider === provider.id),
        true,
      );

      const waited = json(
        run(['wait', jobId, '--timeout', '10s', '--interval', '50ms', '--json', '--compact']),
      );
      assert.equal(
        ['completed', 'awaiting_followup'].includes(waited.job.status),
        true,
        `unexpected settled status: ${waited.job.status}`,
      );
      assert.equal(waited.job.provider, provider.id);

      const result = json(run(['result', jobId, '--json', '--compact']));
      assert.match(result.resultText, provider.initialResult);
      const beforeFollowup = JSON.parse(
        readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'),
      );
      const sessionId = beforeFollowup.session.sessionId;
      assert.equal(typeof sessionId, 'string');

      const followed = json(
        run([
          'followup',
          jobId,
          '--provider',
          provider.id,
          '--yes',
          '--json',
          '--compact',
          '--',
          'second task',
        ]),
      );
      assert.equal(followed.job.provider, provider.id);
      assert.match(followed.job.resultPreview, provider.followupResult);

      const stored = JSON.parse(
        readFileSync(join(delegationHome, 'jobs', `${jobId}.json`), 'utf8'),
      );
      assert.equal(stored.turns.length, 2);
      assert.equal(stored.session.sessionId, sessionId);
      const latestResult = readFileSync(stored.turns.at(-1).result.finalMessagePath, 'utf8');
      assert.match(latestResult, provider.followupResult);
      assert.doesNotMatch(latestResult, provider.initialResult);

      const immediateResult = json(run(['result', jobId, '--json', '--compact']));
      assert.match(immediateResult.resultText, provider.followupResult);
    });

    it('stops a running job', () => {
      const env = { CODEX_DELEGATION_MOCK_PROCESS_DELAY_MS: '10000' };
      const delegated = json(
        run(
          [
            'delegate',
            '--provider',
            provider.id,
            '--yes',
            '--json',
            '--compact',
            '--',
            'long task',
          ],
          env,
        ),
      );
      const stopped = json(run(['stop', delegated.job.jobId, '--json', '--compact'], env));
      assert.equal(stopped.job.status, 'stopped');
      assert.equal(stopped.job.provider, provider.id);
    });

    it('rejects provider mismatch and unsupported provider flags', () => {
      const delegated = json(
        run([
          'delegate',
          '--provider',
          provider.id,
          '--yes',
          '--json',
          '--compact',
          '--',
          'mismatch task',
        ]),
      );
      json(
        run([
          'wait',
          delegated.job.jobId,
          '--timeout',
          '10s',
          '--interval',
          '50ms',
          '--json',
          '--compact',
        ]),
      );

      const other = provider.id === 'pi' ? 'qwen' : 'pi';
      const mismatch = run([
        'followup',
        delegated.job.jobId,
        '--provider',
        other,
        '--yes',
        '--json',
        '--compact',
        '--',
        'wrong provider',
      ]);
      assert.equal(mismatch.status, 2);
      assert.match(
        `${mismatch.stdout}\n${mismatch.stderr}`,
        /Job provider is .* --provider .* cannot target/i,
      );

      const unsupported = run([
        'delegate',
        '--provider',
        provider.id,
        provider.unsupportedFlag,
        'fixture',
        '--yes',
        '--json',
        '--compact',
        '--',
        'unsupported flag',
      ]);
      assert.equal(unsupported.status, 2);
      assert.match(
        `${unsupported.stdout}\n${unsupported.stderr}`,
        new RegExp(`does not support.*${provider.unsupportedFlag.replace('-', '\\-')}`, 'i'),
      );
    });
  });
}
