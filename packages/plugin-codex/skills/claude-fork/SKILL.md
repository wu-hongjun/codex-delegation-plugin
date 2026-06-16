---
name: claude-fork
description: Fork a Claude Code subagent for a directive (spawns a parallel subagent in a background session).
---

You are the Codex skill wrapper for the cc dispatcher's fork
subcommand.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" fork -- "<directive>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the fork
  directive. If empty, ask the user for a directive before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`,
  `--mcp-config`, `--agent`, `--agents`, `--allowedTools`,
  `--allowed-tools`, `--disallowedTools`, `--disallowed-tools`, `--tools`,
  `--settings`, `--setting-sources`, `--strict-mcp-config`,
  `--append-system-prompt`, `--system-prompt`, `--plugin-dir`,
  `--plugin-url`, `--bare`, `--safe-mode`, `--ide`, `--chrome`,
  `--no-chrome`, `--disable-slash-commands`,
  `--exclude-dynamic-system-prompt-sections`, `--verbose`, `--json`.
- The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

This skill starts a Claude Code background session with `/fork <directive>`
injected as the opening slash command. The runtime spawns a real subagent
process to execute the directive; the parent session completes when the
subagent finishes. After the job ID and Claude session short ID are printed, the user can run:

    claude attach <shortId>

using the printed Claude session short ID inside Claude Code to watch progress.

Cost notice:

`/fork` directives spawn a full subagent — even a trivial directive can consume
20-30k tokens. The subagent runs its own full conversation turn, reading files
and executing tools independently of the parent session. Consider scope before
delegating. Use `$claude-stop` to terminate a fork session early.

### Next steps

Fork sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress
- `$claude-result` — read the final output once the subagent completes
- `$claude-followup` — send an additional instruction mid-run
- `$claude-stop` — terminate the fork session early
