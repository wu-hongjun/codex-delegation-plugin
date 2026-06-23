---
name: claude-batch
description: Run a batch of Claude Code instructions via the Batch Parallel Work Orchestration runtime.
---

You are the Codex skill wrapper for the cc dispatcher's batch
subcommand.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" batch -- "<instruction>"

Forwarded flags go before `--`; everything after `--` is the instruction
verbatim. Example:

    node "<plugin-root>/scripts/cc.mjs" batch --model claude-opus-4-8 --name migration -- "<instruction>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the batch
  instruction. If empty, ask the user for an instruction before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--bypass-permissions`, `--dangerously-skip-permissions`,
  `--allow-dangerously-skip-permissions`, `--mcp-config`, `--agent`, `--agents`, `--allowedTools`,
  `--allowed-tools`, `--disallowedTools`, `--disallowed-tools`, `--tools`,
  `--settings`, `--setting-sources`, `--strict-mcp-config`,
  `--append-system-prompt`, `--system-prompt`, `--plugin-dir`,
  `--plugin-url`, `--bare`, `--safe-mode`, `--ide`, `--chrome`,
  `--no-chrome`, `--disable-slash-commands`,
  `--exclude-dynamic-system-prompt-sections`, `--verbose`, `--json`.
- The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do not inject `--yes` for ordinary jobs. Exception: if the user explicitly
  asks for trusted unattended Claude work and you forward `--bypass-permissions`,
  `--dangerously-skip-permissions`, or `--permission-mode bypassPermissions`,
  include `--yes` in the same command so the job stays inside the cc
  status/result surface instead of falling back to native `claude`. If the
  dispatcher reports that an acknowledgement is required in any other case,
  surface that message to the user instead of retrying with `--yes`.
- For unattended local QA lanes that intentionally inspect the repo with shell
  commands, the user may explicitly request `--bypass-permissions`,
  `--permission-mode bypassPermissions`, or the Claude Code alias
  `--dangerously-skip-permissions`. Treat an explicit user preference for
  trusted unattended Claude work in the current task/session/project as
  sufficient permission to use `--bypass-permissions` for future fresh local
  shell/tool automation jobs. Do not infer that preference from ordinary
  delegation requests.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

This skill starts a Claude Code background session with `/batch <instruction>`
injected as the opening slash command. The runtime injects a
`# Batch: Parallel Work Orchestration` system prompt that sets up the model to
orchestrate a parallelizable change: research and plan (plan mode), then
decompose into tasks and execute them in parallel. No interactive approval
dialog is required for the batch wrapper itself, but Claude Code can still ask
for tool/permission approval inside the spawned session. After the job ID and
Claude session short ID are printed, the user can run:

    claude attach <shortId>

using the printed Claude session short ID inside Claude Code to watch progress.

Cost notice:

Batch sessions can spawn multiple parallel tool-calls and subagents. The
orchestration system prompt drives research, planning, and parallel execution
phases — token usage scales with the number of affected files and the
complexity of the instruction. Consider scoping instructions tightly to avoid
open-ended run time. Use `$claude-stop` to terminate a batch session early.

### Next steps

Batch sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress
- `$claude-result` — read the final output once the batch completes
- `$claude-followup` — send an additional instruction mid-run
- `$claude-stop` — terminate the batch session early
