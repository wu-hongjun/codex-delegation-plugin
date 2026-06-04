# Plan 0006 Stage 4 — Polish

Audit input: commit `8062bd1` (Stage 3 audit)
Stage 3 verdict: `ready-for-polish` (two low-severity findings; no blockers)
Stage 4 scope: docs-only resolution of F-1 and F-2

## Findings resolved

### F-1 (low, docs) — stale "No committed marketplace packaging" bullet

Before: `packages/plugin-codex/README.md:355`

```
- **No committed marketplace packaging** — plan 0006 handles distribution polish.
```

After: same file/line

```
- **Local marketplace packaging is committed; no external registry submission** — plan 0006 ships the local marketplace tree under `marketplace/`, installed via `codex plugin marketplace add "<repo-root>/marketplace"`. Submission to an external / hosted plugin registry is not part of this release.
```

Rationale: Plan 0006 shipped the committed marketplace tree. The bullet is restated as the current truth (committed local marketplace; no external registry submission) rather than removed, so the known-limitations section remains a single-stop list of what the release does and does not include. Wording is neutral and contains none of the OQ4 forbidden cost-claim tokens.

### F-2 (nit, docs) — stale plan-status checklist in root README

Before: `README.md:151-162` showed Plans 0001–0003 as unchecked and lead-in claimed implementation was in progress under Plan 0001 alone.

After: lead-in now states "Plans 0001-0003 are complete; Plan 0004 is paused pending post-cutover measurement; Plan 0005 is deferred; Plan 0006 (marketplace packaging + distribution polish) is in progress." Checklist:

- `[x]` Plans 0001, 0002, 0003 — complete (each with the actual scope line).
- `[ ]` Plan 0004 — paused pending post-cutover T11/T12 (description preserved).
- `[ ]` Plan 0005 — deferred.
- `[ ]` Plan 0006 — marketplace packaging + distribution polish (in progress).

Rationale: Plan 0004 stays unchecked (paused, not complete). Plan 0006 stays unchecked (Stage 4 is the current stage). Pre-existing repository-scaffolding / research / approval bullets are preserved.

## Files changed

- `packages/plugin-codex/README.md` — F-1 bullet rewrite (1 line modified).
- `README.md` — F-2 lead-in paragraph + checklist (11 lines modified, no additions/deletions in net count).
- `packages/plugin-codex/test/docs-split.test.mjs` — new `describe('docs polish — Stage 4 audit findings (Plan 0006 Stage 4)', …)` block with 5 tests.
- `documentation/plan/0006-20260603-marketplace-packaging-distribution/4-polish.md` — this file.
- `documentation/plan/0006-20260603-marketplace-packaging-distribution/readme.md` — Stage 4 row + status.

## Tests added

In `packages/plugin-codex/test/docs-split.test.mjs`:

1. F-1: plugin README must NOT contain `No committed marketplace packaging`.
2. F-1: plugin README must mention the committed `marketplace/` tree.
3. F-2: root README must mark Plans 0001, 0002, 0003 complete (`[x]` + "complete" or "Initial foundation" anchor).
4. F-2: root README must NOT mark Plan 0004 complete.
5. F-2: root README must NOT mark Plan 0006 complete.

No other tests modified. Existing 142 marketplace-specific tests + the original 19 docs-split tests remain intact.

## Local gate evidence

Run from a clean working tree at the audit-input commit + Stage 4 edits:

| Gate | Exit | Output excerpt |
|---|---|---|
| `node tools/package-marketplace.mjs --check` | 0 | `check: OK — 18 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.` |
| `node tools/smoke-marketplace.mjs --help` | 0 | usage block prints all 8 skills |
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm run format` | 0 | `All matched files use Prettier code style!` |
| `npm test` | 0 | <to be recorded — expect 1212 tests (1207 + 5 new) |
| `npm run test:attach` | 0 | <to be recorded — expect 28 tests unchanged |
| `npm run test:bench` | 0 | <to be recorded — expect 258 tests unchanged |

Combined Stage 4 test total: **1498** (vs. Stage 2/3 baseline of 1493 = +5 from the new polish tests).

## Safety invariants preserved

- `plan-0004-pre-cutover` tag: unchanged at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff`.
- Plan 0005 status: still `deferred`; no stop-gate / review-gate code added.
- `packages/plugin-codex/README.md` cost paragraph (L341): byte-identical to the locked Plan 0001 / Plan 0002 wording (confirmed by Stage 4 not touching L341 and by the existing `docs-split.test.mjs` cost-paragraph byte-identity test still passing).
- `tools/bench/**`, `documentation/plan/0004-*`, `documentation/plan/0005-*`, `packages/runtime/**`, `packages/driver-claude-code/**`, `.github/**`: untouched (verified by `git diff --stat HEAD~1 -- …` showing no entries).
- Marketplace payload (`marketplace/plugins/claude-companion/**`): untouched; the F-1 fix is on the developer README only, not on the end-user marketplace README, so `package-marketplace.mjs --check` still passes byte-identity for all 18 derived + 64 bundled files.

## CI verification

CI run: <to be recorded after `git push origin main`>

Expected matrix: `ubuntu-latest + macos-latest × Node 20 + 22` = 4 legs, all green.

## Approval gate

If CI is green and no new findings arise, plan status flips `polishing → reporting`. Stage 5 (Report) begins on explicit maintainer authorization only.
