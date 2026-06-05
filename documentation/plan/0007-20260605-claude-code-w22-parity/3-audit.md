# Plan 0007 Stage 3 — Audit

Audited commit: 9ac7742
Audited on: 2026-06-05
Auditor: oh-my-claudecode:critic (Opus, fresh-context subagent)

## Verdict

ready-for-polish — Zero critical or high findings. Two medium and one low finding, all addressable in Stage 4 polish.

## Audit methodology

### Files read (in order)

1. `documentation/plan/README.md` — workflow definition
2. `documentation/plan/0007-20260605-claude-code-w22-parity/readme.md` — plan summary
3. `documentation/plan/0007-20260605-claude-code-w22-parity/1-plan.md` — full plan
4. `documentation/plan/0007-20260605-claude-code-w22-parity/2-implement.md` — implementation log
5. `documentation/research/20260604-claude-code-w22-audit/report.md` — underlying audit
6. `documentation/research/20260604-claude-code-w22-audit/plan-0007-candidate.md` — scoping draft
7. `packages/plugin-codex/scripts/lib/claude-version.mjs` — new helper (full file, 55 lines)
8. `packages/plugin-codex/test/claude-version.test.mjs` — helper tests (full file, 88 lines)
9. `packages/plugin-codex/test/setup-probes.test.mjs` — probe regression guard (full file, 59 lines)
10. `packages/plugin-codex/test/agents-json-parsing.test.mjs` — T1 tests (full file, 155 lines)
11. `packages/plugin-codex/scripts/claude-companion.mjs` lines 1-55 (imports), 85-243 (full probe section)
12. `packages/driver-claude-code/src/agents-json.ts` — full file (322 lines), STATUS_MAP at L51-70
13. `packages/driver-claude-code/test/agents-json.test.mjs` — full file (581 lines), T2 tests at L522-580
14. `packages/plugin-codex/README.md` lines 335-346 (cost paragraph), 490-534 (T4 new subsections)
15. `marketplace/plugins/claude-companion/README.md` lines 183-207 (T4 G6 short)
16. `marketplace/MANIFEST.md` — full file (100 lines)
17. `tools/package-marketplace.mjs` lines 45-79 (DERIVED_FILES array)
18. `packages/plugin-codex/test/marketplace-layout.test.mjs` lines 395-420 (DERIVED_FILES_ALLOWLIST)
19. `documentation/RELEASING.md` — full file (471 lines)
20. Pre-Stage-2 `agents-json.ts` STATUS_MAP via `git show 3058b74:...`

### Commands run with exit codes

| Command | Exit | Key output |
|---|---|---|
| `git rev-parse HEAD` | 0 | `9ac7742dd0707137e730a91a65ba48d7394b2277` |
| `git rev-parse plan-0004-pre-cutover` | 0 | `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` |
| `git log --oneline -10` | 0 | Two Plan 0007 commits (3058b74, 9ac7742) atop Plan 0006 history |
| `git status --short` | 0 | Only 3 `?` entries (references/ submodule placeholders) |
| `git diff plan-0004-pre-cutover -- documentation/plan/0004-` | 0 | empty |
| `git diff plan-0004-pre-cutover -- tools/bench/` | 0 | empty |
| `git diff plan-0004-pre-cutover -- .github/` | 0 | empty |
| `git diff plan-0004-pre-cutover -- documentation/plan/0005-` | 0 | empty |
| `git diff plan-0004-pre-cutover -- packages/runtime/` | 0 | empty |
| `node tools/package-marketplace.mjs --check` | 0 | `check: OK — 19 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.` |
| `node tools/smoke-marketplace.mjs --help` | 0 | Lists 8 skills |
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm run format` | 0 | `All matched files use Prettier code style!` |
| `npm test` | 0 | mock 68 + runtime 172 + driver 187 + plugin 818 = **1245** tests, 0 fail |
| `npm run test:attach` | 0 | **28** tests, 0 fail |
| `npm run test:bench` | 0 | **258** tests, 0 fail |
| `node .../claude-companion.mjs setup` | 0 | 3 new probes present in correct order |
| `grep -c 'Cost savings...'` | 0 | `1` (byte-identical) |
| `diff -q plugin.json (source vs marketplace)` | 0 | identical |
| `diff claude-version.mjs (source vs marketplace)` | 0 | identical |
| `grep -rE '<forbidden tokens>' marketplace/.../README.md` | 1 | zero hits (clean) |

**Combined test count: 1245 + 28 + 258 = 1531 tests, 0 fail.**

## Contract compliance vs 1-plan.md

### T1 — `claude agents --json` parser tolerance: PASS

- Parser accepts `waitingFor` field (v2.1.162) without throwing: verified in `packages/plugin-codex/test/agents-json-parsing.test.mjs:33-51`.
- Parser accepts `notARealField: 42` without throwing: verified at L57-71.
- Parser does not throw on missing `sessionId` or `pid`; surfaces `undefined`: verified at L77-127.
- No `assert.deepEqual` on full rows (R1 mitigation): verified by grep — only occurrence is in a comment at L4.
- 6 tests added (plan target 5; justified overshoot of +1).

### T2 — Internal status enum re-mapping: PASS

- `working` maps to `'working'` (canonical): verified in `agents-json.ts:52` and test at `agents-json.test.mjs:527-533`.
- `waiting` maps to `'needs_input'`: verified in `agents-json.ts:60` and test at L535-540.
- `awaiting_followup` maps to `'needs_input'`: verified in `agents-json.ts:61` and test at L542-550.
- Unknown status maps to `'unknown'` without throwing: verified at L552-561.
- Pre-existing canonical mappings for `running`/`busy`/`idle`/`completed`/`failed`/`stopped` preserved: pre-T2 STATUS_MAP (via `git show 3058b74`) already had `working` and `waiting` in the same buckets — T2 added only `awaiting_followup` and version-attribution comments. Regression tests at L564-579.
- 5 tests added (matches plan target).

### T3 — Doctor version-floor probe: PASS

- `parseClaudeVersion` returns `null` for unparseable input (R2 mitigation): verified in `claude-version.mjs:18-25` and test at `claude-version.test.mjs:31-37`.
- `meetsFloor` returns `false` when version is `null`: verified at `claude-version.mjs:51` and test at L79-80.
- Three new probes appended (R6 mitigation): verified in `claude-companion.mjs:237` — `extraProbes: [ptyBuildExtraProbe, opus48Probe, workflowsProbe, bgExecProbe]`. Existing `ptyBuildExtraProbe` is first; three new probes follow.
- Probe ordering in live output: `claude-version` → `opus-4-8-supported` → `workflows-supported` → `bg-exec-supported`. Verified by `setup` command output.
- 13 + 5 = 18 tests added (plan target 6-8; significant overshoot justified per `feedback_test_count_overshoot` — each test is a distinct contract assertion).

### T4 — README troubleshooting subsections: PASS

- Plugin README G5 subsection present: `### --model interaction with --fallback-model` at L507. Verified.
- Plugin README G6 subsection present: `### $claude-result reads raw transcript, not the display layer` at L513. Verified.
- Marketplace README G6 short version present: `### $claude-result reads raw transcript, not the display layer` at L196. Verified.
- No OQ4 forbidden tokens introduced in new sections: verified by grep — all hits are in pre-existing text (cost paragraph, known limitations, roadmap).
- Cost paragraph at L341 byte-identical: `grep -c` returns 1.

### T5 — Marketplace payload byte-identity recheck: PASS (with F-1 caveat)

- `--check` exits 0: `19 derived + 64 bundled + 3 synthesized + 1 marketplace-owned`.
- `claude-version.mjs` exists in both source and marketplace, byte-identical: verified by `diff`.
- `claude-companion.mjs` byte-identical: verified by `diff`.
- `agents-json.js` byte-identical: verified by `diff`.
- `plugin.json` byte-identical: verified by `diff -q`.
- MANIFEST.md updated to 19 with new bullet for `scripts/lib/claude-version.mjs`.
- `tools/package-marketplace.mjs` DERIVED_FILES array contains `scripts/lib/claude-version.mjs` at L55.
- `marketplace-layout.test.mjs` DERIVED_FILES_ALLOWLIST contains it at L406.
- RELEASING.md updated to "19" in two places (L164, L175). **But missed a third occurrence at L141** — see Finding F-1.

### T6 — CI evidence (local gates): PASS

- All local gates green (lint, typecheck, format, package-marketplace --check, smoke --help, npm test, test:attach, test:bench).
- Remote CI awaiting push (expected; Stage 2 is "complete pending CI").

## Security and safety invariants

| Invariant | Status | Evidence |
|---|---|---|
| OQ4 forbidden tokens in new T4 prose | CLEAN | `grep -rE` on both README surfaces shows zero hits in new sections |
| No secrets committed | CLEAN | `git diff --name-only` shows no `.env`, credentials, or key files |
| `plan-0004-pre-cutover` tag at `7d9b5f1` | PRESERVED | `git rev-parse plan-0004-pre-cutover` = `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` |
| Plan 0005 deferred (unchanged) | PRESERVED | `git diff plan-0004-pre-cutover -- documentation/plan/0005-` empty |
| Cost paragraph at L341 byte-identical | PRESERVED | `grep -c` returns 1 |
| T9.5 cache-execution invariant | PRESERVED | `claude-version.mjs` ships in marketplace bundle; `diff` byte-identical; `--check` exits 0 |
| No CI workflow changes | PRESERVED | `git diff plan-0004-pre-cutover -- .github/` empty |
| No bench tool changes | PRESERVED | `git diff plan-0004-pre-cutover -- tools/bench/` empty |
| No runtime source changes | PRESERVED | `git diff plan-0004-pre-cutover -- packages/runtime/` empty |

## Marketplace packaging correctness

- 19 derived files listed and byte-identical: PASS
- 64 bundled-dep files match: PASS
- 3 synthesized package.json files match canonical shape: PASS
- 1 marketplace-owned file present: PASS
- No unexpected files: PASS
- New `claude-version.mjs` present in BOTH trees, byte-identical: PASS
- `claude-companion.mjs` with new probe import present in marketplace: PASS
- `agents-json.js` with widened STATUS_MAP present in marketplace: PASS

## Test adequacy

| Lane | 2-implement.md claim | Actual count | Delta |
|---|---|---|---|
| mock | 68 | 68 | 0 |
| runtime | 172 | 172 | 0 |
| driver | 183 | **187** | **+4** |
| plugin | 818 | 818 | 0 |
| **npm test total** | **1241** | **1245** | **+4** |
| attach | 28 | 28 | 0 |
| bench | 258 | 258 | 0 |
| **Combined** | **1527** | **1531** | **+4** |

The driver lane has 4 more tests than claimed. See Finding F-2.

Test coverage for Plan 0007 additions:

- T1: 6 tests in `agents-json-parsing.test.mjs` — forward compat, missing fields, regression.
- T2: 5 tests in `agents-json.test.mjs` L522-580 — `working`, `waiting`, `awaiting_followup`, unknown sentinel, regression.
- T3: 13 tests in `claude-version.test.mjs` + 5 tests in `setup-probes.test.mjs` — version parsing, comparison, floor check, probe presence and ordering.
- T4: 0 new tests (relies on existing forbidden-token and docs-split scans).
- T5: 0 new tests (allowlist updated in existing test).

Actual Plan 0007 net delta: +29 tests (from Plan 0006 baseline of ~1502 to current 1531). The plan targeted +14-18. Overshoot is +11-15, justified per `feedback_test_count_overshoot`.

Note: The Plan 0006 close baseline was stated as 1498 in the plan. But actual current total is 1531, with Plan 0007 claiming +29 delta, which would place the baseline at 1502. This discrepancy of +4 is consistent with the driver lane miscount.

## Findings

### F-1  Stale "18" in RELEASING.md line 141

- Severity: medium
- Area: docs
- Evidence: `documentation/RELEASING.md:141` reads `Copy 18 source-derived files (T2-T5 allowlist)` but the actual count is 19 after adding `claude-version.mjs`. The T5 implementation updated two occurrences at L164 and L175 to "19" but missed this third occurrence. The 2-implement.md says "18→19 via replace-all; 2 occurrences" — the replace pattern likely matched "18 derived" but L141 uses "18 source-derived" which has a different token shape.
- Impact: A developer reading the RELEASING.md `--write` description step would see a count that doesn't match the actual `--check` output or the MANIFEST.md. No functional impact (the script itself uses the DERIVED_FILES array, not a hardcoded count).
- Suggested disposition: fix-in-stage-4

### F-2  Test count claim in 2-implement.md is off by +4 (driver lane 183 → actual 187)

- Severity: medium
- Area: docs
- Evidence: `2-implement.md` T6 table claims `driver 183` and combined `1527 tests`. Actual: driver 187, combined 1531. The Plan 0006 close baseline was likely 1502 (not 1498 as stated in 1-plan.md section 6), meaning either Plan 0006's reported baseline was slightly stale, or the driver had a few tests added between Plan 0006 close and Plan 0007 Stage 1 approval.
- Impact: Purely documentary. All tests pass. The count is higher than claimed (safe direction).
- Suggested disposition: fix-in-stage-4

### F-3  2-implement.md lists `agents-json.d.ts` as a changed marketplace file but it was not actually modified

- Severity: low
- Area: docs
- Evidence: `2-implement.md` "Marketplace payload" section lists `marketplace/.../dist/agents-json.d.ts — sync of source change (T2)`, but `git diff 3058b74..9ac7742 -- marketplace/.../agents-json.d.ts` is empty. The T2 change added string literals to a private `const` array, which does not affect the TypeScript declaration output.
- Impact: Purely documentary. No functional impact.
- Suggested disposition: fix-in-stage-4

## Out-of-scope deferrals

- **G1 — Dynamic workflows**: Correctly deferred to Plan 0008. Blocked on Claude Code >= v2.1.154 (local is v2.1.153).
- **G7-G10, G13**: LOW priority items correctly deferred to backlog.
- **G11-G12**: Correctly noted as not actionable from plugin side (Codex 0.136.0 limitation).
- **Probe code duplication**: Each of the three new probes independently calls `execFile('claude', ['--version'])`. A future refactor could share the version-fetch call. This is not a Plan 0007 bug — it is clean, explicit code that could be DRY-ed in a future plan if more probes are added.

## Approval gate

**Stage 4 can begin.** All three findings are medium or low severity documentation issues, all fixable in the polish pass. No correctness, security, or functional issues found. All gates green. All safety invariants preserved. Marketplace packaging is correct and byte-identical.
