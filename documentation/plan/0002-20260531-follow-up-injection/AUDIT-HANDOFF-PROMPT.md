# Plan 0002 Stage 3 — Audit handoff prompt

> Paste the fenced block below into a fresh Claude Code (or equivalent)
> session at the repo root. The auditor lands cold with no conversation
> context from the implementation session.

```
You are the independent Stage 3 auditor for Plan 0002 of cc-plugin-codex
(repo: /Users/hongjunwu/Repositories/Git/cc-plugin-codex). You have NOT
seen the implementation. Form your own opinion.

## Your role

Stage 3 = audit. Read-only. You write exactly one file:

  documentation/plan/0002-20260531-follow-up-injection/3-audit.md

You do NOT edit any other file. You do NOT run implementation, polish, or
report work. You do NOT self-correct findings into code fixes — those are
Stage 4's job.

## Commit to audit

  HEAD = 96f2300  (Plan 0002: mark Stage 2 complete; awaiting independent audit)

Verify with:

  git rev-parse HEAD                              # expect 96f2300...
  git log --oneline -20                           # see the T1..T15 + T15a chain
  git status --short                              # working tree clean (only references/ submodule ?s expected)

## Required reading (in this order)

  1. documentation/plan/README.md
     — Workflow definition. Read it cold so you know what Stage 3 means
       in this project's terms.
  2. documentation/plan/0002-20260531-follow-up-injection/readme.md
     — Status + stage table.
  3. documentation/plan/0002-20260531-follow-up-injection/1-plan.md
     — The approved Stage 1 contract. Treat as ground truth for scope.
     — § 4 is the task list (T1..T15). § 6 has the eight resolved OQs.
       § 5 is the risk register. § 7 is the definition of done.
  4. documentation/plan/0002-20260531-follow-up-injection/2-implement.md
     — Stage 2 implementation log. Long. Read it all. Pay attention to
       the "Orchestrator-applied follow-up" subsections (T5, T6, T7, T10,
       T11, T12, T13, T14, T15a) — those are post-subagent fixes worth
       cross-checking against the source.
  5. documentation/plan/0002-20260531-follow-up-injection/artifacts/e2e-live-20260601.txt
     — Live E2E artifact (520 lines, real Claude 2.1.149 + Codex 0.135.0).
       Two bugs were discovered AND fixed within T15 (T15a remediation).
       Re-read both bug narratives.
  6. documentation/research/20260531-plan-0002-research/report.md
     — Optional but useful. Predecessor research. Sidecar schema +
       attach surface notes.

After that, walk the code. Where 2-implement.md says "fixed at X", verify
the fix is actually in the file at HEAD. Don't trust the log — verify.

## What the audit should cover

Treat each as a section in 3-audit.md. For each finding, mark severity
(critical / high / medium / low / nit) and state evidence (file:line).

### A. Contract compliance vs 1-plan.md

For each task T1..T15:
  - Did the implementation match the acceptance criteria in 1-plan.md § 4?
  - Are the eight OQ resolutions (§ 6) honored?
  - Are the 15 risks (§ 5) addressed (or knowingly accepted)?
  - Was anything implemented that's NOT in 1-plan.md scope?
  - Was anything in 1-plan.md scope dropped or deferred without
    maintainer acknowledgement? (T11's `--all-idle` IS dropped with
    explicit maintainer correction logged in 2-implement.md Deviations —
    that's documented; check for OTHER drops that aren't.)

### B. Security + safety invariants

  - No bypass flags (`--dangerously-skip-permissions`, etc.) — grep.
  - `--allow-edit` is never used to bypass ack — grep ack code paths.
  - `--yes` is never silently injected — grep SKILL.md run-lines.
  - Permission handoff is fail-closed on non-TTY — read cmdFollowup.
  - Target-workspace ack scoping holds — read T12's resolveWorkspaceAck.
  - No new dependency in package.json that the plan didn't authorize.
  - No `claude -p` reference outside negation context.
  - CI permissions stay `contents: read`, no secrets, no real Claude/
    Codex install. (Read .github/workflows/ci.yml.)
  - Throwaway repo's tracked files unmodified during E2E (artifact STEP
    8). Verify the artifact actually shows what the log claims.

### C. Architectural invariants

  - packages/runtime/** imports NO driver-claude-code symbols.
    Grep: `grep -rn "driver-claude-code\|node-pty\|claude -p" packages/runtime/src/`
    Expected: zero hits.
  - packages/plugin-codex/scripts/** imports NO node-pty.
    Grep: `grep -rn "node-pty" packages/plugin-codex/scripts/`
    Expected: zero hits (a comment is fine; an import is not).
  - packages/runtime/src/** has no driver-side type leakage.
  - Sidecar schema parsing is defensive (every field optional, missing
    file returns null, malformed JSON returns null). Read sidecar.ts.

### D. Test adequacy

Run yourself, with HEAD checked out:

  npm ci
  npm run lint
  npm run typecheck
  npm run format
  npm test
  npm run test:attach

Expected counts (from 2-implement.md T15 acceptance):
  test:mock     58/58
  test:runtime  156/156
  test:driver   175/175
  test:plugin   336/336
  total         725/725
  test:attach   25/25

If counts differ, that's a finding. If anything fails on your machine,
that's a finding — but note local-env-specific gotchas (node version,
node-pty rebuild) before scoring.

Check coverage gaps:
  - T15a-1..6 cover the reconciler sidecar-evidence path. Do they cover
    every branch (queued/working/starting/injecting × yes/no result ×
    yes/no sidecar)? Find branches NOT exercised by tests.
  - T11-1..15 cover bulk-stop. Do they cover all eight skipped statuses?
    (queued/starting/running/needs_input/completed/stopped/failed/orphaned)
    T11-4..7 cover four; what about queued/starting/needs_input via the
    bulk path?
  - T12-1..9 + T8-11..13 cover ack scoping. Spot-check for the cases the
    matrix doesn't yet name.

### E. Cost-claim discipline (OQ4)

Grep the entire diff range (everything since Plan 0001's tag) for the
forbidden tokens and patterns. Plan 0001 OQ4 listed:

  saves money | cheaper than | reduces cost | preserves prompt-cache
  savings | avoids the | more efficient than
  /\d+%\s*(faster|cheaper|less)/i
  /\d+x\s*(faster|cheaper)/i
  /save[sd]?\s+\d+/i

Cost paragraph in packages/plugin-codex/README.md must be byte-identical
to Plan 0001's wording. T13-21 test enforces this; verify the test
exists AND matches.

### F. T15a fix correctness — extra scrutiny

T15a fixed two production bugs that the original A/B/C subagent reviews
DID NOT catch. That's a meta-finding worth calling out: the reviewer
contract failed to surface these before they hit live E2E. Audit
specifically:

  - reconciler.ts mapStatus idle-branch: is the sidecar predicate tight
    enough? Could it false-positive on a legitimately mid-work state
    where sidecar happens to still show stale `output.result` from a
    prior turn?
  - reconciler.ts turn-status mirror: the `awaiting_followup` branch
    now flips turn[last].status to 'completed'. Is there any code path
    where awaiting_followup means something OTHER than "latest turn
    completed" — e.g., if a future feature uses awaiting_followup as
    an intermediate state?
  - attach.ts attachWarmupMs: 2000ms is a magic number. Is there any
    machine where 2000ms is too short? Is the env-var override
    discoverable enough? Should the README troubleshooting section
    mention `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`? (Currently doesn't.)
  - adapter.mjs readSidecar wiring: T4 added the reader to the driver
    in 2026-05-31 but the adapter wiring landed only in T15a (2026-06-
    01). How was sidecar reading exercised in the dispatcher's own tests
    between T4 and T15a? Check — there may be more dead-code paths or
    untested code lurking.

### G. Live E2E artifact integrity

  - Header fields all present and accurate.
  - Versions (Codex 0.135.0, Claude Code 2.1.149) match what the plan's
    OQ-H feature-probe baseline requires.
  - Sensitive data redacted (email, orgId). Grep yourself.
  - No unrelated user repo paths (DoubleBlack, InstantLink, etc.).
  - Three completed turns + final stop visible.
  - The artifact PROVES the bugs were real and fixed (both pre-fix and
    post-fix snapshots present).

### H. Process / reviewer-contract findings

Two relevant process issues to call out:

  1. The T11 Subagent C (code-reviewer) ran `git checkout` mid-review
     and wiped ~510 lines of test work. The orchestrator reconstructed
     from context. The reviewer's contract said read-only — that was
     violated.

  2. The T15a bugs (reconciler + adapter) shipped through three rounds
     of Subagent C review (T7, T8, T12) without anyone catching that
     the adapter never wired readSidecar. That's a coverage gap in the
     review contract itself — pure source review without integration
     verification missed it.

Both belong in 3-audit.md as process findings (not code findings) —
recommend reviewer-contract tightenings for future plans.

## Audit output: 3-audit.md

Structure:

  # Plan 0002 Stage 3 — Audit
  **Audited commit**: 96f2300
  **Audited on**: <today>
  **Auditor**: <model name>

  ## Verdict

  One of:
    - ready-for-polish (no medium-or-higher findings; nits OK)
    - needs-polish-pass (medium findings to address in Stage 4)
    - needs-implementation-rework (critical/high findings; Stage 4
      can't reasonably handle these)

  ## Sections A through H

  Per-section findings with severity + evidence (file:line).

  ## Summary table

  | ID | Severity | Area | Finding | Suggested disposition |
  | F1 | medium   | A    | ...     | Stage 4: fix wording in ... |

  ## Out-of-scope (deferred)

  Anything you noticed that's NOT in 1-plan.md's scope but should be
  filed against a future plan. Use this for "this isn't a Plan 0002
  bug but it should not be lost."

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
      "Plan 0002 Stage 3: audit findings"
    Push. Don't watch CI (docs-only commit).

## When you finish

Pause for the maintainer to read 3-audit.md and decide whether to
proceed to Stage 4 (polish) or push back. Do not start Stage 4 in this
session.
```
