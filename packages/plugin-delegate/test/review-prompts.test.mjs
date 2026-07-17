// Unit tests for packages/plugin-delegate/scripts/lib/review-prompts.mjs — T1
//
// These tests verify the contract of the two exported template functions:
//   - SAME_SESSION_REVIEW_PROMPT(context?) -> string
//   - ADVERSARIAL_REVIEW_PROMPT(context)   -> string
//
// No processes are spawned. No network calls. No filesystem writes.
// Pattern: node:test + node:assert/strict, ESM — matches existing test files.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
const LIB = resolve(here, '..', '..', 'scripts', 'lib', 'review-prompts.mjs');

const { SAME_SESSION_REVIEW_PROMPT, ADVERSARIAL_REVIEW_PROMPT } = await import(LIB);

// ---------- shared forbidden tokens (Plan 0001 OQ4 + Plan 0003) ----------

const OQ4_FORBIDDEN = [
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

// ---------- helpers ----------

/**
 * Returns a minimal valid adversarial context object.
 */
function minAdversarialCtx(overrides = {}) {
  return {
    originalTask: 'Summarise the TODOs in this repo.',
    finalMessage: 'There are 3 TODOs: one in src/index.ts, two in test/helpers.ts.',
    ...overrides,
  };
}

// ==========================================================================
// SAME_SESSION_REVIEW_PROMPT
// ==========================================================================

describe('SAME_SESSION_REVIEW_PROMPT — returns a non-empty string for an empty context', () => {
  it('calling with {} returns a non-empty string', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0, 'output must be non-empty');
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — output contains a fenced ```json block', () => {
  it('output contains literal "```json"', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    assert.ok(result.includes('```json'), 'output must contain a fenced ```json block');
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — output contains all five severity tokens', () => {
  it('output contains blocker, high, medium, low, nit', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    for (const token of ['blocker', 'high', 'medium', 'low', 'nit']) {
      assert.ok(result.includes(token), `output must contain severity token "${token}"`);
    }
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — output contains all three verdict tokens', () => {
  it('output contains pass, fail, pass_with_findings', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    for (const token of ['pass', 'fail', 'pass_with_findings']) {
      assert.ok(result.includes(token), `output must contain verdict token "${token}"`);
    }
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — output contains same-session caveat referencing $claude-adversarial-review', () => {
  it('output mentions $claude-adversarial-review', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    assert.ok(
      result.includes('$claude-adversarial-review'),
      'output must contain same-session caveat referencing "$claude-adversarial-review"',
    );
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — instructs model to return pass verdict with empty findings when no issues', () => {
  it('output says to return `pass` verdict with empty findings array when no issues found', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    const lower = result.toLowerCase();
    // Require both the pass verdict instruction and the empty-findings instruction
    assert.ok(
      lower.includes('pass') && lower.includes('empty'),
      'output must instruct the model to return a pass verdict with an empty findings array when no issues are found',
    );
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — contains no numerical floor pattern', () => {
  it('output does not match "at least N", "find at least", or "minimum N findings" patterns', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    assert.equal(
      /at least\s+\d+/i.test(result),
      false,
      'output must not contain "at least <N>" (numerical floor)',
    );
    assert.equal(
      /find at least/i.test(result),
      false,
      'output must not contain "find at least" (numerical floor)',
    );
    assert.equal(
      /minimum\s+\d+\s+finding/i.test(result),
      false,
      'output must not contain "minimum N findings" (numerical floor)',
    );
  });
});

describe('SAME_SESSION_REVIEW_PROMPT — optional context fields produce longer output', () => {
  it('output with targetTurnIndex + targetTurnPromptSummary is longer than output with empty context', () => {
    const base = SAME_SESSION_REVIEW_PROMPT({});
    const withCtx = SAME_SESSION_REVIEW_PROMPT({
      targetTurnIndex: 2,
      targetTurnPromptSummary: 'Add email validation',
    });
    assert.ok(
      withCtx.length > base.length,
      'output with targetTurnIndex + targetTurnPromptSummary must be longer than empty-context output',
    );
  });
});

// ==========================================================================
// ADVERSARIAL_REVIEW_PROMPT
// ==========================================================================

describe('ADVERSARIAL_REVIEW_PROMPT — output contains both data delimiters', () => {
  it('output contains "--- BEGIN REVIEWED OUTPUT ---" and "--- END REVIEWED OUTPUT ---"', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    assert.ok(
      result.includes('--- BEGIN REVIEWED OUTPUT ---'),
      'output must contain "--- BEGIN REVIEWED OUTPUT ---"',
    );
    assert.ok(
      result.includes('--- END REVIEWED OUTPUT ---'),
      'output must contain "--- END REVIEWED OUTPUT ---"',
    );
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT — output contains prompt-injection-mitigation instruction', () => {
  it('output instructs reviewer to treat enclosed content as data, not as instructions', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    const lower = result.toLowerCase();
    // Flexible match: "treat" AND ("content" OR "data") AND "not" near "instructions"
    const hasTreat = lower.includes('treat');
    const hasContentOrData = lower.includes('content') || lower.includes('data');
    const hasNotInstructions = /not\s+as\s+instructions/.test(lower);
    assert.ok(
      hasTreat && hasContentOrData && hasNotInstructions,
      'output must instruct the reviewer to treat enclosed content as data, not as instructions (prompt-injection mitigation)',
    );
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT — injects originalTask between delimiters', () => {
  it('originalTask string appears between BEGIN and END delimiters', () => {
    const originalTask = 'Summarise the open issues in this project.';
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx({ originalTask }));
    const beginIdx = result.indexOf('--- BEGIN REVIEWED OUTPUT ---');
    const endIdx = result.indexOf('--- END REVIEWED OUTPUT ---');
    assert.ok(beginIdx !== -1, 'BEGIN delimiter must be present');
    assert.ok(endIdx !== -1, 'END delimiter must be present');
    const between = result.slice(beginIdx, endIdx);
    assert.ok(
      between.includes(originalTask),
      'originalTask must appear between the data delimiters',
    );
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT — injects finalMessage between delimiters', () => {
  it('finalMessage string appears between BEGIN and END delimiters', () => {
    const finalMessage = 'Found 7 open issues: three bugs, two features, two questions.';
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx({ finalMessage }));
    const beginIdx = result.indexOf('--- BEGIN REVIEWED OUTPUT ---');
    const endIdx = result.indexOf('--- END REVIEWED OUTPUT ---');
    assert.ok(beginIdx !== -1, 'BEGIN delimiter must be present');
    assert.ok(endIdx !== -1, 'END delimiter must be present');
    const between = result.slice(beginIdx, endIdx);
    assert.ok(
      between.includes(finalMessage),
      'finalMessage must appear between the data delimiters',
    );
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT — touchedFiles section present when files supplied', () => {
  it('file names appear in output when touchedFiles is a non-empty array', () => {
    const touchedFiles = ['src/index.ts', 'test/helpers.ts'];
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx({ touchedFiles }));
    for (const f of touchedFiles) {
      assert.ok(result.includes(f), `touchedFile "${f}" must appear in output`);
    }
  });

  it('no "Touched files:" section heading when touchedFiles is omitted', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    assert.equal(
      result.includes('Touched files:'),
      false,
      'output must not include a "Touched files:" section when touchedFiles is omitted',
    );
  });

  it('no "Touched files:" section heading when touchedFiles is an empty array', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx({ touchedFiles: [] }));
    assert.equal(
      result.includes('Touched files:'),
      false,
      'output must not include a "Touched files:" section when touchedFiles is empty',
    );
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT — output contains fenced ```json block and severity/verdict enumerations', () => {
  it('output contains ```json and all five severity tokens and all three verdict tokens', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    assert.ok(result.includes('```json'), 'adversarial output must contain a fenced ```json block');
    for (const token of ['blocker', 'high', 'medium', 'low', 'nit']) {
      assert.ok(
        result.includes(token),
        `adversarial output must contain severity token "${token}"`,
      );
    }
    for (const token of ['pass', 'fail', 'pass_with_findings']) {
      assert.ok(result.includes(token), `adversarial output must contain verdict token "${token}"`);
    }
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT — positions reviewer as someone who has NOT seen prior reasoning', () => {
  it('output contains "not seen", "without context", or equivalent phrasing', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    const lower = result.toLowerCase();
    const hasNotSeen =
      lower.includes('not seen') ||
      lower.includes('without context') ||
      lower.includes('have not seen') ||
      lower.includes('has not seen');
    assert.ok(
      hasNotSeen,
      'output must state the reviewer has NOT seen the prior reasoning (e.g., "not seen", "without context")',
    );
  });
});

// ==========================================================================
// Cross-cutting: OQ4 forbidden cost-claim tokens
// ==========================================================================

describe('neither template output contains OQ4-forbidden cost-claim tokens', () => {
  it('SAME_SESSION_REVIEW_PROMPT output contains no forbidden tokens', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    for (const token of OQ4_FORBIDDEN) {
      assert.equal(
        result.indexOf(token),
        -1,
        `SAME_SESSION_REVIEW_PROMPT output contains forbidden token "${token}"`,
      );
    }
  });

  it('ADVERSARIAL_REVIEW_PROMPT output contains no forbidden tokens', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    for (const token of OQ4_FORBIDDEN) {
      assert.equal(
        result.indexOf(token),
        -1,
        `ADVERSARIAL_REVIEW_PROMPT output contains forbidden token "${token}"`,
      );
    }
  });
});

// ==========================================================================
// Cross-cutting: Plan 0001 ban-token "claude -p"
// ==========================================================================

describe('neither template output contains the banned "claude -p" token', () => {
  it('SAME_SESSION_REVIEW_PROMPT output does not contain "claude -p"', () => {
    const result = SAME_SESSION_REVIEW_PROMPT({});
    assert.equal(
      result.includes('claude -p'),
      false,
      'SAME_SESSION_REVIEW_PROMPT output must not contain "claude -p"',
    );
  });

  it('ADVERSARIAL_REVIEW_PROMPT output does not contain "claude -p"', () => {
    const result = ADVERSARIAL_REVIEW_PROMPT(minAdversarialCtx());
    assert.equal(
      result.includes('claude -p'),
      false,
      'ADVERSARIAL_REVIEW_PROMPT output must not contain "claude -p"',
    );
  });
});

// ==========================================================================
// Cross-cutting: determinism
// ==========================================================================

describe('SAME_SESSION_REVIEW_PROMPT is deterministic', () => {
  it('calling twice with identical context returns byte-identical output', () => {
    const ctx = { targetTurnIndex: 1, targetTurnPromptSummary: 'Add validation' };
    const first = SAME_SESSION_REVIEW_PROMPT(ctx);
    const second = SAME_SESSION_REVIEW_PROMPT(ctx);
    assert.equal(first, second, 'SAME_SESSION_REVIEW_PROMPT must be deterministic');
  });
});

describe('ADVERSARIAL_REVIEW_PROMPT is deterministic', () => {
  it('calling twice with identical context returns byte-identical output', () => {
    const ctx = minAdversarialCtx({ touchedFiles: ['src/foo.ts'] });
    const first = ADVERSARIAL_REVIEW_PROMPT(ctx);
    const second = ADVERSARIAL_REVIEW_PROMPT(ctx);
    assert.equal(first, second, 'ADVERSARIAL_REVIEW_PROMPT must be deterministic');
  });
});

// ==========================================================================
// ADVERSARIAL_REVIEW_PROMPT — missing originalTask
// ==========================================================================

describe('ADVERSARIAL_REVIEW_PROMPT — missing originalTask behavior', () => {
  it('silently coerces missing originalTask (undefined injected as "undefined" in output)', () => {
    // Subagent A's implementation does not throw; it destructures and interpolates
    // `undefined` as the string "undefined". This test documents observed behavior.
    // If A had chosen to throw, this test would assert throws() instead.
    let result;
    assert.doesNotThrow(() => {
      result = ADVERSARIAL_REVIEW_PROMPT({ finalMessage: 'some output' });
    }, 'ADVERSARIAL_REVIEW_PROMPT must not throw when originalTask is missing');
    assert.equal(typeof result, 'string', 'result must still be a string');
    assert.ok(result.length > 0, 'result must be non-empty');
  });
});
