# Stage 3 — Audit

> **Status**: not started. Begins once Stage 2 is `complete` (all 14 tasks done, CI green, e2e artifact captured).
>
> **MUST be performed from independent context** — different agent run, different reviewer, ideally different day. The implementer does not audit their own work in the same session.

## Scope

Read [`1-plan.md`](1-plan.md) and [`2-implement.md`](2-implement.md), then the actual code. Compare what was planned, what was claimed, and what is actually true in the repo. Audit lens:

- **Correctness** — does the code do what the plan says?
- **Robustness** — does it handle the failure modes listed in [`1-plan.md` § 5](1-plan.md#5-risks-filtered-subset-from-research) and [research § I1](../../research/20260530-initial-research/report.md)?
- **Privacy / security** — does R4 (data disclosure) actually fire? Are permission defaults what OQ1 settled on?
- **Tests** — are the acceptance criteria actually exercised? Any tests that pass by mocking too much?
- **API surface** — is the `Driver` interface (§ 3.3) faithfully implemented? Anything that should be in v1 missing or smuggled out?
- **User-facing copy** — are the cost-claim words from OQ4 honored everywhere (README, plugin description, doctor output, error messages)?
- **Docs ↔ code drift** — does anything in `packages/plugin-codex/README.md` not match reality?

## Findings

Each finding gets a severity and an evidence line. Severity scale:

- **blocker** — must fix before plan moves to Stage 4.
- **high** — should fix before close; defer only with explicit rationale.
- **medium** — fix in polish.
- **low** — fix or defer; small impact.
- **nit** — taste / cleanup. Auditor decides whether to flag.

### Blockers

_(none yet)_

### High

_(none yet)_

### Medium

_(none yet)_

### Low

_(none yet)_

### Nits

_(none yet)_

## Implementer counter-evidence

_(Filled in by the implementer, in a separate pass after the auditor's findings are recorded. Where the audit was wrong or the issue was already fixed, say so with evidence.)_

## Approval gate

**Ready for polish?** _pending_

Reasoning: _pending_
