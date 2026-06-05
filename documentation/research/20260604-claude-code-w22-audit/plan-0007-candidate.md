# Plan 0007 — Claude Code w22+ parity (candidate scope, NOT a plan yet)

**Status**: candidate / scoping only. **Not** in `documentation/plan/`. Promotion to Stage 1 requires explicit maintainer authorization.
**Audit input**: [`report.md`](report.md) §9 (G1–G13) + §12 (follow-up on 2026-06-05).
**Local env at scoping time**: Claude Code v2.1.153 (the upgrade brought us one short of the v2.1.154 workflow feature gate; brew has not published v2.1.154 yet). Plugin v0.2.0 (tag `v0.2.0`, commit `ea595e1`). Plan 0006 complete, Plan 0004 paused, Plan 0005 deferred.

## Scope (proposed)

Plan 0007 would be a **single docs + probe pass** addressing only the audit findings that do **not** require Claude Code ≥ v2.1.154. The dynamic-workflows finding (G1) is **explicitly deferred** to a future plan because:

- Per Sub-A's doc verification, `claude -p` is documented to support workflows.
- Per Sub-B's TUI smoke + the 2026-06-05 baseline probe, `/workflows` is "isn't available in this environment" on v2.1.153.
- Wrapping work cannot start until the feature is installable.

Scope-in:

- **G2 — `claude agents --json` parser hardening.** Confirm our parser tolerates fields not present on v2.1.149 (the version we pinned during Plan 0001). On v2.1.153 the row is `{pid, cwd, kind, startedAt, sessionId, name, status}`; v2.1.161 added `done/total`-shaped status display; v2.1.162 added `waitingFor` field. Goal: parser is defensive against unknown keys and does not throw on schema growth.
- **G3 — Status enum re-check.** Current internal enum vs the now-public statuses (`running`, `working` with `done/total`, `awaiting_followup`, `completed`, `failed`, `stopped`, `idle`, `waiting`). Add or alias any that we don't recognize. No behavior change in delegate/follow-up paths.
- **G4 — `$claude-setup` doctor version-floor probe.** Parse `claude --version`, compare to feature thresholds:
  - `>= 2.1.154` → Opus 4.8 supported, dynamic workflows available, `--bg --exec` available
  - `>= 2.1.152` → `disallowed-tools` skill frontmatter, `MessageDisplay` hook, `--fallback-model` available
  - Below threshold → surface in doctor output as `warn` (not `fail`); we don't break operation, just inform.
- **G5 — `--fallback-model` interaction docs note.** Plugin README troubleshooting: explain that `$claude-adversarial-review --model X` may silently run on the user's configured fallback if `X` is missing.
- **G6 — `MessageDisplay` hook divergence docs note.** Plugin README troubleshooting: explain that `$claude-result` reads from the session JSONL and sidecar, not from the displayed text, so a user's `MessageDisplay` hook will NOT affect our output.

Scope-out (deferred, with rationale):

| ID | Item | Why deferred |
|---|---|---|
| G1 | Dynamic workflows | Blocked on Claude Code ≥ v2.1.154 install. Reopens as Plan 0008 once upgrade lands. |
| G7 | `claude respawn` / `claude rm` skills | LOW priority; new CLI verbs we don't currently need. |
| G8 | `claude --bg --exec` doctor probe | Belongs in G4 once 2.1.154 is installable. |
| G9 | `claude --bg --agent <name>` forwarding | LOW; needs v2.1.157+; tied to G1. |
| G10 | `claude daemon status` diagnostic | Already partly probed; not load-bearing. |
| G11 | `defaultEnabled: false` field | **Not actionable from our side**: Sub-C confirms Codex 0.136.0 doesn't support it. No Codex parallel. |
| G12 | `disallowed-tools` in skill frontmatter | **Not actionable**: Sub-C confirms Codex 0.136.0 doesn't support it. |
| G13 | Security-guidance downstream effect | Optional one-liner; deferred to backlog. |

## Tasks (proposed T1–T6)

Each task follows the standard A/B/C cadence unless explicitly absorbed.

- **T1 — `claude agents --json` parser tolerance test.** New static test asserting our parser ignores unknown keys (`waitingFor`, future additions). Existing T1-9 Plan 0001 tests already cover the 2.1.149 baseline; T1 here ADDS one fixture with a `waitingFor` field and one with a hypothetical `notARealField: 42`. ~5 tests.
- **T2 — Internal status enum re-mapping.** Add or alias `working`, `idle`, `waiting` to our internal enum so the dispatcher doesn't surface "unknown status" warnings. ~3-5 tests.
- **T3 — Doctor version-floor probe.** Parse `claude --version` into a semver tuple in `packages/plugin-codex/scripts/lib/`. Add three new probes to `$claude-setup`'s aggregator: `opus-4-8-supported`, `workflows-supported`, `bg-exec-supported`. Each is `ok` if the version is at or above threshold, `warn` if below. ~6-8 tests.
- **T4 — README troubleshooting (G5 + G6).** Two new troubleshooting subsections in `packages/plugin-codex/README.md`:
  - `### --model interaction with --fallback-model` (G5)
  - `### $claude-result vs MessageDisplay hooks` (G6)
  - Mirror into `marketplace/plugins/claude-companion/README.md` if applicable (G6 is end-user-relevant; G5 is also end-user-relevant for `$claude-adversarial-review`).
  - Marketplace `--check` will need to be rerun. No payload-shape changes. No new tests for prose (covered by existing forbidden-token tests).
