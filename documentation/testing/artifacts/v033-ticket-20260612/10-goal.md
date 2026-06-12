# Lane 10 - claude-goal depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-goal/SKILL.md
```

Relevant skill constraints observed: use `cc.mjs goal -- "<condition>"`; forward only explicit flags; `goal` sessions do not require an interactive approval dialog; first-poll `needs_input` can indicate failed `/goal` injection; stop stalled or completed sessions.

## Test 1: bounded goal

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --name v033ticket-goal-10-bounded-a -- "Bounded test for lane 10: immediately reply with the exact sentinel V033TICKET_GOAL_10_BOUNDED_A_DONE, then stop. Do not edit files, do not run commands, do not ask questions."
```

Start excerpt:

```text
Claude job started
Job ID:         job_mqaca60k_5a377e9a
Status:         running
Claude session: b48070bb
Name:           v033ticket-goal-10-bounded-a-8dcb578a
```

Status poll command, after >=3s:

```sh
sleep 3; node marketplace/plugins/cc/scripts/cc.mjs status --json
```

Observed: no stdout before the command was killed by the harness after about 25s. A plain `status` poll after another >=3s also produced no stdout and remained running until the local status process was killed.

Result command, after another >=3s:

```sh
sleep 3; node marketplace/plugins/cc/scripts/cc.mjs result job_mqaca60k_5a377e9a --json
```

Result excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqaca60k_5a377e9a",
    "status": "awaiting_followup",
    "codex": { "pluginVersion": "0.3.3" },
    "claude": {
      "shortId": "b48070bb",
      "sessionName": "v033ticket-goal-10-bounded-a-8dcb578a"
    },
    "turns": [
      {
        "status": "completed",
        "result": {
          "finalMessagePreview": "V033TICKET_GOAL_10_BOUNDED_A_DONE"
        }
      }
    ]
  },
  "resultText": "V033TICKET_GOAL_10_BOUNDED_A_DONE"
}
```

Cleanup command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqaca60k_5a377e9a --json
```

Cleanup excerpt:

```json
{"ok":true,"jobId":"job_mqaca60k_5a377e9a","status":"stopped","sessionName":"v033ticket-goal-10-bounded-a-8dcb578a"}
```

## Test 2: different bounded goal

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --name v033ticket-goal-10-different-b -- "Different bounded test for lane 10: immediately reply with the exact sentinel V033TICKET_GOAL_10_DIFFERENT_B_DONE, then stop. Do not edit files, do not run commands, do not ask questions."
```

Start excerpt:

```text
Claude job started
Job ID:         job_mqacdd2k_19e561a8
Status:         running
Claude session: 9e271f26
Name:           v033ticket-goal-10-different-b-16b58b59
```

Status poll command, after >=3s:

```sh
sleep 3; node marketplace/plugins/cc/scripts/cc.mjs status --json
```

Observed: reproduced the status behavior from test 1. The command stayed open for 30s with no stdout. `ps` showed local `node marketplace/plugins/cc/scripts/cc.mjs status --json` processes, which were killed before continuing.

Result command, after another >=3s:

```sh
sleep 3; node marketplace/plugins/cc/scripts/cc.mjs result job_mqacdd2k_19e561a8 --json
```

Result excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqacdd2k_19e561a8",
    "status": "awaiting_followup",
    "codex": { "pluginVersion": "0.3.3" },
    "claude": {
      "shortId": "9e271f26",
      "sessionName": "v033ticket-goal-10-different-b-16b58b59"
    },
    "turns": [
      {
        "status": "completed",
        "result": {
          "finalMessagePreview": "V033TICKET_GOAL_10_DIFFERENT_B_DONE"
        }
      }
    ]
  },
  "resultText": "V033TICKET_GOAL_10_DIFFERENT_B_DONE"
}
```

Cleanup command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacdd2k_19e561a8 --json
```

Cleanup excerpt:

```json
{"ok":true,"jobId":"job_mqacdd2k_19e561a8","status":"stopped","sessionName":"v033ticket-goal-10-different-b-16b58b59"}
```

## Test 3: `--json` parseability

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs goal --json --name v033ticket-goal-10-json-c -- "JSON parseability test for lane 10: immediately reply with the exact sentinel V033TICKET_GOAL_10_JSON_C_DONE, then stop. Do not edit files, do not run commands, do not ask questions." | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({ parseable: true, ok: j.ok, jobId: j.job?.jobId, status: j.job?.status, sessionName: j.job?.claude?.sessionName, hasGoalStatus: Object.prototype.hasOwnProperty.call(j.job ?? {}, "goal_status") })); });'
```

