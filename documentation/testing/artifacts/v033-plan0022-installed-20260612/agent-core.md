# v0.3.3 installed dispatcher core-command lane

Date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher under test: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`
Source edits: none by this lane

## Summary

Covered `$claude-setup`, `$claude-status`, `$claude-result`, and `$claude-stop` against the installed cache dispatcher.

- Setup: plain, JSON, and rerun all exited 0. Overall setup status was `warn` because `claude --help` did not advertise `--bg`; delegate and follow-up capabilities were both `ok`.
- Status: plain, `--all`, `--json`, and bogus positional rejection covered. `status bogus` exited 2 with the expected rejection.
- Result: covered an awaiting-followup job with a completed turn, JSON output for that job, and a still-running graceful error.
- Stop: covered single-job stop and bare `--all` rejection. `--all-awaiting-followup` was skipped because the workspace already had an awaiting-followup job I did not start.
- Jobs started in this lane were cleaned up and verified stopped.

Status polling was throttled. I did not use repeated `status --all`; it was run once.

## Setup

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs setup
```

Exit code: 0

Key output excerpt:

```text
Claude companion setup - warn
  delegate capability: ok
  follow-up capability: ok

Shared (delegate + follow-up):
  ok    node-version                   Node 25.8.2
  ok    companion-dir-writable         /Users/hongjunwu/.codex/cc-plugin-codex
  ok    codex-version                  codex-cli 0.137.0
  ok    claude-binary                  claude binary is executable
  ok    claude-version                 2.1.175 (Claude Code)
  ok    claude-agents-json             claude agents --json returned 17 session(s)
  ok    transcript-path                /Users/hongjunwu/.claude/projects

Informational (does not gate either capability):
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session.
  ok    claude-daemon                  pid:     58147
  ok    codex-plugin-trust             Plugin reference found in /Users/hongjunwu/.codex/config.toml.
  ok    opus-4-8-supported             Opus 4.8 supported (--model claude-opus-4-8 available)
  ok    workflows-supported            Dynamic workflows available via /workflows
  ok    bg-exec-supported              claude --bg --exec available

Generated: 2026-06-12T06:02:10.536Z
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs setup --json
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "status": "warn",
  "delegateCapability": "ok",
  "followupCapability": "ok",
  "generatedAt": "2026-06-12T06:02:16.466Z",
  "probes": [
    {
      "name": "node-version",
      "status": "ok",
      "detail": "Node 25.8.2"
    },
    {
      "name": "claude-version",
      "status": "ok",
      "detail": "2.1.175 (Claude Code)"
    },
    {
      "name": "claude-bg-flag",
      "status": "warn",
      "detail": "--bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session."
    },
    {
      "name": "bg-exec-supported",
      "status": "ok",
      "detail": "claude --bg --exec available"
    }
  ]
}
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs setup
```

Exit code: 0

Rerun excerpt:

```text
Claude companion setup - warn
  delegate capability: ok
  follow-up capability: ok
Generated: 2026-06-12T06:02:21.328Z
```

## Status

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status
```

Exit code: 0

Key output excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq1eioll_d4060bf6             orphaned        d281f32d          codex:cc-plugin-codex:mq1eilva
  job_mq36pwuq_78224539             needs_input     e1d0b3a8          codex:cc-plugin-codex:mq36ptd0
  ...
  job_mqaifs1j_a2a2cae0             stopped         cd51a3fe          plan0022-review-1f274138
  job_mqairgyg_9e4606f5             awaiting_followup  84ee28c7          p22-coordinator-followup-772d7bb8

Follow-up available: run $claude-followup job_mqairgyg_9e4606f5 -- "next instruction"
```

Notes:

- The workspace already contained many historical `orphaned` and `stopped` jobs.
- `job_mqairgyg_9e4606f5` was present before my fixture cleanup decision and was not started by this lane.

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "jobs": [
    {
      "jobId": "job_mq1eioll_d4060bf6",
      "status": "orphaned",
      "workspace": {
        "root": "/Users/hongjunwu/Repositories/Git/cc-plugin-codex"
      },
      "claude": {
        "shortId": "d281f32d",
        "sessionId": "d281f32d-bac3-47cd-9f41-8956b932a1d1"
      }
    }
  ]
}
```

Notes:

- The actual JSON output was very large, about 28,498 lines in the terminal capture.
- Machine-readable fields were present: `ok`, `jobs[].jobId`, `jobs[].status`, `jobs[].workspace.root`, `jobs[].claude.shortId`, and `jobs[].claude.sessionId`.

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --all
```

Exit code: 0

Key output excerpt:

```text
Claude jobs for /Users/hongjunwu/Repositories/Git/cc-plugin-codex

  job_mq4pp1sz_be6167c6             stopped         a7dbed2f          codex:cc-v031-privacy-19306:mq4poz5m
  job_mq4pp6eb_681f3565             stopped         a2799151          codex:cc-v031-privacy-19306:mq4pp3kb
  job_mqah30pu_78e93cf4             stopped         f50b98d1          codex:tmp.TchXW7OSwf:mqah2y1b-a53368bb
  job_mqah30qf_23caa51b             stopped         e4b1bd9b          codex:tmp.Qh3B1NDvRr:mqah2y1b-a25df288
  job_mqairgyg_9e4606f5             awaiting_followup  84ee28c7          p22-coordinator-followup-772d7bb8
```

