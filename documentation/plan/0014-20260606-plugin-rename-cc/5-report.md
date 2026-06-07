# Stage 5 — Report: Plan 0014

## Report metadata

- **Plan**: Plan 0014 — Plugin rename `claude-companion` → `cc` (dispatcher `claude-companion.mjs` → `cc.mjs`)
- **Date**: 2026-06-06
- **Commit reported**: this commit (Stage 3 + Stage 4 + Stage 5 combined)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted from maintainer's "rename all claude-companion to simply cc" direction; scope authorized via AskUserQuestion (full rename + cc.mjs script name). Approved 2026-06-06. 5 T-tasks.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-06 at commit `7813d7b`. Single executor pass for T1 inventory + T2 rename execution. Doctor regex `/plugins\."cc/` chosen at T1. 134 files renamed/modified. Local total 1771 tests (unchanged from Plan 0013 close — rename is behavior-neutral). CI Stage 2 (`7813d7b`) status to be recorded post-completion.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with one **LOW-severity MINOR-1** doc-accuracy finding (2-implement.md overstated display-name scope) + one **NIT-1** (doctor regex theoretical false-positive, already documented).
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — MINOR-1 resolved as a doc clarification in 2-implement.md. No source/test/manifest changes (functional rename was correct).
- **Final status**: `complete`

---

## Executive summary

Plan 0014 is the **largest single-commit mechanical refactor in cc-plugin-codex's history**: 826 string occurrences of `claude-companion` renamed to `cc` across 134 files. The rename touches every layer — plugin manifest IDs, marketplace directory structure, dispatcher script file name, internal usage strings, 13 SKILL.md run lines, all plugin/runtime tests, runtime doctor probe regex, install/upgrade documentation, and the migration recipe.

**Key decisions** (from T1 inventory):
- **Doctor regex pattern**: `/plugins\."cc/` — matches both `[plugins."cc"]` and `[plugins."cc@cc-plugin-codex-local"]` TOML entries while avoiding bare-`cc` substring false positives. Precedent: `packages/runtime/src/doctor.ts` modification accepted as documented Plan 0014 runtime exception (same class as Plan 0012 T5).
- **Display name**: manifest `interface.displayName` changed to `"CC"`; prose product name "Claude Companion" deliberately retained in README + SKILL.md descriptions (tests `readme.test.mjs:23` and `docs-split.test.mjs:137` codify retention).

**Behavior-neutral verified**: combined test count unchanged at **1771** (mock 68 + runtime 173 + driver 187 + plugin 1057 = 1485 npm test chain + 28 attach + 258 bench). +0 delta vs Plan 0013 close confirms no behavior contract was broken.

**Safety invariants preserved**: cost paragraph byte-identical (`grep -c` = 1); `plan-0004-pre-cutover` tag at `7d9b5f1`; `v0.2.0` at `ea595e1`; Plan 0005 deferred; frozen plan dirs 0001-0013 untouched (historical `claude-companion` references preserved as intended); `.github/`, `packages/driver-claude-code/`, `tools/bench/` all empty-diff vs `740c537`.

**Breaking change for users**: existing installs with the old `claude-companion` plugin ID require migration via the 4-command recipe documented in `RELEASING.md` and `REAL-CODEX-TEST-RECIPE.md`. Plugin version stays at `0.2.0`; the rename will be released as v0.3.0 when the maintainer chooses.

**Sixth plan-cycle close** in this session pattern (Plans 0009, 0010, 0011, 0013 → zero findings; Plan 0012 → 1 MINOR polished; Plan 0014 → 1 LOW MINOR polished + 1 NIT).

---

## What shipped

### Renames

| Before | After | Mechanism |
|---|---|---|
| `claude-companion` (plugin id) | `cc` | manifest field updates in 2 files |
| `marketplace/plugins/claude-companion/` | `marketplace/plugins/cc/` | `git mv` (39+ nested files atomic) |
| `packages/plugin-codex/scripts/claude-companion.mjs` | `packages/plugin-codex/scripts/cc.mjs` | `git mv` (98% similarity; history preserved via `--follow`) |
| `marketplace/plugins/claude-companion/scripts/claude-companion.mjs` | `marketplace/plugins/cc/scripts/cc.mjs` | regenerated via marketplace `--write` |
| `[plugins."claude-companion"]` (TOML pattern) | `[plugins."cc"]` | doctor.ts regex + 7 test fixtures |

