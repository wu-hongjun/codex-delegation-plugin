# Plan 0008 Stage 2 — Implement

**Status**: complete (local gates green; awaiting CI verification)
**Date**: 2026-06-05
**Stage 1 commit**: `ae0faca` (Plan 0008 Stage 1 approved)

All 8 T-tasks executed via subagent orchestration. Local Claude Code at implementation: v2.1.153 (one short of the v2.1.154 changelog gate, but dynamic workflows confirmed empirically available — see Plan 0007 follow-up artifact).

## T1 — Empirical probe (`claude -p` workflow path)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: [`artifacts/oq-c-probe-20260605.txt`](artifacts/oq-c-probe-20260605.txt) (36 lines)

**Outcome B** — `claude -p "ultracode: respond with the literal word OK and stop. one phase, one agent."` returned `result: "OK"` in `num_turns: 1` with `output_tokens: 6` after 6.8s (exit 0). Claude treated `ultracode:` as a plain text prefix — **no workflow planning, no approval dialog, no multi-phase structure**. The `ultracode:` keyword is TUI-only on v2.1.153.

**Design implication**: Plan 0008's choice to use `claude --bg` (not `claude -p`) is empirically correct. The `claude -p` non-interactive workflow path is not feasible; backlog item filed.

## T2 + T4 — Skill manifest + manifest registration

**Agent**: `oh-my-claudecode:executor`

**Files added/changed**:
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` (NEW, 47 lines) — frontmatter `name: claude-workflow`; body covers run line `node ".../scripts/claude-companion.mjs" workflow "<prompt>"`, accepted flags (`--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`, `--yes` opt-in), explicit `--allow-edit` rejection, approval-flow warning (user must `claude attach <jobId>`), token-cost notice.
- `packages/plugin-codex/.codex-plugin/plugin.json` — `interface.defaultPrompt` array bumped 8 → 9 with new entry "Run a Claude Code dynamic workflow."
- `packages/plugin-codex/test/skills-manifest.test.mjs` — `SKILL_NAMES` + `SKILL_SUBCOMMANDS` extended; 6 new skill-specific describe blocks (dir exists, SKILL.md exists, run line uses `workflow` subcommand, no `--yes` auto-injection, no `--allow-edit`, defaultPrompt contains workflow entry); existing 8-count assertions bumped to 9.

**Tests added in T4**: 6 new (within +4-6 target).

**Mitigation R6 (skill count drift)**: every assertion that pinned `8` was located via grep and updated in lockstep.

## T3 — Dispatcher `workflow` subcommand

**Agent**: `oh-my-claudecode:executor`
**Approach**: A (shared helper). The existing `cmdDelegate` body (~120 lines) was extracted into a new `_runDelegateCore(commandName, args, env, opts)` helper. `cmdDelegate` is now a 3-line wrapper (identity prompt transformer, no extra output). `cmdWorkflow` is a parallel wrapper that prepends `ultracode: ` and appends the approval-flow note. Net diff: ~90 lines added.

**Files changed**:
- `packages/plugin-codex/scripts/claude-companion.mjs` — `case 'workflow':` added to dispatch switch; new `cmdWorkflow` + `_runDelegateCore`; `printUsage` includes workflow row
- `packages/plugin-codex/test/dispatcher.test.mjs` — 7 new tests under new describe blocks

**Tests added**: 7 (within +5-8 target).
**Test names**:
1. `--help mentions workflow command`
2. `workflow --yes -- "test prompt"` happy path (job created)
3. `workflow prompt is prefixed with ultracode:`
4. `workflow without --yes (non-TTY stdin)` (rejected with privacy ack message)
5. `workflow rejects --allow-edit`
6. `workflow accepts standard delegate flags` (`--model`, `--effort`, `--permission-mode`)
7. `workflow approval-flow note appended after job block`

**Sanity**: `node packages/plugin-codex/scripts/claude-companion.mjs --help | grep workflow` returns `workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)`.

## T5 — README workflow section + scope bump

**Agent**: `oh-my-claudecode:executor`

**Files changed**:
- `packages/plugin-codex/README.md`:
  - "Eight skills" → "Nine skills" in `## Current v1 scope` lead-in
  - New 9th bullet for `**\`$claude-workflow\`**`
  - New `### $claude-workflow` subsection under `## Commands and skills` (covers description, run example, approval flow, token-cost warning, accepted flags, rejected `--allow-edit`, version floor 2.1.153)
  - "All eight commands" → "All nine commands" in `## Direct dispatcher usage`
  - New dispatcher example line for `workflow`
- `marketplace/plugins/claude-companion/README.md`:
  - Skill-count "8 skills" → "9 skills"
  - New `- \`$claude-workflow\`` bullet
  - New `### $claude-workflow` subsection (shorter; end-user wording)
  - Smoke-test pointer text updated to "all 9 skill names"
- `packages/plugin-codex/test/readme.test.mjs` — "eight commands" / "Eight skills" wording bumped
- `packages/plugin-codex/test/docs-split.test.mjs` — `SKILL_NAMES` extended; 2 new describes (9 it() tests) asserting workflow docs in both surfaces

**Tests added**: 9 (overshoot vs +1-2 target; per `feedback_test_count_overshoot`, each test asserts a distinct doc contract — description present, run example present, approval flow mentioned, cost warning present, version floor mentioned, etc.).

**Wording constraints honored**: cost paragraph at L341 byte-identical; no OQ4 forbidden tokens introduced; no `ultracode:` keyword leakage into user-facing prose.

## T6 — Probe floor split

**Agent**: `oh-my-claudecode:executor`

