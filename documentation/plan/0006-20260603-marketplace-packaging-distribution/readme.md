# Plan 0006 — Marketplace packaging and distribution polish

**Status**: `polishing`
**Started**: 2026-06-03
**Stage 1 approved**: 2026-06-03
**Stage 2 complete**: 2026-06-04
**Stage 3 complete**: 2026-06-04
**Last updated**: 2026-06-04

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-03** — all 10 OQs (A–J) resolved; 12 tasks (T1–T12) with acceptance criteria; 7 risks (R1–R7); awaiting Stage 2 kickoff (parallel with Plan 0004 T11/T12) |
| 2 — Implement | `2-implement.md` | **complete 2026-06-04** — T1–T12 done (T9.5 runtime-packaging remediation included); marketplace layout committed under `marketplace/`; plugin cache is self-contained and executable from `<CODEX_HOME>/plugins/cache/.../0.2.0/scripts/claude-companion.mjs setup` without `ERR_MODULE_NOT_FOUND`; install / upgrade / uninstall / smoke / versioning / release-checklist / docs-split procedures all in place; plugin version `0.2.0`; 1493 tests passing locally (1207 npm test + 28 test:attach + 258 test:bench); CI green on run `26958704913` across `ubuntu-latest + macos-latest × Node 20 + 22` |
| 3 — Audit | `3-audit.md` | **complete 2026-06-04** — verdict `ready-for-polish`; 2 findings (F-1 stale known-limitation bullet in plugin README L355, F-2 stale plan-status checklist in root README L151-162); all 20 contract questions PASS, all safety invariants PASS, gates green (1493 tests, `package-marketplace --check` exit 0, lint/typecheck/format clean); auditor `oh-my-claudecode:critic` (Opus, fresh-context subagent) |
| 4 — Polish | `4-polish.md` | not started — address F-1 + F-2 |
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
