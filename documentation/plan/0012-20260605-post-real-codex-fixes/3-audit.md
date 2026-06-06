# Plan 0012 Stage 3 — Audit

Audited commit: `9720b21` (Plan 0012 Stage 2)
Audited on: 2026-06-06
Auditor: `oh-my-claudecode:critic` (Opus, fresh-context subagent)

## Verdict

**ready-for-report** with one **MINOR-1** cosmetic finding addressed in Stage 4 polish.

Plan 0012 ships exactly what it claimed, with disciplined probe-then-implement methodology. The single production fix (T5: `probeClaudeBgNoPrompt` rewrite from subprocess to version-floor check) correctly eliminates both the no-TTY hang and the idle-session leak. All safety invariants hold. Test counts are accurate and each new test pins a distinct contract. One MINOR copy-paste cosmetic issue found (adversarial-review hint label says `[review]` instead of `[adversarial-review]`) — does not affect behavior or test coverage; resolved in Stage 4.

## Audit methodology

**Files read** (12+):
- Plan documents: `readme.md`, `1-plan.md`, `2-implement.md`, all 3 probe artifacts
- Original motivating evidence: `documentation/testing/findings-20260605.md`
- T5: `packages/runtime/src/doctor.ts:499-553`, `packages/runtime/test/doctor.test.mjs:293-326`
- T7 + T8: `packages/plugin-codex/scripts/claude-companion.mjs:1-67, 490-510, 605-654, 740-770, 1340-1365, 1693-1712`
- T7 + T8 tests: `packages/plugin-codex/test/dispatcher.test.mjs:6963-7023`
- T6: `packages/plugin-codex/skills/claude-goal/SKILL.md`
- Plugin manifest: `packages/plugin-codex/.codex-plugin/plugin.json`

**Commands run** (all exit 0):

| Command | Result |
|---|---|
| `git rev-parse HEAD` | `9720b21` |
| `git rev-parse plan-0004-pre-cutover` | `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` |
| `git rev-parse v0.2.0` | `ea595e146e26edbd1942486ac98ea38560947210` |
| `git diff 0386b54..9720b21 -- tools/bench/ packages/runtime/test/ documentation/plan/0004-* 0005-* 0006-* 0007-* 0008-* 0009-* 0010-* 0011-* .github/ packages/driver-claude-code/src/` | Empty (frozen dirs preserved) |
| `git diff 0386b54..9720b21 -- packages/runtime/src/` | Only `doctor.ts` modified (T5 fix, documented exception) |
| `git diff 0386b54..9720b21 -- packages/plugin-codex/README.md` | Empty (cost paragraph byte-identical) |
| `node tools/package-marketplace.mjs --check` | exit 0; 23 derived (unchanged), 64 bundled, 3 synthesized, 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; 12 skills (unchanged) |
| `diff -q` for all 3 marketplace mirrors (dispatcher, claude-goal SKILL.md, dist/doctor.js) | all identical to source |
| `npm run lint` / `typecheck` / `format` | all exit 0 (clean) |
| `npm test` | **1447** (mock 68 + runtime **173** + driver 187 + plugin **1019**), 0 fail |
| `npm run test:attach` | **28**, 0 fail (unchanged) |
| `npm run test:bench` | **258**, 0 fail (unchanged) |
| `node packages/plugin-codex/scripts/claude-companion.mjs setup` | aggregate `warn`; `claude-bg-no-prompt` = `ok` (was `FAIL`) |
| `node packages/plugin-codex/scripts/claude-companion.mjs setup --json` | `ok: true, status: warn` |
| `claude agents --json` (before setup) → (after setup) | 14 sessions → 14 sessions (no idle session leak) |

## Probe evidence soundness

- **T1 OQ-A** Verdict C: artifact's MARKER-A/MARKER-B repro succeeded both before and after followup; the smoke-test "result returns A instead of B" was an artifact of the initial delegate session being stuck in `needs_input`, NOT a cmdResult bug. Residual risk (empty `finalMessagePath` in `sendFollowupTurn`) documented for T4. **Justified.**
- **T2 OQ-B** Verdict B: 6-probe matrix isolated the root cause (claude --bg --help under shell:false + stdio:pipe + timeout:5000 = SIGTERM at 5006ms; the same command CREATES idle bg sessions as a side effect). 8 idle sessions had accumulated by probing — confirming the leak. **Verdict-B real fix decision justified.**
- **T3 OQ-C** Verdict C: 2 repros — first succeeded with 43 JSONL entries and a normal model reply; second stuck in `needs_input` with 14 JSONL entries and no assistant turn after `/goal` injection. Intermittent upstream brittleness, not a plugin-side sentinel-detection bug. **Justified.**

