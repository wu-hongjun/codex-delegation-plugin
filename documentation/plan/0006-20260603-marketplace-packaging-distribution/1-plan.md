# Stage 1 — Plan: Marketplace packaging and distribution polish

> **Status**: draft
> **Author**: Claude (assistant)
> **Date drafted**: 2026-06-03
> **Date approved**: pending

---

## 1. Context & references

This plan delivers the "committed marketplace packaging" capability that Plans 0001 through 0003 explicitly deferred. Plan 0001's Stage 5 report lists "No committed marketplace packaging" as a known limitation and identifies Plan 0006 as its home. Plan 0002's Stage 5 repeats that deferral verbatim. Plan 0003's Stage 5 lists "Plan 0006 — Marketplace packaging" in its follow-up section. Plan 0004's scope explicitly excludes marketplace packaging.

**Key prior decisions binding this plan:**

- Plan 0001 (complete at `5be9b9d`): shipped five v1 skills, the local marketplace `rsync` install flow documented in the plugin README, and the `No committed marketplace packaging` known limitation. The temporary marketplace root (`.agents/plugins/marketplace.json` + `plugins/claude-companion/`) was discovered during T11 when Codex 0.135.0 rejected a direct `codex plugin marketplace add` at the plugin directory.
- Plan 0002 (complete at `cbbac8c`): added `$claude-followup` skill (6 total). No marketplace changes.
- Plan 0003 (complete at `4475061`): added `$claude-review` and `$claude-adversarial-review` skills (8 total). No marketplace changes.
- Plan 0004 (implementing at `7d9b5f1`): benchmark harness under `tools/bench/`. Frozen at tag `plan-0004-pre-cutover`. Plan 0006 must not touch `tools/bench/**` or the README cost paragraph (Plan 0004 T12 owns that).
- Plan 0005 (deferred): stop-time review gate. Blocked on Plan 0004 T11/T12. Plan 0006 does not subsume Plan 0005.
- Plan 0001 OQ4 cost-claim discipline remains in force. Forbidden tokens: `saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the`, `more efficient than`. Forbidden regexes: `/\d+%\s*(faster|cheaper|less)/i`, `/\d+x\s*(faster|cheaper)/i`, `/save[sd]?\s+\d+/i`.

**Current plugin state:**

- Plugin manifest at `packages/plugin-codex/.codex-plugin/plugin.json`: name `claude-companion`, version `0.1.0`, 8 skills via `"skills": "./skills/"`, brand color `#D97706`.
- Package metadata at `packages/plugin-codex/package.json`: workspace-internal version `0.0.0`, private, depends on `@cc-plugin-codex/runtime` and `@cc-plugin-codex/driver-claude-code`.
- Eight skills confirmed in `packages/plugin-codex/skills/`: `claude-setup`, `claude-delegate`, `claude-status`, `claude-result`, `claude-stop`, `claude-followup`, `claude-review`, `claude-adversarial-review`.
- Current install flow: ad-hoc `rsync` from `packages/plugin-codex/` into a temp marketplace root, then `codex plugin marketplace add` + `codex plugin add`. Documented in `packages/plugin-codex/README.md` § "Install locally".

**References:**

- [`documentation/plan/0001-20260530-initial-plan/5-report.md`](../0001-20260530-initial-plan/5-report.md) — Plan 0001 final state, "No committed marketplace packaging" known limitation, OQ4 discipline.
- [`documentation/plan/0002-20260531-follow-up-injection/5-report.md`](../0002-20260531-follow-up-injection/5-report.md) — Plan 0002 final state, marketplace packaging deferred.
- [`documentation/plan/0003-20260601-review-skills/5-report.md`](../0003-20260601-review-skills/5-report.md) — Plan 0003 final state, 8 skills shipped, marketplace packaging deferred.
- [`documentation/plan/0004-20260603-benchmark-harness/1-plan.md`](../0004-20260603-benchmark-harness/1-plan.md) — Plan 0004 boundary; harness under `tools/bench/`; cost paragraph decision in T12.
- [`documentation/plan/0005-20260603-stop-time-review-gate/readme.md`](../0005-20260603-stop-time-review-gate/readme.md) — Plan 0005 deferred.
- [`packages/plugin-codex/.codex-plugin/plugin.json`](../../../packages/plugin-codex/.codex-plugin/plugin.json) — current plugin manifest.
- [`packages/plugin-codex/README.md`](../../../packages/plugin-codex/README.md) — current plugin README with `rsync` install flow.
- [`packages/plugin-codex/package.json`](../../../packages/plugin-codex/package.json) — current package metadata.

---

## 2. Scope

### In scope

Distribution mechanics — file paths, marketplace JSON shape, packaged-file manifest, exclusion list, installer/upgrade/uninstall flow, version-bump procedure, smoke checklist, release checklist, and docs split — so cc-plugin-codex can ship as a real Codex plugin without ad-hoc `rsync` setup.

