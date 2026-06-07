# Plan 0014 Stage 1 — Plan

**Plan**: Plan 0014 — Plugin rename (`claude-companion` → `cc`; dispatcher `claude-companion.mjs` → `cc.mjs`)
**Status**: drafted (awaiting maintainer authorization)
**Date**: 2026-06-06

## 1. Background

The plugin's id is currently `claude-companion`, inherited verbatim from Plan 0001 prior-art reference (`pejmanjohn/cc-plugin-codex`). It is not idiomatic — the OpenAI reference plugin in `references/codex-plugin-cc` uses the simple name `codex`. The repo is named `cc-plugin-codex`, so `cc` is the established shorthand.

Maintainer authorized full rename (AskUserQuestion 2026-06-06):
- Plugin manifest `name: "claude-companion"` → `name: "cc"`
- Marketplace path `marketplace/plugins/claude-companion/` → `marketplace/plugins/cc/`
- Dispatcher script `claude-companion.mjs` → `cc.mjs`

Scope: **826 string occurrences in 124 files**, including the runtime's `codex-plugin-trust` probe regex.

## 2. Scope

In:
- **T1** — Inventory and categorize all 124 files into edit categories; identify the doctor.ts regex replacement pattern; produce a comprehensive plan-of-edits artifact
- **T2** — Execute the rename in a single structured executor pass:
  - **2a**: manifest IDs (plugin.json + marketplace.json)
  - **2b**: directory rename (`marketplace/plugins/claude-companion/` → `marketplace/plugins/cc/`)
  - **2c**: script file rename (`claude-companion.mjs` → `cc.mjs`) in both source + marketplace mirror
  - **2d**: all path/string references in code, tests, lib files, SKILL.md run lines (13), docs, marketplace tooling (`package-marketplace.mjs` `DERIVED_FILES`, `smoke-marketplace.mjs`)
  - **2e**: `packages/runtime/src/doctor.ts` regex update + tests in `packages/runtime/test/doctor.test.mjs`
  - **2f**: `node tools/package-marketplace.mjs --write` to resync mirrors (incl. `dist/doctor.js`)
- **T3** — Update install docs: `documentation/RELEASING.md` (marketplace ID + plugin name references); `documentation/REAL-CODEX-TEST-RECIPE.md` (install commands); `packages/plugin-codex/README.md` and `marketplace/plugins/cc/README.md` (install steps). **DO NOT touch the cost paragraph.**
- **T4** — Add migration note documenting the breaking-install change (in RELEASING.md + REAL-CODEX-TEST-RECIPE.md).
- **T5** — Gates + CI (orchestrator-absorbed): all static gates green, full test lanes pass, `--check` exit 0 with 24 derived files (count unchanged), `smoke --help` lists 13 skills (unchanged).

Out:
- Anything in `documentation/plan/0001-*` through `0013-*` (frozen — historical references stay)
- `tools/bench/**`, `.github/workflows/ci.yml`, `packages/driver-claude-code/**`
- Cost paragraph at L636 of plugin README
- Repo name `cc-plugin-codex` (stays)
- Skill names (`$claude-setup` etc. — independent of plugin name)
- Plugin version bump (stays at `0.2.0`; the rename is structural, version semantics handled at release)
- Git tags (immutable)
- Commit message bodies (historical, immutable)
- Renaming the user's local cached install — that's a post-merge user action

## 3. Open questions

### OQ-A — Doctor regex replacement pattern

**TO BE RESOLVED IN T1**: `packages/runtime/src/doctor.ts` uses `/claude-companion/.test(body)` to detect whether the plugin is in the user's codex config. Bare `/cc/` would over-match. Candidate replacement patterns:

- **A1**: `/plugins\."cc[@"]/` — matches `[plugins."cc"]` or `[plugins."cc@<marketplace>"]`
- **A2**: `/\bcc@cc-plugin-codex-local\b/` — matches the install-id form
- **A3**: `/"cc"/` — matches the quoted ID anywhere in the toml body

