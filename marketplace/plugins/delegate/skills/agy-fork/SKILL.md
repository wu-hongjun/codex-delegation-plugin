---
name: agy-fork
description: Ask an Antigravity conversation to spawn and verify an independent subagent for a directive.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" fork --provider agy -- "<directive>"

Forward only explicitly requested Antigravity startup, JSON, acknowledgement, and permission flags.
Do not inject `--yes`. Antigravity's default parent uses its native subagent tool to invoke the
bundled fork child profile inside the recorded conversation. Antigravity's TUI `/fork` command has
different semantics: it branches the current conversation and does not spawn the independent worker
requested by this skill. Neither operation creates a git worktree. Return dispatcher output
verbatim.

### Next steps

- `$agy-workflows <jobId>` — inspect the recorded parent job.
- `$agy-result <jobId>` — read the synthesized fork result.
