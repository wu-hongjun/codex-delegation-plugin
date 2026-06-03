# Stage 2 — Implementation: Benchmark harness for cc-plugin-codex

> **Status**: in progress
> **Started**: 2026-06-03
> **Last updated**: 2026-06-03

This log records each T-task's implementation, subagent findings, orchestrator follow-ups, deviations from [`1-plan.md`](1-plan.md), and acceptance evidence. Each T-task lands in one commit; a follow-up `Plan 0004 T<N> log: record CI success` commit records the matrix CI run after green.

Task acceptance is measured against [`1-plan.md`](1-plan.md) § 4 (approved 2026-06-03 at commit `502e542`).

---

## T1 — Research: cost-data sources

**Status**: complete
**Date**: 2026-06-03

### Methodology

Inspected Claude Code 2.1.150 CLI help surfaces (`claude --help`, `claude usage --help`) for any cost/token flags. Read 26 real `state.json` files from `~/.claude/jobs/<shortId>/` and compared their schema against what `sidecar.ts` currently parses. Read two full session JSONL transcripts from `~/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/` (659 lines and 451 lines respectively) and scanned all lines for `usage`, `token`, `cache`, and `cost` fields. Cross-referenced findings against the prior research report (`documentation/research/20260530-initial-research/report.md`) and the existing type definitions in `packages/runtime/src/types.ts`.

### Sources evaluated

| Source | Documented? | Tested against 2.1.150? | Per-request tokens? | Notes |
|---|---|---|---|---|
| `claude --usage` CLI | no | yes | no | No `usage` subcommand exists; `claude --help` grep for "usage/token/cost" returns only "Usage: claude..." header and `setup-token` subcommand name; no cost/token flags present |
| Sidecar `state.json` `output.usage` | no | yes | no | All 26 job `state.json` files checked; schema is `{state, detail, tempo, output: null, children, linkScanOffset, template, respawnFlags, providerEnv, intent, sessionId, resumeSessionId, daemonShort, cwd, createdAt, updatedAt, firstTerminalAt, backend}`; `output` field is `null` on completed jobs; no `usage` subobject; `sidecar.ts` does not parse one either |
| Transcript `events.jsonl` `usage` field | yes (undocumented but present) | yes | **yes** | `~/.claude/projects/<cwd>/<sessionId>.jsonl` assistant entries carry `message.usage` with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, per-request; 117/659 lines in one session had usage; schema confirmed below |
| `~/.claude/projects/<cwd>/<sessionId>.jsonl` usage entries | yes (same file as above) | yes | **yes** | Same source as transcript row above; confirmed in two separate session files; field path is `obj.message.usage` on lines where `obj.type === "assistant"` |
| Anthropic console dashboard (manual) | yes | yes (manual) | yes (manual) | OQ-I scope; billing-bucket observation only; not per-request; not automatable |

### Conclusion

**Primary source**: `~/.claude/projects/<cwd>/<sessionId>.jsonl` — `obj.message.usage` on assistant-type entries. This is a per-request token record embedded in the same JSONL transcript the harness already reads for result extraction. The file path is available via `ClaudeSessionContext.transcriptPath` in `JobRecord`.

**Fallback source**: None. No other automated per-request token surface exists. The sidecar `state.json` has no usage field. The CLI has no `--usage` flag or `usage` subcommand.

