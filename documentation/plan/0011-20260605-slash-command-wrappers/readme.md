# Plan 0011 — Slash-command wrappers (`$claude-tasks` / `$claude-fork` / `$claude-batch`)

**Status**: `complete`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-05
**Stage 2 complete**: 2026-06-05 (CI run `27037662224` success on all 4 matrix legs)
**Stage 3 complete**: 2026-06-05 (verdict `ready-for-report`; zero blocking/major findings; third clean audit in this session)
**Stage 4**: SKIPPED — audit verdict allowed direct progression to Stage 5
**Stage 5 complete / Completed**: 2026-06-05
**Last updated**: 2026-06-05

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-05** — Adaptive scope: T1 probes each of `/tasks`, `/fork`, `/batch`; T2-T5 implementation only for A-verdict commands |
| 2 — Implement | `2-implement.md` | **complete 2026-06-05** — T1 returned B/A/A (`/tasks` deferred); 2 new skills shipped (`$claude-fork` + `$claude-batch`); 1443 npm test + 28 attach + 258 bench = 1729 combined; CI run `27037662224` `success` |
| 3 — Audit | `3-audit.md` | **complete 2026-06-05** — verdict `ready-for-report`; zero blocking/major findings; one pre-existing NIT (stale L3 dispatcher header comment, not introduced by Plan 0011); auditor `oh-my-claudecode:critic` (Opus, fresh-context) |
| 4 — Polish | `4-polish.md` | **SKIPPED** — Stage 3 verdict was `ready-for-report` |
| 5 — Report | `5-report.md` | **complete 2026-06-05** — final report; status flipped `auditing → reporting → complete`; no release tag (plugin version unchanged at `0.2.0`) |

## Summary

Plan 0011 extends the Plan 0010 `$claude-goal` pattern to three additional Claude Code slash commands: `/tasks`, `/fork <directive>`, `/batch <instruction>`. The pattern is mechanically identical — empirical probe each command via `claude --bg "/cmd args"`; for each A-verdict (works as a slash command), ship a thin wrapper skill mirroring `cmdGoal`. B-verdict commands (TUI-only) are deferred to a future plan that bridges via PTY injection.

If all three probes return A: skill count grows **10 → 13**; marketplace allowlist **21 → 24**.
If only some probe A: smaller delta. The plan is adaptive.

## Adaptive scope based on T1 probe outcomes

After T1 runs 3 empirical probes and writes 3 artifacts, the plan implementation proceeds for only the A-verdict commands. The orchestrator decides at the T1→T2 hand-off boundary; the plan readme is updated to reflect the actual delta.

## Parallel with Prior plans

Plan 0011 must NOT touch:
- `tools/bench/**`, `documentation/plan/0004-*/artifacts/**` (Plan 0004 frozen at `7d9b5f1`)
- `documentation/plan/0005-*` (Plan 0005 deferred)
- `documentation/plan/0006-*` through `0010-*` (all complete; frozen)
- `packages/plugin-codex/README.md` L636 cost paragraph
- `.github/workflows/ci.yml`
- `packages/runtime/**`

Plan 0011 DOES touch:
- New SKILL.md files (one per A-verdict slash command)
- `packages/plugin-codex/scripts/claude-companion.mjs` — new `case 'tasks':` / `case 'fork':` / `case 'batch':` plus their `cmdXxx` mirrors of `cmdGoal`
- `plugin.json` `defaultPrompt` (10 → 10+N entries)
- Marketplace plumbing (allowlist + manifest + smoke + RELEASING.md count bumps)
- Tests + READMEs
