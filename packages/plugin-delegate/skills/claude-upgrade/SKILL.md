---
name: claude-upgrade
description: Refresh or repair the installed Codex Delegation plugin through Codex plugin commands.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/delegate.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/delegate.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/delegate.mjs" upgrade

Accepted flags if the user explicitly asks for them:

- `--dry-run`
- `--yes`
- `--json`
- `--public`
- `--local`

Do not add `--yes` unless the user explicitly asks to execute the refresh. Without `--yes`,
the dispatcher prints the exact Codex plugin commands it would run. The dispatcher auto-detects
local cached installs; use `--public` or `--local` only when the user explicitly wants to
override that target.

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed.

After a successful upgrade, the active Codex session may still show old
versioned `SKILL.md` paths in its generated skill catalog. If that happens,
restart Codex to refresh the catalog, or use the stable dispatcher path created
by the upgrade:

    ~/.codex/plugins/cache/codex-delegation-plugin/delegate/current/scripts/delegate.mjs

### Next steps

After a successful refresh, the user typically wants to:

- `$claude-setup` — verify the refreshed install
- `$claude-skills` — confirm Codex can see the expected delegation skills
