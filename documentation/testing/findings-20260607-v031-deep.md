# cc-plugin-codex v0.3.1 Deep Test Findings

Env: `claude --version` = `2.1.168 (Claude Code)`; `codex --version` = `codex-cli 0.137.0`; OS = macOS 26.5.1 (25F80); plugin = `cc@cc-plugin-codex-local 0.3.1`; local test date = 2026-06-07 EDT.

Dispatcher under test: `node marketplace/plugins/cc/scripts/cc.mjs`.

Pre-flight: `$claude-setup` returned aggregate `warn`, not `fail`. All required gates were `ok` (`claude-version`, auth, `claude-agents-json`, `bg-exec-supported`, `workflows-supported`, `opus-4-8-supported`, trust, pty build). The only setup warning was `claude-bg-flag` not being advertised in `claude --help`.

## 14-Command Matrix

| # | command | status | summary |
| ---: | --- | --- | --- |
| 1 | `$claude-setup` | pass | Plain, `--json`, and rerun all exited 0; JSON parseable with `ok: true`, `status: "warn"`. |
| 2 | `$claude-delegate` | fail | Normal delegate passed, but 3 rapid parallel delegates produced distinct job IDs while jobs B/C shared a Claude session and C returned B's result. |
| 3 | `$claude-status` | fail | Plain/`--all`/`--json` worked, but `<jobId>` and bogus job ID were ignored and returned unfiltered status with exit 0. |
| 4 | `$claude-result` | pass | Human and `--json` result returned `RESULT-CLEAN`; still-running job returned parseable `not complete yet` JSON error. |
| 5 | `$claude-followup` | pass | First, second, and `--json` follow-ups worked; immediate previews were one turn stale and resolved on next poll; stopped-job follow-up errored cleanly. |
| 6 | `$claude-review` | pass | Delegate review passed with `Review verdict: PASS` / `No findings.`; workflow job review ran; `--json` parseable. |
| 7 | `$claude-adversarial-review` | pass | Default, `--model opus`, and `--json` all passed with zero findings. |
| 8 | `$claude-stop` | pass | Single stop worked; B2 stayed `stopped`; bulk awaiting-followup variants worked; bare `--all` rejected. |
| 9 | `$claude-workflow` | partial | Clean workflow and `--json` workflow completed with parallel-agent evidence; one multi-step workflow stayed running past bounded poll and was stopped. |
| 10 | `$claude-goal` | partial | `--json` goal completed (`GOAL-CLEAN-C`); two other bounded goals stayed running past bounded poll and were stopped. |
| 11 | `$claude-fork` | partial | Three fork variations produced recovered outputs and subagent-style work, but the `--name` shortId bug affected those job records. |
| 12 | `$claude-batch` | partial | Small and `--json` batch outputs recovered; batch fan-out occurred; stop-mid-run evidence was recoverable but not a clean early-stop proof. |
| 13 | `$claude-deep-research` | partial | Two research outputs recovered, including adversarial verification evidence; one comparison question only reached "workflow running" before cleanup. |
| 14 | `$claude-workflows` | pass | Plain, `--all`, `--json`, full job ID, 8-char session shortId, and bogus-id error all behaved correctly on clean workflow records. |

## Regression Verdicts

**B1 `$claude-workflows` shortId drill-in: PASS.** Clean workflow `job_mq4pduc3_2074cceb` had session `b77372a5-deb4-4cdb-b4b0-3e9b3b8c2a0a`. Both `cc workflows job_mq4pduc3_2074cceb --all --json` and `cc workflows b77372a5 --all` resolved. Bogus ID returned `[workflows] Error: No workflow found matching job id or session id "bogus-v031-workflow"`.

**B2 `$claude-stop` reconcile: PASS.** Clean job `job_mq4p6i29_8dcefd99` stopped as `stopped`. Three later result/reconcile checks at 5-second intervals stayed `stopped`; it did not flip to `orphaned`.

## Severity Summary

### Blocker

None found.

### High

1. **Rapid parallel delegate session/result contamination.** Three rapid no-name delegates got distinct job IDs: `job_mq4pd5yi_f9fdc6a9`, `job_mq4pd5yi_dbb64fd1`, `job_mq4pd5ym_1e9137a3`. Jobs B and C shared `sessionId: 6149c0d7-b0be-44e6-b69b-c6a3031ade53` / PID `7228`, and C's result was `CLEAN-RAPID-B` instead of `CLEAN-RAPID-C`.

2. **`--name` corrupts job `shortId` in records.** Nested test jobs started with `--name cc-v031-*` stored `claude.shortId` as the name string while also storing a real UUID `sessionId`. Example `job_mq4omytc_d318855e`: `shortId: "cc-v031-delegate-todos"`, `sessionId: "1a9e3671-..."`. Human output then printed `Claude session: cc-v031-delegate-todos`; later reconciliation classified many as `orphaned`.

3. **`$claude-status <jobId>` and bogus IDs are not implemented as contracted.** `status job_mq4p6i29_8dcefd99` and `status job_bogus_v031_clean` both exited 0 and printed the full workspace list instead of filtering or reporting a clean no-match error.

### Medium

