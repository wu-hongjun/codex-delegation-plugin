# Stage 5 — Report: Plan 0011

## Report metadata

- **Plan**: Plan 0011 — Slash-command wrappers (`$claude-fork` + `$claude-batch`; `$claude-tasks` deferred)
- **Date**: 2026-06-05
- **Commit reported**: this commit (Stage 5 + Stage 3 combined; Stage 4 skipped)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — promoted from maintainer ask "Let's do a round of slash-command wrappers (/tasks, /fork, /batch) — pattern proven by `$claude-goal`". Adaptive scope: T1 probes each command; T2-T5 implementation only for A-verdict commands. OQ-D / OQ-E / OQ-F resolved inline; OQ-A / OQ-B / OQ-C deferred to T1 empirical probe.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-05 at commit `bf6f7dc`. T1 returned B/A/A; T2-T5 shipped 2 of 3 commands per adaptive scope. Local total 1729 tests. CI run [`27037662224`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27037662224) **`success`** across `ubuntu-latest + macos-latest × Node 20 + 22`.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context via fresh `oh-my-claudecode:critic` (Opus) subagent. Verdict **`ready-for-report`** (zero blocking/major findings; one pre-existing NIT for stale L3 dispatcher header comment; **third clean audit in this session**, after Plans 0009 and 0010).
- **Stage 4 polish**: SKIPPED. Audit verdict allowed direct progression to Stage 5.
- **Final status**: `complete`

---

## Executive summary

Plan 0011 extends Plan 0010's `$claude-goal` slash-command-wrapper pattern to two more Claude Code slash commands:

1. **`$claude-fork <directive>`** — wraps `/fork`. Spawns a forked subagent in a background session. Verified via T1 OQ-B: `<task-notification>` JSONL record showed 30,117 subagent tokens, 20,990 ms duration, full subagents/ directory with conversation log.

2. **`$claude-batch <instruction>`** — wraps `/batch`. Injects the runtime's `# Batch: Parallel Work Orchestration` system prompt (plan-mode + decomposition + parallel-execution phases) with `command_permissions allowedTools=[]`. Verified via T1 OQ-C: structurally identical to Plan 0010 `/goal` probe.

**`$claude-tasks` was probed and deferred** (T1 OQ-A Verdict B): `/tasks` opens an interactive TUI dialog that blocks on keyboard input (`claude agents --json` shows `"status": "waiting"`, `"waitingFor": "dialog open"`). No JSONL conversation file is created. PTY-injection fallback is a substantial design question deferred to Plan 0012+.

Adaptive scope worked correctly: 2 of 3 commands shipped, not 3 of 3. Skill count grew **10 → 12**. Marketplace allowlist grew **21 → 23 derived files**. defaultPrompt grew **10 → 12**. All static and CI gates clean: **1729 tests pass** (1443 npm test + 28 attach + 258 bench). Remote CI `success` on `ubuntu + macos × Node 20 + 22`.

Plugin version unchanged at `0.2.0`. No release tag this plan.

**Distinguishing feature**: Plan 0011's adaptive scope correctly absorbed a Verdict-B outcome by skipping a command rather than force-implementing with a fragile workaround.

---

## What shipped

### New skill: `$claude-fork <directive>`

- `packages/plugin-codex/skills/claude-fork/SKILL.md` (NEW) — strict frontmatter (`name: claude-fork`); run line `node "<plugin-root>/scripts/claude-companion.mjs" fork -- "<directive>"`; accepted flags (`--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--json`, `--yes`); rejects `--allow-edit`; approval-flow notes that `/fork` spawns a subagent in the parent session; cost notice (30k baseline for trivial directives); `### Next steps` cross-references to `$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`.

### New skill: `$claude-batch <instruction>`

- `packages/plugin-codex/skills/claude-batch/SKILL.md` (NEW) — strict frontmatter (`name: claude-batch`); run line `node "<plugin-root>/scripts/claude-companion.mjs" batch -- "<instruction>"`; same accepted-flags list; rejects `--allow-edit`; approval-flow describes the injected `# Batch: Parallel Work Orchestration` system prompt; cost notice highlights orchestration scope discipline; same `### Next steps` cross-references.

### Empirical probe artifacts (T1)

- [`artifacts/oq-a-tasks-probe-20260605.txt`](artifacts/oq-a-tasks-probe-20260605.txt) — **Verdict B** for `/tasks`. Evidence: `claude agents --json` `"status": "waiting"`, `"waitingFor": "dialog open"`; no JSONL file created; `claude logs` shows TUI task-picker dialog. Defer to Plan 0012+.
- [`artifacts/oq-b-fork-probe-20260605.txt`](artifacts/oq-b-fork-probe-20260605.txt) — **Verdict A** for `/fork`. Evidence: JSONL L12 `<task-notification>` with `<status>completed</status>`, `<result>OK</result>`, 30,117 subagent tokens; subagents/ directory created with full conversation log.
- [`artifacts/oq-c-batch-probe-20260605.txt`](artifacts/oq-c-batch-probe-20260605.txt) — **Verdict A** for `/batch`. Evidence: JSONL L9 `<command-name>/batch</command-name>`; L10 multi-paragraph `# Batch: Parallel Work Orchestration` system prompt; L14 `command_permissions` with `allowedTools=[]`.

### Dispatcher subcommands

