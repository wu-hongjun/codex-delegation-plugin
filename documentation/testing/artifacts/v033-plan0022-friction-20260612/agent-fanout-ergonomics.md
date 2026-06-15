# Agent fan-out ergonomics probe - cc plugin v0.3.3

Date: 2026-06-12

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher under test:
`/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

Constraints followed:

- Did not edit source files.
- Did not commit.
- Wrote only this artifact.
- Used bounded read-only prompts and `--effort low` where accepted.
- Used `--json` variants for launch, status, stop, and inspector probes where practical.
- Stopped every job started and verified stopped by full `jobId`.

## Summary verdict

`fork` and `batch` both produced actual sidechain subagents. They are not easy to discover from `cc status`; the reliable evidence was under:

`~/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/<sessionId>/subagents/`

`workflow` and web-shaped `deep-research` both stopped at Claude Code dynamic workflow approval before any workflow subagents were created. `--yes` only bypassed the dispatcher privacy acknowledgement; it did not approve workflow execution.

`workflows` inspector can list/drill `$claude-workflow` jobs, but rejects `$claude-deep-research` jobs even when Claude Code is showing a dynamic workflow approval screen for deep-research.

## Jobs started

| Surface | jobId | shortId | sessionId | Final status |
|---|---|---:|---|---|
| fork | `job_mqay896b_69adf038` | `853570cc` | `853570cc-7a3b-4cb9-886f-cc7dbbb356f3` | stopped |
| batch | `job_mqayalob_b5913fe7` | `43de32e5` | `43de32e5-2846-4d00-98a1-b27d33351b14` | stopped |
| workflow, local-file prompt | `job_mqaybyps_1c57f0b3` | `14d4da7e` | `14d4da7e-269c-4297-bc59-9e7f232d3477` | stopped |
| workflow, approval-only prompt | `job_mqayd8h2_97448468` | `65d75fe2` | `65d75fe2-a40d-44d8-8f62-e12d0916cb36` | stopped |
| deep-research, local-doc prompt | `job_mqayelm0_fb81ba64` | `74c67b45` | `74c67b45-e186-4b1b-bcb6-9d9b643ee7b0` | stopped |
| deep-research, web-shaped prompt | `job_mqayfxhe_89e94bde` | `a9937f56` | `a9937f56-f4be-4673-868d-872dd68e1fe9` | stopped |

## Fork

Launch command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs fork --json --yes --name p22-friction-ergo-fork-20260612 --effort low -- "Read-only bounded fan-out ergonomics probe. Do not edit files. Do not commit. Inspect /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/skills/claude-fork/SKILL.md and reply with exactly one line: P22_FORK_SENTINEL approval-flow=<three-to-six-words>."
```

Launch result:

```json
{
  "ok": true,
  "jobId": "job_mqay896b_69adf038",
  "status": "running",
  "shortId": "853570cc",
  "sessionId": "853570cc-7a3b-4cb9-886f-cc7dbbb356f3",
  "name": "p22-friction-ergo-fork-20260612-36d18a24"
}
```

Sidechain evidence:

- Parent log showed `forked read-only-bounded-fan-ou (b038)`.
- Files created:
  - `.../853570cc-7a3b-4cb9-886f-cc7dbbb356f3/subagents/agent-aread-only-bounded-fan-ou-30a791f93ad4b038.jsonl`
  - `.../853570cc-7a3b-4cb9-886f-cc7dbbb356f3/subagents/agent-aread-only-bounded-fan-ou-30a791f93ad4b038.meta.json`
- Meta:

```json
{"agentType":"fork","description":"Read-only bounded fan-out ergonomics probe. Do no...","name":"read-only-bounded-fan-ou"}
```

- Sidechain JSONL contained `isSidechain:true`, `agentId:"aread-only-bounded-fan-ou-30a791f93ad4b038"`, and `Agent fork started (...)`.
- It then attempted `Read(/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/skills/claude-fork/SKILL.md)` and blocked on a read-file permission prompt.

Stop and verification:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqay896b_69adf038 --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --all --json
```

Verified final status: `stopped`.

## Batch

Launch command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs batch --json --yes --name p22-friction-ergo-batch-20260612 --effort low -- "Read-only bounded batch ergonomics probe. Do not edit files. Do not commit. Use exactly two parallel read-only agents. Agent A inspects /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/skills/claude-fork/SKILL.md and returns P22_BATCH_A. Agent B inspects /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/skills/claude-batch/SKILL.md and returns P22_BATCH_B. Synthesize one line containing both markers."
```

