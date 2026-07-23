---
name: qwen-setup
description: Check whether Qwen Code is ready for delegated jobs.
---

Resolve `<plugin-root>` from this skill's parent `skills/` directory and run:

    node "<plugin-root>/scripts/delegate.mjs" setup --provider qwen

Forward `--json` when requested. Return dispatcher output verbatim. Do not invoke a model as a
setup probe.

Next: `$qwen-doctor`, `$qwen-delegate`, or `$qwen-status`.
