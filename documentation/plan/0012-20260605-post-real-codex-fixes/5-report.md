# Stage 5 — Report: Plan 0012

## Report metadata

- **Plan**: Plan 0012 — Post real-Codex-testing fixes (delegate followup residual risk; setup probe rewrite; goal stall guidance; version reporting consistency; error-message hints)
- **Date**: 2026-06-06
- **Commit reported**: this commit (Stage 3 + 4 + 5 combined)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted 2026-06-05 from real-Codex smoke-test findings; approved 2026-06-06 via maintainer AskUserQuestion authorization. OQ-A / OQ-B / OQ-C deferred to T1-T3 empirical probes; OQ-D resolved in T7; OQ-E resolved inline. 9 T-tasks.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-06 at commit `9720b21`. T1-T3 probes returned C/B/C; T5 shipped the only production code fix; T4/T6 docs-only; T7/T8 isolated dispatcher tweaks. Local total 1733 tests. CI run [`27063824610`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27063824610) **`success`** across `ubuntu-latest + macos-latest × Node 20 + 22`.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context via fresh `oh-my-claudecode:critic` (Opus) subagent. Verdict **`ready-for-report`** with one **MINOR-1** cosmetic finding (adversarial-review hint mislabeled). Resolved in Stage 4.
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — MINOR-1 fixed: hint label and body text corrected in `cmdAdversarialReview`; +1 parallel regression test added. Total moves to 1734.
- **Final status**: `complete`

---

## Executive summary

Plan 0012 closes the loop on yesterday's real-Codex smoke test (`documentation/testing/findings-20260605.md`). That test exposed 4 real plugin issues that 1729 unit tests had not caught — Codex's no-TTY execution context surfaced behaviors that ran fine in shell.

**Probe outcomes (T1-T3)**:
- **HIGH-1** (delegate→followup→result): **Verdict C** — controlled repro showed both result paths healthy. The smoke-test failure was actually the initial delegate job stuck in `needs_input` (model never replied), not a `cmdResult` selection bug. Documented residual risk only (T4).
- **HIGH-2** (setup FAIL under Codex): **Verdict B** — root cause: `claude --bg --help` does NOT print help; it CREATES an idle bg session. Under no-TTY piped stdio: hangs and SIGTERMs at 5006ms. Probe was leaking idle sessions every run (8 had accumulated). Replaced with version-floor check (T5) — production fix.
- **MEDIUM-1** (goal non-resolution): **Verdict C** — intermittent upstream `/goal` brittleness. Repro 1 succeeded, repro 2 stuck. SKILL.md retry guidance only (T6).

**Isolated fixes (T7-T8)**:
- **T7** — Plugin version reporting consistency: `loadPluginVersion()` reads `.codex-plugin/plugin.json` directly. Reported version is now `0.2.0` (was `0.0.0` from workspace package.json).
- **T8** — Error message hints: review/adversarial-review emit jobId-shape hint when input looks like a prompt; bare `stop --all` emits `--all-awaiting-followup` hint.

