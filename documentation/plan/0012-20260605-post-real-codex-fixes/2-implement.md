# Plan 0012 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes re-verified; awaiting CI verification)
**Date**: 2026-06-06
**Stage 1 commit**: `12f7d96` (Plan 0012 Stage 1 approved)

Two `oh-my-claudecode:executor` agent batches:
- **Batch 1** — **T1 + T2 + T3**: three empirical probes via single executor (3 parallel Node helpers in the agent's flow; 3 artifacts)
- **Batch 2** (sequential after T1-T3 verdicts) — **T4 + T5 + T6 + T7 + T8**: 5 fixes via single executor

T9 (gates + CI) orchestrator-absorbed inline.

## T1 — HIGH-1 probe (delegate followup result regression)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: [`artifacts/oq-a-delegate-followup-probe-20260606.txt`](artifacts/oq-a-delegate-followup-probe-20260606.txt)

**Verdict C** — both result paths healthy in the controlled MARKER-A/MARKER-B repro. The original smoke-test "result returned A instead of B" was caused by the initial delegate job being stuck in `needs_input` (model never replied to first prompt), NOT a cmdResult selection bug.

Residual risk identified: `sendFollowupTurn` sets `turn.result.finalMessagePath = ''` (empty string); top-level `job.result.finalMessagePath` is only updated by the reconciler. If reconciliation fails AFTER followup on a never-completed initial job, `cmdResult` could return stale data.

**Implication for T4**: no production code fix required; document the residual risk as a code comment.

## T2 — HIGH-2 probe (setup FAIL under Codex sandbox)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: [`artifacts/oq-b-setup-codex-sandbox-probe-20260606.txt`](artifacts/oq-b-setup-codex-sandbox-probe-20260606.txt)

**Verdict B** — TTY/buffering issue under no-TTY piped stdio. Probe 4 confirmed exact behavior:

```
spawnSync('claude', ['--bg', '--help'], { timeout: 5000, stdio: ['pipe','pipe','pipe'], shell: false })
Exit: null, Signal: SIGTERM, timedOut: true, Elapsed: 5006ms, stdout: '', stderr: ''
```

Root cause discovered: **`claude --bg --help` does NOT print help text**; it CREATES an idle background session (8 idle sessions accumulated during probing — every prior setup run leaks a session). With TTY: completes in ~0.5s with a "backgrounded · <shortId>" message. Without TTY (piped stdio): hangs and gets SIGTERM at 5006ms.

The probe's strategy comment (`claude --bg --help ... should accept it without starting a real session. Real Claude prints usage for --bg`) is wrong for claude 2.1.166+.

**Implication for T5**: replace the subprocess probe with a version-floor check, mirroring the existing `bgExecProbe` pattern. Source location: `packages/runtime/src/doctor.ts:507-527`.

## T3 — MEDIUM-1 probe (goal directive non-resolution)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: [`artifacts/oq-c-goal-non-resolution-probe-20260606.txt`](artifacts/oq-c-goal-non-resolution-probe-20260606.txt)

**Verdict C** — intermittent upstream `/goal` brittleness. Repro 1 resolved correctly (43 JSONL entries, model answered with section count); Repro 2 stuck in `needs_input` indefinitely (14 JSONL entries, no assistant reply after `/goal` injection).

No plugin-side sentinel-detection bug; failure is in the upstream bg session non-deterministically processing the injected slash command.

**Implication for T6**: docs-only — append retry guidance to `$claude-goal/SKILL.md` covering the `needs_input` stall pattern.

## T4 — HIGH-1 residual-risk documentation

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

**File**: `packages/plugin-codex/scripts/claude-companion.mjs` near `cmdResult`'s `finalMessagePath` read (around L614-618).

Added one-line comment explaining: `sendFollowupTurn` sets `turn.result.finalMessagePath = ''`; top-level `job.result.finalMessagePath` updates only via reconciler; stale data possible if reconciliation fails on a never-completed initial job.

No tests added (no behavior change).

## T5 — HIGH-2 setup probe rewrite

**Agent**: `oh-my-claudecode:executor` (sequential after T2)

**Files modified**:
- `packages/runtime/src/doctor.ts:507-555` — `probeClaudeBgNoPrompt` rebuilt to use version-floor check
- `packages/runtime/test/doctor.test.mjs:293-330` — 3 old tests replaced with 4 new tests

**Implementation**: new strategy mirrors `bgExecProbe`. Runs `claude --version`, parses, checks `meetsFloor(parsed, "2.1.149")`. TTY-independent — no subprocess that could hang under no-TTY contexts. Probe **name** stays `claude-bg-no-prompt` for test fixture compatibility.

**New strategy comment** in source replaces the misleading old comment.

**New tests** (4):
1. ok for version above floor (2.1.165)
2. ok regardless of `bgNoPromptAvailable` flag (flag no longer used)
3. fail when binary missing
4. regression test confirming no-TTY probe returns ok

**Net test delta in `doctor.test.mjs`**: +1 (4 new replace 3 old).

**Side benefit**: setup probe no longer leaks idle bg sessions (the old probe created one per run — 8 had accumulated by T2 probing).

## T6 — MEDIUM-1 goal SKILL.md stall guidance

**Agent**: `oh-my-claudecode:executor` (sequential after T3)

**Files modified**:
- `packages/plugin-codex/skills/claude-goal/SKILL.md` — appended `### When the goal stalls` subsection
- `marketplace/plugins/claude-companion/skills/claude-goal/SKILL.md` — synced via `node tools/package-marketplace.mjs --write`

**New text** advises: if `$claude-status <jobId>` returns `needs_input` on the FIRST poll and stays there, the `/goal` injection failed to reach the model. Stop the stalled session and retry. Two consecutive failures with the same directive: reword to be more concrete (explicit termination sentinel).

No tests (docs only).

## T7 — MEDIUM-2 version reporting consistency

**Agent**: `oh-my-claudecode:executor` (parallel with T4-T6)

**File modified**: `packages/plugin-codex/scripts/claude-companion.mjs:7-67` (imports + new `loadPluginVersion()` helper).

**Implementation**: added `readFileSync`, `dirname`, `join`, `fileURLToPath` imports. New `loadPluginVersion()` reads `.codex-plugin/plugin.json` relative to the dispatcher script (`path.join(__dirname, '..', '.codex-plugin', 'plugin.json')`). Both `pluginVersion: '0.0.0'` occurrences replaced with `PLUGIN_VERSION`.

**New regression test** in `dispatcher.test.mjs:6963-6983`: `delegate --yes` job record's `codex.pluginVersion` matches `.codex-plugin/plugin.json` version dynamically — survives future version bumps.

## T8 — LOW error-message hints

**Agent**: `oh-my-claudecode:executor` (parallel with T4-T6)

**Files modified**: `packages/plugin-codex/scripts/claude-companion.mjs`

**Changes**:
1. `cmdReview` and `cmdAdversarialReview` — if input arg contains a space, exceeds 50 chars, or doesn't start with `job_`: emit hint message before existing "No job found" error.
2. `cmdStop` — bare `--all` without `--all-awaiting-followup` and no positional now exits 2 with explicit hint about `--all-awaiting-followup`.

**New regression tests** in `dispatcher.test.mjs:6985-7009`:
1. `review` with space-containing arg emits jobId-shape hint
2. `stop --all` emits `--all-awaiting-followup` hint

## T9 — Local gates (orchestrator-absorbed)

| Gate | Result |
|---|---|
| Build (`tsc --build`) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; **23 derived (unchanged)** + 64 bundled + 3 synthesized + 1 marketplace-owned |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **12 skills (unchanged)** |
| `npm run lint` | exit 0 (clean) |
| `npm run typecheck` | exit 0 (clean) |
| `npm run format` | exit 0 (clean) |
| `npm test` (4 lanes) | **1447** (mock 68 + runtime **173** + driver 187 + plugin **1019**), 0 fail |
| `npm run test:attach` | **28**, 0 fail (unchanged) |
| `npm run test:bench` | **258**, 0 fail (unchanged) |
| `node packages/plugin-codex/scripts/claude-companion.mjs setup` | aggregate `warn` (only informational `claude-bg-flag` warn; `claude-bg-no-prompt` now `ok`) — **was `FAIL` under Codex sandbox** |

### Test count (Stage 2 close)

| Lane | Plan 0011 close | Plan 0012 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | **173** | **+1** (T5 net: +4 new, -3 old) |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 1016 | **1019** | **+3** (T7 +1, T8 +2) |
| **`npm test` chain** | **1443** | **1447** | **+4** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1729** | **1733** | **+4** |

Plan target was +5 to +10; actual **+4** (under target because T4 and T6 are docs/comment-only changes with no new tests, by design per their Verdict C / docs-only nature).

### `setup` aggregate before vs after

Before T5 fix (under Codex no-TTY context per yesterday's findings):
```
Claude companion setup - FAIL
  FAIL  claude-bg-no-prompt   claude --bg --help timed out
```

After T5 fix (under any execution context including direct shell — verified):
```
Claude companion setup — warn
  ok    claude-bg-no-prompt   claude --bg supported per version floor (2.1.167 (Claude Code) >= 2.1.149)
```

(The aggregate `warn` comes from the informational `claude-bg-flag` probe noting "--bg not advertised in --help" — explicitly informational per Plan 0006 design; not affected by T5.)

### Remote CI

Awaiting `git push`. Will be recorded after the run completes.

## Files modified in Stage 2 (consolidated)

Source code:
- `packages/plugin-codex/scripts/claude-companion.mjs` (T4 + T7 + T8)
- `packages/runtime/src/doctor.ts` (T5)
- `packages/plugin-codex/skills/claude-goal/SKILL.md` (T6)

Tests:
- `packages/runtime/test/doctor.test.mjs` (T5)
- `packages/plugin-codex/test/dispatcher.test.mjs` (T7 + T8)

Marketplace mirrors (derived; written by `--write`):
- `marketplace/plugins/claude-companion/scripts/claude-companion.mjs`
- `marketplace/plugins/claude-companion/skills/claude-goal/SKILL.md`
- `marketplace/plugins/claude-companion/node_modules/@cc-plugin-codex/runtime/dist/doctor.js` (rebuilt)

Artifacts:
- `documentation/plan/0012-20260605-post-real-codex-fixes/artifacts/oq-a-delegate-followup-probe-20260606.txt`
- `documentation/plan/0012-20260605-post-real-codex-fixes/artifacts/oq-b-setup-codex-sandbox-probe-20260606.txt`
- `documentation/plan/0012-20260605-post-real-codex-fixes/artifacts/oq-c-goal-non-resolution-probe-20260606.txt`

Testing evidence (from the yesterday's real-Codex smoke test that motivated Plan 0012):
- `documentation/testing/findings-20260605.md` (untracked previously; now in repo as the load-bearing failure record)

## Adaptive scope outcome

Plan 0012 was scoped as adaptive: probes T1-T3 returned C/B/C respectively, condensing T4-T6 to:
- **T4** (Verdict C) — docs/comment only
- **T5** (Verdict B) — real production fix (the only one)
- **T6** (Verdict C) — docs/SKILL.md only

T7-T8 shipped unconditionally as planned. Final scope: 1 production fix (T5), 2 doc/comment additions (T4 + T6), 2 small dispatcher tweaks (T7 + T8). Substantially lighter than the worst-case plan-scope but with the same end-user benefit.

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `packages/plugin-codex/README.md` cost paragraph (around L636): byte-identical preserved (no edits)
- `v0.2.0` tag at `ea595e1` (unchanged — no retag)
- `tools/bench/**`, `documentation/plan/0004-*/`, `documentation/plan/0005-*/`, `documentation/plan/0006-*/`, `documentation/plan/0007-*/`, `documentation/plan/0008-*/`, `documentation/plan/0009-*/`, `documentation/plan/0010-*/`, `documentation/plan/0011-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff (no CI shape changes)
- `packages/driver-claude-code/**`: empty diff
- `packages/runtime/**`: **MODIFIED** (T5 fix per documented plan exception in readme.md)
- No `~/.claude/` or `~/.codex/` settings mutation during Stage 2
- T9.5 cache-execution invariant preserved (marketplace tree resynced; 23 derived files unchanged from Plan 0011 close; allowlist coherent)
- Skill count: 12 (unchanged); marketplace allowlist: 23 (unchanged); plugin version field: `0.2.0` (unchanged)
- Plugin version REPORTED by dispatcher: now consistent with `.codex-plugin/plugin.json` (was `0.0.0`; now `0.2.0`)

## Plan readme status flip

`documentation/plan/0012-20260605-post-real-codex-fixes/readme.md` flipped from `implementing` → `auditing`. Stage 2 marked complete-pending-CI.