1. Committed marketplace root layout at a defined path within this repository.
2. Packaged-file manifest: exactly which files ship as part of the plugin.
3. Exclusion list: which files are intentionally NOT in the shipped plugin.
4. Install, upgrade, and uninstall procedures for end users.
5. Smoke test procedure that verifies Codex discovers all 8 skills.
6. Versioning scheme for the shipped plugin (replacing the workspace-internal `0.0.0`).
7. Release checklist document.
8. Docs split: end-user README vs marketplace README vs root README.

### Out of scope (hard limits)

- `tools/bench/**` — Plan 0004 frozen at tag `plan-0004-pre-cutover`.
- `documentation/plan/0004-*/artifacts/**` — pre-cutover artifact frozen.
- `packages/plugin-codex/README.md` `## Cost and prompt-cache wording` paragraph — Plan 0004 T12 owns this.
- Stop-time review gate / hooks — Plan 0005, deferred.
- Marketplace submission to an external registry — no public Codex plugin registry contract is documented today. If no registry contract exists at implementation time, external submission is out of scope (see OQ-I).
- Windows support — still post-v1 per Plan 0001.
- New runtime behavior — Plan 0006 is distribution mechanics and documentation. No changes to the plugin's execution model.
- README cost-claim updates — Plan 0004 T12.
- Benchmark-result interpretation — Plan 0004.
- New production dependencies — no runtime deps added. Build/tooling deps flagged as OQ items if proposed.
- `node-pty` changes — driver-level packaging unchanged.
- Changes to CI matrix or test infrastructure beyond marketplace-smoke additions.

### Follow-ups identified

- If a public Codex plugin registry is announced, a follow-up plan handles submission and registry-specific metadata.
- If the versioning scheme requires tooling (automated bump scripts), the implementation is a follow-up unless it fits naturally within T10.
- If the docs split reveals README sections that need rewriting beyond the marketplace scope, those belong in a separate docs plan.

---

## 3. Approach

### 3.1 Marketplace root layout

**Decision**: commit a `marketplace/` directory at the repository root that mirrors the Codex-expected install layout. The directory is a self-contained local marketplace root that a user can pass directly to `codex plugin marketplace add`.

**Rationale**: Plan 0001 T11 discovered that Codex 0.135.0 requires a marketplace root containing `.agents/plugins/marketplace.json` + `plugins/<plugin-name>/`. The current `rsync` flow reconstructs this layout ad-hoc in `/tmp/`. Committing the layout in-repo eliminates the manual `rsync` step and makes the install procedure a single `codex plugin marketplace add <path>` command. The layout is a build artifact — a script or documented procedure copies the relevant files from `packages/plugin-codex/` into `marketplace/plugins/claude-companion/` at release time (see T2, T4).

Layout:

```
marketplace/
  .agents/
    plugins/
      marketplace.json          # marketplace manifest
  plugins/
    claude-companion/
      .codex-plugin/
        plugin.json             # plugin manifest (version, skills, brandColor)
      skills/
        claude-setup/SKILL.md
        claude-delegate/SKILL.md
        claude-status/SKILL.md
        claude-result/SKILL.md
        claude-stop/SKILL.md
        claude-followup/SKILL.md
        claude-review/SKILL.md
        claude-adversarial-review/SKILL.md
      scripts/
        claude-companion.mjs    # dispatcher entry point
        lib/                    # dispatcher helper modules
      README.md                 # end-user-facing README (see T12 docs split)
```

The `marketplace.json` shape follows the Plan 0001 T11 discovery:

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

### 3.2 Packaged-file manifest

**Decision**: define an explicit inclusion list. Only files necessary for plugin operation are included in `marketplace/plugins/claude-companion/`. Everything else is excluded.

**Included files** (the packaged-file manifest):

- `.codex-plugin/plugin.json` — plugin manifest.
- `skills/*/SKILL.md` — all 8 skill definitions.
- `scripts/claude-companion.mjs` — dispatcher entry point.
- `scripts/lib/*.mjs` — dispatcher helper modules (args, format, adapter, ack, prompt-meta, review-prompts, review-parser, review-result-source).
- `README.md` — end-user documentation.

**Decision on compiled output**: the dispatcher and its `lib/` modules are plain `.mjs` ESM files that run directly via `node`. They do not require a build step. The TypeScript packages (`@cc-plugin-codex/runtime`, `@cc-plugin-codex/driver-claude-code`) are workspace dependencies resolved at install time by the monorepo's `node_modules/` structure. The marketplace plugin copies the pre-built `dist/` output from each workspace package so the plugin is self-contained. The exact mechanism (bundling vs copying `dist/` + `node_modules/`) is resolved in OQ-A.

### 3.3 Exclusion list

**Decision**: document an explicit exclusion list — files that MUST NOT appear in the shipped marketplace plugin. This list is enforced by T5 and verified in T9 smoke.

**Excluded**:

