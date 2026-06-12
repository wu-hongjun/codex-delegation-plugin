# Lane 12 - CC v0.3.3 `$claude-batch` Ticket Depth Test

Date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`
Skill read first: `sed -n '1,220p' /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/skills/claude-batch/SKILL.md`

## Summary

Result: pass with lifecycle caveats.

- Small bounded batch started, returned parseable JSON, reached real two-agent fan-out, then moved to `needs_input`; stopped for cleanup.
- `batch --json` stdout parsed successfully through `jq -e`.
- Start-then-stop mid-run returned `running` at dispatch and `stopped` after a delayed stop.
- All three lane jobs used unique `v033ticket-batch-12-*` names and were stopped.
- Broad `status --json` did not return output within bounded probes, so cleanup was verified from dispatcher job records plus Claude process/session checks.

## Commands

Small bounded batch:

```sh
node marketplace/plugins/cc/scripts/cc.mjs batch --json --name v033ticket-batch-12-small-20260612 -- "Run a small bounded unattended fan-out test for CC v0.3.3 ticket validation. Do not edit files. Use two parallel subagents if available: agent A inspects package/plugin metadata for this repository, and agent B inspects CC skill files. Each agent may run only read-only shell commands, should capture at most five facts, and should finish quickly. After both return, summarize the two result sets in under 10 bullets."
sleep 3
perl -e 'alarm 25; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs result job_mqacd6va_2fd5e94f --json
claude logs 42d409aa
sleep 4
perl -e 'alarm 25; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs result job_mqacd6va_2fd5e94f --json
perl -e 'alarm 25; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacd6va_2fd5e94f --json
```

`--json` parseability probe:

```sh
node marketplace/plugins/cc/scripts/cc.mjs batch --json --name v033ticket-batch-12-json-20260612 -- "Read-only JSON parseability probe for CC v0.3.3 batch. Do not edit files. Keep the work trivial: acknowledge the probe and stop after one concise sentence; do not spawn subagents unless the runtime requires it." | jq -e '{ok, jobId: .job.jobId, status: .job.status, sessionName: .job.claude.sessionName, promptBytes: .job.prompt.bytesLen}'
sleep 4
perl -e 'alarm 25; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacffs0_819ea3a6 --json
```

Start then stop mid-run:

```sh
node marketplace/plugins/cc/scripts/cc.mjs batch --json --name v033ticket-batch-12-stop-20260612 -- "Cancellation probe for CC v0.3.3 batch. Do not edit, create, delete, commit, push, or open PRs. Begin with a short note that this is a cancellation probe, then stay busy long enough for an external stop by running only read-only inspection/thinking for several minutes. If you use shell, only read-only commands are allowed."
sleep 4
perl -e 'alarm 25; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs stop job_mqacg7bj_7e420a55 --json
```

Cleanup verification:

```sh
perl -e 'alarm 20; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs status --json
for j in job_mqacd6va_2fd5e94f job_mqacffs0_819ea3a6 job_mqacg7bj_7e420a55; do printf '%s ' "$j"; jq -r '.status + " " + .claude.sessionName + " " + (.turns[-1].status // "no-turn")' /Users/hongjunwu/.codex/cc-plugin-codex/jobs/$j.json; done
ps -axo pid,ppid,stat,etime,command | rg 'v033ticket-batch-12|42d409aa|abf0bd08|0507bfb5|cc\.mjs (batch|status|stop)'
claude agents --json | jq -r '.[]? | select((.name // "") | startswith("v033ticket-batch-12")) | [.id,.status,.name] | @tsv'
```

## Key Output

Small batch start returned exit 0 and JSON with:

```json
{
  "ok": true,
  "jobId": "job_mqacd6va_2fd5e94f",
  "status": "running",
  "pluginVersion": "0.3.3",
  "sessionName": "v033ticket-batch-12-small-20260612-560fcd1e",
  "shortId": "42d409aa",
  "sessionId": "42d409aa-88c2-44b8-981c-de0cbccefa4b"
}
```

First result poll after delayed wait:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqacd6va_2fd5e94f is not complete yet (status: running). Run: cc status",
    "name": "Error"
  }
}
```

