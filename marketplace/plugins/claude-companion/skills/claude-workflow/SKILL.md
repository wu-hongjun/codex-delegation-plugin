---
name: claude-workflow
description: Trigger a Claude Code dynamic workflow as a background sub-agent.
---

You are the Codex skill wrapper for the Claude Companion dispatcher's workflow
subcommand.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/claude-companion.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/claude-companion.mjs" workflow -- "<prompt>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the workflow
  prompt. If empty, ask the user for a prompt before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--mcp-config`, `--json`.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do NOT inject `--yes` automatically. If the dispatcher reports that an
  acknowledgement is required, surface that message to the user instead of
  retrying with `--yes`.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

Dynamic workflows present an interactive YES / View raw script / NO approval
dialog inside the Claude Code TUI before any subagents are spawned. This skill
starts the background job but does NOT auto-approve the dialog. After the job
ID is printed, the user must run:

    claude attach <jobId>

inside a Claude Code session to review the generated workflow script and choose
whether to proceed.

Cost notice:

Dynamic workflows can spawn up to 16 concurrent agents and up to 1000 total
agents across all phases. Review the generated script before approving. If the
scope looks larger than intended, choose "No" in the approval dialog — no
subagents are spawned and no artifacts are written until the user explicitly
approves.

### Next steps

Workflow sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress (workflow appears as a bg job)
- `$claude-result` — read the final output once the workflow completes
- `$claude-stop` — terminate the workflow early
