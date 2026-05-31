---
source_url: https://developers.openai.com/codex/hooks
canonical_url: https://developers.openai.com/codex/hooks
title: Codex Lifecycle Hooks
fetched: 2026-05-30
---

# Hooks in Codex

> Source: https://developers.openai.com/codex/hooks

Hooks are an extensibility framework that lets you inject deterministic scripts into Codex's agentic loop. They power custom logging, prompt validation, automatic memory creation, and directory-specific customization.

## Enabling/disabling

Hooks are enabled by default. Disable globally:

```toml
[features]
hooks = false
```

## Where hooks are discovered

In precedence order:

1. `~/.codex/hooks.json` or inline `[hooks]` in `config.toml`
2. Project-local `.codex/hooks.json` or `.codex/config.toml`
3. Plugin-bundled hooks (under `hooks/hooks.json` in the plugin)
4. Enterprise `requirements.toml` managed hooks

Non-managed command hooks require explicit review and trust before execution.
Use `/hooks` in the CLI to inspect, review, trust, or disable individual hooks.
Managed hooks from a system/MDM source are automatically trusted.

## Lifecycle events

| Event | When it fires |
|---|---|
| `SessionStart` | Session begins. `source` is `startup`, `resume`, `clear`, or `compact`. |
| `PreToolUse` | Before tools execute (Bash, file edits, MCP tools, etc.). |
| `PermissionRequest` | When an approval decision is requested. |
| `PostToolUse` | After tool execution; can post feedback on outputs. |
| `PreCompact` | Before conversation compaction. |
| `PostCompact` | After conversation compaction. |
| `UserPromptSubmit` | A user prompt is being submitted. |
| `SubagentStart` | A subagent thread starts. |
| `SubagentStop` | A subagent thread finishes. |
| `Stop` | Turn completion / stop decision. |

## Matcher patterns

The `matcher` field is a regex used to filter when a hook fires. Some events support matchers (tool names, triggers, sources); others ignore them.

Examples:

```
Bash
^apply_patch$
Edit|Write
startup|resume
```

## Hook I/O contract

Hooks receive a JSON payload on **stdin** with these shared fields:

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- `model`
- `permission_mode`

Hooks reply with a JSON payload on **stdout** supporting:

- `continue` — boolean; whether the agent loop should proceed
- `stopReason` — optional explanation when stopping
- `systemMessage` — a system message to surface
- Event-specific fields such as `additionalContext` (e.g., for `SessionStart` / `UserPromptSubmit`) and `permissionDecision` (for `PermissionRequest`)

## Enterprise / managed hooks

Admins can enforce hooks via `requirements.toml` and pin them to platform-specific directories. Setting

```toml
allow_managed_hooks_only = true
```

restricts execution to managed hooks, bypassing user and project hook configs.

This setting is only honored in `requirements.toml` — putting it in `config.toml` does not enable managed-hooks-only mode.

## Hook bundle inside a plugin

A plugin can ship hooks at `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${PLUGIN_ROOT}/hooks/session_start.py",
            "statusMessage": "Loading plugin context"
          }
        ]
      }
    ]
  }
}
```

The command receives `PLUGIN_ROOT` and `PLUGIN_DATA` environment variables (plus legacy `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` aliases).
