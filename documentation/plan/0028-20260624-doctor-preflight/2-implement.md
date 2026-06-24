# Plan 0028 Implementation

## Intended Changes

- Add a `doctor` subcommand to the plugin dispatcher.
- Add parser support for doctor-specific `--claude-access` and `--real` flags.
- Make `--real` a doctor-only alias for validating future `--chrome` launches.
- Add `$claude-doctor` skill instructions and plugin manifest discoverability.
- Update marketplace packaging allowlists and generated files.
- Add focused dispatcher and docs tests for the new command and skill.

## Verification

- `node packages/plugin-codex/scripts/cc.mjs doctor --claude-access --real --bypass-permissions --json`
- `node packages/plugin-codex/scripts/cc.mjs setup --json`
- `node packages/plugin-codex/scripts/cc.mjs delegate --real -- "should not start"`
- `node --test packages/plugin-codex/test/dispatcher.test.mjs`
- `node --test packages/plugin-codex/test/skills-manifest.test.mjs packages/plugin-codex/test/readme.test.mjs packages/plugin-codex/test/docs-split.test.mjs packages/plugin-codex/test/marketplace-readme.test.mjs packages/plugin-codex/test/marketplace-layout.test.mjs packages/plugin-codex/test/marketplace-smoke.test.mjs packages/plugin-codex/test/marketplace-releasing.test.mjs`
- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `node tools/package-marketplace.mjs --check`
- `node tools/smoke-marketplace.mjs --help`
- `git diff --check`
- `npm test`

All passed locally on 2026-06-24, except the live `setup --json` and live
`doctor --claude-access --real --bypass-permissions --json` commands correctly
reported this machine's current Claude Code model-access blocker.
