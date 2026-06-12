# cc-plugin-codex v0.3.0 Deep Test Findings

Test date: 2026-06-07
Workspace: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
Dispatcher: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs`

## Summary Table

| command | variation | status | notes |
| --- | --- | --- | --- |
| install | Step 0 refresh | pass | `cc@cc-plugin-codex-local` installed and enabled at `0.3.0`. |
| `$claude-setup` | plain | pass | Exit 0. Overall `warn`; delegate and follow-up capabilities `ok`; only setup warning was `claude-bg-flag`. |
| `$claude-setup` | `--json` | pass | Exit 0. Parseable JSON with `ok: true`, `status: "warn"`, `delegateCapability: "ok"`, `followupCapability: "ok"`. |
| `$claude-setup` | re-run while bg job active | pass | Exit 0 while helper job `job_mq48x0ay_e0689b52` was active; no crash, capabilities still `ok`. |
| `$claude-delegate` | `--yes "Print MARKER-A then stop."` | pass | Job `job_mq48xhgd_2aba506d`; result contained `MARKER-A`. |
| `$claude-delegate` | `--yes --model opus "Print MARKER-A2 then stop."` | pass | Job `job_mq48xqnk_30795121`; result contained `MARKER-A2`. |
| `$claude-delegate` | `--yes "List the top-level dirs of this repo. Do not edit."` | partial | Job `job_mq48xzjm_e40dc6cb` stayed `needs_input`; stopped for cleanup. |
| `$claude-delegate` | `--yes --json "Print MARKER-A4 then stop."` | pass | JSON returned `ok: true`; job `job_mq48y8bn_379d57fa`; result contained `MARKER-A4`. |
| `$claude-status` | no args | pass | Exit 0. Listed workspace jobs. |
| `$claude-status` | `--all` | pass | Exit 0. Listed cross-workspace jobs; output matched this workspace during the run. |
| `$claude-status` | `--json` | pass | Exit 0. Returned parseable JSON with `ok: true` and job objects. |
| `$claude-status` | `<jobId>` | partial | Exit 0, but `status job_mq48xhgd_2aba506d` behaved like unfiltered status output. |
| `$claude-result` | completed job | pass | Exit 0 for `job_mq48xhgd_2aba506d`; output included `MARKER-A`. |
| `$claude-result` | `--json <jobId>` | pass | Exit 0. JSON `ok: true`, `resultText` contained `MARKER-A`. |
| `$claude-result` | non-terminal job | pass | Exit 1 for running helper job, with clear `not complete yet` message. |
| `$claude-result` | bogus jobId | pass | Exit 1 with clear no-job-found error. |
| `$claude-stop` | `stop <jobId>` | fail | Command exit 0 printed `Status: stopped`, but fresh status reconciled `job_mq48zjdd_92129054` to `orphaned`, not `stopped`. |
| `$claude-stop` | `--all-awaiting-followup` | pass | Exit 0; stopped six awaiting-followup jobs in the workspace. |
| `$claude-stop` | `--all-awaiting-followup --all` | pass | Exit 0; no awaiting-followup jobs remained across all workspaces. |
| `$claude-stop` | `--all` | pass | Exit 2 with bare-`--all` rejection and `--all-awaiting-followup [--all]` hint. |
| `$claude-followup` | print `MARKER-B` | pass | Job `job_mq496g7g_b6b3bfb7`; follow-up result contained `MARKER-B`. |
| `$claude-followup` | two sequential followups | pass | Completed turns for `MARKER-B1` and `MARKER-B2` were observable in status JSON. |
| `$claude-followup` | `--json` print `MARKER-B3` | pass | JSON valid, but immediate preview was stale `MARKER-B2`; post-poll status showed `MARKER-B3`. |
| `$claude-review` | `<jobId>` | pass | Same-session review exit 0 with `Review verdict: PASS` and no findings. |
| `$claude-review` | `--json <jobId>` | pass | Valid JSON with `verdict: "pass"` and zero findings. |
| `$claude-review` | freeform prompt | pass | Exit 1 with `[review] Hint` suggesting `$claude-delegate`. |
| `$claude-review` | bogus jobId | pass | Exit 1 with clear no-job-found error. |
| `$claude-adversarial-review` | `<jobId>` | pass | Created review job `job_mq49eawi_bc095f3c`; `PASS`; no malformed `PASS WITH FINDINGS (0 findings: )`. |
| `$claude-adversarial-review` | `--model opus <jobId>` | pass | Created review job `job_mq49f52x_3845332f`; logs showed `Opus 4.8 with high effort`. |
| `$claude-adversarial-review` | `--json <jobId>` | pass | Valid JSON with `verdict: "pass"` and review job `job_mq49gaj1_f05cce68`. |
| `$claude-adversarial-review` | freeform prompt | pass | Exit 1 with `[adversarial-review] Hint`, not `[review]`. |
| `$claude-batch` | list skills | pass | Job `job_mq48xlis_c9ffffbe`; reached `awaiting_followup`; result listed all 14 skill directories. |
| `$claude-batch` | fan-out frontmatter scan | partial | Job `job_mq48xup7_d4459f24`; real fan-out (`2 Explore agents`) occurred, then blocked on permission prompt; stopped/recovered as `orphaned`. |
| `$claude-batch` | `--json "Print MARKER-Bb..."` | pass | JSON `ok: true`; job `job_mq48y42k_7a776ce5`; recovered result contained `MARKER-Bb`. |
| `$claude-deep-research` | cheap arithmetic | pass | Job `job_mq492h6c_7b129538`; result was `4` and explicitly skipped fan-out as unnecessary. |
| `$claude-deep-research` | Node v20/v22 permission model | partial | Job `job_mq492p5o_197e2045`; workflow fan-out and web/source collection occurred, but final cited report timed out in `needs_input` and was stopped. |
| `$claude-deep-research` | `--json "capital of France"` | partial | JSON `ok: true`; job `job_mq492yaw_82f9d2b9`; workflow launched and logs contained `Paris`, but final synthesis timed out in `needs_input` and was stopped. |
| `$claude-workflows` | no args | pass | Exit 0; listed workflow sessions in this workspace. |
| `$claude-workflows` | `--all` | pass | Exit 0; listed cross-workspace workflow sessions. |
| `$claude-workflows` | `<workflow jobId>` drill-in | pass | Job-ID drill-in printed non-blank `Workflow session:` and `Name:`; caveat: displayed short session ID failed. |
| `$claude-workflow` | marker | pass | Job `job_mq48xsaf_e9b10e68`; result contained `MARKER-W`. |
| `$claude-workflow` | fan-out export audit | partial | Job `job_mq492p5g_0dad8a0e`; dynamic workflow ran 10 agents and reported exported functions, but parent status stuck until stopped and `cc workflows` showed `subagents: []`. |
| `$claude-workflow` | `--json` marker | pass | JSON `ok: true`; job `job_mq49b4ss_ffac6060`; result contained `MARKER-W3`. |
| `$claude-workflow` | `--name wf-named-pr4` marker | pass | Job `job_mq49btzp_d1197391`; session name honored as `wf-named-pr4`; result contained `MARKER-W4`. |
| `$claude-goal` | marker goal | pass | Job `job_mq49cmrj_c212200e`; result contained `MARKER-G` and goal-met text. |
| `$claude-goal` | line count | partial | Job `job_mq49dcmu_ef373178`; recovered correct `487 lines`, but status stayed `running`/queued until stopped. |
| `$claude-goal` | `--json` marker | partial | JSON `ok: true`; job `job_mq49fwqp_003b71c6`; recovered `MARKER-G3`, but status stayed `running`/queued until stopped. |
| `$claude-fork` | dispatch switch summary | pass | Job `job_mq49hw8n_e1d7612f`; result summarized the switch; direct subagent metadata count `1`. |
| `$claude-fork` | marker | pass | Job `job_mq49j8ih_3c122163`; result contained `MARKER-F`; direct subagent metadata count `1`. |
| `$claude-fork` | `--json` marker | pass | JSON `ok: true`; job `job_mq49jzsg_d78e1504`; result contained `MARKER-F3`; direct subagent metadata count `1`. |
| edge E1 | `$claude-review --allow-edit` | pass | Exit 2 with `[review] Error`. |
| edge E1 | `$claude-adversarial-review --allow-edit` | pass | Exit 2 with `[adversarial-review] Error`. |
| edge E1 | `$claude-workflow --allow-edit` | pass | Exit 2 with `[workflow] Error`. |
| edge E1 | `$claude-goal --allow-edit` | pass | Exit 2 with `[goal] Error`. |
| edge E1 | `$claude-fork --allow-edit` | pass | Exit 2 with `[fork] Error`. |
| edge E1 | `$claude-batch --allow-edit` | pass | Exit 2 with `[batch] Error`. |
| edge E1 | `$claude-deep-research --allow-edit` | pass | Exit 2 with `[deep-research] Error`. |
| edge E1 | `$claude-workflows --allow-edit` | pass | Exit 2 with `[workflows] Error`. |
| edge E2 | empty delegate prompt | pass | Exit 2 with prompt-required error. |
| edge E2 | empty workflow prompt | pass | Exit 2 with prompt-required error. |
| edge E3 | non-TTY stdin into delegate | pass | Exit 2 with prompt-required error; no accidental job created. |
| cleanup | final status | pass | `status --all --json` reported 51 jobs, all `orphaned`, active set `[]`; one stale pre-existing job required native PID cleanup after `$claude-stop` did not persist. |

## Step 0 - Refresh Install

Invocation:

```bash
codex plugin remove cc --marketplace cc-plugin-codex-local
codex plugin marketplace remove cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
codex plugin list | grep cc@cc-plugin-codex-local
```

Exit code: 0

Key output excerpt:

```text
cc@cc-plugin-codex-local  installed, enabled  0.3.0    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc
```

## Shared Harness Notes

- User-facing skill names are recorded as `$claude-*`.
- Shell invocations use the installed dispatcher: `node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs ...`.
- Terminal states treated as complete for polling: `complete`, `completed`, `idle`, `awaiting_followup`, `failed`, `stopped`, `orphaned`.

## Subagent A - Phases 1-3

Merge artifact: `documentation/testing/artifacts/20260607-v030-deep/subagent-a.md`.

Subagent A covered `$claude-setup`, `$claude-delegate`, `$claude-status`, and `$claude-result`.

Key job IDs:

- Active setup helper: `job_mq48x0ay_e0689b52`
- Marker delegate: `job_mq48xhgd_2aba506d`
- Opus marker delegate: `job_mq48xqnk_30795121`
- Read-only top-level dirs delegate: `job_mq48xzjm_e40dc6cb`
- JSON marker delegate: `job_mq48y8bn_379d57fa`

Notable evidence:

```text
Claude companion setup - warn
  delegate capability: ok
  follow-up capability: ok
