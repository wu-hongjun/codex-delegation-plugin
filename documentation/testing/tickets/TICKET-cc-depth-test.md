# TICKET: CC plugin — comprehensive depth test (living)

**Type**: recurring QA ticket · **Owner**: maintainer · **Executor**: Codex
**Current target**: `cc@cc-plugin-codex-local` **v0.3.3**
**Status**: OPEN — awaiting next run

---

## How to run (the short prompt to give Codex)

> Execute this ticket: `documentation/testing/tickets/TICKET-cc-depth-test.md`.
> Run the full protocol below against the currently-installed `cc` plugin, spawn
> subagents to parallelize, then **record your results in THIS SAME FILE** by adding a
> new dated entry at the TOP of the "Results Log" section (do not delete prior entries).
> Do not commit. Working dir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`.

That's the whole prompt. Everything Codex needs is in this file; results accumulate here
so no context is lost between runs.

---

## 0. Pre-flight

- Confirm version: `codex plugin list | grep cc@` should show the **Current target** above.
  If it's stale, the maintainer must refresh the install (`codex plugin remove cc` →
  `codex plugin marketplace add "$(pwd)/marketplace"` → `codex plugin add cc@cc-plugin-codex-local`).
- Run `$claude-setup` first. If aggregate is `fail`, STOP and report. A `warn` whose only
  caveat is `claude-bg-flag` (not advertised in `claude --help`) is acceptable; all other
  required gates must be `ok`.
- Read each skill's contract before testing it: `marketplace/plugins/cc/skills/<name>/SKILL.md`.

## 1. Spawn subagents — parallelize the test

Spawn one subagent PER command group and run groups concurrently; aggregate into the
results entry. The plugin's headline advantage is Claude Code's multi-subagent fan-out, so
the harness should mirror that. Inside workflow/batch/deep-research/goal, also confirm the
DELEGATED session fans out into subagents.

**THROTTLE status polling**: many concurrent `$claude-status --all --json` calls (each
reconciling 100+ accumulated jobs) can overload the setup probes (spurious
`claude-auth timed out`) and slow scans. Cap concurrent status calls; poll each job at
>=3s intervals. A slow broad `status --all` is a known load characteristic — report timing,
don't call it a functional failure.

## 2. Terminal job states (poll until one of these — never poll forever for `complete`)

`complete, idle, awaiting_followup, failed, stopped, orphaned`. `awaiting_followup` is the
most common terminal state for delegate/workflow/goal/fork/batch.

## 3. The 14 commands — test EACH with >=3 variations

1.  `$claude-setup` — (a) plain; (b) `--json`; (c) rerun (idempotent)
2.  `$claude-delegate` — (a) read-only summarize TODOs; (b) a different analysis prompt;
    (c) 3 rapid parallel NO-name delegates → see **F1**
3.  `$claude-status` — (a) plain; (b) `--all`; (c) `--json`; (d) `<jobId>` → see **F3**;
    (e) bogus id → see **F3**
4.  `$claude-result` — (a) `<jobId>` human; (b) `--json`; (c) on a still-running job
    (graceful "not complete yet")
5.  `$claude-followup` — (a) one followup; (b) second followup same job; (c) `--json`
    (preview may be one turn stale → verify it resolves on poll); (d) followup on a stopped
    job → clean error
6.  `$claude-review` — takes `<jobId-or-prefix>`, NOT a prompt. (a) delegate job;
    (b) workflow job; (c) `--json`; (d) 0-findings renders "Review verdict: PASS / No findings."
7.  `$claude-adversarial-review` — fresh-session 2nd opinion on `<jobId>`. (a) default;
    (b) `--model opus`; (c) `--json`
8.  `$claude-stop` — (a) single `<jobId>`; (b) `--all-awaiting-followup`;
    (c) `--all-awaiting-followup --all`; (d) bare `--all` → MUST be rejected
9.  `$claude-workflow` — dynamic multi-agent. (a) survey; (b) a second prompt; (c) `--json`.
    See **Approval-gate note**.
10. `$claude-goal` — stop-condition. (a) bounded goal; (b) different goal; (c) `--json`.
    There is NO `goal_status` field in status output — do not expect one. Track via status/result.
11. `$claude-fork` — (a) explain-code; (b) a second directive; (c) `--json`.
    (~30k tokens baseline is BY DESIGN.)
12. `$claude-batch` — heaviest. (a) small bounded batch; (b) `--json`; (c) start then
    `$claude-stop` mid-run → clean termination + recoverable partial output
13. `$claude-deep-research` — (a) one question; (b) a second; (c) `--json`. See **Approval-gate note**.
14. `$claude-workflows` — (a) plain list; (b) drill-in by the 8-char SESSION shortId in
    column 1; (c) drill-in by full jobId; (d) `--all`; (e) `--json`; (f) bogus id → clean error

## 4. Regression targets — each gets an explicit PASS/FAIL verdict

> Maintainer updates this section per release; the rest of the ticket is stable.

### v0.3.3 PRIMARY — F2b: reused `--name` must be FULLY ISOLATED (zero contamination)
Through v0.3.2 this was a High bug (the first job returned the second's output). v0.3.3
appends entropy to every session name. Test:
```sh
$claude-delegate --yes --name dup-key-test -- "reply with exactly DUP-ONE"
$claude-delegate --yes --name dup-key-test -- "reply with exactly DUP-TWO"
```
For EACH job: distinct Job ID / `sessionId` / `pid`; stored `claude.sessionName` is
`dup-key-test-<random>` (suffixed, and DIFFERENT between the two), not bare `dup-key-test`;
`$claude-result <job1>` returns DUP-ONE and `<job2>` returns DUP-TWO (neither returns the
other's marker). Repeat with 3 reused-name jobs (DUP-A/B/C) to stress it. **PASS = full
isolation + correct per-job results.**

### F1 (carry-forward) — rapid parallel NO-name delegates isolated
3+ no-name delegates fired fast, each a unique marker (CLEAN-RAPID-A/B/C): distinct
sessionId/pid, each returns its OWN marker.

### F2 (carry-forward) — ID-shaped `--name` must NOT corrupt shortId
`$claude-delegate --yes --name my-test-session-abc -- "reply CLEAN-NAME"`: the job's
`claude.shortId` is a real 8-char hex (sessionId prefix), not the name. (sessionName will
be `my-test-session-abc-<random>`; shortId stays hex.)

### F3 (carry-forward) — `$claude-status <jobId>` REJECTED (exit 2)
`$claude-status <real-jobId>` and `<bogus-id>` both exit 2 pointing at `cc result <jobId>` /
`cc status --all`. No full-list fallback.

## 5. Approval-gate note (workflow / deep-research / sometimes goal)

On recent Claude Code (2.1.17x) these may stop at a `needs_input` approval gate even with
`--yes`, so post-approval subagent fan-out may not execute unattended. ENVIRONMENTAL, not a
plugin defect. For these: confirm the launch path works, `--json` parses, and the workflow
PLAN / fan-out intent is visible (`$claude-workflows <job> --json` phase records, or
transcript). Mark **partial** with the gate noted; do NOT mark FAIL solely because agents
didn't run unattended. Batch and fork DO fan out unattended — confirm real subagents there
(logs/transcripts: `Running N agents`, sidechain `subagents/*.jsonl`).

## 6. Edge cases (each its own mini-finding)

1. `--allow-edit` on fork/workflow/goal/batch/review/adversarial-review/deep-research →
   exit 2 ("not applicable")
2. Empty / whitespace-only delegate prompt → clean exit-2 rejection
3. Non-TTY: `printf 'x\n' | $claude-delegate --yes` → clean rejection, no job started
4. Workspace isolation: delegate from `/tmp/<somewhere>`; `$claude-status` here must NOT show
   it unless `--all`
5. `--json` across ALL bg-flow skills → valid parseable JSON every time
6. Privacy disclosure: first delegate in a fresh workspace prompts; `--yes` skips; a second
   delegate in the same workspace does NOT re-prompt

## 7. Known not-bugs (do NOT file these)

- Reusing a `--name` starts a FRESH isolated session (it is a label/prefix, not a resume
  key). To continue a job use `$claude-followup <jobId>`. (v0.3.3 behavior.)
- Dynamic /workflow drill-in shows `subagents: []` (agents live in the separate workflow
  runtime); phase records + session metadata still return.
- workflow/goal/batch/deep-research parent stays non-terminal while async orchestration
  runs; output recoverable post-stop. Long-runners by design.
- followup `--json` immediate preview is one turn stale (resolves on poll).
- Fork ~30k token baseline; batch can run many minutes.
- `codex plugin list` shows the plugin version; some package metadata reports `0.0.0`
  (workspace package.json intentionally pinned). Not a bug.
- No `goal_status` field in status output — expected.
- `status --all` slow under heavy concurrent load with many accumulated jobs — known load
  characteristic; report timing only.

## 8. Cleanup (required)

Stop every job you started: `$claude-stop --all-awaiting-followup --all`, then any still
running by id. Verify `$claude-status --all` shows none of your jobs active. Leave clean.

## 9. How to record results

Add a NEW entry at the TOP of the Results Log below (newest first). Do not delete prior
entries. Each entry must contain:
- Env line: `claude --version`, `codex --version`, OS, plugin version under test, date.
- A 14-row pass/fail matrix (one row per command).
- The regression verdicts: **F2b** (the current-release fix) + F1/F2/F3 carry-forward, each
  PASS/FAIL with the evidence (job IDs, sessionIds, the markers each result returned).
- Severity-grouped findings: Blocker / High / Medium / Low (with exact commands + output
  excerpts; full error text on failures).
- Fan-out evidence for the heavyweight skills.
- Cleanup confirmation (final `status --all` active count).
Do NOT commit — the maintainer reviews and commits.

---

# Results Log (newest first — Codex appends here)

<!-- Codex: insert your new run entry directly below this line. Template: -->

<!--
## Run YYYY-MM-DD — vX.Y.Z — <pass|issues found>
**Env**: claude X.Y.Z · codex X.Y.Z · macOS … · plugin vX.Y.Z

### Matrix
| # | command | status | summary |
| ---: | --- | --- | --- |
| 1 | $claude-setup | pass | … |
| … | | | |

### Regression verdicts
- **F2b** (reused --name isolation): PASS/FAIL — evidence …
- F1 (rapid no-name): PASS/FAIL — …
- F2 (ID-shaped --name shortId): PASS/FAIL — …
- F3 (status <jobId> rejection): PASS/FAIL — …

### Findings
- Blocker: …
- High: …
- Medium: …
- Low: …

### Fan-out evidence
- batch: … · fork: … · workflow: … · deep-research: …

### Cleanup
final `status --all` active count: …
-->

_No runs recorded yet._
