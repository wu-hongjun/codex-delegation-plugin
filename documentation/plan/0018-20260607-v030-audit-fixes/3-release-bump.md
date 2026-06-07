# Plan 0018 — v0.3.0 release bump

**Status**: complete (pending CI + tag)
**Date**: 2026-06-07
**Follows**: the Plan 0018 audit fixes commit (`b3b4208`), shipped at `0.2.0`.

This is the version-bump commit per `documentation/RELEASING.md` § "Version Bump (Plan 0006 T10)". It is the second of two commits closing Plan 0018 / opening the v0.3.0 release.

## What changed

### Source of truth
- `packages/plugin-codex/.codex-plugin/plugin.json`: `version` `0.2.0` → `0.3.0` (the only manual version edit per RELEASING.md).

### Bundled markers (`<plugin-version>-bundled`)
- `tools/package-marketplace.mjs`: the synthesized `SYNTH_RUNTIME_PKG` / `SYNTH_DRIVER_PKG` version markers + dependency pin `0.2.0-bundled` → `0.3.0-bundled` (3 occurrences + the doc comment).
- `marketplace/MANIFEST.md`: bundled-marker references `0.2.0-bundled` → `0.3.0-bundled` (2).
- Marketplace tree regenerated via `node tools/package-marketplace.mjs --write`; the synthesized `node_modules/@cc-plugin-codex/{runtime,driver-claude-code}/package.json` now carry `0.3.0-bundled`. `--check` exit 0.

### Docs (current-version references)
- `documentation/RELEASING.md`: 5 current-version references bumped (`-bundled` example, "current shipped version", Tagging example tag `v0.3.0`, post-install version `0.3.0`).
- `marketplace/plugins/cc/README.md`: "current plugin version" `0.2.0` → `0.3.0`.

### Version-pin tests
- `marketplace-layout.test.mjs`: Check 2b asserts marketplace plugin.json version `0.3.0`; bundled-marker assertion `0.3.0-bundled`.
- `skills-manifest.test.mjs`: manifest version assertion `0.3.0`.
- `marketplace-readme.test.mjs`: assertion reads version dynamically from source plugin.json (now `0.3.0`); label/comment de-hardcoded.
- `marketplace-releasing.test.mjs`: Tagging-section example-tag assertion `v0.3.0`.

Historical-label strings (e.g. skills-manifest describe blocks naming "(v0.2.0)" as the plan that introduced a check) were left intact — they document contract history, not the current version.

## Invariants preserved
- Workspace `package.json` files remain `0.0.0` (decoupled — RELEASING.md verification invariant).
- Source ↔ marketplace plugin.json byte-identity (`--check` exit 0).
- `v0.2.0` git tag at `ea595e1` is immutable and untouched.
- `plan-0004-pre-cutover` at `7d9b5f1`.
- Cost paragraph byte-identical.
- Skill count: 14; marketplace allowlist: 26 derived.

## Release context

Since `v0.2.0`, the plugin gained (Plans 0007–0018):
- 6 new skills: `$claude-workflow`, `$claude-goal`, `$claude-fork`, `$claude-batch`, `$claude-deep-research`, `$claude-workflows` (7 → 14, counting the lifecycle/review baseline)
- Plugin id rename `claude-companion` → `cc` (Plan 0014; migration recipe in RELEASING.md + REAL-CODEX-TEST-RECIPE.md)
- Real-Codex bug fixes: setup probe no-TTY hang + idle-session leak, version reporting, error-message hints, `$claude-workflows` job-store filter, workflow session metadata
- w22+ doc/coverage: ultracode keyword, `--effort` value docs, saved-workflow `args`, `/tasks`↔`cc status` equivalence

41 commits since `v0.2.0`.

## Next steps

1. Commit this bump (single commit per RELEASING.md).
2. Push; wait for all 4 CI matrix legs green.
3. `git tag v0.3.0 && git push origin main --tags` (only after CI green — RELEASING.md Tagging rules).
4. Optional: GitHub release notes from the summary above.
