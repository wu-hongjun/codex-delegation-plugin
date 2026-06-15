# cc v0.3.3 automation friction and cleanup edge cases

Tested: 2026-06-12

Dispatcher under test:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs
```

Primary workdir:

```sh
/Users/hongjunwu/Repositories/Git/cc-plugin-codex
```

Constraints followed:

- No source files edited.
- No commit made.
- Wrote only this artifact file in the repo.
- Started exactly one disposable job, then stopped it by exact job ID and verified the stopped status.
- Did not bulk-stop any pre-existing jobs.

## Baseline status payload

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

Result:

- cwd: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
- exit: `0`
- stdout JSON parseable: `true`
- stderr bytes: `0`
- stdout bytes: `1,413,534`
- jobs returned: `279`

Friction:

- `status --json` is technically parseable but very large in an active workspace.
- Each job record includes nested driver capability snapshots and health probe details. That is useful for debugging but noisy for status automation and can expose account/workspace metadata in copied logs. I did not copy those sensitive nested details into this artifact.

## Error and mistake cases

All commands below ran from `/Users/hongjunwu/Repositories/Git/cc-plugin-codex` unless a different cwd is listed.

| Case | Exact command | Exit | JSON parseability | Observed result |
| --- | --- | ---: | --- | --- |
| Empty prompt, no `--json` | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --yes -- ""` | `2` | stdout empty; stderr not JSON | stderr: `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |
| Empty prompt with `--json` | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json --yes -- ""` | `2` | stdout empty; stderr JSON parseable | JSON keys: `ok,error`; message: `prompt is required: cc delegate -- "<prompt>"` |
| `result` missing job ID | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result --json` | `2` | stdout empty; stderr JSON parseable | message: `usage: cc result <jobId>` |
| `stop` missing job ID | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop --json` | `2` | stdout empty; stderr JSON parseable | message: `usage: cc stop <jobId>` |
| User tries `status <jobId>` | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status job_mqay5thy_7db6c560 --json` | `2` | stdout empty; stderr JSON parseable | message: `cc status does not take a job id (got "job_mqay5thy_7db6c560"). For one job use: cc result job_mqay5thy_7db6c560  (or cc status --all to list every workspace).` |
| Bare `stop --all` | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop --all --json` | `2` | stdout empty; stderr JSON parseable | message: `bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.` |
| `followup` bogus ID | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs followup job_does_not_exist_00000000 --json -- hello` | `1` | stdout empty; stderr JSON parseable | message: `No job found matching "job_does_not_exist_00000000" in this workspace. Re-run with --all to search every workspace.` |
| `review` bogus ID | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_does_not_exist_00000000 --json --yes` | `1` | stdout empty; stderr JSON parseable | message: `No job found matching "job_does_not_exist_00000000" in this workspace. Re-run with --all to search every workspace.` |
| `result` bogus ID | `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_does_not_exist_00000000 --json` | `1` | stdout empty; stderr JSON parseable | message: `No job found matching "job_does_not_exist_00000000" in this workspace. Re-run with --all to search every workspace.` |

Notes:

- With `--json`, error objects are consistently parseable on `stderr`, not `stdout`.
- The non-JSON empty prompt error is concise but not machine-parseable. That is expected without `--json`, but it is an easy automation footgun if a caller forgets the flag.
- `status <jobId>` and bare `stop --all` have useful guidance and did not mutate anything.

## Fresh-workspace privacy UX

### Non-TTY, no `--yes`

cwd:

```sh
/tmp/cc-plugin-privacy-nontty.AcZqJy
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json -- "Reply exactly SHOULD_NOT_START"
```

Result:

- exit: `1`
- stdout: empty
- stderr JSON parseable: `true`
- error message:

```text
Privacy acknowledgement required.

This command will send your prompt to Claude Code as a background session.
Claude Code will have access to files in the current workspace.

Workspace: /private/tmp/cc-plugin-privacy-nontty.AcZqJy

Re-run with --yes to acknowledge and proceed.
```

Follow-up verification:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

from the same cwd returned:

```json
{
  "ok": true,
  "jobs": []
}
```

### TTY decline, no `--yes`

cwd:

```sh
/tmp/cc-plugin-privacy-tty-decline.HDUHAL
```

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json -- "Reply exactly SHOULD_NOT_START"
```

Prompt shown:

```text
Privacy acknowledgement required.

This command will send your prompt to Claude Code as a background session.
Claude Code will have access to files in the current workspace.

Workspace: /private/tmp/cc-plugin-privacy-tty-decline.HDUHAL

Type yes to acknowledge and proceed, or no to cancel.
Do you want to proceed? (yes/no)
```

Input sent: `no`

Result:

- exit: `1`
- final JSON object was parseable by itself:

```json
{
  "ok": false,
  "error": {
    "message": "Privacy acknowledgement declined.\n\nWorkspace: /private/tmp/cc-plugin-privacy-tty-decline.HDUHAL",
    "name": "Error"
  }
}
```

Friction:

- In TTY mode with `--json`, the full stderr/PTY stream is not a single JSON document. It contains the human prompt, the echoed `no`, then the JSON error. A strict automation client must avoid TTY mode or parse only the trailing JSON.

Follow-up verification:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

from the same cwd returned:

```json
{
  "ok": true,
  "jobs": []
}
```

Privacy note:

- The cwd was `/tmp/...`, while the plugin reported `/private/tmp/...`. That is normal on macOS, but it can surprise exact-string workspace assertions.

## Disposable job lifecycle and cleanup

cwd:

```sh
/var/folders/38/dmt8zdcs4f735lb71qsfx4hc0000gn/T/cc-plugin-privacy-yes-stop.dqf0Qc
```

Started job:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --json --yes --name p22-friction-cleanup-20260612 -- "Do not edit files. Reply exactly P22_FRICTION_CLEANUP_READY and then wait for follow-up."
```

Result:

- exit: `0`
- stdout JSON parseable: `true`
- stderr: empty
- returned job ID: `job_mqayagce_ce149525`
- initial status: `running`

Polled status:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

Observed for exact job ID `job_mqayagce_ce149525`:

- poll 0: `running`
- poll 1: `running`
- poll 2: `awaiting_followup`
- result preview: `P22_FRICTION_CLEANUP_READY`

Fetched result before stop:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqayagce_ce149525 --json
```

Result:

- exit: `0`
- stdout JSON parseable: `true`
- stderr: empty
- job status: `awaiting_followup`
- `resultText` present: `true`

Stopped by exact ID:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqayagce_ce149525 --json
```

Result:

- exit: `0`
- stdout JSON parseable: `true`
- stderr: empty
- returned job ID: `job_mqayagce_ce149525`
- returned status: `stopped`

Verified stopped by exact ID:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --json
```

Result for exact job ID `job_mqayagce_ce149525`:

- status: `stopped`
- result preview still present: `P22_FRICTION_CLEANUP_READY`

Friction:

- Success JSON is parseable, but full `delegate`, `status`, `result`, and `stop` payloads include complete job records with large nested driver/probe snapshots. For automation, callers usually need only `ok`, `jobId`, `status`, and result text/preview.

## Cleanup confirmation

- Jobs started by this test: `job_mqayagce_ce149525`
- Stopped by exact ID: `job_mqayagce_ce149525`
- Final verification: `status --json` in the disposable job workspace returned that exact job with `status: "stopped"`.
- No `stop --all-awaiting-followup` command was run.
- The tested `stop --all --json` command rejected before any bulk stop behavior.

## Overall frictions to consider

1. `--json` errors are on `stderr`, while successful JSON is on `stdout`. That is workable, but callers must parse both streams.
2. TTY privacy prompts with `--json` mix human prompt text and JSON on the same stream, so the entire stream is not JSON parseable.
3. Status/result/stop JSON payloads are much heavier than most automation needs and may include sensitive diagnostic metadata from driver health snapshots.
4. Fresh-workspace paths may be canonicalized from `/tmp/...` to `/private/tmp/...`, which can break exact string comparisons.
5. The specific cleanup edge cases tested here are mostly safe: `status <jobId>` is rejected with guidance, bare `stop --all` is rejected, and bogus IDs return parseable JSON errors with a helpful `--all` hint.
