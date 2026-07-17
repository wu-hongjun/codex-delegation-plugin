// Tests for readSidecar, resolveSidecarPath, and parseSidecarSnapshot — Plan 0002 T4.
//
// All tests use mkdtempSync per-test isolation for the jobsDir. Fixtures are read
// from test/fixtures/sidecar/ and written into the isolated temp directory before
// each test so each test gets its own clean state.json.
//
// Does NOT import node-pty; this is a pure fs/JSON test lane.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSidecarSnapshot, readSidecar, resolveSidecarPath } from '../dist/index.js';

// ---------- fixture paths ----------

const here = fileURLToPath(import.meta.url);
const FIXTURES = join(dirname(here), 'fixtures', 'sidecar');

const completeJson = readFileSync(join(FIXTURES, 'complete.json'), 'utf8');
const minimalJson = readFileSync(join(FIXTURES, 'minimal.json'), 'utf8');
const malformedJson = readFileSync(join(FIXTURES, 'malformed.json'), 'utf8');

const completeFixture = JSON.parse(completeJson);

// ---------- per-test isolated temp dirs ----------

let jobsDir;

beforeEach(() => {
  jobsDir = mkdtempSync(join(tmpdir(), 'sidecar-driver-'));
});

afterEach(() => {
  rmSync(jobsDir, { recursive: true, force: true });
});

// Helper: write content into <jobsDir>/<shortId>/state.json
function placeStateJson(shortId, content) {
  const dir = join(jobsDir, shortId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), content, 'utf8');
}

// ============================================================
// 1. readSidecar reads a complete fixture
// ============================================================

describe('readSidecar — reads a complete fixture', () => {
  it('returns snapshot with all documented fields from complete.json', async () => {
    const shortId = 'test0001';
    placeStateJson(shortId, completeJson);

    const snapshot = await readSidecar(shortId, { jobsDir });

    assert.ok(snapshot !== null, 'expected a non-null snapshot');
    assert.equal(snapshot.state, 'done');
    assert.equal(snapshot.tempo, 'idle');
    assert.ok(snapshot.inFlight !== undefined, 'expected inFlight to be set');
    assert.equal(snapshot.inFlight.tasks, 0);
    assert.ok(
      typeof snapshot.output?.result === 'string' &&
        snapshot.output.result.includes('completed answer'),
      `expected output.result to include "completed answer", got: ${snapshot.output?.result}`,
    );
    assert.ok(
      typeof snapshot.linkScanPath === 'string' && snapshot.linkScanPath.length > 0,
      'expected non-empty linkScanPath',
    );
    assert.equal(snapshot.intent, 'original prompt text');
    assert.equal(snapshot.cliVersion, '2.1.149');
    assert.equal(snapshot.cwd, '/private/tmp/x');
    assert.ok(
      typeof snapshot.resumeSessionId === 'string' && snapshot.resumeSessionId.length > 0,
      'expected non-empty resumeSessionId',
    );
  });
});

// ============================================================
// 2. Tolerates missing optional fields
// ============================================================

describe('readSidecar — tolerates missing optional fields', () => {
  it('returns state and tempo from minimal.json, all other fields undefined', async () => {
    const shortId = 'test0002';
    placeStateJson(shortId, minimalJson);

    const snapshot = await readSidecar(shortId, { jobsDir });

    assert.ok(snapshot !== null, 'expected a non-null snapshot');
    assert.equal(snapshot.state, 'idle');
    assert.equal(snapshot.tempo, 'idle');
    assert.equal(snapshot.output, undefined);
    assert.equal(snapshot.inFlight, undefined);
    assert.equal(snapshot.linkScanPath, undefined);
    assert.equal(snapshot.resumeSessionId, undefined);
    assert.equal(snapshot.intent, undefined);
    assert.equal(snapshot.cliVersion, undefined);
    assert.equal(snapshot.cwd, undefined);
  });
});

// ============================================================
// 3. Preserves `raw`
// ============================================================

describe('readSidecar — preserves raw', () => {
  it('snapshot.raw deep-equals the parsed JSON of complete.json (extras included)', async () => {
    const shortId = 'test0003';
    placeStateJson(shortId, completeJson);

    const snapshot = await readSidecar(shortId, { jobsDir });

    assert.ok(snapshot !== null, 'expected a non-null snapshot');
    assert.deepEqual(snapshot.raw, completeFixture);
  });
});

