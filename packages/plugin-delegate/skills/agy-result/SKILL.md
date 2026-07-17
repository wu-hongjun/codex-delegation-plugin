---
name: agy-result
description: Show the final or recorded partial result of an Antigravity agy job.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file.
Confirm `<plugin-root>/scripts/delegate.mjs` exists, then run:

    node "<plugin-root>/scripts/delegate.mjs" result <jobId-or-prefix>

Return the dispatcher's stdout verbatim. If the command exits non-zero, show stderr/stdout to the
user and explain that result retrieval failed.

Behavior rules:

- Ask for the job ID when it is missing; do not guess.
- Forward `--json` and `--compact` for machine-readable output.
- Forward `--partial` when the user asks for output from an incomplete, stopped, failed, or
  orphaned job.
- Forward `--all` only when the user explicitly asks to resolve across every workspace.
- The clean result comes from the supervised stdout artifact. Diagnostic stderr remains available
  through the job's `logs` action hint.

### Next steps

- For another instruction, start a new `$agy-delegate` job. The dispatcher does not use global
  Antigravity continuation state.
- Use `$agy-status` to inspect other Antigravity jobs in this workspace.
