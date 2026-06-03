# Stage 4 — Polish: T1–T9 benchmark harness audit findings

**Status**: complete pending CI
**Scope**: audited harness slice only (T1–T9)
**Audit input**: `3-audit.md` (commit `eba27b7`, verdict `ready-for-live-T10`; 1 MEDIUM + 1 LOW + 2 NIT)
**Polish commit**: pending
**Polish format follow-up**: in-flight (auto-applied via `npx prettier --write` before commit)
**CI run**: pending

**Plan status remains `implementing`** because T10 (pre-cutover live run), T11 (post-cutover live run), and T12 (README cost-paragraph decision) are still pending. This polish does NOT close Plan 0004.

---

## Audit findings resolved

### F1 (MEDIUM) — `delegate.mjs` `finally` block was a no-op due to scope bug

**Fix location**: `tools/bench/lib/runners/delegate.mjs`.

`let jobId = null` now declared in the enclosing scope BEFORE the `try` block, matching the pattern in `delegate-followup.mjs` / `delegate-review.mjs` / `delegate-adversarial.mjs`. The `finally` block now best-effort calls `runDispatcher({ subcommand: 'stop', args: [jobId, '--yes'], ..., spawn: spawnFn })` when `jobId` is non-null. Stop errors are swallowed via `try/catch` and do NOT mask the original outer error. Isolated `CC_PLUGIN_CODEX_HOME` cleanup still runs after the stop attempt (ordering matches `delegate-followup.mjs`).

**Why this matters**: an exception thrown after job creation (status-poll throw, transcript-read throw, etc.) previously left the Claude background session running with no `stop` call. The isolated `CC_PLUGIN_CODEX_HOME` cleanup ran, but the live Claude session was orphaned. Bounded risk in dev (one zombie session per failed run), but T10's measurement integrity benefits from clean teardown.

**Regression tests added** (`tools/bench/test/runners/delegate.test.mjs`):
- **P1-T1**: When an exception is thrown after job creation, the spy-spawn records a `stop <jobId>` call before re-raise.
- **P1-T2**: The `stop` call is best-effort — when `stop` itself fails, the runner re-raises the ORIGINAL error from the inner try (not the stop error).
- **P1-T3**: Isolated `CC_PLUGIN_CODEX_HOME` cleanup still runs after both success and exception paths.
- One additional test ensuring the success-path stop also runs, for symmetry with T5/T6/T7.

### F2 (LOW) — `REQUIRED_RUN_RESULT_FIELDS` omitted `findingsCount`

**Fix location**: `tools/bench/lib/aggregator.mjs`.

`'findingsCount'` added between `'reviewVerdict'` and `'error'` in the `REQUIRED_RUN_RESULT_FIELDS` array, matching the JSDoc field order in `lib/run-result.mjs`. `createEmptyRunResult()` already initializes `findingsCount: null`, so factory-built RunResults were never affected; this closes the defense-in-depth gap.

**Regression tests added** (`tools/bench/test/aggregator.test.mjs`):
- **P2-T1**: A manually-constructed RunResult that omits the `findingsCount` field throws `BenchAggregateError` from `aggregate()`.
- **P2-T2**: A RunResult produced via `createEmptyRunResult({ flow, task, runIndex })` passes `aggregate()` cleanly (locks the contract).

### F3 (NIT) — misleading "jobId out of scope" comment

**Resolved automatically by F1**: the misleading comment in `delegate.mjs`'s `finally` block was deleted as part of moving `let jobId` outside the `try`. The new finally block is self-documenting: the cleanup intent is the code itself.

---

## Audit findings deferred

### N1 (NIT) — runners hardcode `runIndex: 0`

Deferred to T10 (live execution loop). The outer loop in `run.mjs` must either pass `runIndex` (0..N-1) into each runner OR patch `result.runIndex` after each runner returns. Documented in `2-implement.md` § T1-T9 deferral notes. Not a polish-pass concern.

---

## Deviations from `delegate-followup.mjs` pattern (intentional)

