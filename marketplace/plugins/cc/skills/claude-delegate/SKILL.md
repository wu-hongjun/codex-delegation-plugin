---
name: claude-delegate
description: Delegate a coding task to Claude Code as a background sub-agent.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" delegate -- "<task prompt>"

Forwarded flags go before `--`; everything after `--` is the prompt verbatim.
Example:

    node "<plugin-root>/scripts/cc.mjs" delegate --model claude-opus-4-8 --name audit -- "<task prompt>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the task prompt.
  If empty, ask the user for the task prompt before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`,
  `--mcp-config`, `--agent`, `--agents`, `--allowedTools`,
  `--allowed-tools`, `--disallowedTools`, `--disallowed-tools`, `--tools`,
  `--settings`, `--setting-sources`, `--strict-mcp-config`,
  `--append-system-prompt`, `--system-prompt`, `--plugin-dir`,
  `--plugin-url`, `--bare`, `--safe-mode`, `--ide`, `--chrome`,
  `--no-chrome`, `--disable-slash-commands`,
  `--exclude-dynamic-system-prompt-sections`, `--verbose`, `--allow-edit`,
  `--json`.
- `--name` is a **human-readable label**, not a session key. Every job gets a
  unique session name regardless: the dispatcher appends a random suffix, so the
  real session name is `<your-name>-<random>` (since v0.3.4). This means reusing the same
  `--name` does NOT resume a job — it starts a fresh, isolated session. To continue
  an existing job, use `$claude-followup <jobId>` (the jobId from delegate's output),
  never a reused `--name`. Omitting `--name` is fine; the auto-generated name is
  already unique and collision-safe even under heavy concurrency.
- The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.
- For unattended local QA lanes that intentionally inspect the repo with shell
  commands, the user may explicitly request
  `--permission-mode bypassPermissions` or the Claude Code alias
  `--dangerously-skip-permissions`. Do NOT inject this automatically; it is an
  operator choice that bypasses Claude Code's normal permission prompts for that
  spawned session. If a delegated job later shows `waitingFor: "permission prompt"`,
  report the blocked state and the `claude attach <shortId>` command from
  `$claude-status --job <jobId> --json --compact`; do not try to approve the
  permission prompt yourself.

`$claude-delegate -- "/<saved-or-bundled-workflow-name> <args>"` also invokes saved workflows and bundled slash commands (e.g. `/deep-research <question>`). See `$claude-workflow` for details on saved-workflow invocation.

### Next steps

After delegating, the user typically wants one of:

- `$claude-status` — check live progress of all open jobs
- `$claude-result` — read the final answer when the job completes
- `$claude-result <jobId> --partial` — read recorded partial output from a
  running or permission-blocked job
- `$claude-followup` — send an additional instruction to the same job
- `$claude-stop` — terminate the job early

### Fan-out tip

For large parallelizable tasks, phrase the prompt to request explicit parallel decomposition (e.g. "use parallel subagents, one per directory"). See the `## Subagent fan-out patterns (Codex → Claude Code)` section of the plugin README for a decision matrix and example prompts. If the task has multiple dependent phases, prefer `$claude-workflow` instead.
