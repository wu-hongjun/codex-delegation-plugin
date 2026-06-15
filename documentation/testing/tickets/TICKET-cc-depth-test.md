# TICKET: CC plugin — comprehensive depth test (living)

**Type**: recurring QA ticket · **Owner**: maintainer · **Executor**: Codex
**Current target**: `cc@cc-plugin-codex-local` **v0.3.4**
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
Use `status --job <id> --json --compact` for exact jobs and `status --limit <n>` for
bounded broad sweeps when the job store has accumulated many historical records.

For unattended local QA lanes that intentionally inspect the repo with shell commands, pass
`--permission-mode bypassPermissions` explicitly on the spawned delegate/batch/workflow command.
Do not make that the default: the plugin's normal path preserves Claude Code's permission system.
Without the explicit flag, read-only shell-shaped probes can correctly stop at `needs_input`.

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
  key). To continue a job use `$claude-followup <jobId>`. (v0.3.4 behavior.)
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

## Follow-up 2026-06-15 - v0.3.4 supplemental multi-subagent friction round
**Env**: claude 2.1.177 (Claude Code) · codex-cli 0.139.0 · macOS 26.5.1 (25F80) arm64 · plugin `cc@cc-plugin-codex-local` 0.3.4 installed from local marketplace cache

**Artifact bundle**: `documentation/testing/artifacts/v034-friction-20260615/`

This was a bounded supplemental round after the v0.3.4 release and local install.
Five Claude Code jobs were launched through the installed 0.3.4 dispatcher and then
stopped by exact job ID. The round focused on real Codex→Claude friction rather than
rerunning the full 14-command ticket.

### Coverage Matrix
| area | verdict | evidence |
| --- | --- | --- |
| install/version | PASS | `codex plugin list` showed `cc@cc-plugin-codex-local installed, enabled 0.3.4`; installed dispatcher responses reported `codex.pluginVersion:"0.3.4"`. |
| parallel delegate identity | PASS | Five jobs launched in parallel; three shared the same millisecond job prefix `job_mqeiay1j_*` but had distinct job IDs and Claude sessions. |
| followup | PASS | `job_mqeiay1j_6ef5a894` returned `V034_FOLLOWUP_READY`, accepted a follow-up, and later returned `V034_FOLLOWUP_DONE` with separate turn result files. |
| review | PASS with friction | `job_mqeiay7c_00579ec1` same-session review returned `pass_with_findings`; the review turn had a result quickly, but `cc result` rejected while the job row still said `running` until a later reconcile settled it to `awaiting_followup`. |
| status by id | PASS | `status --job <id> --json --compact` gave focused compact rows and avoided the broad-list output explosion. |
| status --all / broad status | PASS with perf/UX note | Broad compact status remained very large in the historical job store; focused `status --job` is the practical path for automation. |
| batch/read-only fan-out | PARTIAL | `job_mqeiay1j_8b73844c` produced useful mapping output, then hit a Claude Code shell permission prompt and stopped at `needs_input`; this is expected unless the operator explicitly chooses `--permission-mode bypassPermissions`. |
| logs inspection | LOW friction | `claude logs <shortId>` was usable but noisy with ANSI/TUI control sequences around permission prompts. |
| cleanup | PASS | All five exact job IDs were stopped and final `status --job` checks showed `stopped`. |

### Findings
**Blocker**: none.

**High**: none.

**Medium**:
- A completed latest review/follow-up turn can have a per-turn result while the job row
  still reports `running`; during that window, `cc result` rejects even though the latest
  immutable result is available.
- Broad `status --all --json --compact` remains operationally noisy in a workspace with many
  historical jobs. This is no longer the Plan 0022 terminal-reconcile bug; Plan 0023 adds
  `status --limit <n>` so automation can bound the broad-list surface before reconcile.

**Low**:
- Read-only shell-shaped subagent tests can stop at Claude Code permission prompts unless the
  operator explicitly opts into `--permission-mode bypassPermissions` for that unattended run.
- Raw `claude logs` output is hard to skim when the session is parked at a TUI permission prompt.

