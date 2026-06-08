# Plan 0020 — v0.3.2 session-identity fixes (deep-test findings F1–F4)

**Status**: `in progress`
**Started**: 2026-06-08
**Drafted from**: the v0.3.1 deep test (`documentation/testing/findings-20260607-v031-deep.md`) + maintainer audit. Three High findings reduced to a single root cause — *session identity keyed on a non-unique session name* — plus a status-contract gap.

## Root-cause synthesis

The tester filed three High findings; the audit established that the first two share **one** root cause and the third is partly a stale-doc over-promise:

- **Finding 1** (rapid parallel delegate contamination): the auto-generated session name is `codex:${basename(cwd)}:${Date.now().toString(36)}` — **millisecond granularity, no entropy**. Two delegates launched in the same cwd within one millisecond get an **identical** name; Claude Code keys background sessions by `--name`, so the second **attaches to the first's session** → shared sessionId/PID → cross-contaminated results. Evidence: jobs B/C shared sessionId `6149c0d7` + PID `7228`, C returned B's output. This is the **auto path the user cannot control** — the primary bug.
- **Finding 2** (`--name` corrupts shortId + collides): two faces.
  - **2a** explicit duplicate `--name` merges sessions — same mechanism as F1, but user-initiated. An explicit name is, by Claude Code's own semantics, an **idempotent session key**; reusing it resumes the same session. Documented as intended, not a code change.
  - **2b** an **ID-shaped** `--name` (e.g. `cc-v031-delegate-todos`, all `[a-z0-9-]`) is captured by `parseShortId` Strategy 1 (token after the word "session"/"backgrounded"), so `claude.shortId` stores the **name** instead of the real hex. Default names contain **colons** → not ID-shaped → skipped → real hex wins (that's why only dash-names corrupt). 45 records in the live store show `shortId === sessionName`.
- **Finding 3** (`$claude-status <jobId>` ignored): `cmdStatus` takes **no positional** — any jobId/bogus arg is silently dropped, the full list prints, exit 0. The SKILL contract for status is "List jobs for the current workspace" (single-job lookup is `$claude-result <jobId>`); the `$claude-status job_<id>` single-job promise lives **only** in `REAL-CODEX-TEST-RECIPE.md §4.3`, which over-promised. Real defect = silent arg-drop; partly a doc fix.

## Fixes (v0.3.2)

| ID | Finding | File | Change |
| --- | --- | --- | --- |
| **F1** | 1 + 2a (auto path) | `packages/driver-claude-code/src/background-session.ts` | Append crypto entropy to the **default** generated name, after the `codex:<basename>:` prefix. Keeps colons (parse-safe) and the Test-3 prefix. Explicit `--name` stays verbatim. |
| **F2** | 2b | `packages/driver-claude-code/src/background-session.ts` (`parseShortId`) | Prefer a candidate token that is **not** the session name; fall back to the name only if no other candidate exists. New optional 3rd param `excludeName`; existing 2-arg callers unchanged. Strictly improving — can never regress to `undefined`. |
| **F3** | 3 (code) | `packages/plugin-codex/scripts/cc.mjs` (`cmdStatus`) | Reject an unexpected positional with a clean error directing to `$claude-result <jobId>` (single-job) or `--all`. Pass `positional` into `cmdStatus`. |
| **F4** | 3 (docs) + 2a | `documentation/REAL-CODEX-TEST-RECIPE.md` §4.3; `packages/plugin-codex/skills/claude-delegate/SKILL.md` | Correct the status single-job over-promise; document `--name` as an idempotent session key (reuse resumes the same session). |

## Documented runtime exception

`packages/driver-claude-code/**` is normally off-limits; F1 + F2 are a **documented exception** (precedent: Plans 0012 T5, 0014 T2e, 0019 B2). Scope is limited to `background-session.ts` (name generation + `parseShortId`).

## Not changed (by design)

- **2a** explicit duplicate `--name` → intended idempotent-session-key behavior; documented in F4, no code change.
- **M1** (probe overload under heavy fan-out) — partly a test-harness artifact (the tester's own 14 concurrent `status --all --json` workers, each reconciling ~129 jobs). Scalability caveat, not a v0.3.2 blocker.
- **M2** long-runners — known B4.
- **L1** malformed workflows short IDs — re-evaluate after F1/F2; closes or downgrades.

## Stages

| Stage | File | Status |
| --- | --- | --- |
| 1 — Plan | this readme | drafted 2026-06-08 |
| 2 — Implement | `2-implement.md` | pending |
| 3 — Audit | targeted unit tests + re-smoke of F1 contamination | pending |
| 5 — Report | folded into 2-implement.md | — |

## Release

Bump plugin `0.3.1` → `0.3.2` per RELEASING.md after CI green. `v0.2.0` / `v0.3.0` / `v0.3.1` tags immutable. Two-commit pattern: fixes at `0.3.1`, then the version-bump commit. Remember the bundled-runtime gitignore quirk — `git add -u`/`-f` so `marketplace/plugins/cc/node_modules/@cc-plugin-codex/driver-claude-code/dist/background-session.js` carries F1+F2.