- `tools/` — mock-claude, mock-codex, bench harness. Internal development tooling.
- `documentation/` — plan files, research reports. Internal process artifacts.
- `references/` — reference materials. Not shipped.
- `.github/` — CI workflows. Internal infrastructure.
- `packages/runtime/src/` — TypeScript source. Only compiled `dist/` ships.
- `packages/runtime/test/` — tests. Not shipped.
- `packages/driver-claude-code/src/` — TypeScript source.
- `packages/driver-claude-code/test/` — tests.
- `packages/plugin-codex/test/` — plugin tests.
- `packages/plugin-codex/tsconfig*.json` — build config.
- `packages/plugin-codex/package.json` — workspace-internal; the plugin manifest (`.codex-plugin/plugin.json`) is the shipped metadata.
- `*.test.mjs`, `*.test.ts` — test files at any depth.
- `node_modules/` — resolved at install time.
- `CLAUDE.md`, `AGENTS.md`, `.omc/` — orchestration metadata.
- `tsconfig*.json` at root — monorepo build config.
- `eslint.config.mjs`, `.prettierrc` — lint/format config.
- `package.json`, `package-lock.json` at root — monorepo metadata.
- `.git/` — VCS metadata.
- Any file matching `.env*`, `credentials*`, `*.pem`, `*.key` — secrets.

### 3.4 Install / upgrade / uninstall procedures

**Decision**: document the three lifecycle operations as `codex plugin` CLI commands against the committed `marketplace/` directory. No custom wrapper scripts.

**Install**:

```bash
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

**Upgrade** (per OQ-D research): Codex does not have an in-place `codex plugin upgrade` command as of 0.136.0. The upgrade procedure is remove + re-add:

```bash
codex plugin remove "claude-companion"
codex plugin marketplace remove "cc-plugin-codex-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

If T1 research discovers a `codex plugin upgrade` command, the procedure is simplified.

**Uninstall**:

```bash
codex plugin remove "claude-companion"
codex plugin marketplace remove "cc-plugin-codex-local"
```

### 3.5 Versioning scheme

**Decision**: `0.x.y` semver with manual bumps (per OQ-B resolution). The version in `.codex-plugin/plugin.json` is the source of truth for the shipped plugin. The workspace-internal `package.json` version (`0.0.0`) is decoupled from the shipped version.

The current `plugin.json` version is `0.1.0`. Plan 0006 ships `0.2.0` (reflecting the marketplace-packaging milestone). Future plans bump according to semver: patch for bug fixes, minor for new skills or behavior, major reserved for breaking changes to the install contract.

### 3.6 Release checklist

**Decision**: the release checklist lives at `documentation/RELEASING.md` (per OQ-G resolution). It is a step-by-step procedure run by the maintainer before tagging a release.

### 3.7 Smoke test procedure

**Decision**: a runnable smoke checklist verified against real Codex. The smoke procedure is both a document (for human execution) and optionally a script (for semi-automation). At minimum, a documented checklist that the maintainer runs manually. The script, if implemented, lives at `tools/smoke-marketplace.mjs` and is NOT a CI gate (it requires real Codex).

### 3.8 Docs split

**Decision**: three README surfaces with distinct audiences:

1. **`packages/plugin-codex/README.md`** — remains the comprehensive end-user and developer reference. Cost paragraph unchanged (Plan 0004 T12 owns it).
2. **`marketplace/plugins/claude-companion/README.md`** — a streamlined end-user README focused on install, skills overview, and troubleshooting. Derived from (not duplicating) the plugin README. Contains no development, testing, or internal architecture sections.
3. **Root `README.md`** — workspace overview for contributors. Updated to reference the `marketplace/` directory and the release checklist.

### 3.9 Cost-claim discipline (continuing Plan 0001 OQ4)

Plan 0001's OQ4 forbidden-token discipline continues to apply verbatim. Plan 0006 introduces no new approved framing. All new documentation (marketplace README, release checklist, smoke procedure) must not contain forbidden tokens. The existing `readme.test.mjs` scan continues to enforce this on the plugin README. A new test extends the scan to the marketplace README.

---

## 4. Tasks (with acceptance criteria)

In order. Each task has acceptance criteria. A task is not complete until its acceptance criterion is demonstrable in commit review.

### T1. Research: Codex plugin install/upgrade/uninstall semantics

**Goal**: enumerate the exact Codex CLI commands for plugin lifecycle management. Determine whether `codex plugin upgrade` exists. Confirm the marketplace root contract. Record which Codex versions Plans 0001-0004 tested against.

**Deliverable**: research note in `2-implement.md` T1 section (or standalone under `documentation/research/` if findings warrant a separate artifact).

**Acceptance criteria**:
- [ ] Output of `codex plugin --help` captured and documented (from Codex 0.136.0 or latest available).
- [ ] Enumeration of available subcommands: `marketplace add`, `marketplace remove`, `marketplace list`, `plugin add`, `plugin remove`, `plugin list`, and any `upgrade` or `update` variant.
- [ ] Explicit answer to OQ-D: does Codex support in-place upgrade? If yes, document the command. If no, document the remove + re-add procedure.
- [ ] Codex version compatibility table: Plans 0001 (0.135.0), 0002 (0.135.0), 0003 (0.136.0), 0004 (0.136.0) — confirmed from live E2E artifacts.
- [ ] Marketplace root contract: confirm the `.agents/plugins/marketplace.json` + `plugins/<name>/` layout is still the required shape in the latest Codex version.

### T2. Commit marketplace root layout

