# Plan 0007 Stage 1 — Plan

**Plan**: Plan 0007 — Claude Code w22+ parity (docs + doctor probe)
**Status**: in progress (awaiting Stage 1 approval)
**Promoted from**: `documentation/research/20260604-claude-code-w22-audit/plan-0007-candidate.md`
**Date**: 2026-06-05

## 1. Background

The 2026-06-04 audit (see `documentation/research/20260604-claude-code-w22-audit/report.md`) compared cc-plugin-codex v0.2.0 against Claude Code releases v2.1.150–v2.1.162. It found 13 gaps (G1–G13). The maintainer authorized a focused docs+probe pass covering only the MED-severity findings that are actionable today and do not require Claude Code ≥ v2.1.154 (the dynamic-workflow feature gate). Local Claude Code at scoping time: v2.1.153.

Audit inputs that informed this plan:

- `documentation/research/20260604-claude-code-w22-audit/report.md` (full audit, §1–§13)
- `documentation/research/20260604-claude-code-w22-audit/artifacts/workflow-tui-smoke-20260605.txt` (empirical TUI smoke)
- `documentation/research/20260604-claude-code-w22-audit/plan-0007-candidate.md` (scoping draft)
- Direct changelog read 2026-06-05 (OQ-A resolution; see §3 below)

## 2. Scope

In:

- **G2** — `claude agents --json` parser hardening. Tolerance for fields not present on v2.1.149 (e.g. `waitingFor` from v2.1.162).
- **G3** — Internal status enum re-check. Add or alias `working` (v2.1.161+) and `waiting` (observed on v2.1.153) so the dispatcher doesn't emit "unknown status" warnings.
- **G4** — `$claude-setup` doctor version-floor probe. Add three new probes that report feature availability based on local Claude Code version (Opus 4.8, dynamic workflows, `--bg --exec`).
- **G5** — `--fallback-model` interaction docs note. New troubleshooting subsection in plugin README.
- **G6** — `MessageDisplay` hook divergence docs note. New troubleshooting subsection in plugin README; mirrored into marketplace README if applicable.

Out:

- **G1** — Dynamic workflows. Blocked on v2.1.154+ install. Reopens as Plan 0008.
- **G7–G10** — LOW priority CLI verb additions; deferred to backlog.
- **G11–G12** — Codex 0.136.0 doesn't support `defaultEnabled: false` or `disallowed-tools` (per Sub-C in audit follow-up). Not actionable from our side.
- **G13** — Security-guidance downstream effect; backlog.
- Plugin version bump and release tag (separate maintainer-driven step per `RELEASING.md`).

Out-of-scope file list (must not touch):

- `tools/bench/**`
- `documentation/plan/0004-*/artifacts/**`
- `documentation/plan/0005-*`
- `packages/plugin-codex/README.md` L341 cost paragraph (Plan 0001/0002 invariant)
- `.github/workflows/ci.yml` (no CI shape changes)
- Plugin source behavior in `packages/runtime/`, `packages/driver-claude-code/`, `packages/plugin-codex/skills/<name>/SKILL.md` bodies
- Marketplace payload semantics (`marketplace/.codex-plugin/plugin.json`, `marketplace/plugins/claude-companion/scripts/`)

## 3. Open questions

### OQ-A — Exact feature-gate versions for the doctor probe (T3)

