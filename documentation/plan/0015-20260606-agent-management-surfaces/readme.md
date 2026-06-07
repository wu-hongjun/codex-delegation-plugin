# Plan 0015 — Agent management surfaces (`/workflows` panel + `/tasks` panel coverage)

**Status**: `complete`
**Started**: 2026-06-06
**Stage 1 approved**: 2026-06-06 (maintainer authorized full cycle)
**Stage 2 complete**: 2026-06-06 (CI run `27079972098` to be recorded post-completion)
**Stage 3 complete**: 2026-06-06 (verdict `ready-for-report`; zero findings; sixth zero-finding audit pattern in this session)
**Stage 4**: SKIPPED — audit verdict allowed direct progression to Stage 5
**Stage 5 complete / Completed**: 2026-06-06
**Drafted from**: maintainer's "/workflows TUI panel wrapper + /tasks PTY-injection design" direction. Both are TUI-blocked-on-input commands; share the same architectural class.
**Last updated**: 2026-06-06

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | `1-plan.md` | **approved 2026-06-06** — Adaptive scope: 3 OQs (CLI-coverage probe + PTY-feasibility); T2 ships per verdicts |
| 2 — Implement | `2-implement.md` | **complete 2026-06-06** — T1 returned B/A/feasible; T2 docs-only update to `$claude-status` SKILL.md documenting `/tasks` equivalence + `/workflows` deferral to Plan 0016; +3 regression tests; 1485 → 1488 npm test (+3) |
| 3 — Audit | `3-audit.md` | **complete 2026-06-06** — verdict `ready-for-report`; zero findings at any severity; auditor `oh-my-claudecode:critic` (Opus, fresh-context) |
| 4 — Polish | `4-polish.md` | **SKIPPED** — Stage 3 verdict was `ready-for-report` |
| 5 — Report | `5-report.md` | **complete 2026-06-06** — final report; status flipped `auditing → reporting → complete`; no release tag (plugin version unchanged at `0.2.0`); Plan 0016 design constraints handed off |

## Summary

Two Claude Code TUI surfaces that Codex currently cannot drive end-to-end:

1. **`/workflows` panel** — agent management view for dynamic workflows. Lists running + completed workflows; drills into phases; per-agent token usage; keystroke controls (`p` pause, `x` stop, `r` restart, `s` save as command). Documented at [code.claude.com/docs/en/workflows](https://code.claude.com/docs/en/workflows). TUI-only — `--bg` would block on keyboard input (same class as `/tasks`).
2. **`/tasks` panel** — Background tasks picker (probed in Plan 0011 OQ-A, returned Verdict B — TUI dialog with "↑/↓ to select · Enter to view · ←/Esc to close" prompt).

**Probe-first discipline**: PTY-injection is heavy infrastructure (we have node-pty bundled but no slash-command-driving harness yet). Before committing to a PTY approach, T1 probes what data is reachable via existing CLI surfaces (`claude agents --json`, JSONL inspection of `~/.claude/projects/<sessionId>/`) WITHOUT PTY. If 80%+ of value is reachable read-only via CLI, the plan ships a thin wrapper skill and defers PTY. If PTY is genuinely required for the missing 20%, T3 designs the minimum viable PTY-injection harness.

Adaptive scope based on T1 outcomes:
- **A — CLI surfaces cover most of it**: ship `$claude-workflows` (read-only list/inspect) and confirm `/tasks` is already covered by `$claude-status --all`. Skill count 13 → 14 (or stays 13 if /tasks needs no new skill).
- **B — PTY-injection genuinely required**: T3 designs the harness; T4 ships PTY-backed `$claude-workflows-control` or similar. Skill count 13 → 14 or 15. Heavier test surface.
- **C — Mixed**: ship read-only CLI skill + defer interactive control to future plan.

## What's deliberately out of scope

- Saving workflows as `/<name>` commands (the `s` keystroke action) — that's a separate user workflow done in Claude TUI; Codex doesn't manage workflow library
- Modifying workflow scripts mid-run (the `Ctrl+G` action) — TUI editor escape; not a CLI surface
- Per-agent `restart` action — would require interactive PTY control; defer if T1 probe shows it's not reachable via CLI

## Parallel with prior plans

Plan 0015 must NOT touch:
- `tools/bench/**`, `documentation/plan/0004-*/artifacts/**` (Plan 0004 frozen at `7d9b5f1`)
- `documentation/plan/0005-*` (Plan 0005 deferred)
- `documentation/plan/0006-*` through `0014-*` (all complete; frozen)
- `packages/plugin-codex/README.md` cost paragraph (around L763 post-rename)
- `.github/workflows/ci.yml`
- `packages/driver-claude-code/**` (we use node-pty via the driver; may need careful read of the existing PTY infrastructure, but no source changes expected outside T3)

Plan 0015 DOES touch (conditionally):
- New `packages/plugin-codex/skills/claude-workflows/SKILL.md` (T1 A or C outcome)
- Possibly new `packages/plugin-codex/skills/claude-tasks/SKILL.md` if T1 OQ-B shows unique coverage
- `packages/plugin-codex/scripts/cc.mjs` — new case + cmdXxx per A-verdict skill (post-Plan-0014 dispatcher name)
- `packages/plugin-codex/.codex-plugin/plugin.json` — defaultPrompt N entries
- Marketplace plumbing (allowlist + manifest + smoke + RELEASING.md count bumps if N>0)
- Tests + READMEs
- Possibly `packages/plugin-codex/scripts/lib/` for PTY/JSONL helpers if T3 is needed
