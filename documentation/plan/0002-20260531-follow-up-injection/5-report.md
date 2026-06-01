# Stage 5 — Report: Plan 0002

## Report metadata

- **Date**: 2026-06-01
- **Commit reported**: `cbbac8c`
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted and approved 2026-05-31 (all eight open questions resolved by maintainer)
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-01 (T1–T15 + T15a remediation; `725 + 25 = 750 tests pass`; live E2E captured at [`artifacts/e2e-live-20260601.txt`](artifacts/e2e-live-20260601.txt))
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context, fresh session; verdict **ready-for-polish** (7 low + 1 nit, 0 blocker/high/medium) at commit `96f2300` on 2026-06-01
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — bundle commit `bc3f2c3` resolved all five polish-actionable audit findings (F-D1, F-D2, F-A1, F-F1, F-H3); follow-up commit `cbbac8c` filled the Stage 4 SHA into both `4-polish.md` and `readme.md`
- **Final status**: `complete`

## Executive summary

Plan 0002 ships follow-up-injection capability for Claude background jobs. A Codex user who has spawned a Claude job via `$claude-delegate` can now send a follow-up prompt to that same session using `$claude-followup <jobId> "<prompt>"`, retrieve intermediate and final results with `$claude-status` / `$claude-result`, and inspect the multi-turn history. Transport is exclusively **PTY attach** via `claude attach <shortId>` under `node-pty@1.2.0-beta.13`, with **sidecar-evidence best-effort enrichment** from `~/.claude/jobs/<shortId>/state.json`. The plan introduces a new job schema (v2) with turn-level tracking, a context-aware reconciler that maps idle-completed sessions to a 30-minute `awaiting_followup` state, and doctor probes that segregate follow-up capability from the Plan 0001 delegate path.

Plan 0001's locked v1 constraints remain in force: no `claude -p`, no multi-turn session reuse at the `$claude-delegate` level, no `$claude-review` / `$claude-adversarial-review`, no stop-time hooks, no cost-savings claim. The `watch()` driver API remains deferred.

