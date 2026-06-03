# Plan 0006 — Marketplace packaging and distribution polish

**Status**: `planning`
**Started**: 2026-06-03
**Stage 1 approved**: 2026-06-03
**Last updated**: 2026-06-03

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-03** — all 10 OQs (A–J) resolved; 12 tasks (T1–T12) with acceptance criteria; 7 risks (R1–R7); awaiting Stage 2 kickoff (parallel with Plan 0004 T11/T12) |
| 2 — Implement | `2-implement.md` | not started |
| 3 — Audit | `3-audit.md` | not started |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Plan 0006 ships the cc-plugin-codex marketplace packaging, install/upgrade/uninstall flow, and release polish. It defines the committed marketplace layout that Plans 0001–0005 deliberately deferred ("No committed marketplace packaging — Plan 0006 handles distribution polish"), the packaged file manifest, and the smoke procedure that verifies real Codex discovery of all eight skills.

Plan 0006 deliberately starts in parallel with Plan 0004 T11/T12 because it is mostly distribution mechanics — file paths, marketplace JSON shape, installer flow, version-bump checklist — and has no dependency on the post-cutover benchmark data. The plan must NOT touch the README cost paragraph (that decision belongs to Plan 0004 T12) and must NOT modify the benchmark harness in `tools/bench/` (frozen until T11).

## Parallel with Plan 0004

Plan 0004 is frozen at tag `plan-0004-pre-cutover` (commit `7d9b5f1`) for post-cutover comparability. Plan 0006 must not affect:

- `tools/bench/**` (harness semantics frozen)
- `documentation/plan/0004-*/artifacts/**` (pre-cutover artifact frozen)
- `packages/plugin-codex/README.md` `## Cost and prompt-cache wording` paragraph (Plan 0004 T12 owns this)
- Plan 0004 measurement comparability between pre and post cutover

## Relationship to Plan 0005

Plan 0005 (stop-time review gate) is `deferred` pending Plan 0004 T11/T12 data. Plan 0006 does NOT subsume Plan 0005; the two plans address different concerns (packaging vs product behavior). The plan-number sequence stays as-is (Plans 0001–0006) per the audit trail in Plans 0003/0004 reports.
