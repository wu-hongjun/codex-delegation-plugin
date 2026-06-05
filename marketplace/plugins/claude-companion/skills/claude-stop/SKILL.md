---
name: claude-stop
description: Stop a running Claude job.
---

You are the Codex skill wrapper for the Claude Companion dispatcher.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/claude-companion.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/claude-companion.mjs" stop <jobId-or-prefix>

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Use the job id (or unique prefix) the user provided.
- If the user did not provide one, ask for it.
- Do not mark a job stopped yourself — the dispatcher must call the stop
  subcommand and update state.
- Forward `--json` for machine-readable output when the user requests it.
- Forward `--all` only if the user explicitly asks to stop jobs across all workspaces.

### Next steps

After stopping a job, the user typically wants one of:

- `$claude-status` — verify the job is now stopped
- `$claude-result` — read any partial output the job produced before stopping
