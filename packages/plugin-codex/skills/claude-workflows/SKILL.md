---
name: claude-workflows
description: List and inspect Claude Code workflow background sessions started via $claude-workflow or $claude-deep-research.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" workflows [<jobId>]

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Accepted flags (forwarded to the dispatcher):

- `--all` — list workflow sessions from all workspaces (not just current).
- `--json` — machine-readable JSON output.

Rejected at parse time (exit 2):

- `--allow-edit` — not applicable; this skill is read-only.
- `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config` — not applicable.

Behavior rules:

- No args → list all workflow-like sessions visible in the cc-plugin-codex job store.
- With `<jobId>` → drill into that one session: subagent metadata, phase records.
- Forward `--all` only if the user explicitly asks for sessions across all
  workspaces.
- Forward `--json` only if the user explicitly asks for machine-readable output.
- Do NOT auto-inject `--yes` on run lines; this skill does not send prompts.

**Important scope note**: This skill covers job-store-backed workflow-like
background sessions from `$claude-workflow` (`ultracode:` prompts) and
`$claude-deep-research` (`/deep-research` prompts). The Claude Code `/workflows`
TUI panel is **session-scoped TUI-only** — it shows workflows from a Claude TUI
session, NOT the background sessions this skill surfaces. The two are distinct
surfaces (empirically confirmed in Plan 0016 OQ-A artifact).

**Cost notice**: zero subprocess started; reads are disk-only from
the cc-plugin-codex job store and Claude project metadata. No Claude Code
session is spawned.

### Next steps

After checking workflow sessions, the user typically wants one of:

- `$claude-status` — list all background jobs (not just workflow sessions)
- `$claude-result` — read the output of a completed job
- `$claude-stop` — stop a running background session
