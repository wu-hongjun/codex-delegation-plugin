---
source_url: https://developers.openai.com/codex/config-sample
canonical_url: https://developers.openai.com/codex/config-sample
title: Sample Configuration (config.toml)
fetched: 2026-05-30
note: WebFetch returned a section-by-section summary. The verbatim sample lives at the source URL; this file enumerates each section + accepted values.
---

# Sample Configuration — Codex

> Source: https://developers.openai.com/codex/config-sample

Place at `~/.codex/config.toml` (user-wide) or `.codex/config.toml` (project). Use `--profile` to point at alternate files such as `~/.codex/ci.config.toml`.

## Sections covered in the sample

### Core model selection

- Primary model — recommended `"gpt-5.5"`
- Optional `review_model` override
- Provider selection and service-tier configuration
- Context window and token limits

### Reasoning & verbosity

- Reasoning effort: `minimal`, `low`, `medium`, `high`, `xhigh`
- Plan-mode reasoning effort override
- Reasoning summary modes: `auto`, `concise`, `detailed`, `none`
- Text verbosity for GPT-5 family

### Instruction overrides

- Developer instructions injected before AGENTS.md
- History compaction prompt customization
- Git commit attribution
- Base instructions file path override

### Approval & sandbox

- Approval policies: `untrusted`, `on-request`, `never`, or granular block
- Sandbox modes: `read-only`, `workspace-write`, `danger-full-access`
- Login shell semantics
- Permissions profile selection

### Authentication & login

- CLI credential storage: `file`, `keyring`, `auto`
- ChatGPT and OpenAI base URL config
- MCP OAuth credential handling
- Callback port and redirect URI customization

### History & UI

- File opener URI schemes: `vscode`, `cursor`, `windsurf`, etc.
- TUI notifications and animations
- Theme and keybinding customization
- Analytics and feedback controls

### Advanced features

- `web_search`: `disabled`, `cached`, `live`
- Multi-agent thread limits and nesting depth
- Skill-specific overrides
- Memory generation and usage settings
- Lifecycle hooks configuration

### MCP servers

- STDIO transport
- Streamable HTTP transport
- OAuth scope and resource specification
- Tool enable/disable lists

### Model providers

- Built-in: OpenAI, Ollama, LM Studio, Amazon Bedrock
- Custom provider definitions
- Azure / OpenAI-compatible endpoints
- Command-backed bearer token authentication

### Tools & integrations

- App connector controls and approval modes
- Tool suggestion allowlists
- OpenTelemetry (`[otel]`) configuration
- Windows sandbox mode settings

## See also

- [`config-basic.md`](./config-basic.md)
- [`config-advanced.md`](./config-advanced.md)
- [`config-reference.md`](./config-reference.md)
- [`environment-variables.md`](./environment-variables.md)