### Manifest updates

- `packages/plugin-codex/.codex-plugin/plugin.json`: `"name": "cc"`, `"interface.displayName": "CC"`, `defaultPrompt` "Set up Claude Companion." → "Set up CC."
- `marketplace/.agents/plugins/marketplace.json` plugin entry: `"name": "cc"`, `"path": "./plugins/cc"`

### Dispatcher internal strings

Renamed dispatcher `cc.mjs`:
- `Usage: claude-companion <command>` → `Usage: cc <command>`
- All error labels: `[review] Error: usage: claude-companion stop ...` → `[review] Error: usage: cc stop ...` (and similar across all subcommands)

### Doctor probe (documented runtime exception)

- `packages/runtime/src/doctor.ts:422`: `/claude-companion/.test(body)` → `/plugins\."cc/.test(body)`
- `packages/runtime/test/doctor.test.mjs`: 7 fixture strings updated from `[plugins."claude-companion"]` to `[plugins."cc"]`
- `packages/runtime/dist/doctor.js`: rebuilt via `npm run build`

### All 13 SKILL.md run lines

Updated from `node "<plugin-root>/scripts/claude-companion.mjs" <subcommand>` to `node "<plugin-root>/scripts/cc.mjs" <subcommand>` across all skills:
- claude-setup, claude-delegate, claude-status, claude-result, claude-stop
- claude-followup, claude-review, claude-adversarial-review
- claude-workflow, claude-goal, claude-fork, claude-batch, claude-deep-research

(Skill names themselves unchanged — `$claude-*` prefix is independent of the plugin id, per Plan 0014 §1 background.)

### Documentation + migration callouts

- `documentation/RELEASING.md`: install/upgrade/uninstall command examples updated to `cc@cc-plugin-codex-local`; migration callout added documenting the 4-command remove + reinstall recipe for pre-Plan-0014 installs
- `documentation/REAL-CODEX-TEST-RECIPE.md` §2: install commands updated; migration paragraph added before the install steps
- `documentation/testing/findings-20260605.md`: environment footer updated
- `packages/plugin-codex/README.md`: install commands + dispatcher path references updated. **Cost paragraph at L763 (post-rename) byte-identical**. Prose "Claude Companion" retained per test codification.
- `marketplace/plugins/cc/README.md` (post-rename): install commands updated
- `README.md` (repo root): marketplace README link updated

### Tools + marketplace metadata

- `tools/package-marketplace.mjs`: `DERIVED_FILES` paths, `DEST_DIR`, help text
- `tools/smoke-marketplace.mjs`: `PLUGIN_REF`, `PLUGIN_MANIFEST_REL_PATH`, cache path, dispatcher path
- `marketplace/MANIFEST.md`, `marketplace/EXCLUSIONS.md`

### Test updates

All 9 plugin tests + setup-probes + runtime/doctor.test.mjs — expected strings, fixture data, error message assertions, path assertions all updated. Some broken regex literals fixed; prettier auto-applied.

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-06 via maintainer AskUserQuestion authorization (Full rename + `cc.mjs` script name). 5 T-tasks identified. Doctor regex pattern decision deferred to T1. Documented runtime exception (precedent Plan 0012 T5).
- **Stage 2 (Implement)** — Complete 2026-06-06 at commit `7813d7b`. Single `oh-my-claudecode:executor` agent pass for T1 inventory + T2 rename execution. T3/T4/T5 inline. Local total 1771 (unchanged).
- **Stage 3 (Audit)** — Complete 2026-06-06. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with 1 LOW-severity MINOR (doc accuracy in 2-implement.md) + 1 NIT (doctor regex theoretical false-positive surface).
- **Stage 4 (Polish)** — Complete 2026-06-06. MINOR-1 resolved as a doc clarification in 2-implement.md (no source code change — functional rename was correct).
- **Stage 5 (Report)** — This document. Plan status flips `auditing → polishing → reporting → complete` in this commit.

---

## T-task summary

