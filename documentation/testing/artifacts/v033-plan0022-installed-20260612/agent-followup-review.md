# Plan 0022 installed-plugin followup/review lane

Date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher under test: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`
Policy: no commits, no source edits. All jobs started with `--yes`.

## Summary

PASS. The installed cache dispatcher exercised `$claude-delegate`, `$claude-followup`, `$claude-review`, and `$claude-adversarial-review` successfully.

Plan 0022 fast-awaiting-followup behavior passed: the initial read-only delegate returned from `delegate` as `running`, then the first filtered status poll immediately afterward showed `awaiting_followup`. Initial turn completed at `2026-06-12T06:03:38.246Z` with marker `P22_INITIAL_IDLE_READY`, allowing followup without an extra recovery step.

Status polling was throttled with bounded waits. Followup and post-start status checks used a 5 second sleep before filtered status. Adversarial commands were allowed bounded 30 second waits; default and `--model opus` needed a second wait, but no live job exceeded the bound or required partial stop.

Notable observation: immediate followup command output reported the prior result preview while the new turn was still moving to `awaiting_followup`. The subsequent throttled status poll recorded the correct new marker for each followup turn.

## Jobs

| Lane | Job ID | Claude short ID | Session ID | Session name | Final status | Result markers |
|---|---|---|---|---|---|---|
| primary delegate/followup/review | `job_mqait46g_08e76d77` | `17fb5e34` | `17fb5e34-5ac0-4f59-8c27-83dac197aabe` | `p22-followup-review-readonly-868c4df3` | `stopped` | `P22_INITIAL_IDLE_READY`, `P22_FOLLOWUP_ONE_READY`, `P22_FOLLOWUP_TWO_READY`, `P22_FOLLOWUP_JSON_READY`, review PASS x2 |
| different delegate prompt | `job_mqaivq4a_7d5bf013` | `b748c99a` | `b748c99a-5dea-400b-8f9c-f1ce6a171ae8` | `p22-different-prompt-eb55a589` | `stopped` | `P22_DIFFERENT_DELEGATE_READY`; stopped-job followup rejected |
| rapid no-name delegate A | `job_mqaivpzq_656dd560` | `1070f658` | `1070f658-a942-47f4-b603-a72eae4fb619` | `codex:cc-plugin-codex:mqaivn66-66291b64` | `stopped` | `P22_RAPID_NONAME_A_READY` |
| rapid no-name delegate B | `job_mqaivpq7_192fe444` | `2e3244b4` | `2e3244b4-9b57-4057-bd5e-6a9a5bcc527d` | `codex:cc-plugin-codex:mqaivmyi-73e8b6ce` | `stopped` | `P22_RAPID_NONAME_B_READY` |
| adversarial default | `job_mqaiyf6o_c730ee48` | `f1031b2d` | `f1031b2d-ae06-4b57-996a-45afe38fab4d` | `codex:cc-plugin-codex:review-job_mqait46g-f9994a6c` | `stopped` | review PASS, no findings |
| adversarial `--model opus` | `job_mqaizxsx_1e9d42d0` | `910b6122` | `910b6122-06aa-4c6a-b384-31e624cd060d` | `codex:cc-plugin-codex:review-job_mqait46g-39f5d7af` | `stopped` | review PASS, no findings |
| adversarial `--json` | `job_mqaj1klb_256dac54` | `5a5e1afc` | `5a5e1afc-7886-4760-aea8-f2698845fbfa` | `codex:cc-plugin-codex:review-job_mqait46g-3759123e` | `stopped` | review PASS, no findings; `reviewOf.jobId=job_mqait46g_08e76d77`, `turnIndex=3` |

## Command log

### Dispatcher orientation

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs --help
# exit 0
```

Help listed `delegate`, `followup`, `review`, `adversarial-review`, `status`, `result`, and `stop`. It also listed `--yes`, `--json`, `--model`, `--effort`, `--permission-mode`, and the expected subcommand constraints.

### Primary delegate and Plan 0022 awaiting_followup check

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes --name p22-followup-review-readonly -- "Read-only Plan 0022 followup/review smoke. Do not edit files or run write commands. Reply exactly: P22_INITIAL_IDLE_READY"
# exit 0
```

Output marker:

```text
Claude job started
Job ID:         job_mqait46g_08e76d77
Status:         running
Claude session: 17fb5e34
Name:           p22-followup-review-readonly-868c4df3
```

First filtered status poll:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json | jq '.jobs[] | select(.jobId=="job_mqait46g_08e76d77") | {jobId,status,updatedAt,shortId:.claude.shortId,sessionId:.claude.sessionId,sessionName:.claude.sessionName,turns:(.turns|map({status,startedAt,endedAt,preview:.result.finalMessagePreview})),result:.result.finalMessagePreview}'
# exit 0
```

