# Plan 0008 Stage 4 — Polish

**Audit input commit**: `48dbb91` (Plan 0008 Stage 2)
**Stage 3 verdict**: `ready-for-polish` (3 medium + 1 nit + 1 accept-as-is; 0 critical / 0 high)
**Date**: 2026-06-05
**Scope**: docs + test-name wording fixes for F-1 / F-2 / F-3 / F-4. F-5 accepted as-is.

## Findings resolved

### F-1 (medium, docs) — stale "eight-skill" / "other seven" in RELEASING.md

Before:
- `documentation/RELEASING.md:235` — `the eight-skill discovery check must be`
- `documentation/RELEASING.md:254` — `The other seven skills must not return`

After:
- L235 — `the nine-skill discovery check must be`
- L254 — `The other eight skills must not return`

Rationale: the bullet list immediately below at L240-248 has 9 entries (Plan 0008 added `$claude-workflow`); the surrounding prose was already inconsistent with the list. Stage 4 brings them into agreement.

### F-2 (medium, tests) — `marketplace-releasing.test.mjs` SKILL_NAMES missing `claude-workflow`

Before: `packages/plugin-codex/test/marketplace-releasing.test.mjs:36-45` had 8 entries; test comments said "all 8 skills".
After: SKILL_NAMES has 9 entries (added `'claude-workflow'`); comments say "all 9 skills".

Rationale: the iteration at L211 (`for (const name of SKILL_NAMES)`) is the contract that proves RELEASING.md enumerates every skill. With only 8 listed in the test, a future regression that omitted `$claude-workflow` from RELEASING.md would NOT be caught. Stage 4 closes the coverage gap.

### F-3 (medium, docs/UX) — `--help` flag descriptions omit `workflow`

Before: `packages/plugin-codex/scripts/claude-companion.mjs:1961-1969` listed `workflow`-applicable flags with parentheticals that excluded `workflow`:
- `--yes (delegate/followup/review/adversarial-review)` — missing workflow
- `--name (delegate only)` — missing workflow
- `--model (delegate, adversarial-review)` — missing workflow
- `--effort (delegate, adversarial-review)` — missing workflow
- `--permission-mode (delegate, adversarial-review)` — missing workflow
- `--add-dir (delegate only; repeatable)` — missing workflow
- `--mcp-config (delegate only)` — missing workflow
- `--allow-edit ... rejected by review and adversarial-review` — missing workflow rejection

After: every applicability parenthetical lists `workflow`; `--allow-edit` rejection list includes `workflow`. Specifically:
- `--yes (delegate/workflow/followup/review/adversarial-review)`
- `--name (delegate, workflow)`
- `--model (delegate, workflow, adversarial-review)`
- `--effort (delegate, workflow, adversarial-review)`
- `--permission-mode (delegate, workflow, adversarial-review)`
- `--add-dir (delegate, workflow; repeatable)`
- `--mcp-config (delegate, workflow)`
- `--allow-edit ... rejected by review, adversarial-review, and workflow`

Rationale: the flag parsing in `cmdWorkflow` (via the shared `_runDelegateCore`) already accepts all of these flags except `--allow-edit`. The `--help` text was simply out of sync. No behavioral change.

### F-4 (nit, tests) — stale "all 8 skill" comments in `docs-split.test.mjs`

Before: `packages/plugin-codex/test/docs-split.test.mjs:158-159` had `// T12-3: Skills section lists all 8 skills with $-prefix` and `it('Skills section enumerates all 8 skill names...')`.
After: "all 9 skills" / "all 9 skill names". The `SKILL_NAMES` array already had 9 entries; only the cosmetic text was stale.

### F-5 (nit, docs/UX) — `--help` mentions `ultracode` keyword

Accepted as-is. The `--help` text at `claude-companion.mjs:1949` reads `Start a Claude Code dynamic workflow (triggers ultracode planning)`. Per the Stage 3 audit's own suggestion, this is developer-facing CLI help and the `ultracode` reference is useful context for anyone debugging the dispatcher. Plan 0008 T5's "no `ultracode:` keyword leakage" constraint was scoped to README surfaces, which are honored. No edit.

## Files changed in Stage 4

- `documentation/RELEASING.md` — L235 + L254 wording bumps
- `packages/plugin-codex/test/marketplace-releasing.test.mjs` — SKILL_NAMES + comments
- `packages/plugin-codex/test/docs-split.test.mjs` — 2 comment/test-name bumps
- `packages/plugin-codex/scripts/claude-companion.mjs` — 8 line edits in `printUsage`
- Marketplace derived sync: `marketplace/plugins/claude-companion/scripts/claude-companion.mjs` (auto-synced by `package-marketplace --write` after the source change)
- `documentation/plan/0008-*/3-audit.md` — committed alongside polish (the audit report itself)
- `documentation/plan/0008-*/4-polish.md` — this file
- `documentation/plan/0008-*/readme.md` — Stage 3 row complete; Stage 4 row in progress → complete pending CI

## Tests added

Zero new test cases (one new SKILL_NAMES entry in marketplace-releasing.test.mjs effectively extends per-skill coverage; comment-only changes in docs-split.test.mjs). Test count delta: 0.

## Local gates (post-fix)

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 20 derived files (unchanged shape) |
| `node tools/smoke-marketplace.mjs --help` | exit 0; 9 skills (unchanged) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` | 1286 tests, 0 fail (verified — the dispatcher --help test parses the new applicability strings unchanged because they're freeform within the existing usage line shape) |
| `npm run test:attach` | 28, 0 fail |
| `npm run test:bench` | 258, 0 fail |
| **Combined** | **1572 tests, 0 fail** |

## Safety invariants preserved

- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged)
- Plan 0005 status `deferred` (unchanged)
- `packages/plugin-codex/README.md` L341 cost paragraph byte-identical
- `tools/bench/`, `documentation/plan/0004-*/`, `documentation/plan/0005-*/`, `documentation/plan/0006-*/`, `documentation/plan/0007-*/`, `.github/`, `packages/runtime/`, plugin source behavior all untouched
- T9.5 cache-execution invariant preserved (marketplace `claude-companion.mjs` resynced; `--check` exit 0)

## CI verification

- **Stage 2 (`48dbb91`)**: CI run [`27027782640`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27027782640) — `success` on all 4 matrix legs.
- **Stage 4**: CI run recorded after this commit is pushed.

## Approval gate

If Stage 4 CI is green, plan status flips `polishing → reporting`. Stage 5 (Report) starts under the same cycle authorization the maintainer pre-issued for Plan 0008.