**What the harness CAN measure automatically**:
- Wall-clock latency (job `createdAt` → turn `endedAt`)
- Sidecar `tempo` transitions (`idle` → `working` → `idle/done`)
- Review verdicts (pass / fail / pass_with_findings from transcript final message)
- Per-request token counts: `input_tokens`, `output_tokens` (from transcript `message.usage`)
- Per-request cache metrics: `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `cache_creation.ephemeral_5m_input_tokens` (from transcript `message.usage`)
- Session-aggregate token totals (sum over all assistant entries in transcript)
- `service_tier` and `speed` fields per request (from transcript `message.usage`)
- `server_tool_use.web_search_requests` and `web_fetch_requests` per request (from transcript `message.usage`)

**What the harness CANNOT measure automatically**:
- Dollar cost: no cost field exists in `message.usage`; cost must be computed externally by applying Anthropic pricing to token counts (not stable — pricing changes are not reflected in the transcript)
- Subscription usage-bar impact: Pro/Max plan usage bars are approximate and not machine-readable from any local file
- Agent SDK credit vs interactive credit split: not exposed in transcript schema

**"Honest non-measurement" semantics (OQ-B fallback if transcript parsing is not implemented in T4–T7)**:
If a runner cannot locate or parse the transcript before its deadline, it reports `tokenCounts: null` for that run and adds an entry to `metadata.caveats`: `"token counts unavailable for run <id>: transcript not found or parse failed"`. The summary.md says "token counts: partial — see individual run records; for billing-bucket totals use Anthropic Plan dashboard (OQ-I)".

### OQ-B resolution update

The planner's expected "honest non-measurement" outcome (Option 5) is **superseded**. T1 found a viable automated source: the session JSONL transcript at `~/.claude/projects/<cwd>/<sessionId>.jsonl` contains `message.usage` on every assistant entry with full per-request token counts including cache breakdown. This becomes the **primary source** (Option 1 from the OQ-B options list).

The harness should parse the transcript after each run, sum `input_tokens` + `output_tokens` across all assistant entries for session-aggregate totals, and record individual per-request usage objects for cache-effectiveness analysis (the benchmark's core OQ-A question). Option 5 "honest non-measurement" is demoted to the fallback for runs where transcript parsing fails.

**T4–T7 implementers must know**: the transcript `transcriptPath` field is already stored in `ClaudeSessionContext` (see `packages/runtime/src/types.ts` line 58). The runner should tail/read that file after the job completes and extract all lines where `type === "assistant"` and `message.usage` is present.

### Evidence appendix

Confirmed schema of `message.usage` in `~/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/<sessionId redacted>.jsonl`, Claude Code 2.1.150, 2026-06-03:

```json
{
  "input_tokens": 6,
  "cache_creation_input_tokens": 1197,
  "cache_read_input_tokens": 39914,
  "output_tokens": 354,
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 1197,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "",
  "iterations": [
    {
      "input_tokens": 6,
      "output_tokens": 354,
      "cache_read_input_tokens": 39914,
      "cache_creation_input_tokens": 1197,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 21832
      },
      "type": "message"
    }
  ],
  "speed": "standard"
}
```

Outer envelope of each assistant entry (relevant fields for per-request correlation):

```json
{
  "type": "assistant",
  "requestId": "req_011CbfVJJDTwMEGSsaeaCm3b",
  "uuid": "<uuid redacted>",
  "timestamp": "2026-06-03T01:51:18.416Z",
  "sessionId": "<sessionId redacted>",
  "parentUuid": "<parentUuid redacted>",
  "isSidechain": false
}
```

The `requestId` field enables per-request correlation if needed. The `timestamp` enables wall-clock alignment with sidecar `updatedAt`.

Confirmed sidecar `state.json` schema (no usage fields present, Claude Code 2.1.150):

```json
{
  "state": "done",
  "detail": "(idle — send a prompt to start)",
  "tempo": "idle",
  "output": null,
  "children": null,
  "linkScanOffset": 0,
  "template": "bg",
  "respawnFlags": ["--help"],
  "providerEnv": {},
  "intent": "",
  "sessionId": "<sessionId redacted>",
  "resumeSessionId": "<sessionId redacted>",
  "daemonShort": "<shortId redacted>",
  "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
  "createdAt": "2026-05-31T12:41:53.049Z",
  "updatedAt": "2026-05-31T12:41:53.559Z",
  "firstTerminalAt": "2026-05-31T12:41:53.559Z",
  "backend": "daemon"
}
```

Note: `output` is `null` on all 26 completed jobs inspected. `sidecar.ts` currently only parses `output.result` (string); the `output.usage` field the plan asked about does not exist in practice.

Note on `types.ts`: `ResultContext.usageSnapshot` and `TurnRecord.usageSnapshot` are both typed `unknown` (lines 73, 87). These are placeholder fields that were never populated from any source. The transcript `message.usage` data is the correct source to populate them in T4–T7 runners.

---

## T2 — Harness CLI skeleton + dry-run mode

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/run.mjs` (82 lines) — entry point with `--help`, `--dry-run` dispatch.
- `tools/bench/lib/cli.mjs` (88 lines) — `parseArgs`-based arg parsing; validates `--runs` (positive int) and `--cutover-phase` (`pre|post`); exports `USAGE`.
- `tools/bench/lib/flows.mjs` (65 lines) — 5-entry flow registry; `selectFlows()` filters by id list + opt-in baseline flag; throws on unknown ids.
- `tools/bench/lib/tasks.mjs` (46 lines) — 3-entry task registry per OQ-C resolution; `selectTasks()` filters by id list; throws on unknown ids.
- `tools/bench/test/cli.test.mjs` (175 lines) — 21 tests using `node:test` + `spawnSync`.

