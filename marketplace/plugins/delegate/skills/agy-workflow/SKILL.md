---
name: agy-workflow
description: Run a phased multi-agent workflow through Google Antigravity as a supervised job.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" workflow --provider agy -- "<workflow task>"

Forward only explicitly requested Antigravity startup flags: `--yes`, `--json`, `--name`, `--model`,
`--agent`, `--mode`, `--sandbox`, `--project`, `--new-project`, `--log-file`,
`--permission-mode`, `--bypass-permissions`, and `--dangerously-skip-permissions`. Do not inject
`--yes`. The dispatcher keeps Antigravity's default parent and uses the bundled
`codex-delegation-workflow` profile for scoped native child work. The parent phases, fans out,
verifies, and synthesizes the work. An explicit user `--agent` takes precedence. Return output
verbatim.

### Next steps

- `$agy-workflows` — list or inspect recorded workflow jobs.
- `$agy-attach <jobId>` — inspect or control native subagents through `/agents`.
- `$agy-followup <jobId> -- "next phase"` — continue the exact parent conversation.
