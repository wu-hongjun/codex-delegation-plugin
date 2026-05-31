# Stage 2 — Implement

> **Status**: in progress. Started 2026-05-31 after maintainer approval of Stage 1. All eight open questions in [`1-plan.md` § 6](1-plan.md#6-open-questions--resolved-2026-05-31) are resolved.

Running log of the actual implementation. Truthful, not polished. Update as you go — daily entries are better than a single retro.

## Conventions

- One section per task (T1, T2, …) matching [`1-plan.md` § 4](1-plan.md#4-tasks-with-acceptance-criteria).
- Each task section: what was built, what deviated from the plan and why, surprises, decisions, commit/PR links, test evidence.
- Anything bigger than a paragraph goes into `artifacts/` (logs, screenshots, diff exports).

## T1 — node-pty dependency + CI PTY smoke

**Started**: 2026-05-31. **Status**: complete (pending CI confirmation).

Files changed:

- `packages/driver-claude-code/package.json` — added `node-pty` to `dependencies`. **Pinned to `1.2.0-beta.13`** (deviation from plan; see below).
- `package-lock.json` — refreshed via `npm install`.
- `.github/workflows/ci.yml` — added a `PTY smoke (node-pty)` step between `Check formatting` and `Test`. Smoke spawns `/bin/sh -c 'echo ok'` under `pty.spawn` with full options (`name: 'xterm-color'`, `cols: 80`, `rows: 24`, `cwd: process.cwd()`, `env: process.env`), asserts `out.includes('ok')`, clears its timeout on success, exits 0.
- `packages/plugin-codex/test/ci-workflow.test.mjs` — Plan 0001 invariant `ci.yml does not contain "node-pty"` is no longer true under Plan 0002. Removed that one negative assertion; added a new `describe('ci.yml PTY smoke step (plan 0002)', ...)` block with three positive assertions: (1) step name `PTY smoke (node-pty)` present, (2) `node-pty` referenced, (3) PTY smoke step appears before the Test step.

### Deviation: `1.2.0-beta.13` instead of `^1.1.0`

[`1-plan.md` § 3.7](1-plan.md#37-pty-transport-details-research-block-b) locked `node-pty@1.1.0`. During T1 implementation, the local PTY smoke against `node-pty@1.1.0` failed on Node 25.1.0 (arm64) with `posix_spawnp failed.` — even for `/bin/sh -c 'echo ok'` with full env / cwd / cols / rows options. The prebuilt darwin-arm64 binary loads fine (`require('node-pty')` works; the module exposes `spawn`/`fork`/`createTerminal`/`open`/`native`), but the C++-side `pty.fork` call fails at the syscall level.

Hypothesis: `node-pty@1.1.0`'s prebuilt binary targets `node-addon-api@^7`, which supports Node 18–24. Node 25 is outside that ABI window. The maintainer's local environment runs Node 25.1.0; Plan 0001's live E2E was also Node 25.

Verified `node-pty@1.2.0-beta.13` (published 2026-05-13 per `npm view`) runs the same smoke cleanly on Node 25.1.0 (`exitCode: 0`, output `"ok\r\n"`).

Maintainer's call (2026-05-31): **pin to `1.2.0-beta.13` explicitly**. Trade: beta-channel exposure for the duration of Plan 0002; revisit when `node-pty@1.2.0` ships stable. Decision recorded here rather than retroactively editing `1-plan.md § 3.7` — the plan-as-approved cited `^1.1.0`; this Stage 2 entry is the deviation log per the workflow.

### Decisions taken (not in the plan but consistent with it)

- **Smoke uses `/bin/sh -c 'echo ok'`** instead of the plan's bare `echo`. Reason: bare `echo` requires PATH lookup, and `pty.spawn(..., {})` with no env inherits nothing — the smoke failed with `posix_spawnp failed.` even when the binding was healthy. `/bin/sh -c 'echo ok'` uses an absolute path and forwards env/cwd explicitly, which is robust on both macOS arm64 and on the Linux runners CI uses.
- **Smoke clears its 5-second timeout on successful exit** (`clearTimeout(timer)`). Reason: `setTimeout` keeps the event loop alive after the spawned process exits cleanly; without the `clearTimeout`, the smoke prints `PTY smoke ok` and then `PTY smoke timed out` 5 s later, exiting non-zero. The original plan text didn't specify this; corrected in the smoke source.
- **Tests-mjs delta**: removed 1 negative + added 3 positives = test:plugin lane grows by +2 (212 → 214). Net test total: 449 (mock 34 + runtime 82 + driver 119 + plugin 214). No tests removed elsewhere.

### Acceptance evidence (2026-05-31)

- `npm ci` ... actually `npm install` (lockfile refresh) — exit 0; `node-pty@1.2.0-beta.13` resolves and installs (prebuilt darwin-arm64 binary used; no local compile).
- Local PTY smoke (Node 25.1.0 arm64): prints `PTY smoke ok`, exits 0.
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm run test:plugin` → 214 pass / 0 fail. Other lanes unchanged: mock 34, runtime 82, driver 119. Total 449.
- Remote CI on `ca244c8` (run `26718240808`): conclusion **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`). Confirms `node-pty@1.2.0-beta.13` installs and the PTY smoke passes on Linux + macOS for both supported Node majors.

## T2 — Doctor probes for follow-up capability

**Started**: 2026-05-31. **Status**: complete (pending CI confirmation).

Files changed:

- `packages/runtime/src/doctor.ts` — added three runtime-level Plan 0002 probes (`probeClaudeAttachHelp`, `probeClaudeBgNoPrompt`, `probeSidecarJobsDir`); introduced `DoctorCapability` type, optional `capabilities` field on `DoctorProbeResult`, new `DoctorExtraProbe` injection type, new `delegateCapability` / `followupCapability` aggregates on `DoctorReport`. `PROBES` array now carries per-probe capability metadata; `runDoctor()` honors `options.extraProbes` for layered probe injection.
- `packages/driver-claude-code/src/pty-probe.ts` — new module exposing `ptyBuildExtraProbe: DoctorExtraProbe`. The probe dynamically imports `node-pty`, spawns `/bin/sh -c 'echo ok'` under a real PTY, waits up to 5s for an exit, asserts `'ok'` in stdout. Failure messages guide users to `npm rebuild node-pty` or `@homebridge/node-pty-prebuilt-multiarch`.
- `packages/driver-claude-code/src/index.ts` — `export * from './pty-probe.js'`.
- `packages/plugin-codex/scripts/claude-companion.mjs` — `cmdSetup` now passes `{ extraProbes: [ptyBuildExtraProbe] }` to `runDoctor`. The runtime never imports node-pty; the driver provides the probe via DI.
- `packages/plugin-codex/scripts/lib/format.mjs` — `formatSetup` groups probes by capability ("Shared", "Follow-up only", "Informational") and surfaces per-capability aggregates. JSON output gains `delegateCapability` + `followupCapability` top-level fields.
- `tools/mock-claude/claude` — added `cmdAttach` (`attach --help` returns documented usage including `Detach with Ctrl+Z`); intercepted `claude --bg --help` to print usage without starting a session; `ensureHome()` now creates `<HOME>/jobs/` alongside `projects/` and `logs/`; new config flags `attachHelpAvailable: true` and `bgNoPromptAvailable: true` (both default-true; tests flip them to exercise probe-failure paths).
- `tools/mock-claude/README.md` — documented the two new contract rows and the two new config flags.
- `packages/runtime/test/doctor.test.mjs` — +12 tests covering all three new probes (happy + failure paths) and four new `runDoctor` tests (capability aggregates, delegate-vs-followup independence, `extraProbes` injection, extraProbe failure isolated to followup capability). Updated the two healthy-mocks test setups to also `mkdir <MOCK_HOME>/jobs` and to expect the new probe count (12 → 15 built-ins).
- `packages/runtime/test/reconciler.test.mjs` — relaxed the architectural-invariant ban list from `['driver-claude-code', 'claude --bg', 'claude -p', 'node-pty']` to `['driver-claude-code', 'claude -p', 'node-pty']`. See deviation below.
- `tools/mock-claude/test/mock-claude.test.mjs` — +6 tests covering `attach --help` (default-ok + flag-flipped-to-fail + non-help-attach-rejected), `--bg --help` (default-ok with no session created + flag-flipped-to-fail), and `<HOME>/jobs` directory creation under `--bg`.
- `packages/driver-claude-code/test/pty-probe.test.mjs` — new file, 2 tests: probe shape (name / capabilities / run) and end-to-end smoke (status ok against the local `node-pty` install).
- `packages/plugin-codex/test/dispatcher.test.mjs` — +3 tests: setup JSON exposes `delegateCapability`/`followupCapability`; setup JSON includes the injected `pty-build` probe with `capabilities: ['followup']`; human-output groups probes by capability and shows per-capability aggregates. Updated the existing human-output probe-name list to include the four new probe names.

### Deviation: ordering vs. plan T2/T3

[`1-plan.md § 4`](1-plan.md#4-tasks-with-acceptance-criteria) ordered T2 before T3, but T2's probes (`claude attach --help`, `claude --bg --help`, `sidecar-jobs-dir`) need minimal mock support that the plan also listed under T3 (mock `attach` subcommand, `--bg` no-prompt, sidecar dir creation). Rather than reordering tasks, T2 absorbed the **minimum** mock additions required by its own probes:

- `cmdAttach` handles only `attach --help` and bare `attach <id>` (the latter is a stub that exits 1 pointing at T3).
- `claude --bg --help` interception (not full no-prompt session creation).
- `<HOME>/jobs/` directory creation under `ensureHome()`.

The bigger T3 work — full PTY emulation under `attach <id>` (readline that handles `\r` as submit and `0x1a` as detach), sidecar `state.json` + `timeline.jsonl` emulation, permission-prompt simulation — is still T3 scope. T3 will replace the stub `cmdAttach` body.

### Deviation: relaxed `claude --bg` from the architectural-invariant ban list

[`reconciler.test.mjs:563`] previously banned the literal substring `claude --bg` in every `.ts` file under `packages/runtime/src/`. The ban was a Plan 0001 over-conservative protection: it conflated "no session-start invocations in runtime" with the literal substring. Plan 0002's `probeClaudeBgNoPrompt` legitimately invokes `claude --bg --help` (a read-only feature probe, not a session start), so the literal-substring ban over-caught.

The remaining bans (`driver-claude-code`, `claude -p`, `node-pty`) are the load-bearing architectural protections — they prevent the runtime from importing the driver package, falling back to the synchronous print-mode transport, or growing a direct PTY dependency. The reconciler test's comment was updated to spell this out.

### Decisions taken (not in the plan but consistent with it)

- **`probeClaudeBgNoPrompt` runs `claude --bg --help`**, not a literal no-prompt `--bg`. Real 2.1.149's `--bg` accepts both shapes; running `claude --bg` without `--help` would start a session as a side effect of the probe. Using `--help` makes the probe strictly read-only.
- **`DoctorProbeResult.capabilities?` is optional** so single-probe callers (e.g. unit tests of one probe) don't need to construct the capability list. `runDoctor` populates it for every probe in its returned report.
- **`DoctorExtraProbe` types live in runtime** (not driver). The runtime defines the contract; the driver implements one. Mirrors Plan 0001's `ReconcilerAdapter` shape.
- **Informational probes** (`claude-bg-flag`, `claude-daemon`, `codex-plugin-trust`) are tagged with `capabilities: []`. They contribute to `report.status` (overall aggregate) but not to either per-capability aggregate. This matches OQ-G's "warnings, not fails" intent.

### Test impact

| Lane | Before T2 | After T2 | Δ |
|---|---|---|---|
| test:mock | 34 | 40 | +6 |
| test:runtime | 82 | 94 | +12 |
| test:driver | 119 | 121 | +2 |
| test:plugin | 214 | 217 | +3 |
| **Total** | **449** | **472** | **+23** |

### Acceptance evidence (2026-05-31)

- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 472 pass / 0 fail.
- Doctor smoke test (against the real `node-pty` install on the maintainer's machine, Node 25.1.0 arm64): `ptyBuildExtraProbe.run({})` returns `{ status: 'ok', detail: 'node-pty PTY smoke passed (/bin/sh -c "echo ok").' }`.
- Plan 0001 invariant `runtime/src` never imports `driver-claude-code` / `claude -p` / `node-pty` — still passing with the relaxed ban list.
- Remote CI on `8ad13ff` (run `26718681911`): conclusion **success** on all four matrix legs (`ubuntu-latest + macos-latest × Node 20 + 22`).

## T3 — Mock-claude attach PTY + sidecar emulation

**Started**: 2026-05-31. **Status**: complete (pending CI confirmation).

First T-task run under the subagent pattern (A executor + B test-engineer + C code-reviewer). Three subagents:

- **Subagent A (executor, sonnet)** — owned the mock implementation in `tools/mock-claude/`. Replaced the T2 stub `cmdAttach` with full PTY-attach emulation, layered sidecar emulation onto `cmdBg`/`cmdStop`, and added two new config flags (`attachResponse`, `permissionStall`). Also made `tools/mock-claude/test/helpers.mjs#withIsolatedHome` async-aware so Subagent B's PTY tests could run cleanly.
- **Subagent B (test-engineer, sonnet)** — owned `tools/mock-claude/test/attach.test.mjs` (new). Wrote 20 PTY-driven tests against the same contract spec A worked from, covering sidecar shape, lifecycle transitions, multi-turn attach, permission stall, `attachResponse` substitution, and stop-time sidecar writes.
- **Subagent C (code-reviewer, opus)** — independent scope/contract/security review. Verdict: **`ready-for-T4`**. 0 critical/high/medium findings, 4 low + 2 nit (none blocking).

### Files changed

- `tools/mock-claude/claude` — sidecar helpers (`sidecarDir`, `writeSidecar`, `appendTimeline`, `buildSidecarBase`, `formatResponse`); `cmdBg` writes sidecar on every invocation (no-prompt: `state: "idle"` one timeline line; with-prompt: `working → done` two timeline lines); `cmdStop` adds a `stopped` sidecar transition; `cmdAttach` is now a real PTY-attached byte-reading loop (`\r`/`\n` submit, `0x1a` detach, others accumulate); `permissionStall: true` intercepts the first submit per attach. `cmdAttach` returns sentinel `-1` to keep the event loop alive; the main dispatch special-cases this so `process.exit` isn't called.
- `tools/mock-claude/test/helpers.mjs` — `withIsolatedHome` now detects whether the callback returns a Promise and defers cleanup until the promise settles. Synchronous behavior unchanged.
- `tools/mock-claude/test/attach.test.mjs` — new, 20 tests across 9 groups (sidecar-on-bg-with-prompt, sidecar-on-bg-no-prompt, attach-unknown-session, attach-help regression, PTY single-turn lifecycle, multi-turn, permission stall, attachResponse template, cmdStop sidecar).
- `tools/mock-claude/README.md` — documented sidecar schema, four lifecycle transitions, two new config flags.

### Decisions taken (not in the plan but consistent with it)

- **Unknown-session error wording**: `"unknown session: <id>; cannot attach"` instead of plain `"unknown session: <id>"`. Reason: the pre-existing T2 stub test in `mock-claude.test.mjs` asserts on `/not implemented|cannot attach/`; the new wording matches that regex on the `cannot attach` arm while also matching the new `attach.test.mjs §3` regex `/unknown session/`. Both pass.
- **`withIsolatedHome` async-aware**: needed for B's PTY tests, which use `await` inside the callback. The original helper deleted the temp dir before the promise settled, which broke the tests. The async path uses duck-typed `typeof result.then === 'function'` detection; sync callers are unchanged.
- **`cmdAttach` sentinel `-1`** instead of `process.exit` — lets the event loop stay alive while the stdin reader processes bytes. Dispatcher main loop special-cases `-1` to mean "don't call process.exit; the command will exit itself on detach".
- **No-prompt `--bg` banner** in legacy mode (`bgStdoutStyle: 'started-session'`) now includes `(idle)`. The contract didn't dictate the legacy no-prompt banner format; A picked a defensible wording. Existing tests pass.

### Subagent C findings (severity + disposition)

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| L1 | low | B's report said 18 tests; the actual count is 20. Doc-only discrepancy. | Corrected here. |
| L2 | low | `tools/mock-claude/test/mock-claude.test.mjs:471` ("rejects bare `attach` ... lands in T3") is now stale — bare `attach` is no longer a stub. Test still passes via the `\|cannot attach` regex arm but is redundant with the new `attach.test.mjs §3`. | Deferred to Stage 4 polish. |
| L3 | low | `attach.test.mjs:330` had a dead OR arm — `r.stdout.includes('Usage:\s+claude attach')` is a literal-string includes, not a regex; `\s+` is the literal four characters. | **Fixed in this commit** — replaced the OR-with-dead-arm with `assert.match(r.stdout, /Usage:\s+claude attach/, ...)`. |
| L4 | low | `attach.test.mjs:411` derives `derivedShort` but the OR-branch matching it is unreachable in real-2.1.149 mode (no `shortId` field). | Reviewer-blessed; left as-is. |
| N1 | nit | `cmdAttach` accepts `\n` as well as `\r` for submit. Matches the contract. | OK, no change. |
| N2 | nit | `setRawMode(true)` + `resume()` pattern at `cmdAttach`. Standard PTY raw-mode. | OK, no change. |

### Test impact

| Lane | Before T3 | After T3 | Δ |
|---|---|---|---|
| test:mock | 40 | 58 | +18 (20 new in `attach.test.mjs`; one T2 test stayed; mock-codex unchanged at 4) |
| test:runtime | 94 | 94 | — |
| test:driver | 121 | 121 | — |
| test:plugin | 217 | 217 | — |
| **Total** | **472** | **490** | **+18** |

### Acceptance evidence (2026-05-31)

- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- All four lanes green: mock 58 + runtime 94 + driver 121 + plugin 217 = 490 pass / 0 fail.
- Sidecar smoke (manual): `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME=<tmp> claude --bg "hello"` produces `<tmp>/jobs/<shortId>/state.json` with `state: "done"` and `<tmp>/jobs/<shortId>/timeline.jsonl` with two lines (`working`, then `done`). Verified by Subagent A as part of its acceptance check.
- PTY attach smoke (under `node-pty`): exercised by `attach.test.mjs §5–§8` against the new `cmdAttach` — turn injection, multi-turn, permission stall, custom `attachResponse` all green.
- Remote CI confirmation will be appended once T3 commit lands on `main`.

## Deviations from the plan

- **node-pty version pin** (T1) — `^1.1.0` → `1.2.0-beta.13`. Reason: Node 25 ABI incompatibility with `1.1.0`. Maintainer approved.
- **T2 absorbed minimal mock additions** that the plan listed under T3 (attach --help, --bg --help interception, jobs/ dir creation) — see T2 deviation above. The bigger T3 work (full PTY emulation under `attach <id>`, sidecar state.json/timeline.jsonl emulation, permission-prompt simulation) was completed in T3.
- **Architectural-invariant ban list relaxed** (T2) to drop `claude --bg` — see T2 deviation above. The load-bearing bans (`driver-claude-code`, `claude -p`, `node-pty`) remain.
- **`withIsolatedHome` async-aware refactor** (T3) — not pre-specified but necessary for PTY tests to clean up correctly after `await`-based callbacks. Sync callers are unchanged.

## Surprises

- `pty.spawn(..., {})` with empty options does NOT inherit env, so PATH lookups fail. Plan's smoke command needs an explicit cwd/env/cols/rows. (Documented in T1 decisions.)
- The Plan 0001 invariant test `ci.yml does not contain "node-pty"` correctly fired against the Plan 0002 dep change. Good catch by the static suite. Inverted to a positive assertion in T1 rather than just deleted.
- The Plan 0001 architectural-invariant test's `claude --bg` ban over-caught — the substring appears legitimately in Plan 0002's `probeClaudeBgNoPrompt` (read-only `--help` probe). Relaxed in T2.