| Task | Status | Evidence |
|---|---|---|
| T1 inventory + regex decision | complete | `artifacts/inventory-20260606.txt` |
| T2a manifest IDs | complete | plugin.json + marketplace.json |
| T2b directory rename | complete | `git mv` preserved 39+ files |
| T2c script rename | complete | `git mv` 98% similarity; --follow works |
| T2d path/string references | complete | 13 SKILL.md + dispatcher + libs + tests + docs |
| T2e doctor probe | complete | regex + 7 fixtures + dist rebuilt |
| T2f marketplace --write | complete | --check exit 0 with 24 derived |
| T3 migration callouts | complete | RELEASING.md + REAL-CODEX-TEST-RECIPE.md |
| T4 straggler grep | complete | zero actionable; only legitimate keeps |
| T5 gates + CI | complete | local green; CI run pending recorded post-push |

---

## Test and CI evidence

Final local totals on this commit (Stage 5 close):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1057 | 1057 | 0 |
| **`npm test` chain** | **1485** | **1485** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1771** | **1771** | **0** |

**Test growth: +0** (Plan 0013 → Plan 0014). Rename is behavior-neutral.

Remote CI:

- **Stage 1 (`3b4c94e`)** — run `27078576224`: success
- **Stage 2 (`7813d7b`)** — run `27079120844`: in progress at report-write; will be recorded post-completion (expected success — only string changes + regex update; all local gates pass)
- **Stage 3 + 4 + 5 (this commit)** — will be recorded in follow-up log

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` | unchanged |
| `v0.2.0` tag at `ea595e146e26edbd1942486ac98ea38560947210` | unchanged (no retag) |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` cost paragraph (around L763 post-rename) byte-identical | preserved (`grep -c` = 1 before AND after) |
| OQ4 forbidden cost-claim tokens absent from new prose | preserved |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` through `0013-*` untouched | preserved (historical `claude-companion` refs intact) |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/driver-claude-code/**` untouched | preserved |
| `packages/runtime/**` modified | DOCUMENTED EXCEPTION — `src/doctor.ts` regex + `test/doctor.test.mjs` fixtures (T2e); precedent Plan 0012 T5 |
| Plan 0006 T9.5 cache-execution invariant | preserved (marketplace --check exit 0; 24 derived byte-identical between source + mirror) |
| No `~/.claude/` or `~/.codex/` settings mutation | preserved |
| Skill count: 13 (unchanged); marketplace allowlist: 24 (unchanged); plugin version field: `0.2.0` (unchanged) | preserved |
| Git rename history preserved | PASS (`git log --follow` walks through `claude-companion.mjs` → `cc.mjs`) |

---

## Behavioral verification: before vs after

### Plugin id (codex install ID)

Before: `codex plugin add claude-companion@cc-plugin-codex-local`
After: `codex plugin add cc@cc-plugin-codex-local`

### Display in `codex plugin list`

Before: `claude-companion | installed, enabled | 0.2.0`
After: `cc | installed, enabled | 0.2.0`

### Dispatcher invocation

Before: `node "<plugin-root>/scripts/claude-companion.mjs" setup`
After: `node "<plugin-root>/scripts/cc.mjs" setup`

### --help output

Before: `Usage: claude-companion <command> [options]`
After: `Usage: cc <command> [options]`

### Doctor probe (codex-plugin-trust)

Before: matched `[plugins."claude-companion"]` in `~/.codex/config.toml`
After: matches `[plugins."cc"]` or `[plugins."cc@<marketplace>"]`

---

## Breaking change + migration

This rename **breaks existing installs** with the pre-Plan-0014 `claude-companion` plugin id. Documented migration recipe in `documentation/RELEASING.md` and `documentation/REAL-CODEX-TEST-RECIPE.md`:

```bash
codex plugin remove claude-companion --marketplace cc-plugin-codex-local
codex plugin marketplace remove cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
```

The maintainer's local install (per the conversation history) is at `~/.codex/plugins/cache/cc-plugin-codex-local/claude-companion/0.2.0/` — running the above recipe migrates to `~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.2.0/`.

---

## Deferred / future work

