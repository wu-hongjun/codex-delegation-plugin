# Plan 0010 Stage 1 — Plan

**Plan**: Plan 0010 — Codex power-user surfaces (`$claude-goal` + subagent / workflow how-tos)
**Status**: in progress (Stage 1; pre-authorized via AskUserQuestion)
**Date**: 2026-06-05

## 1. Background

After Plan 0009 closed, the maintainer asked for three additions: (a) clear guidelines for Codex to instruct Claude Code to spawn subagents (leveraging Claude Code's advantage over Codex for subagent fan-out), (b) full instructions for utilizing dynamic workflows, and (c) clear skill(s) for using the `/goal` slash command.

The first two are pure documentation expansions targeted at making Codex a more effective router of substantial work to Claude Code. The third is a new skill (10th in the marketplace) that wraps Claude Code's `/goal [condition]` slash command — letting a Codex user set a stop-condition that Claude Code keeps working toward, instead of a single-turn delegation.

## 2. Scope

In:

- **T1** — Subagent-spawning guidelines: new "## Subagent fan-out patterns" section in `packages/plugin-codex/README.md` + 2-4 line extensions to `$claude-delegate` and `$claude-workflow` SKILL.md "Behavior" / "Tips" sections.
- **T2** — Dynamic-workflow how-to: new "## Dynamic workflows in depth" section in the plugin README + richer body in `$claude-workflow/SKILL.md` covering when to use, script shape, cost/cancel/approval patterns, 2-3 example scripts.
- **T3a (probe)** — Empirical: does `claude --bg "/goal X"` set the goal? Or must `/goal X` be PTY-injected post-`attach`?
- **T3b (skill)** — New `$claude-goal <condition>` skill (SKILL.md, dispatcher `case 'goal':`, defaultPrompt entry, marketplace plumbing).
- **T4** — Marketplace repackage + gates + CI verification.

Out:

- Other slash-command wrappers (`/tasks`, `/fork`, `/batch`, etc.) — deferred to Plan 0011+
- Workflow approval auto-injection — high-risk; needs explicit policy
- Plugin version bump / release tag — separate maintainer step
- `tools/bench`, `documentation/plan/0004-*` through `0009-*`, `.github/`, `packages/runtime/`, plugin README cost paragraph (Plan 0001/0002 invariant)

## 3. Open questions

### OQ-A — Does `claude --bg "/goal <cond>"` set the goal?

**TO BE RESOLVED IN T3a (probe)**. Empirical question. Two possible outcomes:
- **A** (preferred, simpler): yes; `claude --bg "/goal foo"` parses `/goal foo` as a slash command and sets the goal. `$claude-goal` is then a thin wrapper that calls `claude --bg "/goal <condition>"` exactly like `$claude-workflow` calls `claude --bg "ultracode: ..."`.
- **B** (fallback, more complex): no; `/goal` is recognized only by the interactive TUI / `claude attach` flow. `$claude-goal` then spawns `claude --bg ""`, attaches, PTY-injects `/goal <condition>` + `\n`, detaches.

T3b's implementation strategy depends on T3a's result.

### OQ-B — `$claude-goal` arg shape: just `<condition>` or `<condition> -- <prompt>`?

**RESOLVED**: just `<condition>` for v1. The user can chain `$claude-goal "all tests pass"` then `$claude-followup <jobId> -- "fix the broken integration test"`. Keeping arg shape minimal avoids a complex two-arg parse + matches the `$claude-workflow` pattern (one positional). Combined `<condition> -- <prompt>` is a Plan 0011 candidate if demand emerges.

### OQ-C — Should the subagent-guidelines section include code examples of an actual `meta`/`phase()`/`agent()` workflow script?

**RESOLVED**: yes for T2 (the dynamic-workflow how-to section), keeping examples to ~15 lines each. T1 (subagent fan-out patterns) covers the Codex-side prompting patterns ("ask Claude to spawn N parallel subagents to ...") without script samples. T2 covers the script-author's perspective.

### OQ-D — Does `--allow-edit` get rejected by `$claude-goal` like by `$claude-workflow`?

**RESOLVED**: yes. `$claude-goal` follows the workflow pattern — the goal-condition + bg-session combination is too coarse for `--allow-edit` semantics. Mirror Plan 0008's `--allow-edit` rejection at parse time.

### OQ-E — Should T1's plugin-README section mention the Workflow tool that this plugin's runtime uses internally for its own subagent orchestration?

**RESOLVED**: no. The internal Workflow tool (Anthropic's Agent SDK primitive) is an implementation detail of the cc-plugin-codex test harness, not a user-facing concept. Conflating it with Codex-side prompting guidance would confuse Codex users.

## 4. Tasks

### T1 — Subagent-spawning guidelines (docs)

**Files**:
- `packages/plugin-codex/README.md` — new "## Subagent fan-out patterns" section (probably near "Commands and skills")
- `packages/plugin-codex/skills/claude-delegate/SKILL.md` — append 2-4 line tip about fan-out
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` — append 2-4 line tip about fan-out

**Content** (plugin README new section):
- When does Claude Code's subagent fan-out beat Codex's own subagent capability? (answer: large parallel decomposition, when Codex's own subagent budget is exhausted)
- How to phrase a `$claude-delegate` prompt to encourage fan-out ("decompose this into N independent file scans, run them in parallel")
- How `$claude-workflow` gives explicit `phase()` + `agent()` orchestration without manual prompting
- 3-5 example user prompts with the expected Claude Code subagent behavior annotated

**Acceptance**: the new section exists with at least 3 example prompts; the two SKILL.md tips reference the new section; no OQ4 forbidden tokens; cost paragraph at L341 byte-identical.
**Plan target**: +5-8 tests.

### T2 — Dynamic-workflow how-to (docs)

**Files**:
- `packages/plugin-codex/README.md` — new "## Dynamic workflows in depth" section
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` — extend "Behavior" / add "Example workflow" subsection with 1 example script

**Content** (plugin README new section):
- When to use `$claude-workflow` vs `$claude-delegate` (decision matrix)
- The `meta` / `phase()` / `agent()` JS script shape (from Plan 0008 empirical TUI smoke evidence)
- 2-3 example script snippets (10-15 lines each):
  - Cross-file audit pattern
  - Migration pattern
  - Research / deep-dive pattern
- Cost / cancel patterns: the user can `x` to cancel via TUI; the bg session can be `$claude-stop`'d from Codex
- Approval-flow patterns: `Yes` / `View raw script` / `No` dialog; user must `claude attach <jobId>` to approve
- Limits: 16 concurrent / 1000 total subagents

**Acceptance**: section exists with at least 2 example scripts; SKILL.md body has 1 example workflow; no OQ4 forbidden tokens; cost paragraph byte-identical.
**Plan target**: +5-10 tests.

### T3a — Empirical probe: `/goal` via `claude --bg`

**Artifact**: `documentation/plan/0010-20260605-codex-power-user/artifacts/oq-a-probe-20260605.txt`

**Steps**:
- Spawn `claude --bg "/goal example test condition"` from a Node helper (no shell timeout — use SIGKILL after 30s)
- Capture exit code, stdout, stderr
- Check `claude agents --json` for the spawned session
- Check `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` for evidence that `/goal` was parsed as a slash command
- Capture all evidence verbatim, redact email/orgId/orgName

**Acceptance**: artifact written with a clear A or B verdict per OQ-A.

### T3b — `$claude-goal` skill (skill + dispatcher + tests + marketplace plumbing)

**Files**:
- `packages/plugin-codex/skills/claude-goal/SKILL.md` (NEW)
- `packages/plugin-codex/scripts/claude-companion.mjs` — new `case 'goal':` + `cmdGoal` function; mirror of `cmdWorkflow`'s shape (uses `_runDelegateCore` helper with goal-specific prompt transformer)
- `packages/plugin-codex/.codex-plugin/plugin.json` — `defaultPrompt` array 9 → 10 entries; add: `"Set a goal condition for a Claude Code session."`
- `tools/package-marketplace.mjs` — `DERIVED_FILES` extended with `skills/claude-goal/SKILL.md`
- `marketplace/MANIFEST.md` — 20 → 21 derived files; new bullet
- `documentation/RELEASING.md` — skill list extended with `$claude-goal`; 20 → 21 derived file counts (in the 3 occurrences from Plans 0007 / 0008)
- `tools/smoke-marketplace.mjs` — `SKILL_NAMES` extended with `claude-goal`; "Nine"/"nine"/"9" → "Ten"/"ten"/"10" wording bumps
- `packages/plugin-codex/test/marketplace-layout.test.mjs` — `EXPECTED_SKILL_NAMES` + `DERIVED_FILES_ALLOWLIST` extended; "9 skill directories" → "10 skill directories"
- `packages/plugin-codex/test/marketplace-smoke.test.mjs` — `SKILL_NAMES` extended; "9 skill names" → "10 skill names"
- `packages/plugin-codex/test/marketplace-releasing.test.mjs` — `SKILL_NAMES` extended; "all 9 skills" → "all 10 skills"
- `packages/plugin-codex/test/skills-manifest.test.mjs` — extend SKILL_NAMES + skill-specific tests; count 9 → 10
- `packages/plugin-codex/test/docs-split.test.mjs` — `SKILL_NAMES` extended; "all 9 skills" → "all 10 skills"
- `packages/plugin-codex/test/readme.test.mjs` — "Nine"/"nine" → "Ten"/"ten" in count-pinning tests
- `packages/plugin-codex/test/dispatcher.test.mjs` — new `case 'goal':` tests (similar to the 7 workflow tests from Plan 0008)
- `marketplace/plugins/claude-companion/README.md` — `$claude-goal` bullet + short `### $claude-goal` subsection
- `packages/plugin-codex/README.md` — new `### $claude-goal` subsection under "## Commands and skills"; bullet in "Current v1 scope" (9 → 10 wording bumps in lead-in + dispatcher list)

**Approach**: based on T3a result:
- **If A**: `cmdGoal` follows `cmdWorkflow` exactly — `claude --bg "/goal <condition>"` via `_runDelegateCore` with `p => '/goal ' + p` prompt transformer
- **If B**: `cmdGoal` spawns `claude --bg ""` then uses the dispatcher's existing PTY-attach machinery (the same path `$claude-followup` uses) to inject `/goal <condition>\n`

**Acceptance**:
- `$claude-goal <condition>` produces a job ID + management commands
- Rejects `--allow-edit` at parse time with a clear error
- Forwards `--model`, `--effort`, `--permission-mode`, `--name`, `--yes` (parity with `$claude-delegate` / `$claude-workflow`)
- `--add-dir`, `--mcp-config` accepted (these are session-config flags)
- Skill count 9 → 10 propagated across all surfaces
- `--check` exit 0 with 21 derived files
- `smoke --help` lists 10 skills
**Plan target**: +15-20 tests (mirror Plan 0008 T3 + T4 + T7 patterns).

### T4 — Marketplace repackage + gates + CI (orchestrator-absorbed)

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0; 21 derived + 64 bundled + 3 synthesized + 1 marketplace-owned
- `node tools/smoke-marketplace.mjs --help` exit 0; lists 10 skills
- All local gates green: `lint`, `typecheck`, `format`, `npm test`, `test:attach`, `test:bench`
- Combined test count: Plan 0009 baseline 1614 + ~30-40 new = ~1644-1654
- Remote CI `success` across `ubuntu-latest + macos-latest × Node 20 + 22`

## 5. Risks

- **R1 — `/goal` may behave differently from `ultracode:`.** T3a empirically resolves this. If it's TUI-only (Outcome B), the implementation must use PTY injection; Plan 0008's lesson applies (more complex, but works).
- **R2 — Skill count bumps propagate to many files.** Plan 0008 had F-1 / F-2 audit findings for missed wording. Mitigation: T3b explicitly enumerates the files; the orchestrator will grep `\b9\b` and `\bnine\b` patterns across tests/docs/tools after the bump to catch stragglers.
- **R3 — Plugin README cost paragraph drift.** Adding 2 new prose sections (T1 + T2) near the cost paragraph risks accidental edits to L341. Mitigation: existing `docs-split.test.mjs` cost-paragraph byte-identity test catches drift.
- **R4 — OQ4 forbidden-token leak in new prose.** T1 (subagent fan-out) and T2 (workflow how-to) include performance / cost-flavored discussion of subagent advantages. Mitigation: existing per-surface forbidden-token tests; use neutral phrasing ("more subagents available" not "saves money"; "parallel decomposition" not "more efficient than").
- **R5 — Marketplace allowlist 20 → 21 drift across multiple files.** Plan 0008 hit F-1 from a missed `replace_all`. Mitigation: after T3b's `--write`, grep for `\b20\b` AND `\btwenty\b` (and Plan 0008's `\b9\b` / `\bnine\b` carry-over for the skill-count bumps).
- **R6 — `--allow-edit` rejection list in `printUsage` gets misaligned again.** Mitigation: Plan 0008 + Plan 0009 already use line-based contains-checks (not exact-string); the existing tests will catch the new "and goal" addition if missing.

## 6. Test count target

Plan 0009 close baseline: 1614 (1328 npm test + 28 attach + 258 bench).

Plan 0010 target net delta: **+30 to +40 tests**, all in `npm test` plugin lane.

Final combined: **~1644-1654**.

Per `feedback_test_count_overshoot`, B's actual count may exceed target if each test is a distinct contract.

## 7. Acceptance criteria (overall)

- All 4 T-tasks complete (T3a + T3b counted as one).
- All local + remote CI gates green.
- New `$claude-goal` skill discoverable in real Codex TUI (manual verification not required for Stage 2 close — Plan 0006 T9 / Plan 0008 posture).
- `--check` exit 0 with 21 derived files.
- Cost paragraph at L341 byte-identical.
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged).
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish`.

## 8. Backlog (carried forward, NOT in Plan 0010)

- Other slash-command wrappers (`/tasks`, `/fork`, `/batch`, …) — each one is a separate plan
- Workflow approval auto-injection (high-risk)
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred until Plan 0004 closes)
- Opus 4.8 probe floor verification (probe at v2.1.154; may be wrong on v2.1.153 but not empirically tested)
- G7-G10 Plan 0007 backlog
- Release tag `v0.3.0` (separate maintainer step)
- Per-subcommand `--help` text restructure
