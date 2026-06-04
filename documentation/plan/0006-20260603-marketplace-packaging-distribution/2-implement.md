# Stage 2 — Implementation: Marketplace packaging and distribution polish

> **Status**: in progress
> **Started**: 2026-06-03
> **Last updated**: 2026-06-03

This log records each T-task's implementation, subagent findings, deviations from [`1-plan.md`](1-plan.md), and acceptance evidence. Plan 0006 runs in parallel with Plan 0004's T11 wait window; Plan 0006 must not touch any of: `tools/bench/**`, Plan 0004 artifacts, `packages/plugin-codex/README.md` cost paragraph, hook/stop-gate behavior, runtime, or driver code.

Task acceptance is measured against [`1-plan.md`](1-plan.md) § 4 (approved 2026-06-03 at commit `fff78de`).

---

## T1 — Research: Codex plugin lifecycle commands

**Status**: complete
**Date**: 2026-06-03
**Codex version tested**: `codex-cli 0.136.0` (Darwin 25.5.0; HEAD `fff78de`)
**Capture**: [`artifacts/codex-plugin-cli-20260603.txt`](artifacts/codex-plugin-cli-20260603.txt) (12 commands captured with stdout/stderr/exit-code on 2026-06-03 19:18Z)

### Methodology

Ran the 12 `codex` and `codex plugin*` CLI surface commands enumerated in the T1 brief, plus two additional surfaces (`codex plugin marketplace add --help`, `codex plugin marketplace upgrade --help`) that the top-level help revealed but the brief did not enumerate. Each command's output was captured in full to the artifact file with `===` delimiters, the exact invocation, the full output, and an exit-code footer.

No Codex plugin state was added, removed, or modified by T1. The only commands that touch Codex config (`plugin list`, `marketplace list`) are read-only. Per Plan 0006 § 1 / Plan 0003 audit F-H1: no `~/.codex` or `~/.claude` state was mutated.

### Findings (T1 answer block)

**Q1 — What Codex version was tested?**
`codex-cli 0.136.0` (the latest version Plans 0001–0004 tested against).

**Q2 — What plugin lifecycle commands exist?**

Top-level `codex plugin` subcommands:
- `add` — install a plugin from a configured marketplace snapshot.
- `list` — list plugins available from configured marketplace snapshots.
- `marketplace` — manage configured plugin marketplaces.
- `remove` — remove an installed plugin from local config + cache.

`codex plugin marketplace` sub-subcommands:
- `add <SOURCE>` — add a local or Git marketplace. SOURCE may be a local path, `owner/repo[@ref]`, HTTPS Git URL, or SSH Git URL.
- `list` — list configured marketplaces and their roots.
- `upgrade [MARKETPLACE_NAME]` — refresh configured Git marketplace snapshots. Omit name to upgrade all. **Note**: this is for Git marketplace sources only; local-path marketplaces (Plan 0006's chosen route per OQ-A) do not need this.
- `remove <MARKETPLACE_NAME>` — remove a configured marketplace source by name.

**Q3 — Does Codex have plugin upgrade/update?**

No. `codex plugin upgrade` and `codex plugin update` are both unrecognized:

```
$ codex plugin upgrade --help
error: unrecognized subcommand 'upgrade'
$ codex plugin update --help
error: unrecognized subcommand 'update'
```

There is `codex plugin marketplace upgrade` (refresh the *marketplace snapshot*, not the *installed plugin*). For an installed plugin to pick up new content, the marketplace snapshot has to be re-loaded AND the plugin instance must be re-installed (remove + add).

**Q4 — If not, is remove + re-add still the upgrade path?**

Yes. The upgrade procedure for an installed cc-plugin-codex deployment is:

```
codex plugin remove claude-companion@cc-plugin-codex-local
codex plugin marketplace remove cc-plugin-codex-local   # only if local-path marketplace pointer needs replacing
codex plugin marketplace add <repo>/marketplace
codex plugin add claude-companion@cc-plugin-codex-local
```

For local-path marketplaces, simply updating the files at `<repo>/marketplace/` does NOT automatically propagate; the user must run `plugin add` again (Codex installs by snapshotting at `add` time). T7 (upgrade procedure documentation) will codify this exact sequence.

**This resolves OQ-D**: the planner's fallback assumption (Option 2 — remove + re-add) is correct. There is no in-place upgrade command for installed plugins.

**Q5 — What marketplace commands exist?**

`codex plugin marketplace {add, list, upgrade, remove}` (see Q2). The local-path form is the relevant subset for Plan 0006 since OQ-A resolved to "commit `marketplace/` in-repo":

```
codex plugin marketplace add <repo>/marketplace
codex plugin marketplace list
codex plugin marketplace remove <name>
```

**Q6 — Does the `.agents/plugins/marketplace.json` + `plugins/<name>/` layout still work?**

The marketplace add error captured during `plugin list` and `marketplace list` is informative:

```
Error: failed to load marketplace(s):
- `cc-plugin-codex-local-smoke` at /private/tmp/cc-plugin-codex-marketplace-15INUy:
  marketplace root does not contain a supported manifest
```

This is a **pre-existing stale entry**, not something T1 created — the path `/private/tmp/cc-plugin-codex-marketplace-15INUy` is a temp dir that no longer exists. The error confirms that Codex 0.136.0 requires "a supported manifest" at the marketplace root. T2 must determine the exact manifest shape Codex expects in `<repo>/marketplace/`.

Plan 0001 T11 used the layout `<marketplace-root>/.agents/plugins/marketplace.json` + `<marketplace-root>/plugins/<name>/`. The Codex 0.136.0 help text does not contradict this. T2 will verify by smoking the committed layout against `codex plugin marketplace add`. If the "supported manifest" Codex expects has changed shape since Plan 0001, T2 will discover and document the diff.

**Open follow-up for T2**: Codex 0.136.0 `marketplace add --help` lists the SOURCE format precisely (`local path`, `owner/repo[@ref]`, HTTPS, SSH) but does NOT document the on-disk manifest schema. T2 either reads Codex source / docs or smoke-tests empirically.

**Q7 — Does `codex plugin marketplace add <repo>/marketplace` work once the committed layout exists, or is that deferred to T2?**

T2 builds the layout AND smoke-tests it. Pre-T2, the layout doesn't exist. T1 cannot end-to-end verify the `marketplace add` call beyond confirming the SOURCE format is documented as `a local path`.

**Q8 — What exact install/upgrade/uninstall command language should later tasks use?**

These are the canonical command shapes Codex 0.136.0 accepts (verified in the capture). Later tasks (T6/T7/T8) will use these verbatim:

- **Install** (one-time per marketplace + per plugin):
  ```
  codex plugin marketplace add <repo>/marketplace
  codex plugin add claude-companion --marketplace <marketplace-name>
  ```
  Or the `@MARKETPLACE` shorthand:
  ```
  codex plugin add claude-companion@<marketplace-name>
  ```

- **Upgrade** (per the Q4 finding):
  ```
  codex plugin remove claude-companion@<marketplace-name>
  codex plugin add claude-companion@<marketplace-name>
  ```
  (After updating files at `<repo>/marketplace/`. If the marketplace source pointer itself changes, `marketplace remove` + `marketplace add` precedes the plugin add.)

- **Uninstall**:
  ```
  codex plugin remove claude-companion@<marketplace-name>
  codex plugin marketplace remove <marketplace-name>   # optional; removes the marketplace pointer
  ```

The `<marketplace-name>` placeholder is the name Codex registers when the marketplace is added — likely derived from the on-disk manifest's `name` field (Plan 0001 used `cc-plugin-codex-local`). T2 confirms.

**Q9 — Did the commands modify real Codex plugin state? If yes, what was changed and restored?**

No. All commands were either `--help` (no state change) or read-only inventory (`plugin list`, `marketplace list`). The stale marketplace entry mentioned in Q6 was already in `~/.codex/config.toml` before T1; T1 did not add or modify it. T1 will not clean it up either, per the Plan 0006 § 1 rule against modifying `~/.codex` outside scoped tasks. T7/T8 (upgrade/uninstall procedures) may document `marketplace remove cc-plugin-codex-local-smoke` as user-facing cleanup guidance if the maintainer asks.

**Q10 — Are there any new compatibility concerns versus Codex 0.135.0 / 0.136.0?**

Two concerns flagged for T2/T6:

- **Marketplace add SOURCE form changed in shape across versions**: Codex 0.136.0 documents SOURCE as `a local path, owner/repo[@ref], HTTPS Git URL, or SSH Git URL`. Plan 0001 T11 (against Codex 0.135.0) only documented local paths. The Git source forms are new surface area. Plan 0006 § OQ-I resolution stays: local marketplace only for v1. The Git surface is documented but not used.
- **"Marketplace root does not contain a supported manifest"**: this exact error string suggests Codex 0.136.0 has a stricter manifest validator than 0.135.0. T2 must verify the committed `marketplace/` layout passes the 0.136.0 validator. If it doesn't, T2 documents the manifest shape required.

OQ-E (compatibility) resolution holds: feature-probe model, no hard version pin. Codex 0.135.0 is documented as earliest known-good; 0.136.0 is latest tested. T9 smoke is the real gate.

### Deviation from 1-plan.md

None. T1's findings match Plan 0006 § 3.5 (marketplace lifecycle) and resolve OQ-D as the planner expected. The two additional commands captured (`marketplace add --help`, `marketplace upgrade --help`) were not in the brief but were natural extensions discovered by reading `marketplace --help` output — added for completeness, not because the brief was wrong.

### Implications for later tasks

| Task | Implication from T1 |
|---|---|
| T2 (commit marketplace layout) | Must verify the on-disk manifest passes Codex 0.136.0's "supported manifest" check. Either read Codex source for the schema or smoke against `marketplace add`. |
| T3 (plugin.json shape) | No new constraints. Single-source pattern (OQ-C) holds. |
| T4 (packaging manifest) | The packaging step must produce a `marketplace/` tree that Codex accepts. T1 confirms the entry command is `codex plugin marketplace add <path>`. |
| T6 (install procedure) | Use the verbatim command shapes from Q8. |
| T7 (upgrade procedure) | Use the `remove + add` sequence from Q4. No in-place `codex plugin upgrade` exists. |
| T8 (uninstall procedure) | `codex plugin remove` + optional `codex plugin marketplace remove`. |
| T9 (smoke test) | The smoke must include `codex plugin marketplace list` and `codex plugin list` to confirm Codex discovers the marketplace AND each of the 8 skills. |

### Safety + scope confirmation

- No files modified outside `documentation/plan/0006-20260603-marketplace-packaging-distribution/`.
- `tools/bench/**` untouched.
- `documentation/plan/0004-*/artifacts/**` untouched.
- `packages/plugin-codex/README.md` cost paragraph untouched.
- `packages/plugin-codex/scripts/**`, `packages/runtime/**`, `packages/driver-claude-code/**` untouched.
- No hook or stop-gate code created.
- Plan 0005 stays `deferred`.
- Plan number sequence unchanged.

`git diff --stat HEAD` (against `fff78de`): 0 changes to tracked files; one new untracked file (`artifacts/codex-plugin-cli-20260603.txt`) plus this `2-implement.md`. Both under `documentation/plan/0006-*/`. The artifact file is committed alongside this section.

### Gate evidence

T1 is research/docs only. `npm run format` is the only gate run (other gates are unchanged from `fff78de`).

### CI evidence

- Commit: `97f8ea4` ("Plan 0006 T1: research Codex plugin lifecycle commands")
- CI run: `26907649775`
- Conclusion: **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).

