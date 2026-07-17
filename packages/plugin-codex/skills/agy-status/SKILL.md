---
name: agy-status
description: List Antigravity agy jobs for the current workspace.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file.
Confirm `<plugin-root>/scripts/cc.mjs` exists, then run:

    node "<plugin-root>/scripts/cc.mjs" status --provider agy

Return the dispatcher's stdout verbatim. If the command exits non-zero, show stderr/stdout to the
user and explain that status failed. Do not inspect supervisor files directly.

Behavior rules:

- Forward `--all` only when the user explicitly asks to search every workspace.
- Forward `--json`, `--compact`, `--job <jobId-or-prefix>`, `--limit <n>`, and
  `--stored-status <state>` when requested.
- Prefer `--job <id> --json --compact` when the caller already has a job ID.
- Compact JSON includes `provider: "agy"`, process state, result state, and exact action hints.

### Next steps

- `$agy-wait <jobId>` - wait for a known job
- `$agy-result <jobId>` - read final or recorded partial output
- `$agy-stop <jobId>` - stop a running job
