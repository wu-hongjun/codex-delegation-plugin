---
name: claude-stop
description: Stop a running Claude job.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" stop <jobId-or-prefix>

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
- Forward `--all-needs-input` or `--all-blocked` when the user asks to clean up
  permission/input-blocked jobs in the current workspace. Combine with `--all`
  only when the user explicitly asks to clean up blocked jobs across all
  workspaces.
- Forward `--all-awaiting-followup` when the user asks to bulk-stop idle
  follow-up-ready jobs.

### Next steps

After stopping a job, the user typically wants one of:

- `$claude-status` — verify the job is now stopped
- `$claude-result` — read any partial output the job produced before stopping
