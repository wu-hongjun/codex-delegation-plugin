# Plan 0003 Stage 3 — Audit

**Audited commit**: `5da071e` (`Plan 0003: mark Stage 2 complete; awaiting independent audit`)
**Audited on**: 2026-06-02
**Auditor**: Claude (Opus 4.7, 1M context), fresh session, no Plan 0003 implementation memory

---

## Verdict

**ready-for-polish**

No critical/high/medium findings. One LOW finding flagged against the
README (1-plan.md § R9 mitigation gap), three NIT findings, and two
process-discipline notes for future plans. Local gates clean
(lint/typecheck/format/test/test:attach all 0-exit, expected counts
match), live E2E artifact integrity verified, all 16 architectural and
security invariants hold, T12a/T12b regression tests genuinely lock in
the bugs they claim to fix.

Stage 4 (polish) can dispatch the LOW + NIT items in a single pass.

---

## Audit methodology

- Read in order: `documentation/plan/README.md`, plan readme,
  `1-plan.md` (640 lines), `2-implement.md` (1958 lines),
  `artifacts/e2e-live-20260602.txt` (771 lines).
- Independent gate run at HEAD: `npm ci` clean, `npm run lint` clean,
  `npm run typecheck` clean, `npm run format --check` clean,
  `npm test` exit 0 (chain `test:mock && test:runtime && test:driver
  && test:plugin` — final lane `test:plugin` reported `tests 601 /
  pass 601 / fail 0`; the chain's exit-0 guarantees the prior three
  lanes also passed), `npm run test:attach` reported `tests 28 / pass
  28 / fail 0`. Aggregate matches the 1019/1019 + 28/28 stated in
  2-implement.md T12b table.
- Verified every "fixed at HEAD" claim in 2-implement.md by reading
  the source file at HEAD, not by trusting the log.
- Grep-verified all forbidden-token negations on the full
  Plan 0002 → HEAD diff range (`4e208a3..HEAD`).
- Spot-checked Subagent C briefs in 2-implement.md for F-H1 / F-H2
  adherence on T1, T5, T6, T10 (4 of 12 tasks).

---

## A. Contract compliance vs 1-plan.md

Every T-task's acceptance criteria from 1-plan.md § 4 is met. OQ-A
through OQ-H + DD-1 are all honored as resolved on 2026-06-01.
Spot-checks:

### T1 — Review prompt templates (`scripts/lib/review-prompts.mjs`)

- Module exports `SAME_SESSION_REVIEW_PROMPT` (line 40) and
  `ADVERSARIAL_REVIEW_PROMPT` (line 94). Both pure-string, no
  imports. ✓
- Fenced ` ```json ` example present in both templates via
  `STRUCTURED_OUTPUT_EXAMPLE` (lines 7-20). ✓
- Severity enum `blocker | high | medium | low | nit` (line 26) and
  verdict enum `pass | fail | pass_with_findings` (line 27) referenced
  explicitly in both templates. ✓
- Sycophancy-counteracting forcing function uses no numerical floor:
  "Do not manufacture findings to fill space." (line 62, line 112). ✓
- Same-session caveat at line 81 instructs use of
  `$claude-adversarial-review` for independent evaluation. ✓
- Adversarial template delimits injected content with
  `--- BEGIN REVIEWED OUTPUT ---` / `--- END REVIEWED OUTPUT ---`
  (lines 133, 141) and includes the explicit data-vs-instruction
  sentence (line 131). ✓

### T2 — Structured output parser (`scripts/lib/review-parser.mjs`)

- 4-step priority order implemented exactly per spec (lines 285-324).
- Unknown severity coerces to `'nit'`, finding KEPT not discarded
  (lines 102-107). ✓
- `normalizeLine('0')` returns `0` (not `null`) per maintainer pin
  — verified by `!Number.isNaN(0)` at line 121. ✓
- Empty / whitespace / null / undefined input → placeholder
  `"Review output was empty."` (lines 54-57). ✓
- Never throws — `tryParseJson` wraps in try/catch (lines 170-176)
  and the public function guards non-string up-front (line 287). ✓

### T3 — Shared `sendFollowupTurn` helper

- Helper at `claude-companion.mjs:510-740`, private (no `export`). ✓
- `cmdFollowup` calls helper with `promptSummaryPrefix: undefined`
  (line 940), keeping behavior byte-identical. ✓
- C's F-1 (JSDoc inaccuracy about `process.exit` ownership) was
  fixed pre-commit per the orchestrator follow-up; the updated
  JSDoc at lines 490-509 explains why the two exits remain inside
  the helper. ✓

### T4 — `cmdReview`

- All accepted flags (`--all`, `--json`, `--yes`) and rejected flags
  (`--allow-edit`, `--model`, `--effort`, `--permission-mode`,
  `--add-dir`, `--mcp-config`, `--name`) verified at
  `claude-companion.mjs:953-986`. ✓
- `--allow-edit` rejection message is verbatim per § 3.1 of
  1-plan.md: `"--allow-edit is not applicable to review skills.
  Reviews are read-only."` (line 956). ✓
- Status eligibility branches cover all 11 rows of § 3.6 — see § A.5
  table below.
- Latest non-review turn selection at lines 1134-1149 correctly
  filters `[review] ` and `[adversarial-review] ` prefixes AND
  requires `t.result != null`. ✓

### T5 — `reviewOf` field on `JobRecord`

- Interface added at `packages/runtime/src/types.ts:26-30` and
  `JobRecord.reviewOf?` at lines 112-116. ✓
