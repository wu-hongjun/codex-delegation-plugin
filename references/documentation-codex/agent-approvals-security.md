---
source_url: https://developers.openai.com/codex/agent-approvals-security
canonical_url: https://developers.openai.com/codex/agent-approvals-security
title: Agent Approvals & Security (Sandboxing model)
fetched: 2026-05-30
---

# Agent Approvals & Security

> Source: https://developers.openai.com/codex/agent-approvals-security

Codex security is two layers:

- **Sandbox mode** — what can technically execute
- **Approval policy** — when user confirmation is required

> "Codex helps protect your code and data and reduces the risk of misuse."

## Sandbox by environment

| Surface | Mechanism |
|---|---|
| Codex Cloud | Isolated OpenAI containers. Two-phase runtime: setup phase has network for dependencies, agent phase is offline by default. |
| CLI / IDE | OS-level sandboxing: Seatbelt (macOS), bwrap (Linux), native sandbox (Windows). Active workspace only; network disabled by default. |

## Default posture

Codex detects version control status and recommends:

- **Inside a VCS repo** — Auto mode (workspace write + approval on request)
- **Outside a VCS repo** — Read-only mode

Protected paths within writable roots — **always read-only** even in workspace-write:

- `.git`
- `.agents`
- `.codex`

## Network controls

Network is **disabled by default**. When enabled, allowlists are configured via `network_proxy`:

- Exact host match
- Wildcards: `*.example.com`, `**.example.com`
- Deny rules **override** allow rules
- Local binding restrictions block loopback/private IPs by default
- DNS rebinding protection

## Approval policies

Values:

- `on-request` — prompt for sandbox escalations, network access, destructive ops
- `never` — disable approval prompts entirely
- `untrusted` — auto-approve safe reads, prompt for state-mutating commands
- **Granular** — selectively pick which categories prompt vs. auto-approve

## Auto-review

```toml
approvals_reviewer = "auto_review"
```

Eligible approval requests go through a **reviewer agent** that checks for:

- Data exfiltration
- Credential probing
- Security weakening
- Destructive actions

Uses extra model calls; adds to usage costs.

## Telemetry (optional)

OpenTelemetry export is **disabled by default**. Admins can configure:

- Exporters: OTLP HTTP / gRPC
- `log_user_prompt = false` to redact prompts
- Event coverage: conversations, API requests, tool decisions, results

## Platform specifics

| OS | Implementation |
|---|---|
| macOS | Seatbelt via `sandbox-exec` |
| Linux | bwrap + seccomp; containerized environments may require `--sandbox danger-full-access` |
| Windows | Native sandbox (elevated/unelevated) or WSL2 |

## Enterprise management

Admins configure security at the tenant level via **Managed configuration** (`requirements.toml`):

- Network requirements
- Approval policies
- Guardian review policies
