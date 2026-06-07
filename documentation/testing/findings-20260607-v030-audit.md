# cc-plugin-codex v0.3.0 Pre-Release Audit Findings

| # | Test | Status | Notes |
|---|---|---|---|
| 1 | $claude-setup aggregate | pass | Aggregate `warn`; no FAIL probes. Only warning was non-gating `claude-bg-flag` help-text omission. |
| 2 | bg-flow chain: delegate -> status -> result -> followup -> result | pass | `job_mq3uhed6_645f8a5e`; `MARKER-A` then `MARKER-B` observed. NIT: `status <jobId>` accepted the arg but printed the full workspace list. |
| 3 | PLAN 0017: workflow inspection/result regression | partial | `job_mq3ulptz_4c42ac77`; workflow is visible and `MARKER-W` observed, but inspector metadata has blank `Workflow session`/`Name`, and literal `workflow <jobId>` starts a new job. |
| 4 | $claude-goal smoke | timed-out | `job_mq3uotsd_09fee798` stayed `running` for 16 polls; stopped. Post-stop result contained `MARKER-G` but status reported `orphaned`. |
| 5 | $claude-fork smoke | pass | `job_mq3uypkq_c61705e4`; reached `awaiting_followup`, result contained `MARKER-F`, stop succeeded. |
| 6 | $claude-batch smoke | timed-out | `job_mq3v03sd_3f41ea96` stayed `running` for 16 polls; stopped. Post-stop result contained `MARKER-B-batch` but status reported `orphaned`. |
| 7 | $claude-deep-research smoke | pass | `job_mq3v8w3j_ce3837f0`; reached `awaiting_followup`, result answered `4`, stop succeeded. Output explicitly skipped expensive research fan-out. |
| 8 | $claude-review on delegate job | pass | Same-session review returned PASS; original job remained `awaiting_followup`; `$claude-result` surfaced review output. |
| 9 | $claude-adversarial-review on delegate job | pass | New job `job_mq3vb6ba_66a63326`; reached `awaiting_followup`, result verdict `pass`, stop succeeded. NIT: initial output said `PASS WITH FINDINGS (0 findings: )`. |
| 10 | $claude-fork --allow-edit rejects with exit 2 | pass | Exit 2 with `[fork] Error: --allow-edit is not applicable to $claude-fork.` |
| 11 | $claude-batch --allow-edit rejects with exit 2 | pass | Exit 2 with `[batch] Error: --allow-edit is not applicable to $claude-batch.` |
| 12 | $claude-workflows --allow-edit rejects with exit 2 | pass | Exit 2 with `[workflows] Error: --allow-edit is not applicable to $claude-workflows.` |
| 13 | $claude-deep-research --allow-edit rejects with exit 2 | pass | Exit 2 with `[deep-research] Error: --allow-edit is not applicable to $claude-deep-research.` |
| 15 | $claude-review freeform prompt rejects with delegate hint | pass | Exit 1 with `[review] Hint` suggesting `$claude-delegate`. |
| 16 | $claude-adversarial-review freeform prompt rejects with adversarial hint | pass | Exit 1 with `[adversarial-review] Hint` suggesting `$claude-delegate`; hint text also names `$claude-adversarial-review`. |

## Environment

- Required install refresh:
  - `codex plugin remove cc --marketplace cc-plugin-codex-local`: pass
  - `codex plugin add cc@cc-plugin-codex-local`: pass
  - `codex plugin list | grep cc@cc-plugin-codex-local`: `cc@cc-plugin-codex-local  installed, enabled  0.3.0    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc`

## Detailed Findings

### 1. $claude-setup aggregate

- Command: `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs setup`
- Exit: 0
- Result: aggregate `warn`; delegate and follow-up capabilities both `ok`.
- Unexpected FAIL probes: none.
- Warning observed: `claude-bg-flag` because `--bg` is not advertised in `claude --help`; setup text labels this informational and non-gating.

### 2. Bg-flow chain: delegate -> status -> result -> followup -> result