**Goal**: create the `marketplace/` directory at the repo root with the Codex-expected structure.

**Deliverable**: `marketplace/` directory containing `.agents/plugins/marketplace.json` and `marketplace/plugins/claude-companion/` with the plugin files.

**Acceptance criteria**:
- [ ] `marketplace/.agents/plugins/marketplace.json` exists and is valid JSON matching the shape in section 3.1.
- [ ] `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` exists and matches the source manifest at `packages/plugin-codex/.codex-plugin/plugin.json` (except version may differ per T10).
- [ ] `marketplace/plugins/claude-companion/skills/` contains all 8 skill directories, each with a `SKILL.md`.
- [ ] `marketplace/plugins/claude-companion/scripts/claude-companion.mjs` exists and is executable.
- [ ] `marketplace/plugins/claude-companion/scripts/lib/` contains all dispatcher helper modules.
- [ ] `marketplace/plugins/claude-companion/README.md` exists (placeholder acceptable at this task; T12 fills it).
- [ ] Running `codex plugin marketplace add "<repo-root>/marketplace"` exits 0 on Codex 0.136.0 (or latest).

### T3. Define plugin manifest final shape

**Goal**: define and commit the final shape of `.codex-plugin/plugin.json` for the shipped marketplace plugin.

**Deliverable**: updated `packages/plugin-codex/.codex-plugin/plugin.json` and its marketplace copy.

**Acceptance criteria**:
- [ ] `plugin.json` contains: `name` (`claude-companion`), `version` (bumped per T10), `description`, `author` with `name` and `url`, `skills` pointing to `./skills/`, `interface` with `displayName`, `category`, `capabilities`, `defaultPrompt` (all 8 skill prompts present), `brandColor`.
- [ ] The marketplace copy at `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` is byte-identical to the source.
- [ ] Running `JSON.parse()` on the file succeeds; no trailing commas, no comments.
- [ ] Existing `skills-manifest.test.mjs` continues to pass.

### T4. Define packaged-file manifest

**Goal**: define and document exactly which files are included in the shipped plugin.

**Deliverable**: a manifest document (in `documentation/RELEASING.md` or a dedicated `marketplace/MANIFEST.md`) listing every included file, plus a packaging script or documented procedure that produces the marketplace layout from source.

**Acceptance criteria**:
- [ ] A file exists at a documented path listing every file included in `marketplace/plugins/claude-companion/`.
- [ ] The list matches the actual contents of `marketplace/plugins/claude-companion/` (verified by a comparison command: `find marketplace/plugins/claude-companion/ -type f | sort` matches the manifest).
- [ ] The packaging procedure (script or documented steps) is runnable and reproducible: running it twice from the same source produces identical output.

### T5. Define exclusion list

**Goal**: document and enforce which files are intentionally NOT in the shipped plugin.

**Deliverable**: exclusion list committed in `documentation/RELEASING.md` or `marketplace/EXCLUSIONS.md`.

**Acceptance criteria**:
- [ ] The exclusion list document exists and enumerates at minimum the categories from section 3.3.
- [ ] `marketplace/plugins/claude-companion/` contains NO files matching any exclusion pattern: no `*.test.mjs`, no `*.test.ts`, no `tsconfig*`, no `.github/`, no `tools/`, no `documentation/`, no `references/`, no `.env*`, no `*.pem`, no `*.key`.
- [ ] Running `find marketplace/plugins/claude-companion/ -name '*.test.*'` returns empty.
- [ ] Running `find marketplace/plugins/claude-companion/ -name 'tsconfig*'` returns empty.

### T6. Install procedure for users

**Goal**: document a working install procedure that produces a discovered plugin in Codex.

**Deliverable**: install section in `marketplace/plugins/claude-companion/README.md` and in `documentation/RELEASING.md`.

**Acceptance criteria**:
- [ ] Following the documented install steps from a clean state (no prior plugin installed) results in `codex plugin list` showing `claude-companion`.
- [ ] After install, launching `codex` and invoking `$claude-setup` produces output (not "unknown skill").
- [ ] The procedure works on macOS (verified manually against real Codex 0.136.0 or latest).
- [ ] The procedure does NOT require `rsync` or any manual filesystem manipulation beyond `codex plugin` CLI commands and an optional `git clone`.

### T7. Upgrade procedure

**Goal**: document a working upgrade procedure. Verify against real Codex.

**Deliverable**: upgrade section in `marketplace/plugins/claude-companion/README.md` and in `documentation/RELEASING.md`.

**Acceptance criteria**:
- [ ] Following the documented upgrade steps from an installed state (v0.1.0 or v0.2.0) results in Codex loading the new version.
- [ ] The procedure accounts for OQ-D findings (remove + re-add if no native upgrade exists; native upgrade if it does).
- [ ] After upgrade, `$claude-setup` runs successfully and all 8 skills are discoverable.
- [ ] Verified against real Codex 0.136.0 (or latest) on macOS.

### T8. Uninstall procedure

**Goal**: document a clean uninstall procedure.

**Deliverable**: uninstall section in `marketplace/plugins/claude-companion/README.md` and in `documentation/RELEASING.md`.

