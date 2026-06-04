# Plan 0006 Stage 3 — Audit

Audited commit: 58e0071
Audited on: 2026-06-04
Auditor: oh-my-claudecode:critic (Opus, fresh-context subagent)

## Verdict

ready-for-polish — Two low-severity findings (stale known-limitation line in plugin README, stale root README status checklist). Neither blocks release; both are natural Stage 4 polish items.

## Audit methodology

- Files read (list)
  - `documentation/plan/README.md`
  - `documentation/plan/0006-20260603-marketplace-packaging-distribution/readme.md`
  - `documentation/plan/0006-20260603-marketplace-packaging-distribution/1-plan.md`
  - `documentation/plan/0006-20260603-marketplace-packaging-distribution/2-implement.md` (full, 1997 lines)
  - `documentation/plan/0006-20260603-marketplace-packaging-distribution/artifacts/` (directory listing)
  - `documentation/RELEASING.md`
  - `marketplace/MANIFEST.md`
  - `marketplace/EXCLUSIONS.md`
  - `marketplace/.agents/plugins/marketplace.json`
  - `marketplace/plugins/claude-companion/README.md`
  - `packages/plugin-codex/README.md`
  - `README.md`
  - `tools/package-marketplace.mjs`
  - `tools/smoke-marketplace.mjs`
  - `packages/plugin-codex/.codex-plugin/plugin.json`
  - `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`
  - `.github/workflows/ci.yml`
  - `packages/plugin-codex/test/marketplace-layout.test.mjs` (first 15 lines for structure)
  - `documentation/plan/0005-20260603-stop-time-review-gate/readme.md` (via grep)

- Commands run (list with exit codes + key output excerpts)
  - `git rev-parse HEAD` → `58e00711f03a88471f13cf5332f26ea08e3523ae` (exit 0) — confirmed
  - `git rev-parse plan-0004-pre-cutover` → `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` (exit 0) — confirmed
  - `git log --oneline -20` → 20 Plan 0006 commits visible (exit 0)
  - `git status --short` → only 3 untracked `references/` dirs (exit 0)
  - `git diff plan-0004-pre-cutover -- documentation/plan/0004-` → empty (exit 0)
  - `git diff plan-0004-pre-cutover -- tools/bench/` → empty (exit 0)
  - `git diff plan-0004-pre-cutover -- .github/` → empty (exit 0)
  - `git diff plan-0004-pre-cutover -- packages/runtime/ packages/driver-claude-code/` → empty (exit 0)
  - `diff -q packages/plugin-codex/.codex-plugin/plugin.json marketplace/plugins/claude-companion/.codex-plugin/plugin.json` → files identical (exit 0)
  - `node tools/package-marketplace.mjs --check` → `check: OK — 18 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.` (exit 0)
  - `node tools/smoke-marketplace.mjs --help` → usage block with 8 skills listed (exit 0)
  - `npm run lint` → clean (exit 0)
  - `npm run typecheck` → clean (exit 0)
  - `npm run format` → `All matched files use Prettier code style!` (exit 0)
  - `npm test` → 1207 tests (mock 68 + runtime 172 + driver 178 + plugin 789), 0 fail (exit 0)
  - `npm run test:attach` → 28 tests, 0 fail (exit 0)
  - `npm run test:bench` → 258 tests, 0 fail (exit 0)
  - `find marketplace/plugins/claude-companion/node_modules -type f | sort | wc -l` → 67
  - `find marketplace -type f -not -path '*/node_modules/*' | sort` → 22 files
  - `grep -nE '"version"' packages/*/package.json package.json` → all `0.0.0`
  - `grep -nE '"version"' .../plugin.json` → both `0.2.0`
  - OQ4 forbidden-token greps on all Plan 0006 surfaces → clean (marketplace README, RELEASING.md, MANIFEST.md, EXCLUSIONS.md all zero hits)
  - Stop-gate/review-gate grep in plugin/runtime/driver source → zero hits (exit 1)
  - CI `permissions: contents: read` confirmed; no secrets, no smoke-marketplace invocation

- What I deliberately did NOT do and why
  - Did NOT run `node tools/smoke-marketplace.mjs` (beyond `--help`) — requires real Codex TUI, could mutate `~/.codex`
  - Did NOT run `codex` commands — per the audit brief's hard read-only rules
  - Did NOT modify any files — read-only audit
  - Did NOT run `npm install` or `npm audit fix` — per hard read-only rules

## Contract compliance vs 1-plan.md

