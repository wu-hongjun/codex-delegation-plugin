# Agent Review Ergonomics Friction Report

Date: 2026-06-12
Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`
Scope: same-session `review` and fresh-session `adversarial-review`

## Summary

Created one bounded read-only delegate job with sentinel `CC_REVIEW_ERGO_20260612_B7C4D98A`, then exercised same-session review and adversarial-review in human and JSON modes. Also tested a freeform-prompt misuse path for `review`.

All jobs started by this run were stopped and verified by exact ID after cleanup:

| Job | Purpose | Claude short ID | Final verified status |
| --- | --- | --- | --- |
| `job_mqay6joa_7d042ccc` | source delegate + same-session reviews | `24ce1af9` | `stopped` |
| `job_mqay922m_be7398e8` | human adversarial review | `614dfa50` | `stopped` |
| `job_mqayb4g6_6d4c9540` | JSON adversarial review | `3faf6566` | `stopped` |

No source files were edited and no commit was made.

## Commands And Outcomes

### Delegate

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs delegate --name plan0022-review-ergo-b7c4d98a -- "Read-only bounded task for plugin ergonomics testing. Do not edit files. Do not run long commands. Do not use network. Inspect only package.json and README.md if needed. In 6 bullet lines or fewer, summarize what this repository appears to provide. Include exactly this line: SENTINEL: CC_REVIEW_ERGO_20260612_B7C4D98A. Then stop."
```

Output summary:

- Exit code 0.
- Started `job_mqay6joa_7d042ccc`.
- Initial dispatcher status: `running`.
- Claude session short ID: `24ce1af9`.
- Session name: `plan0022-review-ergo-b7c4d98a-1763dcc8`.
- Later result metadata showed turn 0 completed at `2026-06-12T13:14:01.245Z`.
- Delegate output included the sentinel and a concise repo summary.

### Same-Session Review: JSON / Timing Probe

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_mqay6joa_7d042ccc --json
```

Output summary:

- Exit code 0.
- JSON root had `"ok": true`.
- Review verdict: `pass_with_findings`.
- Findings count: 1 nit.
- Reported job status in response: `running`.
- Reported reviewed turn: `index: 1`, `status: completed`.

Friction: I ran this immediately after delegate start as a "review while still running" misuse/timing probe. It succeeded because a reviewable turn was already completed, even though the response still reported `job.status: "running"`. That distinction is subtle: the command does not explain that review readiness is based on latest completed turn, not the aggregate job status.

### Result After First Review

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs result job_mqay6joa_7d042ccc --json
```

Output summary:

- Exit code 0.
- Job status: `awaiting_followup`.
- Turn 0: source delegate, `completed`.
- Turn 1: same-session review, `completed`.
- Top-level `resultText` was the review result, not the original delegate result.

Friction: once same-session review ran, `result` presented the latest review as the job result. The original delegate answer was still visible only in earlier turn metadata and truncated previews. This makes it easy to lose the source answer unless the user explicitly captured it before reviewing.

### Status JSON Helper Failure

Command:

```sh
node -e 'const {execFileSync}=require("node:child_process"); const out=execFileSync("node", ["/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs", "status", "--json"], {encoding:"utf8"}); const data=JSON.parse(out); console.log(JSON.stringify(data.jobs.filter(j=>j.jobId==="job_mqay6joa_7d042ccc"), null, 2));'
```

Output summary:

- Exit code 1.
- Node failed with `spawnSync node ENOBUFS`.

Friction: `status --json` is very large in this workspace because historical job records include full driver health snapshots and other verbose metadata. A normal Node `execFileSync` buffer overflowed before I could filter one job. Retrying with `maxBuffer: 64*1024*1024` worked.