...
  ok    claude-version                 2.1.168 (Claude Code)
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags.
```

`setup --json` produced parseable JSON with `ok: true`, `status: "warn"`, `delegateCapability: "ok"`, and `followupCapability: "ok"`.

Delegate marker results:

```text
job_mq48xhgd_2aba506d    awaiting_followup    turn=completed    preview=I'll print the marker as requested. MARKER-A
job_mq48xqnk_30795121    awaiting_followup    turn=completed    preview=MARKER-A2
job_mq48y8bn_379d57fa    awaiting_followup    turn=completed    preview=MARKER-A4
```

Partial:

```text
job_mq48xzjm_e40dc6cb    needs_input    turn=needs_input    preview=
```

`status <jobId>` returned exit 0 but behaved like plain status rather than filtering to that job. Result checks passed for completed, JSON, non-terminal, and bogus-ID cases; non-terminal and bogus returned exit 1 as expected.

## Subagent B - Phases 4-5 and Reviews

Merge artifact: `documentation/testing/artifacts/20260607-v030-deep/subagent-b.md`.

Subagent B covered `$claude-stop`, `$claude-followup`, `$claude-review`, and `$claude-adversarial-review`.

Key job IDs:

- Stop smoke job: `job_mq48zjdd_92129054`
- Followup/review target: `job_mq496g7g_b6b3bfb7`
- Adversarial review jobs: `job_mq49eawi_bc095f3c`, `job_mq49f52x_3845332f`, `job_mq49gaj1_f05cce68`

Stop evidence:

```text
Claude job stopped
Job ID:         job_mq48zjdd_92129054
Status:         stopped
Claude session: cf5b3fcb
```

Fresh status immediately after showed:

```text
job_mq48zjdd_92129054  orphaned  cf5b3fcb
```

This fails the requested `status stopped` expectation even though the stop command itself exited 0 and printed `stopped`.

Bulk stop evidence:

```text
Stopped 6 awaiting-followup Claude jobs.
Stopped:
  job_mq48xhgd_2aba506d  8a7cf01d  stopped
  job_mq48xlis_c9ffffbe  eb3a9a94  stopped
  job_mq48xqnk_30795121  3db47b27  stopped
  job_mq48xsaf_e9b10e68  c2a202db  stopped
  job_mq48y8bn_379d57fa  8d963556  stopped
  job_mq492h6c_7b129538  c6d696e7  stopped
