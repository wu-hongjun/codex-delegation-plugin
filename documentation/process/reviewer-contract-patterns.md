# Reviewer-contract patterns for the A/B/C subagent cadence

> **Status**: sketch. Drafted during Plan 0003 T3 close. Not yet endorsed
> as a permanent process doc. May be promoted to a stable location or
> folded into a plan's § Lessons learned at the maintainer's discretion.
>
> **Audience**: future orchestrators running the A/B/C cadence on
> cc-plugin-codex T-tasks. Concretizes the F-H1 and F-H2 reviewer-
> contract findings from Plan 0002's Stage 5 report.

## Background

Plan 0002's Stage 3 audit (commit `5df7761`) surfaced two process
findings in its § H "Reviewer-contract findings":

- **F-H1**: a Subagent C ran `git checkout` mid-review during Plan
  0002 T11 and wiped ~510 lines of B's test work. The read-only
  contract was implicit; should have been explicit.
- **F-H2**: three rounds of Subagent C review (Plan 0002 T7 / T8 /
  T12) failed to flag a missing `adapter.readSidecar` wiring; the
  live E2E in T15 surfaced it as the T15a remediation. Source review
  without optional-capability tracing missed it.

Plan 0002's Stage 5 report § Lessons learned converted these into
forward-looking recommendations for Plan 0003+ reviewer briefs. This
document concretizes the patterns we've actually used across
Plan 0003 T1–T3.

## Pattern 1 — Enumerate forbidden mutators in every Subagent C brief

Every Subagent C brief MUST include the following verbatim
read-only block:

> You may NOT run any of the following:
>
> - `git checkout`, `git restore`, `git stash`, `git reset`,
>   `git clean`, `git rebase`, `git push`, `git push --force`,
>   any commit-mutating commands.
> - File deletes, renames, or edits to ANY tracked file.
> - `npm install`, `npm rebuild`, `npm uninstall`, modification of
>   any `node_modules/`.
> - `--no-verify` on any git command.
> - Branch, tag, or remote operations.
> - `Edit`, `Write`, or `NotebookEdit` tools on tracked files.
> - Modifying `~/.claude/`, `~/.codex/`, or any global config.
>
> You MAY run:
>
> - `git log`, `git diff`, `git show`, `git status`, `git blame`.
> - `grep`, `find`, `ls`, `wc`, `cat`, `head`, `tail`, `awk`,
>   `sed -n`.
> - `Read` tool on any file.
> - `node --check <file>` (syntax check only).
> - `npm run lint`, `npm run typecheck`, `npm run format -- --check`,
>   `npm test`, `npm run test:plugin` (gate execution; non-mutating).

The Plan 0002 T11 mishap is the model fact-pattern. Always include
a reference to it in the brief so the subagent knows the cost of
reaching for a state-mutating command.

## Pattern 2 — Apply the F-H2 trace step verbatim

For each T-task that introduces or touches an optional interface
capability, the Subagent C brief MUST require a verbatim trace from
factory to consumer:

> "[Capability name] trace from [factory location] to [consumer
> location] is verified."

Examples observed in Plan 0003:

- **T1 (review-prompts.mjs)**: traced the optional `context` field
  for `SAME_SESSION_REVIEW_PROMPT` through the implementation's
  default-parameter path and B's test 8 (degradation when context is
  empty).
- **T2 (review-parser.mjs)**: explicitly marked "not applicable to
  T2 because review-parser has no optional interface wiring." The
  verbatim "not applicable" sentence is required; do not skip the
  step silently.
- **T3 (sendFollowupTurn helper)**: traced `promptSummaryPrefix`
  from helper signature (line 502) → helper application (line 511)
  → TurnRecord write (line 513) → caller's `undefined` pass (line
  924). Confirmed the non-undefined branch is deferred to T4.

The "not applicable" case is the easiest to skip and the most
important to require — F-H2's whole point is to make the trace
explicit even when trivially satisfied.

