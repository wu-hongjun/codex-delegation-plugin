# Plan 0014 Stage 4 — Polish

**Status**: complete
**Date**: 2026-06-06
**Audit verdict**: `ready-for-report` (with MINOR-1 finding addressed here)

## Scope

Single LOW-severity doc-accuracy finding from Stage 3 audit:

**MINOR-1** — `2-implement.md` T2d line about the plugin README rename overstated the display-name scope. The hyphenated `claude-companion` ID paths were renamed, but the prose product name "Claude Companion" was **deliberately retained** in the README heading (L1), description (L103), and 13 SKILL.md descriptions. Tests at `readme.test.mjs:23` and `docs-split.test.mjs:137` codify the retention as intentional.

## Fix

### Doc-only change

`documentation/plan/0014-20260606-plugin-rename-cc/2-implement.md` — updated the T2d bullet for the plugin README:

Before:
```
- packages/plugin-codex/README.md: install/uninstall commands, dispatcher path references, "Claude Companion" → "CC". **Cost paragraph byte-identical ...**
```

After:
```
- packages/plugin-codex/README.md: install/uninstall commands; dispatcher path references; hyphenated `claude-companion` ID strings updated to `cc`. **Cost paragraph byte-identical ...** *Note*: the prose product name "Claude Companion" (heading + description) was **deliberately retained** — tests at `readme.test.mjs:23` and `docs-split.test.mjs:137` assert the heading, codifying this as intentional. Only the manifest `displayName` field was renamed to "CC". A future display-name-only pass could harmonize prose if desired.
```

The clarification:
- Documents that prose retention was deliberate
- Names the specific tests that codify the retention
- Notes the manifest `displayName` field IS "CC"
- Flags a future display-name-only pass as a candidate

### No source code change

The functional rename is correct. No source code, manifest, test, or other artifact needed updating.

### Gates after polish

All gates still pass (no functional change):

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 24 derived (unchanged) |
| `npm test` | 1485 (unchanged) |
| `test:attach` + `test:bench` | 28 + 258 (unchanged) |
| Combined | **1771** (unchanged) |

## Files modified in Stage 4

- `documentation/plan/0014-20260606-plugin-rename-cc/2-implement.md` (single bullet clarified)

## Safety invariants preserved

Same as Stage 2 — no functional change. All frozen dirs untouched; tags unchanged; cost paragraph byte-identical; skill count 13; allowlist 24.

## Outcome

MINOR-1 resolved as a doc-accuracy clarification in 2-implement.md. Plan 0014 progresses to Stage 5 reporting.

## Backlog candidate: prose display-name harmonization

If a future plan wants to drop "Claude Companion" prose in favor of "CC" everywhere, it would touch:
- `packages/plugin-codex/README.md` heading + description (2 locations)
- 13 SKILL.md descriptions
- Test assertions in `readme.test.mjs:23` and `docs-split.test.mjs:137`
- Marketplace mirrors via `--write`

Scope: ~17 file touches; no functional behavior change. Could be a quick docs-only plan. Not in Plan 0014's scope; not blocking.
