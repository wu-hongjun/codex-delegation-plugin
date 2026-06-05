# Plan 0010 — Codex power-user surfaces ($claude-goal + subagent / workflow how-tos)

**Status**: `complete`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-05
**Stage 2 complete**: 2026-06-05 (CI run `27034918547` success)
**Stage 3 complete**: 2026-06-05 (verdict `ready-for-report`; ZERO findings — second clean audit in this session)
**Stage 4**: SKIPPED — audit verdict allowed direct progression to Stage 5
**Stage 5 complete / Completed**: 2026-06-05
**Last updated**: 2026-06-05

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-05** — drafted from inline Plan 0009 close-out; OQ-B/C/D/E resolved inline; OQ-A deferred to T3a empirical probe; 4 T-tasks; +30-40 test target |
| 2 — Implement | `2-implement.md` | **complete 2026-06-05** — T1+T2+T3a+T3b+T4 done; 1661 tests pass; 21 derived files; CI run `27034918547` `success` on all 4 matrix legs |
| 3 — Audit | `3-audit.md` | **complete 2026-06-05** — verdict `ready-for-polish` → upgraded to `ready-for-report`; ZERO findings (second clean audit in this session); auditor `oh-my-claudecode:critic` (Opus, fresh-context) |
| 4 — Polish | `4-polish.md` | **SKIPPED** — Stage 3 verdict was `ready-for-report` |
| 5 — Report | `5-report.md` | **complete 2026-06-05** — final report; status flipped `auditing → reporting → complete`; no release tag (plugin version unchanged at `0.2.0`) |

## Summary

Plan 0010 makes Codex a **power user of Claude Code**. Three additions:

1. **Subagent-spawning guidelines** — a new plugin-README section + extensions to `$claude-delegate` / `$claude-workflow` SKILL.md bodies that teach Codex how to phrase prompts that exploit Claude Code's subagent fan-out advantage (parallel `Agent` tool spawns, `ultracode:` for orchestrated workflows, when to ask for "deep" vs "quick" subagent work).
2. **Full dynamic-workflow how-to** — a new section in the plugin README + richer `$claude-workflow` SKILL.md body covering when to use vs `$claude-delegate`, the `meta` / `phase()` / `agent()` script shape with 2-3 example scripts, cost / cancel / approval-flow patterns.
3. **New `$claude-goal <condition>` skill** wrapping Claude Code's `/goal` slash command — Codex can now set a stop-condition for a Claude session ("keep working until all tests pass") instead of relying on a single-turn delegation.

Skill count grows 9 → 10. Marketplace allowlist 20 → 21. Plugin version unchanged at `0.2.0`; no release tag.

## Parallel with Prior plans

Plan 0010 must NOT touch:

- `tools/bench/**`
- `documentation/plan/0004-*/artifacts/**` (Plan 0004 frozen at `7d9b5f1`)
- `documentation/plan/0005-*` (Plan 0005 deferred)
- `documentation/plan/0006-*`, `0007-*`, `0008-*`, `0009-*` (all complete; frozen)
- `packages/plugin-codex/README.md` L341 cost paragraph
- `.github/workflows/ci.yml`
- `packages/runtime/**` (no runtime changes)

Plan 0010 DOES touch (new code allowed):
- `packages/plugin-codex/scripts/claude-companion.mjs` — new `case 'goal':` (mirror of `case 'workflow':` from Plan 0008, but for slash-command injection)
- `packages/plugin-codex/skills/claude-goal/SKILL.md` (NEW)
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt 9 → 10)
- `marketplace/MANIFEST.md` (20 → 21 derived files)
- `tools/package-marketplace.mjs` `DERIVED_FILES` (+1 entry)
- `tools/smoke-marketplace.mjs` `SKILL_NAMES` (9 → 10)
- `documentation/RELEASING.md` (skill list +1; counts 20 → 21)
- Plugin + marketplace READMEs (new how-to sections + new skill entry)
- Tests
