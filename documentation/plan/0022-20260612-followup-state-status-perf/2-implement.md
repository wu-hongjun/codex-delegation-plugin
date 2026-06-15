# Plan 0022 Stage 2 — Implement

**Status**: complete
**Date**: 2026-06-12
**Commit basis**: current `main` at v0.3.3; no release bump in this plan.

## Work Log

- Opened Plan 0022 from the v0.3.3 depth-test handover.
- Runtime exception documented for `packages/runtime/src/reconciler.ts`: the follow-up blocker lives in status mapping, and runtime owns that logic.
- Updated `packages/runtime/src/reconciler.ts` so status mapping gets a second pass after transcript/sidecar artifacts are read. It only treats a pending latest turn as completed when the latest turn already has its own result, or when the current reconcile produced completion evidence from transcript artifacts or a `done` sidecar result.
- Left the existing conservative cases intact: idle+queued with no result evidence stays `running`, and sidecar `state:"working"` with a result string does not become completion evidence.
- Updated `packages/plugin-codex/scripts/cc.mjs` so `status` listing skips reconciliation for terminal historical records. The helper is a hoisted function declaration to avoid this dispatcher's top-level TDZ pattern.
- Regenerated the marketplace tree with `node tools/package-marketplace.mjs --write`.

## Verification

- `node --test packages/runtime/test/reconciler.test.mjs` — 61/61 pass.
- `node --test --test-name-pattern "status terminal-history reconciliation skip|status after one delegate|status --json after one delegate|status footer" packages/plugin-codex/test/dispatcher.test.mjs` — 5/5 pass.
- `node --test packages/plugin-codex/test/dispatcher.test.mjs` — 233/233 pass.
- `npm test` — full chain pass.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npx prettier --check` on touched tracked files — pass. Repo-wide `npm run format` is noisy in this worktree because of the untracked local `.claude/settings.local.json`, so it was not used as final evidence.
- `node tools/package-marketplace.mjs --check` — pass: 26 derived files, 64 bundled-dep files, 3 synthesized package.json files.

## Independent Review Attempt

Started a read-only `$claude-delegate` review job (`job_mqaifs1j_a2a2cae0`, session `cd51a3fe`) against the diff. It remained `busy/working` for the bounded poll window and produced only a partial transcript, so it was stopped and not counted as approval evidence.
