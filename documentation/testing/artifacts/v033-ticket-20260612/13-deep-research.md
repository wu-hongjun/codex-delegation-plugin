# Lane 13 - claude-deep-research ticket depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Date: 2026-06-12

Result: partial pass. Launches worked and `--json` was parseable, but all jobs stopped at the Claude Code dynamic-workflow approval gate (`needs_input`), so no post-approval WebSearch/fetch/verify agents executed.

## Skill read first

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-deep-research/SKILL.md
```

Exit code: 0

Relevant excerpt:

```text
Run:

    node "<plugin-root>/scripts/cc.mjs" deep-research -- "<question>"

This skill starts a Claude Code background session with `/deep-research <question>`
injected as the opening slash command. The `/deep-research` slash command triggers
Claude's bundled workflow runtime, which spawns multiple agents fanning out web
searches, fetching sources, adversarially verifying claims, and synthesizing a
cited report.

If `$claude-status <jobId>` returns `needs_input` on the first poll and stays
there, the `/deep-research` injection may have failed to reach the model. Stop
the stalled session with `$claude-stop <jobId>` and re-run `$claude-deep-research`
with the same question.
```

The ticket explicitly requested unique `--name` values and `--json` parseability, so those flags were forwarded. `--yes` was not used.

## Dispatcher help check

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs --help
```

Exit code: 0

Excerpt:

```text
deep-research [flags] -- <question>       Run a Claude Code /deep-research workflow (multi-agent fan-out with WebSearch)
--json                       Machine-readable JSON output (.../deep-research/...)
--name <name>                Session name (..., deep-research)
```

## Probe A - narrow OpenAI docs question

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs deep-research --name v033ticket-deepresearch-13a-openai-responses -- "According to current official OpenAI API documentation, what endpoint path creates a response with the Responses API, and what is the minimal top-level input field? Answer in two bullets with citations."
```

Exit code: 0

Stdout excerpt:

```text
Claude job started
Job ID:         job_mqacezp5_edf17125
Status:         running
Claude session: 5385bd82
Name:           v033ticket-deepresearch-13a-openai-responses-83036527
Logs:           claude logs 5385bd82

This is a Claude Code deep-research request.
The /deep-research runtime fans out parallel web searches, fetches sources,
adversarially verifies claims, and synthesizes a cited report.
```

Poll after >=3s:

```sh
node -e 'const {spawnSync}=require("node:child_process"); setTimeout(()=>{const r=spawnSync(process.execPath,["marketplace/plugins/cc/scripts/cc.mjs","status","--json"],{encoding:"utf8",maxBuffer:80*1024*1024,timeout:45000}); if(r.error){console.error(r.error.message); process.exit(r.error.code==="ETIMEDOUT"?124:1);} if(r.status!==0){process.stderr.write(r.stderr||""); process.exit(r.status||1);} const data=JSON.parse(r.stdout); const prefix="v033ticket-deepresearch-13"; const jobs=(data.jobs||[]).filter(j=>(j.claude?.sessionName||"").startsWith(prefix)).map(j=>({jobId:j.jobId,status:j.status,sessionName:j.claude?.sessionName,shortId:j.claude?.shortId,logsCommand:j.claude?.logsCommand,promptSummary:j.prompt?.summary,turnStatuses:(j.turns||[]).map(t=>t.status),resultPreview:j.result?.finalMessagePreview||j.turns?.at(-1)?.result?.finalMessagePreview||null,transcriptPath:j.claude?.transcriptPath||null})); console.log(JSON.stringify({ok:data.ok,count:jobs.length,jobs},null,2));},3000);'
```

Exit code: 124 after the 45s cap.

Output:

```text
spawnSync /opt/homebrew/Cellar/node/25.8.2/bin/node ETIMEDOUT
```

Single-job dispatcher poll:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqacezp5_edf17125 --json
```

Exit code: 1

Output:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqacezp5_edf17125 is not complete yet (status: needs_input). Run: cc status",
    "name": "Error"
  }
}
```

## Probe B - second narrow Node.js docs question

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs deep-research --json --name v033ticket-deepresearch-13b-node-version -- "According to current official Node.js documentation, what command prints the installed Node.js version, and which official documentation page states it? Answer in one sentence with a citation."
```

Exit code: 0