- `schemaVersion` stays at `2` (types.ts:95). ✓
- Conditional spread in `createJob` at `job-store.ts:387` omits the
  key entirely when absent — no `undefined` pollution on disk. ✓
- Reconciler `grep -c reviewOf packages/runtime/src/reconciler.ts`
  returns **0** — reconciler does not read or write the field. ✓

### T6 — `cmdAdversarialReview`

- Accepted flags include `--model`, `--effort`, `--permission-mode`
  per OQ-E divergence; forwarded to `driver.startSession` at
  `claude-companion.mjs:1549-1552`. ✓
- DD-1 timeout machinery at lines 1604-1610: default 1_800_000 ms,
  env-var override `CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS`,
  defensive `parseInt` with NaN / non-positive falling back to
  default. ✓
- Timeout cleanup branch at lines 1672-1699: best-effort
  `driver.stop(reviewSessionHandle).catch(() => {})`, mark review
  job `failed`, append `review.failed` event with
  `reason: 'timeout'`, target job UNCHANGED, exit 1 with
  `"Adversarial review did not complete within N minutes."` ✓
- Session handle re-constructed from `reviewHandle` (lines
  1587-1594), not from the reconciled-and-possibly-mutated
  `currentReviewJob`. Correct. ✓

### T7 — Status annotations

- `reviewOfLabel` (format.mjs:16-22) correctly handles `turnIndex:
  0` via `!== undefined` guard (NOT falsy coercion). ✓
- `classifyTurnKind` (format.mjs:32-37) returns `undefined` for
  non-review turns, which preserves object identity in the spread
  at line 143. ✓
- JSON `reviewOf` is OMITTED via natural spread behavior when
  absent on `formatStatus` jobs. ✓ (But see Nit N1 for the divergent
  pattern used by `formatAdversarialReviewJson`.)

### T8 — Skills + manifest

- Both SKILL.md files exist with correct frontmatter, no
  `--yes` auto-injection on the run line, and the verbatim
  approved usage notice "This skill sends an additional prompt
  through Claude Code and may count toward your Claude Code usage."
  (claude-review/SKILL.md:33, claude-adversarial-review/SKILL.md:37). ✓
- `plugin.json` `defaultPrompt` includes the two new entries. ✓
- Adversarial SKILL.md explicitly warns "do NOT pass an empty
  prompt and do NOT append `--`" (line 24). ✓
- `skills/` directory listing confirms exactly 8 entries: the 6
  Plan 0001/0002 skills plus `claude-review` and
  `claude-adversarial-review`. ✓

### T9 — Mock-claude review fixtures

- Three fixtures exist at `tools/mock-claude/fixtures/reviews/`. ✓
- `shouldUseReviewFixture` non-regression guard at
  `tools/mock-claude/claude:267-271` returns true only when
  `config.attachResponse === DEFAULT_CONFIG.attachResponse`,
  protecting existing T4/T6 tests that pre-set `attachResponse`. ✓

### T10 — README updates

- `## Review skills` section present at `README.md:222`. ✓
- Sycophancy caveat verbatim at line 252; neutral usage wording
  "This starts a new Claude Code session and may count toward your
  Claude Code usage." at line 296. ✓
- Cost paragraph (line 329) byte-identical to Plan 0001 wording
  (verified against the test fixture at
  `test/readme.test.mjs:711-718` and the original Plan 0001
  `2-implement.md:980`). ✓ — see § E for the byte-equality check.
- See **Finding F1** for the one gap.

### T11 — CI verification

- `.github/workflows/ci.yml` unchanged from Plan 0002 (no commits
  touching the file in the Plan 0003 range). ✓
- Matrix is `ubuntu-latest` + `macos-latest` × Node `20` + `22`
  (lines 22-28). ✓
- `permissions: contents: read` (line 8). No `secrets.*` references. ✓

### T12 — Live E2E

- Artifact at the prescribed path exists, header complete, both
  review variants exercised against real Claude 2.1.150 + Codex
  0.136.0. ✓ See § H for full integrity check.

### Status eligibility table (§ 3.6) — both commands

All 11 rows from 1-plan.md § 3.6 are exercised by `cmdReview` /
`cmdAdversarialReview`:

| Job status                       | `cmdReview` location              | `cmdAdversarialReview` location           |
|----------------------------------|-----------------------------------|-------------------------------------------|
| `awaiting_followup`              | allow (falls through to line 1132)| allow (post line 1437 `result` guard)     |
| `completed` (live idle)          | line 1102-1129 (driver.status idle)| allow (post `result` guard)              |
| `completed` (no session)         | line 1118 reject                  | allow (post `result` guard)               |
| `running`                        | line 1063 reject                  | line 1409 reject                          |
| `needs_input`                    | line 1050 reject                  | line 1422 reject                          |
| `queued` / `starting`            | line 1076 reject                  | line 1396 reject                          |
| `failed` w/ result               | line 1089 reject                  | allow                                     |
| `failed` no result               | line 1089 reject                  | line 1437 reject                          |
| `stopped` w/ result              | line 1089 reject                  | allow                                     |
| `stopped` no result              | line 1089 reject                  | line 1437 reject                          |
| `orphaned` w/ result             | line 1089 reject                  | allow                                     |

T4-8/T4-11/T4-20-* / T6-10/T6-11/T6-12-*/T6-13-*/T6-14 cover these
rows in `dispatcher.test.mjs` (some via flexible assertions, see
2-implement.md T6 deviation note).

### Risks (§ 5) — disposition

All 16 risks addressed in implementation or knowingly accepted:

