# Plan 0022 installed dispatcher heavy/fan-out lane

Date: 2026-06-12

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Dispatcher under test: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

Run prefix: `p22-heavy-20260612-20260612060701`

Extra deep-research fan-out probe: `p22-heavy-20260612-deep-research-web-202606120612`

## Preflight

- `node .../scripts/cc.mjs setup --json` exited 0 and parsed as JSON.
- Claude Code: `2.1.175 (Claude Code)`.
- Required probes were OK: `claude-binary`, `claude-auth`, `claude-agents-json`, `claude-logs`, `claude-daemon`, `transcript-path`, `claude-attach-help`, `claude-bg-no-prompt`, `sidecar-jobs-dir`, `pty-build`, `workflows-supported`, `bg-exec-supported`.
- Known warning only: `claude-bg-flag` because `--bg` is not advertised in `claude --help`.
- Pre-existing active jobs were observed and not stopped: `job_mq36pwuq_78224539`, `job_mqait46g_08e76d77`, `job_mqaitr2u_5a4ebd85`.

## Summary

| Command | Variations run | Outcome |
|---|---:|---|
| `$claude-workflow` | 2, including `--json` | Partial expected: both launched, JSON parsed, both reached workflow approval gate (`needs_input`), no subagents before stop. |
| `$claude-goal` | 2, including `--json` | Pass: both launched, completed sentinel replies, then were stopped from `awaiting_followup`. |
| `$claude-fork` | 2, including `--json` | Pass: both launched, completed sentinel replies, one sidechain subagent JSONL per job. |
| `$claude-batch` | 2, including `--json` | Partial/pass for launch and fan-out: both launched, two sidechain subagent JSONLs per job, then stopped from `needs_input`. |
| `$claude-deep-research` | 3, including two `--json` | Mixed: two local-doc probes completed without subagents; extra WebSearch/fan-out probe reached `needs_input` approval gate and was stopped. |
| `$claude-workflows` | list, `--all`, `--json`, short-id drill-in, job-id drill-in, bogus id | Pass: list/drill-in worked; bogus id returned expected error. |

## Launch Records

All start commands used `--yes`, `--effort low`, and a unique `--name`.

| Command | Variation | Job | Short ID | Final status | Turn status | JSON parsed |
|---|---|---|---|---|---|---|
| workflow | text | `job_mqaixwb3_c20569f8` | `80e684cd` | stopped | needs_input | n/a |
| workflow | json | `job_mqaiy1lo_c377ca97` | `b8f52f66` | stopped | needs_input | yes |
| goal | text | `job_mqaiywcn_3581c904` | `88526b3b` | stopped | completed | n/a |
| goal | json | `job_mqaiz1fh_9f241eae` | `70ab727c` | stopped | completed | yes |
| fork | text | `job_mqaizkvp_7b4b776a` | `1741346e` | stopped | completed | n/a |
| fork | json | `job_mqaizpz9_95ba68a0` | `55c5ec49` | stopped | completed | yes |
| batch | text | `job_mqaj0zb2_20b1d93b` | `4c034e43` | stopped | needs_input | n/a |
| batch | json | `job_mqaj14fm_cd2736f9` | `d0b627d5` | stopped | needs_input | yes |
| deep-research | text/local | `job_mqaj1rd6_3b1f8d7d` | `3decf351` | stopped | completed | n/a |
| deep-research | json/local | `job_mqaj1wiw_37cca37d` | `85fa3879` | stopped | completed | yes |
| deep-research | json/WebSearch fan-out | `job_mqaj66wp_95cb7aa2` | `444c4978` | stopped | needs_input | yes |

Job store path: `/Users/hongjunwu/.codex/cc-plugin-codex/jobs`

Claude project path: `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex`

## Bounded Polls And Cleanup

