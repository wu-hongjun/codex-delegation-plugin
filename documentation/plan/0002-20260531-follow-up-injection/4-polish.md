# Stage 4 — Polish

> **Status**: complete. All five polish-actionable audit findings from Stage 3 addressed in one bundled commit. Lint / typecheck / format / test gates green on the polished commit.

## Scope

Cleanup pass against the five low findings designated as Stage 4 work in the `3-audit.md` verdict (commit `5df7761`). Process findings F-H1 and F-H2 are deferred (separate workstream). Nit N-1 is no-action per auditor's direction. Locked invariants (no `claude -p`, no `node-pty` outside driver, runtime → driver isolation, cost-claim discipline, byte-identical cost paragraph) all preserved.

## Audit findings resolved

| Severity | Finding | Resolution | Commit |
|---|---|---|---|
| low | F-D1 — T15a regression tests do not cover `starting` or `injecting` turn statuses | Added two tests (`T15a-7` and `T15a-8`) in the `T15a — sidecar-evidence-of-completion` describe block in `packages/runtime/test/reconciler.test.mjs`. Each sets the last turn's status to the relevant value, provides a `DONE_SIDECAR`, and asserts the job flips to `awaiting_followup` with the turn flipped to `completed`. `test:runtime` goes from 156 → 158. | Stage 4 commit |
| low | F-D2 — T11 bulk-stop tests cover only 4 of 8 non-`awaiting_followup` statuses | Added four spot-check tests (`T11-7b` through `T11-7e`) in the `stop bulk --all-awaiting-followup` describe block in `packages/plugin-codex/test/dispatcher.test.mjs`, covering `queued`, `starting`, `failed`, and `orphaned`. Each test writes a synthetic job with the target status, adds a live `awaiting_followup` job, runs bulk stop, and asserts the target-status job is not stopped while the `awaiting_followup` job is. `test:plugin` goes from 336 → 340. | Stage 4 commit |
| low | F-A1 — README troubleshooting does not contain the tmux/screen-specific entry promised by R10's mitigation | Added `### $claude-followup inside a terminal multiplexer (tmux / GNU screen)` troubleshooting entry in `packages/plugin-codex/README.md` describing the failure mode (outer multiplexer intercepting `Ctrl+Z`) and two workarounds (run outside the multiplexer; change the multiplexer escape key). | Stage 4 commit |
| low | F-F1 — README troubleshooting does not mention `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` | Added `### Follow-up prompt did not register (slow TTY warmup)` troubleshooting entry in `packages/plugin-codex/README.md` naming the failure symptom, the env var, the default (2000 ms, verified from `packages/driver-claude-code/src/attach.ts:208`), acceptable override values (`0` for mock-driven environments; higher for slow machines). | Stage 4 commit |
| low | F-H3 — `dispatcher.test.mjs` `writeSyntheticCompletedJob` fixture writes a v1-shaped record with a misleading `@type JobRecord` cast | Updated `writeSyntheticCompletedJob` in `packages/plugin-codex/test/dispatcher.test.mjs` to write a v2-shaped record (`schemaVersion: 2`, `turns: [{ prompt, startedAt, endedAt, status: 'completed', result }]`). Removed the `@type {import('@cc-plugin-codex/runtime').JobRecord}` JSDoc cast (which was the lying annotation). No test count change. | Stage 4 commit |

## Audit findings deferred

| Severity | Finding | Reason for defer | Tracked in |
|---|---|---|---|
| low (process) | F-H1 — Subagent C violated read-only contract in T11 | Process finding; belongs to Plan 0003 reviewer-contract workstream. Not a code defect. | Future plan |
| low (process) | F-H2 — Three rounds of source review missed the adapter-wiring gap | Process finding; belongs to Plan 0003 reviewer-contract workstream. Not a code defect. | Future plan |
| nit | N-1 — `reconciler.ts` `return 'running'` inline comment about stuck-queued bug masking | No action by auditor's direction. Harmless defensive code. | — |

## Polish-only changes (not from audit)

None. All changes in this stage address the five designated audit findings.

## Lint / typecheck / format / test pass after polish

- [x] `npm run lint` clean (no warnings, exit 0)
- [x] `npm run typecheck` clean (`tsc --build`, exit 0)
- [x] `npm run format` clean (`prettier --check`, exit 0)
- [x] `npm test` green — 731 tests / 4 lanes, 0 fail:
  - `test:mock` — 58 tests pass (no change)
  - `test:runtime` — 158 tests pass (+2 from F-D1: T15a-7, T15a-8)
  - `test:driver` — 175 tests pass (no change)
  - `test:plugin` — 340 tests pass (+4 from F-D2: T11-7b, T11-7c, T11-7d, T11-7e)
- [x] `npm run test:attach` — 25 tests pass (no change)

## Notes for Stage 5

- All five polish-actionable audit findings closed; no critical/high/medium findings were open at audit time.
- F-H1 and F-H2 (reviewer-contract process findings) are deferred to Plan 0003 scope per the audit brief.
- N-1 is explicitly no-action.
- No scope was absorbed beyond the five designated findings.
- Stage 5 (`5-report.md`) is reporting only; it does not require an independent context window per `documentation/plan/README.md`. It can run in the same session or a fresh one at the maintainer's discretion.
- Cost-claim discipline intact: the cost paragraph in `packages/plugin-codex/README.md` is byte-identical (T13-21 gate still passes at 340/340).
