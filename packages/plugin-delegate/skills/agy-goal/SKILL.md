---
name: agy-goal
description: Run Google Antigravity toward a concrete verified completion condition.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" goal --provider agy -- "<completion condition>"

Forward only explicitly requested Antigravity startup flags (`--yes`, `--json`, `--name`, `--model`,
`--agent`, `--mode`, `--sandbox`, `--project`, `--new-project`, `--log-file`, and
permission/bypass flags). Do not inject `--yes`. The persistent first turn works until it verifies the
condition or proves a blocker; continue the same context with `$agy-followup` when another turn is
needed.

### Next steps

- `$agy-followup <jobId> -- "continue toward the goal"` — continue the same context.
- `$agy-result <jobId>` — inspect the latest verified result.