---

## T2 — Commit local marketplace layout

**Status**: complete pending CI
**Date**: 2026-06-03
**Codex version tested**: `codex-cli 0.136.0` on Darwin 25.5.0
**Empirical smoke artifact**: [`artifacts/t2-marketplace-add-20260603.txt`](artifacts/t2-marketplace-add-20260603.txt)

### Deliverables

T2 created the top-level `marketplace/` tree as a DERIVED copy of `packages/plugin-codex/`. The source plugin under `packages/plugin-codex/` was not modified; T2 is creation-only outside `marketplace/`.

**Files created (20 under `marketplace/`)**:

- `marketplace/.agents/plugins/marketplace.json` — Codex marketplace manifest (shape per Plan 0006 § 3.1).
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` — byte-identical copy of the source plugin manifest (`cmp` reports zero diff).
- `marketplace/plugins/claude-companion/README.md` — minimal T2 placeholder; final marketplace-facing README is T12 scope.
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs` — copy of source dispatcher entry; executable bit set (`-rwxr-xr-x`).
- `marketplace/plugins/claude-companion/scripts/lib/{ack,adapter,args,format,prompt-meta,review-parser,review-prompts,review-result-source}.mjs` — 8 helpers, copies of source.
- `marketplace/plugins/claude-companion/skills/{claude-adversarial-review,claude-delegate,claude-followup,claude-result,claude-review,claude-setup,claude-status,claude-stop}/SKILL.md` — 8 skill manifests, copies of source.

**Static-validation test file (NEW, in plugin test lane)**:

- `packages/plugin-codex/test/marketplace-layout.test.mjs` — 10 `it` blocks covering: marketplace.json shape + valid JSON; marketplace plugin.json existence + byte-identity vs source; 8 skill dirs + non-empty SKILL.md each; claude-companion.mjs executable bit; scripts/lib mirror against source; recursive forbidden-file/path exclusion; OQ4 cost-claim token scan over marketplace.json + marketplace README.

### marketplace.json shape (Plan 0006 § 3.1 candidate, accepted by Codex 0.136.0)

```json
{
  "name": "cc-plugin-codex-local",
  "interface": { "displayName": "cc-plugin-codex Local Marketplace" },
  "plugins": [
    {
      "name": "claude-companion",
      "source": { "source": "local", "path": "./plugins/claude-companion" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Coding"
    }
  ]
}
```

### Empirical marketplace add smoke

Captured at `artifacts/t2-marketplace-add-20260603.txt`. Sequence (Codex 0.136.0):

1. `codex plugin marketplace add /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace` → exit 0, output: `Added marketplace cc-plugin-codex-local from <path>.`
2. `codex plugin marketplace list` → exit 1, surfaced the **pre-existing** stale `cc-plugin-codex-local-smoke` error (T1-observed; not created by T2). The newly-added `cc-plugin-codex-local` was registered in `~/.codex/config.toml` regardless — confirmed via read-only `grep` on the config file: lines 119/146 showed both `cc-plugin-codex-local-smoke` and the new `cc-plugin-codex-local` with the correct repo path.
3. `codex plugin list` → exit 1, same pre-existing stale-entry error.

The list errors do NOT block the add; the marketplace was registered. The T1 finding that the stale entry causes downstream `list` commands to fail also holds for T2.

### Cleanup

`codex plugin marketplace remove cc-plugin-codex-local` → exit 0, output: `Removed marketplace cc-plugin-codex-local.` Post-cleanup `grep` of `~/.codex/config.toml` confirmed the `cc-plugin-codex-local` entry is gone. The stale `cc-plugin-codex-local-smoke` entry (from before T1) was NOT touched — per the maintainer's brief. No residual Codex state from T2.

### Resolves Q6 of T1

T1 left open the question of whether Codex 0.136.0's "supported manifest" validator would accept the Plan 0006 § 3.1 manifest shape. T2 empirically confirms: **yes**. The shape passes. No iteration on the manifest was needed.

