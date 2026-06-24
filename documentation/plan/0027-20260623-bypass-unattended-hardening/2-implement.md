# Plan 0027 Implementation

## Intended Changes

- Extend `StartSessionOpts` and `ClaudeSessionContext` with explicit launch
  policy metadata.
- Update the Claude Code background driver to use
  `--dangerously-skip-permissions` for bypass launches and place `--` before the
  prompt.
- Update the plugin dispatcher to populate launch policy on created jobs.
- Update compact status formatting and waiting guidance for bypass-requested
  jobs.
- Update mock Claude and focused tests to cover the real argv semantics.

## Verification

- `node --test tools/mock-claude/test/mock-claude.test.mjs`
- `npm run build --workspace packages/runtime --workspace packages/driver-claude-code`
- `node --test packages/driver-claude-code/test/start-session.test.mjs`
- `node --test --test-name-pattern "delegate flag parsing parity|status --job and --compact ergonomics" packages/plugin-codex/test/dispatcher.test.mjs`
- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `node tools/package-marketplace.mjs --check`
- `npm test`

All passed locally on 2026-06-23.
