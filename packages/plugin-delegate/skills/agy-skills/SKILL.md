---
name: agy-skills
description: List Antigravity skills visible from workspace, user, and installed-plugin roots.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file. Run:

    node "<plugin-root>/scripts/delegate.mjs" skills --provider agy [--json]

Return output verbatim. This is read-only and must not receive `--allow-edit`. The catalog scans
`.agents/skills`, legacy `.agent/skills`, current global skill roots, and workspace/global
Antigravity plugins; duplicates remain visible rather than being silently resolved.

### Next steps

- `$agy-delegate -- "Use /skill-name to complete the task"` — invoke a discovered skill in a delegated prompt.
- `$agy-setup` — confirm the CLI is ready before delegating.
