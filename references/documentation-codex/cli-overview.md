---
source_url: https://developers.openai.com/codex/cli
canonical_url: https://developers.openai.com/codex/cli
title: Codex CLI Overview
fetched: 2026-05-30
note: WebFetch returned a content summary rather than a verbatim transcript. See cli-features.md for the verbatim flag/usage walkthrough.
---

# Codex CLI Overview

> Source: https://developers.openai.com/codex/cli

**Codex CLI** is OpenAI's coding agent that you run locally from your terminal. It can read, change, and run code on your machine inside the selected directory.

- Open source
- Built in Rust for performance
- Available on ChatGPT Plus, Pro, Business, Edu, and Enterprise plans

## Installation

```bash
# macOS / Linux
curl -fsSL https://chatgpt.com/codex/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"

# npm
npm install -g @openai/codex

# Homebrew
brew install --cask codex
```

Set `CODEX_NON_INTERACTIVE=1` for unattended installs.

## Capabilities highlighted on this page

- Interactive terminal UI sessions
- Model switching between GPT-5.4 and GPT-5.3-Codex (and newer; see `cli-features.md`)
- Image input attachments (screenshots, design specs)
- Image generation / editing
- Local code review (`/review`)
- Subagent support for parallel tasks
- Web search integration
- Codex Cloud task launching from the terminal
- Scripting via `codex exec`
- Model Context Protocol (MCP) support
- Multiple approval modes (Auto / Read Only / Full Access)

## Related docs

- `/codex/cli/features` — Features and flags (see `cli-features.md`)
- `/codex/learn/best-practices` — Best practices
- `/codex/pricing` — Pricing
- `/codex/changelog` — Release notes
- `/codex/windows` — Windows setup
- `/codex/subagents` — Subagents
- `/codex/mcp` — Model Context Protocol (see `mcp.md`)
- `/codex/noninteractive` — Scripting / `codex exec`
