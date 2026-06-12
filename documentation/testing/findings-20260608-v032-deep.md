# cc-plugin-codex v0.3.2 Comprehensive Depth Test Findings

Env: current `claude --version` = `2.1.173 (Claude Code)`; pre-flight first pass saw `2.1.169` and rerun saw `2.1.173`; `codex --version` = `codex-cli 0.137.0`; OS = macOS 26.5.1 (25F80), Darwin 25.5.0 arm64; plugin = `cc@cc-plugin-codex-local 0.3.2`; local test date = 2026-06-11 EDT.

Dispatcher under test: `node marketplace/plugins/cc/scripts/cc.mjs`.

Pre-flight: `$claude-setup` returned aggregate `warn`, not `fail`. All required gates were `ok` (`claude-version`, auth, `claude-agents-json`, logs, transcript path, attach help, bg support, pty build, plugin trust, Opus 4.8, workflows, bg exec). The only warning was the accepted `claude-bg-flag` caveat: `--bg` is not advertised in `claude --help`.

Raw lane artifacts: `documentation/testing/artifacts/v032-deep/01-setup.md` through `15-edge-cases.md`.

## 14-Command Matrix

| # | command | status | summary |
| ---: | --- | --- | --- |
| 1 | `$claude-setup` | pass | Plain, `--json`, and rerun all exited 0; JSON parsed; aggregate stayed accepted `warn` due only to `claude-bg-flag`. |
| 2 | `$claude-delegate` | fail | Normal delegates and F1/F2 passed, but duplicate `--name dup-key-test` did not resume one session and first duplicate result was contaminated by the second marker. |
| 3 | `$claude-status` | pass | Plain, `--all`, and `--json` passed; `<real jobId>` and bogus ID both exited 2 with `cc result` / `cc status --all` guidance. |
| 4 | `$claude-result` | pass | Human and `--json` result worked; still-running result returned clean `not complete yet` error. |
| 5 | `$claude-followup` | pass | First, second, and `--json` followups worked; immediate preview was one turn stale and resolved on poll; stopped-job followup errored cleanly. |
| 6 | `$claude-review` | pass | Full id, unique prefix, `--json`, and zero-findings human text passed; two transient registration timeouts were recorded under load. |
| 7 | `$claude-adversarial-review` | pass | Default, `--model opus`, and `--json` all launched and returned parseable output; immediate parser accepted meta-text as a nit. |
| 8 | `$claude-stop` | pass | Single stop, workspace bulk awaiting-followup, final global bulk cleanup, and bare `--all` rejection all behaved as expected. |
| 9 | `$claude-workflow` | partial | Three starts, including `--json`, passed; real subagent execution was not confirmed because all stopped at the documented dynamic workflow approval gate. |
| 10 | `$claude-goal` | partial | Three bounded goals started and `--json` parsed; no `goal_status`/`goalStatus` field appeared in status JSON, and no fan-out evidence was exposed. |
| 11 | `$claude-fork` | pass | Explain-code, second directive, and `--json` passed; `/fork` ran and completed, but child subagent metadata was not exposed as separate job/pid. |
| 12 | `$claude-batch` | pass | Small batch, `--json`, and stop-mid-run passed; logs/transcripts showed real parallel subagents and recoverable partial output. |
| 13 | `$claude-deep-research` | partial | Three launches and `--json` passed; logs showed a 5-agent/3-vote fan-out plan, but actual agents did not execute before approval. |
| 14 | `$claude-workflows` | pass | Plain list, shortId drill-in, full jobId drill-in, `--all`, `--json`, and bogus id error all passed. |

## Regression Verdicts

**F1 rapid parallel delegates: PASS.** Three no-name delegates fired in parallel:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-A"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-B"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-C"
```

They created distinct job IDs (`job_mqa37epg_125e8c79`, `job_mqa37esy_52f51e09`, `job_mqa37eh7_38e64d06`), distinct session IDs (`2d815204-...`, `fb910140-...`, `de2a5dcc-...`), distinct short IDs and PIDs, and each final result contained its own marker.

**F2 ID-shaped `--name`: PASS.** Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name my-test-session-abc -- "reply CLEAN-NAME"
```

