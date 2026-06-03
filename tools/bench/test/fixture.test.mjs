import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixture } from '../lib/fixture.mjs';

describe('createFixture()', () => {
  it('returns an object with root (string) and cleanup (function)', async () => {
    const fixture = await createFixture();
    try {
      assert.equal(typeof fixture.root, 'string');
      assert.equal(typeof fixture.cleanup, 'function');
    } finally {
      fixture.cleanup();
    }
  });

  it('root path contains the expected temp prefix', async () => {
    const fixture = await createFixture();
    try {
      assert.match(fixture.root, /cc-plugin-codex-plan0004-bench-/);
    } finally {
      fixture.cleanup();
    }
  });

  it('root directory exists on disk after the call', async () => {
    const fixture = await createFixture();
    try {
      assert.ok(existsSync(fixture.root), 'root directory should exist');
    } finally {
      fixture.cleanup();
    }
  });

  it('two calls return two different root paths', async () => {
    const a = await createFixture();
    const b = await createFixture();
    try {
      assert.notEqual(a.root, b.root);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });

  it('returned directory contains README.md', async () => {
    const fixture = await createFixture();
    try {
      assert.ok(existsSync(join(fixture.root, 'README.md')));
    } finally {
      fixture.cleanup();
    }
  });

  it('returned directory contains src/app.js', async () => {
    const fixture = await createFixture();
    try {
      assert.ok(existsSync(join(fixture.root, 'src', 'app.js')));
    } finally {
      fixture.cleanup();
    }
  });

  it('returned directory contains test/app.test.js', async () => {
    const fixture = await createFixture();
    try {
      assert.ok(existsSync(join(fixture.root, 'test', 'app.test.js')));
    } finally {
      fixture.cleanup();
    }
  });

  it('returned directory contains test/helpers.test.js', async () => {
    const fixture = await createFixture();
    try {
      assert.ok(existsSync(join(fixture.root, 'test', 'helpers.test.js')));
    } finally {
      fixture.cleanup();
    }
  });

  it('returned directory contains .git/ after createFixture (git init ran)', async () => {
    const fixture = await createFixture();
    try {
      assert.ok(existsSync(join(fixture.root, '.git')), '.git should exist');
    } finally {
      fixture.cleanup();
    }
  });

  it('cleanup() removes the directory', async () => {
    const fixture = await createFixture();
    const { root, cleanup } = fixture;
    assert.ok(existsSync(root), 'directory should exist before cleanup');
    cleanup();
    assert.ok(!existsSync(root), 'directory should be gone after cleanup');
  });

  it('fixture README contains exactly 3 lines matching /TODO/i', async () => {
    const fixture = await createFixture();
    try {
      const content = readFileSync(join(fixture.root, 'README.md'), 'utf8');
      const todoLines = content.split('\n').filter((line) => /TODO/i.test(line));
      assert.equal(todoLines.length, 3);
    } finally {
      fixture.cleanup();
    }
  });
});
