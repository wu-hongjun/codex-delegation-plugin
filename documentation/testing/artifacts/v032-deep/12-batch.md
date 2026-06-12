# Lane 12 - claude-batch depth test

Date: 2026-06-11

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

## Skill read first

Command:

```sh
sed -n '1,240p' marketplace/plugins/cc/skills/claude-batch/SKILL.md
```

Exit code: 0

Excerpt:

```text
name: claude-batch
description: Run a batch of Claude Code instructions via the Batch Parallel Work Orchestration runtime.

Run:

    node "<plugin-root>/scripts/cc.mjs" batch -- "<instruction>"

This skill starts a Claude Code background session with `/batch <instruction>`
injected as the opening slash command. The runtime injects a
`# Batch: Parallel Work Orchestration` system prompt that sets up the model to
orchestrate a parallelizable change: research and plan (plan mode), then
decompose into tasks and execute them in parallel.

Batch sessions can spawn multiple parallel tool-calls and subagents.
```

## Variation A - small bounded batch

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs batch --yes --name v032deep-batch-small-12 -- "Read-only bounded CC plugin v0.3.2 batch test, lane 12. Use parallel subagents where appropriate to inspect only local repository files and command help. Suggested split: one subagent reads marketplace/plugins/cc/skills/claude-batch/SKILL.md, another inspects dispatcher batch/status/result/stop usage from marketplace/plugins/cc/scripts/cc.mjs or help output. Do not create, edit, delete, or commit files. Return a concise report with explicit phase labels, whether fan-out occurred, exact files/commands observed, and any limits hit. Stop after at most 5 minutes."
```

Exit code: 0

Stdout excerpt:

```text
Claude job started
Job ID:         job_mqa3j6ao_ba40f9a9
Status:         running
Claude session: 2d279f20
Name:           v032deep-batch-small-12
Logs:           claude logs 2d279f20

This is a Claude Code batch request.
The runtime injects a "# Batch: Parallel Work Orchestration" system prompt.
Batch sessions can spawn multiple parallel tool-calls and subagents.
```

Polling command:

```sh
sleep 12
```

Exit code: 0. Harness wall time was about 11.86s, satisfying the >=10s poll requirement.

Job metadata extraction:

```sh
node -e 'const fs=require("fs"); const p=process.env.HOME+"/.codex/cc-plugin-codex/jobs/job_mqa3j6ao_ba40f9a9.json"; const j=JSON.parse(fs.readFileSync(p,"utf8")); console.log(JSON.stringify({jobId:j.jobId,status:j.status,name:j.claude.sessionName,shortId:j.claude.shortId,sessionId:j.claude.sessionId,pid:j.claude.pid,pluginVersion:j.codex.pluginVersion,promptSummary:j.prompt.summary,turnStatuses:j.turns.map(t=>t.status),resultPath:j.result?.finalMessagePath,resultPreview:j.result?.finalMessagePreview},null,2));'
```

Exit code: 0

Parsed excerpt:

```json
{
  "jobId": "job_mqa3j6ao_ba40f9a9",
  "status": "needs_input",
  "name": "v032deep-batch-small-12",
  "shortId": "2d279f20",
  "sessionId": "2d279f20-49ee-47a8-93eb-e5a428ad3ccd",
  "pluginVersion": "0.3.2",
  "turnStatuses": ["needs_input"],
  "resultPath": "/Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqa3j6ao_ba40f9a9.result.md"
}
```

`result --json` while the job was waiting:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3j6ao_ba40f9a9 --json
```

Exit code: 1

Excerpt:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqa3j6ao_ba40f9a9 is not complete yet (status: needs_input). Run: cc status",
    "name": "Error"
  }
}
```

Recoverable result file excerpt:

```text
This is a read-only bounded test. I'll honor the read-only constraint (no plan mode worker-spawning, since those workers commit/push ...). I'll fan out two parallel read-only subagents as suggested.
```

Fan-out and phase evidence from filtered `claude logs 2d279f20`:

```text
[OMC#4.9.3] ... agents:2 | ...
Explore           Inspect cc.mjs batch dispatcher
Explore           Read claude-batch SKILL.md
2 Explore agents finished
Inspect cc.mjs batch dispatcher - 2 tool uses - 30.9k tokens
Read claude-batch SKILL.md - 1 tool use - 11.0k tokens
Bash command
Do you want to proceed?
```

