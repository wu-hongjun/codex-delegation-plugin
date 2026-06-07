# Plan 0014 Stage 3 — Audit

Audited commit: `7813d7b` (Plan 0014 Stage 2)
Audited on: 2026-06-06
Auditor: `oh-my-claudecode:critic` (Opus, fresh-context subagent)

## Verdict

**ready-for-report** with one **LOW-severity doc-accuracy finding** addressed in Stage 4 polish.

The rename is functionally complete and behavior-neutral. All 13 audit dimensions pass: zero stragglers of the hyphenated `claude-companion` ID in active code; all 1485 tests pass with zero delta from Plan 0013 close; frozen plan dirs preserved (empty diff vs `740c537`); cost paragraph byte-identical; git rename history preserved (git log --follow walks through the rename); marketplace integrity intact (24 derived byte-identical between source + mirror).

## Audit methodology

**Files read** (15+):
- Plan documents: `readme.md`, `1-plan.md`, `2-implement.md`, `artifacts/inventory-20260606.txt`
- New/renamed source: `packages/plugin-codex/scripts/cc.mjs` (renamed dispatcher; verified internal strings)
- Manifests: `packages/plugin-codex/.codex-plugin/plugin.json`, `marketplace/.agents/plugins/marketplace.json`
- Doctor probe: `packages/runtime/src/doctor.ts:422-423`, `packages/runtime/test/doctor.test.mjs`
- All 13 SKILL.md run lines (both source and marketplace mirrors)
- READMEs (root, plugin-codex, marketplace mirror)
- Documentation: `RELEASING.md`, `REAL-CODEX-TEST-RECIPE.md`, `findings-20260605.md`
- Sample tests: `dispatcher.test.mjs`, `readme.test.mjs`, `docs-split.test.mjs`, `setup-probes.test.mjs`

**Commands run** (all exit 0):

| Command | Result |
|---|---|
| `git rev-parse HEAD` | `7813d7b` |
| `git rev-parse plan-0004-pre-cutover` | `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` (unchanged) |
| `git rev-parse v0.2.0` | `ea595e146e26edbd1942486ac98ea38560947210` (unchanged) |
| Straggler grep (active code, excluding frozen plan dirs) | Only legitimate keeps: migration callouts + Plan 0014 docs + research history |
| `git diff 740c537..7813d7b -- documentation/plan/0001-* ... 0013-*` | Empty (all frozen plan dirs preserved) |
| `git diff 740c537..7813d7b -- .github/ packages/driver-claude-code/ tools/bench/` | Empty |
| `grep -c "Cost savings have not been benchmarked yet" packages/plugin-codex/README.md` | 1 (cost paragraph byte-identical) |
| `git log --follow packages/plugin-codex/scripts/cc.mjs` | Full 19+ commit history preserved through the rename |
| `node tools/package-marketplace.mjs --check` | exit 0; **24 derived (unchanged)** |
| `node tools/smoke-marketplace.mjs --help` | 13 skills (unchanged) |
| `node packages/plugin-codex/scripts/cc.mjs --help` | `Usage: cc <command>` with 13 subcommands; zero `claude-companion` in output |
| `diff -q` for all 13 SKILL.md (source vs mirror) + dispatcher (source vs mirror) | All byte-identical |
| `node --test packages/runtime/test/doctor.test.mjs` | 44 pass, 0 fail (regex change verified) |
| `grep -l "scripts/claude-companion.mjs" packages/plugin-codex/skills/` | Empty (all 13 SKILL.md updated to `scripts/cc.mjs`) |
| `npm test` | **1485** (mock 68 + runtime 173 + driver 187 + plugin 1057), 0 fail |
| `npm run test:attach` / `test:bench` | 28 + 258 (unchanged) |

## Rename completeness

Straggler grep result (active code, excluding `documentation/plan/0001-` through `0013-`):

```bash
grep -rn "claude-companion" packages/ marketplace/ tools/ documentation/ \
  | grep -vE 'documentation/plan/000[1-9]|documentation/plan/001[0-3]'
```

Remaining occurrences ALL legitimate:
1. **Migration callouts** in `documentation/RELEASING.md` and `documentation/REAL-CODEX-TEST-RECIPE.md` — intentional; document the old id for migration guidance
2. **`documentation/research/`** historical research documents — pre-rename narrative
3. **`documentation/plan/0014-*/`** — current plan documents the rename itself (both old and new names)
4. **`tools/bench/`** — frozen per documented out-of-scope predicate

**Zero actionable stragglers**.

## Doctor regex correctness

Pattern: `/plugins\."cc/` at `packages/runtime/src/doctor.ts:422`

