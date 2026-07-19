---
name: agy-setup
description: Check whether the Antigravity agy CLI is available for delegated Codex jobs.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file.
Confirm `<plugin-root>/scripts/delegate.mjs` exists, then run:

    node "<plugin-root>/scripts/delegate.mjs" agy-setup

Return the dispatcher's stdout verbatim. If the command exits non-zero, show stderr/stdout to the
user and explain that the Antigravity preflight failed. Do not invoke a model as a setup test. The
dispatcher checks `--prompt-interactive`, exact-conversation flags, model access, the native-terminal runtime, and the
companion plugin, then validates and installs the bundled lifecycle/orchestration companion.

Forward `--json` when machine-readable output is requested.

### Next steps

- `$agy-delegate` - start an Antigravity job
- `$agy-status` - list Antigravity jobs in the current workspace