**Acceptance criteria**:
- [ ] Following the documented uninstall steps removes `claude-companion` from `codex plugin list`.
- [ ] After uninstall, invoking `$claude-setup` in Codex produces an "unknown skill" or equivalent response (the skill is no longer registered).
- [ ] The procedure removes both the plugin registration and the marketplace registration.
- [ ] No orphaned files remain in Codex's plugin storage after uninstall (or if Codex retains internal state, document what persists).

### T9. Smoke test procedure

**Goal**: define a verifiable smoke test that confirms Codex discovers all 8 skills from the marketplace layout.

**Deliverable**: smoke checklist document at `documentation/RELEASING.md` § "Smoke test" (and optionally a script at `tools/smoke-marketplace.mjs`).

**Acceptance criteria**:
- [ ] The smoke checklist enumerates all 8 skills by name: `claude-setup`, `claude-delegate`, `claude-status`, `claude-result`, `claude-stop`, `claude-followup`, `claude-review`, `claude-adversarial-review`.
- [ ] Each skill has a verification step: at minimum `$<skill-name>` invoked in Codex produces a non-error response (not "unknown skill").
- [ ] `$claude-setup` is the gate: if setup reports `ok` or `warn` aggregate, the smoke passes.
- [ ] The smoke checklist includes a `codex plugin list` step verifying `claude-companion` appears.
- [ ] The smoke is run successfully against real Codex 0.136.0 (or latest) as part of T9 acceptance; result documented in `2-implement.md`.

### T10. Versioning scheme implementation

**Goal**: apply the chosen versioning scheme and document the bump procedure.

**Deliverable**: bumped version in `plugin.json`; documented bump procedure in `documentation/RELEASING.md`.

**Acceptance criteria**:
- [ ] `packages/plugin-codex/.codex-plugin/plugin.json` `version` field is `0.2.0` (reflecting the marketplace-packaging milestone).
- [ ] `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` `version` field matches.
- [ ] `documentation/RELEASING.md` contains a "Version bump" section describing: when to bump (minor for new skills or behavior changes, patch for bug fixes), where to bump (both `plugin.json` files), and the semver scheme.
- [ ] The workspace-internal `package.json` `version` (`0.0.0`) is documented as decoupled from the shipped plugin version.

### T11. Release checklist document

**Goal**: commit a release checklist that the maintainer follows before tagging a release.

**Deliverable**: `documentation/RELEASING.md` with the complete release procedure.

**Acceptance criteria**:
- [ ] `documentation/RELEASING.md` exists and contains at minimum these sections: Prerequisites, Version Bump, Packaging (copy files to marketplace), Smoke Test, CI Verification, Tagging, Post-release.
- [ ] The checklist references the smoke procedure from T9.
- [ ] The checklist requires CI to be green before tagging.
- [ ] The checklist requires the smoke test to pass before tagging.
- [ ] The checklist specifies the tag format (e.g., `v0.2.0` or `release-0.2.0`).
- [ ] The document contains no OQ4 forbidden tokens.

### T12. Docs split

**Goal**: create the three-README structure described in section 3.8.

**Deliverable**: marketplace README, updated plugin README install section, updated root README.

**Acceptance criteria**:
- [ ] `marketplace/plugins/claude-companion/README.md` contains: plugin overview, install/upgrade/uninstall procedures, skills list with one-line descriptions, requirements, troubleshooting (subset of the full README).
- [ ] `marketplace/plugins/claude-companion/README.md` does NOT contain: development setup, test suite documentation, architecture internals, plan references, CI details.
- [ ] `packages/plugin-codex/README.md` `## Install locally` section is updated to reference the committed `marketplace/` directory instead of the ad-hoc `rsync` flow. The old `rsync` block is removed or moved to a "Legacy install" subsection.
- [ ] Root `README.md` references the `marketplace/` directory and `documentation/RELEASING.md`.
- [ ] `packages/plugin-codex/README.md` cost paragraph is byte-identical to its current content (Plan 0004 T12 ownership preserved).
- [ ] A new test in `packages/plugin-codex/test/readme.test.mjs` (or a new test file) verifies the marketplace README contains no OQ4 forbidden tokens.
- [ ] Existing `readme.test.mjs` continues to pass.

---

