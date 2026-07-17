---
name: claude-setup
description: Check Codex Delegation plugin readiness across Codex, Claude Code, auth, transcripts, and daemon.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/delegate.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/delegate.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/delegate.mjs" setup

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

### Next steps

Once setup reports success, the user typically wants to:

- `$claude-delegate` — start the first background job
- `$claude-status` — verify the daemon is running and see existing jobs

The first delegation in a workspace may require the plugin privacy
acknowledgement. Surface the dispatcher's message to the user; do not add
`--yes` unless the user explicitly asks for it.
