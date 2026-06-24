# Plan 0027 - bypass unattended hardening

**Status**: implemented
**Started**: 2026-06-23
**Owner**: Codex

## Summary

Close the production friction where `cc delegate --dangerously-skip-permissions`
recorded a bypass permission mode but did not reliably produce an unattended
Claude Code background worker. Also harden the `--add-dir` launch path so the
prompt cannot be consumed by Claude Code's variadic directory flag.

## Scope

In:

- Translate plugin bypass aliases to Claude Code's literal
  `--dangerously-skip-permissions` launch flag.
- Keep a `--` delimiter before the prompt in driver argv so variadic Claude Code
  flags cannot consume prompt text.
- Record launch-policy metadata on job records and compact status JSON so Codex
  can tell whether unattended bypass was requested.
- Make permission-wait guidance acknowledge when bypass was already requested.
- Add focused mock, driver, and dispatcher tests.

Out:

- No non-interactive approval of Chrome browser-selection prompts.
- No hidden interaction with `claude attach`.
- No changes to the upstream Claude Code permission system.

## Runtime/Driver Exception

This plan intentionally touches `packages/runtime/**` and
`packages/driver-claude-code/**`. The defect is below the plugin dispatcher: the
runtime type surface must carry launch policy, and the Claude Code driver must
construct the correct background-session argv.

## Acceptance Criteria

- `--dangerously-skip-permissions`, `--bypass-permissions`, and
  `--permission-mode bypassPermissions` start Claude with the literal dangerous
  skip flag.
- `--add-dir <dir> -- "<prompt>"` preserves the prompt exactly.
- Compact status JSON includes launch policy without breaking existing fields.
- A bypass-launched job that still reaches `needs_input` clearly says unattended
  bypass was requested and manual input is still required.
- Focused tests and marketplace package checks pass before release consideration.

## Result

- Implemented literal `--dangerously-skip-permissions` forwarding for all
  bypass aliases.
- Inserted `--` before background prompts to protect prompts from variadic
  Claude Code startup flags such as `--add-dir`.
- Added launch-policy metadata to job records and compact status JSON.
- Added fail-fast handling when an unattended bypass launch immediately reaches
  `needs_input`.
- Updated skill/README guidance and regenerated the marketplace bundle.