Notes:

- `--all` showed jobs from other workspace roots in addition to the current repo.
- This was the only `status --all` run.

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status bogus
```

Exit code: 2

Output:

```text
[status] Error: cc status does not take a job id (got "bogus"). For one job use: cc result bogus  (or cc status --all to list every workspace).
```

## Result

Fixture command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes --name p22-core-result-done-20260612a -- "Do not edit files. Reply exactly: P22_CORE_RESULT_DONE_20260612A"
```

Exit code: 0

Output:

```text
Claude job started
Job ID:         job_mqaiszko_693fbf51
Status:         running
Claude session: 6990462b
Name:           p22-core-result-done-20260612a-3f284e6f
Logs:           claude logs 6990462b
Run:
  $claude-status
  $claude-result job_mqaiszko_693fbf51
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqaiszko_693fbf51
```

Exit code: 0

Output:

```text
Job:        job_mqaiszko_693fbf51
Status:     awaiting_followup
Transcript: (none)
Logs:       claude logs 6990462b

P22_CORE_RESULT_DONE_20260612A
```

Interpretation:

- This covered result retrieval for a job awaiting follow-up with a completed latest turn.
- The job-level status was `awaiting_followup`; the JSON turn status below was `completed`.

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqaiszko_693fbf51 --json
```

Exit code: 0

Key output excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqaiszko_693fbf51",
    "status": "awaiting_followup",
    "claude": {
      "shortId": "6990462b",
      "sessionName": "p22-core-result-done-20260612a-3f284e6f",
      "sessionId": "6990462b-0a15-4220-a96d-2da7568e3334"
    },
    "turns": [
      {
        "status": "completed",
        "result": {
          "finalMessagePreview": "P22_CORE_RESULT_DONE_20260612A"
        }
      }
    ]
  },
  "resultText": "P22_CORE_RESULT_DONE_20260612A"
}
```

Fixture command for still-running path:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes --name p22-core-result-running-20260612a -- "Do not edit files. Run the harmless shell command sleep 90, then reply exactly: P22_CORE_RUNNING_DONE_20260612A"
```

Exit code: 0

Output:

```text
Claude job started
Job ID:         job_mqaitr2u_5a4ebd85
Status:         running
Claude session: 058667fd
Name:           p22-core-result-running-20260612a-709beaed
Logs:           claude logs 058667fd
Run:
  $claude-status
  $claude-result job_mqaitr2u_5a4ebd85
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqaitr2u_5a4ebd85
```

Exit code: 1

Output:

```text
[result] Error: Job job_mqaitr2u_5a4ebd85 is not complete yet (status: running). Run: cc status
```

Interpretation:

- This is the expected still-running graceful path: non-zero exit, clear status, and no crash/stack trace.

## Stop

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaitr2u_5a4ebd85
```

Exit code: 0

Output:

```text
Claude job stopped
Job ID:         job_mqaitr2u_5a4ebd85
Status:         stopped
Claude session: 058667fd
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop --all
```

Exit code: 2

Output:

```text
[stop] Error: bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.
```

Command not run:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop --all-awaiting-followup
```

Reason:

- Blocked to avoid stopping a job I did not start.
- Evidence from `status` and `status --all`: `job_mqairgyg_9e4606f5` was already `awaiting_followup` with Claude short session `84ee28c7` and name `p22-coordinator-followup-772d7bb8`.
- Running `stop --all-awaiting-followup` in this workspace would have bulk-stopped that pre-existing job along with any fixture awaiting follow-up.

Cleanup command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqaiszko_693fbf51
```

Exit code: 0

Output:

```text
Claude job stopped
Job ID:         job_mqaiszko_693fbf51
Status:         stopped
Claude session: 6990462b
```

## Final cleanup verification

Command:

```sh
node -e 'const {spawnSync}=require("node:child_process"); const cc="/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs"; const ids=new Set(["job_mqaiszko_693fbf51","job_mqaitr2u_5a4ebd85"]); const r=spawnSync(process.execPath,[cc,"status","--json"],{encoding:"utf8",maxBuffer:1024*1024*100}); if(r.status!==0){process.stderr.write(r.stderr||""); process.exit(r.status??1);} const data=JSON.parse(r.stdout); for (const j of data.jobs.filter(j=>ids.has(j.jobId))) console.log(`${j.jobId} ${j.status} ${j.claude?.shortId ?? ""} ${j.claude?.sessionId ?? ""} ${j.claude?.sessionName ?? ""}`);'
```

Exit code: 0

Output:

```text
job_mqaiszko_693fbf51 stopped 6990462b 6990462b-0a15-4220-a96d-2da7568e3334 p22-core-result-done-20260612a-3f284e6f
job_mqaitr2u_5a4ebd85 stopped 058667fd 058667fd-f517-4d0f-8f64-3fb03fd6207a p22-core-result-running-20260612a-709beaed
```

Note:

- An earlier local filtered-status helper without an explicit `maxBuffer` exited 1 because the workspace `status --json` payload exceeded Node's default `spawnSync` buffer. The dispatcher command itself had already exited 0 in the direct `status --json` run; the helper was rerun with a 100 MiB buffer for the final cleanup evidence above.