- **T5 — Verify marketplace payload byte-identity post-edit.** Run `node tools/package-marketplace.mjs --check` after T4. If marketplace README changes, run `--write` to re-sync, then re-`--check`. Confirms our packaging invariant from Plan 0006 still holds.
- **T6 — CI evidence.** No CI workflow changes. Standard local gates + remote CI green on the final commit. Tag `v0.3.0` decision is **out of scope** for Plan 0007 — versioning policy lives in `documentation/RELEASING.md`; tag operation is a separate maintainer-driven step.

Estimated test growth: ~14-18 new tests. Combined total would be ~1512–1516 (current 1498 + ~14-18).

## Risks (proposed R1–R4)

- **R1 — Parser-tolerance test drift.** If we accidentally add an `assert.equal` on a field that Anthropic later adds to `--json`, future versions break our tests. **Mitigation**: tests use `assert.match` / `Object.keys ⊇ requiredKeys`, never `deepEqual` against full row.
- **R2 — Version-floor probe false-positives.** A user on a custom Claude Code build may have a non-semver version string. **Mitigation**: probe returns `warn: unparseable version` if the string doesn't match `<major>.<minor>.<patch>`, never throws.
- **R3 — Marketplace payload drift from README edits.** If we touch marketplace README without re-running `--write`, byte-identity tests fail. **Mitigation**: T5 explicitly re-syncs.
- **R4 — Plan 0004 cost paragraph invariant.** Plugin README cost paragraph at L341 must remain byte-identical. **Mitigation**: existing `docs-split.test.mjs` cost-paragraph test catches drift; no T-task touches L341.

## Open questions (proposed OQ-A → OQ-D)

- **OQ-A — Exact feature-gate versions.** The audit research is approximate on some: `--bg --exec` is firmly v2.1.154 (per changelog + empirical), but `--agent` flag, `--fallback-model`, and `disallowed-tools` were attributed to v2.1.152 by one subagent and v2.1.157 by another. **Resolution required before T3.** Quick way: read https://code.claude.com/docs/en/changelog directly for each flag's first-introduced version.
- **OQ-B — Should G6 (MessageDisplay docs note) be in marketplace README too?** End-user-facing; arguably yes. Trade-off: surface area in the end-user surface vs. keeping marketplace README short and minimal.
- **OQ-C — `claude -p --output-format json` parsing.** The baseline probe captured a rich shape. Should we expose this in `$claude-result --json` (currently uses sidecar)? Probably no — that's net-new feature work, not docs/probe. Confirm out of scope for Plan 0007.
- **OQ-D — Codex hooks alignment.** Sub-C found Codex 0.136.0 has its own hook system (10 events). Should `$claude-setup` probe whether the user's Codex install has any Codex-side hooks configured? Probably no — that's a separate Codex-introspection plan if we want it.

## Acceptance criteria

- All 6 T-tasks complete with A/B/C cadence (or orchestrator-absorbed where appropriate per `feedback_orchestrator_b_role`).
- Net test count delta: +14 to +18.
- All standard gates green locally: `package-marketplace --check`, `smoke-marketplace --help`, `lint`, `typecheck`, `format`, `npm test`, `test:attach`, `test:bench`.
- CI green on `ubuntu-latest + macos-latest × Node 20 + 22`.
- Real-Codex smoke (`smoke-marketplace --marketplace-root ...`) PASS — STEP 5.5 still says `exit 0, no ERR_MODULE_NOT_FOUND`. Plan 0006's T9.5 regression guard intact.
- Plugin version bump decision: deferred to release-time. Plan 0007 implementation does **not** bump the plugin version; that's a separate maintainer-driven step.

## What this candidate does NOT do

- Dynamic workflows wrapping (G1)
- Release tag `v0.3.0`
- Codex 0.136.0 → 0.137+ upgrade work
- Plan 0004 T11 / T12 (still paused)
- Plan 0005 un-defer (still deferred)
- Any source-code changes to runtime, driver, dispatcher delegate path, or skills' SKILL.md bodies (T2 adds enum recognition only; T3 adds new probes, doesn't change existing)
- README cost paragraph

## Promotion path (if maintainer approves)

1. Maintainer approves scope (in this conversation or a future one).
2. Orchestrator copies this file to `documentation/plan/0007-<YYYYMMDD>-claude-code-w22-parity/1-plan.md`, sets `Status: planning`, completes any missing OQ resolutions.
3. Stage 1 review by maintainer.
4. On Stage 1 approval, normal 5-stage cycle starts.

Until step 1, this remains research material under `documentation/research/`, with no plan number assigned and no claim on the plan-id sequence.