T1 picks the most reliable pattern by inspecting actual codex `~/.codex/config.toml` shape for an installed plugin entry.

### OQ-B — Marketplace dirname normalization

**TO BE RESOLVED**: `marketplace/plugins/claude-companion/` → `marketplace/plugins/cc/`. `git mv` semantics. T2-2b uses `git mv` for the directory rename (preserves history); all nested files migrate atomically.

### OQ-C — Test fixture strings

**RESOLVED**: doctor.test.mjs has `[plugins."claude-companion"]` test fixture strings (7 occurrences). T2-2e updates them coherently with the regex pattern chosen in OQ-A.

### OQ-D — Plugin description / display name

**RESOLVED**: plugin display in `plugin.json` likely has `description` and `interface.displayName` referencing "Claude Companion" or similar. T1 inventory identifies; T2 updates to "CC" or "Claude Code Companion" (final wording TBD inline in T2 — orchestrator picks).

### OQ-E — Hot path `loadPluginVersion()` from Plan 0012

**RESOLVED**: `loadPluginVersion()` resolves `.codex-plugin/plugin.json` relative to the dispatcher script path. After the script rename to `cc.mjs`, the relative-path lookup still works since the script stays in the same directory. No code change needed.

## 4. Tasks

### T1 — Inventory + plan-of-edits artifact (single executor)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: `documentation/plan/0014-20260606-plugin-rename-cc/artifacts/inventory-20260606.txt`

The artifact must contain:
1. File-by-file count of `claude-companion` references (output of `grep -rcE "claude-companion"`)
2. Categorization of each file by edit type:
   - **Manifest** (plugin.json, marketplace.json)
   - **Script rename target** (claude-companion.mjs files)
   - **Directory rename target** (marketplace/plugins/claude-companion/)
   - **Path reference** (SKILL.md run lines, dispatcher tests, etc.)
   - **Doctor probe** (runtime/src/doctor.ts, runtime/test/doctor.test.mjs)
   - **Documentation** (RELEASING.md, READMEs, MANIFEST.md, REAL-CODEX-TEST-RECIPE.md)
   - **Frozen — DO NOT TOUCH** (documentation/plan/0001-*/ through 0013-*/)
3. The chosen doctor.ts regex replacement pattern + justification
4. A `git mv`-able directory rename plan
5. A sed-style global-replace exclusion list (frozen dirs)

### T2 — Execute the rename

**Agent**: `oh-my-claudecode:executor` (single big pass; sequential after T1)

#### 2a — Manifest IDs (low risk)

- `packages/plugin-codex/.codex-plugin/plugin.json` `"name": "claude-companion"` → `"name": "cc"` (also update `description` / `displayName` to remove "Claude Companion" wording if present)
- `marketplace/.agents/plugins/marketplace.json` plugin entry: `"name"` value + `"path"` (`./plugins/claude-companion` → `./plugins/cc`)

#### 2b — Directory rename

- `git mv marketplace/plugins/claude-companion marketplace/plugins/cc`

#### 2c — Script file rename

- `git mv packages/plugin-codex/scripts/claude-companion.mjs packages/plugin-codex/scripts/cc.mjs`
- (Marketplace mirror gets renamed via the directory rename in 2b)

#### 2d — Path and string references

Update ALL of the following (use structured edits, not bulk sed — too risky for some categories):