## Contract compliance vs 1-plan.md

| Task | Verdict | Status | Evidence |
|---|---|---|---|
| T1 `/delegate-followup` probe | C | complete | `artifacts/oq-a-delegate-followup-probe-20260606.txt` |
| T2 `/setup` probe | B | complete | `artifacts/oq-b-setup-codex-sandbox-probe-20260606.txt` |
| T3 `/goal` probe | C | complete | `artifacts/oq-c-goal-non-resolution-probe-20260606.txt` |
| T4 residual-risk doc | — | complete | comment near `cmdResult`'s `finalMessagePath` read |
| T5 probe rewrite | — | complete | `packages/runtime/src/doctor.ts:507-555` + 4 new tests, 3 old replaced |
| T6 goal SKILL.md stall guidance | — | complete | `### When the goal stalls` subsection appended |
| T7 version reporting | — | complete | `loadPluginVersion()` reads `.codex-plugin/plugin.json`; +1 regression test |
| T8 error-message hints | — | complete | review/adversarial-review jobId-shape hint; stop bulk-stop hint; +2 regression tests |
| T9 gates + CI | — | complete | all local gates green; CI run `27063824610` `success` |

## Safety invariants

| Invariant | Status |
|---|---|
| Cost paragraph byte-identical (around L636) | PASS (audit `git diff` empty) |
| `plan-0004-pre-cutover` at `7d9b5f1` | PASS |
| `v0.2.0` at `ea595e1` | PASS (no retag) |
| Plan 0005 status `deferred` | PASS |
| Frozen dirs (bench, .github, plan 0004-0011, driver/src) | PASS (`git diff` empty) |
| `packages/runtime/**` modification | DOCUMENTED EXCEPTION — limited to `src/doctor.ts` T5 fix per readme.md L43; 2-implement.md L213 explicitly notes MODIFIED |
| T9.5 cache invariant (marketplace tree resynced) | PASS (23 derived + 64 bundled byte-identical; mirrors rebuilt) |
| No straggler 9/ten/21/22 references | PASS (counts unchanged this plan) |
| No `~/.claude/` or `~/.codex/` mutation | PASS |
| Skill count: 12 (unchanged); marketplace allowlist: 23 (unchanged) | PASS |

## Plugin behavioral verification

- `setup` aggregate: `warn` (was `FAIL` under no-TTY context). The only `warn` remaining is the informational `claude-bg-flag` probe (Plan 0006 designed-informational), not gating.
- `claude-bg-no-prompt` probe: now `ok` via version floor `2.1.167 >= 2.1.149`.
- `pluginVersion` field in job records: now reports `0.2.0` (was `0.0.0`).
- Idle bg session leakage: **eliminated** (14 sessions before setup → 14 sessions after).

## Test integrity

| Lane | 2-implement.md claim | Actual | Delta vs Plan 0011 |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | +1 (T5: +4 new replace -3 old) |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1019 | 1019 | +3 (T7 +1; T8 +2) |
| **`npm test`** | **1447** | **1447** | **+4** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1733** | **1733** | **+4** |

Counts match 2-implement.md exactly. The +4 delta is under the +5-10 plan target by design — T4 (Verdict C → comment only) and T6 (Verdict C → docs only) had no behavior change requiring a test.

## Findings

### Critical / Blocker / Major

**None.**

### Minor

**MINOR-1**: `packages/plugin-codex/scripts/claude-companion.mjs:1702` in `cmdAdversarialReview` emits a hint label of `[review]` instead of `[adversarial-review]`. The hint text body also says `$claude-review takes a <jobId-or-prefix>` instead of `$claude-adversarial-review takes a <jobId-or-prefix>`. This is a copy-paste from `cmdReview` at L1350. The T8 regression test only covers `cmdReview`, so the cosmetic copy-paste was not caught.

**Impact**: A user invoking `$claude-adversarial-review "<freeform prompt>"` sees `[review]` label and review-specific hint text when the error came from `adversarial-review`. Functional behavior is correct (exit 1, hint emitted, error reported); only the label prefix and skill name in the hint body are wrong.

**Resolution**: Stage 4 polish (see `4-polish.md`).

### NIT

**None.**

## Approval gate

**Stage 4 polish triggered** to address MINOR-1. After polish, the plan proceeds to Stage 5 reporting. Stage 3 verdict already supports `ready-for-report`; Stage 4 is the disciplined response to a cosmetic finding rather than a blocking gate.