1. **High fan-out can overload status/probe surfaces.** The 14-worker delegated harness created many concurrent nested `status --all --json` calls. During that window, new starts failed with setup-probe errors such as `claude-auth timed out` and `claude-agents-json timed out`. After stopping `cc-v031` sessions, setup returned to normal `warn`.

2. **Some goal/workflow jobs remain running beyond bounded simple goals.** `job_mq4pin2e_04bc8937`, `job_mq4pirhb_63d22f95`, and workflow `job_mq4pg144_8ee3289c` remained `running` after bounded polls and required explicit stop. This overlaps the known long-runner caveat, so I classify it as partial rather than a confirmed defect.

### Low

1. `$claude-workflows` list shows malformed duplicate short IDs like `job_mq4o` for records affected by the `--name` shortId bug. Clean no-name workflow records list and drill correctly.

## Fan-Out Harness

I spawned one delegated worker per command group:

`setup`, `delegate`, `status`, `result`, `followup`, `review`, `adversarial`, `stop`, `workflow`, `goal`, `fork`, `batch`, `deep-research`, `workflows`.

Worker job IDs included `job_mq4omiji_26018899` (setup), `job_mq4omijs_f6e1327a` (delegate), `job_mq4omiek_e8fd12e7` (status), `job_mq4omijr_9a2f47bb` (result), `job_mq4omijs_ddc493df` (followup), `job_mq4omij5_8252c0e6` (review), `job_mq4omixq_a8556b55` (adversarial), `job_mq4omijr_7a0e6e0a` (stop), `job_mq4omijs_e0b0230c` (workflow), `job_mq4omij0_acd80af3` (goal), `job_mq4omiz8_de40fe4a` (fork), `job_mq4omixx_262c08c5` (batch), `job_mq4omijs_c6f34951` (deep-research), and `job_mq4omijq_fdd30a7a` (workflows).

Raw artifacts: `.omc/cc-v031-deep/`. Several worker artifacts landed (`setup`, `status`, `result`, `review`, `adversarial`, `workflows`), then concurrent status reconciliation overloaded the daemon. I stopped the worker sessions and reran clean no-name direct probes for the critical paths.

## Command Details

### 1. `$claude-setup`

- `node marketplace/plugins/cc/scripts/cc.mjs setup` — pass. Output began `Claude companion setup — warn`; delegate/follow-up capabilities `ok`.
- `node marketplace/plugins/cc/scripts/cc.mjs setup --json` — pass. Parseable JSON with `ok: true`, `status: "warn"`.
- Rerun after cleanup — pass. Same `warn` aggregate; all required gates `ok`.

### 2. `$claude-delegate`

- Read-only summarize TODOs: `delegate --yes --permission-mode bypassPermissions -- "Read README.md..."` — pass/recovered. Result said no literal TODO/FIXME markers.
- Different analysis prompt: `delegate ... "Inspect ... args.mjs..."` — pass/recovered.
- Three rapid parallel delegations — fail. Distinct job IDs were created, but B/C session/result contamination occurred as described above.

### 3. `$claude-status`

- `status job_mq4p6i29_8dcefd99` — fail. Exit 0 but printed full workspace list, not a single-job view.
- `status --all` — pass. Listed cross-workspace records.
- `status --json` — pass. Parseable JSON; clean target showed `awaiting_followup`.
- `status job_bogus_v031_clean` — fail. Exit 0 and full list; expected clean error.

### 4. `$claude-result`

- Human result on `job_mq4pcg6u_87b2db7a` — pass. Output included `RESULT-CLEAN`.
- `result job_mq4pcg6u_87b2db7a --all --json` — pass after completion; `resultText: "RESULT-CLEAN"`.
- Still-running result — pass. Early `result --json` returned `ok: false` with `Job ... is not complete yet (status: running). Run: cc status`.

### 5. `$claude-followup`

- One follow-up on `job_mq4p6i29_8dcefd99` — pass. Final poll showed `CLEAN-FU1`.
- Second follow-up — pass. Final poll showed `CLEAN-FU2`.
- `followup --json` — pass with known stale preview. Immediate JSON preview showed `CLEAN-FU2`; next poll showed `CLEAN-FU3`.
- Follow-up on stopped job — pass. Error: `Job job_mq4p6i29_8dcefd99 is stopped; start a new $claude-delegate job instead.`

### 6. `$claude-review`

- Review delegate job — pass. `Review verdict: PASS` and `No findings.`
- Review workflow job `job_mq4pduc3_2074cceb` — pass. Review ran and returned `PASS WITH FINDINGS (1 finding: 1 nit)`.
- `review --json` — pass. Parseable JSON with `verdict: "pass"`, `findingsCount: 0`.
- Zero-findings rendering — pass. No `PASS WITH FINDINGS (0 findings: )` string appeared.

### 7. `$claude-adversarial-review`

- Default model on `job_mq4p6i29_8dcefd99` — pass. Review job `job_mq4pac23_5fa9c0b4`, `PASS`, no findings.
- `--model opus` — pass. Review job `job_mq4paruy_dc4cf8c4`, `PASS`, no findings.
- `--json` — pass. Review job `job_mq4pbesh_560255b6`; parseable JSON with `ok: true`.

