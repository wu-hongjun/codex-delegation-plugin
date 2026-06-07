# Plan 0018 Stage 2 — Implement (audit fixes)

**Status**: complete (local gates green; awaiting CI)
**Date**: 2026-06-07
**Commit basis**: shipped at plugin version `0.2.0` (the v0.3.0 bump is a separate follow-up commit per RELEASING.md).

## Fix 1 — workflow drill-in / list session metadata (Test 3, HIGH)

**Root cause**: `inspectWorkflow` and `_toWorkflowSession` in `workflows-inspector.mjs` read `job.sessionId` / `job.sessionName`. The cc-plugin-codex background driver stores session identity under **`job.claude.sessionId` / `job.claude.sessionName`**; the top-level fields are always `null`. Result: drill-in printed blank `Workflow session:` / `Name:`, and `--json` entries had empty `sessionId`/`name` with `shortId` falling back to the job-id prefix.

Plan 0017's test fixtures placed session identity at the top level, so the unit tests passed while production returned blanks — the same "tests mock the wrong reality" failure mode Plan 0017 was created to fix, reintroduced one field-path deeper. The v0.3.0 pre-release audit (real-Codex, real job records) caught it.

**Fix** (`packages/plugin-codex/scripts/lib/workflows-inspector.mjs`):
- Added `_sessionId(job)` → `job.claude?.sessionId ?? job.sessionId ?? ''`
- Added `_sessionName(job)` → `job.claude?.sessionName ?? job.sessionName ?? ''`
- `inspectWorkflow` and `_toWorkflowSession` now use those helpers (with `shortId` derived from the resolved session id)
- Forward-compatible: keeps the top-level fallback in case the schema changes

**Live verification**:
```
$ cc workflows --all
Workflow sessions (8):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  ...
$ cc workflows job_mq1eqa7e_9c8e5b88
Workflow session: 2b741235-83df-409f-b119-eac21a7892d9
  Name:      codex:cc-plugin-codex:mq1eq7jq
  Status:    orphaned
  ...
```
(Both were blank before the fix.)

**Tests** (`packages/plugin-codex/test/workflows-inspector.test.mjs`):
- Corrected `makeJobRecord` to nest `sessionId`/`sessionName` under `claude.*` (matching real records)
- New: drill-in surfaces non-blank `claude.sessionId` + `claude.sessionName` (asserts the exact values appear; asserts `Workflow session:` line is not blank)
- New: list `shortId` derives from the Claude session prefix, not the job id

## Fix 2 — adversarial-review `PASS WITH FINDINGS (0 findings: )` (Test 9, LOW/NIT)

**Root cause**: `formatReviewHuman` (`format.mjs`) early-returned the clean `No findings.` block only when `verdict === 'pass'`. A mid-stream read that yields `pass_with_findings` with an empty findings array fell through to the count-summary branch, printing the malformed `PASS WITH FINDINGS (0 findings: )`.

**Fix** (`packages/plugin-codex/scripts/lib/format.mjs`): render the clean block whenever `findings.length === 0`, regardless of the raw verdict label (`FAIL` if verdict is fail, else `PASS`).

**Tests** (`packages/plugin-codex/test/review-parser.test.mjs`): imported `formatReviewHuman`; added 4 cases — `pass_with_findings` + `[]` → clean PASS (never "WITH FINDINGS"/"0 findings"); plain `pass` + `[]`; `fail` + `[]` → FAIL; `pass_with_findings` + 1 finding → still shows count summary.

## Non-bugs documented (no code change)

- **Test 4 (goal) / Test 6 (batch) timeouts** — `/goal` runs to its stop-condition; `/batch` injects a heavyweight orchestration prompt. Designed to run long; markers were recoverable post-stop. Matches Plan 0016 goal-stall guidance + `$claude-batch` cost notice.
- **`stop`→stopped then `result`→orphaned** — reconciler re-derives status after the live session is killed. Pre-existing.
- **`status <jobId>` doesn't filter** — `$claude-status` is a workspace-list command by design.

## Gates

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 26 derived |
| `npm run lint` / `typecheck` / `format` | exit 0 |
| affected files (`workflows-inspector` + `review-parser`) | 80/80 pass |
| `npm test` (full chain, version pinned 0.2.0) | see Stage close |

## Files modified

Source:
- `packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (`_sessionId`/`_sessionName` helpers + use sites)
- `packages/plugin-codex/scripts/lib/format.mjs` (empty-findings clean render)

Tests:
- `packages/plugin-codex/test/workflows-inspector.test.mjs` (fixture path fix + 2 regression tests)
- `packages/plugin-codex/test/review-parser.test.mjs` (`formatReviewHuman` import + 4 tests)

Marketplace mirrors (regenerated):
- `marketplace/plugins/cc/scripts/lib/workflows-inspector.mjs`
- `marketplace/plugins/cc/scripts/lib/format.mjs`

## Safety invariants

- Plugin version unchanged at `0.2.0` in this commit (v0.3.0 bump is the follow-up release commit)
- Skill count: 14; marketplace allowlist: 26
- Cost paragraph byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1`; `v0.2.0` tag at `ea595e1`
- Plans 0004-0017 untouched; `tools/bench/`, `.github/`, `packages/runtime/src/`, `packages/driver-claude-code/` no source changes