The F1 fix in `delegate.mjs` always calls `stop` in the `finally` (gated only on `jobId` being non-null). `delegate-followup.mjs` previously skipped the `stop` call entirely when `spawnFn` was set (i.e., during DI tests). The new pattern in `delegate.mjs` invokes the stop through `opts.spawn` so test spies can verify the call happens; the spy fakes the stop without invoking real Claude.

**Why this matters for downstream consistency**: `delegate-followup.mjs` / `delegate-review.mjs` / `delegate-adversarial.mjs` follow the older pattern (skip `stop` in DI mode). Their behavior is unchanged. The divergence is acknowledged here and not propagated to the other runners — they all had passing audits. A future polish (post-T10) MAY align all four runners on the test-spy-verifies pattern if measurement data shows leaked sessions from those runners too.

---

## Polish change list

| File | Change | Audit finding |
|---|---|---|
| `tools/bench/lib/runners/delegate.mjs` | `let jobId` moved outside `try`; `finally` now calls `stop` best-effort | F1, F3 |
| `tools/bench/lib/aggregator.mjs` | `findingsCount` added to `REQUIRED_RUN_RESULT_FIELDS` | F2 |
| `tools/bench/test/runners/delegate.test.mjs` | +4 tests (P1-T1, P1-T2, P1-T3, plus success-path symmetry) | F1 |
| `tools/bench/test/aggregator.test.mjs` | +2 tests (P2-T1, P2-T2) | F2 |
| `documentation/plan/0004-20260603-benchmark-harness/4-polish.md` | NEW — this file | — |
| `documentation/plan/0004-20260603-benchmark-harness/readme.md` | Status row updated to note harness audit/polish complete; Plan still `implementing` | — |

---

## Gate evidence

Local gates at HEAD (after F1/F2 fixes + format follow-up):

- `npm run lint` — clean
- `npm run typecheck` — clean
- `npm run format` (`prettier --check .`) — clean (after `prettier --write tools/bench/test/runners/delegate.test.mjs` follow-up)
- `npm test` — exit 0; counts: **mock 68 + runtime 172 + driver 178 + plugin 623 = 1041** (no regression from Stage 3 audit baseline)
- `npm run test:attach` — **28/28**
- `npm run test:bench` — **227/227** (was 221 + 6 polish tests)
- **Combined total: 1296** (was 1290; net +6 from polish)

CI evidence: pending Stage 4 commit + matrix run.

---

## Commit timeline (filled in after CI lands)

| Commit | Subject | Purpose |
|---|---|---|
| _pending_ | Plan 0004 Stage 4: polish T1-T9 harness audit findings | F1 + F2 + F3 fixes + regression tests; format follow-up applied in same pre-commit pass |
| _pending_ | Plan 0004 Stage 4 log: record CI success | CI evidence; updates this file with run ID + final counts |

---

## What this polish does NOT do

- Does NOT mark Plan 0004 complete. T10 / T11 / T12 remain pending.
- Does NOT modify `1-plan.md`, README cost paragraph, production plugin code, runtime, driver, mock-claude, skills, or CI workflow.
- Does NOT wire the live execution loop in `run.mjs` (N1 deferred).
- Does NOT align `delegate-followup.mjs` / `delegate-review.mjs` / `delegate-adversarial.mjs` finally-blocks with the new always-call-stop pattern (intentional; documented under "Deviations" above).
- Does NOT start T10. T10 still time-gated to ≤ 2026-06-14 and requires the maintainer to authorize the live pre-cutover run.

---

## Stage 4 contract checklist

- [x] F1 (MEDIUM) fixed — `jobId` scoped outside `try`, `finally` stop wired
- [x] F2 (LOW) fixed — `findingsCount` added to validation
- [x] F3 (NIT) resolved — misleading comment removed
- [x] N1 deferred to T10 (documented)
- [x] Regression tests added — +4 delegate, +2 aggregator
- [x] Gates green locally (1296 tests)
- [ ] CI green — pending
- [x] No scope creep (only 4 source files + 2 doc files touched)
- [x] No new cost-claim wording
- [x] Plan 0004 status remains `implementing`
