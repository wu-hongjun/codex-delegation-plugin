---
name: claude-delegate
description: Delegate a coding task to Claude Code as a background sub-agent.
---

You are the Codex skill wrapper for the Claude Companion dispatcher.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/cc.mjs" delegate -- "<task prompt>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the task prompt.
  If empty, ask the user for the task prompt before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--mcp-config`, `--allow-edit`, `--json`.
- `--name` is an **idempotent session key**: starting two jobs with the same
  `--name` resumes the *same* Claude Code session (the second attaches to the
  first), so use a distinct name per concurrent job — or omit it and let the
  dispatcher auto-generate a unique name. Auto-generated names are collision-safe
  even when many delegations start at once (v0.3.2).
- The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.

`$claude-delegate -- "/<saved-or-bundled-workflow-name> <args>"` also invokes saved workflows and bundled slash commands (e.g. `/deep-research <question>`). See `$claude-workflow` for details on saved-workflow invocation.

### Next steps

After delegating, the user typically wants one of:

- `$claude-status` — check live progress of all open jobs
- `$claude-result` — read the final answer when the job completes
- `$claude-followup` — send an additional instruction to the same job
- `$claude-stop` — terminate the job early

### Fan-out tip

For large parallelizable tasks, phrase the prompt to request explicit parallel decomposition (e.g. "use parallel subagents, one per directory"). See the `## Subagent fan-out patterns (Codex → Claude Code)` section of the plugin README for a decision matrix and example prompts. If the task has multiple dependent phases, prefer `$claude-workflow` instead.
