// Tests for agents-json.ts parser utilities — T7 (unit tests, no process spawn)
//
// Import strategy:
//   - parseAgentsJson, findSessionStatus from '../dist/agents-json.js'
//
// These tests exercise the pure parser logic in isolation. They do not spawn any
// process or write any file. All inputs are inline JSON strings or plain objects.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAgentsJson, findSessionStatus, deriveShortId } from '../dist/agents-json.js';

// ---------- helpers ----------

function makeSession(overrides = {}) {
  return {
    id: 'abc123',
    shortId: 'abc123',
    sessionId: 'session-abc123',
    name: 'codex:repo:abc123',
    cwd: '/home/user/repo',
    pid: 12345,
    status: 'working',
    startedAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:01:00.000Z',
    transcriptPath: '/home/user/.claude/projects/repo/session-abc123.jsonl',
    ...overrides,
  };
}

// ---------- parseAgentsJson tests ----------

describe('parseAgentsJson — parses mock shape', () => {
  it('parses all expected fields from a well-formed session object', () => {
    const raw = JSON.stringify([makeSession()]);
    const { sessions, warnings } = parseAgentsJson(raw);

    assert.equal(sessions.length, 1);
    assert.equal(warnings.length, 0);

    const s = sessions[0];
    assert.equal(s.shortId, 'abc123');
    assert.equal(s.sessionId, 'session-abc123');
    assert.equal(s.sessionName, 'codex:repo:abc123');
    assert.equal(s.cwd, '/home/user/repo');
    assert.equal(s.pid, 12345);
    assert.equal(s.value, 'working');
    assert.equal(s.startedAt, '2026-05-30T10:00:00.000Z');
    assert.equal(s.updatedAt, '2026-05-30T10:01:00.000Z');
    assert.equal(s.transcriptPath, '/home/user/.claude/projects/repo/session-abc123.jsonl');
  });
});

describe('parseAgentsJson — snake_case aliases', () => {
  it('maps session_id, started_at, updated_at, transcript_path to camelCase fields', () => {
    const entry = {
      id: 'def456',
      shortId: 'def456',
      session_id: 'session-def456',
      name: 'codex:repo:def456',
      cwd: '/home/user/repo',
      pid: 99,
      status: 'working',
      started_at: '2026-05-30T11:00:00.000Z',
      updated_at: '2026-05-30T11:01:00.000Z',
      transcript_path: '/home/user/.claude/projects/repo/session-def456.jsonl',
    };
    const { sessions, warnings } = parseAgentsJson(JSON.stringify([entry]));

    assert.equal(sessions.length, 1);
    assert.equal(warnings.length, 0);

    const s = sessions[0];
    assert.equal(s.sessionId, 'session-def456');
    assert.equal(s.startedAt, '2026-05-30T11:00:00.000Z');
    assert.equal(s.updatedAt, '2026-05-30T11:01:00.000Z');
    assert.equal(s.transcriptPath, '/home/user/.claude/projects/repo/session-def456.jsonl');
  });
});

describe('parseAgentsJson — projectPath aliased to cwd', () => {
  it('uses projectPath as cwd when cwd is absent', () => {
    const entry = {
      id: 'ghi789',
      shortId: 'ghi789',
      sessionId: 'session-ghi789',
      name: 'codex:repo:ghi789',
      projectPath: '/home/user/project',
      status: 'working',
      startedAt: '2026-05-30T12:00:00.000Z',
      updatedAt: '2026-05-30T12:01:00.000Z',
    };
    const { sessions } = parseAgentsJson(JSON.stringify([entry]));

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].cwd, '/home/user/project');
  });
});

describe('parseAgentsJson — tolerates extra fields', () => {
  it('ignores unknown keys; raw field retains entire original entry', () => {
    const entry = {
      ...makeSession(),
      extraKey: 'extra-value',
      anotherExtra: 42,
    };
    const { sessions, warnings } = parseAgentsJson(JSON.stringify([entry]));

    assert.equal(sessions.length, 1);
    assert.equal(warnings.length, 0);
    // Known fields still parsed correctly.
    assert.equal(sessions[0].shortId, 'abc123');
    // raw retains the full original object including extras.
    assert.equal(sessions[0].raw.extraKey, 'extra-value');
    assert.equal(sessions[0].raw.anotherExtra, 42);
  });
});

