# Plan 0012 Stage 1 — Plan

**Plan**: Plan 0012 — Post real-Codex-testing fixes (delegate followup result; setup FAIL under Codex; goal non-resolution; version reporting)
**Status**: drafted (awaiting maintainer authorization)
**Date**: 2026-06-05

## 1. Background

Plan 0011 closed at commit `0386b54` shipping 12 skills and 1729 tests, all green. The maintainer installed the plugin into the local Codex (`codex-cli 0.137.0`, `claude 2.1.165`) and ran a structured smoke test via Codex itself. Codex executed each of the 12 skills via the dispatcher (`node packages/plugin-codex/scripts/claude-companion.mjs <cmd>`) and wrote findings to `documentation/testing/findings-20260605.md`.

Findings broke down as:
- **4 pass** (workflow, fork, batch, status --all) + **2 pass** (--allow-edit rejection probes) = 6 confirmed-passing skills
- **1 partial** (delegate→followup→result — final result corrupted)
- **4 fail** — 2 were recipe gaps already fixed in commit `6b22912`; 2 are real plugin issues
- **1 timed-out** (goal)

Of the failures, 2 (review/adversarial-review with prompt input; bare `stop --all`) were **recipe bugs** — the recipe asked for the wrong call shape. Fixed in `6b22912`. The remaining **4 are real plugin issues** that Plan 0012 addresses.

Plus 2 LOW-priority error-message gaps surfaced by the test (review/adversarial-review error doesn't hint at jobId input shape; stop bare --all doesn't hint at --all-awaiting-followup).

## 2. Scope

In:
- **T1** — Empirical probe of HIGH-1 (delegate followup result regression)
- **T2** — Empirical probe of HIGH-2 (setup FAIL under Codex sandbox)
- **T3** — Empirical probe of MEDIUM-1 (goal directive non-resolution)
- **T4** — Fix HIGH-1 (based on T1 verdict)
- **T5** — Fix HIGH-2 (based on T2 verdict)
- **T6** — Fix MEDIUM-1 (based on T3 verdict; defer if Verdict B/C)
- **T7** — Fix MEDIUM-2 (version reporting consistency; isolated)
- **T8** — LOW error-message improvements (review/adversarial-review hint; stop hint)
- **T9** — Gates + CI (orchestrator-absorbed)

Out:
- v0.3.0 release tag — separate maintainer step AFTER Plan 0012 closes if all fixes ship cleanly
- Plugin rename (e.g., `claude-companion` → `cc` or `claude`) — separate plan if maintainer chooses
- `$claude-tasks` re-probe via PTY-injection — separate plan
- Touching frozen dirs (tools/bench, plan 0004-0011, .github/, packages/runtime, packages/driver-claude-code/src/, README cost paragraph)
- Any change that requires Claude Code or Codex CLI upgrade beyond what's installed (2.1.165 / 0.137.0)

## 3. Open questions

### OQ-A through OQ-C — Probe verdicts (TO BE RESOLVED IN T1-T3)

- **OQ-A (T1, HIGH-1)**: When `$claude-followup <jobId> -- "<text>"` completes, does `$claude-result <jobId>` return the followup turn's content or the original turn's content? If original, where in `cmdResult` is the wrong turn being selected? Or is the followup write-back broken so the followup turn is never actually committed to the result store?
  - **Verdict A** — cmdResult picks the wrong JSONL entry; fix is a selection-logic change
  - **Verdict B** — followup write-back never updates the result store; fix is in cmdFollowup or the reconciler
  - **Verdict C** — both result paths are healthy but the followup TURN ran on a different session that isn't being read

- **OQ-B (T2, HIGH-2)**: Why does `claude --bg --help` time out under Codex's sandbox but not in direct shell? Is it (a) subprocess restriction; (b) TTY/buffering — `claude --bg` blocks on stdin without a TTY; (c) regression in the claude binary's --help handling for the --bg flag?
  - **Verdict A** — sandbox subprocess restriction; need a different probe shape (e.g., `claude --help | grep -- --bg`)
  - **Verdict B** — TTY/buffering; provide stdin redirection from /dev/null
  - **Verdict C** — upstream claude binary regression; document as known issue + workaround

- **OQ-C (T3, MEDIUM-1)**: Why didn't `$claude-goal "Read documentation/REAL-CODEX-TEST-RECIPE.md and tell me how many sections it has. Stop once you've answered."` ever emit goal_met? Possibilities: (a) `/goal` sentinel detection is brittle for short directives; (b) the model couldn't access the file (permission issue); (c) the goal_status record was never injected into the JSONL.
  - **Verdict A** — sentinel-detection bug; fix in goal-status handling
  - **Verdict B** — model access issue; workspace permission fix
  - **Verdict C** — `/goal` upstream brittleness; document + recommend longer/clearer directives

### OQ-D — Version reporting source