### Acceptance evidence

- Layout matches Plan 0006 § 3.1 (Subagent C cross-checked).
- Source plugin not modified (`git diff --stat HEAD packages/plugin-codex/` empty; only the new test file is untracked).
- Marketplace plugin.json byte-identical to source (`cmp` zero diff).
- 8 skill dirs present; each `SKILL.md` size 608-1709 bytes.
- 8 lib helpers mirror source exactly.
- `claude-companion.mjs` mode includes user-executable bit.
- No forbidden internal/test/secret files in marketplace tree (recursive walk).
- 0 OQ4 forbidden cost-claim tokens in marketplace.json or marketplace README.
- Empirical `codex plugin marketplace add` succeeds AND cleanup succeeds.

### Implications for later tasks

| Task | Implication from T2 |
|---|---|
| T3 (plugin.json shape) | The current source plugin.json is already accepted by Codex 0.136.0 via the byte-identical marketplace copy. T3 may bump the version per OQ-B (semver) but no shape change is needed. |
| T4 (packaging manifest) | T2 IS the packaging step's output for v1; T4 codifies it as a documented procedure / script. |
| T5 (exclusion enforcement) | T2's test file already enforces the exclusion list via the recursive walk. T5 may extend the test or copy the same pattern into a release-time script. |
| T6 (install procedure) | T2 confirms `codex plugin marketplace add <repo>/marketplace` works. T6 documents the full install sequence including `codex plugin add claude-companion@cc-plugin-codex-local`. |
| T9 (smoke test) | T2's empirical smoke proves marketplace REGISTRATION works. T9's smoke must extend to verify per-skill DISCOVERY via `codex plugin list` + per-skill invocation (after cleaning the stale entry, or in an isolated Codex config). |

### Deviation from 1-plan.md

None. The Plan 0006 § 3.1 manifest shape was accepted on first attempt. T1's flagged compatibility concern (stricter manifest validation in 0.136.0) does NOT block the planned shape.

### Local gate evidence at T2 close (commit pending)

- `npm run lint` — clean
- `npm run typecheck` — clean
- `npx prettier --check .` — pending
- `npm test` — pending (expected 1051: prior 1041 + 10 from marketplace-layout test file; plugin lane 623 → 633)
- `npm run test:attach` — unchanged from Plan 0004 T10 (28/28)
- `npm run test:bench` — unchanged from Plan 0004 T10 (258/258)

### Safety + scope confirmation

- 0 changes to tracked files (`git diff --stat HEAD` empty).
- Only new files under `marketplace/`, `packages/plugin-codex/test/marketplace-layout.test.mjs`, and `documentation/plan/0006-*/artifacts/t2-marketplace-add-20260603.txt`.
- `tools/bench/**` untouched.
- `documentation/plan/0004-*/artifacts/**` untouched.
- `packages/plugin-codex/README.md` cost paragraph untouched.
- `packages/plugin-codex/scripts/**`, `packages/runtime/**`, `packages/driver-claude-code/**` untouched.
- No hooks or stop-gate code; Plan 0005 stays `deferred`.
- `git rev-parse plan-0004-pre-cutover` → `7d9b5f1...`; tag preserved.
- Pre-existing stale `cc-plugin-codex-local-smoke` Codex entry preserved per the brief.

### CI evidence

- Commit: `dc40a3a` ("Plan 0006 T2: commit local marketplace layout")
- CI run: `26909059631`
- Conclusion: **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).
- Plugin lane post-T2: 633/633 (up from 623; +10 marketplace-layout tests).

### Status

**T2 complete.** Plan 0006 status remains `planning` (Stage 1 approved); T1 and T2 of Stage 2 done; T3 paused awaiting maintainer go-ahead.

---

## T3 — Finalize plugin manifest shape

**Status**: complete pending CI
**Date**: 2026-06-03
**Codex version tested**: `codex-cli 0.136.0`
**Empirical smoke artifact**: [`artifacts/t3-marketplace-manifest-20260603.txt`](artifacts/t3-marketplace-manifest-20260603.txt)

### Deliverables

T3 finalizes the plugin manifest contract for the marketplace distribution.

**Manifest changes**:

- `packages/plugin-codex/.codex-plugin/plugin.json` — version bumped `0.1.0` → `0.2.0`. Source of truth.
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` — byte-identical copy (verified via `cmp` exit 0).

The single line change is the version bump. All other manifest fields (`name`, `description`, `author{name,url}`, `skills`, `interface{displayName,category,capabilities,defaultPrompt,brandColor}`) were already at their T3 final shape from Plans 0001–0003 — no shape change was needed.

**Workspace package.json** at `packages/plugin-codex/package.json` remains version `0.0.0` (workspace-internal, decoupled from plugin.json per OQ-B resolution). Root `package.json` also unchanged.

**Final manifest shape (v0.2.0)**:

```json
{
  "name": "claude-companion",
  "version": "0.2.0",
  "description": "Delegate tasks from Codex to Claude Code background sessions.",
  "author": { "name": "Hongjun Wu", "url": "https://github.com/wu-hongjun" },
  "skills": "./skills/",
  "interface": {
    "displayName": "Claude Companion",
    "category": "Coding",
    "capabilities": ["Interactive"],
    "defaultPrompt": [/* 8 skill-trigger sentences */],
    "brandColor": "#D97706"
  }
}
```

### Test changes

Subagent B extended two existing test files (+14 net) to lock in the v0.2.0 manifest contract:

- `packages/plugin-codex/test/skills-manifest.test.mjs`: +11 tests covering version-pinned-to-0.2.0, author.{name,url} non-empty, displayName + category non-empty, brandColor `#D97706`, defaultPrompt length exactly 8, and a recursive `collectStringValues` walker that scans all manifest string fields for benchmark/cost-savings/marketing tokens.
- `packages/plugin-codex/test/marketplace-layout.test.mjs`: +3 tests covering marketplace JSON validity, marketplace version pin, and marketplace-side OQ4 forbidden-token scan.

Test counts: plugin lane 633 → 648 (+15; B reported +14, the +1 overshoot is a minor test-split that does not change coverage semantics). All 13 acceptance points from the T3 brief are covered.

### Empirical Codex acceptance smoke

Captured at `artifacts/t3-marketplace-manifest-20260603.txt`. Sequence (Codex 0.136.0):

1. `codex plugin marketplace add /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace` → exit 0; `Added marketplace cc-plugin-codex-local from <path>`.
2. `codex plugin marketplace remove cc-plugin-codex-local` → exit 0; `Removed marketplace cc-plugin-codex-local.`
3. Pre-existing stale `cc-plugin-codex-local-smoke` entry (lines 73 + 119 in `~/.codex/config.toml`) NOT touched. T3 left no residual Codex state.

Codex 0.136.0 accepts the v0.2.0 manifest unchanged from T2. No iteration needed.

### A/B/C findings

- **A (orchestrator-direct)**: trivial single-line edit + byte-identical copy. No issues.
- **B (subagent)**: +14 tests across two existing files; all 13 acceptance points covered; no new file needed; no manifest modifications.
- **C (subagent, read-only)**: APPROVE on all 11 review checks. Single content change isolated to the version bump. OQ4 + marketing-claim greps both 0 hits. Plan 0004 tag intact at 7d9b5f1. Recommends commit.

### Deviation from 1-plan.md

None. The manifest shape Plan 0006 § 3.1 specified as final-T3 was already the existing shape from Plan 0001/0003 development; only the version field changed. Codex 0.136.0 acceptance confirms the planner's recommendation for OQ-C (single source of truth at `packages/plugin-codex/.codex-plugin/plugin.json`, marketplace copy derived) and OQ-B (semver `0.x.y`) without contradiction.

