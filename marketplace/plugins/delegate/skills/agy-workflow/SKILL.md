---
name: agy-workflow
description: Run a phased multi-agent workflow through Google Antigravity as a supervised job.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" workflow --provider agy -- "<workflow task>"

Forward only explicitly requested Antigravity startup flags: `--yes`, `--json`, `--name`, `--model`,
`--agent`, `--mode`, `--sandbox`, `--print-timeout`, `--project`, `--new-project`, `--log-file`,
`--permission-mode`, `--bypass-permissions`, and `--dangerously-skip-permissions`. Do not inject
`--yes`. The dispatcher asks Antigravity to phase, fan out, verify, and synthesize the work. Return
output verbatim.

### Next steps

- `$agy-workflows` — list or inspect recorded workflow jobs.
- `$agy-followup <jobId> -- "next phase"` — continue the exact parent conversation.
