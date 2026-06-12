# Lane 09: `$claude-workflow` depth test

Date: 2026-06-11
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`
Plugin version observed: `0.3.2`
Claude Code observed: `2.1.173 (Claude Code)`

## Verdict

Partial/fail for real fan-out confirmation. All three workflow jobs started successfully, including a parseable `--json` invocation, but all settled at `needs_input` before real workflow subagents spawned. This matches the documented dynamic workflow approval gate. The approval dialog itself is expected behavior, not a bug; the test could not confirm post-approval subagent fan-out without human TUI approval.

## Skill and Help Checks

Read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-workflow/SKILL.md
```

Exit code: `0`.

Relevant excerpt:

```text
Dynamic workflows present an interactive YES / View raw script / NO approval
dialog inside the Claude Code TUI before any subagents are spawned. This skill
starts the background job but does NOT auto-approve the dialog.
```

Help probes:

```sh
node marketplace/plugins/cc/scripts/cc.mjs --help
node marketplace/plugins/cc/scripts/cc.mjs workflow --help
node marketplace/plugins/cc/scripts/cc.mjs status --help
node marketplace/plugins/cc/scripts/cc.mjs workflows --help
```

Exit codes: all `0`.

Relevant excerpt:

```text
workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)
status [--all] [--json]                   List jobs for current workspace
workflows [<jobId>] [--all] [--json]      List workflow sessions or drill into one (read-only; no subprocess spawned)
```

## Workflow Starts

Variation A, survey/recommend prompt:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v032deep-workflow-09a-survey -- "Read-only bounded CC plugin v0.3.2 workflow depth test, lane 09 variation A. Do not edit files, create artifacts, use network, or commit. Scope: only inspect marketplace/plugins/cc/README.md, marketplace/plugins/cc/skills/claude-workflow/SKILL.md, marketplace/plugins/cc/scripts/cc.mjs, and relevant read-only status metadata. If the generated dynamic workflow is approved, fan out into at least three parallel subagents: one surveys workflow docs, one inspects dispatcher CLI behavior from local files only, and one recommends focused follow-up tests. Synthesize a concise survey/recommendation report under 500 words with evidence paths."
```

Exit code: `0`.

```text
Claude job started
Job ID:         job_mqa3e21a_64d78520
Status:         running
Claude session: eaab5c7e
Name:           v032deep-workflow-09a-survey
```

Variation B, second multi-step prompt:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v032deep-workflow-09b-multistep -- "Read-only bounded CC plugin v0.3.2 workflow depth test, lane 09 variation B. Do not edit files, create artifacts, use network, or commit. Scope: inspect local CC plugin docs/scripts/tests only as needed. If the generated dynamic workflow is approved, build a multi-step workflow with two phases: phase 1 fans out into multiple subagents to inspect workflow/status/result/stop command behavior from local docs and dispatcher code; phase 2 fans out into multiple subagents to cross-check likely edge cases and verification signals. Return a concise multi-step findings summary with file path evidence and no file writes."
```

Exit code: `0`.

```text
Claude job started
Job ID:         job_mqa3eccw_7cbfa759
Status:         running
Claude session: d8d8c7ef
Name:           v032deep-workflow-09b-multistep
```

Variation C, JSON parseable:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --json --name v032deep-workflow-09c-json -- "Read-only bounded CC plugin v0.3.2 workflow depth test, lane 09 variation C. Do not edit files, create artifacts, use network, or commit. Scope: local repo files only, preferably marketplace/plugins/cc docs and scripts. If the generated dynamic workflow is approved, fan out into exactly two parallel subagents: one validates JSON/status metadata expectations and one validates workflow phase/fan-out observability expectations. Return only a compact JSON object with keys summary, evidence, fanout_requested, and limitations. No writes."
```

Exit code: `0`.

JSON parse evidence:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa3eo9s_8bfa662e",
    "status": "running",
    "codex": {
      "pluginVersion": "0.3.2"
    },
    "claude": {
      "shortId": "ddcba279",
      "sessionName": "v032deep-workflow-09c-json"
    },
    "turns": [
      {
        "status": "queued"
      }
    ]
  }
}
```

The JSON output parsed successfully with `JSON.parse`.

## Approval Gate Evidence

The non-JSON workflow start output included this exact warning:

```text
This is a Claude Code dynamic workflow request.
Workflows present an interactive approval dialog (Yes / View raw script / No)
inside the Claude Code TUI. To approve and start the workflow, attach:

  claude attach <jobId>

Workflows can spawn up to 16 concurrent agents and 1000 total per run. Token
usage scales with the workflow's complexity.
```

Poll command, with at least 10 seconds before checking state:

