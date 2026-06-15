# T3 - Review evidence and gates

## Goal

Make Claude review output useful as an automation gate for Codex, not just a
human-readable advisory.

## Problem

Adversarial review mainly receives the final assistant message and touched-file
list. The touched-file list is likely empty for real Claude Code edit tools, and
review verdicts do not provide a machine-readable blocking decision for Codex.

## Implementation Notes

- Derive touched files from successful `Edit`, `Write`, `MultiEdit`, and
  `NotebookEdit` tool events in addition to legacy `file_change` records.
- Add realistic transcript-style coverage with successful and failed edit/write
  events.
- Add opt-in `--fail-on <severity>` for review/adversarial-review commands.
- Include `blocking: boolean` in review JSON output.

## Acceptance

- Review JSON can be used directly by Codex to decide whether to proceed.
- `--fail-on high` exits non-zero for a high/blocker finding and zero for lower
  severities.
- Touched files are extracted from captured-realistic tool transcripts and
  exclude failed edits.

## Deferred

- Bounded diff-context injection for adversarial review.
- Persisting a review summary on the target job beyond the existing review job
  record and JSON output.