// ============================================================
// 4. Ignores extra fields
// ============================================================

describe('readSidecar — ignores extra fields', () => {
  it('does not lift template, name, sessionId, daemonShort, backend onto the snapshot', async () => {
    const shortId = 'test0004';
    placeStateJson(shortId, completeJson);

    const snapshot = await readSidecar(shortId, { jobsDir });

    assert.ok(snapshot !== null, 'expected a non-null snapshot');
    assert.equal(snapshot['template'], undefined);
    assert.equal(snapshot['name'], undefined);
    assert.equal(snapshot['sessionId'], undefined);
    assert.equal(snapshot['daemonShort'], undefined);
    assert.equal(snapshot['backend'], undefined);
    assert.equal(snapshot['nameSource'], undefined);
  });
});

// ============================================================
// 5. Returns null for missing file
// ============================================================

describe('readSidecar — returns null for missing file', () => {
  it('returns null when <jobsDir>/<shortId>/ exists but state.json is absent', async () => {
    const shortId = 'test0005';
    // Create the directory but do NOT write state.json
    mkdirSync(join(jobsDir, shortId), { recursive: true });

    const result = await readSidecar(shortId, { jobsDir });

    assert.equal(result, null);
  });
});

// ============================================================
// 6. Returns null for missing jobs dir
// ============================================================

describe('readSidecar — returns null for missing jobs dir', () => {
  it('returns null when jobsDir itself does not exist', async () => {
    const nonExistentJobsDir = join(jobsDir, 'no-such-jobs-dir');

    const result = await readSidecar('test0006', { jobsDir: nonExistentJobsDir });

    assert.equal(result, null);
  });
});

// ============================================================
// 7. Returns null for malformed JSON
// ============================================================

describe('readSidecar — returns null for malformed JSON', () => {
  it('returns null without throwing when state.json contains invalid JSON', async () => {
    const shortId = 'test0007';
    placeStateJson(shortId, malformedJson);

    let result;
    await assert.doesNotReject(async () => {
      result = await readSidecar(shortId, { jobsDir });
    });
    assert.equal(result, null);
  });
});

// ============================================================
// 8. Returns null for non-object JSON
// ============================================================

describe('readSidecar — returns null for non-object JSON', () => {
  it('returns null when state.json contains a JSON array', async () => {
    const shortId = 'test0008a';
    placeStateJson(shortId, '[1,2,3]');
    const result = await readSidecar(shortId, { jobsDir });
    assert.equal(result, null);
  });

  it('returns null when state.json contains a JSON number', async () => {
    const shortId = 'test0008b';
    placeStateJson(shortId, '42');
    const result = await readSidecar(shortId, { jobsDir });
    assert.equal(result, null);
  });

  it('returns null when state.json contains a JSON string', async () => {
    const shortId = 'test0008c';
    placeStateJson(shortId, '"hello"');
    const result = await readSidecar(shortId, { jobsDir });
    assert.equal(result, null);
  });

  it('returns null when state.json contains JSON null', async () => {
    const shortId = 'test0008d';
    placeStateJson(shortId, 'null');
    const result = await readSidecar(shortId, { jobsDir });
    assert.equal(result, null);
  });
});

// ============================================================
// 9. Rejects path-traversal shortIds
// ============================================================