- Delegate command: `delegate --yes -- "Print MARKER-A then stop."`
- Job ID: `job_mq3uhed6_645f8a5e`
- Status: reached `awaiting_followup`.
- First result: contained `MARKER-A`.
- Followup command: `followup job_mq3uhed6_645f8a5e -- "Now print MARKER-B."`
- Followup status: returned to `awaiting_followup`.
- Second result: contained `MARKER-B`.
- NIT: `status job_mq3uhed6_645f8a5e` did not filter or show a single-job detail; it printed the full workspace list with the target job line included.

### 3. PLAN 0017: workflow inspection/result regression

- Workflow command: `workflow --yes -- "Print MARKER-W then stop. Be very brief; no file reads."`
- Workflow job ID: `job_mq3ulptz_4c42ac77`
- `$claude-workflows job_mq3ulptz_4c42ac77`: found the job and printed `Status` and `CWD`, so the Plan 0017 invisibility regression is fixed.
- Failure: the drill-in output left `Workflow session:` blank and `Name:` blank:
  - `Workflow session: `
  - `Name:      `
  - `Status:    awaiting_followup`
  - `CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex`
- `$claude-workflows --json`: parseable JSON with a `sessions` array.
- JSON issue: workflow entries have empty `sessionId` and `name`; `shortId` falls back to the job id prefix instead of the Claude session id.
- Staleness issue: `$claude-workflows --json` initially reported the new workflow as `running`; `$claude-status --json` reconciled it to `awaiting_followup`.
- `$claude-result job_mq3ulptz_4c42ac77`: contained `MARKER-W`.
- `$claude-stop job_mq3ulptz_4c42ac77`: exit 0, status `stopped`.
- Literal command from test text: `workflow job_mq3ulptz_4c42ac77` started a new workflow job (`job_mq3unua6_a3360f9c`) rather than inspecting the existing workflow. The extra job was stopped successfully. This appears to be either a test typo for `$claude-workflows <jobId>` or a command-surface mismatch.

### 4. $claude-goal smoke

- Command: `goal --yes -- "Print MARKER-G and stop. Stop after the print."`
- Job ID: `job_mq3uotsd_09fee798`
- Polling: stayed `running` through 16 polls; never reached `awaiting_followup` within the requested window.
- Pre-stop result: exit 1, `Job job_mq3uotsd_09fee798 is not complete yet (status: running).`
- Stop: exit 0, printed status `stopped`.
- Post-stop result: exit 0, printed status `orphaned` and contained `MARKER-G`.
- Findings:
  - Timed out per contract even though output was eventually recoverable.
  - Status inconsistency: stop printed `stopped`, but subsequent result printed `orphaned`.

### 5. $claude-fork smoke

- Command: `fork --yes -- "Print MARKER-F then stop. One short turn, no file ops."`
- Job ID: `job_mq3uypkq_c61705e4`
- Polling: reached `awaiting_followup` on poll 2.
- Result: contained `MARKER-F`.
- Stop: exit 0, status `stopped`.

### 6. $claude-batch smoke

- Command: `batch --yes -- "Print MARKER-B-batch then stop. No subagents."`
- Job ID: `job_mq3v03sd_3f41ea96`
- Polling: stayed `running` through 16 polls; never reached `awaiting_followup` within the requested window.
- Pre-stop result: exit 1, `Job job_mq3v03sd_3f41ea96 is not complete yet (status: running).`
- Stop: exit 0, printed status `stopped`.
- Post-stop result: exit 0, printed status `orphaned` and contained `MARKER-B-batch`.
- Findings:
  - Timed out per contract even though output was eventually recoverable.
  - Same stop/result status inconsistency seen in the goal smoke.

### 7. $claude-deep-research smoke

