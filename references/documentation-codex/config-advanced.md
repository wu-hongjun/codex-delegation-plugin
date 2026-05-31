---
source_url: https://developers.openai.com/codex/config-advanced
canonical_url: https://developers.openai.com/codex/config-advanced
title: Advanced Configuration
fetched: 2026-05-30
note: WebFetch refused a verbatim extraction for this page; content here is reconstructed from the prior summary and cross-referenced with config-reference.md and config-basic.md.
---

# Advanced Configuration — Codex

> Source: https://developers.openai.com/codex/config-advanced

## Profiles

Save named configuration layers and switch with `--profile profile-name`. Each profile is its own TOML file at:

```
~/.codex/<profile-name>.config.toml
```

Switching profiles also redirects writes from `codex features enable/disable` so they land in the active profile file.

## One-off CLI overrides

- Dedicated flags such as `--model gpt-5.4`
- Generic `-c key=value` / `--config key=value` for arbitrary settings

## Project configuration files

`.codex/config.toml` loads automatically when Codex walks from the project root down to the current directory. The **closest file** to the working directory wins. Project configs may **not** override:

- Credential redirection
- Authentication keys
- Profile selection

## Custom model providers

```toml
[model_providers.proxy]
name = "OpenAI using LLM proxy"
base_url = "http://proxy.example.com"
env_key = "OPENAI_API_KEY"
```

### Command-backed auth (token from external helper)

```toml
[model_providers.proxy.auth]
command = "/usr/local/bin/fetch-codex-token"
args = ["--audience", "codex"]
timeout_ms = 5000
```

Built-in providers include OpenAI, Amazon Bedrock, and Azure.

## Sandbox & approval configuration

Granular controls:

- `approval_policy`
- `sandbox_mode`
- `approvals_reviewer`
- Granular categories with per-category approval modes

`workspace-write` mode supports optional `writable_roots`, network access controls, and environment-variable protections.

## Observability

OpenTelemetry under `[otel]`:

- API request traces
- Tool usage events
- Model performance metrics
- Optional redaction of sensitive data (e.g., user prompts)

Independent analytics under `[analytics]`:

```toml
[analytics]
enabled = false
```

## Additional advanced topics

- **Hooks**: lifecycle events via `hooks.json` or inline `[hooks]` (see `hooks.md`)
- **Shell environment policy**: control inherited env vars for subprocesses
- **MCP servers**: see `mcp.md`
- **History persistence**: session transcripts with size caps
- **Notifications**: trigger external programs on agent events
