---
name: claude-deep-research
description: "Run a Claude Code dynamic deep-research workflow on a question (multi-agent fan-out with WebSearch + cross-checked citations)."
---

You are the Codex skill wrapper for the delegate dispatcher's
deep-research subcommand.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/delegate.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/delegate.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/delegate.mjs" deep-research -- "<question>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the research
  question. If empty, ask the user for a question before running.
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
  include `--yes` in the same command so the job stays inside the delegate
  status/result surface instead of falling back to native `claude`. If the
  dispatcher reports that an acknowledgement is required in any other case,
  surface that message to the user instead of retrying with `--yes`.
- If the user explicitly asks for trusted unattended Claude work, or has already
  approved that mode for the current task/session/project, forward
  `--bypass-permissions` for fresh local shell/tool automation jobs. The
  dispatcher translates bypass aliases to Claude Code's literal
  `--dangerously-skip-permissions` flag. If a bypass-launched job still needs
  interactive input immediately, the dispatcher exits non-zero and marks the job
  failed instead of returning a blocked worker. This does not resolve browser
  selection, passkeys, or other local user-gesture prompts.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

This skill starts a Claude Code background session with `/deep-research <question>`
injected as the opening slash command. The `/deep-research` slash command triggers
Claude's bundled workflow runtime, which spawns multiple agents fanning out web
searches, fetching sources, adversarially verifying claims, and synthesizing a
cited report. Current Claude Code versions may present a dynamic workflow approval
gate before subagents start. After the job ID and Claude session short ID are
printed, the user can run:

    claude attach <shortId>

using the printed Claude session short ID to watch progress or approve the gate.
The `--yes` flag only acknowledges the plugin privacy prompt; it does not approve
Claude Code workflow gates.

WebSearch requirement: the `/deep-research` workflow requires the `WebSearch`
tool. This tool is auto-available in standard Claude Code background sessions
(confirmed via Plan 0013 OQ-B empirical probe).

Cost notice:

Research-grade workflows use significant tokens. The `/deep-research` runtime
can spawn multiple agents fanning out parallel web searches, per workflow limits
of 16 concurrent agents and 1000 total agents per run. Recommend using narrow,
specific questions over broad sweeps to contain cost. Use `$claude-stop` to
terminate a deep-research session early.

### When deep-research stalls

If `$claude-status <jobId>` returns `needs_input` on the first poll and stays
there, the `/deep-research` injection may have failed to reach the model. Stop
the stalled session with `$claude-stop <jobId>` and re-run `$claude-deep-research`
with the same question.

### Next steps

Deep-research sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress
- `$claude-result` — read the final cited report once the session completes
- `$claude-followup` — send an additional instruction mid-run
- `$claude-stop` — terminate the deep-research session early
