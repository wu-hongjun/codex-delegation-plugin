# Plan 0021 — v0.3.3 session-name uniqueness (deep-test F2b)

**Status**: `complete` — v0.3.3 SHIPPED (2026-06-11)
**Started**: 2026-06-11

## Release — v0.3.3 SHIPPED

- Commit 1 (fix A + tests + docs): `a18244d` (shipped at version 0.3.2; bundled driver `background-session.js` staged via `git add -u` so the executing runtime carries the fix)
- Commit 2 (version bump): `aa0d390`
- CI run `27388616086` on `aa0d390`: **success** (ubuntu + macOS × Node 20 + 22; macos/Node-20 passed first try this time — no rerun needed)
- Tag `v0.3.3` → `aa0d390` (annotated, pushed)
- GitHub release: https://github.com/wu-hongjun/cc-plugin-codex/releases/tag/v0.3.3
- `v0.2.0` / `v0.3.0` / `v0.3.1` / `v0.3.2` tags preserved immutable
- Local install refreshed to `0.3.3` (cache `~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3`); fix A (entropy on explicit `--name`) verified present in the executing runtime
- Tests: 1552 npm test (mock 68 + runtime 176 + driver 192 + plugin 1116), 0 fail; marketplace `--check` 26 derived + 64 bundled
- One test caught + fixed mid-build: dispatcher `T6-2` asserted the exact internal review session name, which the uniquify fix now correctly suffixes → updated to a prefix match (also fixes the review-name collision previously seen in-store)
**Drafted from**: the v0.3.2 deep test (`documentation/testing/findings-20260608-v032-deep.md`) + maintainer audit (ground-truth trace of the F2b contamination).

## Root cause

Plan 0020 (v0.3.2) closed the "session identity keyed on a non-unique name" root cause **only for auto-generated default names** (F1 added entropy there). It left explicit `--name` verbatim, and the Plan 0020 F4 docs asserted — **without verification** — that a reused `--name` is a benign "idempotent session key." The v0.3.2 deep test refuted that.

**Ground-truth trace of F2b** (two delegates, both `--name dup-key-test`):

- Job records are correctly distinct: job1 `10c7b501` / "DUP-KEY-ONE", job2 `7b568f05` / "DUP-KEY-TWO".
- job1's own sidecar `~/.claude/jobs/10c7b501/state.json` has `result: null` — it never finished.
- job1's transcript `10c7b501-….jsonl` contains **both** `DUP-KEY-ONE` and `DUP-KEY-TWO`.
- job1's `result.md` = `DUP-KEY-TWO`.

Mechanism (Claude Code layer): the second `claude --bg --name dup-key-test …` **injected its prompt into job1's still-open session named `dup-key-test`** (and also created a second session). job1's transcript then ended on DUP-KEY-TWO, and the reconciler faithfully wrote that into job1's result → **silent corruption of the earlier job's output** whenever a `--name` is reused. Same bug class as v0.3.1 Finding 1, just for explicit names.

## Fix (v0.3.3)

| ID | File | Change |
| --- | --- | --- |
| **A** | `packages/driver-claude-code/src/background-session.ts` | Append crypto entropy to **every** session name passed to `claude --bg --name`, including a user-provided `--name`. A `--name` becomes a human-readable **prefix**; the real session name is `<name>-<8hex>`. Claude can never reuse a session, so a reused `--name` can no longer contaminate. Completes the root-cause fix F1 started. |
| **B** | `packages/driver-claude-code/test/start-session.test.mjs` | Update the two exact-name assertions (113, 152) to `startsWith(<name>-)`; update the legacy agents-json match (160) to use `handle.sessionName`. +1 test: two startSession calls with the same `name` yield distinct `sessionName`s. |
| **C** | `packages/plugin-codex/skills/claude-delegate/SKILL.md` + `documentation/REAL-CODEX-TEST-RECIPE.md` | Replace the false "idempotent key" claim with: names are auto-uniqued (a `--name` is a label prefix); to continue a job use `$claude-followup <jobId>`. |
| **D** | `documentation/REAL-CODEX-TEST-RECIPE.md` (§4.10) | Med-3: remove the `$claude-status shows goal_status` over-promise (`goal_status` is not a surfaced field — recipe-only, like the F3 status over-promise). |

## Documented runtime exception

`packages/driver-claude-code/src/background-session.ts` (name generation) — documented exception, precedent Plans 0012 T5 / 0014 T2e / 0019 B2 / 0020.

## Deferred (not in v0.3.3; logged from the v0.3.2 test)

- **Med-1** — `status --all --json` slow/stalls under heavy concurrent load (O(jobs) reconcile over 130+ accumulated jobs; partly a test-harness artifact). Candidate: skip terminal jobs in reconcile + a job-prune utility. Tracked for a perf plan.
- **Med-2** — 5s followup/review registration window times out under load. Candidate: adaptive/raised window.
- **Low-1** — adversarial-review immediate parser tags model preamble ("I'll verify…") as a `[NIT]`. Parser robustness.
- **Env note** — workflow/goal/deep-research hit a `needs_input` approval gate under Claude Code 2.1.173 even with `--yes`; only batch/fork exercised real fan-out this run. Environmental, not a plugin defect.

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | this readme | approved 2026-06-11 (maintainer authorized v0.3.3 scope) |
| 2 — Implement | `2-implement.md` | complete |
| 3 — Audit | unit tests (1552 pass) + CI green | complete |
| 5 — Report | folded into 2-implement.md + this Release section | complete |

## Release

Bump plugin `0.3.2` → `0.3.3` per RELEASING.md after CI green. `v0.2.0`/`v0.3.0`/`v0.3.1`/`v0.3.2` tags immutable. Two-commit pattern; remember the bundled-runtime gitignore quirk (`git add -u`/`-f` so the bundled `background-session.js` carries fix A).