### Cleanup
- Stopped: `job_mqeiayev_46cc8806`, `job_mqeiay1j_e84cc468`,
  `job_mqeiay1j_6ef5a894`, `job_mqeiay7c_00579ec1`, `job_mqeiay1j_8b73844c`.
- Final repo status after the round had no source changes; only the pre-existing nested
  untracked `references/*` repos were visible.

## Follow-up 2026-06-12 - Plan 0022 round-4 heavy installed stress
**Env**: claude 2.1.176 (Claude Code) · codex-cli 0.137.0 · macOS 26.5.1 (25F80) arm64 · plugin `cc@cc-plugin-codex-local` 0.3.3 refreshed from local marketplace cache

**Artifact bundle**: `documentation/testing/artifacts/v033-plan0022-heavy-r4-20260612/`

This was a supplemental heavy stress round against the installed plugin after
the nested `shortId:"claude"` fix. Five Claude Code parent lanes were launched
through the installed dispatcher and then stopped by exact job ID after evidence
collection.

### Round-4 Coverage Matrix
| command / area | verdict | evidence |
| --- | --- | --- |
| setup | PASS | `cc setup --json` returned `ok:true`; aggregate `warn` was only known `claude-bg-flag`; delegate/followup capabilities `ok`. |
| delegate | PASS | Lane A created 12 nested delegates; Lane D created 8 concurrent delegates; Lane E recovery delegate completed with `P22_R4_E_LONG`. |
| status | PASS with perf note | Exact `status --job` stayed fast (~0.6s). Broad `status` / `status --all` averaged ~15-16s with 346-361 records under load. |
| result | PASS limited | Running-job `result` rejected cleanly as "not complete yet"; result files for Lane A/B/D/E were verified from job records. |
| followup | PASS | Lane B B0/B1 each completed T0/T1/T2 with distinct per-turn result files and final T2 markers. |
| review | PASS | Lane B same-session review on B0/B1 returned `verdict: pass`, `findings: []`. |
| adversarial-review | PASS | Fresh review job `job_mqbhp7wf_41454b9b` returned pass and recorded `reviewOf.turnIndex: 2`, targeting latest non-review turn. |
| stop | PASS | 39 exact current-round jobs stopped with `ok:true`; final matching job-store non-stopped set was empty. |
| workflow | PARTIAL | Lane C workflow `job_mqbhkn09_bbdda1d5` launched and was visible as `dynamic_workflow`; useful fan-out remained gated/long-running. |
| goal | not exercised | This was a supplemental heavy stress run, not a full ticket rerun. |
| fork | PASS with caveat | Fork jobs completed, including Lane E `job_mqbhtzq6_c7dafd15`; Lane C confirmed fork cannot nest subagents and runs tracks inline. |
| batch | PASS | Lane E `job_mqbhtuea_e9232704` completed four parallel tasks after relaunch with `--permission-mode bypassPermissions`. |
| deep-research | PARTIAL | Lane C deep-research `job_mqbhlcvm_7669cc6a` launched and was visible as `deep_research`; it stayed in approval/planning gate before useful fan-out. |
| workflows | PASS | `workflows --json --compact` listed Lane C workflow and deep-research sessions with the expected kinds. |

### Regression Verdicts
- **F2b upstream cross-contamination sampling**: PASS sample / no upstream symptom observed. Lane D returned all 8 exact markers `P22_R4_D_00` through `P22_R4_D_07` to their own jobs, including four reused-name sessions.
- **F1 rapid no-name delegates**: PASS. Lane A launched 8 no-name delegates and Lane D launched 4 no-name delegates; all had distinct shortIds/sessionIds and returned their own markers.
- **F2 ID/name shortId safety**: PASS for the nested banned-token variant. Lane A named jobs `claude`, `attach`, `logs`, and `agents`; stored shortIds were real 8-hex values and `logsCommand` used those real IDs, not the names.
- **F3 status positional rejection**: not rerun in this supplemental round; covered by round-3 installed retest immediately below.

### Findings
**Blocker**: none.

**High**: none.

