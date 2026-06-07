# Plan 0014 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes re-verified; awaiting CI verification)
**Date**: 2026-06-06
**Stage 1 commit**: `3b4c94e` (Plan 0014 Stage 1 approved)

Single `oh-my-claudecode:executor` agent pass for T1 (inventory) + T2 (full rename). T3 (migration notes) folded into T2d's structured edits. T4 (straggler grep) + T5 (gates) orchestrator-absorbed inline.

## T1 — Inventory + plan-of-edits artifact

**Artifact**: [`artifacts/inventory-20260606.txt`](artifacts/inventory-20260606.txt)

Key decisions:

### OQ-A — Doctor regex pattern: `/plugins\."cc/`

Chosen pattern matches both `[plugins."cc"]` (no marketplace qualifier) and `[plugins."cc@cc-plugin-codex-local"]` (qualified install id). Avoids false-positive bare `cc` substring matches that would over-trigger in any line containing "cc" as substring.

Justification: the codex config.toml uses `[plugins."<id>"]` section headers for plugin entries. The pattern requires `plugins."cc` as a prefix, anchoring within the TOML structure. The optional `"` or `@` suffix accommodates both bare and qualified install ids.

### OQ-D — Display name: `CC`

Updated `interface.displayName: "Claude Companion"` → `"CC"` in `packages/plugin-codex/.codex-plugin/plugin.json`. Short, matches the plugin id, no trademark drift.

### Categorization summary

| Category | Files | Action |
|---|---|---|
| MANIFEST | 2 | `name` field rename |
| SCRIPT | 2 (source + mirror) | `git mv` rename |
| DIR | 1 (`marketplace/plugins/claude-companion/`) | `git mv` directory rename |
| PATH_REF | ~30 (SKILL.md run lines, lib refs, tests) | structured string replace |
| DOCTOR | 2 (doctor.ts + doctor.test.mjs) | regex + fixture update |
| DOCS | ~10 (READMEs, RELEASING, MANIFEST, RECIPE) | structured string replace + migration callouts |
| FROZEN | 0001-0013 plan dirs | DO NOT TOUCH (preserved) |

## T2 — Execute the rename

### T2a — Manifest IDs

- `packages/plugin-codex/.codex-plugin/plugin.json` (L2): `"name": "claude-companion"` → `"name": "cc"`; `"displayName": "Claude Companion"` → `"CC"`; `defaultPrompt` "Set up Claude Companion." → "Set up CC."
- `marketplace/.agents/plugins/marketplace.json` (L8, L11): plugin entry `name` and `path` updated

### T2b — Directory rename

```
git mv marketplace/plugins/claude-companion marketplace/plugins/cc
```

Atomic rename preserving git history for all nested files (39+ node_modules dist files + skills + scripts + .codex-plugin + README).

### T2c — Script rename

```
git mv packages/plugin-codex/scripts/claude-companion.mjs packages/plugin-codex/scripts/cc.mjs
git rm -f marketplace/plugins/cc/scripts/claude-companion.mjs   # stale post-dir-rename
```

Note: git's rename detection paired the source rename with the marketplace mirror's old script in an unconventional way (display only — end state is correct). After T2f's marketplace `--write`, the new `marketplace/plugins/cc/scripts/cc.mjs` is created.

### T2d — Path and string references

All 13 SKILL.md run lines: `scripts/claude-companion.mjs` → `scripts/cc.mjs`

Renamed dispatcher (`packages/plugin-codex/scripts/cc.mjs`):
- `Usage: claude-companion <command>` → `Usage: cc <command>`
- All error labels (e.g., `[review] Error: usage: claude-companion stop ...` → `[review] Error: usage: cc stop ...`)
- All internal string references

Lib files (`packages/plugin-codex/scripts/lib/args.mjs`, `claude-version.mjs`): comment header references updated

