---
name: agy-batch
description: Run batch-parallel work through Antigravity subagents and synthesize the ordered results.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" batch --provider agy -- "<batch instruction>"

Forward only explicitly requested Antigravity startup flags, `--json`, and `--yes`. Do not inject
`--yes`. The dispatcher instructs Antigravity to isolate independent items, execute them concurrently,
retry safe isolated failures, and synthesize the batch. Return output verbatim and surface failures.

### Next steps

- `$agy-workflows <jobId>` — inspect the recorded batch parent.
- `$agy-result <jobId>` — read the ordered synthesis.