## 5. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Codex plugin contract drift between versions breaks the committed marketplace layout | M | H | Pin tested Codex version in release checklist; smoke against real Codex on every release (T9, T11); record Codex version in smoke results. |
| R2 | New build dep introduced by packaging accidentally pulls in npm subdeps that flow to the runtime | L | H | Keep packaging deps as devDependencies only; CI lane verifies `packages/runtime/package.json` and `packages/driver-claude-code/package.json` `dependencies` blocks do not grow unexpectedly; existing architectural-invariant tests enforce this. |
| R3 | README cost paragraph accidentally edited (Plan 0004 T12 ownership violated) | L | H | Existing `readme.test.mjs` byte-identical check stays in place and CI enforces; Plan 0006 tasks explicitly exclude the cost paragraph from all edits. |
| R4 | Marketplace layout diverges from what Plans 0001-0003 documented inline (the rsync flow) | M | M | T12 explicitly retires the `rsync` flow in the plugin README and replaces it with the committed marketplace flow; Plans 0001-0003 reports remain as historical artifacts and are not edited. |
| R5 | Smoke test surfaces an undiscovered skill or a manifest typo | M | M | T9 smoke checklist is the gate; T11 release checklist requires the smoke to pass before tagging; T3 verifies manifest shape. |
| R6 | Adding `marketplace/` at the repo root accidentally ships internal files via `codex plugin add` | M | H | T5 exclusion list enforced; T9 smoke verifies the unpacked plugin contains only the manifest-listed files; `find` command acceptance criteria on T5 catch test files, config files, and secrets. |
| R7 | Versioning scheme collides with the plan-NNNN tag scheme | L | L | The `0.x.y` semver scheme is orthogonal to `plan-0004-pre-cutover`-style tags; T10 documents both schemes and their independence; release tags use `v0.x.y` prefix. |

---

## 6. Open questions

### OQ-A — Marketplace root layout: committed in-repo or external? -- resolved

**Statement**: should the marketplace layout be committed inside this repository, kept as an ad-hoc `rsync` flow, or shipped via a separate distribution repository?

**Options**:
1. Commit a `marketplace/` directory inside this repo that mirrors the install layout. A packaging step (script or documented procedure) copies files from `packages/plugin-codex/` into `marketplace/plugins/claude-companion/` at release time.
2. Keep the Plan 0001 ad-hoc `rsync` flow and document it more thoroughly.
3. Ship via a separate distribution repository (e.g., `cc-plugin-codex-marketplace`).

**Planner recommendation**: Option 1. The ad-hoc `rsync` flow (Option 2) is error-prone and requires users to reconstruct the marketplace layout manually. A separate repo (Option 3) adds maintenance overhead for a single-plugin project with no second consumer. Committing in-repo (Option 1) makes the install a single `codex plugin marketplace add <path>` and keeps the marketplace layout version-controlled alongside the source.

**Gate**: resolution required before T2 (the layout task depends on where the marketplace root lives).

**Resolution (2026-06-03)**: Option 1 accepted. Commit a `marketplace/` directory at the repo root that mirrors the install layout. T4's packaging step is responsible for syncing `packages/plugin-codex/` → `marketplace/plugins/claude-companion/`. Single install command: `codex plugin marketplace add <repo>/marketplace`.

### OQ-B — Versioning scheme -- resolved

**Statement**: the current `packages/plugin-codex/package.json` has version `0.0.0` (workspace-internal). The `plugin.json` has version `0.1.0`. What versioning scheme for the shipped plugin?

**Options**:
1. `0.x.y` semver with manual bumps in `plugin.json`. The `package.json` `0.0.0` is decoupled.
2. `0.YYYY.MM.DD` calendar versions (e.g., `0.2026.0603`).
3. Tag-derived: version string derived from the latest `plan-NNNN-...` tag.

**Planner recommendation**: Option 1. Semver is the industry standard for plugin versioning and communicates compatibility intent clearly. Calendar versions (Option 2) lose semantic meaning about breaking vs non-breaking changes. Tag-derived versions (Option 3) couple distribution versioning to the internal plan lifecycle, which confuses users who do not know what "plan-0004" means. The `plugin.json` version is the source of truth; the workspace-internal `package.json` version is irrelevant to end users.

**Gate**: resolution required before T3 (manifest shape) and T10 (version bump).

**Resolution (2026-06-03)**: Option 1 accepted. Semver `0.x.y` with manual bumps in `packages/plugin-codex/.codex-plugin/plugin.json` as the source of truth. Workspace-internal `package.json` `0.0.0` is decoupled and stays as-is. Plan-NNNN tags remain independent of the semver line.

### OQ-C — Plugin manifest source-of-truth -- resolved

**Statement**: today the plugin manifest lives at `packages/plugin-codex/.codex-plugin/plugin.json`. With a committed marketplace layout, does it stay as the single source, or get duplicated in `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`?

**Options**:
1. Single source at `packages/plugin-codex/.codex-plugin/plugin.json`. The marketplace copy is produced by the packaging step (T4) at release time. The packaging step is responsible for keeping them in sync.
2. Dual source: both files exist in version control. A CI check or test verifies they are identical.
3. The marketplace copy is the sole source; `packages/plugin-codex/.codex-plugin/plugin.json` becomes a symlink or is removed.

**Planner recommendation**: Option 1. The `packages/plugin-codex/` directory is the development source tree. The `marketplace/` directory is the distribution artifact. Having one source and one derived copy avoids sync drift. The packaging step (documented in T4, enforced in T11 release checklist) is the sync mechanism. If the team prefers a CI-enforced dual-source (Option 2), that is also acceptable — the key invariant is that divergence is detectable before release.

**Gate**: resolution required before T2 and T3 (both tasks create or update manifest files).

**Resolution (2026-06-03)**: Planner default accepted. Single source at `packages/plugin-codex/.codex-plugin/plugin.json`. The `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` is a derived copy produced by the T4 packaging step. T11 release checklist enforces the sync.

