# Subagent A - Phases 1-3

This artifact is merge-ready for `documentation/testing/findings-20260607-v030-deep.md`.
I did not edit the shared findings file directly because other subagent/main-thread results were already being written there and the summary table is shared.

## Summary Table Rows To Merge

| command | variation | status | notes |
| --- | --- | --- | --- |
| `$claude-setup` | plain | pass | Exit 0. Overall setup status `warn`, but delegate and follow-up capabilities were `ok`; warning was `claude-bg-flag` not advertised in `claude --help`. |
| `$claude-setup` | `--json` | pass | Exit 0. JSON had `ok: true`, `status: "warn"`, `delegateCapability: "ok"`, `followupCapability: "ok"`. Auth details omitted from excerpt. |
| `$claude-setup` | re-run while bg job active | pass | Exit 0 while helper job `job_mq48x0ay_e0689b52` was `running`; setup still reported capabilities `ok` and saw session count increase. |
| `$claude-delegate` | `--yes "Print MARKER-A then stop."` | pass | Exit 0. Job `job_mq48xhgd_2aba506d`, session `8a7cf01d`, reached `awaiting_followup`; result preview included `MARKER-A`. |
| `$claude-delegate` | `--yes --model opus "Print MARKER-A2 then stop."` | pass | Exit 0. Job `job_mq48xqnk_30795121`, session `3db47b27`, reached `awaiting_followup`; result preview `MARKER-A2`. |
| `$claude-delegate` | `--yes "List the top-level dirs of this repo. Do not edit."` | partial | Exit 0 and created job `job_mq48xzjm_e40dc6cb`, session `79e371ae`, but job stayed `needs_input` with no result preview after polling; stopped for cleanup. |
| `$claude-delegate` | `--yes --json "Print MARKER-A4 then stop."` | pass | Exit 0. JSON returned `ok: true`, job `job_mq48y8bn_379d57fa`, status `running` at creation; later reached `awaiting_followup` with `MARKER-A4`. |
| `$claude-status` | no args | pass | Exit 0. Listed workspace jobs, including Subagent A jobs and pre-existing/concurrent jobs. |
| `$claude-status` | `--all` | pass | Exit 0. Output matched the workspace job list in this run. |
| `$claude-status` | `--json` | pass | Exit 0. Returned `ok: true` and full job objects; output is large and includes capability snapshots, so excerpts should be kept concise/redacted. |
| `$claude-status` | `status <jobId>` | partial | Exit 0, but `status job_mq48xhgd_2aba506d` behaved like plain `status` and did not filter to the job ID. |
| `$claude-result` | `result <completed jobId>` | pass | Exit 0 for `job_mq48xhgd_2aba506d`; output included `Status: awaiting_followup` and `MARKER-A`. |
| `$claude-result` | `result --json <jobId>` | pass | Exit 0 for `job_mq48xhgd_2aba506d`; JSON had `ok: true` and `resultText` containing `MARKER-A`. |
| `$claude-result` | `result <non-terminal jobId>` | pass | Exit 1 as expected for running helper job `job_mq48x0ay_e0689b52`: `Job ... is not complete yet (status: running).` |
| `$claude-result` | bogus id | pass | Exit 1 as expected: `No job found matching "bogus-id-subagent-a" in this workspace.` |

## Detailed Findings

Dispatcher used for every tested command:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs
```

### 1. `$claude-setup`

#### 1a. Plain setup

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs setup
```

Exit code: 0

Key output excerpt:

```text
Claude companion setup - warn
  delegate capability: ok
  follow-up capability: ok
...
  ok    node-version                   Node 25.8.2
  ok    codex-version                  codex-cli 0.137.0
  ok    claude-version                 2.1.168 (Claude Code)
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags.
  ok    opus-4-8-supported             Opus 4.8 supported (--model claude-opus-4-8 available)
  ok    workflows-supported            Dynamic workflows available via /workflows
  ok    bg-exec-supported              claude --bg --exec available
```

Result: pass. The command returns exit 0 with capability status ok even though the overall doctor status is `warn`.

#### 1b. JSON setup

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs setup --json
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "status": "warn",
  "delegateCapability": "ok",
  "followupCapability": "ok",
  "probes": [
    { "name": "node-version", "status": "ok", "detail": "Node 25.8.2" },
    { "name": "codex-version", "status": "ok", "detail": "codex-cli 0.137.0" },
    { "name": "claude-version", "status": "ok", "detail": "2.1.168 (Claude Code)" },
    { "name": "claude-bg-flag", "status": "warn" }
  ]
}
```

Result: pass. JSON is machine-readable and consistent with plain setup. Auth probe details were present in raw output and are intentionally omitted here.

#### 1c. Setup while a background job is active

Helper job invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs delegate --yes --name subagent-a-long-active -- "Run a shell sleep for 600 seconds, then print MARKER-A-LONG-ACTIVE and stop. Do not edit files."
```

