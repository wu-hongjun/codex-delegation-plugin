# Plan 0008 — `$claude-workflow` skill (cc-plugin-codex)

**Status**: `reporting`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-05
**Stage 2 complete**: 2026-06-05 (CI run `27027782640` success)
**Stage 3 complete**: 2026-06-05
**Stage 4 complete**: 2026-06-05
**Last updated**: 2026-06-05

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-05** — drafted from Plan 0007 follow-up empirical evidence; OQ-A and OQ-B resolved inline; OQ-C deferred to T1 in-stage probe; 8 T-tasks; +10-15 test target |
| 2 — Implement | `2-implement.md` | **complete pending CI 2026-06-05** — T1-T8 done; 1572 tests pass (mock 68 + runtime 172 + driver 187 + plugin 859 + attach 28 + bench 258); marketplace allowlist 19→20 (new `skills/claude-workflow/SKILL.md`); new `$claude-workflow` skill + dispatcher subcommand (Approach A shared helper); workflows-supported probe floor lowered 2.1.154→2.1.153; cost paragraph + plan-0004-pre-cutover + Plan 0005 deferred all preserved |
| 3 — Audit | `3-audit.md` | **complete 2026-06-05** — verdict `ready-for-polish`; 5 findings (F-1 medium RELEASING.md "eight-skill"→"nine-skill"; F-2 medium marketplace-releasing.test.mjs SKILL_NAMES missing claude-workflow; F-3 medium --help flag descriptions omit workflow; F-4 nit docs-split.test.mjs comments; F-5 nit accept-as-is); 0 critical/high; auditor `oh-my-claudecode:critic` (Opus, fresh-context) |
| 4 — Polish | `4-polish.md` | **complete 2026-06-05** — F-1 / F-2 / F-3 / F-4 fixed; F-5 accept-as-is; 2 stale Plan 0003 tests (N2-1c/N2-1f) relaxed to match F-3 wording; bundled in commit `244d3bb` with Stage 3 |
| 5 — Report | `5-report.md` | **in progress 2026-06-05** — final report written; awaiting Stage 5 CI verification |

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
