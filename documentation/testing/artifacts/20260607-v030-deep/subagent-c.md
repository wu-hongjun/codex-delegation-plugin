# Subagent C - Phases 6-8 and Fan-Out Commands

Date: 2026-06-07
Dispatcher: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs`
Raw artifacts: `documentation/testing/artifacts/20260607-v030-deep/subagent-c/`

## Summary Rows

| command | variation | status | notes |
| --- | --- | --- | --- |
| `$claude-workflow` | `--yes "Print MARKER-W then stop. Be brief."` | pass | Job `job_mq48xsaf_e9b10e68`; result contained `MARKER-W`. |
| `$claude-workflow` | fan-out export audit | partial | Job `job_mq492p5g_0dad8a0e`; workflow did fan out and recovered result says `10 subagents, one per file`, but parent status stuck/non-terminal until stopped and `cc workflows` drill-in reported `subagents: []`. |
| `$claude-workflow` | `--yes --json "Print MARKER-W3 then stop."` | pass | JSON dispatch parseable with `ok: true`; job `job_mq49b4ss_ffac6060`; result contained `MARKER-W3`. |
| `$claude-workflow` | `--yes --name wf-named-pr4 "Print MARKER-W4 then stop."` | pass | Job `job_mq49btzp_d1197391`; session name was exactly `wf-named-pr4`; result contained `MARKER-W4`. |
| `$claude-goal` | marker goal | pass | Job `job_mq49cmrj_c212200e`; first poll terminal; result contained `MARKER-G` and `The goal is met.` |
| `$claude-goal` | `documentation/RELEASING.md` line count | partial | Job `job_mq49dcmu_ef373178`; output `487 lines` was correct by local `wc -l`, but status stayed `running`/queued and was stopped/recovered. |
| `$claude-goal` | `--json "Print MARKER-G3 then stop."` | partial | JSON dispatch parseable with `ok: true`; job `job_mq49fwqp_003b71c6`; `MARKER-G3` recovered after stop because status stayed `running`/queued. |
| `$claude-fork` | dispatch switch summary | pass | Job `job_mq49hw8n_e1d7612f`; result summarized dispatch switch; direct subagent metadata count `1`. |
| `$claude-fork` | marker fork | pass | Job `job_mq49j8ih_3c122163`; result contained `MARKER-F`; direct subagent metadata count `1`. |
| `$claude-fork` | `--json "Print MARKER-F3 then stop."` | pass | JSON dispatch parseable with `ok: true`; job `job_mq49jzsg_d78e1504`; result contained `MARKER-F3`; direct subagent metadata count `1`. |

## Details

### 9a - Workflow Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflow --yes "Print MARKER-W then stop. Be brief."
```

Exit code: 0
Job ID: `job_mq48xsaf_e9b10e68`
Final observed status: `awaiting_followup`
Result exit code: 0

Key output:

```text
MARKER-W
```

### 9b - Workflow Fan-Out Export Audit

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflow --yes "Audit every .mjs file under packages/plugin-codex/scripts/lib/ in parallel — one subagent per file — and report each file's exported function names. Use multiple subagents."
```

Exit code: 0
Job ID: `job_mq492p5g_0dad8a0e`
Final observed status: `orphaned` after stop/reconcile
Stop exit code: 0
Result exit code: 0
`cc workflows <jobId> --json` exit code: 0

Fan-out evidence:

```text
Run a dynamic workflow?
This dynamic workflow will spin up multiple subagents...
1. Audit — one agent per file
```

Attached TUI and later result both showed real fan-out:

```text
0/10 agents done
✔ Completed in 37s · 10 agents · 193.4k tokens
Audit complete — 10 subagents, one per file, ran in parallel (~37s).
```

Recovered result excerpt:

```text
| File | Exported functions |
|---|---|
| `ack.mjs` | `hasAck`, `recordAck`, `resolveWorkspaceAck` |
| `adapter.mjs` | `makeClaudeAdapter` |
| `args.mjs` | `parseArgs`, `resolveJobIdPrefix` |
| `claude-version.mjs` | `parseClaudeVersion`, `compare`, `meetsFloor` |
| `format.mjs` | `formatSetup`, `formatDelegate`, `formatStatus`, `formatFollowup`, `formatResult`, `formatStop`, `formatBulkStop`, `formatReviewHuman`, `formatReviewJson`, `formatAdversarialReviewJson`, `formatError` |
| `prompt-meta.mjs` | `makePromptMeta` |
| `review-parser.mjs` | `parseReviewOutput` |
| `review-prompts.mjs` | `SAME_SESSION_REVIEW_PROMPT`, `ADVERSARIAL_REVIEW_PROMPT` |
| `review-result-source.mjs` | `readTurnFinalMessageOrFallback` (async) |
| `workflows-inspector.mjs` | `listWorkflows` (async), `inspectWorkflow` (async), `_sanitizeCwd` |
```

Caveat: `cc workflows job_mq492p5g_0dad8a0e --json` returned `subagents: []` even though the workflow TUI/result reported 10 agents. The drill-in did return 30 phase records, but not subagent meta.

### 9c - Workflow JSON Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflow --yes --json "Print MARKER-W3 then stop."
```

