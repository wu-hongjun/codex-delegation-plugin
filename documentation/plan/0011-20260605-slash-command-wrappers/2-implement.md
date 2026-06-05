# Plan 0011 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes re-verified; awaiting CI verification)
**Date**: 2026-06-05
**Stage 1 commit**: `b643649` (Plan 0011 Stage 1 approved)

Two `oh-my-claudecode:executor` agents owned the work:
- **Batch 1**: **T1** — three empirical `/tasks`, `/fork`, `/batch` probes via `claude --bg` (one executor; 3 parallel Node helpers; 3 artifacts)
- **Batch 2** (sequential after T1 verdicts): **T2 + T3 + T4 + T5** combined — two new skills (claude-fork + claude-batch), dispatcher subcommands, all 10→12 count bumps, marketplace `--write` resync, tests

T6 (gates + CI) orchestrator-absorbed inline.

**Environment shift during Stage 2**: Claude Code upgraded from brew `2.1.153` → native `2.1.165` (at `~/.local/bin/claude`). All three Plan 0007 doctor probes (`opus-4-8-supported`, `workflows-supported`, `bg-exec-supported`) now report `ok`. The T1 probes were run on `2.1.165`.

## T1 — Three empirical probes (one executor; three parallel Node helpers)

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- [`artifacts/oq-a-tasks-probe-20260605.txt`](artifacts/oq-a-tasks-probe-20260605.txt)
- [`artifacts/oq-b-fork-probe-20260605.txt`](artifacts/oq-b-fork-probe-20260605.txt)
- [`artifacts/oq-c-batch-probe-20260605.txt`](artifacts/oq-c-batch-probe-20260605.txt)

### OQ-A — `/tasks` → **Verdict B (TUI-only, deferred)**

`claude --bg "/tasks"` spawned background session `3a78ef70`. The `claude agents --json` record shows `"status": "waiting"`, `"waitingFor": "dialog open"` — the command opened an interactive TUI task-picker dialog and blocked indefinitely on keyboard input. **No JSONL conversation file was created** because the session never advanced past the dialog-open state. `claude logs` showed a fully rendered TUI panel with "↑/↓ to select · Enter to view · ←/Esc to close" prompt.

**Implication**: `/tasks` cannot be driven via `claude --bg`. Skip T2-T5 for this command; defer to Plan 0012+ with PTY-injection fallback design.

### OQ-B — `/fork <directive>` → **Verdict A (subagent spawned)**

`claude --bg "/fork respond with the literal word OK and stop..."` spawned session `e9c77c92`. JSONL L12 contained a completed `<task-notification>` record:

```
<task-id>arespond-with-the-ccdae9dbf49fafdd</task-id>
<status>completed</status>
<result>OK</result>
<usage><subagent_tokens>30117</subagent_tokens><tool_uses>0</tool_uses><duration_ms>20990</duration_ms></usage>
```

A `subagents/` directory was created with the full subagent conversation log (`agent-arespond-with-the-ccdae9dbf49fafdd.jsonl`, 26310 bytes). The runtime parsed `/fork <directive>` as a slash command, spawned a real subagent process, and the parent session completed when the subagent finished.

**Implication**: implement `$claude-fork` mirroring `$claude-goal`. Prompt transformer `p => '/fork ' + p`. Token cost (30k for trivial directive) is higher than `/goal` — document in SKILL.md.

### OQ-C — `/batch <instruction>` → **Verdict A (orchestration system prompt injected)**

`claude --bg "/batch respond with OK..."` spawned session `bcca9c11`. JSONL L9 contained the XML-encoded slash-command record:

```
<command-name>/batch</command-name>
<command-args>respond with OK and stop. zero operations, just acknowledge.</command-args>
```

JSONL L10 then contained an injected `# Batch: Parallel Work Orchestration` system prompt (multi-paragraph; plan-mode + decomposition + parallel-execution phases). L14 attached a `command_permissions` record with `allowedTools=[]`. Structurally identical to `/goal`'s slash-command parse path from Plan 0010 T3a.

