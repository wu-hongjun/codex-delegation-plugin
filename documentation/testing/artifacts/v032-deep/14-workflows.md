# Lane 14 - `$claude-workflows` depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher used: `node marketplace/plugins/cc/scripts/cc.mjs`

## Skill read

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-workflows/SKILL.md
```

Exit code: `0`

Relevant excerpt:

```text
Run:

    node "<plugin-root>/scripts/cc.mjs" workflows [<jobId>]

Accepted flags (forwarded to the dispatcher):

- `--all` - list workflow sessions from all workspaces (not just current).
- `--json` - machine-readable JSON output.

Behavior rules:

- No args -> list all workflow sessions visible via `claude agents --json`.
- With `<jobId>` -> drill into that one session: subagent metadata, phase records.
```

Scope note from skill: `$claude-workflows` covers `$claude-workflow`-started background sessions only, not the Claude Code `/workflows` TUI surface. The TUI panel is session-scoped and distinct.

## Created bounded workflow target

I created one lane-specific read-only workflow target so list and drill-in evidence could refer to a known session from this run.

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --yes --name v032deep-workflows-14-readonly -- "Read-only bounded workflow test for cc-plugin v0.3.2 lane 14. Do not edit files or run network commands. Inspect the current directory name with pwd, then report exactly one short sentence. If subagent approval is required, stop at the approval prompt without proceeding."
```

Exit code: `0`

Excerpt:

```text
Claude job started
Job ID:         job_mqa3n67p_b589f334
Status:         running
Claude session: 403cddc7
Name:           v032deep-workflows-14-readonly
```

Approval/fan-out note:

```text
This is a Claude Code dynamic workflow request.
Workflows present an interactive approval dialog (Yes / View raw script / No)
inside the Claude Code TUI.
```

The workflow did not reach subagent fan-out in this non-interactive run. This is the known approval-dialog boundary for workflow execution; listing and drill-in still worked.

## Variation A - plain list

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows
```

Exit code: `0`

Excerpt:

```text
Workflow sessions (26):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  46153ea7  orphaned    codex:cc-plugin-codex:mq34smmc
  24637634  orphaned    codex:cc-plugin-codex:mq34uaeq
  ...
  eaab5c7e  stopped     v032deep-workflow-09a-survey
  d8d8c7ef  stopped     v032deep-workflow-09b-multistep
  ddcba279  stopped     v032deep-workflow-09c-json
  403cddc7  running     v032deep-workflows-14-readonly

Run `cc workflows <sessionId>` to drill into a session.
```

Result: pass. The lane-specific workflow appeared in column 1 as short session id `403cddc7`.

## Variation B - drill-in by 8-char session shortId

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows 403cddc7
```

Exit code: `0`

Excerpt:

```text
Workflow session: 403cddc7-dd1e-47f3-b796-9dfdeb6285b8
  Name:      v032deep-workflows-14-readonly
  Status:    running
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  StartedAt: 2026-06-11T22:58:52.597Z

  Subagents: none recorded

  Phase records (first 30 JSONL lines):
    {"type":"last-prompt","leafUuid":"d9f57240-9086-405c-a0a5-ca6a01b27a9c","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"custom-title","customTitle":"v032deep-workflows-14-readonly","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"agent-name","agentName":"v032deep-workflows-14-readonly","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"mode","mode":"normal","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"permission-mode","permissionMode":"default","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    ... (25 more)
```

Result: pass. Drill-in by 8-character session shortId returned session metadata and phase records.

