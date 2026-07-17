// Tests for parseTranscriptJsonl, discoverTranscriptPath, readTranscriptEvents — T8
//
// Parser-only tests (1–11) call parseTranscriptJsonl directly with inline text or
// fixture-file content — no process spawning needed.
//
// Path-discovery and round-trip tests (12–17) use a real temp directory to exercise
// discoverTranscriptPath and readTranscriptEvents without touching ~/.claude.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseTranscriptJsonl,
  discoverTranscriptPath,
  readTranscriptEvents,
} from '../dist/transcript.js';

// ---------- fixture paths ----------

const here = fileURLToPath(import.meta.url);
const FIXTURES = join(dirname(here), 'fixtures', 'transcripts');

const basic = readFileSync(join(FIXTURES, 'basic.jsonl'), 'utf8');
const mixedTools = readFileSync(join(FIXTURES, 'mixed-tools.jsonl'), 'utf8');
const malformed = readFileSync(join(FIXTURES, 'malformed.jsonl'), 'utf8');

// ---------- env save / restore for path-discovery tests ----------

const PREV_MOCK_HOME = process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME;

let MOCK_HOME;

beforeEach(() => {
  MOCK_HOME = mkdtempSync(join(tmpdir(), 'transcript-test-'));
  process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME = MOCK_HOME;
});

afterEach(() => {
  if (PREV_MOCK_HOME === undefined) delete process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME;
  else process.env.CODEX_DELEGATION_MOCK_CLAUDE_HOME = PREV_MOCK_HOME;
  rmSync(MOCK_HOME, { recursive: true, force: true });
});

// ============================================================
// 1. basic.jsonl → 3 message.completed events, 0 warnings
// ============================================================

describe('parseTranscriptJsonl — basic.jsonl', () => {
  it('returns 3 message.completed events and 0 warnings, skipping meta', () => {
    const { events, warnings } = parseTranscriptJsonl(basic);

    const msgs = events.filter((e) => e.type === 'message.completed');
    assert.equal(msgs.length, 3, 'expected 3 message.completed events');
    assert.equal(warnings.length, 0, 'expected 0 warnings for well-formed input');

    // meta record must not become an event
    assert.ok(
      events.every((e) => e.type !== 'meta'),
      'meta records must not produce events',
    );
  });
});

// ============================================================
// 2. Content arrays concatenate to text
// ============================================================

describe('parseTranscriptJsonl — content array concatenation', () => {
  it('joins text-block arrays with newline for the last assistant message', () => {
    const { events } = parseTranscriptJsonl(basic);
    const assistantMsgs = events.filter(
      (e) => e.type === 'message.completed' && e.role === 'assistant',
    );
    // Last assistant message has a content array in the fixture
    const last = assistantMsgs[assistantMsgs.length - 1];
    assert.equal(last.content, 'Found 3 TODOs.\nThey are in src/a.ts, src/b.ts, src/c.ts.');
  });
});

// ============================================================
// 3. mixed-tools.jsonl → tool.started + tool.completed for Read (ok: true)
// ============================================================

describe('parseTranscriptJsonl — tool.started for Read', () => {
  it('emits tool.started with tool name "Read" and correct input', () => {
    const { events } = parseTranscriptJsonl(mixedTools);
    const started = events.find((e) => e.type === 'tool.started' && e.tool === 'Read');
    assert.ok(started, 'expected a tool.started event for Read');
    assert.deepEqual(started.input, { path: 'README.md' });
  });
});

describe('parseTranscriptJsonl — tool.completed for Read has ok:true', () => {
  it('emits tool.completed with ok:true and resultPreview containing "# Hello"', () => {
    const { events } = parseTranscriptJsonl(mixedTools);
    const completed = events.find((e) => e.type === 'tool.completed' && e.tool === 'Read');
    assert.ok(completed, 'expected a tool.completed event for Read');
    assert.equal(completed.ok, true);
    assert.ok(
      typeof completed.resultPreview === 'string' && completed.resultPreview.includes('# Hello'),
      `expected resultPreview to contain "# Hello", got: ${completed.resultPreview}`,
    );
  });
});

// ============================================================
// 4. mixed-tools.jsonl → tool.completed for Edit has ok:false
// ============================================================

describe('parseTranscriptJsonl — tool.completed for Edit has ok:false', () => {
  it('emits tool.completed with ok:false when is_error is true', () => {
    const { events } = parseTranscriptJsonl(mixedTools);
    const completed = events.find((e) => e.type === 'tool.completed' && e.tool === 'Edit');
    assert.ok(completed, 'expected a tool.completed event for Edit');
    assert.equal(completed.ok, false);
  });
});