Result:

```json
{
  "jobId": "job_mqait46g_08e76d77",
  "status": "awaiting_followup",
  "shortId": "17fb5e34",
  "sessionId": "17fb5e34-5ac0-4f59-8c27-83dac197aabe",
  "sessionName": "p22-followup-review-readonly-868c4df3",
  "turns": [{"status":"completed","endedAt":"2026-06-12T06:03:38.246Z","preview":"P22_INITIAL_IDLE_READY"}],
  "result": "P22_INITIAL_IDLE_READY"
}
```

### Followup turns

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_mqait46g_08e76d77 --yes -- "First follow-up turn. Do not edit files. Reply exactly: P22_FOLLOWUP_ONE_READY"
# exit 0
```

Immediate output showed `Turn: 1 (completed)`, `Status: running`, and prior marker `P22_INITIAL_IDLE_READY`. Throttled status poll after 5 seconds showed `status: awaiting_followup`, turn 1 completed at `2026-06-12T06:03:57.470Z`, marker `P22_FOLLOWUP_ONE_READY`.

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_mqait46g_08e76d77 --yes -- "Second follow-up turn. Do not edit files. Reply exactly: P22_FOLLOWUP_TWO_READY"
# exit 0
```

Immediate output showed prior marker `P22_FOLLOWUP_ONE_READY`. Throttled status poll showed `status: awaiting_followup`, turn 2 completed at `2026-06-12T06:04:26.092Z`, marker `P22_FOLLOWUP_TWO_READY`.

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_mqait46g_08e76d77 --yes --json -- "JSON follow-up turn. Do not edit files. Reply exactly: P22_FOLLOWUP_JSON_READY"
# exit 0
```

Immediate JSON output:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqait46g_08e76d77",
    "status": "running",
    "shortId": "17fb5e34",
    "sessionName": "p22-followup-review-readonly-868c4df3",
    "resultPreview": "P22_FOLLOWUP_TWO_READY"
  },
  "turn": {
    "index": 3,
    "status": "completed",
    "finalMessagePreview": "P22_FOLLOWUP_TWO_READY"
  }
}
```

Throttled status poll showed `status: awaiting_followup`, turn 3 completed at `2026-06-12T06:04:52.836Z`, marker `P22_FOLLOWUP_JSON_READY`.

### Different prompt and rapid no-name delegates

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes --name p22-different-prompt -- "Different Plan 0022 delegate prompt. Do not edit files. Reply exactly: P22_DIFFERENT_DELEGATE_READY"
# exit 0; job_mqaivq4a_7d5bf013; short b748c99a; name p22-different-prompt-eb55a589
```

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes -- "Rapid no-name delegate A. Do not edit files. Reply exactly: P22_RAPID_NONAME_A_READY"
# exit 0; job_mqaivpzq_656dd560; short 1070f658; name codex:cc-plugin-codex:mqaivn66-66291b64
```

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes -- "Rapid no-name delegate B. Do not edit files. Reply exactly: P22_RAPID_NONAME_B_READY"
# exit 0; job_mqaivpq7_192fe444; short 2e3244b4; name codex:cc-plugin-codex:mqaivmyi-73e8b6ce
```

Filtered status after a 5 second sleep showed all three at `awaiting_followup`:

```text
job_mqaivq4a_7d5bf013 -> P22_DIFFERENT_DELEGATE_READY
job_mqaivpzq_656dd560 -> P22_RAPID_NONAME_A_READY
job_mqaivpq7_192fe444 -> P22_RAPID_NONAME_B_READY
```

### Stopped-job followup error

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaivq4a_7d5bf013 --json
# exit 0; status stopped
```

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_mqaivq4a_7d5bf013 --yes -- "Attempt follow-up after stop. Reply exactly: P22_SHOULD_NOT_RUN"
# exit 1
```

Error:

```text
[followup] Error: Job job_mqaivq4a_7d5bf013 is stopped; start a new $claude-delegate job instead.
```

### Same-session review

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_mqait46g_08e76d77 --yes
# exit 0
```

Output:

```text
Review verdict: PASS
Job ID:  job_mqait46g_08e76d77
Turn:    4 (completed)

No findings.
```

Status after 5 seconds showed the delegate back at `awaiting_followup` with turn 4 completed at `2026-06-12T06:06:13.360Z`.

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_mqait46g_08e76d77 --yes --json
# exit 0
```

Output:

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
    "jobId": "job_mqait46g_08e76d77",
    "status": "awaiting_followup"
  },
  "turn": {
    "index": 5,
    "status": "completed"
  }
}
```

### Adversarial review variants

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs adversarial-review job_mqait46g_08e76d77 --yes
# exit 0 after bounded wait
```

Output:

```text
Review verdict: PASS
Job ID:  job_mqaiyf6o_c730ee48
Turn:    0 (awaiting_followup)

