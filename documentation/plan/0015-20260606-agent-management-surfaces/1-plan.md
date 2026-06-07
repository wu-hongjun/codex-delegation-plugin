# Plan 0015 Stage 1 — Plan

**Plan**: Plan 0015 — Agent management surfaces (`/workflows` panel + `/tasks` panel coverage)
**Status**: drafted (awaiting maintainer authorization)
**Date**: 2026-06-06

## 1. Background

Plan 0014 closed at `11ba3da`. Two Claude Code TUI-blocked-on-input commands remain uncovered:

- **`/workflows`** — workflow runtime agent management panel. Documented at [code.claude.com/docs/en/workflows](https://code.claude.com/docs/en/workflows). Shows phase view, per-agent token usage, drill-down on each agent's tool calls + result; offers keystroke controls (`p`/`x`/`r`/`s`).
- **`/tasks`** — Background tasks picker. Probed in Plan 0011 OQ-A and returned Verdict B (TUI dialog blocked on keyboard input; "↑/↓ to select · Enter to view · ←/Esc to close" prompt). Deferred at the time pending PTY-injection design.

Both share the same architectural class: they open interactive TUI panels with no CLI/JSON output mode. Driving them from Codex requires either (a) PTY injection (heavy infrastructure) or (b) reaching the same data via existing CLI surfaces (`claude agents --json`, JSONL inspection of session/subagent files).

Plan 0015 takes a **probe-first** approach: T1 maps what data is reachable read-only without PTY, then decides scope (A/B/C) based on coverage.

## 2. Scope

In:
- **T1** — Three empirical probes:
  - **OQ-A**: How much of `/workflows` panel state is reachable via `claude agents --json` + `~/.claude/projects/<sessionId>/subagents/*.meta.json` + JSONL phase records?
  - **OQ-B**: Does `/tasks` panel show any data NOT already covered by `$claude-status --all`?
  - **OQ-C**: If gaps exist after OQ-A + OQ-B, is PTY-injection the right answer, or are there other CLI levers (e.g., `claude logs <id>`, `claude attach`)?
- **T2** — Implementation based on T1 outcomes (adaptive). Possibilities:
  - **Scope A (CLI-sufficient)**: Ship `$claude-workflows` read-only skill that lists workflow runs + drills into phases via JSONL inspection. Confirm `/tasks` is covered by existing `$claude-status --all`.
  - **Scope B (PTY-required)**: Design + ship `$claude-workflows-control` PTY-injection wrapper. Reuse the bundled `node-pty` infrastructure. Heavier test surface.
  - **Scope C (mixed)**: Ship CLI read-only skill for what's available; defer interactive control to a future plan.
- **T3** — Marketplace plumbing + count bumps (conditional on N>0 new skills)
- **T4** — Tests
- **T5** — Gates + CI

Out:
- Workflow library management (save-as-command via `s` keystroke) — separate user workflow done in Claude TUI
- Mid-run script editing (`Ctrl+G` action) — TUI editor escape; not a CLI surface
- v0.3.0 release tag — separate maintainer step
- Plan 0004 T11/T12 (still paused)
- Touching frozen dirs (tools/bench, plan 0004-0014, .github/, packages/runtime, packages/driver-claude-code/src/, cost paragraph)

## 3. Open questions

### OQ-A — `/workflows` panel data via CLI

**TO BE RESOLVED IN T1**: probe what's available without PTY.

1. Run a workflow: `cc workflow --yes -- "Survey this repo's test layout. Be brief."`
2. Inspect `claude agents --json` while running — does it distinguish workflow sessions? Does it report phase/agent counts?
3. Inspect `~/.claude/projects/<sanitized-cwd>/<sessionId>/subagents/*.meta.json` — what fields are there?
4. Inspect the session JSONL for workflow runtime records — phase markers? Agent spawn records? Token usage per agent?
5. Map each `/workflows` panel field to: COVERED-by-CLI / PARTIAL-via-CLI / TUI-ONLY

Verdict:
- **A** — ≥80% of fields covered by CLI; ship read-only `$claude-workflows` skill
- **A-partial** — 50-80% covered; ship limited read-only skill + document limitations
- **B** — <50% covered; PTY-injection genuinely needed

### OQ-B — `/tasks` panel coverage

**TO BE RESOLVED IN T1**: does `/tasks` show data NOT in `claude agents --json`?

1. Open `/tasks` via the previous Plan 0011 probe artifact — what fields did it show? ("No tasks currently running" if none)
2. Compare to `claude agents --json` output during multiple bg sessions
3. If `/tasks` shows nothing extra: confirm `$claude-status --all` already covers the use case
4. If `/tasks` shows extra fields: identify them

Verdict:
- **A** — `/tasks` is structurally equivalent to `$claude-status --all`; no new skill needed; document in `$claude-status` SKILL.md or release notes
- **A-partial** — `/tasks` shows some unique fields (e.g., bg session "kind" categorization); thin read-only `$claude-tasks` skill ships
- **B** — `/tasks` has TUI-only data; defer PTY-injection (Plan 0016+)

### OQ-C — PTY decision (only if OQ-A or OQ-B return B)

**RESOLVED CONDITIONALLY**: if T1 confirms PTY is needed:
- Read the bundled `node-pty` in `marketplace/plugins/cc/node_modules/node-pty/` — what's the API?
- Read the runtime's existing PTY usage (`packages/runtime/src/` — any pre-existing PTY spawn helpers?)
- Decide: minimum viable PTY harness shape (spawn claude in PTY; inject `/workflows\r`; capture ANSI; return parsed structure)

The PTY decision is a **substantial design** — if T1 returns it, we may need to scope it as a separate Plan 0016 rather than rushing it into Plan 0015. Adaptive scope handles this.

### OQ-D — Skill naming

**RESOLVED**: if shipping new skills:
- `$claude-workflows` (read-only list/drill) — mirrors plural docs name
- `$claude-tasks` (if OQ-B A-partial; otherwise not shipped)

Both follow the `$claude-<lowercase-slash-command>` convention. Marketplace `--write` resync; SKILL.md per skill; dispatcher subcommands.

### OQ-E — defaultPrompt wording

**RESOLVED INLINE** (subject to verdicts):
- `$claude-workflows` → `"List and inspect Claude Code dynamic workflow runs."`
- `$claude-tasks` → `"List Claude Code background tasks (workflows + subagents)."` (only if shipped)

## 4. Tasks

### T1 — Three empirical probes (single executor)

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- `artifacts/oq-a-workflows-panel-coverage-probe-20260606.txt`
- `artifacts/oq-b-tasks-panel-coverage-probe-20260606.txt`
- `artifacts/oq-c-pty-feasibility-20260606.txt` (only written if OQ-A or OQ-B return B)

Repro for OQ-A:
1. Spawn a real workflow: `node packages/plugin-codex/scripts/cc.mjs workflow --yes -- "Survey packages/plugin-codex/scripts/cc.mjs L1-L100 and explain the dispatch switch in 3 bullets. Be very brief."`
2. While running: capture `claude agents --json` (look for workflow-specific fields)
3. Wait until awaiting_followup. Inspect:
   - The session JSONL at `~/.claude/projects/<sanitized>/<sessionId>.jsonl` — phase records? agent spawn records?
   - `~/.claude/projects/<sanitized>/<sessionId>/subagents/*.meta.json` — fields per subagent
4. Cross-reference each documented `/workflows` panel column (phase name, agent count, token total, elapsed time, agent prompt, recent tool calls, agent result) against what's in CLI/JSONL data.
5. Output mapping table: panel field → CLI source / JSONL source / TUI-only.

Repro for OQ-B:
1. Reference Plan 0011 OQ-A artifact (`documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-a-tasks-probe-20260605.txt`) — what fields did `/tasks` show?
2. Run `claude agents --json` with multiple bg sessions active (delegate, workflow, fork running concurrently).
3. Compare field set.
4. Output overlap analysis.

Repro for OQ-C (conditional):
1. If gaps remain after OQ-A + OQ-B: inspect `marketplace/plugins/cc/node_modules/node-pty/` — verify it loads on this machine
2. Survey existing PTY uses in the repo (grep for `node-pty` imports in `packages/`)
3. Sketch minimum viable harness (file-level pseudocode)

**Acceptance**: 2-3 artifacts written; verdicts explicit; if PTY needed, design sketch present.

### T2 — Implementation based on T1 outcomes

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

#### Scope A (T1 OQ-A returns A) — ship `$claude-workflows` read-only skill

- `packages/plugin-codex/skills/claude-workflows/SKILL.md` (NEW) — mirrors `$claude-status` shape (read-only inspector). Optionally accepts a `<jobId>` to drill into one workflow's phases.
- Dispatcher `case 'workflows':` + `cmdWorkflows` function. Returns `claude agents --json` filtered to workflow-kind sessions, joined with per-subagent metadata from `subagents/*.meta.json`.
- `--json` output mode for machine-readable.
- Skill count: 13 → 14.

#### Scope B (T1 OQ-A returns B) — defer PTY to Plan 0016

- Document the OQ-A artifact as the design basis for Plan 0016.
- Plan 0015 ships only OQ-B outcome (if any) and the documentation update.

#### Scope C — mixed

- Per OQ outcomes.

For `/tasks` (OQ-B):
- If A: append a section to `$claude-status` SKILL.md noting equivalent coverage; no new skill.
- If A-partial: ship thin `$claude-tasks` skill that wraps `claude agents --json` filtered to specific task kinds.
- If B: defer to Plan 0016.

### T3 — Marketplace + count bumps (conditional on N>0 new skills)

| File | Change per new skill |
|---|---|
| `packages/plugin-codex/.codex-plugin/plugin.json` | defaultPrompt +1 entry; 13 → 13+N |
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +1; 24 → 24+N |
| `marketplace/MANIFEST.md` | "24 files" → "(24+N) files" |
| `documentation/RELEASING.md` | "24 derived"/"24 source-derived" → "(24+N)" (3×); "thirteen-skill" → "(13+N)-skill"; "other twelve" → "other (12+N)" |
| `tools/smoke-marketplace.mjs` | SKILL_NAMES +N; wording bumps |
| All 7 test files | SKILL_NAMES extended; 13/24 count assertions bumped |

If N=0: no marketplace plumbing.

Pre-emptive straggler-grep per Plan 0011/0013 discipline.

### T4 — Tests

Per new skill: ~7 dispatcher + ~7 skills-manifest + iterator effects across 4 marketplace/docs tests.

If T1 returns Scope B (no new skills, just defer): +1-3 docs regression tests for the deferral note.

Target: +0 (Scope B) to +20 (Scope A with 1 new skill) to +35 (mixed with 2 new skills).

### T5 — Gates + CI (orchestrator-absorbed)

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 with correct count
- `node tools/smoke-marketplace.mjs --help` lists correct skill count
- `npm run lint`/`typecheck`/`format` clean
- `npm test`, `test:attach`, `test:bench` all pass
- Remote CI `success` on all 4 matrix legs

## 5. Risks

- **R1 — Both probes return B (PTY genuinely required)**: Plan 0015 ships only the artifacts; Plan 0016 takes on the PTY design. Mitigation: adaptive scope handles this cleanly.
- **R2 — Workflow JSONL records are sparse or schema-unstable**: OQ-A may show that JSONL has some fields but they're not reliable. Mitigation: document the gap; ship what's reliable; defer the rest.
- **R3 — PTY infrastructure (node-pty) doesn't load on this machine** (build issue): we use it elsewhere but haven't exercised it in the dispatcher path. Mitigation: OQ-C explicitly verifies node-pty loads before any design.
- **R4 — Doctor regex / `cc` plugin id confusion after rename**: probes use `cc` as the plugin id now (post-Plan-0014). Mitigation: T1 probes run via `node packages/plugin-codex/scripts/cc.mjs` (renamed dispatcher).
- **R5 — Frozen Plan 0014 dir contamination**: Plan 0014 is frozen; Plan 0015 must not touch it. Mitigation: straggler-grep exclusion list updated to include `0014`.

## 6. Test count target

Plan 0014 close baseline: **1771** (1485 npm test + 28 attach + 258 bench).

Plan 0015 target net delta (range based on adaptive scope):
- **Scope B (defer-only)**: +0-5 tests
- **Scope A or A-partial (1 new skill)**: +15-25 tests
- **Mixed (2 new skills)**: +30-40 tests

Final combined: **1771 to ~1810** depending on outcomes.

## 7. Acceptance criteria (overall)

- T1 artifacts written with explicit verdicts per OQ
- T2 implementation matches T1 outcomes (or explicit defer to Plan 0016)
- All local + remote CI gates green
- Marketplace `--check` exit 0 with appropriate count
- Cost paragraph byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged); v0.2.0 immutable
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish`
- If `/workflows` or `/tasks` capabilities are reachable via CLI: those capabilities documented in `$claude-status`/`$claude-workflows` SKILL.md
- If PTY is required: deferred to Plan 0016 with the OQ-C artifact as the design basis

## 8. Backlog (carried forward, NOT in Plan 0015)

- **PTY-injection harness for `/workflows`/`/tasks`** — Plan 0016 if T1 returns B
- **Interactive workflow control** (pause/resume/restart/save keystrokes) — even with PTY, this is a heavy interactive surface; likely Plan 0017+
- **`/workflows` save-as-command** (`s` keystroke action) — out of scope; that's a workflow library management workflow done in Claude TUI
- **`Ctrl+G` script editor** — TUI editor escape; not a CLI surface
- Skill-discovery surface test — maintainer's earlier focus area; queued for after Plan 0015
- v0.3.0 release tag — separate maintainer step
- Display-name prose harmonization (`Claude Companion` → `CC`) — Plan 0014 backlog candidate
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit
