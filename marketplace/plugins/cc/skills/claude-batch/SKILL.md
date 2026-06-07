---
name: claude-batch
description: Run a batch of Claude Code instructions via the Batch Parallel Work Orchestration runtime.
---

You are the Codex skill wrapper for the Claude Companion dispatcher's batch
subcommand.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/cc.mjs" batch -- "<instruction>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the batch
  instruction. If empty, ask the user for an instruction before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--mcp-config`, `--json`.
- The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

This skill starts a Claude Code background session with `/batch <instruction>`
injected as the opening slash command. The runtime injects a
`# Batch: Parallel Work Orchestration` system prompt that sets up the model to
orchestrate a parallelizable change: research and plan (plan mode), then
decompose into tasks and execute them in parallel. No interactive approval
dialog is required. After the job ID is printed, the user can run:

    claude attach <jobId>

inside a Claude Code session to watch progress.

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
