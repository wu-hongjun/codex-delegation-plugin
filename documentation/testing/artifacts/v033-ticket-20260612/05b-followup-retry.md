# Lane 05b - Followup Retry Evidence

Date: 2026-06-12
Workspace: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

## Summary

Status: fail

The retry reproduced the follow-up blocker with a narrower fixture. Claude produced the initial answer and the session became idle/blocked, but the cc job remained `running`. `$claude-followup` rejected the job because it was not `awaiting_followup`.

## Commands And Evidence

### Start fixture

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v033ticket-followup-retry-$(date +%s) -- "Reply with exactly RETRY_INITIAL_READY, then wait for a follow-up instruction."
```

Output excerpt:

```text
Claude job started
Job ID:         job_mqacot6s_1cc0586d
Status:         running
Claude session: acc0cfbd
Name:           v033ticket-followup-retry-1781233920-acc3d023
```

### Targeted result polling

Command:

```sh
for i in 1 2 3 4 5 6 7 8 9 10; do
  node marketplace/plugins/cc/scripts/cc.mjs result job_mqacot6s_1cc0586d --json
  sleep 3
done
```

Output excerpt on all polls:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqacot6s_1cc0586d is not complete yet (status: running). Run: cc status",
    "name": "Error"
  }
}
```

### Direct Claude/job evidence

Claude transcript produced the expected answer:

```text
RETRY_INITIAL_READY
```

`claude agents --json` excerpt:

```json
{
  "id": "acc0cfbd",
  "sessionId": "acc0cfbd-983d-436a-b755-1c27cc930100",
  "name": "v033ticket-followup-retry-1781233920-acc3d023",
  "status": "idle",
  "state": "blocked"
}
```

Job result file existed:

```text
/Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqacot6s_1cc0586d.result.md
RETRY_INITIAL_READY
```

One bounded `status --json` reconciliation took about 52 seconds, exited 0, and still reported:

```json
{
  "jobId": "job_mqacot6s_1cc0586d",
  "status": "running",
  "claude": {
    "shortId": "acc0cfbd",
    "sessionId": "acc0cfbd-983d-436a-b755-1c27cc930100",
    "sessionName": "v033ticket-followup-retry-1781233920-acc3d023",
    "pid": 68143
  }
}
```

### Follow-up attempt

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqacot6s_1cc0586d --yes -- "Reply with exactly RETRY_FOLLOWUP_ONE_OK."
```

Output:

```text
[followup] Error: Job job_mqacot6s_1cc0586d is running; wait for $claude-status to show awaiting_followup before sending a follow-up.
exit=1
```

### Cleanup

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacot6s_1cc0586d --json
```

Output excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacot6s_1cc0586d",
    "status": "stopped",
    "result": {
      "finalMessagePreview": "RETRY_INITIAL_READY"
    }
  }
}
```