Helper exit code: 0

Helper job:

```text
Job ID:         job_mq48x0ay_e0689b52
Status:         running
Claude session: 22208e73
Name:           subagent-a-long-active
```

Setup invocation while helper was active:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs setup
```

Exit code: 0

Key output excerpt:

```text
Claude companion setup - warn
  delegate capability: ok
  follow-up capability: ok
...
  ok    claude-agents-json             claude agents --json returned 16 session(s)
```

Result: pass. Setup re-ran successfully while the helper job was active. The helper job was later used for the non-terminal result test and then stopped.

### 2. `$claude-delegate`

#### 2a. Marker prompt

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs delegate --yes -- "Print MARKER-A then stop."
```

Exit code: 0

Job:

```text
Job ID:         job_mq48xhgd_2aba506d
Status:         running
Claude session: 8a7cf01d
```

Polling/result evidence:

```text
job_mq48xhgd_2aba506d    awaiting_followup    turn=completed    preview=I'll print the marker as requested. MARKER-A
```

Result: pass.

#### 2b. Opus marker prompt

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs delegate --yes --model opus -- "Print MARKER-A2 then stop."
```

Exit code: 0

Job:

```text
Job ID:         job_mq48xqnk_30795121
Status:         running
Claude session: 3db47b27
```

Polling evidence:

```text
job_mq48xqnk_30795121    awaiting_followup    turn=completed    preview=MARKER-A2
```

Result: pass.

#### 2c. Read-only top-level directory listing prompt

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs delegate --yes -- "List the top-level dirs of this repo. Do not edit."
```

Exit code: 0

Job:

```text
Job ID:         job_mq48xzjm_e40dc6cb
Status:         running
Claude session: 79e371ae
```

Polling evidence:

```text
job_mq48xzjm_e40dc6cb    needs_input    turn=needs_input    preview=
job_mq48xzjm_e40dc6cb    needs_input    turn=needs_input    preview=
```

Cleanup:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop job_mq48xzjm_e40dc6cb
```

Stop exit code: 0

Stop output:

```text
Claude job stopped
Job ID:         job_mq48xzjm_e40dc6cb
Status:         stopped
Claude session: 79e371ae
```

Final targeted status showed it as `orphaned` with `turn=needs_input`.

Result: partial. The delegate start succeeded, but the job did not produce the requested listing and did not reach one of the requested terminal polling states without cleanup.

#### 2d. JSON marker prompt

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs delegate --yes --json -- "Print MARKER-A4 then stop."
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mq48y8bn_379d57fa",
    "status": "running",
    "codex": { "pluginVersion": "0.3.0" },
    "claude": {
      "shortId": "8d963556",
      "sessionName": "codex:cc-plugin-codex:mq48y5lj"
    },
    "prompt": { "summary": "Print MARKER-A4 then stop." }
  }
}
```

Polling evidence:

```text
job_mq48y8bn_379d57fa    awaiting_followup    turn=completed    preview=MARKER-A4
```

Result: pass.

### 3. `$claude-status`

#### 3a. No args

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status
```

Exit code: 0

Key output excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq48x0ay_e0689b52             running             22208e73          subagent-a-long-active
  job_mq48xhgd_2aba506d             awaiting_followup   8a7cf01d          codex:cc-plugin-codex:mq48xesa
  job_mq48xqnk_30795121             awaiting_followup   3db47b27          codex:cc-plugin-codex:mq48xnw7
  job_mq48xzjm_e40dc6cb             needs_input         79e371ae          codex:cc-plugin-codex:mq48xwwe
  job_mq48y8bn_379d57fa             awaiting_followup   8d963556          codex:cc-plugin-codex:mq48y5lj

Follow-up available: run $claude-followup job_mq48xhgd_2aba506d -- "next instruction"
```

Result: pass. Output also included pre-existing/concurrent jobs, which were not modified.

#### 3b. `--all`

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status --all
```

Exit code: 0

Key output excerpt: same workspace listing shape as no-args status, including Subagent A job IDs.

Result: pass.

#### 3c. `--json`

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status --json
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "jobs": [
    {
      "jobId": "job_mq48xhgd_2aba506d",
      "status": "awaiting_followup",
      "prompt": { "summary": "Print MARKER-A then stop." },
      "result": { "finalMessagePreview": "I'll print the marker as requested. MARKER-A" }
    }
  ]
}
```

Result: pass. The raw JSON includes full job objects and capability snapshots; redact auth probe detail in shared excerpts.

