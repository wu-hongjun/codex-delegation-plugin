# Plan 0007 — Claude Code w22+ parity (docs + doctor probe)

**Status**: `implementing`
**Started**: 2026-06-05
**Stage 1 approved**: 2026-06-05
**Last updated**: 2026-06-05

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-05** — promoted from `documentation/research/20260604-claude-code-w22-audit/plan-0007-candidate.md`; OQ-A resolved via direct changelog read (v2.1.154 = workflows/Opus4.8/`--bg --exec`; v2.1.152 = `disallowed-tools`/`MessageDisplay`/`reloadSkills`; v2.1.133 = `--fallback-model`; v2.1.161 = `working` status; v2.1.162 = `waitingFor` field); OQ-B/C/D all resolved; 6 T-tasks; +14-18 test target |
| 2 — Implement | `2-implement.md` | **in progress 2026-06-05** — T1-T4 dispatching in parallel via executor subagents |
| 3 — Audit | `3-audit.md` | not started — requires independent context |
| 4 — Polish | `4-polish.md` | not started |
| 5 — Report | `5-report.md` | not started |

## Summary

Plan 0007 is a small, docs-focused parity pass against Claude Code releases v2.1.133 → v2.1.162 (the audit period in [`documentation/research/20260604-claude-code-w22-audit/`](../../research/20260604-claude-code-w22-audit/)). Scope: 6 T-tasks resolving five MED-severity audit findings (G2 parser tolerance, G3 status enum, G4 doctor version-floor probe, G5 `--fallback-model` docs note, G6 `MessageDisplay` divergence docs note). Net change: ~14–18 new static tests; one new helper module (`packages/plugin-codex/scripts/lib/claude-version.mjs`); three new doctor probes; two new README troubleshooting subsections.

Plan 0007 deliberately defers G1 (dynamic workflows wrapping) to a future plan because the workflow feature gate is v2.1.154 and brew currently ships v2.1.153 on the maintainer's machine. G1 reopens as Plan 0008 once brew publishes v2.1.154+.

## Parallel with Plan 0004 / Plan 0005

Plan 0004 is frozen at tag `plan-0004-pre-cutover` (`7d9b5f1`). Plan 0007 must NOT touch:

- `tools/bench/**`
- `documentation/plan/0004-*/artifacts/**`
- `packages/plugin-codex/README.md` `## Cost and prompt-cache wording` paragraph (Plan 0004 T12 owns this)
- Plan 0004 measurement comparability between pre- and post-cutover

Plan 0005 (stop-time review gate) is `deferred` pending Plan 0004 T11/T12 data. Plan 0007 does NOT subsume Plan 0005; the two are unrelated.

## Plugin version

Plan 0007 implementation does NOT bump the plugin version. Tagging `v0.3.0` (or whatever the next semver is) is a separate maintainer-driven step that follows `documentation/RELEASING.md` after Plan 0007 is complete.
