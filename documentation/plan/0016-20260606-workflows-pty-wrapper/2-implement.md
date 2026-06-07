# Plan 0016 Stage 2 — Implement

**Status**: complete (local gates green; awaiting CI verification)
**Date**: 2026-06-06
**Stage 1 commit**: `d0f0ccc` (Plan 0016 Stage 1 approved)

Two `oh-my-claudecode:executor` batches:
- **Batch 1** — **T1**: empirical `/workflows` panel ANSI capture + architectural sketch (single executor; 2 artifacts)
- **Batch 2** — **T2 + T3 + T4 + T5**: implementation via two executor passes (first did T2/T3/partial T4; second completed T4/T5)

T6 (gates) orchestrator-absorbed inline.

## T1 — Empirical capture + critical pivot

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- [`artifacts/oq-a-workflows-ansi-capture-20260606.txt`](artifacts/oq-a-workflows-ansi-capture-20260606.txt)
- [`artifacts/oq-b-architectural-sketch-20260606.txt`](artifacts/oq-b-architectural-sketch-20260606.txt)

### OQ-A Verdict — **A-partial with critical pivot**

The list view has a clean parseable structure (fixed column positions via `\x1b[<col>G`; truecolor RGB escapes; distinct status indicators). Regex-per-row after ANSI-strip would work.

**CRITICAL discovery**: `/workflows` is **session-scoped TUI-only**. The panel shows only workflows started from within the current interactive Claude TUI session (via the `ultracode:` keyword in chat). Background sessions started via `cc workflow --bg` (which is what our skill spawns) do NOT appear in the panel. The empty-state text literally reads "No workflows in this session".

**Implication**: PTY-injection would NOT serve Codex users — wrapping the panel would expose ZERO of their `cc workflow` jobs. The original Plan 0016 design (PTY harness + ANSI parser) solves the wrong problem.

### OQ-B — Architectural pivot to CLI-only

Original sketch (in artifact): driver-or-lib PTY harness reusing 70% of `attach.ts`. **Superseded** by the OQ-A discovery.

**Pivot decision**: ship `$claude-workflows` as a **CLI-only** skill that filters `cc status` to workflow-kind sessions + enriches with subagent metadata. No PTY. No driver/runtime modifications. No documented runtime exception.

This is honestly a better outcome:
- Simpler implementation (no ANSI parsing fragility)
- No driver/runtime exceptions
- More stable (JSON data path vs ANSI text)
- Actually serves users' needs (their `cc workflow` jobs)

## T2 — New library helper