| Task | Verdict | Evidence |
|---|---|---|
| T1 — Research | PASS | `artifacts/codex-plugin-cli-20260603.txt` exists; 2-implement.md T1 section documents 12 commands captured, OQ-D resolved as remove+add, Codex 0.136.0 tested |
| T2 — Marketplace layout | PASS | `marketplace/` tree matches Plan 0006 section 3.1; `marketplace.json` valid JSON with `name: "cc-plugin-codex-local"`; 8 skill dirs present; `marketplace-layout.test.mjs` exists; empirical artifact `t2-marketplace-add-20260603.txt` present |
| T3 — Plugin manifest | PASS | Both `plugin.json` files at version `0.2.0`; byte-identical (`diff -q` exit 0); `defaultPrompt` has 8 entries; `brandColor` `#D97706` |
| T4 — Packaging manifest | PASS | `marketplace/MANIFEST.md` lists 18 derived files + bundled deps; `tools/package-marketplace.mjs` exists with `--check`/`--write`/`--help` modes; `--check` exit 0; artifact `t4-packaging-manifest-20260603.txt` present |
| T5 — Exclusion list | PASS | `marketplace/EXCLUSIONS.md` covers 11 categories + T9.5 bundled-dep exclusions; `find marketplace/plugins/claude-companion/ -name '*.test.*'` returns empty; `find ... -name 'tsconfig*'` returns empty; exclusion enforcement in `package-marketplace.mjs` as step 0 |
| T6 — Install procedure | PASS | Marketplace README contains verbatim install commands; RELEASING.md contains install section; artifact `t6-install-procedure-20260603.txt` present; `marketplace-readme.test.mjs` (13 T6 tests) |
| T7 — Upgrade procedure | PASS | README and RELEASING.md document remove+add flow; explicit negation of `codex plugin upgrade`; artifact `t7-upgrade-procedure-20260603.txt` present; 10 T7 tests |
| T8 — Uninstall procedure | PASS | README documents both remove commands in correct order; verification commands present; cache-breadcrumb documented; artifact `t8-uninstall-procedure-20260603.txt` present; 10 T8 tests |
| T9 — Smoke test | PASS | `tools/smoke-marketplace.mjs` exists and exits 0 with `--help`; RELEASING.md has `## Smoke Test` section with all 8 skills; `$claude-setup` identified as gate; `marketplace-smoke.test.mjs` (17 T9 tests); artifact `t9-smoke-test-20260603.txt` present; manual TUI result documented (7/8 initial, then T9.5 fixed the 8th) |
| T9.5 — Runtime packaging fix | PASS | `node_modules/` tree bundled (67 files = 64 dep + 3 synthesized package.json); `--check` validates byte-identity; STEP 5.5 in smoke script guards against ERR_MODULE_NOT_FOUND; 2-implement.md records empirical closure proof with exit 0, aggregate `warn`, no ERR_MODULE_NOT_FOUND; 25 T9.5 tests |
| T10 — Versioning scheme | PASS | RELEASING.md `## Version Bump` section documents single source-of-truth, semver 0.x.y, `v0.x.y` tag format, workspace `0.0.0` decoupling; smoke helper derives version from plugin.json (no hard-coded literal); 12 T10 tests |
| T11 — Release checklist | PASS | RELEASING.md section order: Scope < Prerequisites < Version Bump < Packaging < Smoke Test < CI Verification < Tagging < Post-release < Troubleshooting < Install < Upgrade < Uninstall; 15 T11 tests in `marketplace-releasing.test.mjs` |
| T12 — Docs split | PASS | Three distinct READMEs: marketplace (end-user, 232 lines), plugin (developer, 505 lines), root (workspace, 186 lines); RELEASING.md untouched by T12; marketplace README has no dev/CI/Plan 0004 vocabulary (verified by grep); plugin README cost paragraph byte-identical; 19 T12 tests in `docs-split.test.mjs` |

## Security and safety invariants

