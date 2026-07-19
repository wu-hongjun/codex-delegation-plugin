---
name: agy-adversarial-review
description: Run an independent structured Antigravity review of a delegated job in a fresh conversation.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" adversarial-review --provider agy <jobId-or-prefix> [flags]

Forward only explicitly requested `--all`, `--json`, `--yes`, `--model`, `--agent`, `--mode`,
`--sandbox`, `--project`, `--new-project`, `--log-file`, `--permission-mode`,
`--bypass-permissions`, `--dangerously-skip-permissions`, `--blocking`, and `--fail-on`. Do not append
a prompt; the dispatcher injects the selected result into a fresh review conversation. Return output
verbatim and surface failures.

### Next steps

- `$agy-result <reviewJobId>` — inspect the independent review job output.
- `$agy-review <jobId>` — request a lighter same-conversation review.
