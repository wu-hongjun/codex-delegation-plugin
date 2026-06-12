# Lane 04 - claude-result depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Skill read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-result/SKILL.md
```

Exit code: 0

Key instruction excerpt: run `node "<plugin-root>/scripts/cc.mjs" result <jobId-or-prefix>`; forward `--json` for machine-readable output; do not reimplement command logic.

## Preflight Note

I started with a broad workspace status check, but did not use it as acceptance evidence because it reconciles every job in the workspace and produced no output before the tool ended it:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status --json
```

Exit code: -1

Excerpt: no stdout/stderr.

The result tests below use target job IDs directly.

## Delegate 1 - completed result target

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --json --yes --name v033ticket-result-04-done -- "For the CC v0.3.3 ticket depth test lane 04, do not edit files and do not run tools. Reply exactly: V033TICKET_RESULT_DONE"
```

Exit code: 0

Key excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac1hg9_fa6c1124",
    "status": "running",
    "codex": {
      "pluginVersion": "0.3.3"
    },
    "claude": {
      "shortId": "a9f68bcc",
      "sessionName": "v033ticket-result-04-done-25fcb0b1",
      "sessionId": "a9f68bcc-675c-4469-94c7-dc35e02fe843"
    }
  }
}
```

Poll delay:

```sh
sleep 3
```

Exit code: 0

The tool wall clock reported 2.874s, so I added a second conservative wait:

```sh
sleep 4
```

Exit code: 0

## Test 1 - human result

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac1hg9_fa6c1124
```

Exit code: 0

Output excerpt:

```text
Job:        job_mqac1hg9_fa6c1124
Status:     awaiting_followup
Transcript: (none)
Logs:       claude logs a9f68bcc

V033TICKET_RESULT_DONE
```

Result: passed. Human `result <jobId>` emitted the final answer and exited 0.

## Test 2 - JSON result parseability

Raw JSON command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac1hg9_fa6c1124 --json
```

Exit code: 0

Key excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac1hg9_fa6c1124",
    "status": "awaiting_followup"
  },
  "resultText": "V033TICKET_RESULT_DONE"
}
```

Parse command:

```sh
node -e 'const { spawnSync } = require("child_process"); const r = spawnSync("node", ["marketplace/plugins/cc/scripts/cc.mjs", "result", "job_mqac1hg9_fa6c1124", "--json"], { encoding: "utf8" }); if (r.status !== 0) { process.stderr.write(r.stderr + r.stdout); process.exit(r.status ?? 1); } const parsed = JSON.parse(r.stdout); console.log(JSON.stringify({ ok: parsed.ok, jobId: parsed.job.jobId, resultText: parsed.resultText }));'
```

Exit code: 0

Parser output:

```json
{"ok":true,"jobId":"job_mqac1hg9_fa6c1124","resultText":"V033TICKET_RESULT_DONE"}
```

Result: passed. `result --json` emits valid JSON parseable by `JSON.parse`.

## Delegate 2 - still-running result target

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --json --yes --name v033ticket-result-04-running --permission-mode bypassPermissions -- "For the CC v0.3.3 ticket depth test lane 04, do not edit files. Run a shell sleep for 90 seconds, then reply exactly: V033TICKET_RESULT_RUNNING_DONE"
```

Exit code: 0

Key excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac321f_b42a03ec",
    "status": "running",
    "codex": {
      "pluginVersion": "0.3.3"
    },
    "claude": {
      "shortId": "e1e36845",
      "sessionName": "v033ticket-result-04-running-d8afd97d",
      "sessionId": "e1e36845-0fec-49ff-a309-9284d5c4ee21"
    }
  }
}
```

Poll delay:

```sh
sleep 4
```

Exit code: 0

## Test 3 - result on still-running job

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqac321f_b42a03ec
```

Exit code: 1

Output excerpt:

```text
[result] Error: Job job_mqac321f_b42a03ec is not complete yet (status: running). Run: cc status
```

Result: passed. The command failed gracefully with a clear "not complete yet" message and included the live status.

## Cleanup

Stopped the completed/awaiting-followup delegate:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac1hg9_fa6c1124 --json
```

Exit code: 0

Key excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac1hg9_fa6c1124",
    "status": "stopped"
  }
}
```

Stopped the running delegate:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqac321f_b42a03ec --json
```

Exit code: 0

Key excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqac321f_b42a03ec",
    "status": "stopped"
  }
}
```

Checked for leftover sleep process from the bounded running delegate:

```sh
ps -axo pid,ppid,command | rg '[s]leep 90'
```

Exit code: 1

Excerpt: no matches.

Cleanup result: passed. Both jobs started by this lane were stopped, and no `sleep 90` process remained.

## Verdict

PASS for lane 04. `$claude-result` via `node marketplace/plugins/cc/scripts/cc.mjs result` returned completed human output, emitted parseable JSON with `--json`, and handled a still-running job with a graceful non-zero "not complete yet" error. All delegates started by this lane used unique `v033ticket-result-04-*` names and were stopped.
