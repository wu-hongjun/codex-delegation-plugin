---
source_url: https://developers.openai.com/codex/cli/slash-commands
also_at: https://developers.openai.com/codex/guides/slash-commands
canonical_url: https://developers.openai.com/codex/cli/slash-commands
title: Codex CLI Slash Commands
fetched: 2026-05-30
note: Synthesized from two fetches of the slash-commands page. Table preserved; per-workflow detail preserved.
---

# Codex CLI Slash Commands

> Sources: https://developers.openai.com/codex/cli/slash-commands and https://developers.openai.com/codex/guides/slash-commands (same page)

## Overview

Slash commands provide keyboard-first control during interactive Codex CLI sessions. Type `/` in the composer to switch models, adjust permissions, manage conversations, and more without leaving the terminal.

## Built-in Slash Commands Reference

| Command | Purpose | When to use |
|---|---|---|
| `/permissions` | Set Codex action permissions | Adjust approval requirements mid-session |
| `/ide` | Include IDE context | Pull editor state into prompts |
| `/keymap` | Remap keyboard shortcuts | Customize TUI bindings |
| `/vim` | Toggle Vim mode | Switch editing modes |
| `/sandbox-add-read-dir` | Grant sandbox read access | Unblock Windows sandbox directory access |
| `/agent` | Switch agent threads | Inspect subagent work |
| `/apps` | Browse connectors/apps | Attach apps as `$app-slug` |
| `/plugins` | Browse plugins | Install/manage plugin availability |
| `/hooks` | Review lifecycle hooks | Inspect/trust hook configuration |
| `/clear` | Reset terminal & chat | Fresh start without leaving CLI |
| `/compact` | Summarize conversation | Free tokens after long runs |
| `/copy` | Copy latest response | Grab output without manual selection |
| `/diff` | Show Git changes | Review edits before commit |
| `/exit` | Exit CLI | Leave session (same as `/quit`) |
| `/experimental` | Toggle experimental features | Enable subagents, smart approvals |
| `/approve` | Retry denied actions | Retry auto-review denials |
| `/memories` | Configure memory settings | Toggle memory injection/generation |
| `/skills` | Browse/use skills | Apply task-specific behavior |
| `/feedback` | Send diagnostics | Report issues to maintainers |
| `/init` | Generate `AGENTS.md` | Create persistent repo instructions |
| `/logout` | Sign out | Clear credentials |
| `/mcp` | List MCP tools | Check available external tools |
| `/mention` | Attach files | Point Codex to specific files |
| `/model` | Choose active model | Switch between models/reasoning |
| `/fast` | Toggle Fast mode | Enable/disable Fast service tier |
| `/plan` | Enter plan mode | Request execution proposals |
| `/goal` | Set task objective | Track persistent goals |
| `/personality` | Set communication style | Choose friendly/pragmatic tone |
| `/ps` | Check background terminals | Monitor long-running commands |
| `/stop` | Stop background work | Cancel terminal sessions |
| `/fork` | Branch conversation | Explore alternatives in parallel |
| `/side` | Ephemeral side chat | Focused follow-ups without disruption |
| `/raw` | Toggle raw scrollback | Simplify terminal selection |
| `/resume` | Continue saved session | Reload previous conversation |
| `/new` | Start fresh chat | Reset context in same CLI |
| `/quit` | Exit CLI | Leave session |
| `/review` | Review working tree | Get Codex feedback on changes |
| `/status` | Display session info | Confirm model/approvals/tokens |
| `/debug-config` | Show config layers | Debug setting precedence |
| `/statusline` | Configure footer | Pick/reorder status items |
| `/title` | Configure window title | Customize title fields |
| `/theme` | Choose syntax theme | Preview/persist highlighting |

## Workflow notes

### Model & performance
- `/model`: Select from available models (e.g., `gpt-4.1-mini`, `gpt-4.1`).
- `/fast on|off|status`: Toggle Fast service tier when supported by the active model.
- `/personality`: Choose `friendly`, `pragmatic`, or `none`.

### Task management
- `/plan` or `/plan <prompt>`: Enter plan mode (unavailable while a task is running).
- `/goal <objective>`: Set objective (max 4,000 chars). Use `/goal pause|resume|clear`.
- `/review`: Get Codex analysis of the working tree (uses session model or `review_model` config).

### Permissions & safety
- `/permissions`: Switch between Auto, Read Only, Full Access presets.
- `/approve`: Retry a single denied auto-review action.
- `/sandbox-add-read-dir`: Grant Windows sandbox read access for a path.

### Context & conversation
- `/clear`: Reset terminal AND start new chat (Ctrl+L just clears the screen).
- `/compact`: Summarize earlier turns to free tokens (asks for confirmation).
- `/new`: Fresh conversation in the same CLI session.
- `/fork`: Clone current conversation into a new thread.
- `/side`: Ephemeral side conversation that returns to the parent thread.
- `/resume`: Reopen a saved conversation from the session list.
- `/copy` (or Ctrl+O): Copy the latest completed response to the clipboard.

### Interface & tools
- `/ide`: Include the IDE's open files and selection.
- `/vim`: Toggle Vim mode in composer; persist via `tui.vim_mode_default = true`.
- `/keymap`: Browse and remap shortcuts (e.g., `ctrl-a`, `shift-enter`).
- `/statusline`: Configure TUI footer (model, context, git, tokens, session ID).
- `/title`: Customize terminal title fields.
- `/theme`: Preview and persist `.tmTheme` selections.

### Development & inspection
- `/diff`: Git diff including untracked files.
- `/mention <path>`: Attach a file/folder.
- `/mcp` (or `/mcp verbose`): List configured MCP tools and diagnostics.
- `/apps`: Insert `$app-slug` mentions for connectors.
- `/plugins`: Browse plugin marketplace and manage installed plugins.
- `/hooks`: Inspect/trust lifecycle hooks (managed hooks shown as read-only).
- `/skills`: Browse and apply skills.

### Utilities
- `/status`: Model, approval policy, writable roots, token usage (matches `codex status`).
- `/debug-config`: Print config layer precedence/sources.
- `/memories`: Toggle memory injection and generation.
- `/experimental`: Enable optional features (restart may be required).
- `/ps`: Show background terminals and recent output.
- `/stop`: Cancel all background work.
- `/raw [on|off]` (Alt+R): Toggle raw scrollback for easy terminal copy.
- `/init`: Create an `AGENTS.md` scaffold in the current directory.
- `/feedback`: Submit diagnostics to maintainers.
- `/logout`: Clear local credentials.
- `/quit` / `/exit`: Exit the session.

## Behavior notes

- Queue slash commands while Codex is running by typing `/` and pressing **Tab**; they execute after the current turn.
- Slash completion is available before queuing.
- Many settings persist to `config.toml` when saved (e.g., `tui.theme`, statusline order, keymap, vim mode default).
- Some commands are unavailable during active runs or specific modes (e.g., `/plan` cannot be entered while a task is executing).
