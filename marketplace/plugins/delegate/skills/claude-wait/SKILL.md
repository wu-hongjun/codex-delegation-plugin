---
name: claude-wait
description: Wait for a Claude job to produce a result, blocker, or timeout.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/delegate.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/delegate.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/delegate.mjs" wait <jobId-or-prefix>

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Use the job id (or unique prefix) the user provided.
- If the user did not provide one, ask for it. Do not guess job IDs from prose.
- Forward `--json` and `--compact` for machine-readable output when the user
  requests it, or when automation needs to parse `summary`, `resultText`,
  `transcriptTail`, `blockedOn`, or `actionHints`.
- Forward `--timeout <duration>` when the user asks for a bounded wait.
  Duration examples accepted by the dispatcher: `500ms`, `30s`, `2m`; bare
  numbers are seconds.
- Forward `--interval <duration>` only when the user explicitly asks to change
  the polling cadence.
- Forward `--all` only if the user explicitly asks to resolve a job across all
  workspaces.

### What wait returns

`$claude-wait` polls one job until it reaches a result state, awaiting-followup,
needs_input, stopped, failed, orphaned, or the timeout expires. JSON output
includes:

- `summary` — the same compact job shape as `$claude-status --job`
- `resultText` — final output when available, otherwise recorded partial output
  if one exists
- `transcriptTail` — recent transcript lines when a transcript path was captured
- blocker/action fields such as `summary.blockedOn`,
  `summary.actionHints.restartWithBypass`, and `summary.actionHints.stop`
- `timeoutRecovery` — present on timeout; includes exact status, partial-result,
  stop, and attach commands for the next recovery step

If the wait times out, the dispatcher exits non-zero but still prints the latest
JSON status/result payload when `--json` was requested. Surface that payload to
the user rather than discarding it. A timeout does not prove the Claude job is
dead; inspect `timeoutRecovery.status`, read `timeoutRecovery.partialResult` if
present, or poll `$claude-status --job <jobId> --json --compact`.

### Next steps

After waiting, the user typically wants one of:

- `$claude-result <jobId>` — read the final output if `summary.resultState` is final
- `$claude-result <jobId> --partial` — read recorded partial output for an
  incomplete job
- `$claude-followup` — continue a job that is awaiting a follow-up turn
- `$claude-stop` — stop a blocked, stale, or no-longer-needed job
- `claude attach <shortId>` — resolve manual input such as Chrome browser
  selection, passkeys, or permission prompts
