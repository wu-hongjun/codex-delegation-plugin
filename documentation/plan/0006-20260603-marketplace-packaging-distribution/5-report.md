# Stage 5 — Report: Plan 0006

## Report metadata

- **Plan**: Plan 0006 — Marketplace packaging and distribution polish
- **Date**: 2026-06-04
- **Commit reported**: this commit (Stage 5 final)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted and approved 2026-06-03 (10 open questions OQ-A through OQ-J resolved; 12 tasks T1–T12; 7 risks R1–R7)
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-04 (T1–T12 including the in-plan T9.5 runtime-packaging remediation; 1493 tests local; CI run [`26958704913`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/26958704913) green at commit `8dbbb61`)
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context via fresh `oh-my-claudecode:critic` subagent at commit `58e0071`; verdict **ready-for-polish** (highest severity LOW; 2 findings F-1 LOW + F-2 NIT; 0 critical/high/medium); commit `8062bd1`
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — substance commit `7f25a9a`; CI run [`26976755879`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/26976755879) green at `7f25a9a`; CI-log commit `71a9665`; F-1 + F-2 resolved; +5 docs-polish tests (1493 → 1498)
- **Final status**: `complete`

---

## Executive summary

Plan 0006 ships the committed local marketplace layout that Plans 0001–0005 deliberately deferred. End users can now install the plugin from a clone of this repo with two Codex CLI commands:

```bash
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

The shipped plugin version is **`0.2.0`**, sourced from a single source-of-truth manifest at `packages/plugin-codex/.codex-plugin/plugin.json` and byte-identical in the marketplace copy. Workspace `package.json` files stay at `"0.0.0"` (internal metadata; decoupled from the released plugin).

The marketplace cache is **self-contained and executable** after `codex plugin add` — `node <PLUGIN_ROOT>/scripts/claude-companion.mjs setup` exits 0 with `pty-build` `ok` and no `ERR_MODULE_NOT_FOUND`, because Plan 0006 T9.5 bundled the `@cc-plugin-codex/runtime`, `@cc-plugin-codex/driver-claude-code`, and `node-pty` payload (darwin-arm64 / darwin-x64 / linux-arm64 / linux-x64 prebuilds) into the marketplace tree. All 8 skills are packaged and discoverable in the Codex TUI.

`documentation/RELEASING.md` is now the canonical release-day checklist: Scope → Prerequisites → Version Bump → Packaging → Smoke Test → CI Verification → Tagging → Post-release → Troubleshooting/Rollback → Install/Upgrade/Uninstall appendices. Documentation is split across three audiences (end-user marketplace README, developer plugin README, workspace root README) with mechanical static tests locking each surface's contract.

All four local gates are clean: `npm run lint`, `npm run typecheck`, `npm run format`, and the three test lanes all exit 0 with **1498 tests passing** (1212 npm test + 28 test:attach + 258 test:bench) and 0 failures. Remote CI on the Stage 4 commit `7f25a9a` is green across all four matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).

Plan 0006 did not change any runtime, driver, dispatcher, or skill behavior. It did not touch the Plan 0004 benchmark harness or its frozen tag, did not un-defer Plan 0005, did not modify the locked cost paragraph, did not change the CI workflow, and did not mutate the real `~/.codex`.

---

## What shipped

### Committed marketplace layout

- `marketplace/` — top-level committed marketplace root.
- `marketplace/.agents/plugins/marketplace.json` — Codex 0.136.0 local-marketplace descriptor: `name: "cc-plugin-codex-local"`, `source.path: "./plugins/claude-companion"`, `policy.installation: "AVAILABLE"`, `category: "Coding"`.
- `marketplace/plugins/claude-companion/` — packaged plugin tree (89 files total: 22 non-`node_modules` files + 67 bundled-dep files).
  - `.codex-plugin/plugin.json` — byte-identical to source manifest; version `0.2.0`; `defaultPrompt` with 8 entries; `brandColor` `#D97706`.
  - `scripts/` — dispatcher + lib helpers (byte-identical to source).
  - `skills/` — all 8 skill `SKILL.md` files (byte-identical to source).
  - `node_modules/` — T9.5 bundled-deps tree (67 files; see below).
  - `README.md` — end-user marketplace README (T12).

### Bundled runtime / driver / node-pty payload (T9.5)

- `@cc-plugin-codex/runtime/` — 9 `.js` + 9 `.d.ts` files + synthesized `package.json` with version marker `0.2.0-bundled`.
- `@cc-plugin-codex/driver-claude-code/` — 12 `.js` + 12 `.d.ts` files + synthesized `package.json`.
- `node-pty/` — full `lib/` (13 files), `typings/`, `LICENSE`, `README.md`, and `prebuilds/` with `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64` native binaries. Install / postinstall scripts stripped from the synthesized `package.json`. No `win32-*` (out of v1 scope).

### Tooling

- `tools/package-marketplace.mjs` — `--write` (build + copy + synthesize), `--check` (byte-identity verification across 4 file classes), `--help`. Currently validates `18 derived files + 64 bundled-dep files + 3 synthesized package.json files + 1 marketplace-owned file; no unexpected files.`
- `tools/smoke-marketplace.mjs` — release-day automated preflight: marketplace add → plugin add → cache existence → 8-skill enumeration → STEP 5.5 dispatcher execution guard against `ERR_MODULE_NOT_FOUND` → uninstall + revert. Derives `EXPECTED_VERSION` from `plugin.json` at runtime (no hard-coded literal). `--help` lists all 8 skills.

### Documentation

- `marketplace/MANIFEST.md` — packaged-file inventory.
- `marketplace/EXCLUSIONS.md` — what is deliberately excluded (tests, tsconfigs, source maps, Windows prebuilds, etc.).
- `documentation/RELEASING.md` — canonical release-day checklist with 7-step Version Bump procedure, smoke-test step listing all 8 skills, CI verification with 4-leg matrix, `v0.x.y` tag format.
- `marketplace/plugins/claude-companion/README.md` — end-user surface: Requirements, Install, Verify, Skills (8), Uninstall (with cache-breadcrumb note), Smoke test pointer, Troubleshooting (incl. `ERR_MODULE_NOT_FOUND`), Upgrade (with explicit negation of `codex plugin upgrade`). No dev / CI / architecture content; no OQ4 forbidden tokens.
- `packages/plugin-codex/README.md` — developer surface: Install locally now points at the committed `marketplace/` tree. Known-limitations bullet for marketplace packaging rewritten in Stage 4 to reflect the shipped state. Cost paragraph at L341 byte-identical to Plan 0001/0002 wording.
- `README.md` — workspace overview with new Quick start section pointing at marketplace README, marketplace tree, plugin README, RELEASING.md, and plan history. Plan-status checklist updated in Stage 4 to reflect Plans 0001–0003 complete, Plan 0004 paused, Plan 0005 deferred, Plan 0006 in progress.

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-03. 10 open questions OQ-A through OQ-J resolved; 12 tasks T1–T12; 7 risks R1–R7. OQ-D resolved as "remove + add" (no native `codex plugin upgrade` for path-based marketplaces). OQ-4 cost-claim discipline carried forward from Plans 0001–0003.
- **Stage 2 (Implement)** — Complete 2026-06-04. T1–T12 plus the T9.5 in-plan remediation. CI green on commit `8dbbb61`. 1493 tests at close.
- **Stage 3 (Audit)** — Complete 2026-06-04 at commit `58e0071`. Independent context via fresh `oh-my-claudecode:critic` (Opus) subagent. Verdict `ready-for-polish`: F-1 LOW (stale "No committed marketplace packaging" bullet in plugin README) + F-2 NIT (stale plan-status checklist in root README). Zero critical/high/medium findings.
- **Stage 4 (Polish)** — Complete 2026-06-04 at commit `7f25a9a`. F-1 + F-2 resolved; +5 narrow static tests added to `docs-split.test.mjs` locking the corrected state. CI green on run `26976755879`. CI-log commit `71a9665`.
- **Stage 5 (Report)** — This document. Plan status flips `reporting → complete`.

---

## T-task summary