**Implication**: implement `$claude-batch` mirroring `$claude-goal`. Prompt transformer `p => '/batch ' + p`. Document orchestration semantics in SKILL.md (heavier-weight than `/goal`; expects a parallelizable change, not a stop condition).

### T1 outcome — adaptive scope applied

**2 of 3 commands ship** (`/fork`, `/batch`). `/tasks` deferred to backlog. Count bumps are 10 → 12 (skill count) and 21 → 23 (derived allowlist), not 10 → 13 / 21 → 24.

## T2 + T3 + T4 + T5 — Skills + dispatcher + plumbing + tests (Batch 2)

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

### T2 — Two new SKILL.md files

- `packages/plugin-codex/skills/claude-fork/SKILL.md` (NEW) — strict frontmatter (`name: claude-fork`, description: "Fork a Claude Code subagent for a directive..."); run line `node "<plugin-root>/scripts/claude-companion.mjs" fork -- "<directive>"`; accepted flags (`--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--json`, `--yes`); explicit `--allow-edit` rejection; approval-flow + cost notice (30k baseline); `### Next steps` cross-references to `$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`.
- `packages/plugin-codex/skills/claude-batch/SKILL.md` (NEW) — strict frontmatter (`name: claude-batch`, description references "Batch Parallel Work Orchestration runtime"); run line `node "<plugin-root>/scripts/claude-companion.mjs" batch -- "<instruction>"`; accepted flags identical to claude-fork; explicit `--allow-edit` rejection; approval-flow notes the injected `# Batch: Parallel Work Orchestration` system prompt; cost notice highlights scoping discipline; same `### Next steps` cross-references.

### T3 — Dispatcher subcommands

`packages/plugin-codex/scripts/claude-companion.mjs`:
- New `case 'fork':` and `case 'batch':` in main dispatch switch (after `case 'goal':`)
- New `cmdFork(flags, positional, json)` at L329 — calls shared `_runDelegateCore` with `promptTransformer: p => '/fork ' + p` + fork-specific approval-flow extra-output
- New `cmdBatch(flags, positional, json)` at L354 — calls shared `_runDelegateCore` with `promptTransformer: p => '/batch ' + p` + batch-specific approval-flow extra-output
- Both reject `--allow-edit` at parse time (exit 2 with clear error message)
- `printUsage` extended at L2034-L2035:
  - New `fork [flags] -- <directive>` row
  - New `batch [flags] -- <instruction>` row
  - All applicable flag parentheticals extended to include `fork`/`batch`: `--yes`, `--json`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`
  - `--allow-edit` rejection list now reads "rejected by review, adversarial-review, workflow, goal, fork, and batch"

### T4 — Marketplace plumbing + count bumps

| File | Change |
|---|---|
| `packages/plugin-codex/.codex-plugin/plugin.json` | `interface.defaultPrompt` array 10 → 12 entries; new entries `"Fork a Claude Code subagent for a directive."` (L25) + `"Run a batch of parallel Claude Code instructions."` (L26) |
| `tools/package-marketplace.mjs` | `DERIVED_FILES` 21 → 23 entries (`skills/claude-fork/SKILL.md`, `skills/claude-batch/SKILL.md`) |
| `marketplace/MANIFEST.md` | "21 files" → "23 files"; 2 new bullets |
| `documentation/RELEASING.md` | Three "21 derived"/"21 source-derived" → "23"; "ten-skill" → "twelve-skill"; "other nine skills" → "other eleven skills"; skill list extended with `$claude-fork` + `$claude-batch` |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` array +2; "Ten"/"ten"/"ten-skill"/"10 skill names"/"10 skills" → "Twelve"/"twelve"/"twelve-skill"/"12 skill names"/"12 skills" |
| `packages/plugin-codex/README.md` | "Ten skills" → "Twelve skills" lead-in; 2 new bullets; new `### $claude-fork` and `### $claude-batch` subsections under `## Commands and skills`; "All ten commands" → "All twelve commands"; new dispatcher example lines |
| `marketplace/plugins/claude-companion/README.md` | "10 skills" → "12 skills"; 2 new bullets; 2 short new subsections |

**Cost paragraph at L636-ish in `packages/plugin-codex/README.md`**: byte-identical preserved.

### T5 — Tests

| Test file | Change |
|---|---|
| `dispatcher.test.mjs` | 14 new describe blocks (7 per command): `--help` row, happy path, `/fork`/`/batch` prompt-prefix verification, non-TTY rejection, `--allow-edit` rejection, standard-flags acceptance, approval-flow extra-output |
| `skills-manifest.test.mjs` | `SKILL_NAMES` + `SKILL_SUBCOMMANDS` extended; 14 new fork/batch-specific tests (per-skill: dir exists, SKILL.md exists, run line uses correct subcommand, no `--yes` auto-injection, no `--allow-edit` in run lines, defaultPrompt entry, frontmatter strictness); existing 10-count assertions bumped to 12 |
| `marketplace-layout.test.mjs` | `EXPECTED_SKILL_NAMES` + `DERIVED_FILES_ALLOWLIST` extended; "10 skill directories" → "12"; "21 derived files" → "23" |
| `marketplace-smoke.test.mjs` | `SKILL_NAMES` extended; all "Ten"/"ten"/"ten-skill"/"10 skill names" → "Twelve"/"twelve"/"twelve-skill"/"12 skill names" wording |
| `marketplace-releasing.test.mjs` | `SKILL_NAMES` extended; "all 10 skills" → "all 12" |
| `docs-split.test.mjs` | `SKILL_NAMES` extended; "Ten skills" → "Twelve skills" |
| `readme.test.mjs` | "Ten"/"ten" wording bumped to "Twelve"/"twelve"; new `"twelve commands" (updated from ten)` assertion at L1290 |

### Marketplace resync (T4 absorbed into Batch 2)

`node tools/package-marketplace.mjs --write` resynced the marketplace tree. `--check` exit 0 with the new count:

```
check: OK — 23 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.
```

## T6 — Local gates (orchestrator-absorbed)

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 23 derived + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **12** skills |
| `npm run lint` | exit 0 (clean) |
| `npm run typecheck` | exit 0 (clean) |
| `npm run format` | exit 0 (clean) |
| `npm test` (4 lanes) | **1443** (mock 68 + runtime 172 + driver 187 + plugin **1016**), 0 fail |
| `npm run test:attach` | **28**, 0 fail |
| `npm run test:bench` | **258**, 0 fail |

### `--help` verification (new `fork` + `batch` rows + applicability parentheticals)

```
  delegate [flags] -- <prompt>              Start a Claude background session
  workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)
  goal [flags] -- <condition>               Start a Claude Code background session with a /goal condition
  fork [flags] -- <directive>               Fork a Claude Code subagent for a directive
  batch [flags] -- <instruction>            Run a batch of parallel Claude Code instructions

  --yes                        Acknowledge privacy disclosure automatically (delegate/workflow/goal/fork/batch/followup/review/adversarial-review)
  --name <name>                Session name (delegate, workflow, goal, fork, batch)
  --model <model>              Model selection (delegate, workflow, goal, fork, batch, adversarial-review)
  --effort <effort>            Effort level (delegate, workflow, goal, fork, batch, adversarial-review)
  --permission-mode <mode>     Permission mode (delegate, workflow, goal, fork, batch, adversarial-review)
  --add-dir <dir>              Additional directory (delegate, workflow, goal, fork, batch; repeatable)

  --allow-edit  rejected by review, adversarial-review, workflow, goal, fork, and batch
```

### Test count (Stage 2 close)

| Lane | Plan 0010 close | Plan 0011 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 948 | **1016** | **+68** |
| **`npm test` chain** | **1375** | **1443** | **+68** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1661** | **1729** | **+68** |

Plan target was +50-60 (assuming 3 A-verdicts; only 2 landed). Actual delta **+68** with only 2 commands shipped. Justified per `feedback_test_count_overshoot` — each test is a distinct contract (14 dispatcher tests/command × 2 = 28; 14 skills-manifest tests/command × 2 = 28 — but the manifest extensions are ~7 per command after the iterator overlap; the remaining +12 are skill-iterator effects across the 4 marketplace/docs-split tests since SKILL_NAMES grew by 2 not 1).

### Remote CI

Awaiting `git push`. Will be recorded in 3-audit.md / 5-report.md after the run completes.

## Adaptive scope outcome

Plan 0011 was scoped as **adaptive from the start**: T1 probes each command, and only A-verdict commands progress to T2-T5. With 2 of 3 A-verdicts:

- `/fork` shipped as `$claude-fork`
- `/batch` shipped as `$claude-batch`
- `/tasks` deferred (Verdict B — TUI-only, blocked on dialog input) → backlog item for Plan 0012+

The adaptive design correctly avoided a fragile workaround attempt. The `/tasks` PTY-injection fallback is a substantial design question (the TUI dialog requires arrow-key navigation + Enter, not just text); deferring it preserves Plan 0011's scope discipline.

## Files modified in Stage 2 (consolidated)

Skills (NEW):
- `packages/plugin-codex/skills/claude-fork/SKILL.md`
- `packages/plugin-codex/skills/claude-batch/SKILL.md`

Source code (dispatcher):
- `packages/plugin-codex/scripts/claude-companion.mjs`

Plugin manifest:
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt 10 → 12)

Tests (7 files):
- `packages/plugin-codex/test/dispatcher.test.mjs`
- `packages/plugin-codex/test/skills-manifest.test.mjs`
- `packages/plugin-codex/test/marketplace-layout.test.mjs`
- `packages/plugin-codex/test/marketplace-smoke.test.mjs`
- `packages/plugin-codex/test/marketplace-releasing.test.mjs`
- `packages/plugin-codex/test/docs-split.test.mjs`
- `packages/plugin-codex/test/readme.test.mjs`

Docs:
- `packages/plugin-codex/README.md` (lead-in 10→12; 2 new bullets; 2 new subsections; "All ten" → "All twelve"; dispatcher examples)
- `marketplace/plugins/claude-companion/README.md` (10→12; 2 new bullets; 2 short subsections)
- `marketplace/MANIFEST.md` (21→23; 2 new bullets)
- `documentation/RELEASING.md` (21→23 ×3; "ten-skill"→"twelve-skill"; "other nine"→"other eleven"; skill list +2)
- `tools/package-marketplace.mjs` (allowlist +2)
- `tools/smoke-marketplace.mjs` (SKILL_NAMES +2; "Ten" wording → "Twelve")

Marketplace payload (derived; written by `--write`):
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`
- `marketplace/plugins/claude-companion/README.md`
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs`
- `marketplace/plugins/claude-companion/skills/claude-fork/SKILL.md` (NEW)
- `marketplace/plugins/claude-companion/skills/claude-batch/SKILL.md` (NEW)

Artifacts:
- `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-a-tasks-probe-20260605.txt`
- `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-b-fork-probe-20260605.txt`
- `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-c-batch-probe-20260605.txt`

Pre-compact handover (kept for traceability through Stage 5; pruned at plan-close):
- `documentation/plan/0011-20260605-slash-command-wrappers/HANDOVER-PRE-COMPACT.md`

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `packages/plugin-codex/README.md` L636-ish cost paragraph: byte-identical preserved
- `v0.2.0` tag at `ea595e1` (unchanged — no retag)
- `tools/bench/**`, `documentation/plan/0004-*/`, `documentation/plan/0005-*/`, `documentation/plan/0006-*/`, `documentation/plan/0007-*/`, `documentation/plan/0008-*/`, `documentation/plan/0009-*/`, `documentation/plan/0010-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff (no CI shape changes)
- `packages/runtime/**`: empty diff
- `packages/driver-claude-code/**`: empty diff
- No `~/.claude/` settings mutation during Stage 2 (T1 probes created bg sessions but did not edit settings; all sessions cleaned up via `claude stop`)
- T9.5 cache-execution invariant preserved (marketplace tree resynced; 23 derived files match source byte-identically; allowlist updated coherently across all 7 consumer files)
- Pre-emptive straggler-grep ran clean (no remaining `\b10\b`, `\bten\b`, or `\b21 derived\b` references in scope)

## Plan readme status flip

`documentation/plan/0011-20260605-slash-command-wrappers/readme.md` flipped from `implementing` → `auditing`. Stage 2 marked complete-pending-CI.