**Medium**:
- Broad `status` remains expensive under load: workspace/global compact status was ~15-16s with 346-361 records. Exact `status --job` was ~0.6s.
- Workflow/deep-research still cannot be treated as fully unattended fan-out in all prompts because Claude Code approval/planning gates can hold the session before useful subagent output.

**Low**:
- Fork is single-session delegation and cannot nest subagents; document this wherever we imply maximum nested fan-out.
- Test-agent scripts can still misclassify `awaiting_followup` as non-terminal. The ticket already says it is terminal; this run revalidated that guidance.
- Read-only bash-shaped work needs explicit `--permission-mode bypassPermissions` for unattended runs; otherwise child sessions can block at `needs_input`.

### Cleanup
- All 39 exact current-round job IDs stopped with `ok:true`.
- Final matching job-store verification: `count=39`, `nonStopped=[]`.
- Final `claude agents --json` filter for `p22-r4`, `p22r4e`, and `laneC-` returned `[]`.

## Follow-up 2026-06-12 - Plan 0022 round-3 installed retest
**Env**: claude 2.1.176 (Claude Code) · codex-cli 0.137.0 · macOS 26.5.1 (25F80) arm64 · plugin `cc@cc-plugin-codex-local` 0.3.3 refreshed from local marketplace cache

**Artifact bundle**: `documentation/testing/artifacts/v033-plan0022-round3-20260612/`

This was a bounded installed-plugin retest after the nested `shortId:"claude"`
fix. The local plugin cache was removed and reinstalled from the current
marketplace bundle before testing. Four Claude Code lanes were launched through
the installed dispatcher, then coordinator checks verified nested job records and
cleanup state.

### Round-3 Matrix
| lane | focus | verdict | evidence |
| --- | --- | --- | --- |
| A | nested `shortId:"claude"` fix | PASS | Nested child `job_mqbh3eb7_f233c81f` stored `shortId:"211378f6"`, matching session prefix `211378f6`, with `logsCommand:"claude logs 211378f6"` and exact marker `P22_R3_NESTED_CHILD_OK`; stop succeeded. |
| B | delegate/result/followup/review/status | PASS core | Child `job_mqbh349v_f9169060` returned `P22_R3_B_INITIAL`, accepted followup, returned `P22_R3_B_FOLLOWUP`, and completed a review turn with `verdict: pass`, `findings: []`. |
| C | F1/F2/F3 and edge cases | PASS | Rapid no-name jobs `job_mqbh6po6_0e09d9c6`, `job_mqbh6pn3_9e2e5bc5`, `job_mqbh6pnn_cdd87995` returned A/B/C markers with distinct session IDs/shortIds; ID-shaped name job `job_mqbh7bw7_e123f0cb` used real shortId `0ba0c261`; status positional and prompt-input errors were clean. |
| D | workflow/fork/batch/deep-research/workflows | PASS launch/classification/cleanup | Workflow `job_mqbh370z_7e628cc7` classified as `dynamic_workflow`; deep-research `job_mqbh3kx9_3a09e3f6` classified as `deep_research`; fork and batch launched/completed bounded read-only prompts; all four D children stopped. |

### Verification
- Installed cache contains the nested-shortId hardening (`NON_ID_TOKENS` in driver dist; `shouldRepairPseudoShortId` in runtime dist).
- `cc setup --json` returned `ok:true`; aggregate `warn` was only the known `claude-bg-flag` help omission; delegate/followup capabilities were `ok`.
- `npm run build` passed.
- Focused installed-fix suite passed: 351 tests, 0 failed.
- `node tools/package-marketplace.mjs --check` passed.
- `git diff --check` passed.

### Cleanup
- Every round-3 job record listed in the artifact ended at `stopped`.
- `claude stop a9871bf1` returned success and the original Lane D PID was absent from `ps`.
- Low cleanup caveat: `claude agents --json` still showed a PID-less stale row for Lane D parent `a9871bf1` with `state:"working"` after successful stops. The cc job record is stopped; this looks like a Claude agents listing stale-state issue, not a cc-plugin job-store issue.

