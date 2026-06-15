# T2 - Machine-readable waiting state

## Goal

Let Codex understand why a Claude job needs input and what the next action is,
without opening raw logs or attaching blindly.

## Problem

`needs_input` is too coarse for an orchestrating agent. Claude Code may expose
`waitingFor` or sidecar permission hints, but the plugin does not consistently
normalize that into status JSON/human output. Codex needs tool/command/path
detail when available, plus a stable action hint.

## Implementation Notes

- Extend `SessionStatus` and/or job status formatting with a structured
  `waitingFor` object/string.
- Normalize `claude agents --json` `waitingFor` fields and sidecar permission
  hints.
- Preserve backwards-compatible `status` values.
- In `cc status --job <id> --json --compact`, include the waiting detail without
  the bulky capability snapshot.
- In human output, show one short line such as:
  `Waiting for permission: Bash(git status). Attach with claude attach <shortId>.`
- Avoid changing terminal status semantics from Plan 0022 unless tests prove the
  current mapping is stale.

## Acceptance

- Synthetic agents-json fixtures with `waitingFor` produce JSON waiting detail.
- Sidecar permission fixtures produce useful waiting detail.
- Human status output names the Claude short/session id to attach.
- Existing status tests for `awaiting_followup`, `running`, and terminal jobs
  continue to pass.
