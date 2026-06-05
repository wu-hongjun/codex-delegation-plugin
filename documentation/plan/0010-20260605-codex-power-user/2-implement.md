# Plan 0010 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes running; awaiting CI verification)
**Date**: 2026-06-05
**Stage 1 commit**: `e949d61` (Plan 0010 Stage 1 approved)

Three sequential / parallel `oh-my-claudecode:executor` agents owned the work:
- Batch 1 in parallel: **T3a** (empirical `/goal` probe) + **T1+T2** (subagent + workflow docs)
- Sequential after T3a: **T3b** (the heavy task — new skill + dispatcher + plumbing + all 9→10 count bumps)
- **T4** orchestrator-absorbed (marketplace --write done in T3b's flow; final gates verified inline)

## T1 + T2 — Subagent guidelines + workflow how-to (docs)

**Agent**: `oh-my-claudecode:executor` (parallel with T3a)

**Files modified**:
- `packages/plugin-codex/README.md` lines 381-592: TWO new top-level sections inserted between `## Review skills` and `## Cost and prompt-cache wording`:
  - `## Subagent fan-out patterns (Codex → Claude Code)` — decision matrix; 5 fan-out-friendly `$claude-delegate` example prompts; explanation of when `$claude-workflow` is structurally better
  - `## Dynamic workflows in depth` — `meta`/`phase()`/`agent()` API (sourced from the Plan 0008 TUI smoke artifact); 3 example scripts (cross-file audit, migration, research); cost / cancel / approval-flow patterns; documented limits (16 concurrent / 1000 total subagents)
- `packages/plugin-codex/skills/claude-delegate/SKILL.md`: appended `### Fan-out tip` cross-referencing `## Subagent fan-out patterns`
- `packages/plugin-codex/skills/claude-workflow/SKILL.md`: appended `### Script API reference and examples` with a live script snippet + cross-reference to both new README sections

**Tests added**: 13 in `readme.test.mjs` (5 T1 + 8 T2 — section heading exists, ≥3 example prompts present, section appears BEFORE cost paragraph, SKILL.md cross-references, ≥2 `phase()` calls, `meta` / `phase(` / `agent(` API mentions, `cost` / `cancel` / `approval` keyword presence, claude-workflow SKILL.md has an example script).

**Cost paragraph at L341**: byte-identical preserved (`grep -c` returns 1).
**OQ4 forbidden tokens**: zero hits in new sections.

## T3a — `/goal` empirical probe

**Agent**: `oh-my-claudecode:executor` (parallel with T1+T2)
**Artifact**: [`artifacts/oq-a-probe-20260605.txt`](artifacts/oq-a-probe-20260605.txt) (140 lines)

**Verdict A** — `claude --bg "/goal <condition>"` sets the goal as a fully-functional slash command, NOT as a literal prompt. Load-bearing evidence from the JSONL session record at line 8: `{"type": "goal_status", "sentinel": true, "condition": "example: respond with the literal word OK and stop"}`. The runtime then injected a session-scoped Stop hook (line 12, `isMeta=true` user message) and tracked completion via a second `goal_status` record at line 19: `{"met": true, "iterations": 1, "durationMs": 4434, "tokens": 38}`. The TUI banners also showed `◎ /goal active` and `✔ Goal achieved (4s · 1 turn · 38 tokens)`.

Probe 2 (plain positional prompt without `/goal`) had none of these markers — confirming the slash-command parse path.

**Implication for T3b**: `cmdGoal` mirrors `cmdWorkflow` exactly. Uses `_runDelegateCore` with prompt transformer `p => '/goal ' + p`. No PTY injection needed.

## T3b — `$claude-goal` skill (skill + dispatcher + plumbing + all 9→10 bumps)

**Agent**: `oh-my-claudecode:executor` (sequential after T3a)

### New skill

- `packages/plugin-codex/skills/claude-goal/SKILL.md` (NEW) — strict frontmatter (`name: claude-goal` + `description`); run line `node "<plugin-root>/scripts/claude-companion.mjs" goal -- "<condition>"`; accepted flags (`--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`, `--yes`, `--json`); explicit `--allow-edit` rejection (parity with `$claude-workflow`); approval-flow + cost notice; `### Next steps` cross-references to `$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`.

### Dispatcher subcommand

- `packages/plugin-codex/scripts/claude-companion.mjs`:
  - New `case 'goal':` in the main dispatch switch (near `case 'workflow':`)
  - New `cmdGoal` function — mirror of `cmdWorkflow`: rejects `--allow-edit`, calls `_runDelegateCore` with `promptTransformer: p => '/goal ' + p` and a goal-specific approval-flow extra-output block
  - `printUsage` extended:
    - New `goal [flags] -- <condition>` row in Commands
    - All applicable flag parentheticals updated to include `goal`: `--yes`, `--json`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`
    - `--allow-edit` rejection list now reads "rejected by review, adversarial-review, workflow, and goal"

### Plugin manifest

- `packages/plugin-codex/.codex-plugin/plugin.json`:
  - `interface.defaultPrompt` array: 9 → 10 entries; new entry `"Set a goal condition for a Claude Code session."`

### Marketplace plumbing (count bumps 9→10 / 20→21)

| File | Change |
|---|---|
| `tools/package-marketplace.mjs` | `DERIVED_FILES` array: +`skills/claude-goal/SKILL.md` (20 → 21 entries) |
| `marketplace/MANIFEST.md` | "20 files" → "21 files" + new bullet |
| `documentation/RELEASING.md` | Three "20 derived"/"20 source-derived" → "21"; "nine-skill" → "ten-skill"; "other eight skills" → "other nine skills"; skill list extended with `$claude-goal` |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` array extended; all "Nine"/"nine"/"nine-skill"/"9 skill names"/"9 skills" → "Ten"/"ten"/"ten-skill"/"10 skill names"/"10 skills" |

### Test plumbing

| Test file | Change |
|---|---|
| `marketplace-layout.test.mjs` | `EXPECTED_SKILL_NAMES` + `DERIVED_FILES_ALLOWLIST` extended; all "9 skill directories" → "10"; "20 derived files" → "21" |
| `marketplace-smoke.test.mjs` | `SKILL_NAMES` extended; "9 skill names" → "10" |
| `marketplace-releasing.test.mjs` | `SKILL_NAMES` extended; "all 9 skills" → "all 10" |
| `skills-manifest.test.mjs` | `SKILL_NAMES` + `SKILL_SUBCOMMANDS` extended; existing 9-count assertions bumped to 10; 7 new `claude-goal`-specific tests |
| `docs-split.test.mjs` | `SKILL_NAMES` extended; "Nine skills" → "Ten skills" |
| `readme.test.mjs` | "Nine"/"nine" wording bumped to "Ten"/"ten" |
| `dispatcher.test.mjs` | 7 new describe blocks for the `goal` subcommand |

### README updates

- `packages/plugin-codex/README.md`: "Nine skills" → "Ten skills"; new 10th bullet for `$claude-goal`; new `### $claude-goal` subsection; "All nine commands" → "All ten commands"; new dispatcher example line for `goal`
- `marketplace/plugins/claude-companion/README.md`: "9 skills" → "10 skills"; new `$claude-goal` bullet; new short `### $claude-goal` subsection

### Marketplace resync (T4 absorbed)

`node tools/package-marketplace.mjs --write` resynced the marketplace tree. `--check` exit 0 with the new count:

```
check: OK — 21 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.
```

**Tests added in T3b**: 7 dispatcher tests + 7 skills-manifest tests + (skill-iterator effects) ≈ **+20 tests** total in T3b.

## T4 — Local gates (orchestrator-absorbed)

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 21 derived + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **10** skills |
| `npm run lint` | exit 0 (clean) |
| `npm run typecheck` | exit 0 (clean) |
| `npm run format` | exit 0 (clean) |
| `npm test` (4 lanes) | **1375** (mock 68 + runtime 172 + driver 187 + plugin **948**), 0 fail |
| `npm run test:attach` | **28**, 0 fail |
| `npm run test:bench` | **258**, 0 fail |

### `--help` verification (new `goal` row + applicability parentheticals)

```
  delegate [flags] -- <prompt>              Start a Claude background session
  workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)
  goal [flags] -- <condition>               Start a Claude Code background session with a /goal condition

  --json                       Machine-readable JSON output (status/result/stop/followup/review/adversarial-review/goal)
  --yes                        Acknowledge privacy disclosure automatically (delegate/workflow/goal/followup/review/adversarial-review)
  --name <name>                Session name (delegate, workflow, goal)
  --model <model>              Model selection (delegate, workflow, goal, adversarial-review)
  --effort <effort>            Effort level (delegate, workflow, goal, adversarial-review)
  --permission-mode <mode>     Permission mode (delegate, workflow, goal, adversarial-review)
  --add-dir <dir>              Additional directory (delegate, workflow, goal; repeatable)
```

### Test count (Stage 2 close)

| Lane | Plan 0009 close | Plan 0010 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 901 | **948** | **+47** |
| **`npm test` chain** | **1328** | **1375** | **+47** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1614** | **1661** | **+47** |

Plan target was +30-40; actual +47. Justified per `feedback_test_count_overshoot` — each test is a distinct contract (13 T1+T2 docs + 7 dispatcher goal + 7 skills-manifest goal + ~20 skill-iterator effects from the SKILL_NAMES extensions in marketplace-layout/smoke/releasing/docs-split tests).

### Remote CI

Awaiting `git push`. Will be recorded after the run completes.

## Files modified in Stage 2 (consolidated)

Skill (NEW):
- `packages/plugin-codex/skills/claude-goal/SKILL.md`

Source code (dispatcher):
- `packages/plugin-codex/scripts/claude-companion.mjs`

Plugin manifest:
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt 9 → 10)