### Findings
**Blocker**: none.
**High**: none.
**Medium**: none.
**Low**: PID-less stale `claude agents` row for already-stopped Lane D parent.

## Follow-up 2026-06-12 - Plan 0022 round-2 installed retest
**Env**: claude 2.1.175 (Claude Code) · codex-cli 0.137.0 · plugin `cc@cc-plugin-codex-local` 0.3.3 refreshed from local marketplace cache

**Artifact bundle**: `documentation/testing/artifacts/v033-plan0022-round2-20260612/`

This was a targeted installed retest after the Plan 0022 polish pass, not a full
14-command depth run. Four Claude Code lanes were spawned through the installed
dispatcher, then coordinator controls reproduced/triaged the important results.

### Round-2 Matrix
| lane | focus | verdict | evidence |
| --- | --- | --- | --- |
| A | setup/help/status/workflows JSON contracts | PASS | `setup --json`, command-specific help, `status --json --compact`, and `workflows --json` all parsed; compact status omitted `driver` and `capabilitiesSnapshot`. |
| B | delegate/result/followup/per-turn snapshots | FAIL nested followup | Per-turn files were distinct, but nested followup failed with `attach lock busy for session \`claude\`` and stale prior output advanced onto the failed turn. Coordinator direct followup control passed. |
| C | review/adversarial provenance | PASS core, nested defects | Adversarial review correctly persisted `reviewOf.turnIndex: 0`; nested `review --json`/`stop` defects were tied to `shortId:"claude"`. Coordinator direct review control passed. |
| D | workflow/deep-research inspector | PASS core, nested stop fail | `workflows` listed/inspected `dynamic_workflow` and `deep_research`; nested `cc stop` failed because it tried `claude stop claude`. |

### New Findings
**High**:
- Nested cc launches from inside Claude Code can persist `claude.shortId:"claude"` even though `claude.sessionId` has the real UUID. Five nested jobs in this run had that shape (`job_mqbc4akm_ebe0bd3d`, `job_mqbc4b7r_257e1b2f`, `job_mqbc4cok_efe0d08e`, `job_mqbc4h47_ae2481f6`, `job_mqbc5ha3_5ac71dd8`). Impact: `cc stop` calls `claude stop claude`, logs/attach guidance are wrong, and followup/review attach locks collide on `claude`.

**Medium**:
- A failed follow-up turn can inherit stale previous-turn output. `job_mqbc4b7r_257e1b2f` turn 1 failed before reaching Claude, but turn 1 and top-level `job.result` pointed at a turn-1 result snapshot containing turn 0's `P22_R2_FOLLOWUP_INITIAL`.

**Harness note**:
- The initial four lane jobs without `--permission-mode bypassPermissions` all reached `needs_input` before running shell checks. They were stopped cleanly and the lanes were relaunched with the explicit permission mode for unattended testing.

### Controls And Cleanup
- Direct coordinator followup control `job_mqbcbkpp_f46c8c36` passed: first marker `P22_R2_COORD_INITIAL`, second marker `P22_R2_COORD_SECOND`, distinct per-turn result files, immediate stale-preview metadata, and `cc stop` succeeded.
- Direct coordinator review control `job_mqbcdrws_2a6e9adc` passed: `review --yes --json` exited 0 with parseable pass verdict, and `cc stop` succeeded.
- Final `claude agents --json` check found no `p22-round2`, `p22-r2`, `mqbc4`, or `mqbc5` live sessions after cleanup.

### Fix Follow-up
The nested `shortId:"claude"` finding was fixed in the same Plan 0022 worktree.

- Parser hardening: Claude Code `--bg` output parsing now skips CLI words such as `claude`, `agents`, `attach`, and `logs`, while still accepting normal digit-containing IDs and all-letter 8-hex IDs.
- Runtime repair: existing jobs with `claude.shortId:"claude"` are repaired during reconciliation when a real `sessionId` is available; `logsCommand` is updated with the derived session prefix.
- Installed smoke: nested child `job_mqbff163_528a66a9` launched from inside Claude Code with `claude.shortId: "1861b2c2"`, matching session prefix `1861b2c2`, and `cc stop job_mqbff163_528a66a9 --all --json --compact` succeeded.
- Artifact: `documentation/testing/artifacts/v033-plan0022-round2-20260612/nested-shortid-fix.md`.

## Follow-up 2026-06-12 - Plan 0022 subagent friction polish
**Env**: repo source at v0.3.3 current-version fix pass; installed cache refreshed from local marketplace for smoke coverage.

**Artifact bundle**: `documentation/testing/artifacts/v033-plan0022-friction-20260612/`

This was not a new full 14-command depth run. It was the polish pass requested after the installed run below: four subagents tested Codex using Claude Code and identified frictions, then four read-only fix agents produced implementation guidance. F2b remains upstream/non-deterministic and out of scope.

### Fixed Frictions
- **Adversarial review provenance**: per-turn result snapshots are now immutable, `<jobId>.result.md` remains only a latest-result alias, and adversarial review refuses unrecoverable legacy shared-path records instead of silently reviewing the wrong bytes.
- **Automation JSON size/privacy**: `--compact` JSON and `cc status --job <jobId-or-prefix>` provide small, redacted job summaries for Codex automation.
- **Immediate follow-up honesty**: stale previous-turn previews are now marked with `stalePreview`/`resultPending` metadata rather than shown as the new follow-up result.
- **Workflow/deep-research ergonomics**: `cc workflows` now includes `/deep-research` jobs, command-specific help was added for workflow/deep-research/workflows, and attach guidance uses the actual Claude session short ID while noting that `--yes` does not approve Claude Code workflow gates.

### Verification
- `npm run build` - pass.
- Focused runtime, dispatcher, workflow-inspector, README, and skills-manifest tests - pass.
- `npm run lint` - pass.
- `npm run typecheck` - pass.
- `npm exec -- prettier --check` on touched tracked files - pass.
- `node tools/package-marketplace.mjs --check` - pass.
- `npm test` - pass.
- Installed cache refresh and smoke - pass: command-specific workflow/deep-research/workflows help, compact status JSON, `status --job --json`, and `workflows --json` kind classification.

### Residual Notes
- Workflow/deep-research approval gates are still a Claude Code behavior; the plugin now documents and surfaces the manual attach path instead of attempting to bypass the gate.
- Existing historical multi-turn jobs that already lost older result bytes cannot be repaired reliably; the new guard fails closed when it detects that legacy shape.

## Run 2026-06-12 - v0.3.3 installed Plan 0022 verification - polished
**Env**: claude 2.1.175 (Claude Code) · codex-cli 0.137.0 · macOS 26.5.1 (25F80) arm64 · plugin `cc@cc-plugin-codex-local` 0.3.3 refreshed from local marketplace cache

**Artifact bundle**: `documentation/testing/artifacts/v033-plan0022-installed-20260612/`

The installed cache dispatcher under test was `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`. Cache verification found the Plan 0022 status-skip change in installed `scripts/cc.mjs` and the followup-state reconciler change in bundled `@cc-plugin-codex/runtime/dist/reconciler.js`. Four Codex subagents ran the core, followup/review, heavyweight fan-out, and regression/edge lanes; coordinator add-on probes covered followup-state smoke, workflow-review gating, and a real-PTY privacy confirmation.

