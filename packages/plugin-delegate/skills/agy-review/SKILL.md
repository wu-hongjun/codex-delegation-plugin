---
name: agy-review
description: Review an Antigravity job by continuing its existing conversation with a structured review turn.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" review <jobId-or-prefix> --provider agy [flags]

Forward only explicitly requested `--all`, `--json`, `--yes`, `--blocking`, and `--fail-on` flags.
The dispatcher constructs the review prompt and selects the latest completed non-review turn. Do not
add a freeform prompt; the target job supplies the exact Antigravity conversation and `--provider agy`
asserts that the selected job is an Antigravity job.
Return dispatcher output verbatim and surface non-zero exits.

### Next steps

- `$agy-result <jobId>` — read the reviewed job's latest recorded turn.
- `$agy-adversarial-review <jobId>` — get a fresh-conversation second opinion.
