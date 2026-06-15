# Plan 0022 Round 4 Heavy Installed Test

Date: 2026-06-12

Installed target:
- `cc@cc-plugin-codex-local` 0.3.3
- Installed root: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3`
- Marketplace source: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc`

Environment:
- `claude --version`: 2.1.176 (Claude Code)
- `codex --version`: codex-cli 0.137.0
- OS: macOS 26.5.1 (25F80), arm64

Pre-flight:
- `codex plugin list` showed `cc@cc-plugin-codex-local` installed/enabled at 0.3.3.
- Installed cache still contained the nested shortId hardening:
  - `NON_ID_TOKENS` in `@cc-plugin-codex/driver-claude-code/dist/background-session.js`
  - `shouldRepairPseudoShortId` in `@cc-plugin-codex/runtime/dist/reconciler.js`
- `cc setup --json` returned `ok:true`; aggregate `warn` was only the known
  `claude-bg-flag` help omission. Delegate and followup capabilities were `ok`.
- `node tools/package-marketplace.mjs --check` passed before the heavy lanes.

## Lanes

| lane | parent job | focus | verdict |
| --- | --- | --- | --- |
| A | `job_mqbhja0a_a9415066` | nested `shortId:"claude"` / banned-token session names under load | PASS child evidence; parent stopped after over-poll |
| B | `job_mqbhjagn_0294050a` | multi-turn delegate, followup, same-session review, adversarial review | PASS |
| C | `job_mqbhjaek_8f46a1d5` | workflow/fork/batch/deep-research heavy wrappers | PARTIAL; launch/records good, workflow/deep-research stayed long-running/approval-gated |
| D | `job_mqbhja7j_e87b0f70` | broad status under concurrency plus reused names | PASS with performance observation |
| E | `job_mqbhja15_2071f0c1` | stop/followup race and permission recovery | PASS recovery path; parent stopped before final race report |

## Regression Evidence

### Nested shortId / banned-token names

Lane A created 12 nested delegates. All 12 produced exact markers, all stored
real 8-hex shortIds, and all `logsCommand` values used the real shortId rather
than a reserved command token.

Named stress cases:

| job | sessionName | shortId | logsCommand | result |
| --- | --- | --- | --- | --- |
| `job_mqbhm7di_24cab63f` | `claude-b4596a4c` | `18f12a90` | `claude logs 18f12a90` | `P22_R4_A_NAME_CLAUDE` |
| `job_mqbhm7dj_994af8c7` | `attach-5adc04fc` | `4b536b74` | `claude logs 4b536b74` | `P22_R4_A_NAME_ATTACH` |
| `job_mqbhm6a3_a28dac19` | `logs-081a7d67` | `7ca3ff53` | `claude logs 7ca3ff53` | `P22_R4_A_NAME_LOGS` |
| `job_mqbhm6p2_c4e248b5` | `agents-c652fcb5` | `b94bf6e4` | `claude logs b94bf6e4` | `P22_R4_A_NAME_AGENTS` |

The remaining no-name Lane A delegates returned `P22_R4_A_00` through
`P22_R4_A_07` with distinct 8-hex shortIds. No child used `shortId:"claude"`;
no child had `logsCommand:"claude logs claude"`.

### Followup / review / adversarial review

Lane B completed:

- B0 `job_mqbhk6xq_81efcbe8`: T0/T1/T2 result files were distinct and contained
  `P22_R4_B0_T0`, `P22_R4_B0_T1`, `P22_R4_B0_T2`.
- B1 `job_mqbhkbg1_899402e5`: T0/T1/T2 result files were distinct and contained
  `P22_R4_B1_T0`, `P22_R4_B1_T1`, `P22_R4_B1_T2`.
- Same-session `review` on B0 and B1 returned `verdict: pass`, `findings: []`.
- `adversarial-review` produced fresh job `job_mqbhp7wf_41454b9b` and recorded
  `reviewOf.turnIndex: 2`, correctly targeting the latest non-review turn.
- All three Lane B jobs stopped cleanly.

### Reused names / broad status load

