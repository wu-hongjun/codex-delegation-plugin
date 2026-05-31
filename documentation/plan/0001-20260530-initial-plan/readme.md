# Plan 0001 — Initial foundation

**One-line summary**: Establish the v1 project foundation — repo scaffolding, `doctor` compatibility probe, `ClaudeBackgroundDriver` start-only vertical slice, and the `$claude-delegate` / `$claude-status` / `$claude-result` skill triad — so a Codex user can delegate a single task to a real Claude Code background session and read the result back.

**Status**: `reporting` (Stage 4 polish complete; awaiting Stage 5 report)

**Started**: 2026-05-30
**Approved**: 2026-05-30 (all six open questions resolved by maintainer)
**Stage 2 complete**: 2026-05-31
**Stage 3 complete**: 2026-05-31 (independent audit, verdict PASS WITH FINDINGS — `63fa9fd`)
**Stage 4 complete**: 2026-05-31 (all five audit findings resolved + one user-reported Codex YAML-strictness fix; 447 tests pass)
**Last updated**: 2026-05-31
**Completed**: —

**Owner**: maintainer (`wu-hongjun`)

## Pipeline state

| Stage | File | Status |
|---|---|---|
| 1 — Plan | [`1-plan.md`](1-plan.md) | **approved 2026-05-30** |
| 2 — Implement | [`2-implement.md`](2-implement.md) | **complete 2026-05-31** (T1–T14 + T11/T12a/T12b remediations; 439 tests pass; CI green on `ubuntu+macos × Node 20+22`; live E2E confirmed against real Claude 2.1.149 + Codex 0.135.0) |
| 3 — Audit | [`3-audit.md`](3-audit.md) | **complete 2026-05-31** (independent session, fresh context; verdict PASS WITH FINDINGS — 5 low/nit; commit `63fa9fd`) |
| 4 — Polish | [`4-polish.md`](4-polish.md) | **complete 2026-05-31** (all five audit findings resolved + Codex YAML-strictness fix for `claude-setup`; lint/typecheck/format/test all green; 447 tests pass) |
| 5 — Report | [`5-report.md`](5-report.md) | not started |

## Dependencies / blockers

- No active blockers. All six plan-blocking open questions ([`1-plan.md` § 6](1-plan.md#6-open-questions--resolved-2026-05-30)) resolved 2026-05-30.
- Builds directly on prior research at [`documentation/research/20260530-initial-research/`](../../research/20260530-initial-research/) — in particular the architectural reversal from PTY-driven to background-session-driven transport.

## Key artifacts

- Research prompt: [`../../research/20260530-initial-research/prompt.md`](../../research/20260530-initial-research/prompt.md)
- Research report: [`../../research/20260530-initial-research/report.md`](../../research/20260530-initial-research/report.md)
- Repo README (mission, design pillars): [`../../../README.md`](../../../README.md)
- Workflow definition: [`../README.md`](../README.md)

## Out of scope (deferred to later plans)

- Multi-turn reuse via PTY attach → Plan 0002
- `$claude-review` / `$claude-adversarial-review` skills → Plan 0003
- Benchmark harness comparing `-p` vs background vs reused-background → Plan 0004
- Hook-based stop-time review gate → Plan 0005
- Codex marketplace packaging + distribution polish → Plan 0006
