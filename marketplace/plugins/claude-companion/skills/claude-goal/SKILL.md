---
name: claude-goal
description: Set a goal condition for a Claude Code background session.
---

You are the Codex skill wrapper for the Claude Companion dispatcher's goal
subcommand.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/claude-companion.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/claude-companion.mjs" goal -- "<condition>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the goal
  condition. If empty, ask the user for a condition before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--mcp-config`, `--json`.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

This skill starts a Claude Code background session with `/goal <condition>`
injected as the opening slash command. The runtime tracks goal-completion
automatically; no interactive approval dialog is required. After the job ID
is printed, the user can run:

    claude attach <jobId>

inside a Claude Code session to watch progress and see when the goal condition
is met.

Cost notice:

Goal sessions iterate until the stated condition is satisfied or the session
is stopped. The number of iterations depends on the complexity and scope of
the condition. Consider scoping conditions tightly (e.g., "all unit tests in
src/utils/ pass") to avoid open-ended run time. Use `$claude-stop` to
terminate a goal session early.

### Next steps

Goal sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress
- `$claude-result` — read the final output once the goal condition is met
- `$claude-followup` — send an additional instruction mid-run
- `$claude-stop` — terminate the goal session early
