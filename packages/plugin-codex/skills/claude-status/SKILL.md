---
name: claude-status
description: List Claude jobs for the current workspace.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" status

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Forward `--all` only if the user explicitly asks for jobs across all
  workspaces (not just the current one).
- Forward `--json`, `--compact`, `--job <jobId-or-prefix>`, `--limit <n>`, and
  `--stored-status <state>` when the user explicitly requests machine-readable output,
  compact output, one focused job, bounded output, or stored-status filtering. Prefer
  `--job <id> --json --compact` for automation when the caller already has a job
  id; broad `--all` output can be large in old workspaces.

### Relationship to Claude Code's `/tasks` and `/workflows` panels

`$claude-status --all` is the CLI equivalent of Claude Code's `/tasks` TUI panel — both surface the same data (`sessionId`, `name`, `status`, `kind`, `cwd`, `pid`, `startedAt`, `waitingFor`) sourced from `claude agents --json`. There is no need for a separate `$claude-tasks` skill; the panels are structurally equivalent (per Plan 0015 OQ-B).

For Claude Code's `/workflows` agent-management panel (phase view, per-agent token usage, pause/resume/restart controls), there is currently **no CLI equivalent** — that panel exposes data not reachable via `claude agents --json` or session JSONL inspection (per Plan 0015 OQ-A). A PTY-injection wrapper is deferred to Plan 0016.

For interactive attach to a running session — to watch its live output — use `claude attach <sessionId>` directly. The bg job's `Claude session: <sessionId>` line in `$claude-status` output is the input.

### Keeping status output bounded

Use `$claude-status --job <jobId-or-prefix> --json --compact` when you already
know the job id. For broad sweeps in a workspace with many historical jobs, use
`--limit <n>` to show only the newest matching rows and `--stored-status <state>` to
filter by stored job status. `--compact` affects JSON shape; it does not delete
historical job records.

Compact JSON includes `actionHints` with stable next commands such as
`status`, `result`, `partialResult`, `attach`, and `logs`. When a job is
`needs_input` with `waitingFor: "permission prompt"`, surface the `attach`
hint to the user. If `partialResult` is present, use `$claude-result <jobId>
--partial` to inspect recorded progress without waiting for the job to finish.

When running from a cc-plugin-codex checkout, status may include a
`versionMismatch` meta warning if the dispatcher version differs from the
workspace plugin version. Treat that as a stale install/cache signal; refresh
the installed plugin or run `node packages/plugin-codex/scripts/cc.mjs`
directly for development testing.

### Next steps

After checking status, the user typically wants one of:

- `$claude-result` — read the output of a completed job
- `$claude-result <jobId> --partial` — read recorded partial output if status
  says the job is incomplete but has a result artifact
- `$claude-followup` — continue a job that is awaiting a follow-up turn
- `claude attach <sessionId>` — drop into a live attach (Claude Code CLI; not a plugin skill)
