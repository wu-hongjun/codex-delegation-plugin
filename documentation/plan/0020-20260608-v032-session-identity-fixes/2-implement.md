# Plan 0020 Stage 2 — Implement (v0.3.2 session-identity fixes)

**Status**: complete — v0.3.2 shipped (CI `27141514060` green; tag `v0.3.2` → `26ff69e`)
**Date**: 2026-06-08
**Commit basis**: fixes ship at version `0.3.1`; the v0.3.2 bump is the follow-up release commit (two-commit pattern, per Plans 0018/0019).

## F1 — collision-safe auto-generated session names (Finding 1, root cause)

**Root cause**: `background-session.ts` derived the default session name as
`codex:${basename(cwd)}:${Date.now().toString(36)}` — millisecond granularity, no
entropy. Claude Code keys background sessions by `--name`, so two delegates launched in
the same cwd within one millisecond got an identical name and the second **attached to
the first's session** → shared sessionId/PID → cross-contaminated results.

**Fix** (`packages/driver-claude-code/src/background-session.ts`): append
`-${randomBytes(4).toString('hex')}` (node:crypto) after the `codex:<basename>:` prefix.
The prefix is preserved (Test 3 stays green) and the colons keep the token non-ID-shaped,
so `parseShortId` never mistakes it for a session id. Explicit `opts.name` is passed
through verbatim (Test 2 stays green) — an explicit name is an idempotent session key by
design (Finding 2a).

## F2 — `parseShortId` never mis-captures an echoed name (Finding 2b)

**Root cause**: `parseShortId` Strategy 1 returns the first ID-shaped token after the
keyword "session"/"backgrounded". An ID-shaped `--name` (e.g. `cc-v031-delegate-todos`)
is echoed by Claude after "session", so the **name** was stored as `claude.shortId`
instead of the real hex. Default names contain colons → not ID-shaped → unaffected (that
is why only dash-names corrupted; 45 records in the live store had `shortId === name`).

**Fix** (`parseShortId` + `nextIdToken`): added an optional 3rd param `excludeName`. A
candidate equal to the name is held back as a **last-resort fallback** while the scan
continues for a non-name candidate; the name is still returned if nothing else matches
(strictly improving — never regresses to `undefined`). `nextIdToken` now also skips
primary-keyword tokens ("session"/"backgrounded") so that, after excluding an echoed
name, the scan reaches the real hex following a later keyword. The call site passes
`sessionName`. Existing 2-arg callers and Test 10's direct cases are unchanged.

## F3 — `status` rejects an unexpected positional (Finding 3, code)

**Root cause**: `cmdStatus(flags, json)` took no positional — `cc status <jobId>` and
`cc status <bogus>` were silently dropped, the full list printed, exit 0. Misleads the
caller into thinking they filtered.

**Fix** (`cc.mjs`): `cmdStatus(flags, positional, json)` now rejects any positional with
exit 2 and an error pointing at `cc result <jobId>` (single-job) or `cc status --all`
(cross-workspace list). Dispatch call updated to pass `positional`.

## F4 — docs (Finding 3 docs + Finding 2a)

- `documentation/REAL-CODEX-TEST-RECIPE.md` §4.3: corrected the `$claude-status job_<id>`
  single-job over-promise; status is a list command, single-job lookup is `$claude-result`.
- `packages/plugin-codex/skills/claude-delegate/SKILL.md`: documented `--name` as an
  idempotent session key (reuse resumes the same session; use a distinct name per
  concurrent job, or omit for an auto-unique name).

## Documented as known behavior (no code change)

- **Finding 2a** — explicit duplicate `--name` resumes the same session by design
  (idempotent key). Documented in F4.
- **M1** — probe-surface overload under heavy fan-out: partly a test-harness artifact (14
  concurrent `status --all --json` workers each reconciling ~129 jobs). Scalability
  caveat, not a v0.3.2 blocker.
- **M2** — long-runners: known B4.
- **L1** — malformed workflows short IDs: a presentation artifact of the (now-fixed)
  name-as-shortId records; new jobs created post-F1/F2 carry hex shortIds.

## Tests

- `packages/driver-claude-code/test/start-session.test.mjs`:
  - F1: +1 — two back-to-back auto-generated names are distinct and colon-delimited.
  - F2: +3 — real hex wins over an echoed ID-shaped name; name-only falls back (no
    regression); unrelated excludeName is ignored.
- `packages/plugin-codex/test/dispatcher.test.mjs`:
  - F3: +2 — `status <jobId>` exits 2 and suggests `cc result <jobId>`; `--json` form
    also exits 2.

## Gates

| Gate | Result |
|---|---|
| `tsc --build` (driver dist rebuilt) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; 26 derived + 64 bundled |
| driver start-session targeted | 21/21 pass |
| dispatcher targeted | exit 0 |
| `npm test` (full chain) | see Stage close |
| `npm run lint` / `format` | see Stage close |

## Files modified

Source:
- `packages/driver-claude-code/src/background-session.ts` (F1 name entropy, F2 parseShortId + nextIdToken) + rebuilt `dist/`

Plugin:
- `packages/plugin-codex/scripts/cc.mjs` (F3 status positional rejection + dispatch)

Docs:
- `documentation/REAL-CODEX-TEST-RECIPE.md` (F4 §4.3)
- `packages/plugin-codex/skills/claude-delegate/SKILL.md` (F4 --name)

Tests:
- `packages/driver-claude-code/test/start-session.test.mjs` (+4)
- `packages/plugin-codex/test/dispatcher.test.mjs` (+2)

Marketplace mirrors regenerated (`--write`): bundled driver `dist/background-session.js`,
bundled `cc.mjs`, delegate SKILL.md.

## Safety invariants

- Plugin version `0.3.1` in this fix commit (bump is the follow-up commit).
- Skill count 14; marketplace allowlist 26 derived + 64 bundled; cost paragraph byte-identical.
- `plan-0004-pre-cutover` at `7d9b5f1`; `v0.2.0`/`v0.3.0`/`v0.3.1` immutable.
- `packages/driver-claude-code/src/background-session.ts` is the documented exception
  (precedent Plans 0012 T5 / 0014 T2e / 0019 B2); scope limited to name generation +
  `parseShortId`.
- Bundled-runtime gitignore quirk: stage the bundled `background-session.js` with
  `git add -u`/`-f` so the executing runtime carries F1+F2.