Session transcript evidence:

```text
2d279f20-49ee-47a8-93eb-e5a428ad3ccd.jsonl lineCount=39
user content included: "# Batch: Parallel Work Orchestration"
assistant tool_use: Agent description "Read claude-batch SKILL.md"
assistant tool_use: Agent description "Inspect cc.mjs batch dispatcher"
subagents/agent-a5842179ab9cf608e.jsonl: isSidechain=true, Read marketplace/plugins/cc/skills/claude-batch/SKILL.md
subagents/agent-abe21425181d5e5c6.jsonl: isSidechain=true, Read marketplace/plugins/cc/scripts/cc.mjs
```

Cleanup:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3j6ao_ba40f9a9 --json
```

Exit code: 0

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3j6ao_ba40f9a9",
    "status": "stopped",
    "claude": {
      "shortId": "2d279f20",
      "sessionName": "v032deep-batch-small-12"
    }
  }
}
```

Verdict: pass with caveat. The batch launched, injected the batch system prompt, fanned out two read-only subagents, and left recoverable output. It then hit a human permission prompt after the main session attempted a shell command despite the read-only instruction.

## Variation B - `--json` parseable

The dispatcher call was wrapped in a Node parser so the same command could prove JSON parseability and capture parsed fields.

Command:

```sh
node -e 'const {spawnSync}=require("child_process"); const args=["marketplace/plugins/cc/scripts/cc.mjs","batch","--json","--yes","--name","v032deep-batch-json-12","--","Read-only bounded CC plugin v0.3.2 batch JSON-output test, lane 12. Use up to two parallel subagents where appropriate, but use only read-only file inspection tools; do not run Bash or shell commands. Inspect marketplace/plugins/cc/skills/claude-batch/SKILL.md and marketplace/plugins/cc/scripts/cc.mjs for batch/status/result/stop behavior. Do not create, edit, delete, or commit files. Return a concise report with explicit phase labels, fan-out evidence, exact files observed, and any limits hit. Stop after at most 3 minutes."]; const r=spawnSync(process.execPath,args,{encoding:"utf8"}); let parsed=null, parseError=null; try { parsed=JSON.parse(r.stdout); } catch (e) { parseError=e.message; } const evidence={dispatcherCommand:["node",...args], dispatcherExitCode:r.status, stderr:r.stderr.trim(), rawStdoutExcerpt:r.stdout.split(/\n/).slice(0,16), parseOk:!!parsed, parseError, parsedSummary: parsed ? {ok:parsed.ok, jobId:parsed.job?.jobId, status:parsed.job?.status, name:parsed.job?.claude?.sessionName, shortId:parsed.job?.claude?.shortId, sessionId:parsed.job?.claude?.sessionId, promptSummary:parsed.job?.prompt?.summary, pluginVersion:parsed.job?.codex?.pluginVersion} : null}; console.log(JSON.stringify(evidence,null,2)); process.exit(r.status || (parsed ? 0 : 1));'
```

Exit code: 0

JSON parse evidence:

```json
{
  "dispatcherExitCode": 0,
  "stderr": "",
  "rawStdoutExcerpt": [
    "{",
    "  \"ok\": true,",
    "  \"job\": {",
    "    \"jobId\": \"job_mqa3nlut_3bcedf5c\"",
    "  ..."
  ],
  "parseOk": true,
  "parseError": null,
  "parsedSummary": {
    "ok": true,
    "jobId": "job_mqa3nlut_3bcedf5c",
    "status": "running",
    "name": "v032deep-batch-json-12",
    "shortId": "75631435",
    "sessionId": "75631435-a752-4d34-a13c-b8a725ce118c",
    "pluginVersion": "0.3.2"
  }
}
```

Polling commands:

```sh
sleep 12
sleep 35
```

Exit codes: 0, 0. The first wait was about 11.87s; the second was allowed to complete after one harness yield.

Scoped job metadata after first poll:

```json
{
  "jobId": "job_mqa3nlut_3bcedf5c",
  "status": "running",
  "name": "v032deep-batch-json-12",
  "shortId": "75631435",
  "sessionId": "75631435-a752-4d34-a13c-b8a725ce118c",
  "turnStatuses": ["queued"]
}
```

Filtered log evidence:

