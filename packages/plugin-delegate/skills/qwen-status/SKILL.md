---
name: qwen-status
description: Inspect supervised Qwen Code delegation jobs.
---

Resolve `<plugin-root>` and run:

    node "<plugin-root>/scripts/delegate.mjs" status --provider qwen

Forward supported read-only flags such as `--job`, `--all`, `--json`, `--compact`, `--limit`, and
`--stored-status`. Return output verbatim. Qwen jobs are headless and do not support attach.
