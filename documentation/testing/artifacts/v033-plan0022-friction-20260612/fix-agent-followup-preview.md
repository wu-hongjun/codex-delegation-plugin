# Fix Guidance: Immediate Followup Preview Honesty

## Finding

Medium finding confirmed. Immediate `followup --json` can make the newly appended turn look completed while exposing preview text from the previous turn.

Evidence already captured:

- `documentation/testing/artifacts/v033-plan0022-friction-20260612/friction-summary.md:76` reports `job.status: "running"`, `turn.status: "completed"`, and a previous-turn `finalMessagePreview`.
- `documentation/testing/artifacts/v033-plan0022-friction-20260612/agent-natural-delegate.md:140` shows the same shape with `resultPreview` and `finalMessagePreview` both set to the old sentinel.

## Current Path

- `cmdFollowup` reconciles before eligibility at `packages/plugin-codex/scripts/cc.mjs:1301`, then calls `sendFollowupTurn` at `packages/plugin-codex/scripts/cc.mjs:1405`, then prints `formatFollowup(finalJob, sendResult, newTurnIndex, json)` at `packages/plugin-codex/scripts/cc.mjs:1417`.
- `sendFollowupTurn` appends the new turn as `injecting` and sets the job `running` at `packages/plugin-codex/scripts/cc.mjs:1014`.
- On send success, it builds an inline result from `sendResult.finalMessage` at `packages/plugin-codex/scripts/cc.mjs:1174`, writes the new turn as `completed` at `packages/plugin-codex/scripts/cc.mjs:1185`, then immediately runs a best-effort reconcile at `packages/plugin-codex/scripts/cc.mjs:1209`.
- `formatFollowup` trusts `turn.result.finalMessagePreview` first at `packages/plugin-codex/scripts/lib/format.mjs:191`. JSON `job.resultPreview` is also sourced from the same `turn.result` at `packages/plugin-codex/scripts/lib/format.mjs:202`.
- `reconcileJob` starts from the existing `job.result` at `packages/runtime/src/reconciler.ts:340` and `packages/runtime/src/reconciler.ts:410`, reads artifacts transcript-first at `packages/runtime/src/reconciler.ts:419`, and mirrors `newResult` onto the last turn at `packages/runtime/src/reconciler.ts:589`. If artifacts are stale, the mirror can make the new turn carry a previous-turn result.
- Review has an extra flush wait and second reconcile at `packages/plugin-codex/scripts/cc.mjs:1697`; plain followup does not.

## Root Cause

The dispatcher has two separate notions of completion:

1. Transport completion: `driver.send` returns a `TurnHandle`.
2. Reconciled result ownership: `reconcileJob` decides what result to mirror onto the latest turn.

Those are not currently tied to a turn identity. If the post-send reconcile sees old transcript/log/sidecar data, the latest turn can be stamped with a result that belongs to the prior turn. The formatter then presents that stale result as the immediate answer.

There is a second, lower-level risk in `attachAndSend`: the driver can read `finalSidecar.output.result` at `packages/driver-claude-code/src/attach.ts:476`, but that field is not proven to differ from the pre-send sidecar snapshot. The formatter-level fix below still protects users when both `turn.result` and `sendResult.finalMessage` are stale.

## Recommended Minimal Fix

Make immediate followup output conservative and provenance-aware. Do not print a preview if the only available preview is indistinguishable from the previous turn.

Implementation sketch:

1. In `sendFollowupTurn`, capture the previous preview before appending the new turn:

   ```js
   const previousTurn = job.turns[job.turns.length - 1];
   const previousTurnPreview =
     previousTurn?.result?.finalMessagePreview ?? job.result?.finalMessagePreview ?? null;
   ```

2. Return it with the existing data:

   ```js
   return { finalJob, sendResult, newTurnIndex, previousTurnPreview };
   ```

3. Extend `formatFollowup` with an optional metadata argument:

   ```js
   formatFollowup(finalJob, sendResult, newTurnIndex, json, { previousTurnPreview })
   ```

4. In `formatFollowup`, choose preview fields like this:

   - `turnPreview = turn?.result?.finalMessagePreview ?? null`
   - `sendPreview = turnHandle?.finalMessage ? turnHandle.finalMessage.slice(0, 160) : null`
   - `turnPreviewIsPrevious = turnPreview && previousTurnPreview && turnPreview === previousTurnPreview`
   - If `turnPreviewIsPrevious` and `sendPreview && sendPreview !== previousTurnPreview`, use `sendPreview` with `previewSource: "sendResult"`.
   - If `turnPreviewIsPrevious` and no distinct `sendPreview` exists, omit both `job.resultPreview` and `turn.finalMessagePreview`, and add `turn.stalePreview: true`, `turn.previousTurnPreview`, and `turn.resultPending: true`.
   - Otherwise use `turnPreview` first, then `sendPreview`.

