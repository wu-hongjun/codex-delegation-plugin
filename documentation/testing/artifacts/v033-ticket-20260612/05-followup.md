# Lane 05 - claude-followup depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-followup/SKILL.md
```

Exit code: 0

Key instruction excerpt: run `node "<plugin-root>/scripts/cc.mjs" followup <jobId-or-prefix> -- "<follow-up prompt>"`; `--json` is accepted; startup-only flags are rejected for follow-up; do not reimplement dispatcher logic.

## Delegate Setup

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --name v033ticket-followup -- "CC v0.3.3 ticket depth lane 05 followup test. Do not edit files or run shell commands. Reply exactly with: INITIAL_READY v033ticket-followup"
```

Exit code: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqac00la_bfcc7fcc
Status:         running
Claude session: 184b6c33
Name:           v033ticket-followup-498e18a2
Logs:           claude logs 184b6c33
```

## Poll

Command:

```sh
sleep 3
```

Exit code: 0

Then I ran a dispatcher JSON status poll. The full `status --json` command exits 0, but this workspace has many historical jobs and the output was 19,255 lines, so I used a parser for subsequent targeted evidence.

Targeted poll command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); const j = data.jobs.find(x => x.jobId === "job_mqac00la_bfcc7fcc"); console.log(JSON.stringify({ ok: data.ok, jobId: j.jobId, status: j.status, shortId: j.claude.shortId, sessionName: j.claude.sessionName, turnStatuses: j.turns.map((t, i) => ({ index: i, status: t.status, preview: t.result?.finalMessagePreview ?? null })) }, null, 2)); });'
```

Exit code: 0

Output:

```json
{
  "ok": true,
  "jobId": "job_mqac00la_bfcc7fcc",
  "status": "running",
  "shortId": "184b6c33",
  "sessionName": "v033ticket-followup-498e18a2",
  "turnStatuses": [
    {
      "index": 0,
      "status": "queued",
      "preview": "I don't have any in-progress work to resume - my last action this session was the readiness handshake (`INITIAL_READY v033ticket-followup`), and the instruction..."
    }
  ]
}
```

Poll wait was greater than 3 seconds before the first follow-up attempt: the explicit sleep completed, and the dispatcher poll itself took about 96 seconds.

## First Follow-up Attempt

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqac00la_bfcc7fcc -- "First follow-up for lane 05. Do not edit files or run shell commands. Reply exactly: FIRST_FOLLOWUP_OK v033ticket-followup"
```

Exit code: 1

Output:

```text
[followup] Error: Job job_mqac00la_bfcc7fcc is running; wait for $claude-status to show awaiting_followup before sending a follow-up.
```

Result: blocked. The requested positive path ("one followup, second same job, --json followup") could not be executed because the dispatcher rejected the job before injecting the first follow-up.

## State Evidence

Underlying Claude session check:

```sh
claude agents --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); const list = Array.isArray(data) ? data : (data.agents || data.sessions || []); const hit = list.find(x => JSON.stringify(x).includes("184b6c33")); console.log(JSON.stringify(hit ?? { found: false }, null, 2)); });'
```

Exit code: 0

Output:

```json
{
  "pid": 98406,
  "id": "184b6c33",
  "cwd": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex",
  "kind": "background",
  "startedAt": 1781232850227,
  "sessionId": "184b6c33-d0ff-4134-98e3-ce815aa2f198",
  "name": "v033ticket-followup-498e18a2",
  "status": "idle",
  "state": "blocked"
}
```

Sidecar command:

```sh
sed -n '1,220p' ~/.claude/jobs/184b6c33/state.json
```

Exit code: 0

Excerpt:

```json
{
  "state": "blocked",
  "detail": "What's the next step?",
  "tempo": "blocked",
  "inFlight": {
    "tasks": 0,
    "queued": 0,
    "kinds": []
  },
  "output": null,
  "intent": "CC v0.3.3 ticket depth lane 05 followup test. Do not edit files or run shell commands. Reply exactly with: INITIAL_READY v033ticket-followup",
  "name": "v033ticket-followup-498e18a2",
  "daemonShort": "184b6c33"
}
```

Timeline command:

```sh
tail -80 ~/.claude/jobs/184b6c33/timeline.jsonl
```

Exit code: 0

Excerpt:

```json
{"at":"2026-06-12T02:52:52.440Z","state":"done","detail":"replied with requested acknowledgment","text":"INITIAL_READY v033ticket-followup"}
{"at":"2026-06-12T02:54:23.021Z","state":"blocked","detail":"What's the next step?","text":"INITIAL_READY v033ticket-followup\n\nI don't have any in-progress work to resume ...\n\nWhat's the next step?"}
```

Job record excerpt after reconciliation:

```json
{
  "jobId": "job_mqac00la_bfcc7fcc",
  "status": "running",
  "claude": {
    "shortId": "184b6c33",
    "sessionName": "v033ticket-followup-498e18a2"
  },
  "turns": [
    {
      "status": "queued",
      "result": {
        "finalMessagePreview": "I don't have any in-progress work to resume - my last action this session was the readiness handshake (`INITIAL_READY v033ticket-followup`), and the instruction..."
      }
    }
  ]
}
```

Interpretation: the underlying session was idle/blocked, but dispatcher reconciliation kept the job at `running` because the latest turn was still `queued` and the sidecar was `blocked`, not `done`. `followup` only proceeds after the job reaches `awaiting_followup`, `needs_input`, or a completed job with a live idle session.

## Stale Preview Note

No positive `--json followup` preview was produced, so the requested "preview may be stale; verify resolves on poll" check could not be completed for a successful follow-up. The only observed preview came from the reconciled initial job result after polling, and it was not accepted as follow-up evidence because the same poll still reported `status: "running"`.

## Cleanup

Stop command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac00la_bfcc7fcc --json
```

