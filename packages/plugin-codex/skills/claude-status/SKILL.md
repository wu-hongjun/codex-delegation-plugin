---
name: claude-status
description: List Claude jobs for the current workspace.
---

You are the Codex skill wrapper for the Claude Companion dispatcher.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher).

Run:

    node "<plugin-root>/scripts/cc.mjs" status

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Forward `--all` only if the user explicitly asks for jobs across all
  workspaces (not just the current one).

### Relationship to Claude Code's `/tasks` and `/workflows` panels

`$claude-status --all` is the CLI equivalent of Claude Code's `/tasks` TUI panel — both surface the same data (`sessionId`, `name`, `status`, `kind`, `cwd`, `pid`, `startedAt`, `waitingFor`) sourced from `claude agents --json`. There is no need for a separate `$claude-tasks` skill; the panels are structurally equivalent (per Plan 0015 OQ-B).

For Claude Code's `/workflows` agent-management panel (phase view, per-agent token usage, pause/resume/restart controls), there is currently **no CLI equivalent** — that panel exposes data not reachable via `claude agents --json` or session JSONL inspection (per Plan 0015 OQ-A). A PTY-injection wrapper is deferred to Plan 0016.

For interactive attach to a running session — to watch its live output — use `claude attach <sessionId>` directly. The bg job's `Claude session: <sessionId>` line in `$claude-status` output is the input.

### Next steps

After checking status, the user typically wants one of:

- `$claude-result` — read the output of a completed job
- `$claude-followup` — continue a job that is awaiting a follow-up turn
- `claude attach <sessionId>` — drop into a live attach (Claude Code CLI; not a plugin skill)
