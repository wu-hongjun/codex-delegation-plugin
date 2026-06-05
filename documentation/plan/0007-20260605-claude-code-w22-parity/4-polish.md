# Plan 0007 Stage 4 — Polish

**Audit input commit**: `9ac7742` (Plan 0007 Stage 2)
**Stage 3 verdict**: `ready-for-polish` (3 findings, all docs-only; 0 critical / 0 high)
**Date**: 2026-06-05
**Scope**: docs-only resolution of F-1, F-2, F-3. No source code changes. No marketplace payload changes.

## Findings resolved

### F-1 (medium, docs) — stale "18 source-derived files" in RELEASING.md L141

Before: `documentation/RELEASING.md:141` — `Copy 18 source-derived files (T2-T5 allowlist)`
After: same file/line — `Copy 19 source-derived files (T2-T5 allowlist)`

Rationale: Plan 0007 T5 added `scripts/lib/claude-version.mjs` to the marketplace allowlist (18 → 19 derived files). Two occurrences in RELEASING.md (L164 + L175) were updated by `replace_all` in Stage 2, but L141's wording was "18 source-derived" instead of "18 derived", so the replace pattern missed it. Stage 4 corrects the third occurrence with a targeted edit.

Verified: `grep -n '18 source-derived\|18 derived' documentation/RELEASING.md` returns no hits after the fix.

### F-2 (medium, docs) — 2-implement.md test count claim is off by +4

Before: `2-implement.md` T6 table claimed `driver 183`, `npm test (4 lanes) 1241`, `Combined 1527`.
After: `driver 187`, `npm test (4 lanes) 1245`, `Combined 1531`.

Rationale: The Stage 3 audit ran `npm test` independently and reported 4 more driver-lane tests than the Stage 2 implementation log claimed. Cross-check: Plan 0006's recorded close baseline was 1498. Plan 0007 actual current total is 1531 = baseline 1502 + 29 new tests, OR baseline 1498 + 33 new tests where 4 came from a non-Plan-0007 source between Plan 0006 close and Plan 0007 Stage 1 approval. Either way, the documented count was wrong by +4 in a safe (over-passing) direction. Stage 4 records the actual numbers and a brief audit-citation note in 2-implement.md.

### F-3 (low, docs) — 2-implement.md falsely listed `agents-json.d.ts` as a marketplace-synced file

Before: 2-implement.md "Marketplace payload" section listed both `agents-json.js` and `agents-json.d.ts` as files re-synced by T5.
After: only `agents-json.js` is listed; a parenthetical note explains that the `.d.ts` did not change because T2's edit added string literals to a private `const` (no impact on TypeScript declarations).

Rationale: Trivially incorrect documentation; the audit verified via `git diff 3058b74..9ac7742 -- marketplace/.../agents-json.d.ts` was empty. Stage 4 removes the stale line.

## Files changed in Stage 4

- `documentation/RELEASING.md` — F-1 fix (1 line; targeted edit)
- `documentation/plan/0007-20260605-claude-code-w22-parity/2-implement.md` — F-2 + F-3 fixes
- `documentation/plan/0007-20260605-claude-code-w22-parity/3-audit.md` — committed as part of this stage (the full Stage 3 audit report)
- `documentation/plan/0007-20260605-claude-code-w22-parity/4-polish.md` — this file
- `documentation/plan/0007-20260605-claude-code-w22-parity/readme.md` — Stage 3 row complete; Stage 4 row in progress → complete-pending-CI

## Tests added

Zero new tests. The 3 findings are documentation-only — no runtime contract to lock. Stage 3's existing F-2 test-count assertion in the audit report serves as the durable cross-check.

## Local gates (post-fix)

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 19 derived + 64 bundled + 3 synthesized + 1 marketplace-owned (unchanged from Stage 2) |
| `npm run lint` | exit 0 (no JS/TS code changed) |
| `npm run typecheck` | exit 0 (no .ts changed) |
| `npm run format` | exit 0 (no source changes) |
| `npm test` | unchanged from Stage 2 (1245 tests, 0 fail) |
| `npm run test:attach` | unchanged (28, 0 fail) |
| `npm run test:bench` | unchanged (258, 0 fail) |
| **Combined** | **1531 tests, 0 fail** |

## Safety invariants preserved

- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged)
- Plan 0005 status `deferred` (unchanged)
- `packages/plugin-codex/README.md` L341 cost paragraph byte-identical (no edits in Stage 4)
- `tools/bench/`, `documentation/plan/0004-*/`, `documentation/plan/0005-*/`, `.github/`, `packages/runtime/`, plugin source behavior all untouched
- T9.5 cache-execution invariant preserved (no marketplace payload change in Stage 4)

## CI verification

- **Stage 2 (`9ac7742`)**: CI run [`27020424248`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27020424248) — `success` on all 4 matrix legs (ubuntu-latest / Node 20, ubuntu-latest / Node 22, macos-latest / Node 20, macos-latest / Node 22).
- **Stage 4**: CI run on this commit will be recorded after the push.

## Approval gate

If CI is green on the Stage 4 commit, plan status flips `polishing → reporting`. Stage 5 (Report) starts on explicit maintainer cycle authorization (already given for the full cycle).
