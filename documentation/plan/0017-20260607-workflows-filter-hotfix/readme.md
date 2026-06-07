# Plan 0017 — `$claude-workflows` filter hotfix (release blocker before v0.3.0)

**Status**: `complete`
**Started**: 2026-06-07
**Completed**: 2026-06-07
**Severity**: BLOCKER (v0.3.0 release would have shipped the bug)
**Drafted from**: real-Codex smoke test (`documentation/testing/findings-20260607.md`) — `$claude-workflows` didn't see `$claude-workflow`-created jobs.

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-07** — single-file source fix + test rewrite |
| 2 — Implement | `2-implement.md` | **complete 2026-06-07** — inspector switched from `claude agents --json` to local job store; filter uses `prompt.summary.startsWith('ultracode: ')`; tests rewritten with job-store fixtures; +1 net test (1819 → 1820 combined) |
| 3 — Audit | `3-audit.md` | **SKIPPED** — real-Codex smoke test (`findings-20260607.md`) WAS the audit that caught the bug. Live verification post-fix confirmed 6 workflows visible. |
| 4 — Polish | `4-polish.md` | **SKIPPED** — single iteration |
| 5 — Report | `5-report.md` | **complete 2026-06-07** — final report; v0.3.0 unblocked |

## Summary

**Bug**: Plan 0016's `_isWorkflowSession` predicate in `workflows-inspector.mjs` checks `agents.name.startsWith('ultracode:')`. But Codex's background driver sets the session NAME to `codex:<workspace>:<id>`; the `ultracode:` prefix lives in the PROMPT (which is stored in `prompt.summary` of our own job record), not the session name.

Result: every `cc workflow`-created job is invisible to `cc workflows`.

**Fix**: change `_isWorkflowSession` to read from the job store (`~/.codex/cc-plugin-codex/jobs/*.json`) instead of `claude agents --json`. Use `prompt.summary.startsWith('ultracode: ')` as the discriminator. Keep `claude agents --json` only for live status enrichment if needed.

**Scope**: 1 source file rewrite (`workflows-inspector.mjs`) + test rewrite (existing tests stubbed agents JSON; need to stub job-store records instead).

**Test target**: ~+0 net (rewrite existing tests; same coverage, different data source).