**RESOLVED** by direct changelog read 2026-06-05 (https://code.claude.com/docs/en/changelog):

| Feature | First in version | Plan 0007 use |
|---|---|---|
| `--fallback-model` | v2.1.133 | G5 docs note (no probe needed; older than our floor) |
| `disallowed-tools` skill frontmatter | v2.1.152 | Not used (Codex doesn't support it) |
| `MessageDisplay` hook | v2.1.152 | G6 docs note (no probe needed) |
| `SessionStart` `reloadSkills: true` | v2.1.152 | Not used in Plan 0007 |
| `/reload-skills` | v2.1.152 | Not used |
| `claude --bg --exec` | v2.1.154 | **T3 doctor probe** (`bg-exec-supported`) |
| `defaultEnabled: false` | v2.1.154 | Not used (Codex doesn't support it) |
| Opus 4.8 | v2.1.154 | **T3 doctor probe** (`opus-4-8-supported`) |
| Dynamic workflows | v2.1.154 | **T3 doctor probe** (`workflows-supported`) |
| `claude plugin init` | v2.1.157 | Not used |
| `.claude/skills/` auto-load | v2.1.157 | Not used (Codex equivalent path is `.agents/skills/`) |
| `--agent <name>` dispatch | v2.1.157 | Not used in Plan 0007 (G9 deferred) |
| `working` status + `done/total` | v2.1.161 | **T2 status enum recognition** |
| `claude agents --json` `waitingFor` field | v2.1.162 | **T1 parser tolerance** |

Note on conflict: a separate earlier subagent attributed the `workflow → ultracode` keyword rename to v2.1.160, but the direct changelog read attributes it to v2.1.154. Not load-bearing for Plan 0007 (we don't implement workflows).

### OQ-B — Should G6 (MessageDisplay note) be in the marketplace README too?

**RESOLVED**: yes for both surfaces. The marketplace README is end-user-facing; `MessageDisplay` is a Claude Code feature an end user might enable in their Claude Code config, and learning that `$claude-result` reads the raw transcript regardless is end-user-relevant. T4 will add the note to BOTH surfaces (plugin README full version; marketplace README short pointer).

### OQ-C — Wrap `claude -p --output-format json` in `$claude-result`?

**RESOLVED**: no. Out of scope for Plan 0007. Would be a behavior change in the dispatcher delegate path, not a docs/probe pass. Tracked in §8 as backlog.

### OQ-D — Should the doctor probe Codex-side hooks?

**RESOLVED**: no. Codex hook introspection is a separate plan if we ever need it. Not in Plan 0007 scope.

## 4. Tasks

Each T-task is independent (T1, T2, T3, T4 in parallel; T5 after T4; T6 after T1–T5). The A/B/C cadence applies; per `feedback_orchestrator_b_role`, the orchestrator may absorb B for docs-only tasks where the test-write is integral to the engineering change (T4 is the obvious candidate).

### T1 — `claude agents --json` parser tolerance

**Files**: `packages/plugin-codex/test/agents-json-parsing.test.mjs` (new) and possibly the parser itself if a real intolerance is found.

**Acceptance**:
- Parser accepts a row with a `waitingFor` field (v2.1.162) and does not throw.
- Parser accepts a row with a hypothetical unknown field (`notARealField: 42`) and does not throw.
- Parser still rejects malformed rows (missing required `sessionId` or `pid`).
- Plan target: +5 tests.

**Risks**: see R1 in §5.

### T2 — Internal status enum re-mapping

**Files**: `packages/plugin-codex/scripts/lib/status.mjs` (or wherever the enum lives) and a corresponding test file.

**Acceptance**:
- Enum recognizes `working`, `idle`, `waiting`, `awaiting_followup`, `running`, `completed`, `failed`, `stopped` at minimum.
- An unknown status is mapped to a sentinel `unknown` and logged-but-not-thrown.
- No behavior change in the delegate / follow-up / review paths.
- Plan target: +3–5 tests.

**Risks**: see R2 in §5.

### T3 — Doctor version-floor probe (the central task)

**Files**:
- `packages/plugin-codex/scripts/lib/claude-version.mjs` (new): `parseClaudeVersion(stdout)` → `{major, minor, patch}` tuple or `null`; `compare(a, b)` → -1/0/1; `meetsFloor(version, "2.1.154")` boolean.
- `packages/plugin-codex/scripts/claude-companion.mjs`: extend the doctor aggregator with three new probes.
- `packages/plugin-codex/test/claude-version.test.mjs` (new): unit tests for the helper.
- `packages/plugin-codex/test/setup-probes.test.mjs` (extend): assert the three new probes are emitted.

**New probes** (each reports `ok` at-or-above floor; `warn` below floor; never `fail`):

1. `opus-4-8-supported` — floor `2.1.154`. Message at `ok`: "Opus 4.8 supported (`--model claude-opus-4-8` available)". At `warn`: "Opus 4.8 requires Claude Code >= 2.1.154 (current <version>)".
2. `workflows-supported` — floor `2.1.154`. At `ok`: "Dynamic workflows available via `/workflows`". At `warn`: "Dynamic workflows require Claude Code >= 2.1.154 (current <version>)".
3. `bg-exec-supported` — floor `2.1.154`. At `ok`: "`claude --bg --exec` available". At `warn`: "`claude --bg --exec` requires Claude Code >= 2.1.154 (current <version>); `--exec` is silently dropped on older versions".

**Acceptance**:
- Helper parses `2.1.153 (Claude Code)` and `2.1.152 (Claude Code)` correctly.
- Helper returns `null` for unparseable input (e.g. dev builds with non-semver tags); doctor surfaces `warn: unparseable version`, not throw.
- Three new probes appear in `$claude-setup` output in the listed order.
- Existing `claude-version` probe still fires and is unchanged.
- Plan target: +6–8 tests.

**Risks**: see R2 in §5.

### T4 — README troubleshooting subsections

**Files**:
- `packages/plugin-codex/README.md`: two new troubleshooting subsections (G5 + G6).
- `marketplace/plugins/claude-companion/README.md`: shorter MessageDisplay note (G6 only — `--fallback-model` is dev-flavored).

**Content (G5, plugin README only)**: brief explainer that when `$claude-adversarial-review --model X` runs and `X` isn't installed, Claude Code's `--fallback-model` setting (if any) will silently take over for the session. Suggest verifying the model with `$claude-result --json` after the review. Neutral wording, no Plan 0004 cost-claim tokens.

**Content (G6, both surfaces)**: `$claude-result` reads the session JSONL + sidecar, not the displayed text. If a user has a Claude Code `MessageDisplay` hook installed (v2.1.152+) that redacts or transforms assistant output, `$claude-result` will still show the un-redacted content. Not a bug — by design, since the dispatcher pulls from canonical storage.

**Acceptance**:
- Both subsections present in plugin README.
- Marketplace README has the G6 short version.
- No OQ4 forbidden tokens introduced (verified by existing `docs-split.test.mjs` forbidden-token scan).
- Cost paragraph at L341 byte-identical (verified by existing test).
- Plan target: 0–2 new tests (mostly relying on existing forbidden-token scans; +1 test asserting both subsections present).

**Risks**: see R3 in §5.

### T5 — Marketplace payload byte-identity recheck

**Files**: re-run `tools/package-marketplace.mjs`.

**Acceptance**:
- After T4 changes marketplace README, run `node tools/package-marketplace.mjs --write` to re-sync the marketplace copy.
- Then `node tools/package-marketplace.mjs --check` exits 0.
- 18 derived + 64 bundled + 3 synthesized + 1 marketplace-owned files; no unexpected.
- Plan target: 0 new tests (existing layout tests carry this).

**Risks**: see R3 in §5.

### T6 — CI evidence (orchestrator-absorbed)

**Files**: none (it's a verification gate).

**Acceptance**:
- Local: `node tools/package-marketplace.mjs --check` exit 0; `node tools/smoke-marketplace.mjs --help` exit 0; `npm run lint` clean; `npm run typecheck` clean; `npm run format` clean; `npm test` 0 fail; `npm run test:attach` 0 fail; `npm run test:bench` 0 fail.
- Combined test count: 1498 (Plan 0006 close) + plan target ~14–18 = 1512–1516.
- Remote CI run on the Stage 2 commit: `success` across `ubuntu-latest + macos-latest × Node 20 + 22`.
- Real-Codex smoke optional but encouraged before Stage 5 close.

## 5. Risks

- **R1 — Parser-tolerance test brittleness.** If T1 tests use `assert.deepEqual` on full rows, future Claude Code field additions break our tests. **Mitigation**: tests use `assert.match` on extracted fields and `Object.keys ⊇ requiredKeys`, never `deepEqual`. Codified in T1 acceptance.
- **R2 — Version-floor probe false-positives.** A user on a custom Claude Code build (dev tag, npm install of a fork) may have a non-semver version string. **Mitigation**: helper returns `null` on unparseable, doctor reports `warn: unparseable version`, never throws. Codified in T3 acceptance.
- **R3 — Marketplace payload drift from README edits.** If T4 changes marketplace README and T5 doesn't re-sync, byte-identity check fails. **Mitigation**: T5 is explicitly named and depends on T4.
- **R4 — Plan 0001/0002 cost paragraph drift.** Plugin README cost paragraph at L341 must remain byte-identical. **Mitigation**: existing `docs-split.test.mjs` cost-paragraph test; T4 is forbidden from touching L341.
- **R5 — OQ4 forbidden-token leak in new troubleshooting prose.** **Mitigation**: existing per-surface forbidden-token scans; T4 prose is reviewed against the locked list.
- **R6 — Doctor probe ordering changes break `$claude-setup` snapshot tests.** **Mitigation**: T3 appends new probes to the end of the aggregator; existing probes' positions unchanged.
- **R7 — Codex 0.136.0 doesn't expose `claude --version` to the plugin via a documented interface.** Our dispatcher already invokes `claude --version` via the existing `claude-version` probe — same mechanism. T3 reuses that path. **No new risk.**

## 6. Test count target

Plan 0006 close baseline: 1498 (1212 npm test + 28 test:attach + 258 test:bench).

Plan 0007 target net delta: **+14 to +18 tests**, all in `npm test` lane (plugin sub-lane). Final combined: **1512 to 1516**.

Per `feedback_test_count_overshoot`, B's actual count may exceed plan target; C confirms per-describe redundancy.

## 7. Acceptance criteria (overall)

- All 6 T-tasks complete with their per-task acceptance.
- All gates green locally and on remote CI.
- Marketplace payload byte-identity intact.
- Cost paragraph byte-identical.
- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged).
- Plan 0005 status `deferred` (unchanged).
- No CI workflow changes.
- 5-stage cycle completed: Plan → Implement → Audit → Polish → Report; Stage 3 audit verdict at least `ready-for-polish` (no critical/high findings).

## 8. Backlog (carried forward, NOT in Plan 0007)

- G1 — Dynamic workflows wrapping. Reopens as Plan 0008 when brew publishes v2.1.154+.
- G7 — `claude respawn` / `claude rm` skills.
- G8 — `claude --bg --exec` skill (separate from the doctor probe).
- G9 — `claude --bg --agent <name>` forwarding.
- G10 — `claude daemon status` diagnostic.
- G13 — Security-guidance plugin downstream effect docs note.
- OQ-C — `claude -p --output-format json` wrap in `$claude-result`.