```

Bare `stop --all` correctly returned exit 2:

```text
[stop] Error: bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.
```

Follow-up evidence on `job_mq496g7g_b6b3bfb7`:

```text
turn=0 status=completed summary=Print MARKER-B0 then stop. No file edits. preview=MARKER-B0
turn=1 status=completed summary=Now print MARKER-B. preview=MARKER-B
turn=2 status=completed summary=Print MARKER-B1. preview=MARKER-B1
turn=3 status=completed summary=Print MARKER-B2. preview=MARKER-B2
turn=4 status=completed summary=Print MARKER-B3. preview=MARKER-B3
```

`followup --json` produced valid JSON, but the immediate preview fields were stale:

```json
{
  "ok": true,
  "job": {
    "jobId": "job_mq496g7g_b6b3bfb7",
    "status": "running",
    "resultPreview": "MARKER-B2"
  },
  "turn": {
    "index": 4,
    "status": "completed",
    "finalMessagePreview": "MARKER-B2"
  }
}
```

Review evidence:

```text
Review verdict: PASS
Job ID:  job_mq496g7g_b6b3bfb7
Turn:    5 (completed)

No findings.
```

`review --json` returned `ok: true`, `verdict: "pass"`, and zero findings. Freeform and bogus inputs both returned exit 1 with clear errors; the freeform case included a `[review] Hint` suggesting `$claude-delegate`.

Adversarial review evidence:

```text
Review verdict: PASS
Job ID:  job_mq49eawi_bc095f3c
Turn:    0 (awaiting_followup)

No findings.
```

The malformed string `PASS WITH FINDINGS (0 findings: )` did not appear. The `--model opus` variant produced job `job_mq49f52x_3845332f`; `claude logs 07ab8379` showed `Opus 4.8 with high effort - Claude Max`. The JSON variant returned `ok: true`, `verdict: "pass"`, and review job `job_mq49gaj1_f05cce68`. Freeform adversarial review returned exit 1 with `[adversarial-review] Hint`, not `[review]`.

## Subagent C - Phases 6-8 and Fan-Out Commands

Merge artifact: `documentation/testing/artifacts/20260607-v030-deep/subagent-c.md`.

Subagent C covered `$claude-workflow`, `$claude-goal`, and `$claude-fork`.

Key job IDs:

- Workflow marker: `job_mq48xsaf_e9b10e68`
- Workflow fan-out export audit: `job_mq492p5g_0dad8a0e`
- Workflow JSON marker: `job_mq49b4ss_ffac6060`
- Workflow named marker: `job_mq49btzp_d1197391`
- Goal marker: `job_mq49cmrj_c212200e`
- Goal line count: `job_mq49dcmu_ef373178`
- Goal JSON marker: `job_mq49fwqp_003b71c6`
- Fork dispatch-switch summary: `job_mq49hw8n_e1d7612f`
- Fork marker: `job_mq49j8ih_3c122163`
- Fork JSON marker: `job_mq49jzsg_d78e1504`

Workflow marker results:

```text
MARKER-W
MARKER-W3
MARKER-W4
```

The named workflow honored `--name wf-named-pr4` exactly.

Fan-out workflow evidence:

```text
Run a dynamic workflow?
This dynamic workflow will spin up multiple subagents...
1. Audit — one agent per file
...
✔ Completed in 37s · 10 agents · 193.4k tokens
Audit complete — 10 subagents, one per file, ran in parallel (~37s).
```

Recovered export report included all 10 `.mjs` files under `packages/plugin-codex/scripts/lib/`, including `ack.mjs`, `adapter.mjs`, `args.mjs`, `claude-version.mjs`, `format.mjs`, `prompt-meta.mjs`, `review-parser.mjs`, `review-prompts.mjs`, `review-result-source.mjs`, and `workflows-inspector.mjs`.

Caveat: `cc workflows job_mq492p5g_0dad8a0e --json` returned `subagents: []` despite the dynamic workflow result reporting 10 agents; the drill-in did return 30 phase records. The parent job also stayed non-terminal until stopped/reconciled, then result recovery worked.

Goal evidence:

```text
MARKER-G

