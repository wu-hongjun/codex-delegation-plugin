# Lane 11 - claude-fork depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Date: 2026-06-11

## Skill read first

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-fork/SKILL.md
```

Exit code: 0

Excerpt:

```text
name: claude-fork
description: Fork a Claude Code subagent for a directive (spawns a parallel subagent in a background session).

Run:

    node "<plugin-root>/scripts/cc.mjs" fork -- "<directive>"

This skill starts a Claude Code background session with `/fork <directive>`
injected as the opening slash command. The runtime spawns a real subagent
process to execute the directive; the parent session completes when the
subagent finishes.

`/fork` directives spawn a full subagent -- even a trivial directive can
consume 20-30k tokens.
```

The 20-30k token baseline is therefore by design for `/fork`, even for narrow
read-only directives.

## Variation A - explain-code directive

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs fork --yes --name v032deep-fork-11-explain-20260611-1855 -- 'Read marketplace/plugins/cc/scripts/cc.mjs only and explain how the fork subcommand starts a background subagent in 5 concise bullets. Do not edit files.'
```

Exit code: 0

Stdout excerpt:

```text
Claude job started
Job ID:         job_mqa3h3yc_18edd432
Status:         running
Claude session: 30061065
Name:           v032deep-fork-11-explain-20260611-1855
Logs:           claude logs 30061065
Run:
  $claude-status
  $claude-result job_mqa3h3yc_18edd432

This is a Claude Code fork request.
The runtime spawns a real subagent process to execute the directive.
Note: /fork directives consume 20-30k tokens even for trivial directives.
Attach via `claude attach <jobId>` to watch progress.
```

## Variation B/C - second directive with JSON output

This combines the second bounded read-only directive with the `--json`
parseability variation.

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs fork --yes --json --name v032deep-fork-11-json-20260611-1855 -- 'Read marketplace/plugins/cc/skills/claude-fork/SKILL.md only and summarize its allowed flags, approval flow, and cost notice in 5 concise bullets. Do not edit files.'
```

Exit code: 0

JSON stdout excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3hd79_4227610a",
    "schemaVersion": 2,
    "createdAt": "2026-06-11T22:54:21.717Z",
    "updatedAt": "2026-06-11T22:54:23.092Z",
    "status": "running",
    "codex": {
      "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
      "pluginVersion": "0.3.2"
    },
    "claude": {
      "shortId": "0a03e9fb",
      "sessionName": "v032deep-fork-11-json-20260611-1855",
      "sessionId": "0a03e9fb-5567-4b86-a88c-516dcb661964",
      "pid": 32051
    },
    "prompt": {
      "summary": "/fork Read marketplace/plugins/cc/skills/claude-fork/SKILL.md only and summarize its allowed flags, approval flow, and c"
    }
  }
}
```

Parse evidence: subsequent verification commands piped dispatcher JSON through
`JSON.parse(...)` and exited 0. The parsed status/result objects below were
produced from those commands.

## Polling

Commands:

```sh
sleep 10
sleep 11
```

Exit codes: 0, 0

Notes: the first wait reported 9.8606s wall time in the harness, so a second
`sleep 11` was run before status polling. The second wait reported 10.8713s
wall time, satisfying the >=10s poll requirement.

Filtered status command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); const jobs = data.jobs.filter(j => j.claude?.sessionName?.startsWith("v032deep-fork-11")); console.log(JSON.stringify({ ok: data.ok, count: jobs.length, jobs: jobs.map(j => ({ jobId: j.jobId, status: j.status, sessionName: j.claude?.sessionName, shortId: j.claude?.shortId, sessionId: j.claude?.sessionId, pid: j.claude?.pid, logsCommand: j.claude?.logsCommand, pluginVersion: j.codex?.pluginVersion, promptSummary: j.prompt?.summary, turnStatuses: j.turns?.map(t => t.status), finalPreview: j.result?.finalMessagePreview || j.turns?.find(t => t.result)?.result?.finalMessagePreview })) }, null, 2)); });'
```

Exit code: 0

Parsed excerpt:

```json
{
  "ok": true,
  "count": 2,
  "jobs": [
    {
      "jobId": "job_mqa3h3yc_18edd432",
      "status": "awaiting_followup",
      "sessionName": "v032deep-fork-11-explain-20260611-1855",
      "shortId": "30061065",
      "sessionId": "30061065-1eec-4f06-a603-95656dfb4085",
      "pid": 15780,
      "logsCommand": "claude logs 30061065",
      "pluginVersion": "0.3.2",
      "promptSummary": "/fork Read marketplace/plugins/cc/scripts/cc.mjs only and explain how the fork subcommand starts a background subagent i",
      "turnStatuses": ["completed"]
    },
    {
      "jobId": "job_mqa3hd79_4227610a",
      "status": "awaiting_followup",
      "sessionName": "v032deep-fork-11-json-20260611-1855",
      "shortId": "0a03e9fb",
      "sessionId": "0a03e9fb-5567-4b86-a88c-516dcb661964",
      "pid": 32051,
      "logsCommand": "claude logs 0a03e9fb",
      "pluginVersion": "0.3.2",
      "promptSummary": "/fork Read marketplace/plugins/cc/skills/claude-fork/SKILL.md only and summarize its allowed flags, approval flow, and c",
      "turnStatuses": ["completed"]
    }
  ]
}
```

## Result evidence

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3h3yc_18edd432 --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); console.log(JSON.stringify({ ok: data.ok, jobId: data.job?.jobId, status: data.job?.status, sessionName: data.job?.claude?.sessionName, turnStatuses: data.job?.turns?.map(t => t.status), finalMessagePreview: data.job?.result?.finalMessagePreview, resultTextPreview: (data.result || data.finalMessage || "").slice(0, 800) }, null, 2)); });'
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3hd79_4227610a --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); console.log(JSON.stringify({ ok: data.ok, jobId: data.job?.jobId, status: data.job?.status, sessionName: data.job?.claude?.sessionName, turnStatuses: data.job?.turns?.map(t => t.status), finalMessagePreview: data.job?.result?.finalMessagePreview, resultTextPreview: (data.result || data.finalMessage || "").slice(0, 800) }, null, 2)); });'
```

