# Fix Plan: Adversarial Review Reads Mutable Result File

Date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

## Finding

`adversarial-review` can select the correct turn index but read the wrong bytes. The selected `targetTurn.result.finalMessagePath` can point at the mutable job-level result file, so after a same-session review overwrites that file, a fresh adversarial review evaluates the review verdict while `reviewOf.turnIndex` still says it reviewed the original output.

Key code refs:

- `packages/plugin-codex/scripts/cc.mjs:1940-1999` selects latest completed non-review turn and reads `targetTurn.result.finalMessagePath`.
- `packages/plugin-codex/scripts/cc.mjs:2032-2055` records `reviewOf: { jobId, turnIndex }`, so metadata can be correct while content is stale.
- `packages/plugin-codex/scripts/cc.mjs:2002` also pulls `touchedFiles` from `targetJob.result`, not the selected turn.
- `packages/runtime/src/paths.ts:44-46` exposes one `<jobId>.result.md` path.
- `packages/runtime/src/reconciler.ts:455-466`, `487-497`, and `557-578` write every transcript/sidecar/logs result to that same path.
- `packages/runtime/src/reconciler.ts:587-620` mirrors the new result onto the last turn, leaving older turns' paths unchanged.
- `packages/runtime/src/job-store.ts:192-200` and `packages/runtime/src/types.ts:103-109` define top-level `job.result` as only a latest-result compat alias.

The existing dispatcher tests miss this because `writeAdversarialTargetJob` assigns every synthetic turn the same result context (`packages/plugin-codex/test/dispatcher.test.mjs:4240-4330`) and `T6-extra-4` only checks `reviewOf.turnIndex` (`packages/plugin-codex/test/dispatcher.test.mjs:5461-5494`), not the prompt content injected into the adversarial session.

## Recommended Fix

Make turn result files immutable and keep `adversarial-review` reading the selected turn. Do not switch adversarial review to `job.result` or transcript heuristics; that would preserve the latest-output bias and leave older turn consumers broken.

Implementation shape:

1. Add a runtime path helper in `packages/runtime/src/paths.ts`, for example:
   - `getJobTurnResultPath(jobId, turnIndex) -> <jobs>/<jobId>.turn-<turnIndex>.result.md`
   - Keep `getJobResultPath(jobId)` as a compatibility "latest result" alias.
2. In `packages/runtime/src/reconciler.ts`, route all artifact writes through one helper:
   - Determine `latestTurnIndex = job.turns.length - 1`.
   - Write the actual `ResultContext.finalMessagePath` to `getJobTurnResultPath(jobId, latestTurnIndex)`.
   - Optionally also write/copy the same bytes to `getJobResultPath(jobId)` for old tooling, but never store the compat alias in `turn.result.finalMessagePath`.
3. Before overwriting the compat alias for a new turn, preserve a one-turn legacy upgrade case:
   - If the previous latest result turn still points at `getJobResultPath(jobId)`, copy the current compat file to that previous turn's `getJobTurnResultPath(...)` and update that older turn's `result.finalMessagePath`.
   - This salvages jobs created pre-fix when they receive their first post-fix followup/review. Already-overwritten multi-turn legacy jobs cannot be recovered reliably.
4. Update `resultContextEqual` in `packages/runtime/src/reconciler.ts:313-320` to compare `finalMessagePath`. It currently ignores the path, which can prevent replacing `sendFollowupTurn`'s empty path sentinel with a real reconciled file when the preview is unchanged.
5. In `cmdAdversarialReview`, keep reading `targetTurn.result.finalMessagePath`, but change `touchedFiles` at `packages/plugin-codex/scripts/cc.mjs:2002` to `targetTurn.result?.touchedFiles`.
6. Add a defensive legacy guard in `cmdAdversarialReview`:
   - Compute the latest turn index with a result.
   - If `selectedTurnIndex !== latestResultTurnIndex` and `targetTurn.result.finalMessagePath === targetJob.result.finalMessagePath`, refuse to run with a clear "legacy mutable result path" error.
   - This prevents silent wrong reviews for existing affected records.

