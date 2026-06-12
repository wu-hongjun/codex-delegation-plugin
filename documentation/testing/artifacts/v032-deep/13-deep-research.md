# Lane 13 - claude-deep-research depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Date: 2026-06-11

## Skill read first

Command:

```sh
sed -n '1,240p' marketplace/plugins/cc/skills/claude-deep-research/SKILL.md
```

Exit code: 0

Excerpt:

```text
name: claude-deep-research
description: "Run a Claude Code dynamic deep-research workflow on a question (multi-agent fan-out with WebSearch + cross-checked citations)."

Run:

    node "<plugin-root>/scripts/cc.mjs" deep-research -- "<question>"

This skill starts a Claude Code background session with `/deep-research <question>`
injected as the opening slash command. The `/deep-research` slash command triggers
Claude's bundled workflow runtime, which spawns multiple agents fanning out web
searches, fetching sources, adversarially verifying claims, and synthesizing a
cited report.
```

Allowed user-requested flags included `--name`, `--json`, and `--yes`. The skill
also says to stop a stalled first-poll `needs_input` session.

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
--yes                        Acknowledge privacy disclosure automatically (.../deep-research/...)
--name <name>                Session name (.../deep-research)
```

## Variation A - narrow OpenAI docs question

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs deep-research --yes --name v032deep-deepresearch-13a-openai-responses -- "According to current official OpenAI API documentation, what endpoint path and required top-level request field are used to create a response with the Responses API? Keep the answer concise and cite only official OpenAI docs."
```

Exit code: 0

Stdout excerpt:

```text
Claude job started
Job ID:         job_mqa3oh9j_568bb0c4
Status:         running
Claude session: cc9bf35e
Name:           v032deep-deepresearch-13a-openai-responses
Logs:           claude logs cc9bf35e

This is a Claude Code deep-research request.
The /deep-research runtime fans out parallel web searches, fetches sources,
adversarially verifies claims, and synthesizes a cited report.
WebSearch is auto-available in standard bg sessions.
```

## Variation B - second narrow docs question

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs deep-research --yes --name v032deep-deepresearch-13b-anthropic-version -- "According to current official Anthropic API documentation, what HTTP header name specifies the Anthropic API version, and what version date format/example does the documentation show? Keep the answer concise and cite only official Anthropic docs."
```

Exit code: 0

Stdout excerpt:

```text
Claude job started
Job ID:         job_mqa3op3b_dbcb4ff7
Status:         running
Claude session: 58963f5d
Name:           v032deep-deepresearch-13b-anthropic-version
Logs:           claude logs 58963f5d

This is a Claude Code deep-research request.
The /deep-research runtime fans out parallel web searches, fetches sources,
adversarially verifies claims, and synthesizes a cited report.
WebSearch is auto-available in standard bg sessions.
```

## Variation C - JSON launch

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs deep-research --yes --json --name v032deep-deepresearch-13c-json-node-version -- "According to current official Node.js documentation, what command prints the installed Node.js version, and what official documentation page states it? Keep the answer concise and cite only official Node.js docs."
```

Exit code: 0

