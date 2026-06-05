# Plan 0009 — Codex-UX polish (docs + skill frontmatter)

**Status**: `complete`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-05
**Stage 2 complete**: 2026-06-05 (CI run `27032649329` success)
**Stage 3 complete**: 2026-06-05 (verdict `ready-for-report`; ZERO findings)
**Stage 4**: SKIPPED — audit verdict allowed direct progression to Stage 5
**Stage 5 complete / Completed**: 2026-06-05
**Last updated**: 2026-06-05

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-05** — drafted from a Codex-UX audit run via two parallel `oh-my-claudecode:code-reviewer` agents; OQ-A through OQ-E all resolved inline; 8 T-tasks; +15-20 test target |
| 2 — Implement | `2-implement.md` | **complete 2026-06-05** — T1-T8 done; 1614 tests pass; 25 files edited; CI run `27032649329` `success` on all 4 matrix legs |
| 3 — Audit | `3-audit.md` | **complete 2026-06-05** — verdict `ready-for-report`; ZERO findings at any severity (first clean audit in this session); auditor `oh-my-claudecode:critic` (Opus, fresh-context) |
| 4 — Polish | `4-polish.md` | **SKIPPED** — Stage 3 verdict was `ready-for-report` (no polish required) |
| 5 — Report | `5-report.md` | **complete 2026-06-05** — final report; plan status flipped `auditing → reporting → complete` in one commit since Stage 4 skipped; no release tag created (plugin version unchanged at `0.2.0`) |

## Summary

Plan 0009 is a focused docs + skill-frontmatter polish pass that addresses 11 findings from a Codex-UX audit. Two parallel review agents reviewed the 9 `SKILL.md` files (from the perspective of how Codex AI routes a user prompt to the right skill) and the user-facing surfaces (plugin README, marketplace README, `interface.defaultPrompt` array, `RELEASING.md`). The pass groups the 11 items into 8 T-tasks. **Zero runtime behavior changes**; all edits are in SKILL.md bodies, frontmatter `description` fields, `plugin.json` `defaultPrompt` entries, and the two READMEs.

Plan 0009 deliberately does **not**:
- Bump the plugin version (stays at 0.2.0)
- Cut a release tag
- Touch any dispatcher / runtime / driver source
- Change the marketplace payload semantics (the new SKILL.md content + `plugin.json` change will resync into the marketplace tree via `package-marketplace --write`)

## Parallel with Plan 0004 / Plan 0005 / Prior plans

Plan 0004 is frozen at tag `plan-0004-pre-cutover` (`7d9b5f1`). Plan 0009 must NOT touch:

- `tools/bench/**`
- `documentation/plan/0004-*/artifacts/**`
- `packages/plugin-codex/README.md` `## Cost and prompt-cache wording` paragraph at L341 (Plan 0001/0002 invariant)
- Any source under `packages/runtime/`, `packages/driver-claude-code/src/`, or `packages/plugin-codex/scripts/` (Plan 0009 only touches SKILL.md, plugin.json, and READMEs)

Plan 0005 (stop-time review gate) is `deferred`. Plan 0009 does NOT subsume Plan 0005.

## Plugin version

Plan 0009 does NOT bump the plugin version. Tagging `v0.3.0` (or whatever the next semver is) is a separate maintainer-driven step that follows `documentation/RELEASING.md`.