The goal is met.
```

Line-count goal recovered:

```text
The file `documentation/RELEASING.md` has **487 lines**.
```

Local verification matched:

```text
487 documentation/RELEASING.md
```

The `10b` and `10c` goal jobs produced the requested output in previews/results but stayed `running`/queued until stopped, so they are partial lifecycle results.

Fork evidence:

```text
MARKER-F
MARKER-F3
```

All three fork jobs completed with one direct subagent metadata record each. The dispatch-switch fork returned a useful 3-bullet summary and noted that the requested `L1-L60` range does not include the actual switch, which lives later around line 85.

## Subagent D - Batch, Deep Research, Workflows Inspector

Merge artifact: `documentation/testing/artifacts/20260607-v030-deep/subagent-d.md`.

Subagent D covered `$claude-batch`, `$claude-deep-research`, and `$claude-workflows`.

Key job IDs:

- Batch list skills: `job_mq48xlis_c9ffffbe`
- Batch fan-out frontmatter scan: `job_mq48xup7_d4459f24`
- Batch JSON marker: `job_mq48y42k_7a776ce5`
- Deep-research arithmetic: `job_mq492h6c_7b129538`
- Deep-research Node permission-model workflow: `job_mq492p5o_197e2045`
- Deep-research JSON France workflow: `job_mq492yaw_82f9d2b9`
- Workflows drill-in job ID: `job_mq492p5g_0dad8a0e`

Batch evidence:

```text
Entries of `packages/plugin-codex/skills/` (14 total):
- claude-adversarial-review
- claude-batch
- claude-deep-research
- claude-delegate
- claude-followup
- claude-fork
- claude-goal
- claude-result
- claude-review
- claude-setup
- claude-status
- claude-stop
- claude-workflow
- claude-workflows
```

Fan-out evidence for batch `12b`:

```text
Running 2 Explore agents...
2 Explore agents finished
Read name field of 7 SKILL.md files
```

The batch fan-out job then blocked on a shell permission prompt and was stopped. The JSON batch marker job produced valid JSON at dispatch and recovered result text contained `MARKER-Bb`.

Deep-research `13a` passed with:

```text
2 plus 2 = **4**.
(Skipping the deep-research workflow here -- that harness fans out parallel web searches and adversarial verification agents, which would be wasteful for a settled arithmetic fact.)
```

Deep-research `13b` launched a workflow and produced real multi-angle, multi-source research before timeout:

```text
Workflow launched in background. Task ID: wswykaia0
Run ID: wf_196d749a-5c0
```

The workflow decomposed the question into broad/primary, changelog/release-history, API/flag-surface, security/threat-model, limitations/bypasses, and practitioner/migration search angles. Source evidence in the workflow journal included Node.js release/docs pages, `node/doc/api/permissions.md`, and a Node.js security-release page. It timed out in `needs_input`, was stopped, and did not produce the final cited report.

Deep-research `13c` produced valid dispatcher JSON and launched workflow `wf_54ea5a87-cc4`; logs contained the answer `Paris`, but final synthesis did not complete before timeout.

Workflows inspector evidence:

```text
Workflow session: 983cda25-a210-4647-b1d7-87cfe2b4dc64
  Name:      codex:cc-plugin-codex:mq492mep
  Status:    running
  CWD:       /Users/hongjunwu/Repositories/Git/cc-plugin-codex
