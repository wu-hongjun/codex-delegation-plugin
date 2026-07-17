// agents-json-parsing.test.mjs — T1: forward-compatibility and required-field tests
//
// These tests verify that the parseAgentsJson parser:
//   - Tolerates unknown/future fields (R1 mitigation: no deepEqual on full row)
//   - Surfaces missing required fields as undefined (not throw)
//   - Regression-guards the real-2.1.149+ row format
//
// Import: parseAgentsJson and findSessionStatus from the driver-claude-code dist.
// The workspace symlink resolves: packages/driver-claude-code -> node_modules/@codex-delegation/driver-claude-code

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAgentsJson, findSessionStatus } from '../../driver-claude-code/dist/agents-json.js';

// ---------- base row that matches the real-2.1.149+ schema ----------

function makeBase(overrides = {}) {
  return {
    pid: 55001,
    cwd: '/home/user/repo',
    kind: 'background',
    startedAt: 1780019572999,
    sessionId: 'c0ffee00-dead-beef-cafe-000000000001',
    status: 'idle',
    ...overrides,
  };
}

// ---------- T1-1: forward compat — waitingFor field (v2.1.162) ----------

describe('parseAgentsJson — forward compat: waitingFor field (v2.1.162)', () => {
  it('parses a row containing waitingFor without throwing and exposes it via raw', () => {
    const row = makeBase({ status: 'waiting', waitingFor: 'permission-prompt' });
    let result;
    assert.doesNotThrow(() => {
      result = parseAgentsJson(JSON.stringify([row]));
    });

    assert.equal(result.sessions.length, 1);
    assert.equal(result.warnings.length, 0);

    const s = result.sessions[0];
    // Known fields still parsed correctly — use targeted assertions per R1.
    assert.equal(s.sessionId, 'c0ffee00-dead-beef-cafe-000000000001');
    assert.equal(s.value, 'needs_input'); // 'waiting' normalizes to needs_input
    assert.equal(s.pid, 55001);
    // Raw keeps the original row; waitingFor is also promoted to a typed top-level field.
    assert.equal(s.raw.waitingFor, 'permission-prompt', 'waitingFor must be in raw');
    assert.equal(s.waitingFor, 'permission-prompt', 'waitingFor must be parsed');
  });
});

describe('parseAgentsJson — real state field maps to status and waiting detail', () => {
  it('normalizes state=blocked to needs_input and exposes waitingFor', () => {
    const row = makeBase({ status: undefined, state: 'blocked' });
    const { sessions } = parseAgentsJson(JSON.stringify([row]));
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].value, 'needs_input');
    assert.equal(sessions[0].waitingFor, 'blocked');

    const handle = {
      driverName: 'claude-background',
      shortId: 'c0ffee00',
      sessionId: 'c0ffee00-dead-beef-cafe-000000000001',
      sessionName: 'codex:repo:state',
      cwd: '/home/user/repo',
      startedAt: '2026-06-05T00:00:00.000Z',
    };
    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'needs_input');
    assert.equal(status.waitingFor, 'blocked');
  });
});

// ---------- T1-2: forward compat — hypothetical unknown field ----------

describe('parseAgentsJson — forward compat: arbitrary unknown field (notARealField)', () => {
  it('parses a row containing notARealField: 42 without throwing', () => {
    const row = makeBase({ notARealField: 42 });
    let result;
    assert.doesNotThrow(() => {
      result = parseAgentsJson(JSON.stringify([row]));
    });

    assert.equal(result.sessions.length, 1);
    assert.equal(result.warnings.length, 0);

    const s = result.sessions[0];
    assert.equal(s.sessionId, 'c0ffee00-dead-beef-cafe-000000000001');
    assert.equal(s.raw.notARealField, 42, 'unknown field must be preserved in raw');
    assert.ok(!('notARealField' in s), 'unknown field must not appear as a top-level parsed field');
  });
});

// ---------- T1-3: missing sessionId — parser does not throw; findSessionStatus returns orphaned ----------

describe('parseAgentsJson — missing sessionId: tolerant parse, orphaned lookup', () => {
  it('does not throw when sessionId is absent; row survives with sessionId: undefined', () => {
    const row = { pid: 55001, status: 'idle', cwd: '/home/user/repo' };
    let result;
    assert.doesNotThrow(() => {
      result = parseAgentsJson(JSON.stringify([row]));
    });

    assert.equal(result.sessions.length, 1);
    const s = result.sessions[0];
    assert.equal(s.sessionId, undefined, 'sessionId must be undefined when absent');
    assert.equal(s.pid, 55001);
  });

  it('findSessionStatus returns orphaned for a handle whose sessionId matches nothing', () => {
    const row = { pid: 55001, status: 'idle', cwd: '/home/user/repo' };
    const { sessions } = parseAgentsJson(JSON.stringify([row]));

    const handle = {
      driverName: 'claude-background',
      shortId: 'zzzzzzzz',
      sessionId: 'session-not-present',
      sessionName: 'codex:repo:nonexistent',
      cwd: '/home/user/repo',
      startedAt: '2026-06-05T00:00:00.000Z',
    };

    const status = findSessionStatus(sessions, handle);
    assert.equal(status.value, 'orphaned');
  });
});

// ---------- T1-4: missing pid — parser does not throw; pid is undefined ----------

describe('parseAgentsJson — missing pid: tolerant parse', () => {
  it('does not throw when pid is absent; parsed session has pid: undefined', () => {
    const row = {
      sessionId: 'c0ffee00-dead-beef-cafe-000000000002',
      status: 'idle',
      cwd: '/home/user/repo',
    };
    let result;
    assert.doesNotThrow(() => {
      result = parseAgentsJson(JSON.stringify([row]));
    });

    assert.equal(result.sessions.length, 1);
    const s = result.sessions[0];
    assert.equal(s.pid, undefined, 'pid must be undefined when absent');
    assert.equal(s.sessionId, 'c0ffee00-dead-beef-cafe-000000000002');
  });
});

// ---------- T1-5: regression — real-2.1.149+ row format still works ----------

describe('parseAgentsJson — regression: real-2.1.149+ row format', () => {
  it('parses the 2.1.149+ minimal row (no shortId, epoch startedAt, pid + sessionId + status)', () => {
    const row = makeBase(); // uses the exact 2.1.149 shape
    const { sessions, warnings } = parseAgentsJson(JSON.stringify([row]));

    assert.equal(sessions.length, 1);
    assert.equal(warnings.length, 0);

    const s = sessions[0];
    // Required fields.
    assert.equal(s.sessionId, 'c0ffee00-dead-beef-cafe-000000000001');
    assert.equal(s.pid, 55001);
    assert.equal(s.cwd, '/home/user/repo');
    assert.equal(s.value, 'idle');
    // shortId derived from sessionId (first 8 hex chars, dashes stripped).
    assert.equal(s.shortId, 'c0ffee00', 'shortId must be derived from sessionId');
    // startedAt converted from Unix ms to ISO string.
    assert.equal(typeof s.startedAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(s.startedAt)), 'startedAt must parse as a valid date');
    // Fields absent in 2.1.149 rows must be undefined (not throw, not null).
    assert.equal(s.sessionName, undefined);
    assert.equal(s.updatedAt, undefined);
    assert.equal(s.transcriptPath, undefined);
  });
});
