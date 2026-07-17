---
name: agy-stop
description: Stop a running Antigravity agy job.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file.
Confirm `<plugin-root>/scripts/delegate.mjs` exists, then run:

    node "<plugin-root>/scripts/delegate.mjs" stop <jobId-or-prefix>

Return the dispatcher's stdout verbatim. If the command exits non-zero, show stderr/stdout to the
user and explain that the stop failed. The dispatcher must terminate the supervisor and update the
stored job; do not edit state files directly.

Behavior rules:

- Ask for the job ID when it is missing.
- Forward `--json` and `--compact` for machine-readable output.
- Forward `--all` only when the user explicitly asks to resolve across every workspace.

### Next steps

- `$agy-status` - confirm the stopped state
- `$agy-result <jobId> --partial` - read output captured before termination
