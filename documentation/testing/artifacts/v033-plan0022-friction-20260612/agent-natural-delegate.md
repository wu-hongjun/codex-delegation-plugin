# Plan 0022 friction test: natural delegate/followup/status/result

Date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher under test: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

Scope: act as a Codex user calling the installed `cc` dispatcher for natural `delegate`, `status`, `result`, `followup`, and `stop` usage. No source files were edited and no commit was made. The only repo write from this pass is this artifact.

## Baseline

Initial status commands:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

Observations:

- Plain `status` returned a very long list for this workspace, mostly historical `orphaned` and `stopped` jobs.
- `status --json` was extremely large in this workspace. The captured command output reported 31,672 lines.
- One pre-existing active-looking job was present and was not mine, so I did not touch it: `job_mq36pwuq_78224539` with status `needs_input`.

## Jobs Started

### A. no-`--yes` delegate from repo workspace

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --name plan0022-natural-noyes-20260612-a -- "Read-only dispatcher ergonomics smoke. Do not edit files. Do not run commands unless necessary. Reply with exactly this line and nothing else: P22_NATURAL_NOYES_SENTINEL_4B1D"
```

Start output:

- Job ID: `job_mqay6pvt_e46fbba7`
- Initial status: `running`
- Claude short ID: `66e7b8db`
- Session name: `plan0022-natural-noyes-20260612-a-94f3ceae`
- Wall time: about 5.9s

This satisfied the requested no-`--yes` run. It did not prompt for acknowledgement, so this repo/user path was already acked.

### B. JSON delegate

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json --yes --name plan0022-natural-json-20260612-b -- "Read-only dispatcher JSON smoke. Do not edit files. Do not run commands unless necessary. Reply with exactly this line and nothing else: P22_NATURAL_JSON_SENTINEL_7C2E"
```

Start output:

- Job ID: `job_mqay6q50_626ee75c`
- Initial status: `running`
- Claude short ID: `f9406d75`
- Session name: `plan0022-natural-json-20260612-b-3400e45f`
- First turn in immediate JSON: `queued`
- Wall time: about 5.9s

Friction: JSON delegate output returned the entire nested job object, including repeated driver capability and health probe details. It was useful for exact IDs, but noisy for a simple "job started" response.

### C. live stop target

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes --permission-mode bypassPermissions --name plan0022-natural-stop-20260612-c -- "Read-only stop smoke. Do not edit files. Run the harmless command sleep 90, then reply with exactly this line and nothing else: P22_NATURAL_STOP_SENTINEL_D311"
```

Start output:

- Job ID: `job_mqay8euh_bee85f43`
- Initial status: `running`
- Claude short ID: `303269fe`
- Session name: `plan0022-natural-stop-20260612-c-71927161`
- Wall time: about 5.4s

## Polling And Results

Targeted status poll after jobs A and B:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status | rg 'plan0022-natural|job_mqay6pvt|job_mqay6q50'
```

Output:

```text
job_mqay6pvt_e46fbba7             awaiting_followup  66e7b8db          plan0022-natural-noyes-20260612-a-94f3ceae
job_mqay6q50_626ee75c             awaiting_followup  f9406d75          plan0022-natural-json-20260612-b-3400e45f
```

JSON-filtered status showed both first turns completed:

```text
job_mqay6pvt_e46fbba7 stopped? no, status awaiting_followup, turns: completed
job_mqay6q50_626ee75c stopped? no, status awaiting_followup, turns: completed
```

Result command for job A:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqay6pvt_e46fbba7
```

Output included:

```text
Job:        job_mqay6pvt_e46fbba7
Status:     awaiting_followup
Transcript: (none)
Logs:       claude logs 66e7b8db

P22_NATURAL_NOYES_SENTINEL_4B1D
```

JSON result command for job B:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqay6q50_626ee75c --json
```

Key fields:

- Status: `awaiting_followup`
- `resultText`: `P22_NATURAL_JSON_SENTINEL_7C2E`
- First turn result preview: `P22_NATURAL_JSON_SENTINEL_7C2E`

Friction: JSON result again returned the full nested job/capability object in addition to `resultText`. The direct `resultText` field is good; the surrounding object is too noisy for a simple Codex caller.

## Follow-up

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_mqay6pvt_e46fbba7 --json -- "Read-only follow-up smoke. Do not edit files. Do not run commands unless necessary. Reply with exactly this line and nothing else: P22_NATURAL_FOLLOWUP_SENTINEL_9A5F"
```

Immediate output:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqay6pvt_e46fbba7",
    "status": "running",
    "shortId": "66e7b8db",
    "sessionName": "plan0022-natural-noyes-20260612-a-94f3ceae",
    "resultPreview": "P22_NATURAL_NOYES_SENTINEL_4B1D"
  },
  "turn": {
    "index": 1,
    "status": "completed",
    "finalMessagePreview": "P22_NATURAL_NOYES_SENTINEL_4B1D"
  }
}
```

