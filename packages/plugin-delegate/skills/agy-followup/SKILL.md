---
name: agy-followup
description: Continue an existing Google Antigravity delegation in its exact recorded conversation.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file and confirm
`<plugin-root>/scripts/delegate.mjs` exists. Invoke:

    node "<plugin-root>/scripts/delegate.mjs" followup <jobId-or-prefix> --provider agy -- "<next instruction>"

Forward only explicitly requested `--all`, `--json`, and `--yes` flags before `--`.
The dispatcher derives the exact Antigravity conversation UUID from the job; `--provider agy`
asserts that the selected job belongs to Antigravity and never selects global recent state. Do not
inject `--yes`. Return stdout verbatim and surface failures. Afterward use
`$agy-status`, `$agy-result`, another `$agy-followup`, `$agy-attach`, or `$agy-stop`. If the same
TUI reaches a native permission card, preserve the job and direct the user to `$agy-attach`.

### Next steps

- `$agy-result <jobId>` — read the latest completed turn.
- `$agy-review <jobId>` — review the work inside the same conversation.
