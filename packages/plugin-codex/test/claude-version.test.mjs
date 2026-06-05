// Unit tests for packages/plugin-codex/scripts/lib/claude-version.mjs
// Plan 0007 T3

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const LIB = resolve(here, '..', '..', 'scripts', 'lib', 'claude-version.mjs');

const { parseClaudeVersion, compare, meetsFloor } = await import(LIB);

describe('parseClaudeVersion', () => {
  it('parses "2.1.153 (Claude Code)"', () => {
    assert.deepEqual(parseClaudeVersion('2.1.153 (Claude Code)'), {
      major: 2,
      minor: 1,
      patch: 153,
    });
  });

  it('parses "2.1.152 (Claude Code)"', () => {
    assert.deepEqual(parseClaudeVersion('2.1.152 (Claude Code)'), {
      major: 2,
      minor: 1,
      patch: 152,
    });
  });

  it('returns null for empty string', () => {
    assert.equal(parseClaudeVersion(''), null);
  });

  it('returns null for unparseable patch "2.1.x-dev (Claude Code)"', () => {
    assert.equal(parseClaudeVersion('2.1.x-dev (Claude Code)'), null);
  });
});

describe('compare', () => {
  it('returns 1 when a is greater (patch)', () => {
    assert.equal(
      compare({ major: 2, minor: 1, patch: 154 }, { major: 2, minor: 1, patch: 153 }),
      1,
    );
  });

  it('returns 0 when equal', () => {
    assert.equal(
      compare({ major: 2, minor: 1, patch: 154 }, { major: 2, minor: 1, patch: 154 }),
      0,
    );
  });

  it('returns -1 when a is less (patch)', () => {
    assert.equal(
      compare({ major: 2, minor: 1, patch: 153 }, { major: 2, minor: 1, patch: 154 }),
      -1,
    );
  });

  it('compares by major first', () => {
    assert.equal(compare({ major: 3, minor: 0, patch: 0 }, { major: 2, minor: 9, patch: 9 }), 1);
    assert.equal(compare({ major: 1, minor: 9, patch: 9 }, { major: 2, minor: 0, patch: 0 }), -1);
  });

  it('compares by minor when major equal', () => {
    assert.equal(compare({ major: 2, minor: 2, patch: 0 }, { major: 2, minor: 1, patch: 99 }), 1);
  });
});

describe('meetsFloor', () => {
  it('returns true when version equals floor', () => {
    assert.equal(meetsFloor({ major: 2, minor: 1, patch: 154 }, '2.1.154'), true);
  });

  it('returns false when version is below floor', () => {
    assert.equal(meetsFloor({ major: 2, minor: 1, patch: 153 }, '2.1.154'), false);
  });

  it('returns false when version is null', () => {
    assert.equal(meetsFloor(null, '2.1.154'), false);
  });

  it('returns true when version is above floor', () => {
    assert.equal(meetsFloor({ major: 2, minor: 1, patch: 999 }, '2.1.154'), true);
  });
});
