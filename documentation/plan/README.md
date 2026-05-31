# Engineering plan workflow

Every non-trivial change in this repo goes through a five-stage cycle, documented as a plan directory under `documentation/plan/<NNNN>-<YYYYMMDD>-<slug>/`. A plan is a unit of engineering work — focused enough to be planned, shipped, audited, polished, and reported on end-to-end.

This file is the workflow definition. Future plans must conform to it. Open a new plan directory by copying the structure described below.

---

## Directory layout

```
documentation/plan/
├── README.md                              ← this file (workflow definition)
└── <NNNN>-<YYYYMMDD>-<slug>/
    ├── readme.md                          ← plan summary, status, links
    ├── 1-plan.md                          ← stage 1: the plan
    ├── 2-implement.md                     ← stage 2: implementation log
    ├── 3-audit.md                         ← stage 3: independent audit
    ├── 4-polish.md                        ← stage 4: polish + cleanup notes
    ├── 5-report.md                        ← stage 5: final report
    └── artifacts/                         ← supporting files (diffs, logs,
                                            screenshots, benchmark data,
                                            prototypes, etc.)
```

**Naming**: `<4-digit zero-padded sequence>-<YYYYMMDD start date>-<short kebab-case slug>`.
Examples: `0001-20260530-initial-plan/`, `0002-20260615-pty-attach/`, `0003-20260701-benchmark-harness/`.

---

## The five stages

Each stage has its own file. Stages run in order; no stage starts before the prior one is `complete` or explicitly skipped (with rationale recorded in the plan readme).

### Stage 1 — Plan (`1-plan.md`)

Produced before any code is written. Contents:

- **Context & references**: what prior research, decisions, or plans does this build on?
- **Scope**: what's in, what's out, with reasoning. Out-of-scope items go in "follow-ups", not implemented silently.
- **Approach**: technical decisions with rationale. Each decision should reference evidence (research findings, prior art, doc URLs).
- **Tasks**: ordered list, each with acceptance criteria. A task without acceptance criteria is a wish, not a task.
- **Risks**: what could go wrong; likelihood × impact; mitigation.
- **Open questions**: things needing product / human input. Marked clearly so they block implementation if unresolved.
- **Definition of done**: what "ready to mark this plan complete" looks like — concrete and measurable.

A plan that's vague at the bottom doesn't get implemented. Push back on the plan, not on the implementation.

### Stage 2 — Implement (`2-implement.md`)

Running log kept by the engineer doing the implementation. Truthful, not polished. Contents:

- **What was actually built** (with commit / PR links).
- **Deviations from the plan**, with why. Every deviation is a learning, not a failure.
- **Surprises**: things the plan got wrong or didn't anticipate.
- **Decisions made mid-stream** that weren't in the plan.
- **Test evidence**: what was tested, what passed, what was skipped.

Update this file as you go. A 5-line entry per day beats a 500-line retro at the end.

### Stage 3 — Audit (`3-audit.md`)

**Independent** review. Must NOT be done by the implementer in the same session — fresh context, fresh eyes, ideally a different agent or human. Contents:

- **Findings**, severity-rated (`blocker` / `high` / `medium` / `low` / `nit`).
- **Evidence**: file:line references, repro steps, screenshots, logs.
- **Implementer counter-evidence** (added in a separate edit pass): where the audit was wrong or already addressed.
- **Approval gate**: at the bottom, an explicit "ready for polish? yes / no / partial" with reasoning.

The audit's job is to be wrong sometimes. That's why it's worth doing.

### Stage 4 — Polish (`4-polish.md`)

Cleanup pass addressing audit findings, plus naming, comments, tests, lint, accessibility, error-message quality, doc updates. Contents:

- **Audit findings resolved**, with commit references.
- **Audit findings deferred**, with rationale (often: scope, follow-up plan #).
- **Polish-only changes** not from audit (renames, dead code removal, docstrings, README updates).

If the polish stage is producing meaningful new features, the plan was too big. Split.

### Stage 5 — Report (`5-report.md`)

Final summary, written when the plan is closing. Contents:

- **What shipped**: feature list, code locations, public surface.
- **What didn't ship**, with reason.
- **Metrics / benchmarks** (if applicable).
- **Follow-ups**: open work, with target plan number if known.
- **Learnings**: what to do differently next plan.
- **Final status**: `complete` / `abandoned` / `split into <NNNN>+<NNNN>`.

A plan that was abandoned still gets a report — that report explains why, which is itself useful work product.

---

## Plan readme (`readme.md`)

Every plan directory has a short `readme.md` at the root. Its purpose is at-a-glance status — not detail.

Required fields:
- **One-line summary**
- **Status**: one of `planning` / `implementing` / `auditing` / `polishing` / `reporting` / `complete` / `blocked` / `abandoned`
- **Started**, **Last updated**, **Completed** (dates)
- **Links** to each stage file and key artifacts
- **Dependencies / blockers** (other plans, external decisions)
- **Owner** (who's currently driving)

Update the status as you advance stages. A stale status is a bug.

---

## Artifacts

Anything that isn't a markdown narrative belongs under `artifacts/`. Examples:

- Benchmark CSVs, JSON results, raw logs
- Screenshots, screen recordings, demo GIFs
- Generated diagrams (and their source, e.g. `.mmd` for Mermaid)
- Sample inputs / outputs / fixtures
- Scratch prototypes, throwaway scripts
- Reviewer notes pulled in from external tools
- Anything large or binary

Reference artifacts by relative path from a stage file (e.g. `[bench results](artifacts/bench-20260615.csv)`).

---

## Rules

1. **Stages run in order.** No implementation before the plan is complete enough to commit to. No audit before implementation lands.
2. **No self-audit in the same context.** Stage 3 must come from independent context (different agent run, different reviewer, different day). The point is *not* to confirm what you already think.
3. **Update `readme.md` status when you change stages.** Otherwise the index lies.
4. **One concrete deliverable per plan.** Plans that try to cover "everything" become unfinishable. Split into smaller plans linked by `Follow-ups`.
5. **Failed plans still get a report.** If a plan is abandoned, write `5-report.md` explaining why, then mark `abandoned`. Don't delete.
6. **Reference research, don't duplicate it.** If a fact lives in `documentation/research/<id>/report.md`, link to it — don't re-state it in the plan.
7. **Acceptance criteria are mandatory.** A task with no measurable "done" criterion gets pushed back to planning.

---

## Why this exists

Without staged structure, "implementation" silently absorbs scope creep, audits become rubber-stamps, polish gets skipped because the engineer is exhausted, and reports get rationalized post-hoc. The five-stage cycle forces each lane into its own context and produces an artifact trail that the next plan can read cold.

The cost is real: a plan that would be a half-day commit becomes a half-day commit plus a day of writing. Use the workflow for non-trivial work where the artifact trail pays for itself. Trivial commits (typos, lint fixes, dep bumps) don't need a plan.
