# v0.3.2 deep test lane 06: claude-review

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher: `node marketplace/plugins/cc/scripts/cc.mjs`

Date: 2026-06-11

## Summary

Result: PASS with recorded transient failures.

- Read `marketplace/plugins/cc/skills/claude-review/SKILL.md` first.
- Confirmed `review` targets `<jobId-or-prefix>`, not a freeform prompt.
- Created read-only delegate jobs using `--yes` and names beginning `v032deep-review-`.
- Confirmed full-id human review rendering: `Review verdict: PASS` and `No findings.`
- Confirmed unique job-id prefix review via `--json` with `verdict=pass` and `findingsCount=0`.
- Confirmed `review --json` can be parsed into `ok=true verdict=pass findings=0`.
- Stopped every job created by this lane.

Two immediate human review submissions returned `[followup] Error: follow-up prompt did not register within 5000ms` and marked those review turns failed. Retrying against those same jobs was rejected because the jobs were then failed. Fresh or still-healthy jobs succeeded.

## Skill read

Command:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-review/SKILL.md
```

Exit code: 0

Relevant excerpt:

```text
The user invokes you like:
`$claude-review <jobId-or-prefix>`.
The first token after `$claude-review` is the job id (or a job-id prefix).

Run the dispatcher:
node "<plugin-root>/scripts/cc.mjs" review <jobId-or-prefix> [flags]

Forward only these flags when the user explicitly requests them:
`--all`, `--json`, `--yes`.
```

## Delegates

Initial read-only delegates:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-review-full -- 'Read marketplace/plugins/cc/skills/claude-review/SKILL.md and report the command syntax for the review subcommand in one sentence. Do not edit files.'
```

Exit code: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqa35f4r_e9b20355
Status:         running
Name:           v032deep-review-full
```

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-review-prefix -- 'Read marketplace/plugins/cc/skills/claude-review/SKILL.md and report whether review accepts a freeform prompt or a job id/prefix in one sentence. Do not edit files.'
```

Exit code: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqa35f4r_2c7ee59a
Status:         running
Name:           v032deep-review-prefix
```

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-review-json -- 'Read marketplace/plugins/cc/skills/claude-review/SKILL.md and report the allowed flags for review in one sentence. Do not edit files.'
```

Exit code: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqa35f4r_37cfb128
Status:         running
Name:           v032deep-review-json
```

Replacement delegates for prefix retries:

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-review-prefix2 -- 'Read marketplace/plugins/cc/skills/claude-review/SKILL.md and report the review command target parameter in one sentence. Do not edit files.'
```

Exit code: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqa39h9c_0d533cad
Status:         running
Name:           v032deep-review-prefix2
```

```sh
node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name v032deep-review-prefix3 -- 'Read marketplace/plugins/cc/skills/claude-review/SKILL.md and state the dispatcher command form for review in one sentence. Do not edit files.'
```

Exit code: 0

Excerpt:

```text
Claude job started
Job ID:         job_mqa3aljn_61d643ea
Status:         running
Name:           v032deep-review-prefix3
```

## Polling and completion

The first explicit delayed poll used status:

```sh
sleep 6; node marketplace/plugins/cc/scripts/cc.mjs status --json
```

Exit code: -1

Excerpt:

```text
<no stdout>
```

The status command did not produce output before the tool returned `code -1`, so direct result checks were used for the known job IDs.

Direct result checks:

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35f4r_e9b20355 --json
```

Exit code: 0

Excerpt:

```text
"status": "awaiting_followup"
"resultText": "The review subcommand is invoked as `node \"<plugin-root>/scripts/cc.mjs\" review <jobId-or-prefix> [flags]`, forwarding only `--all`, `--json`, or `--yes` when the user explicitly requests them."
```

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35f4r_2c7ee59a --json
```

Exit code: 0

Excerpt:

```text
"status": "awaiting_followup"
"resultText": "`claude-review` accepts a **job id (or job-id prefix)** -- not a freeform prompt; it sends a structured review turn to an existing Claude background job and asks for the id if none is given (SKILL.md:9-12)."
```

```sh
node marketplace/plugins/cc/scripts/cc.mjs result job_mqa35f4r_37cfb128 --json
```

Exit code: 0

Excerpt:

```text
"status": "awaiting_followup"
"resultText": "The `claude-review` skill forwards only `--all`, `--json`, and `--yes` (and only when the user explicitly requests them); `--allow-edit`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, and `--name` are explicitly not applicable."
```

Replacement jobs used explicit delayed result polls:

```sh
sleep 6; node marketplace/plugins/cc/scripts/cc.mjs result job_mqa39h9c_0d533cad --json
```

Exit code: 0

Excerpt:

```text
"status": "awaiting_followup"
"resultText": "The review command's target parameter is `<jobId-or-prefix>` -- the first token after `$claude-review`, a Claude background job id (or job-id prefix), which is passed to the dispatcher as `node \"<plugin-root>/scripts/cc.mjs\" review <jobId-or-prefix> [flags]`."
```

```sh
sleep 6; node marketplace/plugins/cc/scripts/cc.mjs result job_mqa3aljn_61d643ea --json
```

Exit code: 0

Excerpt:

```text
"status": "awaiting_followup"
"resultText": "The dispatcher command form for review is `node \"<plugin-root>/scripts/cc.mjs\" review <jobId-or-prefix> [flags]`, where `<plugin-root>` is two directories above the SKILL.md and the only forwardable flags are `--all`, `--json`, and `--yes` (only when explicitly requested)."
```

## Review by full id

Initial full-id human review attempt:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_e9b20355 --yes
```

Exit code: 1

Excerpt:

```text
[followup] Error: follow-up prompt did not register within 5000ms
```

Retrying the same failed job:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_e9b20355 --yes
```

Exit code: 1

Excerpt:

```text
[review] Error: $claude-review is not applicable to failed jobs; use $claude-adversarial-review for a fresh-session review of the prior output.
```

Successful full-id human review on a healthy delegate:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_37cfb128 --yes
```

Exit code: 0

PASS/no findings evidence:

```text
Review verdict: PASS
Job ID:  job_mqa35f4r_37cfb128
Turn:    2 (completed)

No findings.
```

## Review by unique job-id prefix

Initial prefix human review attempt:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_2c7 --yes
```

Exit code: 1

Excerpt:

```text
[followup] Error: follow-up prompt did not register within 5000ms
```

Second prefix human review attempt:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa39h9c_0d5 --yes
```

Exit code: 1

Excerpt:

```text
[followup] Error: follow-up prompt did not register within 5000ms
```

Successful unique-prefix review using `--json` after an extra readiness pause:

```sh
sleep 10; node marketplace/plugins/cc/scripts/cc.mjs review job_mqa3aljn_61d --json --yes
```

Exit code: 0

Excerpt:

```json
{
  "ok": true,
  "review": {
    "verdict": "pass",
    "findingsCount": 0,
    "findings": []
  },
  "job": {
    "jobId": "job_mqa3aljn_61d643ea",
    "status": "awaiting_followup"
  },
  "turn": {
    "index": 1,
    "status": "completed"
  }
}
```

## review --json and parse

Raw JSON review command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs review job_mqa35f4r_37c --json --yes
```

Exit code: 0

Excerpt:

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
    "jobId": "job_mqa35f4r_37cfb128",
    "status": "awaiting_followup"
  },
  "turn": {
    "index": 1,
    "status": "completed"
  }
}
```

Parser command:

```sh
set -o pipefail; node marketplace/plugins/cc/scripts/cc.mjs review job_mqa3aljn_61d --json --yes | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const o = JSON.parse(s); console.log(`parsed ok=${o.ok} verdict=${o.review.verdict} findings=${o.review.findingsCount} job=${o.job.jobId} turn=${o.turn.index}:${o.turn.status}`); process.exit(o.ok && o.review.verdict === "pass" && o.review.findingsCount === 0 ? 0 : 1); });'
```

Exit code: 0

Parsed evidence:

```text
parsed ok=true verdict=pass findings=0 job=job_mqa3aljn_61d643ea turn=2:completed
```

## Cleanup

Stop commands:

```sh
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa35f4r_e9b20355 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa35f4r_2c7ee59a --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa35f4r_37cfb128 --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa39h9c_0d533cad --json
node marketplace/plugins/cc/scripts/cc.mjs stop job_mqa3aljn_61d643ea --json
```

Exit codes: all 0

Cleanup excerpts:

```text
job_mqa35f4r_e9b20355 status: stopped
job_mqa35f4r_2c7ee59a status: stopped
job_mqa35f4r_37cfb128 status: stopped
job_mqa39h9c_0d533cad status: stopped
job_mqa3aljn_61d643ea status: stopped
```

## Final matrix

| Variation | Evidence | Result |
| --- | --- | --- |
| Review by full id | `node ... review job_mqa35f4r_37cfb128 --yes` rendered `Review verdict: PASS` and `No findings.` | PASS |
| Review by unique job-id prefix | `sleep 10; node ... review job_mqa3aljn_61d --json --yes` returned job `job_mqa3aljn_61d643ea`, `verdict=pass`, `findingsCount=0` | PASS |
| Review `--json` and parse | parser command exited 0 with `parsed ok=true verdict=pass findings=0` | PASS |
| 0-findings human text | full-id human review rendered `Review verdict: PASS` and `No findings.` | PASS |
| Cleanup | all five lane-created jobs stopped with exit code 0 | PASS |