Lane D launched eight delegates, including four with the reused base name
`p22-r4-reused-name`. All eight returned exact markers and had distinct job IDs,
session names, and shortIds:

- `P22_R4_D_00` through `P22_R4_D_07` all matched their own jobs.
- No cross-contamination was observed.
- Reused-name sessions were suffixed independently, for example
  `p22-r4-reused-name-07ca528e`, `p22-r4-reused-name-b7eb82db`,
  `p22-r4-reused-name-f3be9e84`, and `p22-r4-reused-name-1e9bfcbb`.

Lane D measured five samples while eight sessions ran:

| command | min | median | mean | max |
| --- | --- | --- | --- | --- |
| `status --json --compact` | 8.98s | 13.78s | 15.1s | 24.36s |
| `status --all --json --compact` | 13.51s | 16.20s | 15.7s | 17.56s |
| `status --job <id> --json --compact` | 0.50s | 0.60s | 0.60s | 0.68s |

Coordinator independent samples were similar:

- `status --json --compact`: 16.757s across 346 jobs.
- `status --all --json --compact`: 15.769s across 361 jobs.

This does not reproduce the old 96s `status --all` failure, but broad status is
still expensive under load. Exact `--job` status stayed fast.

### Wrapper fan-out / approval gates

Lane C launched:

- Workflow `job_mqbhkn09_bbdda1d5`, visible through `workflows --json` as
  `kind: dynamic_workflow`.
- Deep-research `job_mqbhlcvm_7669cc6a`, visible through `workflows --json` as
  `kind: deep_research`.
- Batch `job_mqbhl7wd_3794d78b`, which entered batch fan-out.
- Fork `job_mqbhl36o_6fca0175`, which completed and reported a 12-friction
  synthesis.

Observed friction:

- Fork cannot nest its own subagents. The forked agent explicitly ran its three
  tracks inline rather than spawning nested subagents.
- Workflow and deep-research spent minutes in initial planning/approval-gated
  state before useful fan-out evidence; this matches the known approval-gate
  limitation rather than a plugin launch failure.

### Stop / permission recovery

Lane E first launched read-only bash-shaped delegate/batch/fork work without
explicit `--permission-mode bypassPermissions`; those child jobs reached
`needs_input`/blocked approval states. The lane then stopped them and relaunched
with `--permission-mode bypassPermissions`.

The relaunched jobs succeeded:

- Delegate `job_mqbhtfui_13ad8818`: reached `awaiting_followup`, printed
  `count 1` through `count 10`, then `P22_R4_E_LONG`.
- Batch `job_mqbhtuea_e9232704`: reached `awaiting_followup`, completed four
  parallel tasks with `BATCH_TASK_1`, `BATCH_TASK_2`, `BATCH_TASK_3`, and UTC date.
- Fork `job_mqbhtzq6_c7dafd15`: reached `awaiting_followup`, reported Node
  `v25.8.2` and UTC time `Fri Jun 12 22:24:05 UTC 2026`.

## Findings

Blocker: none.

High: none.

Medium:
- Broad `status` remains expensive with hundreds of records and concurrent jobs
  (~15-16s in this run). Exact `status --job` is fast and should be preferred by
  automation.
- Workflow/deep-research still cannot be treated as fully unattended fan-out in
  all prompts because Claude Code approval/planning gates can hold the session
  before useful subagent output.

Low:
- Fork is single-session delegation and cannot nest subagents. That appears to
  be a Claude Code hard rule, but it should be called out anywhere we imply
  maximum nested fan-out.
- Test-agent scripts can misclassify `awaiting_followup` as non-terminal. The
  ticket already documents it as terminal; this run confirms the docs matter.
- Read-only bash-shaped work needs explicit `--permission-mode bypassPermissions`
  for unattended runs. Without it, sessions can block at `needs_input`.

## Cleanup

Stopped every current-round job by exact job ID:

- 39 matching job records stopped with `ok:true`.
- Final job-store verification: `count=39`, `nonStopped=[]`.
- Final `claude agents --json` filter for `p22-r4`, `p22r4e`, and `laneC-` returned
  `[]`.

No repo code files were edited by this test round. Only this artifact and the
ticket entry were added after the run.