- **v0.3.0 release tag** — separate maintainer step. The rename is the kind of breaking change `0.x.y` → `0.(x+1).0` signals. Plan 0013 + Plan 0014 together make a clean v0.3.0 candidate.
- **Prose display-name harmonization** — current state has manifest `displayName: "CC"` but prose product name "Claude Companion" in README + SKILL.md descriptions. A future docs-only plan could harmonize (or codify the asymmetry as intentional). Backlog candidate, ~17 file touches, no functional impact.
- **`/workflows` TUI panel wrapper** — same class as `/tasks`; defer to PTY-injection plan (maintainer's next-up direction).
- **`/tasks` PTY-injection design** — maintainer's next-up direction.
- **Skill-discovery surface test** — verify that typing `$claude-*` in real Codex chat actually invokes the dispatcher (maintainer's next-up direction).
- **Plan 0004 T11/T12 (still paused)** — pending ≥ 2026-06-16
- **Plan 0005 (still deferred)** — pending Plan 0004 closure
- **Opus 4.8 probe floor verification** — not empirically verified
- **G7-G10 backlog from Plan 0007 audit** — LOW priority CLI verb wrappers

---

## Lessons learned

### `git mv` preserves history through large renames

The directory rename (`marketplace/plugins/claude-companion/` → `marketplace/plugins/cc/`) moved 39+ nested files atomically with full history preservation. The script rename (`claude-companion.mjs` → `cc.mjs`) was detected by git's rename heuristic at 98% similarity — `git log --follow` still walks through 19+ commits across the boundary. **Lesson**: prefer `git mv` over `cp/rm` for renames — git's rename detection makes future audits and bisect runs much cleaner.

### Doctor regex needed careful pattern selection

The original `/claude-companion/.test(body)` was specific enough to avoid false positives in a TOML config body. Bare `/cc/` would over-match anything containing "cc" (like "according", "occurred", any plugin name containing "cc"). The chosen `/plugins\."cc/` anchors within the TOML structure while still matching both bare and qualified install ids. The auditor flagged a theoretical false-positive surface (`ccc`, `cc-other`) but the probe is informational-only (`warn`/`ok`, not `fail`), so it's acceptable. **Lesson**: when renaming an identifier referenced by regex, the new pattern must balance specificity (avoid false positives) with the regex's actual intent (catch the right matches). Document the trade-off in code comments.

### Frozen plan dirs are immutable historical state

Plans 0001-0013 reference `claude-companion` historically. The straggler-grep predicate explicitly excludes them. **Lesson**: when a name is used historically in completed plans, it should STAY historically — the rename does not retroactively rewrite past commits or planning docs. The frozen-dir convention codified in earlier plans paid off here.

### Behavior-neutral rename = +0 test count

Test count delta of exactly 0 across all 7 lanes is the cleanest possible signal that no behavior contract was changed by the rename. Some tests had their expected strings updated (`claude-companion` → `cc` in error messages, paths, etc.) but no test was added or removed. **Lesson**: for a pure mechanical refactor, +0 test count delta + 0 failures is the gold standard.

### Display-name asymmetry is acceptable when codified by tests

The manifest `displayName: "CC"` is the machine-readable canonical display name. The prose "Claude Companion" remains in README + SKILL.md descriptions, codified by `readme.test.mjs:23` and `docs-split.test.mjs:137`. This asymmetry is **deliberate** — the prose form reads better in human documentation. **Lesson**: when codifying retention via tests, document the intent so future auditors don't flag it as a missed rename.

### Audit caught the doc-accuracy gap before it became invisible

Stage 3 audit flagged that 2-implement.md overstated the display-name rename. Without the audit, this would have been a permanent inaccuracy in the historical record. Stage 4 polish corrected it in one bullet edit. **Lesson**: even pure-mechanical-refactor plans benefit from a fresh-context audit pass — bullets that read accurately to the author can mislead future readers.

---

## Final verdict

Plan 0014 ships. All five T-tasks complete; Stage 3 audit verdict `ready-for-report` with one LOW-severity MINOR doc finding resolved in Stage 4 polish + one acceptable NIT; all standing safety invariants preserved; **1771 tests pass (0 fail)** across all lanes (+0 delta confirms behavior-neutral); marketplace payload byte-identity intact; cost paragraph byte-identical; git rename history preserved.

The plugin now ships as `cc` — the install id, marketplace path, and dispatcher script all named consistently. The 4-command migration recipe is published for users with the pre-rename install. v0.3.0 is a clean release candidate after Plan 0013 + Plan 0014.

Plan 0015+ candidates listed in deferred work (skill-discovery surface test, `/workflows` TUI panel, `/tasks` PTY-injection, v0.3.0 tag, display-name harmonization).
