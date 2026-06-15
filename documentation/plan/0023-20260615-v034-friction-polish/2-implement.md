# Plan 0023 Stage 2 - Implement

**Status**: complete
**Date**: 2026-06-15
**Commit basis**: main at v0.3.4.

## Work Log

- Recorded the supplemental v0.3.4 multi-subagent test round in the living
  depth-test ticket.
- Spawned three read-only Claude Code subagents through the installed v0.3.4
  dispatcher to inspect:
  - the completed-turn/result-vs-running-status friction,
  - documentation for permission/status/logs friction,
  - status/history scaling options.
- Updated `cmdResult` so it can read the latest turn's immutable result artifact
  when that turn is already `completed`, even if the job-level status has not
  yet reconciled from `running` to `awaiting_followup`.
  - Rejected the subagent-suggested fallback to a 160-character preview when
    `finalMessagePath` is empty; `$claude-result` should return durable result
    artifacts, not truncated immediate previews.
- Added opt-in `status --limit <n>` and `--stored-status <state>` controls. The list is
  sorted newest-first and limited before reconciliation, which bounds broad
  status latency/output without deleting historical job records.
- Updated skill/help text to steer clean output through `$claude-result`, mark
  raw Claude logs as raw logs, and explain explicit unattended
  `--permission-mode bypassPermissions` usage.

## Verification

- `node --test --test-name-pattern "status --job and --compact ergonomics|result for a running job|result for a running job with a completed latest-turn artifact" packages/plugin-codex/test/dispatcher.test.mjs` - pass.
- `node --test packages/plugin-codex/test/skills-manifest.test.mjs packages/plugin-codex/test/readme.test.mjs packages/plugin-codex/test/marketplace-readme.test.mjs` - pass.
- `npm run lint` - pass.
- `npm run typecheck` - pass.
- `npm test` - pass.
- `npm exec -- prettier --check` on touched source/docs files - pass.
- `node tools/package-marketplace.mjs --check` - pass.
- `git diff --check` - pass.