Job `job_mqa39xrq_845f5866` stored `shortId: "4bc92eda"` with `sessionId: "4bc92eda-b129-4432-80ec-7e2cb388fe2b"`. The shortId was an 8-char hex prefix, not the literal name.

**F2b duplicate `--name` idempotent key: FAIL.** Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-KEY-ONE"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-KEY-TWO"
```

Expected: same session/resume. Actual: different jobs, sessions, short IDs, and PIDs:

```text
First:  job_mqa3e4oc_99014b9a, session 10c7b501-..., pid 13961
Second: job_mqa3edkm_1bbb0046, session 7b568f05-..., pid 14809
```

Worse, the first job's prompt was `reply DUP-KEY-ONE` but its preview/result became `DUP-KEY-TWO`. This is a High finding because it is result contamination in a duplicate-name path that is documented as idempotent.

**F3 `status <jobId>` rejection: PASS.** Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status job_mqa3axon_bee79aad
node marketplace/plugins/cc/scripts/cc.mjs status job_v032_status_lane03_bogus
```

Both exited 2 and printed:

```text
[status] Error: cc status does not take a job id (got "..."). For one job use: cc result ...  (or cc status --all to list every workspace).
```

No unfiltered full list was printed.

## Severity Summary

### Blocker

None found.

### High

1. **Duplicate `--name` does not behave as documented and contaminates results.** `dup-key-test` created two sessions instead of resuming one, and the first job returned the second marker. This is not the known-not-bug behavior requested by the test; it failed the confirmation.

### Medium

1. **Broad `status --json` / `status --all --json` reconciliation is slow or can hang under high concurrent load.** Multiple lanes recorded long or stalled status scans. Examples: lane 04 killed a status poll after more than 40s; lane 05 avoided broad status after it did not return promptly; lane 12 saw one broad `status --json` produce no output after two 30s harness yields. Final `status --all --json` verification succeeded but took about 42s.

2. **Follow-up/review turn registration can timeout under load.** Lane 06 saw two `review` submissions fail with `[followup] Error: follow-up prompt did not register within 5000ms`, after which those jobs were marked failed. Fresh or more delayed jobs succeeded.

3. **Goal status metadata missing from `status --json`.** The test specifically requested `goal_status` mid-run. Three goal jobs were found by `status --json`, but none contained `goal_status` or `goalStatus` fields.

### Low

1. **Adversarial-review immediate parser accepted model meta-text as a nit finding.** Default/opus/JSON variants launched, but immediate output included findings like `I'll verify...` as `[NIT]`, before later review completion.

2. **Turn status can lag result/log evidence.** Some jobs had final previews or subagent transcript evidence while job turn status stayed `queued`, `running`, or `needs_input` until explicit stop.

3. **Unattended workflow/deep-research cannot confirm actual post-approval fan-out.** This is mostly expected from the documented approval gate, but it limits non-interactive regression coverage for the headline dynamic workflow paths.

## Fan-Out Harness

The test itself was parallelized with one subagent lane per command group. The multi-agent runtime allowed six active lanes at a time, so the harness ran in waves: setup/delegate/status/result/followup/review first, then adversarial/stop/workflow/goal/fork/batch/deep-research/workflows/edge cases as slots freed. Each lane wrote a distinct artifact file under `documentation/testing/artifacts/v032-deep/`.

Heavyweight fan-out evidence:

- `$claude-batch`: confirmed actual fan-out. Logs/transcripts showed `agents:2`, two Explore agents, Agent tool uses, and sidechain subagent JSONL files for `claude-batch/SKILL.md` and `cc.mjs`.
- `$claude-fork`: `/fork` ran and completed; result text referenced the fork/subagent path, but separate child job/pid metadata was not exposed.
- `$claude-workflow`: generated workflow sessions and phase/session records, but no actual subagents before approval.
- `$claude-deep-research`: logs showed the dynamic plan with 5 parallel WebSearch agents and 3-vote verification, but actual agents did not execute before approval.
- `$claude-goal`: no fan-out/subagent evidence found.