| Task | Status | Evidence |
|---|---|---|
| T1 — Codex 0.136.0 plugin-lifecycle research | complete | `artifacts/codex-plugin-cli-20260603.txt`; 12 commands captured; OQ-D resolved as remove+add; established that `codex plugin marketplace upgrade` exists for Git marketplaces only. |
| T2 — Committed marketplace layout | complete | `marketplace/.agents/plugins/marketplace.json` accepted by real Codex 0.136.0; artifact `t2-marketplace-add-20260603.txt`; `marketplace-layout.test.mjs` covers structure + byte-identity. |
| T3 — Plugin manifest at v0.2.0 | complete | Both `plugin.json` files at `0.2.0`; `diff -q` exit 0; `defaultPrompt` has 8 entries; brand colour `#D97706`. |
| T4 — Packaged-file manifest + packaging script | complete | `marketplace/MANIFEST.md` + `tools/package-marketplace.mjs --write/--check/--help`; `--check` validates 18 derived + 64 bundled + 3 synthesized + 1 marketplace-owned; exit 0. |
| T5 — Exclusion list | complete | `marketplace/EXCLUSIONS.md` covers 11 categories; tests, tsconfig*, source maps, Windows prebuilds all absent from tree (verified by `find`). |
| T6 — Install procedure | complete | Marketplace README + RELEASING.md document the two verbatim commands; artifact `t6-install-procedure-20260603.txt`; 13 T6 tests in `marketplace-readme.test.mjs`. |
| T7 — Upgrade procedure | complete | README and RELEASING.md document remove+add (no `codex plugin upgrade` for path marketplaces); artifact `t7-upgrade-procedure-20260603.txt`; 10 T7 tests. |
| T8 — Uninstall procedure | complete | README documents `codex plugin remove` then `codex plugin marketplace remove` in that order, with empty-cache breadcrumb call-out; artifact `t8-uninstall-procedure-20260603.txt`; 10 T8 tests. |
| T9 — Smoke procedure | complete | `tools/smoke-marketplace.mjs` exists; RELEASING.md has `## Smoke Test` section enumerating all 8 skills with `$claude-setup` as the gate; manual TUI checklist documented in 2-implement.md; 17 T9 tests in `marketplace-smoke.test.mjs`. |
| T9.5 — Runtime packaging fix | complete | See "Important bug discovered and fixed" below. 25 T9.5 tests in `marketplace-layout.test.mjs`. |
| T10 — Versioning procedure | complete | RELEASING.md `## Version Bump` section documents semver `0.x.y`, source-of-truth file, `v0.x.y` tag format, workspace `0.0.0` decoupling; smoke helper derives `EXPECTED_VERSION` from `plugin.json`; 12 T10 tests. |
| T11 — Release checklist consolidation | complete | RELEASING.md final section order: Scope → Prerequisites → Version Bump → Packaging → Smoke Test → CI Verification → Tagging → Post-release → Troubleshooting/Rollback → Install/Upgrade/Uninstall. 15 T11 tests in `marketplace-releasing.test.mjs`. |
| T12 — Docs split | complete | Three distinct README surfaces; cost paragraph byte-identical at L341; root README Quick start added; 19 T12 tests in `docs-split.test.mjs`. |

---

## Important bug discovered and fixed (T9 → T9.5)

T9's automated preflight script passed, but the manual TUI checklist (driven by qa-tester via tmux because the maintainer could not run it personally that day) found that **`$claude-setup` failed inside the Codex TUI with `ERR_MODULE_NOT_FOUND`** when invoked from the marketplace cache install.

### Root cause

The marketplace plugin cache (`<CODEX_HOME>/plugins/cache/cc-plugin-codex-local/claude-companion/0.2.0/`) is a *self-contained copy* of the plugin tree. The dispatcher (`scripts/claude-companion.mjs`) statically imports `@cc-plugin-codex/runtime` and `@cc-plugin-codex/driver-claude-code` as workspace dependencies. In the original packaged tree, those packages did **not** exist next to the dispatcher — they resolved only because Codex was being run from the workspace root during development. Once Codex copied the tree into the cache outside the workspace, the imports failed.

### Fix (T9.5)

Bundle the resolved dependency payload into `marketplace/plugins/claude-companion/node_modules/`:

- `@cc-plugin-codex/runtime/dist/` — built JS + TS declarations + synthesized `package.json` (version marker `0.2.0-bundled`).
- `@cc-plugin-codex/driver-claude-code/dist/` — same shape.
- `node-pty/` — full `lib/`, `typings/`, `LICENSE`, `README.md`, and the 6 prebuilt native binaries for `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`. Install + postinstall scripts stripped from the synthesized `package.json`.

64 byte-copied dep files + 3 synthesized `package.json` = 67 bundled-tree files. `tools/package-marketplace.mjs --write` produces the tree; `--check` enforces byte-identity. `.gitignore` was extended with three re-include rules so the bundled tree is tracked.