Friction: this immediate follow-up response was the most confusing part of the run. It reported the job as `running`, but the returned turn was `completed` and the preview was the previous turn's sentinel, not the follow-up sentinel. A later poll corrected this.

Follow-up poll:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqay6pvt_e46fbba7
```

Output included:

```text
P22_NATURAL_FOLLOWUP_SENTINEL_9A5F
```

JSON-filtered status then showed:

```text
job_mqay6pvt_e46fbba7 status awaiting_followup
turn 0 completed preview P22_NATURAL_NOYES_SENTINEL_4B1D
turn 1 completed preview P22_NATURAL_FOLLOWUP_SENTINEL_9A5F
```

## Stop And Cleanup

Live stop target status before stop:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status | rg 'plan0022-natural|job_mqay6pvt|job_mqay6q50|job_mqay8euh'
```

Output:

```text
job_mqay6pvt_e46fbba7             awaiting_followup  66e7b8db          plan0022-natural-noyes-20260612-a-94f3ceae
job_mqay6q50_626ee75c             awaiting_followup  f9406d75          plan0022-natural-json-20260612-b-3400e45f
job_mqay8euh_bee85f43             running            303269fe          plan0022-natural-stop-20260612-c-71927161
```

JSON-filtered status for the live stop target showed `job_mqay8euh_bee85f43` with status `running` and turn status `queued`.

Stop live target by exact full ID:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay8euh_bee85f43 --json
```

Key output:

- `ok`: true
- Job ID: `job_mqay8euh_bee85f43`
- Status: `stopped`
- Claude short ID: `303269fe`

Stop completed/follow-up jobs by exact full IDs:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay6pvt_e46fbba7
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay6q50_626ee75c --json
```

Text stop output for job A:

```text
Claude job stopped
Job ID:         job_mqay6pvt_e46fbba7
Status:         stopped
Claude session: 66e7b8db
```

Final exact-ID verification:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status | rg 'job_mqay6pvt_e46fbba7|job_mqay6q50_626ee75c|job_mqay8euh_bee85f43|plan0022-natural'
```

Output:

```text
job_mqay6pvt_e46fbba7             stopped         66e7b8db          plan0022-natural-noyes-20260612-a-94f3ceae
job_mqay6q50_626ee75c             stopped         f9406d75          plan0022-natural-json-20260612-b-3400e45f
job_mqay8euh_bee85f43             stopped         303269fe          plan0022-natural-stop-20260612-c-71927161
```

Stopped-before-output result check:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqay8euh_bee85f43
```

Output:

```text
Job:        job_mqay8euh_bee85f43
Status:     stopped
Transcript: (none)
Logs:       claude logs 303269fe
```

Friction: for a stopped job with no final answer, `result` prints only headers/logs and no explicit "no result was produced" explanation.

## Friction Summary

1. `status` is noisy in a workspace with history. It includes many old `orphaned` and `stopped` jobs by default, which makes current-job ergonomics poor. I had to pipe through `rg` or parse JSON manually.
2. `status --json`, `delegate --json`, `result --json`, and `stop --json` are too verbose for normal Codex orchestration. They repeat driver capabilities and health probes, including auth/org details, instead of returning a compact caller-facing shape by default.
3. Immediate `followup --json` output had stale preview data from the previous turn and internally mixed states (`job.status: running`, `turn.status: completed`, old `finalMessagePreview`). A later poll corrected it, but this is easy to misread.
4. Text `delegate` output is ergonomic and gives next-step hints (`$claude-status`, `$claude-result <jobId>`). JSON outputs do not provide similarly compact next-step hints.
5. Cleanup is exact but manual. Stopping by full job ID worked for both live and awaiting-followup jobs, but there is no scoped bulk cleanup by name/prefix. The available `stop --all-awaiting-followup` would be too broad in a shared dirty workspace.
6. `result` for a stopped-before-output job should explicitly say there is no final result yet or no final result was produced before stop.

## Positive Notes

- Full job IDs worked consistently for `result`, `followup`, and `stop`.
- The no-`--yes` delegate path worked from this repo workspace because acknowledgement was already satisfied.
- Text-mode `delegate`, `result`, and `stop` outputs were compact and readable.
- All jobs started in this pass were stopped and verified stopped by exact full job ID.