Tooling:
- `tools/package-marketplace.mjs`: `DERIVED_FILES` paths, `DEST_DIR`, help text
- `tools/smoke-marketplace.mjs`: `PLUGIN_REF`, `PLUGIN_MANIFEST_REL_PATH`, cache path, dispatcher path

Marketplace metadata:
- `marketplace/MANIFEST.md`
- `marketplace/EXCLUSIONS.md`

Documentation:
- `packages/plugin-codex/README.md`: install/uninstall commands; dispatcher path references; hyphenated `claude-companion` ID strings updated to `cc`. **Cost paragraph byte-identical (verified: `grep -c` returns 1 before AND after).** *Note*: the prose product name "Claude Companion" (heading + description) was **deliberately retained** — tests at `readme.test.mjs:23` and `docs-split.test.mjs:137` assert the heading, codifying this as intentional. Only the manifest `displayName` field was renamed to "CC". A future display-name-only pass could harmonize prose if desired.
- `marketplace/plugins/cc/README.md` (post-2b rename): install commands, plugin display
- `documentation/RELEASING.md`: all path/command references + T3 migration callout
- `documentation/REAL-CODEX-TEST-RECIPE.md`: all install references + T3 migration paragraph in §2
- `documentation/testing/findings-20260605.md`: environment footer
- `README.md` (repo root): marketplace README link

Tests (9 files): all 7 plugin tests + setup-probes + runtime/doctor.test.mjs — expected strings, fixture data, error message assertions, path assertions all updated. Some broken regex literals fixed; prettier applied.

Workspace metadata:
- `packages/plugin-codex/package.json`: `description` field

### T2e — Doctor probe (documented runtime exception)

- `packages/runtime/src/doctor.ts:422`: regex `/claude-companion/` → `/plugins\."cc/`
- `packages/runtime/test/doctor.test.mjs`: all 7 `[plugins."claude-companion"]` fixture strings → `[plugins."cc"]`
- `packages/runtime/dist/doctor.js`: rebuilt via `npm run build`

Precedent: Plan 0012 T5 had the same `doctor.ts` exception class.

### T2f — Marketplace resync

```
node tools/package-marketplace.mjs --write
```

Regenerated `marketplace/plugins/cc/` mirror tree (24 derived). The new `marketplace/plugins/cc/scripts/cc.mjs` is created from the renamed source.

```
node tools/package-marketplace.mjs --check
→ check: OK — 24 derived files match source, 64 bundled-dep files match source, ...
```

## T3 — Migration callouts

**`documentation/RELEASING.md`**: added "Migration from `claude-companion` (pre-Plan-0014)" callout block with the 4-command remove + reinstall recipe.

**`documentation/REAL-CODEX-TEST-RECIPE.md` §2**: added migration paragraph before the install steps explaining the rename. The install commands themselves now use `cc@cc-plugin-codex-local`.

## T4 — Straggler grep

Post-rename grep result outside frozen plan dirs:

```bash
grep -rn "claude-companion" packages/ marketplace/ tools/ documentation/ 2>/dev/null \
  | grep -vE 'documentation/plan/0001|0002|0003|0004|0005|0006|0007|0008|0009|0010|0011|0012|0013'
```

Returned only **legitimate keeps**:
1. **Migration callouts** in `documentation/RELEASING.md` + `documentation/REAL-CODEX-TEST-RECIPE.md` — intentional; document the old id for migration guidance
2. **`documentation/research/`** historical research documents — pre-rename narrative; not code; documented as legitimate keep
3. **`documentation/plan/0014-*/`** — current plan documents the rename itself (references both old and new names)

Zero actionable stragglers.

## T5 — Local gates

| Gate | Result |
|---|---|
| Build (`npm run build`) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; **24 derived (unchanged)** + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **13 skills (unchanged)** with "Thirteen skills" wording |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 (prettier applied during T2d) |
| `npm test` (4 lanes) | **1485** (mock 68 + runtime 173 + driver 187 + plugin **1057**), 0 fail |
| `npm run test:attach` | 28, 0 fail (unchanged) |
| `npm run test:bench` | 258, 0 fail (unchanged) |
| `node packages/plugin-codex/scripts/cc.mjs --help` | shows `Usage: cc <command>` with 13 subcommands; no `claude-companion` references in output |