describe('parseAgentsJson — non-object array entries skipped with warning', () => {
  it('skips strings, null, and numbers; emits one warning per skipped entry', () => {
    const arr = [makeSession(), 'not-an-object', null, 42];
    const { sessions, warnings } = parseAgentsJson(JSON.stringify(arr));

    assert.equal(sessions.length, 1, 'only the valid object survives');
    assert.equal(warnings.length, 3, 'one warning per skipped entry');

    // Each warning must carry an index and a message.
    const indices = warnings.map((w) => w.index);
    assert.ok(indices.includes(1), 'warning for index 1 (string)');
    assert.ok(indices.includes(2), 'warning for index 2 (null)');
    assert.ok(indices.includes(3), 'warning for index 3 (number)');
    for (const w of warnings) {
      assert.equal(typeof w.message, 'string', 'warning.message must be a string');
    }
  });
});

describe('parseAgentsJson — status normalization', () => {
  // Maps status string → expected SessionStatusValue.
  const cases = [
    ['running', 'working'],
    ['IN_PROGRESS', 'working'],
    ['waiting', 'needs_input'],
    ['needs_input', 'needs_input'],
    ['Needs_Input', 'needs_input'],
    ['complete', 'completed'],
    ['done', 'completed'],
    ['completed', 'completed'],
    ['ERROR', 'failed'],
    ['error', 'failed'],
    ['failed', 'failed'],
    ['cancelled', 'stopped'],
    ['canceled', 'stopped'],
    ['stopped', 'stopped'],
    ['initializing', 'starting'],
    ['starting', 'starting'],
    ['queued', 'queued'],
    ['idle', 'idle'],
    ['working', 'working'],
  ];

  for (const [input, expected] of cases) {
    it(`normalizes status "${input}" to "${expected}"`, () => {
      const entry = makeSession({ status: input });
      const { sessions } = parseAgentsJson(JSON.stringify([entry]));
      assert.equal(sessions.length, 1);
      assert.equal(
        sessions[0].value,
        expected,
        `"${input}" → expected "${expected}" but got "${sessions[0].value}"`,
      );
    });
  }
});

describe('parseAgentsJson — unknown status maps to "unknown"', () => {
  it('returns value: "unknown" without throwing for an unrecognised status string', () => {
    const entry = makeSession({ status: 'frobnicate' });
    const { sessions } = parseAgentsJson(JSON.stringify([entry]));

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].value, 'unknown');
    // Unknown status is not a fatal parse error — no throw. We don't assert on
    // warnings: implementation-defined whether unknown status is warning-worthy.
  });
});

