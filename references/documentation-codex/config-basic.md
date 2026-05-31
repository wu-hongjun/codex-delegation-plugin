---
source_url: https://developers.openai.com/codex/config-basic
canonical_url: https://developers.openai.com/codex/config-basic
title: Config Basics
fetched: 2026-05-30
---

# Config Basics — Codex

> Source: https://developers.openai.com/codex/config-basic

## Where Codex looks for config

- **User-level**: `~/.codex/config.toml`
- **Project-level**: `.codex/config.toml` (loaded only when the project is marked **trusted**)
- **System-level**: `/etc/codex/config.toml` (Unix)

Access the user file from the IDE extension via the gear icon → **Codex Settings → Open config.toml**.

## Precedence (highest → lowest)

1. CLI flags and `--config` overrides
2. Project config files (closest to working directory wins)
3. Profile files selected with `--profile`
4. User config (`~/.codex/config.toml`)
5. System config
6. Built-in defaults

Untrusted projects skip the project-scoped `.codex/` layers but still load user and system config.

## Common keys

### Default model

```toml
model = "gpt-5.5"
```

### Approval policy

```toml
approval_policy = "on-request"
```

Options: `untrusted`, `on-request`, `never`.

### Sandbox

```toml
sandbox_mode = "workspace-write"
```

### Windows sandbox

```toml
[windows]
sandbox = "elevated"
# sandbox = "unelevated"
```

### Web search

```toml
web_search = "cached"
# web_search = "live"
# web_search = "disabled"
```

### Reasoning effort

```toml
model_reasoning_effort = "high"
```

### Personality

```toml
personality = "friendly"  # or "pragmatic" or "none"
```

### TUI keymap

```toml
[tui.keymap.global]
open_transcript = "ctrl-t"

[tui.keymap.composer]
submit = ["enter", "ctrl-m"]
```

### Shell environment

```toml
[shell_environment_policy]
include_only = ["PATH", "HOME"]
```

### Log directory

```toml
log_dir = "/absolute/path/to/codex-logs"
```

## Feature flags

```toml
[features]
shell_snapshot = true
memories = false
```

Notable feature flags reported on this page: `apps`, `codex_git_commit`, `hooks`, `fast_mode`, `memories`, `multi_agent`, `personality`, `shell_tool`, `shell_snapshot`, `unified_exec`, `undo`, `web_search` (legacy), and others.

Enable from the CLI via `--enable feature_name` or set keys to `true`/`false` in config.
