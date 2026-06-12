# Lane 09 - claude-workflow depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first:

```sh
sed -n '1,240p' marketplace/plugins/cc/skills/claude-workflow/SKILL.md
```

Exit: 0

Key instruction excerpt: run `node "<plugin-root>/scripts/cc.mjs" workflow -- "<prompt>"`; forward `--json` only when requested; workflow jobs present an interactive approval dialog before subagents are spawned.

## Verdict

Status: **partial**.

All three workflow launch paths exited 0 with unique `v033ticket-workflow-09-*` names, and the `workflow --json` launch output parsed with `JSON.parse`. The survey workflow reached `needs_input` with workflow phase records and `subagents: 0`; no generated script or post-approval fan-out was captured. The second and JSON jobs recorded `workflow_keyword_request` phase records but remained pre-approval/running until cleanup; no post-approval agents were spawned unattended. This matches the ticket's approval-gate partial criteria, not a plugin failure.

No `--all` command was used.

## Preflight Note

I ran help checks for the dispatcher and workflow surfaces:

```sh
node marketplace/plugins/cc/scripts/cc.mjs --help
node marketplace/plugins/cc/scripts/cc.mjs workflow --help
node marketplace/plugins/cc/scripts/cc.mjs workflows --help
```

All exited 0 and showed `workflow [flags] -- <prompt>` plus `workflows [<jobId>] [--all] [--json]`.

I also started one broad preflight status JSON command, but did not use it as acceptance evidence because it did not return promptly:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json
pgrep -fl "node marketplace/plugins/cc/scripts/cc.mjs status --json"
ps -o pid,ppid,etime,command -p 33337,37209
kill 33337 37209
```

The status command produced no stdout before being terminated.

## A - Survey Workflow

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v033ticket-workflow-09a-survey-20260612-l09 -- "Read-only bounded CC v0.3.3 lane 09 workflow survey. Do not edit files. Do not commit. Survey the test suite organization under packages/plugin-codex/test/ and marketplace/plugins/cc/test/ if present. Prefer a tiny workflow plan with at most two read-only agents and then synthesize three concise observations."
```

Exit: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqaccixe_bb7bf22a
Status:         running
Claude session: 1ca12cf1
Name:           v033ticket-workflow-09a-survey-20260612-l09-14443bae
...
Workflows present an interactive approval dialog (Yes / View raw script / No)
inside the Claude Code TUI.
```

## B - Second Workflow Prompt

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v033ticket-workflow-09b-second-20260612-l09 -- "Read-only bounded CC v0.3.3 lane 09 second workflow prompt. Do not edit files. Do not commit. Compare marketplace/plugins/cc/skills/claude-workflow/SKILL.md with marketplace/plugins/cc/skills/claude-workflows/SKILL.md and summarize how launch and inspection differ. Prefer a tiny two-phase workflow and no more than two read-only agents."
```

Exit: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqacct39_3f6b90fb
Status:         running
Claude session: 8e700c36
Name:           v033ticket-workflow-09b-second-20260612-l09-289d8e64
```

## C - workflow --json Parseability

Command:

```sh
out=$(node marketplace/plugins/cc/scripts/cc.mjs workflow --json --yes --name v033ticket-workflow-09c-json-20260612-l09 -- "Read-only bounded CC v0.3.3 lane 09 workflow JSON parse test. Do not edit files. Do not commit. Build a tiny workflow plan to inspect package metadata and README skill references, with at most two read-only agents, then return one concise JSON-parse marker: V033TICKET_WORKFLOW_JSON."); rc=$?; printf 'dispatcher_exit=%s\n' "$rc"; printf '%s\n' "$out"; printf '%s' "$out" | node -e 'const fs=require("fs"); const text=fs.readFileSync(0,"utf8"); const data=JSON.parse(text); console.log(JSON.stringify({parsed:true,ok:data.ok,jobId:data.job&&data.job.jobId,status:data.job&&data.job.status,sessionName:data.job&&data.job.claude&&data.job.claude.sessionName,pluginVersion:data.job&&data.job.codex&&data.job.codex.pluginVersion}, null, 2));'; exit "$rc"
```

Exit: 0

Raw JSON excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacd5nz_fad99266",
    "status": "running",
    "codex": {
      "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
      "pluginVersion": "0.3.3"
    },
    "claude": {
      "shortId": "5bcf7d44",
      "sessionName": "v033ticket-workflow-09c-json-20260612-l09-d1d9439a",
      "sessionId": "5bcf7d44-59db-4322-a2fb-ed1a5842e40f"
    }
  }
}
```

Parser output:

```json
{
  "parsed": true,
  "ok": true,
  "jobId": "job_mqacd5nz_fad99266",
  "status": "running",
  "sessionName": "v033ticket-workflow-09c-json-20260612-l09-d1d9439a",
  "pluginVersion": "0.3.3"
}
```

## Polling

Commands:

```sh
sleep 4
sleep 6
sleep 10
```

The tool-reported wall clocks were 3.871s, 5.869s, and 9.870s respectively, so each post-launch inspection was separated by at least 3 seconds.

## workflows <job> --json Evidence

Raw detail commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqaccixe_bb7bf22a --json
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqacct39_3f6b90fb --json
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqacd5nz_fad99266 --json
```

All exited 0 and produced parseable JSON.

Summary after the second poll:

```json
{
  "jobId": "job_mqaccixe_bb7bf22a",
  "status": "needs_input",
  "subagents": 0,
  "phaseRecords": 30,
  "interesting": [
    { "type": "workflow_keyword_request" },
    {
      "type": "assistant",
      "role": "assistant",
      "tool": "Bash",
      "input": "{\"command\":\"echo \\\"=== packages/plugin-codex/test ===\\\" && ls -la packages/plugin-codex/test ..."
    },
    {
      "type": "assistant",
      "role": "assistant",
      "text": "`marketplace/plugins/cc/test` is absent. Let me confirm the marketplace test layout before launching the workflow."
    }
  ]
}
```

```json
{
  "jobId": "job_mqacct39_3f6b90fb",
  "status": "running",
  "subagents": 0,
  "phaseRecords": 15,
  "interesting": [
    {
      "type": "user",
      "role": "user",
      "text": "ultracode: Read-only bounded CC v0.3.3 lane 09 second workflow prompt..."
    },
    { "type": "workflow_keyword_request" }
  ]
}
```

```json
{
  "jobId": "job_mqacd5nz_fad99266",
  "status": "running",
  "subagents": 0,
  "phaseRecords": 15,
  "interesting": [
    {
      "type": "user",
      "role": "user",
      "text": "ultracode: Read-only bounded CC v0.3.3 lane 09 workflow JSON parse test..."
    },
    { "type": "workflow_keyword_request" }
  ]
}
```

Fan-out / gate evidence: no job recorded post-approval subagents. The survey job reached `needs_input`, without a captured generated script; the other two were still before approval/fan-out when stopped.

## Cleanup

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqaccixe_bb7bf22a --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacct39_3f6b90fb --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacd5nz_fad99266 --json
```

All exited 0.

Cleanup excerpts:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqaccixe_bb7bf22a",
    "status": "stopped",
    "claude": {
      "shortId": "1ca12cf1",
      "sessionName": "v033ticket-workflow-09a-survey-20260612-l09-14443bae"
    },
    "turns": [
      { "status": "needs_input" }
    ]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacct39_3f6b90fb",
    "status": "stopped",
    "claude": {
      "shortId": "8e700c36",
      "sessionName": "v033ticket-workflow-09b-second-20260612-l09-289d8e64"
    },
    "turns": [
      { "status": "queued" }
    ]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacd5nz_fad99266",
    "status": "stopped",
    "claude": {
      "shortId": "5bcf7d44",
      "sessionName": "v033ticket-workflow-09c-json-20260612-l09-d1d9439a"
    },
    "turns": [
      { "status": "queued" }
    ]
  }
}
```

Final targeted checks:

```sh
ps -p 45416,47818,48992 -o pid,stat,command
```

Exit: 1; output was only the header, so the three recorded Claude PIDs were gone.

```sh
node - <<'NODE'
const { spawnSync } = require('node:child_process');
for (const id of ['job_mqaccixe_bb7bf22a','job_mqacct39_3f6b90fb','job_mqacd5nz_fad99266']) {
  const r = spawnSync('node', ['marketplace/plugins/cc/scripts/cc.mjs', 'workflows', id, '--json'], { encoding: 'utf8' });
  const data = JSON.parse(r.stdout);
  console.log(JSON.stringify({ jobId: data.jobId, status: data.status, subagents: data.subagents.length, phaseRecords: data.phaseRecords.length }));
}
NODE
```

Output:

```json
{"jobId":"job_mqaccixe_bb7bf22a","status":"stopped","subagents":0,"phaseRecords":30}
{"jobId":"job_mqacct39_3f6b90fb","status":"stopped","subagents":0,"phaseRecords":20}
{"jobId":"job_mqacd5nz_fad99266","status":"stopped","subagents":0,"phaseRecords":20}
```

No ticket edits and no commit were made.
