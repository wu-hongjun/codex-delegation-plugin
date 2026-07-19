---
name: agy-upgrade
description: Refresh or repair the installed Codex Delegation plugin that provides Antigravity skills.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" upgrade [--public|--local] [--dry-run] [--json]

The default is a dry-run plan. Forward `--yes` only when the user explicitly asks to execute the
upgrade. This upgrades the Codex plugin, not the `agy` executable. Return dispatcher output verbatim,
including the instruction to restart Codex in a new thread after a successful refresh.

### Next steps

- `$agy-setup` — verify the refreshed Antigravity skill surface.
- `$agy-doctor` — run the expanded exact-resume and permission preflight.
