---
name: agy-fork
description: Ask an Antigravity conversation to spawn and verify an independent subagent for a directive.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" fork --provider agy -- "<directive>"

Forward only explicitly requested Antigravity startup, JSON, acknowledgement, and permission flags.
Do not inject `--yes`. This uses Antigravity's native subagent framework inside the recorded parent
conversation; it does not create a git worktree or expose the interactive `/fork` picker. Return
dispatcher output verbatim.

### Next steps

- `$agy-workflows <jobId>` — inspect the recorded parent job.
- `$agy-result <jobId>` — read the synthesized fork result.
