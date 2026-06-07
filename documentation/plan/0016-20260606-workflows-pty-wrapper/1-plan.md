# Plan 0016 Stage 1 — Plan

**Plan**: Plan 0016 — `/workflows` PTY-injection wrapper (read-only `$claude-workflows` skill)
**Status**: drafted (awaiting maintainer authorization)
**Date**: 2026-06-06

## 1. Background

Plan 0015 OQ-C established that wrapping Claude Code's `/workflows` TUI panel requires PTY-injection (CLI/JSONL covers only 31% of panel fields). The same probe confirmed:
- `node-pty` loads cleanly (bundled in `marketplace/plugins/cc/node_modules/node-pty/`)
- `packages/driver-claude-code/src/attach.ts` already provides the core PTY pattern (spawn → warmup → bracketed-paste write → ring-buffer capture → parse)
- Estimated 150-200 LOC for a `/workflows` panel parser + harness reuse
- Prerequisite: empirically capture the panel's ANSI render output with **active multi-agent workflow** sessions running

Plan 0016 takes this on. Scope: **read-only** list + drill — no interactive control. Interactive control (pause/resume/restart/save) is deferred to Plan 0017+.

## 2. Scope

In:
- **T1** — Empirical ANSI capture + architectural sketch (single executor)
- **T2** — PTY harness + ANSI parser implementation
- **T3** — New `$claude-workflows` skill (SKILL.md + dispatcher subcommand + cmdWorkflows)
- **T4** — Marketplace plumbing + 13 → 14 / 24 → 25 count bumps
- **T5** — Tests (parser unit tests + dispatcher tests + skills-manifest tests + integration fixture)
- **T6** — Gates + CI

Out:
- Interactive controls (pause/resume/restart/save keystrokes) — Plan 0017+
- Workflow library management (save-as-command via `s`) — Plan 0017+
- Mid-run script editing (`Ctrl+G`) — TUI editor escape; not a CLI surface
- Driving multiple panels in parallel — Plan 0017+
- PTY-based testing of other slash commands — Plan 0017+
- Touching frozen plan dirs (0004-0015), tools/bench, .github/, cost paragraph

## 3. Open questions

### OQ-A — Panel rendered structure (TO BE RESOLVED IN T1)

What does `/workflows` actually look like at the byte level? Specifically:

1. List view (multiple workflows): row format, column ordering, status indicators (running/complete), token totals, elapsed time, phase counts
2. Drill-in view (single workflow): phase breakdown, per-agent rows (name, prompt preview, token total, status, recent tool calls)
3. ANSI structure: cursor moves? Scroll region? Specific color/bold escape codes for status?
4. Stability: do successive captures of the same state produce byte-identical output, or does the panel re-render with timestamps/incrementing counters?

Verdict mapping for T1:
- **A** — clean parseable structure (rows + columns + status escapes); harness + parser ship as planned
- **A-partial** — parseable but harness needs new code beyond `attach.ts` reuse (e.g., the panel uses a different keyboard injection format); document tech debt
- **B** — re-renders unpredictably / depends on terminal width / requires interactive scroll; defer to a future plan with a different design (e.g., snapshot-only capture without parsing)

### OQ-B — Harness reuse vs new code