- All 13 `packages/plugin-codex/skills/*/SKILL.md` run lines: `scripts/claude-companion.mjs` → `scripts/cc.mjs`
- `packages/plugin-codex/scripts/cc.mjs` (renamed): internal references (error message labels e.g., "[review] Error: usage: claude-companion stop <jobId>" → "[review] Error: usage: cc stop <jobId>"; `printUsage` "Usage: claude-companion ..." → "Usage: cc ...")
- `packages/plugin-codex/scripts/lib/*.mjs`: any references to dispatcher path or "claude-companion" string
- `tools/package-marketplace.mjs`: `DERIVED_FILES` path entries (`skills/.../SKILL.md` paths don't change, but the source root `marketplace/plugins/claude-companion/` does) — also any cwd-rooted paths
- `tools/smoke-marketplace.mjs`: plugin display strings and `SKILL_NAMES` references; ID strings in install/uninstall command examples
- `marketplace/MANIFEST.md`: bullet list paths
- `documentation/RELEASING.md`: install/upgrade/uninstall command examples; marketplace tree references; **byte-cost paragraph stays**
- `documentation/REAL-CODEX-TEST-RECIPE.md`: §2 install commands; §3 plugin name reference; §6 known caveats
- `packages/plugin-codex/README.md`: install commands; **cost paragraph at L636 byte-identical**; dispatcher path references; "Claude Companion" wording → "CC" or similar
- `marketplace/plugins/cc/README.md` (post-2b rename): install commands; plugin name display
- All 7 plugin test files: `dispatcher.test.mjs`, `skills-manifest.test.mjs`, `marketplace-layout.test.mjs`, `marketplace-smoke.test.mjs`, `marketplace-releasing.test.mjs`, `marketplace-readme.test.mjs`, `readme.test.mjs`, `docs-split.test.mjs`, `setup-probes.test.mjs` — update all expected strings, fixture data, error message assertions, path assertions
- `packages/plugin-codex/package.json`: any `name` reference (workspace package metadata)

#### 2e — Doctor regex update

- `packages/runtime/src/doctor.ts`: `/claude-companion/.test(body)` → chosen pattern from T1 OQ-A
- `packages/runtime/test/doctor.test.mjs`: update 7 fixture `[plugins."claude-companion"]` strings to `[plugins."cc"]`
- Rebuild `packages/runtime/dist/doctor.js` via `npm run build` (or however the build is invoked)

#### 2f — Marketplace resync

- `node tools/package-marketplace.mjs --write` — regenerates `marketplace/plugins/cc/` mirror tree
- `node tools/package-marketplace.mjs --check` — must exit 0 with 24 derived files (count unchanged)

### T3 — Install docs migration note

Append to `documentation/RELEASING.md` (somewhere near the install/upgrade section): a migration callout for users coming from the `claude-companion` plugin id:

> **Migration from `claude-companion` (pre-Plan-0014)**:
>
> ```bash
> codex plugin remove claude-companion --marketplace cc-plugin-codex-local
> codex plugin marketplace remove cc-plugin-codex-local
> codex plugin marketplace add "$(pwd)/marketplace"
> codex plugin add cc@cc-plugin-codex-local
> ```

Append similar note to `documentation/REAL-CODEX-TEST-RECIPE.md` §2 with a one-paragraph migration explainer.

### T4 — Pre/post straggler grep

After all of T2 + T3 complete, run:

```bash
grep -rn "claude-companion" packages/ marketplace/ tools/ documentation/ 2>/dev/null | grep -v 'documentation/plan/0001\|documentation/plan/0002\|documentation/plan/0003\|documentation/plan/0004\|documentation/plan/0005\|documentation/plan/0006\|documentation/plan/0007\|documentation/plan/0008\|documentation/plan/0009\|documentation/plan/0010\|documentation/plan/0011\|documentation/plan/0012\|documentation/plan/0013'
```

Expected output: empty (zero stragglers outside frozen plan dirs).

Also confirm frozen plan dir references stayed intact:

```bash
grep -rln "claude-companion" documentation/plan/0001*/ ... 0013*/
```

Expected: each frozen plan dir still has its historical references (none lost).

### T5 — Gates + CI (orchestrator-absorbed)

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0; 24 derived (unchanged)
- `node tools/smoke-marketplace.mjs --help` exit 0; 13 skills (unchanged)
- `npm run lint` / `typecheck` / `format` exit 0
- `npm test` (4 lanes) all pass — counts may shift slightly due to fixture string updates but combined should stay close to **1771 ± 5**
- `npm run test:attach` 28 (unchanged); `npm run test:bench` 258 (unchanged)
- `node packages/plugin-codex/scripts/cc.mjs --help` (renamed dispatcher) lists 13 skill subcommands; usage strings reference `cc` not `claude-companion`
- Remote CI `success` across `ubuntu-latest + macos-latest × Node 20 + 22`
- **Post-merge optional**: maintainer reinstalls the renamed plugin locally per the migration recipe and confirms `codex plugin list` shows `cc@cc-plugin-codex-local 0.2.0`

## 5. Risks

- **R1 — Doctor regex over-matches**: `/cc/` matches anything containing "cc". Mitigation: T1 selects a specific pattern (e.g., `/plugins\."cc"/`); T2-2e applies it; tests in doctor.test.mjs verify it.
- **R2 — Missed reference in SKILL.md run line**: any of 13 skills' run line missing the update would cause that skill to fail when invoked. Mitigation: structured per-file edit + post-rename `grep -r "claude-companion.mjs" packages/plugin-codex/skills/` → expected empty.
- **R3 — Marketplace mirror desync**: source vs mirror byte-identity is enforced by `--check`; if rename misses a mirror copy, `--check` fails immediately.
- **R4 — Test fixture strings**: many tests pin "claude-companion" in expected output strings. After rename, they'd fail. Mitigation: structured per-test-file update; full `npm test` run before commit.
- **R5 — Breaking the current install**: documented in plan + RELEASING migration note. Mitigation: clearly communicate; provide migration commands.
- **R6 — Historical reference contamination**: Plan dirs 0001-0013 reference the old name historically. Mitigation: explicit exclusion in straggler grep; T1 identifies + protects.
- **R7 — Workspace package.json `name` field**: `packages/plugin-codex/package.json` has `"name"`. May or may not include "claude-companion". T1 inventories; T2 updates if present.
- **R8 — Build output `dist/doctor.js` may have additional references**: rebuilt from `doctor.ts` via T2-2e + T2-2f --write.

## 6. Test count target

Plan 0013 close baseline: **1771** (1485 npm test + 28 attach + 258 bench).

Plan 0014 target net delta: **±5 tests** (rename should be behavior-neutral; some tests may add regression pins for the new name, some may have their expected strings updated without test count change).

Final combined: **~1766 to ~1776**.

## 7. Acceptance criteria (overall)

- All 826 `claude-companion` occurrences outside frozen plan dirs renamed
- Frozen plan dirs (0001-0013) intact — historical references preserved
- `packages/runtime/src/doctor.ts` regex pattern correctly identifies `cc` plugin entry (verified by doctor.test.mjs)
- All local + remote CI gates green
- Marketplace `--check` exit 0 with 24 derived (unchanged)
- `node packages/plugin-codex/scripts/cc.mjs --help` works (renamed dispatcher)
- All 13 skill subcommands route correctly
- Cost paragraph at L636 byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged); v0.2.0 immutable
- Migration recipe published in RELEASING.md + REAL-CODEX-TEST-RECIPE.md

## 8. Backlog (carried forward, NOT in Plan 0014)

- Skill-discovery surface test (Codex chat → `$claude-*` autocomplete → dispatcher invocation chain) — Plan 0015 candidate per maintainer's next-up direction
- `/workflows` TUI panel wrapper — Plan 0016 candidate (TUI design + PTY-injection)
- `/tasks` PTY-injection design — Plan 0017 candidate (shares PTY-injection design with `/workflows`)
- v0.3.0 release tag — separate maintainer step after Plan 0014 (the rename + Plan 0013 work make it a clean release candidate)
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit
