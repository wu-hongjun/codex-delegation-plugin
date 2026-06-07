# Stage 5 — Report: Plan 0015

## Report metadata

- **Plan**: Plan 0015 — Agent management surfaces (`/workflows` panel + `/tasks` panel coverage)
- **Date**: 2026-06-06
- **Commit reported**: this commit (Stage 3 + Stage 5; Stage 4 skipped)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted from maintainer's "/workflows TUI panel wrapper + /tasks PTY-injection design" direction. Adaptive scope: 3 OQ probes condition T2-T5 implementation. Approved 2026-06-06 via maintainer AskUserQuestion authorization.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-06 at commit `b16aaca`. T1 probes returned B/A/feasible; T2 docs-only update; T4 +3 regression tests. Local total 1774. CI run `27079972098` recorded post-completion.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with **zero findings** at any severity. **Sixth zero-finding audit pattern** in this session.
- **Stage 4 polish**: SKIPPED. Audit verdict allowed direct progression.
- **Final status**: `complete`

---

## Executive summary

Plan 0015 closes the question of whether Claude Code's `/workflows` and `/tasks` TUI panels can be driven from Codex via existing CLI surfaces, OR require PTY-injection infrastructure. Three probes settled the question definitively:

1. **`/workflows` panel = PTY-required**: only 4 of 13 documented panel fields (31%) are reachable via `claude agents --json` + JSONL inspection. Phase records, per-agent token usage, drill-down details, and pause/resume/stop/restart controls are TUI-only. Far below the 80% threshold for a CLI wrapper. **Deferred to Plan 0016 with concrete design constraints**.

2. **`/tasks` panel = CLI-covered**: `claude agents --json` (which powers `cc status`) already exposes every field `/tasks` renders. `$claude-status --all` IS the CLI equivalent. **No new `$claude-tasks` skill needed**.

3. **PTY-injection feasibility**: `node-pty` loads cleanly. `packages/driver-claude-code/src/attach.ts` provides ~70% of the harness pattern (spawn → warmup → bracketed-paste write → ring-buffer capture → parse). Plan 0016 has actionable starting points. The remaining unknown is the panel's rendered ANSI text format with **active workflow sessions** (Plan 0016's T1 prerequisite probe).

**Adaptive outcome**: docs-only update to `$claude-status` SKILL.md documenting `/tasks` equivalence + `/workflows` deferral + `claude attach <sessionId>` as the interactive attach path. **No new skills**. Skill count stays **13**. Marketplace allowlist stays **24**. Test count: 1771 → **1774** (+3 regression tests pinning the new docs claims).

**Key design clarification**: `cc workflow` (our existing skill) uses the keyword path (`ultracode:`) which TRIGGERS new workflows. The `/workflows` slash command is the MANAGEMENT surface for already-running workflows. They serve different purposes; both can ship without conflict (workflow is trigger; future `$claude-workflows` is manager).

---

## What shipped

### Plan 0015 implementation

**File modified**: `packages/plugin-codex/skills/claude-status/SKILL.md`

- New section `### Relationship to Claude Code's /tasks and /workflows panels` documenting:
  - `/tasks` equivalence with `$claude-status --all` (both sourced from `claude agents --json`)
  - `/workflows` deferral to Plan 0016 (no CLI equivalent; PTY-injection required)
  - `claude attach <sessionId>` as the interactive attach path
- Extended `### Next steps` to include `claude attach <sessionId>`

**Marketplace mirror** resynced via `node tools/package-marketplace.mjs --write`. 24 derived files (unchanged from Plan 0014).

**Regression tests** (+3 in `packages/plugin-codex/test/readme.test.mjs`):
1. `claude-status/SKILL.md documents /tasks panel equivalence (Plan 0015 T2)`
2. `claude-status/SKILL.md notes /workflows panel deferral (Plan 0015 T2)`
3. `claude-status/SKILL.md documents claude attach interactive path (Plan 0015 T2)`

### Empirical probe artifacts (T1)

- [`artifacts/oq-a-workflows-panel-coverage-probe-20260606.txt`](artifacts/oq-a-workflows-panel-coverage-probe-20260606.txt) — **Verdict B** (4/13 = 31%). 13-row field-by-field mapping; live `claude agents --json` capture; explicit "ultracode trigger vs /workflows manage" distinction.
- [`artifacts/oq-b-tasks-panel-coverage-probe-20260606.txt`](artifacts/oq-b-tasks-panel-coverage-probe-20260606.txt) — **Verdict A**. Live captures from 3 concurrent bg sessions; every documented `/tasks` field shown present in JSON.
- [`artifacts/oq-c-pty-feasibility-20260606.txt`](artifacts/oq-c-pty-feasibility-20260606.txt) — **feasible**. node-pty loads; specific `attach.ts` line numbers for reusable patterns; sketch + estimate for Plan 0016.

### Plan 0016 design constraints (handoff)

For the maintainer's next-up `/workflows` PTY-injection plan:
- **Reuse 70%** of `packages/driver-claude-code/src/attach.ts` (spawn / warmup / bracketed-paste / ring-buffer pattern)
- **Estimated ~150-200 LOC** for the panel parser + integration tests
- **Prerequisite**: Plan 0016 T1 must empirically capture the panel's ANSI render output with an active multi-agent workflow running. Without this, the parser format can't be defined.
- **Out of scope for Plan 0016** likely: workflow library management (save-as-command `s` keystroke), mid-run script editing (`Ctrl+G`). These are user workflows in Claude TUI; Codex doesn't manage them.

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-06. Adaptive scope locked at Stage 1: A/B/C branches conditioned on T1 outcomes.
- **Stage 2 (Implement)** — Complete 2026-06-06 at commit `b16aaca`. Single `oh-my-claudecode:executor` for T1 probes. T2-T5 orchestrator-absorbed (small scope: 4 files modified). 1771 → 1774 tests.
- **Stage 3 (Audit)** — Complete 2026-06-06. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with **zero findings**.
- **Stage 4 (Polish)** — SKIPPED. Verdict allowed direct progression.
- **Stage 5 (Report)** — This document.

---

## T-task summary

| Task | Outcome | Status | Evidence |
|---|---|---|---|
| T1 OQ-A `/workflows` probe | B | complete | artifact; 31% CLI coverage |
| T1 OQ-B `/tasks` probe | A | complete | artifact; equivalent to `cc status --all` |
| T1 OQ-C PTY feasibility | feasible | complete | artifact; `attach.ts` 70% reuse basis |
| T2 docs-only (Scope B) | shipped | complete | `claude-status/SKILL.md` new section + Next steps |
| T3 marketplace (no-op) | no-op | complete | 24 derived unchanged |
| T4 regression tests | shipped | complete | +3 in `readme.test.mjs` |
| T5 gates + CI | green | complete | local + CI green |

---

## Test and CI evidence

Final local totals on this commit (Stage 5 close):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1060 | 1060 | 0 |
| **`npm test` chain** | **1488** | **1488** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1774** | **1774** | **0** |

Test growth: **+3** (Plan 0014 → Plan 0015 close). All three new tests pin distinct docs contracts.

