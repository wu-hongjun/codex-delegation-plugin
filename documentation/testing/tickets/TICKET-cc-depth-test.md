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

### F2b — delegate result cross-contamination — UPSTREAM, non-deterministic (NOT a plugin blocker)
**Reclassified 2026-06-12.** Through v0.3.2/v0.3.3 this was misdiagnosed as a `--name`
collision and "fixed" by uniquifying session names; it is actually a **rare, non-deterministic
cross at the Claude Code / model layer** (a correctly-isolated, uniquely-named, distinct-pid
session can still have its model emit a concurrent sibling's marker). A 34-session controlled
repro reproduced it 0 times. The cc-plugin builds isolated sessions correctly and cannot fix
this by naming. See `documentation/plan/0021-…/readme.md` correction + memory
`project_f2b_upstream_nondeterministic`.

Still worth checking each run (it's how we sample the upstream symptom). Test:
```sh
$claude-delegate --yes --name dup-key-test -- "reply with exactly DUP-ONE"
$claude-delegate --yes --name dup-key-test -- "reply with exactly DUP-TWO"
```
Confirm session identity is correct (distinct Job ID / `sessionId` / `pid`; `claude.sessionName`
is `dup-key-test-<random>` and differs between jobs). Then check `$claude-result <job1>` returns
DUP-ONE and `<job2>` returns DUP-TWO. **If a cross occurs, record it as an UPSTREAM symptom with
the transcript evidence (`~/.claude/projects/<slug>/<sessionId>.jsonl` — does the assistant turn
emit the wrong marker for a correctly-logged prompt?), NOT as a plugin FAIL or release blocker.**

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

## Run 2026-06-12 - v0.3.3 - issues found
**Env**: claude 2.1.174 (Claude Code) · codex-cli 0.137.0 · macOS 26.5.1 (25F80) arm64 · plugin `cc@cc-plugin-codex-local` 0.3.3

**Artifact bundle**: `documentation/testing/artifacts/v033-ticket-20260612/` contains the per-lane command logs and cleanup evidence. The harness used Codex subagents for command groups 01-15 and throttled broad status polling.

### Matrix
| # | command | status | summary |
| ---: | --- | --- | --- |
| 1 | `$claude-setup` | pass | plain, `--json`, and rerun all exited 0; aggregate stayed `warn` only for the accepted `claude-bg-flag` caveat. |
| 2 | `$claude-delegate` | fail | ordinary read-only delegates and F1 rapid no-name delegates passed, but the v0.3.3 primary reused-`--name` isolation test failed result isolation. |
| 3 | `$claude-status` | pass | plain, `--all`, `--json`, real-id rejection, and bogus-id rejection passed; `status --all` took 96.37s in the large historical job set. |
| 4 | `$claude-result` | pass | human result, parseable `--json`, and still-running error path behaved correctly. |
| 5 | `$claude-followup` | fail | stopped-job errors were clean, but positive follow-up paths were blocked because completed Claude sessions remained `running` in cc job state. |
| 6 | `$claude-review` | pass | delegate review, `--json`, and 0-finding PASS rendering worked; workflow review correctly rejected a gated workflow as not reviewable. |
| 7 | `$claude-adversarial-review` | pass | default model, `--model opus`, and `--json` all launched and produced parseable PASS/no-finding reviews. |
| 8 | `$claude-stop` | pass | single stop, workspace-scoped `--all-awaiting-followup`, global `--all-awaiting-followup --all`, and bare `--all` rejection passed. |
| 9 | `$claude-workflow` | partial | launches and `--json` parsed; all workflow jobs stopped at the expected Claude Code approval gate before post-approval subagents ran. |
| 10 | `$claude-goal` | pass | bounded, different bounded, and `--json` goals completed with expected markers; no `goal_status` field expected. |
| 11 | `$claude-fork` | pass | explain-code, second directive, and `--json` passed; transcripts showed real fork sidechain agent execution. |
| 12 | `$claude-batch` | pass | small batch, `--json`, and stop-mid-run passed with recoverable output; logs showed real parallel Explore agents. |
| 13 | `$claude-deep-research` | partial | two questions and `--json` launch parsed; all hit the expected dynamic workflow approval gate before WebSearch/fetch/verify agents ran. |
| 14 | `$claude-workflows` | pass | plain list, shortId drill-in, full jobId drill-in, `--all`, `--json`, and bogus-id error all passed. |

### Regression Verdicts
- **F2b** (reused `--name` isolation): **FAIL**. Commands:
  `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-ONE"` and
  `node marketplace/plugins/cc/scripts/cc.mjs delegate --yes --name dup-key-test -- "reply DUP-TWO"`.
  The session names were suffixed and distinct, but result isolation failed:
  `job_mqac2i4h_4d3e2965` used session `dd3a7dec-3ccf-497a-b910-6246365a8598`, pid 940, sessionName `dup-key-test-ff742519`, prompt `DUP-ONE`, result `DUP-TWO`.
  `job_mqac2i9f_4e34a487` used session `39b5f2e3-2377-43e5-ad92-6fdb65ffdee1`, pid 3541, sessionName `dup-key-test-4732a5e5`, prompt `DUP-TWO`, result `DUP-TWO`.
  The 3-job repeat used distinct sessions, but `job_mqac2wb3_1acbffa1` (`DUP-A`) did not return exactly `DUP-A`; `DUP-B` and `DUP-C` did.
- **F1** (rapid no-name delegates): **PASS**. `job_mqac1g38_ad2cb29d` session `40ddc8e6-0269-482d-9316-72dc360a0ee4` returned `CLEAN-RAPID-A`; `job_mqac1g94_740b3e2c` session `af0b1668-dfeb-44b9-b2ee-3d3ca2c82dd3` returned `CLEAN-RAPID-B`; `job_mqac1gj3_0d6d406e` session `436934db-60a9-4991-827d-8b236a0cd927` returned `CLEAN-RAPID-C`. PIDs were distinct.
- **F2** (ID-shaped `--name` shortId): **PASS**. `job_mqac23g4_03aeff0c` had shortId `013c47c4`, sessionId `013c47c4-8461-49e2-9436-ac5eecea4fe2`, sessionName `my-test-session-abc-0e8f0c01`, and result `CLEAN-NAME`.
- **F3** (`$claude-status <jobId>` rejection): **PASS**. `status job_mqac5qn4_49ad88e7` exited 2 with guidance to use `cc result <jobId>` / `cc status --all`; `status job_lane03_bogus_does_not_exist` also exited 2 and did not dump the full list.

### Edge-Case Verdicts
- `--allow-edit` on fork/workflow/goal/batch/review/adversarial-review/deep-research: **PARTIAL**. All tested commands exited 2 and included `not applicable`, but not the exact requested phrase `not applicable to this subcommand`.
- Empty and whitespace-only delegate prompt: **PASS**. Both exited 2 with `[delegate] Error: prompt is required: cc delegate -- "<prompt>"`; no new jobs.
- Non-TTY `printf 'x\n' | ... delegate --yes`: **PASS**. Exited 2 with the same prompt-required error and no new job.
- Workspace isolation: **PASS**. Temp job `job_mqad1l5k_3b475de6` was absent from repo-local `status --json`, present under `status --all --json`, and stopped with `stop <id> --all --json`.
- `--json` across bg-flow skills: **PASS**. Delegate/status/result/followup/review/adversarial-review/stop/workflow/goal/fork/batch/deep-research/workflows all emitted parseable JSON on success or error paths.
- Privacy disclosure: **PASS**. Fresh temp workspace first delegate without `--yes` exited 1 with `Privacy acknowledgement required`; `--yes` proceeded; second delegate in the same workspace without `--yes` proceeded.

### Findings
- Blocker: none.
- High: F2b primary regression target still fails result isolation for reused `--name`. The first duplicate-name job returned the second job's marker despite distinct job IDs, session IDs, PIDs, and suffixed `sessionName`s.
- Medium: `$claude-followup` positive paths are blocked by state mismatch. Fixture `job_mqacot6s_1cc0586d` produced `RETRY_INITIAL_READY`; `claude agents --json` showed session `acc0cfbd-983d-436a-b755-1c27cc930100` as `idle` / `blocked`, but `cc status --json` still reported `running` after about 52s. Command `node marketplace/plugins/cc/scripts/cc.mjs followup job_mqacot6s_1cc0586d --yes -- "Reply with exactly RETRY_FOLLOWUP_ONE_OK."` returned `[followup] Error: Job job_mqacot6s_1cc0586d is running; wait for $claude-status to show awaiting_followup before sending a follow-up.`
- Medium: broad status reconciliation is very slow under the accumulated 200+ job history. Examples: lane 03 `status --all` took 96.37s; follow-up retry `status --json` took about 52s and still did not reconcile the completed result into an `awaiting_followup` state; several lane probes had to be bounded to avoid overload.
- Medium: `$claude-review` attach/registration was timing-sensitive. Review submissions failed with `follow-up prompt did not register within 5000ms` and again at 20000ms, then passed with `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS=15000 CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS=60000`.
- Low: `--allow-edit` invalid-flag errors are functionally correct but copy does not match the exact ticket phrase `not applicable to this subcommand`.
- Low: workflow and deep-research could only be marked partial because Claude Code 2.1.174 stopped at the documented dynamic workflow approval gate under `--yes`.

### Fan-Out Evidence
- fork: `job_mqacbdob_e6d3a8f0`, `job_mqacbnpf_ba1546d8`, and `job_mqacc16t_e80b32ff` produced sidechain transcript files with `isSidechain:true`, `attributionAgent:"fork"`, and about 31k-58k subagent tokens.
- batch: `job_mqacd6va_2fd5e94f` logs included `Running 2 Explore agents...`; sidechain files recorded two Explore agents for package/plugin metadata and CC skill inspection. Stop-mid-run job `job_mqacg7bj_7e420a55` stopped cleanly with partial output recoverable.
- workflow: `job_mqaccixe_bb7bf22a`, `job_mqacct39_3f6b90fb`, and `job_mqacd5nz_fad99266` produced phase records and workflow session metadata, but hit `needs_input` approval before post-approval agents.
- deep-research: `job_mqacezp5_edf17125` and companion probes logged the deep-research fan-out plan (parallel search/fetch/verify/synthesis shape), but all stopped at `needs_input` before WebSearch/fetch/verify agents ran.
- goal: bounded goal jobs completed their markers; no `goal_status` field is expected in v0.3.3 status output, and no independent post-approval fan-out evidence was observed.

### Cleanup
Required cleanup command `node marketplace/plugins/cc/scripts/cc.mjs stop --all-awaiting-followup --all --json` exited 0. Final verification used `status --all --json` over artifact job IDs plus the coordinator's temp isolation job: `artifactJobIds=62`, `matched=58`, `byStatus={ "orphaned": 3, "stopped": 55 }`, `activeCount=0`.

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
