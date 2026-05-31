---
source_url: https://developers.openai.com/codex/subagents
canonical_url: https://developers.openai.com/codex/subagents
title: Codex Subagents
fetched: 2026-05-30
relevance: high
note: Especially relevant for cc-plugin-codex - subagents are how Codex orchestrates external CLIs and parallel work.
---

# Subagents — Codex

> Source: https://developers.openai.com/codex/subagents

## Overview

Codex can spawn specialized subagents in parallel and consolidate their results into a single response. This pattern fits complex, highly parallel tasks (codebase exploration, multi-step features, batched audits).

- Subagent workflows are **enabled by default** in current Codex releases.
- Visible in the app and CLI; IDE Extension support is "coming soon."
- They consume more tokens than single-agent runs (each subagent runs its own model + tools).

## Orchestration

Codex itself spawns, routes, waits on, and closes subagent threads. **New subagents only spawn when explicitly requested.**

CLI controls:

- `/agent` — switch between active threads.
- Steering: direct Codex to stop a subagent or close a completed thread.
- Sandbox inheritance: subagents inherit the parent's sandbox policy.
- Approval flow: requests from inactive threads surface with source labels; press `o` to open that thread.
- Runtime overrides: live changes to permissions/sandbox apply when spawning the next child.

## Built-in agents

| Name | Role |
|---|---|
| `default` | General-purpose fallback agent |
| `worker` | Execution focus — implementation and fixes |
| `explorer` | Read-heavy codebase exploration |

## Defining custom agents

Custom agents are standalone TOML files in:

- Personal: `~/.codex/agents/`
- Project: `.codex/agents/`

### Required fields

- `name` — identifier
- `description` — when Codex should pick this agent
- `developer_instructions` — core behavior instructions

### Optional fields (inherit from parent when omitted)

- `nickname_candidates` — display-only pool of names
- `model`
- `model_reasoning_effort`
- `sandbox_mode`
- `mcp_servers`
- `skills.config`

### Global `[agents]` settings

| Field | Default | Purpose |
|---|---|---|
| `max_threads` | 6 | Cap on concurrent open threads |
| `max_depth` | 1 | Maximum nesting depth for spawned agents |
| `job_max_runtime_seconds` | — | Per-worker timeout for CSV batch jobs |

## Example patterns

### PR review pattern (3 agents)

- `pr_explorer` — `gpt-5.3-codex-spark`, read-only, maps the codebase and gathers evidence.
- `reviewer` — `gpt-5.4`, focuses on correctness, security, test risk.
- `docs_researcher` — `gpt-5.4-mini`, verifies docs via MCP server.

Each agent gets a sandbox-mode + reasoning-effort setting tailored to its role.

### Frontend integration debugging (3 agents)

- `code_mapper` — `gpt-5.4-mini`, read-only, locates code paths.
- `browser_debugger` — `gpt-5.4`, reproduces issues, captures browser evidence.
- `ui_fixer` — `gpt-5.3-codex-spark`, applies targeted fixes.

## CSV batch processing — `spawn_agents_on_csv` (experimental)

Spawns **one worker subagent per row**, then exports combined results.

Parameters:

- `csv_path` — source file
- `instruction` — worker prompt template using `{column_name}` placeholders
- `id_column` — optional stable identifier
- `output_schema` — expected JSON shape from each worker
- `output_csv_path`, `max_concurrency`, `max_runtime_seconds` — job control

Worker contract: each worker **must call `report_agent_job_result` exactly once.** Failures are recorded in the exported CSV.

Use cases: repeated audits — reviewing files/packages, checking incidents/PRs, generating structured summaries.

---

> Codex only spawns subagents when you explicitly ask it to.
