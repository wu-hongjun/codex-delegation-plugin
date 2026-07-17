---
name: agy-wait
description: Wait for an Antigravity agy job to finish, fail, stop, or time out.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file.
Confirm `<plugin-root>/scripts/cc.mjs` exists, then run:

    node "<plugin-root>/scripts/cc.mjs" wait <jobId-or-prefix>

Return the dispatcher's stdout verbatim. If the command exits non-zero, show stderr/stdout to the
user and explain whether the wait timed out or failed. Do not create a second polling loop.

Behavior rules:

- Ask for the job ID when it is missing; do not infer one from prose.
- Forward `--json`, `--compact`, `--timeout <duration>`, and `--interval <duration>` when requested.
- Forward `--all` only when the user explicitly asks to resolve across every workspace.
- A timeout does not stop the job. Surface the returned status and recovery actions.

### Next steps

- `$agy-result <jobId>` - read output
- `$agy-result <jobId> --partial` - read output captured before a non-terminal state
- `$agy-stop <jobId>` - terminate a job that should not continue