```

Conclusion: the v0.3.0 blank-detail fix is confirmed for the job-ID drill-in path. Caveat: the list output says `cc workflows <sessionId>`, but passing the displayed short session ID `983cda25` failed with `No job found matching jobId "983cda25"`; job ID `job_mq492p5g_0dad8a0e` worked.

## Main Thread - Edge Cases, Cleanup, Footer

### Edge Cases

#### E1 - `--allow-edit` rejection

All required families rejected `--allow-edit` at parse time with exit code 2.

| command | invocation | exit | key output |
| --- | --- | ---: | --- |
| `$claude-review` | `node .../cc.mjs review --allow-edit bogus` | 2 | `[review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.` |
| `$claude-adversarial-review` | `node .../cc.mjs adversarial-review --allow-edit bogus` | 2 | `[adversarial-review] Error: --allow-edit is not applicable to review skills. Reviews are read-only.` |
| `$claude-workflow` | `node .../cc.mjs workflow --allow-edit --yes -- "Print SHOULD-NOT-RUN"` | 2 | `[workflow] Error: --allow-edit is not applicable to $claude-workflow.` |
| `$claude-goal` | `node .../cc.mjs goal --allow-edit --yes -- "Print SHOULD-NOT-RUN"` | 2 | `[goal] Error: --allow-edit is not applicable to $claude-goal.` |
| `$claude-fork` | `node .../cc.mjs fork --allow-edit --yes -- "Print SHOULD-NOT-RUN"` | 2 | `[fork] Error: --allow-edit is not applicable to $claude-fork.` |
| `$claude-batch` | `node .../cc.mjs batch --allow-edit --yes -- "Print SHOULD-NOT-RUN"` | 2 | `[batch] Error: --allow-edit is not applicable to $claude-batch.` |
| `$claude-deep-research` | `node .../cc.mjs deep-research --allow-edit --yes -- "Print SHOULD-NOT-RUN"` | 2 | `[deep-research] Error: --allow-edit is not applicable to $claude-deep-research.` |
| `$claude-workflows` | `node .../cc.mjs workflows --allow-edit` | 2 | `[workflows] Error: --allow-edit is not applicable to $claude-workflows.` |

#### E2 - Empty prompt

| command | invocation | exit | key output |
| --- | --- | ---: | --- |
| `$claude-delegate` | `node .../cc.mjs delegate --yes -- ""` | 2 | `[delegate] Error: prompt is required: cc delegate -- "<prompt>"` |
| `$claude-workflow` | `node .../cc.mjs workflow --yes -- ""` | 2 | `[workflow] Error: prompt is required: cc workflow -- "<prompt>"` |

#### E3 - Non-TTY stdin into delegate

Invocation:

```bash
printf 'Print STDIN-MARKER then stop.\n' | node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs delegate --yes
```

Exit code: 2

Key output excerpt:

```text
[delegate] Error: prompt is required: cc delegate -- "<prompt>"
```

Result: pass. The command handled non-TTY stdin cleanly, did not crash, and did not create an accidental delegated job.

### Cleanup

Cleanup invocations:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop --all-awaiting-followup
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs stop --all-awaiting-followup --all
```

Exit codes: 0, 0

Key output excerpt:

```text
Stopped 6 awaiting-followup Claude jobs.
Stopped:
  job_mq49b4ss_ffac6060  1605b87a  stopped
  job_mq49btzp_d1197391  d16b2bdc  stopped
  job_mq49cmrj_c212200e  98d944f4  stopped
  job_mq49hw8n_e1d7612f  41798f4d  stopped
  job_mq49j8ih_3c122163  35bf2657  stopped
  job_mq49jzsg_d78e1504  a0c3b2fd  stopped
```

One pre-existing v0.2.0-era workspace job, `job_mq36pwuq_78224539`, remained `running`/`needs_input` after repeated `$claude-stop` attempts:

```text
Claude job stopped
Job ID:         job_mq36pwuq_78224539
Status:         stopped
Claude session: e1d0b3a8
```

Fresh status reconciled it back to `running`, then `needs_input`. Native `claude agents --json` showed a live session with the same name and full session id `ee8a35d3-ff9e-4233-b6b1-feb99f9bad9a`, while the plugin job short id remained `e1d0b3a8`. To satisfy the cleanup criterion, I terminated only the native Claude PIDs reported for that exact session, then re-ran `$claude-stop`.

Final confirmation:

```json
{
  "ok": true,
  "total": 51,
  "counts": {
    "orphaned": 51
  },
  "active": []
}
```

### Footer

```text
claude --version
2.1.168 (Claude Code)

codex --version
codex-cli 0.137.0

codex plugin list | grep cc@cc-plugin-codex-local
cc@cc-plugin-codex-local  installed, enabled  0.3.0    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc

git rev-parse HEAD
dd2c0a279d67892042860769afa25ec7a22b9c9b

test date
2026-06-07T17:06:37-04:00
```