### Local gate evidence

- `npm run lint` — clean
- `npm run typecheck` — clean
- `npx prettier --check .` — clean (after format-write auto-fix on the new test file)
- `npm test` — exit 0; mock 68 + runtime 172 + driver 178 + plugin **648** = **1066** (was 1051 at T2; +15)
- `npm run test:attach` — **28/28** (unchanged)
- `npm run test:bench` — **258/258** (unchanged)
- **Combined total: 1352** tests passing

### Safety + scope confirmation

- 4 tracked files modified: both plugin.json files + both test files.
- 1 untracked new artifact: `artifacts/t3-marketplace-manifest-20260603.txt`.
- `tools/bench/**` untouched.
- `documentation/plan/0004-*/artifacts/**` untouched.
- `packages/plugin-codex/README.md` cost paragraph untouched.
- `packages/plugin-codex/scripts/**`, `packages/plugin-codex/skills/**`, `packages/runtime/**`, `packages/driver-claude-code/**` untouched.
- No hooks or stop-gate code. Plan 0005 stays `deferred`.
- `git rev-parse plan-0004-pre-cutover` → `7d9b5f1...`; tag preserved.

### Implications for later tasks

| Task | Implication from T3 |
|---|---|
| T4 (packaging manifest / procedure) | The single-source pattern (OQ-C) is locked. T4 codifies the byte-identical copy step as a release-time procedure or script. |
| T5 (exclusion enforcement) | T3 changed only the version field. Existing T2 exclusion tests still apply unchanged. |
| T6 (install procedure) | Install command stays `codex plugin add claude-companion@cc-plugin-codex-local` per T1's verbatim command shapes. |
| T9 (smoke test) | Smoke must verify `plugin.json` reports `version: 0.2.0` in installed plugin output. |
| T10 (version bump procedure) | T3 demonstrates the version-bump procedure: edit source, `cp` to marketplace, run gates, commit. T10 documents this in the release checklist. |
| T11 (release checklist) | Add version bump as a checklist step. |

### CI evidence

- Commit: `2e8ec62` ("Plan 0006 T3: finalize plugin manifest shape")
- CI run: `26910057761`
- Conclusion: **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).
- Plugin lane post-T3: 648/648 (up from 633; +15 manifest-final tests).

### Status

**T3 complete.** Plan 0006 status remains `planning` (Stage 1 approved); T1, T2, T3 of Stage 2 done; T4 (packaged-file manifest + packaging procedure) paused awaiting maintainer go-ahead.

---

## T4 — Packaged-file manifest + packaging procedure

**Status**: complete pending CI
**Date**: 2026-06-03
**Codex version tested**: `codex-cli 0.136.0`
**Empirical smoke artifact**: [`artifacts/t4-packaging-manifest-20260603.txt`](artifacts/t4-packaging-manifest-20260603.txt)

### Deliverables

T4 codifies the source → marketplace packaging procedure that T2/T3 performed manually.

**New files**:

- `marketplace/MANIFEST.md` — human-readable packaged-file manifest listing the 18 derived files and the 2 marketplace-owned files; references the packaging script.
- `tools/package-marketplace.mjs` — packaging script with three modes (`--check`, `--write`, `--help`); `node:*` built-ins only.

**Modified**:

- `packages/plugin-codex/test/marketplace-layout.test.mjs` — +10 new tests for the T4 contract (13 → **23**).

### Final packaged-file manifest

The plugin tree under `marketplace/plugins/claude-companion/` contains exactly:

| Kind | Count | Source |
|---|---|---|
| Derived (copied from `packages/plugin-codex/<rel>`) | 18 | source plugin |
| Marketplace-owned (independent of source) | 1 | `README.md` (T2 placeholder; T12 will replace) |

Plus marketplace-root metadata at `marketplace/.agents/plugins/marketplace.json` (also marketplace-owned).

Derived allowlist (18 files):

- `.codex-plugin/plugin.json`
- `scripts/claude-companion.mjs` (executable bit set to `0o755`)
- `scripts/lib/{ack, adapter, args, format, prompt-meta, review-parser, review-prompts, review-result-source}.mjs` (8)
- `skills/{claude-setup, claude-delegate, claude-status, claude-result, claude-stop, claude-followup, claude-review, claude-adversarial-review}/SKILL.md` (8)

### README handling (Option A — recorded explicitly)

`marketplace/plugins/claude-companion/README.md` is marketplace-owned, NOT derived from source. The script never reads or writes it. The current placeholder (T2) will be replaced by T12. Rationale: the source `packages/plugin-codex/README.md` (551 lines, full v1 plugin docs) is end-user-facing for the source repo, not for the marketplace distribution. Copying it verbatim would clobber the T2 placeholder and confuse marketplace consumers.

### `--check` and `--write` semantics

**`--check`** (default if no flag):

1. Verifies source + marketplace files exist for each allowlist entry.
2. Verifies `readFileSync` returns equal bytes for source ↔ marketplace pairs.
3. Verifies marketplace-owned files (README.md, marketplace.json) exist (no source comparison).
4. Verifies no extra files appear under `marketplace/plugins/claude-companion/` outside the allowlist + marketplace-owned set.
5. Verifies `scripts/claude-companion.mjs` mode has the user-executable bit.
6. Verifies `marketplace/.agents/plugins/marketplace.json` parses as JSON with `name: "cc-plugin-codex-local"`.

Exit 0 on success; non-zero with `ISSUE:` messages on drift.

**`--write`**:

1. Creates required directories (`mkdirSync({ recursive: true })`).
2. For each allowlisted derived file: `writeFileSync(dst, readFileSync(src))`.
3. Always `chmodSync(dst, 0o755)` on `scripts/claude-companion.mjs` after copy (source mode is 644 but the marketplace copy must be executable).
4. Skips marketplace-owned files (`README.md`, `marketplace.json`).
5. WARNS about extras but does NOT delete them (avoids accidental data loss).
6. Idempotent: running `--write` against a fresh tree, then `--check`, exits 0 with no working-tree mutation.

### Empirical verification

- `node tools/package-marketplace.mjs --check` → exit 0; output: `check: OK — 18 derived files match source, 1 marketplace-owned files present, no unexpected files.`
- `node tools/package-marketplace.mjs --write` → no working-tree mutation (idempotent on current HEAD).
- `node tools/package-marketplace.mjs --help` → exit 0, usage text including all three flags + the full allowlist.
- `codex plugin marketplace add /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace` → exit 0, `Added marketplace cc-plugin-codex-local from <path>`.
- `codex plugin marketplace remove cc-plugin-codex-local` → exit 0.
- Pre-existing stale `cc-plugin-codex-local-smoke` entry preserved per maintainer brief; no residual Codex state from T4.

### Test changes

Subagent B extended `marketplace-layout.test.mjs` with a new `describe('marketplace packaging procedure (Plan 0006 T4)', ...)` block containing the 10 T4 acceptance assertions:

| # | Assertion |
|---|---|
| T4-1 | `marketplace/MANIFEST.md` exists, non-empty |
| T4-2 | MANIFEST list covers every derived file under `marketplace/plugins/claude-companion/` |
| T4-3 | Reverse: every file in the marketplace tree is in the MANIFEST list (or marketplace-owned README) |
| T4-4 | All 18 derived files byte-identical between source and marketplace |
| T4-5 | `--check` exits 0 on the current tree |
| T4-6 | `--check` exits non-zero when marketplace drifts (verified via try/finally byte-flip + restore on a real derived file) |
| T4-7 | `scripts/claude-companion.mjs` has user-executable bit |
| T4-8 | No extras under `marketplace/plugins/claude-companion/` |
| T4-9 | No OQ4 forbidden cost-claim tokens in `MANIFEST.md` |
| T4-10 | `tools/package-marketplace.mjs` does not contain forbidden path literals (`tools/bench/`, `documentation/plan/`, `references/`, `node_modules/`, `.github/`) |