Launch result:

```json
{
  "ok": true,
  "jobId": "job_mqayalob_b5913fe7",
  "status": "running",
  "shortId": "43de32e5",
  "sessionId": "43de32e5-2846-4d00-98a1-b27d33351b14",
  "name": "p22-friction-ergo-batch-20260612-0244e751"
}
```

Sidechain evidence:

- Parent JSONL showed two `Agent` tool calls:
  - `toolu_012NG1MGv5nhohqkN6bmEdvH`, description `Inspect claude-fork SKILL.md`
  - `toolu_01SnF5RAuqTqJ84ViGKn2KkJ`, description `Inspect claude-batch SKILL.md`
- Files created:
  - `.../43de32e5-2846-4d00-98a1-b27d33351b14/subagents/agent-a1763a73d2d322be5.jsonl`
  - `.../43de32e5-2846-4d00-98a1-b27d33351b14/subagents/agent-a1763a73d2d322be5.meta.json`
  - `.../43de32e5-2846-4d00-98a1-b27d33351b14/subagents/agent-a25a12b47cd11ceae.jsonl`
  - `.../43de32e5-2846-4d00-98a1-b27d33351b14/subagents/agent-a25a12b47cd11ceae.meta.json`
- Meta:

```json
{"agentType":"general-purpose","description":"Inspect claude-fork SKILL.md","toolUseId":"toolu_012NG1MGv5nhohqkN6bmEdvH"}
{"agentType":"general-purpose","description":"Inspect claude-batch SKILL.md","toolUseId":"toolu_01SnF5RAuqTqJ84ViGKn2KkJ"}
```

- Each sidechain JSONL contained `isSidechain:true` and `Agent general-purpose started (...)`.
- Both agents reached `Read(...)` tool calls and then needed read permission. The parent status became `needs_input`.

Stop and verification:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs stop job_mqayalob_b5913fe7 --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --all --json
```

Verified final status: `stopped`.

## Workflow

### Local-file prompt

Launch command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflow --json --yes --name p22-friction-ergo-workflow-20260612 --effort low -- "Read-only bounded workflow ergonomics probe. Do not edit files. Do not commit. Prepare a tiny dynamic workflow with one read-only agent that inspects /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/skills/claude-workflow/SKILL.md and returns P22_WORKFLOW_SENTINEL. Keep the script minimal and wait for approval if required."
```

Result:

```json
{
  "jobId": "job_mqaybyps_1c57f0b3",
  "shortId": "14d4da7e",
  "sessionId": "14d4da7e-269c-4297-bc59-9e7f232d3477",
  "statusAfterPoll": "needs_input"
}
```

Observed gate:

- This did not reach the dynamic workflow approval dialog.
- The model first tried a Bash command:

```sh
ls -la /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/skills/claude-workflow/SKILL.md 2>&1
```

- Claude Code asked for permission to run the Bash command.
- `cc workflows job_mqaybyps_1c57f0b3 --json` reported `subagentCount: 0`.

Stopped and verified by full ID.

### Marker-only approval prompt

Launch command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflow --json --yes --name p22-friction-ergo-workflow-approval-20260612 --effort low -- "Read-only marker-only workflow approval probe. Do not edit files. Do not inspect files. Do not run shell commands before presenting the workflow for approval. Create the smallest dynamic workflow script with one agent whose only task is to reply P22_WORKFLOW_APPROVAL_SENTINEL. Wait for approval if required."
```

Result:

```json
{
  "jobId": "job_mqayd8h2_97448468",
  "shortId": "65d75fe2",
  "sessionId": "65d75fe2-a40d-44d8-8f62-e12d0916cb36",
  "statusAfterPoll": "needs_input"
}
```

Observed gate:

- Log showed `Run a dynamic workflow?`.
- Workflow title: `Reply with approval sentinel`.
- Phase list: `1. Probe`.
- Prompt options included `Yes, run it`, `View raw script`, and `No`.
- `cc workflows 65d75fe2 --json` reported:

```json
{
  "jobId": "job_mqayd8h2_97448468",
  "sessionId": "65d75fe2-a40d-44d8-8f62-e12d0916cb36",
  "status": "stopped",
  "subagentCount": 0,
  "phaseRecordCount": 20
}
```

No workflow subagents were created before approval. Stopped and verified by full ID.

## Deep research

### Local-doc prompt

Launch command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs deep-research --json --yes --name p22-friction-ergo-deep-research-20260612 --effort low -- "Bounded deep-research ergonomics probe. Do not edit files. Keep scope tiny. Question: In the installed cc plugin skill docs, what approval flow does claude-deep-research describe? Return a concise answer containing P22_DEEP_RESEARCH_SENTINEL."
```

