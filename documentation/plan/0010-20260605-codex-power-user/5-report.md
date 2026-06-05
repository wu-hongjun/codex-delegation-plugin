# Stage 5 — Report: Plan 0010

## Report metadata

- **Plan**: Plan 0010 — Codex power-user surfaces (`$claude-goal` skill + subagent / workflow how-tos)
- **Date**: 2026-06-05
- **Commit reported**: this commit (Stage 5 final)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — promoted from inline Plan 0009 close-out + maintainer AskUserQuestion authorization. OQ-B / OQ-C / OQ-D / OQ-E resolved inline. OQ-A deferred to T3a empirical probe. 4 T-tasks.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-05 at commit `2e52e76`. T1, T2, T3a, T3b, T4 all PASS. Local total 1661 tests. CI run [`27034918547`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27034918547) `success` across `ubuntu-latest + macos-latest × Node 20 + 22`.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context via fresh `oh-my-claudecode:critic` (Opus) subagent. Verdict **`ready-for-report`** (ZERO findings; second clean audit in this session, after Plan 0009).
- **Stage 4 polish**: SKIPPED. Audit verdict allowed direct progression to Stage 5.
- **Final status**: `complete`

---

## Executive summary

Plan 0010 makes Codex a **power user of Claude Code**. Three additions ship together:

1. **Subagent-spawning guidelines** — a new top-level plugin-README section `## Subagent fan-out patterns (Codex → Claude Code)` plus cross-references in `$claude-delegate` and `$claude-workflow` SKILL.md bodies. The section teaches Codex how to phrase prompts that exploit Claude Code's subagent fan-out — the advantage Claude Code has over Codex. Covers when to delegate vs orchestrate, 5 fan-out-friendly example prompts, and the structural difference between `$claude-delegate` and `$claude-workflow`.

2. **Dynamic-workflow how-to** — a new top-level plugin-README section `## Dynamic workflows in depth` plus a script-API reference in `$claude-workflow/SKILL.md`. The section documents the `meta` / `phase()` / `agent()` API shape (sourced from the Plan 0008 TUI smoke artifact), 3 example workflow scripts (cross-file audit, migration, research), cost / cancel / approval-flow patterns, and documented limits (16 concurrent + 1000 total subagents).

3. **New `$claude-goal <condition>` skill** wrapping Claude Code's `/goal` slash command. The skill spawns a `claude --bg "/goal <condition>"` session. T3a empirically confirmed (Verdict A) that the slash-command path works via `--bg`; the dispatcher uses the same `_runDelegateCore` helper that powers `$claude-delegate` / `$claude-workflow`, with prompt transformer `p => '/goal ' + p`. `--allow-edit` is rejected at parse time (parity with workflow). The skill propagates the standard chain (`$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`).

Skill count grows **9 → 10**. Marketplace allowlist grows **20 → 21 derived files**. The 9 → 10 / 20 → 21 count bumps were propagated coherently across 7 consumer files (RELEASING.md, MANIFEST.md, package-marketplace.mjs, smoke-marketplace.mjs, plus 4 test files) with zero stragglers found by the Stage 3 audit. The Plan 0008 lesson (F-1's missed `eight-skill` wording in RELEASING.md) was preempted by an explicit straggler-grep step in the executor brief.

All gates clean: **1661 tests pass** (1375 npm test + 28 attach + 258 bench), 0 failures. Remote CI green on Stage 2 commit `2e52e76` across `ubuntu-latest + macos-latest × Node 20 + 22`. Every safety invariant preserved.

Plugin version unchanged at `0.2.0`. No release tag. Plan 0010 closes with Plan 0011+ deferrals listed (other slash-command wrappers, workflow auto-approval, Opus 4.8 probe floor verification, release tagging).

---

## What shipped

### New skill: `$claude-goal <condition>`

- `packages/plugin-codex/skills/claude-goal/SKILL.md` (NEW) — strict frontmatter (`name: claude-goal` + `description`); run line `node "<plugin-root>/scripts/claude-companion.mjs" goal -- "<condition>"`; accepted flags (`--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`, `--yes`, `--json`); rejects `--allow-edit`; approval-flow + cost notice; `### Next steps` cross-references.

- Empirical evidence for the implementation strategy: [`artifacts/oq-a-probe-20260605.txt`](artifacts/oq-a-probe-20260605.txt). T3a probed whether `claude --bg "/goal <condition>"` works as a slash command — verdict A confirmed via the session JSONL record `{"type": "goal_status", "sentinel": true, "condition": "..."}` written at session start.

### Dispatcher subcommand

- `packages/plugin-codex/scripts/claude-companion.mjs`:
  - New `case 'goal':` in the main dispatch switch
  - New `cmdGoal` function — mirror of `cmdWorkflow` (Plan 0008): rejects `--allow-edit` at parse time; calls shared `_runDelegateCore` helper with prompt transformer `p => '/goal ' + p` and a goal-specific approval-flow extra-output block
  - `printUsage` extended:
    - New `goal [flags] -- <condition>` row in Commands (placed after the `workflow` row)
    - All applicable flag parentheticals updated to include `goal`: `--yes`, `--json`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`
    - `--allow-edit` rejection list now reads "rejected by review, adversarial-review, workflow, and goal"

### Plugin manifest

- `packages/plugin-codex/.codex-plugin/plugin.json`:
  - `interface.defaultPrompt` array grew 9 → 10 with new entry: `"Set a goal condition for a Claude Code session."`

### Plugin README

Two new top-level sections inserted between `## Review skills` and `## Cost and prompt-cache wording` (the cost paragraph at L636 stays byte-identical):

- `## Subagent fan-out patterns (Codex → Claude Code)` (L422+) — decision matrix; 5 fan-out-friendly `$claude-delegate` example prompts; explanation of when `$claude-workflow` is structurally better
- `## Dynamic workflows in depth` (L473+) — `meta`/`phase()`/`agent()` API; 3 example scripts; cost/cancel/approval patterns; documented limits
- New 10th bullet for `$claude-goal` in `## Current v1 scope`
- New `### $claude-goal` subsection under `## Commands and skills` (L158+)
- "Nine skills" → "Ten skills"; "All nine commands" → "All ten commands"
- New dispatcher example line for `goal`

### Marketplace README

- "9 skills" → "10 skills"
- New `- \`$claude-goal\`` bullet
- New short `### $claude-goal` subsection (end-user wording)
- Smoke-test pointer "all 9 skill names" → "all 10 skill names"

### Marketplace plumbing (21 derived files)

| File | Change |
|---|---|
| `tools/package-marketplace.mjs` | `DERIVED_FILES` array +`skills/claude-goal/SKILL.md` (20 → 21) |
| `marketplace/MANIFEST.md` | "20 files" → "21 files" + new bullet |
| `documentation/RELEASING.md` | "20 derived"/"20 source-derived" → "21" (3 occurrences); skill list extended with `$claude-goal`; "nine-skill" → "ten-skill"; "other eight skills" → "other nine skills" |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +1; "Nine"/"nine"/"nine-skill"/"9 skill names"/"9 skills" → "Ten"/"ten"/"ten-skill"/"10 skill names"/"10 skills" |

### SKILL.md cross-references (T1 + T2 docs)

- `packages/plugin-codex/skills/claude-delegate/SKILL.md`: appended `### Fan-out tip` cross-referencing the new fan-out section
- `packages/plugin-codex/skills/claude-workflow/SKILL.md`: appended `### Script API reference and examples` with a live `meta`/`phase()`/`agent()` script snippet + cross-references to both new README sections

### Test additions (7 files, +47 tests total)

| File | Change | New tests |
|---|---|---|
| `dispatcher.test.mjs` | 7 new describe blocks for the `goal` subcommand | 7 |
| `skills-manifest.test.mjs` | SKILL_NAMES + SKILL_SUBCOMMANDS extended; existing 9-count assertions bumped to 10; 7 claude-goal-specific tests | 7 + count-bump effects |
| `marketplace-layout.test.mjs` | EXPECTED_SKILL_NAMES + DERIVED_FILES_ALLOWLIST extended; "9 skill directories" → "10"; "20 derived" → "21" | per-skill iterator effects |
| `marketplace-smoke.test.mjs` | SKILL_NAMES + "9 skill names" → "10" | per-skill iterator effects |
| `marketplace-releasing.test.mjs` | SKILL_NAMES + "all 9 skills" → "all 10" | per-skill iterator effects |
| `docs-split.test.mjs` | SKILL_NAMES + "Nine skills" → "Ten skills"; "all 9 skills" → "all 10" | per-skill iterator effects |
| `readme.test.mjs` | T1 + T2 tests (5 + 5 + 3 count-bumps); "Nine"/"nine" → "Ten"/"ten" | 13 |

Total: +47 tests (Plan target was +30-40; overshoot justified per `feedback_test_count_overshoot`).

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-05 via maintainer AskUserQuestion authorization. OQ-A deferred to T3a empirical probe; OQ-B / OQ-C / OQ-D / OQ-E resolved inline. 4 T-tasks identified.
- **Stage 2 (Implement)** — Complete 2026-06-05 at commit `2e52e76`. Three `oh-my-claudecode:executor` agents: Batch 1 in parallel (T3a probe + T1+T2 docs); T3b sequential after T3a returned with Verdict A; T4 orchestrator-absorbed. Local total 1661 tests. CI `27034918547` `success`.
- **Stage 3 (Audit)** — Complete 2026-06-05. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`**. ZERO findings (second clean audit in this session).
- **Stage 4 (Polish)** — SKIPPED. Verdict allowed direct progression.
- **Stage 5 (Report)** — This document. Plan status flips `auditing → reporting → complete` in one commit.

---

## T-task summary

| Task | Status | Evidence |
|---|---|---|
| T1 — Subagent-spawning guidelines | complete | Plugin README `## Subagent fan-out patterns` section (L422+); 5 example prompts; SKILL.md cross-references in delegate + workflow; 5 T1 tests |
| T2 — Dynamic-workflow how-to | complete | Plugin README `## Dynamic workflows in depth` section (L473+); 3 example scripts; `meta`/`phase()`/`agent()` documented; cost/cancel/approval patterns; 5 T2 tests + 3 count-bump tests |
| T3a — `/goal` empirical probe | complete | Artifact at `artifacts/oq-a-probe-20260605.txt`; Verdict A (slash command works via `--bg`) confirmed via JSONL `goal_status` record |
| T3b — `$claude-goal` skill | complete | New SKILL.md; new `case 'goal':` + `cmdGoal` (mirror of `cmdWorkflow`); plugin.json defaultPrompt 9 → 10; 7 dispatcher tests + 7 skills-manifest tests; all 9 → 10 count bumps propagated across 7 files |
| T4 — Marketplace + gates | complete | `--check` exit 0 with 21 derived; smoke `--help` lists 10 skills; all local gates green |

---

## Test and CI evidence

Final local totals on the reported commit:

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 948 | 948 | 0 |
| **`npm test` chain** | **1375** | **1375** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1661** | **1661** | **0** |

Test growth from Plan 0009 close to Plan 0010 close: **+47 tests** (1614 → 1661). Plan target was +30-40; overshoot justified per `feedback_test_count_overshoot`.

Remote CI:

- **Stage 2 (`2e52e76`)** — run [`27034918547`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27034918547): **`success`** on all 4 matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).
- **Stage 5 (this commit)** — recorded in a follow-up log commit after this push completes.

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` | unchanged |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` L636 cost paragraph byte-identical | preserved (audit `grep -c` returns 1) |
| OQ4 forbidden cost-claim tokens absent from new prose | preserved (audit `grep -rE` zero hits) |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` through `0009-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/runtime/**` untouched | preserved |
| `packages/driver-claude-code/**` untouched | preserved (Plan 0010 made zero driver changes; the Plan 0007 STATUS_MAP widening still stands) |
| Plan 0006 T9.5 cache-execution invariant | preserved (marketplace `--check` exit 0; 21 derived files byte-identical; allowlist updated coherently across all 7 consumer files) |
| No straggler 9-references or 20-references after the bump | preserved (audit comprehensive grep returns zero stragglers) |

---

## Deferred / future work

- **Other slash-command wrappers** (`/tasks`, `/fork`, `/batch`, …) — each one is a separate plan; pattern proven by `$claude-goal`. Plan 0011+ candidates.
- **Workflow approval auto-injection** — would require explicit user-policy framing; high-risk; backlog.
- **Plan 0004 T11 / T12 (still paused)** — post-cutover benchmark + cost-paragraph decision. Pending ≥ 2026-06-16 window.
- **Plan 0005 (still deferred)** — Stop-time review gate. Stays deferred until Plan 0004 closes.
- **Opus 4.8 probe floor verification** — `opus-4-8-supported` stays at `2.1.154`; not empirically verified.
- **G7-G10 backlog from Plan 0007 audit** — LOW priority CLI verb wrappers.
- **Release tag `v0.3.0`** — separate maintainer step. Plan 0010 does NOT cut a tag.

---

## Lessons learned

### Verdict A from a single empirical probe unlocks the simplest implementation

T3a's single Node helper (no shell `timeout` — that pattern was learned in Plan 0008 T1) returned a definitive Verdict A for `claude --bg "/goal X"`. With A locked, T3b's implementation collapsed to a 2-line variation of `cmdWorkflow` (just change the prompt transformer and the extra-output text). The empirical probe pattern saved time vs jumping straight to a complex PTY-injection design that would have been needed for Verdict B.

### Pre-emptive straggler-grep prevents Plan 0008-style F-findings

Plan 0008's Stage 3 audit found F-1: a missed "eight-skill" wording in RELEASING.md after the systemic skill-count bump. Plan 0010's T3b executor brief explicitly included a "look for any 9 or nine stragglers" grep step. Result: Stage 3 audit found zero stragglers. **Recommendation**: when a systemic count bump touches multiple files, include explicit straggler-grep in the executor brief, AND grep for word forms (`nine`, `9 skill`, `all 9`, `20 derived`).

### Second consecutive `ready-for-report` audit

Plans 0009 and 0010 both achieved `ready-for-report` verdicts (zero findings). The pattern: tight scope at Stage 1, audit-driven scope refinement, explicit non-overlapping file sets per executor agent, and pre-emptive straggler-grep. **Recommendation**: keep this discipline for future plans. The polish-cycle ceremony stays a useful guardrail when the plan adds load-bearing behavior; for docs/frontmatter passes, audit-clean execution is achievable.

### Plan 0008's lesson about over-pinned tests carried forward

Plan 0008's stale Plan 0003 tests (N2-1c, N2-1f) had to be relaxed mid-cycle. Plan 0010's `--help` parenthetical updates (extending each to include `goal`) did NOT break any existing test because Plan 0008 had already relaxed those tests to line-based contains-checks. **Lesson reinforced**: applicability-string assertions should always use contains-checks, never exact-string matches.

---

## Final verdict

Plan 0010 ships. All four T-tasks complete; zero Stage 3 audit findings (second clean audit); Stage 4 polish skipped per `ready-for-report` verdict; all standing safety invariants preserved; **1661 tests pass (0 fail)** across all lanes; remote CI green on `ubuntu-latest + macos-latest × Node 20 + 22`; marketplace payload byte-identity intact; cost paragraph byte-identical.

The plugin now ships 10 skills: 9 lifecycle / review skills (Plans 0001-0008) plus the new `$claude-goal <condition>`. The plugin README explains how to instruct Codex to fan out subagents via Claude Code and includes a full dynamic-workflows how-to with three example scripts. Codex users can now power-user Claude Code: delegate a single conversation, orchestrate a workflow, or set a stop-condition that the runtime tracks to completion.

Plan 0011+ candidates listed in deferred work (other slash-command wrappers, workflow auto-approval, release tagging).