A new STEP 5.5 was added to `tools/smoke-marketplace.mjs`: spawn `node <PLUGIN_ROOT>/scripts/claude-companion.mjs setup` and fail the smoke if `ERR_MODULE_NOT_FOUND` appears. This is the regression guard for T9.5.

### Proof of fix

After T9.5, executing the dispatcher directly from the plugin cache (the path Codex itself uses when launching `$<skill>`) returns:

```
exit code: 0
aggregate: warn
probes: 15/16 ok
  pty-build: ok
ERR_MODULE_NOT_FOUND: not present
```

(Recorded in `2-implement.md` § T9.5 closeout.)

This is the load-bearing reason the marketplace install is now genuinely **executable** from the cache, not merely discoverable.

---

## Audit and polish findings

Stage 3 audit (independent context, fresh `oh-my-claudecode:critic` subagent at commit `58e0071`) returned **ready-for-polish — 1 LOW + 1 NIT, 0 critical/high/medium**. All 20 contract questions and all process-audit questions passed; all safety invariants held; all gates green.

| ID | Severity | Finding | Stage 4 resolution |
|---|---|---|---|
| F-1 | low | `packages/plugin-codex/README.md:355` still carried the stale bullet "No committed marketplace packaging — plan 0006 handles distribution polish" although Plan 0006 had just shipped that packaging. | Rewrote the bullet to "Local marketplace packaging is committed; no external registry submission" with the install command. Neutral wording; no OQ4 forbidden tokens. |
| F-2 | nit | Root `README.md:151-162` plan-status checklist still showed Plans 0001–0003 as `[ ]` even though they are complete; lead-in paragraph implied Plan 0001 was the only plan in progress. | Updated lead-in and checklist: Plans 0001-0003 marked `[x]` complete; Plan 0004 stays unchecked (paused pending post-cutover T11/T12); Plan 0005 deferred; Plan 0006 unchecked (in progress through Stage 4). |

Stage 4 added five static tests to `docs-split.test.mjs` under `describe('docs polish — Stage 4 audit findings (Plan 0006 Stage 4)', …)` locking the corrected state: plugin README must not contain the stale F-1 wording and must mention the committed `marketplace/` tree; root README must mark Plans 0001-0003 complete and must not mark Plan 0004 or Plan 0006 complete.

No critical, high, or medium findings were raised across the audit. No further audit pass was needed after Stage 4.

---

## Test and CI evidence

