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
