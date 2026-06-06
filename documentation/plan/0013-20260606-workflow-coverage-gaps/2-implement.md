# Plan 0013 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes re-verified; awaiting CI verification)
**Date**: 2026-06-06
**Stage 1 commit**: `e6e4fe4` (Plan 0013 Stage 1 approved)

Two `oh-my-claudecode:executor` agent batches:
- **Batch 1** — **T1**: three empirical probes (single executor; 3 parallel Node helpers; 3 artifacts)
- **Batch 2** (sequential after T1 verdicts) — **T2 + T3 + T4 + T5 + T6**: docs/skill/dispatcher/marketplace/tests

T7 (gates) orchestrator-absorbed inline.

## T1 — Three empirical probes

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- [`artifacts/oq-a-effort-ultracode-probe-20260606.txt`](artifacts/oq-a-effort-ultracode-probe-20260606.txt)
- [`artifacts/oq-b-deep-research-probe-20260606.txt`](artifacts/oq-b-deep-research-probe-20260606.txt)
- [`artifacts/oq-c-saved-workflow-shape-probe-20260606.txt`](artifacts/oq-c-saved-workflow-shape-probe-20260606.txt)

### OQ-A `--effort ultracode` — **Verdict A-partial (docs-only update)**

`claude --help` lists valid `--effort` values as `(low, medium, high, xhigh, max)` — `ultracode` is absent. When passed `--effort ultracode`, the CLI emits a stderr warning `Warning: Unknown --effort value 'ultracode' — ignoring it` but exits 0. JSONL comparison between Probe A1 (baseline) and Probe A2 (with `--effort ultracode`) showed structurally identical records — no workflow planning markers, no phase tracking. **The flag is silently rejected.**

**Implication for T2**: docs-only update. No new `$claude-effort` skill. Auto-orchestration use-case already covered by `$claude-workflow` (which prepends `ultracode:` keyword that activates the same behavior per workflows docs).

### OQ-B `/deep-research` — **Verdict A**

`claude --bg "/deep-research X"` parses the slash command at the protocol level. The JSONL user turn arrives as `<command-name>/deep-research</command-name><command-args>X</command-args>` (not plain text). The workflow runtime injects the full skill definition as system context. **WebSearch is present in `deferred_tools_delta`** — Risk R2 dispelled (WebSearch is auto-available in bg sessions).

**Implication for T3**: ship `$claude-deep-research` skill mirroring `$claude-goal` pattern. `promptTransformer: p => '/deep-research ' + p`.

### OQ-C saved-workflow invocation shape — **Verdict A**

`cmdDelegate`'s identity `promptTransformer = (p) => p` passes raw `"/<name> <args>"` strings unchanged to `claude --bg`. The claude CLI parses any `/`-prefixed prompt as a slash command at the protocol level regardless of routing path. The OQ-C JSONL is structurally identical to OQ-B's direct invocation.

**Implication for T4**: documented invocation shape is `$claude-delegate -- "/<name> <args>"` (NOT `$claude-workflow`, which would prepend `ultracode:` and break the slash-command parse).

## T2 — `--effort` documentation update (OQ-A docs-only)

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

Files modified — appended a 4-line `--effort` valid-values + ultracode-CLI-rejection note to:
- `packages/plugin-codex/skills/claude-delegate/SKILL.md`
- `packages/plugin-codex/skills/claude-workflow/SKILL.md`
- `packages/plugin-codex/skills/claude-goal/SKILL.md`
- `packages/plugin-codex/skills/claude-fork/SKILL.md`
- `packages/plugin-codex/skills/claude-batch/SKILL.md`
- `packages/plugin-codex/skills/claude-adversarial-review/SKILL.md`

Plus 1 line in `packages/plugin-codex/README.md` (around L714 — the existing `ultracode:` mention) clarifying the CLI vs TUI distinction. **Cost paragraph at L636 untouched.**

## T3 — `$claude-deep-research` skill (OQ-B Verdict A)

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

### New skill

`packages/plugin-codex/skills/claude-deep-research/SKILL.md` (NEW) — strict frontmatter (`name: claude-deep-research`); run line `node "<plugin-root>/scripts/claude-companion.mjs" deep-research -- "<question>"`; accepted flags (`--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--json`, `--yes`); explicit `--allow-edit` rejection; approval-flow + cost notice (research-grade workflow; multi-agent fan-out subject to 16 concurrent / 1000 total per run); WebSearch requirement noted (auto-available in standard bg sessions); `### Next steps` cross-references.

### Dispatcher subcommand

`packages/plugin-codex/scripts/claude-companion.mjs`:
- New `case 'deep-research':` after `case 'batch':`
- New `cmdDeepResearch` — `_runDelegateCore` with `promptTransformer: p => '/deep-research ' + p` and a deep-research-specific approval-flow extra-output block
- Rejects `--allow-edit` at parse time (exit 2)
- `printUsage` extended:
  - New `deep-research [flags] -- <question>` row
  - All 8 flag parentheticals updated to include `deep-research`
  - `--allow-edit` rejection list extended: "rejected by review, adversarial-review, workflow, goal, fork, batch, and deep-research"

### Plugin manifest

`packages/plugin-codex/.codex-plugin/plugin.json` — `interface.defaultPrompt` 12 → 13 entries with new entry: `"Run a Claude Code dynamic deep-research workflow on a question."`

## T4 — Saved-workflow / `args` documentation (OQ-C Verdict A)

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

Appended `### Saved workflows and args parameter` subsection to `packages/plugin-codex/skills/claude-workflow/SKILL.md`. Body documents:
- Saved workflows appear as slash commands `/<name>`
- Invoke from Codex via `$claude-delegate -- "/<name> <args>"` (NOT `$claude-workflow`, because it prepends `ultracode:` keyword which breaks slash-command parsing for saved workflows)
- Example: `$claude-delegate -- "/triage-issues on issues 1024, 1025, 1030"`
- The workflow runtime exposes trailing prose as the `args` global to the script

Added one-line cross-reference in `packages/plugin-codex/skills/claude-delegate/SKILL.md` noting that `$claude-delegate -- "/<saved-or-bundled-workflow-name> <args>"` invokes saved workflows; refer to `$claude-workflow` for details.

## T5 — Marketplace plumbing + count bumps (12 → 13; 23 → 24)

**Agent**: `oh-my-claudecode:executor` (sequential after T3)

| File | Change |
|---|---|
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +1 entry (`skills/claude-deep-research/SKILL.md`); 23 → 24 |
| `marketplace/MANIFEST.md` | "23 files" → "24 files" + 1 new bullet |
| `documentation/RELEASING.md` | Three "23 derived"/"23 source-derived" → "24"; "twelve-skill" → "thirteen-skill"; "other eleven skills" → "other twelve skills"; skill list extended with `$claude-deep-research` |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +1; "Twelve"/"twelve"/"twelve-skill"/"12 skill names"/"12 skills" → "Thirteen"/"thirteen"/"thirteen-skill"/"13 skill names"/"13 skills" |
| `packages/plugin-codex/README.md` | "Twelve skills" → "Thirteen skills"; new bullet for `$claude-deep-research`; new `### $claude-deep-research` subsection; "All twelve commands" → "All thirteen commands"; dispatcher example line |
| `marketplace/plugins/claude-companion/README.md` | "12 skills" → "13 skills"; 1 new bullet; 1 short new subsection |

**Pre-emptive straggler-grep**: clean. All `\b12\b`/`\btwelve\b` remaining hits are test ordinals (`T8-12`, `T9-12`, etc.), UUID slice positions in frozen tools/mock-claude/, bench tool assertions in frozen tools/bench/, or the intentional historical phrasing in tests.

`node tools/package-marketplace.mjs --write` resynced the marketplace tree.

## T6 — Tests

| Test file | Change |
|---|---|
| `dispatcher.test.mjs` | 7 new describe blocks for `$claude-deep-research`: `--help` row, happy path, `/deep-research ` prompt-prefix verification, non-TTY rejection, `--allow-edit` rejection, standard-flags acceptance, approval-flow extra-output |
| `skills-manifest.test.mjs` | `SKILL_NAMES` + `SKILL_SUBCOMMANDS` extended; existing 12-count assertions bumped to 13 (3 locations); 7 new `claude-deep-research`-specific tests |
| `marketplace-layout.test.mjs` | `EXPECTED_SKILL_NAMES` + `DERIVED_FILES_ALLOWLIST` extended; "12 skill directories" → "13"; "23 derived" → "24" |
| `marketplace-smoke.test.mjs` | `SKILL_NAMES` +1; "12 skill" → "13 skill" (4 occurrences) |
| `marketplace-releasing.test.mjs` | `SKILL_NAMES` +1; "12 skills" → "13 skills" |
| `docs-split.test.mjs` | `SKILL_NAMES` +1; "Twelve skills" → "Thirteen skills" |
| `readme.test.mjs` | "Twelve"/"twelve" → "Thirteen"/"thirteen" + 3 new docs regression tests (T2 `--effort` clarification; T4 `Saved workflows` phrase; T4 delegate cross-reference) |

## T7 — Local gates (orchestrator-absorbed)

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; **24 derived (was 23)** + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **13 skills** including `$claude-deep-research` ("Thirteen skills covered...") |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` (4 lanes) | **1485** (mock 68 + runtime 173 + driver 187 + plugin **1057**), 0 fail |
| `npm run test:attach` | **28**, 0 fail (unchanged) |
| `npm run test:bench` | **258**, 0 fail (unchanged) |

### Test count (Stage 2 close)

| Lane | Plan 0012 close | Plan 0013 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1020 | **1057** | **+37** |
| **`npm test` chain** | **1448** | **1485** | **+37** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1734** | **1771** | **+37** |

Plan target was +18 (1 A-verdict + docs) to +35 (worst case both A); actual **+37** — slightly over the 1-A target because T4 added 3 docs regression tests AND the iterator effects from SKILL_NAMES growing covered 4 marketplace tests not just 2. Justified per `feedback_test_count_overshoot` — each test asserts a distinct contract.

### Per-task test breakdown
- T3 (`$claude-deep-research`): 7 dispatcher + 7 skills-manifest = 14
- T2 + T4 (docs regressions): 3 in `readme.test.mjs`
- T5 iterator effects: ~20 across 4 marketplace/docs tests (SKILL_NAMES grew by 1)

### Remote CI

Awaiting `git push`. Will be recorded in 3-audit.md / 5-report.md.

## Files modified in Stage 2 (consolidated)

New skill:
- `packages/plugin-codex/skills/claude-deep-research/SKILL.md`

Source code:
- `packages/plugin-codex/scripts/claude-companion.mjs` (case + cmdDeepResearch + printUsage)
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt 12 → 13)

SKILL.md updates (6 docs-only):
- `claude-delegate/SKILL.md` (T2 + T4 cross-reference)
- `claude-workflow/SKILL.md` (T2 + T4 subsection)
- `claude-goal/SKILL.md` (T2)
- `claude-fork/SKILL.md` (T2)
- `claude-batch/SKILL.md` (T2)
- `claude-adversarial-review/SKILL.md` (T2)

Tests (7 files):
- `packages/plugin-codex/test/dispatcher.test.mjs`
- `packages/plugin-codex/test/skills-manifest.test.mjs`
- `packages/plugin-codex/test/marketplace-layout.test.mjs`
- `packages/plugin-codex/test/marketplace-smoke.test.mjs`
- `packages/plugin-codex/test/marketplace-releasing.test.mjs`
- `packages/plugin-codex/test/docs-split.test.mjs`
- `packages/plugin-codex/test/readme.test.mjs`

Docs / metadata:
- `packages/plugin-codex/README.md` (12→13 + deep-research subsection + T2 line near L714; cost paragraph at L636 byte-identical)
- `marketplace/plugins/claude-companion/README.md` (12→13 + deep-research subsection)
- `marketplace/MANIFEST.md` (23→24 + 1 bullet)
- `documentation/RELEASING.md` (23→24 ×3 + thirteen-skill + skill list +1)
- `tools/package-marketplace.mjs` (allowlist +1)
- `tools/smoke-marketplace.mjs` (SKILL_NAMES +1 + thirteen wording)

Marketplace mirrors (derived via `--write`):
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs`
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`
- `marketplace/plugins/claude-companion/README.md`
- `marketplace/plugins/claude-companion/skills/claude-deep-research/SKILL.md` (NEW)
- `marketplace/plugins/claude-companion/skills/{6 updated SKILL.md files for T2 + T4}`

Artifacts:
- `documentation/plan/0013-20260606-workflow-coverage-gaps/artifacts/oq-a-effort-ultracode-probe-20260606.txt`
- `documentation/plan/0013-20260606-workflow-coverage-gaps/artifacts/oq-b-deep-research-probe-20260606.txt`
- `documentation/plan/0013-20260606-workflow-coverage-gaps/artifacts/oq-c-saved-workflow-shape-probe-20260606.txt`

## Adaptive scope outcome

T1 verdicts: A-partial / A / A. Final actual scope:
- **`$claude-effort` standalone skill — NOT shipped** (OQ-A A-partial → docs-only). Skill count would have been +1 if Verdict B.
- **`$claude-deep-research` skill — shipped** (OQ-B A).
- **`args` and saved-workflow docs — shipped** (OQ-C A; unconditional ship per plan).

Final skill count delta: **+1** (12 → 13). Marketplace allowlist delta: **+1** (23 → 24).

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `v0.2.0` tag at `ea595e1` (unchanged — no retag)
- `packages/plugin-codex/README.md` L636-ish cost paragraph: byte-identical preserved
- `tools/bench/**`, `documentation/plan/0004-*/` through `0012-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff
- `packages/runtime/**`: empty diff (Plan 0012's doctor.ts exception does not extend here)
- `packages/driver-claude-code/**`: empty diff
- No `~/.claude/` or `~/.codex/` mutation
- T9.5 cache invariant: marketplace tree resynced; 24 derived byte-identical
- Pre-emptive straggler-grep clean

## Plan readme status flip

`documentation/plan/0013-20260606-workflow-coverage-gaps/readme.md` flipped from `implementing` → `auditing`. Stage 2 complete-pending-CI.