## Command Details

### 1. `$claude-setup`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup
node marketplace/plugins/cc/scripts/cc.mjs setup --json
node marketplace/plugins/cc/scripts/cc.mjs setup
```

Status: pass. All exited 0. JSON parse output: `ok keys=ok,status,delegateCapability,followupCapability,generatedAt,probes`. Aggregate status was `warn` only because `claude-bg-flag` was informational. Rerun was idempotent; capabilities remained `ok`.

### 2. `$claude-delegate`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "Read-only task: summarize TODO comments in this repository. Do not edit files. Return concise findings."
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "Analysis task: inspect the CC plugin delegate behavior at a high level and report one implementation risk and one verification idea. Do not edit files."
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-A" &
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-B" &
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes -- "CLEAN-RAPID-C" &
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name my-test-session-abc -- "reply CLEAN-NAME"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-KEY-ONE"
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-KEY-TWO"
```

Status: fail due F2b. Normal delegates started and cleaned up. F1 rapid no-name isolation passed. F2 shortId handling passed. F2b failed with duplicate-name session split and marker contamination.

### 3. `$claude-status`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status
node marketplace/plugins/cc/scripts/cc.mjs status --all
node marketplace/plugins/cc/scripts/cc.mjs status --json
node marketplace/plugins/cc/scripts/cc.mjs status job_mqa3axon_bee79aad
node marketplace/plugins/cc/scripts/cc.mjs status job_v032_status_lane03_bogus
```

Status: pass. Plain and `--all` exited 0. `--json` parsed with `ok: true`. Real and bogus positional IDs exited 2 with explicit guidance and no full-list fallback.

### 4. `$claude-result`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa36eju_6bf9f261
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa36eju_6bf9f261 --json
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa36q85_41009bf5
```

Status: pass. Human result returned `V032_RESULT_FAST_OK`. JSON parse evidence included `ok: true`, job id, `status: "awaiting_followup"`, and `resultText: "V032_RESULT_FAST_OK"`. Still-running result exited 1 with `Job ... is not complete yet (status: running). Run: cc status`.

### 5. `$claude-followup`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --yes -- "Reply with exactly LANE05_FOLLOWUP_ONE_OK."
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --yes -- "Reply with exactly LANE05_FOLLOWUP_TWO_OK."
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --json --yes -- "Reply with exactly LANE05_FOLLOWUP_JSON_OK."
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --yes -- "Reply with exactly LANE05_AFTER_STOP_SHOULD_FAIL."
```

Status: pass. First and second followups resolved after 5s polls. `--json` parsed with `ok: true`, but immediate `resultPreview` and `turn.finalMessagePreview` were one turn stale (`LANE05_FOLLOWUP_TWO_OK`); next poll returned `LANE05_FOLLOWUP_JSON_OK`. Stopped-job followup exited 1 with `Job ... is stopped; start a new $claude-delegate job instead.`

### 6. `$claude-review`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_37cfb128 --yes
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa3aljn_61d --json --yes
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_37c --json --yes
```

Status: pass with Medium robustness finding. Full-id human review rendered:

```text
Review verdict: PASS
No findings.
```

Unique-prefix and JSON variants parsed with `ok=true`, `verdict=pass`, and `findingsCount=0`. Two earlier attempts failed with `[followup] Error: follow-up prompt did not register within 5000ms`.