### 8. `$claude-stop`

- Single stop: `stop job_mq4p6i29_8dcefd99 --all` — pass. Printed `Status: stopped`.
- `stop --all-awaiting-followup` — pass during harness; stopped workspace awaiting jobs.
- `stop --all-awaiting-followup --all` — pass. Final cleanup stopped 14 awaiting-followup jobs.
- Bare `stop --all` — pass. Exit 2 with `bare --all is not allowed; use --all-awaiting-followup [--all]...`.

### 9. `$claude-workflow`

- Survey/recommend clean workflow `job_mq4pduc3_2074cceb` — pass. Result: `Both parallel agents completed. No files were edited.`
- Different workflow `job_mq4pg144_8ee3289c` — partial. Stayed running through bounded poll; stopped during cleanup.
- `--json` workflow `job_mq4pg5ei_c3d4a274` — pass. Result ended with `(2 agents, ~33s, 35k tokens.)`.
- Fan-out evidence: result text reported parallel agents; `$claude-workflows ... --json` returned 30 phase records. `subagents: []` matched the known non-bug.

### 10. `$claude-goal`

- Bounded goal `job_mq4pin2e_04bc8937` — partial. Still running after bounded poll; stopped.
- Different goal `job_mq4pirhb_63d22f95` — partial. Still running after bounded poll; stopped.
- `--json` goal `job_mq4pivv9_e2385802` — pass. Result `GOAL-CLEAN-C` and `The goal is met.`

### 11. `$claude-fork`

- Explain-code directive — partial/pass. Recovered result summarized `cc.mjs` dispatch switch and identified the 14 command handlers.
- Second directive — partial/pass. Recovered result explained short workflow ID resolution in `workflows-inspector.mjs`.
- `--json` marker — partial/pass. Recovered result contained `FORK-JSON-MARKER`.
- Caveat: these ran through the named worker harness and therefore their job records were affected by the `--name` shortId bug.

### 12. `$claude-batch`

- Small bounded batch — pass/recovered. Result summarized `claude-delegate` and `claude-status` contracts.
- `--json` marker — pass/recovered. Result contained `BATCH-JSON-MARKER`.
- Stop-mid-run — partial. One run reported `5 parallel inspection workers`; cleanup later stopped the related session, but the exact mid-run stop assertion was not cleanly isolated.

### 13. `$claude-deep-research`

- Node permission model question — pass/recovered. Cited Node docs and explained permission model purpose and non-security-boundary caveat.
- Deno vs Node permissions — partial. Output only reached "workflow is running in the background" before cleanup.
- `--json` France question — pass/recovered. Result: Paris, with `3-0` adversarial verification evidence and source citation.

### 14. `$claude-workflows`

- Plain list — pass. Listed workflow sessions.
- Drill by displayed 8-char session ID `b77372a5` — pass. Printed `Workflow session: b77372a5-deb4-4cdb-b4b0-3e9b3b8c2a0a`.
- Drill by full job ID `job_mq4pduc3_2074cceb` — pass.
- `--all` — pass.
- `--json` — pass. Parseable `sessions` array.
- Bogus ID — pass. Clean no-match error.

## Edge Cases

- Forbidden `--allow-edit`: pass. `review`, `adversarial-review`, `workflow`, `goal`, `fork`, `batch`, `deep-research`, and `workflows` all exited 2 with `not applicable`.
- Empty/whitespace delegate prompt: pass. Exit 2 with `prompt is required: cc delegate -- "<prompt>"`.
- Non-TTY stdin: pass. `printf 'test\n' | cc delegate --yes` exited 2 with prompt-required error and did not start a job.
- Workspace isolation: pass. Delegate from `/tmp/cc-v031-isolation2-*` created `job_mq4ppjve_4253474f`; local `status` did not include it, `status --all` did.
- Privacy disclosure: pass. Fresh `/tmp/cc-v031-privacy-*` without `--yes` exited 1 with `Privacy acknowledgement required`; `--yes` started `job_mq4pp1sz_be6167c6`; a second delegate in the same workspace without `--yes` exited 0 and did not re-prompt.

## Cleanup

Required cleanup command:

```bash
node marketplace/plugins/cc/scripts/cc.mjs stop --all-awaiting-followup --all
```

It stopped 14 awaiting-followup jobs. I then explicitly stopped the three remaining running jobs from this run:

```bash
node marketplace/plugins/cc/scripts/cc.mjs stop job_mq4pg144_8ee3289c --all
node marketplace/plugins/cc/scripts/cc.mjs stop job_mq4pin2e_04bc8937 --all
node marketplace/plugins/cc/scripts/cc.mjs stop job_mq4pirhb_63d22f95 --all
```

Final plugin status summary from `.omc/cc-v031-deep/final-status-all.json`:

```json
{
  "total": 129,
  "counts": {
    "orphaned": 110,
    "needs_input": 1,
    "stopped": 18
  },
  "activeV031": []
}
```

The one remaining `needs_input` job (`job_mq36pwuq_78224539`) was present in the baseline before this run and was not spawned by this test.