Plugin lane: 648 → 658 (+10). All pass.

### A/B/C findings

- **Subagent A**: created MANIFEST.md + packaging script. Option A README handling chosen and recorded. `--check` exit 0; `--write` idempotent.
- **Subagent B**: extended marketplace-layout.test.mjs with 10 new T4 assertions including drift detection via try/finally byte-flip restore. All 23 tests pass.
- **Subagent C**: APPROVE on all 13 review checks. Allowlist correct, script safe (no shell spawn, no third-party deps, no writes outside allowlist), MANIFEST.md complete, byte-identity confirmed via F-H2 trace on 3 sample files, scope clean, no cost-claim/marketing tokens.

### Deviation from 1-plan.md

None. The packaging procedure shape Plan 0006 § T4 proposed is what A/B implemented. Option A for README was explicitly approved by the brief ("if the script doesn't support root override, fall back to..." — option chosen + documented).

### Local gate evidence (commit pending)

- `npm run lint` — clean
- `npm run typecheck` — clean
- `npx prettier --check .` — pending
- `npm test` — pending (expected mock 68 + runtime 172 + driver 178 + plugin **658** = 1076; +10 from T4)
- `npm run test:attach` — unchanged from Plan 0004 T10 (28/28)
- `npm run test:bench` — unchanged from Plan 0004 T10 (258/258)

### Implications for later tasks

| Task | Implication from T4 |
|---|---|
| T5 (exclusion list + enforcement) | T4's `--check` already verifies "no extras"; T5 owns the formal exclusion-list document. The T5 doc can reference T4's allowlist as the inverse. |
| T6 (install procedure) | Install procedure can now reference `node tools/package-marketplace.mjs --write` as the prepare-marketplace step (or note that the committed tree IS already in sync). |
| T7 (upgrade) | Upgrade procedure: pull repo, run `--write` (if any drift), then `codex plugin remove + codex plugin add`. T7 documents this. |
| T8 (uninstall) | Unchanged from T1 finding. |
| T9 (smoke) | T9 should include `node tools/package-marketplace.mjs --check` as a pre-smoke gate. |
| T10 (version bump) | T10 documents the version-bump procedure: edit source plugin.json, run `--write`, run gates, commit. |
| T11 (RELEASING.md) | T11 references `tools/package-marketplace.mjs --check` as a release-checklist step. |

### CI evidence

- Commit: `2bcff2e` ("Plan 0006 T4: define packaged-file manifest and packaging procedure")
- CI run: `26911821860`
- Initial conclusion: cancelled — `ubuntu-latest / Node 22` leg was cancelled by GitHub Actions infrastructure; the other 3 legs succeeded. Transient flake, no plan content involved.
- Reran the cancelled leg via `gh run rerun 26911821860 --failed`.
- Final conclusion: **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).
- Plugin lane post-T4: 658/658 (up from 648; +10 packaging tests).

Note: a similar single-leg cancellation hit the Plan 0006 T2-log commit (`4507cde`, run `26909357751`) earlier in this session. Same pattern: transient infrastructure cancellation on one leg; rerun succeeded. Tracked as a CI infrastructure observation; not a code issue.

### Status

**T4 complete.** Plan 0006 status remains `planning` (Stage 1 approved); T1, T2, T3, T4 of Stage 2 done; T5 (formal exclusion list + defense-in-depth) paused awaiting maintainer go-ahead.

---

## T5 — Exclusion list + defense-in-depth enforcement

**Status**: complete pending CI
**Date**: 2026-06-03
**Codex version tested**: `codex-cli 0.136.0`
**Empirical artifact**: [`artifacts/t5-exclusion-check-20260603.txt`](artifacts/t5-exclusion-check-20260603.txt)

### Deliverables

T5 formalizes the marketplace exclusion list and adds defense-in-depth enforcement layers.

**New files**:

- `marketplace/EXCLUSIONS.md` — categorized exclusion document with 11 category table + enforcement section + POSIX-path notes.
- `documentation/plan/0006-*/artifacts/t5-exclusion-check-20260603.txt` — empirical check capture showing `--check` exit 0 on the committed tree + `find` commands across all forbidden patterns all returning empty.

**Modified files**:

- `tools/package-marketplace.mjs` — added `EXCLUDED_SEGMENTS` (10), `EXCLUDED_SUFFIXES` (7), `EXCLUDED_EXACT_BASENAMES` (15), `EXCLUDED_BASENAME_PREFIXES` (3); `isExcluded(rel)` helper; exclusion check runs as **step 0** in `--check`, before the allowlist comparison; `--marketplace-root <path>` CLI flag and `CC_PLUGIN_CODEX_MARKETPLACE_ROOT` env var as test seams.
- `marketplace/MANIFEST.md` — 4-line paragraph pointing readers at `EXCLUSIONS.md`.
- `packages/plugin-codex/test/marketplace-layout.test.mjs` — +10 T5 tests in a new `describe('marketplace exclusion enforcement (Plan 0006 T5)')` block (23 → 33). Also removed unused `basename` import flagged by eslint during the gate run.

### Exclusion categories (EXCLUSIONS.md)

| Category | Coverage |
|---|---|
| Tests | `*.test.{mjs,ts,js}`, `test/`, `tests/` segments |
| TypeScript sources | `src/` segment, `*.ts` suffix |
| Build config | `tsconfig*.json` |
| Repo CI / lint / format config | `.github/`, `.prettierrc`, `eslint.config.{mjs,js}` |
| Internal docs and plans | `documentation/`, `references/` |
| Development tools | `tools/` segment (covers `tools/bench/`, `tools/mock-*`) |
| Node dependency trees | `node_modules/` |
| Workspace metadata | `package-lock.json` |
| Orchestration metadata | `CLAUDE.md`, `AGENTS.md`, `.omc/` |
| VCS metadata | `.git/`, `.gitignore` at packaged-plugin root |
| Secrets | `.env`, `.env.*`, `credentials*`, `*.pem`, `*.key`, `*.crt`, `id_rsa*`, `id_ed25519*` |

### Test seam

