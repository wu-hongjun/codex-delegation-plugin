# Lane 14 - workflows

Run date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`
Skill read first: `marketplace/plugins/cc/skills/claude-workflows/SKILL.md`

## Scope

Read-only `$claude-workflows` ticket depth check. No ticket edits, no commits.
No `status --all --json` command was run.

I did not create a new workflow job because an existing stopped v0.3.3 workflow
fixture was available for deterministic drill-in checks:

- short session id: `0db00e7d`
- full session id: `0db00e7d-684f-46e8-a6c8-e66de7c824c1`
- full job id: `job_mqac8b84_f8ca7fbe`
- name: `v033ticket-review-workflow-06-90cf8bd3`

## Plain list

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows
```

Exit: 0

Excerpt:

```text
Workflow sessions (30):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  46153ea7  orphaned    codex:cc-plugin-codex:mq34smmc
  24637634  orphaned    codex:cc-plugin-codex:mq34uaeq
  ee8a35d3  needs_input  codex:cc-plugin-codex:mq36ptd0
  ...
  403cddc7  stopped     v032deep-workflows-14-readonly
  0db00e7d  stopped     v033ticket-review-workflow-06-90cf8bd3
  1ca12cf1  running     v033ticket-workflow-09a-survey-20260612-l09-14443bae
  8e700c36  running     v033ticket-workflow-09b-second-20260612-l09-289d8e64
  5bcf7d44  running     v033ticket-workflow-09c-json-20260612-l09-d1d9439a

Run `cc workflows <sessionId>` to drill into a session.
```

Verdict: PASS. Plain list returns workflow sessions and drill-in guidance.

## Drill-in by 8-char session shortId

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows 0db00e7d
```

Exit: 0

Excerpt:

```text
Workflow session: 0db00e7d-684f-46e8-a6c8-e66de7c824c1
  Name:      v033ticket-review-workflow-06-90cf8bd3
  Status:    stopped
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  StartedAt: 2026-06-12T02:59:15.796Z

  Subagents: none recorded

  Phase records (first 27 JSONL lines):
    {"type":"last-prompt","leafUuid":"57573600-ad6b-49b1-99db-569499f8371e","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"custom-title","customTitle":"v033ticket-review-workflow-06-90cf8bd3","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"agent-name","agentName":"v033ticket-review-workflow-06-90cf8bd3","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"mode","mode":"normal","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"permission-mode","permissionMode":"default","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    ... (22 more)
```

Verdict: PASS. The 8-character session shortId resolves to the expected workflow
session and prints metadata plus phase records.

## Drill-in by full jobId

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqac8b84_f8ca7fbe
```

Exit: 0

Excerpt:

```text
Workflow session: 0db00e7d-684f-46e8-a6c8-e66de7c824c1
  Name:      v033ticket-review-workflow-06-90cf8bd3
  Status:    stopped
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
  StartedAt: 2026-06-12T02:59:15.796Z

  Subagents: none recorded

  Phase records (first 27 JSONL lines):
    {"type":"last-prompt","leafUuid":"57573600-ad6b-49b1-99db-569499f8371e","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"custom-title","customTitle":"v033ticket-review-workflow-06-90cf8bd3","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"agent-name","agentName":"v033ticket-review-workflow-06-90cf8bd3","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"mode","mode":"normal","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    {"type":"permission-mode","permissionMode":"default","sessionId":"0db00e7d-684f-46e8-a6c8-e66de7c824c1"}
    ... (22 more)
```

Verdict: PASS. The full job id resolves to the same workflow session as the
session shortId.

## --all

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows --all
```

Exit: 0

Excerpt:

```text
Workflow sessions (30):
  2b741235  orphaned    codex:cc-plugin-codex:mq1eq7jq
  46153ea7  orphaned    codex:cc-plugin-codex:mq34smmc
  24637634  orphaned    codex:cc-plugin-codex:mq34uaeq
  ee8a35d3  needs_input  codex:cc-plugin-codex:mq36ptd0
  ...
  403cddc7  stopped     v032deep-workflows-14-readonly
  0db00e7d  stopped     v033ticket-review-workflow-06-90cf8bd3
  1ca12cf1  needs_input  v033ticket-workflow-09a-survey-20260612-l09-14443bae
  8e700c36  running     v033ticket-workflow-09b-second-20260612-l09-289d8e64
  5bcf7d44  running     v033ticket-workflow-09c-json-20260612-l09-d1d9439a

Run `cc workflows <sessionId>` to drill into a session.
```

Verdict: PASS. `--all` is accepted on the workflows surface and returns the
workflow list without requiring `status --all --json`.

## --json parseability

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const obj = JSON.parse(s); console.log(`sessions=${obj.sessions.length}`); console.log(`first=${obj.sessions[0].shortId}/${obj.sessions[0].jobId}`); });'
```

Exit: 0

Output:

```text
sessions=30
first=2b741235/job_mq1eqa7e_9c8e5b88
```

Verdict: PASS. Dispatcher JSON parsed successfully with `JSON.parse`.

## Bogus id clean error

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows definitely-not-a-workflow-id
```

Exit: 1

Output:

```text
[workflows] Error: No workflow found matching job id or session id "definitely-not-a-workflow-id"
```

Verdict: PASS. Bogus id exits non-zero with a concise workflows-prefixed error
and no stack trace.

## Cleanup

No workflow job was created during this lane, so there was no created workflow
job to stop. Existing running workflow jobs from other lanes were left untouched.

Overall verdict: PASS.
