# Plan 0008 — `$claude-workflow` skill (cc-plugin-codex)

**Status**: `auditing`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-05
**Stage 2 complete (pending CI)**: 2026-06-05
**Last updated**: 2026-06-05

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-05** — drafted from Plan 0007 follow-up empirical evidence; OQ-A and OQ-B resolved inline; OQ-C deferred to T1 in-stage probe; 8 T-tasks; +10-15 test target |
| 2 — Implement | `2-implement.md` | **complete pending CI 2026-06-05** — T1-T8 done; 1572 tests pass (mock 68 + runtime 172 + driver 187 + plugin 859 + attach 28 + bench 258); marketplace allowlist 19→20 (new `skills/claude-workflow/SKILL.md`); new `$claude-workflow` skill + dispatcher subcommand (Approach A shared helper); workflows-supported probe floor lowered 2.1.154→2.1.153; cost paragraph + plan-0004-pre-cutover + Plan 0005 deferred all preserved |
| 3 — Audit | `3-audit.md` | not started — requires independent context (will be spawned after Stage 2 CI verification) |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Plan 0008 ships `$claude-workflow <prompt>` — a Codex skill that wraps Claude Code's "dynamic workflows" feature (research preview, available on Claude Code v2.1.153+ per 2026-06-05 TUI smoke). The skill is a pure prompt-prefix wrap of `$claude-delegate`: it prepends the `ultracode:` keyword and delegates to the same machinery that powers Plan 0001's delegate flow. No new sidecar; no new runtime; full reuse of `$claude-status`, `$claude-result`, `$claude-stop`, `$claude-followup`. Plus a hotfix to Plan 0007's `workflows-supported` doctor probe (floor was set to v2.1.154 based on changelog; empirically works on v2.1.153 — see `documentation/research/20260604-claude-code-w22-audit/artifacts/workflow-tui-smoke-2-1-153-20260605.txt`).

## Parallel with Plan 0004 / Plan 0005

Plan 0004 is frozen at tag `plan-0004-pre-cutover` (`7d9b5f1`). Plan 0008 must NOT touch:

- `tools/bench/**`
- `documentation/plan/0004-*/artifacts/**`
- `packages/plugin-codex/README.md` `## Cost and prompt-cache wording` paragraph (Plan 0004 T12 owns this)
- Plan 0004 measurement comparability between pre- and post-cutover

Plan 0005 (stop-time review gate) is `deferred` pending Plan 0004 T11/T12 data. Plan 0008 does NOT subsume Plan 0005.

## Plugin version

Plan 0008 implementation does NOT bump the plugin version. Tagging `v0.3.0` (or whatever the next semver is) is a separate maintainer-driven step that follows `documentation/RELEASING.md` whenever the maintainer decides to ship the next release.
