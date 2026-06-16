---
name: claude-adversarial-review
description: Run an adversarial code review of a Claude job in a fresh independent Claude Code session (thorough; eliminates confirmation bias).
---

You are the Codex skill wrapper for running an adversarial (fresh-session)
structured review of an existing Claude background job created by
`$claude-delegate`.

1. The user invokes you like:
   `$claude-adversarial-review <jobId-or-prefix>`.
   The first token after `$claude-adversarial-review` is the job id (or a
   job-id prefix). If the user does not provide a job id, ask for it before
   running.

2. Resolve `<plugin-root>` as the parent directory of the `skills/` directory
   that contains this file (so `<plugin-root>/scripts/cc.mjs` is the
   dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

3. Run the dispatcher:

       node "<plugin-root>/scripts/cc.mjs" adversarial-review <jobId-or-prefix> [flags]

   The dispatcher constructs the adversarial review prompt internally — do NOT
   pass an empty prompt and do NOT append `--` to the run line.

   Forward only these flags **when the user explicitly requests them**:
   `--all`, `--json`, `--yes`, `--model`, `--effort`, `--permission-mode`,
   `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`,
   `--agent`, `--agents`, `--allowedTools`, `--allowed-tools`,
   `--disallowedTools`, `--disallowed-tools`, `--tools`, `--settings`,
   `--setting-sources`, `--strict-mcp-config`, `--append-system-prompt`,
   `--system-prompt`, `--plugin-dir`, `--plugin-url`, `--bare`, `--safe-mode`,
   `--ide`, `--chrome`, `--no-chrome`, `--disable-slash-commands`,
   `--exclude-dynamic-system-prompt-sections`, `--verbose`, `--blocking`,
   `--fail-on`.
   The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
   Do NOT forward `--allow-edit`, `--add-dir`, `--mcp-config`, or `--name` —
   they are not applicable to this subcommand. Do NOT inject `--yes`
   automatically. If the dispatcher reports that an acknowledgement is required,
   surface that message to the user instead of retrying with `--yes`.

4. Return the dispatcher's stdout verbatim. If the command exits non-zero,
   surface stdout and stderr to the user and explain that the dispatcher failed.
   Do not reimplement the command logic yourself.

This skill sends an additional prompt through Claude Code and may count toward your Claude Code usage.

### Next steps

After an adversarial review, the user typically wants one of:

- `$claude-status` — check the status of the adversarial review session
- `$claude-result` — read the review verdict once the session completes