JSON stdout excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacgvjd_1cbc2b05",
    "status": "running",
    "codex": {
      "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
      "pluginVersion": "0.3.3"
    },
    "claude": {
      "version": "2.1.174 (Claude Code)",
      "shortId": "64b2ffae",
      "sessionName": "v033ticket-deepresearch-13b-node-version-8042c1da",
      "sessionId": "64b2ffae-4314-478f-8f14-b6ee007ebfbe",
      "pid": 64498
    },
    "turns": [
      {
        "status": "queued"
      }
    ]
  }
}
```

Poll after >=3s:

```sh
sleep 3
node marketplace/plugins/cc/scripts/cc.mjs result job_mqacgvjd_1cbc2b05 --json
```

Exit code: 1

Output:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqacgvjd_1cbc2b05 is not complete yet (status: needs_input). Run: cc status",
    "name": "Error"
  }
}
```

## Probe C - explicit JSON parseability

Command:

```sh
node -e 'const {spawnSync}=require("node:child_process"); const args=["marketplace/plugins/cc/scripts/cc.mjs","deep-research","--json","--name","v033ticket-deepresearch-13c-json-parse","--","According to current official Python documentation, what command-line flag prints the Python version? Answer in one sentence with a citation."]; const r=spawnSync(process.execPath,args,{encoding:"utf8",maxBuffer:80*1024*1024,timeout:60000}); if(r.stderr) process.stderr.write(r.stderr); if(r.error){console.error(r.error.message); process.exit(r.error.code==="ETIMEDOUT"?124:1);} if(r.status!==0){process.stdout.write(r.stdout||""); process.exit(r.status||1);} const parsed=JSON.parse(r.stdout); console.log(JSON.stringify({parseOk:true, ok:parsed.ok, jobId:parsed.job?.jobId, status:parsed.job?.status, pluginVersion:parsed.job?.codex?.pluginVersion, sessionName:parsed.job?.claude?.sessionName, shortId:parsed.job?.claude?.shortId, firstTurnStatus:parsed.job?.turns?.[0]?.status},null,2));'
```

Exit code: 0

Parsed stdout summary:

```json
{
  "parseOk": true,
  "ok": true,
  "jobId": "job_mqachywq_f08c7516",
  "status": "running",
  "pluginVersion": "0.3.3",
  "sessionName": "v033ticket-deepresearch-13c-json-parse-cf1a9c24",
  "shortId": "6446f868",
  "firstTurnStatus": "queued"
}
```

Poll after >=3s:

```sh
sleep 3
node marketplace/plugins/cc/scripts/cc.mjs result job_mqachywq_f08c7516 --json
```

Exit code: 1

Output:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqachywq_f08c7516 is not complete yet (status: needs_input). Run: cc status",
    "name": "Error"
  }
}
```

## Gate state before cleanup

Command:

```sh
node -e 'const fs=require("node:fs"); const path=require("node:path"); const home=process.env.HOME; const ids=["job_mqacezp5_edf17125","job_mqacgvjd_1cbc2b05","job_mqachywq_f08c7516"]; const out=ids.map(id=>{const p=path.join(home,".codex","cc-plugin-codex","jobs",`${id}.json`); const j=JSON.parse(fs.readFileSync(p,"utf8")); return {jobId:j.jobId,status:j.status,sessionName:j.claude?.sessionName,shortId:j.claude?.shortId,sessionId:j.claude?.sessionId,pid:j.claude?.pid,transcriptPath:j.claude?.transcriptPath||null,turnStatuses:(j.turns||[]).map(t=>t.status),updatedAt:j.updatedAt};}); console.log(JSON.stringify(out,null,2));'
```

Exit code: 0

Output excerpt:

```json
[
  {
    "jobId": "job_mqacezp5_edf17125",
    "status": "needs_input",
    "sessionName": "v033ticket-deepresearch-13a-openai-responses-83036527",
    "shortId": "5385bd82",
    "transcriptPath": null,
    "turnStatuses": ["needs_input"]
  },
  {
    "jobId": "job_mqacgvjd_1cbc2b05",
    "status": "needs_input",
    "sessionName": "v033ticket-deepresearch-13b-node-version-8042c1da",
    "shortId": "64b2ffae",
    "transcriptPath": null,
    "turnStatuses": ["needs_input"]
  },
  {
    "jobId": "job_mqachywq_f08c7516",
    "status": "needs_input",
    "sessionName": "v033ticket-deepresearch-13c-json-parse-cf1a9c24",
    "shortId": "6446f868",
    "transcriptPath": null,
    "turnStatuses": ["needs_input"]
  }
]
```

## Fan-out plan from logs

Command:

```sh
claude logs 5385bd82 | perl -pe 's/\e\][^\a]*(\a|\e\\)//g; s/\e\[[0-9;?]*[ -\/]*[@-~]//g; s/\r/\n/g' | rg -n -C 1 'Workflow|Run a dynamic workflow|Deep research harness|subagents|Scope|Search|Fetch|Verify|Synthesize|args:|Yes, run it'
```

Exit code: 0

Excerpt:

```text
78:Workflow(dynamicworkflow:deep-research)
81:Run a dynamic workflow?
82:Deep research harness - fan-out web searches, fetch sources, adversarially verify claims, synthesize a cited report.
83:This dynamic workflow will spin up multiple subagents across the following phases:
84:1. Scope - Decompose question (from args) into 5 search angles
86:2. Search - 5 parallel WebSearch agents, one per angle
88:3. Fetch - URL-dedup, fetch top 15 sources, extract falsifiable claims
90:4. Verify - 3-vote adversarial verification per claim (need 2/3 refutes to kill)
91:5. Synthesize - Merge semantic dupes, rank by confidence, cite sources
95:1. Yes, run it
```

The same approval screen and fan-out phases were visible in `claude logs 64b2ffae` and `claude logs 6446f868`. Actual post-approval agents were not observed because the sessions remained at the approval prompt.

## Cleanup

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacezp5_edf17125 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacgvjd_1cbc2b05 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqachywq_f08c7516 --json
```

