---
name: claude-doctor
description: Preflight Claude Code auth, model access, real-browser readiness, workspace path, and permission mode before long delegated jobs.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run this before long-running, browser-backed, unattended, or high-stakes delegated Claude jobs:

    node "<plugin-root>/scripts/cc.mjs" doctor --claude-access --json

Add `--real` when the upcoming job needs Claude Code real Chrome access. `--real`
is a doctor-only alias for the future `--chrome` launch path; there is no Claude
Code `--real` flag.

Add one of these only when the user has explicitly requested trusted unattended
permission bypass for the upcoming job:

- `--bypass-permissions`
- `--permission-mode bypassPermissions`
- `--dangerously-skip-permissions`

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the preflight found blockers that
should be fixed before starting the long delegated job. Do not reimplement the
command logic yourself.

### Next steps

After a successful or warning-only preflight:

- `$claude-delegate` — start the bounded job
- `$claude-status` — inspect blockers and exact dispatcher hints
- `$claude-wait` — wait with timeout recovery for long jobs