**TO BE RESOLVED INLINE IN T1's sketch**: how much of `attach.ts` is reusable? Specifically:
- Spawn shape (we need `claude` without args, then inject `/workflows\r`)
- Warmup detection (when is the panel ready to read?)
- Ring-buffer sizing (the panel may be larger than attach's typical render)
- Exit mechanism (we need to send `Esc` and stop cleanly without confirming any prompts)

Output: a 30-50 line pseudocode sketch of the new helper, identifying which parts pull from `attach.ts` patterns vs new code.

### OQ-C — Test paradigm

**RESOLVED**: parser tests use captured ANSI fixtures (deterministic). End-to-end PTY tests are local-dev only (no CI Claude binary). Add:
- ~10 parser unit tests against captured fixtures (list view + drill-in views + edge cases like empty state)
- ~7 dispatcher tests (mock the PTY layer; assert command-line shape + flag handling)
- ~7 skills-manifest tests (mirror prior plans' new-skill pattern)
- 1 integration fixture test that LOADS a captured fixture and runs it through the full parser pipeline

### OQ-D — Driver vs lib placement

**RESOLVED CONDITIONALLY** (deferred to T1):
- Option 1: new file `packages/driver-claude-code/src/workflows-panel.ts` next to `attach.ts` (reuses the driver's PTY infra). Driver change → documented exception.
- Option 2: new file `packages/plugin-codex/scripts/lib/workflows-panel.mjs` (plugin-codex local). Imports node-pty directly; smaller scope; doesn't touch driver.
- T1's sketch picks one based on actual reuse extent.

### OQ-E — Skill argument shape

**RESOLVED**:
- `$claude-workflows` (no args) → list all running + completed workflows
- `$claude-workflows <jobId>` → drill into one workflow's phases + per-agent breakdown
- `--json` flag for machine-readable output
- `--yes` flag (privacy ack pass-through)

### OQ-F — Stop / cleanup behavior

**RESOLVED**: PTY subprocess is short-lived. Open panel → capture → send `Esc` → wait for clean exit → kill if not exited within 2 seconds. The skill itself doesn't leave any state; the captured snapshot is returned to stdout (JSON or human-readable).

## 4. Tasks

### T1 — Empirical capture + architectural sketch

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- `artifacts/oq-a-workflows-ansi-capture-20260606.txt` — captured ANSI bytes + parsed structure
- `artifacts/oq-b-architectural-sketch-20260606.txt` — pseudocode harness + parser sketch with attach.ts citations

Steps:
1. **Spawn an active workflow** to populate the panel: `cc workflow --yes -- "Survey packages/plugin-codex/scripts/cc.mjs in 3 short bullets. Be brief."` Wait for it to reach a sustained running state.
2. **Capture the list view**:
   - Use node-pty to spawn `claude` (without args)
   - Wait for the welcome prompt
   - Inject `/workflows\r`
   - Wait ~2 seconds for the panel to render
   - Capture the raw byte output from the PTY
   - Quote the raw bytes + a structured interpretation (rows, columns, status indicators)
3. **Capture a drill-in view**:
   - Same shape; after `/workflows\r`, inject `\r` (Enter) to select the first workflow and drill in
   - Wait ~2 seconds
   - Capture raw + structured
4. **Capture the empty state** (if possible): stop all workflows, repeat step 2. Quote the "no workflows" panel for comparison.
5. **Cleanup**: send `Esc` ×3 to exit panel; `Ctrl+C` to exit claude; verify clean exit.
6. **Architectural sketch** (OQ-B):
   - Pseudocode for the new helper (30-50 lines)
   - Cite specific `attach.ts` line numbers for each reusable pattern
   - Identify the parser strategy (regex per row? table parsing? AST?)
   - Note placement decision (driver vs lib)

**Acceptance**: 2 artifacts; OQ-A verdict (A/A-partial/B); pseudocode sketch with citations.

### T2 — PTY harness + parser

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

Based on T1 outcomes:

If T1 returns A (most likely):
- Implement new file at the chosen placement (driver or lib)
- Functions: `openWorkflowsPanel()`, `parseWorkflowsList(ansi)`, `parseWorkflowDrillIn(ansi)`, `closeWorkflowsPanel()`
- Reuse `attach.ts` patterns per OQ-B citations
- Returns plain JS objects (jobId, name, status, phases[], agents[])
- Handle empty state cleanly

If T1 returns A-partial:
- Implement what's tractable; document gaps in code comments
- Ship a simpler parser that captures less detail; full parser deferred to Plan 0017+

If T1 returns B:
- Skip to T3 with a documentation-only outcome (defer the wrapper)

### T3 — `$claude-workflows` skill

**Agent**: `oh-my-claudecode:executor` (sequential after T2)

If T2 implemented the harness:
- `packages/plugin-codex/skills/claude-workflows/SKILL.md` (NEW) — mirror `$claude-status` shape (read-only inspector)
  - Frontmatter `name: claude-workflows`
  - Run line: `node "<plugin-root>/scripts/cc.mjs" workflows [<jobId>]`
  - Accepted flags: `--json`, `--yes`
  - Does NOT accept `--allow-edit`, `--model`, `--effort`, etc. (read-only)
  - Cost notice: PTY subprocess startup is brief; one Claude process spawn per call
  - `### Next steps` cross-references to `$claude-status` / `$claude-result` / `$claude-stop`
- Dispatcher: new `case 'workflows':` + `cmdWorkflows` function in `packages/plugin-codex/scripts/cc.mjs`
- `printUsage`: new `workflows [<jobId>] [--json]` row
- `--allow-edit` rejection list extended to include `workflows`

If T2 deferred (Verdict B):
- No new skill. T4-T5 collapse.

### T4 — Marketplace plumbing + count bumps (conditional on T2 shipping)

| File | Change |
|---|---|
| `packages/plugin-codex/.codex-plugin/plugin.json` | `interface.defaultPrompt` +1 entry; 13 → 14 |
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +1 (`skills/claude-workflows/SKILL.md`); 24 → 25 |
| `marketplace/MANIFEST.md` | "24 files" → "25 files" + 1 new bullet |
| `documentation/RELEASING.md` | "24 derived"/"24 source-derived" → "25" (3×); "thirteen-skill" → "fourteen-skill"; "other twelve skills" → "other thirteen skills"; skill list +1 |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +1; wording bumps |
| All 7 plugin test files | `SKILL_NAMES` extended; 13/24 count assertions bumped |

Pre-emptive straggler-grep before T6.

### T5 — Tests

If T2 implemented the harness:
- **Parser unit tests** (~10 in `packages/plugin-codex/test/workflows-parser.test.mjs` NEW): list view parse / drill-in parse / empty state / partial render / multi-workflow / various status indicators / token total parsing / phase count / agent name extraction / edge cases
- **Dispatcher tests** (~7 in `dispatcher.test.mjs`): --help row, happy path (mocked PTY layer), --json output, --yes pass-through, --allow-edit rejection, non-TTY rejection if applicable, error handling when no Claude binary
- **Skills-manifest tests** (~7 in `skills-manifest.test.mjs`): dir exists, SKILL.md exists, run line, no --yes auto-injection, no --allow-edit, defaultPrompt entry, frontmatter strictness
- **Integration fixture test** (1 new): load `artifacts/oq-a-workflows-ansi-capture-20260606.txt` and assert the parser returns the expected structured output

If T2 deferred: +1-3 docs regression tests for the deferral note in $claude-status SKILL.md.

### T6 — Gates + CI (orchestrator-absorbed)

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 with correct count (24 if defer; 25 if ship)
- `node tools/smoke-marketplace.mjs --help` lists 13 or 14 skills
- `npm run lint` / `typecheck` / `format` clean
- `npm test` (4 lanes), `test:attach` 28, `test:bench` 258 — all green
- Remote CI `success` on all 4 matrix legs
- **Locally** (not gated in CI): `node packages/plugin-codex/scripts/cc.mjs workflows` works against a real Claude binary on this machine

## 5. Risks

- **R1 — Panel ANSI format unstable**: a Claude Code update could change the rendered output, breaking the parser. Mitigation: parser tolerates additional whitespace/escapes; tests pin behavior for the version captured; document the captured version explicitly in fixtures.
- **R2 — PTY subprocess hangs**: claude binary may not exit cleanly on Esc; mitigation: 2s SIGKILL fallback in cmdWorkflows.
- **R3 — Test flakiness**: PTY-based integration tests can be timing-sensitive. Mitigation: gate live PTY tests behind an env var (e.g., `RUN_PTY_TESTS=1`); CI uses fixture-based parser tests only.
- **R4 — node-pty build issues across platforms**: prebuilds exist for darwin-arm64, darwin-x64, linux-arm64, linux-x64. Should work on CI's ubuntu-latest + macos-latest. Mitigation: validate in T6 that test:attach (which also uses node-pty) still passes.
- **R5 — Driver/runtime touches expand scope**: if T1 places code in `packages/driver-claude-code/src/`, that's a documented exception (precedent Plan 0012 T5). Mitigation: T1 explicitly justifies the placement decision.
- **R6 — Workflow runtime requires Claude pro/max plan**: workflows are paid-plan-only per docs. The maintainer has Max (confirmed via earlier setup probe). CI doesn't have Claude installed at all. Mitigation: T1's empirical capture happens locally on the maintainer's machine; CI runs fixture-based tests only.
- **R7 — Plan 0014 rename interactions**: the dispatcher is now `cc.mjs`. All run lines must use `cc.mjs`, not `claude-companion.mjs`. Mitigation: standard Plan 0014 patterns; orchestrator verifies via straggler-grep.

## 6. Test count target

Plan 0015 close baseline: **1774** (1488 npm test + 28 attach + 258 bench).

Plan 0016 target net delta (assuming T1 Verdict A):
- T5 parser unit tests: ~10
- T5 dispatcher tests: ~7
- T5 skills-manifest tests: ~7
- T5 integration fixture test: 1
- Per-skill iterator effects across 4 marketplace/docs tests: ~10-15 (SKILL_NAMES iterator grows by 1)
- Total: **~35-40**

Final combined: **~1810-1815**.

If T1 returns B (defer): +3-5 docs regression tests only. Combined: ~1779.

## 7. Acceptance criteria (overall)

- T1 artifacts written; OQ-A verdict explicit; pseudocode sketch present
- T2 ships (or defers per Verdict B)
- All local + remote CI gates green
- Marketplace `--check` exit 0 with the new count
- Cost paragraph at L763-ish byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged); v0.2.0 immutable
- Plans 0004-0015 untouched
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish`
- If shipped: `node packages/plugin-codex/scripts/cc.mjs workflows --help` (or similar) works on this machine against a real Claude binary

## 8. Backlog (carried forward, NOT in Plan 0016)

- **Interactive workflow control** (pause/resume/restart/save keystrokes) — Plan 0017+
- **Workflow library management** (saved workflows from `s` keystroke) — Plan 0018+
- **PTY-based testing of other slash commands** (`/tasks` already covered by `cc status --all`; others?) — future
- **`/tasks` panel via PTY** — Plan 0015 OQ-B Verdict A already covered via `cc status --all`; no work needed
- **Skill-discovery surface test** — separate plan
- **v0.3.0 release tag** — separate maintainer step
- **Display-name prose harmonization** — Plan 0014 backlog
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit
