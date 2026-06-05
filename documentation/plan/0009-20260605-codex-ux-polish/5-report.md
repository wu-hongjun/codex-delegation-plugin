# Stage 5 — Report: Plan 0009

## Report metadata

- **Plan**: Plan 0009 — Codex-UX polish (docs + skill frontmatter)
- **Date**: 2026-06-05
- **Commit reported**: this commit (Stage 5 final)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — promoted from a 2026-06-05 Codex-UX audit via two parallel `oh-my-claudecode:code-reviewer` agents. OQ-A through OQ-E resolved inline. 8 T-tasks. +15-20 test target.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-05 at commit `d052faf`. T1–T8 all PASS. Local total 1614 tests. CI run [`27032649329`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27032649329) **`success`** across `ubuntu-latest + macos-latest × Node 20 + 22`.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context via fresh `oh-my-claudecode:critic` (Opus) subagent. Verdict **`ready-for-report`** (ZERO findings at any severity).
- **Stage 4 polish**: SKIPPED. Audit verdict allowed direct progression to Stage 5.
- **Final status**: `complete`

---

## Executive summary

Plan 0009 is a focused docs + skill-frontmatter polish pass that addresses 11 findings from a Codex-UX audit. Zero runtime, dispatcher, driver, or test-suite-shape changes. Pure documentation alignment to make Codex (the AI in Codex CLI) a more effective router and a Codex CLI user a more confident first-time installer.

What the polish actually improves:

1. **Codex's skill-routing accuracy**: every SKILL.md now ends with a `### Next steps` block listing the natural follow-up skills. After `$claude-delegate`, Codex knows to suggest `$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`. After `$claude-result`, it knows about `$claude-review` and `$claude-adversarial-review`. Cross-skill chaining was the largest gap in Codex's mental model and is now closed across all 9 skills.

2. **Sharper review vs adversarial-review distinction**: the two review-skill descriptions used to differ only by "same session" vs "fresh session" — implementation jargon that gave Codex weak routing signal. Now they lead with intent: `Review the output of a Claude job by reusing its existing Claude Code session (lightweight; same-session).` vs `Run an adversarial code review of a Claude job in a fresh independent Claude Code session (thorough; eliminates confirmation bias).` The implementation hint stays in parens; the intent is in the first half.

3. **Better defaultPrompt entries** in `plugin.json`: the 4 prompts a user sees in their Codex completion picker for review / adversarial-review / workflow / followup were rewritten from implementation-flavored phrasing to user-intent phrasing. E.g. workflow went from `Run a Claude Code dynamic workflow.` (opaque) to `Run a Claude Code dynamic workflow (multi-step, plan + execute).` (signals capability).

4. **Run-line + arg-shape consistency**: `claude-workflow` SKILL.md now uses `workflow -- "<prompt>"` matching `delegate` / `followup`. `claude-followup` SKILL.md now uses `<jobId-or-prefix>` everywhere matching the other job-ID-accepting skills. The dispatcher already accepted both forms; Plan 0009 aligns the SKILL.md instructions so Codex doesn't have to learn two patterns.

5. **Explicit flag allow-list for `$claude-followup`**: the old "Forward any user-supplied flags (e.g. …)" wording was forward-compat fragile. Replaced with explicit "Accepted flags" + "Rejected at parse time" two-list matching the review skills' style and the dispatcher's `FOLLOWUP_REJECTED_FLAGS` array.

6. **`--json` and `--all` documentation**: the dispatcher accepted these globally on the lifecycle skills (`delegate` / `workflow` / `result` / `stop`) but the SKILL.md bodies didn't document them. Now they do.

7. **Plugin README "What comes next" extended** to include Plans 0007 and 0008 with `*(shipped)*` markers — closes the contributor-orientation gap where a new contributor reading the roadmap saw Plans 0001-0006 listed but didn't know Plans 0007 + 0008 existed.

8. **Marketplace README `$claude-status` one-liner** rewritten to lead with the multi-job list behavior (its primary mode) instead of the single-job-prefix lookup (its secondary mode).

All 8 T-tasks complete; all gates green; zero audit findings; combined test count **1614** (was 1572 at Plan 0008 close; **+42** new tests across the 11 polish items).

Every standing safety invariant from Plans 0001–0008 preserved: `plan-0004-pre-cutover` at `7d9b5f1`, Plan 0005 deferred, plugin README cost paragraph at L341 byte-identical, `tools/bench/` / `documentation/plan/0004-*` / `documentation/plan/0005-*` / `.github/workflows/ci.yml` / `packages/runtime/` all untouched, T9.5 cache-execution invariant intact (marketplace `--check` exit 0).

---

## What shipped

### Per-skill SKILL.md edits (9 files)

