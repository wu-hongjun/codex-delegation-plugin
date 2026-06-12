# Lane 03 - `$claude-status` F3 depth test

Date: 2026-06-11
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-status/SKILL.md
```

Skill contract confirmed: `status` lists jobs for the current workspace; `--all`
is only for explicit all-workspace listing.

## Commands and Results

### a. Plain list

```sh
node marketplace/plugins/cc/scripts/cc.mjs status
```

Exit code: `0`

Excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq1eioll_d4060bf6             orphaned        d281f32d          codex:cc-plugin-codex:mq1eilva
  job_mq1eqa7e_9c8e5b88             orphaned        2b741235          codex:cc-plugin-codex:mq1eq7jq
  ...
  job_mqa35ffc_3f299423             awaiting_followup  4d44dd61          v032deep-followup-05-20260611T224453Z

Follow-up available: run $claude-followup job_mqa35f4r_2c7ee59a -- "next instruction"
```

Verdict: pass. Current-workspace list printed and exited cleanly.

### b. All-workspaces list

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --all
```

Exit code: `0`

Excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq4pp1sz_be6167c6             stopped         a7dbed2f          codex:cc-v031-privacy-19306:mq4poz5m
  job_mq4pp6eb_681f3565             stopped         a2799151          codex:cc-v031-privacy-19306:mq4pp3kb
  job_mq4ppjve_4253474f             stopped         9616734c          codex:cc-v031-isolation2-29918:mq4pph7f
  ...
  job_mqa36q85_41009bf5             running         be5b3415          v032deep-result-04-running-20260611T224536Z
```

Verdict: pass. One `--all` call was run. No `status --all --json` call was run.

### c. JSON parseability

```sh
set -o pipefail; node marketplace/plugins/cc/scripts/cc.mjs status --json | node -e 'let s=""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({ok:j.ok, jobCount:j.jobs.length, first:j.jobs[0] && {jobId:j.jobs[0].jobId, status:j.jobs[0].status, name:j.jobs[0].name}}, null, 2)); });'
```

Exit code: `0`

Excerpt:

```json
{
  "ok": true,
  "jobCount": 137,
  "first": {
    "jobId": "job_mq1eioll_d4060bf6",
    "status": "orphaned"
  }
}
```

Verdict: pass. `status --json` output was accepted by `JSON.parse`.

### Real job setup

```sh
date -u +%Y%m%dT%H%M%SZ
```

Exit code: `0`

Excerpt:

```text
20260611T224905Z
```

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-status-03-20260611T224905Z -- "For dispatcher status testing only: do not edit files. Reply exactly READY and then wait for follow-up."
```

Exit code: `0`

Excerpt:

```text
Claude job started
Job ID:         job_mqa3axon_bee79aad
Status:         running
Claude session: d94df8c1
Name:           v032deep-status-03-20260611T224905Z
```

### d. `status <real jobId>`

```sh
node marketplace/plugins/cc/scripts/cc.mjs status job_mqa3axon_bee79aad
```

Exit code: `2`

Excerpt:

```text
[status] Error: cc status does not take a job id (got "job_mqa3axon_bee79aad"). For one job use: cc result job_mqa3axon_bee79aad  (or cc status --all to list every workspace).
```

Verdict: pass. The positional real job ID was rejected with exit `2` and guidance
to use `cc result <jobId>` or `cc status --all`.

### e. `status <bogus-id>`

```sh
node marketplace/plugins/cc/scripts/cc.mjs status job_v032_status_lane03_bogus
```

Exit code: `2`

Excerpt:

```text
[status] Error: cc status does not take a job id (got "job_v032_status_lane03_bogus"). For one job use: cc result job_v032_status_lane03_bogus  (or cc status --all to list every workspace).
```

Verdict: pass. The bogus positional ID was rejected with exit `2`. Output was a
single error line and did not print the full job list.

### Cleanup

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3axon_bee79aad
```

Exit code: `0`

Excerpt:

```text
Claude job stopped
Job ID:         job_mqa3axon_bee79aad
Status:         stopped
Claude session: d94df8c1
```

Cleanup verdict: pass. The temporary delegate was stopped before finishing.

## F3 Verdict

PASS. v0.3.2 fixes the F3 silent-argument-drop behavior for this dispatcher:
`cc status <real-job-id>` and `cc status <bogus-id>` both exit `2`, provide the
expected `cc result <jobId>` / `cc status --all` guidance, and do not print an
unfiltered full list. Plain list, `--all`, and `--json` parseability also passed.