This is a runtime fix, not a review-only fix. Same-session review and followup complete via `sendFollowupTurn` (`packages/plugin-codex/scripts/cc.mjs:1174-1219`), but the full durable result is reconciler-owned, especially for structured reviews where `sendResult.finalMessage` may be only a sidecar summary (`packages/plugin-codex/scripts/cc.mjs:1685-1727`).

## Tests To Add Or Update

Runtime:

- Update `packages/runtime/test/job-store.test.mjs`, path helper test at `:100-105`, to assert `getJobTurnResultPath('job_abc_12345678', 0)`.
- Update `packages/runtime/test/reconciler.test.mjs`, transcript artifact test at `:276-302`, so it asserts the result file exists and contains content without requiring `finalMessagePath === getJobResultPath(jobId)`.
- Update idempotency test at `packages/runtime/test/reconciler.test.mjs:500-539` to read from `r1.job.result.finalMessagePath`, not the compat alias path.
- Add `reconciler writes immutable per-turn result snapshots across turns`:
  - Reconcile turn 0 with `TURN0_SENTINEL`.
  - Append a second queued turn via `updateJob`.
  - Reconcile turn 1 with `TURN1_SENTINEL`.
  - Assert turn paths differ, turn 0 file still contains `TURN0_SENTINEL`, turn 1/top-level result contains `TURN1_SENTINEL`.
- Add `reconciler replaces empty-path followup sentinel even when preview is unchanged`:
  - Seed latest turn result as `{ finalMessagePath: '', finalMessagePreview: 'SAME_TEXT' }`.
  - Reconcile artifacts with `SAME_TEXT`.
  - Assert latest turn gets a non-empty per-turn `finalMessagePath`.

Dispatcher:

- Add `adversarial-review refuses legacy shared result path when selected turn is not latest result` near `adversarial-review extra edge cases` (`packages/plugin-codex/test/dispatcher.test.mjs:5363-5521`):
  - Build a target record where turn 0 is non-review, turn 1 is `[review]`, both point at `<jobId>.result.md`, and top-level result is turn 1.
  - The file contains review text.
  - `adversarial-review <jobId> --yes` should exit non-zero before starting a review job.
- Add `adversarial-review prompt uses selected turn snapshot after same-session review`:
  - Use a fixed job with distinct turn snapshots or, better, run delegate/result/review/adversarial-review through the mock after the runtime fix.
  - Read `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME/state.json` and locate the `codex:<repo>:review-...` session prompt (`tools/mock-claude/claude:399-412` stores it).
  - Assert the prompt contains the original output sentinel and does not contain the structured review fixture text.
- Keep existing T12b review-result-source coverage (`packages/plugin-codex/test/review-result-source.test.mjs:35-128`); no behavior change needed.

Suggested focused verification:

```sh
npm run build
node --test packages/runtime/test/job-store.test.mjs packages/runtime/test/reconciler.test.mjs
node --test packages/plugin-codex/test/dispatcher.test.mjs packages/plugin-codex/test/review-result-source.test.mjs
```

## Compatibility Risks

- Existing affected multi-turn jobs whose old turn files were already overwritten cannot be repaired without transcript heuristics. The new adversarial guard should fail closed instead of reviewing the wrong output.
- Any external script that assumes `ResultContext.finalMessagePath` equals `<jobId>.result.md` will need to follow the stored path. Keeping `<jobId>.result.md` as a latest-result compatibility copy reduces but does not eliminate this risk.
- If `resultContextEqual` starts comparing paths, events may be emitted once for the new per-turn path on upgrade. That is acceptable and preferable to persisting empty or mutable paths.
- No schema version bump is required: `ResultContext.finalMessagePath` remains a string, and `job.result` remains the latest-result compat alias.
