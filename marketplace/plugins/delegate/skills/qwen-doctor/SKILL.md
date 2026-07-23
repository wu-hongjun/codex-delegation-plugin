---
name: qwen-doctor
description: Preflight Qwen Code CLI, exact resume, workspace, and permission policy.
---

Resolve `<plugin-root>` from this skill's parent `skills/` directory and run:

    node "<plugin-root>/scripts/delegate.mjs" doctor --provider qwen --json

Forward an explicitly requested `--permission-mode` or bypass flag. Never add bypass mode yourself.
Return the dispatcher report verbatim and explain blockers.