Exit code: 0
Job ID: `job_mq49b4ss_ffac6060`
Final observed status: `awaiting_followup`
Result exit code: 0

JSON dispatch output was parseable with `ok: true`. Result contained:

```text
MARKER-W3
```

### 9d - Workflow Named Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs workflow --yes --name wf-named-pr4 "Print MARKER-W4 then stop."
```

Exit code: 0
Job ID: `job_mq49btzp_d1197391`
Final observed status: `awaiting_followup`
Observed session name: `wf-named-pr4`
Result exit code: 0

Key output:

```text
MARKER-W4
```

### 10a - Goal Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs goal --yes "Print MARKER-G then stop once printed."
```

Exit code: 0
Job ID: `job_mq49cmrj_c212200e`
Final observed status: `awaiting_followup`
Result exit code: 0

Key output:

```text
MARKER-G

The goal is met.
```

### 10b - Goal Line Count

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs goal --yes "Count the lines in documentation/RELEASING.md, print the number, then stop."
```

Exit code: 0
Job ID: `job_mq49dcmu_ef373178`
Final observed status: `orphaned` after stop/reconcile
Stop exit code: 0
Result exit code: 0

Status polls showed the correct result preview while the job stayed `running` with the turn `queued`:

```text
The file `documentation/RELEASING.md` has **487 lines**.
```

Local verification:

```text
487 documentation/RELEASING.md
```

### 10c - Goal JSON Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs goal --yes --json "Print MARKER-G3 then stop."
```

Exit code: 0
Job ID: `job_mq49fwqp_003b71c6`
Final observed status: `orphaned` after stop/reconcile
Stop exit code: 0
Result exit code: 0

JSON dispatch output was parseable with `ok: true`. Status polls showed `MARKER-G3` while the job stayed `running`/queued; result after stop contained:

```text
MARKER-G3
```

### 11a - Fork Dispatch Switch Summary

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs fork --yes "Read packages/plugin-codex/scripts/cc.mjs L1-L60 and summarize the dispatch switch in 3 bullets."
```

Exit code: 0
Job ID: `job_mq49hw8n_e1d7612f`
Final observed status: `awaiting_followup`
Result exit code: 0
Direct subagent metadata count: 1

Result excerpt:

```text
Summary of the dispatch switch in `cc.mjs`:

- What it dispatches: a single `switch (command)` at line 85 routes each CLI subcommand to its `cmd*` handler...
- Error handling: the whole switch is wrapped in `try/catch`...
- Note vs. the fork's range: L1-L60 contains only imports and `loadPluginVersion()`; the switch lives at L85.
```

### 11b - Fork Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs fork --yes "Print MARKER-F then stop. One short turn."
```

Exit code: 0
Job ID: `job_mq49j8ih_3c122163`
Final observed status: `awaiting_followup`
Result exit code: 0
Direct subagent metadata count: 1

Key output:

```text
MARKER-F
```

### 11c - Fork JSON Marker

Invocation:

```bash
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.0/scripts/cc.mjs fork --yes --json "Print MARKER-F3 then stop."
```

Exit code: 0
Job ID: `job_mq49jzsg_d78e1504`
Final observed status: `awaiting_followup`
Result exit code: 0
Direct subagent metadata count: 1

JSON dispatch output was parseable with `ok: true`. Result contained:

```text
MARKER-F3

The forked agent completed and returned `MARKER-F3`.
```

## Notes

- `9b` required interactive workflow approval after the initial status stayed `needs_input`; the approval screen explicitly showed the one-agent-per-file workflow before it ran.
- `9b`, `10b`, and `10c` produced the requested outputs but did not settle cleanly into `awaiting_followup` before stop/reconcile. They are marked `partial` where lifecycle behavior is part of the test signal.
- Fork jobs wrote one subagent metadata record each under the Claude project session directory; workflow fan-out did not produce subagent meta visible to `cc workflows`, despite the runtime reporting 10 agents in the result.
- No commits were made.
