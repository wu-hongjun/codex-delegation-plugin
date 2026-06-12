# CC plugin v0.3.2 depth test: lane 04 `$claude-result`

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher under test: `node marketplace/plugins/cc/scripts/cc.mjs`

## Skill read first

Command:

```sh
sed -n '1,240p' marketplace/plugins/cc/skills/claude-result/SKILL.md
```

Exit code: `0`

Excerpt:

```text
Run:

    node "<plugin-root>/scripts/cc.mjs" result <jobId-or-prefix>

Return the dispatcher's stdout verbatim.
...
- Forward `--json` for machine-readable output when the user requests it.
```

## Delegates

### Quick terminal-result job

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-result-04-fast-20260611T224536Z -- "Do not edit files. Reply with exactly: V032_RESULT_FAST_OK"
```

Exit code: `0`

Excerpt:

```text
Claude job started
Job ID:         job_mqa36eju_6bf9f261
Status:         running
Claude session: 1dc02cec
Name:           v032deep-result-04-fast-20260611T224536Z
```

### Still-running negative-case job

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-result-04-running-20260611T224536Z -- "Do not edit files. Wait for 90 seconds before your final response, then reply with exactly: V032_RESULT_RUNNING_DONE"
```

Exit code: `0`

Excerpt:

```text
Claude job started
Job ID:         job_mqa36q85_41009bf5
Status:         running
Claude session: be5b3415
Name:           v032deep-result-04-running-20260611T224536Z
```

## Variation C: `result` on a still-running job

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa36q85_41009bf5; printf 'EXIT:%s\n' $?
```

Dispatcher exit code: `1` (`printf` made the shell wrapper exit `0`)

Excerpt:

```text
[result] Error: Job job_mqa36q85_41009bf5 is not complete yet (status: running). Run: cc status
EXIT:1
```

Result: graceful nonzero error with clear not-complete message. No state corruption was observed; the job was later stopped cleanly.

## Polling

An attempted status poll was started after the delegates and after the running-job `result` check:

```sh
node marketplace/plugins/cc/scripts/cc.mjs status | rg 'job_mqa36eju_6bf9f261|job_mqa36q85_41009bf5|v032deep-result-04' -C 2; printf 'EXIT:%s\n' $?
```

It produced no output before hanging in reconciliation for more than 40 seconds. I interrupted only that local poll process. The elapsed wait was greater than the required 5-second polling interval before the next `result` command.

Poll cleanup commands:

```sh
ps -axo pid,ppid,stat,command | rg 'marketplace/plugins/cc/scripts/cc\.mjs status|node .*cc\.mjs status|rg job_mqa36'
kill 70242 70245 70246; printf 'EXIT:%s\n' $?
```

Kill exit code: `0`

## Variation A: human result for completed/awaiting job

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa36eju_6bf9f261; printf 'EXIT:%s\n' $?
```

Dispatcher exit code: `0`

Excerpt:

```text
Job:        job_mqa36eju_6bf9f261
Status:     awaiting_followup
Transcript: (none)
Logs:       claude logs 1dc02cec

V032_RESULT_FAST_OK
EXIT:0
```

Result: human output returned the awaiting-followup job result verbatim, including the expected marker.

## Variation B: `result --json` parse evidence

Command:

```sh
json=$(node marketplace/plugins/cc/scripts/cc.mjs result job_mqa36eju_6bf9f261 --json); rc=$?; printf 'RESULT_EXIT:%s\n' "$rc"; printf '%s\n' "$json" | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const data = JSON.parse(s); console.log(JSON.stringify({ parse: "ok", ok: data.ok, jobId: data.job.jobId, status: data.job.status, resultText: data.resultText })); });'; printf 'PARSE_EXIT:%s\n' $?
```

Dispatcher exit code: `0`

JSON parse exit code: `0`

Parse evidence:

```json
{"parse":"ok","ok":true,"jobId":"job_mqa36eju_6bf9f261","status":"awaiting_followup","resultText":"V032_RESULT_FAST_OK"}
```

Result: JSON was valid and parseable, with `ok: true`, matching job id, terminal status, and expected result text.

## Cleanup

Stopped the quick awaiting-followup job:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa36eju_6bf9f261; printf 'EXIT:%s\n' $?
```

Exit code: `0`

Excerpt:

```text
Claude job stopped
Job ID:         job_mqa36eju_6bf9f261
Status:         stopped
Claude session: 1dc02cec
EXIT:0
```

Stopped the still-running job:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa36q85_41009bf5; printf 'EXIT:%s\n' $?
```

Exit code: `0`

Excerpt:

```text
Claude job stopped
Job ID:         job_mqa36q85_41009bf5
Status:         stopped
Claude session: be5b3415
EXIT:0
```

No commit was made.