Exit codes: 0, 0, 0

Stop excerpts:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacezp5_edf17125",
    "status": "stopped",
    "claude": {
      "shortId": "5385bd82",
      "sessionName": "v033ticket-deepresearch-13a-openai-responses-83036527"
    },
    "turns": [{"status": "needs_input"}]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacgvjd_1cbc2b05",
    "status": "stopped",
    "claude": {
      "shortId": "64b2ffae",
      "sessionName": "v033ticket-deepresearch-13b-node-version-8042c1da"
    },
    "turns": [{"status": "needs_input"}]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqachywq_f08c7516",
    "status": "stopped",
    "claude": {
      "shortId": "6446f868",
      "sessionName": "v033ticket-deepresearch-13c-json-parse-cf1a9c24"
    },
    "turns": [{"status": "needs_input"}]
  }
}
```

Final verification command:

```sh
node -e 'const fs=require("node:fs"); const path=require("node:path"); const ids=["job_mqacezp5_edf17125","job_mqacgvjd_1cbc2b05","job_mqachywq_f08c7516"]; const jobs=ids.map(id=>{const j=JSON.parse(fs.readFileSync(path.join(process.env.HOME,".codex","cc-plugin-codex","jobs",`${id}.json`),"utf8")); return {jobId:j.jobId,status:j.status,sessionName:j.claude?.sessionName,shortId:j.claude?.shortId,turnStatuses:(j.turns||[]).map(t=>t.status)};}); console.log(JSON.stringify({allStopped:jobs.every(j=>j.status==="stopped"),jobs},null,2));'
```

Exit code: 0

Output:

```json
{
  "allStopped": true,
  "jobs": [
    {
      "jobId": "job_mqacezp5_edf17125",
      "status": "stopped",
      "sessionName": "v033ticket-deepresearch-13a-openai-responses-83036527",
      "shortId": "5385bd82",
      "turnStatuses": ["needs_input"]
    },
    {
      "jobId": "job_mqacgvjd_1cbc2b05",
      "status": "stopped",
      "sessionName": "v033ticket-deepresearch-13b-node-version-8042c1da",
      "shortId": "64b2ffae",
      "turnStatuses": ["needs_input"]
    },
    {
      "jobId": "job_mqachywq_f08c7516",
      "status": "stopped",
      "sessionName": "v033ticket-deepresearch-13c-json-parse-cf1a9c24",
      "shortId": "6446f868",
      "turnStatuses": ["needs_input"]
    }
  ]
}
```

## Summary

- Probe A and Probe B launched narrow questions with unique `v033ticket-deepresearch` names.
- Probe B emitted raw parseable JSON, and Probe C explicitly parsed dispatcher `--json` stdout with `JSON.parse`.
- The logs showed the expected deep-research fan-out plan: 5 search angles, 5 parallel WebSearch agents, top-15 fetch, 3-vote adversarial verification, and synthesis.
- All three jobs reached `needs_input` at the dynamic workflow approval gate; no post-approval agents ran.
- All three jobs were stopped and verified as `stopped`.
- No ticket files were edited and no commit was made.
