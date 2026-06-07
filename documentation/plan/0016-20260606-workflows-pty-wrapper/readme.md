# Plan 0016 — `/workflows` PTY-injection wrapper (read-only `$claude-workflows` skill)

**Status**: `implementing`
**Started**: 2026-06-06
**Stage 1 approved**: 2026-06-06 (maintainer authorized full cycle)
**Drafted from**: Plan 0015 OQ-C handoff. Adaptive scope from Plan 0015 returned: `/workflows` requires PTY (31% CLI coverage); node-pty available; `attach.ts` provides 70% of harness pattern; ~150-200 LOC estimated.
**Last updated**: 2026-06-06

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-06** — Adaptive scope: T1 ANSI capture + architectural sketch; T2-T5 ship per verdict |
| 2 — Implement | `2-implement.md` | **in progress 2026-06-06** — T1 dispatching via single executor |
| 3 — Audit | `3-audit.md` | not started — requires independent context |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Ship a **read-only** `$claude-workflows` skill that drives Claude Code's `/workflows` TUI panel via PTY-injection and surfaces the listing + drill-down data Codex can't currently reach. **First plan in the session that ships genuine new runtime infrastructure** (PTY-driving of an interactive TUI; previous plans wrapped existing CLI shapes).

Scope:
- **Read-only**: list workflows + drill into a specific workflow's phases + per-agent token/duration. NO interactive control (no pause/resume/restart/save keystrokes).
- Reuses `packages/driver-claude-code/src/attach.ts` pattern (spawn → warmup → bracketed-paste write → ring-buffer capture → parse). Documented driver exception (precedent: Plans 0012 T5 / 0014 T2e — runtime/driver touches when justified).
- Parser is fragile by nature (ANSI text); fixture-based tests for parse correctness; live integration test gated to local dev.

Interactive workflow control (pause/resume/restart/save) is **explicitly out of scope** — likely Plan 0017+ if maintainer authorizes.

## Why this is bigger than recent plans

The last several plans (0010-0015) wrapped existing CLI shapes: slash command via `claude --bg`, version-floor checks, docs updates. Plan 0016 ships **genuine new runtime code**:

- New PTY-driving subprocess management (spawn claude in a pseudo-TTY)
- New ANSI text parsing (Claude renders the panel with cursor moves, color escapes, scroll regions)
- New integration-test paradigm (we don't currently have PTY-based tests; previous tests use mock-claude or dispatcher unit tests)

This warrants:
- Stage 1 plan with MORE detail than usual
- T1 probe that produces BOTH an ANSI capture artifact AND an architectural sketch
- Conservative test discipline: fixture-based parse tests in CI + a manual end-to-end recipe for local dev

## Parallel with prior plans

Plan 0016 must NOT touch:
- `tools/bench/**`, `documentation/plan/0004-*/artifacts/**`
- `documentation/plan/0005-*` (deferred)
- `documentation/plan/0006-*` through `0015-*` (frozen)
- `packages/plugin-codex/README.md` cost paragraph
- `.github/workflows/ci.yml`

Plan 0016 DOES touch (documented exceptions for runtime/driver):
- New `packages/plugin-codex/skills/claude-workflows/SKILL.md`
- `packages/plugin-codex/scripts/cc.mjs` (new `case 'workflows':` + `cmdWorkflows`)
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt 13 → 14)
- `packages/driver-claude-code/src/` — possibly a new `workflows-panel.ts` helper if reusing attach.ts infrastructure (DOCUMENTED EXCEPTION; precedent Plans 0012 T5 / 0014 T2e)
- `packages/runtime/src/` — possibly a thin adapter to expose the new driver function (DOCUMENTED EXCEPTION if needed)
- Marketplace plumbing (allowlist 24 → 25; smoke + manifest + RELEASING.md count bumps)
- Tests (parser unit tests + dispatcher tests + skills-manifest tests + integration test fixture)
- READMEs

## Adaptive scope mechanic

T1 produces an ANSI capture + architectural sketch. Verdicts:

- **A — Parse-tractable + harness reuse high**: ship `$claude-workflows` as designed.
- **A-partial — Parse-tractable but harness needs new code**: ship with documented technical debt + simplified initial parser.
- **B — Parse-fragile / unstable across runs**: defer; document gaps for Plan 0017+; ship a documentation update only.

Most likely outcome: A or A-partial. PTY panels are common in Claude Code-class TUIs (see `attach.ts` already handles attach-style panels).
