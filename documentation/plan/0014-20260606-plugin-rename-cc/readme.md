# Plan 0014 — Plugin rename: `claude-companion` → `cc`

**Status**: `implementing`
**Started**: 2026-06-06
**Stage 1 approved**: 2026-06-06 (maintainer authorized full cycle)
**Authorized scope (per maintainer AskUserQuestion 2026-06-06)**: full rename. Plugin ID + directory + script file all become `cc`. Script name `claude-companion.mjs` → `cc.mjs`.
**Last updated**: 2026-06-06

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-06** — Full rename across 826 occurrences in 124 files; documented runtime exception for doctor.ts regex |
| 2 — Implement | `2-implement.md` | **in progress 2026-06-06** — T1 inventory + T2 rename execution via single executor pass |
| 3 — Audit | `3-audit.md` | not started — requires independent context |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Mechanical rename across **826 string occurrences in 124 files**. Three coupled renames:

1. **Plugin manifest ID** — `name: "claude-companion"` → `name: "cc"` in `packages/plugin-codex/.codex-plugin/plugin.json` and `marketplace/.agents/plugins/marketplace.json`
2. **Marketplace directory** — `marketplace/plugins/claude-companion/` → `marketplace/plugins/cc/`
3. **Dispatcher script** — `packages/plugin-codex/scripts/claude-companion.mjs` → `packages/plugin-codex/scripts/cc.mjs` (+ marketplace mirror)

All 13 SKILL.md run lines update from `<plugin-root>/scripts/claude-companion.mjs` to `<plugin-root>/scripts/cc.mjs`. Marketplace path references in tests/tools/docs cascade.

The CC-PLUGIN-CODEX **repository** name stays unchanged. The plugin id field changes. Skill names (`$claude-setup` etc.) come from individual SKILL.md frontmatter and are independent of the plugin name — they stay.

Pattern: structured-replace per Plan 0010/0011/0013 disciplined count-bump pattern, but at much larger scale. Pre/post straggler-grep enforced. Marketplace `--check` byte-identity enforces consistency.

## Breaking change notice

This rename **breaks the user's current install** (cached at `~/.codex/plugins/cache/cc-plugin-codex-local/claude-companion/0.2.0/`). Post-rename, the maintainer (and any other installers) must:

```bash
codex plugin remove claude-companion --marketplace cc-plugin-codex-local
codex plugin marketplace remove cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
```

This will be documented in `documentation/RELEASING.md` and `documentation/REAL-CODEX-TEST-RECIPE.md` as part of T2.

## Runtime exception (documented)

`packages/runtime/src/doctor.ts` contains a regex `/claude-companion/.test(body)` used by the `codex-plugin-trust` probe to detect whether the plugin is configured in the user's codex config. This regex MUST be updated as part of the rename — bare `/cc/` would over-match. The replacement will use a more specific pattern like `/plugins\."?cc"?[@\]]/` or similar (T1 selects the exact pattern).

This is a documented Plan 0014 exception to the "no `packages/runtime/**` touches" invariant. Precedent: Plan 0012 T5 had the same exception for `doctor.ts`.

## Parallel with Prior plans

Plan 0014 must NOT touch:
- `tools/bench/**`, `documentation/plan/0004-*/artifacts/**` (Plan 0004 frozen at `7d9b5f1`)
- `documentation/plan/0005-*` (Plan 0005 deferred)
- `documentation/plan/0006-*` through `0013-*` (all complete; frozen — including historical references to `claude-companion` in these docs)
- `packages/plugin-codex/README.md` cost paragraph at L636
- `.github/workflows/ci.yml`
- `packages/driver-claude-code/**`
- The repo name `cc-plugin-codex` and the `tools/bench/` directory structure
- Git tags `v0.2.0`, `plan-0004-pre-cutover`
- Commit history / message bodies (immutable; commit messages will continue to reference `claude-companion` historically)

Plan 0014 DOES touch:
- All 124 files containing `claude-companion` EXCEPT those listed above
- Manifests, directory structure, script file, lib references, SKILL.md run lines, tests, docs (RELEASING.md, MANIFEST.md, REAL-CODEX-TEST-RECIPE.md, READMEs), marketplace mirror tree, package-marketplace.mjs DERIVED_FILES paths, smoke-marketplace.mjs SKILL_NAMES, etc.
- `packages/runtime/src/doctor.ts` and `packages/runtime/test/doctor.test.mjs` (documented runtime exception)
- `packages/runtime/dist/doctor.js` (rebuilt from `doctor.ts` via build)