describe('parseAgentsJson — malformed JSON throws', () => {
  it('throws when given syntactically invalid JSON', () => {
    assert.throws(
      () => parseAgentsJson('not json{'),
      (err) => {
        // Any thrown error is acceptable (SyntaxError, DriverError, etc.)
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });
});

describe('parseAgentsJson — non-array top-level JSON throws', () => {
  it('throws when given a JSON object instead of an array', () => {
    assert.throws(
      () => parseAgentsJson('{"key": "value"}'),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('throws when given a JSON string scalar', () => {
    assert.throws(() => parseAgentsJson('"just a string"'));
  });

  it('throws when given a JSON number scalar', () => {
    assert.throws(() => parseAgentsJson('42'));
  });
});

// ---------- findSessionStatus tests ----------

describe('findSessionStatus — match by sessionId', () => {
  it('returns the matching session when handle.sessionId is present', () => {
    const sessions = [
      makeSession({ shortId: 'aaa111', sessionId: 'session-aaa111', name: 'codex:repo:aaa' }),
      makeSession({ shortId: 'bbb222', sessionId: 'session-bbb222', name: 'codex:repo:bbb' }),
    ].map((s) => ({ ...parseAgentsJson(JSON.stringify([s])).sessions[0] }));

    const handle = {
      driverName: 'claude-background',
      shortId: 'aaa111',
      sessionId: 'session-aaa111',
      sessionName: 'codex:repo:aaa',
      cwd: '/home/user/repo',
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'working');
    assert.equal(status.sessionId, 'session-aaa111');
  });
});

describe('findSessionStatus — match by shortId', () => {
  it('returns the matching session when sessionId is absent but shortId matches', () => {
    const sessions = parseAgentsJson(
      JSON.stringify([
        makeSession({ shortId: 'ccc333', sessionId: 'session-ccc333', name: 'codex:repo:ccc' }),
      ]),
    ).sessions;

    const handle = {
      driverName: 'claude-background',
      shortId: 'ccc333',
      // sessionId intentionally absent
      sessionName: 'codex:repo:ccc',
      cwd: '/home/user/repo',
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'working');
    assert.equal(status.shortId, 'ccc333');
  });
});

describe('findSessionStatus — match by sessionName', () => {
  it('returns the matching session when neither shortId nor sessionId matches but name matches', () => {
    const sessions = parseAgentsJson(
      JSON.stringify([
        makeSession({
          shortId: 'ddd444',
          sessionId: 'session-ddd444',
          name: 'codex:repo:unique-name',
        }),
      ]),
    ).sessions;

    const handle = {
      driverName: 'claude-background',
      shortId: 'zzz000', // does not match
      sessionName: 'codex:repo:unique-name',
      cwd: '/home/user/repo',
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'working');
    assert.equal(status.shortId, 'ddd444');
  });
});

describe('findSessionStatus — ambiguous name prefers matching cwd', () => {
  it('picks the session whose cwd matches the handle cwd when two sessions share a name', () => {
    const sessions = parseAgentsJson(
      JSON.stringify([
        makeSession({
          shortId: 'eee555',
          sessionId: 'session-eee555',
          name: 'codex:repo:shared-name',
          cwd: '/home/user/repo-a',
        }),
        makeSession({
          shortId: 'fff666',
          sessionId: 'session-fff666',
          name: 'codex:repo:shared-name',
          cwd: '/home/user/repo-b',
        }),
      ]),
    ).sessions;

    const handle = {
      driverName: 'claude-background',
      shortId: 'zzz000',
      sessionName: 'codex:repo:shared-name',
      cwd: '/home/user/repo-b',
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.shortId, 'fff666', 'should pick the session with matching cwd');
  });
});

describe('findSessionStatus — ambiguous name + cwd both match prefers most recent updatedAt', () => {
  it('picks the session with the later updatedAt when name and cwd both match', () => {
    const sessions = parseAgentsJson(
      JSON.stringify([
        makeSession({
          shortId: 'ggg777',
          sessionId: 'session-ggg777',
          name: 'codex:repo:shared-name',
          cwd: '/home/user/repo',
          updatedAt: '2026-05-30T09:00:00.000Z', // older
        }),
        makeSession({
          shortId: 'hhh888',
          sessionId: 'session-hhh888',
          name: 'codex:repo:shared-name',
          cwd: '/home/user/repo',
          updatedAt: '2026-05-30T10:30:00.000Z', // newer
        }),
      ]),
    ).sessions;

    const handle = {
      driverName: 'claude-background',
      shortId: 'zzz000',
      sessionName: 'codex:repo:shared-name',
      cwd: '/home/user/repo',
      startedAt: '2026-05-30T08:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.shortId, 'hhh888', 'should pick the most recently updated session');
  });
});

describe('findSessionStatus — no match returns orphaned', () => {
  it('returns value: "orphaned" without throwing when no session matches', () => {
    const sessions = parseAgentsJson(
      JSON.stringify([
        makeSession({ shortId: 'iii999', sessionId: 'session-iii999', name: 'codex:repo:other' }),
      ]),
    ).sessions;

    const handle = {
      driverName: 'claude-background',
      shortId: 'zzz000',
      sessionId: 'session-zzz000',
      sessionName: 'codex:repo:nonexistent',
      cwd: '/home/user/repo',
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    let status;
    assert.doesNotThrow(() => {
      status = findSessionStatus(sessions, handle);
    });

    assert.equal(status.value, 'orphaned');
    // Handle fields propagated into the status.
    assert.equal(status.shortId, handle.shortId);
    assert.equal(status.sessionName, handle.sessionName);
  });
});

// -----------------------------------------------------------------------
// New tests: real-2.1.149 schema support
// -----------------------------------------------------------------------

// Real-2.1.149 entry shape: pid, cwd, kind, startedAt (unix ms), sessionId (UUID), status.
// No id, shortId, name, updatedAt, transcriptPath.
function makeRealEntry(overrides = {}) {
  return {
    pid: 12345,
    cwd: '/home/user/repo',
    kind: 'interactive',
    startedAt: 1780019572999, // Unix ms
    sessionId: '9d1558d0-a52e-43f9-a427-4b7d9ba8f4fa',
    status: 'idle',
    ...overrides,
  };
}

describe('deriveShortId', () => {
  it('derives "9d1558d0" from "9d1558d0-a52e-43f9-a427-4b7d9ba8f4fa"', () => {
    assert.equal(deriveShortId('9d1558d0-a52e-43f9-a427-4b7d9ba8f4fa'), '9d1558d0');
  });

  it('returns undefined for an empty string', () => {
    assert.equal(deriveShortId(''), undefined);
  });

  it('returns undefined for undefined input', () => {
    assert.equal(deriveShortId(undefined), undefined);
  });

  it('handles UUID without hyphens', () => {
    assert.equal(deriveShortId('9d1558d0a52e43f9a4274b7d9ba8f4fa'), '9d1558d0');
  });
});

describe('parseAgentsJson — real-2.1.149 entry (no shortId, startedAt as unix ms)', () => {
  it('populates shortId via derivation from sessionId when entry lacks explicit shortId', () => {
    const raw = JSON.stringify([makeRealEntry()]);
    const { sessions, warnings } = parseAgentsJson(raw);

    assert.equal(sessions.length, 1);
    assert.equal(warnings.length, 0);
    const s = sessions[0];
    assert.equal(s.shortId, '9d1558d0', 'shortId should be derived from sessionId');
    assert.equal(s.sessionId, '9d1558d0-a52e-43f9-a427-4b7d9ba8f4fa');
  });

  it('converts startedAt from Unix milliseconds to a parseable ISO string', () => {
    const raw = JSON.stringify([makeRealEntry({ startedAt: 1780019572999 })]);
    const { sessions } = parseAgentsJson(raw);

    assert.equal(sessions.length, 1);
    const s = sessions[0];
    assert.equal(typeof s.startedAt, 'string', 'startedAt must be a string after conversion');
    assert.ok(!Number.isNaN(Date.parse(s.startedAt)), 'startedAt must be a valid ISO date string');
    // Verify the epoch is preserved (within 1ms rounding).
    assert.ok(
      Math.abs(new Date(s.startedAt).getTime() - 1780019572999) <= 1,
      `expected epoch ~1780019572999, got ${new Date(s.startedAt).getTime()}`,
    );
  });

  it('normalizes status "busy" to "working"', () => {
    const raw = JSON.stringify([makeRealEntry({ status: 'busy' })]);
    const { sessions } = parseAgentsJson(raw);
    assert.equal(sessions[0].value, 'working');
  });

  it('normalizes status "waiting" to "needs_input"', () => {
    const raw = JSON.stringify([makeRealEntry({ status: 'waiting' })]);
    const { sessions } = parseAgentsJson(raw);
    assert.equal(sessions[0].value, 'needs_input');
  });

  it('normalizes status "idle" to "idle"', () => {
    const raw = JSON.stringify([makeRealEntry({ status: 'idle' })]);
    const { sessions } = parseAgentsJson(raw);
    assert.equal(sessions[0].value, 'idle');
  });

  it('tolerates missing name, updatedAt, transcriptPath (leaves them undefined)', () => {
    const raw = JSON.stringify([makeRealEntry()]);
    const { sessions } = parseAgentsJson(raw);
    const s = sessions[0];
    assert.equal(s.sessionName, undefined, 'sessionName must be undefined when absent');
    assert.equal(s.updatedAt, undefined, 'updatedAt must be undefined when absent');
    assert.equal(s.transcriptPath, undefined, 'transcriptPath must be undefined when absent');
  });
});

describe('findSessionStatus — matches by derived shortId (real-2.1.149 entries)', () => {
  it('matches handle.shortId to deriveShortId(entry.sessionId) when entry lacks explicit shortId', () => {
    const raw = JSON.stringify([makeRealEntry()]);
    const { sessions } = parseAgentsJson(raw);

    const handle = {
      driverName: 'claude-background',
      shortId: '9d1558d0', // derived from sessionId
      sessionName: 'codex:repo:test',
      cwd: '/home/user/repo',
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'idle');
    assert.equal(status.shortId, '9d1558d0');
  });

  it('does NOT match by cwd alone when neither sessionId, shortId, nor sessionName match', () => {
    const raw = JSON.stringify([
      makeRealEntry({
        sessionId: 'aaaabbbb-cccc-dddd-eeee-ffffffffffff',
        cwd: '/home/user/repo',
      }),
    ]);
    const { sessions } = parseAgentsJson(raw);

    const handle = {
      driverName: 'claude-background',
      shortId: 'zzzzzzzz', // does not match
      // no sessionId on handle
      sessionName: 'codex:repo:nonexistent', // does not match (no name in real entry)
      cwd: '/home/user/repo', // matches cwd but cwd-only match is not allowed
      startedAt: '2026-05-30T10:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'orphaned', 'should return orphaned, not match by cwd alone');
  });
});
