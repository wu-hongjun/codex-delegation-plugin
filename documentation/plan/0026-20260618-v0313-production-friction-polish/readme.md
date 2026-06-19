# Plan 0026 - v0.3.13 production friction polish

**Status**: implemented
**Started**: 2026-06-18
**Owner**: Codex

## Summary

Close the remaining frictions from the 2026-06-17/18 Codex App production-use
log after v0.3.12: read-only setup checks, ambiguous in-flight status, stale
generated skill paths after upgrade, and missing machine-readable detail for
permission waits.

## Scope

In:

- Make `cc setup` a read-only readiness check that does not create companion
  state just to report tool availability.
- Add status JSON freshness fields so Codex can tell when a non-terminal job has
  not been observed recently.
- Keep `latestTurn.rawStatus` while mapping confusing nested queued states to a
  clearer effective `latestTurn.status`.
- Add `waiting.requestedAction` when Claude wait metadata is structured.
- Refresh stable plugin cache symlinks during `cc upgrade --yes` so stale
  generated skill paths have a survivable target after plugin upgrades.

Out:

- No automatic permission bypass.
- No direct edits to real `~/.claude` or `~/.codex` config files.
- No attempt to infer hidden Claude TUI state that Claude Code does not expose.

## Acceptance Criteria

- `cc setup --json` exits without writing `doctor.json`, `jobs/`, or `logs/`.
- Read-only doctor probing reports an unwritable or missing companion state
  directory without creating it.
- Compact status JSON includes process freshness / stale metadata.
- Orphaned partial-result jobs expose a clear primary state and preserve raw
  nested turn status for auditability.
- `cc upgrade --yes` asks Codex for JSON install output and refreshes a stable
  `current` cache symlink.
- Full npm tests and marketplace packaging checks pass before release.

## Result

- Implemented the read-only setup, status freshness, effective/raw latest-turn
  status, structured wait detail, and upgrade cache-symlink fixes.
- Local verification passed before the version bump:
  `npm run format`, `npm run lint`, `npm run typecheck`,
  `node tools/package-marketplace.mjs --check`, and `npm test`.
