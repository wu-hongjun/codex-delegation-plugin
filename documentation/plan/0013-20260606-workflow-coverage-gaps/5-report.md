# Stage 5 — Report: Plan 0013

## Report metadata

- **Plan**: Plan 0013 — Workflow coverage gaps (`$claude-deep-research` + `--effort` value docs + saved-workflow / `args` docs)
- **Date**: 2026-06-06
- **Commit reported**: this commit (Stage 3 + Stage 5 combined; Stage 4 skipped)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted from post-Plan-0012 coverage gap analysis against [code.claude.com/docs/en/workflows](https://code.claude.com/docs/en/workflows). Approved 2026-06-06 via maintainer AskUserQuestion authorization. 6 T-tasks. Adaptive scope mechanic.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-06 at commit `2dba189`. T1 probes returned A-partial / A / A. Local total 1771 tests. CI run [`27077084697`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27077084697) **`success`** across `ubuntu-latest + macos-latest × Node 20 + 22`.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with **zero findings** at any severity. **Fifth clean audit pattern in this session** (Plans 0009, 0010, 0011, 0013 all zero-finding; Plan 0012 had 1 MINOR polished).
- **Stage 4 polish**: SKIPPED. Audit verdict allowed direct progression to Stage 5.
- **Final status**: `complete`

---

## Executive summary

Plan 0013 closes the workflow-surface coverage gaps surfaced by cross-referencing what we ship against Claude Code's dynamic-workflow documentation. Three additions:

1. **`$claude-deep-research <question>`** — wraps Claude Code's bundled `/deep-research` workflow. The most-cited entry point in the workflows docs; fans out web searches across multiple angles, cross-checks sources, and returns a cited report. T1 OQ-B confirmed `claude --bg "/deep-research X"` parses as a slash command and the workflow runtime injects a multi-paragraph system prompt + tools delta including `WebSearch`. Mirrors `$claude-goal` pattern via shared `_runDelegateCore` helper with `promptTransformer: p => '/deep-research ' + p`.

2. **`--effort` value clarification docs** — T1 OQ-A discovered the CLI `--effort` flag accepts only `low / medium / high / xhigh / max`; passing `ultracode` results in a stderr warning + silent ignore (exit 0, structurally identical JSONL to baseline). Documented across 6 SKILL.md files + 1 line in plugin README clarifying CLI vs TUI distinction and pointing users to `$claude-workflow` for auto-orchestration use cases.

3. **Saved-workflow + `args` documentation** — T1 OQ-C confirmed `$claude-delegate -- "/<name> <args>"` correctly invokes saved `/<name>` workflows (the identity prompt transformer preserves `/` prefix; claude CLI parses slash commands at protocol level). Added `### Saved workflows and args parameter` subsection to `$claude-workflow/SKILL.md` + cross-reference in `$claude-delegate/SKILL.md`. Critical clarification: users must use `$claude-delegate` for saved workflows (NOT `$claude-workflow`, because the latter prepends the `ultracode:` keyword which breaks slash-command parsing).

**Adaptive scope outcome**: skill count grew **12 → 13** (only 1 new skill, not 2). Marketplace allowlist **23 → 24**. No `$claude-effort` standalone skill (would have shipped if OQ-A returned Verdict B; A-partial verdict → docs-only).

All gates clean: **1771 tests pass** (1485 npm test + 28 attach + 258 bench), 0 failures. Plugin version unchanged at `0.2.0`. No release tag this plan.

**v0.3.0 is now an even cleaner release candidate** — Plan 0013 closed the documented workflow coverage gaps; the only remaining workflow-surface gap is `/workflows` TUI panel (deferred to backlog, same class as `/tasks`).

---

## What shipped

### New skill: `$claude-deep-research <question>`

`packages/plugin-codex/skills/claude-deep-research/SKILL.md` (NEW):
- Strict frontmatter (`name: claude-deep-research`); description mentions multi-agent fan-out + WebSearch + cited report
- Run line: `node "<plugin-root>/scripts/claude-companion.mjs" deep-research -- "<question>"`
- Accepted flags identical to `$claude-goal`: `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--json`, `--yes`
- Rejects `--allow-edit`
- Approval-flow notes the bundled workflow runtime engagement
- Cost notice: research-grade workflow; multi-agent fan-out subject to 16 concurrent / 1000 total per run
- WebSearch requirement: auto-available in standard bg sessions per OQ-B
- `### Next steps` cross-references to `$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`

### Empirical probe artifacts (T1)

- [`artifacts/oq-a-effort-ultracode-probe-20260606.txt`](artifacts/oq-a-effort-ultracode-probe-20260606.txt) — **Verdict A-partial**. CLI warning quoted verbatim; JSONL structurally identical to baseline; no workflow planning markers.
- [`artifacts/oq-b-deep-research-probe-20260606.txt`](artifacts/oq-b-deep-research-probe-20260606.txt) — **Verdict A**. JSONL `<command-name>/deep-research</command-name>`; workflow runtime injects system context; `WebSearch` present in `deferred_tools_delta`.
- [`artifacts/oq-c-saved-workflow-shape-probe-20260606.txt`](artifacts/oq-c-saved-workflow-shape-probe-20260606.txt) — **Verdict A**. `cmdDelegate` identity transformer preserves `/`-prefix; claude CLI parses slash commands at protocol level.

### Dispatcher subcommand

`packages/plugin-codex/scripts/claude-companion.mjs`:
- New `case 'deep-research':` in main switch
- New `cmdDeepResearch` mirrors `cmdGoal`/`cmdFork`/`cmdBatch`: rejects `--allow-edit` at parse time; calls shared `_runDelegateCore` helper with `promptTransformer: p => '/deep-research ' + p` and a deep-research-specific approval-flow extra-output block
- `printUsage` extended:
  - New `deep-research [flags] -- <question>` row in Commands
  - All 8 applicable flag parentheticals (`--yes`, `--json`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`) updated to include `deep-research`
  - `--allow-edit` rejection list now reads "rejected by review, adversarial-review, workflow, goal, fork, batch, and deep-research"

### Plugin manifest

`packages/plugin-codex/.codex-plugin/plugin.json` — `interface.defaultPrompt` 12 → 13 entries; new entry: `"Run a Claude Code dynamic deep-research workflow on a question."`

### Plugin README

- "Twelve skills" → "Thirteen skills" lead-in
- New `$claude-deep-research` bullet in `## Current v1 scope`
- New `### $claude-deep-research` subsection under `## Commands and skills`
- "All twelve commands" → "All thirteen commands"
- New dispatcher example line for `deep-research`
- 1 line near L758 (the `ultracode:` keyword reference area) clarifying CLI vs TUI distinction for `--effort` values
- **Cost paragraph at L636 preserved byte-identical**

### `--effort` valid-values docs (T2 — 6 SKILL.md files)

Consistent 4-line note appended to:
- `claude-delegate/SKILL.md`
- `claude-workflow/SKILL.md`
- `claude-goal/SKILL.md`
- `claude-fork/SKILL.md`
- `claude-batch/SKILL.md`
- `claude-adversarial-review/SKILL.md`

The note documents: CLI `--effort` valid values are `low / medium / high / xhigh / max`; `ultracode` is TUI-only and silently ignored when passed via CLI; for auto-orchestration use `$claude-workflow` instead.

### Saved-workflow + `args` docs (T4)

`$claude-workflow/SKILL.md` `### Saved workflows and args parameter` subsection:
- Saved workflows appear as slash commands `/<name>`
- Invoke from Codex via `$claude-delegate -- "/<name> <args>"` (NOT `$claude-workflow`)
- Example: `$claude-delegate -- "/triage-issues on issues 1024, 1025, 1030"`
- The workflow runtime exposes trailing prose as the `args` global

`$claude-delegate/SKILL.md` cross-reference: notes that `$claude-delegate -- "/<saved-or-bundled-workflow-name> <args>"` invokes saved workflows; refers to `$claude-workflow` for details.

### Marketplace plumbing (24 derived files)

| File | Change |
|---|---|
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +1 (`skills/claude-deep-research/SKILL.md`); 23 → 24 |
| `marketplace/MANIFEST.md` | "23 files" → "24 files" + 1 new bullet |
| `documentation/RELEASING.md` | Three "23 derived"/"23 source-derived" → "24"; "twelve-skill" → "thirteen-skill"; "other eleven skills" → "other twelve skills"; skill list extended with `$claude-deep-research` |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +1; "Twelve"/"twelve"/"twelve-skill"/"12 skill names"/"12 skills" → "Thirteen"/"thirteen"/"thirteen-skill"/"13 skill names"/"13 skills" |
| `marketplace/plugins/claude-companion/README.md` | "12 skills" → "13 skills"; 1 new bullet; 1 short new subsection |

### Test additions (7 files, +37 net)

| File | Change | New tests |
|---|---|---|
| `dispatcher.test.mjs` | 7 new describe blocks for `$claude-deep-research`: `--help` row, happy path, prompt-prefix `/deep-research`, non-TTY rejection, `--allow-edit` rejection, standard-flags, approval-flow | 7 |
| `skills-manifest.test.mjs` | `SKILL_NAMES` + `SKILL_SUBCOMMANDS` +1; existing 12-count assertions bumped to 13; 7 new `claude-deep-research`-specific tests | 7 + count-bump effects |
| `marketplace-layout.test.mjs` | `EXPECTED_SKILL_NAMES` + `DERIVED_FILES_ALLOWLIST` extended; "12 skill directories" → "13"; "23 derived" → "24" | per-skill iterator effects |
| `marketplace-smoke.test.mjs` | `SKILL_NAMES` +1; "12 skill" → "13 skill" (4 occurrences) | per-skill iterator effects |
| `marketplace-releasing.test.mjs` | `SKILL_NAMES` +1; "12 skills" → "13 skills" | per-skill iterator effects |
| `docs-split.test.mjs` | `SKILL_NAMES` +1; "Twelve skills" → "Thirteen skills" | per-skill iterator effects |
| `readme.test.mjs` | "Twelve"/"twelve" → "Thirteen"/"thirteen"; 3 new docs regression tests (T2 `--effort` clarification; T4 `Saved workflows` phrase; T4 delegate cross-reference) | 3 |

Total: +37 tests (Plan target was +18 to +35; +37 slightly over because T4 added 3 docs regressions AND SKILL_NAMES iterator effects covered 4 marketplace tests).

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-06 via maintainer AskUserQuestion authorization. Adaptive scope: probe-then-implement for 3 OQs; T4 docs unconditional. 6 T-tasks.
- **Stage 2 (Implement)** — Complete 2026-06-06 at commit `2dba189`. Two `oh-my-claudecode:executor` batches: Batch 1 (T1 three parallel probes) returned A-partial/A/A; Batch 2 (T2-T6) implemented per verdicts. T7 orchestrator-absorbed. Local total 1771.
- **Stage 3 (Audit)** — Complete 2026-06-06. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with **zero findings** at any severity.
- **Stage 4 (Polish)** — SKIPPED. Verdict allowed direct progression.
- **Stage 5 (Report)** — This document. Plan status flips `auditing → reporting → complete` in this commit (combined with Stage 3 push).

---

## T-task summary

| Task | Verdict / type | Status | Evidence |
|---|---|---|---|
| T1 OQ-A `--effort ultracode` probe | A-partial | complete | `artifacts/oq-a-effort-ultracode-probe-20260606.txt` |
| T1 OQ-B `/deep-research` probe | A | complete | `artifacts/oq-b-deep-research-probe-20260606.txt` |
| T1 OQ-C saved-workflow shape probe | A | complete | `artifacts/oq-c-saved-workflow-shape-probe-20260606.txt` |
| T2 — `--effort` docs update | docs-only | complete | 6 SKILL.md files + README near L758 |
| T3 — `$claude-deep-research` skill | shipped | complete | SKILL.md + cmdDeepResearch + plugin.json + 14 new tests |
| T4 — Saved-workflow + `args` docs | shipped | complete | `$claude-workflow/SKILL.md` subsection + `$claude-delegate/SKILL.md` cross-reference + 3 regression tests |
| T5 — Marketplace + count bumps | 12→13 / 23→24 | complete | 7 consumer files coherent; straggler-grep clean |
| T6 — Tests | — | complete | +37 net; each contract distinct |
| T7 — Gates + CI | — | complete | all local green; CI pending push |

---

## Test and CI evidence

Final local totals on this commit (Stage 5 close):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1057 | 1057 | 0 |
| **`npm test` chain** | **1485** | **1485** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1771** | **1771** | **0** |

Test growth from Plan 0012 close to Plan 0013 close: **+37 tests** (1734 → 1771). Plan target was +18 to +35; actual +37 is in the upper band — justified per `feedback_test_count_overshoot` (each test asserts a distinct contract).

Remote CI:

- **Stage 2 (`2dba189`)** — run [`27077084697`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27077084697): **`success`** on all 4 matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).
- **Stage 3 + 5 (this commit)** — recorded in a follow-up log commit after the close push completes.

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` | unchanged |
| `v0.2.0` tag at `ea595e146e26edbd1942486ac98ea38560947210` | unchanged (no retag) |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` cost paragraph (around L636) byte-identical | preserved |
| OQ4 forbidden cost-claim tokens absent from new prose | preserved |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` through `0012-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/runtime/**` untouched | preserved (Plan 0012's doctor.ts exception does NOT extend here) |
| `packages/driver-claude-code/**` untouched | preserved |
| Plan 0006 T9.5 cache-execution invariant | preserved (marketplace `--check` exit 0; 24 derived byte-identical; allowlist coherent) |
| No `~/.claude/` or `~/.codex/` settings mutation | preserved |
| Skill count: 13 (was 12); marketplace allowlist: 24 (was 23); plugin version field: `0.2.0` (unchanged) | preserved |

---

## Adaptive scope outcome

Plan 0013 was scoped as adaptive from Stage 1. With T1 verdicts A-partial / A / A:
- `$claude-effort` standalone skill **NOT shipped** (OQ-A A-partial → docs-only)
- `$claude-deep-research` skill **shipped** (OQ-B A)
- Saved-workflow + `args` docs **shipped** (OQ-C A; unconditional per plan)

Final skill count delta: **+1** (not +2). The adaptive design correctly avoided shipping a useless `$claude-effort` skill once T1 OQ-A confirmed `ultracode` is silently rejected by the CLI.

---

## Deferred / future work

- **`/workflows` TUI panel wrapper** (agent management view) — TUI-only; same class as `/tasks` (Plan 0011 Verdict B). Defer to Plan 0014+ if/when Claude exposes a JSON surface or PTY-injection is invested.
- **`$claude-tasks` PTY-injection design** — Plan 0011 backlog continues
- **Skill-discovery surface test** — Codex's smoke test ran the dispatcher directly; the `$claude-*` SKILL.md → dispatcher chain via Codex chat is still unverified end-to-end
- **Plugin rename** (`claude-companion` → `cc`/`claude` etc.) — separate plan if maintainer authorizes
- **v0.3.0 release tag** — separate maintainer step. Plan 0013 made the plugin even more correct against Claude Code w22+ docs; v0.3.0 is a clean release candidate now
- **Plan 0004 T11 / T12 (still paused)** — post-cutover benchmark + cost-paragraph decision. Pending ≥ 2026-06-16 window
- **Plan 0005 (still deferred)** — Stop-time review gate. Stays deferred until Plan 0004 closes
- **Opus 4.8 probe floor verification** — not empirically verified
- **G7-G10 backlog from Plan 0007 audit** — LOW priority CLI verb wrappers

---

## Lessons learned

### A-partial verdicts deserve treatment as docs-only fixes

T1 OQ-A returned A-partial: the CLI flag accepted the value syntactically (exit 0) but emitted a warning and structurally produced identical JSONL to baseline. **Lesson**: an A-partial verdict isn't a free pass to ship a wrapper — it's evidence that the behavior we'd be wrapping doesn't actually exist. Docs-only is the correct response. Plan 0013 saved ~14 tests + 1 SKILL.md by not shipping `$claude-effort` once A-partial was confirmed.

### Probe via the exact runtime shape

OQ-A's discriminating evidence came from passing `--effort ultracode` directly to `claude --bg` and inspecting both the warning channel AND the resulting JSONL. Just checking that `--effort ultracode` exits 0 would have been wrong — exit 0 with silent warning IS the failure mode. **Lesson**: probes must check what users actually care about (behavior change), not just "did the command accept the input."

### `--bg` slash-command parse is a stable contract

OQ-B and OQ-C both depend on Claude's CLI parsing `/foo` as a slash command via `--bg` at the protocol level. This contract held across Plan 0010 (`/goal`), Plan 0011 (`/fork`, `/batch`), and now Plan 0013 (`/deep-research`). Pattern: anytime a Claude slash command is documented, `claude --bg "/foo args"` likely works the same way. **Lesson**: future plans adding slash-command wrappers can probe with shorter Node helpers since the parse mechanism is well-understood.

### `cmdDelegate` identity transformer is a feature, not a bug

The fact that `cmdDelegate` does NO prompt transformation means it can carry slash commands through unchanged — useful for saved workflows. The `$claude-workflow`'s `ultracode:` prefix transformer is correct for new workflows but breaks slash-command parsing. **Lesson**: documented the asymmetry clearly in T4. Future wrappers should think about whether they need a transformer that interferes with `/foo` parsing.

### Fifth clean audit pattern

Plans 0009, 0010, 0011, 0013 all earned `ready-for-report` with zero findings. Plan 0012 had 1 MINOR. **Pattern that holds**: probe-then-implement, tight scope at Stage 1, single executor per fan-out batch with explicit non-overlapping file sets, pre-emptive straggler-grep, adaptive scope when probe outcomes warrant. **Recommendation**: continue this discipline for Plan 0014+.

---

## Final verdict

Plan 0013 ships. All six T-tasks complete; adaptive scope correctly applied (1 of 2 candidate skills shipped per T1 verdicts); zero Stage 3 audit findings; Stage 4 polish skipped per `ready-for-report` verdict; all standing safety invariants preserved; **1771 tests pass (0 fail)** across all lanes; marketplace payload byte-identity intact; cost paragraph byte-identical.

The plugin now ships 13 skills with deeper alignment to Claude Code's documented dynamic-workflow surface. Users have:
- **A direct entry point** to `/deep-research` via `$claude-deep-research`
- **Clear guidance** on `--effort` valid values + how to invoke auto-orchestration (`$claude-workflow`)
- **Documented path** for invoking saved workflows + the `args` parameter

The only remaining documented workflow surface NOT covered is `/workflows` TUI panel (agent management) — deferred to backlog as TUI-only.

**v0.3.0 is now a clean release candidate** — Plan 0013 closed the documented workflow coverage gaps. The release decision is the maintainer's.

Plan 0014+ candidates listed in deferred work.