### OQ-D — Upgrade contract -- resolved

**Statement**: is upgrade a simple "delete old plugin, add new plugin" via `codex plugin remove` + `codex plugin add`, or does Codex have an in-place upgrade flow?

**Options**:
1. Codex supports `codex plugin upgrade <name>` or equivalent. Document that command.
2. Codex does NOT support in-place upgrade. Document the remove + re-add procedure.
3. Unknown. T1 research determines the answer.

**Planner recommendation**: Option 3. T1 research captures `codex plugin --help` output and determines the answer empirically. The plan assumes Option 2 (remove + re-add) as the fallback; if T1 discovers an upgrade command, T7 simplifies the procedure.

**Gate**: resolution required before T7 (upgrade procedure documentation).

**Resolution (2026-06-03)**: Planner default accepted. T1 research empirically determines whether `codex plugin upgrade` exists on Codex 0.135.0 / 0.136.0. Fallback is the `codex plugin remove` + `codex plugin add` procedure documented in T7.

### OQ-E — Codex version compatibility floor and ceiling -- resolved

**Statement**: Plans 0001-0004 tested against Codex 0.135.0 and 0.136.0. What is the minimum supported Codex version? Do we pin a maximum?

**Options**:
1. Minimum floor: Codex 0.135.0 (the earliest version tested in Plan 0001 E2E). No maximum ceiling — feature-probe model handles forward compatibility.
2. Minimum floor: Codex 0.136.0 (the latest tested version). More conservative.
3. No version pin. Feature-probe model only (same stance as Plan 0002 for Claude Code versions).

**Planner recommendation**: Option 3, with Codex 0.135.0 documented as the earliest known-good version and 0.136.0 as the latest tested. The plugin's `$claude-setup` probes are feature-based, not version-based. Codex versions that support the marketplace contract and the `codex plugin` CLI work; those that do not are caught by the smoke test. Pinning a floor creates false confidence; the smoke test is the real gate.

**Gate**: resolution required before T6 (install procedure documents the compatibility stance).

**Resolution (2026-06-03)**: Planner default accepted. Feature-probe model (Option 3): no hard version pin. Codex 0.135.0 documented as earliest known-good; 0.136.0 as latest tested. The smoke test (T9) is the real gate on whether a given Codex version works with the marketplace.

### OQ-F — Smoke test surface -- resolved

**Statement**: how do we verify Codex discovers all 8 skills end-to-end?

**Options**:
1. Manual checklist only: maintainer runs each `$<skill-name>` in Codex and records pass/fail.
2. Manual checklist plus an automatable script (`tools/smoke-marketplace.mjs`) that runs `codex plugin list` and invokes `$claude-setup`.
3. Fully automated script that invokes all 8 skills in a Codex session.

**Planner recommendation**: Option 2. A fully automated script (Option 3) requires either a real Codex session or a Codex mock, both of which add complexity disproportionate to the signal. Option 2 gives the maintainer a runnable entry point for the smoke-testable parts (`codex plugin list`, `$claude-setup`) while the per-skill verification remains a manual checklist step. The script is NOT a CI gate — it requires real Codex.

**Gate**: resolution required before T9 (smoke test procedure design).

**Resolution (2026-06-03)**: Option 2 accepted. Manual checklist plus a runnable helper script at `tools/smoke-marketplace.mjs` that runs `codex plugin list` and invokes `$claude-setup`. The script is a release-time helper, NOT a CI gate (requires real Codex). Per-skill verification remains a manual checklist step in `documentation/RELEASING.md`.

### OQ-G — Release checklist location -- resolved

**Statement**: where does the release checklist live?

**Options**:
1. `documentation/RELEASING.md`.
2. `packages/plugin-codex/RELEASING.md`.
3. Embedded in `1-plan.md` (this file).

**Planner recommendation**: Option 1. The release checklist covers the whole repository (versioning, packaging, smoke, tagging), not just the plugin package. Placing it under `documentation/` is consistent with the existing `documentation/plan/` and `documentation/research/` layout. Embedding it in the plan file (Option 3) makes it hard to find and update independently.

**Gate**: resolution required before T11 (the release checklist task depends on the file path).

**Resolution (2026-06-03)**: Planner default accepted. Release checklist lives at `documentation/RELEASING.md`. Covers versioning, packaging, smoke, and tagging across the whole repo. Sibling to the existing `documentation/plan/` and `documentation/research/` directories.

### OQ-H — Excluded files -- resolved

**Statement**: what is intentionally NOT in the shipped plugin?

**Options**:
1. The exclusion list from section 3.3, enforced by `find` commands in T5 acceptance criteria.
2. A more restrictive allowlist: only the files in section 3.2 are included; everything else is excluded by definition.
3. No explicit exclusion list; rely on the packaging script to copy only the right files.

**Planner recommendation**: Option 2 (allowlist-based packaging) with Option 1 (exclusion verification) as a safety net. The packaging procedure copies only the files in the inclusion manifest (section 3.2). The exclusion list (section 3.3) is documented and verified as a defense-in-depth check. Both lists exist; neither is redundant.