Exit codes: 0, 0

Parsed excerpts:

```json
{
  "ok": true,
  "jobId": "job_mqa3h3yc_18edd432",
  "status": "awaiting_followup",
  "sessionName": "v032deep-fork-11-explain-20260611-1855",
  "turnStatuses": ["completed"],
  "finalMessagePreview": "The fork subagent reported back \"Standing by.\" without including its analysis, so here's the answer from reading the source directly. ## How `cc fork` starts a ..."
}
```

```json
{
  "ok": true,
  "jobId": "job_mqa3hd79_4227610a",
  "status": "awaiting_followup",
  "sessionName": "v032deep-fork-11-json-20260611-1855",
  "turnStatuses": ["completed"],
  "finalMessagePreview": "The fork completed. Here's the summary of `claude-fork/SKILL.md`: - **Allowed flags** ..."
}
```

Additional local job artifact checks:

```sh
ls -la /Users/hongjunwu/.codex/cc-plugin-codex/jobs | rg 'job_mqa3h3yc|job_mqa3hd79'
sed -n '1,180p' /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3h3yc_18edd432.result.md
sed -n '1,180p' /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3hd79_4227610a.result.md
rg -n 'fork|subagent|Task|Standing by|v032deep-fork|job_mqa3h3yc|job_mqa3hd79' /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3h3yc_18edd432* /Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3hd79_4227610a*
```

Exit codes: 0, 0, 0, 0

Visible fan-out evidence:

- The dispatcher start output for both jobs identified the request as a Claude
  Code fork and stated that the runtime spawns a real subagent process.
- Status/job metadata exposed parent background sessions whose prompt summaries
  start with `/fork ...`, with unique session names, session IDs, pids, and
  `pluginVersion: "0.3.2"`.
- The explain-code result artifact says: `The fork subagent reported back
  "Standing by."`
- The JSON variation result artifact says: `The fork completed.`
- The stored job metadata did not expose a separate child subagent job ID or
  child process ID beyond the parent Claude background session metadata.

## Cleanup

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3h3yc_18edd432 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3hd79_4227610a --json
```

Exit codes: 0, 0

Parsed excerpts:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3h3yc_18edd432",
    "status": "stopped",
    "claude": {
      "sessionName": "v032deep-fork-11-explain-20260611-1855"
    },
    "turns": [
      {
        "status": "completed"
      }
    ]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3hd79_4227610a",
    "status": "stopped",
    "claude": {
      "sessionName": "v032deep-fork-11-json-20260611-1855"
    },
    "turns": [
      {
        "status": "completed"
      }
    ]
  }
}
```

Final cleanup verification command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); const jobs = data.jobs.filter(j => j.claude?.sessionName?.startsWith("v032deep-fork-11")); console.log(JSON.stringify({ ok: data.ok, count: jobs.length, jobs: jobs.map(j => ({ jobId: j.jobId, status: j.status, sessionName: j.claude?.sessionName, turnStatuses: j.turns?.map(t => t.status) })) }, null, 2)); });'
```

Exit code: 0

Final parsed excerpt:

```json
{
  "ok": true,
  "count": 2,
  "jobs": [
    {
      "jobId": "job_mqa3h3yc_18edd432",
      "status": "stopped",
      "sessionName": "v032deep-fork-11-explain-20260611-1855",
      "turnStatuses": ["completed"]
    },
    {
      "jobId": "job_mqa3hd79_4227610a",
      "status": "stopped",
      "sessionName": "v032deep-fork-11-json-20260611-1855",
      "turnStatuses": ["completed"]
    }
  ]
}
```

No commit was made.
