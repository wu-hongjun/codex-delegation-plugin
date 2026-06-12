# v0.3.3 ticket depth test lane 06: claude-review

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Date: 2026-06-12

## Summary

Verdict: PASS, with one expected workflow-gate limitation recorded.

- Read `marketplace/plugins/cc/skills/claude-review/SKILL.md` first.
- Confirmed `review` takes `<jobId-or-prefix>`, not a freeform prompt.
- Created small `v033ticket-review-*` delegate jobs.
- Confirmed delegate `review --json` is parseable: `ok=true`, `verdict=pass`, `findingsCount=0`.
- Confirmed zero-findings human text includes exactly `Review verdict: PASS` and `No findings.`
- Created a small `v033ticket-review-workflow-06` workflow job and did not approve the workflow script. Same-session `review` rejected it while still `running`, which preserves the workflow approval gate.
- Stopped every job started by this lane.

Two early same-session review submissions failed with `follow-up prompt did not register`; the successful reviews used the documented attach timing escape hatches.

## Skill read

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-review/SKILL.md
```

Exit code: 0

Relevant excerpt:

```text
$claude-review <jobId-or-prefix>
The first token after `$claude-review` is the job id (or a job-id prefix).

node "<plugin-root>/scripts/cc.mjs" review <jobId-or-prefix> [flags]

Forward only these flags when the user explicitly requests them:
`--all`, `--json`, `--yes`.
```

## Delegate review

Initial delegate fixture:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --json --yes --name v033ticket-review-delegate-06 -- "Return exactly this single line and nothing else: lane 06 review fixture PASS."
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac1qk5_71f7f3d4",
    "status": "running",
    "claude": {
      "shortId": "7897acfe",
      "sessionName": "v033ticket-review-delegate-06-44016b13"
    }
  }
}
```

Poll:

```sh
sleep 3
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac1qk5_71f7f3d4 --json
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac1qk5_71f7f3d4",
    "status": "awaiting_followup"
  },
  "resultText": "lane 06 review fixture PASS."
}
```

First review attempt:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqac1qk5_71f7f3d4
```

Exit code: 1

Excerpt:

```text
[followup] Error: follow-up prompt did not register within 5000ms
```

Second delegate fixture:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --json --yes --name v033ticket-review-delegate-human-06 -- "Read marketplace/plugins/cc/skills/claude-review/SKILL.md and answer in one sentence: review takes a jobId or prefix, not a freeform prompt. Do not edit files."
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac3zst_07cc3cab",
    "status": "running",
    "claude": {
      "shortId": "e3777507",
      "sessionName": "v033ticket-review-delegate-human-06-86e94796"
    }
  }
}
```

Poll:

```sh
sleep 4
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac3zst_07cc3cab --json
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac3zst_07cc3cab",
    "status": "awaiting_followup"
  },
  "resultText": "Yes - `claude-review` takes a jobId or job-id prefix as its first argument (`$claude-review <jobId-or-prefix>`), not a freeform review prompt."
}
```

Second review attempt with documented timing knobs:

```sh
CC_PLUGIN_CODEX_ATTACH_WARMUP_MS=4000 CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS=20000 node marketplace/plugins/cc/scripts/cc.mjs review job_mqac3zst_07cc3cab
```

Exit code: 1

Excerpt:

```text
[followup] Error: follow-up prompt did not register within 20000ms
```

