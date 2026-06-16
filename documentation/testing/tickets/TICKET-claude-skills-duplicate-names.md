# TICKET: Claude skills duplicate-name ambiguity polish

**Type**: product polish / agent ergonomics
**Status**: DONE — implemented after v0.3.7
**Priority**: Low-Medium
**Owner**: maintainer

## Context

`$claude-skills` currently reports duplicate skill names honestly. This is useful because it
does not hide installed capability, but it leaves Codex with extra ambiguity when a project,
user, and/or plugin skill share the same invocation name.

Observed example from local installs: duplicate `omc-reference` entries can appear from
different roots. The JSON exposes every entry, but live testing showed the catalog must not
claim which one Claude Code will choose when the user or agent invokes `/omc-reference`.

## Friction

Codex needs the lowest-friction route to Claude Code capabilities. Duplicate names make an
agent decide whether to invoke the short name, inspect roots manually, or avoid the skill.
That is tolerable for power users but noisy for autonomous workflows.

## Candidate Fix

Add duplicate-name metadata while continuing to report all discovered skills.

JSON fields:

- Per skill: `duplicateGroup`, `duplicateCount`, `duplicateSourceRank`,
  `duplicateSource`, `duplicateAmbiguous`
- Top-level: `duplicates`, grouped by invocation name

Human output polish:

- Mark duplicate groups with a concise ambiguity note.
- Do not describe duplicate entries as preferred or shadowed unless Claude Code exposes a
  reliable source of truth for that resolution.

## Acceptance Criteria

- [x] `$claude-skills --json` exposes duplicate-name relationships without dropping entries.
- [x] Human `$claude-skills` output keeps duplicates visible and adds a concise
  disambiguation note.
- [x] Duplicate source order is documented as catalog metadata only; direct slash invocation
  resolution is reported as ambiguous rather than over-claimed.
- [x] Tests cover duplicate names across project, user, and plugin roots using generated
  realistic fixtures.
- [x] Existing consumers of `skills --json` remain backward-compatible.

## Constraints

- Do not edit `~/.claude` directly to manufacture test fixtures.
- Do not hide or filter duplicate skills by default.
- Keep discovery based on Claude Code's installed plugin state so plugin install/remove
  changes remain visible without restarting Codex.

## Implementation Notes

- JSON now includes `counts.duplicateNames`, top-level `duplicates`, and per-skill
  `duplicateGroup`, `duplicateCount`, `duplicateSourceRank`, `duplicateSource`, and
  `duplicateAmbiguous` fields when a skill name appears more than once.
- Top-level duplicate groups include `resolution.status: "ambiguous"` and a note that Claude
  Code may namespace, reject, or otherwise disambiguate direct slash invocation differently.
- Human output adds a duplicate-name count and marks duplicate entries as ambiguous.
- The implementation preserves every discovered skill entry and does not filter duplicates.
- Live depth testing with a temporary project-local `omc-reference` duplicate showed direct
  `/omc-reference` invocation can be rejected by Claude Code as a non-user-invocable existing
  skill, so this ticket intentionally avoids claiming project > user > plugin shadowing.
