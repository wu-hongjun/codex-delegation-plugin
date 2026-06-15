# TICKET: Status reconcile and job-store reliability

**Type**: implementation planning ticket
**Owner**: maintainer
**Executor**: Codex/Claude
**Source**: Claude audit lane 2026-06-15 (`job_mqftwmj2_bef6da1e`, shortId `52f09068`) plus direct repo inspection
**Status**: OPEN
**Priority**: P0/P1

## Problem

`cc status --all` and workspace-wide status paths still do too much work per non-terminal job. Each broad status sweep reconciles jobs sequentially, and each active or follow-up-capable job reconcile can spawn a fresh `claude agents --json` process through the driver. With accumulated job-store records this becomes slow enough to make normal Codex use feel blocked, and it also delays transitions such as completed Claude sessions becoming `awaiting_followup`.

There are related reliability gaps in the same area:

- Terminal jobs are still read from disk, and non-terminal historical jobs such as `awaiting_followup` or `needs_input` are still live-reconciled during broad workspace status.
- The job store has no explicit pruning command.
- Lock files are permanent if a process dies while holding one.
- A reconcile write can compute patched owned fields from a pre-lock snapshot, then merge into a newer locked record.
- `cc result` can refuse a job that has a persisted result when the session is currently `needs_input` or otherwise non-terminal.

## Evidence

- `packages/plugin-codex/scripts/cc.mjs:1069` to `1080`: broad status loops through jobs and calls `reconcileJob` sequentially.
- `packages/runtime/src/reconciler.ts:441` to `456`: `reconcileJob` calls `adapter.status`.
- `packages/driver-claude-code/src/agents-json.ts:309` to `348`: `getAgentsJson` shells out to `claude agents --json`.
- `packages/driver-claude-code/src/agents-json.ts:352` to `357`: `statusForSession` reads the agents JSON snapshot for one session.
- `packages/runtime/src/reconciler.ts:920` to `944`: workspace reconcile loops over listed jobs.
- `packages/runtime/src/job-store.ts:480` to `545`: listing workspace jobs reads and parses every job record, then filters by workspace.
- `packages/runtime/src/job-store.ts:6` to `7`: stale-lock reaping is explicitly not implemented.
- `packages/runtime/src/job-store.ts:77` to `103`: `acquireLock` fails on existing lock and does not recover stale locks.
- `packages/runtime/src/reconciler.ts:803` to `828`: update fields are computed before the locked update merges them into the current record.
- `packages/plugin-codex/scripts/cc.mjs:904` to `914`: CLI broad status already skips terminal jobs before reconciliation, so the hot path is non-terminal accumulated records rather than completed/failed/stopped records.
- `packages/plugin-codex/scripts/cc.mjs:1140` to `1147`: `cc result` only checks the latest turn for a completed turn result, so an earlier completed result can be hidden by a later `needs_input` turn.
- Audit lane A confirmed the call chain: `reconcileJob` -> `adapter.status` -> driver status -> `statusForSession` -> fresh `claude agents --json`.
- Prior local observation on 2026-06-15: job store contained hundreds of records and broad status was materially slower than focused `--job` status.
- Second-pass no-Bash audit (`job_mqfv74x2_5ff2b913`) confirmed the evidence above and corrected the scope: CLI terminal-skip exists, lock metadata already exists, and result retrieval should scan backward for the latest completed turn with a result.

## Scope

1. Make broad status use one `claude agents --json` snapshot per sweep where possible.
   - Add a driver or adapter API that accepts a preloaded agents snapshot.
   - Keep focused `status --job` cheap and direct.
   - Preserve behavior when the snapshot cannot be loaded.

2. Keep terminal jobs out of live reconciliation everywhere, but focus the CLI fix on non-terminal accumulation.
   - CLI `cmdStatus` already skips `completed`, `failed`, `stopped`, and `orphaned`.
   - Confirm whether `reconcileJobsForWorkspace` has non-test callers before optimizing it.
   - Treat accumulated `awaiting_followup` and `needs_input` records as the main broad-status cost.

3. Add a pruning command.
   - Suggested shape: `cc prune [--older-than <duration>] [--terminal-only] [--dry-run] [--json]`.
   - Delete the job record and associated event/result/turn-result files owned by that job.
   - Default must be conservative and terminal-only.

4. Add stale-lock recovery.
   - Lock files already include pid, hostname, operation, and creation time.
   - Reap only when the owner is clearly gone or the lock age exceeds a conservative threshold.
   - Use same-host pid liveness only when `hostname` matches; cross-host recovery should be age-based.
   - Reap atomically and retry lock acquisition so two reapers cannot both claim the lock.
   - Emit an event or warning when a stale lock is reaped.

5. Recompute reconciler-owned fields inside the locked update.
   - Avoid overwriting user-owned or concurrent fields from a stale pre-lock snapshot.
   - Preserve concurrent `turns` appends; do not replace the current turn array with a pre-lock array.
   - Be careful with result artifact writes that use the pre-lock latest-turn index.
   - Add a regression test where another writer updates the record between read and lock.

6. Make result retrieval friendlier when a result is already persisted.
   - `cc result <job>` already handles the latest turn when that latest turn is completed.
   - It should scan backward for the latest completed turn result, so a later `needs_input` turn does not hide an earlier completed result.
   - Preserve a clear message that the job is not terminal if more work may still occur.

## Verification

- Unit test broad workspace status with a mocked driver and assert `claude agents --json` is called once per sweep, not once per active job.
- Seed a store with terminal, `awaiting_followup`, and `needs_input` records and assert terminal records are not reconciled while the remaining non-terminal path uses the shared snapshot.
- Add stale-lock tests covering active pid, dead pid, too-new unknown pid, and old unknown pid.
- Add prune tests for dry-run, terminal-only deletion, and preservation of active jobs.
- Add a fixture where `turns[0]` is completed with a result, `turns[1]` is `needs_input`, and job status is `needs_input`; assert `cc result` shows the completed turn result.
- Re-run the full runtime and plugin test suites plus `node tools/package-marketplace.mjs --check`.

## Acceptance Criteria

- Broad status performance is proportional to active jobs plus one agents snapshot, not all historical jobs times one subprocess.
- A repo with hundreds of stale terminal jobs can be pruned safely through a supported command.
- Stale job-store locks no longer require manual filesystem cleanup in normal crash scenarios.
- `cc result` is useful for jobs with completed output even if the Claude session is currently waiting for input.

## Guardrails

- Do not treat the known F2b cross-contamination symptom as a plugin defect in this ticket.
- Build tests from captured real records where behavior depends on Claude Code sidecars or transcripts.
