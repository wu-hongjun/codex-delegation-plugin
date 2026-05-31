---
source_url: https://raw.githubusercontent.com/openai/codex/main/docs/install.md
canonical_url: https://github.com/openai/codex/blob/main/docs/install.md
title: Install Codex CLI
fetched: 2026-05-30
note: This is the verbatim install doc from the openai/codex repo (the developers.openai.com page wraps the same content).
---

# Install Codex CLI

> Source: `github.com/openai/codex` → `docs/install.md` (also cached locally at `github/install.md`)

The contents of `docs/install.md` in the upstream repo are reproduced verbatim in the local fetch at `github/install.md`. Key points from that file:

## Install command summary

```bash
# macOS / Linux (default install location ~/.local/bin)
curl -fsSL https://chatgpt.com/codex/install.sh | sh

# Windows (PowerShell, default %LOCALAPPDATA%\Programs\OpenAI\Codex\bin)
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"

# npm (global)
npm install -g @openai/codex

# Homebrew (macOS cask)
brew install --cask codex
```

## Non-interactive install

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
```

```powershell
$env:CODEX_NON_INTERACTIVE=1; irm https://chatgpt.com/codex/install.ps1 | iex
```

## Custom install directory

`CODEX_INSTALL_DIR` overrides the default location.

For the full verbatim content (including version checks, PATH guidance, uninstall flow, and platform-specific notes), open the cached file at `github/install.md`.