| Invariant | Status | Evidence |
|---|---|---|
| OQ4 forbidden tokens absent from Plan 0006 surfaces | PASS | `grep -rinE 'benchmark\|cutover\|pre-cutover\|post-cutover\|Plan 0004\|cost saving\|cost reduction\|cheaper than\|saves money'` on marketplace README, RELEASING.md, MANIFEST.md, EXCLUSIONS.md = zero hits. Root README hits are pre-existing (lines 7, 159, 166), not in the T12-added Quick start section. |
| No secrets in CI | PASS | `grep -i 'secret\|ANTHROPIC\|OPENAI\|API_KEY\|TOKEN' .github/workflows/ci.yml` = zero hits |
| CI `permissions: contents: read` | PASS | `.github/workflows/ci.yml:9` — `contents: read` |
| Plan 0005 deferred | PASS | `documentation/plan/0005-*/readme.md` status is `deferred`; no stop-gate/review-gate code in plugin/runtime/driver source (`grep` exit 1 = zero hits) |
| Plan 0004 frozen tag | PASS | `git rev-parse plan-0004-pre-cutover` = `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` |
| Plan 0004 artifacts untouched | PASS | `git diff plan-0004-pre-cutover -- documentation/plan/0004-` = empty |
| tools/bench untouched | PASS | `git diff plan-0004-pre-cutover -- tools/bench/` = empty |
| .github untouched | PASS | `git diff plan-0004-pre-cutover -- .github/` = empty |
| runtime/driver source untouched | PASS | `git diff plan-0004-pre-cutover -- packages/runtime/ packages/driver-claude-code/` = empty |
| Cost paragraph byte-identical | PASS | `grep -c 'This v1 uses Claude Code background sessions and does not use \`claude -p\`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement.'` = 1 (exact match at line 341) |
| No real ~/.codex mutation | PASS | All smoke artifacts document isolated `CODEX_HOME=$(mktemp -d)` + `trap rm`; pre/post comparisons confirm stale `cc-plugin-codex-local-smoke` entry preserved |

## Marketplace packaging correctness

**Layout**: matches Plan 0006 section 3.1 exactly. `marketplace/.agents/plugins/marketplace.json` has `name: "cc-plugin-codex-local"`, `source.path: "./plugins/claude-companion"`, `policy.installation: "AVAILABLE"`, `category: "Coding"`. 22 non-node_modules files + 67 bundled node_modules files = 89 total.

**`package-marketplace --check` outcome**: exit 0. Output: `18 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.` This matches Q5 exactly.

**Bundled deps inventory**: 67 files total (64 byte-copied + 3 synthesized package.json). Breakdown:

- `@cc-plugin-codex/runtime/dist/`: 9 .js + 9 .d.ts = 18 files + 1 package.json
- `@cc-plugin-codex/driver-claude-code/dist/`: 12 .js + 12 .d.ts = 24 files + 1 package.json
- `node-pty/`: lib (13 files) + typings (1) + prebuilds (darwin-arm64/2, darwin-x64/2, linux-arm64/1, linux-x64/1 = 6) + LICENSE + README.md = 22 files + 1 package.json
- Total: 18 + 24 + 22 = 64 dep files + 3 package.json = 67

**Platform prebuilds**:

- `darwin-arm64/pty.node` + `darwin-arm64/spawn-helper` (2 files)
- `darwin-x64/pty.node` + `darwin-x64/spawn-helper` (2 files)
- `linux-arm64/pty.node` (1 file)
- `linux-x64/pty.node` (1 file)
- No `win32-*` (excluded per EXCLUSIONS.md)

**Cache-execution proof (T9.5)**: 2-implement.md L1582-1623 records: `node <PLUGIN_ROOT>/scripts/claude-companion.mjs setup` → exit 0, aggregate `warn`, 15/16 probes `ok`, `pty-build` `ok`, `ERR_MODULE_NOT_FOUND` absent. STEP 5.5 in `tools/smoke-marketplace.mjs` (line 344) specifically guards against `ERR_MODULE_NOT_FOUND` as a regression check.

## Docs split and release checklist

**RELEASING.md section order**: Scope (L8) < Prerequisites (L24) < Version Bump (L44) < Packaging (L122) < Smoke Test (L198) < CI Verification (L262) < Tagging (L310) < Post-release (L338) < Troubleshooting/Rollback (L367) < Install (L378) < Upgrade (L393) < Uninstall (L423). Matches Q10's required canonical order.