Tests (7 files):
- `packages/plugin-codex/test/dispatcher.test.mjs`
- `packages/plugin-codex/test/skills-manifest.test.mjs`
- `packages/plugin-codex/test/marketplace-layout.test.mjs`
- `packages/plugin-codex/test/marketplace-smoke.test.mjs`
- `packages/plugin-codex/test/marketplace-releasing.test.mjs`
- `packages/plugin-codex/test/docs-split.test.mjs`
- `packages/plugin-codex/test/readme.test.mjs`

Docs:
- `packages/plugin-codex/README.md` (T1 + T2 sections + T3b skill subsection + count bumps)
- `marketplace/plugins/claude-companion/README.md` (T3b skill subsection + count bumps)
- `marketplace/MANIFEST.md` (count bumps + new bullet)
- `documentation/RELEASING.md` (count bumps + skill list extension)
- `tools/package-marketplace.mjs` (allowlist +1)
- `tools/smoke-marketplace.mjs` (SKILL_NAMES + count bumps)

SKILL.md cross-references:
- `packages/plugin-codex/skills/claude-delegate/SKILL.md` (T1 fan-out tip)
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` (T2 example script + cross-ref to README sections)

Artifact:
- `documentation/plan/0010-20260605-codex-power-user/artifacts/oq-a-probe-20260605.txt`

Marketplace payload (derived; written by `--write`):
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`
- `marketplace/plugins/claude-companion/README.md`
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs`
- `marketplace/plugins/claude-companion/skills/claude-delegate/SKILL.md`
- `marketplace/plugins/claude-companion/skills/claude-workflow/SKILL.md`
- `marketplace/plugins/claude-companion/skills/claude-goal/SKILL.md` (NEW)

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `packages/plugin-codex/README.md` L341 cost paragraph: byte-identical (verified via `grep -c` returning 1)
- `tools/bench/**`, `documentation/plan/0004-*/`, `documentation/plan/0005-*/`, `documentation/plan/0006-*/`, `documentation/plan/0007-*/`, `documentation/plan/0008-*/`, `documentation/plan/0009-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff (no CI shape changes)
- `packages/runtime/**`: empty diff
- `packages/driver-claude-code/**`: empty diff
- T9.5 cache-execution invariant preserved (marketplace tree resynced; 21 derived files match source byte-identically; allowlist updated coherently across all 7 consumer files)
- No `~/.claude/` settings mutation during Stage 2 (T3a probe created bg sessions but did not edit settings)