// ============================================================
// 5. mixed-tools.jsonl → file.changed event
// ============================================================

describe('parseTranscriptJsonl — file.changed event', () => {
  it('emits file.changed with path "README.md" and op "modify"', () => {
    const { events } = parseTranscriptJsonl(mixedTools);
    const fc = events.find((e) => e.type === 'file.changed');
    assert.ok(fc, 'expected a file.changed event');
    assert.equal(fc.path, 'README.md');
    assert.equal(fc.op, 'modify');
  });
});

// ============================================================
// 6. mixed-tools.jsonl → usage.updated event with all token counts
// ============================================================

describe('parseTranscriptJsonl — usage.updated event', () => {
  it('emits usage.updated with input:120, output:40, cacheRead:5000, cacheCreate:800', () => {
    const { events } = parseTranscriptJsonl(mixedTools);
    const usage = events.find((e) => e.type === 'usage.updated');
    assert.ok(usage, 'expected a usage.updated event');
    assert.equal(usage.input, 120);
    assert.equal(usage.output, 40);
    assert.equal(usage.cacheRead, 5000);
    assert.equal(usage.cacheCreate, 800);
  });
});

// ============================================================
// 7. malformed.jsonl — errors + surrounding valid messages still parse
// ============================================================

describe('parseTranscriptJsonl — malformed.jsonl', () => {
  it('emits 2 valid message.completed events surrounding the bad lines', () => {
    const { events } = parseTranscriptJsonl(malformed);
    const msgs = events.filter((e) => e.type === 'message.completed');
    // user "hello" + assistant "recovered" — the assistant with broken JSON is dropped
    assert.equal(msgs.length, 2, `expected 2 message.completed events, got ${msgs.length}`);
    assert.ok(
      msgs.some((m) => m.role === 'user' && m.content === 'hello'),
      'expected user "hello" message',
    );
    assert.ok(
      msgs.some((m) => m.role === 'assistant' && m.content === 'recovered'),
      'expected assistant "recovered" message',
    );
  });

  it('emits one error event for the malformed JSON line (line 3)', () => {
    const { events } = parseTranscriptJsonl(malformed);
    const errs = events.filter((e) => e.type === 'error');
    const parseErr = errs.find(
      (e) => /line 3/i.test(e.message) || /parse/i.test(e.message) || /json/i.test(e.message),
    );
    assert.ok(
      parseErr,
      `expected an error event for malformed JSON; got errors: ${JSON.stringify(errs.map((e) => e.message))}`,
    );
  });

  it('emits one error event for the unrecognized record (line 4)', () => {
    const { events } = parseTranscriptJsonl(malformed);
    const errs = events.filter((e) => e.type === 'error');
    // At least 2 error events total: one for invalid JSON, one for unknown record
    assert.ok(
      errs.length >= 2,
      `expected at least 2 error events, got ${errs.length}: ${JSON.stringify(errs.map((e) => e.message))}`,
    );
  });

  it('has warnings array with 2 entries — one with line:3 and one with line:4', () => {
    const { warnings } = parseTranscriptJsonl(malformed);
    assert.equal(warnings.length, 2, `expected 2 warnings, got ${warnings.length}`);
    const lines = warnings.map((w) => w.line).sort((a, b) => a - b);
    assert.deepEqual(lines, [3, 4]);
  });
});

// ============================================================
// 8. Empty input → empty result
// ============================================================

describe('parseTranscriptJsonl — empty input', () => {
  it('returns empty events and warnings for an empty string', () => {
    const result = parseTranscriptJsonl('');
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.warnings, []);
  });
});

// ============================================================
// 9. Blank lines are ignored
// ============================================================

describe('parseTranscriptJsonl — blank lines', () => {
  it('ignores lines that are only whitespace, producing no events or warnings', () => {
    const result = parseTranscriptJsonl('\n\n   \n');
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.warnings, []);
  });
});

// ============================================================
// 10. Snake_case usage fields work (verified by mixed-tools fixture above)
// ============================================================
// Already covered by test 6 which uses the snake_case fixture fields.

// ============================================================
// 11. CamelCase usage fields also map correctly
// ============================================================