- R1 sycophancy: mitigation in adversarial variant + caveat. ✓
- R2 prompt injection: data delimiters + explicit data-not-
  instruction sentence. Deeper sanitization explicitly deferred per
  R2 mitigation text — acceptable. ✓
- R3 structured parse failure: 4-step parser with fallback. ✓
- R4 no-result job: `cmdAdversarialReview:1437` rejects with named
  status. ✓
- R5 orphaned review session: relies on existing orphan management. ✓
- R6 schema fwd-compat: optional field, no bump. ✓
- R7 runaway critic chain: default-target rule prevents accidental
  recursion. ✓
- R8 YAML strict-parse: strictParseFrontmatter test extended in T8. ✓
- R9 ultrareview overlap: **See Finding F1 — mitigation
  not implemented in README.**
- R10 `--allow-edit`: parse-time reject on both commands. ✓
- R11 expired TTL: error message suggests adversarial. ✓
- R12 missing result file: explicit error in
  `cmdAdversarialReview:1519-1528`. ✓
- R13 followup regression from T3: existing tests pass unchanged. ✓
- R14 prompt-too-long: template is compact; touched-files names-only. ✓
- R15 sidecar schema drift: same `readSidecar` path. ✓
- R16 reconcile-loop hang: DD-1 timeout machinery. ✓

### Scope discipline

- No new dependency in `package.json` — confirmed via `git diff
  --stat 4e208a3..HEAD` (package.json absent from changed files).
- No silent in-scope work dropped. Each deviation from 1-plan.md
  has an honest **Deviation from 1-plan.md** subsection in
  2-implement.md.
- T12a and T12b are honestly logged as remediations driven by T12
  live findings; not snuck in as "polish."

---

## B. Security + safety invariants

All 10 invariants hold.

1. **No bypass flags in production code.** Grep:
   `grep -rn "dangerously-skip-permissions" packages/ tools/` returns
   only matches in `test/dispatcher.test.mjs` (negative assertions)
   and `test/skills-manifest.test.mjs` (FORBIDDEN_TOKENS sentinel).
   ✓
2. **`--allow-edit` rejected by both review commands at parse time
   with the exact pinned message.** Verified at
   `claude-companion.mjs:956` (cmdReview) and `:1284`
   (cmdAdversarialReview). Both use the identical string `"--allow-edit
   is not applicable to review skills. Reviews are read-only."` ✓
3. **`--yes` never silently injected.** SKILL.md test-locks at
   skills-manifest.test.mjs verify the run lines for both new skills
   never contain ` --yes`. ✓
4. **`$claude-review` rejects all 6 startup-only flags at parse
   time** (`--model`, `--effort`, `--permission-mode`, `--add-dir`,
   `--mcp-config`, `--name`) with a single shared error message at
   `claude-companion.mjs:973-985`. ✓
5. **`$claude-adversarial-review` ACCEPTS `--model` / `--effort` /
   `--permission-mode`** per OQ-E divergence, forwarded to
   `driver.startSession` at `claude-companion.mjs:1549-1552`. The
   divergence is documented in 1-plan.md § 3.1 "Same-session vs
   fresh-session" table. ✓
6. **Privacy ack uses TARGET-job workspace, not caller cwd.** Both
   commands call `resolveWorkspaceAck({ workspaceRoot:
   job.workspace.root, … })`:
   - cmdReview: `claude-companion.mjs:1164`
   - cmdAdversarialReview: `claude-companion.mjs:1450`
   Verified the value passed in is `targetJob.workspace.root`, not
   `process.cwd()`. ✓
7. **Non-TTY no-ack path fails closed** with target workspace
   identified in the error message — see `claude-companion.mjs:
   1169-1180` (review) and `:1455-1466` (adversarial-review). ✓
8. **No new dependency in `package.json`.** `git diff --stat
   4e208a3..HEAD` has no entry for `package.json`. ✓
9. **No `claude -p` reference outside negation context.** Grep
   shows only matches in:
   - `packages/plugin-codex/README.md:7,329` — both say "does NOT
     use `claude -p`" (negation)
   - test files asserting absence
   - existing source-level negative test in
     `send.test.mjs:846-861` (Plan 0001/0002 ban-token guard)
   ✓
10. **CI permissions stay `contents: read`**, no secrets, no real
    Claude/Codex install. Confirmed by reading
    `.github/workflows/ci.yml` (line 8-9) plus
    `ci-workflow.test.mjs` static guards. ✓

**Live E2E throwaway repo tracked files unmodified.** Artifact STEP
9 (`e2e-live-20260602.txt:393-400`) shows `git status` returning only
untracked entries (`.cc-plugin-codex-home/`, `.omc/`); tracked files
(`app.js`, `README.md`) absent from the output → unmodified. ✓

---

## C. Architectural invariants

All four invariants hold.

1. **`packages/runtime/src/**` imports no driver symbols, no
   node-pty, no `claude -p`.** Grep:
   `grep -rn "driver-claude-code\|node-pty\|claude -p"
   packages/runtime/src/` returns **0 hits**. ✓