Subagent A added both `--marketplace-root <path>` CLI flag (primary) and `CC_PLUGIN_CODEX_MARKETPLACE_ROOT` env var (fallback). When the override is active, the `marketplace.json` validity check is skipped (synthetic roots don't need to mirror that path). Subagent B's tests use real-tree try/finally injection (simpler than synthetic-root copy) because the exclusion check runs as step 0 — injecting a forbidden file into the real tree, running `--check`, then immediately deleting it in `finally`.

### Tests added (10 T5 points)

1. `EXCLUSIONS.md exists and is non-empty`
2. `EXCLUSIONS.md contains all required category substrings`
3. `EXCLUSIONS.md contains no OQ4 forbidden cost-claim tokens`
4. `--check exits 0 on committed tree (T5 guard)`
5. `--check exits non-zero when .test.mjs injected`
6. `--check exits non-zero when .ts injected`
7. `--check exits non-zero when .env injected`
8. `--check exits non-zero when node_modules/ injected`
9. `real marketplace tree contains no excluded files (independent exclusion walk)`
10. `every real marketplace file is listed in MANIFEST.md (T5 guard)`

All injection tests use try/finally with `rmSync` cleanup. Post-test `--check` confirms exit 0 (no leaked injections).

### A/B/C findings

- **Subagent A**: produced EXCLUSIONS.md + script enforcement + dual test seam (CLI flag + env var). Validated `--check` exit 0 on committed tree (no false positives) + non-zero on synthetic injection.
- **Subagent B**: extended `marketplace-layout.test.mjs` with the 10 T5 assertions. Used real-tree try/finally injection (cleaner than temp-copy because step 0 fires before source comparison). All 33 tests pass.
- **Subagent C**: APPROVE on all 13 review checks. EXCLUDED_PATTERNS shape correct (10/7/15/3); F-H2 trace clean (EXCLUSIONS.md row → script pattern → test → real-tree absence) for Tests, node_modules, and Secrets categories.

### Gate fix during T5

Initial lint failed with `'basename' is defined but never used` in `marketplace-layout.test.mjs:12:25` — left over from a prior version of B's test additions. Removed the unused import in the imports block (orchestrator-applied fix); re-lint clean.

### Deviation from 1-plan.md

None. The exclusion-list shape Plan 0006 § 3.3 specified matches what A/B implemented. The README handling stays consistent with T4's Option A (marketplace-owned, not derived).

### Local gate evidence

- `npm run lint` — clean (after removing the unused `basename` import)
- `npm run typecheck` — clean
- `npx prettier --check .` — clean (after auto-fix on the new test file and script)
- `npm test` — exit 0; mock 68 + runtime 172 + driver 178 + plugin **668** = **1086** (was 1076 at T4; +10)
- `npm run test:attach` — unchanged (28/28)
- `npm run test:bench` — unchanged (258/258)
- **Combined total: 1372** tests passing

### Implications for later tasks

| Task | Implication from T5 |
|---|---|
| T6 (install procedure) | Install docs reference `--check` as a pre-install gate (catches stale marketplace state from upstream changes). |
| T9 (smoke test procedure) | T9 smoke can rely on the layered enforcement: allowlist (T2-T4) + exclusion list (T5). |
| T11 (RELEASING.md) | Release checklist references `tools/package-marketplace.mjs --check` AND a manual review of `EXCLUSIONS.md` before each cut. |

### Safety + scope confirmation

- 3 tracked files modified: `marketplace/MANIFEST.md`, `tools/package-marketplace.mjs`, `packages/plugin-codex/test/marketplace-layout.test.mjs`.
- 2 new files: `marketplace/EXCLUSIONS.md`, `documentation/plan/0006-*/artifacts/t5-exclusion-check-20260603.txt`.
- `tools/bench/**` untouched.
- `documentation/plan/0004-*/artifacts/**` untouched.
- `packages/plugin-codex/README.md` cost paragraph untouched.
- `packages/plugin-codex/scripts/**`, `skills/**`, `.codex-plugin/plugin.json` untouched.
- `marketplace/plugins/claude-companion/**` and `marketplace/.agents/plugins/marketplace.json` untouched.
- No hooks / stop-gate code. Plan 0005 stays `deferred`.
- `git rev-parse plan-0004-pre-cutover` → `7d9b5f1…`; tag preserved.
- 0 OQ4 forbidden cost-claim tokens introduced (grep verified across all T5 surface files).

### CI evidence

- Commit: `f7d790d` ("Plan 0006 T5: define marketplace exclusion list")
- CI run: `26914562993`
- Conclusion: **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).
- Plugin lane post-T5: 668/668 (up from 658; +10 exclusion-enforcement tests).

### Status

**T5 complete.** Plan 0006 status remains `planning` (Stage 1 approved); T1, T2, T3, T4, T5 of Stage 2 done; T6 (user install procedure) paused awaiting maintainer go-ahead.

---

## T6 — User install procedure

**Status**: complete pending CI
**Date**: 2026-06-03
**Codex version tested**: `codex-cli 0.136.0`
**Empirical artifact**: [`artifacts/t6-install-procedure-20260603.txt`](artifacts/t6-install-procedure-20260603.txt)

### Deliverables

T6 documents and verifies the end-to-end user install procedure for the committed marketplace layout.

**New / modified files**:

- `marketplace/plugins/claude-companion/README.md` (M) — replaced the T2/T4 placeholder with a focused user-facing install doc. Sections: Requirements, Install, Verify, Uninstall, Troubleshooting, Upgrade (forward-pointer to T7).
- `documentation/RELEASING.md` (NEW) — minimal Plan 0006 release-checklist stub with the install/uninstall sections and a pointer to `tools/package-marketplace.mjs --check` (T4) as the packaging-verification gate. T7-T11 will expand.
- `packages/plugin-codex/test/marketplace-readme.test.mjs` (NEW) — 13 static-validation tests for the install-doc contract.

### Install commands (verbatim per T1 capture)

```bash
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

Verify with `codex plugin list`, then inside a Codex session run `$claude-setup`.

Uninstall:

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
```

### Empirical install smoke (isolated CODEX_HOME)

Captured at `artifacts/t6-install-procedure-20260603.txt`. Sequence (Codex 0.136.0):

1. `pwd` → repo root.
2. `node tools/package-marketplace.mjs --check` → exit 0 (`18 derived files match source, 1 marketplace-owned files present, no unexpected files`).
3. **All `codex` commands ran with `CODEX_HOME=/private/tmp/t6-codex-home-LeZU`** (a `mktemp -d` directory) so the real `~/.codex` was never mutated.
4. `codex plugin marketplace add <repo>/marketplace` → exit 0; `Added marketplace cc-plugin-codex-local from <path>`.
5. `codex plugin marketplace list` → exit 0; output `cc-plugin-codex-local <repo>/marketplace`.
6. `codex plugin add claude-companion@cc-plugin-codex-local` → exit 0; `Added plugin claude-companion from marketplace cc-plugin-codex-local. Installed plugin root: <tmp>/plugins/cache/cc-plugin-codex-local/claude-companion/0.2.0`.
7. `codex plugin list` → exit 0; shows `claude-companion@cc-plugin-codex-local | installed, enabled | 0.2.0`.
8. `codex plugin remove claude-companion@cc-plugin-codex-local` → exit 0.
9. `codex plugin marketplace remove cc-plugin-codex-local` → exit 0.
10. Temp `CODEX_HOME` cleaned up via `trap rm -rf` at script exit.

**Stale-entry handling**: the pre-existing `cc-plugin-codex-local-smoke` entry in REAL `~/.codex/config.toml` (lines 73-74, 119-120 from T1 investigation) was NOT touched. The artifact's post-smoke check confirms it remains in place. The README's troubleshooting section gives generic guidance for stale-marketplace-entry errors without naming this specific entry.

### Tests added (13 T6 assertions)

Subagent B created `packages/plugin-codex/test/marketplace-readme.test.mjs` with one `describe('marketplace install procedure docs (Plan 0006 T6)', ...)` block:

| # | Assertion |
|---|---|
| T6-1 | README exists and is non-empty |
| T6-2 | README contains verbatim `codex plugin marketplace add "<repo-root>/marketplace"` |
| T6-3 | README contains verbatim `codex plugin add "claude-companion@cc-plugin-codex-local"` |
| T6-4 | README contains verify command `codex plugin list` |
| T6-5 | README mentions `$claude-setup` |
| T6-6 | README does not contain `rsync -a --delete` (the old Plan 0001 install primary path) |
| T6-7 | README contains no OQ4 forbidden cost-claim tokens |
| T6-8 | README contains no Plan 0004 benchmark/cutover vocabulary |
| T6-9 | RELEASING.md exists and contains both verbatim install commands |
| T6-10 | RELEASING.md contains no OQ4 forbidden cost-claim tokens |
| T6-11 | README contains both uninstall commands |
| T6-12 | README contains marketplace name `cc-plugin-codex-local` |
| T6-13 | RELEASING.md references `tools/package-marketplace.mjs --check` |

Plugin lane: 668 → 681 (+13 T6 tests). All 46 marketplace-* tests pass (33 from T2/T4/T5 + 13 from T6).

### A/B/C findings