**Files changed**:
- `packages/plugin-codex/scripts/claude-companion.mjs` — single `VERSION_FLOOR = '2.1.154'` replaced with three per-probe constants:
  - `FLOOR_OPUS_4_8 = '2.1.154'`
  - `FLOOR_WORKFLOWS = '2.1.153'` (lowered per empirical evidence)
  - `FLOOR_BG_EXEC = '2.1.154'`
  - Three probe-building sites updated to use the new constants
- `packages/plugin-codex/test/setup-probes.test.mjs` — 2 new tests asserting divergent floors (workflows cites 2.1.153 if warn; opus + bg-exec cite 2.1.154 if warn)

**Tests added**: 2 (within +1-2 target).

**Empirical probe output after fix** (on local v2.1.153):
```
ok    workflows-supported   Dynamic workflows available via /workflows
warn  opus-4-8-supported    Opus 4.8 requires Claude Code >= 2.1.154 (current 2.1.153)
warn  bg-exec-supported     claude --bg --exec requires Claude Code >= 2.1.154 (current 2.1.153); --exec is silently dropped on older versions
```

The Plan 0007-shipped false `warn` for `workflows-supported` is now corrected.

## T7 — Marketplace repackage (orchestrator-absorbed)

**Files changed**:
- `tools/package-marketplace.mjs` — `DERIVED_FILES` allowlist extended with `skills/claude-workflow/SKILL.md` (19 → 20 derived files)
- `tools/smoke-marketplace.mjs` — `SKILL_NAMES` extended; "eight"/"Eight" → "nine"/"Nine" throughout the prose; "8 skill names" → "9 skill names"; "8 skills below" → "9 skills below"
- `marketplace/MANIFEST.md` — "19 files" → "20 files"; new bullet `- \`skills/claude-workflow/SKILL.md\``
- `documentation/RELEASING.md` — "19 derived files" / "19 source-derived files" → "20" (3 occurrences); skill list extended with `- \`$claude-workflow\``
- `packages/plugin-codex/test/marketplace-layout.test.mjs` — `EXPECTED_SKILL_NAMES` alphabetical insert of `claude-workflow`; `DERIVED_FILES_ALLOWLIST` extended; "19 derived files" / "8 expected skill directories" / "8 skill directories" wording bumped
- `packages/plugin-codex/test/marketplace-smoke.test.mjs` — `SKILL_NAMES` extended; "8 skill names" → "9 skill names" (test names + comments)

After `--write` + `--check`: `check: OK — 20 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.`

## T8 — Local gates (orchestrator-absorbed)

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 20 derived + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **9** skills (was 8) |
| `npm run lint` | exit 0 (clean) |
| `npm run typecheck` | exit 0 (clean) |
| `npm run format` | exit 0 (clean) |
| `npm test` (4 lanes) | **1286 tests** (mock 68 + runtime 172 + driver 187 + plugin 859), 0 fail |
| `npm run test:attach` | **28 tests**, 0 fail |
| `npm run test:bench` | **258 tests**, 0 fail |
| **Combined** | **1572 tests**, 0 fail |

Plan 0007 close baseline: 1531. Plan 0008 net delta: **+41 tests** (target was +10-15; overshoot of +26-31 justified per `feedback_test_count_overshoot` — see per-task breakdown above).

### Remote CI

Awaiting `git push`. Will be recorded in this file after the run completes.

## Files modified in Stage 2 (consolidated)

Source code:
- `packages/plugin-codex/scripts/claude-companion.mjs` (T3 + T6)

New skill:
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` (T2 NEW)

Plugin manifest:
- `packages/plugin-codex/.codex-plugin/plugin.json` (T4)

Tests:
- `packages/plugin-codex/test/dispatcher.test.mjs` (T3)
- `packages/plugin-codex/test/skills-manifest.test.mjs` (T4)
- `packages/plugin-codex/test/docs-split.test.mjs` (T5)
- `packages/plugin-codex/test/readme.test.mjs` (T5)
- `packages/plugin-codex/test/setup-probes.test.mjs` (T6)
- `packages/plugin-codex/test/marketplace-layout.test.mjs` (T7)
- `packages/plugin-codex/test/marketplace-smoke.test.mjs` (T7)

Docs / packaging:
- `packages/plugin-codex/README.md` (T5)
- `marketplace/plugins/claude-companion/README.md` (T5 + T7)
- `marketplace/MANIFEST.md` (T7)
- `documentation/RELEASING.md` (T5 + T7)
- `tools/package-marketplace.mjs` (T7)
- `tools/smoke-marketplace.mjs` (T7)

Marketplace payload (derived, written by `--write`):
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs` — sync of T3 + T6 source change
- `marketplace/plugins/claude-companion/skills/claude-workflow/SKILL.md` — NEW (synced from T2)
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` — sync of T4 defaultPrompt change

Artifact:
- `documentation/plan/0008-20260605-claude-workflow-skill/artifacts/oq-c-probe-20260605.txt` (T1)

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `packages/plugin-codex/README.md` L341 cost paragraph: byte-identical (verified — `grep -c` returns 1)
- `tools/bench/**`: empty diff vs `plan-0004-pre-cutover`
- `documentation/plan/0004-*/`: empty diff
- `documentation/plan/0005-*/`: empty diff
- `documentation/plan/0006-*/`: empty diff
- `documentation/plan/0007-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff (no CI shape changes)
- `packages/runtime/**`: empty diff
- `packages/driver-claude-code/src/**`: empty diff
- Skill `SKILL.md` bodies (other than the new `claude-workflow/`): unchanged
- T9.5 cache-execution invariant preserved (new skill ships in the bundled marketplace tree; `--check` exit 0)
- No `~/.claude/` or `~/.codex/` mutations during Stage 2
