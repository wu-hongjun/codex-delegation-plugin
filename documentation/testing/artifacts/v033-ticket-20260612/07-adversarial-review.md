# Lane 07: adversarial-review

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`  
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`  
Date: 2026-06-12

## Skill read

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-adversarial-review/SKILL.md
```

Relevant instruction excerpt:

```text
node "<plugin-root>/scripts/cc.mjs" adversarial-review <jobId-or-prefix> [flags]

The dispatcher constructs the adversarial review prompt internally -- do NOT
pass an empty prompt and do NOT append `--` to the run line.

Forward only these flags when the user explicitly requests them:
`--all`, `--json`, `--yes`, `--model`, `--effort`, `--permission-mode`.
```

## Source delegate job

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v033ticket-advsrc -- 'CC v0.3.3 ticket depth test source job for adversarial review. Do not edit files or run tools. Reply with exactly two lines: ADV_SRC_READY and NOTE: source response intentionally has no tests run.'
```

Launcher excerpt after polling for more than 3 seconds:

```text
Claude job started
Job ID:         job_mqac3l2g_b7bdc799
Status:         running
Claude session: ae988905
Name:           v033ticket-advsrc-5762fd1e
```

Result command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac3l2g_b7bdc799 --json
```

Result excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac3l2g_b7bdc799",
    "status": "awaiting_followup",
    "codex": {
      "pluginVersion": "0.3.3"
    },
    "turns": [
      {
        "status": "completed",
        "result": {
          "finalMessagePreview": "ADV_SRC_READY NOTE: source response intentionally has no tests run."
        }
      }
    ]
  },
  "resultText": "ADV_SRC_READY\nNOTE: source response intentionally has no tests run."
}
```

## Default adversarial-review

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqac3l2g_b7bdc799
```

Output excerpt after polling for more than 3 seconds:

```text
Review verdict: PASS
Job ID:  job_mqac5kut_f39d11fc
Turn:    0 (awaiting_followup)

No findings.
```

## adversarial-review --model opus

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqac3l2g_b7bdc799 --model opus
```

Output excerpt after polling for more than 3 seconds:

```text
Review verdict: PASS
Job ID:  job_mqac626m_bc008ccb
Turn:    0 (awaiting_followup)

No findings.
```

## adversarial-review --json parse

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs adversarial-review job_mqac3l2g_b7bdc799 --json | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); const job = data.reviewJob || data.job || {}; const result = { parseOk: true, ok: data.ok, jobId: job.jobId || data.jobId || null, status: job.status || data.status || null, verdict: data.verdict || data.review?.verdict || data.result?.verdict || null, topLevelKeys: Object.keys(data).sort() }; console.log(JSON.stringify(result, null, 2)); });'
```

Parsed output after polling for more than 3 seconds:

```json
{
  "parseOk": true,
  "ok": true,
  "jobId": "job_mqac6oux_928f6df0",
  "status": "awaiting_followup",
  "verdict": "pass",
  "topLevelKeys": [
    "job",
    "ok",
    "review",
    "targetJob"
  ]
}
```

## Polling note

All review launchers were allowed to run until completion and were polled with waits of at least 3 seconds. A broad `status --json` probe produced no output after more than 30 seconds, so it was not used as evidence.

Cleanup for that stuck probe:

```sh
kill 11411 || true
ps -p 11411 -o pid=,stat=,command=
```

Excerpt:

```text
<no output; ps exited 1 after PID disappeared>
```

Final process scan for lane job ids and review/delegate launch commands:

```sh
ps -axo pid,ppid,stat,etime,command | rg 'job_mqac3l2g|job_mqac5kut|job_mqac626m|job_mqac6oux|cc\.mjs adversarial-review|cc\.mjs delegate --yes --name v033ticket-advsrc'
```

Excerpt:

```text
<only the rg scan command matched; no lane delegate or adversarial-review process remained>
```

## Job cleanup

Stopped every job started by this lane:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac3l2g_b7bdc799 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac5kut_f39d11fc --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac626m_bc008ccb --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac6oux_928f6df0 --json
```

Stop excerpts:

```json
[
  {
    "ok": true,
    "jobId": "job_mqac3l2g_b7bdc799",
    "status": "stopped"
  },
  {
    "ok": true,
    "jobId": "job_mqac5kut_f39d11fc",
    "status": "stopped"
  },
  {
    "ok": true,
    "jobId": "job_mqac626m_bc008ccb",
    "status": "stopped"
  },
  {
    "ok": true,
    "jobId": "job_mqac6oux_928f6df0",
    "status": "stopped"
  }
]
```

## Summary

- Created source job `job_mqac3l2g_b7bdc799`.
- Default adversarial review returned `PASS` and created `job_mqac5kut_f39d11fc`.
- `--model opus` adversarial review returned `PASS` and created `job_mqac626m_bc008ccb`.
- `--json` adversarial review output was parseable with `JSON.parse`, returned `ok: true`, and created `job_mqac6oux_928f6df0`.
- All four jobs started by this lane were stopped.
