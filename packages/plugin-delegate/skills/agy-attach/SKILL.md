---
name: agy-attach
description: Attach a user-owned terminal to the persistent Antigravity TUI for a delegated job.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file and confirm
`<plugin-root>/scripts/delegate.mjs` exists.

Attaching is deliberately interactive: it exposes Antigravity's native permission cards,
`/agents`, `/tasks`, `/fork`, and the live prompt. Do not approve or deny a permission on the
user's behalf. Give the user this exact command to run in their own terminal:

    node "<plugin-root>/scripts/delegate.mjs" attach <jobId-or-prefix>

Forward `--all` only when the user explicitly wants to search every workspace. The command
replays the current TUI, proxies keystrokes to the existing provider process, and uses
`Ctrl+]` as the local detach key. Detaching leaves Antigravity running.

If the execution environment genuinely gives the user direct ownership of an interactive TTY,
the command may be launched there. Do not launch it through a non-interactive pipe or pretend
that a captured terminal log is an attachment.

### Next steps

- `$agy-status --job <jobId> --json --compact` — verify lifecycle state after detaching.
- `$agy-followup <jobId> -- "<instruction>"` — send the next completed-turn prompt.
- `$agy-stop <jobId>` — terminate the provider process.
