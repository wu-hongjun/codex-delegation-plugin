# Plan 0019 — v0.3.1 polish fixes (deep-test findings B1 + B2)

**Status**: `implementing`
**Started**: 2026-06-07
**Drafted from**: the v0.3.0 deep test (`documentation/testing/findings-20260607-v030-deep.md`). v0.3.0 passed comprehensively (fan-out proven, all contracts hold, both prior fixes re-confirmed); these are two polish-grade correctness fixes for a v0.3.1 patch.

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | this readme | **approved 2026-06-07** (maintainer authorized B1+B2 → v0.3.1) |
| 2 — Implement | `2-implement.md` | in progress |
| 3 — Audit | re-smoke | the deep test was Stage 3; targeted re-smoke verifies the fixes |
| 5 — Report | folded into 2-implement.md | — |

## Fixes

### B1 — `cc workflows` list/lookup mismatch (LOW-MED; newest feature)

The list shows the 8-char Claude **session** shortId (e.g. `983cda25`) and the footer says *"Run `cc workflows <sessionId>`"*, but `inspectWorkflow` only matched **jobId**. Copying the displayed id → `No job found matching jobId "983cda25"`.

Fix: `inspectWorkflow` now matches jobId OR Claude session id (full or prefix, via `_sessionId`). The footer instruction (`<sessionId>`) becomes accurate. Error message updated to mention both. +regression test.

### B2 — `stop` → reconciles to `orphaned` instead of `stopped` (MED; pre-existing)

`mapStatus` in `reconciler.ts` checks `isOrphan` first and returns `orphaned`, overriding a deliberately-`stopped` job once its session is reaped. `cc stop` writes `stopped`; the next reconcile flips it to `orphaned`.

Fix: a `stopped` job is terminal — preserve it. Added a sticky guard returning `previousJobStatus` when it is `stopped`, before the orphan check. Resumable states (`awaiting_followup`, `needs_input`) are intentionally NOT sticky (if their session disappears, `orphaned` is correct). Documented runtime exception (precedent Plans 0012 T5 / 0014 T2e). +regression test.

## Documented as known behavior (no code change this plan)

- **B3** — `cc workflows <jobId> --json` shows `subagents: []` for dynamic `/workflow` runs (their agents live in the separate workflow runtime, not `~/.claude/projects/<session>/subagents/`). Drill-in still returns phase records + session metadata. Enhancement, not a defect.
- **B4** — parent job stays non-terminal for dynamic-workflow / goal / batch / deep-research (async orchestration runtime the parent reconciler doesn't track; output recoverable post-stop). Long-runners by design.
- **B5** — `followup --json` immediate preview is one turn stale (resolves on poll). Matches Plan 0012 residual-risk note.

## Release

Bump plugin `0.3.0` → `0.3.1` per RELEASING.md; tag `v0.3.1` after CI green. `v0.2.0` and `v0.3.0` tags immutable.
