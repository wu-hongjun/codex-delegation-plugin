---
name: agy-doctor
description: Preflight Google Antigravity CLI, exact conversation resume, workspace, persistent TUI, and native permission handoff.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Confirm
`<plugin-root>/scripts/delegate.mjs` exists, then run:

    node "<plugin-root>/scripts/delegate.mjs" agy-doctor

Forward `--json` when requested. For a trusted unattended-work preflight, also forward an explicitly
requested `--permission-mode bypassPermissions`, `--bypass-permissions`, or
`--dangerously-skip-permissions`. Return dispatcher output verbatim and surface non-zero exits.
Do not run a model task: this command is a read-only capability preflight.

### Next steps

- `$agy-delegate` — start a supervised job after the preflight is acceptable.
- `$agy-setup` — print the shorter capability report.
