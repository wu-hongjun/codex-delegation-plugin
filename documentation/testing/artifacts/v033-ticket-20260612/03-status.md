# Lane 03 - status / F3

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first: `marketplace/plugins/cc/skills/claude-status/SKILL.md`

## Plain status

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status
```

Exit: 0

Excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq1eioll_d4060bf6             orphaned        d281f32d          codex:cc-plugin-codex:mq1eilva
  job_mq1eqa7e_9c8e5b88             orphaned        2b741235          codex:cc-plugin-codex:mq1eq7jq
  job_mq1ew6lf_be8eea43             orphaned        73cd5d3f          codex:cc-plugin-codex:mq1ew3wi
  ...
  job_mqa3oh9j_568bb0c4             stopped         cc9bf35e          v032deep-deepresearch-13a-openai-responses
  job_mqa3op3b_dbcb4ff7             stopped         58963f5d          v032deep-deepresearch-13b-anthropic-version
  job_mqa3oybd_338abb7e             stopped         abecfa5a          v032deep-deepresearch-13c-json-node-version
  job_mqa3q8ri_bbb86cb9             stopped         cf51781d          v032deep-batch-stop-12
```

## Timed status --all

Command:

```sh
/usr/bin/time -p node marketplace/plugins/cc/scripts/cc.mjs status --all
```

Exit: 0

Timing:

```text
real 96.37
user 67.34
sys 32.58
```

Excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq1eioll_d4060bf6             orphaned        d281f32d          codex:cc-plugin-codex:mq1eilva
  job_mq1eqa7e_9c8e5b88             orphaned        2b741235          codex:cc-plugin-codex:mq1eq7jq
  job_mq1ew6lf_be8eea43             orphaned        73cd5d3f          codex:cc-plugin-codex:mq1ew3wi
  ...
  job_mqa3op3b_dbcb4ff7             stopped         58963f5d          v032deep-deepresearch-13b-anthropic-version
  job_mqa3oybd_338abb7e             stopped         abecfa5a          v032deep-deepresearch-13c-json-node-version
  job_mqa3q8ri_bbb86cb9             stopped         cf51781d          v032deep-batch-stop-12
  job_mqac00la_bfcc7fcc             running         184b6c33          v033ticket-followup-498e18a2
```

## status --json parseability

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'const fs=require("fs"); const text=fs.readFileSync(0,"utf8"); const data=JSON.parse(text); const jobs=Array.isArray(data)?data:(data.jobs||[]); console.log(JSON.stringify({parsed:true,topLevel:Array.isArray(data)?"array":typeof data,count:jobs.length,firstKeys:jobs[0]?Object.keys(jobs[0]).slice(0,8):[]},null,2));'
```

Exit: 0

Output:

```json
{
  "parsed": true,
  "topLevel": "object",
  "count": 176,
  "firstKeys": [
    "jobId",
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "status",
    "codex",
    "workspace",
    "driver"
  ]
}
```

## Real job id setup

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v033ticket-status -- "CC v0.3.3 lane 03 status test. Do not edit files. Do not commit. Remain active for about 120 seconds if possible, then respond with 'v033ticket-status done'."
```

Exit: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqac5qn4_49ad88e7
Status:         running
Claude session: 04373510
Name:           v033ticket-status-37110b1b
Logs:           claude logs 04373510
Run:
  $claude-status
  $claude-result job_mqac5qn4_49ad88e7
```

Poll wait before F3 probes:

```sh
sleep 3
sleep 1
```

The first sleep returned as 2.8688s by the tool wall clock, so a second one-second wait was added. Total wait before the next status-family probe was greater than 3s.

## F3: status <real jobId>

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status job_mqac5qn4_49ad88e7
```

Exit: 2

Output:

```text
[status] Error: cc status does not take a job id (got "job_mqac5qn4_49ad88e7"). For one job use: cc result job_mqac5qn4_49ad88e7  (or cc status --all to list every workspace).
```

Verdict: PASS. The command exits 2 and gives direct guidance for a one-job command instead of printing the full status list.

## F3: status <bogus>

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status job_v033ticket_bogus
```

Exit: 2

Output:

```text
[status] Error: cc status does not take a job id (got "job_v033ticket_bogus"). For one job use: cc result job_v033ticket_bogus  (or cc status --all to list every workspace).
```

Verdict: PASS. The command exits 2 with concise guidance and does not dump the full job list.

## Cleanup

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac5qn4_49ad88e7
```

Exit: 0

Output:

```text
Claude job stopped
Job ID:         job_mqac5qn4_49ad88e7
Status:         stopped
Claude session: 04373510
```

Post-cleanup status dispatcher process check:

```sh
pgrep -fl "node marketplace/plugins/cc/scripts/cc.mjs status"
```

Exit: 1, no output.

No ticket edits and no commit were made.