### Matrix
| # | command | status | summary |
| ---: | --- | --- | --- |
| 1 | `$claude-setup` | pass | plain, `--json`, and rerun exited 0; aggregate `warn` was only the accepted `claude-bg-flag` caveat. Delegate/followup capabilities were `ok`. |
| 2 | `$claude-delegate` | pass | read-only delegates, different prompt, rapid no-name delegates, reused-name sample, ID-shaped name, tmp-workspace delegate, and JSON/error paths behaved correctly. |
| 3 | `$claude-status` | pass | plain, `--all`, `--json`, real-id rejection, bogus-id rejection, workspace filtering, and global JSON parseability passed. |
| 4 | `$claude-result` | pass | human and `--json` result paths returned completed markers; a still-running job returned the expected not-complete error. |
| 5 | `$claude-followup` | pass | primary job reached `awaiting_followup` on first filtered poll; first, second, and `--json` followups completed with expected markers; stopped-job followup rejected cleanly. |
| 6 | `$claude-review` | pass | same-session review and `--json` review on delegate job returned PASS/no findings; workflow-job review while running returned clean parseable JSON guidance to wait for `awaiting_followup`. |
| 7 | `$claude-adversarial-review` | pass | default, `--model opus`, and `--json` variants launched fresh review jobs and returned PASS/no findings. |
| 8 | `$claude-stop` | pass | single-job stop worked; bare `--all` rejected; lane cleanup stopped all jobs by id. Bulk awaiting-followup stop was intentionally skipped to avoid unrelated historical jobs. |
| 9 | `$claude-workflow` | partial | text and `--json` launches worked and inspectors parsed; jobs reached the expected Claude Code approval/running gate before post-approval workflow subagents. |
| 10 | `$claude-goal` | pass | text and `--json` bounded goals completed with sentinel replies, then stopped cleanly. |
| 11 | `$claude-fork` | pass | text and `--json` variants completed with sentinel replies; parent transcripts and sidechain JSONL files showed real fork subagents. |
| 12 | `$claude-batch` | pass | text and `--json` variants launched, started two sidechain subagents per job, reached `needs_input`, and stopped with recoverable partial output. |
| 13 | `$claude-deep-research` | partial | local-doc text and JSON probes completed; WebSearch/fan-out JSON probe launched and stopped at the expected approval gate before subagents spawned. |
| 14 | `$claude-workflows` | pass | list, `--all`, `--json`, shortId drill-in, jobId drill-in, and bogus-id JSON/text errors all behaved correctly. |

### Regression Verdicts
- **F2b** (reused `--name` isolation): **PASS - no upstream cross observed in this sample**. `DUP-ONE` job `job_mqaitj91_a2a05766` used session `25cf1019-2bab-4b1b-9e45-d8d92e523f36`, pid 45463, sessionName `dup-key-test-0b06b370`, result `DUP-ONE`. `DUP-TWO` job `job_mqaitiyx_6bf865b2` used session `a4fc0689-6412-46b5-92c2-909cf8b0b2fc`, pid 44534, sessionName `dup-key-test-fab4740a`, result `DUP-TWO`.
- **F1** (rapid no-name delegates): **PASS**. `job_mqaisk5x_a81d5d88` session `c72f7fbd-e6f6-4b10-b1de-f5b5b2b3d7f1`, pid 43062, returned `CLEAN-RAPID-A`; `job_mqaisk1h_f2d86037` session `18cf2ce3-fb01-4d31-a748-de5a5e7313c9`, pid 42952, returned `CLEAN-RAPID-B`; `job_mqaisjqv_7db3c4d9` session `8a9ec48f-c3a1-4c23-a2d3-7232882f9436`, pid 40783, returned `CLEAN-RAPID-C`.
- **F2** (ID-shaped `--name` shortId): **PASS**. `job_mqait3kp_dd95221f` had shortId `a17fb74f`, sessionId `a17fb74f-e56d-45e8-af33-df6ee0b2c6d5`, sessionName `my-test-session-abc-547bd891`, pid 44011, result `CLEAN-NAME`.
- **F3** (`$claude-status <jobId>` rejection): **PASS**. `status job_mqait3kp_dd95221f` and `status job_bogus_not_real_12345678` both exited 2 with guidance to use `cc result <jobId>` or `cc status --all`; no full-list fallback occurred.

