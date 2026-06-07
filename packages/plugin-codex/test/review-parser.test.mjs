// Unit tests for packages/plugin-codex/scripts/lib/review-parser.mjs — T2
//
// These tests verify the contract of the exported function:
//   parseReviewOutput(text) -> { verdict, findings[] }
//
// Parser priority (four-step strategy):
//   1. First fenced ```json block in the response.
//   2. Whole response as bare JSON.
//   3. Markdown/human-format scan (regex pattern matching).
//   4. Fallback: single nit finding with raw text (or placeholder for empty).
//
// No processes are spawned. No network calls. No filesystem writes.
// Pattern: node:test + node:assert/strict, ESM — matches existing test files.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
const LIB = resolve(here, '..', '..', 'scripts', 'lib', 'review-parser.mjs');
const FORMAT_LIB = resolve(here, '..', '..', 'scripts', 'lib', 'format.mjs');

const { parseReviewOutput } = await import(LIB);
const { formatReviewHuman } = await import(FORMAT_LIB);

// ---------- canonical fixtures ----------

/** Canonical fenced JSON block input (matches § 3.3 shape). */
const FENCED_PASS_WITH_FINDINGS = `Here is my review.

\`\`\`json
{
  "verdict": "pass_with_findings",
  "findings": [
    {
      "severity": "high",
      "description": "The summary omits TODOs in test files.",
      "recommendation": "Include test/ directory in the scan.",
      "file": "src/index.ts",
      "line": 42
    },
    {
      "severity": "low",
      "description": "Line counts are approximate.",
      "recommendation": "Use exact line numbers.",
      "file": null,
      "line": null
    }
  ]
}
\`\`\`

Some trailing text that should be ignored.`;

/** Canonical bare JSON input (no fenced block). */
const BARE_JSON_PASS_WITH_FINDINGS = `{
  "verdict": "pass_with_findings",
  "findings": [
    {
      "severity": "high",
      "description": "The summary omits TODOs in test files.",
      "recommendation": "Include test/ directory in the scan.",
      "file": "src/index.ts",
      "line": 42
    },
    {
      "severity": "low",
      "description": "Line counts are approximate.",
      "recommendation": "Use exact line numbers.",
      "file": null,
      "line": null
    }
  ]
}`;

/** Canonical markdown/human-readable format (matches § 3.3 example). */
const MARKDOWN_PASS_WITH_FINDINGS = `Review verdict: PASS WITH FINDINGS

Findings:
  [HIGH] The summary omits TODOs in test files.
    Recommendation: Include test/ directory in the scan.
  [LOW] Line counts are approximate.
    Recommendation: Use exact line numbers.`;

// ==========================================================================
// 1. Fenced ```json block parses correctly
// ==========================================================================

describe('fenced ```json block — parses correctly', () => {
  it('returns the correct verdict from fenced block', () => {
    const result = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('returns exactly two findings from fenced block', () => {
    const result = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    assert.equal(result.findings.length, 2);
  });

  it('first finding has correct severity, description, recommendation, file, line', () => {
    const result = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    const f = result.findings[0];
    assert.equal(f.severity, 'high');
    assert.equal(f.description, 'The summary omits TODOs in test files.');
    assert.equal(f.recommendation, 'Include test/ directory in the scan.');
    assert.equal(f.file, 'src/index.ts');
    assert.equal(f.line, 42);
  });

  it('second finding has correct severity and null file/line', () => {
    const result = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    const f = result.findings[1];
    assert.equal(f.severity, 'low');
    assert.equal(f.description, 'Line counts are approximate.');
    assert.equal(f.recommendation, 'Use exact line numbers.');
    assert.equal(f.file, null);
    assert.equal(f.line, null);
  });
});

// ==========================================================================
// 2. Whole-response bare JSON parses correctly
// ==========================================================================

describe('bare JSON — parses correctly', () => {
  it('returns the correct verdict from bare JSON', () => {
    const result = parseReviewOutput(BARE_JSON_PASS_WITH_FINDINGS);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('returns exactly two findings from bare JSON', () => {
    const result = parseReviewOutput(BARE_JSON_PASS_WITH_FINDINGS);
    assert.equal(result.findings.length, 2);
  });

  it('bare JSON and fenced JSON produce deeply equal results for the same payload', () => {
    const fromFenced = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    const fromBare = parseReviewOutput(BARE_JSON_PASS_WITH_FINDINGS);
    assert.deepStrictEqual(fromFenced, fromBare);
  });
});

// ==========================================================================
// 3. Markdown/human format parses correctly
// ==========================================================================

describe('markdown/human format — parses correctly', () => {
  it('returns pass_with_findings verdict from markdown format', () => {
    const result = parseReviewOutput(MARKDOWN_PASS_WITH_FINDINGS);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('extracts the HIGH finding from markdown format', () => {
    const result = parseReviewOutput(MARKDOWN_PASS_WITH_FINDINGS);
    const high = result.findings.find((f) => f.severity === 'high');
    assert.ok(high, 'should have a high-severity finding');
    assert.equal(high.description, 'The summary omits TODOs in test files.');
    assert.equal(high.recommendation, 'Include test/ directory in the scan.');
  });

  it('extracts the LOW finding from markdown format', () => {
    const result = parseReviewOutput(MARKDOWN_PASS_WITH_FINDINGS);
    const low = result.findings.find((f) => f.severity === 'low');
    assert.ok(low, 'should have a low-severity finding');
    assert.equal(low.description, 'Line counts are approximate.');
    assert.equal(low.recommendation, 'Use exact line numbers.');
  });

  it('markdown findings have null file and line fields', () => {
    const result = parseReviewOutput(MARKDOWN_PASS_WITH_FINDINGS);
    for (const f of result.findings) {
      assert.equal(f.file, null);
      assert.equal(f.line, null);
    }
  });
});

// ==========================================================================
// 4. Malformed JSON inside a fenced block → fallback single nit finding
// ==========================================================================

describe('fenced block with invalid inner JSON — falls through to fallback', () => {
  it('returns pass_with_findings verdict for malformed fenced JSON', () => {
    const input = '```json\n{ not valid json }\n```';
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('returns exactly one finding for malformed fenced JSON', () => {
    const input = '```json\n{ not valid json }\n```';
    const result = parseReviewOutput(input);
    assert.equal(result.findings.length, 1);
  });

  it('the fallback finding has nit severity for malformed fenced JSON', () => {
    const input = '```json\n{ not valid json }\n```';
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].severity, 'nit');
  });

  it('the fallback finding contains the raw input text as description', () => {
    const input = '```json\n{ not valid json }\n```';
    const result = parseReviewOutput(input);
    assert.ok(
      result.findings[0].description.length > 0,
      'description must not be empty for non-empty input',
    );
  });

  it('the fallback finding has null recommendation, file, and line', () => {
    const input = '```json\n{ not valid json }\n```';
    const result = parseReviewOutput(input);
    const f = result.findings[0];
    assert.equal(f.recommendation, null);
    assert.equal(f.file, null);
    assert.equal(f.line, null);
  });
});

// ==========================================================================
// 5. JSON with unknown severity normalizes to nit
// ==========================================================================

describe('unknown severity in JSON findings — normalizes to nit', () => {
  it('unknown severity "frobnicate" coerces to "nit" and finding is kept', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'frobnicate',
          description: 'Something to report.',
          recommendation: null,
          file: null,
          line: null,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings.length, 1, 'finding must not be discarded');
    assert.equal(result.findings[0].severity, 'nit');
  });

  it('unknown severity "CRITICAL" coerces to "nit" and finding is kept', () => {
    const input = JSON.stringify({
      verdict: 'fail',
      findings: [
        {
          severity: 'CRITICAL',
          description: 'A serious problem.',
          recommendation: 'Fix immediately.',
          file: 'src/main.ts',
          line: 10,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'nit');
    assert.equal(result.findings[0].description, 'A serious problem.');
  });
});

// ==========================================================================
// 6. JSON missing findings array — falls back safely
// ==========================================================================

describe('JSON missing findings array — falls back safely', () => {
  it('returns a result without throwing when findings key is absent', () => {
    const input = JSON.stringify({ verdict: 'pass' });
    let result;
    assert.doesNotThrow(() => {
      result = parseReviewOutput(input);
    });
    assert.ok(result != null, 'result must not be null');
  });

  it('preserves the verdict when findings key is absent', () => {
    // Per A's design: interpretParsedJson defaults rawFindings to [] when
    // findings is absent, so verdict is preserved and findings is [].
    const input = JSON.stringify({ verdict: 'pass' });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass');
  });

  it('returns an empty findings array when findings key is absent', () => {
    const input = JSON.stringify({ verdict: 'pass' });
    const result = parseReviewOutput(input);
    assert.deepStrictEqual(result.findings, []);
  });
});

// ==========================================================================
// 7. JSON verdict: 'pass' with empty findings: [] parses correctly
// ==========================================================================

describe('JSON with verdict pass and empty findings array — parses correctly', () => {
  it('returns pass verdict and empty findings array', () => {
    const input = JSON.stringify({ verdict: 'pass', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass');
    assert.deepStrictEqual(result.findings, []);
  });

  it('does not throw and does not fall back for empty findings with valid verdict', () => {
    const input = JSON.stringify({ verdict: 'pass', findings: [] });
    const result = parseReviewOutput(input);
    // If fallback had triggered, findings would contain one nit entry
    assert.equal(result.findings.length, 0);
  });
});

// ==========================================================================
// 8. Empty string input → fallback with canonical description
// ==========================================================================

describe('empty string input — returns fallback with canonical description', () => {
  it('returns pass_with_findings verdict for empty string', () => {
    const result = parseReviewOutput('');
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('returns exactly one nit finding for empty string', () => {
    const result = parseReviewOutput('');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'nit');
  });

  it('returns the exact canonical description for empty string', () => {
    const result = parseReviewOutput('');
    assert.equal(result.findings[0].description, 'Review output was empty.');
  });
});

// ==========================================================================
// 9. Whitespace-only input → same as empty
// ==========================================================================

describe('whitespace-only input — returns fallback with canonical description', () => {
  it('returns exact description "Review output was empty." for whitespace-only input', () => {
    const result = parseReviewOutput('   \n\t  \n  ');
    assert.equal(result.findings[0].description, 'Review output was empty.');
  });

  it('returns pass_with_findings verdict for whitespace-only input', () => {
    const result = parseReviewOutput('   \n\t  ');
    assert.equal(result.verdict, 'pass_with_findings');
  });
});

// ==========================================================================
// 10. null input → same as empty
// ==========================================================================

describe('null input — returns fallback with canonical description', () => {
  it('returns exact description "Review output was empty." for null input', () => {
    const result = parseReviewOutput(null);
    assert.equal(result.findings[0].description, 'Review output was empty.');
  });

  it('returns pass_with_findings verdict for null input', () => {
    const result = parseReviewOutput(null);
    assert.equal(result.verdict, 'pass_with_findings');
  });
});

// ==========================================================================
// 11. undefined input → same as empty
// ==========================================================================

describe('undefined input — returns fallback with canonical description', () => {
  it('returns exact description "Review output was empty." for undefined input', () => {
    const result = parseReviewOutput(undefined);
    assert.equal(result.findings[0].description, 'Review output was empty.');
  });

  it('returns pass_with_findings verdict for undefined input', () => {
    const result = parseReviewOutput(undefined);
    assert.equal(result.verdict, 'pass_with_findings');
  });
});

// ==========================================================================
// 12. Non-string input (number) — does not throw; returns fallback shape
// ==========================================================================

describe('non-string input (number) — does not throw; returns fallback shape', () => {
  it('does not throw for numeric input', () => {
    assert.doesNotThrow(() => parseReviewOutput(42));
  });

  it('returns pass_with_findings verdict for numeric input', () => {
    const result = parseReviewOutput(42);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('returns exactly one nit finding for numeric input', () => {
    const result = parseReviewOutput(42);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'nit');
  });
});

// ==========================================================================
// 13. Mixed severities — all five preserved correctly
// ==========================================================================

describe('mixed severities in findings array — all five preserved correctly', () => {
  it('blocker, high, medium, low, nit all pass through without coercion', () => {
    const input = JSON.stringify({
      verdict: 'fail',
      findings: [
        {
          severity: 'blocker',
          description: 'Blocker issue.',
          recommendation: null,
          file: null,
          line: null,
        },
        {
          severity: 'high',
          description: 'High issue.',
          recommendation: null,
          file: null,
          line: null,
        },
        {
          severity: 'medium',
          description: 'Medium issue.',
          recommendation: null,
          file: null,
          line: null,
        },
        {
          severity: 'low',
          description: 'Low issue.',
          recommendation: null,
          file: null,
          line: null,
        },
        {
          severity: 'nit',
          description: 'Nit issue.',
          recommendation: null,
          file: null,
          line: null,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings.length, 5);
    const severities = result.findings.map((f) => f.severity);
    assert.deepStrictEqual(severities, ['blocker', 'high', 'medium', 'low', 'nit']);
  });
});

// ==========================================================================
// 14. line as a numeric string — coerced to number
// ==========================================================================

describe('line as numeric string — coerced to number', () => {
  it('"42" as line value is coerced to the number 42', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'low',
          description: 'Some issue.',
          recommendation: null,
          file: 'src/foo.ts',
          line: '42',
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].line, 42);
    assert.equal(typeof result.findings[0].line, 'number');
  });
});

// ==========================================================================
// 15. line: 0 — preserved as 0 (A's design decision)
// ==========================================================================

describe('line value 0 — preserved as 0, not coerced to null', () => {
  it('normalizeLine("0") returns the number 0', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'nit',
          description: 'Issue at line 0.',
          recommendation: null,
          file: 'src/foo.ts',
          line: '0',
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].line, 0, 'zero must be a valid line number, not null');
  });

  it('numeric 0 as line value is preserved as 0', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'nit',
          description: 'Issue at line 0.',
          recommendation: null,
          file: 'src/foo.ts',
          line: 0,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].line, 0);
  });
});

// ==========================================================================
// 16. line as non-numeric string — coerced to null
// ==========================================================================

describe('line as non-numeric string — coerced to null', () => {
  it('"abc" as line value is coerced to null', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'low',
          description: 'Some issue.',
          recommendation: null,
          file: 'src/foo.ts',
          line: 'abc',
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].line, null);
  });
});

// ==========================================================================
// 17. Null recommendation/file/line in source — preserved as null
// ==========================================================================

describe('null recommendation, file, line — preserved as null', () => {
  it('explicit null values for recommendation, file, line are preserved', () => {
    const input = JSON.stringify({
      verdict: 'pass',
      findings: [
        {
          severity: 'nit',
          description: 'Minor issue.',
          recommendation: null,
          file: null,
          line: null,
        },
      ],
    });
    const result = parseReviewOutput(input);
    const f = result.findings[0];
    assert.equal(f.recommendation, null);
    assert.equal(f.file, null);
    assert.equal(f.line, null);
  });
});

// ==========================================================================
// 18. Extra unknown JSON fields per finding — ignored silently
// ==========================================================================

describe('extra unknown fields in finding — ignored silently', () => {
  it('unknown field "foo" does not cause an error and is not in the output', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'low',
          description: 'A finding with extra data.',
          recommendation: 'Fix it.',
          file: null,
          line: null,
          foo: 'bar',
          extraMetadata: { nested: true },
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings.length, 1);
    const f = result.findings[0];
    assert.equal(f.description, 'A finding with extra data.');
    assert.equal('foo' in f, false, 'unknown field "foo" must not appear in the output');
  });
});

// ==========================================================================
// 19. Case-insensitive verdict normalization
// ==========================================================================

describe('verdict normalization — case-insensitive and separator-tolerant', () => {
  it('"PASS WITH FINDINGS" normalizes to "pass_with_findings"', () => {
    const input = JSON.stringify({ verdict: 'PASS WITH FINDINGS', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('"pass-with-findings" normalizes to "pass_with_findings"', () => {
    const input = JSON.stringify({ verdict: 'pass-with-findings', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('"Pass_With_Findings" normalizes to "pass_with_findings"', () => {
    const input = JSON.stringify({ verdict: 'Pass_With_Findings', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
  });

  it('"PASS" normalizes to "pass"', () => {
    const input = JSON.stringify({ verdict: 'PASS', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass');
  });

  it('"FAIL" normalizes to "fail"', () => {
    const input = JSON.stringify({ verdict: 'FAIL', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'fail');
  });

  it('unrecognized verdict string normalizes to "pass_with_findings"', () => {
    const input = JSON.stringify({ verdict: 'unknown_verdict', findings: [] });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
  });
});

// ==========================================================================
// 20. Case-insensitive severity normalization
// ==========================================================================

describe('severity normalization — case-insensitive', () => {
  it('"HIGH" normalizes to "high"', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'HIGH',
          description: 'An issue.',
          recommendation: null,
          file: null,
          line: null,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].severity, 'high');
  });

  it('"High" normalizes to "high"', () => {
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [
        {
          severity: 'High',
          description: 'An issue.',
          recommendation: null,
          file: null,
          line: null,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].severity, 'high');
  });

  it('"BLOCKER" normalizes to "blocker"', () => {
    const input = JSON.stringify({
      verdict: 'fail',
      findings: [
        {
          severity: 'BLOCKER',
          description: 'A blocker.',
          recommendation: null,
          file: null,
          line: null,
        },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(result.findings[0].severity, 'blocker');
  });
});

// ==========================================================================
// 21. Fenced block with valid inner JSON followed by extra text — fenced wins
// ==========================================================================

describe('fenced block followed by extra text — fenced block takes precedence', () => {
  it('parses verdict from fenced block and ignores trailing text', () => {
    const input = `\`\`\`json
{
  "verdict": "pass",
  "findings": []
}
\`\`\`

This trailing paragraph mentions "fail" and other keywords that should be ignored.`;
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass');
    assert.deepStrictEqual(result.findings, []);
  });
});

// ==========================================================================
// 22. Fenced invalid JSON falls through to bare-JSON, then markdown, then fallback
// ==========================================================================

describe('fenced block with invalid JSON falls through the entire parser chain', () => {
  it('falls to markdown when fenced-JSON and bare-JSON both fail but markdown succeeds', () => {
    // This text has an invalid fenced block, is not bare JSON, but has markdown format
    const input = `\`\`\`json
{ not valid json at all
\`\`\`

Review verdict: PASS

  [NIT] Minor style note.
    Recommendation: Use consistent naming.`;
    const result = parseReviewOutput(input);
    // Should parse via markdown (step 3)
    assert.equal(result.verdict, 'pass');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'nit');
    assert.equal(result.findings[0].description, 'Minor style note.');
  });

  it('falls to fallback when fenced-JSON, bare-JSON, and markdown all fail', () => {
    // Invalid fenced block + no markdown verdict line + not bare JSON
    const input = `\`\`\`json
{ invalid }
\`\`\`

This is just a plain prose review with no structured data.`;
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'nit');
  });
});

// ==========================================================================
// 23. All-empty-descriptions JSON — A's design decision
// ==========================================================================

describe('all-empty-descriptions JSON — verdict preserved, findings filtered out', () => {
  it('findings with empty description are dropped; verdict is preserved', () => {
    // A's design: normalizeFinding returns null for empty/missing description.
    // interpretParsedJson filters those out. Verdict is preserved.
    const input = JSON.stringify({
      verdict: 'pass',
      findings: [
        { severity: 'high', description: '', recommendation: null, file: null, line: null },
        { severity: 'medium', description: '   ', recommendation: null, file: null, line: null },
      ],
    });
    const result = parseReviewOutput(input);
    assert.equal(
      result.verdict,
      'pass',
      'verdict must be preserved even when all descriptions are empty',
    );
    assert.deepStrictEqual(
      result.findings,
      [],
      'findings array must be empty after filtering empty descriptions',
    );
  });

  it('does NOT fall back to fallback when JSON is valid but all findings have empty descriptions', () => {
    // This is the critical behavior lock: a valid JSON with verdict field does
    // not trigger the fallback path even if all findings are filtered out.
    const input = JSON.stringify({
      verdict: 'pass_with_findings',
      findings: [{ severity: 'high', description: '' }],
    });
    const result = parseReviewOutput(input);
    // Fallback would produce a single nit finding; the correct behavior is an
    // empty findings array with the verdict preserved.
    assert.equal(result.findings.length, 0, 'must not produce a fallback nit finding');
    assert.equal(result.verdict, 'pass_with_findings');
  });
});

// ==========================================================================
// 24. Verdict normalization without findings — non-recognized verdicts coerce
// ==========================================================================

describe('verdict normalization without findings key', () => {
  it('recognized verdict "pass" without findings key is preserved', () => {
    const input = JSON.stringify({ verdict: 'pass' });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass');
  });

  it('non-recognized verdict without findings key coerces to pass_with_findings', () => {
    const input = JSON.stringify({ verdict: 'inconclusive' });
    const result = parseReviewOutput(input);
    assert.equal(result.verdict, 'pass_with_findings');
  });
});

// ==========================================================================
// Cross-cutting: deterministic output
// ==========================================================================

describe('parseReviewOutput is deterministic', () => {
  it('parsing identical fenced-block input twice returns deeply equal output', () => {
    const first = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    const second = parseReviewOutput(FENCED_PASS_WITH_FINDINGS);
    assert.deepStrictEqual(first, second);
  });

  it('parsing identical bare-JSON input twice returns deeply equal output', () => {
    const first = parseReviewOutput(BARE_JSON_PASS_WITH_FINDINGS);
    const second = parseReviewOutput(BARE_JSON_PASS_WITH_FINDINGS);
    assert.deepStrictEqual(first, second);
  });

  it('parsing identical markdown input twice returns deeply equal output', () => {
    const first = parseReviewOutput(MARKDOWN_PASS_WITH_FINDINGS);
    const second = parseReviewOutput(MARKDOWN_PASS_WITH_FINDINGS);
    assert.deepStrictEqual(first, second);
  });
});

// ==========================================================================
// Cross-cutting: pure function — no filesystem/network side effects
// ==========================================================================

describe('parseReviewOutput is a pure function with no side effects', () => {
  it('calling parseReviewOutput does not throw for any of the canonical inputs', () => {
    const inputs = [
      FENCED_PASS_WITH_FINDINGS,
      BARE_JSON_PASS_WITH_FINDINGS,
      MARKDOWN_PASS_WITH_FINDINGS,
      '',
      null,
      undefined,
      42,
    ];
    for (const input of inputs) {
      assert.doesNotThrow(
        () => parseReviewOutput(input),
        `parseReviewOutput must not throw for input: ${JSON.stringify(input)}`,
      );
    }
  });
});

// ---------- formatReviewHuman empty-findings labeling (v0.3.0 audit fix) ----------

describe('formatReviewHuman renders clean output for empty findings regardless of verdict', () => {
  const job = { jobId: 'job_fmt01aa_aaaaaaaa' };
  const turn = { index: 0, status: 'running' };

  it('pass_with_findings + [] renders "PASS" / "No findings." (never "0 findings: ")', () => {
    const out = formatReviewHuman({
      review: { verdict: 'pass_with_findings', findings: [] },
      job,
      turn,
    });
    assert.ok(out.includes('Review verdict: PASS'), `expected clean PASS; got:\n${out}`);
    assert.ok(out.includes('No findings.'), `expected "No findings."; got:\n${out}`);
    assert.ok(
      !out.includes('WITH FINDINGS'),
      `must not print "WITH FINDINGS" for an empty list; got:\n${out}`,
    );
    assert.ok(!out.includes('0 findings'), `must not print "0 findings"; got:\n${out}`);
  });

  it('plain pass + [] still renders clean PASS', () => {
    const out = formatReviewHuman({
      review: { verdict: 'pass', findings: [] },
      job,
      turn,
    });
    assert.ok(out.includes('Review verdict: PASS'));
    assert.ok(out.includes('No findings.'));
  });

  it('fail + [] renders FAIL with no findings block', () => {
    const out = formatReviewHuman({
      review: { verdict: 'fail', findings: [] },
      job,
      turn,
    });
    assert.ok(out.includes('Review verdict: FAIL'), `expected FAIL; got:\n${out}`);
    assert.ok(out.includes('No findings.'));
  });

  it('pass_with_findings + 1 finding still shows the count summary', () => {
    const out = formatReviewHuman({
      review: {
        verdict: 'pass_with_findings',
        findings: [{ severity: 'low', description: 'something minor' }],
      },
      job,
      turn,
    });
    assert.ok(out.includes('1 finding'), `expected the count summary; got:\n${out}`);
    assert.ok(out.includes('something minor'));
  });
});