- Workflow: 1 bounded poll at 10s. Both jobs were `needs_input`; both stopped with `stop --json`, exit 0, parsed JSON, final status `stopped`.
- Goal: 1 bounded poll at 10s. Both jobs were `awaiting_followup` with completed turns; both stopped with `stop --json`, exit 0, parsed JSON, final status `stopped`.
- Fork: 3 bounded polls at 10s. Both jobs moved from `running` to `awaiting_followup`; both stopped with `stop --json`, exit 0, parsed JSON, final status `stopped`.
- Batch: 1 bounded poll at 10s. Both jobs reached `needs_input`; both stopped with `stop --json`, exit 0, parsed JSON, final status `stopped`.
- Deep-research local-doc probes: 3 bounded polls at 10s; both completed, then were stopped from `awaiting_followup`, exit 0, parsed JSON.
- Deep-research WebSearch/fan-out probe: 1 bounded poll at 10s; reached `needs_input`; stopped with `stop --json`, exit 0, parsed JSON.
- Final `status --json` for all jobs parsed and showed every job created by this run as `stopped`.

## Workflow Evidence

Start command shape:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflow --yes --name <name> --effort low -- "<prompt>"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflow --yes --name <name> --effort low --json -- "<prompt>"
```

Evidence:

- Text start exited 0 and printed the workflow approval note: workflow sessions present an interactive approval dialog and require attach to approve.
- JSON start exited 0 and parsed as `{ ok: true, job: ... }`.
- Poll 1 showed both jobs as `needs_input`.
- `workflows 80e684cd --json` parsed and returned `job_mqaixwb3_c20569f8`, `status: needs_input` before cleanup, `subagents: 0`, `phaseRecords: 15`.
- Final `workflows 80e684cd --json` parsed and returned `status: stopped`, `subagents: 0`, `phaseRecords: 20`.
- `workflows job_mqaixwb3_c20569f8` text drill-in exited 0 and showed the same session, cwd, no subagents, and phase records.
- Transcript paths existed:
  - `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/80e684cd-cf1c-4200-a9c7-c6e05dac5f32.jsonl`
  - `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/b8f52f66-6cde-445e-aab1-d95356ca7f6f.jsonl`

Status: partial by design. Launch and inspector paths work; workflow execution did not proceed past the approval gate, so there were no workflow subagent files.

## Goal Evidence

Start command shape:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs goal --yes --name <name> --effort low -- "<condition>"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs goal --yes --name <name> --effort low --json -- "<condition>"
```

Evidence:

- Text variation result preview: `P22_HEAVY_GOAL_TEXT_DONE`.
- JSON variation result preview: `P22_HEAVY_GOAL_JSON_DONE`.
- Both parent transcripts existed and included `goal_status` attachment records.
- No subagent directories were created, which matches goal behavior.

## Fork Evidence

Start command shape:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs fork --yes --name <name> --effort low -- "<directive>"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs fork --yes --name <name> --effort low --json -- "<directive>"
```

Evidence:

- Text result preview: `P22_HEAVY_FORK_TEXT_DONE`.
- JSON result preview: `P22_HEAVY_FORK_JSON_DONE`.
- Parent transcript for text job included `/fork` local command and `forked bounded-fork-harness`.
- Parent transcript for JSON job included `/fork` local command and `forked json-fork-harness`.
- Sidechain files:
  - `1741346e-5bf1-4d14-8ec9-616d3abf287d/subagents/agent-abounded-fork-harness-42c65931acf9cf42.jsonl`
  - `55c5ec49-67b1-487b-b326-c8e93ffe404e/subagents/agent-ajson-fork-harness-1991301bcd161d9f.jsonl`
- Each fork sidechain JSONL contained `"isSidechain":true`, an `agentId`, `Agent fork started`, and the expected sentinel reply.
- `claude logs <shortId>` after cleanup returned `job not found`, so durable evidence is from parent transcripts, sidechain JSONL, job records, and result files.

## Batch Evidence

Start command shape:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs batch --yes --name <name> --effort low -- "<instruction>"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs batch --yes --name <name> --effort low --json -- "<instruction>"
```

Evidence:

- Text result preview before stop: `I'll run the bounded batch: two parallel read-only agents, one per SKILL.md file.`
- JSON result preview before stop: `I'll launch the two parallel read-only agents as specified.`
- Both jobs reached `needs_input` after subagents started, then were stopped.
- Text batch sidechain files:
  - `4c034e43-197e-4b61-8d25-43b68ec9a2dd/subagents/agent-a88f3eb49b5ac4455.jsonl`
  - `4c034e43-197e-4b61-8d25-43b68ec9a2dd/subagents/agent-ad099cd11aa31c8a6.jsonl`
- JSON batch sidechain files:
  - `d0b627d5-b475-49f4-add4-79a60609c8d3/subagents/agent-a14dd8d8f369c272a.jsonl`
  - `d0b627d5-b475-49f4-add4-79a60609c8d3/subagents/agent-ae36d2bd7b5112bc2.jsonl`
- Each batch sidechain JSONL contained `"isSidechain":true`, an `agentId`, `Agent general-purpose started`, and the requested read-only file directive. The subagent turns then showed `[Request interrupted by user for tool use]`, consistent with the parent reaching `needs_input` before tool approval.
- `claude logs <shortId>` after cleanup returned `job not found`, so durable evidence is from parent transcripts, sidechain JSONL, job records, and result files.

## Deep-Research Evidence

Start command shape:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs deep-research --yes --name <name> --effort low -- "<question>"
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs deep-research --yes --name <name> --effort low --json -- "<question>"
```

Evidence:

- Local-doc text variation completed and produced a report from installed docs; no subagent directory was created.
- Local-doc JSON variation completed and parsed as JSON; no subagent directory was created.
- Extra WebSearch/fan-out JSON variation launched and parsed as `{ ok: true, job: ... }`.
- The extra WebSearch/fan-out probe reached `needs_input` on poll 1 and was stopped. This is the approval-gate partial path allowed by the test brief.
- Extra probe transcript existed at `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/444c4978-a69a-401d-b2dc-fa5e7fdb7163.jsonl`.
- No deep-research subagent files were created before the approval gate.

Status: partial for fan-out execution. Launch and JSON paths work; the explicit fan-out probe stopped at approval before subagents spawned.

## Workflows Command Evidence

Commands run:

```sh
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows --all
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows --all --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows 80e684cd --json
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows job_mqaixwb3_c20569f8
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows bogus-v033-plan0022-installed-heavy
node /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs workflows bogus-v033-plan0022-installed-heavy --json
```

Results:

- `workflows` text listed 33 workflow sessions and exited 0.
- `workflows --json` parsed and returned 33 sessions, including both workflow jobs from this run.
- `workflows --all` text exited 0.
- `workflows --all --json` parsed and returned 33 sessions.
- Drill-in by short session id `80e684cd` parsed as JSON and returned `job_mqaixwb3_c20569f8`, session id `80e684cd-cf1c-4200-a9c7-c6e05dac5f32`, `subagents: 0`, and phase records.
- Drill-in by job id `job_mqaixwb3_c20569f8` exited 0 and printed session detail.
- Bogus id text exited 1 with `[workflows] Error: No workflow found matching job id or session id "bogus-v033-plan0022-installed-heavy"`.
- Bogus id with `--json` exited 1 and emitted parseable JSON on stderr with `ok: false` and the same error message.

## Final Cleanup

All jobs started by this run were stopped:

- `job_mqaixwb3_c20569f8`
- `job_mqaiy1lo_c377ca97`
- `job_mqaiywcn_3581c904`
- `job_mqaiz1fh_9f241eae`
- `job_mqaizkvp_7b4b776a`
- `job_mqaizpz9_95ba68a0`
- `job_mqaj0zb2_20b1d93b`
- `job_mqaj14fm_cd2736f9`
- `job_mqaj1rd6_3b1f8d7d`
- `job_mqaj1wiw_37cca37d`
- `job_mqaj66wp_95cb7aa2`

No source files were edited by this test pass.