- Command: `deep-research --yes -- "What is 2 plus 2? Brief."`
- Job ID: `job_mq3v8w3j_ce3837f0`
- Polling: reached `awaiting_followup` on poll 1.
- Result: answered `4`.
- Stop: exit 0, status `stopped`.
- Note: the result explicitly said it skipped the deep-research fan-out because arithmetic did not need web research. This is acceptable for the requested cheap deterministic probe, but it means the smoke primarily validates dispatch/result plumbing rather than actual research fan-out.

### 8. $claude-review on delegate job

- Command: `review job_mq3uhed6_645f8a5e`
- Review output: `Review verdict: PASS`, `No findings.`
- Status check: original delegate job remained `awaiting_followup`.
- `$claude-result job_mq3uhed6_645f8a5e`: surfaced the review output with JSON verdict `pass` and an explanatory paragraph.

### 9. $claude-adversarial-review on delegate job

- Command: `adversarial-review job_mq3uhed6_645f8a5e`
- New adversarial job ID: `job_mq3vb6ba_66a63326`
- Initial output: `Review verdict: PASS WITH FINDINGS (0 findings: )`, `Turn: 0 (running)`.
- Polling: reached `awaiting_followup` on poll 1.
- Result: JSON verdict `pass`, findings `[]`.
- Stop: exit 0, status `stopped`.
- NIT: `PASS WITH FINDINGS (0 findings: )` is confusing/wrong labeling for an empty findings list and appeared before the job had settled.

### Final cleanup of delegate job from test 2

- Command: `stop job_mq3uhed6_645f8a5e`
- Exit: 0
- Result: status `stopped`.

### 10. $claude-fork --allow-edit rejects with exit 2

- Command: `fork --allow-edit "test"`
- Exit: 2
- Output: `[fork] Error: --allow-edit is not applicable to $claude-fork.`

### 11. $claude-batch --allow-edit rejects with exit 2

- Command: `batch --allow-edit "test"`
- Exit: 2
- Output: `[batch] Error: --allow-edit is not applicable to $claude-batch.`

### 12. $claude-workflows --allow-edit rejects with exit 2

- Command: `workflows --allow-edit "test"`
- Exit: 2
- Output: `[workflows] Error: --allow-edit is not applicable to $claude-workflows.`

### 13. $claude-deep-research --allow-edit rejects with exit 2

- Command: `deep-research --allow-edit "test"`
- Exit: 2
- Output: `[deep-research] Error: --allow-edit is not applicable to $claude-deep-research.`

### 15. $claude-review freeform prompt rejects with delegate hint

- Command: `review "this is a freeform prompt"`
- Exit: 1
- Output included `[review] Hint: $claude-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?`
- Output also included `[review] Error: No job found matching "this is a freeform prompt" in this workspace. Re-run with --all to search every workspace.`

### 16. $claude-adversarial-review freeform prompt rejects with adversarial hint

- Command: `adversarial-review "freeform prompt"`
- Exit: 1
- Output included `[adversarial-review] Hint: $claude-adversarial-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?`
- Output also included `[adversarial-review] Error: No job found matching "freeform prompt" in this workspace. Re-run with --all to search every workspace.`
- Note: the label is correct (`[adversarial-review]`). The hint text also names `$claude-adversarial-review`; the test parenthetical was malformed, so this is recorded for release-owner interpretation.

## Final Cleanup

- Command: `stop --all-awaiting-followup`
- Exit: 0
- Output: `No awaiting-followup Claude jobs found for this workspace.`
- Additional cleanup: stopped pre-existing stale `needs_input` job `job_mq36pwuq_78224539` so final status would satisfy the requested no-`needs_input` criterion.
- Command: `status --all`
- Exit: 0
- Result: no `running`, `needs_input`, or `awaiting_followup` jobs remained; all listed jobs were `orphaned`.

## Environment Footer

- `claude --version`: `2.1.168 (Claude Code)`
- `codex --version`: `codex-cli 0.137.0`
- Plugin version: `cc@cc-plugin-codex-local  installed, enabled  0.3.0    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc`
- Commit SHA: `f778acb15d210cbc036c6caedaa9c3bd1edb6a7e`
- Test date: `2026-06-07 10:22:05 EDT`
