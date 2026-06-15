# Plan 0023 - v0.3.4 friction polish

**Status**: complete
**Started**: 2026-06-15
**Completed**: 2026-06-15
**Owner**: Codex

## Summary

Polish the highest-signal frictions found by a supplemental multi-subagent test
round against the installed v0.3.4 plugin.

## Context

- Source evidence: `documentation/testing/tickets/TICKET-cc-depth-test.md`
  follow-up entry from 2026-06-15.
- Raw notes: `documentation/testing/artifacts/v034-friction-20260615/friction-summary.md`.
- The installed plugin under test was `cc@cc-plugin-codex-local` v0.3.4 with
  Claude Code 2.1.177 and Codex CLI 0.139.0.

## Scope

In:

- Document the v0.3.4 subagent friction round and update the recurring ticket's
  current target.
- Make `cc result` able to read an immutable latest-turn result when the latest
  turn is already completed but the job-level status is briefly still `running`.
- Add `cc status --limit <n>` / `--stored-status <state>` so broad status sweeps can be
  bounded without pruning job history.
- Add operator guidance for unattended local QA lanes that intentionally opt into
  `--permission-mode bypassPermissions`.

Out:

- Any change to Claude Code's default permission model.
- Any default use of `--permission-mode bypassPermissions`.
- Any job-prune/delete subcommand or automatic historical job cleanup.
- Any further F2b naming/timing changes.

## Acceptance Criteria

- `cc result <jobId>` still rejects genuinely running jobs with no completed
  latest-turn result artifact.
- `cc result <jobId>` succeeds when the latest turn is `completed` and has an
  immutable result artifact, even if the job row still says `running`.
- `cc status --limit <n>` sorts newest first and reconciles only the displayed
  bounded set; invalid `--limit` / `--stored-status` values fail with usage errors.
- The living depth-test ticket records the v0.3.4 friction round and explains
  the explicit permission-mode choice for unattended QA.
- Marketplace packaging check passes after regenerating derived files.

## Result

- The v0.3.4 supplemental multi-subagent friction round is recorded in the
  living depth-test ticket and artifact bundle.
- `cc result` now accepts a latest turn that is already `completed` and has an
  immutable result artifact, even if the job-level status is briefly still
  `running`.
- `cc status` gained opt-in `--limit <n>` and `--stored-status <state>` controls for
  large historical job stores.
- Skill/help/README docs now distinguish clean `$claude-result` output from raw
  `claude logs`, and explain explicit unattended
  `--permission-mode bypassPermissions` usage.
