---
source_url: https://developers.openai.com/codex/environment-variables
canonical_url: https://developers.openai.com/codex/environment-variables
title: Environment Variables
fetched: 2026-05-30
---

# Environment Variables — Codex

> Source: https://developers.openai.com/codex/environment-variables

## Core locations

| Variable | Default | Description |
|---|---|---|
| `CODEX_HOME` | `~/.codex` | Sets the root for Codex state — config, auth, logs, sessions, skills, standalone package metadata. |
| `CODEX_SQLITE_HOME` | `CODEX_HOME` | Where SQLite-backed state is stored; an in-config option takes precedence if set. |

## Installer

| Variable | Default | Description |
|---|---|---|
| `CODEX_NON_INTERACTIVE` | `false` | Set to `1`, `true`, or `yes` to skip installer prompts. |
| `CODEX_INSTALL_DIR` | `~/.local/bin` (macOS/Linux); `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` (Windows) | Where the visible `codex` command is installed. |

## Authentication & network

| Variable | Description |
|---|---|
| `CODEX_API_KEY` | API key for a single non-interactive `codex exec` run. |
| `CODEX_ACCESS_TOKEN` | ChatGPT/Codex access token for trusted automation. |
| `CODEX_CA_CERTIFICATE` | PEM CA bundle path for environments with corporate TLS interception / private root CAs. |
| `SSL_CERT_FILE` | Fallback PEM CA bundle path used when `CODEX_CA_CERTIFICATE` is unset. |

## Diagnostics

| Variable | Description |
|---|---|
| `RUST_LOG` | Rust log filter. Accepts `error`, `warn`, `info`, `debug`, `trace` (and standard env-filter syntax). |

## Examples

Non-interactive install:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
```

Windows PowerShell:

```powershell
$env:CODEX_NON_INTERACTIVE=1; irm https://chatgpt.com/codex/install.ps1 | iex
```

Debug logging:

```bash
RUST_LOG=debug codex -c log_dir=./.codex-log
tail -F ./.codex-log/codex-tui.log
```
