---
name: pi-doctor
description: Preflight Pi CLI, exact resume, workspace, and permission policy.
---

Resolve `<plugin-root>` from this skill's parent `skills/` directory and run:

    node "<plugin-root>/scripts/delegate.mjs" doctor --provider pi --json

Forward an explicitly requested `--permission-mode` or bypass flag. Never add bypass mode yourself;
Pi maps it to `--approval-mode yolo`. Return the dispatcher report verbatim and explain blockers.
