# Stage 5 — Report: Plan 0003

## Report metadata

- **Date**: 2026-06-02
- **Commit reported**: `4475061`
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted and approved 2026-06-01 (all eight open questions + DD-1 resolved by maintainer)
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-02 (T1–T12 + T12a and T12b live-E2E remediations; `1019` tests pass at Stage 2 close; `test:attach` 28/28; CI green on ubuntu+macos × Node 20+22; live E2E captured at [`artifacts/e2e-live-20260602.txt`](artifacts/e2e-live-20260602.txt))
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context, fresh session; verdict **ready-for-polish** (highest severity LOW; 4 findings F1/N1/N2/N3 + 4 out-of-scope deferrals O1–O4 + 3 process notes P1–P3) at commit `696929a` on 2026-06-02
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — substance commit `86cb729` resolved all four polish-actionable audit findings (F1/N1/N2/N3); format follow-up `189f7a2`; CI run `26860365049` green on ubuntu+macos × Node 20+22
- **Final status**: `complete`

---

## Executive summary

Plan 0003 ships `$claude-review` (same-session) and `$claude-adversarial-review` (fresh-session) skills for structured code review of Claude background jobs. Both produce parseable structured findings: a verdict (`pass | fail | pass_with_findings`) and severity-rated findings (`blocker | high | medium | low | nit`) with optional file/line/recommendation. Same-session review reuses Plan 0002's PTY-attach machinery; adversarial review reuses Plan 0001's delegation machinery. Both run within the local plugin; neither wraps `claude ultrareview` (Anthropic's cloud-hosted PR review).

Plan 0001 + Plan 0002 locked v1 constraints continue (no `claude -p`, no committed marketplace packaging, no benchmarked cost-savings claim, no stop-time hook gate). All eight OQ-A through OQ-H + DD-1 resolutions honored. All four local gates are clean on the reported commit: `npm run lint`, `npm run typecheck`, `npm run format`, `npm test` all exit 0, with **1041 tests passing across 4 lanes (68 mock + 172 runtime + 178 driver + 623 plugin) plus 28/28 `test:attach` = 1069 total** and 0 failures. Remote GitHub Actions CI is green on the reported commit across all four matrix legs. The live E2E artifact captures both `$claude-review` and `$claude-adversarial-review` against the same original delegated output, real Codex 0.136.0 + Claude Code 2.1.150 on Node 25.8.2.

---

## What shipped

### File-level deliverables

**T1 — Review prompt templates** (`packages/plugin-codex/scripts/lib/review-prompts.mjs`):
- `SAME_SESSION_REVIEW_PROMPT(context)` and `ADVERSARIAL_REVIEW_PROMPT(context)` exports
- Both embed severity enum, verdict enum, fenced ` ```json ` example, sycophancy-counteracting forcing function (no numerical floor)
- Adversarial template includes data delimiters and prompt-injection mitigation
- Pure string construction; no forbidden imports

**T2 — Structured output parser** (`packages/plugin-codex/scripts/lib/review-parser.mjs`):
- `parseReviewOutput(text)` returning `{ verdict, findings[] }`
- 4-step priority: fenced JSON → bare JSON → markdown/human format → graceful fallback (single nit finding)
- Never throws; defensive parsing throughout
- Severity and verdict normalization with schema-safe coercion

**T3 — Shared `sendFollowupTurn` helper** (refactored in `packages/plugin-codex/scripts/claude-companion.mjs`):
- Extracted send-and-record flow from `cmdFollowup` (lines 475–724)
- Private helper; `cmdFollowup` calls with `promptSummaryPrefix: undefined` (byte-identical behavior)
- Supports optional `promptSummaryPrefix` parameter for review turns (`[review] ` or `[adversarial-review] `)

**T4 — Dispatcher `review` subcommand** (`packages/plugin-codex/scripts/claude-companion.mjs`, lines 943–1222):
- `cmdReview` function with status eligibility (`awaiting_followup` or `completed`-with-live-idle-session only)
- Accepts: `--all`, `--json`, `--yes`
- Rejects: `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`, `--allow-edit` (with pinned message)
- Selects latest non-review turn; constructs same-session review prompt; parses findings; formats output
- `case 'review':` dispatched at line 79

**T5 — Runtime `reviewOf` field** (`packages/runtime/src/types.ts` + `packages/runtime/src/job-store.ts`):
- Optional `ReviewOfContext` interface: `{ jobId: string; turnIndex?: number }`
- Optional `JobRecord.reviewOf?` field (backwards-compatible)
- `schemaVersion` stays at `2` (no migration needed)
- Conditional spread in `createJob` omits key entirely when absent

**T6 — Dispatcher `adversarial-review` subcommand** (`packages/plugin-codex/scripts/claude-companion.mjs`, lines 1231–1685):
- `cmdAdversarialReview` function with status eligibility (any terminal status with result; `needs_input`/`running`/`queued`/`starting` rejected)
- Accepts: `--all`, `--json`, `--yes`, `--model`, `--effort`, `--permission-mode`
- Rejects: `--add-dir`, `--mcp-config`, `--name`, `--allow-edit` (with pinned message)
- Selects latest non-review turn; reads result and prompt; constructs adversarial review prompt
- Calls `driver.startSession()` with auto-generated session name (`codex:<repo>:review-<jobId-short>`)
- Creates new job with `reviewOf: { jobId: targetJobId }`
- Reconcile loop with DD-1 30-minute timeout (env-var override `CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS`)
- `case 'adversarial-review':` dispatched at line 84

**T7 — Status annotations** (`packages/plugin-codex/scripts/lib/format.mjs`):
- `reviewOfLabel(job)` shows `(review of <parentJobId>)` annotation for jobs with `reviewOf`
- `classifyTurnKind(turn)` returns `undefined` for non-review turns, review indicator for review turns
- `formatReviewHuman` + `formatReviewJson` + `formatAdversarialReviewJson` new formatters
- Review turns distinguished by `prompt.summary` prefix (`[review] ` or `[adversarial-review] `)

**T8 — Skills + manifest** (new skill SKILL.md files):
- `packages/plugin-codex/skills/claude-review/SKILL.md` — calls `node <plugin-root>/scripts/claude-companion.mjs review <jobId> [flags]`
- `packages/plugin-codex/skills/claude-adversarial-review/SKILL.md` — calls `node "<plugin-root>/scripts/claude-companion.mjs" adversarial-review <jobId-or-prefix> [flags]`
- Both include usage notice: "This skill sends an additional prompt through Claude Code and may count toward your Claude Code usage."
- No `--yes` injection; strict frontmatter
- `packages/plugin-codex/plugin.json` `defaultPrompt` updated with review-flavored sentences
- `packages/plugin-codex/test/skills-manifest.test.mjs` extended to cover both new skills

**T9 — Mock-claude updates** (`tools/mock-claude/fixtures/reviews/` + mock script):
- Three review-response fixtures (well-formed, malformed, adversarial)
- Mock's `attach` subcommand supports review-response fixtures
- Mock's sidecar emulation supports `sidecarSummaryOnSubmit` config for T12b split testing
- Bracketed-paste strip (`stripBracketedPaste` function) for T12a compatibility

**T10 — Plugin README updates** (`packages/plugin-codex/README.md`):
- `## Review skills` section documents `$claude-review` vs `$claude-adversarial-review` distinction
- `## Known limitations` bullet added clarifying `$claude-review` is local-session, `claude ultrareview` is Anthropic cloud-hosted
- `## Troubleshooting` subsection `### Tuning operator escape hatches` added with restrained operator-knob wording
- Cost paragraph byte-identical to Plan 0001
- No OQ4-forbidden cost-claim tokens

**T11 — CI verification** (`.github/workflows/ci.yml` unchanged):
- Existing workflow matrix `ubuntu-latest + macos-latest × Node 20 + 22` runs all new tests
- No new CI steps needed; review tests part of existing `test:plugin` lane
- Permissions: `contents: read` only; no secrets

**T12 — Live E2E** (`artifacts/e2e-live-20260602.txt`):
- Full flow captured: delegate → status → `$claude-review` → `$claude-adversarial-review --json` → status → result → stop
- Real binaries: Codex 0.136.0, Claude Code 2.1.150, Node 25.8.2 on Darwin 25.5.0
- Both review variants exercised against same original turn (reviewOf.turnIndex = 0)
- Same-session verdict `pass` (0 findings); adversarial verdict `fail` (2 findings: 1 high + 1 medium) — informational comparison
- T12a remediation section logs driver-side warmup + bracketed-paste fixes
- T12b remediation section logs dispatcher-side parse-source fixes

**T12a — Driver-side remediations** (`packages/driver-claude-code/src/attach.ts`):
- Env-var fallback for timeout knobs (`CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`, `CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS`) — fallback to `process.env` when driver constructed without `env` option
- `ATTACH_WARMUP_DEFAULT_MS` bumped 2000 → 8000 ms (tuned for Claude Code 2.1.150 TUI startup)
- Bracketed-paste wrap for long prompts: `'\x1b[200~' + input.text + '\x1b[201~\r'`

**T12b — Dispatcher-side remediations** (`packages/plugin-codex/scripts/claude-companion.mjs` + new helper):
- New helper `readTurnFinalMessageOrFallback` in `packages/plugin-codex/scripts/lib/review-result-source.mjs`
- `cmdReview` calls extra `reconcileJob` with deterministic 8-second wait (tuned for transcript flush latency)
- Env-var override `CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS` (test seam; default 8000 ms)
- Works around driver sidecar-summary vs reconciled-result-file split

---

## What changed from the plan

### Test count overshot in multiple tasks

Per Pattern 5 (per-describe redundancy analysis), several T-tasks shipped more tests than the plan target:

- **T1**: +24 tests vs +10 target
- **T2**: +62 tests vs +17 target
- **T4**: +30 tests (no explicit target)
- **T5**: +14 tests vs +5 target
- **T6**: +35 tests (no explicit target)
- **T8**: +12 tests (manifest + skill tests)
- **Stage 4 polish**: +22 tests (F1/N1/N2/N3 resolutions)

All overshoots accepted by Subagent C after per-describe redundancy analysis: each test is a distinct contract assertion, not duplication. This pattern is documented in `documentation/process/reviewer-contract-patterns.md` Pattern 5.

### T12a and T12b are honest mid-stage remediations

Live E2E (T12) discovered two real bugs:

1. **T12a (driver-side)**: Env-var fallback unreachable from production dispatcher (no `env` option passed); `ATTACH_WARMUP_DEFAULT_MS` 2000 ms insufficient for Claude Code 2.1.150 (~8s observed); long prompts silently swallowed without bracketed-paste wrap; mock-claude regression on Linux line discipline (icrnl) fixed by empty-submit skip + bracket-paste marker strip.

2. **T12b (dispatcher-side)**: `cmdReview` read sidecar summary fallback (containing delegate's text wrapped as nit) instead of parsing structured JSON from reconciled result file. Root cause: Claude Code 2.1.150 writes SUMMARY to sidecar.output.result and FULL text (containing ` ```json...``` `) to transcript and reconciled result file. T12b introduces helper, extra reconcile call, deterministic 8s wait (env-var override available).

These remediations are logged honestly in 2-implement.md § T12a/T12b; not snuck in as "polish."

### T11 cadence — orchestrator absorbed A/B roles

Per audit process note P3, T11 (CI verification) is a "zero-change verification" task where the orchestrator absorbed Subagent A and B roles (no implementation, only gate verification). Mitigated by independent `ci-workflow.test.mjs` static tests. Recommendation: future plans should add Pattern 6 to reviewer-contract-patterns doc (deferred as O4).

---

## Architecture delivered

Brief call graph showing the three-package layout:

```
Codex skill ($claude-review <jobId> / $claude-adversarial-review <jobId>)
  → packages/plugin-codex/scripts/claude-companion.mjs
    → scripts/lib/{review-prompts, review-parser, format, ack, ...}
    → @cc-plugin-codex/runtime
        - types (ReviewOfContext, JobRecord.reviewOf?)
        - job-store (createJob passes reviewOf through)
    → @cc-plugin-codex/driver-claude-code (ClaudeBackgroundDriver)
        - attach.ts       → T12a env-var fallback, warmup/bracketed-paste
        - sidecar.ts      → readSidecar (unchanged from Plan 0002)
        - stop.ts         → stop session
```

**Three-package layout invariants** (verified by tests and audit):

- `packages/runtime/` imports no driver symbols, no `node-pty`, no `claude -p` (verified: grep 0 hits)
- `packages/plugin-codex/scripts/` imports no `node-pty` (verified: grep 0 hits, 1 comment only)
- `packages/driver-claude-code/` imports `@cc-plugin-codex/runtime` for types only
- Sidecar parser unchanged from Plan 0002; no new status fields added to schema (v2 stays v2)

---

## User-facing workflow

Typical review flow:

```
$claude-delegate "Inspect this repo and summarize TODOs."
$claude-status
→ shows job in awaiting_followup

$claude-review <jobId>
→ verdict + severity-rated findings (same-session structured review)

$claude-adversarial-review <jobId>
→ verdict + findings array + job with (review of <parentJobId>) annotation

$claude-result <jobId>
→ shows latest turn result
```

Both commands support:
- `--all` — cross-workspace job lookup
- `--json` — machine-readable structured output shape: `{ ok, verdict, findings, findingsCount, blockerCount, highCount, mediumCount, lowCount, nitCount }`
- `--yes` — privacy ack bypass

`$claude-adversarial-review` additionally accepts `--model`, `--effort`, `--permission-mode` (fresh-session configuration).

---

## Test and CI results

Local on `189f7a2` (verified 2026-06-02):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` (mock-claude + mock-codex) | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 178 | 178 | 0 |
| `test:plugin` | 623 | 623 | 0 |
| `test:attach` (PTY-dependent) | 28 | 28 | 0 |
| **Total npm test chain** | **1041** | **1041** | **0** |
| **Total (including test:attach)** | **1069** | **1069** | **0** |

The 1041 is the main `npm test` chain (68 + 172 + 178 + 623). The `test:attach` 28 is separate and listed in Stage 4 gates as 28/28. Combined total: 1069.

`npm run lint`, `npm run typecheck`, `npm run format` all exit 0 on `189f7a2`.

Remote CI on `189f7a2`, run `26860365049`, conclusion `success`:

- `ubuntu-latest` / Node 20 → success
- `ubuntu-latest` / Node 22 → success
- `macos-latest` / Node 20 → success
- `macos-latest` / Node 22 → success

Test growth from Plan 0002 to Plan 0003:

- Plan 0002 final (cbbac8c): 731 tests (58 mock + 158 runtime + 175 driver + 340 plugin) + 25 attach = **756 total**
- Plan 0003 final (189f7a2): 1041 tests (68 mock + 172 runtime + 178 driver + 623 plugin) + 28 attach = **1069 total**
- Net growth: **+310 tests** in chain, **+3 attach** = **+313 total**. Plugin lane carries bulk (+283).

---

## Live E2E results

Captured at [`artifacts/e2e-live-20260602.txt`](artifacts/e2e-live-20260602.txt) (~770 lines). Real binaries: Codex 0.136.0, Claude Code 2.1.150, Node 25.8.2 on Darwin 25.5.0. Throwaway fixture repo at `/tmp/cc-plugin-codex-plan0003-e2e-UAOhKH/`.

Full flow:
1. Setup against real binaries — all capabilities verified ok
2. Delegate task (`"Inspect this repo..."`)
3. Status — job reconciled to `awaiting_followup`
4. `$claude-review <jobId>` — same-session structured review, verdict `pass`, 0 findings
5. `$claude-adversarial-review <jobId> --json` — fresh-session review, verdict `fail`, 2 findings (1 high + 1 medium)
6. Status — original job has review turn appended; adversarial review job created with `(review of <parentJobId>)` annotation
7. Result — adversarial review findings retrieved
8. Stop — both jobs stopped; no orphans
9. Cleanup — workspace clean, no leaked sessions

**Both review variants compared the SAME original turn** (reviewOf.turnIndex = 0 per § 3.X rule). Observational comparison (lines 300–309 of artifact): same-session vs adversarial verdicts differ (pass vs fail), but both reviewed the same source output. Informational only — not a pass/fail gate.

**T12a + T12b sections embedded in artifact**: STEP 4 logs BUG OBSERVED (warmup + bracketed-paste failure timings); STEP 5 logs retry post-T12b fix (correct JSON parsing instead of fallback nit).

**Sensitive data redacted**: email, orgId, orgName placeholders; 0 leaks verified by audit § H.

---

## Audit findings and polish resolution

Stage 3 (independent context, fresh session at commit `696929a`) returned **ready-for-polish — 1 LOW + 3 NIT, 0 blocker/high/medium**. Stage 4 resolved all four findings in commit `86cb729` + format follow-up `189f7a2`.

| ID | Severity | Finding | Stage 4 resolution |
|---|---|---|---|
| F1 | low | README does not document `$claude-review` vs `claude ultrareview` distinction (§ R9 mitigation gap) | Added distinction in `## Review skills` intro paragraph and new bullet in `## Known limitations`. T10-24 tightened from passive guard to positive requirement. |
| N1 | nit | `formatAdversarialReviewJson` writes `reviewOf: null` when absent (inconsistent with T7 omission rule) | Switched to conditional spread: `...(job.reviewOf !== undefined ? { reviewOf: job.reviewOf } : {})` for shape consistency. |
| N2 | nit | `printUsage` flag block stale wrt review/adversarial-review subcommands | Updated flag descriptions per subcommand; explicitly noted `--model`/`--effort`/`--permission-mode` applicability and `--allow-edit` rejection by review skills. |
| N3 | nit | T12a/T12b operator env-var knobs not surfaced in README | Added `### Tuning operator escape hatches` subsection with restrained operator-knob framing (not user-facing features). |

**Audit findings deferred** (process-only, not code defects) — all for future plans as O1–O4:

- **O1**: Replace 8-second deterministic wait in `cmdReview` with event-driven loop over `events.jsonl`
- **O2**: Unify driver `sendResult.finalMessage` with reconciler-written result file (Plan 0002.5 or Plan 0005-adjacent)
- **O3**: Adaptive `ATTACH_WARMUP_DEFAULT_MS` probing instead of single-version tuning
- **O4**: Add Pattern 6 to reviewer-contract-patterns doc (orchestrator-absorbs-A-and-B for zero-change verification)

**Process notes** (P1–P3) — no Plan 0003 code action required:
- P1: F-H1/F-H2 adherence in Subagent C briefs verified clean
- P2: T12a/T12b commit scope trade-off accepted; honest disclosure in log
- P3: T11 borderline self-audit mitigated by independent ci-workflow.test.mjs

---

## Scope compliance

Every locked v1 + Plan 0001/Plan 0002 constraint upheld:

- ✅ No `claude -p` — both skills use PTY attach (Plan 0002) or fresh delegation (Plan 0001)
- ✅ No node-pty outside driver — T12a changes driver/attach.ts only
- ✅ No new dependency in `package.json` (verified by `git diff --stat 4e208a3..HEAD`)
- ✅ No `$claude-review` of `$claude-review` recursion enabled by default — non-review-turn selection rule prevents accidental recursion
- ✅ No `--allow-edit` bypass for review skills — parse-time rejection on both commands with pinned message
- ✅ No `--yes` silently injected — skill manifests verified; no auto-ack injection
- ✅ No `dangerously-skip-permissions` outside test fixtures
- ✅ No `claude ultrareview` wrapper claim — documentation clarifies distinction
- ✅ No benchmarked cost-savings claim — cost paragraph byte-identical to Plan 0001
- ✅ No OQ4 forbidden tokens in production prose (verified by readme test T10-25 + skills-manifest tests)
- ✅ Plan 0001 + Plan 0002 architectural invariants preserved (runtime imports no driver / no node-pty / no `claude -p`)
- ✅ All eight OQ-A through OQ-H + DD-1 resolutions honored

---

## Known limitations

**Same-session review can be sycophantic** — Claude may systematically underreport issues on its own work within the same conversation. Caveat documented in `## Review skills` and `## Same-session review may agree with its own prior answer` bullet. Mitigation: use `$claude-adversarial-review` for independent evaluation.

**Structured review parsing is best-effort** — if JSON shape is malformed, raw text is wrapped as a single `nit` finding (R3 mitigation). `--json` output always exposes verdict and findings array even in fallback case.

**Review-of-review recursion not hard-prevented** — default target selection skips review turns, but no hard depth limit (R7 mitigation). Future plan may add explicit `--target-turn` or `--review-review` flags.

**`cmdReview` has an 8-second deterministic wait** — tuned for Claude Code 2.1.150 transcript flush latency. Bypassable via `CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS` env var (test seam). Deferred to future plan as O1.

**`ATTACH_WARMUP_DEFAULT_MS = 8_000` is single-version tuned** — operator escape hatch via `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` env var. Deferred to future plan as O3.

**Driver `sendResult.finalMessage` vs reconciled result file split** — Plan 0002's driver returns sidecar summary; T12b works around in `cmdReview` by reading from `turn.result.finalMessagePath`. Underlying split not unified. Deferred to future plan as O2.

---

## Follow-up plans

- **Plan 0002.5 or Plan 0005-adjacent** — Address O2: unify driver and reconciler result sources so they always agree.
- **Future plan** — Address O1: replace 8s wait with event-driven loop over `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`.
- **Future plan** — Address O3: adaptive `ATTACH_WARMUP_DEFAULT_MS` probing instead of single-version constant.
- **Reviewer-contract polish** — Address O4: add Pattern 6 to `documentation/process/reviewer-contract-patterns.md` documenting orchestrator-absorbs-A-and-B pattern constraints.
- **Plan 0004** — Benchmark harness and cost measurement; compare `delegate-only` vs `delegate + same-session review` vs `delegate + adversarial review` (cost / latency / verdict-agreement metrics).
- **Plan 0005** — Stop-time hook + review gate integration.
- **Plan 0006** — Marketplace packaging.

---

## Lessons learned

### Live E2E is the only way to catch driver/dispatcher integration bugs against new Claude versions

T12a (warmup + bracketed paste) and T12b (parse source) were both invisible to mocks:
- Mock-claude responded instantly with no startup banner (warmup not needed)
- Mock's sidecar = transcript (split never manifested)

Plan 0002 + Plan 0003 both relied on live E2E to expose real bugs. **Recommendation**: any plan touching `attach.ts` or same-session-input path should include explicit live E2E task.

### OQ4 cost-claim discipline is durable but easy to drift on in docs additions

Stage 4 N3 added a Troubleshooting subsection that needed careful neutral wording for env-var knobs ("operator escape hatches, not normal workflow flags") to avoid implying performance benefits. The test surface (readme test scan) caught this before commit. **Recommendation**: any future plan adding diagnostic/troubleshooting docs should re-scan the forbidden-token list in touched sections.

### Reviewer-contract patterns work but are fragile when a task has zero source-code delta

T11 (CI verification) is the third such "verification-only" task across Plans 0001–0003. In each case orchestrator absorbed all three subagent roles and relied on third-party tests as verification anchor. Pattern 6 should codify this so future plans don't repeat implicit-self-audit pattern by accident.

---

## Final verdict

Plan 0003 ships. Every locked v1 + Plan 0001/0002 constraint honored; all eight OQ-A through OQ-H + DD-1 resolutions honored per Plan 0001's v1 scope; four low audit findings resolved in Stage 4 polish; no critical/high/medium findings outstanding; 1041 tests pass (0 fail) across npm test chain + 28/28 test:attach; remote CI green on all four matrix legs; live E2E proves the full `delegate → review → adversarial-review → status` flow against real binaries with T12a/T12b remediations locked in.