### Acceptance evidence

- `node tools/bench/run.mjs --help` → exit 0; all flags listed.
- `node tools/bench/run.mjs --dry-run` → exit 0; default 12 cells (4 flows × 3 tasks); 60 invocations at N=5.
- `node tools/bench/run.mjs --dry-run --flows delegate --tasks summarize-todos --runs 3` → exactly 3 invocations.
- `node tools/bench/run.mjs --dry-run --include-baseline-p` → adds `baseline-p × summarize-todos` row only (per OQ-A + OQ-C resolutions).
- Zero third-party dependencies; only `node:*` built-ins.
- Tests: 21/21 pass.

---

## T3 — Task-corpus fixture

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/fixtures/README.md` (11 lines, exactly 3 TODO markers).
- `tools/bench/fixtures/src/app.js` (11 lines) — `oldName` variable used in 2 places for the rename task.
- `tools/bench/fixtures/src/lib/helpers.js` (16 lines) — `withRetry()` helper.
- `tools/bench/fixtures/test/app.test.js` (19 lines, 3 passing tests).
- `tools/bench/fixtures/test/helpers.test.js` (22 lines, 3 passing tests).
- `tools/bench/lib/fixture.mjs` (28 lines) — exports `createFixture()` returning `{ root, cleanup }` with `git init` run inside.
- `tools/bench/test/fixture.test.mjs` (110 lines) — 11 self-tests.

### Acceptance evidence

- 3 TODO markers in `fixtures/README.md` (count locked by test).
- Two `createFixture()` calls produce two independent temp dirs.
- `.git/` exists inside the fixture after `createFixture()` (validates `git init`).
- Tests: 11/11 pass.

---

## T4 — Flow runner: `delegate` (+ shared helpers)

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

T4 also produced the shared helpers (`run-result.mjs`, `transcript-usage.mjs`, `dispatcher-spawn.mjs`) consumed by T5–T8.

### Deliverables

- `tools/bench/lib/run-result.mjs` — `RunResult` JSDoc shape + `createEmptyRunResult({ flow, task, runIndex })` factory + `markError(result, error)` helper.
- `tools/bench/lib/transcript-usage.mjs` — `aggregateUsage(transcriptPath)` + `sanitizeCwd(cwd)` per T1 finding (parses `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` `message.usage` per assistant entry; sums `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`; tracks consistent `service_tier`).
- `tools/bench/lib/dispatcher-spawn.mjs` — `runDispatcher({ subcommand, args, cwd, env, timeoutMs, spawn? })` wrapper; spawns `node <plugin-root>/scripts/claude-companion.mjs <subcommand> ...` with isolated `CC_PLUGIN_CODEX_HOME`; reports `{ status, stdout, stderr, timedOut }`. Test seam via DI on `spawn`.
- `tools/bench/lib/runners/delegate.mjs` — `runDelegate(task, fixtureRoot, env, opts)` implementing the single-turn delegate flow (isolated home, performance.now() wall-clock, status poll until terminal, result --json, transcript usage aggregation, sidecar tempo transitions best-effort, 10-min default timeout, cleanup).
- 4 self-test files: `run-result.test.mjs` (13), `transcript-usage.test.mjs` (14), `dispatcher-spawn.test.mjs` (8), `runners/delegate.test.mjs` (13).

### Acceptance evidence

- DI on `spawn` lets runner tests assert behavior without real Claude.
- Transcript-missing path appends a caveat and leaves `tokenCounts: null`.
- `CC_PLUGIN_CODEX_HOME` is uniquely created per run and cleaned up afterward.
- Two concurrent runs get different `CC_PLUGIN_CODEX_HOME` values.
- Tests: 13 + 14 + 8 + 13 = 48/48 pass.

### `RunResult` shape (locked; T5-T8 conform)

`flow`, `task`, `runIndex`, `wallClockMs`, `turnsWallClockMs[]`, `tempoTransitions | null`, `tokenCounts | null`, `reviewVerdict | null`, `findingsCount | null`, `error | null`, `caveats[]`.

---

## T5 — Flow runner: `delegate-followup`

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/lib/runners/delegate-followup.mjs` (286 lines) — two-turn delegate+followup flow.
- `tools/bench/test/runners/delegate-followup.test.mjs` (247 lines) — 16 tests across 4 suites via DI.