**TO BE RESOLVED IN T7**: which file path does the dispatcher read when emitting `Plugin version: 0.0.0`? Is it the workspace `package.json`, `packages/plugin-codex/package.json`, the bundled `node_modules/@cc-plugin-codex/*` (which uses `0.2.0-bundled`), or somewhere else? Once located, change the source to read `.codex-plugin/plugin.json` `version` field directly.

### OQ-E — Test fixtures

**RESOLVED**: each new T4-T7 fix gets at least 1 regression test pinning the bug-fix behavior. Tests are added to existing test files (dispatcher.test.mjs, setup-probes.test.mjs) rather than new files unless an entirely new code path is introduced.

## 4. Tasks

### T1 — HIGH-1 probe (delegate followup result regression)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: `artifacts/oq-a-delegate-followup-probe-20260605.txt`

Repro:
1. Run `node packages/plugin-codex/scripts/claude-companion.mjs delegate --yes -- "Print 'A' and stop."`
2. Wait for `awaiting_followup` (poll `status <jobId>`)
3. Run `node packages/plugin-codex/scripts/claude-companion.mjs result <jobId>` — capture output, should be "A"
4. Run `node packages/plugin-codex/scripts/claude-companion.mjs followup <jobId> --yes -- "Now print 'B' and stop."`
5. Wait for `awaiting_followup` again
6. Run `result <jobId>` — capture output; should be "B", findings showed it was "A"

Inspect the JSONL at `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` after each step. Identify which user/assistant entries exist after step 4 vs step 6. Determine which entry `cmdResult` is reading and why.

**Acceptance**: artifact written; verdict A/B/C explicit; load-bearing JSONL evidence quoted; root-cause identified or upstream-deferred.

### T2 — HIGH-2 probe (setup FAIL under Codex sandbox)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: `artifacts/oq-b-setup-codex-sandbox-probe-20260605.txt`

Repro:
1. Run `claude --bg --help` directly in shell — time it; capture exit + first 100 chars stdout/stderr
2. Run the same command via `node -e 'execSync("claude --bg --help", {timeout: 30000})'` to simulate the probe's subprocess shape
3. Run via `node -e 'execSync("claude --bg --help < /dev/null", ...)'` to test TTY hypothesis
4. Inspect the probe's source at `packages/plugin-codex/scripts/lib/` (find the function that runs `claude-bg-no-prompt`)
5. Try alternative probe shapes: `claude --help | grep -q -- --bg` etc.

**Acceptance**: artifact written; verdict A/B/C explicit; if Verdict A or B, propose the exact probe shape change; if Verdict C, document as upstream.

### T3 — MEDIUM-1 probe (goal directive non-resolution)

**Agent**: `oh-my-claudecode:executor`
**Artifact**: `artifacts/oq-c-goal-non-resolution-probe-20260605.txt`

Repro:
1. Run `node packages/plugin-codex/scripts/claude-companion.mjs goal --yes -- "Read documentation/REAL-CODEX-TEST-RECIPE.md and tell me how many sections it has. Stop once you've answered."`
2. Poll status every 15s for up to 5 min
3. While polling, inspect the JSONL at `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` — look for `goal_status` records, model output, file-read tool uses
4. After 5 min, run `claude logs <sessionId>` and capture the ANSI output
5. Compare to a known-good goal: same wording but more concrete: "Read REAL-CODEX-TEST-RECIPE.md and emit the literal text 'SECTIONS=N' then stop."

**Acceptance**: artifact written; verdict A/B/C explicit; root-cause identified or upstream-deferred.

### T4 — HIGH-1 fix (based on T1 verdict)

**Agent**: `oh-my-claudecode:executor` (sequential after T1)

If T1 Verdict A (cmdResult selection bug): fix `cmdResult` in `packages/plugin-codex/scripts/claude-companion.mjs` to select the most recent non-review assistant turn. Add a regression test in `dispatcher.test.mjs` that exercises delegate→followup→result and asserts the followup turn's content.

If T1 Verdict B (followup write-back bug): fix `cmdFollowup` or the reconciler so the followup turn updates the result store. Add a regression test.

If T1 Verdict C (session/job mismatch): fix the session-to-job binding. Add a regression test.

**Acceptance**: fix implemented; regression test added; `npm test` shows the new test passing; manual repro from T1 now returns "B".

### T5 — HIGH-2 fix (based on T2 verdict)

**Agent**: `oh-my-claudecode:executor` (sequential after T2)

If T2 Verdict A or B: change the `claude-bg-no-prompt` probe shape (e.g., `claude --help < /dev/null | grep -q -- --bg`) to avoid the timeout under Codex sandbox. Add a regression test in `setup-probes.test.mjs` that mocks the new probe shape.

If T2 Verdict C (upstream regression): document in setup probe output ("known: claude --bg --help may hang under no-TTY contexts; this probe will warn rather than fail") and downgrade the probe from `fail` to `warn` if the timeout is hit.

**Acceptance**: under simulated no-TTY context, setup aggregate is now `ok` or `warn` (not `fail`); regression test added.

### T6 — MEDIUM-1 fix (based on T3 verdict)

**Agent**: `oh-my-claudecode:executor` (sequential after T3)

If T3 Verdict A: fix the goal_status sentinel detection. Add a regression test.

If T3 Verdict B (permission/access): not a fix — document in SKILL.md and skip.

If T3 Verdict C (upstream `/goal` brittleness): update `$claude-goal/SKILL.md` to recommend longer/clearer directives + explicit termination phrasing. Skip code changes.

**Acceptance**: fix implemented OR documented as upstream with a workaround in SKILL.md.

### T7 — MEDIUM-2 fix (version reporting consistency)

**Agent**: `oh-my-claudecode:executor` (parallel with T4-T6)

1. Locate the dispatcher code that emits `Plugin version` — likely in setup or --version flag handling
2. Change the source to read `version` from `.codex-plugin/plugin.json` (the canonical version per Plan 0006 T10)
3. Add a regression test that asserts the reported version matches `.codex-plugin/plugin.json`'s version field

**Acceptance**: dispatcher's reported version matches `codex plugin list`'s version (`0.2.0`); regression test added.

### T8 — LOW error-message improvements (orchestrator-absorbed)

1. In `cmdReview` and `cmdAdversarialReview` — if the input argument starts with something that doesn't look like a jobId prefix (e.g., contains spaces or is longer than 50 chars), emit a hint:
   ```
   [review] Error: input doesn't look like a jobId — did you mean to delegate first and then review that job?
   ```
2. In `cmdStop` — if `--all` is passed without `--all-awaiting-followup`, emit a hint:
   ```
   [stop] Error: bare --all is not allowed; use --all-awaiting-followup [--all] for bulk stop, or pass a <jobId>.
   ```

Add 2 regression tests (one per hint).

**Acceptance**: error messages improved; 2 regression tests added.

### T9 — Gates + CI (orchestrator-absorbed)

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 with correct derived count (23, unchanged)
- `node tools/smoke-marketplace.mjs --help` exit 0 with 12 skills (unchanged)
- `npm run lint` / `typecheck` / `format` all exit 0
- `npm test`, `test:attach`, `test:bench` all pass; combined ≈ 1729 + 5-10 = ~1734-1740 (small delta — Plan 0012 is fix-focused, not skill-adding)
- Remote CI `success` across `ubuntu-latest + macos-latest × Node 20 + 22`

## 5. Risks

- **R1 — Probe verdict C (upstream) for multiple issues**: if Codex sandbox restrictions cause HIGH-2, and `/goal` brittleness causes MEDIUM-1, plugin can't fix them. Mitigation: ship workarounds + documentation; downgrade severity in the report.
- **R2 — HIGH-1 fix risks regression in non-followup result paths**: `cmdResult` is exercised by delegate / workflow / goal / fork / batch (5 callers). Mitigation: T4 regression test covers all 5 paths.
- **R3 — Marketplace cache invalidation**: changing the dispatcher script requires `node tools/package-marketplace.mjs --write` to resync. T9 verifies via `--check`.
- **R4 — Codex sandbox might also affect T4-T7 verification**: if the fix works in shell but the bug only manifests under Codex sandbox, regression tests in node:test won't catch the original issue. Mitigation: T2 artifact documents the sandbox shape so test fixtures simulate it.
- **R5 — Version-reporting change might cascade through tests**: dispatcher tests that hard-pin `0.0.0` would break. Mitigation: T7 audit identifies all such tests and updates them coherently.
- **R6 — Plan 0008-style stragglers after error-message changes**: if `--allow-edit` rejection list strings change, existing tests may break. Mitigation: pre-emptive straggler-grep in T8.

## 6. Test count target

Plan 0011 close baseline: **1729** (1443 npm test + 28 attach + 258 bench).

Plan 0012 target net delta: **+5 to +10 tests** (mostly regression pins per fix).

Final combined: **~1734-1739**.

## 7. Acceptance criteria (overall)

- All T-tasks complete with explicit verdicts per probe
- Each HIGH/MEDIUM issue is either fixed in-plugin OR documented as upstream with a workaround
- LOW error-message improvements ship with regression tests
- All local + remote CI gates green
- `--check` exit 0 with 23 derived files (unchanged)
- Cost paragraph at L636 byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged)
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish`
- Re-running the smoke test recipe from `documentation/REAL-CODEX-TEST-RECIPE.md` after Plan 0012 close shows: all-pass (or all-pass-with-documented-upstream-caveats) on the 4 previously-failing skills

## 8. Backlog (carried forward, NOT in Plan 0012)

- v0.3.0 release tag — separate maintainer step
- Plugin rename (e.g., `claude-companion` → `cc`) — separate plan if maintainer authorizes
- `$claude-tasks` PTY-injection design — Plan 0013+
- Skill-discovery surface test (typing `$claude-*` directly in Codex chat vs shelling out to dispatcher) — separate plan
- Workspace isolation testing — backlog
- `$claude-result --json` shape testing — backlog
- Multiple parallel delegations test — backlog
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit
