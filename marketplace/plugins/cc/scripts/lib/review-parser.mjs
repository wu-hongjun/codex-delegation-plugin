// review-parser.mjs — parse structured review output from Claude into a
// normalised { verdict, findings[] } shape, with graceful fallback on any
// parse failure (including empty, undefined, or garbage input).
//
// Parser priority:
//   1. First fenced ```json block in the response.
//   2. Whole response as bare JSON.
//   3. Markdown/human-format scan (regex pattern matching, conservative).
//   4. Fallback: single nit-severity finding wrapping the raw text.
//
// Markdown/human-format patterns handled by step 3:
//   Verdict line:  /^review verdict:\s*(.+)/i
//   Finding line:  /^\s*\[(BLOCKER|HIGH|MEDIUM|LOW|NIT)\]\s*(.+)/i
//   Rec line:      /^\s*Recommendation:\s*(.+)/i

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {ReadonlySet<string>} */
const VALID_VERDICTS = new Set(['pass', 'fail', 'pass_with_findings']);

/** @type {ReadonlySet<string>} */
const VALID_SEVERITIES = new Set(['blocker', 'high', 'medium', 'low', 'nit']);

/**
 * Maximum raw-text length (characters) stored in the fallback finding
 * description. Inputs beyond this are truncated to keep the finding readable.
 */
const MAX_RAW_TEXT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Types (JSDoc only; no runtime cost)
// ---------------------------------------------------------------------------

/**
 * @typedef {{ severity: 'blocker'|'high'|'medium'|'low'|'nit'; description: string; recommendation: string|null; file: string|null; line: number|null }} ReviewFinding
 * @typedef {{ verdict: 'pass'|'fail'|'pass_with_findings'; findings: ReviewFinding[] }} ReviewOutput
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Produce the fallback result.  When `rawText` is empty/whitespace/nullish the
 * description is the canonical placeholder; otherwise it is the (possibly
 * truncated) raw text.
 *
 * @param {string|null|undefined} rawText
 * @returns {ReviewOutput}
 */
function makeFallback(rawText) {
  const isEmpty = rawText == null || (typeof rawText === 'string' && rawText.trim() === '');
  let description;
  if (isEmpty) {
    description = 'Review output was empty.';
  } else {
    const s = String(rawText);
    description = s.length > MAX_RAW_TEXT_LENGTH ? s.slice(0, MAX_RAW_TEXT_LENGTH) + '…' : s;
  }
  return {
    verdict: 'pass_with_findings',
    findings: [
      {
        severity: 'nit',
        description,
        recommendation: null,
        file: null,
        line: null,
      },
    ],
  };
}

/**
 * Normalise a raw verdict string to one of the three accepted values.
 * Unknown/missing verdict with any findings → 'pass_with_findings'.
 * Unknown/missing verdict with no findings  → 'pass_with_findings'.
 *
 * @param {unknown} raw
 * @returns {'pass'|'fail'|'pass_with_findings'}
 */
function normalizeVerdict(raw) {
  if (typeof raw !== 'string') return 'pass_with_findings';
  const lower = raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  if (VALID_VERDICTS.has(lower)) return /** @type {any} */ (lower);
  // Canonical alias: "pass with findings" (spaces or hyphens → underscores, handled above)
  return 'pass_with_findings';
}

/**
 * Normalise a raw severity string.  Unknown severity → 'nit' (finding is
 * kept; severity is coerced).
 *
 * @param {unknown} raw
 * @returns {'blocker'|'high'|'medium'|'low'|'nit'}
 */
function normalizeSeverity(raw) {
  if (typeof raw !== 'string') return 'nit';
  const lower = raw.toLowerCase().trim();
  if (VALID_SEVERITIES.has(lower)) return /** @type {any} */ (lower);
  return 'nit';
}

/**
 * Normalise a `line` field value.  Numbers pass through; numeric strings are
 * coerced; anything else (including null, undefined, non-numeric strings)
 * becomes null.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
function normalizeLine(raw) {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/**
 * Normalise a single raw finding object into a `ReviewFinding`.
 * Returns `null` if `description` is missing or empty (finding should be
 * skipped by the caller).
 *
 * @param {unknown} raw
 * @returns {ReviewFinding|null}
 */
function normalizeFinding(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = /** @type {Record<string, unknown>} */ (raw);

  const description = typeof r['description'] === 'string' ? r['description'].trim() : '';
  if (description === '') return null;

  return {
    severity: normalizeSeverity(r['severity']),
    description,
    recommendation: typeof r['recommendation'] === 'string' ? r['recommendation'] : null,
    file: typeof r['file'] === 'string' ? r['file'] : null,
    line: normalizeLine(r['line']),
  };
}

/**
 * Extract the content of the first fenced ```json block from `text`.
 * Returns the raw inner string (not yet parsed), or `null` if none found.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractFencedJsonBlock(text) {
  // Match ```json ... ``` — non-greedy, handles multi-line blocks.
  const match = text.match(/```json\s*\n([\s\S]*?)```/i);
  return match ? match[1] : null;
}

/**
 * Attempt to `JSON.parse` a string, returning the parsed value or `null` on
 * any error.  Explicitly never throws.
 *
 * @param {string} text
 * @returns {unknown}
 */
