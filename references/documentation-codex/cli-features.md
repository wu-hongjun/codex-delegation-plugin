---
source_url: https://developers.openai.com/codex/cli/features
canonical_url: https://developers.openai.com/codex/cli/features
title: Codex CLI Features
fetched: 2026-05-30
note: Full content extracted from developers.openai.com via WebFetch.
---

# Codex CLI Features

> Source: https://developers.openai.com/codex/cli/features

## Overview
Codex supports workflows beyond chat. This guide explains each workflow and when to use it.

## Running in Interactive Mode

```bash
codex
```

You can specify an initial prompt on the command line:

```bash
codex "Explain this codebase to me"
```

Once the session opens, you can:

- Send prompts, code snippets, or screenshots directly into the composer
- Watch Codex explain its plan before making changes, and approve or reject steps inline
- Read syntax-highlighted markdown code blocks and diffs in the TUI, then use `/theme` to preview and save a preferred theme
- Use `/clear` to wipe the terminal and start fresh chat, or press Ctrl+L to clear the screen without starting a new conversation
- Use `/copy` or press Ctrl+O to copy the latest completed Codex output
- Press Tab while Codex is running to queue follow-up text, slash commands, or `!` shell commands for the next turn
- Navigate draft history in the composer with Up/Down; Codex restores prior draft text and image placeholders
- Press Ctrl+R to search prompt history from the composer, then press Enter to accept a match or Esc to cancel
- Press Ctrl+C or use `/exit` to close the interactive session when done

## Resuming Conversations

Codex stores transcripts locally so you can pick up where you left off instead of repeating context. Use the `resume` subcommand to reopen an earlier thread:

```bash
codex resume
codex resume --all
codex resume --last
codex resume <SESSION_ID>
```

Non-interactive automation runs can resume too:

```bash
codex exec resume --last "Fix the race conditions you found"
codex exec resume 7f9f9a2e-1b3c-4c7a-9b0e-.... "Implement the plan"
```

Each resumed run keeps the original transcript, plan history, and approvals.

## Connect the TUI to a Remote App Server

Remote TUI mode lets you run the Codex app server on one machine and use the terminal UI from another. Start the app server:

```bash
codex app-server --listen ws://127.0.0.1:4500
```

Then connect the TUI to that endpoint:

```bash
codex --remote ws://127.0.0.1:4500
```

For remote access, configure WebSocket auth:

```bash
TOKEN_FILE="$HOME/.codex/app-server-token"
openssl rand -base64 32 > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
codex app-server --listen ws://0.0.0.0:4500 --ws-auth capability-token --ws-token-file "$TOKEN_FILE"
```

Codex supports these WebSocket authentication modes:

- **Capability token**: start the server with `--ws-auth capability-token` and either `--ws-token-file /absolute/path` or `--ws-token-sha256 HEX`
- **Signed bearer token**: start the server with `--ws-auth signed-bearer-token --ws-shared-secret-file /absolute/path`, plus optional `--ws-issuer`, `--ws-audience`, and `--ws-max-clock-skew-seconds`

The TUI sends the remote auth token as an `Authorization: Bearer <token>` header during the WebSocket handshake. Codex only accepts remote auth tokens over `wss://` URLs or loopback `ws://` URLs.

```bash
export CODEX_REMOTE_TOKEN="$(cat "$TOKEN_FILE")"
codex --remote wss://remote-host:4500 --remote-auth-token-env CODEX_REMOTE_TOKEN
```

For SSH remote projects in the Codex app, use [Remote connections](/codex/remote-connections). For managed remote-control clients, `codex remote-control` starts an app-server process with remote-control support enabled.

## Models and Reasoning

For most tasks in Codex, `gpt-5.5` is the recommended model. It is OpenAI's newest frontier model for complex coding, computer use, knowledge work, and research workflows, with stronger planning, tool use, and follow-through on multi-step tasks. For extra fast tasks, ChatGPT Pro subscribers have access to the GPT-5.3-Codex-Spark model in research preview.

Switch models mid-session with the `/model` command, or specify one when launching the CLI:

```bash
codex --model gpt-5.5
```

[Learn more about the models available in Codex](/codex/models).

## Feature Flags

Codex includes a small set of feature flags. Use the `features` subcommand to inspect what's available and to persist changes in your configuration:

```bash
codex features list
codex features enable unified_exec
codex features disable shell_snapshot
```

`codex features enable <feature>` and `codex features disable <feature>` write to `~/.codex/config.toml`. If you launch Codex with `--profile profile-name`, Codex writes to `$CODEX_HOME/profile-name.config.toml` instead.

## Subagents

Use Codex subagent workflows to parallelize larger tasks. For setup, role configuration (`[agents]` in `config.toml`), and examples, see [Subagents](/codex/subagents).

Codex only spawns subagents when you explicitly ask it to. Because each subagent does its own model and tool work, subagent workflows consume more tokens than comparable single-agent runs.

## Image Inputs

Attach screenshots or design specs so Codex can read image details alongside your prompt. You can paste images into the interactive composer or provide files on the command line:

```bash
codex -i screenshot.png "Explain this error"

codex --image img1.png,img2.jpg "Summarize these diagrams"
```

Codex accepts common formats such as PNG and JPEG. Use comma-separated filenames for two or more images, and combine them with text instructions to add context.

## Image Generation

Ask Codex to generate or edit images directly in the CLI. This works well for assets such as icons, banners, illustrations, sprite sheets, and placeholder art. If you want Codex to transform or extend an existing asset, attach a reference image with your prompt.

You can ask in natural language or explicitly invoke the image generation skill by including `$imagegen` in your prompt.

Built-in image generation uses `gpt-image-2`, counts toward your general Codex usage limits, and uses included limits 3-5x faster on average than similar turns without image generation, depending on image quality and size. For details, see [Pricing](/codex/pricing#image-generation-usage-limits). For prompting tips and model details, see the [image generation guide](/api/docs/guides/image-generation).

For larger batches of image generation, set `OPENAI_API_KEY` in your environment variables and ask Codex to generate images through the API so API pricing applies instead.

## Syntax Highlighting and Themes

The TUI syntax-highlights fenced markdown code blocks and file diffs so code is easier to scan during reviews and debugging.

Use `/theme` to open the theme picker, preview themes live, and save your selection to `tui.theme` in `~/.codex/config.toml`. You can also add custom `.tmTheme` files under `$CODEX_HOME/themes` and select them in the picker.

## Running Local Code Review

Type `/review` in the CLI to open Codex's review presets. The CLI launches a dedicated reviewer that reads the diff you select and reports prioritized, actionable findings without touching your working tree. By default it uses the current session model; set `review_model` in `config.toml` to override.

- **Review against a base branch** lets you pick a local branch; Codex finds the merge base against its upstream, diffs your work, and highlights the biggest risks before you open a pull request
- **Review uncommitted changes** inspects everything that's staged, not staged, or not tracked so you can address issues before committing
- **Review a commit** lists recent commits and has Codex read the exact change set for the SHA you choose
- **Custom review instructions** accepts your own wording (for example, "Focus on accessibility regressions") and runs the same reviewer with that prompt

Each run shows up as its own turn in the transcript, so you can rerun reviews as the code evolves and compare the feedback.

## Web Search

Codex ships with a first-party web search tool. For local tasks in the Codex CLI, Codex enables web search by default and serves results from a web search cache. The cache is an OpenAI-maintained index of web results, so cached mode returns pre-indexed results instead of fetching live pages. This reduces exposure to prompt injection from arbitrary live content, but you should still treat web results as untrusted. If you are using `--yolo` or another [full access sandbox setting](/codex/agent-approvals-security), web search defaults to live results. To fetch the most recent data, pass `--search` for a single run or set `web_search = "live"` in [Config basics](/codex/config-basic). You can also set `web_search = "disabled"` to turn the tool off.

You'll see `web_search` items in the transcript or `codex exec --json` output whenever Codex looks something up.

## Running with an Input Prompt

When you just need a quick answer, run Codex with a single prompt and skip the interactive UI:

```bash
codex "explain this codebase"
```

Codex will read the working directory, craft a plan, and stream the response back to your terminal before exiting. Pair this with flags like `--path` to target a specific directory or `--model` to dial in the behavior up front.

## Shell Completions

Speed up everyday usage by installing the generated completion scripts for your shell:

```bash
codex completion bash
codex completion zsh
codex completion fish
```

Run the completion script in your shell configuration file to set up completions for new sessions. For example, if you use `zsh`, you can add the following to the end of your `~/.zshrc` file:

```bash
# ~/.zshrc
eval "$(codex completion zsh)"
```

Start a new session, type `codex`, and press Tab to see the completions. If you see a `command not found: compdef` error, add `autoload -Uz compinit && compinit` to your `~/.zshrc` file before the `eval "$(codex completion zsh)"` line, then restart your shell.

## Approval Modes

Approval modes define how much Codex can do without stopping for confirmation. Use `/permissions` inside an interactive session to switch modes as your comfort level changes.

- **Auto** (default) lets Codex read files, edit, and run commands within the working directory. It still asks before touching anything outside that scope or using the network
- **Read-only** keeps Codex in a consultative mode. It can browse files but won't make changes or run commands until you approve a plan
- **Full Access** grants Codex the ability to work across your machine, including network access, without asking. Use it sparingly and only when you trust the repository and task

Codex always surfaces a transcript of its actions, so you can review or roll back changes with your usual git workflow.

## Scripting Codex

Automate workflows or wire Codex into your existing scripts with the `exec` subcommand. This runs Codex non-interactively, piping the final plan and results back to `stdout`:

```bash
codex exec "fix the CI failure"
```

Combine `exec` with shell scripting to build custom workflows, such as automatically updating changelogs, sorting issues, or enforcing editorial checks before a PR ships.

## Working with Codex Cloud

The `codex cloud` command lets you triage and launch [Codex cloud tasks](/codex/cloud) without leaving the terminal. Run it with no arguments to open an interactive picker, browse active or finished tasks, and apply the changes to your local project.

You can also start a task directly from the terminal:

```bash
codex cloud exec --env ENV_ID "Summarize open bugs"
```

Add `--attempts` (1–4) to request best-of-N runs when you want Codex cloud to generate more than one solution. For example, `codex cloud exec --env ENV_ID --attempts 3 "Summarize open bugs"`.

Environment IDs come from your Codex cloud configuration—use `codex cloud` and press Ctrl+O to choose an environment or the web dashboard to confirm the exact value. Authentication follows your existing CLI login, and the command exits non-zero if submission fails so you can wire it into scripts or CI.

## Slash Commands

Slash commands give you quick access to specialized workflows like `/review`, `/fork`, `/side`, or your own reusable prompts. Codex ships with a curated set of built-ins, and you can create custom ones for team-specific tasks or personal shortcuts.

See the [slash commands guide](/codex/guides/slash-commands) to browse the catalog of built-ins, learn how to author custom commands, and understand where they live on disk.

## Prompt Editor

When you're drafting a longer prompt, it can be easier to switch to a full editor and then send the result back to the composer.

In the prompt input, press Ctrl+G to open the editor defined by the `VISUAL` environment variable (or `EDITOR` if `VISUAL` isn't set).

## Model Context Protocol (MCP)

Connect Codex to more tools by configuring Model Context Protocol servers. Add STDIO or streaming HTTP servers in `~/.codex/config.toml`, or manage them with the `codex mcp` CLI commands—Codex launches them automatically when a session starts and exposes their tools next to the built-ins. You can even run Codex itself as an MCP server when you need it inside another agent.

See [Model Context Protocol](/codex/mcp) for example configurations, supported auth flows, and a more detailed guide.

## Tips and Shortcuts

- Type `@` in the composer to open a fuzzy file search over the workspace root; press Tab or Enter to drop the highlighted path into your message
- Press Enter while Codex is running to inject new instructions into the current turn, or press Tab to queue follow-up input for the next turn. Queued input can be a normal prompt, a slash command such as `/review`, or a `!` shell command. Codex parses queued slash commands when they run
- Prefix a line with `!` to run a local shell command (for example, `!ls`). Codex treats the output like a user-provided command result and still applies your approval and sandbox settings
- Tap Esc twice while the composer is empty to edit your previous user message. Continue pressing Esc to walk further back in the transcript, then hit Enter to fork from that point
- Launch Codex from any directory using `codex --cd <path>` to set the working root without running `cd` first. The active path appears in the TUI header
- Expose more writable roots with `--add-dir` (for example, `codex --cd apps/frontend --add-dir ../backend --add-dir ../shared`) when you need to coordinate changes across more than one project
- Make sure your environment is already set up before launching Codex so it doesn't spend tokens probing what to activate. For example, source your Python virtual environment (or other language environments), start any required daemons, and export the environment variables you expect to use ahead of time

## In-Page Links

- [Remote connections](/codex/remote-connections)
- [Models](/codex/models)
- [Subagents](/codex/subagents)
- [Pricing](/codex/pricing#image-generation-usage-limits)
- [Image generation guide](/api/docs/guides/image-generation)
- [Codex cloud tasks](/codex/cloud)
- [Slash commands guide](/codex/guides/slash-commands)
- [Model Context Protocol](/codex/mcp)
- [Full-access sandbox setting](/codex/agent-approvals-security)
- [Config basics](/codex/config-basic)
