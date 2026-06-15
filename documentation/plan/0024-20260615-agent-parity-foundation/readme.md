# Plan 0024 - agent parity foundation

**Status**: implemented
**Started**: 2026-06-15
**Owner**: Codex

## Summary

Close the highest-friction gaps found in the 2026-06-15 parity audit so Codex can
drive Claude Code with fewer surprises: safer flag handling, clearer permission
state, more reliable review evidence, and lower install/documentation friction.

## Context

Plan 0023 shipped v0.3.5 polish, but the follow-up parity audit showed that the
plugin is not yet at Claude Code parity. The important gap is not raw command
count; it is the ability for Codex to launch, monitor, approve, review, and
recover Claude Code work without guessing or dropping into a human TUI.

Key evidence from the audit:

- Normal read-only background audits hit Claude Code permission prompts unless
  the operator explicitly selected `--permission-mode bypassPermissions`.
- The dispatcher accepts unknown long flags by consuming the next token. Real
  Claude flags such as `--dangerously-skip-permissions` can therefore silently
  fail or eat the prompt.
- The driver forwards only a narrow subset of Claude startup flags.
- `needs_input` does not give Codex enough structured cause/action detail.
- Review output is advisory: it did not reliably include touched files or a
  machine-readable gate decision.
- Marketplace docs still have short-id/job-id attach ambiguity, and `.gitignore`
  carries stale bundled-path negations.

## Tickets

- [T1 - CLI flag and permission-mode parity](tickets/T1-cli-flag-permission-parity.md)
- [T2 - Machine-readable waiting state](tickets/T2-machine-readable-waiting-state.md)
- [T3 - Review evidence and gates](tickets/T3-review-evidence-and-gates.md)
- [T4 - Install and documentation friction](tickets/T4-install-documentation-friction.md)

## Scope

In:

- Reject unknown flags instead of silently consuming prompt text.
- Add exact Claude dangerous-skip aliases with explicit trusted-unattended
  handling, while preserving the existing `--permission-mode bypassPermissions`
  path.
- Forward high-value Claude startup flags needed by Codex:
  tool allow/deny lists, agent selection/definition, system prompt additions,
  settings, strict MCP config, cwd override, and bare/safe modes where compatible
  with `claude --bg`.
- Surface structured waiting/permission detail in status JSON and human output.
- Improve review evidence with real touched-file extraction, opt-in review
  gates, and machine-readable blocking state.
- Fix attach docs and contributor packaging footguns.

Out:

- No default bypass of Claude Code permissions.
- No attempt to parse the full human TUI byte stream.
- No F2b naming/timing changes; rare cross-contamination remains upstream.
- No hosted marketplace submission or npm package publication in this plan.

## Acceptance Criteria

- Unknown flags produce a usage error instead of changing the prompt or silently
  disappearing.
- `--dangerously-skip-permissions` and
  `--allow-dangerously-skip-permissions` map to explicit trusted unattended
  behavior and are visible in docs/tests.
- Newly supported passthrough flags appear in driver argv tests and dispatcher
  tests.
- Status JSON includes structured waiting detail when Claude Code exposes it;
  human status gives a useful next action.
- Review JSON exposes `blocking` and can exit non-zero via an opt-in gate.
- Touched-file extraction is covered by realistic transcript-style tool events
  for successful and failed edit/write tools.
- User docs consistently say to attach with Claude short/session id, not plugin
  job id.
- `.gitignore` no longer references the old `claude-companion` marketplace path.
- `npm run lint`, `npm run typecheck`, `npm test`, and
  `node tools/package-marketplace.mjs --check` pass.

## Result

Implemented on 2026-06-15.

Completed:

- Dispatcher flag parsing now fails closed for unknown flags.
- Fresh Claude sessions accept the high-value Claude Code startup flags Codex
  needs for lower-friction delegation.
- `--dangerously-skip-permissions` maps to
  `--permission-mode bypassPermissions`; misspellings such as
  `--sangerously-skip-permissions` fail before a job is created.
- `waitingFor` is normalized from `claude agents --json` and sidecar hints into
  job state and status output.
- Review and adversarial-review support `--blocking` and `--fail-on <gate>`.
  JSON includes `review.blocking`.
- Reconciler touched-file extraction now reads mutating tool events for
  `Edit`, `MultiEdit`, `Write`, and `NotebookEdit`.
- Install docs now include a one-command bootstrap script plus explicit
  marketplace commands.
- Attach docs consistently use Claude `shortId`/`sessionId`, not plugin job id.
- The stale `claude-companion` marketplace `.gitignore` negations were replaced
  with `cc` paths.

Deferred follow-up:

- Bounded diff-context injection for adversarial review.
- Persisting a review summary on the target job beyond the existing review job
  record and JSON output.
