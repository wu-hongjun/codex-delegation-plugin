# Stage 1 — Plan: Review skills for Claude background jobs

> **Status**: drafting
> **Author**: Claude (assistant)
> **Date drafted**: 2026-06-01

---

## 1. Context & references

This plan operationalizes the research at [`documentation/research/20260601-plan-0003-research/report.md`](../../research/20260601-plan-0003-research/report.md) (committed at `7e74ee4`). It builds directly on Plan 0002 (complete 2026-06-01 at `4e208a3`).

**Read the research report before reading the rest of this plan.** Everything below assumes its findings, particularly:

- A review is a follow-up turn, not a separate job. The architecture already supports multi-turn conversations via `driver.send()` and the `$claude-followup` skill (Plan 0002). A review is semantically a follow-up whose prompt is a structured review instruction rather than an open-ended task. `$claude-review` reuses the Plan 0002 PTY-attach machinery; `$claude-adversarial-review` reuses the Plan 0001 `driver.startSession()` machinery.
- Claude Code 2.1.149 ships `claude ultrareview` as a built-in cloud-hosted review. Plan 0003 does NOT wrap `ultrareview`. The plugin's review skills operate within the local delegation model.
- Same-session review carries an inherent sycophancy risk. The adversarial variant exists to address this by running a structurally independent evaluation in a fresh session.
- The output surface needs structure. Severity-rated findings with a verdict are the minimum for downstream consumers (Plan 0005 stop-time gate, `--json` consumers).
- The `--agents` flag on `claude --help` is noted as a future research vector. Not adopted in Plan 0003.

Plan 0001 and Plan 0002's locked constraints remain in force for everything not explicitly opened by this plan:

- No `claude -p`. Not even for reviews. Not even for "quick" passes.
- No `--dangerously-skip-permissions`.
- `--allow-edit` is policy/UX only. Reviews are read-only by intent; the default for review skills is `false` (reviews do not accept `--allow-edit`).
- `--permission-mode` only forwarded when the user supplies it, and only on `$claude-adversarial-review` (which is a fresh session). Not accepted on `$claude-review` (same-session; inherited).
- Privacy ack interactive by default; `--yes` is the only explicit bypass.
- `packages/runtime/src/**` imports nothing from `packages/driver-claude-code/**` and nothing from `node-pty`.
- `packages/plugin-codex/scripts/**` imports nothing from `node-pty`.
- No real Claude/Codex calls in automated tests. Real `~/.claude` and `~/.codex` not modified by tests.
- CI stays `permissions: contents: read` only. No secrets, no real Claude/Codex install in CI.
- Plan 0001's OQ4 cost-claim discipline continues to apply verbatim. Forbidden tokens: `saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the`, `more efficient than`. Forbidden regexes: `/\d+%\s*(faster|cheaper|less)/i`, `/\d+x\s*(faster|cheaper)/i`, `/save[sd]?\s+\d+/i`.
- The `packages/plugin-codex/README.md` cost paragraph (lines 219-221) is unchanged.

Plan 0002 Stage 5 lessons learned (F-H1, F-H2) are binding inputs to this plan. Every code-reviewer subagent brief in Stage 2 must:

- Enumerate forbidden git/filesystem mutators: no `git checkout`, `git restore`, `git stash`, `git reset`, `git clean`, `git rebase`, `git push --force`, `--no-verify`. No file deletes, renames, or edits to source files outside the current diff. Read-only inspection only.
- Include a "trace each optional capability from factory to consumer" verification step so that optional interface methods are confirmed wired at every instantiation site.

---

## 2. Scope of Plan 0003

### In scope

A complete vertical slice that lets a Codex user, from inside an active Codex session in a real repo, request a structured review of a delegated Claude job's output and receive severity-rated findings:

1. New skill `$claude-review <jobId>` — same-session structured review via `driver.send()`, reusing Plan 0002's PTY-attach machinery. Produces severity-rated findings and a verdict.
2. New skill `$claude-adversarial-review <jobId>` — fresh-session independent review via `driver.startSession()`, reusing Plan 0001's delegation machinery. Produces severity-rated findings and a verdict.
3. New dispatcher subcommands `review` and `adversarial-review`.
4. New helper module `packages/plugin-codex/scripts/lib/review-prompts.mjs` containing review prompt templates as string constants.
5. Shared execution helper extracted from `cmdFollowup` into a reusable `sendFollowupTurn(jobId, prompt, opts)` function that both `cmdFollowup` and `cmdReview` call.
6. `reviewOf?: { jobId: string; turnIndex?: number }` optional backwards-compatible field on `JobRecord`. No schema bump to v3.
7. Structured output parsing with graceful fallback (best-effort; raw text wrapped as a single `nit`-severity finding on parse failure).
8. Review turns distinguished in `turns[]` by `prompt.summary` prefix convention (`[review] ` or `[adversarial-review] `). No new `type` field on `TurnRecord`.
9. `$claude-status` annotations for review jobs and review turns.
10. Mock-claude updates: review-response fixtures, structured-output test scenarios.
11. Tests across all four lanes (mock / runtime / driver / plugin) plus skill-manifest tests for both new skills.
12. Live E2E: delegate a task, wait for completion, run both `$claude-review` and `$claude-adversarial-review`, capture and compare the findings.

### Out of scope (deferred to later plans)

- Benchmark harness + cost-claim copy update (Plan 0004).
- Stop-time review gate via hooks (Plan 0005).
- Marketplace packaging + distribution polish (Plan 0006).
- Review-of-review recursion (no hard prevention in Plan 0003; documented in SKILL.md as allowed-but-not-recommended).
- Multi-reviewer chains (two parallel reviews compared; critic + defender chain).
- `--severity-threshold` flag (only show findings above a severity).
- `--focus` flag (focus the review on security, performance, correctness, etc.).
- `--diff` flag (compute and inject a git diff of touched files).
- `--turn N` flag on `$claude-review` (always reviews the latest completed turn).
- `watch()` AsyncIterable streaming (deferred per Plan 0002 OQ-F).
- Windows support (CI matrix stays `ubuntu-latest + macos-latest x Node 20 + 22`).
- Structured-output JSON-schema validation library dependency (prompt-engineering + best-effort parsing only).
- `claude --agents` custom-agent definition surface (undocumented beyond help string).
- `claude ultrareview` wrapping (cloud-hosted; out of the plugin's control).

### Why this scope

It is the smallest end-to-end demonstration that both review variants work. Every load-bearing piece (prompt templates, dispatcher subcommands, shared execution helper, `reviewOf` field, structured output parsing, skill manifests, mock updates, tests) gets one real implementation. The expensive next questions (review gates, benchmarks, specialized review modes, multi-reviewer chains) are postponed until the foundation is real enough to test against.

---

## 3. Approach

### 3.1 User-facing surface

Two new skills, each backed by a dispatcher subcommand:

| Dimension | `$claude-review` | `$claude-adversarial-review` |
| --- | --- | --- |
| Intent | Structured evaluation within the existing conversation | Structurally independent evaluation in a fresh session |
| Execution model | Same-session via `driver.send()` (Plan 0002 PTY-attach) | Fresh-session via `driver.startSession()` (Plan 0001 delegation) |
| Sycophancy posture | Inherent risk; documented caveat in output | Mitigated by context isolation |
| Session requirement | `awaiting_followup` or live idle session | Any terminal status with `result` (including `stopped`, `failed`, `orphaned`) |
| `--model` | Rejected (same-session; inherited) | Accepted (fresh session) |
| `--effort` | Rejected (same-session; inherited) | Accepted (fresh session) |
| `--permission-mode` | Rejected (same-session; inherited) | Accepted (optional override for fresh session) |
| `--allow-edit` | Rejected ("Reviews are read-only.") | Rejected ("Reviews are read-only.") |
| `--all` | Accepted (cross-workspace job lookup) | Accepted (cross-workspace job lookup) |
| `--json` | Accepted (machine-readable structured findings) | Accepted (machine-readable structured findings) |
| `--yes` | Accepted (privacy ack bypass) | Accepted (privacy ack bypass) |
| Session naming | N/A (reuses existing session) | Auto: `codex:<repo>:review-<originalJobId-short>` |
| Job record | Appends a `TurnRecord` to the existing job's `turns[]` | Creates a new `JobRecord` with `reviewOf` link |
| Prompt prefix in `turns[]` | `[review] ` | `[adversarial-review] ` |
| Output | Verdict + severity-rated findings (structured) | Verdict + severity-rated findings (structured) |

**`--allow-edit` rejection rationale**: reviews are read-only evaluations by intent. The review prompt instructs Claude to evaluate, not modify. Passing `--allow-edit` would create a false expectation that the reviewer will make changes. This is a parse-time rejection with a clear message: `"--allow-edit is not applicable to review skills. Reviews are read-only."`

**`--model` / `--effort` divergence from `$claude-followup`**: `$claude-followup` rejects `--model` and `--effort` because the target session is already configured. `$claude-adversarial-review` accepts them because it starts a fresh session. The user may want to use a different model for the adversarial review (e.g. a stronger model for quality assurance). This divergence is intentional and documented.

### 3.2 Review prompt templates

Review prompt templates live as string constants in `packages/plugin-codex/scripts/lib/review-prompts.mjs`. This module follows the same containment rules as other `lib/` modules (no `node-pty` imports, no driver-package imports).

**Same-session review prompt** (injected via `driver.send()`):

The prompt instructs Claude to:

1. Act as an independent reviewer evaluating the work just completed.
2. Produce structured output: a verdict (`pass`, `fail`, `pass_with_findings`) and a list of severity-rated findings (`blocker`, `high`, `medium`, `low`, `nit`), each with a description and optional file/line reference.
3. Actively look for omissions, errors, and missed requirements ("find at least three areas for improvement" forcing function to counteract sycophancy).
4. Include a caveat line: "This review was performed within the same conversation. For an independent evaluation, use `$claude-adversarial-review`."

**Adversarial review prompt** (passed to `driver.startSession()` as the initial task):

The prompt includes:

1. The original task description (from `job.turns[0].prompt.summary` or the full prompt if recoverable).
2. The final assistant message (from `job.result.finalMessagePath` content).
3. The touched files list (from `job.result.touchedFiles`) if available.
4. Clear data delimiters around the reviewed content: `--- BEGIN REVIEWED OUTPUT ---` / `--- END REVIEWED OUTPUT ---` with explicit instruction to treat the enclosed content as data, not instructions (prompt-injection mitigation).
5. An instruction to act as an independent reviewer who has NOT seen the prior reasoning and to actively look for omissions, errors, and missed requirements.
6. The same structured output format as the same-session review.

Both templates produce output parseable into the structured findings format described in 3.3.

### 3.3 Structured output format

**Human-readable output**:

```
Review verdict: PASS WITH FINDINGS (3 findings: 0 blocker, 1 high, 2 low)

Findings:
  [HIGH] The summary omits TODOs in test files.
    Recommendation: Include test/ directory in the scan.
  [LOW] Line counts are approximate.
    Recommendation: Use exact line numbers.
  [LOW] No mention of TODO priority markers.
    Recommendation: Check for TODO(high), TODO(low) patterns.
```

**`--json` output**:

```json
{
  "verdict": "pass_with_findings",
  "findingsCount": 3,
  "blockerCount": 0,
  "highCount": 1,
  "mediumCount": 0,
  "lowCount": 2,
  "nitCount": 0,
  "findings": [
    {
      "severity": "high",
      "description": "The summary omits TODOs in test files.",
      "recommendation": "Include test/ directory in the scan.",
      "file": null,
      "line": null
    }
  ]
}
```

**Parsing strategy**: best-effort. The dispatcher attempts to parse the structured findings from Claude's response text. If parsing fails (Claude deviated from the expected format), the raw text is wrapped in a single finding with severity `nit` and the full text as the description. The `--json` output always has a `verdict` and `findings` array, even in the fallback case. The fallback verdict is `pass_with_findings`.

### 3.4 Execution model

**Same-session review (`$claude-review`)**:

1. Resolve job by ID prefix (same as `$claude-followup`).
2. Status eligibility check: `awaiting_followup`, `needs_input`, or `completed`-with-live-idle-session (same as `$claude-followup`).
3. Privacy ack against target job's workspace (same as `$claude-followup`).
4. Construct the review prompt from the same-session template.
5. Call the shared `sendFollowupTurn()` helper (extracted from `cmdFollowup`), which calls `driver.send()`.
6. Parse structured findings from the response.
7. Update the job's `turns[]` with the review turn (prompt summary prefixed `[review] `).
8. Format and print the findings.

**Adversarial review (`$claude-adversarial-review`)**:

1. Resolve job by ID prefix.
2. Status eligibility check: any status with `job.result` present (`awaiting_followup`, `completed`, `stopped`, `failed`, `orphaned` — all with result). `running`, `queued`, `starting` rejected. `needs_input` rejected (ambiguous state for review). Statuses without result rejected.
3. Privacy ack against target job's workspace. The fresh session operates in the same workspace; no new ack needed beyond the existing workspace-scoped ack.
4. Read the target job's result (from `job.result.finalMessagePath` on disk).
5. Read the target job's original prompt (from `job.turns[0].prompt.summary`).
6. Read the target job's touched files (from `job.result.touchedFiles`).
7. Construct the adversarial review prompt from the template with the injected context.
8. Call `driver.startSession()` with the constructed prompt (mirroring `cmdDelegate`).
9. Create a new `JobRecord` with `reviewOf: { jobId: targetJobId }`.
10. Reconcile in a loop until the review session completes (mirroring `cmdDelegate`'s post-start reconcile, but blocking until terminal status).
11. Parse structured findings from the review job's result.
12. Format and print the findings.

**Ack model clarification**: `$claude-review` (same-session) does not require a new ack because the original delegation already obtained one. `$claude-adversarial-review` operates in the same workspace as the original job; the existing workspace-scoped ack covers it. If the user runs `$claude-adversarial-review --all <jobId>` resolving to a different workspace, the ack check is against the target job's workspace (same precedent as `$claude-followup --all`).

### 3.5 Schema additions

One optional field added to `JobRecord`:

```ts
interface JobRecord {
  // ... all existing fields ...
  /** Optional link to the job this review evaluates. Present only on adversarial-review jobs. */
  reviewOf?: {
    jobId: string;
    turnIndex?: number; // which turn was reviewed (default: latest completed)
  };
}
```

This is backwards-compatible. `schemaVersion` stays at `2`. Existing v2 readers ignore `reviewOf` if they do not know about it. The field is set at job-creation time by `cmdAdversarialReview`. `$claude-status` uses it to display a `(review of <parentJobId>)` annotation.

Same-session review turns are distinguished by the `prompt.summary` prefix `[review] `. No `type` field is added to `TurnRecord`. No schema change is needed.

### 3.6 Status eligibility table

| Job status | `$claude-review` | `$claude-adversarial-review` |
| --- | --- | --- |
| `awaiting_followup` | allowed | allowed |
| `completed` (live idle session) | allowed | allowed |
| `completed` (no session) | rejected | allowed (if result exists) |
| `running` | rejected | rejected |
| `needs_input` | rejected | rejected |
| `queued` | rejected | rejected |
| `starting` | rejected | rejected |
| `failed` (with result) | rejected | allowed |
| `failed` (no result) | rejected | rejected |
| `stopped` (with result) | rejected | allowed |
| `orphaned` (with result) | rejected | allowed |

### 3.7 Review of errored/stopped/orphaned jobs

`$claude-adversarial-review` is the only review variant that works on non-live jobs, because it starts a fresh session that does not require the original session to be alive. It requires only that `job.result` exists (the reviewer needs something to evaluate). If no result exists, exit with: `"No reviewable output. The job <status> before producing a result."`

`$claude-review` requires the same eligibility as `$claude-followup` because it uses the same execution path (same-session `driver.send()`).

---

## 4. Tasks (with acceptance criteria)

In order. Each task has acceptance criteria. A task is not complete until its acceptance criterion is demonstrable in commit/PR review.

### T1. Review prompt templates

- [ ] New module `packages/plugin-codex/scripts/lib/review-prompts.mjs` exporting `SAME_SESSION_REVIEW_PROMPT(context)` and `ADVERSARIAL_REVIEW_PROMPT(context)` template functions.
- [ ] Same-session template includes: reviewer instructions, structured output format specification with examples, sycophancy-counteracting forcing function, same-session caveat line.
- [ ] Adversarial template includes: data delimiters (`--- BEGIN REVIEWED OUTPUT ---` / `--- END REVIEWED OUTPUT ---`), original task description injection, final message injection, touched-files injection (if available), structured output format specification.
- [ ] Both templates produce output parseable by the structured-findings parser (T3).
- [ ] Module imports nothing from `node-pty`, nothing from `packages/driver-claude-code/`, nothing from `packages/runtime/`. Pure string construction.
- [ ] Unit tests validate template output shape: delimiters present, format specification present, forced-finding instruction present.
- **Files touched**: `packages/plugin-codex/scripts/lib/review-prompts.mjs` (new), `packages/plugin-codex/test/review-prompts.test.mjs` (new).
- **Test count delta**: +10.
- **Acceptance**: `node --test packages/plugin-codex/test/review-prompts.test.mjs` passes; templates produce well-formed prompt strings with all required sections; adversarial template correctly delimits injected content; same-session template includes the sycophancy caveat.

### T2. Structured output parser

- [ ] New module `packages/plugin-codex/scripts/lib/review-parser.mjs` exporting `parseReviewOutput(text)` returning `{ verdict, findings[] }`.
- [ ] Severity levels: `blocker`, `high`, `medium`, `low`, `nit`.
- [ ] Verdicts: `pass`, `fail`, `pass_with_findings`.
- [ ] Graceful fallback: if the text does not match the expected format, return `{ verdict: 'pass_with_findings', findings: [{ severity: 'nit', description: <raw text>, recommendation: null, file: null, line: null }] }`.
- [ ] Module imports nothing from `node-pty`, nothing from driver or runtime packages.
- [ ] Unit tests cover: well-formed input, malformed input (fallback), empty input, mixed severities, findings with and without file/line references.
- **Files touched**: `packages/plugin-codex/scripts/lib/review-parser.mjs` (new), `packages/plugin-codex/test/review-parser.test.mjs` (new).
- **Test count delta**: +15.
- **Acceptance**: `node --test packages/plugin-codex/test/review-parser.test.mjs` passes; well-formed review text parses into correct verdict + findings array; garbage text triggers the graceful fallback with a single `nit` finding containing the raw text.

### T3. Shared `sendFollowupTurn` helper extraction

- [ ] Refactor `cmdFollowup` in `packages/plugin-codex/scripts/claude-companion.mjs` to extract the shared send-and-record flow (steps 9-14 of the current `cmdFollowup`) into a reusable helper function `sendFollowupTurn({ jobId, prompt, flags, driver, adapter, json, promptSummaryPrefix })`.
- [ ] `cmdFollowup` calls `sendFollowupTurn` with no `promptSummaryPrefix` (backwards-compatible).
- [ ] The helper accepts an optional `promptSummaryPrefix` parameter used to prefix the `prompt.summary` for review turns (`[review] ` or `[adversarial-review] `).
- [ ] All existing `cmdFollowup` tests continue to pass unchanged (no behavioral regression).
- **Files touched**: `packages/plugin-codex/scripts/claude-companion.mjs` (refactor).
- **Test count delta**: 0 (existing tests cover the extracted path).
- **Acceptance**: all existing dispatcher tests pass; `cmdFollowup` behavior is byte-identical to pre-refactor; the extracted helper is callable with `promptSummaryPrefix` parameter.

### T4. Dispatcher: `review` subcommand

- [ ] New `cmdReview` function in `packages/plugin-codex/scripts/claude-companion.mjs`.
- [ ] Arg parser accepts: `--all`, `--json`, `--yes` only.
- [ ] Arg parser rejects `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`, `--allow-edit` at parse time with clear error messages. `--allow-edit` rejection message: `"--allow-edit is not applicable to review skills. Reviews are read-only."`
- [ ] Status eligibility per section 3.6 (same as `$claude-followup`).
- [ ] Constructs review prompt from the same-session template (T1).
- [ ] Calls `sendFollowupTurn()` with `promptSummaryPrefix: '[review] '`.
- [ ] Parses structured findings from the result via the parser (T2).
- [ ] Formats human-readable and `--json` output via new format functions.
- [ ] Dispatched from the main `switch` block as `case 'review':`.
- **Files touched**: `packages/plugin-codex/scripts/claude-companion.mjs`, `packages/plugin-codex/scripts/lib/format.mjs` (new format functions).
- **Test count delta**: +25.
- **Acceptance**: dispatcher tests cover: all accepted flags, all rejected flags (with exact error messages), status eligibility checks, successful review with mock-claude returning structured output, fallback parsing on malformed mock output, `--json` output shape validation.

### T5. Dispatcher: `adversarial-review` subcommand

- [ ] New `cmdAdversarialReview` function in `packages/plugin-codex/scripts/claude-companion.mjs`.
- [ ] Arg parser accepts: `--all`, `--json`, `--yes`, `--model`, `--effort`, `--permission-mode` only.
- [ ] Arg parser rejects `--add-dir`, `--mcp-config`, `--name`, `--allow-edit` at parse time. `--allow-edit` rejection message same as T4.
- [ ] Status eligibility per section 3.6 (any terminal status with result present).
- [ ] Reads target job's result from disk (`job.result.finalMessagePath`).
- [ ] Reads target job's original prompt from `job.turns[0].prompt.summary`.
- [ ] Reads target job's touched files from `job.result.touchedFiles`.
- [ ] Constructs adversarial review prompt from the template (T1) with injected context.
- [ ] Calls `driver.startSession()` with: constructed prompt, `cwd` = target job's workspace root, session name = `codex:<repo>:review-<originalJobId-short>`, optional `--model` and `--effort` forwarding.
- [ ] Creates new `JobRecord` with `reviewOf: { jobId: targetJobId }` via `createJob()`.
- [ ] Polls for completion via reconcile loop (reusing the `cmdDelegate` post-start reconcile pattern, but blocking until terminal status).
- [ ] Parses structured findings from the review job's result.
- [ ] Formats human-readable and `--json` output.
- [ ] Dispatched from the main `switch` block as `case 'adversarial-review':`.
- **Files touched**: `packages/plugin-codex/scripts/claude-companion.mjs`, `packages/plugin-codex/scripts/lib/format.mjs`.
- **Test count delta**: +30.
- **Acceptance**: dispatcher tests cover: all accepted flags (including `--model` and `--effort` forwarding), all rejected flags, status eligibility (including stopped/failed/orphaned with result, and rejected without result), successful adversarial review with mock-claude, `reviewOf` field correctly set on the created job, session naming convention, `--json` output shape, fallback parsing.

### T6. Runtime: `reviewOf` field on `JobRecord`

- [ ] Add optional `reviewOf?: { jobId: string; turnIndex?: number }` to `JobRecord` in `packages/runtime/src/types.ts`.
- [ ] Add `reviewOf` to `CreateJobInput` as optional.
- [ ] `createJob()` passes through `reviewOf` if present.
- [ ] `schemaVersion` stays at `2`. No migration needed (field is optional; absent on existing records).
- [ ] Reconciler does not read or write `reviewOf` (it is a metadata field, not a status-relevant field).
- [ ] Existing tests continue to pass (field is optional; no behavioral change to existing paths).
- **Files touched**: `packages/runtime/src/types.ts`, `packages/runtime/src/job-store.ts`.
- **Test count delta**: +5 (round-trip test for `reviewOf` field; `createJob` with `reviewOf`; `readJob` without `reviewOf` returns undefined; v2 record with `reviewOf` reads cleanly; v1 migration does not produce `reviewOf`).
- **Acceptance**: `node --test packages/runtime/test/job-store.test.mjs` passes; a job created with `reviewOf` round-trips correctly; a job created without `reviewOf` reads back with `reviewOf === undefined`; the existing v1-migration test is unaffected.

### T7. `$claude-status` review annotations

- [ ] `formatStatus()` in `packages/plugin-codex/scripts/lib/format.mjs` annotates jobs that have `reviewOf` with `(review of <reviewOf.jobId>)` in the status display.
- [ ] Same-session review turns (detected by `prompt.summary` starting with `[review] `) are annotated in the per-job turn listing when `--json` is used.
- [ ] Adversarial-review turns (detected by `prompt.summary` starting with `[adversarial-review] `) annotated similarly.
- **Files touched**: `packages/plugin-codex/scripts/lib/format.mjs`.
- **Test count delta**: +8.
- **Acceptance**: format tests verify: job with `reviewOf` shows the annotation; job without `reviewOf` does not; `--json` output includes `reviewOf` when present; review-prefixed turns are annotated in turn-level output.

### T8. Skills + manifest

- [ ] New `packages/plugin-codex/skills/claude-review/SKILL.md` mirroring `claude-followup` shape. Body calls `node <plugin-root>/scripts/claude-companion.mjs review <jobId> [flags]`. Does NOT inject `--yes`. Includes one-line API usage notice: "This skill sends an additional prompt to Claude Code, which incurs API usage."
- [ ] New `packages/plugin-codex/skills/claude-adversarial-review/SKILL.md` mirroring `claude-delegate` shape. Body calls `node <plugin-root>/scripts/claude-companion.mjs adversarial-review <jobId> [flags] -- ""` (empty positional prompt; the dispatcher constructs the prompt from the template). Includes one-line API usage notice.
- [ ] Both frontmatter pass `strictParseFrontmatter` (Plan 0001 Stage 4 5be9b9d test) -- no unquoted `: ` or `#` in scalar values.
- [ ] Neither skill body injects `--yes`.
- [ ] Update `.codex-plugin/plugin.json` `defaultPrompt` with review-flavored sentences.
- [ ] Extend `packages/plugin-codex/test/skills-manifest.test.mjs` to cover both new skills identically to the existing six (frontmatter strict-parse, dispatcher path resolution, no forbidden tokens, no hooks.json, no out-of-scope skills, default-prompt sentences present).
- **Files touched**: `packages/plugin-codex/skills/claude-review/SKILL.md` (new), `packages/plugin-codex/skills/claude-adversarial-review/SKILL.md` (new), `packages/plugin-codex/.codex-plugin/plugin.json`, `packages/plugin-codex/test/skills-manifest.test.mjs`.
- **Test count delta**: +12.
- **Acceptance**: all skill-manifest tests pass for both new skills; frontmatter strict-parse clean; no forbidden tokens; `plugin.json` `defaultPrompt` includes review-related sentences.

### T9. Mock-claude updates

- [ ] Add review-response fixtures to `tools/mock-claude/fixtures/`: one well-formed structured review output, one malformed review output (triggers fallback parser), one adversarial review output.
- [ ] Mock's `--bg` subcommand supports a fixture flag for returning structured review output as the final message.
- [ ] Mock's `attach` subcommand supports returning structured review output when the injected prompt matches a review-prompt pattern.
- [ ] Sidecar emulation updated: review-job sidecar `output.result` contains structured review text.
- **Files touched**: `tools/mock-claude/` (fixtures + mock-claude script updates).
- **Test count delta**: +8.
- **Acceptance**: mock-driven tests can exercise both `cmdReview` and `cmdAdversarialReview` paths end-to-end with mock responses that trigger both the structured-parse and fallback-parse code paths.

### T10. Plugin README updates

- [ ] Add a "Review skills" section to `packages/plugin-codex/README.md` documenting `$claude-review` and `$claude-adversarial-review` syntax, the same-session vs. fresh-session distinction, sycophancy caveat, structured output format, status eligibility.
- [ ] Add troubleshooting entries: review of a job with no result (error message); review of a running job (error message); same-session review after session TTL expiry (suggestion to use adversarial review instead).
- [ ] Update the "Known limitations" list: add sycophancy risk for same-session review, structured output parsing best-effort nature, no review-of-review prevention.
- [ ] Cost paragraph unchanged (byte-identical).
- [ ] Extend `packages/plugin-codex/test/readme.test.mjs` to cover the new sections (no forbidden-token regressions; new section markers present).
- **Files touched**: `packages/plugin-codex/README.md`, `packages/plugin-codex/test/readme.test.mjs`.
- **Test count delta**: +5.
- **Acceptance**: README test extensions pass; lint/typecheck/format/test all green; cost-claim discipline holds across all surfaces.

### T11. CI verification

- [ ] Verify that the existing CI workflow (`ubuntu-latest + macos-latest x Node 20 + 22`) runs all new tests without changes.
- [ ] No new CI workflow steps needed (review tests are part of the existing `test:plugin` lane; `review-prompts.test.mjs` and `review-parser.test.mjs` are discovered by the existing test glob).
- [ ] No secrets, no real Claude/Codex install.
- **Files touched**: none (or `.github/workflows/ci.yml` if test glob needs updating).
- **Test count delta**: 0.
- **Acceptance**: green CI on `main` after all prior tasks land.

### T12. End-to-end live test

- [ ] In a throwaway temp repo, run the full flow:
  1. `$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."` -- wait for `awaiting_followup`.
  2. `$claude-review <jobId>` -- expect structured findings output with verdict.
  3. `$claude-adversarial-review <jobId>` -- expect a new job created with `reviewOf`, structured findings output.
  4. `$claude-status` -- expect original job with review turn, adversarial review job with `(review of ...)` annotation.
  5. `$claude-result <adversarial-review-jobId>` -- expect the adversarial review's findings.
  6. `$claude-stop <jobId>` -- cleanup.
- [ ] Capture sidecar + `agents --json` snapshots at each transition.
- [ ] Observational comparison: note whether same-session review findings differ from adversarial review findings on the same job (informational for Plan 0004 measurement, not a pass/fail gate).
- [ ] Artifact at `artifacts/e2e-live-<date>.txt`.
- **Files touched**: `documentation/plan/0003-20260601-review-skills/artifacts/e2e-live-<date>.txt` (new).
- **Test count delta**: 0 (live test, not automated).
- **Acceptance**: full flow completes without manual intervention beyond running the skills; both review variants produce parseable structured findings; adversarial review job has `reviewOf` link; no orphan sessions left behind; live versions recorded in artifact header.

---

## 5. Risks

| # | Risk | L | I | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Sycophancy bias in same-session review: Claude systematically underreports issues on its own work within the same context window | H | H | Adversarial variant as primary quality recommendation; forcing-function prompt ("find at least three areas for improvement"); caveat in output; observational comparison in T12 |
| R2 | Prompt injection from reviewed content: the review prompt includes the prior job's output as context, which may contain adversarial instructions | M | H | Clear data delimiters (`--- BEGIN/END REVIEWED OUTPUT ---`); explicit instruction to treat enclosed content as data; deeper sanitization deferred |
| R3 | Structured output parsing failure: Claude deviates from the expected review format | H | M | Best-effort parsing with graceful fallback (raw text wrapped as single `nit` finding); prompt includes format examples; `--json` consumers always get `verdict` + `findings` array |
| R4 | Review of a job with no output: user reviews a job that failed before producing a result | M | M | Status eligibility check rejects jobs without `result`; clear error message naming the job status |
| R5 | Adversarial review session becomes an orphan | M | M | Same orphan management as Plan 0001/0002 (`$claude-stop`, `--all-awaiting-followup`); adversarial review sessions auto-complete after producing findings |
| R6 | `reviewOf` field introduces forward-compat concerns with future schema migrations | L | M | Field is optional and ignored by v2 readers that do not know about it; no schema bump; documented in types.ts |
| R7 | Runaway critic chains: reviewing a review of a review | L | M | No hard prevention in Plan 0003; SKILL.md documents that reviewing a review is allowed but not recommended; future Plan may add depth-tracking |
| R8 | Codex 0.135.0 YAML strictness rejects new SKILL.md frontmatter | M | L | Existing `strictParseFrontmatter` test catches this; frontmatter written to be safe from the start |
| R9 | `claude ultrareview` overlap: users confused about which review tool to use | M | L | README documents the distinction: `$claude-review` is local-session review within the plugin; `ultrareview` is Anthropic's cloud-hosted PR review |
| R10 | `--allow-edit` accidentally passed to a review session | L | M | Parse-time rejection on both `$claude-review` and `$claude-adversarial-review`; clear error message |
| R11 | Same-session review fails because the session's TTL expired | M | L | Clear error message suggesting `$claude-adversarial-review` as alternative; same eligibility check as `$claude-followup` |
| R12 | Fresh-session adversarial review cannot read the original job's result file | L | M | Result file is written by the reconciler to a stable path; read at `cmdAdversarialReview` time; if missing, exit with clear error |
| R13 | Shared `sendFollowupTurn` refactor introduces regression in `$claude-followup` | M | M | All existing `cmdFollowup` tests must pass unchanged after the extraction (T3 acceptance criterion); no new behavior for the followup path |
| R14 | Review prompt template too long for context window when combined with a large reviewed output | L | L | Template is compact; adversarial template injects only the final message (not the full transcript); touched-files list is names only, not file contents |
| R15 | Sidecar schema drift between review-session and original-session sidecar format | L | L | Sidecar reading is best-effort (Plan 0002 precedent); adversarial review uses the same `readSidecar` path as regular delegation |

---

## 6. Open questions — resolved 2026-06-01

All eight research open questions were answered by the maintainer on 2026-06-01. Decisions are recorded below for traceability and govern the implementation.

### OQ-A — Schema discipline for `reviewOf` field -- resolved

**Decision**: `reviewOf?: { jobId: string; turnIndex?: number }` is an OPTIONAL backwards-compatible field on the existing `schemaVersion: 2` `JobRecord`. **No schema bump to v3.**

Adding an optional field to a JSON record is backwards-compatible. The reconciler, job-store, and dispatcher already tolerate unknown fields. v2 readers that do not know about `reviewOf` will simply ignore it.

Reflected in sections 3.5 and T6.

### OQ-B — Review prompt template ownership -- resolved

**Decision**: review prompt templates live as string constants in `packages/plugin-codex/scripts/lib/review-prompts.mjs` (new helper module). Not in SKILL.md body; not in separate template files.

This keeps the templates testable, iterable, and co-located with the dispatcher logic that consumes them. The module follows the same containment rules as other `lib/` modules.

Reflected in sections 3.2 and T1.

### OQ-C — Should `$claude-review` accept a `--turn N` flag? -- resolved

**Decision**: `$claude-review` does NOT accept a `--turn N` flag. Always reviews the latest completed turn. If a user wants to review an earlier turn, they use `$claude-followup` with a manual review prompt.

This keeps the UX simple for Plan 0003. A `--turn` flag is a candidate for a future plan if user demand surfaces.

Reflected in section 2 (out of scope).

### OQ-D — Adversarial review job naming -- resolved

**Decision**: `$claude-adversarial-review` auto-names its new session `codex:<repo>:review-<originalJobId-short>` (with the literal `review-` prefix). Not user-overridable via `--name`.

This provides clear lineage visible in `claude agents --json` output. The `review-` prefix distinguishes review sessions from regular delegation sessions.

Reflected in sections 3.1 and T5.

### OQ-E — Should `$claude-adversarial-review` accept `--model` and `--effort`? -- resolved

**Decision**: `$claude-adversarial-review` ACCEPTS `--model` and `--effort`. The adversarial review is a fresh session; the user may want to use a different model for quality assurance.

This DIVERGES from `$claude-followup`'s flag-rejection precedent. The rationale: `$claude-followup` rejects `--model` and `--effort` because the target session is already configured and those flags would silently no-op. `$claude-adversarial-review` starts a fresh session where the flags are meaningful.

Reflected in sections 3.1 and T5.

### OQ-F — Structured output enforcement strictness -- resolved

**Decision**: structured output parsing is BEST-EFFORT with graceful fallback. If Claude's output does not match the expected format, wrap the raw text in a single finding with severity `nit` and continue. `--json` output always exposes `verdict` + `findings` array.

This avoids the fragility of strict parsing (which would fail on any Claude format deviation) while still providing structured output for consumers that can handle it.

Reflected in sections 3.3 and T2.

### OQ-G — Should reviews be distinguishable in `turns[]`? -- resolved

**Decision**: review turns are distinguished in `turns[]` by a `prompt.summary` PREFIX CONVENTION (`[review] ` or `[adversarial-review] `). NO new `type` field on `TurnRecord`. NO schema change.

Consumers can pattern-match on the prefix. This is lightweight and backwards-compatible. A formal `type` field is a candidate for a future schema revision if the prefix convention proves insufficient.

Reflected in sections 3.1, 3.5, and T4/T5.

### OQ-H — Doctor probes for review capability -- resolved

**Decision**: `$claude-setup` does NOT add a new `reviewCapability` doctor group. Review capability is implied by `delegateCapability + followupCapability` both being `ok`.

`$claude-review` requires follow-up capability (PTY attach for same-session send). `$claude-adversarial-review` requires delegate capability (fresh `claude --bg` session). If both are green, reviews work. No new probes needed.

Reflected in section 2 (out of scope for doctor changes).

---

## 7. Definition of done for Plan 0003

Plan 0003 is ready to transition `implementing` -> `auditing` when:

- All 12 tasks have their checkboxes ticked.
- CI is green on `main` for the matrix `ubuntu-latest + macos-latest x Node 20 + 22`.
- The artifact `artifacts/e2e-live-<date>.txt` exists and shows a real Codex session driving both `$claude-review` and `$claude-adversarial-review` through the full flow with structured findings output.
- `2-implement.md` is filled in.

Plan 0003 is `complete` when all five stages have substantive content and the readme status reads `complete`.

---

## 8. Things explicitly NOT in this plan

These belong in later plans. Listing them here so they do not get smuggled into Plan 0003:

- Review-of-review recursion prevention (no depth tracking; future plan if needed).
- Benchmark workload, measurement procedure, and cost-claim copy update (Plan 0004).
- Stop-time review gate via hooks (Plan 0005).
- Marketplace listing, `.codex-marketplace` config, install-doc polish (Plan 0006).
- `watch()` AsyncIterable implementation (deferred per Plan 0002 OQ-F).
- Multi-reviewer chains (two parallel reviews, critic + defender adversarial debate).
- `--severity-threshold`, `--focus`, `--diff`, `--turn N` flags.
- Structured-output JSON-schema validation library dependency.
- `claude --agents` custom-agent definition surface.
- `claude ultrareview` wrapping or integration.
- Windows support beyond macOS + Linux.
- Telemetry.
- Doctor probe changes (review capability is implied by delegate + followup).