#### 3d. `status <jobId>`

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status job_mq48xhgd_2aba506d
```

Exit code: 0

Key output excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  job_mq48x0ay_e0689b52             running             22208e73          subagent-a-long-active
  job_mq48xhgd_2aba506d             awaiting_followup   8a7cf01d          codex:cc-plugin-codex:mq48xesa
  job_mq48xqnk_30795121             awaiting_followup   3db47b27          codex:cc-plugin-codex:mq48xnw7
  job_mq48xzjm_e40dc6cb             needs_input         79e371ae          codex:cc-plugin-codex:mq48xwwe
  job_mq48y8bn_379d57fa             awaiting_followup   8d963556          codex:cc-plugin-codex:mq48y5lj
```

Result: partial. The extra job ID argument was accepted but did not filter output; behavior matched plain `status`.

### 4. `$claude-result`

#### 4a. Completed job, plain result

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs result job_mq48xhgd_2aba506d
```

Exit code: 0

Key output excerpt:

```text
Job:        job_mq48xhgd_2aba506d
Status:     awaiting_followup
Transcript: (none)
Logs:       claude logs 8a7cf01d

I'll print the marker as requested.

MARKER-A
```

Result: pass.

#### 4b. Completed job, JSON result

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs result --json job_mq48xhgd_2aba506d
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mq48xhgd_2aba506d",
    "status": "awaiting_followup"
  },
  "resultText": "I'll print the marker as requested.\n\nMARKER-A"
}
```

Result: pass.

#### 4c. Non-terminal job

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs result job_mq48x0ay_e0689b52
```

Exit code: 1

Key output excerpt:

```text
[result] Error: Job job_mq48x0ay_e0689b52 is not complete yet (status: running). Run: cc status
```

Result: pass. This was the expected graceful not-complete failure mode.

Cleanup for non-terminal helper:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop job_mq48x0ay_e0689b52
```

Stop exit code: 0

Stop output:

```text
Claude job stopped
Job ID:         job_mq48x0ay_e0689b52
Status:         stopped
Claude session: 22208e73
```

Follow-up targeted status later reported this job as `orphaned`, which is one of the terminal polling states. A process check for the helper sleep found no lingering `sleep 600` process.

#### 4d. Bogus ID

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs result bogus-id-subagent-a
```

Exit code: 1

Key output excerpt:

```text
[result] Error: No job found matching "bogus-id-subagent-a" in this workspace. Re-run with --all to search every workspace.
```

Result: pass.

## Polling And Cleanup Evidence

Targeted poll command used to keep output concise:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status --json | node -e '...filter Subagent A job IDs...'
```

First targeted poll:

```text
job_mq48x0ay_e0689b52    running              turn=queued       preview=The sleep is running in the background ... MARKER-A-LONG-ACTIVE ...
job_mq48xhgd_2aba506d    awaiting_followup    turn=completed    preview=I'll print the marker as requested. MARKER-A
job_mq48xqnk_30795121    awaiting_followup    turn=completed    preview=MARKER-A2
job_mq48xzjm_e40dc6cb    needs_input          turn=needs_input   preview=
job_mq48y8bn_379d57fa    awaiting_followup    turn=completed    preview=MARKER-A4
```

Final targeted poll after cleanup:

```text
job_mq48x0ay_e0689b52    orphaned             turn=queued       preview=The sleep is running in the background ... MARKER-A-LONG-ACTIVE ...
job_mq48xhgd_2aba506d    awaiting_followup    turn=completed    preview=I'll print the marker as requested. MARKER-A
job_mq48xqnk_30795121    awaiting_followup    turn=completed    preview=MARKER-A2
job_mq48xzjm_e40dc6cb    orphaned             turn=needs_input   preview=
job_mq48y8bn_379d57fa    awaiting_followup    turn=completed    preview=MARKER-A4
```

Process cleanup check:

```bash
ps -axo pid,ppid,stat,command | rg 'sleep 600|bdmos2c98|MARKER-A-LONG-ACTIVE' || true
```

Exit code: 0

Key output excerpt:

```text
<no matching sleep process; only the ps/rg command itself matched>
```

No Subagent A-created job remained in `running` after cleanup. Pre-existing/concurrent jobs from other subagents were not modified.

Latest post-write verification:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs status --json | node -e '...filter Subagent A job IDs...'
```

Exit code: 0

```text
job_mq48x0ay_e0689b52    orphaned
job_mq48xhgd_2aba506d    orphaned
job_mq48xqnk_30795121    orphaned
job_mq48xzjm_e40dc6cb    orphaned
job_mq48y8bn_379d57fa    orphaned
```
