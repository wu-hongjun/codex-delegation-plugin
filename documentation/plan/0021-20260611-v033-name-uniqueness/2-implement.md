# Plan 0021 Stage 2 — Implement (v0.3.3 session-name uniqueness)

**Status**: complete (local gates green; awaiting CI + tag)
**Date**: 2026-06-11
**Commit basis**: fix ships at version `0.3.2`; the v0.3.3 bump is the follow-up release commit (two-commit pattern).

## A — uniquify every session name (F2b root cause)

**Root cause** (ground-truth trace): Plan 0020 F1 added entropy only to auto-generated
default names; explicit `--name` was passed verbatim. Claude Code keys bg sessions by
`--name`, and a second `claude --bg --name X` **injects its prompt into the still-open
session X** — so the earlier job's transcript ends on the new output and its `result.md`
is silently overwritten. Verified: two `--name dup-key-test` delegates produced distinct
job records, but job1's transcript (`10c7b501-….jsonl`) held both `DUP-KEY-ONE` and
`DUP-KEY-TWO`, and job1's `result.md` = `DUP-KEY-TWO` (job1's own sidecar `result: null`).

**Fix** (`packages/driver-claude-code/src/background-session.ts`): append
`-${randomBytes(4).toString('hex')}` to **every** session name, including a user `--name`.
A `--name` is now a human-readable prefix; the real name is `<name>-<8hex>`. Claude can
never reuse a session, so a reused `--name` starts a fresh isolated session instead of
contaminating the earlier job. Completes the root-cause fix F1 began.

Interaction with prior fixes: a suffixed user name is ID-shaped, but `parseShortId`
(Plan 0020 F2) excludes the exact session name and `nextIdToken` skips keyword tokens, so
the real hex shortId still wins. The default name keeps colons (non-ID-shaped).

## B — tests

`packages/driver-claude-code/test/start-session.test.mjs`:
- Updated the two exact-name assertions (explicit-name + legacy) to `startsWith(<name>-)`.
- Updated the legacy agents-json match to use `handle.sessionName` (the actual suffixed name).
- +1 test: two `startSession` calls with the same `name` yield distinct `sessionName`s.

## C — docs (false "idempotent key" claim)

`packages/plugin-codex/skills/claude-delegate/SKILL.md`: replaced the Plan 0020 paragraph
that wrongly called `--name` an idempotent session key. New text: `--name` is a label;
names are auto-uniqued; reusing a name starts a fresh session; to continue a job use
`$claude-followup <jobId>`.

## D — recipe goal_status over-promise (deep-test Med-3)

`documentation/REAL-CODEX-TEST-RECIPE.md` §4.10: removed the claim that `$claude-status`
shows `goal_status` records. `goal_status`/`goalStatus` appears in NO source file (recipe
only) — same class as the F3 status over-promise. Replaced with accurate guidance (track
via `$claude-status`/`$claude-result`; goal state lives in the Claude session).

## Deferred (logged, not in v0.3.3)

- Med-1 `status --all --json` slowness under load (O(jobs) reconcile + 130+ accumulated
  jobs; partly harness artifact) → perf pass + job-prune utility.
- Med-2 5s followup/review registration window under load → adaptive/raised window.
- Low-1 adversarial-review immediate parser tags model preamble as a `[NIT]`.
- Env: workflow/goal/deep-research hit a Claude Code 2.1.173 `needs_input` approval gate
  even with `--yes`; only batch/fork exercised real fan-out this run. Not a plugin defect.

## Gates

| Gate | Result |
|---|---|
| `tsc --build` | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; 26 derived + 64 bundled |
| `npm run lint` / `format` | exit 0 |
| driver start-session targeted | 22/22 pass |
| `npm test` (full chain) | see Stage close |

## Files modified

Source:
- `packages/driver-claude-code/src/background-session.ts` (uniquify all names) + rebuilt `dist/`

Docs:
- `packages/plugin-codex/skills/claude-delegate/SKILL.md`
- `documentation/REAL-CODEX-TEST-RECIPE.md` (§4.10)

Tests:
- `packages/driver-claude-code/test/start-session.test.mjs` (3 assertions updated, +1 test)

Marketplace mirrors regenerated (`--write`): bundled driver `dist/background-session.js`,
delegate SKILL.md.

## Safety invariants

- Plugin version `0.3.2` in this fix commit (bump is the follow-up commit).
- Skill count 14; marketplace 26 derived + 64 bundled; cost paragraph byte-identical.
- `plan-0004-pre-cutover` at `7d9b5f1`; `v0.2.0`/`v0.3.0`/`v0.3.1`/`v0.3.2` immutable.
- `packages/driver-claude-code/src/background-session.ts` is the documented exception
  (precedent Plans 0012 T5 / 0014 T2e / 0019 B2 / 0020).
- Bundled-runtime gitignore quirk: stage bundled `background-session.js` with `git add -u`/`-f`.