describe('readSidecar — rejects invalid shortIds', () => {
  it('throws DriverError for "../secrets" shortId', async () => {
    await assert.rejects(
      readSidecar('../secrets', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for "a/b" shortId', async () => {
    await assert.rejects(
      readSidecar('a/b', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for "a\\\\b" shortId', async () => {
    await assert.rejects(
      readSidecar('a\\b', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for "." shortId', async () => {
    await assert.rejects(
      readSidecar('.', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for ".." shortId', async () => {
    await assert.rejects(
      readSidecar('..', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for empty string shortId', async () => {
    await assert.rejects(
      readSidecar('', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for shortId with whitespace', async () => {
    await assert.rejects(
      readSidecar('ab cd', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });

  it('throws DriverError for shortId shorter than 4 chars', async () => {
    await assert.rejects(
      readSidecar('abc', { jobsDir: '/tmp/x' }),
      (err) => err instanceof Error && /invalid shortId/i.test(err.message),
    );
  });
});

// ============================================================
// 10. resolveSidecarPath uses opts.jobsDir when supplied
// ============================================================

describe('resolveSidecarPath — uses opts.jobsDir when supplied', () => {
  it('returns <jobsDir>/<shortId>/state.json when jobsDir is provided', () => {
    const result = resolveSidecarPath('abcd1234', { jobsDir: '/tmp/x/jobs' });
    assert.equal(result, '/tmp/x/jobs/abcd1234/state.json');
  });
});

// ============================================================
// 11. resolveSidecarPath uses CODEX_DELEGATION_MOCK_CLAUDE_HOME/jobs
// ============================================================

describe('resolveSidecarPath — uses CODEX_DELEGATION_MOCK_CLAUDE_HOME from opts.env', () => {
  it('returns <mockHome>/jobs/<shortId>/state.json when env var is set', () => {
    const result = resolveSidecarPath('abcd1234', {
      env: { ...process.env, CODEX_DELEGATION_MOCK_CLAUDE_HOME: '/tmp/y' },
    });
    assert.equal(result, '/tmp/y/jobs/abcd1234/state.json');
  });

  it('env path wins over the default homedir path', () => {
    const result = resolveSidecarPath('abcd1234', {
      env: { CODEX_DELEGATION_MOCK_CLAUDE_HOME: '/tmp/mock-home' },
    });
    // Must contain mock-home, not ~/.claude/jobs
    assert.ok(
      result.startsWith('/tmp/mock-home/jobs/'),
      `expected path to start with /tmp/mock-home/jobs/, got: ${result}`,
    );
  });
});

// ============================================================
// 12. readSidecar never creates directories
// ============================================================

describe('readSidecar — never creates directories', () => {
  it('does not create jobsDir or any subdirectory when jobsDir does not exist', async () => {
    const nonExistentJobsDir = join(jobsDir, 'phantom-jobs');

    assert.ok(
      !existsSync(nonExistentJobsDir),
      'precondition: phantom-jobs must not exist before call',
    );

    await readSidecar('test0012', { jobsDir: nonExistentJobsDir });

    assert.ok(
      !existsSync(nonExistentJobsDir),
      'readSidecar must not create directories as a side effect',
    );
  });
});

// ============================================================
// 13. Wrong-type state: 42 → field omitted
// ============================================================

describe('parseSidecarSnapshot — wrong-type state omitted', () => {
  it('omits state when value is a number, does not throw', () => {
    const snapshot = parseSidecarSnapshot({ state: 42, tempo: 'idle' });
    assert.equal(snapshot.state, undefined);
    assert.equal(snapshot.tempo, 'idle');
  });
});

// ============================================================
// 14. inFlight.kinds with mixed types — non-strings filtered
// ============================================================

describe('parseSidecarSnapshot — inFlight.kinds filters non-strings', () => {
  it('keeps only string elements from a mixed-type kinds array', () => {
    const snapshot = parseSidecarSnapshot({
      state: 'working',
      inFlight: { tasks: 1, queued: 0, kinds: ['tool', 42, null, 'permission', true] },
    });
    assert.deepEqual(snapshot.inFlight?.kinds, ['tool', 'permission']);
  });

  it('omits kinds entirely when all elements are non-strings', () => {
    const snapshot = parseSidecarSnapshot({
      state: 'working',
      inFlight: { tasks: 1, queued: 0, kinds: [42, null, true] },
    });
    assert.equal(snapshot.inFlight?.kinds, undefined);
  });
});

// ============================================================
// 15. inFlight set to a non-object → inFlight omitted on snapshot
// ============================================================

describe('parseSidecarSnapshot — inFlight non-object is omitted', () => {
  it('omits inFlight when value is a string', () => {
    const snapshot = parseSidecarSnapshot({ state: 'done', inFlight: 'invalid' });
    assert.equal(snapshot.inFlight, undefined);
  });

  it('omits inFlight when value is an array', () => {
    const snapshot = parseSidecarSnapshot({ state: 'done', inFlight: [1, 2, 3] });
    assert.equal(snapshot.inFlight, undefined);
  });

  it('omits inFlight when value is null', () => {
    const snapshot = parseSidecarSnapshot({ state: 'done', inFlight: null });
    assert.equal(snapshot.inFlight, undefined);
  });
});
