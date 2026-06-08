# Plan 0019 Stage 2 — Implement (v0.3.1 polish fixes)

**Status**: complete (local gates green; awaiting CI + tag)
**Date**: 2026-06-07
**Commit basis**: fixes shipped at version `0.3.0`; the v0.3.1 bump is the follow-up release commit (two-commit pattern, per Plan 0018).

## B1 — `cc workflows` resolves by Claude session id (not just jobId)

**Root cause**: the list view prints the 8-char Claude **session** shortId in column 1 and the footer says *"Run `cc workflows <sessionId>`"*, but `inspectWorkflow` matched only the cc **jobId**. Copying the displayed id failed with `No job found`.

**Fix** (`packages/plugin-codex/scripts/lib/workflows-inspector.mjs`): `inspectWorkflow` now matches jobId OR the resolved Claude session id (`_sessionId(job)`), full value or prefix. Error message updated to `No workflow found matching job id or session id "…"`.

**Live verification**: `cc workflows 2b741235` (a displayed 8-char shortId) now resolves to its workflow (previously `No job found`).

**Tests** (`workflows-inspector.test.mjs`): +2 — resolve by full session id; resolve by 8-char session shortId.

## B2 — stopped job stays `stopped` (no orphan re-derivation)

**Root cause**: `mapStatus` (`reconciler.ts`) checked `isOrphan` first and returned `orphaned`, overriding a deliberately-`stopped` job once its session was reaped. `cc stop` writes `stopped`; the next reconcile flipped it to `orphaned`.

**Fix** (`packages/runtime/src/reconciler.ts`): added a sticky-terminal guard returning `previousJobStatus` when it is `stopped`, before the orphan check. A stopped job cannot be resumed, so its status reflects the user's action. Resumable states (`awaiting_followup`, `needs_input`) are intentionally NOT sticky — if their session disappears, `orphaned` remains correct. Runtime change is a documented exception (precedent Plans 0012 T5 / 0014 T2e).

**Tests** (`reconciler.test.mjs`): +3 direct `mapStatus` unit tests — stopped+orphan → stopped; running+orphan → orphaned; awaiting_followup+orphan → orphaned. The existing "value: orphaned maps to orphaned" test still passes (fresh job, non-terminal previous status).

## Documented as known behavior (no code change)

- **B3** — `cc workflows <id> --json` shows `subagents: []` for dynamic `/workflow` runs (agents live in the separate workflow runtime, not the job-store subagents dir). Still returns phase records + session metadata. Enhancement.
- **B4** — parent job stays non-terminal for dynamic-workflow / goal / batch / deep-research (async orchestration the parent reconciler doesn't track; output recoverable post-stop). Long-runners by design.
- **B5** — `followup --json` immediate preview is one turn stale (resolves on poll). Matches Plan 0012 residual-risk note.

## Gates

| Gate | Result |
|---|---|
| `tsc --build` (runtime dist rebuilt) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; 26 derived |
| `npm run lint` / `typecheck` | exit 0 |
| `npm run format` | exit 0 (only the gitignored `.claude/settings.local.json` warns; not in CI's tree) |
| reconciler + workflows-inspector targeted | 75/75 pass |
| `npm test` (full chain) | see Stage close |

## Files modified

Source:
- `packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (B1 session-id match)
- `packages/runtime/src/reconciler.ts` (B2 sticky-stopped) + rebuilt `dist/`

Tests:
- `packages/plugin-codex/test/workflows-inspector.test.mjs` (+2)
- `packages/runtime/test/reconciler.test.mjs` (+3, mapStatus import)

Marketplace mirrors regenerated (`--write`): inspector + bundled runtime `dist/reconciler.js`.

## Safety invariants

- Plugin version `0.3.0` in this fix commit (bump is the follow-up commit).
- Skill count 14; marketplace allowlist 26; cost paragraph byte-identical.
- `plan-0004-pre-cutover` at `7d9b5f1`; `v0.2.0` at `ea595e1`; `v0.3.0` immutable.
- Plans 0004-0018 untouched; `packages/runtime/src/reconciler.ts` is the documented exception.