### Same-Session Review: Human

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_mqay6joa_7d042ccc
```

Output summary:

- Exit code 0.
- `Review verdict: PASS`.
- Job ID: `job_mqay6joa_7d042ccc`.
- Turn: `2 (completed)`.
- No findings.

Ergonomics: the human output is compact and easy to scan. It is much easier for a Codex user than the JSON blob when they only need a verdict.

### Misuse Path: Freeform Review Prompt

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs review job_mqay6joa_7d042ccc -- "please focus on whether the sentinel was included"
```

Output:

```text
[review] Error: review does not accept a freeform prompt; the dispatcher constructs the review prompt.
```

Outcome:

- Exit code 2.
- No job was started.

Ergonomics: this is a good failure mode. The wording is direct and explains why the prompt is rejected.

### Adversarial Review: Human

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs adversarial-review job_mqay6joa_7d042ccc
```

Output summary:

- Exit code 0.
- Took roughly 73 seconds before producing any stdout.
- Created `job_mqay922m_be7398e8`.
- Human verdict: `PASS WITH FINDINGS`.
- Findings: 3 total, 1 medium and 2 low.
- Turn: `0 (awaiting_followup)`.
- Result metadata later reported `reviewOf: { jobId: "job_mqay6joa_7d042ccc", turnIndex: 0 }`.

Friction:

- The command is silent while it runs. Until completion, the user has no fresh review job ID to inspect or stop.
- The findings read as if the adversarial reviewer evaluated the same-session review verdict, not the original delegate output. Example: it complained that "the verdict's core compliance claims" were not independently verifiable and that the submitted output was "a meta-review verdict ABOUT a prior turn."
- This conflicts with the metadata saying `reviewOf.turnIndex: 0`, where turn 0 was the delegate output.

### Adversarial Review: JSON

Command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs adversarial-review job_mqay6joa_7d042ccc --json
```

Output summary:

- Exit code 0.
- Took roughly 90 seconds before producing any stdout.
- JSON root had `"ok": true`.
- Created `job_mqayb4g6_6d4c9540`.
- Review verdict: `pass_with_findings`.
- Findings count: 2 total, 1 low and 1 nit.
- Job status: `awaiting_followup`.
- JSON included `job.reviewOf.jobId: "job_mqay6joa_7d042ccc"` and `job.reviewOf.turnIndex: 0`.

JSON ergonomics:

- The JSON review summary is easy to consume once returned: counts are explicit and findings are structured with severity, description, recommendation, file, and line.
- It still has a long silent period before returning.
- The same targeting ambiguity appeared: findings discussed "the verdict" and a "turn 0 output" rather than directly reviewing the original delegate answer.

### Status Snapshot Before Cleanup

Command:

```sh
node -e 'const {execFileSync}=require("node:child_process"); const out=execFileSync("node", ["/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs", "status", "--json"], {encoding:"utf8", maxBuffer: 64*1024*1024}); const data=JSON.parse(out); const ids=new Set(["job_mqay6joa_7d042ccc","job_mqay922m_be7398e8","job_mqayb4g6_6d4c9540"]); console.log(JSON.stringify(data.jobs.filter(j=>ids.has(j.jobId)).map(j=>({jobId:j.jobId,status:j.status,shortId:j.claude?.shortId,sessionName:j.claude?.sessionName,turns:j.turns?.map((t,i)=>({i,status:t.status,summary:t.prompt?.summary,resultPreview:t.result?.finalMessagePreview}))})), null, 2));'
```

Output summary:

- `job_mqay6joa_7d042ccc`: `awaiting_followup`, turns 0, 1, and 2 completed.
- `job_mqay922m_be7398e8`: `awaiting_followup`, turn 0 completed.
- `job_mqayb4g6_6d4c9540`: `awaiting_followup`, turn 0 completed.

## Cleanup