- **Subagent A** (executor): wrote the full README install doc + RELEASING.md stub. No OQ4 tokens, no marketing claims, no benchmark vocabulary. Exact install commands match T1.
- **Empirical smoke** (orchestrator-driven): full install/list/remove cycle exit 0 end-to-end in isolated `CODEX_HOME`. Stale entry preserved.
- **Subagent B** (test-engineer): created a new dedicated test file `marketplace-readme.test.mjs` (cleaner split than extending the layout file). 13 tests; all pass.
- **Subagent C** (code-reviewer): APPROVE on all 13 review checks. F-H2 trace clean for 3 sample commands (T1 capture → README → RELEASING.md → empirical artifact). Stale-entry handling correct. No source/runtime/driver/bench drift.

### Deviation from 1-plan.md

None. The brief's recommended approach was matched: isolated `CODEX_HOME` for the smoke (Codex 0.136.0 supports `CODEX_HOME` env var; documented obliquely in `codex --help` under `--profile`'s `$CODEX_HOME/<name>.config.toml` reference). Subagent B picked Option (b) — new dedicated `marketplace-readme.test.mjs` — which is acceptable per the brief.

### Local gate evidence

- `node tools/package-marketplace.mjs --check` — exit 0 (no changes to marketplace tree)
- `npm run lint` — clean
- `npm run typecheck` — clean
- `npx prettier --check .` — pending
- `npm test` — pending (expected mock 68 + runtime 172 + driver 178 + plugin **681** = 1099; +13 from T6)
- `npm run test:attach` — unchanged from Plan 0004 T10 (28/28)
- `npm run test:bench` — unchanged from Plan 0004 T10 (258/258)

### Safety + scope confirmation

- 1 tracked file modified: `marketplace/plugins/claude-companion/README.md`.
- 3 new files: `documentation/RELEASING.md`, `packages/plugin-codex/test/marketplace-readme.test.mjs`, `artifacts/t6-install-procedure-20260603.txt`.
- `packages/plugin-codex/README.md` cost paragraph UNTOUCHED (Plan 0004 T12 + Plan 0006 T12 own this).
- `packages/plugin-codex/scripts/**`, `skills/**`, `.codex-plugin/plugin.json` untouched.
- `packages/runtime/**`, `packages/driver-claude-code/**`, `tools/bench/**`, `.github/**` untouched.
- `marketplace/MANIFEST.md`, `marketplace/EXCLUSIONS.md`, `marketplace/.agents/plugins/marketplace.json` untouched.
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`, `scripts/`, `skills/` untouched (the script's `--check` still passes).
- No hook or stop-gate code. Plan 0005 stays `deferred`.
- `git rev-parse plan-0004-pre-cutover` → `7d9b5f1...`; tag preserved.
- 0 OQ4 forbidden cost-claim tokens; 0 marketing/superlative tokens; 0 Plan 0004 benchmark vocabulary (grep verified across all T6 surface files).
- Real `~/.codex/config.toml` unchanged by T6 (verified via post-smoke grep).
- Pre-existing stale `cc-plugin-codex-local-smoke` entry preserved per the maintainer's standing brief.

### Implications for later tasks

| Task | Implication from T6 |
|---|---|
| T7 (upgrade) | Use the same `codex plugin remove + codex plugin add` shapes the README's "Upgrade" section foreshadows. T1 confirmed no `codex plugin upgrade` exists in 0.136.0. |
| T8 (uninstall) | Already covered by T6 (README has the uninstall section). T8 may extend RELEASING.md's uninstall section. |
| T9 (smoke test) | T9 codifies the smoke procedure T6 ran ad-hoc. The `CODEX_HOME=<tmp>` isolation pattern is the recommended smoke harness. |
| T11 (release checklist) | T6's RELEASING.md stub is the seed. T7-T10 sections plug into it. |
| T12 (docs split) | Once T12 finalizes the marketplace README, the install commands stay verbatim; only surrounding prose changes. |

### CI evidence

- Commit: `172b0d7` ("Plan 0006 T6: document marketplace install procedure")
- CI run: `26915810722`
- Conclusion: **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).
- Plugin lane post-T6: 681/681 (up from 668; +13 install-doc tests).

### Status

**T6 complete.** Plan 0006 status remains `planning` (Stage 1 approved); T1, T2, T3, T4, T5, T6 of Stage 2 done; T7 (upgrade procedure) paused awaiting maintainer go-ahead.

---

## T7 — Upgrade procedure (2026-06-03)

### Deliverables

- `marketplace/plugins/claude-companion/README.md` — replaced the T6 "Upgrade" placeholder with a full Upgrade section: explicit negation of `codex plugin upgrade` / `codex plugin update`, parenthetical clarification that `codex plugin marketplace upgrade` exists only for Git marketplaces (not used for local layouts), same-path upgrade flow (`remove` + `add`), and the marketplace-path-refresh upgrade flow (`remove plugin` + `marketplace remove` + `marketplace add` + `add plugin`), with `codex plugin list` verification anchored on `0.2.0` + `installed, enabled`.
- `documentation/RELEASING.md` — replaced the T6 "Upgrade procedure (pending T7)" stub with a Plan 0006 T7 Upgrade procedure section: same negation + both upgrade flows + a forward pointer to the user-facing README section.
- `packages/plugin-codex/test/marketplace-readme.test.mjs` — +10 T7 assertions covering Upgrade section heading, negation phrase, both upgrade-flow command sets, no-runnable-`codex plugin upgrade`/`update` rules, `0.2.0` verification mention, and an end-to-end RELEASING.md check (heading, negation, both command sets, no-runnable rules).
- `documentation/plan/0006-20260603-marketplace-packaging-distribution/artifacts/t7-upgrade-procedure-20260603.txt` (NEW, 128 lines) — full empirical capture of install → same-path upgrade → path-refresh upgrade → cleanup → negative `--help` probes, with isolated `CODEX_HOME` and real-config baseline + post-state comparison.

### Why remove + add, not upgrade/update

T1 (1-plan.md lines 183, 316, 455) and the in-task probes both confirm: Codex 0.136.0 has no `codex plugin upgrade` and no `codex plugin update` subcommand. The artifact's STEP 5 records both as `error: unrecognized subcommand` (exit code 2). Codex does expose `codex plugin marketplace upgrade`, but its `--help` text ("Refresh configured Git marketplace snapshots") confirms it applies only to Git marketplaces and is not relevant for the local `marketplace/` layout. The README and RELEASING.md both call this out parenthetically so future readers don't conflate the two subcommands.

### Same-path upgrade flow (post-pull, marketplace pointer unchanged)

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin add "claude-companion@cc-plugin-codex-local"
codex plugin list
```

Empirical evidence (artifact STEP 2): both commands exit 0; subsequent `codex plugin list` shows `claude-companion@cc-plugin-codex-local  installed, enabled  0.2.0` (line 59). Reinstall surfaces `Installed plugin root: <CODEX_HOME>/plugins/cache/cc-plugin-codex-local/claude-companion/0.2.0` (line 51).

### Marketplace-path-refresh upgrade flow (after moving/re-cloning the repo)

```bash
codex plugin remove "claude-companion@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
codex plugin list
```

Empirical evidence (artifact STEP 3): all 4 mutator commands exit 0; `codex plugin list` again shows `installed, enabled  0.2.0` (line 88). The path-refresh flow is what end users will run after relocating their cc-plugin-codex checkout (the marketplace pointer is an absolute path baked into `$CODEX_HOME/config.toml`).

### Real Codex smoke result

