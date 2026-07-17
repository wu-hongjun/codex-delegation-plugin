// Tests for Plan 0003 T12b: readTurnFinalMessageOrFallback resolver.
//
// Locks in the parse-source priority for $claude-review:
//   1. turn.result.finalMessagePath file content (full text — preferred)
//   2. fallback (typically sendResult.finalMessage — sidecar summary)
//   3. '' when neither source is available
//
// This is the unit-test surface for the bug T12 exposed: Claude Code 2.1.150
// puts a short SUMMARY in sidecar.output.result while writing the FULL text
// (containing the fenced ```json block parseReviewOutput needs) to the
// reconciled result file. Reading the file must take precedence over the
// sidecar-derived summary.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readTurnFinalMessageOrFallback } from '../scripts/lib/review-result-source.mjs';

let WORK_DIR;
beforeEach(() => {
  WORK_DIR = mkdtempSync(join(tmpdir(), 't12b-source-'));
});
afterEach(() => {
  rmSync(WORK_DIR, { recursive: true, force: true });
});

// =============================================================================
// T12b-S1: result file present with fenced JSON → returns file content
// (the bug scenario — driver returns summary, file has full JSON)
// =============================================================================

describe('readTurnFinalMessageOrFallback — T12b', () => {
  it('T12b-S1: file contains fenced JSON, fallback is sidecar summary → returns file content', async () => {
    const filePath = join(WORK_DIR, 'job_abc.result.md');
    const fullText =
      '```json\n{\n  "verdict": "pass_with_findings",\n  "findings": [\n    { "severity": "high", "description": "real finding" }\n  ]\n}\n```\n\nNarrative below…';
    writeFileSync(filePath, fullText, 'utf8');

    const turn = { result: { finalMessagePath: filePath } };
    const fallback = 'review verdict: pass — all TODOs found, no omissions';

    const result = await readTurnFinalMessageOrFallback(turn, fallback);

    assert.equal(
      result,
      fullText,
      'must return file content (full text), not the sidecar-summary fallback',
    );
    assert.ok(
      result.includes('"verdict": "pass_with_findings"'),
      'returned text must contain the structured JSON parseReviewOutput needs',
    );
    assert.ok(
      !result.includes('review verdict: pass — all TODOs found'),
      'must not be the summary',
    );
  });

  // ===========================================================================
  // T12b-S2: file missing on disk → falls back to summary text
  // ===========================================================================

  it('T12b-S2: file path set but missing on disk → returns fallback', async () => {
    const turn = { result: { finalMessagePath: join(WORK_DIR, 'does-not-exist.md') } };
    const fallback = 'sidecar summary fallback';

    const result = await readTurnFinalMessageOrFallback(turn, fallback);

    assert.equal(result, fallback, 'missing file must fall through to fallback');
  });

  // ===========================================================================
  // T12b-S3: file exists but whitespace-only → falls back
  // ===========================================================================

  it('T12b-S3: file exists but is whitespace-only → returns fallback', async () => {
    const filePath = join(WORK_DIR, 'job_whitespace.result.md');
    writeFileSync(filePath, '   \n\n\t  \n', 'utf8');

    const turn = { result: { finalMessagePath: filePath } };
    const fallback = '{"verdict":"pass","findings":[]}';

    const result = await readTurnFinalMessageOrFallback(turn, fallback);

    assert.equal(result, fallback, 'whitespace-only file must fall through to fallback');
  });

  // ===========================================================================
  // T12b-S4: turn has no result block → falls back
  // ===========================================================================

  it('T12b-S4: turn without a result block → returns fallback', async () => {
    const turn = {
      /* no result */
    };
    const fallback = 'sendResult fallback';

    const result = await readTurnFinalMessageOrFallback(turn, fallback);

    assert.equal(result, fallback);
  });

  // ===========================================================================
  // T12b-S5: turn undefined, fallback undefined → returns empty string
  // ===========================================================================

  it('T12b-S5: turn undefined and fallback undefined → returns empty string', async () => {
    const result = await readTurnFinalMessageOrFallback(undefined, undefined);
    assert.equal(result, '');
  });

  // ===========================================================================
  // T12b-S6: turn.result.finalMessagePath is empty string → falls back
  // (covers the empty-sentinel that sendFollowupTurn writes when only
  //  finalMessage is available; T8 cmdFollowup uses '' as a marker.)
  // ===========================================================================

  it('T12b-S6: turn.result.finalMessagePath is empty string → returns fallback', async () => {
    const turn = { result: { finalMessagePath: '' } };
    const fallback = 'fallback text';

    const result = await readTurnFinalMessageOrFallback(turn, fallback);

    assert.equal(result, fallback, 'empty-string path is a marker, not a real path');
  });
});
