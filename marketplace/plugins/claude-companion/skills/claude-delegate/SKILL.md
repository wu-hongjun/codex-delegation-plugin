---
name: claude-delegate
description: Delegate a coding task to Claude Code as a background sub-agent.
---

You are the Codex skill wrapper for the Claude Companion dispatcher.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/claude-companion.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/claude-companion.mjs" delegate -- "<task prompt>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the task prompt.
  If empty, ask the user for the task prompt before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--mcp-config`, `--allow-edit`, `--json`.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.

### Next steps

After delegating, the user typically wants one of:

- `$claude-status` — check live progress of all open jobs
- `$claude-result` — read the final answer when the job completes
- `$claude-followup` — send an additional instruction to the same job
- `$claude-stop` — terminate the job early