Parse excerpt:

```json
{"parseable":true,"ok":true,"jobId":"job_mqacfaxe_114f063b","status":"running","sessionName":"v033ticket-goal-10-json-c-61f24649","hasGoalStatus":false}
```

Result parse command, after >=3s:

```sh
sleep 3; node marketplace/plugins/cc/scripts/cc.mjs result job_mqacfaxe_114f063b --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({ parseable: true, ok: j.ok, jobId: j.job?.jobId, status: j.job?.status, turnStatus: j.job?.turns?.at(-1)?.status, resultText: j.resultText, hasGoalStatus: Object.prototype.hasOwnProperty.call(j.job ?? {}, "goal_status") })); });'
```

Result parse excerpt:

```json
{"parseable":true,"ok":true,"jobId":"job_mqacfaxe_114f063b","status":"awaiting_followup","turnStatus":"completed","resultText":"V033TICKET_GOAL_10_JSON_C_DONE","hasGoalStatus":false}
```

Cleanup command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacfaxe_114f063b --json
```

Cleanup excerpt:

```json
{"ok":true,"jobId":"job_mqacfaxe_114f063b","status":"stopped","sessionName":"v033ticket-goal-10-json-c-61f24649"}
```

## Approval, needs_input, and long-run behavior

- No interactive approval prompt appeared for any `goal` start.
- No job result showed `needs_input`; all three turns completed and produced the requested sentinel.
- Job-level status after completion was `awaiting_followup`, while the latest turn status was `completed`.
- `status --json` and plain `status` polls hung with no stdout while goal jobs were active. `result --json` remained responsive and parseable.
- The ticket says no `goal_status` field is expected. `hasGoalStatus:false` was observed in `goal --json` and `result --json` parse checks and was not treated as a failure.

## Final cleanup

Re-stop verification commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqaca60k_5a377e9a --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({ ok: j.ok, jobId: j.job?.jobId, status: j.job?.status, sessionName: j.job?.claude?.sessionName })); });'
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacdd2k_19e561a8 --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({ ok: j.ok, jobId: j.job?.jobId, status: j.job?.status, sessionName: j.job?.claude?.sessionName })); });'
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacfaxe_114f063b --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({ ok: j.ok, jobId: j.job?.jobId, status: j.job?.status, sessionName: j.job?.claude?.sessionName })); });'
```

Re-stop excerpts:

```json
{"ok":true,"jobId":"job_mqaca60k_5a377e9a","status":"stopped","sessionName":"v033ticket-goal-10-bounded-a-8dcb578a"}
{"ok":true,"jobId":"job_mqacdd2k_19e561a8","status":"stopped","sessionName":"v033ticket-goal-10-different-b-16b58b59"}
{"ok":true,"jobId":"job_mqacfaxe_114f063b","status":"stopped","sessionName":"v033ticket-goal-10-json-c-61f24649"}
```

Local process cleanup check:

```sh
ps -axo pid,ppid,stat,command | rg 'marketplace/plugins/cc/scripts/cc\.mjs status|PID'
```

Final excerpt:

```text
PID  PPID STAT COMMAND
... /bin/zsh -c ps -axo pid,ppid,stat,command | rg 'marketplace/plugins/cc/scripts/cc\.mjs status|PID'
... rg marketplace/plugins/cc/scripts/cc\.mjs status|PID
```

No lingering `cc.mjs status` dispatcher process remained after cleanup.

## Verdict

`goal` starts and `goal --json` are functional for bounded sentinel goals in v0.3.3. The two bounded goals completed independently with distinct names and sentinels, and JSON output from both `goal --json` and `result --json` was parseable. Absence of `goal_status` matches the ticket expectation.

Concern: `status` polling hung repeatedly with no stdout while active goal jobs existed. This did not block `result` or `stop`, but it is a status-path regression or long-run behavior worth tracking separately.
