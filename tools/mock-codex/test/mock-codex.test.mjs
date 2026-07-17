import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCodex, withTempDir, writeConfig } from './helpers.mjs';

describe('mock-codex', () => {
  it('codex --version prints the default version', () => {
    const r = runCodex(['--version']);
    assert.equal(r.status, 0, `exit=${r.status} stderr=${r.stderr}`);
    assert.match(r.stdout, /codex-cli 0\.0\.0-mock/);
  });

  it('codex --version honors a custom version in the config file', () => {
    withTempDir((dir) => {
      const cfg = writeConfig(dir, { version: 'codex-cli 1.2.3-test' });
      const r = runCodex(['--version'], { env: { CODEX_DELEGATION_MOCK_CODEX_CONFIG: cfg } });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /codex-cli 1\.2\.3-test/);
    });
  });

  it('codex --version exits non-zero when versionFails is set', () => {
    withTempDir((dir) => {
      const cfg = writeConfig(dir, { versionFails: true });
      const r = runCodex(['--version'], { env: { CODEX_DELEGATION_MOCK_CODEX_CONFIG: cfg } });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /codex error/);
    });
  });

  it('unsupported subcommand exits 2', () => {
    const r = runCodex(['unknown-thing']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unsupported/);
  });
});
