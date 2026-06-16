# TICKET: Claude skills duplicate-name precedence polish

**Type**: product polish / agent ergonomics
**Status**: OPEN
**Priority**: Low-Medium
**Owner**: maintainer

## Context

`$claude-skills` currently reports duplicate skill names honestly. This is useful because it
does not hide installed capability, but it leaves Codex with extra ambiguity when a project,
user, and/or plugin skill share the same invocation name.

Observed example from local installs: duplicate `omc-reference` entries can appear from
different roots. The current JSON exposes both entries but does not annotate which one Claude
Code will choose when the user or agent invokes `/omc-reference`.

## Friction

Codex needs the lowest-friction route to Claude Code capabilities. Duplicate names make an
agent decide whether to invoke the short name, inspect roots manually, or avoid the skill.
That is tolerable for power users but noisy for autonomous workflows.

## Candidate Fix

Add duplicate-name metadata while continuing to report all discovered skills.

Potential JSON fields:

- Per skill: `duplicateGroup`, `precedenceRank`, `shadowedBy`, `shadows`
- Top-level: `duplicates`, grouped by invocation name

Potential human output polish:

- Mark duplicate groups with a concise note.
- Prefer a wording like `duplicate name; Claude Code precedence: project > user > plugin`
  only after that precedence is verified against real Claude Code behavior.

## Acceptance Criteria

- `$claude-skills --json` exposes duplicate-name relationships without dropping entries.
- Human `$claude-skills` output keeps duplicates visible and adds a concise disambiguation
  note.
- Precedence claims are verified against ground truth, not assumed from path ordering.
- If Claude Code precedence cannot be verified reliably, output says duplicates are present
  without claiming which one wins.
- Tests cover duplicate names across project, user, and plugin roots using captured or
  generated realistic fixtures.
- Existing consumers of `skills --json` remain backward-compatible.

## Constraints

- Do not edit `~/.claude` directly to manufacture test fixtures.
- Do not hide or filter duplicate skills by default.
- Keep discovery based on Claude Code's installed plugin state so plugin install/remove
  changes remain visible without restarting Codex.
