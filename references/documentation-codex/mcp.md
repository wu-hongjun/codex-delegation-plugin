---
source_url: https://developers.openai.com/codex/mcp
canonical_url: https://developers.openai.com/codex/mcp
title: Model Context Protocol (MCP) in Codex
fetched: 2026-05-30
relevance: high
note: For full MCP wire-protocol details specific to Codex (server framing, tool exposure), also see `github/codex-rs-mcp-interface.md` from the codex-rs repo.
---

# Model Context Protocol — Codex

> Source: https://developers.openai.com/codex/mcp

## Overview

The Model Context Protocol (MCP) connects Codex to third-party tools and context. It supports STDIO servers (local processes), streamable HTTP servers, and reads the MCP `instructions` field during initialization.

## Supported transports & features

1. **STDIO servers** — local processes started by commands; env-var support.
2. **Streamable HTTP servers** — accessed by URL; supports bearer token or OAuth auth.
3. **Server instructions** — the MCP `instructions` field is honored at initialization.

## Configuration methods

- **CLI**: `codex mcp add <server-name> --env VAR1=VALUE1 -- <command>`
- **File**: edit `~/.codex/config.toml` (user) or `.codex/config.toml` (project) and add `[mcp_servers.<name>]` tables.

## STDIO server options

| Option | Required | Default | Description |
|---|---|---|---|
| `command` | yes | — | Server startup command |
| `args` | no | — | Command arguments |
| `env` | no | — | Environment variables |
| `cwd` | no | — | Working directory |
| `experimental_environment` | no | — | Experimental env injection |
| `startup_timeout_sec` | no | 10 | How long to wait for the server to come up |
| `tool_timeout_sec` | no | 60 | Per-tool call timeout |

## HTTP server options

| Option | Required | Description |
|---|---|---|
| `url` | yes | Server address |
| `bearer_token_env_var` | no | Env var providing the bearer token (used in `Authorization` header) |
| `http_headers` | no | Static header key/value map |
| `env_http_headers` | no | Headers sourced from env vars |

## Universal options (both transports)

- `enabled` — toggle the server on/off
- `required` — fail startup if the server is unavailable
- `enabled_tools` — allowlist of tool names
- `disabled_tools` — denylist of tool names
- `default_tools_approval_mode` — `auto`, `prompt`, or `approve`

## CLI: `codex mcp` commands

```bash
codex mcp add <name> --env KEY=VALUE -- <command> [args...]
# Add an MCP server (STDIO) with environment variables.
```

(Plus other `codex mcp` subcommands for listing/removing/testing — see the page; format is consistent with the underlying CLI help output.)

## Notable MCP servers referenced

- OpenAI Docs MCP
- Context7 (developer documentation)
- Figma (design access)
- Playwright (browser control)
- Chrome Developer Tools MCP
- GitHub MCP (repository management)
- Sentry (error tracking)

## Running Codex itself as an MCP server

From `cli-features.md`:

> You can even run Codex itself as an MCP server when you need it inside another agent.

The wire format Codex speaks when acting as / talking to an MCP server is documented in `github/codex-rs-mcp-interface.md`.

## TOML example

```toml
# Local STDIO server
[mcp_servers.docs]
command = "docs-mcp"
args = ["--stdio"]
env = { DOCS_DIR = "/usr/local/share/docs" }
startup_timeout_sec = 15
tool_timeout_sec = 60
enabled = true
default_tools_approval_mode = "prompt"

# Streamable HTTP server with bearer token
[mcp_servers.github]
url = "https://mcp.github.com/v1"
bearer_token_env_var = "GITHUB_MCP_TOKEN"
http_headers = { "X-Org" = "my-org" }
enabled_tools = ["search_repos", "read_file"]
```