## Variation C - drill-in by full jobId

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqa3n67p_b589f334
```

Exit code: `0`

Excerpt:

```text
Workflow session: 403cddc7-dd1e-47f3-b796-9dfdeb6285b8
  Name:      v032deep-workflows-14-readonly
  Status:    running
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  StartedAt: 2026-06-11T22:58:52.597Z

  Subagents: none recorded

  Phase records (first 30 JSONL lines):
    {"type":"last-prompt","leafUuid":"d9f57240-9086-405c-a0a5-ca6a01b27a9c","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"custom-title","customTitle":"v032deep-workflows-14-readonly","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"agent-name","agentName":"v032deep-workflows-14-readonly","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"mode","mode":"normal","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    {"type":"permission-mode","permissionMode":"default","sessionId":"403cddc7-dd1e-47f3-b796-9dfdeb6285b8"}
    ... (25 more)
```

Result: pass. Drill-in by full jobId resolved to the same workflow session.

## Variation D - `--all`

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows --all
```

Exit code: `0`

Excerpt:

```text
Workflow sessions (26):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  46153ea7  orphaned    codex:cc-plugin-codex:mq34smmc
  24637634  orphaned    codex:cc-plugin-codex:mq34uaeq
  ...
  eaab5c7e  stopped     v032deep-workflow-09a-survey
  d8d8c7ef  stopped     v032deep-workflow-09b-multistep
  ddcba279  stopped     v032deep-workflow-09c-json
  403cddc7  running     v032deep-workflows-14-readonly

Run `cc workflows <sessionId>` to drill into a session.
```

Result: pass. In this workspace, `--all` produced the same 26 visible workflow sessions and included the lane-specific target.

## Variation E - `--json`

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows --json
```

Exit code: `0`

Target excerpt:

```json
{
  "jobId": "job_mqa3n67p_b589f334",
  "sessionId": "403cddc7-dd1e-47f3-b796-9dfdeb6285b8",
  "shortId": "403cddc7",
  "name": "v032deep-workflows-14-readonly",
  "status": "running",
  "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
  "startedAt": "2026-06-11T22:58:52.597Z",
  "promptSummary": "ultracode: Read-only bounded workflow test for cc-plugin v0.3.2 lane 14. Do not edit files or run network commands. Insp"
}
```

JSON.parse evidence command:

```sh
node -e 'const {spawnSync}=require("node:child_process"); const p=spawnSync(process.execPath,["marketplace/plugins/cc/scripts/cc.mjs","workflows","--json"],{cwd:process.cwd(),encoding:"utf8"}); const parsed=JSON.parse(p.stdout); const hit=parsed.sessions.find(s=>s.jobId==="job_mqa3n67p_b589f334"); console.log(JSON.stringify({dispatcherExit:p.status, sessionsIsArray:Array.isArray(parsed.sessions), sessionCount:parsed.sessions.length, target:{jobId:hit&&hit.jobId, shortId:hit&&hit.shortId, status:hit&&hit.status, name:hit&&hit.name}},null,2)); process.exit(p.status || (hit?0:1));'
```

Exit code: `0`

Output:

```json
{
  "dispatcherExit": 0,
  "sessionsIsArray": true,
  "sessionCount": 26,
  "target": {
    "jobId": "job_mqa3n67p_b589f334",
    "shortId": "403cddc7",
    "status": "running",
    "name": "v032deep-workflows-14-readonly"
  }
}
```

Result: pass. Output is parseable JSON with a `sessions` array and the target record.

## Variation F - bogus id clean error

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows bogus-workflow-id-14
```

Exit code: `1`

Output:

```text
[workflows] Error: No workflow found matching job id or session id "bogus-workflow-id-14"
```

Result: pass. The dispatcher returned a clear not-found error without a stack trace.

## Cleanup

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3n67p_b589f334
```

Exit code: `0`

Output:

```text
Claude job stopped
Job ID:         job_mqa3n67p_b589f334
Status:         stopped
Claude session: 403cddc7
```

Post-cleanup verification command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows 403cddc7
```

Exit code: `0`

Excerpt:

```text
Workflow session: 403cddc7-dd1e-47f3-b796-9dfdeb6285b8
  Name:      v032deep-workflows-14-readonly
  Status:    stopped
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  StartedAt: 2026-06-11T22:58:52.597Z

  Subagents: none recorded
```

Cleanup result: pass. The only workflow job started for this lane was stopped before finishing.

## Summary

All requested `$claude-workflows` dispatcher variants were exercised:

- Plain list: pass.
- Drill-in by 8-character session shortId: pass.
- Drill-in by full jobId: pass.
- `--all`: pass.
- `--json` parseability: pass.
- Bogus id clean error: pass.
- Cleanup: pass.

Known limitation observed: the created workflow remained at the interactive workflow approval boundary and recorded no subagents. The command still passed the workflow listing and drill-in scope covered by `claude-workflows`.
