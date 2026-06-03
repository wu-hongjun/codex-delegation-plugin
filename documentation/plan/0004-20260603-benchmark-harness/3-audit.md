# Plan 0004 Stage 3 — Audit

**Audited commit**: `9d394ee` (HEAD); substance at `ce562a8` (T1-T9); format at `059c882`
**Audited on**: 2026-06-03
**Auditor**: Claude (Opus 4.6, 1M context), fresh session, no Plan 0004 implementation memory

> "This audit does not certify benchmark results or README cost-copy changes. It certifies only that the T1–T9 harness is ready, or not ready, for live T10/T11 measurement."

---

## Verdict

**ready-for-live-T10**

One MEDIUM finding (F1: `delegate.mjs` finally-block session stop is a no-op due to `jobId` scoping bug), two LOW findings (F2: aggregator omits `findingsCount` from validation; F3: misleading comment in delegate.mjs), two NIT findings. No blockers. All 6 gates pass. All 12 audit questions PASS. The harness contract conformance is clean; F1 is real but mitigated by the session's own timeout/orphan lifecycle and is appropriate Stage 4 polish material rather than a T10 blocker.

---

## Audit methodology

- Read in order: `documentation/plan/README.md`, plan readme, `1-plan.md` (569 lines), `2-implement.md` (380 lines).
- Read all 11 library modules under `tools/bench/lib/` (including `runners/`), `run.mjs` entry point, and all 13 test files.
- Read `.github/workflows/ci.yml` and `package.json`.
- Read fixture files: `fixtures/README.md`, `fixtures/src/app.js`, `fixtures/test/` directory listing.
- Independent gate run at HEAD (`9d394ee`):
  - `npm run lint` — exit 0
  - `npm run typecheck` — exit 0
  - `npm run format` — exit 0 ("All matched files use Prettier code style!")
  - `npm test` — exit 0 (chain: mock 68 + runtime 172 + driver 178 + plugin 623 = 1041)
  - `npm run test:attach` — exit 0 (28/28)
  - `npm run test:bench` — exit 0 (221/221)
  - **Total: 1290** — matches 2-implement.md baseline exactly.
- Grep-verified: OQ4 forbidden tokens, `claude -p` in `packages/`, `baseline-p` imports, T10/T11/T12 artifacts, commit claims.
- Verified JavaScript scoping of `let jobId` inside `try` vs `finally` blocks with a standalone Node.js execution.

---

## A. Contract compliance vs 1-plan.md

Every T-task's acceptance criteria from 1-plan.md § 4 is met for T1-T9.

### T1 — Research: cost-data sources

- Research note in `2-implement.md` § T1 covers all 5 candidate sources enumerated in the acceptance criteria. ✓
- For each source: documented (yes/no), tested against Claude Code 2.1.150 (yes), schema shape provided for the viable source. ✓
- Clear conclusion: transcript JSONL `message.usage` is primary; no automated fallback; "honest non-measurement" is the fallback when transcript parse fails. ✓
- Evidence appendix with confirmed schema shapes included. ✓

### T2 — Harness CLI skeleton + dry-run mode

- `node tools/bench/run.mjs --dry-run` — verified exit 0 by bench CLI tests (21 tests, all pass). ✓
- `node tools/bench/run.mjs --help` prints usage matching § 3.8. ✓
- `--dry-run --flows delegate --tasks summarize-todos --runs 3` prints exactly 3 cells — test-locked. ✓
- `--dry-run --include-baseline-p` includes `baseline-p` flow — test-locked. ✓
- No third-party dependencies; only `node:*` built-in modules. Verified: `cli.mjs` uses `node:util`, `flows.mjs`/`tasks.mjs` are pure data, `run.mjs` uses `node:crypto`/`node:path`/`node:url`. ✓

### T3 — Task-corpus fixture

- `fixtures/README.md` exists with exactly 3 TODO markers (line 8, 9, 10). ✓
- `fixtures/src/app.js` exists with `oldName` variable used in 2 places (lines 3, 7). ✓
- `fixtures/test/` contains `app.test.js` and `helpers.test.js` (2 test file stubs). ✓
- `fixture.mjs` exports `createFixture()` returning `{ root, cleanup }`. ✓
- Two `createFixture()` calls produce independent directories — test-locked (11 tests). ✓
- `git init` runs inside — test-locked (`".git/ after createFixture"` test). ✓

### T4 — Flow runner: `delegate`

- Exports `runDelegate(task, fixtureRoot, env, opts)`. ✓
- Spawns via `runDispatcher` with `subcommand: 'delegate'`, `args: ['--yes', '--json', '--', task.prompt]`. ✓
- Wall-clock via `performance.now()`. ✓
- Polls `status --json --all` until terminal state. ✓
- Captures `result --json` output. ✓
- Returns `RunResult` with correct fields. ✓
- 10-minute `DEFAULT_TIMEOUT_MS = 600_000`. ✓
- Timeout marked as `error: 'timeout'`. ✓
- See **Finding F1** for the finally-block session-stop gap.

### T5 — Flow runner: `delegate-followup`

- Exports `runDelegateFollowup(task, fixtureRoot, env, opts)`. ✓
- Two-turn flow: delegate → poll → followup → poll. ✓
- `turnsWallClockMs` has 2 entries (delegate + followup). ✓
- TTL-expired path marks `error: 'ttl_expired'` when status reaches terminal other than `awaiting_followup`. ✓
- Followup prompt: `"Now confirm how many files you inspected."` — verbatim per acceptance. ✓
- Finally block correctly calls `stop` with `jobId` (jobId declared before try). ✓

### T6 — Flow runner: `delegate-review`

- Exports `runDelegateReview(task, fixtureRoot, env, opts)`. ✓
- Delegates, polls to `awaiting_followup`, spawns `review --yes --json jobId`. ✓
- Per-turn breakdown in `turnsWallClockMs`. ✓
- Captures `reviewVerdict` (`pass | fail | pass_with_findings`). ✓
- Captures `findingsCount` from parsed review output. ✓
- Finally block correctly calls `stop` with `jobId`. ✓

### T7 — Flow runner: `delegate-adversarial`

- Exports `runDelegateAdversarial(task, fixtureRoot, env, opts)`. ✓
- Delegates, polls to terminal, spawns `adversarial-review jobId --yes --json`. ✓
- Per-turn breakdown in `turnsWallClockMs`. ✓
- `DEFAULT_REVIEW_TIMEOUT_MS = 1_800_000` (30 min, matches DD-1). ✓
- `opts.reviewTimeoutMs` overrideable — test-locked. ✓
- Timeout marked as `error: 'review_timeout'`. ✓
- Dual-transcript aggregation via `mergeTokenUsage()`. ✓
- Severity breakdown captured as caveats. ✓
- Finally block correctly calls `stop` with `jobId`. ✓

### T8 — Flow runner: `baseline-p` (opt-in)

- Exports `runBaselineP(task, fixtureRoot, env, opts)`. ✓
- Spawns `claude -p "<task.prompt>"` directly — NOT through plugin dispatcher. ✓
- Wall-clock measurement via `performance.now()`. ✓
- Captures stdout as result. ✓
- Only invoked via `--include-baseline-p` — gated by `selectFlows()` in `flows.mjs`. ✓
- Required architectural comment present (source lines 4-10). ✓
- Does NOT import from `packages/` — grep-verified and test-locked. ✓

### T9 — Result aggregator + summary writer

- `aggregator.mjs` exports `aggregate(runs, metadata)` producing schema § 3.7. ✓
- `summary.mjs` exports `formatSummary(results)` (pure) and `writeSummary(results, outputDir)` (I/O boundary). ✓
- Schema: `schemaVersion: 1`, cells grouped by `(flow, task)`, metadata populated. ✓
- Summary contains all 7 required sections: header, per-flow median table, per-task breakdown, review verdict matrix, token usage, caveats, billing-bucket observation. ✓
- JSON round-trip equality verified — test-locked. ✓
- OQ4 forbidden tokens in summary output: 0 matches — test-locked (9 assertions). ✓

---

## B. Security + safety invariants

All invariants hold.

1. **No real Claude or Codex calls in automated tests.** All 5 runner test files use DI on the `spawn` function parameter. No test calls real `claude` or `node scripts/claude-companion.mjs`. Test-locked by the mock spawn pattern (tests construct fake spawn results and assert behavior). ✓
2. **CI permissions unchanged.** `.github/workflows/ci.yml` line 9: `permissions: contents: read`. No `secrets.*` references. No real Claude/Codex install step. ✓
3. **CI matrix unchanged.** Lines 21-27: `ubuntu-latest + macos-latest × Node 20 + 22`. ✓
4. **`test:bench` is separate from main `npm test` chain.** `package.json` line 18: `"test"` chains `test:mock && test:runtime && test:driver && test:plugin` — no `test:bench`. Line 26: `"test:bench"` is its own script. CI has a separate `Test bench lane` step (ci.yml line 89) after `Test attach lane` (line 86). ✓
5. **Production plugin code does NOT use `claude -p`.** Grep `packages/` for `claude -p` outside negation/test context: 0 matches. ✓
6. **`baseline-p` is isolated to `tools/bench/`.** `baseline-p.mjs` does not import from `packages/`. `selectFlows()` in `flows.mjs` requires `includeBaselineP: true` to include it. No references to `baseline-p` in `packages/`. ✓
7. **No new dependencies.** `package.json` has no new entries in `devDependencies` (same 6 entries as prior plans). Bench code uses only `node:*` built-ins. ✓

---

## C. Architecture

1. **Harness location**: `tools/bench/` — consistent with `tools/mock-claude/`, `tools/mock-codex/` precedent. ✓
2. **Runners don't import from `packages/`**: only one bench file imports from `packages/` — the `baseline-p.test.mjs` which reads the source file for assertions. No lib/runner source file imports from `packages/`. ✓
3. **Dependency flow**: runners → `run-result.mjs`, `transcript-usage.mjs`, `dispatcher-spawn.mjs`. Aggregator → `run-result.mjs` (types only). Summary → `aggregator.mjs` (for `summarizeLatency`). Clean DAG, no cycles. ✓
4. **DI test seam**: all 5 runners accept `opts.spawn` for test injection. `dispatcher-spawn.mjs` accepts `opts.spawn` override. ✓
5. **Pure/IO split**: `aggregator.mjs` is pure (no I/O). `summary.mjs` separates `formatSummary()` (pure) from `writeSummary()` (I/O boundary). ✓

---

## D. Tests

### Gate run at HEAD

| Lane | Tests | Pass | Fail | Exit |
|---|---|---|---|---|
| `npm run lint` | — | — | — | 0 |
| `npm run typecheck` | — | — | — | 0 |
| `npm run format` | — | — | — | 0 |
| `test:mock` | 68 | 68 | 0 | 0 |
| `test:runtime` | 172 | 172 | 0 | 0 |
| `test:driver` | 178 | 178 | 0 | 0 |
| `test:plugin` | 623 | 623 | 0 | 0 |
| `test:attach` | 28 | 28 | 0 | 0 |
| `test:bench` | 221 | 221 | 0 | 0 |
| **Total** | **1290** | **1290** | **0** | — |

Matches 2-implement.md expected baseline (1290) exactly. Plan 0003 baseline (1069) is preserved — no regression in any pre-existing lane.

### Test coverage by module

| Module | Tests | Notes |
|---|---|---|
| `cli.mjs` | 21 | Flag parsing, validation, --help, error messages |
| `fixture.mjs` | 11 | Isolation, git init, cleanup, TODO count |
| `run-result.mjs` | 13 | Factory shape, markError, field defaults |
| `transcript-usage.mjs` | 14 | Missing file, empty, malformed, single/multi-message, ephemeral cache, sanitizeCwd |
| `dispatcher-spawn.mjs` | 8 | Contract, env passthrough, timeout detection, repo root |
| `output-dir.mjs` | 12 | Both modes, error cases, recursive mkdir |
| `aggregator.mjs` | 29 | Empty, single, multi-run, cell ordering, caveats, cutoverPhase, validation, JSON round-trip |
| `summary.mjs` | 29 | All 7 sections, OQ4 forbidden tokens (9 assertions), writeSummary I/O |
| `runners/delegate.mjs` | 13 | Happy path, failure paths, isolation, caveats |
| `runners/delegate-followup.mjs` | 16 | Happy path, ttl_expired, failure paths, isolation, caveats |
| `runners/delegate-review.mjs` | 18 | Happy path, 3 verdict variants, findings count, failure paths, isolation, caveats |
| `runners/delegate-adversarial.mjs` | 21 | Happy path, verdict variants, failure paths, ineligible terminal, token aggregation, severity caveats |
| `runners/baseline-p.mjs` | 16 | Happy path, failures, transcript, architectural invariants (4 assertions) |
| **Total** | **221** | |

---

## E. Cost-claim discipline

All checks pass.

- **Forbidden literal tokens** (`saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the`, `more efficient than`) grep over `tools/bench/lib/` and `tools/bench/run.mjs`: only matches are in `summary.mjs` lines 8-9 which LIST the forbidden tokens in a JSDoc comment — not producing them. ✓
- **Forbidden regex patterns** (`/\d+%\s*(faster|cheaper|less)/i`, `/\d+x\s*(faster|cheaper)/i`, `/save[sd]?\s+\d+/i`) grep over the same scope: 0 matches. ✓
- **Summary output OQ4 scan**: test-locked by 9 explicit assertions in `summary.test.mjs` "OQ4 forbidden tokens" suite. ✓
- **README cost paragraph**: not in Plan 0004 T1-T9 scope (T12 decision). ✓

---

## F. Fixture and isolation

- Fixture corpus is deterministic: 3 TODO markers in `README.md`, `oldName` variable in `src/app.js`, 2 test files. ✓
- `createFixture()` creates independent temp dirs under `/tmp/cc-plugin-codex-plan0004-bench-*`. ✓
- `git init` runs inside each fixture. ✓
- No shared state between calls — test-locked by "two calls return two different root paths" test. ✓
- Each runner creates an isolated `CC_PLUGIN_CODEX_HOME` via `mkdtempSync`. ✓
- Cleanup via `rmSync` in finally blocks (all 4 plugin-flow runners). ✓

---

## G. RunResult shape conformance

All 5 runners produce the locked `RunResult` shape from `run-result.mjs`:

| Field | delegate | delegate-followup | delegate-review | delegate-adversarial | baseline-p |
|---|---|---|---|---|---|
| `flow` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `task` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `runIndex` | ✓ (hardcoded 0) | ✓ (hardcoded 0) | ✓ (hardcoded 0) | ✓ (hardcoded 0) | ✓ (hardcoded 0) |
| `wallClockMs` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `turnsWallClockMs[]` | ✓ (1 entry) | ✓ (2 entries) | ✓ (2 entries) | ✓ (2 entries) | ✓ (1 entry) |
| `tempoTransitions \| null` | ✓ | ✓ | ✓ | ✓ | ✓ (always null) |
| `tokenCounts \| null` | ✓ | ✓ | ✓ | ✓ (merged) | ✓ |
| `reviewVerdict \| null` | ✓ (null) | ✓ (null) | ✓ | ✓ | ✓ (null) |
| `findingsCount \| null` | ✓ (null) | ✓ (null) | ✓ | ✓ | ✓ (null) |
| `error \| null` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `caveats[]` | ✓ | ✓ | ✓ | ✓ | ✓ |

All runners start from `createEmptyRunResult()` which initializes all 11 fields. ✓

---

## H. Aggregator + summary output conformance

### results.json schema (§ 3.7)

- `schemaVersion: 1` — hardcoded in `aggregate()` line 192. ✓
- Cells grouped by `(flow, task)` in flows × tasks cartesian order. ✓
- Zero-run cells omitted (sparse matrix support for baseline-p). ✓
- Metadata fields: `cutoverPhase`, `billingBucketObservation`, `caveats` — all populated. ✓
- Top-level fields: `runId`, `date`, `claudeCodeVersion`, `nodeVersion`, `platform`, `runsPerCell`, `tasks`, `flows`, `cells`, `metadata`. ✓

### summary.md (§ 3.8 / T9 acceptance)

- Per-flow median latency table. ✓
- Per-task breakdown. ✓
- Review verdict agreement matrix (conditional on review cells). ✓
- Token usage section (conditional on tokenCounts). ✓
- Caveats section. ✓
- Billing-bucket observation section. ✓
- Header with run metadata. ✓

---

## I. T10/T11/T12 not faked

- No artifacts under `documentation/plan/0004-*/artifacts/bench-*` — directory is empty. ✓
- No `artifacts/` directory exists at repo root. ✓
- `run.mjs` line 71: `"Live execution not yet implemented. Use --dry-run to preview."` + exit 1. The outer execution loop is explicitly not wired. ✓
- No commit in the Plan 0004 range claims T10 or T11 completion — grep verified. ✓
- Plan readme status is `implementing` (not `auditing` or `complete`). ✓

---

## Findings

### F1. `delegate.mjs` finally-block session stop is a no-op (MEDIUM)

**Evidence**: `tools/bench/lib/runners/delegate.mjs:96` declares `let jobId` INSIDE the `try` block (line 59). At line 254 the `finally` block cannot access `jobId` because `let` is block-scoped to the `try` block. The `finally` block (lines 254-273) contains an empty try/catch at lines 260-265 with the comment "We don't have jobId in scope here" — the stop call is completely absent.

Compare to the other three plugin-flow runners:
- `delegate-followup.mjs:64` declares `let jobId = null` BEFORE `try` (line 66); finally at line 353 calls `stop` with `jobId`. ✓
- `delegate-review.mjs:59` declares `let jobId` BEFORE `try` (line 61); finally at line 294 calls `stop` with `jobId`. ✓
- `delegate-adversarial.mjs:93` declares `let jobId = null` BEFORE `try` (line 95); finally at line 371 calls `stop` with `jobId`. ✓

**Impact**: During live T10 measurement, if the delegate runner throws an exception after successfully spawning a `--bg` session but before the normal return path, the Claude session would be orphaned (no `stop` call). The isolated `CC_PLUGIN_CODEX_HOME` cleanup (line 269) still runs, but the real Claude process under `~/.claude/jobs/` would remain active until it self-terminates.

**Severity**: MEDIUM — this is a real bug but its blast radius is bounded:
1. The runner's normal exit paths (success, timeout, parse failure) all return before reaching the finally block with jobId in scope issues, since the early returns happen inside the try.
2. Only an unexpected exception thrown between job creation and return would trigger the orphan scenario.
3. Claude `--bg` sessions have their own lifecycle management (idle timeout, orphan detection).
4. T10 is a maintainer-attended run, not an unattended CI process.

**Fix**: Move `let jobId = null;` to before the `try` block (matching the pattern used by the other three runners), then replace the empty try/catch at lines 260-265 with the actual stop call pattern:
```js
if (!spawnFn && jobId) {
  try {
    runDispatcher({ subcommand: 'stop', args: [jobId], cwd: fixtureRoot, env: runEnv, timeoutMs: 10_000, spawn: undefined });
  } catch { /* ignore */ }
}
```

**Disposition**: Stage 4 polish. Does not block T10 — the risk is bounded by the fact that the delegate runner's normal code paths all return inside the try block, and Claude sessions self-manage their lifecycle.

### F2. Aggregator `REQUIRED_RUN_RESULT_FIELDS` omits `findingsCount` (LOW)

**Evidence**: `tools/bench/lib/aggregator.mjs:52-63` lists 10 required fields but does not include `findingsCount`. The `RunResult` shape in `run-result.mjs` has 11 fields including `findingsCount`.

**Impact**: Minimal. `createEmptyRunResult()` initializes `findingsCount: null` (run-result.mjs:49), so every `RunResult` produced by the factory will always have the field present. The validation gap only matters if someone constructs a `RunResult` object manually without using the factory AND omits `findingsCount`. In that case, the aggregator would accept an invalid RunResult. The field IS always present in practice because all 5 runners use `createEmptyRunResult()`.

**Severity**: LOW — no practical impact given the factory pattern, but a defense-in-depth gap.

**Fix**: Add `'findingsCount'` to the `REQUIRED_RUN_RESULT_FIELDS` array.

**Disposition**: Stage 4 polish.

### F3. `delegate.mjs` comment is misleading about scope (NIT)

**Evidence**: `tools/bench/lib/runners/delegate.mjs:261` says "We don't have jobId in scope here" — the comment is technically correct (jobId is block-scoped to try), but it frames the absence as an inherent constraint rather than a fixable bug. The other three runners solved this by declaring jobId before try.

**Severity**: NIT — the comment is accurate but masks the real issue (F1 above).

**Disposition**: Fixed automatically when F1 is addressed.

### N1. Runners hardcode `runIndex: 0` (NIT)

**Evidence**: All 5 runners hardcode `runIndex: 0` in their `createEmptyRunResult()` calls (delegate.mjs:53, delegate-followup.mjs:57, delegate-review.mjs:54, delegate-adversarial.mjs:87, baseline-p.mjs:44).

**Impact**: Expected and acceptable. The outer execution loop in `run.mjs` (which would iterate N=5 runs per cell and set `runIndex` accordingly) is explicitly not yet wired (line 71: "Live execution not yet implemented"). When T10 wires the outer loop, it will need to either (a) pass `runIndex` through `opts` to each runner and override the factory default, or (b) set `result.runIndex` after the runner returns.

**Severity**: NIT — this is explicitly documented in `2-implement.md` as deferred to outer-loop wiring.

**Disposition**: T10 implementation must wire runIndex. The hardcoded 0 is correct for the current test/dry-run scope. No action needed before T10.

---

## Summary table

| ID | Severity | Area | Finding | Disposition |
|---|---|---|---|---|
| F1 | medium | A,B | `delegate.mjs` finally-block session stop is a no-op; jobId declared inside try block, unreachable from finally | Stage 4 polish — move `let jobId` before try, add stop call |
| F2 | low | A,H | Aggregator `REQUIRED_RUN_RESULT_FIELDS` omits `findingsCount` | Stage 4 polish — add to validation array |
| F3 | nit | A | `delegate.mjs` comment misleads about scope constraint vs fixable bug | Auto-fixed by F1 |
| N1 | nit | G | All runners hardcode `runIndex: 0` pending outer-loop wiring | T10 implementation wires this; no pre-T10 action |

---

## F-candidate evaluation (independent assessment)

### F-candidate 1: `delegate.mjs` finally-block stop

**Orchestrator assessment**: LOW / non-blocking, "jobId out of scope" comment noted as misleading.

**Independent assessment**: MEDIUM. The orchestrator correctly identified the no-op but underrated the severity. This is a genuine bug, not just a misleading comment:
- `jobId` IS declared inside try (line 96), making it inaccessible from finally.
- The other three runners correctly declare `jobId` before try and call `stop` in finally.
- During live T10, this means the delegate runner (the most basic flow, run 3 × 5 = 15 times) cannot stop its sessions on unexpected exceptions.

However, it does NOT block T10 because: (a) normal code paths return inside try, (b) Claude sessions self-manage, (c) T10 is maintainer-attended. **Appropriate Stage 4 polish material.**

### F-candidate 2: `findingsCount` omission from validation

**Orchestrator assessment**: LOW / non-blocking.

**Independent assessment**: LOW. Concur. `createEmptyRunResult()` always initializes the field. The omission is a defense-in-depth gap, not a live bug. Stage 4 polish.

### F-candidate 3: Runners hardcode `runIndex: 0`

**Orchestrator assessment**: Expected deferral pending outer-loop wiring.

**Independent assessment**: NIT. Concur. The outer loop is explicitly not yet wired (run.mjs:71). T10 will need to address this when wiring live execution. `runIndex: 0` is correct for the current self-test scope. **Does T10 need the outer loop?** Yes — T10 runs N=5 per cell, so it needs an outer loop that sets runIndex 0-4. But this is T10 implementation scope, not T1-T9 harness scope. The deferral is acceptable.

---

## Audit questions — answers

