# Lane 15: CC plugin v0.3.2 edge cases

Date: 2026-06-11
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `node /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs`
Plugin version observed: `0.3.2`
Claude runtime: repo `tools/mock-claude` with isolated temp state, reporting `Claude Code 2.1.999-mock`

## Summary

Result: PASS for the requested dispatcher edge behavior.

- `--allow-edit` on `workflow`, `goal`, `fork`, `batch`, `deep-research`, `review`, and `adversarial-review` exited `2` with a `not applicable` error. I also checked read-only `workflows`, which exited `2`.
- Empty and whitespace-only delegate prompts exited `2` before privacy or driver probing.
- Closest dispatcher typo for `$claude-delyes` was `printf 'x\n' | node "$DISP" delyes`; it exited `2` with `Unknown command: delyes`.
- Fresh non-TTY delegate without `--yes` exited `1`, did not create a job, and printed the privacy acknowledgement rejection.
- `--yes` recorded the workspace acknowledgement; a second non-TTY delegate in the same workspace without `--yes` exited `0` and did not re-prompt.
- Workspace isolation held: repo-local `status --json` did not show `/tmp` workspace jobs; one `status --all --json` did show them.
- `--json` outputs across the bg-flow surface were parseable. For `followup`, `review`, and `adversarial-review`, the bounded mock-backed jobs exercised parseable JSON error paths.
- Every job started by this lane was stopped. The isolated temp tree was removed after recording evidence.

## Skill Reads

Read before testing the associated commands:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-delegate/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-workflow/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-goal/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-fork/SKILL.md
sed -n '1,240p' marketplace/plugins/cc/skills/claude-batch/SKILL.md
sed -n '1,240p' marketplace/plugins/cc/skills/claude-deep-research/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-followup/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-review/SKILL.md
sed -n '1,240p' marketplace/plugins/cc/skills/claude-adversarial-review/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-result/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-status/SKILL.md
sed -n '1,220p' marketplace/plugins/cc/skills/claude-stop/SKILL.md
sed -n '1,240p' marketplace/plugins/cc/skills/claude-workflows/SKILL.md
```

Relevant documented contract: `--allow-edit` is accepted only by delegate/followup and is not applicable to workflow, goal, fork, batch, deep-research, review, adversarial-review, or workflows.

## Environment

All dispatcher commands below used:

```sh
DISP=/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc/scripts/cc.mjs
REPO=/Users/hongjunwu/Repositories/Git/cc-plugin-codex
MOCK=/Users/hongjunwu/Repositories/Git/cc-plugin-codex/tools/mock-claude
BASE=/tmp/cc-edge15-finaltmp-20260611230951-94137
CC_PLUGIN_CODEX_HOME=$BASE/home
CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME=$BASE/mock
CC_PLUGIN_CODEX_ATTACH_WARMUP_MS=0
CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS=0
CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS=10
CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS=5000
PATH=$MOCK:$PATH
```

Workspaces:

```text
JSON_WS=/tmp/cc-edge15-finaltmp-20260611230951-94137/json-ws
PRIV_WS=/tmp/cc-edge15-finaltmp-20260611230951-94137/privacy-ws
JSON_WS_REAL=/private/tmp/cc-edge15-finaltmp-20260611230951-94137/json-ws
PRIV_WS_REAL=/private/tmp/cc-edge15-finaltmp-20260611230951-94137/privacy-ws
```

## Allow-Edit Rejections

Each command exited `2`.

| Command | Stderr excerpt |
| --- | --- |
| `node "$DISP" workflow --allow-edit -- "noop"` | `[workflow] Error: --allow-edit is not applicable to $claude-workflow.` |
| `node "$DISP" goal --allow-edit -- "noop"` | `[goal] Error: --allow-edit is not applicable to $claude-goal.` |
| `node "$DISP" fork --allow-edit -- "noop"` | `[fork] Error: --allow-edit is not applicable to $claude-fork.` |
| `node "$DISP" batch --allow-edit -- "noop"` | `[batch] Error: --allow-edit is not applicable to $claude-batch.` |
| `node "$DISP" deep-research --allow-edit -- "noop"` | `[deep-research] Error: --allow-edit is not applicable to $claude-deep-research.` |
| `node "$DISP" review --allow-edit job_not_needed` | `[review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.` |
| `node "$DISP" adversarial-review --allow-edit job_not_needed` | `[adversarial-review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.` |
| `node "$DISP" workflows --allow-edit` | `[workflows] Error: --allow-edit is not applicable to $claude-workflows.` |

## Prompt, Typo, Privacy

Empty and whitespace prompts:

| Command | Exit | Stderr excerpt |
| --- | ---: | --- |
| `node "$DISP" delegate -- ""` | `2` | `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |
| `node "$DISP" delegate -- "      "` | `2` | `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |

Closest dispatcher typo behavior:

```sh
printf 'x\n' | node "$DISP" delyes
```

Exit code: `2`

```text
Error: Unknown command: delyes
```

Fresh workspace privacy rejection:

```sh
cd "$PRIV_WS" && printf '' | node "$DISP" delegate -- 'privacy rejection probe'
```

Exit code: `1`

```text
[delegate] Error: Privacy acknowledgement required.
This command will send your prompt to Claude Code as a background session.
Claude Code will have access to files in the current workspace.
Workspace: /private/tmp/cc-edge15-finaltmp-20260611230951-94137/privacy-ws
Re-run with --yes to acknowledge and proceed.
```

Job count before rejection: `0`
Job count after rejection: `0`

Privacy acknowledgement persistence:

```sh
cd "$PRIV_WS" && node "$DISP" delegate --yes --json --name edge15-privacy-yes -- "Privacy ack recording probe."
cd "$PRIV_WS" && printf '' | node "$DISP" delegate --json --name edge15-privacy-second -- 'Second delegate should use stored ack.'
```

Exit codes: both `0`

JSON parse evidence:

```text
privacy-yes: source=stdout ok=true keys=ok,job
privacy-second-no-yes: source=stdout ok=true keys=ok,job
```

Started jobs:

```text
job_mqa41crv_7d8dc09b
job_mqa41dk6_04ffe6b6
```

The second command was non-TTY, did not pass `--yes`, and still started because the first command recorded the ack for the same workspace.

## Workspace Isolation

Repo-local status did not show the `/tmp` privacy workspace jobs:

```sh
cd "$REPO" && node "$DISP" status --json
```

Exit code: `0`

```text
repo status has privacy jobs: false count=0
repo-status-json: source=stdout ok=true keys=ok,jobs
```

One all-workspace status did show them:

```sh
cd "$REPO" && node "$DISP" status --all --json
```

Exit code: `0`

```text
repo status --all has privacy jobs: true count=2
repo-status-all-json: source=stdout ok=true keys=ok,jobs
```

## JSON Coverage

Start commands in `$JSON_WS`:

```sh
node "$DISP" delegate --yes --json --name edge15-json-delegate -- "Return exactly EDGE15_JSON_DELEGATE."
node "$DISP" workflow --yes --json --name edge15-json-workflow -- "Create a no-op workflow plan that says EDGE15_JSON_WORKFLOW."
node "$DISP" goal --yes --json --name edge15-json-goal -- "Say EDGE15_JSON_GOAL once then stop."
node "$DISP" fork --yes --json --name edge15-json-fork -- "Say EDGE15_JSON_FORK only."
node "$DISP" batch --yes --json --name edge15-json-batch -- "Say EDGE15_JSON_BATCH only; do not edit files."
node "$DISP" deep-research --yes --json --name edge15-json-deep-research -- "Answer 1+1 in one short sentence."
```

Exit codes: all `0`.

Started jobs:

```text
delegate:      job_mqa41e81_7dc657bd
workflow:      job_mqa41epb_0430ea04
goal:          job_mqa41f6g_ce0edf5d
fork:          job_mqa41fnm_26713e66
batch:         job_mqa41g4r_5fc6a423
deep-research: job_mqa41gm2_8b65a99f
```

Poll:

```sh
sleep 5
node "$DISP" status --json
```

Exit code: `0`

Parse evidence:

```text
json-status: source=stdout ok=true keys=ok,jobs
```

Additional JSON commands:

```sh
node "$DISP" workflows --json
node "$DISP" workflows job_mqa41epb_0430ea04 --json
node "$DISP" stop --json job_mqa41e81_7dc657bd
node "$DISP" result --json job_mqa41e81_7dc657bd
node "$DISP" followup --json --yes job_mqa41e81_7dc657bd -- "Followup after stop should be rejected as JSON."
node "$DISP" review --json --yes job_mqa41e81_7dc657bd
node "$DISP" adversarial-review --json --yes job_mqa41e81_7dc657bd
```

Parse evidence:

```text
json-delegate: source=stdout ok=true keys=ok,job
json-workflow: source=stdout ok=true keys=ok,job
json-goal: source=stdout ok=true keys=ok,job
json-fork: source=stdout ok=true keys=ok,job
json-batch: source=stdout ok=true keys=ok,job
json-deep-research: source=stdout ok=true keys=ok,job
json-workflows: source=stdout ok=undefined keys=sessions
json-workflows-detail: source=stdout ok=undefined keys=jobId,sessionId,name,status,cwd,startedAt,subagents,phaseRecords
json-stop-delegate: source=stdout ok=true keys=ok,job
json-result: source=stdout ok=true keys=ok,job,resultText
json-followup-stopped: source=stderr ok=false keys=ok,error
json-review-stopped: source=stderr ok=false keys=ok,error
json-adversarial-review: source=stderr ok=false keys=ok,error
```

Error JSON excerpts:

```json
{
  "ok": false,
  "error": {
    "message": "Job job_mqa41e81_7dc657bd is stopped; start a new $claude-delegate job instead.",
    "name": "Error"
  }
}
```

```json
{
  "ok": false,
  "error": {
    "message": "$claude-review is not applicable to stopped jobs; use $claude-adversarial-review for a fresh-session review of the prior output.",
    "name": "Error"
  }
}
```

```json
{
  "ok": false,
  "error": {
    "message": "No reviewable non-review output found for this job.",
    "name": "Error"
  }
}
```

The adversarial-review path was parseable JSON but not a success path in this mock run because the mock-backed stopped job had a result file while its initial turn remained `queued`, so the dispatcher found no completed non-review turn.

## Cleanup

Stop commands:

```sh
node "$DISP" stop --json job_mqa41e81_7dc657bd
cd "$REPO" && node "$DISP" stop job_mqa41crv_7d8dc09b --all --json
cd "$REPO" && node "$DISP" stop job_mqa41dk6_04ffe6b6 --all --json
cd "$REPO" && node "$DISP" stop job_mqa41epb_0430ea04 --all --json
cd "$REPO" && node "$DISP" stop job_mqa41f6g_ce0edf5d --all --json
cd "$REPO" && node "$DISP" stop job_mqa41fnm_26713e66 --all --json
cd "$REPO" && node "$DISP" stop job_mqa41g4r_5fc6a423 --all --json
cd "$REPO" && node "$DISP" stop job_mqa41gm2_8b65a99f --all --json
```

Exit codes: all `0`.

Cleanup of isolated state:

```sh
rm -rf "$BASE"
```

No commits were made.
