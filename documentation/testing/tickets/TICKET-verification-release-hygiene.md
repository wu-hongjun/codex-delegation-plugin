# TICKET: Verification and release hygiene for production readiness

**Type**: implementation planning ticket
**Owner**: maintainer
**Executor**: Codex/Claude
**Source**: Claude audit lane 2026-06-15 (`job_mqftwmx4_32e0b44e`, shortId `9c5ba031`) plus direct repo inspection
**Status**: OPEN
**Priority**: P1

## Problem

The project has moved quickly through parity and release work, but the verification trail is uneven. Plan 0024 has implementation notes and tickets, but no audit, polish, or report files. The depth-test ticket target is v0.3.6, yet the newest recorded Results Log entry is for v0.3.4. That makes it harder to support a production-readiness claim for the newest release.

This ticket is about making the release trail boring and auditable before the plugin is recommended for broader production use.

## Evidence

- `documentation/plan/0024-20260615-agent-parity-foundation/readme.md` exists.
- `documentation/plan/0024-20260615-agent-parity-foundation/2-implement.md` exists.
- `documentation/plan/0024-20260615-agent-parity-foundation/tickets/T1-cli-parity-flags.md` through `T4-docs-release-followthrough.md` exist.
- `documentation/plan/0024-20260615-agent-parity-foundation/3-audit.md` is missing.
- `documentation/plan/0024-20260615-agent-parity-foundation/4-polish.md` is missing.
- `documentation/plan/0024-20260615-agent-parity-foundation/5-report.md` is missing.
- `documentation/testing/tickets/TICKET-cc-depth-test.md:4`: current target is v0.3.6.
- `documentation/testing/tickets/TICKET-cc-depth-test.md:187`: newest Results Log entry observed during audit was v0.3.4, not v0.3.6.
- Existing tests cover parts of this surface, but not all newly important release claims:
  - `packages/runtime/test/reconciler.test.mjs`
  - `packages/driver-claude-code/test/agents-json.test.mjs`
  - `packages/plugin-codex/test/agents-json-parsing.test.mjs`
  - `packages/plugin-codex/test/review-parser.test.mjs`
  - `packages/plugin-codex/test/dispatcher.test.mjs`

## Scope

1. Backfill Plan 0024 closeout docs.
   - Add `3-audit.md`, `4-polish.md`, and `5-report.md`, or document a deliberate exception in the plan readme.
   - Include exact verification commands, CI links, tag, release link, and local install smoke evidence.

2. Run a full depth test against the installed v0.3.6 plugin.
   - Append a new entry at the top of `documentation/testing/tickets/TICKET-cc-depth-test.md` Results Log.
   - Audit any findings against ground truth before opening implementation work.
   - Do not reopen the known F2b upstream issue as a plugin blocker.

3. Add targeted regression tests for release-critical behaviors.
   - `waitingFor` sidecar fallback and status mapping.
   - `cc result` availability when a latest completed result exists but the session is currently waiting for input.
   - Review parser behavior for in-progress review/meta text.
   - Marketplace version consistency and bundled marker consistency where not already covered.

4. Add a final production smoke checklist.
   - Install or refresh released plugin locally.
   - Run `$claude-setup`.
   - Spawn a read-only delegate.
   - Check status and result.
   - Stop or clean up any active jobs.

## Verification

- Full npm test suite passes.
- Lint/typecheck commands used by the repo pass, if present.
- `node tools/package-marketplace.mjs --check` passes.
- The installed plugin version matches the release version under the Codex cache.
- CI for the release commit and tag is green before a production-readiness claim is made.

## Acceptance Criteria

- The newest depth-test Results Log entry covers v0.3.6 or the current release candidate.
- Plan 0024 has an auditable closeout trail.
- Release claims are backed by local smoke evidence and CI evidence.
- Known upstream F2b symptoms are documented as upstream and are not treated as release blockers.

## Guardrails

- Do not tag or retag immutable versions.
- Do not push forcefully or bypass hooks.
- Do not document behavior as intended without checking real job records, sidecars, or transcripts when those artifacts define the behavior.
