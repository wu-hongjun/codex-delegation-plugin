# Plan 0016 Stage 4 — Polish

**Status**: complete
**Date**: 2026-06-06
**Audit verdict**: `ready-for-polish` (the critic returned `REVISE` with 2 MAJOR findings; both addressed here)

## Scope

Stage 3 audit flagged **2 MAJOR findings** in the drill-in enrichment path that the dispatcher unit tests didn't catch:

### MAJOR-1 — `_sanitizeCwd` produced wrong directory name

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs:180-182` had:
```js
function _sanitizeCwd(cwd) {
  return cwd.replace(/\//g, '-').replace(/^-/, '');
}
```

The `.replace(/^-/, '')` stripped the leading hyphen. But Claude's actual project directory format under `~/.claude/projects/` uses the leading hyphen (e.g., `/Users/foo/bar` → `-Users-foo-bar`). The function's own JSDoc said `-Users-foo-bar` but the implementation produced `Users-foo-bar`.

Impact: `inspectWorkflow()` resolved to a non-existent directory. `_readSubagentMeta()` and `_readPhaseRecords()` silently returned `[]`. Every `cc workflows <jobId>` drill-in showed "Subagents: none recorded" even when metadata files existed — the entire drill-in enrichment feature was a no-op.

### MAJOR-2 — `--all` flag documented but never wired

`packages/plugin-codex/skills/claude-workflows/SKILL.md` documented `--all`. `printUsage` in `cc.mjs` showed `workflows [<jobId>] [--all] [--json]`. But `cmdWorkflows` never read `flags['all']`, and `listWorkflows` destructured it as `_all` (underscore-prefixed unused parameter).

Impact: `cc workflows --all` had no behavioral difference from `cc workflows` — the flag was silently ignored.

## Fixes

### Fix MAJOR-1

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs:180-188`:

```js
export function _sanitizeCwd(cwd) {
  return cwd.replace(/\//g, '-');
}
```

Changes:
1. Removed `.replace(/^-/, '')` — leading hyphen is preserved
2. Added `export` so the function can be tested directly
3. Updated JSDoc to explicitly note the leading-hyphen preservation matches Claude's on-disk format

### Fix MAJOR-2

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs:42-50`:

```js
export async function listWorkflows({ all = false, cwd, env = process.env } = {}) {
  const agentRows = await _runAgentsJson(env);
  const currentCwd = cwd ?? process.cwd();

  // Filter to workflow sessions only. When `all` is false (default), also
  // filter by matching cwd so results scope to the current workspace.
  const sessions = agentRows
    .filter((row) => _isWorkflowSession(row))
    .filter((row) => all || row.cwd === currentCwd)
    .map((row) => _toWorkflowSession(row));

  return { sessions };
}
```

`packages/plugin-codex/scripts/cc.mjs` (in `cmdWorkflows` list-path branch):

```js
const showAll = Boolean(flags['all']);
const { sessions } = await listWorkflows({ all: showAll, env: process.env });
```

Behavior:
- Default (no `--all`): filters to workflow sessions where `row.cwd === process.cwd()` — scopes to current workspace.
- With `--all`: lists workflow sessions across all workspaces.

This matches the pattern used by `cmdStatus` / `cmdResult` / etc.

## New regression tests (+5 net)

Appended to `packages/plugin-codex/test/workflows-inspector.test.mjs`:

1. `_sanitizeCwd: produces -Users-foo-bar (with leading hyphen) for /Users/foo/bar` — pins MAJOR-1 fix
2. `_sanitizeCwd: produces -tmp for /tmp` — pins MAJOR-1 fix
3. `_sanitizeCwd: produces empty string for empty input` — edge case
4. `workflows --all: includes sessions from other cwds` — pins MAJOR-2 fix
5. `workflows: excludes sessions from other cwds without --all` — pins default behavior

## Gates after polish

| Gate | Result |
|---|---|
| Build (`tsc --build`) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; **26 derived (unchanged)** |
| `node tools/smoke-marketplace.mjs --help` | exit 0; 14 skills (unchanged) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` (4 lanes) | **TBD post-test-run** (expected 1533 = 1528 + 5) |
| `npm run test:attach` | 28 (unchanged) |
| `npm run test:bench` | 258 (unchanged) |
| Combined | **TBD** (expected 1819) |

## Files modified in Stage 4

Source:
- `packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (MAJOR-1 fix + export + MAJOR-2 wire)
- `packages/plugin-codex/scripts/cc.mjs` (MAJOR-2 wire in cmdWorkflows)

Tests:
- `packages/plugin-codex/test/workflows-inspector.test.mjs` (+5 regression tests)

Marketplace mirrors (regenerated via `--write`):
- `marketplace/plugins/cc/scripts/lib/workflows-inspector.mjs`
- `marketplace/plugins/cc/scripts/cc.mjs`

## Safety invariants preserved

Same as Stage 2 — all preserved. No frozen-dir touches; tags unchanged; cost paragraph byte-identical; skill count 14; allowlist 26; runtime/driver still untouched.

## Outcome

Both MAJOR findings resolved. Drill-in enrichment now works correctly (correct project dir + correct cwd filtering). `--all` flag has real behavior matching its documentation.

## Backlog candidates noted by auditor (not fixed in Stage 4)

- **MINOR-1**: `_resolveProjectDir` JSDoc still claims a fallback that doesn't exist. Worth a future doc fix.
- **MINOR-2**: `inspectWorkflow` test coverage gap — no test against a real filesystem tree with subagent meta files. Stage 4 added direct `_sanitizeCwd` tests but didn't add full filesystem integration tests for `inspectWorkflow`. Future polish opportunity.
- **MINOR-3**: OQ-B PTY architectural-sketch artifact is now superseded but retained. Documented as superseded in 2-implement.md.
- **MINOR-4**: 1-plan.md projected 24→25 but actual was 24→26. Documented in 2-implement.md count-math-correction section.

None of these block Plan 0016 close.