Exit code: 0

Key excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac00la_bfcc7fcc",
    "status": "stopped",
    "claude": {
      "shortId": "184b6c33",
      "sessionName": "v033ticket-followup-498e18a2"
    }
  }
}
```

JSON parse:

```json
{
  "ok": true,
  "jobId": "job_mqac00la_bfcc7fcc",
  "status": "stopped"
}
```

Post-stop poll wait:

```sh
sleep 3
```

Exit code: 0

Stopped-job follow-up command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqac00la_bfcc7fcc -- "Post-stop follow-up should fail cleanly."
```

Exit code: 1

Output:

```text
[followup] Error: Job job_mqac00la_bfcc7fcc is stopped; start a new $claude-delegate job instead.
```

Stopped-job JSON command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqac00la_bfcc7fcc --json -- "Post-stop JSON follow-up should fail cleanly."
```

Exit code: 1

Output:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqac00la_bfcc7fcc is stopped; start a new $claude-delegate job instead.",
    "name": "Error"
  }
}
```

JSON parse:

```json
{
  "ok": false,
  "errorName": "Error",
  "message": "Job job_mqac00la_bfcc7fcc is stopped; start a new $claude-delegate job instead."
}
```

Final session cleanup check:

```sh
claude agents --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); const list = Array.isArray(data) ? data : (data.agents || data.sessions || []); const hit = list.find(x => JSON.stringify(x).includes("184b6c33")); console.log(JSON.stringify(hit ?? { found: false, shortId: "184b6c33" }, null, 2)); });'
```

Exit code: 0

Output:

```json
{
  "found": false,
  "shortId": "184b6c33"
}
```

No ticket edits and no commit were made. Only this artifact file was added.

## Verdict

Partial / blocked.

Passed:

- Created one `v033ticket-followup` delegate.
- Waited/polled at least 3 seconds before follow-up checks.
- Verified dispatcher rejects stopped-job follow-up cleanly in human and JSON forms.
- Stopped the job and confirmed the Claude session was no longer listed.

Not completed:

- Successful first follow-up.
- Second follow-up on the same job.
- Successful `--json followup` with stale-preview poll verification.

Blocking behavior: dispatcher reconciliation kept `job_mqac00la_bfcc7fcc` at `running` while Claude reported the session as `idle` with sidecar `state: "blocked"`, causing `followup` to reject the job before any positive follow-up turn could be injected.
