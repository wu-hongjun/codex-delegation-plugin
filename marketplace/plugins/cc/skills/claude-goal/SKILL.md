---
name: claude-goal
description: Set a goal condition for a Claude Code background session.
---

You are the Codex skill wrapper for the cc dispatcher's goal
subcommand.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" goal -- "<condition>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the goal
  condition. If empty, ask the user for a condition before running.
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

This skill starts a Claude Code background session with `/goal <condition>`
injected as the opening slash command. The runtime tracks goal-completion
automatically; no interactive approval dialog is required. After the job ID
and Claude session short ID are printed, the user can run:

    claude attach <shortId>

using the printed Claude session short ID inside Claude Code to watch progress
and see when the goal condition is met.

Cost notice:

Goal sessions iterate until the stated condition is satisfied or the session
is stopped. The number of iterations depends on the complexity and scope of
the condition. Consider scoping conditions tightly (e.g., "all unit tests in
src/utils/ pass") to avoid open-ended run time. Use `$claude-stop` to
terminate a goal session early.

### When the goal stalls

If `$claude-status <jobId>` returns `needs_input` on the FIRST poll and stays there, the `/goal` injection failed to reach the model. This is intermittent upstream behavior. Stop the stalled session with `$claude-stop <jobId>` and re-run `$claude-goal` with the same directive. Two consecutive failures with the same directive is unusual; if you see it, try rewording the directive to be more concrete (e.g., add an explicit "Emit the exact text DONE then stop" sentinel).

### Next steps

Goal sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress
- `$claude-result` — read the final output once the goal condition is met
- `$claude-followup` — send an additional instruction mid-run
- `$claude-stop` — terminate the goal session early