Final local totals on the Stage 4 / Stage 5 reported commit:

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` (mock-claude + mock-codex) | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 178 | 178 | 0 |
| `test:plugin` | 794 | 794 | 0 |
| **`npm test` chain total** | **1212** | **1212** | **0** |
| `test:attach` (PTY-dependent) | 28 | 28 | 0 |
| `test:bench` (benchmark harness lane) | 258 | 258 | 0 |
| **Combined total** | **1498** | **1498** | **0** |

Test growth from Plan 0003 close to Plan 0006 close:

- Plan 0003 final (`189f7a2`): 1041 npm test + 28 test:attach = 1069. (`test:bench` had not yet shipped — Plan 0004.)
- Plan 0004 implementation close: introduced `test:bench` lane.
- Plan 0006 final (this commit): 1212 npm test + 28 test:attach + 258 test:bench = **1498**.

Plan 0006 net contribution to test count: roughly +171 tests on top of the Plan 0003/0004 baseline, concentrated in the plugin lane: marketplace-layout (55, T2+T4+T5+T9.5), marketplace-readme (33, T6+T7+T8), marketplace-smoke (20, T9+T9.5), marketplace-releasing (15, T11), docs-split (19+5 polish, T12+Stage 4).

`npm run lint`, `npm run typecheck`, `npm run format` and `node tools/package-marketplace.mjs --check` all exit 0 on the reported commit. `node tools/smoke-marketplace.mjs --help` exits 0 and prints all 8 skills.

Remote CI evidence (most recent green run on `main`):

- **Stage 2 close (`8dbbb61`)** — run [`26958704913`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/26958704913): success on all 4 matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).
- **Stage 4 polish (`7f25a9a`)** — run [`26976755879`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/26976755879): success on all 4 matrix legs.

Stage 5 CI run is recorded after this report's commit (see "CI verification" below if added in a follow-up log commit).

---

## Safety invariants preserved

Plan 0006 was scoped to be invisible to every locked invariant from Plans 0001–0005:

- ✅ `plan-0004-pre-cutover` tag still points to commit `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` (verified `git rev-parse` at every stage gate).
- ✅ `tools/bench/**` — empty `git diff plan-0004-pre-cutover -- tools/bench/`. Benchmark harness semantics frozen.
- ✅ `documentation/plan/0004-*` — empty `git diff plan-0004-pre-cutover -- documentation/plan/0004-`. Plan 0004 artifacts untouched.
- ✅ Plan 0005 remains `deferred` with no hooks / stop-gate / review-gate code added (grep returns zero hits in plugin/runtime/driver source).
- ✅ `packages/plugin-codex/README.md` cost paragraph at L341 byte-identical to the locked Plan 0001/Plan 0002 wording. Verified by `docs-split.test.mjs` cost-paragraph byte-identity test still passing.
- ✅ No OQ4 forbidden cost-claim tokens introduced in any new Plan 0006 surface (marketplace README, RELEASING.md, marketplace MANIFEST.md / EXCLUSIONS.md, Stage 4 docs edits). Verified by per-surface forbidden-token tests.
- ✅ `packages/runtime/**` and `packages/driver-claude-code/**` source unchanged — empty `git diff plan-0004-pre-cutover` against both. No runtime / driver / dispatcher / skill **behavior** changes anywhere in Plan 0006; the only "packaging" change to runtime/driver is that their built `dist/` payload is now bundled into the marketplace tree.
- ✅ `packages/plugin-codex/scripts/**` and `packages/plugin-codex/skills/**` source unchanged.
- ✅ `.github/workflows/ci.yml` unchanged. No new CI steps, no new permissions, no secrets, no real Claude / Codex install in CI. The smoke helper is explicitly **not** invoked by CI (locked by static test).
- ✅ Real `~/.codex/config.toml` not mutated by any T-task: smoke artifacts all use isolated `CODEX_HOME=$(mktemp -d)` with `trap rm`; pre/post comparisons preserved the stale `cc-plugin-codex-local-smoke` entries the maintainer asked us not to touch.

---

## Deferred / future work

- **Plan 0004 (paused)** — T11 (post-cutover benchmark) and T12 (cost-paragraph decision) remain pending until the ≥ 2026-06-16 post-cutover window. Plan 0004 owns the cost paragraph. Plan 0006 deliberately did not touch it.
- **Plan 0005 (deferred)** — Stop-time review gate via hooks. Stays deferred until Plan 0004 T11/T12 close.
- **External / hosted marketplace registry submission** — Out of scope for Plan 0006. No public Codex plugin registry contract exists yet (per OQ-I resolution). A future plan handles this if Anthropic or OpenAI publishes a registry contract.
- **Windows support** — `win32-arm64` and `win32-x64` `node-pty` prebuilds are deliberately excluded per `EXCLUSIONS.md`. A future plan could bundle them (~6 MB) without script-shape changes. Plan 0001's existing "Windows not supported" limitation remains in effect.
- **Automated version-bump tooling** — T10 documents the manual procedure (7 steps). An automated bump script could be a follow-up if the manual procedure proves error-prone.
- **Release tag** — Plan 0006 Stage 5 deliberately **does not** create the `v0.2.0` release tag. Tagging is a maintainer-driven step that should follow `documentation/RELEASING.md` (run smoke + verify CI green + create `v0.2.0`). Plan 0006 has prepared everything required for that step but does not perform it.
- **`watch()` AsyncIterable streaming** — Deferred per Plan 0002 OQ-F. Unchanged by Plan 0006.

---

## Final assessment

**Plan 0006 is complete.**

Local marketplace packaging is committed under `marketplace/`, documented across three distinct README surfaces with mechanical static tests locking each, automated `--check` byte-identity verification in `tools/package-marketplace.mjs`, smoke-tested via `tools/smoke-marketplace.mjs` (including the T9.5 dispatcher-execution regression guard), and proven executable from the Codex marketplace cache by direct invocation of `node <PLUGIN_ROOT>/scripts/claude-companion.mjs setup`.

`documentation/RELEASING.md` is the canonical release-day checklist. The plugin is **ready for maintainer-driven release tagging** using that document. No release tag was created in Plan 0006 Stage 5; that is the next maintainer-driven step.

Plan 0004 and Plan 0005 statuses are unchanged. Plan 0006 introduced no behavioural changes to the runtime, driver, dispatcher, or skills, and no changes to the CI workflow. Every safety invariant from Plans 0001–0005 is preserved.