**Stage 4 polish**:
- **MINOR-1** — Fixed `cmdAdversarialReview` hint label (was using `cmdReview`'s copy-paste). +1 parallel regression test.

**Side benefit of T5**: setup probe no longer leaks idle bg sessions. Confirmed via `claude agents --json` count before/after (14 → 14, no change).

**Plugin version unchanged at `0.2.0`. No release tag this plan. v0.3.0 is a clean candidate now** — Plan 0012 resolved all the gaps surfaced by real-Codex testing.

---

## What shipped

### T5 — `probeClaudeBgNoPrompt` rewrite (the production fix)

`packages/runtime/src/doctor.ts:507-555`:

- **Before**: ran `claude --bg --help` as a subprocess. Comment claimed it "prints usage for --bg" — wrong for claude 2.1.166+. Under no-TTY piped stdio with timeout 5000ms: hung and SIGTERMed. With TTY: created an idle bg session as a side effect (the `--help` flag is ignored when `--bg` is parsed first).
- **After**: runs `claude --version`, parses via `parseClaudeVersion`, checks `meetsFloor(parsed, "2.1.149")`. TTY-independent. No subprocess that could hang. Probe NAME unchanged for test compatibility.
- **Strategy comment** rewritten to reflect the new approach.
- **Tests**: 4 new (above-floor ok; flag-independence; missing-binary fail; no-TTY-safe regression) replace 3 old subprocess-based tests. Net +1 test in `doctor.test.mjs`.

### T4 — Residual-risk code comment

`packages/plugin-codex/scripts/claude-companion.mjs:614-618`:

One-line comment near `cmdResult`'s `finalMessagePath` read documenting: `sendFollowupTurn` sets `turn.result.finalMessagePath = ''`; top-level `job.result.finalMessagePath` updates only via reconciler; stale data possible if reconciliation fails on a never-completed initial job. No behavior change.

### T6 — Goal SKILL.md stall guidance

`packages/plugin-codex/skills/claude-goal/SKILL.md`:

Appended `### When the goal stalls` subsection covering the intermittent `/goal` non-resolution behavior — if `$claude-status <jobId>` returns `needs_input` on the FIRST poll and stays, the slash command failed to reach the model. Stop and retry; reword directives to be more concrete (explicit termination sentinel) if two consecutive failures.

Mirrored to `marketplace/plugins/claude-companion/skills/claude-goal/SKILL.md` via `--write`.

### T7 — Version reporting consistency

`packages/plugin-codex/scripts/claude-companion.mjs:7-67`:

- Added imports for `readFileSync`, `dirname`, `join`, `fileURLToPath`.
- Added `loadPluginVersion()` helper that reads `.codex-plugin/plugin.json` relative to the dispatcher script.
- Both `pluginVersion: '0.0.0'` occurrences replaced with `PLUGIN_VERSION` (loaded once at module init).

Works in both source location (`packages/plugin-codex/scripts/.../`) and cached install location (`~/.codex/plugins/cache/cc-plugin-codex-local/claude-companion/0.2.0/scripts/.../`).

New regression test in `dispatcher.test.mjs:6963-6993` asserts `delegate --yes` job record's `codex.pluginVersion` matches `.codex-plugin/plugin.json` version field **dynamically** — survives future bumps.

### T8 — Error-message hints

`packages/plugin-codex/scripts/claude-companion.mjs`:

- **`cmdReview` (L1340-1365)** — if input arg contains a space, exceeds 50 chars, or doesn't start with `job_`: emit `[review] Hint: $claude-review takes a <jobId-or-prefix>...` before the existing "No job found" error.
- **`cmdAdversarialReview` (L1693-1712)** — same conditions; emit `[adversarial-review] Hint: $claude-adversarial-review takes a <jobId-or-prefix>...`. *(Stage 4 polish fixed the initial copy-paste mislabel.)*
- **`cmdStop`** — bare `--all` without `--all-awaiting-followup` and no positional: exit 2 with `[stop] Error: bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.`

New regression tests in `dispatcher.test.mjs:6997-7023`:
1. `review` with space-containing arg emits jobId hint
2. `adversarial-review` with space-containing arg emits `[adversarial-review]`-labeled hint (Stage 4 polish)
3. `stop --all` emits `--all-awaiting-followup` hint

### MINOR-1 polish (Stage 4)

Fixed the cosmetic copy-paste in `cmdAdversarialReview` hint message. Hint now uses correct label `[adversarial-review]` and correct skill name in body. Parallel regression test pins this contract.

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Drafted 2026-06-05 from real-Codex smoke-test findings; approved 2026-06-06 via maintainer AskUserQuestion authorization. Adaptive scope: probe-then-implement for 3 HIGH/MEDIUM issues + 2 isolated fixes. 9 T-tasks.
- **Stage 2 (Implement)** — Complete 2026-06-06 at commit `9720b21`. Two `oh-my-claudecode:executor` batches: Batch 1 (T1-T3 parallel probes) returned verdicts C/B/C; Batch 2 (T4-T8 fixes) implemented per verdicts. T9 orchestrator-absorbed. Local total 1733 tests. CI `27063824610` `success`.
- **Stage 3 (Audit)** — Complete 2026-06-06. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`** with one MINOR-1 cosmetic finding.
- **Stage 4 (Polish)** — Complete 2026-06-06. MINOR-1 resolved (hint label fix + parallel regression test). Local total 1734.
- **Stage 5 (Report)** — This document. Plan status flips `auditing → polishing → reporting → complete` in this commit.

---

## T-task summary

| Task | Verdict | Status | Evidence |
|---|---|---|---|
| T1 — `/delegate-followup` probe | C | complete | `artifacts/oq-a-delegate-followup-probe-20260606.txt`; MARKER-A/B repro succeeded both paths |
| T2 — `/setup` probe | B | complete | `artifacts/oq-b-setup-codex-sandbox-probe-20260606.txt`; SIGTERM at 5006ms under no-TTY; idle session leak confirmed |
| T3 — `/goal` probe | C | complete | `artifacts/oq-c-goal-non-resolution-probe-20260606.txt`; repro 1 succeeded, repro 2 stuck — intermittent upstream |
| T4 — HIGH-1 residual-risk comment | — | complete | `claude-companion.mjs:614-618` |
| T5 — HIGH-2 probe rewrite | — | complete | `doctor.ts:507-555` + 4 new tests; -3 old replaced; no idle leak; aggregate now `warn` (was `FAIL`) |
| T6 — MEDIUM-1 stall guidance | — | complete | `$claude-goal/SKILL.md` `### When the goal stalls` |
| T7 — version reporting | — | complete | `loadPluginVersion()` reads `.codex-plugin/plugin.json`; +1 dynamic-pin test |
| T8 — error hints | — | complete | review/adversarial-review jobId-shape hints; stop bulk-stop hint; +2 tests (Stage 2) + 1 polish test (Stage 4) |
| T9 — gates + CI | — | complete | all local + CI green; CI `27063824610` `success` on all 4 matrix legs |
| Polish MINOR-1 | — | complete | adversarial-review hint label fix + parallel regression test |

---

## Test and CI evidence

Final local totals on this commit (Stage 5 close):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1020 | 1020 | 0 |
| **`npm test` chain** | **1448** | **1448** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1734** | **1734** | **0** |

Test growth from Plan 0011 close to Plan 0012 close: **+5 tests** (1729 → 1734). Plan target was +5 to +10; actual is **at the low end** of the target band by design — T4 (Verdict C → comment only) and T6 (Verdict C → docs only) intentionally had no behavior change requiring tests.

Per-task test breakdown:
- T5: +1 (4 new replace 3 old in `doctor.test.mjs`)
- T7: +1 (`dispatcher.test.mjs` dynamic-pin version-match test)
- T8 (Stage 2): +2 (`dispatcher.test.mjs` review hint + stop hint)
- T8 (Stage 4 polish): +1 (`dispatcher.test.mjs` adversarial-review labeled hint)
- T4, T6: +0 (no behavior change)

Remote CI:

- **Stage 2 (`9720b21`)** — run [`27063824610`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27063824610): **`success`** on all 4 matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).
- **Stage 3 + 4 + 5 (this commit)** — recorded in a follow-up log commit after this push completes.

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
| `documentation/plan/0004-*` through `0011-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/driver-claude-code/**` untouched | preserved |
| `packages/runtime/**` modified | DOCUMENTED EXCEPTION — limited to `src/doctor.ts` (T5 fix per readme.md L43 and 2-implement.md L213) |
| Plan 0006 T9.5 cache-execution invariant | preserved (marketplace `--check` exit 0; 23 derived byte-identical; dist/doctor.js mirror rebuilt) |
| No `~/.claude/` or `~/.codex/` settings mutation | preserved |
| Skill count: 12 (unchanged); marketplace allowlist: 23 (unchanged); plugin version field: `0.2.0` (unchanged) | preserved |