2. **`packages/plugin-codex/scripts/**` imports no node-pty.** Grep:
   `grep -rn "node-pty" packages/plugin-codex/scripts/` returns one
   hit — a COMMENT at `claude-companion.mjs:105` ("never imports
   node-pty directly — the driver supplies the probe via DI"). No
   import statement. ✓
3. **`packages/runtime/src/**` has no driver-side type leakage.**
   `types.ts` keeps `driver.capabilitiesSnapshot: unknown` per Plan
   0001 invariant (line 48). ✓
4. **Sidecar parser unchanged from Plan 0002.** `git log --oneline
   --since="2026-06-01" -- packages/driver-claude-code/src/sidecar.ts`
   returns no commits → file unchanged in Plan 0003. ✓
5. **"No review-of-review by default" rule.** Both
   `cmdReview:1134-1149` and `cmdAdversarialReview:1469-1484` walk
   `turns` from the latest index downward and require `prompt.summary`
   to NOT start with `[review] ` or `[adversarial-review] ` AND
   require `t.result != null` AND require `t.status === 'completed'`.
   Identical predicate in both functions. ✓

**Driver-src footprint in Plan 0003.** `git log --oneline
--since="2026-06-01" -- packages/runtime/src/ packages/driver-claude-
code/src/` returns exactly two commits: `e99efe1` (T5 — runtime
`reviewOf` field) and `a6a8a84` (T12 / T12a — driver `attach.ts`
remediation). No other src files touched. ✓

---

## D. Test adequacy

**Local gate run at HEAD** (parallel, against this auditor's machine,
Node 25.8.2 on Darwin 25.5.0):

| Lane               | Result        |
|--------------------|---------------|
| `npm run lint`     | clean         |
| `npm run typecheck`| clean         |
| `npm run format`   | clean         |
| `npm test`         | exit 0 (chain); final lane `test:plugin` reported 601/601 |
| `npm run test:attach` | 28/28      |

The `npm test` chain (`test:mock && test:runtime && test:driver &&
test:plugin`) exited 0, which guarantees the prior three lanes
passed (any failure short-circuits the chain). Stated counts of 68 /
172 / 178 / 601 → **1019 total** are consistent with the
exit-0 and the visible plugin lane.

### Coverage spot-checks

- **T1 review prompts**: 24 tests. Each describe-block asserts a
  distinct contract bullet (template-shape, fenced-JSON, severity
  enum, verdict enum, sycophancy caveat, no-numerical-floor,
  delimiter presence, content injection, three `touchedFiles`
  states, deterministic, no OQ4 leak, no `claude -p`). Justified
  per Pattern 5 (per-describe redundancy analysis in 2-implement.md). ✓
- **T2 review parser**: 62 tests. Seven explicit cases from § T2
  acceptance are all present (verified by grep for case-numbered
  describes 1-7 in `review-parser.test.mjs`). Additional cases
  cover line-coercion variants, normalization edge cases, and
  fall-through chains. ✓
- **T4 status-eligibility table**: All 11 rows of § 3.6 covered (see
  table in § A). Some `failed`/`queued`/`starting` tests use
  flexible assertions due to reconciler-before-eligibility ordering —
  acceptable per C's Judgment 2 in 2-implement.md T4. ✓
- **T6 reconcile-loop timeout (T6-19)**: Verified at
  `dispatcher.test.mjs:4911`. The single test covers exit code,
  exact timeout message, `review.failed` event with `reason:
  'timeout'`, review job marked `failed`. Original target-job
  UNCHANGED assertion present (T6-19 setup uses
  `attachResponse: ''` so the target job reconciles to a stable
  `awaiting_followup` and doesn't drift during the timeout window).
  ✓
- **T6-20 env-var parse**: covered for valid number, NaN, negative
  per 2-implement.md T6 coverage table. ✓
- **T12a regression (3 tests, all in
  `send.test.mjs`)**:
  - T12a-A: `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` env-var fallback —
    driver constructed without `env` option, asserts the send
    completes in <1500ms thanks to process.env warmup=0
    (lines 992-1043).
  - T12a-B: `CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS` env-var
    reachable via process.env — forces a 1ms timeout to confirm the
    env-var-read path is wired (lines 928-990).
  - T12a-C: attach.ts source assertions — must use
    `'\x1b[200~' + input.text + '\x1b[201~\r'` for both prompt
    and permission-answer writes; explicitly forbids bare-CR /
    bare-CRLF writes (lines 819-844). These are source-level
    regression locks, not behavior tests — appropriate for the
    encoding-policy invariant.
  ✓
- **T12b regression (9 tests)**:
  - 6 helper unit tests in `review-result-source.test.mjs`
    (T12b-S1-S6): file-priority, missing-on-disk, whitespace,
    no-result-block, undefined-fallback, empty-string-path
    sentinel. The helper's priority (`file → fallback → ''`) is
    fully locked. ✓
  - 3 dispatcher integration tests in `dispatcher.test.mjs`
    (T12b-D1, D2, D3): all use the mock-claude
    `sidecarSummaryOnSubmit` option to reproduce the production
    split. D3 specifically asserts `result.md` content is NOT the
    sidecar summary — the exact contract that was broken pre-T12b.
    These tests genuinely guard against regression. ✓

### Test-count deviations

Per Pattern 5, several T-tasks ship more tests than the plan target
(T1 +24 vs +10; T2 +62 vs +17; T4 +30; T5 +14 vs +5; T6 +35; T8 +46).
Subagent C performed per-describe redundancy analysis on each and
accepted the overshoot. This auditor concurs with the rulings —
spot-checking T2's 62 tests, no two tests cover the same contract
assertion.

---

## E. Cost-claim discipline

All checks pass.

- **Forbidden tokens absent from production prose.** Grep over
  packages/plugin-codex/README.md and packages/plugin-codex/scripts/
  for the six forbidden strings (`saves money`, `cheaper than`,
  `reduces cost`, `preserves prompt-cache savings`, `avoids the`,
  `more efficient than`) returns 0 matches. The only `avoids the`
  matches in the repo are in test files that DEFINE the
  forbidden-tokens fixture array. ✓
- **Forbidden regex patterns absent.** Grep over the entire diff
  range `4e208a3..HEAD` for `/\d+%\s*(faster|cheaper|less)/i`,
  `/\d+x\s*(faster|cheaper)/i`, `/save[sd]?\s+\d+/i` returns 0
  matches outside test files. ✓
- **Cost paragraph byte-identical to Plan 0001's wording.**
  `README.md:329`:
  > "This v1 uses Claude Code background sessions and does not use
  > `claude -p`. It is designed to preserve the architecture needed
  > for future session/cache reuse experiments. Cost savings have
  > not been benchmarked yet. Plan 0004 is reserved for measurement."

  Matches the test fixture at `test/readme.test.mjs:715` and the
  Plan 0001 implementation log's canonical paragraph at
  `documentation/plan/0001-20260530-initial-plan/2-implement.md:980`
  character-for-character. ✓
- **T13-21 test still exists and still asserts byte-equality**
  (`test/readme.test.mjs:711-719`). The full `test:plugin` lane
  passed → the test passes. ✓
- **Adversarial-review README section uses neutral framing.** Line
  296: `"This starts a new Claude Code session and may count toward
  your Claude Code usage."` — no OQ4-forbidden tokens, no
  comparative claims, no quantitative pattern. ✓
- See **Finding F1** for the one R9 mitigation gap.

---

## F. T12a fix correctness — extra scrutiny

All four T12a fixes verified at HEAD.

1. **attach.ts env-var fallback** (T12a-1). `packages/driver-claude-
   code/src/attach.ts:213`: `const envSource = opts?.env ?? process.env;`
   Then both `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` (line 214) and
   `CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS` (line 231) read
   from `envSource`, ensuring the production dispatcher path
   (which constructs the driver without an `env` option) reaches
   process.env. The test seam (explicit `opts.env`) still takes
   precedence via `??`. ✓ Regression test T12a-A locks the fallback.
2. **ATTACH_WARMUP_DEFAULT_MS bumped to 8_000ms** (T12a-2). Line
   216 sets the constant to `8_000`; the JSDoc-style comment at
   lines 199-208 documents the bump with reference to the live
   evidence. The constant is discoverable from the
   `attachWarmupMs?` JSDoc on `AttachAndSendOptions` (line 43-52),
   but the env-var override is NOT mentioned in the user-facing
   README — see Nit N3 below. (Note this is a different concern
   from the operator escape hatch being reachable, which is
   confirmed.) Acceptable for Plan 0003 since the env var is a
   defensive operator knob, not a user-facing tunable. ✓
3. **Bracketed-paste wrap** (T12a-3). attach.ts:332 writes
   `term.write('\x1b[200~' + input.text + '\x1b[201~\r')` for the
   prompt; attach.ts:418 writes the identical wrap for the
   permission answer. Source-level regression test T12a-C asserts
   both writes are present and that bare-CR/CRLF writes are
   absent. ✓
4. **Mock-claude byte handler strips markers and skips empty
   submits.** `tools/mock-claude/claude:711` defines
   `stripBracketedPaste(s)` with regex `/\[200~/g` and `/\[201~/g`.
   Line 729 skips empty submits (`if (cleaned.length === 0)
   continue;`). The CRLF-line-discipline edge case described in
   the comment (`icrnl` may convert CR to LF; "empty submit is a
   no-op handles all cases") is the right defense. ✓

**Format-only follow-up commit `b83cfcc`.** `git diff --stat
b83cfcc^ b83cfcc` shows `packages/driver-claude-code/test/send.test.mjs`
| 5 +----, 1 file changed, 1 insertion, 4 deletions. Verified
format-only. ✓

### Concern (minor): regex tolerance in mock-claude strip

The `stripBracketedPaste` regex `/\[200~/g` matches the LITERAL
substring `[200~` anywhere in the buffer, not the ESC-prefixed
`\x1b[200~` specifically. In practice, no plausible review prompt
content would contain a bare `[200~` substring — but if a user's
prompt content ever did, the mock would silently strip it.
Acceptable in mock-test fixture context; not a production concern.
**Not a finding.**

---

## G. T12b fix correctness — extra scrutiny

All five T12b contract bullets verified at HEAD.

1. **Helper extracted** to `scripts/lib/review-result-source.mjs`
   as `readTurnFinalMessageOrFallback(turn, fallback)`. Priority
   verified exactly:
   - line 30: read `turn?.result?.finalMessagePath`
   - line 31-41: if path is truthy, try to read file; success
     returns content; missing / unreadable / whitespace-only
     falls through
   - line 42: `return fallback ?? '';`
   - `finalMessagePreview` is NEVER consulted in this file (grep
     confirms 0 matches). ✓
2. **cmdReview calls the helper AFTER an extra reconcileJob with a
   brief deterministic wait.** `claude-companion.mjs:1231-1253`:
   constructs `REVIEW_RECONCILE_DELAY_MS` from the env var with
   `Math.max(0, parsed)` (so `0` is allowed, NaN falls back to
   `8_000`), sleeps via `setTimeout`, then re-reconciles, then
   calls the helper. The 8-second default matches the honest-
   limitation section in the artifact and 2-implement.md. ✓
3. **Test seam wired into the dispatcher test harness.** Per
   2-implement.md T12b, `runDispatcher` in `dispatcher.test.mjs`
   sets `CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS: '0'` so mock-
   driven tests bypass the 8-second wait. ✓ (Grep-verified via
   T12b-D test setup at lines 6147-6188 — the env-var is implicit
   via `runDispatcher`'s shared env, not per-test.)
4. **Mock-claude `sidecarSummaryOnSubmit`.** `tools/mock-claude/
   claude:668-695`: when set, writes the literal value to
   `sidecar.output.result` (line 675) AND appends an
   `{type:'message',role:'assistant',content:<response>}` line to
   the session transcript (lines 683-691). The transcript parent
   directory is created on demand via `mkdirSync(..., { recursive:
   true })` (line 682) to handle synthetic-test setups that pre-
   write only `state.json` without the projects/ subdir. ✓
   - **Default behavior preserved.** When `sidecarSummaryOnSubmit`
     is NOT set (line 669, falls through to `response`), the mock
     writes the full response to `sidecar.output.result` — byte-
     identical to pre-T12b behavior. The transcript-append branch
     also runs only when the override is set (line 677). Existing
     T4/T9 tests should remain valid. ✓ (Validated transitively
     by the test:plugin 601/601 pass.)
5. **T12b integration tests exercise the production-style split.**
   T12b-D1 / D2 / D3 all use the mock config
   `{ reviewFixture: 'structured-review', sidecarSummaryOnSubmit:
   'review verdict: pass_with_findings — 2 issues' }` so the
   sidecar carries a literal summary ≠ the transcript-derived
   fixture. D3 specifically asserts that
   `turn.result.finalMessagePath` content is NOT equal to the
   summary string. ✓
6. **cmdAdversarialReview NOT changed by T12b.** Grep confirms
   the import `readTurnFinalMessageOrFallback` is consumed only in
   `cmdReview` (line 1250). `cmdAdversarialReview` reads from
   `currentReviewJob.result?.finalMessagePath` directly at line
   1704 — but that's the *fresh* review job's reconciled result
   file (the review session's `<jobId>.result.md`), which IS the
   source of truth and is written by the reconciler. The sidecar-
   summary split applies to a long-lived attached session's same-
   session turns, not to a brand-new background session's
   reconciled-once result file. So cmdAdversarialReview is
   correctly unaffected. ✓
7. **Format-only follow-up commit `b6675bc`.** `git diff --stat
   b6675bc^ b6675bc`: review-result-source.test.mjs | 54 +/-,
   tools/mock-claude/claude | 4 +/-. Inserts == deletions per
   file → pure prettier reformat. ✓

**Honest limitation framing.** 2-implement.md "Honest limitation"
section and artifact `T12b` section both characterize the 8-second
wait correctly: tuned for Claude 2.1.150's observed flush latency,
bypassable via the test seam, and explicitly flagged for future
replacement with a watch-events-jsonl loop. Fair characterization. ✓
The test seam is usable by future operators (env var
`CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS`).

---

## H. Live E2E artifact integrity

Artifact at `artifacts/e2e-live-20260602.txt`. All checks pass.

- **Header fields complete and accurate** (lines 1-12): date,
  commit (`31fa454 + T12a remediation in same commit per T12 brief`
  — accurate, the substantive T12 commit is `a6a8a84` per `git
  log`, but the T11-CI-log commit `31fa454` was the most recent
  HEAD when T12 began, so the framing is honest about ordering).
  Node 25.8.2, npm 11.11.1, Codex 0.136.0, Claude Code 2.1.150,
  Darwin 25.5.0. ✓
- **Versions match Plan 0003 OQ-H baseline.** 1-plan.md does not
  pin a specific Claude version, but OQ-H states "review capability
  is implied by delegate+followup both ok". The artifact's STEP 1
  setup output shows both delegate and follow-up capability `ok`.
  ✓
- **Sensitive data redacted.** Grep `grep -E "ng\.wangzeon|@gmail|
  5e988074|DoubleBlack|InstantLink"` returns 0 matches. Grep `grep
  -c "<email redacted>|<orgId redacted>|<orgName redacted>"`
  returns 3 (matches the expected three placeholders). ✓
- **No unrelated user repo paths** beyond `/tmp/cc-plugin-codex-
  plan0003-e2e-UAOhKH` and references to `/Users/hongjunwu/
  .claude/...` (the `claude-auth` JSON points at the user's
  authenticated claude account paths, which is expected and not
  PII). ✓
- **Full flow visible:** STEP 2 delegate → STEP 3 status (poll) →
  STEP 4 review → STEP 5 adversarial-review --json → STEP 6 status
  → STEP 7 result → STEP 8 stop ×2 → STEP 9 cleanup verification. ✓
- **T12a "BUG OBSERVED" section** (lines 96-157) describes the
  warmup + bracketed-paste failure mode with concrete probe
  evidence (long-prompt swallow timings vs short-prompt success). ✓
- **T12b retry section** (lines 559-769) shows the original failed
  output (NIT containing delegate's text) being replaced with the
  correctly-parsed verdict after the T12b fix shipped. ✓
- **Skill-path-vs-direct-dispatcher disclosure** (lines 22-31)
  honestly explains why the artifact used the direct dispatcher
  path (Codex CLI is interactive TUI) and points to
  `skills-manifest.test.mjs` as the separate unit-test surface for
  skill discovery. ✓
- **Both reviews compared the SAME original turn**
  (`reviewOf.turnIndex = 0` on adversarial; same-session review
  picked turn 0 per § 3.X rule). Artifact lines 300-309 record the
  observational comparison: same-session verdict `pass` 0
  findings, adversarial verdict `fail` 2 findings (high + medium).
  Informational, not a pass/fail gate. ✓

---

## I. Process / reviewer-contract findings

Three process notes for awareness. None block Stage 4.

### P1. Subagent-C briefs consistently apply F-H1 / F-H2

Spot-checked T1, T5, T6, T10:
- **T1**: C's findings table shows F-H1 read-only contract honored
  (no edits, only inspection); F-H2 trace explicitly addressed
  ("optional `context` capabilities traced through both templates;
  `touchedFiles` three states all tested"). ✓
- **T5**: C's compliance table is 15 rows all PASS. F-H2 verbatim
  trace block included with file:line evidence. ✓
- **T6**: C's verbatim trace block traces `reviewOf` from
  `CreateJobInput` consumption through `createJob` to event log;
  ADVERSARIAL_REVIEW_PROMPT optional `touchedFiles` traced from
  consumer to template. ✓
- **T10**: C performed full cross-document consistency check (SKILL.md
  ↔ README ↔ plugin.json ↔ 1-plan.md eligibility); 12 load-bearing
  claims with file:line evidence. ✓

F-H1 / F-H2 inputs from Plan 0002 Stage 5 were respected. ✓

### P2. T12a + T12b commit scope

T12a was bundled into the T12 commit (`a6a8a84`), and T12b was a
separate commit (`ed53079`) per the brief's "if T12 exposes a bug"
process. Followed by format-only follow-ups (`b83cfcc`, `b6675bc`)
for prettier compliance. Verified each follow-up via `git diff
--stat` is format-only:

- `b83cfcc`: `send.test.mjs | 5 +----` (1 insertion, 4 deletions) ✓
- `b6675bc`: `review-result-source.test.mjs | 54 +/-` (equal
  insertions/deletions) + `tools/mock-claude/claude | 4 +/-` ✓

**Could T12a + T12b have been SEPARATE commits with cleaner
scope?** Strictly yes — T12a touched driver-package code while T12b
touched dispatcher + mock code, and the two bugs have separate
narrative arcs (warmup/encoding vs parse-source). However: both
remediations were driven by the same live-E2E session and bundling
them under the T12 banner preserves a single audit trail per the
brief's process. The 2-implement.md log clearly separates the two
sections so the artifact is not muddled. **Acceptable trade-off; no
finding.**

### P3. T11 cadence — orchestrator absorbed A/B roles

2-implement.md T11 documents that the orchestrator absorbed both
Subagent A's and Subagent B's roles, citing Pattern 4. The
"verification" essentially asserts "no work needs doing" and runs
the existing static-CI-test suite. This is borderline relative to
Plan README § 3's "no self-audit in the same context" rule, since
the orchestrator is BOTH implementer-equivalent (declaring no
change needed) AND verifier (running the gates).

**Mitigation actually present**: `ci-workflow.test.mjs` (50+ static
tests written in Plan 0002) is an independent assertion that the
contract holds; the orchestrator's "trust me, no changes needed" is
backed by tests another author wrote. So the self-audit risk is
contained.

**Recommendation for future plans**: when a T-task's verification
is purely "this still works," explicitly call out the third-party
test that backs the claim instead of relying on orchestrator
self-attestation. Reviewer-contract patterns doc could add this as
Pattern 6. **Not a Plan 0003 polish item.**

---

## Findings

### Severity: LOW

#### F1. README does not document the `claude ultrareview` distinction

1-plan.md § R9 mitigation is:
> "README documents the distinction: `$claude-review` is local-
> session review within the plugin; `ultrareview` is Anthropic's
> cloud-hosted PR review"

`packages/plugin-codex/README.md` does **not** mention
`ultrareview` anywhere (verified by `grep -in ultrareview
packages/plugin-codex/README.md` returning 0 matches). The
README's `## Known limitations` section (lines 331-345) does not
include the "No `claude ultrareview` wrapper" bullet that
`2-implement.md:1499` parenthetically claims is "existing".

The T10-24 test (`test/readme.test.mjs:1147-1177`) is passive — it
only requires that IF `ultrareview` is mentioned, it must be in a
negative context. It PASSES when `ultrareview` is not mentioned at
all. So the test does not catch this gap.

**Severity**: LOW — feature works correctly; no user-visible
regression. R9 is L=M / I=L. Easy Stage-4 fix.

**Evidence**: `packages/plugin-codex/README.md:331-345`,
`packages/plugin-codex/test/readme.test.mjs:1147-1177`,
`documentation/plan/0003-20260601-review-skills/1-plan.md:501`,
`documentation/plan/0003-20260601-review-skills/2-implement.md:1499`.

**Suggested disposition**: Stage 4 polish — add a sentence to
`## Review skills` (around line 222) and a bullet to `## Known
limitations` (around line 343) clarifying that `$claude-review` is
local-session and `ultrareview` is Anthropic's cloud-hosted offering,
not wrapped by this plugin. Tighten `T10-24` to require the
distinction be documented (positive assertion), not merely "if
mentioned, neutral."

### Severity: NIT

#### N1. `formatAdversarialReviewJson` writes `reviewOf: null` when absent

`packages/plugin-codex/scripts/lib/format.mjs:477`:
`reviewOf: job.reviewOf ?? null`. This emits a `null` value when
`reviewOf` is absent, which differs from T7's omission rule used in
`formatStatus` (which omits the key entirely via spread).

In practice the `?? null` branch is **unreachable**: every
`cmdAdversarialReview` invocation calls `createJob({ ..., reviewOf:
{ jobId, turnIndex } })` (claude-companion.mjs:1583), so `job.reviewOf`
on the review-job side is always set. The inconsistency is purely
shape-cosmetic.

**Suggested disposition**: Stage 4 polish — either delete the `??
null` (let the spread elide the key) for consistency with T7, or
explicitly comment why this formatter intentionally diverges. Either
choice is fine.

#### N2. `printUsage` flag descriptions are stale wrt T4/T6 additions

`claude-companion.mjs:1736-1767`. The flag list:
- Does not document `--all`/`--json`/`--yes` as accepted by
  `review` / `adversarial-review` (only mentions "status/result/stop
  /followup" for `--all`).
- Labels `--model`/`--effort`/`--permission-mode` as "for delegate",
  but `--model`/`--effort`/`--permission-mode` are also accepted by
  `adversarial-review`.

Users reading `--help` will not learn the full surface of the new
review subcommands from the usage block alone (the SKILL.md and
README do enumerate the flags).

**Suggested disposition**: Stage 4 polish — update the flag block
to either include review-applicable flags explicitly or split
flag-applicability per subcommand.

#### N3. Operator escape hatches not surfaced in README

`CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` and
`CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS` (T12a additions) and
`CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS` (T12b addition) are
real operator knobs but appear only in source comments and tests.
A user hitting a slow Claude TUI version would have no
discoverable way to find them.

**Severity**: NIT — they're defensive operator knobs, not user-
facing features. Plan 0003 explicitly scoped them as test seams /
escape hatches.

**Suggested disposition**: Stage 4 polish or out-of-scope —
mention in a "Tuning" subsection of README troubleshooting, OR
explicitly defer to a future plan.

---

## Summary table

| ID | Severity | Area | Finding                                                                                      | Suggested disposition |
|----|----------|------|----------------------------------------------------------------------------------------------|------------------------|
| F1 | low      | A,E  | README does not document `$claude-review` vs `claude ultrareview` distinction (§ R9)         | Stage 4 — add 1-2 sentences in `## Review skills` + bullet to `## Known limitations`; tighten T10-24 to positive assertion |
| N1 | nit      | A    | `formatAdversarialReviewJson` writes `reviewOf: null` when absent; inconsistent with T7      | Stage 4 — delete `?? null` or comment intent |
| N2 | nit      | A    | `printUsage` flag block stale wrt review subcommands                                         | Stage 4 — update flag descriptions or split per subcommand |
| N3 | nit      | F,G  | Operator env-var knobs (T12a/T12b additions) not discoverable from README                    | Stage 4 polish OR out-of-scope defer |
| P1 | n/a      | I    | F-H1/F-H2 adherence in C briefs — verified clean                                             | No action |
| P2 | n/a      | I    | T12a/T12b commit scope (bundled with T12 / separate)                                         | No action; honest disclosure in log |
| P3 | n/a      | I    | T11 orchestrator-absorbs-A/B/C pattern — borderline self-audit                               | Future plans — add Pattern 6 to reviewer-contract patterns doc |

---

## Out-of-scope (deferred)

Items noticed during the audit that are NOT Plan 0003 bugs but
should not be lost.

### O1. 8-second deterministic wait in cmdReview

`claude-companion.mjs:1240-1242`. The 8-second pre-reconcile wait
is a UX cost on every real-Claude `$claude-review` invocation
(not just slow Claude versions). The honest-limitation section in
2-implement.md correctly flags this; the comment proposes a future
"watch the events.jsonl for a `reconcile.result` event whose
finalMessagePath differs from the pre-send value" loop.

**File against a future plan**: replace the deterministic wait
with an event-driven poll (or expose a configurable threshold
default).

### O2. Driver-side sidecar.output.result vs transcript split

Plan 0002 driver populates `sendResult.finalMessage` from sidecar
`output.result`. On Claude 2.1.150 the sidecar carries a SUMMARY
while the full assistant message is in the transcript. T12b
worked around this in cmdReview by reading the reconciled result
file, but the underlying driver-vs-reconciler split is still
present. Future versions of Claude may exacerbate or fix this; the
plugin should not depend on the current behavior.

**File against a future plan** (Plan 0002.5 or Plan 0005-adjacent):
unify the source-of-truth for "final assistant message" so that
`sendResult.finalMessage` always equals what the reconciler writes
to `<jobId>.result.md` when both are populated. Audit whether the
driver should also flush the transcript before returning from
`driver.send()`.

### O3. ATTACH_WARMUP_DEFAULT_MS tuned for a single Claude version

`attach.ts:216` = `8_000`ms tuned against Claude 2.1.150. A
future Claude version may finish its startup banner faster (or
slower); the default is single-point-tuned. The env-var escape
hatch exists (T12a-1) but is not surfaced in user docs (N3).

**File against a future plan**: probe-based or adaptive warmup
that observes when the TUI becomes ready rather than waiting a
fixed duration.

### O4. Reviewer-contract Pattern 6

P3 above. Worth adding a section to
`documentation/process/reviewer-contract-patterns.md` describing
the "orchestrator absorbs A and B for zero-change verification
tasks" pattern and constraining when it's acceptable (must cite
a third-party test as the verification anchor, not just orchestrator
self-attestation).

---

## Approval gate

**Ready for polish?** **Yes** (verdict: `ready-for-polish`).

No critical / high / medium findings. The one LOW finding (F1) is
a documentation gap with a 1-line fix path. Three NIT findings and
four out-of-scope deferrals are appropriate Stage 4 / future-plan
material.

Stage 4 polish can dispatch in one short pass.