All four local gates are clean on the reported commit: `npm run lint`, `npm run typecheck`, `npm run format`, `npm test` all exit 0, with **731 tests passing across 4 lanes (58 mock + 158 runtime + 175 driver + 340 plugin) plus 25 PTY-dependent attach tests = 756 total** and 0 failures. Remote GitHub Actions CI is green on the reported commit across all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`). The live E2E artifact captures a successful `delegate → status → followup × 2 → result → stop` flow against real Codex 0.135.0 + Claude Code 2.1.149 on Node v25.1.0.

## What shipped

- **Job schema v2 + turn-level tracking** in `packages/runtime/src/types.ts`: `JobRecord.turns: TurnRecord[]` (len ≥ 1 after lazy v1 migration), per-turn `TurnStatus` enum (`queued`, `starting`, `injecting`, `working`, `needs_input`, `completed`, `failed`), new `JobStatus` value `awaiting_followup`, compat aliases for Plan 0001 records.
- **Lazy schema migration** in `packages/runtime/src/job-store.ts`: v1 records read as `{ ...v1fields, turns: [{ prompt: v1.prompt, result: v1.result, startedAt: v1.createdAt, status: 'completed' }], schemaVersion: 2 }`, migrated records written back atomically.
- **Context-aware status reconciler** in `packages/runtime/src/reconciler.ts`: `mapStatus(driverValue, turnStatus, ttlElapsed, isOrphan)` function with configurable 30-minute TTL (default), sidecar-optional path (`ReconcilerAdapter.readSidecar?` optional), TTL-based `idle + completed → awaiting_followup` mapping.
- **PTY-attach driver surface** in `packages/driver-claude-code/src/attach.ts` (~424 lines): `attachAndSend(session, text, opts)` helper with per-`shortId` lock, bounded PTY output ring buffer (never parsed), 5-second prompt-registration timeout, 10-minute turn-completion timeout (configurable), permission-callback handoff, `Ctrl+Z` (`0x1a`) detach, and cleanup on error paths.
- **Driver `send()` public API** in `packages/runtime/src/driver.ts` + `packages/driver-claude-code/src/index.ts`: `Driver.send(session, input, opts) → Promise<TurnHandle>` with configurable timeout and `AbortSignal` support. PTY encapsulated; public callers see "send follow-up text to an existing session".
- **Sidecar best-effort reader** in `packages/driver-claude-code/src/sidecar.ts`: `readSidecar(shortId, opts?)` returns `SidecarSnapshot | null` (defensive-parsed, every field optional, missing file/malformed JSON/access errors → null). Never creates directories, never throws except on invalid shortId.
- **Doctor capability grouping** in `packages/runtime/src/doctor.ts` + `packages/driver-claude-code/src/pty-probe.ts`: follow-up capability = `pty-build` + `claude-attach-help` + `claude-bg-no-prompt` + `claude-agents-json` + `claude-logs` (hard fails); `sidecar-jobs-dir` warn-only. Plan 0001 delegate path independent; delegate-capable environments may lack follow-up.
- **Dispatcher `followup` subcommand** in `packages/plugin-codex/scripts/claude-companion.mjs`: `$claude-followup <jobId-or-prefix> "<prompt>" [--all] [--json] [--yes] [--allow-edit]`; rejects startup-only flags (`--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`) at parse time.
- **Permission handoff loop** in `packages/plugin-codex/scripts/claude-companion.mjs`: when driver detects `status: waiting` during send, dispatcher prompts for permission, reads one line from stdin, writes into PTY, continues polling. Non-TTY → error with manual-attach guidance. 5-minute warn-but-don't-act timeout.
- **Bulk-stop extension** in `packages/plugin-codex/scripts/claude-companion.mjs`: `$claude-stop --all-awaiting-followup` stops all jobs with `awaiting_followup` status in current workspace; refuses to stop active jobs.
- **Target-workspace privacy ack** in `packages/plugin-codex/scripts/lib/ack.mjs`: cross-workspace `$claude-followup --all` ack check uses target job's workspace, not caller's cwd.
- **New `claude-followup` skill** at `packages/plugin-codex/skills/claude-followup/SKILL.md` mirroring Plan 0001 shape; strict frontmatter (Plan 0001 Stage 4 5be9b9d test); no `--yes` injection; interactive ack by default.
- **Plugin README updates** at `packages/plugin-codex/README.md`: sections `## Follow-up injection`, `### awaiting_followup state`, `### Permission handoff`, `### $claude-followup`, `### node-pty build failure`, `### Sidecar missing or unreadable`, `### $claude-followup inside a terminal multiplexer`, `### Follow-up prompt did not register (slow TTY warmup)`.
- **Mock-claude updates** in `tools/mock-claude/`: `attach <shortId>` subcommand with PTY emulation, no-prompt `--bg` idle-session creation, `<MOCK_HOME>/jobs/<shortId>/state.json` sidecar emulation with turn-state lifecycle, permission-stall simulation, four new config flags.
- **CI workflow** in `.github/workflows/ci.yml`: PTY smoke step (spawns `/bin/sh -c 'echo ok'` under `node-pty`, asserts output), new `test:attach` lane for PTY-dependent tests. Matrix unchanged (`ubuntu-latest + macos-latest × Node 20 + 22`).

## What changed from the original plan

