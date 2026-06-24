# Plan 0028 - doctor preflight

**Status**: implemented
**Started**: 2026-06-24
**Owner**: Codex

## Summary

Add a focused read-only preflight command for long Claude Code delegations. The
goal is to fail before expensive jobs when Claude Code auth, subscription model
access, real-browser readiness, workspace context, or permission mode are
already unsuitable.

## Scope

In:

- Add `cc doctor` with `--claude-access`, `--real`, `--chrome`, `--no-chrome`,
  permission-mode flags, and JSON/human output.
- Separate operator categories for workspace, Claude CLI auth, model access,
  real-browser auth/readiness, and permission policy.
- Add `$claude-doctor` so Codex can discover and run the preflight through the
  normal skill surface.
- Reject `--real` and `--claude-access` on non-doctor commands instead of
  silently accepting or prompt-consuming those flags.
- Update README, release docs, marketplace package metadata, and tests.

Out:

- No direct Chrome profile or cookie inspection. The doctor can only say whether
  the Claude Code `--chrome` launch path appears available and when browser
  selection/user gestures may still require `claude attach`.
- No money-movement QA artifact bundle in this slice.
- No group-level child-process cleanup or command-level heartbeat stream in this
  slice.
- No new production dependencies.

## Acceptance Criteria

- `cc doctor --claude-access --real --json` returns structured preflight output
  with clear blockers and warnings.
- Missing Claude Code model access is a pre-launch failure, not a long-job
  surprise.
- Real Chrome preflight uses `--real` as a doctor-only alias for Claude Code's
  `--chrome` path and explains that browser profile/session auth cannot be
  verified non-interactively.
- Non-doctor use of `--real` or `--claude-access` exits 2 with an actionable
  message.
- Marketplace derived files and skill discovery include `$claude-doctor`.
- Local formatting, linting, typechecking, full tests, and marketplace package
  checks pass before release consideration.

## Result

- Implemented `cc doctor` and `$claude-doctor`.
- Reused setup probes for Claude Code auth and model-access checks, while
  keeping the doctor preflight read-only.
- Added compact JSON categories, `blockers`, `warnings`, `intent`, and
  `nextAction` fields for automation.
- Documented the highest-priority follow-up items rather than broadening this
  patch beyond the preflight surface.

## Deferred Follow-Ups

- Structured run manifests and evidence bundles for every delegated job.
- Money-movement QA mode with spend guards, balances, order/transaction IDs,
  cleanup state, open orders, and open positions.
- Richer heartbeat/progress semantics that include last command and phase.
- Group stop/cleanup that terminates child shell processes created by a job
  group.
- First-class batch lanes with explicit role contracts.
- `cc friction-report <job>` to extract confusing UX, permission blockers, auth
  blockers, and suggested fixes from job artifacts.