5. For human output, do not print the previous preview. If stale/pending, print a short hint such as:

   ```text
   Result preview pending; run $claude-result <jobId> after status settles.
   ```

This is smaller than adding a followup-wide sleep/reconcile delay, and it fixes the honesty problem even when reconciliation is still racing.

## Optional Hardening

After the formatter fix, consider tightening `attachAndSend` so a sidecar-complete observation only yields `finalMessage` when `output.result` differs from the pre-send snapshot or when another post-send freshness signal exists. That belongs in `packages/driver-claude-code/src/attach.ts` near the completion loop at `packages/driver-claude-code/src/attach.ts:429`. This is more invasive because identical repeat answers are valid.

## Tests To Add

Add these to `packages/plugin-codex/test/dispatcher.test.mjs`, near the existing followup T8 tests.

1. `Plan0022-FP1: followup --json prefers fresh sendResult over stale reconciled previous transcript`

   Setup:

   - Use `writeSyntheticAwaitingFollowupJob({ resultContent: "P22_PREVIOUS_READY" })`.
   - Use `writeMockAgentSession` and `writeMockIdleSidecar`.
   - Pre-create the mock transcript path from the session with one old assistant message containing `P22_PREVIOUS_READY`.
   - Configure mock Claude with `{ "attachResponse": "P22_FOLLOWUP_OK" }`.
   - Run `followup <jobId> --json --yes -- "..."`.

   Assertions:

   - Exit code is 0.
   - `parsed.turn.index === 1`.
   - `parsed.turn.finalMessagePreview` is `P22_FOLLOWUP_OK`, or at minimum is not `P22_PREVIOUS_READY`.
   - `parsed.job.resultPreview` is not `P22_PREVIOUS_READY`.
   - If metadata is added, assert `parsed.turn.previewSource === "sendResult"` and `parsed.turn.stalePreview !== true`.

2. `Plan0022-FP2: followup --json marks stalePreview and omits finalMessagePreview when only previous preview is available`

   This can be a formatter unit test if adding a direct formatter test is cleaner:

   - Build a job with two turns where turn 1 has `result.finalMessagePreview: "P22_PREVIOUS_READY"`.
   - Pass `turnHandle.finalMessage: "P22_PREVIOUS_READY"` and `{ previousTurnPreview: "P22_PREVIOUS_READY" }`.

   Assertions:

   - `turn.finalMessagePreview` is `null` or absent.
   - `job.resultPreview` is `null` or absent.
   - `turn.stalePreview === true`.
   - `turn.previousTurnPreview === "P22_PREVIOUS_READY"`.

3. `Plan0022-FP3: followup human output does not print a previous-turn preview`

   Use the same stale setup as FP2 or FP1 in non-JSON mode.

   Assertions:

   - stdout does not contain `P22_PREVIOUS_READY`.
   - stdout contains a pending/poll hint if no fresh preview is available.

4. `Plan0022-FP4: followup --json keeps fresh reconciled turn preview`

   Existing happy path with normal mock sidecar should still expose the current followup response. This protects consumers that already read `turn.finalMessagePreview`.

Also update or add a small formatter test for `packages/plugin-codex/scripts/lib/format.mjs` because the core selection logic is pure and easier to pin down than dispatcher timing.

## Compatibility Risks

- JSON consumers that assume `turn.finalMessagePreview` is always a string after `turn.status: "completed"` must handle `null`/absence plus `resultPending` or `stalePreview`.
- If a user intentionally asks for the exact same output as the previous turn, the conservative guard can mark it stale. That is acceptable for immediate output; a later `result --json` poll can still show the reconciled result.
- Adding `previousTurnPreview` duplicates a small amount of previous output. Keep it preview-length only. Do not include full prior result text.
- If source files are changed, update the mirrored marketplace copy under `marketplace/plugins/cc/scripts/` as part of the implementation, since it currently has the same `formatFollowup` and `sendFollowupTurn` behavior.

## Verification

Run:

```sh
npm run build
node --test packages/plugin-codex/test/dispatcher.test.mjs
```

If driver hardening is included, also run:

```sh
node --test packages/driver-claude-code/test/send.test.mjs
```
