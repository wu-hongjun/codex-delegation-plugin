# Plan 0022 Round 2 Installed Retest

Date: 2026-06-12

Installed plugin:

```text
cc@cc-plugin-codex-local  installed, enabled  0.3.3    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc
```

Install refresh:

```sh
codex plugin remove cc@cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
```

Cached dispatcher:

```text
/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs
```

## Harness

Four Claude Code lanes were launched through the installed dispatcher:

- Lane A: CLI/help/setup/status/workflows JSON contracts.
- Lane B: delegate/result/followup/per-turn result snapshots.
- Lane C: review/adversarial-review provenance.
- Lane D: workflow/deep-research inspector behavior.

The first launch without `--permission-mode bypassPermissions` reached
`needs_input` in all four lanes before running shell checks. Those jobs were
stopped cleanly:

- `job_mqbc0yig_08556828`
- `job_mqbc0ytp_3206252d`
- `job_mqbc0yox_8b7eb9ee`
- `job_mqbc0yzi_86552b91`

The lanes were relaunched with explicit
`--permission-mode bypassPermissions` for unattended sandbox testing:

- Lane A: `job_mqbc3t12_91084935`
- Lane B: `job_mqbc3tfs_d9838644`
- Lane C: `job_mqbc3t97_2001d458`
- Lane D: `job_mqbc3t3h_a3a80c8f`

## Results

### Lane A - CLI Contracts: PASS

Lane A verified the installed dispatcher with no file edits:

- `setup --json` parsed successfully.
- `workflow --help`, `deep-research --help`, and `workflows --help` printed command-specific help.
- `status --json --compact` parsed successfully and did not include `driver` or `capabilitiesSnapshot`.
- `workflows --json` parsed successfully with a top-level `sessions` array.

### Lane B - Followup Snapshot: FAIL, Nested Path

Nested job: `job_mqbc4b7r_257e1b2f`.

Positive evidence:

- Turn 0 produced `P22_R2_FOLLOWUP_INITIAL`.
- Per-turn result paths existed and were distinct:
  - `job_mqbc4b7r_257e1b2f.turn-0.result.md`
  - `job_mqbc4b7r_257e1b2f.turn-1.result.md`

Failure evidence:

- The follow-up failed immediately with `attach lock busy for session \`claude\``.
- The job became terminal `failed`.
- Turn 1 was `failed` but still got a stale result preview from turn 0 (`P22_R2_FOLLOWUP_INITIAL`), and top-level `job.result` advanced to the turn-1 result path.
- The nested job record had `claude.shortId: "claude"` while `claude.sessionId` was `f9232581-...`.

Coordinator follow-up control, direct from Codex rather than nested inside Claude Code, passed:

- Job `job_mqbcbkpp_f46c8c36`, shortId `d8905246`.
- Turn 0 result path: `job_mqbcbkpp_f46c8c36.turn-0.result.md`, preview `P22_R2_COORD_INITIAL`.
- Turn 1 result path: `job_mqbcbkpp_f46c8c36.turn-1.result.md`, preview `P22_R2_COORD_SECOND`.
- Immediate `followup --json` marked `stalePreview: true`/`resultPending` before reconciliation, then later `result --json` returned the second marker.
- `cc stop` succeeded.

### Lane C - Review Provenance: PASS Core, Nested Defects Found

Nested source job: `job_mqbc4akm_ebe0bd3d`.
Nested adversarial review job: `job_mqbc5ha3_5ac71dd8`.

Core pass:

- Source job had two turns: original turn 0 and same-session review turn 1.
- Adversarial review persisted `reviewOf: { jobId: "job_mqbc4akm_ebe0bd3d", turnIndex: 0 }`, correctly targeting the original non-review turn.
- Adversarial review produced a pass verdict with 0 findings.

Nested defects:

- Nested jobs again stored `claude.shortId: "claude"` despite known session IDs (`efa19d2e...`, `dfcbed8a...`).
- The lane observed `review --json` exit 13 with no JSON while the underlying review work still completed. A direct coordinator control did not reproduce this.
- `cc stop` failed for the nested source and adversarial jobs because it tried `claude stop claude`.

Coordinator review control passed:

- Job `job_mqbcdrws_2a6e9adc`, shortId `8d614e25`.
- `review --yes --json` exited 0 and returned parseable JSON with verdict `pass`.
- `cc stop` succeeded.

### Lane D - Workflow Inspector: PASS Core, Nested Stop Fails

Nested workflow job: `job_mqbc4cok_efe0d08e`.
Nested deep-research job: `job_mqbc4h47_ae2481f6`.

Core pass:

- Both jobs launched with `--permission-mode bypassPermissions`.
- `workflows --json` listed both jobs with correct kinds:
  - `dynamic_workflow`
  - `deep_research`
- `workflows <jobId> --json` inspected both jobs successfully.

Failure evidence:

- Both job records stored `claude.shortId: "claude"`.
- `cc stop <jobId> --json` failed with `DriverError: "claude stop claude exited 1"`.
- The underlying agents had to be stopped out-of-band with real session prefixes (`334c639f`, `77f239ca`).

## Findings

### High - Nested cc launches can persist `claude.shortId: "claude"`

All five nested jobs launched from inside Claude Code during this round stored
`claude.shortId: "claude"`:

- `job_mqbc4akm_ebe0bd3d` -> session `efa19d2e...`
- `job_mqbc4b7r_257e1b2f` -> session `f9232581...`
- `job_mqbc4cok_efe0d08e` -> session `334c639f...`
- `job_mqbc4h47_ae2481f6` -> session `77f239ca...`
- `job_mqbc5ha3_5ac71dd8` -> session `dfcbed8a...`

Impact:

- `cc stop <jobId>` calls `claude stop claude` and fails.
- `logsCommand` becomes `claude logs claude`.
- Follow-up/review attach locking is keyed to `claude`, creating cross-job lock contention in nested use.
- Attach guidance would be wrong for these jobs.

Direct coordinator jobs launched from Codex did not show this; they stored hex short IDs and stopped cleanly.

### Medium - Failed follow-up turn can inherit stale previous result

`job_mqbc4b7r_257e1b2f` turn 1 failed before reaching Claude, but the reconciled
turn result and top-level result still pointed at a turn-1 snapshot containing
turn 0's `P22_R2_FOLLOWUP_INITIAL` output. A failed turn should not advance
`job.result` to stale prior output.

This may be downstream of the nested `shortId:"claude"` issue, but the stale
failed-turn result is still a separate record integrity problem.

### Environmental/Harness Note - Permission gates

When the four lane jobs were launched without a permission override, all four
stopped at `needs_input` before running shell checks. For unattended installed
testing, the harness needs an explicit Claude permission mode such as
`--permission-mode bypassPermissions`. This is not treated as a plugin defect.

## Cleanup

Top-level lane jobs and coordinator control jobs were stopped through `cc stop`.

Nested jobs with `shortId:"claude"` could not be stopped through `cc stop`; they
were stopped out-of-band by real session ID prefix where needed:

- `334c639f`
- `77f239ca`
- `efa19d2e`
- `dfcbed8a`
- `f9232581`

Final `claude agents --json` check found no `p22-round2`, `p22-r2`, `mqbc4`, or
`mqbc5` matches.
