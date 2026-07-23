---
name: pi-setup
description: Check whether oh-my-pi is ready for delegated jobs.
---

Resolve `<plugin-root>` from this skill's parent `skills/` directory and run:

    node "<plugin-root>/scripts/delegate.mjs" setup --provider pi

Forward `--json` when requested. Return dispatcher output verbatim. Explain that the provider is
called Pi here but its installed executable is `omp`. Do not invoke a model as a setup probe.

Next: `$pi-doctor`, `$pi-delegate`, or `$pi-status`.