JSON stdout excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3oybd_338abb7e",
    "schemaVersion": 2,
    "createdAt": "2026-06-11T23:00:15.673Z",
    "updatedAt": "2026-06-11T23:00:16.826Z",
    "status": "running",
    "codex": {
      "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
      "pluginVersion": "0.3.2"
    },
    "claude": {
      "version": "2.1.173 (Claude Code)",
      "shortId": "abecfa5a",
      "sessionName": "v032deep-deepresearch-13c-json-node-version",
      "sessionId": "abecfa5a-adea-49e3-999e-325020cb8334",
      "pid": 75777
    },
    "prompt": {
      "summary": "/deep-research According to current official Node.js documentation, what command prints the installed Node.js version, a",
      "sha256": "6df0ac3150a5beba828b31767d2efee45fc1be1393cbef179680d73191b19ca7",
      "bytesLen": 227
    },
    "turns": [
      {
        "status": "queued"
      }
    ]
  }
}
```

Parse evidence: the `--json` launch stdout was a single JSON object with no
human preamble or trailer. The parsed fields used for follow-up were:
`ok=true`, `job.jobId=job_mqa3oybd_338abb7e`,
`job.claude.shortId=abecfa5a`, `job.claude.sessionName=...13c-json-node-version`,
and `job.turns[0].status=queued`.

## Polling

Filtered status command, run after the three launches:

```sh
node -e 'const {execFileSync}=require("node:child_process"); const data=JSON.parse(execFileSync(process.execPath,["marketplace/plugins/cc/scripts/cc.mjs","status","--json"],{encoding:"utf8",maxBuffer:80*1024*1024})); const prefix="v032deep-deepresearch-13"; const jobs=(data.jobs||[]).filter(j=>(j.claude?.sessionName||"").startsWith(prefix)).map(j=>({jobId:j.jobId,status:j.status,sessionName:j.claude?.sessionName,shortId:j.claude?.shortId,logsCommand:j.claude?.logsCommand,promptSummary:j.prompt?.summary,turnStatuses:(j.turns||[]).map(t=>t.status),resultPreview:j.result?.finalMessagePreview||j.turns?.at(-1)?.result?.finalMessagePreview||null})); console.log(JSON.stringify({ok:data.ok,count:jobs.length,jobs},null,2));'
```

Exit code: 0

Timing: this status command exceeded the required `>=15s` polling window. The
harness returned no output at 30s, then completed after an additional 20.6774s.

Parsed excerpt:

```json
{
  "ok": true,
  "count": 3,
  "jobs": [
    {
      "jobId": "job_mqa3oh9j_568bb0c4",
      "status": "needs_input",
      "sessionName": "v032deep-deepresearch-13a-openai-responses",
      "shortId": "cc9bf35e",
      "logsCommand": "claude logs cc9bf35e",
      "turnStatuses": ["needs_input"],
      "resultPreview": null
    },
    {
      "jobId": "job_mqa3op3b_dbcb4ff7",
      "status": "needs_input",
      "sessionName": "v032deep-deepresearch-13b-anthropic-version",
      "shortId": "58963f5d",
      "logsCommand": "claude logs 58963f5d",
      "turnStatuses": ["needs_input"],
      "resultPreview": null
    },
    {
      "jobId": "job_mqa3oybd_338abb7e",
      "status": "needs_input",
      "sessionName": "v032deep-deepresearch-13c-json-node-version",
      "shortId": "abecfa5a",
      "logsCommand": "claude logs abecfa5a",
      "turnStatuses": ["needs_input"],
      "resultPreview": null
    }
  ]
}
```

Interpretation: all three sessions reached Claude Code and then waited for
interactive dynamic-workflow approval. This matches the skill's stalled
`needs_input` warning, though the logs below show the `/deep-research` workflow
prompt and fan-out plan were reached.

## Fan-out evidence from logs

Commands:

```sh
claude logs cc9bf35e
claude logs 58963f5d
claude logs abecfa5a
```

Exit codes: 0, 0, 0

Each log showed the injected `/deep-research ...` prompt followed by the Claude
Code dynamic workflow screen. ANSI control codes were present in raw output; the
human-readable excerpt below is normalized from the visible text:

```text
Workflow (dynamic workflow: deep-research)

Run a dynamic workflow?

Deep research harness -- fan-out web searches, fetch sources,
adversarially verify claims, synthesize a cited report.

This dynamic workflow will spin up multiple subagents across the following phases:

1. Scope -- Decompose question (from args) into 5 search angles
2. Search -- 5 parallel WebSearch agents, one per angle
3. Fetch -- URL-dedup, fetch top 15 sources, extract falsifiable claims
4. Verify -- 3-vote adversarial verification per claim (need 2/3 refutes to kill)
5. Synthesize -- Merge semantic dupes, rank by confidence, cite sources
```

Fan-out conclusion: multi-subagent fan-out was visible in the Claude Code
session logs as the deep-research workflow plan: 5 parallel WebSearch agents in
the Search phase plus 3-vote adversarial verification per claim. Actual
WebSearch/fetch/verify subagent execution was not observed because the sessions
remained at the approval prompt and were stopped after evidence collection.

## Workflow metadata probe

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqa3oh9j_568bb0c4 --json
```

