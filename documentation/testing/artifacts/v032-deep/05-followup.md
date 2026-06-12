# CC plugin v0.3.2 deep test: lane 05 followup

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Job name: `v032deep-followup-05-20260611T224453Z`

Job ID: `job_mqa35ffc_3f299423`

Claude session: `4d44dd61`

## Skill read

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-followup/SKILL.md
```

Exit code: `0`

Excerpt:

```text
node "<plugin-root>/scripts/cc.mjs" followup <jobId-or-prefix> -- "<follow-up prompt>"

Accepted flags (forwarded to the dispatcher):

- `--all` - search across workspaces
- `--json` - machine-readable output
- `--yes` - acknowledge privacy disclosure
- `--allow-edit` - policy/framing flag
```

## Delegate

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-followup-05-20260611T224453Z -- "You are running a CC plugin v0.3.2 followup depth test for lane 05. Do not edit files or run commands. Initial turn: reply with exactly LANE05_INITIAL_READY and then remain available for follow-up turns. For each follow-up, reply with only the requested marker or short JSON-safe text."
```

Exit code: `0`

Excerpt:

```text
Claude job started
Job ID:         job_mqa35ffc_3f299423
Status:         running
Claude session: 4d44dd61
Name:           v032deep-followup-05-20260611T224453Z
```

## Awaiting followup readiness

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35ffc_3f299423
```

Exit code: `0`

Excerpt:

```text
Job:        job_mqa35ffc_3f299423
Status:     awaiting_followup

LANE05_INITIAL_READY
```

Note: an all-job `status --json` invocation did not return promptly while other depth-test lanes were also polling this workspace. I used job-scoped `result`/`followup`/`stop` commands for the lane 05 evidence to avoid unrelated jobs blocking reconciliation.

## Followup A: first same-session turn

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --yes -- "Reply with exactly LANE05_FOLLOWUP_ONE_OK."
```

Exit code: `0`

Immediate excerpt:

```text
Claude follow-up sent
Job ID:         job_mqa35ffc_3f299423
Turn:           1 (completed)
Claude session: 4d44dd61
Status:         running

LANE05_INITIAL_READY
```

Poll command, after at least 5 seconds:

```sh
sleep 5 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35ffc_3f299423
```

Exit code: `0`

Resolved excerpt:

```text
Job:        job_mqa35ffc_3f299423
Status:     awaiting_followup

LANE05_FOLLOWUP_ONE_OK
```

## Followup B: second followup on same job

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --yes -- "Reply with exactly LANE05_FOLLOWUP_TWO_OK."
```

Exit code: `0`

Immediate excerpt:

```text
Claude follow-up sent
Job ID:         job_mqa35ffc_3f299423
Turn:           2 (completed)
Claude session: 4d44dd61
Status:         running

LANE05_FOLLOWUP_ONE_OK
```

Poll command, after at least 5 seconds:

```sh
sleep 5 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35ffc_3f299423
```

Exit code: `0`

Resolved excerpt:

```text
Job:        job_mqa35ffc_3f299423
Status:     awaiting_followup

LANE05_FOLLOWUP_TWO_OK
```

## Followup C: JSON output parses

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --json --yes -- "Reply with exactly LANE05_FOLLOWUP_JSON_OK."
```

Exit code: `0`

Raw JSON excerpt:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mqa35ffc_3f299423",
    "status": "running",
    "shortId": "4d44dd61",
    "sessionName": "v032deep-followup-05-20260611T224453Z",
    "resultPreview": "LANE05_FOLLOWUP_TWO_OK"
  },
  "turn": {
    "index": 3,
    "status": "completed",
    "finalMessagePreview": "LANE05_FOLLOWUP_TWO_OK"
  }
}
```

Parse verification command:

```sh
node -e 'const s = `{
  "ok": true,
  "job": {
    "jobId": "job_mqa35ffc_3f299423",
    "status": "running",
    "shortId": "4d44dd61",
    "sessionName": "v032deep-followup-05-20260611T224453Z",
    "resultPreview": "LANE05_FOLLOWUP_TWO_OK"
  },
  "turn": {
    "index": 3,
    "status": "completed",
    "finalMessagePreview": "LANE05_FOLLOWUP_TWO_OK"
  }
}`; const j = JSON.parse(s); console.log(JSON.stringify({parsed: true, ok: j.ok, jobId: j.job.jobId, status: j.job.status, turn: j.turn.index, preview: j.turn.finalMessagePreview}));'
```

Exit code: `0`

Parse output:

```json
{"parsed":true,"ok":true,"jobId":"job_mqa35ffc_3f299423","status":"running","turn":3,"preview":"LANE05_FOLLOWUP_TWO_OK"}
```

Poll command, after at least 5 seconds:

```sh
sleep 5 && node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35ffc_3f299423
```

Exit code: `0`

Resolved excerpt:

```text
Job:        job_mqa35ffc_3f299423
Status:     awaiting_followup

LANE05_FOLLOWUP_JSON_OK
```

Stale/resolve note: the immediate `--json` output was valid JSON and parseable, but both `resultPreview` and `turn.finalMessagePreview` were one turn stale (`LANE05_FOLLOWUP_TWO_OK`). After a 5 second poll, `result` resolved to `LANE05_FOLLOWUP_JSON_OK` and `awaiting_followup`.

## Followup D: stopped job error

Stop command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa35ffc_3f299423
```

Exit code: `0`

Stop excerpt:

```text
Claude job stopped
Job ID:         job_mqa35ffc_3f299423
Status:         stopped
Claude session: 4d44dd61
```

Stopped followup command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs followup job_mqa35ffc_3f299423 --yes -- "Reply with exactly LANE05_AFTER_STOP_SHOULD_FAIL."
```

Exit code: `1`

Error excerpt:

```text
[followup] Error: Job job_mqa35ffc_3f299423 is stopped; start a new $claude-delegate job instead.
```

## Cleanup verification

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35ffc_3f299423
```

Exit code: `0`

Excerpt:

```text
Job:        job_mqa35ffc_3f299423
Status:     stopped

LANE05_FOLLOWUP_JSON_OK
```

Cleanup result: lane 05 job `job_mqa35ffc_3f299423` is stopped. No commit was made.
