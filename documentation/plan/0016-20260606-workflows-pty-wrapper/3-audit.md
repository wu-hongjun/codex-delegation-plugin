# Plan 0016 Stage 3 — Audit

Audited commit: `c900050` (Plan 0016 Stage 2)
Audited on: 2026-06-06
Auditor: `oh-my-claudecode:critic` (Opus, fresh-context subagent)

## Verdict

**ready-for-polish (REVISE)** — Architecture is sound (the pivot from PTY to CLI-only was empirically well-justified). All mechanical work (count bumps, marketplace mirrors, tests, safety invariants) is precise. **However, 2 MAJOR findings in the drill-in enrichment path** that dispatcher unit tests didn't catch.

**First non-clean audit since Plan 0014.** Plans 0009-0011, 0013, 0015 closed zero-finding; Plans 0012, 0014 closed with 1 MINOR each; Plan 0016 closes with 2 MAJOR (resolved in Stage 4 polish).

## Audit methodology

Files read (15+); commands run (20+, all exit 0):

| Command | Result |
|---|---|
| `git rev-parse HEAD` | `c900050` |
| Tags `plan-0004-pre-cutover` / `v0.2.0` | `7d9b5f1` / `ea595e1` (unchanged) |
| `git diff 4569593..c900050 -- packages/runtime/ packages/driver-claude-code/ .github/ tools/bench/ docs/plan/0004-* through 0015-*` | Empty (all frozen dirs preserved) |
| `git diff 4569593..c900050 -- packages/plugin-codex/README.md` cost paragraph | Empty (byte-identical) |
| `node tools/package-marketplace.mjs --check` | exit 0; **26 derived (was 24)** |
| `node tools/smoke-marketplace.mjs --help` | 14 skills (was 13) |
| `npm test` (4 lanes) | 1528 (mock 68 + runtime 173 + driver 187 + plugin 1100), 0 fail |
| `cc workflows --help` | shows new row + flag matrix |
| `cc workflows` (live) | exit 0, "No workflow sessions found" |
| `cc workflows --json` (live) | exit 0, `{"sessions":[]}` (parseable JSON) |
| Diff source vs mirror for new files | byte-identical |
| Straggler grep `\b13\b|\bthirteen\b|\b24 derived\b|\btwelve\b|\b25 derived\b` | zero actionable |

## Pivot justification soundness

OQ-A artifact contains the empirical evidence:
- Raw ANSI bytes captured via node-pty
- Human-rendered panel interpretation
- The literal empty-state text `"No dynamic workflows in this session."`
- Comparison: bg sessions started via `cc workflow --bg` do NOT appear in the panel; only sessions initiated from within the current interactive TUI via the `ultracode:` keyword

The pivot decision is empirically grounded, not speculative. The CLI-only architecture directly serves Codex users (their `cc workflow` jobs), not the wrong audience (in-TUI sessions).

## Contract compliance vs 1-plan.md

| Task | Outcome | Status | Evidence |
|---|---|---|---|
| T1 ANSI capture + sketch | A-partial with pivot | complete | OQ-A + OQ-B artifacts |
| T2 lib (PIVOTED: was PTY harness, now CLI inspector) | shipped | complete | `workflows-inspector.mjs` |
| T3 skill + dispatcher | shipped | complete | `claude-workflows/SKILL.md` + cmdWorkflows |
| T4 marketplace + count bumps | 13→14 / 24→26 | complete | 7 files coherent |
| T5 tests | shipped | complete | 8 new files |
| T6 gates + CI | green | complete | local + CI green |

## Safety invariants

| Invariant | Status |
|---|---|
| Cost paragraph byte-identical | PASS |
| `plan-0004-pre-cutover` at `7d9b5f1` | PASS |
| `v0.2.0` at `ea595e1` | PASS (no retag) |
| Plan 0005 status `deferred` | PASS |
| Frozen dirs (bench, .github, plan 0004-0015, runtime, driver/src) | PASS (empty diff vs `4569593`) |
| **`packages/runtime/**` untouched** | PASS — CLI pivot avoided the planned runtime exception |
| **`packages/driver-claude-code/**` untouched** | PASS — CLI pivot avoided the planned driver exception |
| Skill count: 14; allowlist: 26; plugin version: `0.2.0` | preserved |

## Findings

### MAJOR-1 — `_sanitizeCwd` strips leading hyphen (drill-in enrichment silently broken)

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs:180-182`:
```js
function _sanitizeCwd(cwd) {
  return cwd.replace(/\//g, '-').replace(/^-/, '');
}
```

The `.replace(/^-/, '')` strips the leading hyphen. Claude's actual project directory format under `~/.claude/projects/` uses the leading hyphen (e.g., `/Users/foo/bar` → `-Users-foo-bar`). The function's own JSDoc documents the correct format but the implementation contradicts it.

**Impact**: `inspectWorkflow()` resolves to a non-existent directory. `_readSubagentMeta()` and `_readPhaseRecords()` silently return `[]`. Every `cc workflows <jobId>` drill-in shows "Subagents: none recorded" even when metadata files exist on disk — the enrichment feature (the entire point of drill-in vs `cc status`) is a no-op.

**Fix proposal**: remove `.replace(/^-/, '')`.

### MAJOR-2 — `--all` flag documented but never wired (dead flag)

`packages/plugin-codex/skills/claude-workflows/SKILL.md` and `printUsage` in `cc.mjs` both document `--all`. But `cmdWorkflows` (cc.mjs:2104-2181) never reads `flags['all']`. `listWorkflows` (workflows-inspector.mjs:42) destructures it as `_all` (unused, underscore-prefixed).

**Impact**: `cc workflows --all` has no behavioral difference from `cc workflows` — the flag is silently ignored.

**Fix proposal**: in `cmdWorkflows` list-path: `const showAll = Boolean(flags['all']); await listWorkflows({ all: showAll, env: process.env });`. In `listWorkflows`: filter by `cwd` match when `all === false`.

### MINOR (not fixed in Stage 4 — backlog candidates)

- MINOR-1: `_resolveProjectDir` JSDoc claims a fallback that doesn't exist. Should be docs-only fix.
- MINOR-2: `inspectWorkflow` test coverage gap — no test against a real filesystem tree with subagent meta files.
- MINOR-3: OQ-B PTY architectural-sketch artifact is now superseded but retained. Documented as superseded in 2-implement.md.
- MINOR-4: 1-plan.md projected 24→25 but actual was 24→26. Documented in 2-implement.md.

## Approval gate

**Stage 4 polish REQUIRED** for both MAJOR findings. After polish, plan can proceed to Stage 5.

The architecture is sound; the bugs are localized to the drill-in enrichment path. A redo is not warranted — polish is the right disposition.
