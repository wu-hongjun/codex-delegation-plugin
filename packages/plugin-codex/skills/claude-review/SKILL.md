---
name: claude-review
description: Review the output of a Claude job by reusing its existing Claude Code session (lightweight; same-session).
---

You are the Codex skill wrapper for sending a structured review turn to an
existing Claude background job created by `$claude-delegate`.

1. The user invokes you like:
   `$claude-review <jobId-or-prefix>`.
   The first token after `$claude-review` is the job id (or a job-id prefix).
   If the user does not provide a job id, ask for it before running.

2. Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
   (so `<plugin-root>/scripts/claude-companion.mjs` is the dispatcher).

3. Run the dispatcher:

       node "<plugin-root>/scripts/claude-companion.mjs" review <jobId-or-prefix> [flags]

   Forward only these flags **when the user explicitly requests them**:
   `--all`, `--json`, `--yes`.
   Do NOT forward `--allow-edit`, `--model`, `--effort`, `--permission-mode`,
   `--add-dir`, `--mcp-config`, or `--name` — they are not applicable to this
   subcommand. Do NOT inject `--yes` automatically. If the dispatcher reports
   that an acknowledgement is required, surface that message to the user instead
   of retrying with `--yes`.

4. Return the dispatcher's stdout verbatim. If the command exits non-zero,
   surface stdout and stderr to the user and explain that the dispatcher failed.
   Do not reimplement the command logic yourself.

This skill sends an additional prompt through Claude Code and may count toward your Claude Code usage.

Note: By default, the review evaluates the latest completed non-review turn.
Reviewing a review is allowed but not recommended; use a future explicit
turn-selection feature if you need that workflow.

### Next steps

After a lightweight review, the user typically wants one of:

- `$claude-adversarial-review` — get an independent second-opinion review
- `$claude-result` — re-read the original job output
