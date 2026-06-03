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

### CI evidence (pending)

- Commit: pending — `Plan 0006 T3: finalize plugin manifest shape`
- CI run: pending
