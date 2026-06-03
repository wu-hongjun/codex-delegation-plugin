# Plan 0005 — Stop-time review gate via hooks

**Status**: `deferred`
**Recorded**: 2026-06-03
**Blocked on**: Plan 0004 T11 (post-cutover live benchmark run, earliest 2026-06-16) and T12 (README cost paragraph decision).

## Why deferred (not abandoned, not renumbered)

Plan 0005 introduces a product behavior change — a stop-time review gate that triggers `$claude-review` (or `$claude-adversarial-review`) when `$claude-stop` is invoked, before the session is terminated. Whether this default UX is honest depends on measured review cost, latency, and reliability:

- **Cost**: how much does a stop-time review add to a typical delegate flow?
- **Latency**: does the review run inside an acceptable wall-clock budget at stop time, or does it block user workflows?
- **Reliability**: how often does the same-session review fail (`review_failed` rate, like the 2/15 observed in Plan 0004 T10) versus succeed cleanly?
- **Billing-bucket**: post-cutover, does the stop-time review consume the Claude Code subscription limit or the Agent SDK monthly credit?

Plan 0004 T11/T12 are the only sources of honest answers to these questions. Implementing the gate before that data exists would either bake in a default UX based on guesses, or ship a gate that has to be re-tuned the moment T11 lands.

## Plan number discipline

Plan 0005 stays Plan 0005. Plan 0006 (marketplace packaging) starts in parallel because it does NOT depend on T11/T12 data.

References to Plan 0005 as "stop-time review gate" in:
- Plan 0001 § What comes next
- Plan 0002 § Follow-up plans
- Plan 0003 § Follow-up plans
- Plan 0004 § Out-of-scope
- README `## What comes next`

…all remain accurate and do NOT need editing.

## What this plan will eventually cover (when un-deferred)

Out of scope for this stub; deferred to Stage 1 drafting when the gate exists.

- Hook contract: which Codex stop-event channel triggers the gate, with what payload.
- Review variant selection: same-session vs adversarial-review at stop time, and the decision rule.
- Failure-mode handling: what happens when the review fails (does stop still proceed? does the user see findings?).
- Configurable bypass: a way to skip the gate for trusted workflows.
- Reviewer-loop prevention: ensure stop-time reviews of review jobs don't recurse.
- Default tuning informed by T11/T12 measured data.

## Un-defer trigger

When all of the following hold, Plan 0005 may transition from `deferred` to `planning`:

- Plan 0004 T11 artifact exists at `documentation/plan/0004-*/artifacts/bench-post-*` with `cutoverPhase: "post"`.
- Plan 0004 T12 is closed (README cost paragraph decision recorded).
- Plan 0005 maintainer revisits this stub and decides the gate is worth shipping given the measured data.

Until then, no Plan 0005 implementation work begins. No hooks, no stop gates, no review-on-stop behavior, no policy config.
