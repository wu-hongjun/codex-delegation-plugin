# Stage 1 — Plan: Benchmark harness and cost measurement

> **Status**: draft
> **Author**: Claude (assistant)
> **Date drafted**: 2026-06-03
> **Date approved**: pending

---

## 1. Context & references

This plan builds on Plan 0001 (complete 2026-05-31 at `5be9b9d`), Plan 0002 (complete 2026-06-01 at `4e208a3`), and Plan 0003 (complete 2026-06-02 at `4475061`). It implements the "benchmark harness + cost-claim copy update" deliverable explicitly identified in Plan 0001's follow-up list (§ "Follow-up plans": "Plan 0004 — benchmark harness comparing... sessions. Re-evaluates cost-claim copy with measured data") and Plan 0003's Stage 5 (§ "Follow-up plans": "Plan 0004 — Benchmark harness and cost measurement; compare `delegate-only` vs `delegate + same-session review` vs `delegate + adversarial review`").

**Key prior decisions binding this plan:**

- Plan 0001's OQ4 cost-claim discipline: the README "Cost and prompt-cache wording" paragraph (line 331 of `packages/plugin-codex/README.md`) is byte-locked. Forbidden tokens: `saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the`, `more efficient than`. Forbidden regexes: `/\d+%\s*(faster|cheaper|less)/i`, `/\d+x\s*(faster|cheaper)/i`, `/save[sd]?\s+\d+/i`. The paragraph stays byte-identical UNTIL Plan 0004's measurement provides honest data and Stage 5 decides otherwise.
- Plan 0001's locked v1 constraints: no new runtime deps in `packages/runtime` or `packages/driver-claude-code`; harness code lives outside production packages.
- Plan 0003 Stage 5 confirmed: both `$claude-review` and `$claude-adversarial-review` produce parseable structured findings; live E2E showed same-session verdict `pass` vs adversarial verdict `fail` on the same source output — exactly the kind of signal this harness needs to measure systematically.
- The 2026-06-15 Anthropic Agent SDK credit cutover is the external event that motivates pre/post measurement timing.

**References:**

- [`documentation/plan/0001-20260530-initial-plan/5-report.md`](../0001-20260530-initial-plan/5-report.md) — Plan 0001 final state, OQ4 discipline, locked v1 constraints.
- [`documentation/plan/0002-20260531-follow-up-injection/1-plan.md`](../0002-20260531-follow-up-injection/1-plan.md) — Plan 0002 PTY-attach machinery, follow-up injection.
- [`documentation/plan/0003-20260601-review-skills/5-report.md`](../0003-20260601-review-skills/5-report.md) — Plan 0003 final state, follow-up plan identification.
- [`packages/plugin-codex/README.md`](../../../packages/plugin-codex/README.md) lines 329–331 — the byte-locked cost paragraph.

---

## 2. Scope

### In scope

A benchmark harness that measures latency, token/cost proxies, and verdict characteristics of cc-plugin-codex flows against a small fixed task corpus, producing machine-readable results that can be re-run before and after the 2026-06-15 Anthropic Agent SDK credit cutover.

1. Harness CLI (`tools/bench/run.mjs`) with dry-run mode and configurable flow/task/run-count selection.
2. Task corpus: 3–5 deterministic, short tasks executed in a throwaway repo fixture.
3. Flow runners for: `delegate` (single-turn), `delegate + followup` (multi-turn), `delegate + same-session review`, `delegate + adversarial review`.
4. Optional baseline runner for `claude -p` (opt-in via `--include-baseline-p` flag; out-of-process, not integrated into the plugin).
5. Result aggregator producing `artifacts/bench-<date>-<runId>/results.json` and `artifacts/bench-<date>-<runId>/summary.md`.
6. Pre-cutover run (by 2026-06-14) and post-cutover run (on or after 2026-06-16).
7. Stage 5 report with README cost paragraph decision (update or retain byte-identical).

### Out of scope (deferred to later plans)

- Stop-time review gate via hooks (Plan 0005).
- Marketplace packaging (Plan 0006).
- Continuous benchmarking / CI-integrated performance regression gates.
- Statistical modeling beyond descriptive statistics (median, IQR, raw points).
- Automated billing-bucket detection (requires Anthropic API surface that may not exist).
- Production code changes to the plugin based on benchmark results (changes, if any, belong in a follow-up plan informed by the data).
- Windows benchmarking (macOS + Linux only, consistent with CI matrix).

### Follow-ups identified

- If measurement reveals the cost paragraph should change, the specific wording update belongs in a Plan 0004-adjacent PR gated by Stage 5 approval.
- If billing-bucket observation requires Anthropic policy clarification, the plan documents the gap and the Stage 5 report explains why the data is incomplete.
- If per-token data is unavailable from any source, Stage 5 documents "honest non-measurement" and the README paragraph stays byte-identical.