**Marketplace README scope**: end-user focused. Sections: Claude Companion, Requirements, Install, Verify, Skills (8 skills with descriptions), Uninstall (with verification + cache-breadcrumb note + what-it-doesn't-do), Smoke test (pointer to RELEASING.md), Troubleshooting (4 subsections including ERR_MODULE_NOT_FOUND), Upgrade (with explicit negation of `codex plugin upgrade`). No dev/CI/architecture material (verified by negative grep). No OQ4 forbidden tokens.

**Plugin README scope**: comprehensive developer/contributor reference. Install locally section (L32-72) references committed marketplace with verbatim `codex plugin marketplace add` commands; legacy `rsync` flow retired to a named subsection. Cost paragraph at L341 byte-identical to locked Plan 0001/0002 wording.

**Root README scope**: workspace overview. Quick start section (L13-25) points at 4 canonical surfaces (marketplace README, marketplace tree, plugin README, RELEASING.md, plan history). Pre-existing content (v1 scope, design pillars, repo layout) unchanged.

## Test adequacy

**Current test counts** (verified by running all three gates):

- `npm test`: 1207 (mock 68 + runtime 172 + driver 178 + plugin 789)
- `npm run test:attach`: 28
- `npm run test:bench`: 258
- **Combined**: 1493

**vs claims in 2-implement.md**: 1207 + 28 + 258 = 1493 — **exact match**.

**Coverage assessment**: 789 plugin-lane tests include:

- 55 marketplace-layout tests (T2+T4+T5+T9.5)
- 33 marketplace-readme tests (T6+T7+T8)
- 20 marketplace-smoke tests (T9+T9.5)
- 15 marketplace-releasing tests (T11)
- 19 docs-split tests (T12)

= 142 marketplace-specific tests, plus the pre-existing skill/manifest/readme tests.

**Gaps**: None material. The test suite covers: byte-identity of all derived files, exclusion enforcement with try/finally injection, OQ4 forbidden-token scans across all surfaces, Plan 0004 vocabulary bans, CI non-invocation of smoke helper, version derivation (no hard-coded literals), all 8 skills enumerated, cost paragraph byte-identity, docs-split cross-file invariants. The only area not covered by static tests is the runtime behavior of the smoke helper against real Codex, which is correctly documented as a manual release-time step.

## Findings

### F-1  Plugin README known-limitations line is stale after Plan 0006

- Severity: low
- Area: docs
- Evidence: `packages/plugin-codex/README.md:355` — `- **No committed marketplace packaging** — plan 0006 handles distribution polish.`
- Impact: Factual inaccuracy. Plan 0006 just shipped the committed marketplace packaging. The line tells users the packaging doesn't exist when it now does. No functional impact but confusing to readers.
- Suggested disposition: fix-in-stage-4 — Update line 355 to either remove the bullet entirely or rephrase as `- **Marketplace packaging shipped** — plan 0006 delivered the committed marketplace layout (see marketplace/).`

### F-2  Root README Status section has stale plan-completion checklist

- Severity: nit
- Area: docs
- Evidence: `README.md:151-162` — Plans 0001, 0002, 0003 are shown as `[ ]` (unchecked) when they are all `complete`. Plan 0006 is also `[ ]` when Stage 2 just finished.
- Impact: Cosmetic. The Status section was pre-existing before Plan 0006 and was not part of T12's scope. The root README's Quick start section (the T12 addition) is correct. No functional impact.
- Suggested disposition: fix-in-stage-4 — Update the checkboxes to `[x]` for Plans 0001-0003 (complete), leave Plans 0004-0006 at their actual current statuses. This is a minor polish item consistent with the five-stage workflow.

## Out-of-scope deferrals

- **Windows prebuilds**: `prebuilds/win32-arm64/` and `prebuilds/win32-x64/` are excluded from the bundled tree per maintainer decision. A future plan could add Windows support by including these prebuilds (~6 MB) — no script-shape change needed per EXCLUSIONS.md.
- **External marketplace registry submission**: no public Codex plugin registry contract exists. A follow-up plan handles this if one is announced (per OQ-I resolution).
- **Automated version-bump tooling**: T10 documents the manual procedure. An automated bump script could be a follow-up if the manual procedure proves error-prone.
- **`watch()` AsyncIterable streaming**: deferred per Plan 0002 OQ-F. Not in Plan 0006 scope.
- **Stop-time review gate**: Plan 0005, still `deferred`.
- **Root README Status section refresh**: the stale checklist (F-2) could be addressed in a broader docs refresh plan or absorbed into Stage 4 polish.

## Approval gate

**Stage 4 (Polish) can begin.** Both findings are severity low/nit. Neither blocks execution, tagging, or release. The implementation is mechanically sound: all 13 T-tasks meet their acceptance criteria, 1493 tests pass, the marketplace layout is self-contained and executable from cache, all safety invariants hold (Plan 0004 frozen, Plan 0005 deferred, cost paragraph locked, no OQ4 token leaks, no runtime/driver changes, CI clean). The two polish items (stale known-limitation line in plugin README, stale root README status checklist) are natural Stage 4 work.
