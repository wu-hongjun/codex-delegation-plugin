---
name: agy-workflows
description: List or inspect supervised Antigravity workflow, goal, fork, batch, and research jobs.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run one of:

    node "<plugin-root>/scripts/delegate.mjs" workflows --provider agy [--all] [--json]
    node "<plugin-root>/scripts/delegate.mjs" workflows --provider agy <jobId-or-prefix> [--all] [--json]

Return output verbatim. The plugin records parent conversations, turns, and results. The structured
CLI report includes the exact attach command; after attaching, `/agents` provides Antigravity's
native child inspection, approval, and kill controls.

### Next steps

- `$agy-status --job <jobId> --json --compact` — inspect exact action hints.
- `$agy-result <jobId>` — read a completed workflow result.
