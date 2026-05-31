# Stage 4 — Polish

> **Status**: not started. Begins once Stage 3's approval gate reads "Ready for polish? yes" (or "partial" with explicit scope).

## Scope

Cleanup pass. Resolves audit findings + non-audit polish (naming, comments, error messages, docs, tests, lint). If polish is producing meaningful new features, the plan was too big — escalate and consider splitting.

## Audit findings resolved

_(For each, link to the finding in [`3-audit.md`](3-audit.md) and the commit / PR that fixed it.)_

| Severity | Finding | Resolution | Commit |
|---|---|---|---|
| — | — | — | — |

## Audit findings deferred

_(For each deferred finding: why. Often the answer is "out of plan 0001 scope; tracked in plan 000X". Never silently drop a finding.)_

| Severity | Finding | Reason for defer | Tracked in |
|---|---|---|---|
| — | — | — | — |

## Polish-only changes (not from audit)

_(Renames, dead-code removal, docstrings, README polish, error-message rewrites. Anything that doesn't change behavior but improves clarity / maintenance.)_

- _pending_

## Lint / typecheck / test pass after polish

- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] `npm test` green
- [ ] CI green on the branch that goes into Stage 5
