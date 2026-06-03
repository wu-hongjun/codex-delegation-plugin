You are the independent Stage 3 auditor for Plan 0003 of cc-plugin-codex
(repo: /Users/hongjunwu/Repositories/Git/cc-plugin-codex). You have NOT
seen the implementation. Form your own opinion.

## Your role

Stage 3 = audit. Read-only. You write exactly one file:

  documentation/plan/0003-20260601-review-skills/3-audit.md

You do NOT edit any other file. You do NOT run implementation, polish, or
report work. You do NOT self-correct findings into code fixes — those are
Stage 4's job.

## Commit to audit

  HEAD = 5da071e  (Plan 0003: mark Stage 2 complete; awaiting independent audit)

Verify with:

  git rev-parse HEAD                              # expect 5da071e...
  git log --oneline -30                           # see T1..T12 + T12a + T12b chain
  git status --short                              # working tree clean (only references/ submodule ?s expected)

## Required reading (in this order)

  1. documentation/plan/README.md
     — Workflow definition. Read it cold so you know what Stage 3 means
       in this project's terms.
  2. documentation/plan/0003-20260601-review-skills/readme.md
     — Status + stage table.
  3. documentation/plan/0003-20260601-review-skills/1-plan.md
     — The approved Stage 1 contract. Treat as ground truth for scope.
     — § 4 is the task list (T1..T12). § 6 has the resolved OQs (OQ-A..H
       + DD-1). § 5 is the risk register. § 7 is the definition of done.
  4. documentation/plan/0003-20260601-review-skills/2-implement.md
     — Stage 2 implementation log. Long (~2000 lines). Read it all. Pay
       attention to the T12 / T12a / T12b sections at the end — those
       are post-subagent remediations driven by live-E2E findings on
       Claude Code 2.1.150, applied in the T12 commit itself per the
       brief's "if T12 exposes a bug" process.
  5. documentation/plan/0003-20260601-review-skills/artifacts/e2e-live-20260602.txt
     — Live E2E artifact. Two remediations (T12a, T12b) were discovered
       AND fixed within T12. Re-read both bug narratives and the
       post-fix retries.

After that, walk the code. Where 2-implement.md says "fixed at X",
verify the fix is actually in the file at HEAD. Don't trust the log —
verify.

## What the audit should cover

Treat each as a section in 3-audit.md. For each finding, mark severity
(critical / high / medium / low / nit) and state evidence (file:line).

### A. Contract compliance vs 1-plan.md

For each task T1..T12:
  - Did the implementation match the acceptance criteria in 1-plan.md § 4?
  - Are the OQ resolutions (§ 6 OQ-A..H + DD-1) honored?
  - Are the 16 risks (§ 5) addressed (or knowingly accepted)?
  - Was anything implemented that's NOT in 1-plan.md scope?
  - Was anything in 1-plan.md scope dropped or deferred without
    maintainer acknowledgement? (Check 2-implement.md "Deviations"
    subsections for honest disclosures.)

### B. Security + safety invariants

  - No bypass flags (`--dangerously-skip-permissions`, etc.) — grep.
  - `--allow-edit` is REJECTED by both review subcommands at parse time
    with the exact message: `"--allow-edit is not applicable to review
    skills. Reviews are read-only."` Verify in cmdReview AND
    cmdAdversarialReview.
  - `--yes` is never silently injected — grep SKILL.md run-lines for
    `claude-review` and `claude-adversarial-review`.
  - `$claude-review` rejects `--model` / `--effort` / `--permission-mode`
    / `--add-dir` / `--mcp-config` / `--name` at parse time (same-session
    is inherited; flags would silently no-op).
  - `$claude-adversarial-review` ACCEPTS `--model` / `--effort` /
    `--permission-mode` (fresh session; per OQ-E). Confirm the divergence
    from `$claude-followup` is documented and intentional.
  - Privacy ack uses TARGET-job workspace.root, not caller cwd. Both
    cmdReview and cmdAdversarialReview must do this; verify the
    `resolveWorkspaceAck` call sites.
  - Non-TTY no-ack path fails closed with target workspace identified in
    the error message.
  - No new dependency in `package.json` that the plan didn't authorize.
  - No `claude -p` reference outside negation context.
  - CI permissions stay `contents: read`, no secrets, no real Claude/
    Codex install. (Read .github/workflows/ci.yml.)
  - Throwaway repo's tracked files unmodified during E2E (artifact STEP
    9). Verify the artifact actually shows what the log claims.

### C. Architectural invariants

  - packages/runtime/** imports NO driver-claude-code symbols, no
    node-pty, no `claude -p`:
    grep -rn "driver-claude-code\|node-pty\|claude -p" packages/runtime/src/
    Expected: zero hits.
  - packages/plugin-codex/scripts/** imports NO node-pty:
    grep -rn "node-pty" packages/plugin-codex/scripts/
    Expected: zero IMPORT hits (a comment is fine; an import is not).
  - packages/runtime/src/** has no driver-side type leakage.
  - Sidecar parsing is defensive (every field optional, missing file
    returns null, malformed JSON returns null). Read sidecar.ts — should
    be unchanged from Plan 0002.
  - Plan 0001's "no review-of-review by default" rule (§ 3.X): both
    cmdReview and cmdAdversarialReview select the latest completed
    NON-review turn (prompt.summary does NOT start with `[review] ` or
    `[adversarial-review] `). Verify the selection function.

### D. Test adequacy

Run yourself, with HEAD checked out:

  npm ci
  npm run lint
  npm run typecheck
  npm run format
  npm test
  npm run test:attach

Expected counts (from 2-implement.md T12b acceptance):
  test:mock     68/68
  test:runtime  172/172
  test:driver   178/178
  test:plugin   601/601
  total         1019/1019
  test:attach   28/28

If counts differ, that's a finding. If anything fails on your machine,
that's a finding — but note local-env-specific gotchas (node version,
node-pty rebuild) before scoring.

Check coverage gaps:
  - T1 review prompt templates: 24 tests. Plan target was +10; +24 was
    over-coverage justified by Subagent C. Is each test asserting a
    distinct contract?
  - T2 review parser: 17+ tests across 7 explicit cases. Are all 7
    explicit cases from 1-plan.md § T2 represented?
  - T4 review status-eligibility table: are all 11 rows in 1-plan.md
    § 3.6 covered (awaiting_followup, completed-with-live, completed-
    no-session, running, needs_input, queued, starting, failed-with-
    result, failed-no-result, stopped-with-result, orphaned-with-
    result)?
  - T6 adversarial-review reconcile-loop timeout: 30-minute default
    + env var override (DD-1). Are the timeout-path tests covering:
    valid number, NaN, negative; driver.stop called with the
    session handle (shortId, sessionName, cwd, startedAt); review job
    marked failed; original target job UNCHANGED; exit message?
  - T12a regression tests (3 in send.test.mjs):
    - process.env fallback for CC_PLUGIN_CODEX_ATTACH_WARMUP_MS
    - process.env fallback for CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS
    - attach.ts source uses bracketed-paste wrap
    Are these locking the right invariants?
  - T12b regression tests (9 in review-result-source.test.mjs +
    dispatcher.test.mjs):
    - 6 helper unit tests (T12b-S1..S6): file/fallback/empty/whitespace/
      missing-path priorities
    - 3 dispatcher integration tests (T12b-D1..D3): human output, --json
      output, turn.result.finalMessagePath populated
    Do these tests genuinely guard against regression of the "parse the
    wrong source" bug?

### E. Cost-claim discipline (continuing Plan 0001 OQ4)

Grep the entire diff range (everything since Plan 0002's tag) for the
forbidden tokens and patterns. Plan 0001 OQ4 listed:

  saves money | cheaper than | reduces cost | preserves prompt-cache
  savings | avoids the | more efficient than
  /\d+%\s*(faster|cheaper|less)/i
  /\d+x\s*(faster|cheaper)/i
  /save[sd]?\s+\d+/i

Cost paragraph in packages/plugin-codex/README.md MUST be byte-identical
to Plan 0001's wording. T13-21 from Plan 0002 enforces this; verify the
test still exists AND still passes.

Plan 0003 1-plan.md § R9 calls out the `claude ultrareview` overlap risk.
Verify the README documents the distinction without leaking forbidden
cost-claim tokens. The adversarial-review README section must use
NEUTRAL framing (1-plan.md T10 acceptance: "the adversarial-review
README section contains no OQ4 forbidden tokens and uses neutral cost
framing").

### F. T12a fix correctness — extra scrutiny

T12a is Plan 0002 driver-side remediation that T12 exposed against
Claude Code 2.1.150. The fixes shipped in the T12 commit per the
brief's "if T12 exposes a bug" process.

  - attach.ts env-var fallback: opts.env ?? process.env for the warmup
    knob AND the new prompt-register-timeout knob. Verify the fall-back
    actually reaches process.env when the dispatcher constructs the
    driver without an env option.
  - ATTACH_WARMUP_DEFAULT_MS bumped 2_000 → 8_000ms. Is 8000ms
    documented in the source comment? Is the env-var override
    discoverable from the README?
  - Bracketed-paste wrap: `term.write('\x1b[200~' + input.text +
    '\x1b[201~\r')`. Both prompt-write AND permission-answer-write
    sites should use the wrap. The source-level regression test in
    send.test.mjs asserts the wrap is present and that bare CR/CRLF
    prompt writes are NOT.
  - Mock-claude byte handler: strips ESC[200~ and ESC[201~ from
    accumulated buffer before submit; skips empty submits (CRLF
    in icrnl mode would otherwise fire a stray second submit). Is the
    strip regex correct (matches ESC + [200~)?
  - The post-T12 follow-up commit b83cfcc was a prettier-write of
    send.test.mjs; verify it's a clean format-only change.

### G. T12b fix correctness — extra scrutiny

T12b fixed the user-facing correctness gap T12 surfaced: `$claude-review`
was parsing `sendResult.finalMessage` (a sidecar summary on Claude
2.1.150) instead of the reconciled result file's full text.

  - Helper extracted to packages/plugin-codex/scripts/lib/review-result-source.mjs
    as `readTurnFinalMessageOrFallback(turn, fallback)`. Verify the
    priority is exactly:
      1. turn.result.finalMessagePath file content (full text)
      2. fallback string (sendResult.finalMessage)
      3. ''
    And that finalMessagePreview is NEVER consulted (it's truncated).
  - cmdReview calls the helper AFTER an extra reconcileJob, with a
    brief deterministic wait (default 8_000ms via
    CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS test seam). Is the test
    seam wired in runDispatcher (or wherever the test harness lives)?
  - Mock-claude `sidecarSummaryOnSubmit` config option: when set, writes
    the literal value to sidecar.output.result AND appends an assistant
    message line to the session transcript so the reconciler's
    transcript-events path finds the full text. Verify:
    - Existing T4 tests (no sidecarSummaryOnSubmit) still pass — the
      mock's default behavior must be byte-identical to pre-T12b.
    - Mock creates the transcript's parent directory on demand
      (synthetic tests pre-write only state.json without the projects
      subdir).
  - T12b integration tests T12b-D1..D3 actually exercise the production-
    style split (sidecar summary ≠ transcript-derived result.md).
  - cmdAdversarialReview was NOT changed by T12b. Verify that's
    correct — adversarial review already reads from the reconciled
    result file via the cmdResult-style path; same bug shouldn't apply.
  - The 8-second wait is documented as a known limitation in
    2-implement.md "Honest limitation" section. Is the limitation
    fairly characterized? Is the test seam usable by future operators?

### H. Live E2E artifact integrity

  - Header fields all present and accurate.
  - Versions (Codex 0.136.0, Claude Code 2.1.150) match what the plan's
    OQ-H feature-probe baseline requires.
  - Sensitive data redacted (email, orgId, orgName). Grep yourself.
  - No unrelated user repo paths (DoubleBlack, InstantLink, etc.).
  - Original delegate + same-session review + adversarial review +
    status + result + stop visible.
  - The artifact PROVES T12a + T12b bugs were real and fixed:
    - T12a "BUG OBSERVED" section shows the warmup/bracketed-paste
      failure mode with probe evidence.
    - T12b retry section shows the original-T12 sidecar-summary-fallback
      output AND the post-T12b correctly-parsed verdict.
  - Skill-path-vs-direct-dispatcher disclosure: Codex CLI is a TUI and
    cannot be driven non-interactively; the artifact uses the direct
    dispatcher path. Is this disclosed honestly in the header? Is the
    skill discovery still unit-tested separately (skills-manifest.test.mjs)?

### I. Process / reviewer-contract findings

Three relevant process issues worth calling out:

  1. Plan 0002 audit identified F-H1 (Subagent C contract violations)
     and F-H2 (review missed adapter-wiring gap). Plan 0003 incorporated
     both into the binding inputs of 1-plan.md (lines 36-39). Was
     this followed for every T-task's Subagent C brief in
     2-implement.md? Spot-check at least 3 C briefs.

  2. The T12 / T12a / T12b sequence is a single commit per remediation
     (a6a8a84 / ed53079) plus prettier-only follow-ups (b83cfcc /
     b6675bc). Is the "fix as T12a/T12b in the SAME commit per the
     brief's process" justified — or should T12a and T12b have been
     SEPARATE commits with clearer scope?

  3. T12a and T12b are Plan 0002-shape bugs (driver-side, dispatcher-
     side) that Plan 0003 T12 surfaced. Was it the right call to fix
     them under Plan 0003's banner rather than file follow-ups against
     Plan 0002.5? Brief made this call explicitly; verify the rationale
     in 2-implement.md is honest.

Both belong in 3-audit.md as process findings (not code findings) —
recommend reviewer-contract tightenings for future plans if they
surface.

## Audit output: 3-audit.md

Structure:

  # Plan 0003 Stage 3 — Audit
  **Audited commit**: 5da071e
  **Audited on**: <today>
  **Auditor**: <model name>

  ## Verdict

  One of:
    - ready-for-polish (no medium-or-higher findings; nits OK)
    - needs-polish-pass (medium findings to address in Stage 4)
    - needs-implementation-rework (critical/high findings; Stage 4
      can't reasonably handle these)

  ## Sections A through I

  Per-section findings with severity + evidence (file:line).

  ## Summary table

  | ID | Severity | Area | Finding | Suggested disposition |
  | F1 | medium   | A    | ...     | Stage 4: fix wording in ... |

  ## Out-of-scope (deferred)

  Anything you noticed that's NOT in 1-plan.md's scope but should be
  filed against a future plan. Use this for "this isn't a Plan 0003
  bug but it should not be lost." Strong candidates include:

  - The 8-second deterministic wait in cmdReview (replaceable with a
    watch-events-jsonl loop in a future plan).
  - The driver-side timing race that puts sidecar.output.result in a
    state where it doesn't match the latest assistant message (Plan
    0002 driver-vs-reconciler split).

## Hard constraints

Do NOT:
  - Edit any file other than 3-audit.md.
  - Edit 1-plan.md, 2-implement.md, or the live E2E artifact.
  - Run any code-mutating git command (checkout/restore/stash/reset/clean).
  - Run `npm install` to upgrade dependencies — only `npm ci` if you need
    a clean install for the test run.
  - Start Stage 4 (polish) or Stage 5 (report).
  - Re-run the live E2E. The artifact at HEAD is the audit material.

Do:
  - Run all gates (lint/typecheck/format/test/test:attach) at HEAD.
  - Verify every "fixed in this commit" claim in 2-implement.md against
    the code at HEAD.
  - Cite file:line for every finding.
  - Be ruthless on correctness; be lenient on prose style.
  - When you're done, commit 3-audit.md with message:
      "Plan 0003 Stage 3: audit findings"
    Push. Don't watch CI (docs-only commit).

## When you finish

Pause for the maintainer to read 3-audit.md and decide whether to
proceed to Stage 4 (polish) or push back. Do not start Stage 4 in this
session.