```text
codex-cli 0.136.0
CODEX_HOME (isolated): /private/var/folders/.../t7-codex-home-XXXX.tmFcGnCrfO
node tools/package-marketplace.mjs --check → OK (exit 0)

STEP 1 install        → all 3 commands exit 0; plugin list shows 0.2.0 installed,enabled
STEP 2 same-path      → remove + add + list, all 3 exit 0; list shows 0.2.0 installed,enabled
STEP 3 path-refresh   → remove + mkt-remove + mkt-add + add + list, all 5 exit 0; list shows 0.2.0 installed,enabled
STEP 4 cleanup        → remove + mkt-remove, both exit 0
STEP 5 negative probes:
  - codex plugin upgrade --help → error: unrecognized subcommand 'upgrade' (exit 2)
  - codex plugin update  --help → error: unrecognized subcommand 'update'  (exit 2)

Post-smoke real $HOME/.codex/config.toml comparison:
  - stale 'cc-plugin-codex-local-smoke' references at lines 73 + 119 BEFORE = AFTER (preserved)
  - non-smoke 'cc-plugin-codex-local' entry count: 0 BEFORE = 0 AFTER (no leak)
```

### Isolated CODEX_HOME handling

The smoke script set `CODEX_HOME=$(mktemp -d -t t7-codex-home-XXXX)` and registered `trap 'rm -rf "$CODEX_HOME"' EXIT` so the temp directory is removed when the subshell exits, regardless of pass/fail. The real `~/.codex/config.toml` is read for the pre/post comparison (read-only) but never written. This mirrors the T6 pattern and preserves the documented constraint: do not edit `~/.codex` or `~/.claude` without explicit maintainer authorization, and never delete the stale `cc-plugin-codex-local-smoke` entry.

### Tests added (10 T7 cases)

All under `describe('marketplace upgrade procedure docs (Plan 0006 T7)', ...)`:

1. README contains an `## Upgrade` section.
2. README states Codex 0.136.0 does not expose in-place upgrade/update (regex `/does not expose .*codex plugin upgrade/i`).
3. README contains the plugin remove command.
4. README contains the plugin add command.
5. README contains the marketplace remove command (path-refresh flow).
6. README contains the marketplace add command (path-refresh flow).
7. README does **not** present `codex plugin upgrade` as a runnable command (regex `/^\s*codex plugin upgrade\b/m` is line-anchored to permit the inline-backtick negation without false-positives).
8. README does **not** present `codex plugin update` as a runnable command (same rule).
9. README mentions version `0.2.0` in upgrade verification.
10. RELEASING.md contains heading + negation + both command sets + no-runnable rules.

These pair with the T6 11-test "no OQ4 forbidden tokens" + "no Plan 0004 vocabulary" checks already in the file, so the surface remains clean across both layers.

### A/B/C cadence (deviation)

Per the maintainer's "Use A/B/C, but keep it tight" instruction and memory `feedback_orchestrator_b_role` (orchestrator can absorb B for verbatim-template tasks), the orchestrator performed A (docs) and B (tests) directly and ran C (review) read-only without spawning subagents. The work was a verbatim-template documentation edit plus a 10-test extension of an existing test file with established patterns — the cost of subagent spawn would have exceeded the benefit. C review (below) is the equivalent of the subagent C pass.

### Subagent C — read-only review (orchestrator-led)

- **Allowed-files check:** `git diff --name-only HEAD` reports exactly 3 modified files (`documentation/RELEASING.md`, `marketplace/plugins/claude-companion/README.md`, `packages/plugin-codex/test/marketplace-readme.test.mjs`) + 1 new artifact under `documentation/plan/0006-*/artifacts/`. All within the brief's allowed set.
- **Forbidden-files check:** `git diff --stat HEAD` against `tools/bench/`, `packages/plugin-codex/scripts/`, `skills/`, `.codex-plugin/plugin.json`, `packages/plugin-codex/README.md`, marketplace packaged `scripts/`, `skills/`, `.codex-plugin/plugin.json`, `packages/runtime/`, `packages/driver-claude-code/`, `.github/`, `documentation/plan/0004-*`, `documentation/plan/0005-*` reports no entries — all guarded paths intact.
- **Cost paragraph guard:** last commit touching `packages/plugin-codex/README.md` is `86cb729` (Plan 0004 T11 era) — T7 did not touch it.
- **Tag guard:** `git rev-parse plan-0004-pre-cutover` = `7d9b5f1...` (unchanged).
- **Real-config guard:** smoke artifact's POST-SMOKE comparison shows stale-smoke entries preserved and zero T7 leakage.
- **F-H2 trace (T1 source → README → RELEASING → artifact):**
  - T1 source: 1-plan.md L183 ("Codex does not have an in-place `codex plugin upgrade` command as of 0.136.0"), L316, L455.
  - README: L108 ("Codex 0.136.0 does not expose an in-place `codex plugin upgrade` or `codex plugin update` command").
  - RELEASING.md: L30 (same negation).
  - Artifact: L106 (`error: unrecognized subcommand 'upgrade'`), L114 (`error: unrecognized subcommand 'update'`).
- **Plan 0005 still deferred:** no hooks, no stop-gate code, no Plan 0005 file changes.
- **OQ4 / cost-claim guard:** T6 tests (forbidden tokens + benchmark vocabulary) still pass on the post-T7 surface; no new tokens introduced.

### Local gates

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | OK — 18 derived + 1 marketplace-owned + no unexpected (exit 0). |
| `npm run lint` | exit 0 (clean). |
| `npm run typecheck` | exit 0 (`tsc --build` clean). |
| `npm run format` | exit 0 (`prettier --check` clean across all matched files). |
| `npm test` | **1109/1109** (mock 68 + runtime 172 + driver 178 + plugin **691**) — plugin lane 681 → 691 (+10 T7). |
| `npm run test:attach` | 28/28 (unchanged). |
| `npm run test:bench` | 258/258 (unchanged). |
| Combined | **1395 tests** passing (T6 baseline 1385 + 10 T7). |

### Gate evidence

- `packages/plugin-codex/README.md` cost paragraph untouched (Plan 0004 T12 + Plan 0006 T12 own).
- `packages/plugin-codex/scripts/**`, `skills/**`, `.codex-plugin/plugin.json` untouched.
- `packages/runtime/**`, `packages/driver-claude-code/**`, `tools/bench/**`, `.github/**` untouched.
- `marketplace/MANIFEST.md`, `marketplace/EXCLUSIONS.md`, `marketplace/.agents/plugins/marketplace.json` untouched.
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`, `scripts/`, `skills/` untouched.
- No hook or stop-gate code. Plan 0005 stays `deferred`.
- `git rev-parse plan-0004-pre-cutover` → `7d9b5f1...`; tag preserved.
- Real `~/.codex/config.toml` unchanged by T7 (verified via pre/post grep comparison embedded in the artifact).
- Pre-existing stale `cc-plugin-codex-local-smoke` entry preserved.

### Implications for later tasks

| Task | Implication from T7 |
|---|---|
| T8 (uninstall) | T6 + T7 already cover the uninstall commands. T8 can focus on RELEASING.md uninstall-verification language + an isolated `CODEX_HOME` artifact mirroring T7's pattern. |
| T9 (smoke test) | T9 can codify the `CODEX_HOME=$(mktemp -d)` + `trap rm` + pre/post real-config grep pattern proven by T6 and T7 into a reusable smoke script under `tools/`. |
| T10 (version bump) | T7 anchored verification on `0.2.0`; T10's version-bump procedure will need to update both the source `plugin.json` and the marketplace verification strings (test fixture + README + RELEASING). |
| T11 (release checklist) | RELEASING.md now has full Install (T6) + Upgrade (T7) sections. T8-T10 plug remaining steps in. |
| T12 (docs split) | T12 finalizes the marketplace README structure. The Upgrade section's wording is stable and should survive verbatim. |

### CI evidence (pending)

- Commit: pending — `Plan 0006 T7: document marketplace upgrade procedure`
- CI run: pending