Second result poll after another delayed wait:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqacd6va_2fd5e94f is not complete yet (status: needs_input). Run: cc status",
    "name": "Error"
  }
}
```

The `--json` parseability command exited 0 through `jq -e`:

```json
{
  "ok": true,
  "jobId": "job_mqacffs0_819ea3a6",
  "status": "running",
  "sessionName": "v033ticket-batch-12-json-20260612-6527a547",
  "promptBytes": 217
}
```

Cancellation start returned exit 0 and JSON with:

```json
{
  "ok": true,
  "jobId": "job_mqacg7bj_7e420a55",
  "status": "running",
  "sessionName": "v033ticket-batch-12-stop-20260612-7e6405e1",
  "shortId": "0507bfb5",
  "sessionId": "0507bfb5-d728-45c4-92d8-97142b5e16dd"
}
```

Cancellation stop returned exit 0 and JSON with:

```json
{
  "ok": true,
  "jobId": "job_mqacg7bj_7e420a55",
  "status": "stopped",
  "sessionName": "v033ticket-batch-12-stop-20260612-7e6405e1",
  "turnStatus": "queued"
}
```

## Fan-Out Evidence

Live log command before cleanup:

```sh
claude logs 42d409aa
```

Observed excerpt from the live log playback before the job was stopped:

```text
Running 2 Explore agents...
Inspect package/plugin metadata
Inspect CC skill files
agents:2
```

After cleanup, `claude logs 42d409aa` no longer resolved the stopped short id:

```text
Couldn't read logs for 42d409aa - job not found - it may have already exited
```

Persistent main transcript:

```text
/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/42d409aa-88c2-44b8-981c-de0cbccefa4b.jsonl
```

Main transcript `Agent` tool-use extraction:

```sh
jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="Agent") | [.input.description, .input.subagent_type] | @tsv' /Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/42d409aa-88c2-44b8-981c-de0cbccefa4b.jsonl
```

Output:

```text
Inspect package/plugin metadata	Explore
Inspect CC skill files	Explore
```

Sidechain subagent files:

```text
/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/42d409aa-88c2-44b8-981c-de0cbccefa4b/subagents/agent-a6a005744eb0dfb47.jsonl
/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/42d409aa-88c2-44b8-981c-de0cbccefa4b/subagents/agent-a0856d24335a63f8a.jsonl
```

Sidechain metadata:

```json
{
  "agentType": "Explore",
  "description": "Inspect CC skill files",
  "toolUseId": "toolu_01PG6ukcGXsfVZX8DnBcjAz8"
}
{
  "agentType": "Explore",
  "description": "Inspect package/plugin metadata",
  "toolUseId": "toolu_01EgL3QLT2GLkyPV9vUqKZwu"
}
```

Sidechain tool excerpts:

```text
agent-a0856d24335a63f8a.jsonl
tool=Bash desc=Find all skills directories in the repo
tool=Bash desc=List root directory structure
tool=Bash desc=List skill directories in marketplace/plugins/cc/skills
tool=Bash desc=List skill directories in packages/plugin-codex/skills

agent-a6a005744eb0dfb47.jsonl
tool=Bash desc=Find package and plugin metadata files
tool=Bash desc=Read package.json metadata
tool=Bash desc=Read package.json files from workspace packages
tool=Bash desc=Find plugin or manifest JSON files
```

Partial parent output was recoverable at:

```text
/Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqacd6va_2fd5e94f.result.md
```

ASCII excerpt:

```text
Launching both in parallel now.
```

## Cleanup

Stop commands were run for all lane-created jobs:

```text
job_mqacd6va_2fd5e94f stopped v033ticket-batch-12-small-20260612-560fcd1e needs_input
job_mqacffs0_819ea3a6 stopped v033ticket-batch-12-json-20260612-6527a547 queued
job_mqacg7bj_7e420a55 stopped v033ticket-batch-12-stop-20260612-7e6405e1 queued
```

`claude agents --json` filtered for `v033ticket-batch-12` returned no rows.

Process check for the lane names and short ids returned only the check command itself, not a surviving lane job:

```text
/bin/zsh -c ps -axo pid,ppid,stat,etime,command | rg 'v033ticket-batch-12|42d409aa|abf0bd08|0507bfb5|cc\.mjs (batch|status|stop)'
rg v033ticket-batch-12|42d409aa|abf0bd08|0507bfb5|cc\.mjs (batch|status|stop)
```

`status --json` caveat:

```sh
perl -e 'alarm 20; exec @ARGV' node marketplace/plugins/cc/scripts/cc.mjs status --json
```

Result: no stdout before the 20 second alarm; exit code `-1` from the harness. Earlier unbounded `status --json` also produced no stdout across two 30 second polls before its session exited with code `-1`. Cleanup assertions above therefore use per-job dispatcher records and Claude process/session checks.

No ticket files were edited and no commit was made.