```text
Phase 1 - Fan-out (2 parallel read-only subagents)
Running 2 Explore agents...
[OMC#4.9.3] ... agents:2 | ...
Explore           Inspect cc.mjs batch logic
Explore           Inspect claude-batch SKILL.md
2 Explore agents finished
The two subagents completed their inspections but returned empty summaries ... a fan-out limit hit.
```

Session transcript evidence:

```text
75631435-a752-4d34-a13c-b8a725ce118c.jsonl lineCount=59
assistant text: "I'll fan out two parallel read-only subagents..."
assistant tool_use: Agent description "Inspect claude-batch SKILL.md"
assistant tool_use: Agent description "Inspect cc.mjs batch logic"
tool_result: "End of report."
tool_result: "Ready. The read-only analysis of the batch lifecycle commands..."
subagents/agent-a4474b32b9f84247d.jsonl: isSidechain=true, Read claude-batch/SKILL.md
subagents/agent-a0f8701bde2d12065.jsonl: isSidechain=true, Read cc.mjs offset 1 and offset 1575
```

Recoverable result file excerpt:

```text
The two subagents completed their inspections but returned empty summaries (final messages were just "End of report." / "Ready." with no content relayed) - a fan-out limit hit. I'll read the two files directly to produce the actual findings.
```

Cleanup:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3nlut_3bcedf5c --json
```

Exit code: 0

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3nlut_3bcedf5c",
    "status": "stopped",
    "claude": {
      "shortId": "75631435",
      "sessionName": "v032deep-batch-json-12"
    }
  }
}
```

Verdict: pass for `--json` parseability and fan-out evidence. Caveat: job turn metadata remained `queued` while logs/transcripts clearly showed active work and completed subagents, so scoped logs/transcripts were more reliable than the turn status.

## Variation C - start then stop mid-run

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs batch --yes --name v032deep-batch-stop-12 -- "Read-only bounded CC plugin v0.3.2 batch stop test, lane 12. Use parallel subagents where appropriate, but use only read-only file inspection tools; do not run Bash or shell commands and do not create, edit, delete, or commit files. Suggested split: four read-only subagents inspect marketplace/plugins/cc/skills/claude-batch/SKILL.md, marketplace/plugins/cc/skills/claude-status/SKILL.md, marketplace/plugins/cc/skills/claude-stop/SKILL.md, and marketplace/plugins/cc/scripts/cc.mjs batch/status/result/stop handling. Emit visible checkpoint text after each phase using the prefix PARTIAL-CHECKPOINT so partial output can be recovered if stopped. Do not final-answer until subagents have returned and you have synthesized at least two checkpoint sections. Stop yourself after at most 8 minutes."
```

Exit code: 0

Stdout excerpt:

```text
Claude job started
Job ID:         job_mqa3q8ri_bbb86cb9
Status:         running
Claude session: cf51781d
Name:           v032deep-batch-stop-12
```

Stop delay:

```sh
sleep 12
```

Exit code: 0. Harness wall time was about 11.86s.

Stop command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3q8ri_bbb86cb9 --json
```

Exit code: 0

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3q8ri_bbb86cb9",
    "status": "stopped",
    "claude": {
      "shortId": "cf51781d",
      "sessionName": "v032deep-batch-stop-12",
      "sessionId": "cf51781d-1e1c-45df-b0de-8c6b276b207c"
    },
    "turns": [
      {
        "status": "queued"
      }
    ]
  }
}
```

Events:

```text
{"type":"reconcile.status","at":"2026-06-11T23:01:17.278Z","previousStatus":"queued","nextStatus":"running"}
{"type":"stop.completed","at":"2026-06-11T23:01:38.438Z"}
```

Result check:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3q8ri_bbb86cb9 --json
```

Exit code: 0

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3q8ri_bbb86cb9",
    "status": "stopped"
  },
  "resultText": null
}
```

Post-stop log check:

```sh
claude logs cf51781d | perl -pe 's/\x1b\[[0-9;?]*[ -\/]*[@-~]//g; s/\x1b\][^\a]*(\a|\x1b\\)//g' | tr '\r' '\n' | rg -n "PARTIAL-CHECKPOINT|Phase|Fan-out|agents|Explore|Inspect|stopped|Stop|subagents|Running"
```

Exit code: 1

Excerpt:

```text
Couldn't read logs for cf51781d - job not found - it may have already exited
```

Recoverable partial-output evidence from saved session transcripts:

```text
cf51781d-1e1c-45df-b0de-8c6b276b207c.jsonl lineCount=21
user content included: "# Batch: Parallel Work Orchestration"