## Pattern 3 — Pre-flag A's design judgments in C's brief

When Subagent A's implementation summary surfaces design judgments
that deviate from the locked plan contract (e.g., omitted parameters,
added parameters, ownership-boundary pragmatic decisions), the
orchestrator should pre-flag each as a numbered "Judgment" in C's
brief. C then renders an explicit verdict on each.

Example from Plan 0003 T3:

- Judgment 1: helper signature (omitted `flags`, added `sessionHandle`
  and `job`).
- Judgment 2: permission callback constructed inside helper (Edit 10
  said caller-owned).
- Judgment 3: `process.exit` inside helper (Edit 10 said caller-owned).

This forces C to confront each deviation with reasoned argument
rather than reflexively rubber-stamping. All three Judgment-style
deviations in T3 were accepted by C as defensible refactor pragmatics
with specific rationales, logged in 2-implement.md.

## Pattern 4 — Orchestrator absorbs B's role for true refactors

For pure-refactor T-tasks (test-count delta 0; no new behavior; no
new exports), Subagent B's role reduces to two activities:

1. Confirm existing tests pass.
2. Decide whether to add new tests (often "no" per maintainer
   direction — e.g., "do not export the helper just to test the
   prefix").

The orchestrator can take both items in-thread. Document the
decision in the 2-implement.md T-task entry under a
`### Subagent B — regression verification (handled in-thread by
orchestrator)` section. Cite two independent test runs (A's
verification + orchestrator's own) as evidence. Subagent C still
verifies the no-export rule independently in their review.

See `feedback-orchestrator-takes-b-role-for-refactors` in user-
private memory for the precondition list.

## Pattern 5 — Test-count overshoot is tolerated with C's redundancy analysis

When Subagent B's test count significantly exceeds the plan's
target (observed in Plan 0003: T1 +24 vs +10, T2 +62 vs +17), the
orchestrator should pre-task C with a per-describe redundancy
analysis. C either:

- Accepts the overshoot as justified (each test is a distinct
  contract assertion) — typical outcome when B is being thorough.
- Flags redundant tests with line ranges and recommends merging
  (deferred to Stage 4 polish since neither A nor B can edit each
  other's work mid-task).

In either case, the 2-implement.md T-task entry logs the overshoot
under "Deviation from 1-plan.md" with C's verdict cited. The
approved 1-plan.md is NOT modified.

## Pattern 6 — Pre-commit fixes for low-severity C findings

Subagent C's read-only contract means C cannot apply fixes. But
some findings are 1-line obvious corrections (e.g., Plan 0003 T3
F-1: a JSDoc claiming the helper does NOT own `process.exit`, when
in fact the helper has two `process.exit` calls).

For such findings, the orchestrator should apply the fix in-thread
pre-commit when ALL of these hold:

- Finding is severity low or nit.
- Fix is < 5 lines of unambiguous text change.
- Fix doesn't require re-running any subagent.
- 2-implement.md entry explicitly records the fix.

Re-verify the gates (lint / format / syntax) after the in-thread
edit. Do NOT re-dispatch A or B for trivial doc fixes.

## What this document does NOT cover

- Subagent A's implementation patterns. Those vary by T-task.
- Subagent B's test-design patterns. Those vary by T-task.
- Plan-stage workflow (Plan → Implement → Audit → Polish → Report).
  See `documentation/plan/README.md`.
- OQ4 cost-claim discipline. See Plan 0001 § 6 OQ4.

## When to update this doc

- After a Stage 3 audit surfaces new reviewer-contract findings
  (analogous to Plan 0002's F-H1/F-H2). Add a new Pattern entry.
- After the maintainer flags a recurring orchestrator failure mode
  worth codifying.
- Do NOT update this doc mid-T-task. Reviewer-contract changes
  should land in a docs-only commit between T-tasks or at a Stage
  4 polish boundary.