### 7. `$claude-adversarial-review`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqa396dm_61017e2f
node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqa396dm_61017e2f --model opus
node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqa396dm_61017e2f --json
```

Status: pass with Low quality note. All exited 0. JSON parsed with `ok: true`, `review.verdict: "pass_with_findings"`, and review job metadata. Default and JSON spawned jobs initially stayed `needs_input` when polled; all were stopped cleanly. Immediate structured output included meta-text as a nit finding.

### 8. `$claude-stop`

Commands:

```sh
node /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3ebbg_61d20742
node /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs stop --all-awaiting-followup
node marketplace/plugins/cc/scripts/cc.mjs stop --all-awaiting-followup --all --json
node /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs stop --all
```

Status: pass. Single stop exited 0 and readback showed `stopped`. Workspace bulk stopped 2 mock-backed awaiting-followup jobs. Final global cleanup exited 0 with `stopped: []`, `failed: []`, and skipped all because no test job was still awaiting-followup. Bare `--all` exited 2:

```text
[stop] Error: bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.
```

### 9. `$claude-workflow`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v032deep-workflow-09a-survey -- "Read-only bounded CC plugin v0.3.2 workflow depth test..."
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v032deep-workflow-09b-multistep -- "Read-only bounded CC plugin v0.3.2 workflow depth test..."
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --json --name v032deep-workflow-09c-json -- "Read-only bounded CC plugin v0.3.2 workflow depth test..."
```

Status: partial. All starts exited 0; `--json` parsed with `ok: true`. All three reached `needs_input` at the documented workflow approval gate. `cc workflows <job> --json` returned `subagents: []` and 30 phase/session records; no real subagent execution occurred before stop.

### 10. `$claude-goal`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --yes --name v032deep-goal-10a-readme -- "Confirm README.md exists..."
node marketplace/plugins/cc/scripts/cc.mjs goal --yes --name v032deep-goal-10b-package -- "Confirm package.json exists..."
node marketplace/plugins/cc/scripts/cc.mjs goal --json --yes --name v032deep-goal-10c-json -- "Confirm marketplace/plugins/cc/skills/claude-goal/SKILL.md exists..."
```

Status: partial. All starts exited 0; `--json` parsed. Status JSON matched all three jobs and showed sentinel previews, but no `goal_status` or `goalStatus` fields. No fan-out/subagent fields were found. All three were stopped.

### 11. `$claude-fork`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs fork --yes --name v032deep-fork-11-explain-20260611-1855 -- "Read marketplace/plugins/cc/scripts/cc.mjs only..."
node marketplace/plugins/cc/scripts/cc.mjs fork --yes --json --name v032deep-fork-11-json-20260611-1855 -- "Read marketplace/plugins/cc/skills/claude-fork/SKILL.md only..."
```

Status: pass. The two commands covered the required explain-code directive, a second bounded directive, and `--json`. JSON parsed with `ok: true`, job/session fields, and prompt summary beginning `/fork`. After >=10s polling, both jobs were `awaiting_followup` with completed turns. Result excerpts referenced the fork/subagent path. All stopped.

