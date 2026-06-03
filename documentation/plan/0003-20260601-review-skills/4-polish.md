# Plan 0003 Stage 4 — Polish

**Status**: complete pending CI
**Audit input**: `3-audit.md` (commit `696929a`, verdict `ready-for-polish`, 4 findings)
**Polish commit**: pending
**CI run**: pending

---

## Audit findings resolved

- **F1 (LOW)** — `packages/plugin-codex/README.md` now documents the `$claude-review` vs `claude ultrareview` distinction in two places: the `## Review skills` intro paragraph and a new bullet under `## Known limitations`. T10-24 tightened in Stage 4 from a passive "if mentioned, neutral context" guard to a positive requirement that the distinction is documented. See Subagent B's test edits.
- **N1 (NIT)** — `packages/plugin-codex/scripts/lib/format.mjs` `formatAdversarialReviewJson` no longer emits `reviewOf: null`. Switched to the T7 omission pattern (`...(job.reviewOf !== undefined ? { reviewOf: job.reviewOf } : {})`). Branch is unreachable in production (cmdAdversarialReview always sets `reviewOf` per § A.5 of the audit) but the formatter shape is now consistent with `formatStatus`.
- **N2 (NIT)** — `packages/plugin-codex/scripts/claude-companion.mjs` `printUsage` block refreshed. Per-subcommand flag hints added for `review` and `adversarial-review`. Flag descriptions now identify the correct applicability sets for `--model`/`--effort`/`--permission-mode`/`--all`/`--json`/`--yes` and explicitly note that `--allow-edit` is REJECTED by review and adversarial-review.
- **N3 (NIT)** — `packages/plugin-codex/README.md` `## Troubleshooting` gained a new `### Tuning operator escape hatches` subsection that surfaces `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`, `CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS`, and `CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS` as operator escape hatches with restrained wording. No CLI flag exposure, no OQ4-forbidden cost-claim wording.

## Audit findings deferred

None. F1/N1/N2/N3 all resolved in this Stage 4 pass.

## Process notes from audit (no Plan 0003 action)

- **P1** — F-H1 / F-H2 adherence in Subagent C briefs verified clean across T1/T5/T6/T10 spot-checks. No follow-up.
- **P2** — T12a + T12b commit-scope trade-off (bundled with T12 vs separate) accepted by auditor. No follow-up.
- **P3** — T11 orchestrator-absorbs-A/B borderline self-audit, mitigated by independent ci-workflow.test.mjs. Recommendation is to add a Pattern 6 to `documentation/process/reviewer-contract-patterns.md` for future plans; this is reviewer-contract polish, not Plan 0003 polish.

## Out-of-scope items deferred (auditor §)

- **O1** — Replace 8-second deterministic wait in `cmdReview` with an event-driven loop over `events.jsonl`. Deferred to a future Plan 0002/0003 follow-up.
- **O2** — Unify driver `sendResult.finalMessage` with the reconciler-written result file so they always agree. Deferred to a future plan (Plan 0002.5 or Plan 0005-adjacent).
- **O3** — Adaptive `ATTACH_WARMUP_DEFAULT_MS` probing instead of a single-version constant. Deferred to a future plan.
- **O4** — Reviewer-contract Pattern 6 doc note. Deferred to process-doc polish, not Plan 0003.

## Polish change list

| File | Change | Audit finding |
|---|---|---|
| `packages/plugin-codex/README.md` | `## Review skills` intro paragraph documents the `claude ultrareview` distinction | F1 |
| `packages/plugin-codex/README.md` | `## Known limitations` adds a "No `claude ultrareview` wrapper" bullet | F1 |
| `packages/plugin-codex/README.md` | `## Troubleshooting` adds `### Tuning operator escape hatches` subsection | N3 |
| `packages/plugin-codex/scripts/lib/format.mjs` | `formatAdversarialReviewJson` omits `reviewOf` when absent | N1 |
| `packages/plugin-codex/scripts/claude-companion.mjs` | `printUsage` refreshed for review/adversarial-review accepted flags | N2 |
| `packages/plugin-codex/test/readme.test.mjs` | T10-24 tightened to positive requirement; new tests for N3 env-var notes | F1, N3 (B) |
| `packages/plugin-codex/test/dispatcher.test.mjs` | New tests for usage block, --allow-edit not implied for review, --model applicability, reviewOf omission | N1, N2 (B) |

## Gate evidence

Local gates: pending Stage 4 run, to be recorded in the next commit.
CI: pending.

## Stage 4 contract checklist

- [x] F1 fixed with positive README content
- [x] N1 fixed (reviewOf omitted instead of null)
- [x] N2 fixed (help text refreshed)
- [x] N3 fixed with restrained operator-note wording
- [ ] Tests added/adjusted (Subagent B)
- [ ] Gates green locally
- [ ] CI green
- [x] No O1-O4 work performed in code
- [x] No runtime/driver/mock/skill/manifest changes
- [x] No new cost-claim wording
