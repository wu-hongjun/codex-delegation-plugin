import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const executable = resolve(here, '..', '..', 'agy');

describe('mock agy', () => {
  it('reports a version and advertises supervised interactive mode', () => {
    const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    assert.equal(version.status, 0);
    assert.match(version.stdout, /1\.1\.4/);

    const help = spawnSync(executable, ['--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--print/);
    assert.match(help.stdout, /--prompt-interactive/);
    assert.match(help.stdout, /--conversation/);
    assert.match(help.stdout, /--log-file/);
  });

  it('returns a deterministic print response', () => {
    const result = spawnSync(executable, ['--print', 'inspect this'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'Antigravity completed: inspect this');
  });
});
