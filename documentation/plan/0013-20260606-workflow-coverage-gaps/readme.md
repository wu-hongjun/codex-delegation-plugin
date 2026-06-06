# Plan 0013 — Workflow coverage gaps (`$claude-deep-research`, `--effort ultracode`, saved-workflow `args` docs)

**Status**: `implementing`
**Started**: 2026-06-06
**Stage 1 approved**: 2026-06-06 (maintainer authorized full cycle)
**Drafted from**: post-Plan-0012 coverage gap analysis against [Claude Code workflows docs](https://code.claude.com/docs/en/workflows)
**Last updated**: 2026-06-06

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-06** — Adaptive scope: 3 OQ probes condition T2-T3 implementation; T4 docs ship unconditionally |
| 2 — Implement | `2-implement.md` | **in progress 2026-06-06** — T1 probes dispatching via single executor; T2-T6 sequential after verdicts |
| 3 — Audit | `3-audit.md` | not started — requires independent context |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Three gaps in the plugin's coverage of Claude Code's dynamic-workflow surface (per [code.claude.com/docs/en/workflows](https://code.claude.com/docs/en/workflows)):

1. **`/deep-research <question>`** — bundled workflow that fans out cross-checked web searches. Not currently exposed as a Codex skill. Most-cited entry point in the docs.
2. **`/effort ultracode`** — session-level setting that flips Claude into automatic-workflow planning for every task. Our `--effort` flag is value-agnostic; need to confirm whether passing `--effort ultracode` to the CLI activates the same auto-orchestration mode, or whether only the TUI slash command works.
3. **Saved-workflow `args` parameter** — docs describe `args` as the structured input mechanism for saved `/<name>` workflows. We have no documentation explaining how to invoke saved workflows from Codex (the answer is likely `$claude-delegate -- "/<name> <args>"`), and no mention of `args` semantics.

Pattern: probe-then-implement per gap, mirroring Plan 0008/0010/0011/0012 discipline. T1's three probes condition T2-T4 scope adaptively. T5+ handle marketplace/tests.

Plugin version unchanged at `0.2.0`. v0.3.0 still a clean release candidate after Plan 0013 closes.

## Out-of-scope (explicit non-coverage)

The following workflow-related surfaces from the docs are **deliberately deferred**:

- **`/workflows` TUI panel** (agent management — phase view, drill-down, pause/resume/stop/restart, save as `/<name>`) — TUI-only, same blocking-on-input class as `/tasks` (Plan 0011 Verdict B). Defer to Plan 0014+ if/when Claude exposes a JSON surface or we invest in PTY injection.
- **Task panel below input box** (inline Claude TUI progress) — Codex equivalent already shipped via `$claude-status`.
- **`/config` Dynamic workflows toggle** — settings management, not a workflow trigger.

## Parallel with prior plans

Plan 0013 must NOT touch:
- `tools/bench/**`, `documentation/plan/0004-*/artifacts/**` (Plan 0004 frozen at `7d9b5f1`)
- `documentation/plan/0005-*` (Plan 0005 deferred)
- `documentation/plan/0006-*` through `0012-*` (all complete; frozen)
- `packages/plugin-codex/README.md` cost paragraph (around L636)
- `.github/workflows/ci.yml`
- `packages/runtime/**` (no runtime changes expected; Plan 0012's `doctor.ts` exception does not extend here)
- `packages/driver-claude-code/**`

Plan 0013 DOES touch:
- Possibly new `packages/plugin-codex/skills/claude-deep-research/SKILL.md` (T1 OQ-B verdict-dependent)
- Possibly new `packages/plugin-codex/skills/claude-effort/SKILL.md` (T1 OQ-A verdict-dependent)
- `packages/plugin-codex/scripts/claude-companion.mjs` — new cases + cmdXxx per A-verdict skill
- `packages/plugin-codex/.codex-plugin/plugin.json` — defaultPrompt 12 → 12+N
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` — `args` parameter docs (always)
- Possibly `packages/plugin-codex/skills/claude-delegate/SKILL.md` — saved-workflow invocation hint (always)
- Marketplace plumbing (allowlist + manifest + smoke + RELEASING.md count bumps if N>0)
- Tests + READMEs

## Adaptive scope based on T1 probe outcomes

After T1 runs the 3 empirical probes:
- **OQ-A (`/effort ultracode`)** Verdict A or via-CLI-flag: NO new skill; document `--effort ultracode` usage on existing skills. Verdict B (TUI-only): ship `$claude-effort <mode>` standalone skill.
- **OQ-B (`/deep-research`)** Verdict A: ship `$claude-deep-research`. Verdict B: defer to backlog.
- **OQ-C (saved workflows / `args`)** is documentation only — no probe verdict required; ships unconditionally.

Skill count delta: **0 to +2** depending on verdicts. Marketplace allowlist: **+0 to +2**.
