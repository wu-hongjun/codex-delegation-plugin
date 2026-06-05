# Plan 0007 Stage 2 — Implement

**Status**: complete (local gates green; awaiting CI verification)
**Date**: 2026-06-05
**Stage 1 commit**: `3058b74` (Plan 0007 Stage 1 approved + research import)

All 6 T-tasks executed via subagent orchestration (A/B/C cadence; B absorbed into A per `feedback_orchestrator_b_role` where the test-write was integral to the engineering change). Local Claude Code on the implementation machine: v2.1.153 (one short of the v2.1.154 floor that T3 probes for).

## T1 — `claude agents --json` parser tolerance

**Agent**: `oh-my-claudecode:executor` (Sonnet)

**Findings**: The existing parser at `packages/driver-claude-code/src/agents-json.ts` already declares `[key: string]: unknown` on `RawClaudeAgentSession` — it is forward-tolerant by construction. **No source change required**; T1 collapsed to test additions only.

**Plan acceptance correction**: the T1 plan spec said "Parser still rejects malformed rows (missing required `sessionId` or `pid`)." The actual parser contract is **lenient** (returns `sessionId: undefined` / `pid: undefined` on missing fields, never throws). This matches the existing test pattern in `packages/driver-claude-code/test/agents-json.test.mjs`, which the new tests follow.

**Files added**:
- `packages/plugin-codex/test/agents-json-parsing.test.mjs` (NEW, 155 lines)

**Tests added**: 6 (plan target 5; overshoot of +1 — extra assertion needed to cover the missing-sessionId contract end-to-end)
1. `parseAgentsJson` parses a row with `waitingFor` (v2.1.162 forward-compat) without throwing
2. `parseAgentsJson` parses a row with arbitrary unknown field (`notARealField: 42`) without throwing
3. `parseAgentsJson` does not throw when `sessionId` is absent; surfaces `sessionId: undefined`
4. `findSessionStatus` returns `orphaned` for a handle whose sessionId matches nothing
5. `parseAgentsJson` does not throw when `pid` is absent; surfaces `pid: undefined`
6. `parseAgentsJson` regression — 2.1.149+ minimal row format still parses correctly

**Mitigation R1 honored**: all assertions use `assert.match` / `Object.keys` checks; never `assert.deepEqual` against full rows.

**Local gates**: lint 0, typecheck 0, format 0, targeted test run 6/6 pass.

---

## T2 — Internal status enum re-mapping

**Agent**: `oh-my-claudecode:executor` (Sonnet)

**Findings**: Scenario B — the existing `STATUS_MAP` in `packages/driver-claude-code/src/agents-json.ts` had to be widened to recognize `working` (v2.1.161+), `waiting` (observed on v2.1.153), and `awaiting_followup` (internal job status — defensive in case Claude ever emits it). Three string additions; no new code paths; no behavior change in delegate / follow-up / review.

**Files changed**:
- `packages/driver-claude-code/src/agents-json.ts` — extended STATUS_MAP arrays (+14 lines including new comments noting the version-attribution)
- `packages/driver-claude-code/test/agents-json.test.mjs` — appended 5 new tests (+60 lines)

**Tests added**: 5 (matches plan target).

**Mitigation against behavior drift**: `working` is grouped with `running`/`busy` in the existing `'working'` bucket — same canonical output as before. `waiting` is grouped with `needs_input` — same canonical output. No new sentinel needed in the dispatcher.

**Local gates**: lint 0, typecheck 0, format 0; full plugin + driver tests pass.

---

## T3 — Doctor version-floor probe (central task)

**Agent**: `oh-my-claudecode:executor` (Sonnet) — agent hit a socket error after completing its primary work; orchestrator finished the missing `setup-probes.test.mjs` regression guard.

**Files added**:
- `packages/plugin-codex/scripts/lib/claude-version.mjs` (NEW) — exports:
  - `parseClaudeVersion(stdout: string)` → `{ major, minor, patch } | null`
  - `compare(a, b)` → `-1 | 0 | 1`
  - `meetsFloor(version, "M.m.p")` → `boolean`
- `packages/plugin-codex/test/claude-version.test.mjs` (NEW)
- `packages/plugin-codex/test/setup-probes.test.mjs` (NEW — orchestrator-written; covers the three-probe regression guard)

**Files modified**:
- `packages/plugin-codex/scripts/claude-companion.mjs` (+134 lines) — three new probes APPENDED to the doctor aggregator. Existing `claude-version` probe and all existing probes are unchanged in position, ID, and message.

**New probes** (each `ok` at or above floor, `warn` below floor; never `fail`):
- `opus-4-8-supported` (floor 2.1.154) — current 2.1.153 → `warn`
- `workflows-supported` (floor 2.1.154) — current 2.1.153 → `warn`
- `bg-exec-supported` (floor 2.1.154) — current 2.1.153 → `warn`

**Empirical probe output** (`node packages/plugin-codex/scripts/claude-companion.mjs setup`):
```
ok    claude-version                 2.1.153 (Claude Code)
warn  opus-4-8-supported             Opus 4.8 requires Claude Code >= 2.1.154 (current 2.1.153 (Claude Code))
warn  workflows-supported            Dynamic workflows require Claude Code >= 2.1.154 (current 2.1.153 (Claude Code))
warn  bg-exec-supported              claude --bg --exec requires Claude Code >= 2.1.154 (current 2.1.153 (Claude Code)); --exec is silently dropped on older versions
```

**Tests added**: 13 (claude-version.test.mjs) + 5 (setup-probes.test.mjs) = 18 (plan target 6-8; significant overshoot — see test-count justification below).

**Mitigation R2 honored**: `parseClaudeVersion` returns `null` on unparseable input; probes report `warn`, never throw.
**Mitigation R6 honored**: new probes appended; existing probe order preserved (verified by setup-probes.test.mjs ordering assertion).

**Local gates**: lint 0, typecheck 0, format 0 (after one prettier --write on claude-version.test.mjs); all new tests pass.

---

## T4 — README troubleshooting subsections

**Agent**: `oh-my-claudecode:executor` (Sonnet)

**Files modified**:
- `packages/plugin-codex/README.md` (+12 lines at L504+; AFTER the existing Troubleshooting subsections, BEFORE the Development section). Cost paragraph at L341 untouched (verified by `git diff` showing no changes to lines 339-345).
- `marketplace/plugins/claude-companion/README.md` (+4 lines at L193+; inside the existing Troubleshooting section, before the Upgrade section).

**New subsections** (verbatim headings):
- Plugin README:
  - `### --model interaction with --fallback-model` (G5)
  - `### $claude-result reads raw transcript, not the display layer` (G6, full version)
- Marketplace README:
  - `### $claude-result reads raw transcript, not the display layer` (G6, short version)

**OQ4 forbidden-token scan** (existing `docs-split.test.mjs` test still passing): no leak. New prose contains none of: `benchmark`, `cutover`, `pre-cutover`, `post-cutover`, `Plan 0004`, `cost saving`, `cost reduction`, `cheaper than`, `saves money`, `more efficient than`.

**Tests added**: 0 new tests (existing forbidden-token scans + docs-split.test.mjs cover the surface).

---

## T5 — Marketplace payload byte-identity recheck

**Files changed** (after T2, T3 source changes):
- Re-ran `node tools/package-marketplace.mjs --write` — built + copied 19 derived files + 64 bundled-dep files + 3 synthesized package.json files.
- New: marketplace's copy of `scripts/lib/claude-version.mjs` was created.
- Allowlist files updated to count `claude-version.mjs`:
  - `tools/package-marketplace.mjs` (+1 line in DERIVED_FILES array)
  - `marketplace/MANIFEST.md` ("18" → "19"; new bullet)
  - `packages/plugin-codex/test/marketplace-layout.test.mjs` (allowlist +1 line; comment + test name "18" → "19" via replace-all)
  - `documentation/RELEASING.md` ("18" → "19" via replace-all; 2 occurrences)

**Final `--check` output**: `check: OK — 19 derived files match source, 64 bundled-dep files match source, 3 synthesized package.json files match canonical shape, 1 marketplace-owned files present, no unexpected files.`

**T9.5 cache-execution invariant preserved**: the new `claude-version.mjs` ships in the marketplace bundle so `$claude-setup` will resolve it when run from `<CODEX_HOME>/plugins/cache/.../scripts/claude-companion.mjs setup` (no `ERR_MODULE_NOT_FOUND`).

---

## T6 — CI evidence (orchestrator-absorbed)

**Local gate results** (commit-ready state):

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; `19 derived + 64 bundled + 3 synthesized + 1 marketplace-owned; no unexpected` |
| `node tools/smoke-marketplace.mjs --help` | exit 0 (lists 8 skills) |
| `npm run lint` | exit 0 (clean) |
| `npm run typecheck` | exit 0 (clean) |
| `npm run format` | exit 0 (clean after one prettier --write on claude-version.test.mjs) |
| `npm test` (4 lanes) | **1241 tests** (mock 68 + runtime 172 + driver 183 + plugin 818), 0 fail |
| `npm run test:attach` | **28 tests**, 0 fail (verified after T5 resync) |
| `npm run test:bench` | **258 tests**, 0 fail (verified after T5 resync) |
| **Combined** | **1527 tests**, 0 fail |

Plan 0006 baseline was 1498. Plan 0007 net delta: **+29 tests** (plan target was +14-18; overshoot of +11-15).

### Test-count overshoot justification

Per `feedback_test_count_overshoot`, overshoots are accepted as long as each test is a distinct contract assertion.

- T1 (+6 vs target +5): every test covers a distinct forward/backward-compat or required-field contract (waitingFor, unknown field, missing sessionId × 2 assertions, missing pid, 2.1.149+ regression).
- T2 (+5, on target): each test covers a distinct status string canonicalization.
- T3 (+18 vs target +6-8): the claude-version.test.mjs file has 13 tests, one per (parseClaudeVersion input shape) × (compare arg pair) × (meetsFloor threshold). Plus 5 setup-probes regression-guard tests. Each is a distinct contract; no duplication. The helper is small enough that the test count is tightly bounded.

### Remote CI

Awaiting `git push` to trigger the Stage 2 CI run. Will be recorded in this file after the run completes.

---

## Files modified in Stage 2 (consolidated)

Source code:
- `packages/driver-claude-code/src/agents-json.ts` (T2)
- `packages/plugin-codex/scripts/claude-companion.mjs` (T3)
- `packages/plugin-codex/scripts/lib/claude-version.mjs` (T3, NEW)

Tests:
- `packages/driver-claude-code/test/agents-json.test.mjs` (T2)
- `packages/plugin-codex/test/agents-json-parsing.test.mjs` (T1, NEW)
- `packages/plugin-codex/test/claude-version.test.mjs` (T3, NEW)
- `packages/plugin-codex/test/setup-probes.test.mjs` (T3, NEW — orchestrator-written)
- `packages/plugin-codex/test/marketplace-layout.test.mjs` (T5 allowlist)

Docs / packaging:
- `packages/plugin-codex/README.md` (T4, G5 + G6 subsections)
- `marketplace/plugins/claude-companion/README.md` (T4, G6 short)
- `marketplace/MANIFEST.md` (T5, 18→19 + new bullet)
- `tools/package-marketplace.mjs` (T5 allowlist)
- `documentation/RELEASING.md` (T5, 18→19)

Marketplace payload (derived, written by `--write`):
- `marketplace/plugins/claude-companion/README.md` — sync of source change (T4)
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs` — sync of source change (T3)
- `marketplace/plugins/claude-companion/scripts/lib/claude-version.mjs` — NEW (T3)
- `marketplace/plugins/claude-companion/node_modules/@cc-plugin-codex/driver-claude-code/dist/agents-json.js` — sync of source change (T2)
- `marketplace/plugins/claude-companion/node_modules/@cc-plugin-codex/driver-claude-code/dist/agents-json.d.ts` — sync of source change (T2)

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `packages/plugin-codex/README.md` L341 cost paragraph: byte-identical (verified by existing docs-split.test.mjs cost-paragraph test still passing)
- `tools/bench/**`: empty diff
- `documentation/plan/0004-*/`: empty diff (no edits made)
- `documentation/plan/0005-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff (no CI shape changes)
- Plugin source behavior in `packages/runtime/`, `packages/driver-claude-code/src/*` (except `agents-json.ts` widened): unchanged
- Skills `SKILL.md` bodies: unchanged
- Marketplace payload semantics: only the additive bundled `claude-version.mjs` (no behavior change for existing dispatcher paths)