### Acceptance evidence

- `turnsWallClockMs[0]` = delegate→`awaiting_followup` poll; `turnsWallClockMs[1]` = followup→terminal poll.
- Followup prompt is verbatim per the acceptance criteria: `"Now confirm how many files you inspected."`.
- TTL-expired path (status reaches a terminal state other than `awaiting_followup`) marks `error: 'ttl_expired'`.
- Cleanup `finally` runs `stop <jobId>` best-effort (small deviation from T4's no-op `finally`; matches the plan spec step 12).
- Tests: 16/16 pass.

---

## T6 — Flow runner: `delegate-review`

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/lib/runners/delegate-review.mjs` (261 lines) — two-turn delegate+same-session-review flow.
- `tools/bench/test/runners/delegate-review.test.mjs` (261 lines) — 18 tests via DI.

### Acceptance evidence

- Spawns `review <jobId> --yes --json` (no positional prompt arg, per Plan 0003 contract).
- Captures `reviewVerdict` (one of `pass | fail | pass_with_findings`) and `findingsCount` from parsed `--json` output.
- Malformed review JSON falls back to `reviewVerdict: null` + error populated.
- All three verdict variants have dedicated test cases.
- Tests: 18/18 pass.

---

## T7 — Flow runner: `delegate-adversarial`

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/lib/runners/delegate-adversarial.mjs` (270 lines) — delegate + fresh-session adversarial review.
- `tools/bench/test/runners/delegate-adversarial.test.mjs` (285 lines) — 21 tests via DI.

### Acceptance evidence

- 30-minute `DEFAULT_REVIEW_TIMEOUT_MS = 1_800_000` for the adversarial-review subprocess (matches Plan 0003 DD-1).
- `opts.reviewTimeoutMs` overrideable.
- Adversarial subprocess SIGTERM → `error: 'review_timeout'`.
- Dual-transcript aggregation: target-job usage + review-session usage merged via `mergeTokenUsage()`. Caveat appended when review transcript path is absent.
- Severity breakdown (`blockerCount`, `highCount`, `mediumCount`, `lowCount`, `nitCount`) captured from review JSON, surfaced as a caveat string.
- Tests: 21/21 pass.

---

## T8 — Flow runner: `baseline-p` (opt-in)

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/lib/runners/baseline-p.mjs` (117 lines) — direct `claude -p "<prompt>"` runner.
- `tools/bench/test/runners/baseline-p.test.mjs` (230 lines) — 16 tests via DI.

### Acceptance evidence

- Spawns `claude -p "<task.prompt>"` directly via the DI seam — never via the plugin dispatcher (test verified by argv inspection).
- Source contains the required architectural comment:
  > "This runner exercises `claude -p` which the plugin explicitly does NOT use. It exists solely as a billing/latency comparison anchor for Plan 0004 measurement and lives ONLY in this harness. No production code path in cc-plugin-codex calls claude -p."
- The runner does NOT import from `packages/` (test verified by file-level grep).
- Only invoked when CLI sees `--include-baseline-p` per T2's `selectFlows()` filter.
- Tests: 16/16 pass.

---

## T9 — Result aggregator + summary writer

**Status**: complete
**Date**: 2026-06-03
**Subagent A**: oh-my-claudecode:executor

### Deliverables

- `tools/bench/lib/aggregator.mjs` (168 lines) — `aggregate(runs, metadata): ResultsJson` (pure, no I/O) + `summarizeLatency()` + `BenchAggregateError`.
- `tools/bench/lib/summary.mjs` (198 lines) — `formatSummary(results): string` (pure) + `writeSummary(results, outputDir): void` (sole I/O entry point).
- `tools/bench/lib/output-dir.mjs` (61 lines) — `defaultOutputDirName(date, runId)` + `createOutputDir(opts)`.
- `tools/bench/test/aggregator.test.mjs` (187 lines, 29 tests).
- `tools/bench/test/summary.test.mjs` (220 lines, 29 tests).
- `tools/bench/test/output-dir.test.mjs` (115 lines, 12 tests).

### Acceptance evidence

- `results.json` shape conforms to § 3.7 schema (schemaVersion 1).
- `JSON.parse(JSON.stringify(result))` round-trip equality verified.
- Median calculation: linear interpolation; even-length median = average of two middle values.
- Cells with zero runs (e.g., baseline-p × non-summarize tasks) intentionally omitted (sparse cells documented in JSDoc).
- `summary.md` contains all 7 required sections (header, per-flow median table, per-task breakdown, review verdict matrix, token usage, caveats, billing-bucket observation).
- Summary OQ4 scan: 0 forbidden tokens, 0 forbidden patterns.
- Caveats deduplicated via insertion-order `Set`.
- Tests: 29 + 29 + 12 = 70/70 pass.

---

## T10/T11/T12 — Deferred to actual measurement dates

- **T10**: pre-cutover benchmark run (≤ 2026-06-14). Awaiting maintainer-driven run against real Claude Code 2.1.150 + Codex 0.136.0.
- **T11**: post-cutover benchmark run (≥ 2026-06-16). Same.
- **T12**: README cost paragraph decision (depends on T10/T11 data).

Per OQ-E + OQ-J resolutions, Stage 5 closes only after T10 + T11 + T12 complete (or after the 30-day cutover-slip escape hatch fires).

---

## Stage 2 wiring

- `package.json` adds `"test:bench": "node --test tools/bench/test/*.test.mjs tools/bench/test/runners/*.test.mjs"`.
- `.github/workflows/ci.yml` adds a `Test bench lane` step after `Test attach lane`.
- Bench tests are NOT included in the main `npm test` chain (matches the `test:attach` precedent); they run as a separate CI step and locally via `npm run test:bench`.

### Stage 2 test totals (at commit pending)

| Lane | Tests | Pass |
|---|---|---|
| `test:mock` | 68 | 68 |
| `test:runtime` | 172 | 172 |
| `test:driver` | 178 | 178 |
| `test:plugin` | 623 | 623 |
| `test:attach` | 28 | 28 |
| `test:bench` (new in Plan 0004) | 221 | 221 |
| **Total** | **1290** | **1290** |

Plan 0003 baseline `1041 + 28 = 1069` is preserved (no regression in any pre-existing lane).