### 12. `$claude-batch`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs batch --yes --name v032deep-batch-small-12 -- "Read-only bounded CC plugin v0.3.2 batch test..."
node marketplace/plugins/cc/scripts/cc.mjs batch --json --yes --name v032deep-batch-json-12 -- "Read-only bounded CC plugin v0.3.2 batch JSON-output test..."
node marketplace/plugins/cc/scripts/cc.mjs batch --yes --name v032deep-batch-stop-12 -- "Read-only bounded CC plugin v0.3.2 batch stop test..."
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3q8ri_bbb86cb9 --json
```

Status: pass. Small batch fanned out two read-only agents, then hit a permission prompt. `--json` parsed and also showed two Explore agents in logs/transcripts. Stop-mid-run returned `ok: true`, `status: stopped`, with a `stop.completed` event. Partial output was recoverable from JSONL/subagent files even when `resultText` was null.

Fan-out evidence excerpt:

```text
Running 2 Explore agents...
Explore Inspect cc.mjs batch logic
Explore Inspect claude-batch SKILL.md
subagents/*.jsonl: isSidechain=true
```

### 13. `$claude-deep-research`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs deep-research --yes --name v032deep-deepresearch-13a-openai-responses -- "According to current official OpenAI API documentation..."
node marketplace/plugins/cc/scripts/cc.mjs deep-research --yes --name v032deep-deepresearch-13b-anthropic-version -- "According to current official Anthropic API documentation..."
node marketplace/plugins/cc/scripts/cc.mjs deep-research --yes --json --name v032deep-deepresearch-13c-json-node-version -- "According to current official Node.js documentation..."
```

Status: partial. All launches exited 0; `--json` parsed with `ok: true` and job/session metadata. All reached `needs_input`. Logs showed the dynamic workflow plan:

```text
5 search angles
5 parallel WebSearch agents
fetch top 15 sources
3-vote adversarial verification per claim
synthesis
```

Actual WebSearch/fetch/verify subagents did not execute before approval. All three jobs were stopped.

### 14. `$claude-workflows`

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows
node marketplace/plugins/cc/scripts/cc.mjs workflows 403cddc7
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqa3n67p_b589f334
node marketplace/plugins/cc/scripts/cc.mjs workflows --all
node marketplace/plugins/cc/scripts/cc.mjs workflows --json
node marketplace/plugins/cc/scripts/cc.mjs workflows bogus-workflow-id-14
```

Status: pass. Plain list included `403cddc7  running  v032deep-workflows-14-readonly`. ShortId and full jobId drill-ins returned session metadata and phase records. `--json` parsed with a `sessions` array. Bogus id exited 1 with:

```text
[workflows] Error: No workflow found matching job id or session id "bogus-workflow-id-14"
```

The target workflow was stopped and verified as `stopped`.

## Edge Cases

1. **Forbidden `--allow-edit`: pass.** All exited 2:

```sh
node "$DISP" workflow --allow-edit -- "noop"
node "$DISP" goal --allow-edit -- "noop"
node "$DISP" fork --allow-edit -- "noop"
node "$DISP" batch --allow-edit -- "noop"
node "$DISP" deep-research --allow-edit -- "noop"
node "$DISP" review --allow-edit job_not_needed
node "$DISP" adversarial-review --allow-edit job_not_needed
node "$DISP" workflows --allow-edit
```

Representative output: `[workflow] Error: --allow-edit is not applicable to $claude-workflow.`

2. **Empty / whitespace delegate prompt: pass.**

```sh
node "$DISP" delegate -- ""
node "$DISP" delegate -- "      "
```

Both exited 2 with `[delegate] Error: prompt is required: cc delegate -- "<prompt>"`.

3. **Non-TTY typo / privacy rejection: pass.**

```sh
printf 'x\n' | node "$DISP" delyes
cd "$PRIV_WS" && printf '' | node "$DISP" delegate -- 'privacy rejection probe'
```

Typo exited 2 with `Unknown command: delyes`. Fresh non-TTY delegate without `--yes` exited 1 with `Privacy acknowledgement required` and job count stayed 0.

4. **Workspace isolation: pass.** Repo-local `status --json` did not show `/tmp` privacy workspace jobs; one `status --all --json` did show them.

5. **`--json` across bg-flow skills: pass for parseability.** Parseable JSON was confirmed for delegate, workflow, goal, fork, batch, deep-research, status, workflows, workflows drill-in, stop, result, followup error path, review error path, and adversarial-review error path. `workflows` JSON intentionally has no top-level `ok`; it parsed with `sessions`.

6. **Privacy disclosure persistence: pass.**

```sh
cd "$PRIV_WS" && node "$DISP" delegate --yes --json --name edge15-privacy-yes -- "Privacy ack recording probe."
cd "$PRIV_WS" && printf '' | node "$DISP" delegate --json --name edge15-privacy-second -- 'Second delegate should use stored ack.'
```

Both exited 0 and parsed. The second was non-TTY and omitted `--yes`; it did not re-prompt because the first command recorded the workspace ack.

## Cleanup

Required cleanup command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop --all-awaiting-followup --all --json
```

Result: exit 0, `ok: true`, `stopped: []`, `failed: []`. It skipped all visible jobs because no test job was still `awaiting_followup`; lane cleanup had already stopped them.

Final verification command extracted every `job_*` ID from the artifacts and ran one throttled `status --all --json`:

```json
{
  "dispatcherExit": 0,
  "artifactJobIds": 56,
  "matched": 41,
  "byStatus": {
    "orphaned": 2,
    "stopped": 39
  },
  "activeCount": 0,
  "active": []
}
```

The two `orphaned` IDs came from artifact/status-list excerpts and were not active test jobs. No v0.3.2 deep-test job remained active. No commit was made.