---

## 3. Approach

### 3.1 Harness location and language

**Decision**: `tools/bench/` directory at the repo root, using Node `node:test` runner + ESM (`.mjs`), consistent with the rest of the repo's test infrastructure.

**Rationale**: the repo already uses `node:test` for all four test lanes; `tools/mock-claude/` is the precedent for tooling living under `tools/`. A separate top-level directory keeps benchmark code out of production packages and avoids polluting `packages/*/` with measurement-only code. Dependencies are limited to `node:test`, `node:fs`, `node:child_process`, `node:perf_hooks`, `node:crypto` — no new third-party deps.

### 3.2 Flows measured

**Decision**: measure four plugin flows plus an optional out-of-process baseline.

| Flow ID | Description | Execution model |
|---|---|---|
| `delegate` | Single `$claude-delegate` invocation | Plan 0001 fresh `--bg` session |
| `delegate-followup` | `$claude-delegate` then `$claude-followup` | Plan 0002 PTY-attach same-session |
| `delegate-review` | `$claude-delegate` then `$claude-review` | Plan 0003 same-session review |
| `delegate-adversarial` | `$claude-delegate` then `$claude-adversarial-review` | Plan 0003 fresh-session review |
| `baseline-p` (opt-in) | `claude -p "<task>"` | Out-of-process; not plugin code |

**Rationale**: these four flows correspond exactly to the plugin capabilities shipped in Plans 0001–0003. The `baseline-p` flow is the only sensible comparison anchor for billing/latency since it exercises a different Claude Code execution mode; it is opt-in because the plugin explicitly does not use `claude -p` and it requires separate invocation outside the plugin dispatcher.

### 3.3 Task corpus design

**Decision**: 3 tasks, each designed to be SHORT (target completion under 30s) and DETERMINISTIC (same repo fixture, same instructions, minimal variance in Claude's response length).

Candidate tasks (maintainer picks final set from these or substitutes):

1. **`summarize-todos`** — "List all TODO comments in this repo, grouped by file. Do not edit any files." Expected: short list output, no file edits, deterministic structure.
2. **`rename-variable`** — "Rename the variable `oldName` to `newName` in `src/app.js`. Do not touch other files." Expected: single-file edit, minimal reasoning, fast.
3. **`answer-question`** — "How many test files exist in this repo? List them by name." Expected: short factual answer, no edits, fast.

These tasks exercise: read-only inspection (1, 3), single-file edit (2), and factual answer retrieval (3). The follow-up/review flows layer on top of whichever base task the cell uses.

### 3.4 Measurement methodology

**Decision**: N=5 runs per (flow x task) cell. Report median + IQR + all raw data points.

**Rationale**: N=5 is the minimum for a defensible IQR while keeping total API cost manageable (5 runs x 4 flows x 3 tasks = 60 total invocations per measurement session). Statistical rigor beyond descriptive statistics is out of scope — the harness reports observed values and flags caveats (time-of-day variance, Anthropic API load, model version drift).

### 3.5 Metrics captured

| Metric | Source | Reliability |
|---|---|---|
| Wall-clock latency per turn | `node:perf_hooks` `performance.now()` around each dispatcher invocation | High (local measurement) |
| Total wall-clock per flow | Sum of turn latencies + inter-turn overhead | High |
| Sidecar `tempo` transitions | Read `~/.claude/jobs/<shortId>/state.json` between turns | Best-effort (undocumented schema) |
| Token counts (if exposed) | Parse `~/.claude/projects/<cwd>/<sessionId>.jsonl` for `usage` fields; check `claude --usage` surface | Research-dependent (OQ-B) |
| Per-task cost proxy | Token counts x model pricing if available; otherwise "not measurable" | Research-dependent (OQ-B) |
| Number of API round trips | Count `tempo` transitions or event-log entries | Best-effort |
| Review verdict agreement | Compare `$claude-review` vs `$claude-adversarial-review` verdicts on same base output | Deterministic (from structured output) |
| Claude Code version | `claude --version` at run start | High |
| Billing bucket observation | Manual Anthropic console screenshot pre/post run (OQ-I) | Manual; not automated |

### 3.6 Fixture and isolation

- Throwaway repo fixture created at `/tmp/cc-plugin-codex-plan0004-bench-XXXX/` (similar to Plans 0002/0003 E2E fixtures).
- Isolated `CC_PLUGIN_CODEX_HOME` per run under the same temp dir.
- Fixture contains: `README.md` with 3 TODO markers, `src/app.js` with `oldName` variable, `test/` directory with 2 test files. Deterministic, committed as `tools/bench/fixtures/`.
- Each run gets a fresh copy of the fixture (no cross-contamination between runs).

### 3.7 Output schema

Results written to `artifacts/bench-<YYYYMMDD>-<runId>/results.json` with a versioned schema (version `1`). The schema version field enables future plans to append historical data without breaking consumers.

```json
{
  "schemaVersion": 1,
  "runId": "abc123",
  "date": "2026-06-14",
  "claudeCodeVersion": "2.1.150",
  "nodeVersion": "v25.8.2",
  "platform": "darwin",
  "runsPerCell": 5,
  "tasks": ["summarize-todos", "rename-variable", "answer-question"],
  "flows": ["delegate", "delegate-followup", "delegate-review", "delegate-adversarial"],
  "cells": [
    {
      "flow": "delegate",
      "task": "summarize-todos",
      "runs": [
        {
          "runIndex": 0,
          "wallClockMs": 12345,
          "turnsWallClockMs": [12345],
          "tempoTransitions": 4,
          "tokenCounts": null,
          "reviewVerdict": null,
          "error": null
        }
      ]
    }
  ],
  "metadata": {
    "cutoverPhase": "pre",
    "billingBucketObservation": null,
    "caveats": ["token counts unavailable from any automated source"]
  }
}
```

### 3.8 Harness CLI interface

```
node tools/bench/run.mjs [options]

Options:
  --dry-run              Print what would be executed without running
  --flows <list>         Comma-separated flow IDs (default: all four)
  --tasks <list>         Comma-separated task IDs (default: all three)
  --runs <N>             Runs per cell (default: 5)
  --include-baseline-p   Include claude -p baseline flow
  --output-dir <path>    Override output directory (default: artifacts/bench-<date>-<runId>/)
  --cutover-phase <pre|post>  Label for billing context
  --help                 Print usage
```

### 3.9 README cost paragraph decision criteria

**Decision**: Stage 5 updates the byte-locked cost paragraph ONLY when ALL of the following hold:

1. Pre-cutover and post-cutover measurement artifacts both exist.
2. The data contradicts the current "not benchmarked yet" framing in a defensible way (i.e., we now HAVE benchmarked it and can state measured facts).
3. The replacement text contains no OQ4-forbidden tokens.
4. The replacement text states only measured observations, not comparative claims (no "cheaper than X", no "saves Y%").

If any condition fails, the paragraph stays byte-identical and Stage 5 explains why.

---

## 4. Tasks (with acceptance criteria)

### T1. Research: cost-data sources and harness primitives

**Goal**: enumerate all available data sources for token counts and cost proxies from Claude Code CLI surfaces. Determine which are documented, which are best-effort, and which do not exist.

**Deliverable**: research note section in `2-implement.md` (or standalone `documentation/research/20260603-plan-0004-research/` if the findings warrant a separate artifact).

**Acceptance criteria**:
- [ ] Enumeration of at least these candidate sources: (i) `claude --usage` or equivalent CLI surface, (ii) sidecar `output.usage` field in `~/.claude/jobs/<shortId>/state.json`, (iii) transcript `events.jsonl` usage fields, (iv) `~/.claude/projects/<cwd>/<sessionId>.jsonl` usage entries, (v) Anthropic console dashboard (manual).
- [ ] For each source: documented (yes/no), tested against Claude Code 2.1.150 (yes/no), schema shape if available.
- [ ] Clear conclusion: which source is primary, which is fallback, which does not exist.
- [ ] If no automated per-request token count source exists, document "honest non-measurement" semantics for the harness.

### T2. Harness CLI skeleton + dry-run mode

**Goal**: implement the harness entry point with argument parsing, flow/task registry, and dry-run mode that prints the execution plan without invoking Claude.

**Deliverable**: `tools/bench/run.mjs` + `tools/bench/lib/cli.mjs` + `tools/bench/lib/flows.mjs` + `tools/bench/lib/tasks.mjs`.

**Acceptance criteria**:
- [ ] `node tools/bench/run.mjs --dry-run` exits 0 and prints a table of (flow x task x N) cells to be executed.
- [ ] `node tools/bench/run.mjs --help` prints usage matching the interface in § 3.8.
- [ ] `node tools/bench/run.mjs --dry-run --flows delegate --tasks summarize-todos --runs 3` prints exactly 3 cells.
- [ ] `node tools/bench/run.mjs --dry-run --include-baseline-p` includes the `baseline-p` flow in output.
- [ ] No third-party dependencies; only `node:*` built-in modules.

### T3. Task-corpus fixture

**Goal**: create the throwaway repo fixture that all benchmark runs use.

**Deliverable**: `tools/bench/fixtures/` directory containing the repo template; `tools/bench/lib/fixture.mjs` helper that copies the fixture to a fresh temp dir per run.

**Acceptance criteria**:
- [ ] `tools/bench/fixtures/README.md` exists with 3 TODO markers.
- [ ] `tools/bench/fixtures/src/app.js` exists with an `oldName` variable suitable for the rename task.
- [ ] `tools/bench/fixtures/test/` directory contains 2 test file stubs.
- [ ] `fixture.mjs` exports `createFixture(): Promise<{ root: string; cleanup: () => void }>` that creates an isolated copy under `/tmp/cc-plugin-codex-plan0004-bench-XXXX/`.
- [ ] Running `createFixture()` twice produces two independent directories (no shared state).
- [ ] `git init` is run inside the fixture so Claude Code treats it as a repo.

### T4. Flow runner: `delegate`

**Goal**: implement the runner for the single-turn `$claude-delegate` flow.

**Deliverable**: `tools/bench/lib/runners/delegate.mjs`.

**Acceptance criteria**:
- [ ] Exports `runDelegate(task, fixtureRoot, env): Promise<RunResult>`.
- [ ] Spawns `node <plugin-root>/scripts/claude-companion.mjs delegate --yes -- "<task prompt>"` with isolated `CC_PLUGIN_CODEX_HOME`.
- [ ] Measures wall-clock latency via `performance.now()`.
- [ ] Polls `status --json` until terminal state (reuses the plugin's own status surface).
- [ ] Captures `result --json` output.
- [ ] Returns `RunResult` with `wallClockMs`, `tempoTransitions` (if sidecar available), `tokenCounts` (if available per T1 research), `error` (null on success).
- [ ] Respects a 10-minute per-run timeout; marks timed-out runs as `error: 'timeout'`.

### T5. Flow runner: `delegate-followup`

**Goal**: implement the runner for the delegate + follow-up two-turn flow.

**Deliverable**: `tools/bench/lib/runners/delegate-followup.mjs`.

**Acceptance criteria**:
- [ ] Exports `runDelegateFollowup(task, fixtureRoot, env): Promise<RunResult>`.
- [ ] Delegates the base task, waits for `awaiting_followup`, then sends a follow-up prompt ("Now confirm how many files you inspected.").
- [ ] Measures wall-clock latency for each turn separately and total.
- [ ] Returns `RunResult` with per-turn breakdown in `turnsWallClockMs[]`.
- [ ] Handles the case where the job completes before follow-up is possible (TTL expired) by marking as `error: 'ttl_expired'`.

### T6. Flow runner: `delegate-review`

**Goal**: implement the runner for the delegate + same-session review flow.

**Deliverable**: `tools/bench/lib/runners/delegate-review.mjs`.

**Acceptance criteria**:
- [ ] Exports `runDelegateReview(task, fixtureRoot, env): Promise<RunResult>`.
- [ ] Delegates the base task, waits for `awaiting_followup`, then sends `$claude-review`.
- [ ] Measures wall-clock latency for delegation turn and review turn separately.
- [ ] Captures review verdict and findings count in `RunResult`.
- [ ] Returns `reviewVerdict` field (`pass | fail | pass_with_findings`).

### T7. Flow runner: `delegate-adversarial`

**Goal**: implement the runner for the delegate + adversarial review flow.

**Deliverable**: `tools/bench/lib/runners/delegate-adversarial.mjs`.

**Acceptance criteria**:
- [ ] Exports `runDelegateAdversarial(task, fixtureRoot, env): Promise<RunResult>`.
- [ ] Delegates the base task, waits for terminal state with result, then runs `$claude-adversarial-review --json`.
- [ ] Measures wall-clock latency for delegation and adversarial review separately.
- [ ] Captures review verdict, findings count, and findings severities.
- [ ] Returns `reviewVerdict` field.
- [ ] Respects the 30-minute adversarial review timeout (DD-1 from Plan 0003); marks timeout as `error: 'review_timeout'`.

### T8. Flow runner: `baseline-p` (optional)

**Goal**: implement the opt-in `claude -p` baseline runner.

**Deliverable**: `tools/bench/lib/runners/baseline-p.mjs`.

**Acceptance criteria**:
- [ ] Exports `runBaselineP(task, fixtureRoot, env): Promise<RunResult>`.
- [ ] Spawns `claude -p "<task prompt>"` directly (NOT through the plugin dispatcher).
- [ ] Measures wall-clock latency.
- [ ] Captures stdout as the result.
- [ ] Only invoked when `--include-baseline-p` flag is passed to the harness CLI.
- [ ] Clear comment in source: "This runner exercises claude -p which the plugin explicitly does NOT use. It exists solely as a billing/latency comparison anchor."

### T9. Result aggregator + summary writer

**Goal**: aggregate per-run results into the output schema (§ 3.7) and produce a human-readable summary.

**Deliverable**: `tools/bench/lib/aggregator.mjs` + `tools/bench/lib/summary.mjs`.

**Acceptance criteria**:
- [ ] `aggregator.mjs` exports `aggregate(cells[]): ResultsJson` producing the schema from § 3.7.
- [ ] `summary.mjs` exports `writeSummary(results, outputDir): void` producing `summary.md` with: per-flow median latency table, per-task breakdown, review verdict agreement matrix, caveats section.
- [ ] `results.json` is valid JSON parseable by `JSON.parse()`.
- [ ] `summary.md` contains no OQ4-forbidden tokens (the summary reports numbers without comparative claims).
- [ ] Output directory created at `artifacts/bench-<YYYYMMDD>-<runId>/` (or `--output-dir` override).

### T10. Pre-cutover benchmark run

**Goal**: execute the harness against real Claude Code before the 2026-06-15 cutover.

**Deliverable**: `artifacts/bench-<date>-<runId>/` directory containing `results.json` and `summary.md`.

**Acceptance criteria**:
- [ ] Run date is on or before 2026-06-14.
- [ ] `results.json` contains `"cutoverPhase": "pre"`.
- [ ] All four plugin flows have at least one successful run per task (partial failures are acceptable if documented).
- [ ] `metadata.claudeCodeVersion` records the exact Claude Code version used.
- [ ] `metadata.caveats` lists any metrics that could not be captured (e.g., "token counts unavailable").
- [ ] Billing-bucket observation: either a screenshot artifact or explicit "not observable" documentation.

### T11. Post-cutover benchmark run

**Goal**: execute the harness against real Claude Code after the 2026-06-15 cutover.

**Deliverable**: `artifacts/bench-<date>-<runId>/` directory containing `results.json` and `summary.md`.

**Acceptance criteria**:
- [ ] Run date is on or after 2026-06-16.
- [ ] `results.json` contains `"cutoverPhase": "post"`.
- [ ] All four plugin flows have at least one successful run per task.
- [ ] `metadata.claudeCodeVersion` records the exact Claude Code version used.
- [ ] Billing-bucket observation documented (comparison with pre-cutover observation).
- [ ] If the cutover date slips, this task is re-scheduled and the delay documented in `2-implement.md`.

### T12. README cost paragraph decision

**Goal**: based on T10 and T11 data, decide whether to update the byte-locked cost paragraph.

**Deliverable**: decision documented in Stage 5 report; if updating, the new paragraph text committed with the Stage 5 close.

**Acceptance criteria**:
- [ ] Stage 5 report contains explicit decision: "update" or "retain byte-identical" with rationale.
- [ ] If updating: new text contains no OQ4-forbidden tokens; existing `readme.test.mjs` forbidden-token scan passes.
- [ ] If retaining: report explains which of the four criteria in § 3.9 failed (no data, data does not contradict current framing, etc.).
- [ ] Either way, `packages/plugin-codex/test/readme.test.mjs` passes after the decision is applied.

---

## 5. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Anthropic does not expose machine-readable per-request token counts from any automated source | H | H | T1 research enumerates all sources; if none exist, harness reports "honest non-measurement" for token/cost metrics and focuses on latency + verdict characteristics. README paragraph stays byte-identical. |
| R2 | Claude Code TUI version drift breaks attach/probe between T10 and T11 (Plan 0003 T12a/T12b proved this) | M | H | Record Claude Code version in every run's metadata; pin to the same minor version across pre/post if possible; document version changes in caveats. |
| R3 | Anthropic plan dashboard not scriptable; billing-bucket observation requires manual screenshot | H | M | Document the manual procedure in T10/T11 acceptance criteria; gate Stage 5 on having the observation artifact (screenshot or explicit "not observable" documentation). |
| R4 | Benchmark runs hit Anthropic API rate limits during normal load | M | M | Harness includes configurable inter-run delay (default 10s); partial failures are marked per-run, not per-session; retry logic with exponential backoff for transient errors. |
| R5 | Cost paragraph rewrite mistakenly violates OQ4 forbidden-token list | L | H | Existing `readme.test.mjs` enforces forbidden tokens; Stage 4 polish gate runs the same scan; T12 acceptance criteria explicitly requires the test to pass. |
| R6 | Per-task variance dominates flow differences (review signal smaller than run-to-run noise) | M | M | N=5 runs per cell; report IQR alongside median; if IQR > median for any metric, flag in caveats; consider increasing N in a follow-up. |
| R7 | 2026-06-15 cutover date slips | M | L | T11 is re-scheduled; delay documented; harness is reusable at any time. Stage 5 is gated on having both pre and post artifacts but not on the specific date. |
| R8 | Harness spawns real Claude sessions that become orphans on crash/timeout | M | M | Each runner calls `$claude-stop` in a `finally` block; fixture cleanup removes temp dirs; harness traps SIGINT/SIGTERM for graceful shutdown. |
| R9 | `baseline-p` comparison creates misleading narrative that `--bg` is "better" or "worse" | L | M | Baseline is opt-in only; summary.md explicitly notes `claude -p` is a different execution model, not a direct substitute; no comparative claims in output prose. |

---

## 6. Open questions

### OQ-A — Scope of comparison flows -- resolved

**Statement**: which flows should the harness measure? At minimum `delegate`. Beyond that: `delegate + followup`, `delegate + same-session review`, `delegate + adversarial review`. Should `claude -p` be included as a baseline?

**Options**:
1. All four plugin flows only (no `claude -p`).
2. All four plugin flows + `claude -p` as mandatory baseline.
3. All four plugin flows + `claude -p` as opt-in via `--include-baseline-p` flag.

**Planner recommendation**: Option 3. The plugin explicitly does not use `claude -p` (Plan 0001 locked constraint). Including it as opt-in preserves the architectural stance while allowing informational comparison when the maintainer wants it. Making it mandatory would imply `claude -p` is the natural comparison point, which overstates its relevance.

**Gate**: resolution required before T8 implementation. If excluded entirely, T8 is dropped.

**Resolution (2026-06-03)**: Option 3 accepted. T8 (`baseline-p` runner) is included as opt-in via `--include-baseline-p`; off by default. Architecturally `claude -p` is still not used in any production plugin code path; T8 lives only in the benchmark harness as an out-of-process comparison.

### OQ-B — Cost-data source -- resolved

**Statement**: where does per-request cost/token data come from? The harness needs a primary source and a fallback.

**Options**:
1. Parse `~/.claude/projects/<cwd>/<sessionId>.jsonl` for `usage` fields (if they exist in the real transcript schema).
2. Parse sidecar `output.usage` field in `~/.claude/jobs/<shortId>/state.json` (if it exists).
3. Run `claude --usage` or equivalent CLI surface (if it exists — needs T1 research).
4. External accounting: Anthropic console dashboard, manually checked before/after each run.
5. Define "honest non-measurement" — report that token/cost data is not available from any automated source; focus on latency and verdict metrics only.

**Planner recommendation**: T1 research determines the answer. The planner expects Option 5 (honest non-measurement) is the most likely outcome given that no automated per-request token surface has been documented in prior plan research. If T1 discovers a viable automated source, it becomes the primary. Anthropic console (Option 4) is the fallback for billing-bucket observation only (OQ-I), not per-request tokens.

**Gate**: resolution required before T4–T8 implementation (the runners need to know what to capture).

**Resolution (2026-06-03)**: Planner default accepted. T1 research determines the primary source; if T1 finds an automated per-request token surface (sidecar `output.usage`, transcript `events.jsonl`, `claude --usage`), it becomes primary. If T1 finds nothing, harness runs in Option 5 "honest non-measurement" mode for tokens/cost and reports latency + verdict only. Anthropic console (Option 4) is reserved for OQ-I billing-bucket observation only.

### OQ-C — Task corpus -- resolved

**Statement**: what specific tasks should the corpus contain? How many?

**Options**:
1. 3 tasks: `summarize-todos`, `rename-variable`, `answer-question` (proposed in § 3.3).
2. 5 tasks: add `lint-check` ("Run the linter and report errors") and `explain-function` ("Explain what `processData` does in `src/app.js`").
3. Maintainer-defined custom set.

**Planner recommendation**: Option 1 (3 tasks). Keeps total invocations at 60 per measurement session (5 runs x 4 flows x 3 tasks). Each task exercises a distinct interaction pattern (read-only listing, single-file edit, factual question). Adding more tasks increases cost linearly without proportional signal gain for the initial measurement.

**Gate**: resolution required before T3 (fixture design depends on task definitions).

**Resolution (2026-06-03)**: Option 1 accepted. The corpus contains exactly three tasks: `summarize-todos`, `rename-variable`, `answer-question` (defined in § 3.3). Total invocations per measurement session: 60 (5 runs × 4 flows × 3 tasks), plus +5 if `--include-baseline-p` is set (T8 only runs the `summarize-todos` task per OQ-A scope).

### OQ-D — Statistical methodology -- resolved

**Statement**: how many runs per cell? How to report results?

**Options**:
1. N=3, report mean +/- stddev.
2. N=5, report median + IQR + all raw points.
3. N=10, report median + IQR + confidence intervals.

**Planner recommendation**: Option 2. N=5 is the minimum for a defensible IQR (quartile calculation requires >= 4 data points). Mean is inappropriate for latency distributions which are typically right-skewed. Raw points are always included in `results.json` for downstream re-analysis. N=10 is more rigorous but doubles cost; appropriate for a follow-up if initial measurement shows high variance. Time-of-day and Anthropic API load are NOT controlled (flagged as a caveat, not a blocking requirement).

**Gate**: resolution required before T2 (CLI defaults) and T9 (aggregator logic).

**Resolution (2026-06-03)**: Option 2 accepted. Default N=5 runs per (flow × task) cell. Aggregator reports median + IQR + raw points. Raw points always retained in `results.json` for downstream re-analysis. Time-of-day and Anthropic API load are flagged as caveats in summary.md, not controlled.

### OQ-E — Cutover-spanning measurement schedule -- resolved

**Statement**: should Stage 5 be gated on having BOTH pre-cutover (by 2026-06-14) and post-cutover (on or after 2026-06-16) measurement artifacts?

**Options**:
1. Gate Stage 5 on both artifacts existing.
2. Allow Stage 5 to close with only pre-cutover data if the cutover slips significantly (> 2 weeks).
3. No gate; Stage 5 reports whatever data exists.

**Planner recommendation**: Option 1 with a time-bound escape: gate Stage 5 on both artifacts UNLESS the cutover slips by more than 30 days, in which case Stage 5 may close with pre-cutover data only and a documented "post-cutover deferred" rationale. The 30-day bound prevents the plan from being indefinitely blocked by an external event.

**Gate**: resolution required before T10/T11 scheduling.

**Resolution (2026-06-03)**: Planner default accepted. Stage 5 is gated on both pre-cutover (≤ 2026-06-14) and post-cutover (≥ 2026-06-16) measurement artifacts UNLESS the cutover slips by > 30 days from 2026-06-15. If slipping triggers the escape, Stage 5 may close with pre-cutover data only and a documented "post-cutover deferred" rationale referring to a follow-up plan.

### OQ-F — Harness language + location -- resolved

**Statement**: should the harness use Node ESM (consistent with repo) and live under `tools/bench/`?

**Options**:
1. `tools/bench/` with Node ESM (`.mjs` files, `node:test` for any self-tests).
2. `scripts/bench/` with Node ESM.
3. `packages/bench/` as a workspace package.

**Planner recommendation**: Option 1. `tools/` is the established location for non-production tooling (`tools/mock-claude/`, `tools/mock-codex/`). A workspace package (Option 3) would imply production-grade lifecycle (versioning, publishing) inappropriate for a measurement tool. `scripts/` (Option 2) has no precedent in this repo.

**Gate**: resolution required before T2 (file paths).

**Resolution (2026-06-03)**: Planner default accepted. Harness lives under `tools/bench/` with Node ESM (`.mjs` files). Self-tests use `node:test`. No new top-level workspace package; no new production dependency on the harness.

### OQ-G — Output schema versioning -- resolved

**Statement**: should the JSON results schema include a version field for forward compatibility?

**Options**:
1. Yes, `"schemaVersion": 1` in every `results.json`; future plans bump the version when the schema changes.
2. No versioning; treat each measurement as a standalone artifact.

**Planner recommendation**: Option 1. The explicit version field costs nothing (one integer field) and enables future plans to load historical results without guessing the schema. Plan 0003's `schemaVersion: 2` precedent for `JobRecord` validates this pattern in the repo.

**Gate**: resolution required before T9 (aggregator writes the schema).

**Resolution (2026-06-03)**: Planner default accepted. Every `results.json` includes `"schemaVersion": 1`. Future plans bump the version field when the schema changes incompatibly.

### OQ-H — README cost paragraph rewrite trigger -- resolved

**Statement**: under what conditions does Stage 5 update the byte-locked cost paragraph?

**Options**:
1. Update only when measurement contradicts the "not benchmarked yet" framing (i.e., we now HAVE benchmarked and can state measured facts with appropriate caveats).
2. Update regardless — replace with measured data even if it merely confirms the current framing.
3. Never update in Plan 0004; defer to Plan 0004.5 for the copy change.

**Planner recommendation**: Option 1 (§ 3.9 criteria). The paragraph says "Cost savings have not been benchmarked yet." If Plan 0004 produces benchmark data, that statement becomes false and should be updated to reflect what was measured. However, the replacement must still avoid forbidden tokens and comparative claims. If the data is incomplete (e.g., token counts unavailable), the paragraph stays byte-identical because we still cannot make a defensible claim.

**Gate**: resolution required before T12 (the decision task itself).

**Resolution (2026-06-03)**: Planner default accepted. The byte-locked cost paragraph in README is updated in T12 ONLY if Plan 0004 measurement contradicts the "not benchmarked yet" framing in a defensible way (i.e., we now have measured data and can state observed facts with caveats). Replacement must still pass the OQ4 forbidden-token + forbidden-pattern scans. If T1's research outcome leaves token/cost data unavailable, the paragraph stays byte-identical and T12 documents why.

### OQ-I — Billing-bucket observation methodology -- resolved

**Statement**: how should the harness observe `claude --bg`'s billing bucket under the 2026-06-15 Agent SDK credit policy?

**Options**:
1. Record Anthropic console screenshot before + after each measurement session; compare Agent SDK credit line item.
2. Compare Anthropic Plan dashboard "Agent SDK monthly credit" consumption delta across one representative run.
3. Document as "this harness cannot determine billing bucket; policy clarification required from Anthropic" and gate Stage 5 on having at least attempted the observation.

**Planner recommendation**: Option 2 as the primary attempt (cheapest: run one representative cell, note the credit delta). Option 3 as the fallback if the dashboard does not break out `--bg` separately from other Agent SDK usage. The harness itself does NOT attempt to programmatically determine billing bucket — this is a manual observation task performed by the maintainer during T10 and T11.

**Gate**: resolution required before T10 (the maintainer needs to know what to observe during the pre-cutover run).

**Resolution (2026-06-03)**: Option 2 accepted as primary. Maintainer runs one representative cell (`delegate` flow, `summarize-todos` task, single iteration) during T10 and T11, and notes Agent SDK monthly credit consumption delta on the Anthropic Plan dashboard before/after each run. Falls back to Option 3 (document the gap; gate Stage 5 on attempt, not observation) if the dashboard does not break out `--bg` separately from other Agent SDK usage. The harness does NOT programmatically determine billing bucket; this is a manual observation step recorded in `artifacts/bench-<date>/observation.md`.

### OQ-J — Definition of done -- resolved

**Statement**: what measurable outcome closes Plan 0004?

**Options**:
1. (a) harness binary lands under `tools/bench/`; (b) pre- and post-cutover artifact pair exists in `artifacts/`; (c) Stage 5 report contains observed metrics with appropriate caveats; (d) README cost paragraph either updated or explicitly retained byte-identical with rationale.
2. Same as Option 1 but without requiring the post-cutover artifact (allow closing with pre-cutover only if cutover slips).

**Planner recommendation**: Option 1 with the same 30-day escape hatch as OQ-E. All four conditions must hold for Plan 0004 to be `complete` unless the cutover slips by > 30 days.

**Gate**: resolution confirms the definition of done before implementation begins.

**Resolution (2026-06-03)**: Option 1 accepted with the 30-day escape hatch from OQ-E. Plan 0004 is `complete` when all four conditions hold: (a) harness binary at `tools/bench/run.mjs`; (b) pre- and post-cutover artifact pair under `artifacts/`; (c) Stage 5 report with observed metrics + appropriate caveats; (d) README cost paragraph either updated per OQ-H or retained byte-identical with rationale. Escape hatch: if 2026-06-15 cutover slips by > 30 days, condition (b) relaxes to pre-cutover only with documented "post-cutover deferred" rationale.

---

## 7. Definition of done

Plan 0004 is ready to transition `implementing` -> `auditing` when:

- All 12 tasks have their acceptance criteria demonstrably met.
- `tools/bench/run.mjs --dry-run` exits 0 with the expected output.
- Pre-cutover artifact `artifacts/bench-<date>-<runId>/results.json` exists with `cutoverPhase: "pre"`.
- `2-implement.md` is filled in with per-task implementation notes.

Plan 0004 is ready to transition `auditing` -> `polishing` when:

- Stage 3 audit verdict is `ready-for-polish` (or better).
- No blocker or high-severity audit findings remain open.

Plan 0004 is ready to transition `polishing` -> `reporting` when:

- Post-cutover artifact `artifacts/bench-<date>-<runId>/results.json` exists with `cutoverPhase: "post"` (unless 30-day escape per OQ-E).
- README cost paragraph decision (T12) is documented with rationale.
- All OQ4 forbidden-token scans pass.

Plan 0004 is `complete` when all five stages have substantive content and the readme status reads `complete`.

---

## 8. Things explicitly NOT in this plan

These belong in later plans. Listing them here so they do not get smuggled into Plan 0004:

- Stop-time review gate via hooks (Plan 0005).
- Marketplace packaging (Plan 0006).
- Continuous benchmarking CI integration (a future plan if the harness proves valuable).
- Statistical modeling beyond descriptive statistics (future plan if variance warrants it).
- Production code changes to the plugin based on measurement results (follow-up plan).
- Automated billing-bucket detection via API (no such API surface exists).
- New runtime dependencies in `packages/runtime/` or `packages/driver-claude-code/`.
- Any change to the plugin's execution model (the harness MEASURES existing flows; it does not ALTER them).
- `watch()` AsyncIterable streaming (deferred per Plan 0002 OQ-F).
- Windows benchmarking (macOS + Linux only).
- Telemetry.
- Wrapping `claude ultrareview` (Plan 0003 explicitly excluded this).