Result:

```json
{
  "jobId": "job_mqayelm0_fb81ba64",
  "shortId": "74c67b45",
  "sessionId": "74c67b45-e186-4b1b-bcb6-9d9b643ee7b0",
  "statusAfterPoll": "needs_input"
}
```

Observed behavior:

- The transcript included the injected deep-research workflow metadata:
  - `Run the "deep-research" workflow.`
  - phases: Scope, Search, Fetch, Verify, Synthesize
  - `Invoke: Workflow({ name: "deep-research", args: ... })`
- The model did not reach the workflow approval screen. It pivoted to a local-doc lookup and tried:

```sh
find /Users/hongjunwu -type d -name "claude-deep-research" 2>/dev/null; echo "---"; find /Users/hongjunwu/.claude -path "*deep-research*" -name "SKILL.md" 2>/dev/null
```

- Claude Code asked for Bash permission.
- No sidechain files were created.

Stopped and verified by full ID.

### Web-shaped prompt

Launch command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs deep-research --json --yes --name p22-friction-ergo-deep-research-web-20260612 --effort low -- "Deep-research workflow gate probe. Do not edit files. Use the deep-research workflow for this web-shaped question: What is the official domain for Claude Code documentation? Keep the final answer to one sentence containing P22_DEEP_RESEARCH_WEB_SENTINEL."
```

Result:

```json
{
  "jobId": "job_mqayfxhe_89e94bde",
  "shortId": "a9937f56",
  "sessionId": "a9937f56-f4be-4673-868d-872dd68e1fe9",
  "statusAfterPoll": "needs_input"
}
```

Observed gate:

- Log showed `Run a dynamic workflow?`.
- Workflow description: `Deep research harness - fan-out web searches, fetch sources, adversarially verify claims, synthesize a cited report.`
- Phase list:
  - `Scope - Decompose question (from args) into 5 search angles`
  - `Search - 5 parallel WebSearch agents, one per angle`
  - `Fetch - URL-dedup, fetch top 15 sources, extract falsifiable claims`
  - `Verify - 3-vote adversarial verification per claim`
  - `Synthesize - Merge semantic dupes, rank by confidence, cite sources`
- Prompt options included:
  - `Yes, run it`
  - `Yes, and don't ask again for deep-research in /Users/hongjunwu/Repositories/Git/cc-plugin-codex`
  - `View raw script`
  - `No`
- No sidechain files existed before approval.

Stopped and verified by full ID.

## Workflows inspector

Commands:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows 65d75fe2 --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows job_mqayfxhe_89e94bde --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows 65d75fe2
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows --help
```

Findings:

- `workflows --json` listed 36 workflow sessions in this workspace.
- It listed the two `$claude-workflow` jobs from this run:
  - `job_mqaybyps_1c57f0b3`, shortId `14d4da7e`, status `stopped`
  - `job_mqayd8h2_97448468`, shortId `65d75fe2`, status `stopped`
- It did not list either `$claude-deep-research` job.
- Drill by short session ID worked:

```json
{
  "jobId": "job_mqayd8h2_97448468",
  "sessionId": "65d75fe2-a40d-44d8-8f62-e12d0916cb36",
  "status": "stopped",
  "subagentCount": 0,
  "phaseRecordCount": 20
}
```

- Drill into deep-research rejected the job:

```json
{
  "ok": false,
  "error": {
    "message": "Job \"job_mqayfxhe_89e94bde\" is not a workflow job (prompt does not begin with \"ultracode: \").",
    "name": "Error"
  }
}
```

- `workflows --help` printed the global dispatcher help, not subcommand-specific help.
- Text drill-in is readable but shallow for gated jobs: it showed `Subagents: none recorded` and the first 20 raw JSONL records, mostly metadata (`last-prompt`, `custom-title`, `agent-name`, `mode`, `permission-mode`).

## Cleanup verification

Final exact-ID verification command:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs status --all --json
```

Filtered result:

```json
[
  {"jobId":"job_mqay896b_69adf038","status":"stopped","shortId":"853570cc"},
  {"jobId":"job_mqayalob_b5913fe7","status":"stopped","shortId":"43de32e5"},
  {"jobId":"job_mqaybyps_1c57f0b3","status":"stopped","shortId":"14d4da7e"},
  {"jobId":"job_mqayd8h2_97448468","status":"stopped","shortId":"65d75fe2"},
  {"jobId":"job_mqayelm0_fb81ba64","status":"stopped","shortId":"74c67b45"},
  {"jobId":"job_mqayfxhe_89e94bde","status":"stopped","shortId":"a9937f56"}
]
```

## Ergonomic frictions

1. Subcommand help is not specific. `cc workflows --help`, `cc fork --help`, etc. print the global help. That makes it harder to discover subcommand-specific behavior and rejected flags.

2. Launch and stop JSON are too large for quick Codex consumption. `--json` includes full capability snapshots and long probe evidence; `stop --json` returns the full job object. I had to pipe to a parser to see job ID, short ID, and status.

3. `status --json` is a full workspace/all-workspace list, not a single-job query. Exact verification requires either filtering locally or reading the job file. `status <jobId>` is intentionally rejected, so there is no concise status-by-ID command.

4. `result --json` on an active job exits non-zero and printed JSON error text in a way that made a simple stdout JSON parser fail. The useful message was: `Job job_mqay896b_69adf038 is not complete yet (status: needs_input). Run: cc status`.

5. Claude logs are ANSI TUI captures and very noisy. For sidechain evidence, direct transcript inspection with `rg` against `~/.claude/projects/.../*.jsonl` was much more reliable.

6. `fork` and `batch` actual subagents do not appear as first-class rows in `cc status`. The parent job changes to `needs_input`, but proving fan-out happened requires knowing Claude's sanitized project path and checking `subagents/*.jsonl` and `*.meta.json`.

7. Read-only prompts still trigger permission gates in background sessions. Fork and batch both blocked on `Read(...)`; workflow and deep-research local-doc prompts blocked on Bash. "Read-only" in the prompt does not mean permissionless.

8. `$claude-batch` is heavy for a two-agent read-only probe. The injected batch system prompt talks about 5-30 units, worktrees, commits, pushes, PRs, and e2e verification, even when the user asks for exactly two read-only agents. The model did comply with two agents, but the hidden framing is much bigger than the surface command suggests.

9. `$claude-workflow` and web-shaped `$claude-deep-research` both require a human dynamic workflow approval in the TUI. The dispatcher cannot approve it. `--yes` does not help beyond the privacy acknowledgement.

10. `$claude-deep-research` skill wording appears stale or misleading for v2.1.175. The installed skill says no interactive approval dialog is required, but the web-shaped probe clearly hit `Run a dynamic workflow?` with Yes/View raw/No choices.

11. `$claude-workflows` inspector is workflow-job-only by implementation. It excludes deep-research jobs because they do not have `prompt.summary` starting with `ultracode:`, even though the deep-research runtime itself is a dynamic workflow in Claude Code.

12. ID wording can mislead. Dispatcher output and docs mention `jobId`, `shortId`, and `sessionId`; `claude logs` and practical attach/log workflows use Claude short/session IDs, while `cc stop` and job-store operations use `job_mq...` IDs. A Codex user has to keep both namespaces straight.

13. Sidechain meta files are minimal while blocked. The batch meta files had `agentType`, `description`, and `toolUseId`, but not status/tokens/result. The JSONL has the stronger proof.

14. `workflows` drill-in surfaces only early JSONL records for gated workflows. It can confirm `Subagents: none recorded`, but it does not extract the approval dialog text or phase list; `claude logs <shortId>` was required for that.

15. Cleanup is exacting. Stopping by full `jobId` worked reliably, but each job needed a separate stop and status verification. Bulk cleanup would be risky because this workspace had many unrelated historical jobs.

## Wording that may mislead Codex users

- `$claude-deep-research`: "No interactive approval dialog is required" conflicts with the observed dynamic workflow approval gate for a web-shaped deep-research run.
- `$claude-batch`: "No interactive approval dialog is required" is narrowly true for starting the batch runtime, but sidechain `Read` permissions can still block immediately.
- `$claude-fork` and `$claude-batch`: "Attach via `claude attach <jobId>`" is ambiguous because the cc `jobId` is `job_mq...`; Claude CLI operations use `shortId` or `sessionId`.
- `$claude-workflows`: "workflow sessions" may sound like all Claude Code dynamic workflow sessions, but it only covers `$claude-workflow` jobs whose prompt summary begins with `ultracode:`, not `$claude-deep-research`.