### Cost paragraph byte-identity verification

- Before: `grep -c "Cost savings have not been benchmarked yet"` packages/plugin-codex/README.md → 1
- After: same grep → 1

Byte-identical preserved.

### Test count (Stage 2 close)

| Lane | Plan 0013 close | Plan 0014 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1057 | 1057 | 0 |
| **`npm test` chain** | **1485** | **1485** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1771** | **1771** | **0** |

Plan target was ±5 (rename is behavior-neutral). Actual delta: **0**. Confirms the rename did not break any behavior contract — only string updates and path references changed.

### Remote CI

Awaiting `git push`. Recorded in Stage 3/5.

## Files modified in Stage 2 (consolidated)

Renamed (git mv):
- `packages/plugin-codex/scripts/claude-companion.mjs` → `packages/plugin-codex/scripts/cc.mjs`
- `marketplace/plugins/claude-companion/` → `marketplace/plugins/cc/` (39+ files atomically)

Modified:
- `packages/plugin-codex/.codex-plugin/plugin.json` (manifest id + displayName + defaultPrompt)
- `marketplace/.agents/plugins/marketplace.json` (entry name + path)
- `packages/plugin-codex/scripts/cc.mjs` (post-rename: internal strings)
- `packages/plugin-codex/scripts/lib/args.mjs`, `claude-version.mjs` (comment headers)
- `packages/plugin-codex/skills/*/SKILL.md` × 13 (run lines)
- `packages/plugin-codex/package.json` (description)
- `packages/runtime/src/doctor.ts` (regex)
- `packages/runtime/test/doctor.test.mjs` (7 fixtures)
- All 9 plugin test files
- `tools/package-marketplace.mjs` (paths)
- `tools/smoke-marketplace.mjs` (refs)
- `marketplace/MANIFEST.md`, `marketplace/EXCLUSIONS.md`
- `packages/plugin-codex/README.md`
- `marketplace/plugins/cc/README.md` (post-rename)
- `documentation/RELEASING.md` (refs + migration callout)
- `documentation/REAL-CODEX-TEST-RECIPE.md` (refs + migration paragraph)
- `documentation/testing/findings-20260605.md`
- `README.md` (repo root)
- `packages/runtime/dist/doctor.js` (rebuilt)
- Marketplace mirrors (all regenerated via `--write`)

Artifact:
- `documentation/plan/0014-20260606-plugin-rename-cc/artifacts/inventory-20260606.txt`

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `v0.2.0` tag at `ea595e1` (unchanged — no retag)
- `packages/plugin-codex/README.md` cost paragraph (around L636): **byte-identical** (`grep -c` = 1 before and after)
- `tools/bench/**`, `documentation/plan/0004-*` through `0013-*`: empty diff
- `.github/workflows/ci.yml`: empty diff
- `packages/driver-claude-code/**`: empty diff
- `packages/runtime/**`: **modified** (T2e fix per documented Plan 0014 exception — same class as Plan 0012 T5)
- No `~/.claude/` or `~/.codex/` mutation
- Skill count: 13 (unchanged); marketplace allowlist: 24 (unchanged); plugin version field: `0.2.0` (unchanged)

## Adaptive notes

- Plan 0014 was NOT adaptive — it's a mechanical refactor with deterministic outcome
- Doctor regex pattern (`/plugins\."cc/`) was chosen at T1 inventory time based on TOML structure inspection
- 826 `claude-companion` occurrences renamed; ~150-200 legitimate references in frozen plan dirs preserved

## Plan readme status flip

`documentation/plan/0014-20260606-plugin-rename-cc/readme.md` flipped from `implementing` → `auditing`. Stage 2 complete-pending-CI.