subagents/agent-a513ee9237c60f4af.jsonl lineCount=7
isSidechain=true
user prompt: "Read-only inspection task. Use ONLY read-only file inspection tools..."
assistant tool_use: Read marketplace/plugins/cc/skills/claude-batch/SKILL.md
tool_result included lines 1-6 of claude-batch/SKILL.md

subagents/agent-a76c7b3b50a6a1055.jsonl lineCount=4
isSidechain=true
user prompt: "Read-only inspection task... Read the file: .../claude-status/SKILL.md"
```

Verdict: pass. Stop returned cleanly with `ok: true`, status `stopped`, and a `stop.completed` event. No final result text was produced because the job was stopped early, but partial work remained recoverable from the saved JSONL transcript/subagent files.

## Status note

One broad workspace command was attempted after Variation A:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json
```

It produced no output after two 30s harness yields and was not used as evidence. A process scan found only an unrelated lane-11 status pipeline, so I left it alone. All batch evidence above is from scoped job records, events, logs, and session transcripts.

## Cleanup verification

Command:

```sh
node -e 'const fs=require("fs"), dir=process.env.HOME+"/.codex/cc-plugin-codex/jobs"; const rows=[]; for (const f of fs.readdirSync(dir).filter(f=>f.endsWith(".json"))) { const j=JSON.parse(fs.readFileSync(dir+"/"+f,"utf8")); if (j.claude?.sessionName?.startsWith("v032deep-batch-")) rows.push({jobId:j.jobId,name:j.claude.sessionName,status:j.status,shortId:j.claude.shortId,sessionId:j.claude.sessionId,updatedAt:j.updatedAt,turnStatuses:j.turns?.map(t=>t.status),hasResult:!!j.result}); } rows.sort((a,b)=>a.name.localeCompare(b.name)); console.log(JSON.stringify(rows,null,2));'
```

Exit code: 0

Parsed excerpt:

```json
[
  {
    "jobId": "job_mqa3nlut_3bcedf5c",
    "name": "v032deep-batch-json-12",
    "status": "stopped",
    "shortId": "75631435",
    "turnStatuses": ["queued"],
    "hasResult": true
  },
  {
    "jobId": "job_mqa3j6ao_ba40f9a9",
    "name": "v032deep-batch-small-12",
    "status": "stopped",
    "shortId": "2d279f20",
    "turnStatuses": ["needs_input"],
    "hasResult": true
  },
  {
    "jobId": "job_mqa3q8ri_bbb86cb9",
    "name": "v032deep-batch-stop-12",
    "status": "stopped",
    "shortId": "cf51781d",
    "turnStatuses": ["queued"],
    "hasResult": false
  }
]
```

Process scan:

```sh
ps -axo pid,ppid,stat,command | rg 'v032deep-batch|job_mqa3j6ao|job_mqa3nlut|job_mqa3q8ri|cc\.mjs (batch|stop|result)|claude logs (2d279f20|75631435|cf51781d)'
```

Exit code: 0

Excerpt:

```text
Only the current ps/rg command matched; no lane-12 batch dispatcher or log process remained.
```

Git status before adding this artifact already showed unrelated untracked repository paths under `references/`, `.claude/`, and `documentation/testing/artifacts/`. No commit was made. The only manual repository write for this lane is this file; dispatcher/runtime metadata was written under `~/.codex/cc-plugin-codex/jobs` and `~/.claude/projects`.

## Verdict

PASS with caveats:

- Small bounded batch started, injected the batch prompt, fanned out two read-only subagents, and left recoverable output, but it reached `needs_input` after a shell permission prompt.
- `batch --json` stdout was accepted by `JSON.parse`, returned `ok: true`, and contained the expected job/session fields.
- Stop mid-run returned `ok: true` and `status: stopped`; final `resultText` was null, but partial output was recoverable from session/subagent JSONL.
- Fan-out/phase evidence was visible in logs and transcripts (`agents:2`, two Explore lanes, Agent tool uses, sidechain subagent JSONL). Turn status metadata lagged or stayed `queued` for two stopped jobs, so logs/transcripts were the authoritative evidence for runtime work.
