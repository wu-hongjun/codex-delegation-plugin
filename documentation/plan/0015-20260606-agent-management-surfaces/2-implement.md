# Plan 0015 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes re-verified; awaiting CI verification)
**Date**: 2026-06-06
**Stage 1 commit**: `8e65d29` (Plan 0015 Stage 1 approved)

Single `oh-my-claudecode:executor` agent pass for T1 (three probes). T2 (docs-only) executed inline by orchestrator. T3/T4/T5 minimal (no marketplace bumps; +3 docs regression tests).

## T1 — Three empirical probes

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- [`artifacts/oq-a-workflows-panel-coverage-probe-20260606.txt`](artifacts/oq-a-workflows-panel-coverage-probe-20260606.txt)
- [`artifacts/oq-b-tasks-panel-coverage-probe-20260606.txt`](artifacts/oq-b-tasks-panel-coverage-probe-20260606.txt)
- [`artifacts/oq-c-pty-feasibility-20260606.txt`](artifacts/oq-c-pty-feasibility-20260606.txt)

### OQ-A `/workflows` panel coverage — **Verdict B**

Claude Code's native `/workflows` slash command is a TUI-only interactive panel (`"status": "waiting"`, `"waitingFor": "dialog open"` — identical to `/tasks` from Plan 0011). The existing `cc workflow` subcommand does NOT drive the native panel; it prepends `ultracode:` to trigger a NEW workflow via the keyword path (which is the correct trigger pattern). The panel `/workflows` is the MANAGEMENT surface, distinct from the trigger.

CLI/JSONL coverage of `/workflows` panel fields: **4 of 13 fields (31%)** — well below the 80% threshold for shipping a CLI wrapper. Specifically:
- Covered via `claude agents --json`: `sessionId`, `name`, `status`, basic session metadata
- NOT covered: phase records, per-agent token totals, agent-spawn records, drill-down details, pause/resume/stop/restart controls

**Implication for T2**: Scope B. No `$claude-workflows` skill can ship based on CLI/JSONL alone. T2 = docs-only update; defer the full panel to Plan 0016 with OQ-C as the PTY-injection design basis.

### OQ-B `/tasks` panel coverage — **Verdict A**

`claude agents --json` exposes all fields the `/tasks` panel renders: `sessionId`, `name`, `status`, `kind`, `cwd`, `pid`, `startedAt`, `waitingFor`. The only near-gap — command-type label (delegate/workflow/fork) — is already covered by `cc status` reading the plugin job store.

**Implication for T2**: No new `$claude-tasks` skill needed. Document equivalence in `$claude-status` SKILL.md. The CLI surface `$claude-status --all` IS the `/tasks` panel for Codex users.

### OQ-C PTY feasibility — **Feasible; Plan 0016 prerequisite probe required**

`node-pty` loads cleanly. The existing `packages/driver-claude-code/src/attach.ts` provides the complete pattern (spawn → warmup → bracketed-paste write → ring-buffer capture → parse) — a `/workflows` reader could reuse ~70% of that boilerplate.

The remaining unknown is the panel's rendered ANSI text format with **active workflow sessions** (the OQ-A probe ran against an empty workflow state). Plan 0016 needs to:
1. Run a live multi-agent workflow (real subagent fan-out)
2. Capture the `/workflows` panel's ANSI render output
3. Define the parser format

The PTY harness sketch is ~150-200 lines; integration-level tests required. Out of scope for Plan 0015.

## T2 — Documentation update (Scope B outcome)

**Files modified**: `packages/plugin-codex/skills/claude-status/SKILL.md`

Appended new section `### Relationship to Claude Code's /tasks and /workflows panels` documenting:
1. **`/tasks` equivalence**: `$claude-status --all` is the CLI equivalent; both surface the same `claude agents --json` data set. No new skill needed.
2. **`/workflows` deferral**: no CLI equivalent currently; PTY-injection wrapper deferred to Plan 0016.
3. **`claude attach <sessionId>`**: documented as the interactive attach path for drilling into a live session — referenced via the `Claude session:` line in `$claude-status` output.

Also added `claude attach <sessionId>` to the `### Next steps` list.

`node tools/package-marketplace.mjs --write` resynced the marketplace mirror (24 derived files unchanged).

## T3 — Marketplace plumbing (no-op)

Scope B outcome means no new skill, no count bumps. `--check` exit 0 with 24 derived files (unchanged from Plan 0014). Skill count remains 13. `SKILL_NAMES` unchanged across all 7 test files. `documentation/RELEASING.md` unchanged.