Commands:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay6joa_7d042ccc --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay922m_be7398e8 --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqayb4g6_6d4c9540 --json
```

Initial stop output summary:

- All three stop commands exited 0 and returned each job with `status: "stopped"`.

First verification command:

```sh
node -e 'const {execFileSync}=require("node:child_process"); const out=execFileSync("node", ["/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs", "status", "--json"], {encoding:"utf8", maxBuffer: 64*1024*1024}); const data=JSON.parse(out); const ids=new Set(["job_mqay6joa_7d042ccc","job_mqay922m_be7398e8","job_mqayb4g6_6d4c9540"]); console.log(JSON.stringify(data.jobs.filter(j=>ids.has(j.jobId)).map(j=>({jobId:j.jobId,status:j.status,shortId:j.claude?.shortId,sessionName:j.claude?.sessionName,reviewOf:j.reviewOf||null,turnStatuses:j.turns?.map((t,i)=>({i,status:t.status}))})), null, 2));'
```

First verification output summary:

- `job_mqay6joa_7d042ccc`: `orphaned`.
- `job_mqay922m_be7398e8`: `orphaned`.
- `job_mqayb4g6_6d4c9540`: `stopped`.

Retry commands for discrepant IDs:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay6joa_7d042ccc --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay922m_be7398e8 --json
```

Final verification command:

```sh
node -e 'const {execFileSync}=require("node:child_process"); const out=execFileSync("node", ["/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs", "status", "--json"], {encoding:"utf8", maxBuffer: 64*1024*1024}); const data=JSON.parse(out); const ids=new Set(["job_mqay6joa_7d042ccc","job_mqay922m_be7398e8","job_mqayb4g6_6d4c9540"]); console.log(JSON.stringify(data.jobs.filter(j=>ids.has(j.jobId)).map(j=>({jobId:j.jobId,status:j.status,shortId:j.claude?.shortId,sessionName:j.claude?.sessionName,reviewOf:j.reviewOf||null})), null, 2));'
```

Final verification output:

```json
[
  {
    "jobId": "job_mqay6joa_7d042ccc",
    "status": "stopped",
    "shortId": "24ce1af9",
    "sessionName": "plan0022-review-ergo-b7c4d98a-1763dcc8",
    "reviewOf": null
  },
  {
    "jobId": "job_mqay922m_be7398e8",
    "status": "stopped",
    "shortId": "614dfa50",
    "sessionName": "codex:cc-plugin-codex:review-job_mqay6joa-71e585c2",
    "reviewOf": {
      "jobId": "job_mqay6joa_7d042ccc",
      "turnIndex": 0
    }
  },
  {
    "jobId": "job_mqayb4g6_6d4c9540",
    "status": "stopped",
    "shortId": "3faf6566",
    "sessionName": "codex:cc-plugin-codex:review-job_mqay6joa-8850c290",
    "reviewOf": {
      "jobId": "job_mqay6joa_7d042ccc",
      "turnIndex": 0
    }
  }
]
```

Cleanup friction: stopping awaiting-followup review sessions is not quite fire-and-forget. Two jobs briefly reconciled to `orphaned` after `stop --json` had already returned `stopped`; a second stop pass made final status settle to `stopped`.

## Friction Inventory

1. Review timing/status rules are not obvious. `review --json` succeeded while the response still reported job status `running`; the actual gate is the completed source turn.
2. Same-session review overwrites the top-level job result, so `result <job>` after review returns the review, not the original delegate answer. The original answer becomes harder to inspect.
3. Adversarial review appears vulnerable to stale/latest-result confusion after same-session review. Both adversarial variants reported `reviewOf.turnIndex: 0`, but their findings read like they evaluated the prior review verdict.
4. Adversarial review has no early progress output or spawned job ID. If it hangs, the user has to discover the spawned job via status rather than using a printed ID.
5. `status --json` is too large for common subprocess defaults in a busy workspace. Consumers need a large buffer or a narrower status query.
6. Freeform review prompt misuse is handled well: fast exit, clear message, no leaked job.
7. Cleanup can require a retry when stop output and later status reconciliation briefly disagree.
