---
source_url: https://developers.openai.com/codex/config-reference
canonical_url: https://developers.openai.com/codex/config-reference
title: Configuration Reference
fetched: 2026-05-30
note: WebFetch returned a summary of this very long reference. Cross-reference `config-basic.md`, `config-advanced.md`, and `config-sample.md` for verbatim examples.
---

# Configuration Reference — Codex

> Source: https://developers.openai.com/codex/config-reference

Reference for `~/.codex/config.toml` and the managed `requirements.toml`.

## Core settings

| Key | Description |
|---|---|
| `model` | Active model id (e.g., `gpt-5.5`) |
| `model_provider` | Provider id from configured providers; default `openai` |
| `model_context_window` | Tokens available to the active model |
| `model_auto_compact_token_limit` | Threshold for automatic history compaction |

## Authentication & providers

Defined under `[model_providers.<id>]`:

- Base URL and API key handling
- HTTP headers, query parameters
- Retry and timeout configuration
- OAuth resource and scope configuration

Project-scoped configs may not override provider settings, authentication, or telemetry routing.

## Sandbox & security

`approval_policy` values: `untrusted`, `on-request`, `never`, or a granular block of subkeys:

- `sandbox_approval`
- `rules`
- `mcp_elicitations`
- `request_permissions`
- `skill_approval`

`sandbox_mode` values:

- `read-only`
- `workspace-write`
- `danger-full-access`

## MCP servers

`[mcp_servers.<id>]`:

- STDIO or HTTP server
- `enabled_tools` / `disabled_tools`
- OAuth options
- `startup_timeout_sec`, `tool_timeout_sec`

(Full options in `mcp.md`.)

## Features

`[features]` flags include:

- `unified_exec` — PTY-backed execution tool
- `memories` — enable the memory system
- `multi_agent` — agent collaboration tools
- `network_proxy` — sandboxed networking
- `hooks` — lifecycle event hooks
- `web_search` — web search capabilities
- `shell_snapshot`, `shell_tool`, `apps`, `codex_git_commit`, `fast_mode`, `personality`, `undo`, `child_agents_md`, etc.

## Shell environment

`shell_environment_policy`:

- `inherit` — baseline inheritance (`all`, `core`, or `none`)
- `include_only` — whitelist of env-var names
- `exclude` — denylist with glob patterns
- `set` — explicit overrides

## Permissions profiles

`[permissions.<name>]`:

- Filesystem access rules (read/write/deny)
- Network configuration and domain policies
- Workspace root definitions
- Profile inheritance via `extends`

Domain rules support exact hosts and wildcards (`*.example.com`, `**.example.com`).

## Memories (when enabled)

- `consolidation_model`, `extract_model`
- `generate_memories` — toggle generation
- `use_memories` — inject existing memories into sessions
- Age / consolidation / rate-limit thresholds

## Tools & apps

- `tools.web_search` — enable/configure, context size, domain filtering
- `apps.<id>.enabled`
- `apps.<id>.destructive_enabled`
- Per-tool approval modes / enablement overrides

## Terminal & UI

`[tui]`:

- `animations`
- `notifications`
- `keymap.global`, `keymap.composer`, etc.
- `theme`
- `vim_mode_default`

## Hooks

Configure inline in `[hooks]` or via `hooks.json`. Events: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`. (See `hooks.md`.)

## Telemetry & logging

- `log_dir` — directory for Codex logs
- `history.persistence` — `save-all` or `none`
- `history.max_bytes` — cap history file size
- `[otel]` — OpenTelemetry exporters/headers/redaction

## Reasoning & model controls

- `model_reasoning_effort`: `minimal`, `low`, `medium`, `high`, `xhigh`
- `model_reasoning_summary`: `auto`, `concise`, `detailed`, `none`
- `model_verbosity`: GPT-5 Responses API verbosity level

## Multi-agent / subagents

`[agents]`:

| Key | Default | Purpose |
|---|---|---|
| `max_threads` | 6 | Concurrent open threads |
| `max_depth` | 1 | Spawn nesting depth |
| `job_max_runtime_seconds` | — | Per-worker timeout for CSV batch jobs |

(See `subagents.md`.)

## Project & trust

- `project_root_markers` — filenames that indicate a project root
- `projects.<path>.trust_level` — `"trusted"` or `"untrusted"`
- `project_doc_max_bytes` — max bytes loaded from AGENTS.md (default 32 KiB)

## Other advanced

- `--profile <name>` selects `$CODEX_HOME/<name>.config.toml`
- `shell_environment_policy.env_vars` whitelist
- `permissions.<name>.extends` to inherit/compose profiles
