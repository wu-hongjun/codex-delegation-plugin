# Plan 0004 — Benchmark harness and cost measurement

**Status**: `implementing`
**Started**: 2026-06-03
**Stage 1 approved**: 2026-06-03
**Last updated**: 2026-06-03

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-03** — all 10 OQs (A–J) resolved; 12 tasks (T1–T12) with acceptance criteria; 9 risks (R1–R9); awaiting Stage 2 kickoff |
| 2 — Implement | `2-implement.md` | **in progress 2026-06-03** — T1-T9 complete + audit + Stage 4 polish (commits `ce562a8` / `059c882` / `9d394ee` / `9161a27` / `93a41e2`); T10 complete (pre-cutover live run, 60 cells, 58 ok, 2 review_failed, 58 min wall time; artifact `bench-pre-20260603-dfdd92a0`; 3 mid-stream bug fixes — float-timeout coercion, realpath sanitization, transcript discovery in 4 runners; `--permission-mode bypassPermissions` added for edit-requiring tasks; HOME-redaction in caveats); 1327 tests total (1041 + 28 + 258); T11 (post-cutover, ≥ 2026-06-16) + T12 (README cost decision) deferred |
| 3 — Audit | `3-audit.md` | **complete 2026-06-03** — harness-slice audit; verdict `ready-for-live-T10`; 1 MEDIUM (F1 `delegate.mjs` scope bug) + 1 LOW (F2 `aggregator.mjs` validation gap) + 2 NIT; audit commit `eba27b7`; CI run `26885907350` green on ubuntu+macos × Node 20+22 |
| 4 — Polish | `4-polish.md` | **complete 2026-06-03** — F1/F2/F3 resolved; N1 deferred to T10 outer-loop wiring; polish commit `9161a27`; CI run `26887707220` green on ubuntu+macos × Node 20+22; 1296 tests pass (1041 + 28 + 227) |
| 5 — Report | `5-report.md` | not started — gated on T10/T11/T12 completion |

## Summary

Plan 0004 builds a benchmark harness for cc-plugin-codex that measures cost, latency, and verdict characteristics of the plugin's delegation and review flows against a fixed task corpus. The harness instruments `$claude-delegate`, `$claude-followup`, `$claude-review`, and `$claude-adversarial-review` against real Claude Code and produces machine-readable results suitable for comparison.

Plan 0001's cost paragraph (byte-locked in README) reserves cost-savings measurement for Plan 0004. Plan 0003's report flags the `$claude-review` and `$claude-adversarial-review` flows as comparable in Plan 0004.

Plan 0004's scope spans the **2026-06-15 Anthropic Agent SDK credit cutover**. The harness should be capable of running before and after the cutover to record observed bucketing of `claude --bg` usage (interactive vs Agent SDK credit) without inferring a claim from policy text alone.