**Gate**: resolution required before T4 (packaging manifest) and T5 (exclusion enforcement).

**Resolution (2026-06-03)**: Planner default accepted. Allowlist-based packaging (Option 2 + Option 1 verification). T4 copies only the inclusion manifest (§ 3.2). T5 enforces the exclusion list (§ 3.3) as a defense-in-depth check on the packaged output. Both lists exist; both are committed.

### OQ-I — Distribution registry decision -- resolved

**Statement**: is there a public marketplace registry contract to target (e.g., an Anthropic-hosted marketplace), or does v1 ship as a local marketplace only?

**Options**:
1. Local marketplace only. No external registry submission.
2. Submit to a public registry if one exists and its contract is documented.
3. Research whether a registry exists; if yes, include submission in Plan 0006. If no, local only.

**Planner recommendation**: Option 1. No public Codex plugin registry contract has been documented in any prior plan's research or live E2E testing. Codex 0.135.0 and 0.136.0 both use the local marketplace flow. If a public registry is announced, a follow-up plan handles submission. Plan 0006 does not speculate about registry contracts that do not yet exist.

**Gate**: if a registry contract is discovered during T1 research, this OQ is re-evaluated. Otherwise, Option 1 is the default.

**Resolution (2026-06-03)**: Planner default accepted. Local marketplace only for v1. No external registry submission in Plan 0006. T1 research may surface a registry contract; if so, registry submission becomes a follow-up plan (not absorbed into 0006).

### OQ-J — Definition of done -- resolved

**Statement**: what measurable outcome closes Plan 0006?

**Options**:
1. All of: (a) committed marketplace layout under `marketplace/`; (b) install/upgrade/uninstall procedures documented and smoke-tested; (c) release checklist committed at `documentation/RELEASING.md`; (d) all 8 skills discoverable via the packaged layout; (e) docs-only — no behavioral changes to the plugin itself; (f) existing CI gates pass.
2. Same as Option 1 but without requiring the smoke test against real Codex (smoke is deferred to a follow-up).

**Planner recommendation**: Option 1. The smoke test is the load-bearing verification that the marketplace layout actually works. Without it, the committed layout is a guess. A docs-only plan that ships unverified install instructions is worse than the current ad-hoc `rsync` flow. The smoke is a manual step (not CI-gated) and adds minimal overhead.

**Gate**: resolution confirms the definition of done before implementation begins.

**Resolution (2026-06-03)**: Option 1 accepted (full closure including smoke pass against real Codex). All 12 tasks acceptance-met + `marketplace/` committed + `documentation/RELEASING.md` committed + smoke verified against real Codex on the maintainer's machine + CI green on the standard matrix. Plan 0006 ships docs-only changes; no behavioral changes to the plugin runtime.

---

## 7. Definition of done

Plan 0006 is ready to transition `implementing` -> `auditing` when:

- All 12 tasks have their acceptance criteria demonstrably met.
- CI is green on `main` for the matrix `ubuntu-latest + macos-latest x Node 20 + 22`.
- The `marketplace/` directory exists with the committed layout and all 8 skills.
- `documentation/RELEASING.md` exists with the release checklist, versioning scheme, and smoke procedure.
- `2-implement.md` is filled in with per-task implementation notes.

Plan 0006 is ready to transition `auditing` -> `polishing` when:

- Stage 3 audit verdict is `ready-for-polish` (or better).
- No blocker or high-severity audit findings remain open.

Plan 0006 is ready to transition `polishing` -> `reporting` when:

- Stage 4 polish-actionable findings are closed (or explicitly deferred with rationale in `4-polish.md`).
- Final substantive commit shows CI green on `ubuntu-latest + macos-latest x Node 20 + 22`.

Plan 0006 is `complete` when:

- All five stages have substantive content and the readme status reads `complete`.
- The marketplace layout is committed and the install/upgrade/uninstall procedures are documented and smoke-tested against real Codex.
- The release checklist is committed.
- All 8 skills are discoverable via the packaged layout.
- No behavioral changes to the plugin itself.

---

## 8. Things explicitly NOT in this plan

These belong in later plans. Listing them here so they do not get smuggled into Plan 0006:

- `tools/bench/**` changes (Plan 0004 frozen at tag `plan-0004-pre-cutover`).
- `documentation/plan/0004-*/artifacts/**` edits (pre-cutover artifact frozen).
- README cost paragraph updates (Plan 0004 T12).
- Stop-time review gate / hooks (Plan 0005 deferred).
- External marketplace registry submission (no registry contract documented; follow-up plan if announced).
- Windows support (post-v1 per Plan 0001).
- New runtime behavior or execution model changes.
- Benchmark-result interpretation or cost-claim copy.
- New production dependencies in `packages/runtime/` or `packages/driver-claude-code/`.
- `watch()` AsyncIterable streaming (deferred per Plan 0002 OQ-F).
- `claude ultrareview` wrapping (Plan 0003 explicitly excluded this).
- Telemetry.
- Automated version-bump tooling beyond manual procedure documentation (follow-up if needed).
- CI-gated smoke tests requiring real Codex (smoke is manual; CI continues to use mocks only).