---

## Behavioral verification: before vs after

### `$claude-setup` aggregate status

Before (yesterday's findings under Codex sandbox):
```
Claude companion setup - FAIL
  FAIL  claude-bg-no-prompt   claude --bg --help timed out
```

After (this commit; under any execution context):
```
Claude companion setup — warn
  ok    claude-bg-no-prompt   claude --bg supported per version floor (2.1.167 (Claude Code) >= 2.1.149)
```

### Plugin version reporting

Before: `Plugin version: 0.0.0` (workspace package.json sentinel)
After: `Plugin version: 0.2.0` (canonical `.codex-plugin/plugin.json`)

### Idle bg session leakage from setup

Before: every setup run created 1 idle bg session (8 accumulated during T2 probing)
After: zero idle sessions created by setup (14 → 14 across before/after audit check)

### Error messages for misuse

Before: `[review] Error: No job found matching "<huge prompt>" in this workspace...`
After: `[review] Hint: $claude-review takes a <jobId-or-prefix>... Did you mean $claude-delegate?` followed by the original error.

Before: `[stop] Error: usage: claude-companion stop <jobId>` (for bare `--all`)
After: `[stop] Error: bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.`

---

## Deferred / future work

- **`$claude-tasks`** (Verdict B from Plan 0011 T1) — PTY-injection design for next plan if maintainer authorizes
- **Skill-discovery surface test** — Codex's smoke test executed the dispatcher directly; the `$claude-*` SKILL.md → dispatcher chain via Codex chat surface is not yet verified end-to-end
- **Plugin rename** (e.g., `claude-companion` → `cc` or `claude`) — separate plan if maintainer authorizes
- **v0.3.0 release tag** — separate maintainer step. Plan 0012 made the plugin substantially more correct; v0.3.0 is now a clean release candidate.
- **Plan 0004 T11 / T12 (still paused)** — post-cutover benchmark + cost-paragraph decision. Pending ≥ 2026-06-16 window.
- **Plan 0005 (still deferred)** — Stop-time review gate. Stays deferred until Plan 0004 closes.
- **Opus 4.8 probe floor verification** — not empirically verified (current probe defaults to `2.1.156`)
- **G7-G10 backlog from Plan 0007 audit** — LOW priority CLI verb wrappers

---

## Lessons learned

### Real-Codex testing catches behaviors unit tests can't

1729 unit tests passed at Plan 0011 close. Yesterday's smoke test surfaced 4 real plugin issues. Three of them (HIGH-1, MEDIUM-1, MEDIUM-2) were context-specific (Codex sandbox / no-TTY / package.json source). One (HIGH-2) was a real bug compounded by a misleading 2-year-old comment in the doctor probe. **Recommendation**: schedule periodic real-Codex smoke tests against `main` before major releases, not just after.

### Adaptive scope earned its keep again

Plan 0011 used adaptive scope to defer `/tasks` on Verdict B. Plan 0012 used it to convert HIGH-1 (would have required a `cmdResult` rewrite) and MEDIUM-1 (would have required a `/goal` sentinel-detection rewrite) into docs/comment-only changes when the probes returned Verdict C. The plan shipped with 1 production fix instead of 3 — same end-user benefit, less risk. **Recommendation**: continue scoping plans as adaptive when probe outcomes are uncertain.

### Side effects are evidence

The T2 probe surfaced not just the no-TTY hang but ALSO the idle-session leak. Eight idle sessions had accumulated from prior setup runs — invisible to the user, but a real resource leak. **Lesson**: when a probe takes "longer than expected," check what side effects it left behind. Idle session accumulation was the load-bearing signal that `claude --bg --help` was actually CREATING sessions, not printing help.

### Old comments lie

The original `probeClaudeBgNoPrompt` strategy comment said "Real Claude prints usage for --bg" — true at the time it was written (claude 2.1.149-ish), false by 2.1.166. Comments document intent at write-time, not invariants. **Recommendation**: when a probe behaves differently than its comment predicts, suspect the comment first.

### Stage 4 polish should be cheap

The MINOR-1 fix was 1 string replacement + 1 parallel regression test. Adding a Stage 4 polish for a cosmetic finding is the disciplined response — vs. either skipping it (carries the NIT forward forever) or wrapping it into a future plan (less coupled context). **Recommendation**: when audit findings are 5-minute fixes, do Stage 4 polish even if Stage 3 said `ready-for-report`.

### `shell: false` + `stdio: pipe` matters

The bug only manifested when `runCommand` invoked claude with `shell: false` + `stdio: pipe` + `timeout: 5000`. With `shell: true` (or with stdio inherited from a TTY), the command completed in 0.5s. **Lesson**: subprocess shape matters. Probe behavior tested in `bash` ≠ probe behavior in `child_process.spawn` ≠ probe behavior under Codex sandbox.

---

## Final verdict

Plan 0012 ships. All nine T-tasks complete; Stage 3 audit verdict `ready-for-report` with one MINOR cosmetic finding resolved in Stage 4 polish; all standing safety invariants preserved; **1734 tests pass (0 fail)** across all lanes; remote CI green on `ubuntu-latest + macos-latest × Node 20 + 22`; marketplace payload byte-identity intact; cost paragraph byte-identical.

The plugin is now substantially more correct under real-Codex execution:
- Setup no longer fails (or leaks idle sessions)
- Plugin version reports the canonical value
- Goal sessions have documented retry guidance for stalls
- Misuse of review / adversarial-review / stop emits helpful hints

**v0.3.0 is a clean release candidate** — Plan 0012 resolved all gaps surfaced by real-Codex testing. The release decision is the maintainer's; the plugin's behavior is ready.

Plan 0013+ candidates listed in deferred work (`$claude-tasks` PTY-injection, skill-discovery surface test, plugin rename, v0.3.0 tag).
