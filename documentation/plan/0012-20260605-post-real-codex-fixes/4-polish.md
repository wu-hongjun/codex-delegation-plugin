# Plan 0012 Stage 4 — Polish

**Status**: complete
**Date**: 2026-06-06
**Audit verdict**: `ready-for-report` (with MINOR-1 finding addressed here)

## Scope

Single MINOR cosmetic finding from Stage 3 audit:

**MINOR-1** — `cmdAdversarialReview`'s freeform-prompt hint message was a verbatim copy-paste from `cmdReview`:
- Label said `[review]` instead of `[adversarial-review]`
- Body said `$claude-review takes a <jobId-or-prefix>` instead of `$claude-adversarial-review takes a <jobId-or-prefix>`

## Fix

### Source change

`packages/plugin-codex/scripts/claude-companion.mjs:1702` — hint message rewritten to use the correct skill name and label:

Before:
```
'[review] Hint: $claude-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?\n',
```

After:
```
'[adversarial-review] Hint: $claude-adversarial-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?\n',
```

The `cmdReview` hint at L1350 was left unchanged (it was already correct).

### New regression test

Added a parallel test in `packages/plugin-codex/test/dispatcher.test.mjs` mirroring the existing T8 `cmdReview` test, but targeting `cmdAdversarialReview`:

- describe: `adversarial-review with freeform prompt emits its own labeled jobId hint (Plan 0012 polish)`
- assertions:
  1. exit code 1
  2. output contains `[adversarial-review]` (catches the previous mislabel regression)
  3. output contains `$claude-adversarial-review takes a <jobId-or-prefix>` (catches the previous body-text regression)

**Net test delta**: +1 test (1019 → 1020 in `test:plugin`; 1447 → 1448 in `npm test` chain; 1733 → 1734 combined).

### Marketplace resync

`node tools/package-marketplace.mjs --write` resynced the marketplace mirror at `marketplace/plugins/claude-companion/scripts/claude-companion.mjs`. `--check` exit 0 with 23 derived files (unchanged).

## Gates after polish

| Gate | Result |
|---|---|
| Build (`tsc --build`) | exit 0 |
| `--check` | exit 0; 23 derived (unchanged) |
| smoke `--help` | exit 0; 12 skills (unchanged) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` | **1448** (mock 68 + runtime 173 + driver 187 + plugin **1020**), 0 fail |
| `npm run test:attach` | 28, 0 fail (unchanged) |
| `npm run test:bench` | 258, 0 fail (unchanged) |
| **Combined** | **1734** (+1 from Stage 2 close at 1733) |

## Files modified in Stage 4

Source:
- `packages/plugin-codex/scripts/claude-companion.mjs` (L1702 hint label fix)

Tests:
- `packages/plugin-codex/test/dispatcher.test.mjs` (+1 regression test for adversarial-review labeled hint)

Marketplace mirror (derived via `--write`):
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs`

## Safety invariants preserved

Same invariants as Stage 2 — all preserved. No frozen-dir touches; cost paragraph byte-identical; tags unchanged; skill count 12; allowlist 23.

## Outcome

MINOR-1 resolved. Test count: 1733 → **1734** (+1). Plan 0012 progresses to Stage 5 reporting.