1. **T1 research claim correctly implemented**: PASS. `transcript-usage.mjs` parses `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` `message.usage` per assistant entry. Aggregates all 6 specified token/cache fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`. Verified at source lines 88-92.

2. **Honest `tokenCounts: null` + caveat on failure**: PASS. All 5 runners use `createEmptyRunResult()` which initializes `tokenCounts: null`. Each runner appends a descriptive caveat when transcript is missing or parse fails. Verified across delegate.mjs:199-209, delegate-followup.mjs:296-310, delegate-review.mjs:246-259, delegate-adversarial.mjs:336-347, baseline-p.mjs:100-138.

3. **`baseline-p` opt-in and isolated**: PASS.
   - `flows.mjs:49` filters out flows where `requiresBaselineFlag: true` unless `includeBaselineP` is set.
   - `baseline-p.mjs` imports only from `../run-result.mjs` and `../transcript-usage.mjs` — never from `packages/`. Grep-verified.
   - Architectural comment present at source lines 4-10.

4. **Production plugin code does NOT use `claude -p`**: PASS. Grep `packages/` for `claude -p` outside negation/test context: 0 matches.

5. **`test:bench` separate from `npm test` and in CI**: PASS. `package.json` line 18: `"test"` does not include `test:bench`. CI has a dedicated `Test bench lane` step at ci.yml:88-89 after `Test attach lane` at ci.yml:85-86.

6. **CI matrix and security posture unchanged**: PASS. `ubuntu-latest + macos-latest × Node 20 + 22`, `permissions: contents: read`, no secrets.

7. **No real Claude or Codex calls in automated tests**: PASS. All 5 runner test files use DI on the `spawn` parameter. Tests construct mock spawn results.

8. **Fixture corpus deterministic and isolated**: PASS. `createFixture()` returns independent temp dirs; `git init` runs inside; cleanup removes them. Test-locked by 11 fixture tests.

9. **All 5 runners produce locked RunResult shape**: PASS. All start from `createEmptyRunResult()` which initializes all 11 fields. See § G conformance table.

10. **Aggregator/summary output matches schema**: PASS. See § H conformance analysis.

11. **OQ4 cost-claim discipline preserved**: PASS. Grep for forbidden tokens and patterns: 0 matches in production code. Only matches are in `summary.mjs` JSDoc listing the forbidden tokens themselves. See § E.

12. **T10/T11/T12 not faked**: PASS. No bench artifacts on disk. `run.mjs` line 71 explicitly prints "Live execution not yet implemented." No commit claims T10/T11. See § I.

---

## Out-of-scope deferrals

### O1. Outer execution loop (T10 scope)

`run.mjs:71` — "Live execution not yet implemented." The outer loop that iterates N=5 runs per cell, sets `runIndex`, creates the fixture, calls the runner, aggregates results, and writes output is not yet wired. This is T10 implementation scope per the plan ("harness binary" is T2-T9; "execution" is T10/T11).

### O2. `runIndex` parameter passthrough

When the outer loop is wired in T10, each runner's `createEmptyRunResult({ ..., runIndex: 0 })` must be updated to accept the current iteration index. Options: pass via `opts.runIndex` or set `result.runIndex` post-return. Either works. (See N1.)

### O3. Billing-bucket observation methodology

Manual procedure per OQ-I resolution. Not automated in the harness. T10/T11 acceptance criteria require either a screenshot artifact or explicit "not observable" documentation. Out of scope for T1-T9.

---

## Approval gate

**Ready for live T10?** **Yes** (verdict: `ready-for-live-T10`).

One MEDIUM finding (F1: delegate.mjs finally-block stop no-op) and one LOW finding (F2: aggregator validation gap). Neither blocks T10:
- F1's risk is bounded by normal code paths returning inside try, Claude session self-management, and T10 being maintainer-attended. The fix is a 5-line Stage 4 polish item.
- F2 has no practical impact given the factory pattern.

Both are appropriate Stage 4 polish material. The harness contract conformance is otherwise clean across all 12 audit questions, all 6 gates pass, test counts match exactly, and the T10/T11/T12 boundary is respected.