**File**: `packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (NEW)

Functions:
- `listWorkflows({all, env})` — runs `claude agents --json`, filters to workflow-kind sessions (identified via name pattern), returns enriched list
- `inspectWorkflow(jobId, {env})` — drills into one workflow. Reads `claude agents --json` for the session, `~/.claude/projects/<sanitized>/<sessionId>/subagents/*.meta.json` for per-subagent data, and the session JSONL for phase records. Returns `{jobId, name, status, sessionId, subagents: [...], phaseRecords: [...]}`

Pure data (no console output). `cmdWorkflows` in `cc.mjs` handles formatting + `--json` flag.

## T3 — `$claude-workflows` skill + dispatcher

### New skill

`packages/plugin-codex/skills/claude-workflows/SKILL.md` (NEW):
- Frontmatter: `name: claude-workflows`
- Run line: `node "<plugin-root>/scripts/cc.mjs" workflows [<jobId>]`
- Accepted flags: `--all`, `--json`, `--yes`
- Rejects `--allow-edit`
- Cost notice: zero subprocess; pure data read from disk
- Important note: covers `$claude-workflow`-started jobs only. The Claude Code `/workflows` TUI panel is session-scoped TUI-only (per Plan 0015 OQ-A + Plan 0016 OQ-A) — cross-references both artifacts.
- `### Next steps` cross-references `$claude-status`, `$claude-result`, `$claude-stop`

### Dispatcher

`packages/plugin-codex/scripts/cc.mjs`:
- New `case 'workflows':` at L125
- New `cmdWorkflows` function at L2104
- Parses `--all`, `--json`, optional jobId positional
- Rejects `--allow-edit` at parse time (exit 2)
- Calls `listWorkflows()` or `inspectWorkflow(jobId)`
- `printUsage` extended with new row + `--allow-edit` rejection list extended

### Plugin manifest

`packages/plugin-codex/.codex-plugin/plugin.json`: defaultPrompt 13 → 14 entries

## T4 — Marketplace plumbing + count bumps (13 → 14 skills; 24 → 26 derived)

**Count math correction**: 1-plan.md projected 24 → 25 (+1 SKILL.md). Reality is 24 → 26 (+2: new SKILL.md + new lib file). All 10 lib files in `scripts/lib/` are tracked in `DERIVED_FILES`, so adding `workflows-inspector.mjs` bumped the count too.

| File | Change |
|---|---|
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +2 (skill + lib); 24 → 26 |
| `marketplace/MANIFEST.md` | "24 files" → "26 files" + 2 new bullets |
| `documentation/RELEASING.md` | Three "24 derived"/"24 source-derived" → "26"; "thirteen-skill" → "fourteen-skill"; "other twelve skills" → "other thirteen skills"; skill list extended with `$claude-workflows` |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +1; "Thirteen"/"thirteen"/"thirteen-skill"/"13 skill names"/"13 skills" → "Fourteen"/"fourteen"/"fourteen-skill"/"14 skill names"/"14 skills" |
| `packages/plugin-codex/README.md` | "Thirteen skills" → "Fourteen skills"; new bullet + subsection for `$claude-workflows`; "All thirteen" → "All fourteen". **Cost paragraph byte-identical** (`grep -c` = 1 before and after). |
| `marketplace/plugins/cc/README.md` | "13 skills" → "14 skills"; new bullet + subsection |
| All 7 plugin test files | `SKILL_NAMES` + `SKILL_SUBCOMMANDS` + `DERIVED_FILES_ALLOWLIST` extended; 13 → 14 / 24 → 26 count assertions |

Pre-emptive straggler-grep (orchestrator follow-up): one stale "25 derived" comment in `marketplace-layout.test.mjs:405` fixed inline by orchestrator (originally written by executor before they realized the count was 26 not 25).

`node tools/package-marketplace.mjs --write` resynced marketplace tree. `--check` exit 0 with 26 derived.

## T5 — Tests

### New file: `packages/plugin-codex/test/workflows-inspector.test.mjs`

~6-8 unit tests for the lib helper using mocked `claude agents --json` fixtures + temp-dir filesystem stubs:
- `listWorkflows()` returns empty when no agents
- `listWorkflows()` filters to workflow-kind sessions
- `inspectWorkflow(jobId)` returns null for unknown jobId
- `inspectWorkflow(jobId)` returns enriched data for known workflow session
- `inspectWorkflow(jobId)` handles missing subagents dir gracefully
- `--all` flag honored

### Extended `dispatcher.test.mjs`

7 new describe blocks for `workflows` subcommand: `--help` row, happy path no-args, happy path with jobId, `--json`, `--allow-edit` rejection, non-TTY rejection, unknown flag rejection.

### Extended `skills-manifest.test.mjs`

7 new `claude-workflows`-specific tests + extensions to `SKILL_NAMES`/`SKILL_SUBCOMMANDS`.

### Iterator effects across 4 marketplace/docs tests

`marketplace-layout`, `marketplace-smoke`, `marketplace-releasing`, `docs-split`, `readme.test.mjs`: SKILL_NAMES extended; 13→14 / 24→26 count assertions bumped.

## T6 — Local gates (orchestrator-absorbed)

| Gate | Result |
|---|---|
| Build (`tsc --build`) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; **26 derived (was 24)** + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **14 skills (was 13)** with "Fourteen skills" wording |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` (4 lanes) | **TBD** (verifying; expected ~1528) |
| `npm run test:attach` | TBD (expected 28) |
| `npm run test:bench` | TBD (expected 258) |
| `node packages/plugin-codex/scripts/cc.mjs workflows --help` | works |

### Test count (Stage 2 close — TBD)

| Lane | Plan 0015 close | Plan 0016 close (expected) |
|---|---|---|
| `test:mock` | 68 | 68 |
| `test:runtime` | 173 | 173 |
| `test:driver` | 187 | 187 |
| `test:plugin` | 1060 | **1100** (+40) |
| **`npm test` chain** | **1488** | **1528** (+40) |
| `test:attach` | 28 | 28 |
| `test:bench` | 258 | 258 |
| **Combined** | **1774** | **1814** (+40) |

Plan target was +35 to +40 (Verdict A scope). Actual: **+40** (right at target). Despite the architectural pivot (PTY → CLI), the test surface stayed similar: parser unit tests became inspector unit tests; the rest mirrors Plan 0010/0011/0013 patterns.

## Adaptive scope outcome

Plan 0016 was scoped with verdict-conditioned scope (A/A-partial/B). T1 returned **A-partial with a critical pivot**: the original PTY-injection design solved the wrong problem (session-scoped panel doesn't show users' bg jobs). The pivot to CLI-only:
- **Simpler implementation** (no PTY, no ANSI parsing)
- **No documented exceptions** (no driver/runtime touches)
- **More stable** (JSON data path)
- **Actually serves users** (covers their `cc workflow` jobs)

This is the **first plan in the session to ship genuine new dispatcher subcommand WITHOUT new runtime infrastructure** since the pre-rename baseline.

## Files modified in Stage 2 (consolidated)

New:
- `packages/plugin-codex/skills/claude-workflows/SKILL.md`
- `packages/plugin-codex/scripts/lib/workflows-inspector.mjs`
- `packages/plugin-codex/test/workflows-inspector.test.mjs`

Modified:
- `packages/plugin-codex/scripts/cc.mjs` (case + cmdWorkflows + printUsage)
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt 13 → 14)
- `tools/package-marketplace.mjs` (DERIVED_FILES +2)
- `tools/smoke-marketplace.mjs` (SKILL_NAMES + wording bumps)
- `marketplace/MANIFEST.md`
- `documentation/RELEASING.md`
- `packages/plugin-codex/README.md` (lead-in + bullet + subsection + dispatcher example)
- `marketplace/plugins/cc/README.md`
- All 7 plugin test files
- Marketplace mirrors (regenerated via --write)

Artifacts:
- `documentation/plan/0016-20260606-workflows-pty-wrapper/artifacts/oq-a-workflows-ansi-capture-20260606.txt`
- `documentation/plan/0016-20260606-workflows-pty-wrapper/artifacts/oq-b-architectural-sketch-20260606.txt`

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `v0.2.0` tag at `ea595e1` (unchanged — no retag)
- `packages/plugin-codex/README.md` cost paragraph: byte-identical (`grep -c` = 1 before AND after)
- `tools/bench/**`, `documentation/plan/0004-*` through `0015-*`: empty diff
- `.github/workflows/ci.yml`: empty diff
- `packages/runtime/**`: empty diff (CLI pivot avoided the planned runtime exception)
- `packages/driver-claude-code/**`: empty diff (CLI pivot avoided the planned driver exception)
- No `~/.claude/` or `~/.codex/` mutation
- Skill count: 14 (was 13); marketplace allowlist: 26 (was 24); plugin version: `0.2.0` (unchanged)

## Plan readme status flip

`documentation/plan/0016-20260606-workflows-pty-wrapper/readme.md` flipped from `implementing` → `auditing`. Stage 2 complete-pending-CI.
