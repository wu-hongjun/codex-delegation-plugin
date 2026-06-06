# Plan 0012 — Post real-Codex-testing fixes

**Status**: `auditing`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-06 (maintainer authorized full cycle)
**Stage 2 complete (pending CI)**: 2026-06-06
**Drafted from**: real-Codex smoke-test findings at `documentation/testing/findings-20260605.md` (Codex executed all 12 skills via the dispatcher; surfaced 4 real plugin issues + LOW error-message gaps)
**Last updated**: 2026-06-06

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-06** — Adaptive scope: T1-T3 probe each HIGH/MEDIUM issue; T4-T6 implementation conditioned on verdicts |
| 2 — Implement | `2-implement.md` | **complete 2026-06-06** — T1-T3 returned C/B/C; T5 shipped real probe rewrite; T4/T6 docs-only; T7/T8 isolated fixes; 1443 → 1447 npm test (+4); CI run pending |
| 3 — Audit | `3-audit.md` | not started — requires independent context |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Real-Codex testing on `87e89a4` (Plan 0011 close) exposed 4 actionable plugin issues that were NOT visible in the test suite:

1. **HIGH-1** — `$claude-delegate` followup result regression: after a followup turn completes, `$claude-result` returns the original turn's content instead of the followup's response. Basic delegate→followup→result chain is corrupted.
2. **HIGH-2** — `$claude-setup` aggregate FAIL under Codex sandbox: `claude-bg-no-prompt` probe times out under Codex's no-TTY execution context (works fine in direct shell). First-impression UX failure for every new user.
3. **MEDIUM-1** — `$claude-goal` directive non-resolution: simple "read file, count sections, stop" goal stayed `needs_input` indefinitely. Model wasn't emitting the goal_met sentinel.
4. **MEDIUM-2** — Plugin version reporting inconsistency: `codex plugin list` shows `0.2.0` (correct); dispatcher metadata reports `0.0.0` (workspace package.json, intentionally `0.0.0` per RELEASING.md). User-visible confusion.

Plus LOW-priority error-message improvements (review/adversarial-review unhelpful "No job found" when given a prompt; bare `stop --all` doesn't hint at `--all-awaiting-followup`).

Pattern: probe-then-implement per issue, mirroring Plan 0008 / 0010 / 0011 discipline. Each HIGH/MEDIUM issue gets a T1 investigation artifact before any fix is implemented.

Plugin version unchanged at `0.2.0`. No release tag this plan. v0.3.0 candidate AFTER Plan 0012 closes if all fixes ship cleanly.

## Parallel with Prior plans

Plan 0012 must NOT touch:
- `tools/bench/**`, `documentation/plan/0004-*/artifacts/**` (Plan 0004 frozen at `7d9b5f1`)
- `documentation/plan/0005-*` (Plan 0005 deferred)
- `documentation/plan/0006-*` through `0011-*` (all complete; frozen)
- `packages/plugin-codex/README.md` cost paragraph (around L636)
- `.github/workflows/ci.yml`
- `packages/runtime/**` (no runtime changes expected; T1-T4 verdicts may reveal exceptions)

Plan 0012 DOES touch:
- `packages/plugin-codex/scripts/claude-companion.mjs` — cmdResult turn-selection (HIGH-1), version reporting (MEDIUM-2), error message hints (LOW)
- `packages/plugin-codex/scripts/lib/` — setup probe (HIGH-2)
- `packages/plugin-codex/scripts/lib/goal-status.mjs` or equivalent — goal sentinel detection (MEDIUM-1)
- Tests: dispatcher.test.mjs, setup-probes.test.mjs, possibly new fixtures
- READMEs: only if user-facing behavior changes
- Marketplace tree: resync via `--write` once fixes land

## Adaptive scope based on T1-T3 probe outcomes

The 3 probes (T1 = HIGH-1, T2 = HIGH-2, T3 = MEDIUM-1) each return:
- **Verdict A** — root cause identified inside the plugin; implement fix in T4-T6
- **Verdict B** — root cause is upstream (Claude Code, Codex sandbox); document as upstream issue + ship a workaround
- **Verdict C** — inconclusive after 30 min probe; defer to backlog with the artifact as evidence

T7 (MEDIUM-2 version) and T8 (LOW error messages) ship regardless of probe outcomes — they're isolated.