```sh
sleep 12; node marketplace/plugins/cc/scripts/cc.mjs status --json
```

Exit code: `0`. The full workspace JSON was large, so a follow-up parse filtered only the three lane jobs:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const ids = new Set(process.argv.slice(1)); const data = JSON.parse(s); for (const job of data.jobs.filter(j => ids.has(j.jobId))) { const t = job.turns?.[job.turns.length - 1] || {}; console.log(JSON.stringify({jobId: job.jobId, status: job.status, updatedAt: job.updatedAt, name: job.claude?.sessionName, shortId: job.claude?.shortId, sessionId: job.claude?.sessionId, pid: job.claude?.pid, turnStatus: t.status, turnEndedAt: t.endedAt || null, preview: job.result?.finalMessagePreview || t.result?.finalMessagePreview || null, promptBytes: job.prompt?.bytesLen}, null, 2)); } })' job_mqa3e21a_64d78520 job_mqa3eccw_7cbfa759 job_mqa3eo9s_8bfa662e
```

Exit code: `0`.

Parsed excerpts:

```json
{
  "jobId": "job_mqa3e21a_64d78520",
  "status": "needs_input",
  "name": "v032deep-workflow-09a-survey",
  "shortId": "eaab5c7e",
  "turnStatus": "needs_input",
  "preview": "I'll start by reading the in-scope files to ground the workflow, then design a read-only fan-out."
}
{
  "jobId": "job_mqa3eccw_7cbfa759",
  "status": "needs_input",
  "name": "v032deep-workflow-09b-multistep",
  "shortId": "d8d8c7ef",
  "turnStatus": "needs_input",
  "preview": "I'll scout the repo structure first to find the relevant files, then build the two-phase workflow."
}
{
  "jobId": "job_mqa3eo9s_8bfa662e",
  "status": "needs_input",
  "name": "v032deep-workflow-09c-json",
  "shortId": "ddcba279",
  "turnStatus": "needs_input",
  "preview": "I'll start by scoping the relevant files so the workflow's subagents get accurate context, then author a two-agent parallel workflow as instructed."
}
```

## Fan-out and Phase Evidence

Drilldowns:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqa3e21a_64d78520 --json
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqa3eccw_7cbfa759 --json
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqa3eo9s_8bfa662e --json
```

Exit codes: all `0`.

All three drilldowns reported `subagents: []`. A concise parsed pass counted phase record types:

```json
{
  "jobId": "job_mqa3e21a_64d78520",
  "name": "v032deep-workflow-09a-survey",
  "status": "needs_input",
  "subagentCount": 0,
  "phaseRecordCount": 30,
  "phaseRecordTypes": {
    "last-prompt": 2,
    "custom-title": 2,
    "agent-name": 2,
    "mode": 2,
    "permission-mode": 2,
    "file-history-snapshot": 2,
    "attachment": 11,
    "user": 2,
    "assistant": 5
  }
}
{
  "jobId": "job_mqa3eccw_7cbfa759",
  "name": "v032deep-workflow-09b-multistep",
  "status": "needs_input",
  "subagentCount": 0,
  "phaseRecordCount": 30
}
{
  "jobId": "job_mqa3eo9s_8bfa662e",
  "name": "v032deep-workflow-09c-json",
  "status": "needs_input",
  "subagentCount": 0,
  "phaseRecordCount": 30
}
```

The phase records were transcript/session/tool records, not real workflow execution phases. No subagent session metadata was present before approval.

## Cleanup

Stop commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3e21a_64d78520 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3eccw_7cbfa759 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3eo9s_8bfa662e --json
```

Exit codes: all `0`.

Stop excerpts:

```json
{"ok": true, "job": {"jobId": "job_mqa3e21a_64d78520", "status": "stopped"}}
{"ok": true, "job": {"jobId": "job_mqa3eccw_7cbfa759", "status": "stopped"}}
{"ok": true, "job": {"jobId": "job_mqa3eo9s_8bfa662e", "status": "stopped"}}
```

Final cleanup verification:

```json
{
  "jobId": "job_mqa3e21a_64d78520",
  "name": "v032deep-workflow-09a-survey",
  "status": "stopped",
  "subagentCount": 0,
  "phaseRecordCount": 30
}
{
  "jobId": "job_mqa3eccw_7cbfa759",
  "name": "v032deep-workflow-09b-multistep",
  "status": "stopped",
  "subagentCount": 0,
  "phaseRecordCount": 30
}
{
  "jobId": "job_mqa3eo9s_8bfa662e",
  "name": "v032deep-workflow-09c-json",
  "status": "stopped",
  "subagentCount": 0,
  "phaseRecordCount": 30
}
```

No commit was made.