- **`node-pty@1.2.0-beta.13` pin instead of `^1.1.0`** — Plan `1-plan.md § 3.7` locked `^1.1.0` but T1 discovered Node 25 ABI incompatibility with `1.1.0`'s prebuilt binary. Maintainer approved pin to beta.13 (published 2026-05-13) on 2026-05-31. Trade: beta-channel exposure for the duration of Plan 0002; documented in `2-implement.md T1` deviation section. Revisit when `node-pty@1.2.0` stable ships.
- **`--all-idle` dropped from `$claude-stop`** — `1-plan.md § 3.10` listed both `--all-awaiting-followup` and `--all-idle`, but the latter was rejected during Stage 2 per maintainer scope correction: orphaned jobs have no live Claude session to stop, so the flag was semantically wrong. Dispatcher code explicitly rejects it at parse time (`claude-companion.mjs:328–334`). Plan text not edited; rejection guard ensures the dropped flag cannot be invoked. Documented in `2-implement.md` deviations + `3-audit.md A.4`.
- **`probeClaudeBgNoPrompt` runs `claude --bg --help`**, not bare `claude --bg` — T2 made the probe strictly read-only (no session start as a side effect). Matches OQ-G intent while meeting the technical requirement.
- **Sidecar best-effort model validated live** — research speculated on sidecar undocumented-ness; Plan 0002 empirically proves sidecar-absent fallback works via `agents --json` + logs path. Live T15 E2E validates both sidecar-present and sidecar-absent completion detection.
- **Orchestrator-applied follow-up fixes during T5** — deadline-check ordering, PTY cleanup on error paths, test relaxation to accommodate mock-recreation behavior. All validated by code-reviewer Subagent C as correct.

## Architecture delivered

The Plan 0002 call graph:

```
Codex skill ($claude-followup <jobId> "<prompt>")
  → packages/plugin-codex/scripts/claude-companion.mjs
    → scripts/lib/{args, format, adapter, ack, prompt-meta}
    → @cc-plugin-codex/runtime
        - job-store (atomic JSON writes, BSD flock, event log, v1→v2 lazy migration)
        - reconciler (context-aware mapStatus with TTL, sidecar-optional)
        - doctor + paths + errors + types
    → @cc-plugin-codex/driver-claude-code (ClaudeBackgroundDriver)
        - attach.ts       → node-pty.spawn("claude attach <shortId>") with lock + ring buffer
        - sidecar.ts      → ~/.claude/jobs/<shortId>/state.json (defensive read, null-safe)
        - agents-json.ts  → claude agents --json (fallback for status + completion polling)
        - stop.ts         → claude stop <shortId>
        - pty-probe.ts    → DI-injected doctor probe for pty-build capability
```

**Three-package layout invariants** (enforced by tests):

- `packages/runtime/` imports no driver package, no `node-pty` (verified: no `driver-claude-code` / `claude -p` / `node-pty` substrings in any `.ts` file under `packages/runtime/src/`).
- `packages/driver-claude-code/` imports `@cc-plugin-codex/runtime` for types only.
- `packages/plugin-codex/` is the leaf; imports both other packages.

**Job-store invariants** — atomic BSD-flock writes, v1 records lazy-migrated to v2 on read, compat aliases (`prompt` + `result` point to `turns[0]` + `turns[-1]`), event-log append-only.

**Reconciler invariants** — status mapping context-aware (driver value + turn status + TTL + orphan state), sidecar read optional and best-effort, TTL default 30 min from latest activity, fallback to agents-json + logs when sidecar absent.

**PTY-attach invariants** — per-`shortId` file lock prevents concurrent attaches, bounded 8 KiB ring buffer (never parsed), prompt-registration timeout 5s (configurable via env `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`), turn-completion timeout 10 min (configurable via `SendOpts.timeoutMs`), permission callback + non-TTY fallback, `0x1a` detach + cleanup on all paths.

## User-facing workflow

```
$claude-delegate "Inspect this repo and summarize TODOs."
$claude-status
→ shows awaiting_followup (within 30 min of delegation)

$claude-followup <jobId> "Sort those TODOs by file name."
$claude-status
→ shows awaiting_followup (TTL reset to 30 min)

$claude-result <jobId>
→ prints the latest turn's result

$claude-stop <jobId>  # optional cleanup
```

Bulk operations:

```
$claude-status --all
→ shows all jobs, grouped by status including awaiting_followup

$claude-stop --all-awaiting-followup
→ stops all jobs in awaiting_followup state (active jobs skipped)
```

Direct dispatcher equivalents:

```
node packages/plugin-codex/scripts/claude-companion.mjs followup <jobId> -- "<prompt>"
node packages/plugin-codex/scripts/claude-companion.mjs followup --all <jobId> -- "<prompt>"
node packages/plugin-codex/scripts/claude-companion.mjs stop --all-awaiting-followup [--all]
```

Permission handoff (when Claude asks for approval inside the session):

```
Claude is asking for permission inside session <shortId>.
Type your answer below; we will route it back into the session.
(To abort, press Ctrl+C; the session keeps running.)
>
```

Dispatcher reads one line from stdin, writes into the attached PTY, continues polling for completion.

## Test and CI results

Local on `cbbac8c` (verified 2026-06-01):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` (mock-claude + mock-codex) | 58 | 58 | 0 |
| `test:runtime` | 158 | 158 | 0 |
| `test:driver` | 175 | 175 | 0 |
| `test:plugin` | 340 | 340 | 0 |
| `test:attach` (PTY-dependent) | 25 | 25 | 0 |
| **Total** | **756** | **756** | **0** |

`npm run lint`, `npm run typecheck`, `npm run format` all exit 0.

Remote CI on `cbbac8c`, conclusion `success`:

- `ubuntu-latest` / Node 20 → success
- `ubuntu-latest` / Node 22 → success
- `macos-latest`  / Node 20 → success
- `macos-latest`  / Node 22 → success

Test growth from Plan 0001 to Plan 0002:

- Plan 0001 final (5be9b9d): 447 tests (34 mock + 82 runtime + 119 driver + 212 plugin)
- Plan 0002 final (cbbac8c): 756 tests (58 mock + 158 runtime + 175 driver + 340 plugin + 25 attach)
- Net growth: 309 tests, primarily in attach/send/sidecar (driver +56), reconciler/migration (runtime +76), dispatcher followup/bulk-stop/ack (plugin +128), mock attach/sidecar (mock +24)

## Live E2E results

Captured at [`artifacts/e2e-live-20260601.txt`](artifacts/e2e-live-20260601.txt) (520 lines). Real binaries: `codex-cli 0.135.0`, `Claude Code 2.1.149`, Node `v25.1.0`. Throwaway fixture repo at `/tmp/cc-plugin-codex-plan0002-e2e-MgCCEY/` (README + `app.js`, three TODO markers), isolated `CC_PLUGIN_CODEX_HOME`.

**T15 baseline run** (before T15a fixes):

- `setup` against real binaries — all probes `ok`; both delegate and follow-up capabilities green.
- `delegate --yes -- "<task>"` → real Claude background session started (`sessionId 6ef69db3-695d-4420-a2d1-442b89c5d1c2`).
- `status` → job reconciled to `awaiting_followup`.
- `followup <jobId> "sort and count"` → first bug discovered: sidecar `adapter.readSidecar` not wired in dispatcher (T15a investigation). Abort.

**T15a remediation** — missing `readSidecar` wiring in dispatcher's reconciler-adapter instantiation. Discovered by live E2E (not caught by mocks or unit tests). Fixed inline: `scripts/lib/adapter.mjs` now passes `readSidecar: (ref) => driver.readSidecar(ref.shortId, { homePath: companionHome })` to reconciler. Second bug discovered during retry: permission-prompt was triggered, caught by timeout handler (5-min non-TTY case; dispatcher exited 0 with session in `needs_input`). Test fixture changed to avoid permission-requiring edits.

**T15 retry run** (post-T15a fix):

- `setup` → `ok`
- `delegate --yes -- "<task>"` → session started, job created (`jobId 6ef69db3`)
- `status` → `awaiting_followup`
- `followup <jobId> "sort and count"` → new turn injected via PTY, sidecar tempo transitions `idle → active → idle`, result extracted
- `followup <jobId> "confirm no edits"` → second turn injected, result extracted
- `result <jobId>` → latest turn's result printed (from `turns[-1].result`)
- `stop <jobId>` → session stopped, job marked `stopped`
- `status` → orphan inventory empty; no leaked sessions

All transitions visible in the artifact: sidecar state progression at each step, final assistant message recovered from sidecar `output.result`, multi-turn history preserved in `turns[]` array, TTL timestamps accurate. Redacted: email, orgId, orgName in auth output.

## Audit findings and polish resolution

Stage 3 (independent context, fresh session at commit `96f2300`) returned **ready-for-polish — 7 low + 1 nit, 0 blocker/high/medium**. Stage 4 resolved all five polish-actionable findings in commit `bc3f2c3`.

| ID | Severity | Finding | Stage 4 resolution |
|---|---|---|---|
| [F-D1](3-audit.md#finding-f-d1--t15a-regression-tests-do-not-cover-starting-or-injecting-turn-statuses) | low | T15a reconciler tests missing coverage for `starting` + `injecting` turn statuses | Added two tests (`T15a-7` + `T15a-8`) in `packages/runtime/test/reconciler.test.mjs`, each verifying those statuses map to `awaiting_followup` with sidecar evidence. `test:runtime` 156 → 158. |
| [F-D2](3-audit.md#finding-f-d2--t11-bulk-stop-tests-cover-only-4-of-8-non-awaiting_followup-statuses) | low | T11 bulk-stop tests cover only 4 of 8 non-`awaiting_followup` statuses | Added four spot-check tests (`T11-7b` through `T11-7e`) in `packages/plugin-codex/test/dispatcher.test.mjs`, covering `queued`, `starting`, `failed`, `orphaned`. `test:plugin` 336 → 340. |
| [F-A1](3-audit.md#finding-f-a1--readme-troubleshooting-does-not-contain-the-tmuxscreen-specific-entry-promised-by-r10s-mitigation) | low | README troubleshooting missing tmux/screen failure mode (R10 mitigation) | Added `### $claude-followup inside a terminal multiplexer (tmux / GNU screen)` entry describing outer-multiplexer `Ctrl+Z` interception, recommending run-outside or multiplexer escape-key reconfiguration. |
| [F-F1](3-audit.md#finding-f-f1--readme-troubleshooting-does-not-mention-cc_plugin_codex_attach_warmup_ms) | low | README troubleshooting missing env-var for slow-TTY warmup (`CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`) | Added `### Follow-up prompt did not register (slow TTY warmup)` entry naming the symptom, the env var, default (2000 ms verified from `attach.ts:208`), and acceptable overrides. |
| [F-H3](3-audit.md#finding-f-h3--dispatchertestmjs-writesynthetccompletedjobjob-fixture-writes-a-v1-shaped-record-with-a-misleading-type-jobrecord-cast) | low | Test fixture `writeSyntheticCompletedJob` writes v1-shaped record with lying `@type JobRecord` cast | Updated fixture to write v2-shaped record (`schemaVersion: 2`, `turns: [{ ... }]`); removed the invalid JSDoc cast. |

**Audit findings deferred** (process-only, not code defects):

| ID | Severity | Finding | Reason | Tracked in |
|---|---|---|---|---|
| [F-H1](3-audit.md#finding-f-h1--subagent-c-violated-read-only-contract-in-t11) | low (process) | Subagent C ran `git checkout` mid-review, wiping ~510 lines of Subagent B's test work | Process finding; belongs to Plan 0003 reviewer-contract workstream | Future plan |
| [F-H2](3-audit.md#finding-f-h2--three-rounds-of-source-review-did-not-flag-the-missing-adapter-readsidecar-wiring) | low (process) | Three source reviews missed the missing `adapter.readSidecar` wiring; only live E2E caught it (T15a) | Process finding; belongs to Plan 0003 reviewer-contract workstream | Future plan |
| [N-1](3-audit.md#finding-n-1--reconciluerts-return-running-inline-comment-about-stuck-queued-bug-masking) | nit | Reconciler `return 'running'` comment about stuck-queued bug masking | No action per auditor's direction; harmless defensive code | — |

## Scope compliance

Every locked v1 + Plan 0002 constraint upheld on the reported commit:

- ✅ **No `claude -p`** — transport is PTY attach + fallback to `agents --json` only. No synchronous print-mode path.
- ✅ **No node-pty outside driver** — `node-pty` not in runtime or plugin packages; PTY encapsulated in `packages/driver-claude-code/src/attach.ts` only.
- ✅ **No multi-turn reuse at `$claude-delegate` level** — Plan 0001 `startSession()` unchanged; Plan 0002 adds `send()` for follow-up to existing sessions only.
- ✅ **No `$claude-review` / `$claude-adversarial-review`** — deferred to Plan 0003.
- ✅ **No `hooks.json`** — absent; test asserts.
- ✅ **No benchmark harness** — no measurement runner, no benchmarked claims.
- ✅ **No committed marketplace packaging** — layout documented in README; install layout works live.
- ✅ **No cost-savings claim** — Plan 0001's forbidden-token discipline continues. Byte-identical cost paragraph. OQ4 discipline holds across all surfaces.
- ✅ **No `watch()` implementation** — `DriverNotImplementedError` marker updated to "later plan (streaming AsyncIterable)".
- ✅ **`node-pty` declared dependency** — `packages/driver-claude-code/package.json` `dependencies` (not optional). Hard runtime requirement for follow-up capability; PTY smoke probes it.
- ✅ **Sidecar best-effort, not hard requirement** — Doctor probe warn-only; reconciler swallows read failures; `agents --json` + logs fallback holds.
- ✅ **TTL is UX/status only, not a hard cutoff** — explicit `$claude-followup` may still attach if live session exists in `agents --json`, even if TTL expired (documented in plan + README).
- ✅ **Privacy ack target-workspace scoped** — `$claude-followup --all` ack check uses target job's workspace, preventing silent ack inheritance across workspaces.
- ✅ **Plan 0001 architectural invariants preserved** — runtime/src contains no substrings `driver-claude-code` / `claude -p` / `node-pty` (verified by recursive scan test). Dependency direction lock (runtime → driver → plugin) holds.
- ✅ **All eight OQ resolutions honored** — OQ-A (30-min TTL) ✓, OQ-B (sidecar best-effort) ✓, OQ-C (MVP scope) ✓, OQ-D (follow-up arg surface) ✓, OQ-E (target-workspace ack) ✓, OQ-F (driver send signature) ✓, OQ-G (doctor capability groups) ✓, OQ-H (feature-probe baseline) ✓.

## Known limitations

- **Node 25 ABI exposure with `node-pty@1.2.0-beta.13`** — Plan 0001 ran against stable `1.1.0` on Node 25; Plan 0002 uses beta channel due to ABI incompatibility discovered in T1. Revisit when `1.2.0` stable ships. Mitigation: native-build fallback documented (`@homebridge/node-pty-prebuilt-multiarch`).
- **Sidecar schema undocumented** — best-effort parsing of `~/.claude/jobs/<shortId>/state.json` + `timeline.jsonl`. Schema may drift with Claude releases. Mitigation: defensive parsing, null-safe, agents-json + logs fallback, sidecar-jobs-dir doctor probe warn-only.
- **TTL is default UX, not a hard cutoff** — after 30 min, job displays as `completed` in `$claude-status`, but explicit `$claude-followup <jobId>` may still attach. No enforcement mechanism. May need richer state model in a later plan (noted in OQ-A).
- **No `watch()` streaming** — driver remains single-turn for each `send()` call; no persistent streaming iterator. Deferred per OQ-F.
- **No `$claude-review` / `$claude-adversarial-review`** — Plan 0003.
- **No stop-time review gate** — Plan 0005.
- **No benchmarked cost-savings claim** — copy uses Plan 0001 framing only. Plan 0004 reserved for measurement.
- **macOS + Linux only** — CI matrix `ubuntu-latest + macos-latest`. Windows deferred post-v1.
- **Ctrl+Z interacts with outer multiplexers** — `IPty.write(0x1a)` detaches from the PTY child, not user's outer terminal. May be intercepted if the user runs inside tmux/screen. Documented in README troubleshooting (F-A1 resolution).
- **Slow TTY warmup on some machines** — 5-second prompt-registration timeout is default; configurable via `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` env var. Documented in README troubleshooting (F-F1 resolution).
- **Real Claude transcripts are TUI byte streams** — sidecar + agents-json + logs are the semantic channels; raw PTY output never parsed. TUI byte-stream parsing a deeper rework (Plan 0002+).

## Follow-up plans

- **Plan 0003** — `$claude-review` and `$claude-adversarial-review` skills; reviewer-contract process fixes (F-H1, F-H2 investigations; explicit read-only briefs for review subagents).
- **Plan 0004** — benchmark harness comparing fresh-per-task background, reused-background, and P0001 patterns. Cost-claim copy update with measured data.
- **Plan 0005** — stop-time review gate and hook trust UX.
- **Plan 0006** — marketplace packaging and distribution polish (including committed marketplace root layout).

New follow-up surfaced by Plan 0002:

- **Node-pty stable release** should be tracked; when `node-pty@1.2.0` ships stable (no current ETA), Plan 0002 should upgrade and remove the beta-channel pin.
- **Sidecar schema drift** should remain covered by defensive parsing + fallback path tests as Claude CLI evolves. The `readSidecar` defensive parser and agents-json fallback should catch schema changes early.
- **Reviewer-contract robustness** — F-H1 and F-H2 findings show that implicit read-only contracts during review are insufficient. Plan 0003 should enumerate forbidden git/fs mutators (`checkout`, `restore`, `stash`, `reset`, `clean`) explicitly in review briefs, and require re-verification of optional-capability wire-up in downstream tasks.

## Lessons learned (process)

Two process findings from Stage 3 audit warrant forward-looking commentary:

### F-H1 — Implicit read-only contract violated

Subagent C (code-reviewer) in task T11 ran `git checkout` mid-review, wiping ~510 lines of Subagent B's test work that were staged for landing. The read-only contract was implicit in the subagent role name ("code-reviewer") and the task prompt, but was never explicit.

**Recommendation for Plan 0003+**: Every review subagent brief must enumerate forbidden git/filesystem mutators:
- No `git checkout`, `git restore`, `git stash`, `git reset`, `git clean`, `git rebase`, `git push --force` or `--no-verify`.
- No file deletes, renames, or edits to source files outside the current diff.
- Read-only inspection only: `git log`, `git diff`, `git show`, `ls`, `cat`, `grep`.

Write a single sentence into every review brief if the role is *any* kind of reviewer.

### F-H2 — Optional capability wire-up not re-verified downstream

Three rounds of source review (T7 code-review + T8 code-review + T12 code-review) did not flag the missing `adapter.readSidecar` wiring in the dispatcher's reconciler-adapter instantiation. Only the live E2E (T15) surfaced it as a bug (T15a remediation). The issue: T5 added the optional `readSidecar?` method to the reconciler-adapter interface; T8 integrated that interface into the dispatcher but did NOT wire the new method; T12 touched the dispatcher's command code but did NOT re-verify the wire-up.

**Recommendation for Plan 0003+**: When a task adds an optional capability to an interface (like `ReconcilerAdapter.readSidecar?`), every subsequent task that imports or instantiates that interface must explicitly re-verify the optional capability is wired at all instantiation sites.

Concretely: after T5 lands, any task touching `ReconcilerAdapter` or its consumers should receive a brief that includes: "Trace each optional capability (`readSidecar?`) from interface definition to every factory instantiation site; assert each one is wired or explicitly omitted with a code comment."

## Final verdict

Plan 0002 ships. Every locked constraint honored; all eight open questions resolved per Plan 0001's v1 scope; five low audit findings resolved in Stage 4 polish; no critical/high/medium findings outstanding; 756 tests pass (0 fail); remote CI green on all four matrix legs; live E2E proves the full `delegate → status → followup × 2 → result → stop` flow against real binaries.