Remote CI: Stage 2 run `27079972098` — recorded post-completion. Stage 3+5 (this commit) recorded in follow-up log.

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` | unchanged |
| `v0.2.0` tag at `ea595e146e26edbd1942486ac98ea38560947210` | unchanged (no retag) |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` cost paragraph byte-identical | preserved (no README touch this plan) |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` through `0014-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/runtime/**` untouched | preserved (no doctor.ts touch this plan) |
| `packages/driver-claude-code/**` untouched | preserved (OQ-C consulted `attach.ts` but did NOT modify) |
| Plan 0006 T9.5 cache-execution invariant | preserved (mirror byte-identical; 24 derived unchanged) |
| No `~/.claude/` or `~/.codex/` mutation | preserved (probe sessions cleaned up via `cc stop`) |
| Skill count: 13 (unchanged); marketplace allowlist: 24 (unchanged); plugin version: `0.2.0` (unchanged) | preserved |

---

## Adaptive scope outcome

Plan 0015 was scoped as adaptive with 3 branches (A/B/C) per OQ outcomes:

- **OQ-A B**: no `$claude-workflows` skill ships; deferred to Plan 0016
- **OQ-B A**: no `$claude-tasks` skill ships; equivalence documented
- **OQ-C feasible**: PTY harness sketched; Plan 0016 well-scoped

**Final delta**: 1 SKILL.md file edited; +3 regression tests; 3 probe artifacts written; **no new skills**; **no marketplace bumps**; **no breaking changes**.

This is a "probe-and-defer" plan that **explicitly sizes Plan 0016 for the maintainer**. Plan 0016 has actionable design constraints rather than starting from speculation.

---

## Deferred / future work

- **`/workflows` PTY-injection wrapper** — Plan 0016 next. Reuses `attach.ts` pattern; ~150-200 LOC; needs prerequisite panel-ANSI capture with active workflow.
- **Interactive workflow control** (pause/resume/restart/save keystrokes) — heavy interactive surface; likely Plan 0017+ after Plan 0016's read-only panel ships.
- **Skill-discovery surface test** — maintainer's earlier focus area; queued for after Plan 0016.
- **v0.3.0 release tag** — separate maintainer step. Cleanly motivated by Plans 0013 + 0014 + 0015.
- **Display-name prose harmonization** — Plan 0014 backlog candidate.
- **Plan 0004 T11/T12** (paused; ≥ 2026-06-16)
- **Plan 0005** (deferred)
- **Opus 4.8 probe floor verification** — not empirically verified
- **G7-G10 backlog from Plan 0007 audit** — LOW priority CLI verb wrappers

---

## Lessons learned

### Probe-then-defer is honest sizing

Plan 0015 could have committed to a `$claude-workflows` skill up front. Instead, T1 OQ-A measured **how much of the panel is actually reachable via CLI** (31%) before deciding scope. The 80% threshold was set in advance; the verdict followed mechanically. **Lesson**: when scoping a wrapper plan, define the success threshold for "reachable via existing surfaces" up front. The probe measures; the verdict follows.

### CLI parity questions deserve probes, not arguments

The OQ-A probe was concrete: enumerate every panel field from the docs, then check each against `claude agents --json` and JSONL records. The result (4 of 13 covered = 31%) is unambiguous. Without the probe, this could have been a multi-round discussion about "is the CLI good enough?". **Lesson**: probes turn debates into evidence.

### Plan 0016 inherits actionable constraints

OQ-C didn't just say "PTY is feasible". It cited specific `attach.ts` line numbers, estimated LOC, and named the prerequisite (panel-ANSI capture with active workflow). Plan 0016's executor has concrete starting points. **Lesson**: when a probe defers work to a future plan, the deferral artifact should describe what the future plan needs to do FIRST, what it can reuse, and what's still unknown.

### `cc workflow` and `/workflows` panel are different surfaces

Our existing `cc workflow` uses the `ultracode:` keyword path which **triggers** new workflows. The `/workflows` slash command is the **management** panel for already-running workflows. Both can ship without conflict. This distinction was not crisp in Plan 0008/0010/0011 docs. **Lesson**: when a Claude Code command name is plural-vs-singular (`/workflow` doesn't exist; `/workflows` is the manager), the wrapping decision must distinguish trigger from management surface explicitly.

### Sixth zero-finding audit in the session

Plans 0009, 0010, 0011, 0013, 0015 all earned `ready-for-report` with zero findings (Plans 0012 and 0014 had 1 MINOR each that polished cleanly). The discipline that holds: tight scope at Stage 1; explicit non-overlapping executor file sets; pre-emptive straggler-grep; adaptive scope when probe outcomes warrant; empirical evidence over speculation.

---

## Final verdict

Plan 0015 ships. All five T-tasks complete; T1 verdicts B/A/feasible mapped cleanly to Scope B (docs-only + defer); Stage 3 audit returned `ready-for-report` with zero findings; Stage 4 polish skipped per verdict; all standing safety invariants preserved; **1774 tests pass (0 fail)** across all lanes; marketplace payload byte-identity intact; cost paragraph byte-identical.

The plugin now has **explicit documentation of the `/tasks` ↔ `cc status --all` equivalence** and **deferred `/workflows` to Plan 0016** with concrete design constraints. Users have a clear answer to "why isn't there a separate `$claude-tasks` skill?" — `cc status --all` IS that. Plan 0016 has actionable starting points (`attach.ts` 70% reuse, ~150-200 LOC, ANSI capture prerequisite).

Plan 0016+ candidates listed in deferred work.