- `packages/plugin-codex/scripts/claude-companion.mjs`:
  - New `case 'fork':` at L77, `case 'batch':` at L80
  - New `cmdFork` function at L329 — mirror of `cmdGoal`: rejects `--allow-edit` at parse time; calls shared `_runDelegateCore` with `promptTransformer: p => '/fork ' + p` and a fork-specific approval-flow extra-output block
  - New `cmdBatch` function at L354 — mirror of `cmdGoal`: same shape with `promptTransformer: p => '/batch ' + p`
  - `printUsage` extended at L2034-L2035 with new `fork [flags] -- <directive>` and `batch [flags] -- <instruction>` rows
  - All 8 applicable flag parentheticals (`--yes`, `--json`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`) updated to include both `fork` and `batch`
  - `--allow-edit` rejection list reads "rejected by review, adversarial-review, workflow, goal, fork, and batch"

### Plugin manifest

- `packages/plugin-codex/.codex-plugin/plugin.json`:
  - `interface.defaultPrompt` array grew 10 → 12 with new entries `"Fork a Claude Code subagent for a directive."` (L25) + `"Run a batch of parallel Claude Code instructions."` (L26)

### Plugin README

- "Ten skills" → "Twelve skills" lead-in
- 2 new bullets in `## Current v1 scope` for `$claude-fork` + `$claude-batch`
- New `### $claude-fork` subsection under `## Commands and skills`
- New `### $claude-batch` subsection under `## Commands and skills`
- "All ten commands" → "All twelve commands"
- New dispatcher example lines for `fork` and `batch`
- **Cost paragraph (around L636) preserved byte-identical**

### Marketplace README

- "10 skills" → "12 skills"
- 2 new bullets for `$claude-fork` + `$claude-batch`
- 2 short new subsections (end-user wording)

### Marketplace plumbing (23 derived files)

| File | Change |
|---|---|
| `tools/package-marketplace.mjs` | `DERIVED_FILES` array +2 (`skills/claude-fork/SKILL.md`, `skills/claude-batch/SKILL.md`); 21 → 23 |
| `marketplace/MANIFEST.md` | "21 files" → "23 files" + 2 new bullets |
| `documentation/RELEASING.md` | "21 derived"/"21 source-derived" → "23" (3 occurrences); skill list extended with `$claude-fork` + `$claude-batch`; "ten-skill" → "twelve-skill"; "other nine skills" → "other eleven skills" |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +2; "Ten"/"ten"/"ten-skill"/"10 skill names"/"10 skills" → "Twelve"/"twelve"/"twelve-skill"/"12 skill names"/"12 skills" |

### Test additions (7 files, +68 tests total)

| File | Change | New tests |
|---|---|---|
| `dispatcher.test.mjs` | 14 new describe blocks (7 per command): `--help` row, happy path, prompt-prefix, non-TTY, `--allow-edit` rejection, standard-flags, approval-flow | 14 |
| `skills-manifest.test.mjs` | `SKILL_NAMES` + `SKILL_SUBCOMMANDS` extended; existing 10-count assertions bumped to 12; 14 fork/batch-specific tests | 14 + count-bump effects |
| `marketplace-layout.test.mjs` | `EXPECTED_SKILL_NAMES` + `DERIVED_FILES_ALLOWLIST` extended; "10 skill directories" → "12"; "21 derived" → "23" | per-skill iterator effects |
| `marketplace-smoke.test.mjs` | `SKILL_NAMES` + wording bumps | per-skill iterator effects |
| `marketplace-releasing.test.mjs` | `SKILL_NAMES` + "all 10 skills" → "all 12" | per-skill iterator effects |
| `docs-split.test.mjs` | `SKILL_NAMES` + "Ten skills" → "Twelve skills" | per-skill iterator effects |
| `readme.test.mjs` | "Ten"/"ten" wording bumped to "Twelve"/"twelve" | per-skill iterator effects |

Total: +68 tests. Plan target was +50-60 (assuming 3 A-verdicts; only 2 landed). Overshoot justified per `feedback_test_count_overshoot` — each test is a distinct contract assertion; the SKILL_NAMES iterator extensions fan out across 4 marketplace/docs tests since the set grew by 2 (not 1).

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-05 via maintainer ask "Let's do a round of slash-command wrappers". Adaptive scope locked at Stage 1: T1 probes each command, T2-T5 implementation only for A-verdict commands. 6 T-tasks identified. OQ-A/B/C deferred to T1 empirical probe; OQ-D/E/F resolved inline.
- **Stage 2 (Implement)** — Complete 2026-06-05 at commit `bf6f7dc`. Two `oh-my-claudecode:executor` agent batches: Batch 1 (T1 three parallel probes via single executor); Batch 2 (T2-T5 sequential after T1 verdicts). T1 returned B/A/A; T2-T5 shipped 2 of 3 commands. T6 orchestrator-absorbed. Local total 1729 tests. CI run `27037662224` `success`.
- **Stage 3 (Audit)** — Complete 2026-06-05. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`**. Zero blocking/major findings; one pre-existing NIT for stale L3 dispatcher header comment (deferred to drive-by future cleanup; Plan 0011 did not introduce this gap).
- **Stage 4 (Polish)** — SKIPPED. Verdict allowed direct progression.
- **Stage 5 (Report)** — This document. Plan status flips `auditing → reporting → complete` in this commit (combined with Stage 3 push since polish was skipped).

---

## T-task summary

| Task | Verdict | Status | Evidence |
|---|---|---|---|
| T1-OQ-A `/tasks` probe | B (TUI-only) | complete | `artifacts/oq-a-tasks-probe-20260605.txt` — `"waitingFor": "dialog open"`; no JSONL |
| T1-OQ-B `/fork` probe | A (subagent) | complete | `artifacts/oq-b-fork-probe-20260605.txt` — `<task-notification>` JSONL L12; 30k tokens |
| T1-OQ-C `/batch` probe | A (orchestration) | complete | `artifacts/oq-c-batch-probe-20260605.txt` — `<command-name>/batch</command-name>` + system prompt + `allowedTools=[]` |
| T2 — Two new SKILL.md | — | complete | `claude-fork/SKILL.md` + `claude-batch/SKILL.md`; strict frontmatter; mirror `$claude-goal` shape |
| T3 — Dispatcher subcommands | — | complete | `cmdFork` + `cmdBatch` mirror `cmdGoal`; both reject `--allow-edit`; printUsage rows + parentheticals coherent |
| T4 — Marketplace + count bumps | — | complete | `--check` exit 0 with 23 derived; smoke `--help` lists 12 skills; straggler-grep clean |
| T5 — Tests | — | complete | +68 tests across 7 files; each a distinct contract assertion |
| T6 — Gates + CI | — | complete | All local gates green; CI `27037662224` `success` on 4 matrix legs |

---

## Test and CI evidence

Final local totals on the Stage 2 commit (`bf6f7dc`):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1016 | 1016 | 0 |
| **`npm test` chain** | **1443** | **1443** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1729** | **1729** | **0** |

Test growth from Plan 0010 close to Plan 0011 close: **+68 tests** (1661 → 1729). Plan target was +50-60 with full scope; with one command deferred, the actual +68 reflects the per-skill iterator effects fanning out twice rather than once. Justified per `feedback_test_count_overshoot`.

Remote CI:

- **Stage 2 (`bf6f7dc`)** — run [`27037662224`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27037662224): **`success`** on all 4 matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).
- **Stage 5 (this commit)** — recorded in a follow-up log commit after this push completes.

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` | unchanged |
| `v0.2.0` tag at `ea595e146e26edbd1942486ac98ea38560947210` | unchanged (no retag) |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` cost paragraph (around L636) byte-identical | preserved (audit `grep -c` returns 1; `docs-split.test.mjs` byte-identity test passes) |
| OQ4 forbidden cost-claim tokens absent from new prose | preserved (audit `grep -rE` zero hits) |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` through `0010-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/runtime/**` untouched | preserved |
| `packages/driver-claude-code/**` untouched | preserved (no driver changes in Plan 0011; Plan 0007 STATUS_MAP widening still stands) |
| Plan 0006 T9.5 cache-execution invariant | preserved (marketplace `--check` exit 0; 23 derived files byte-identical; allowlist updated coherently across all 7 consumer files) |
| No straggler 10/ten/21/nine references | preserved (audit comprehensive grep returns zero actionable findings) |
| No `~/.claude/` settings mutation during Stage 2 | preserved (T1 probes created bg sessions only; all cleaned via `claude stop`) |

---

## Deferred / future work

- **`$claude-tasks`** — `/tasks` TUI requires arrow-key navigation + Enter; PTY-injection fallback is a substantial design question. Deferred to Plan 0012+ if maintainer chooses to invest.
- **Other slash-command wrappers** not in this batch — e.g. `/simplify`, `/deep-research` (covered by `$claude-workflow`), `/code-review`. Each one is a separate plan.
- **L3 dispatcher header comment refresh** — pre-existing stale comment (missing `followup`/`review`/`adversarial-review`/`fork`/`batch`). NIT-level; drive-by future fix.
- **Plan 0004 T11 / T12 (still paused)** — post-cutover benchmark + cost-paragraph decision. Pending ≥ 2026-06-16 window.
- **Plan 0005 (still deferred)** — Stop-time review gate. Stays deferred until Plan 0004 closes.
- **Opus 4.8 probe floor verification** — `opus-4-8-supported` stays at `2.1.156`; not empirically verified.
- **G7-G10 backlog from Plan 0007 audit** — LOW priority CLI verb wrappers.
- **Release tag `v0.3.0`** — separate maintainer step. Plan 0011 does NOT cut a tag. Skills shipped since `v0.2.0`: `$claude-goal` (Plan 0010), `$claude-fork` + `$claude-batch` (Plan 0011) — 3 new skills total.

---

## Lessons learned

### Adaptive scope earns its keep when one probe returns B

Plan 0011 was designed adaptive from Stage 1: only A-verdict commands proceed to T2-T5. T1 returned B/A/A (one B, two A). The orchestrator correctly:
- Shipped the 2 A-verdict commands as scoped
- Deferred the B-verdict command to backlog with the probe artifact as load-bearing justification
- Updated count math at the T1→T2 boundary (10→12 / 21→23, not 10→13 / 21→24)

The deferral avoided a fragile PTY-injection fallback that would have added complexity for marginal value. **Recommendation**: design probe-then-implement plans with explicit adaptive-scope mechanics rather than committing to a full delta up front.

### Probe artifacts must quote load-bearing evidence

All three T1 probes wrote artifacts with explicit quoted JSONL records, `claude agents --json` rows, and `claude logs` output. The verdicts logically follow from the quoted evidence — not from narrative speculation. The auditor was able to verify each verdict by re-reading the artifact alone. **Recommendation**: probe artifacts must quote the actual JSONL bytes or runtime evidence; verdict narrative without quoted evidence is insufficient.

### Pre-emptive straggler-grep continues to prevent F-findings

Plan 0010's lesson held: explicit straggler-grep in the executor brief catches missed wording bumps before audit. Plan 0011's straggler grep returned zero actionable findings. **Recommendation**: when a systemic count bump touches multiple files AND grows the count by more than 1, include explicit straggler-grep across all word forms (`\b10\b`, `\bten\b`, `\b21 derived\b`, `\bnine\b`, `\beleven\b`).

### Third consecutive `ready-for-report` audit

Plans 0009, 0010, and 0011 all achieved `ready-for-report` verdicts with zero blocking/major findings (Plan 0011 had one NIT-level pre-existing finding inherited from before Plan 0011). The pattern holds: tight scope at Stage 1 + explicit non-overlapping executor file sets + pre-emptive straggler-grep + adaptive scope when probe outcomes warrant. **Recommendation**: continue this discipline for future plans.

### Shared `_runDelegateCore` helper now powers 5 subcommands

Plan 0008 introduced `_runDelegateCore` to share the bg-session logic between `cmdDelegate` and `cmdWorkflow`. Plan 0010 extended it to `cmdGoal`. Plan 0011 extended it to `cmdFork` and `cmdBatch`. Each new wrapper is now a 2-line variation: change the `promptTransformer` and the extra-output text. **Lesson**: extracting the shared helper early (Plan 0008) paid off three plans later.

### Environment shift handled cleanly mid-cycle

Claude Code upgraded from brew `2.1.153` → native `2.1.165` mid-session. Plan 0007's doctor probes (`opus-4-8-supported`, `workflows-supported`, `bg-exec-supported`) now all return `ok` on the upgraded binary. The upgrade did not require any plan changes — the doctor floors set in Plan 0008 (`workflows-supported` at `2.1.153`) were correct. T1 probes ran on `2.1.165` and worked as designed.

---

## Final verdict

Plan 0011 ships. All six T-tasks complete; adaptive scope correctly applied (2 of 3 commands shipped per T1 verdicts); zero blocking/major Stage 3 audit findings (third clean audit in this session); Stage 4 polish skipped per `ready-for-report` verdict; all standing safety invariants preserved; **1729 tests pass (0 fail)** across all lanes; remote CI green on `ubuntu-latest + macos-latest × Node 20 + 22`; marketplace payload byte-identity intact; cost paragraph byte-identical.

The plugin now ships 12 skills: 10 from Plans 0001-0010 plus the two new `$claude-fork <directive>` and `$claude-batch <instruction>`. Codex users can now wrap Claude Code's `/fork` (subagent spawning) and `/batch` (orchestration runtime) as first-class skills in addition to `/goal` (stop-condition tracking). The `$claude-tasks` deferral is well-justified by load-bearing probe evidence and listed in deferred work for Plan 0012+.

Plan 0012+ candidates listed in deferred work (`$claude-tasks` via PTY-injection, other slash-command wrappers, L3 comment drive-by refresh, release tagging).
