# Plan 0022 — follow-up state, status perf, and friction polish

**Status**: complete + polished
**Started**: 2026-06-12
**Last updated**: 2026-06-12
**Completed**: 2026-06-12
**Owner**: Codex

## Summary

Fix plugin-side findings from the v0.3.3 depth test: completed Claude sessions that remain `running` in cc state, `status --all` reconciling old terminal jobs one by one, and the highest-value frictions found by installed subagent testing.

## Context

- Source ticket: `documentation/testing/tickets/TICKET-cc-depth-test.md` run 2026-06-12.
- Evidence: `documentation/testing/artifacts/v033-ticket-20260612/05-followup.md` and `05b-followup-retry.md`.
- F2b is explicitly out of scope. It is an upstream Claude Code/model-layer symptom per `project_f2b_upstream_nondeterministic`; this plan must not ship another naming/timing fix for F2b.

## Scope

In:

- Runtime exception: `packages/runtime/src/reconciler.ts`, limited to using captured result evidence when mapping an idle session's stale queued/working turn into `awaiting_followup`.
- CLI status performance: `packages/plugin-codex/scripts/cc.mjs`, limited to skipping reconciliation for already-terminal job records during status listing.
- Focused tests built from the captured v0.3.3 evidence.
- Installed-run polish: privacy acknowledgement correctness, immutable turn result snapshots for review targeting, compact JSON/status-by-ID ergonomics, honest immediate follow-up previews, and workflow/deep-research inspector/help wording.

Out:

- Any change to session-name generation or F2b handling.
- Job pruning subcommands.
- Review attach timeout tuning.
- Release version bump.

## Acceptance Criteria

- A job with an idle Claude session, `state:"blocked"` sidecar, `output:null`, stale queued turn, and a transcript/result file reconciles to `awaiting_followup`.
- A repeated reconcile of a stale `running` job that already has `job.result` can also reach `awaiting_followup`.
- `status`/`status --all` do not call the reconciler for `completed`, `failed`, `stopped`, or `orphaned` job records.
- Targeted runtime and plugin tests pass.
- `node tools/package-marketplace.mjs --check` passes after regenerating marketplace outputs.

## Result

- Runtime reconciliation now remaps an idle session with concrete latest-turn result evidence to `awaiting_followup`, including the captured `status:"idle"` + sidecar `state:"blocked"` / `output:null` shape.
- `cc status` and `cc status --all` skip reconciliation for already-terminal job records (`completed`, `failed`, `stopped`, `orphaned`), avoiding the O(n) scan cost over historical terminal jobs.
- Polish fixed the installed depth-test privacy finding: a fresh TTY workspace without `--yes` now shows an explicit acknowledgement prompt and records an ack only after the user types `yes`.
- Subagent friction polish fixed review/result provenance: reconciler writes immutable per-turn result snapshots, keeps `<jobId>.result.md` as a latest-result compatibility alias, and adversarial review fails closed for unrecoverable legacy shared-path records.
- Automation ergonomics improved with `--compact` JSON, `cc status --job <jobId-or-prefix>`, explicit stale-preview metadata for immediate follow-up races, command-specific workflow/deep-research/workflows help, and workflow inspection for `/deep-research` jobs.
- Marketplace source and bundled runtime were regenerated and verified byte-identical.
