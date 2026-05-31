# Stage 4 — Polish

> **Status**: complete. All five audit findings ([`3-audit.md`](3-audit.md)) addressed in one bundled commit. Lint / typecheck / format / test gates green on the polished commit.

## Scope

Cleanup pass against the five low/nit findings from Stage 3 (commit `63fa9fd`). Locked v1 constraints (no `claude -p`, no `node-pty`, no multi-turn reuse, no `$claude-review`, no hooks, no marketplace polish, runtime → driver isolation, cost-claim discipline) all preserved.

## Audit findings resolved

| Severity | Finding | Resolution | Commit |
|---|---|---|---|
| low | [A1](3-audit.md#finding-a1--cmdstop-records-the-event-as-stoprequested-after-the-stop-has-already-succeeded) — `stop.requested` event fires after `claude stop` already succeeded | Renamed the event to `stop.completed` in `cmdStop` (`packages/plugin-codex/scripts/claude-companion.mjs`). Event still fires after `driver.stop(...)` returns, but the name now honestly reflects completion. No new event split was needed for the start-only v1 model. | Stage 4 commit |
| low | [A2](3-audit.md#finding-a2--cmdstop-reconstructs-startedat-from-jobcreatedat-rather-than-the-real-driver-side-startedat) — `cmdStop` used `job.createdAt` as a proxy for `handle.startedAt` | Added optional `startedAt?: string` to `ClaudeSessionContext` (`packages/runtime/src/types.ts`). `cmdDelegate` now persists `handle.startedAt` on `job.claude.startedAt` at job-create time. `cmdStop` reconstitutes the handle from `job.claude.startedAt`, falling back to `job.createdAt` so pre-A2 records still stop. | Stage 4 commit |
| low | [A3](3-audit.md#finding-a3--cmdresult-and-cmdstop-resolve-job-id-prefixes-against-all-workspaces-not-the-current-one) — `result` / `stop` prefix resolution was workspace-unbounded | `cmdResult` and `cmdStop` now use `listJobsForWorkspace(workspace)` for prefix resolution by default. New `--all` flag (mirroring `cmdStatus --all`) opts back into global resolution. Help text and the "no job found" error message both reference `--all`. Two new regression tests in `packages/plugin-codex/test/dispatcher.test.mjs` lock the workspace-scoped default + `--all` opt-in for `result`; one for `stop`. | Stage 4 commit |
| nit | [A4](3-audit.md#finding-a4--drivernotimplementederrorwatch-plan-0001-t8t9-references-the-wrong-plan-task) — Stale `'plan 0001 T8/T9'` marker on `watch()`'s `DriverNotImplementedError` | Marker changed to `'plan 0002+ (PTY attach / streaming)'` in `packages/driver-claude-code/src/index.ts`. The header comment now reflects the v1 surface accurately. The matching regex in `packages/driver-claude-code/test/probe.test.mjs` was updated to assert against the new marker. | Stage 4 commit |
| nit | [A5](3-audit.md#finding-a5--architectural-invariant-test-only-checks-reconcilerts-not-every-runtime-source-file) — Architectural-invariant test only checked `reconciler.ts` | Test rewritten in `packages/runtime/test/reconciler.test.mjs` to walk every `.ts` file under `packages/runtime/src/` and assert the four banned substrings (`driver-claude-code`, `claude --bg`, `claude -p`, `node-pty`) appear in none of them. The literal `claude -p` token was removed from a doctor.ts header comment by rephrasing it as "the synchronous print-mode transport" so the broader scan stays clean without per-file allowlists. | Stage 4 commit |

## Audit findings deferred

_(none — all five Stage 3 findings were addressed in Stage 4.)_

| Severity | Finding | Reason for defer | Tracked in |
|---|---|---|---|
| — | — | — | — |

## Polish-only changes (not from audit)

- Header comment of `packages/driver-claude-code/src/index.ts` rewritten from "v1 implements probe() only. Lifecycle methods land in later T-tasks per plan 0001" to "v1 implements probe(), startSession(), status(), and stop(). watch() streaming is deliberately deferred to a later plan." This matches the v1 surface that actually shipped in Stage 2.
- Rephrased the doctor.ts header comment to avoid the literal `claude -p` token while preserving its meaning (negation of synchronous print-mode transport). This unblocked A5's broader static scan.
- **Codex YAML-strictness fix in `claude-setup/SKILL.md`**: Codex 0.135.0's frontmatter parser is stricter than Claude Code's. It rejected `description: Check Claude Companion readiness: Codex, Claude Code, auth, transcripts, daemon.` because the unquoted `: ` after "readiness" reads as a nested mapping. Rephrased to `Check Claude Companion readiness across Codex, Claude Code, auth, transcripts, and daemon.` (semantically identical, YAML-safe). The lenient inline parser in `skills-manifest.test.mjs` had hidden this — added a strict-parseability test (5 new tests, one per SKILL.md) that catches unquoted `: ` and `#` in scalar frontmatter values. Test count is now 447 (212 in test:plugin, was 207).

## Lint / typecheck / format / test pass after polish

- [x] `npm run lint` clean (no warnings, exit 0)
- [x] `npm run typecheck` clean (`tsc --build`, exit 0)
- [x] `npm run format` clean (`prettier --check`, exit 0)
- [x] `npm test` green — 447 tests / 4 lanes, 0 fail:
  - `test:mock` — 34 tests pass
  - `test:runtime` — 82 tests pass (no count change; A5 reshaped an existing test rather than adding one)
  - `test:driver` — 119 tests pass (A4 reshaped an existing assertion rather than adding one)
  - `test:plugin` — 212 tests pass (+8 from Stage 2's 204: 3 A3 regression tests + 5 strict-frontmatter polish tests)
- [x] CI green on the polished commit (verified after push)

## Notes for Stage 5

- All Plan 0001 audit findings closed.
- No new scope absorbed during polish; locked v1 constraints intact.
- Plan readme status advances `auditing → polishing` at Stage 4 start, `polishing → reporting` at Stage 4 close.
- Stage 5 (`5-report.md`) is reporting only and can run in the same session as Stage 4 per `documentation/plan/README.md` (only Stage 3 requires independent context).