## T4 — Tests

3 new regression tests in `packages/plugin-codex/test/readme.test.mjs` (after Plan 0013's "saved workflows" tests):

1. `claude-status/SKILL.md documents /tasks panel equivalence (Plan 0015 T2)` — asserts the SKILL.md mentions `/tasks` + `claude agents --json` data source
2. `claude-status/SKILL.md notes /workflows panel deferral (Plan 0015 T2)` — asserts mention of `/workflows` + either "Plan 0016" or "PTY-injection"
3. `claude-status/SKILL.md documents claude attach interactive path (Plan 0015 T2)` — asserts mention of `claude attach`

Test count delta: **+3**.

## T5 — Local gates

| Gate | Result |
|---|---|
| Build (`tsc --build`) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; **24 derived (unchanged)** |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **13 skills (unchanged)** |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` (4 lanes) | **1488** (mock 68 + runtime 173 + driver 187 + plugin **1060**), 0 fail |
| `npm run test:attach` | **28**, 0 fail (unchanged) |
| `npm run test:bench` | **258**, 0 fail (unchanged) |
| `node packages/plugin-codex/scripts/cc.mjs --help` | works (renamed dispatcher unaffected) |

### Test count (Stage 2 close)

| Lane | Plan 0014 close | Plan 0015 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1057 | **1060** | **+3** |
| **`npm test` chain** | **1485** | **1488** | **+3** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1771** | **1774** | **+3** |

Plan target was +0 to +5 for Scope B (defer-only). Actual: **+3** (one per docs assertion). Each test pins a distinct contract.

### Remote CI

Awaiting `git push`. Recorded in Stage 3/5.

## Files modified in Stage 2 (consolidated)

Source changes:
- `packages/plugin-codex/skills/claude-status/SKILL.md` (T2 new section + Next steps extension)

Tests:
- `packages/plugin-codex/test/readme.test.mjs` (+3 regression tests)

Marketplace mirror (derived via `--write`):
- `marketplace/plugins/cc/skills/claude-status/SKILL.md`

Artifacts:
- `documentation/plan/0015-20260606-agent-management-surfaces/artifacts/oq-a-workflows-panel-coverage-probe-20260606.txt`
- `documentation/plan/0015-20260606-agent-management-surfaces/artifacts/oq-b-tasks-panel-coverage-probe-20260606.txt`
- `documentation/plan/0015-20260606-agent-management-surfaces/artifacts/oq-c-pty-feasibility-20260606.txt`

## Adaptive scope outcome

Plan 0015 was scoped as adaptive (A/B/C based on probe outcomes):
- **OQ-A B**: no new `$claude-workflows` skill; deferred to Plan 0016 with OQ-C as design basis
- **OQ-B A**: no new `$claude-tasks` skill; equivalence documented
- **OQ-C feasible**: PTY-injection harness sketch present; Plan 0016 well-scoped

Final scope: **docs-only update + 3 regression tests + 3 artifacts**. No skills added; no marketplace bumps; no breaking changes.

This is a "probe + scope" plan that **explicitly sizes Plan 0016 for the maintainer**. Plan 0016 has concrete design constraints to work from:
- `attach.ts` provides 70% of the PTY harness pattern
- The `/workflows` panel rendered format with active sessions needs empirical capture (Plan 0016 T1 prerequisite)
- Estimated ~150-200 lines for the parser + integration tests

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `v0.2.0` tag at `ea595e1` (unchanged — no retag)
- `packages/plugin-codex/README.md` cost paragraph: byte-identical (no README edits this plan)
- `tools/bench/**`, `documentation/plan/0004-*/` through `0014-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff
- `packages/runtime/**`: empty diff (no exception this plan)
- `packages/driver-claude-code/**`: empty diff (`attach.ts` consulted in OQ-C but NOT modified)
- No `~/.claude/` or `~/.codex/` mutation (probe sessions cleaned up via `cc stop`)
- T9.5 cache invariant: marketplace tree resynced; 24 derived byte-identical
- Skill count: 13 (unchanged); marketplace allowlist: 24 (unchanged); plugin version field: `0.2.0` (unchanged)

## Plan readme status flip

`documentation/plan/0015-20260606-agent-management-surfaces/readme.md` flipped from `implementing` → `auditing`. Stage 2 complete-pending-CI.
