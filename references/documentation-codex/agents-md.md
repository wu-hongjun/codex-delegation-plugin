---
source_url: https://developers.openai.com/codex/guides/agents-md
canonical_url: https://developers.openai.com/codex/guides/agents-md
title: AGENTS.md — Custom Instructions
fetched: 2026-05-30
also_see: github/agents_md.md (repo stub) and github/REPO_AGENTS.md (the Codex repo's own AGENTS.md, a real-world example).
---

# Custom Instructions with AGENTS.md

> Source: https://developers.openai.com/codex/guides/agents-md

`AGENTS.md` files give Codex persistent guidance for a directory or project.

## Discovery process

Codex builds the instruction chain in this order:

1. **Global scope** — checks `~/.codex/AGENTS.override.md` first, then `~/.codex/AGENTS.md`.
2. **Project scope** — walks from the Git root down to the current directory, checking for `AGENTS.override.md` and `AGENTS.md` at each level.
3. **Merge order** — combines files from the root downward; the closer files override earlier ones.

Loading stops once combined files reach `project_doc_max_bytes` (default **32 KiB**).

## Implementation patterns

- **Global preferences**: `~/.codex/AGENTS.md` for reusable preferences (test commands, package manager, default style).
- **Project layering**: an `AGENTS.md` at repo root for shared norms, plus nested `AGENTS.override.md` files for team-specific rules. Example: a `payments/` service can override the parent's test commands or security protocol.

## Customization

- Add alternative filenames to `~/.codex/config.toml` to recognize files like `TEAM_GUIDE.md` as instruction files.
- Set `CODEX_HOME` to switch between distinct profiles (e.g., one for personal use, one for automation).

## Verification

Confirm which files Codex actually loaded:

```bash
codex --ask-for-approval never "Summarize current instructions"
```

You can also inspect the TUI plaintext output or the session log files to audit the active instruction set.

## Hierarchical scope (from the repo stub)

When the `child_agents_md` feature flag is enabled (via `[features]` in `config.toml`), Codex appends additional guidance about AGENTS.md scope and precedence to the user instructions message, and emits that message even when no AGENTS.md is present.

## Real-world example

The OpenAI Codex repository's own AGENTS.md is fetched at `github/REPO_AGENTS.md` — a useful real-world template.
