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

Human status output includes a header row, a relative age column, and a footer
with `claude attach <shortId>` when any listed job needs input.

Compact JSON includes `waiting.kind`, `waiting.category`,
`waiting.manualInputRequired`, `waiting.canApproveNonInteractively`,
`waiting.userAction`, and `actionHints` with stable next commands such as
`status`, `result`, `partialResult`, `stop`, `followup`, `attach`, and `logs`.
On macOS, do not rewrite those hints to a bare `cc ...` shell command; that
usually resolves to Apple clang. Prefer `actionHints` as printed, and use
`exactActionHints` when present.
When `waiting.kind` is `"permission"` or `waiting.manualInputRequired` is true,
surface the `attach` hint to the user; do not try to approve from the
background wrapper. For blocked jobs, also surface `actionHints.stop`,
`actionHints.restartWithBypass`, and `actionHints.cleanupBlocked` (or their
`exactActionHints` equivalents when present) so the operator can stop the job,
restart it as a trusted unattended fresh session, or clean up all blocked jobs
without reading separate docs. `restartWithBypass` intentionally includes a
`"<prompt>"` placeholder because cc stores prompt metadata, not the full
original prompt. If `partialResult` is present, use `$claude-result <jobId>
--partial` to inspect recorded progress without waiting for the job to finish.
Check `result.isPartial` and `latestTurn.resultState` before treating recorded
output as final.

For real Chrome work, `waiting.category: "browser_selection"` means Claude Code
is asking the operator to pick a connected Chrome browser, choose through the
extension UI, or perform a local user gesture such as a passkey approval. This
must be resolved with `claude attach <shortId>` in the Claude Code TUI. The cc
wrapper cannot safely select a browser or complete user gestures
non-interactively, and permission-mode flags do not choose among browsers.

Freshness fields are heartbeat/progress hints, not result availability. For
non-terminal rows, `freshness.evaluated: true` means `stale` was computed against
`staleAfterSeconds`. For terminal rows such as `stopped` or `orphaned`,
`freshness.evaluated: false` and `freshness.reason: "terminal_status"` mean the
job is no longer heartbeat-evaluated; `lastObservedAgeSeconds` is retained only
as historical context.

When running from a cc-plugin-codex checkout, status may include a
`versionMismatch` meta warning if the dispatcher version differs from the
workspace plugin version. Treat that as a stale install/cache signal; refresh
the installed plugin or run `node packages/plugin-codex/scripts/cc.mjs`
directly for development testing.

### Next steps

After checking status, the user typically wants one of:

- `$claude-result` — read the output of a completed job
- `$claude-wait <jobId> --json --compact --timeout 5m` — wait on a known job
  until it produces a result, blocker, or timeout
- `$claude-result <jobId> --partial` — read recorded partial output if status
  says the job is incomplete but has a result artifact
- `$claude-followup` — continue a job that is awaiting a follow-up turn
- `claude attach <sessionId>` — drop into a live attach (Claude Code CLI; not a plugin skill)