Successful delegate fixture:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --json --yes --name v033ticket-review-delegate-json-06 -- "Read marketplace/plugins/cc/skills/claude-review/SKILL.md and answer exactly: review accepts jobId-or-prefix. Do not edit files."
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac64e5_734f7a45",
    "status": "running",
    "claude": {
      "shortId": "eb725b17",
      "sessionName": "v033ticket-review-delegate-json-06-3eab0f8c"
    }
  }
}
```

Poll:

```sh
sleep 4
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac64e5_734f7a45 --json
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac64e5_734f7a45",
    "status": "awaiting_followup"
  },
  "resultText": "Yes. Per line 9-12, review accepts `<jobId-or-prefix>` - the first token after `$claude-review` is the job id or a job-id prefix."
}
```

JSON review:

```sh
CC_PLUGIN_CODEX_ATTACH_WARMUP_MS=15000 CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS=60000 node marketplace/plugins/cc/scripts/cc.mjs review job_mqac64e5_734f7a45 --json
```

Exit code: 0

Excerpt:

```json
{
  "ok": true,
  "review": {
    "verdict": "pass",
    "findingsCount": 0,
    "blockerCount": 0,
    "highCount": 0,
    "mediumCount": 0,
    "lowCount": 0,
    "nitCount": 0,
    "findings": []
  },
  "job": {
    "jobId": "job_mqac64e5_734f7a45",
    "status": "awaiting_followup"
  },
  "turn": {
    "index": 1,
    "status": "completed"
  }
}
```

Parse verdict:

```text
review --json parseable: PASS
ok=true verdict=pass findingsCount=0
```

Human review:

```sh
sleep 4
CC_PLUGIN_CODEX_ATTACH_WARMUP_MS=15000 CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS=60000 node marketplace/plugins/cc/scripts/cc.mjs review job_mqac64e5_734f7a45
```

Exit code: 0

Excerpt:

```text
Review verdict: PASS
Job ID:  job_mqac64e5_734f7a45
Turn:    2 (completed)

No findings.
```

Human zero-findings verdict:

```text
PASS: output contains `Review verdict: PASS` and `No findings.`
```

## Workflow review variation

Workflow fixture:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflow --json --yes --name v033ticket-review-workflow-06 -- "Prepare a tiny read-only workflow plan with one agent that would answer: workflow review fixture PASS. Do not edit files unless the workflow is explicitly approved."
```

Excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac8b84_f8ca7fbe",
    "status": "running",
    "claude": {
      "shortId": "0db00e7d",
      "sessionName": "v033ticket-review-workflow-06-90cf8bd3"
    },
    "prompt": {
      "summary": "ultracode: Prepare a tiny read-only workflow plan with one agent that would answer: workflow review fixture PASS. Do not"
    }
  }
}
```

Poll:

```sh
sleep 4
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac8b84_f8ca7fbe --json
```

Exit code: 1

Excerpt:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqac8b84_f8ca7fbe is not complete yet (status: running). Run: cc status",
    "name": "Error"
  }
}
```

Workflow inspector:

```sh
node marketplace/plugins/cc/scripts/cc.mjs workflows job_mqac8b84_f8ca7fbe --json
```

Exit code: 0

Relevant excerpts:

```json
{
  "jobId": "job_mqac8b84_f8ca7fbe",
  "name": "v033ticket-review-workflow-06-90cf8bd3",
  "status": "running",
  "subagents": []
}
```

```text
Here's a tiny, read-only workflow plan. I'm **not running or saving it yet** - presenting for approval per your instruction.
Approve and I'll run it (`Workflow`).
```

Workflow review command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqac8b84_f8ca7fbe
```

Exit code: 1

Excerpt:

```text
[review] Error: Job job_mqac8b84_f8ca7fbe is running; wait for $claude-status to show awaiting_followup before running $claude-review.
```

Workflow review verdict:

```text
PASS: approval gate respected. The workflow produced a plan but remained running with zero subagents, so same-session review correctly rejected it as not yet reviewable.
```

## Cleanup

Stop commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac8b84_f8ca7fbe --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac64e5_734f7a45 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac3zst_07cc3cab --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac1qk5_71f7f3d4 --json
```

Excerpts:

```json
{ "ok": true, "job": { "jobId": "job_mqac8b84_f8ca7fbe", "status": "stopped" } }
{ "ok": true, "job": { "jobId": "job_mqac64e5_734f7a45", "status": "stopped" } }
{ "ok": true, "job": { "jobId": "job_mqac3zst_07cc3cab", "status": "stopped" } }
{ "ok": true, "job": { "jobId": "job_mqac1qk5_71f7f3d4", "status": "stopped" } }
```

Final specific-id cleanup check:

```sh
for id in job_mqac1qk5_71f7f3d4 job_mqac3zst_07cc3cab job_mqac64e5_734f7a45 job_mqac8b84_f8ca7fbe; do node marketplace/plugins/cc/scripts/cc.mjs result "$id" --json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); console.log(j.job.jobId + ' ' + j.job.status);});"; done
```

Output:

```text
job_mqac1qk5_71f7f3d4 stopped
job_mqac3zst_07cc3cab stopped
job_mqac64e5_734f7a45 stopped
job_mqac8b84_f8ca7fbe stopped
```
