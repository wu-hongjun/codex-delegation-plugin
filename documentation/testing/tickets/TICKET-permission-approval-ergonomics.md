# TICKET: Permission approval ergonomics for Codex-driven Claude jobs

**Type**: implementation planning ticket
**Owner**: maintainer
**Executor**: Codex/Claude
**Source**: Claude audit lanes 2026-06-15, especially `job_mqftwmph_8f64fa1e` (shortId `45fd5229`) plus direct repo inspection
**Status**: OPEN
**Priority**: P0/P1

## Problem

Codex can spawn Claude jobs, but non-TTY permission prompts remain high-friction. During the audit, several Claude agents blocked on simple read-only operations such as `grep`, `find`, `cat`, and `claude --version`. From Codex, the only reliable path was to attach interactively or stop the job. This is a poor fit for background delegation.

The same friction appears in workflow and deep-research launch approval gates: `--yes` acknowledges the plugin privacy/cost warning, but it does not approve the internal workflow launch. That distinction is correct, but the operator path is still too manual.

## Evidence

- `packages/plugin-codex/scripts/cc.mjs:1454` to `1458`: non-TTY permission interaction returns `null`.
- `packages/plugin-codex/scripts/cc.mjs:1528` to `1548`: permission prompt handling requires an interactive attach path.
- `packages/plugin-codex/scripts/cc.mjs:628` to `654`: workflow approval gate explains that `--yes` does not approve the workflow start.
- `packages/plugin-codex/scripts/cc.mjs:747` to `763`: deep-research gate has the same manual launch approval caveat.
- Audit lane B reached `waitingFor: "permission prompt"` while doing read-only exploration and then had to be stopped.
- Audit lane B also showed a nested Claude Explore agent blocking on an unquoted `find` command, which made the parent job hard to recover from Codex alone.
- The current depth-test notes already call out approval friction under load.
- `packages/plugin-codex/scripts/cc.mjs:366` to `381`: there is no `approve` or `reject` command in the dispatcher command set.
- `packages/plugin-codex/scripts/cc.mjs:843` to `899`: the launch path starts a background job, reconciles once, and returns; the existing permission-answer callback is only available during follow-up/review send paths.
- Second-pass no-Bash audit (`job_mqfv74qo_99f0817b`) confirmed the line evidence and found the problem is worse on fresh delegates than on follow-up: there is currently no dispatcher-side way to answer a fresh delegated job's pending permission prompt.

## Scope

1. Add an explicit approval command.
   - Suggested shape: `cc approve <job-id-or-prefix> [--json]` plus a separate `cc reject <job-id-or-prefix> [--json]`, or equivalent distinct approve/reject verbs.
   - Do not reuse `--yes` or `--no` for prompt approval; `--yes` already means privacy acknowledgement elsewhere.
   - It should answer only the current pending Claude permission prompt for that job.
   - It should be safe to retry and should report when there is no pending prompt.
   - First confirm the driver can answer a pending prompt from a short-lived process without sending a new turn.

2. Consider batch approval only with strong constraints.
   - If implemented, use an explicit flag such as `--all-current`.
   - Do not silently approve future prompts.
   - Do not default to approving broad tool access.

3. Surface approval state in status output.
   - Show `waitingFor`, the current prompt summary if available, and the exact command to approve or reject.
   - JSON should expose enough structured state for Codex to decide whether a follow-up or approval is needed.
   - Confirm whether pending prompt text is available in sidecar state before displaying or approving it.

4. Unify manual workflow launch gates with the approval UX.
   - Keep the current safety boundary.
   - Make the operator action scriptable and discoverable.
   - Do not make `--yes` mean "approve every Claude workflow action"; keep that flag scoped to the plugin warning.

5. Document unattended patterns.
   - Recommend narrow `--allowedTools` scopes for expected read-only or edit tasks.
   - Document `--permission-mode bypassPermissions` only for explicit trusted environments.
   - Include examples for Codex-to-Claude delegation that minimize follow-up prompts.
   - Update README and skill command counts if adding a new skill or dispatcher command.

## Safety Model

- No default auto-approval.
- Approval must target a specific job and the current pending prompt.
- The command must re-detect the live prompt at approval time so it cannot answer a stale or different prompt.
- Record an event when a prompt is approved or rejected through `cc approve`.
- Avoid conflating plugin-level warnings, Claude permission prompts, and workflow launch gates.

## Verification

- Add PTY or driver mock tests for approving and rejecting a pending prompt.
- Add non-TTY tests proving the new command can resolve a prompt without interactive attach.
- Add status JSON tests for `waitingFor: "permission prompt"` and approval command hints.
- Add docs tests or grep checks so `--yes` is not documented as a general permission bypass.
- Add a guard that `--yes` remains documented only as privacy acknowledgement, not as permission approval.
- Add ambiguous-prefix and retry-safe tests for approval and rejection.
- Use captured sidecar state from a real waiting job when possible.

## Acceptance Criteria

- Codex can unblock a Claude permission prompt through a single non-interactive command.
- Status output tells Codex exactly why a job is blocked and what command can resolve it.
- The plugin preserves the user's permission boundary and does not introduce implicit broad approval.

## Guardrails

- Do not edit user Claude or Codex config directly.
- Do not make bypass permissions the default path.
- Do not treat permission friction as evidence for the known F2b upstream cross-contamination issue.