describe('parseTranscriptJsonl — camelCase usage fields', () => {
  it('maps cacheReadInputTokens and cacheCreationInputTokens to cacheRead/cacheCreate', () => {
    const line = JSON.stringify({
      usage: {
        inputTokens: 50,
        outputTokens: 20,
        cacheReadInputTokens: 1000,
        cacheCreationInputTokens: 200,
      },
      timestamp: '2026-05-30T13:00:00.000Z',
    });
    const { events, warnings } = parseTranscriptJsonl(line + '\n');
    const usage = events.find((e) => e.type === 'usage.updated');
    assert.ok(usage, 'expected a usage.updated event from camelCase fields');
    assert.equal(usage.input, 50);
    assert.equal(usage.output, 20);
    assert.equal(usage.cacheRead, 1000);
    assert.equal(usage.cacheCreate, 200);
    assert.equal(warnings.length, 0);
  });
});

// ============================================================
// 12. discoverTranscriptPath — explicit path that exists
// ============================================================

describe('discoverTranscriptPath — explicit path that exists', () => {
  it('returns the provided transcriptPath when the file exists', async () => {
    const fixturePath = join(FIXTURES, 'basic.jsonl');
    const result = await discoverTranscriptPath({ transcriptPath: fixturePath });
    assert.equal(result, fixturePath);
  });
});

// ============================================================
// 13. discoverTranscriptPath — explicit path that does not exist
// ============================================================

describe('discoverTranscriptPath — explicit path that does not exist', () => {
  it('returns null when the provided transcriptPath does not exist', async () => {
    const result = await discoverTranscriptPath({
      transcriptPath: join(MOCK_HOME, 'nonexistent.jsonl'),
    });
    assert.equal(result, null);
  });
});

// ============================================================
// 14. discoverTranscriptPath — finds <sessionId>.jsonl under mock projects root
// ============================================================

describe('discoverTranscriptPath — discovers sessionId.jsonl under projects root', () => {
  it('returns the path when a file named <sessionId>.jsonl exists under projects/', async () => {
    const sessionId = 'session-abc123';
    const projectsDir = join(MOCK_HOME, 'projects');
    mkdirSync(projectsDir, { recursive: true });
    const transcriptFile = join(projectsDir, `${sessionId}.jsonl`);
    writeFileSync(transcriptFile, basic);

    const result = await discoverTranscriptPath({
      sessionId,
      claudeProjectsDir: projectsDir,
    });
    assert.equal(result, transcriptFile);
  });
});

// ============================================================
// 15. discoverTranscriptPath — returns null and does NOT create directories
// ============================================================

describe('discoverTranscriptPath — returns null when nothing found, no side effects', () => {
  it('returns null and does not create any new directories in MOCK_HOME', async () => {
    // Snapshot the directory tree before the call
    const entriesBefore = readdirSync(MOCK_HOME);

    const result = await discoverTranscriptPath({
      sessionId: 'session-ghost',
      sessionName: 'codex:ghost:999',
      claudeProjectsDir: join(MOCK_HOME, 'projects'),
    });

    const entriesAfter = readdirSync(MOCK_HOME);

    assert.equal(result, null);
    assert.deepEqual(
      entriesBefore.sort(),
      entriesAfter.sort(),
      'discoverTranscriptPath must not create directories as a side effect',
    );
  });
});

// ============================================================
// 16. readTranscriptEvents — explicit path returns parsed events
// ============================================================

describe('readTranscriptEvents — explicit transcriptPath', () => {
  it('returns transcriptPath and parsed events from the fixture file', async () => {
    const fixturePath = join(FIXTURES, 'basic.jsonl');
    const result = await readTranscriptEvents({ transcriptPath: fixturePath });

    assert.equal(result.transcriptPath, fixturePath);
    const msgs = result.events.filter((e) => e.type === 'message.completed');
    assert.equal(msgs.length, 3);
    assert.equal(result.warnings.length, 0);
  });
});

// ============================================================
// 17. readTranscriptEvents — nothing to discover returns null path + warning
// ============================================================

describe('readTranscriptEvents — no path and nothing discoverable', () => {
  it('returns transcriptPath:null and a warning with /transcript not found/, does not throw', async () => {
    let result;
    await assert.doesNotReject(async () => {
      result = await readTranscriptEvents({
        claudeProjectsDir: join(MOCK_HOME, 'projects'),
        sessionId: 'session-ghost-999',
      });
    });

    assert.equal(result.transcriptPath, null);
    assert.deepEqual(result.events, []);
    assert.ok(result.warnings.length >= 1, 'expected at least one warning');
    const w = result.warnings[0];
    assert.equal(w.line, 0);
    assert.match(w.message, /transcript not found/i);
  });
});
