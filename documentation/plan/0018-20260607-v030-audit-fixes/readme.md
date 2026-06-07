# Plan 0018 — v0.3.0 pre-release audit fixes

**Status**: `complete`
**Started**: 2026-06-07
**Completed**: 2026-06-07
**Severity**: release-gating (blocks v0.3.0 tag)
**Drafted from**: comprehensive pre-release audit (`documentation/testing/findings-20260607-v030-audit.md`).

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | this readme + inline triage | **approved 2026-06-07** (release-blocker fast track) |
| 2 — Implement | `2-implement.md` | **complete 2026-06-07** |
| 3 — Audit | n/a | the v0.3.0 audit itself WAS Stage 3; re-smoke verifies the fixes |
| 4 — Polish | folded into Stage 2 | — |
| 5 — Report | `2-implement.md` doubles as report | — |

## Triage of audit findings

The pre-release audit (14 skills + edge cases) returned **mostly pass** with a small cluster of issues. Triaged:

### Real bugs — FIXED in this plan

1. **Test 3 (HIGH) — workflow drill-in blank `Workflow session:` / `Name:`, empty `sessionId`/`name` in `--json`.**
   Root cause: `inspectWorkflow` / `_toWorkflowSession` read `job.sessionId` / `job.sessionName`, but the driver stores session identity under `job.claude.sessionId` / `job.claude.sessionName`. The top-level fields are always null. Plan 0017 test fixtures used the top-level path, so tests passed while production returned blanks — the **same "tests mock the wrong reality" failure mode Plan 0017 was created to fix**, reintroduced one layer down.
   Fix: added `_sessionId(job)` / `_sessionName(job)` helpers that read `job.claude.*` with a top-level fallback; corrected the test fixtures to nest session identity under `claude`; added regression tests asserting non-blank drill-in session/name and that list `shortId` derives from the Claude session id.

2. **Test 9 NIT (LOW) — adversarial-review printed `PASS WITH FINDINGS (0 findings: )`.**
   Root cause: `formatReviewHuman` only early-returned clean output for `verdict === 'pass'`. A mid-stream read yielding `pass_with_findings` with an empty findings array fell through to the count-summary branch, producing the malformed label.
   Fix: render the clean `PASS`/`FAIL` + `No findings.` block whenever `findings.length === 0`, regardless of the raw verdict label. Added 4 `formatReviewHuman` unit tests.

### NOT plugin bugs — documented, not code-changed

3. **Test 4 (goal timeout) & Test 6 (batch timeout).** `/goal` runs until its stop-condition is met; `/batch` injects a heavyweight multi-phase orchestration system prompt. Both are designed to run long. The markers WERE produced (recoverable post-stop). The 4-minute smoke window was simply too short for these heavyweight commands. This matches the documented behavior (Plan 0016 goal-stall guidance + `$claude-batch` cost notice). No code defect.

4. **`stop` → "stopped" then `result` → "orphaned".** After `stop` kills the live session, the reconciler re-derives status as `orphaned` (the session is gone). Pre-existing reconciler behavior, not introduced by recent work. Cosmetic.

5. **`status <jobId>` does not filter.** `$claude-status` is a workspace-list command by design; jobId targeting belongs to `result` / `stop`. The smoke passed a jobId that was (correctly) ignored. By design.

## Outcome

2 real bugs fixed; both have regression tests. 3 non-bugs documented. v0.3.0 unblocked pending a focused re-smoke of Test 3 (drill-in metadata) and confirmation the cosmetic label is gone.

Skill count: 14 (unchanged). Marketplace allowlist: 26 (unchanged). Plugin version field: bumped to `0.3.0` (the release this plan unblocks).