function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Attempt to validate and normalise a parsed JSON value into a `ReviewOutput`.
 * Returns `null` if the value is not a plain object (i.e. the JSON was valid
 * but not the expected shape — fall through to the next parser step).
 *
 * @param {unknown} parsed
 * @returns {ReviewOutput|null}
 */
function interpretParsedJson(parsed) {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = /** @type {Record<string, unknown>} */ (parsed);

  const rawFindings = Array.isArray(obj['findings']) ? obj['findings'] : [];
  const findings = /** @type {ReviewFinding[]} */ (
    rawFindings.map(normalizeFinding).filter(Boolean)
  );

  const verdict = normalizeVerdict(obj['verdict']);

  return { verdict, findings };
}

/**
 * Attempt to parse Claude's markdown/human-readable review format.
 *
 * Handled lines (all comparisons case-insensitive):
 *   "Review verdict: PASS WITH FINDINGS"  →  verdict
 *   "  [HIGH] Description..."             →  new finding
 *   "    Recommendation: ..."             →  recommendation for the last finding
 *
 * This parser is deliberately conservative: if no verdict line is found, the
 * entire attempt returns `null` (fall through to fallback).
 *
 * @param {string} text
 * @returns {ReviewOutput|null}
 */
function tryParseMarkdown(text) {
  const lines = text.split('\n');

  let verdictRaw = null;
  const rawFindings =
    /** @type {Array<{ severity: string; description: string; recommendation: string|null }>} */ ([]);

  for (const line of lines) {
    // Verdict line: "Review verdict: PASS WITH FINDINGS"
    const verdictMatch = line.match(/^review verdict:\s*(.+)/i);
    if (verdictMatch) {
      verdictRaw = verdictMatch[1].trim();
      continue;
    }

    // Finding line: "  [HIGH] Description..."
    const findingMatch = line.match(/^\s*\[(BLOCKER|HIGH|MEDIUM|LOW|NIT)\]\s*(.+)/i);
    if (findingMatch) {
      rawFindings.push({
        severity: findingMatch[1],
        description: findingMatch[2].trim(),
        recommendation: null,
      });
      continue;
    }

    // Recommendation line: "    Recommendation: ..."
    const recMatch = line.match(/^\s*Recommendation:\s*(.+)/i);
    if (recMatch && rawFindings.length > 0) {
      rawFindings[rawFindings.length - 1].recommendation = recMatch[1].trim();
    }
  }

  // Conservative: require at least a verdict line.
  if (verdictRaw === null) return null;

  const findings = rawFindings
    .map((f) =>
      normalizeFinding({
        severity: f.severity,
        description: f.description,
        recommendation: f.recommendation,
        file: null,
        line: null,
      }),
    )
    .filter(/** @type {(f: ReviewFinding|null) => f is ReviewFinding} */ Boolean);

  return { verdict: normalizeVerdict(verdictRaw), findings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse Claude's review output into a normalised `{ verdict, findings[] }`
 * shape.  Never throws — any parse failure (including empty, null, undefined,
 * or non-string input) returns the fallback single-nit-finding result.
 *
 * Parser priority:
 *   1. First fenced ```json block → JSON.parse → validate/normalise.
 *   2. Whole response as bare JSON → JSON.parse → validate/normalise.
 *   3. Markdown/human-format scan (conservative regex line-scan).
 *   4. Fallback: single nit finding with raw text (or placeholder for empty).
 *
 * @param {string|null|undefined} text  Raw text output from Claude.
 * @returns {ReviewOutput}
 */
export function parseReviewOutput(text) {
  // Guard: non-string or empty input → immediate fallback.
  if (text == null || typeof text !== 'string' || text.trim() === '') {
    return makeFallback(text);
  }

  // Step 1: fenced ```json block.
  const fencedContent = extractFencedJsonBlock(text);
  if (fencedContent !== null) {
    const parsed = tryParseJson(fencedContent);
    if (parsed !== null) {
      const result = interpretParsedJson(parsed);
      if (result !== null) {
        // If all findings had empty descriptions, check whether we should fall
        // back.  If the JSON was otherwise valid (object with a verdict field),
        // we return the (possibly empty) findings — verdict is preserved.
        // An empty findings array with a valid verdict is a legitimate 'pass'.
        return result;
      }
    }
    // JSON inside the fence was invalid or non-object — fall through to step 2.
  }

  // Step 2: whole response as bare JSON.
  const bareParsed = tryParseJson(text);
  if (bareParsed !== null) {
    const result = interpretParsedJson(bareParsed);
    if (result !== null) {
      return result;
    }
  }

  // Step 3: markdown/human-format.
  const mdResult = tryParseMarkdown(text);
  if (mdResult !== null) {
    return mdResult;
  }

  // Step 4: fallback.
  return makeFallback(text);
}
