---
name: agy-batch
description: Run batch-parallel work through Antigravity subagents and synthesize the ordered results.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" batch --provider agy -- "<batch instruction>"

Forward only explicitly requested Antigravity startup flags, `--json`, and `--yes`. Do not inject
`--yes`. When `$agy-setup` has installed the companion plugin, the dispatcher selects its bundled
batch agent, which uses Antigravity's native subagent tools. It falls back to the same explicit
orchestration contract if that agent is unavailable. Return output verbatim and surface failures.

### Next steps

- `$agy-workflows <jobId>` — inspect the recorded batch parent.
- `$agy-result <jobId>` — read the ordered synthesis.