No findings.
```

Persisted job: short `f1031b2d`, session ID `f1031b2d-ae06-4b57-996a-45afe38fab4d`, status `awaiting_followup`, result preview began with JSON verdict pass.

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs adversarial-review job_mqait46g_08e76d77 --yes --model opus
# exit 0 after bounded wait
```

Output:

```text
Review verdict: PASS
Job ID:  job_mqaizxsx_1e9d42d0
Turn:    0 (awaiting_followup)

No findings.
```

Persisted job: short `910b6122`, session ID `910b6122-06aa-4c6a-b384-31e624cd060d`, status `awaiting_followup`, result preview began with JSON verdict pass.

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs adversarial-review job_mqait46g_08e76d77 --yes --json
# exit 0
```

Output:

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
    "jobId": "job_mqaj1klb_256dac54",
    "status": "awaiting_followup",
    "reviewOf": {
      "jobId": "job_mqait46g_08e76d77",
      "turnIndex": 3
    }
  },
  "targetJob": {
    "jobId": "job_mqait46g_08e76d77",
    "status": "awaiting_followup"
  }
}
```

Persisted job: short `5a5e1afc`, session ID `5a5e1afc-7886-4760-aea8-f2698845fbfa`, status `awaiting_followup`, result preview began with JSON verdict pass.

## Cleanup

Stopped-job cleanup for `job_mqaivq4a_7d5bf013` was performed before the stopped-job followup error check.

Remaining cleanup commands:

```sh
set -o pipefail; node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqait46g_08e76d77 --json | jq '{ok, jobId:.job.jobId, status:.job.status, shortId:.job.claude.shortId, sessionId:.job.claude.sessionId, sessionName:.job.claude.sessionName, turns:(.job.turns|length), result:.job.result.finalMessagePreview}'
# exit 0; ok true; status stopped; turns 6
```

```sh
set -o pipefail; node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaivpzq_656dd560 --json | jq '{ok, jobId:.job.jobId, status:.job.status, shortId:.job.claude.shortId, sessionId:.job.claude.sessionId, sessionName:.job.claude.sessionName, turns:(.job.turns|length), result:.job.result.finalMessagePreview}'
# exit 0; ok true; status stopped; result P22_RAPID_NONAME_A_READY
```

```sh
set -o pipefail; node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaivpq7_192fe444 --json | jq '{ok, jobId:.job.jobId, status:.job.status, shortId:.job.claude.shortId, sessionId:.job.claude.sessionId, sessionName:.job.claude.sessionName, turns:(.job.turns|length), result:.job.result.finalMessagePreview}'
# exit 0; ok true; status stopped; result P22_RAPID_NONAME_B_READY
```

```sh
set -o pipefail; node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaiyf6o_c730ee48 --json | jq '{ok, jobId:.job.jobId, status:.job.status, shortId:.job.claude.shortId, sessionId:.job.claude.sessionId, sessionName:.job.claude.sessionName, turns:(.job.turns|length), result:.job.result.finalMessagePreview}'
# exit 0; ok true; status stopped; turns 1
```

```sh
set -o pipefail; node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaizxsx_1e9d42d0 --json | jq '{ok, jobId:.job.jobId, status:.job.status, shortId:.job.claude.shortId, sessionId:.job.claude.sessionId, sessionName:.job.claude.sessionName, turns:(.job.turns|length), result:.job.result.finalMessagePreview}'
# exit 0; ok true; status stopped; turns 1
```

```sh
set -o pipefail; node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaj1klb_256dac54 --json | jq '{ok, jobId:.job.jobId, status:.job.status, shortId:.job.claude.shortId, sessionId:.job.claude.sessionId, sessionName:.job.claude.sessionName, turns:(.job.turns|length), result:.job.result.finalMessagePreview}'
# exit 0; ok true; status stopped; turns 1
```

Final filtered status command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json | jq '[.jobs[] | select(.jobId as $id | ["job_mqait46g_08e76d77","job_mqaivq4a_7d5bf013","job_mqaivpzq_656dd560","job_mqaivpq7_192fe444","job_mqaiyf6o_c730ee48","job_mqaizxsx_1e9d42d0","job_mqaj1klb_256dac54"] | index($id)) | {jobId,status,updatedAt,shortId:.claude.shortId,sessionId:.claude.sessionId,sessionName:.claude.sessionName,turns:(.turns|length),result:.result.finalMessagePreview}]'
# exit 0
```

Final status for every job started in this lane was `stopped`. No partial jobs remained.

## Worktree note

Before writing this artifact, `git status --short` already showed unrelated dirty source files and untracked directories. I did not edit source files or commit. The only file intentionally written for this task is this artifact.
