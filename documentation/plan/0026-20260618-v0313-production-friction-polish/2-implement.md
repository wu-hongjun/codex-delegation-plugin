# Plan 0026 Implementation

## Changes

- `cc setup` now runs the runtime doctor in read-only mode and suppresses the
  snapshot write, so readiness checks do not need to create plugin state.
- The companion-dir probe has a read-only branch that reports state-dir
  availability without calling `ensureCompanionDirs`.
- Compact status JSON now exposes `process.lastObservedAgeSeconds`,
  `process.stale`, `process.staleAfterSeconds`, `freshness`, and
  `latestTurn.rawStatus`.
- Permission/input wait classification now includes `requestedAction` when
  Claude wait metadata is structured JSON with `command`, `tool`, or `action`.
- `cc upgrade --yes` installs with `codex plugin add ... --json`, parses the
  returned `installedPath`, and refreshes stable cache symlinks beside the
  versioned install path.
- Mock Codex learned `plugin add --json` so upgrade behavior is covered without
  touching a real Codex install.

## Verification

- Focused runtime + dispatcher tests:
  `node --test packages/runtime/test/doctor.test.mjs packages/plugin-codex/test/dispatcher.test.mjs`
  passed with 333 tests, 0 failures.
- Full release-candidate checks passed:
  - `npm run format`
  - `npm run lint`
  - `npm run typecheck`
  - `node tools/package-marketplace.mjs --check`
  - `npm test`
