---
name: agy-deep-research
description: Run multi-agent, source-linked deep research through Google Antigravity.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" deep-research --provider agy -- "<question>"

Forward only explicitly requested Antigravity startup flags, `--json`, and `--yes`. Do not inject
`--yes`. Antigravity web tools follow its permission policy; headless prompts cannot approve an
`ask` decision, so the user may need narrow `permissions.allow` rules. Return output verbatim and
surface failures.

### Next steps

- `$agy-workflows <jobId>` — inspect the recorded research job.
- `$agy-result <jobId>` — read the source-linked report.