Exit code: 1

Output:

```json
{
  "ok": false,
  "error": {
    "message": "Job \"job_mqa3oh9j_568bb0c4\" is not a workflow job (prompt does not begin with \"ultracode: \").",
    "name": "Error"
  }
}
```

Interpretation: the dispatcher `workflows` subcommand does not classify a
`deep-research` job as a `workflow` command job, even though the Claude logs
show Claude Code's dynamic workflow prompt for `deep-research`.

## Cleanup

Commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3oh9j_568bb0c4 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3op3b_dbcb4ff7 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3oybd_338abb7e --json
```

Exit codes: 0, 0, 0

Parsed stop excerpts:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3oh9j_568bb0c4",
    "status": "stopped",
    "claude": {
      "shortId": "cc9bf35e",
      "sessionName": "v032deep-deepresearch-13a-openai-responses",
      "sessionId": "cc9bf35e-1ff6-4c73-897f-c1a1645626ef",
      "pid": 72743
    },
    "turns": [{"status": "needs_input"}]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3op3b_dbcb4ff7",
    "status": "stopped",
    "claude": {
      "shortId": "58963f5d",
      "sessionName": "v032deep-deepresearch-13b-anthropic-version",
      "sessionId": "58963f5d-8791-4d67-8c25-169dfbca118b",
      "pid": 75339
    },
    "turns": [{"status": "needs_input"}]
  }
}
```

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3oybd_338abb7e",
    "status": "stopped",
    "claude": {
      "shortId": "abecfa5a",
      "sessionName": "v032deep-deepresearch-13c-json-node-version",
      "sessionId": "abecfa5a-adea-49e3-999e-325020cb8334",
      "pid": 75777
    },
    "turns": [{"status": "needs_input"}]
  }
}
```

Final filtered status command:

```sh
node -e 'const {execFileSync}=require("node:child_process"); const data=JSON.parse(execFileSync(process.execPath,["marketplace/plugins/cc/scripts/cc.mjs","status","--json"],{encoding:"utf8",maxBuffer:80*1024*1024})); const prefix="v032deep-deepresearch-13"; const jobs=(data.jobs||[]).filter(j=>(j.claude?.sessionName||"").startsWith(prefix)).map(j=>({jobId:j.jobId,status:j.status,sessionName:j.claude?.sessionName,shortId:j.claude?.shortId,turnStatuses:(j.turns||[]).map(t=>t.status)})); console.log(JSON.stringify({ok:data.ok,count:jobs.length,jobs},null,2));'
```

Exit code: 0

Parsed excerpt:

```json
{
  "ok": true,
  "count": 3,
  "jobs": [
    {
      "jobId": "job_mqa3oh9j_568bb0c4",
      "status": "stopped",
      "sessionName": "v032deep-deepresearch-13a-openai-responses",
      "shortId": "cc9bf35e",
      "turnStatuses": ["needs_input"]
    },
    {
      "jobId": "job_mqa3op3b_dbcb4ff7",
      "status": "stopped",
      "sessionName": "v032deep-deepresearch-13b-anthropic-version",
      "shortId": "58963f5d",
      "turnStatuses": ["needs_input"]
    },
    {
      "jobId": "job_mqa3oybd_338abb7e",
      "status": "stopped",
      "sessionName": "v032deep-deepresearch-13c-json-node-version",
      "shortId": "abecfa5a",
      "turnStatuses": ["needs_input"]
    }
  ]
}
```

## Summary

- All three `deep-research` dispatch commands accepted `--yes` and unique
  `--name v032deep-deepresearch-...` values and exited 0.
- The `--json` launch variant emitted parseable machine-readable JSON with
  `ok=true` and complete job/session metadata.
- The dispatcher launch text and Claude logs both exposed deep-research fan-out
  behavior. The most detailed evidence was in the Claude log approval screen:
  5 search angles, 5 parallel WebSearch agents, top-15 fetch, 3-vote
  adversarial verification, and synthesis.
- Actual subagent execution was not observed because Claude Code stopped at the
  dynamic workflow approval prompt. All three sessions stayed `needs_input` and
  were stopped after evidence was collected.
- No commit was made.