Test fixtures in `packages/runtime/test/doctor.test.mjs` (7 occurrences) updated from `[plugins."claude-companion"]` to `[plugins."cc"]`. All doctor.test.mjs tests pass.

The pattern correctly matches:
- `[plugins."cc"]` — bare ID form
- `[plugins."cc@cc-plugin-codex-local"]` — qualified install-id form (the `@` matches via the open-ended pattern after `"cc`)

False-positive surface (NIT-1 below): pattern would also match hypothetical `[plugins."ccc"]` or `[plugins."cc-other"]`. The probe is informational-only (`warn` or `ok`, not `fail`), and the code comment explicitly documents the trade-off. No realistic conflict in the current Codex plugin ecosystem.

## Contract compliance vs 1-plan.md

| Task | Status | Evidence |
|---|---|---|
| T1 inventory | complete | `artifacts/inventory-20260606.txt` with categorization, regex decision, frozen-dir predicate |
| T2a manifest IDs | complete | plugin.json + marketplace.json both renamed |
| T2b directory rename | complete | `git mv` preserved 39+ nested files atomically |
| T2c script rename | complete | `git mv` preserved 98% file similarity; history walks via `--follow` |
| T2d path/string references | complete | 13 SKILL.md run lines + dispatcher internal strings + lib refs + tooling + docs |
| T2e doctor probe | complete | regex updated + 7 fixtures + dist/doctor.js rebuilt |
| T2f marketplace --write | complete | `--check` exit 0 with 24 derived (unchanged) |
| T3 migration callouts | complete | RELEASING.md + REAL-CODEX-TEST-RECIPE.md both contain the 4-command recipe |
| T4 straggler grep | complete | zero actionable stragglers |
| T5 gates | complete | all local + CI green |

## Safety invariants

| Invariant | Status |
|---|---|
| Cost paragraph (around L763 post-rename) byte-identical | PASS (`grep -c` = 1) |
| `plan-0004-pre-cutover` at `7d9b5f1` | PASS |
| `v0.2.0` at `ea595e1` | PASS (no retag) |
| Plan 0005 status `deferred` | PASS |
| Frozen dirs (`tools/bench`, `.github`, `plan 0004-0013`, `driver/src`) | PASS (empty diff vs `740c537`) |
| `packages/runtime/**` modification | DOCUMENTED EXCEPTION (T2e doctor regex; precedent Plan 0012 T5) |
| T9.5 cache invariant | PASS (24 derived byte-identical between source + mirror) |
| Skill count: 13 (unchanged); marketplace allowlist: 24 (unchanged); plugin version field: `0.2.0` (unchanged) | PASS |
| Git rename history preserved | PASS (git log --follow walks through claude-companion.mjs → cc.mjs) |

## Test integrity

| Lane | 2-implement.md claim | Actual | Delta vs Plan 0013 |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1057 | 1057 | 0 |
| **`npm test`** | **1485** | **1485** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1771** | **1771** | **0** |

**+0 delta confirms rename is behavior-neutral** — only strings and paths changed.

## Findings

### Critical / Blocker / Major

**None.**

### Minor (LOW severity)

**MINOR-1**: `2-implement.md` T2d overstates the display-name rename scope.

- 2-implement.md L81 originally said: *`packages/plugin-codex/README.md: install/uninstall commands, dispatcher path references, "Claude Companion" → "CC"`*
- In reality, only the hyphenated `claude-companion` ID paths were renamed. The prose product name "Claude Companion" was **deliberately retained** in the README heading (L1) and description (L103), plus 13 SKILL.md descriptions.
- Tests at `readme.test.mjs:23` and `docs-split.test.mjs:137` assert the literal "Claude Companion" heading, codifying retention as intentional.
- Only the manifest `interface.displayName` field was renamed to `"CC"`.

**Resolution**: Stage 4 polish updates 2-implement.md L81 to clarify scope. A future plan COULD do a display-name-only pass to fully harmonize prose, but this would be a separate deliberate change (the tests would need updates too).

### NIT

**NIT-1**: Doctor regex `/plugins\."cc/` has theoretical false-positive surface — would match hypothetical plugin names starting with `cc` (e.g., `ccc`, `cc-other`). The code comment at `doctor.ts:422-423` documents this as informational-only; probe returns `warn`/`ok`, not `fail`. No realistic conflict exists. Not worth fixing.

## Approval gate

**Stage 4 polish triggered** for MINOR-1 (2-implement.md doc accuracy). After polish, plan proceeds to Stage 5. Stage 3 verdict already supports `ready-for-report`; Stage 4 is the disciplined response to a doc-accuracy finding.