### Edge-Case Verdicts
- `--allow-edit` on fork/workflow/goal/batch/review/adversarial-review/deep-research: **PASS**. All exited 2 and included `not applicable`; review paths also stated reviews are read-only.
- Empty and whitespace-only delegate prompt: **PASS**. Both exited 2 with `[delegate] Error: prompt is required: cc delegate -- "<prompt>"`; no job ID returned.
- Non-TTY `printf 'x\n' | ... delegate --yes`: **PASS**. Exited 2 with the same prompt-required error and no new job.
- Workspace isolation: **PASS**. Temp job `job_mqaiv1fl_65a54205` from `/private/tmp/cc-edge-isolation-C1br1b` was absent from repo-local `status --json` and present in `status --all --json`.
- `--json` parseability: **PASS**. Setup, delegate validation, status, status-all, result, stop/followup/review/adversarial bogus paths, workflow/goal/fork/batch/deep-research allow-edit errors, workflows list, and workflows bogus-id JSON all parsed.
- Privacy disclosure: **INITIAL FAIL/PARTIAL, FIXED IN POLISH**. Non-TTY fresh workspace correctly rejected without `--yes` and printed the disclosure. The initial installed run confirmed that a real PTY fresh workspace without `--yes` launched immediately with no acknowledgement text (`job_mqaja4vx_8c43f237`, session `01315a23-3db8-4deb-be83-203d9ae5dc2e`). The Plan 0022 polish fix now prompts in TTY and records the ack only after explicit `yes`.

### Findings
**Blocker**: none.

**High**: none.

**Medium**:
- Fixed in Plan 0022 polish: privacy acknowledgement was bypassed in a fresh TTY workspace when `--yes` was omitted. Original repro: from `/tmp/cc-privacy-verify-tty-FoEN9i`, run `node .../cc.mjs delegate --json -- "reply with exactly PRIVACY-VERIFY-TTY"` in a PTY. It printed no disclosure/prompt and started `job_mqaja4vx_8c43f237`. The polish fix replaced TTY auto-recording with an explicit yes/no prompt.

**Low**: none.

### Fan-out Evidence
- `$claude-fork`: jobs `job_mqaizkvp_7b4b776a` and `job_mqaizpz9_95ba68a0` completed sentinel replies; sidechain files existed under `1741346e-.../subagents/agent-abounded-fork-harness-42c65931acf9cf42.jsonl` and `55c5ec49-.../subagents/agent-ajson-fork-harness-1991301bcd161d9f.jsonl`.
- `$claude-batch`: jobs `job_mqaj0zb2_20b1d93b` and `job_mqaj14fm_cd2736f9` created two sidechain JSONL files each and reached `needs_input` after subagents started.
- `$claude-workflow`: jobs `job_mqaixwb3_c20569f8` and `job_mqaiy1lo_c377ca97` launched and `workflows <id> --json` returned phase records; both stopped before post-approval subagents due to the known Claude Code approval gate.
- `$claude-deep-research`: local-doc probes `job_mqaj1rd6_3b1f8d7d` and `job_mqaj1wiw_37cca37d` completed; WebSearch/fan-out probe `job_mqaj66wp_95cb7aa2` launched and stopped at `needs_input` before subagents.

### Cleanup
All jobs started by this run were stopped by id, including coordinator and add-on probes. Final exact-ID sweep:

```text
statusAllCount=283
runJobCount=32
activeRunJobCount=0
```

### Polish Follow-up
Plan 0022 polish fixed the only medium issue from this installed run.

- Code changed: `packages/plugin-codex/scripts/lib/ack.mjs`, `packages/plugin-codex/scripts/cc.mjs`, `packages/plugin-codex/test/dispatcher.test.mjs`, plus regenerated marketplace copies.
- Regression coverage: fresh PTY `delegate --json` now declines without creating an ack/job and proceeds only after explicit `yes`.
- Installed cache smoke after reinstall:
  - Decline path in `/tmp/cc-privacy-polish-decline-YyZCTY` printed the acknowledgement, accepted `no`, and exited 1 with `Privacy acknowledgement declined`.
  - Accept path in `/tmp/cc-privacy-polish-accept-hfQ2SX` printed the acknowledgement, accepted `yes`, created `job_mqap6jx2_70413b0d`, and cleanup stopped that job.
- Verification: focused dispatcher ack tests passed, full dispatcher suite passed, `npm test` passed, lint/typecheck/package-marketplace/prettier/diff checks passed.

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