| Skill | T1 chaining | T2 description | T3 run-line/arg | T4 explicit lists | T5 --json/--all |
|---|---|---|---|---|---|
| `claude-setup` | ✓ | — | — | — | — |
| `claude-delegate` | ✓ | — | — | — | ✓ (+ --json) |
| `claude-status` | ✓ | — | — | — | — |
| `claude-result` | ✓ | — | — | — | ✓ (+ --json, --all) |
| `claude-stop` | ✓ | — | — | — | ✓ (+ --json, --all) |
| `claude-followup` | ✓ | — | ✓ (arg label) | ✓ (Accepted/Rejected lists) | — |
| `claude-review` | ✓ | ✓ (new wording) | — | — | — |
| `claude-adversarial-review` | ✓ | ✓ (new wording) | — | — | — |
| `claude-workflow` | ✓ | — | ✓ (run line) | — | ✓ (+ --json) |

### `plugin.json` defaultPrompt changes (T6)

4 entries rewritten verbatim per OQ-C; array stays at 9 entries:

- #6 `claude-followup` → trimmed
- #7 `claude-review` → user-intent phrasing
- #8 `claude-adversarial-review` → user-intent phrasing
- #9 `claude-workflow` → adds capability hint

### Documentation updates (T7)

- Plugin README "What comes next" → Plan 0007 + Plan 0008 added as `*(shipped)*` entries
- Marketplace README `$claude-status` one-liner → multi-job-first phrasing

### Test additions

| File | New tests | Coverage |
|---|---|---|
| `skills-manifest.test.mjs` | 28 | 18 chaining-hint + 2 description-verbatim + 2 run-line/arg + 2 flag-list + 6 json/all + 9 defaultPrompt + 4 skill-pairing (some bundled) |
| `readme.test.mjs` | 2 | Plan 0007 + Plan 0008 roadmap mentions |
| `docs-split.test.mjs` | 1 | marketplace README multi-job phrasing |
| **Total** | **+42** | (also: 3 pre-existing tests updated to match T6 new wording) |

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-05. Promoted from inline 2026-06-05 Codex-UX audit via two parallel `oh-my-claudecode:code-reviewer` agents. OQ-A through OQ-E resolved inline. 8 T-tasks identified across 11 polish items.
- **Stage 2 (Implement)** — Complete 2026-06-05 at commit `d052faf`. Three parallel `oh-my-claudecode:executor` agents (A: T1-T5, B: T6, C: T7); T8 orchestrator-absorbed (marketplace `--write` resync). Local total 1614 tests. CI run `27032649329` `success`.
- **Stage 3 (Audit)** — Complete 2026-06-05. Independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-report`**. ZERO findings at any severity.
- **Stage 4 (Polish)** — SKIPPED. Audit verdict explicitly allowed direct progression to Stage 5. No polish work needed.
- **Stage 5 (Report)** — This document. Plan status flips `auditing → reporting → complete` in one step (since Stage 4 was skipped).

---

## T-task summary

| Task | Status | Evidence |
|---|---|---|
| T1 — Cross-skill chaining hints | complete | All 9 SKILL.md files have `### Next steps` subsection; 18 tests verify presence + content |
| T2 — Sharpen review/adversarial-review descriptions | complete | Both `description:` lines match OQ-B verbatim; 2 tests verify |
| T3 — Run-line + arg-shape consistency | complete | `claude-workflow` uses `workflow -- "<prompt>"`; `claude-followup` uses `<jobId-or-prefix>` everywhere; 2 tests |
| T4 — `claude-followup` explicit flag allow-list | complete | "Accepted flags" + "Rejected at parse time" sections present; matches dispatcher's `FOLLOWUP_REJECTED_FLAGS`; 2 tests |
| T5 — `--json` / `--all` documentation | complete | delegate + workflow + result + stop all mention `--json`; result + stop mention `--all`; 6 tests |
| T6 — `defaultPrompt` rewrites | complete | Entries #6-#9 match OQ-C verbatim; array stays at 9; 9 new tests + 3 existing tests updated |
| T7 — README updates | complete | Plugin README "What comes next" has Plan 0007 + 0008 `*(shipped)*`; marketplace README `$claude-status` leads with multi-job phrase; 3 tests |
| T8 — Marketplace repackage + gates | complete | `--check` exit 0 (20 derived); 9 skills in smoke `--help`; all static + dynamic gates green |

---

## Test and CI evidence

Final local totals on the reported commit:

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 901 | 901 | 0 |
| **`npm test` chain** | **1328** | **1328** | **0** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1614** | **1614** | **0** |

Test growth from Plan 0008 close to Plan 0009 close: **+42 tests** (1572 → 1614). Plan target was +15-20; the +42 overshoot is justified per `feedback_test_count_overshoot` — each test is a distinct contract assertion (verified by audit's per-describe scan).

Remote CI evidence:

- **Stage 2 (`d052faf`)** — run [`27032649329`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27032649329): **`success`** on all 4 matrix legs (ubuntu-latest + macos-latest × Node 20 + 22).
- **Stage 5 (this commit)** — recorded in a follow-up log commit after this push completes.

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` | unchanged |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` L341 cost paragraph byte-identical | preserved (audit `grep -c` returns 1) |
| OQ4 forbidden cost-claim tokens in marketplace README | absent (audit `grep -rE` returns zero hits) |
| OQ4 forbidden tokens in new "Next steps" chaining hints | absent |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` untouched | preserved |
| `documentation/plan/0005-*` untouched | preserved |
| `documentation/plan/0006-*` untouched | preserved |
| `documentation/plan/0007-*` untouched | preserved |
| `documentation/plan/0008-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/runtime/**` untouched | preserved |
| `packages/driver-claude-code/**` untouched | preserved (Plan 0009 made zero driver changes; the Plan 0007 STATUS_MAP widening still stands) |
| `packages/plugin-codex/scripts/**` (dispatcher) | unchanged (Plan 0009 is pure docs/frontmatter) |
| Plan 0006 T9.5 cache-execution invariant | preserved (marketplace `--check` exit 0; 20 derived files match; allowlist unchanged) |
| Plan 0008 `--allow-edit` rejection by workflow | preserved (dispatcher `printUsage` line 1969 still lists workflow in the rejection set) |

---

## Deferred / future work

- **Plan 0010 (next up)**: Power-user surfaces — subagent-spawning guidelines for Codex (so Codex knows how to instruct Claude Code to fan out to many subagents), full dynamic-workflow how-to with example `meta`/`phase()`/`agent()` script patterns, and a new `$claude-goal` skill wrapping Claude Code's `/goal` slash command. Scope candidate to be written next as `documentation/research/<date>-plan-0010-candidate.md` or directly into the plan dir.
- **Plan 0004 T11 / T12 (still paused)**: Post-cutover benchmark + cost-paragraph decision. Pending the ≥ 2026-06-16 post-cutover window.
- **Plan 0005 (still deferred)**: Stop-time review gate. Stays deferred until Plan 0004 closes.
- **Opus 4.8 probe floor verification**: `opus-4-8-supported` stays at `2.1.154`; not empirically verified. Plan 0010 or later can confirm.
- **G7-G10 backlog from Plan 0007 audit**: LOW priority CLI verb wrappers.
- **Release tag**: Plan 0009 does NOT cut a release tag. Plugin version stays at `0.2.0`. Tagging `v0.3.0` is a separate maintainer step.

---

## Lessons learned

### Two-parallel-reviewer audit pattern works well for Codex-UX

Plan 0009 was scoped from a 2026-06-05 audit run via two parallel `oh-my-claudecode:code-reviewer` agents — one on SKILL.md surfaces, one on README + defaultPrompt surfaces. The two agents produced complementary findings with minimal overlap (~1 item appeared in both lists, the rest were unique to each agent's surface). Pre-Stage-2 audit-based scoping caught more polish items than a unilateral planner would have. **Recommendation**: use parallel review agents whenever a polish pass touches multiple surfaces with distinct audiences.

### `ready-for-report` is achievable when scope is tight and dispatch is careful

This is the first audit in this session to return `ready-for-report` with zero findings. Plans 0006-0008 each had at least 1 finding requiring Stage 4 polish. The difference: Plan 0009's scope was narrow (no new code, no new skills, no marketplace allowlist changes) and the three executor agents were each given an explicit non-overlapping file set. A precise sub-agent split prevents merge conflicts AND leaves no gray areas for the audit to find.

### Cross-skill chaining hints were the highest-leverage single improvement

The audit's #1 finding ("none of the 9 skills reference adjacent skills as natural follow-ups") was also the easiest to fix (9 small "Next steps" blocks) and the highest-leverage. After Plan 0009, Codex has a structured next-step signal in every skill — exactly the kind of routing data an LLM-based router needs. **Recommendation**: any future skill addition should ship with a "Next steps" block from the start, not as a follow-up polish.

### Test-count overshoots are healthy when scoped per-describe

Plan 0009 added +42 tests vs a +15-20 target — a 2× overshoot. But the audit confirmed each test asserts a distinct contract (per-describe scan, no redundancy). This pattern is now codified in `feedback_test_count_overshoot` and has been seen across Plans 0001-0009. **Recommendation**: when an executor agent overshoots, ask the audit to per-describe-scan rather than reject the overshoot.

---

## Final verdict

Plan 0009 ships. All eight T-tasks complete; zero Stage 3 audit findings; Stage 4 polish skipped per `ready-for-report` verdict; all standing safety invariants preserved; **1614 tests pass (0 fail)** across all lanes; remote CI green on `ubuntu-latest + macos-latest × Node 20 + 22`; marketplace payload byte-identity intact; cost paragraph byte-identical.

The 9 skills now form a cohesive, Codex-friendly toolkit: each skill knows its neighbors (chaining hints), the two review skills are sharply distinguished by intent, the workflow skill's syntax matches the delegate/followup pattern, the followup skill has an explicit flag contract, and the lifecycle skills document `--json` / `--all`. The defaultPrompt picker shows user-intent phrasing instead of implementation jargon. The plugin README roadmap is current through Plan 0008.

Plan 0010 is queued (subagent-spawning guidelines for Codex + dynamic-workflow how-to + new `$claude-goal` skill) but has not been opened — it requires explicit maintainer authorization.
