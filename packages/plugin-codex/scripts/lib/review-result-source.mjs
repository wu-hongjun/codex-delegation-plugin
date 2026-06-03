// review-result-source.mjs — resolves the text to feed to parseReviewOutput.
//
// Plan 0003 T12b: same-session $claude-review used to parse `sendResult.finalMessage`
// directly, but on real Claude Code 2.1.150 that value is sourced from the
// per-job sidecar's `output.result` field, which is a SHORT SUMMARY string
// (e.g. "review verdict: pass — all TODOs found"), NOT the full assistant
// message containing the fenced ```json block the parser needs. The reconciler
// (transcript / sidecar / logs path) writes the FULL text to
// `<jobId>.result.md`, surfaced as `turn.result.finalMessagePath`. Reading
// that file gives us the structured JSON parseReviewOutput needs.
//
// Priority:
//   1. turn.result.finalMessagePath file content (full text — preferred)
//   2. fallback string (typically sendResult.finalMessage — sidecar summary)
//   3. '' (empty string when neither source is available)
//
// Note: turn.result.finalMessagePreview is intentionally NOT consulted here.
// The preview is truncated to 160 chars at write-time and is unsuitable as a
// parser source — it can cut off mid-JSON. Callers must rely on the file
// content or the fallback.

import { readFile } from 'node:fs/promises';

/**
 * @param {{ result?: { finalMessagePath?: string } } | null | undefined} turn
 * @param {string | null | undefined} fallback
 * @returns {Promise<string>}
 */
export async function readTurnFinalMessageOrFallback(turn, fallback) {
  const path = turn?.result?.finalMessagePath;
  if (path) {
    try {
      const text = await readFile(path, 'utf8');
      if (typeof text === 'string' && text.trim().length > 0) {
        return text;
      }
      // empty or whitespace-only → fall through to fallback
    } catch {
      // missing / unreadable / parent-not-dir → fall through to fallback
    }
  }
  return fallback ?? '';
}
