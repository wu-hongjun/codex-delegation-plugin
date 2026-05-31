# Stage 2 — Implement

> **Status**: in progress. Started 2026-05-30 after maintainer approval. All six open questions in [`1-plan.md` § 6](1-plan.md#6-open-questions--resolved-2026-05-30) are resolved.

Running log of the actual implementation. Truthful, not polished. Update as you go — daily entries are better than a single retro.

## Conventions

- One section per task (T1, T2, …) matching [`1-plan.md` § 4](1-plan.md#4-tasks-with-acceptance-criteria).
- Each task section: what was built, what deviated from the plan and why, surprises, decisions, commit/PR links, test evidence.
- Anything bigger than a paragraph goes into `artifacts/` (logs, screenshots, diff exports).

## T1 — Repo scaffolding

**Started**: 2026-05-30. **Status**: awaiting `npm install` + acceptance run.

Files created:

- `package.json` — npm workspaces root; scripts: `lint`, `format`, `typecheck`, `build`, `clean`, `test` (test deferred to T3).
- `tsconfig.base.json` — strict TS config with `composite`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, NodeNext.
- `tsconfig.json` (root) — project-references aggregator.
- `eslint.config.mjs` — ESLint v9 flat config + `typescript-eslint` recommended. `references/`, `tools/`, `.omc/`, `documentation/` ignored.
- `.prettierrc`, `.prettierignore` — 2-space, 100-col, single quotes, semis, trailing commas. Prettier skips `.md` to preserve plan/README authorial style.
- `.editorconfig` — 2-space LF UTF-8, final newline, no trailing whitespace; markdown keeps trailing whitespace.
- `.gitignore` — `node_modules/`, `dist/`, `*.tsbuildinfo`, `.DS_Store`, etc.
- Three packages, each with `package.json` + `tsconfig.json` (extending base, with project refs) + `src/index.ts` (`export {};`):
  - `packages/runtime/` (`@cc-plugin-codex/runtime`)
  - `packages/driver-claude-code/` (`@cc-plugin-codex/driver-claude-code`, depends on runtime)
  - `packages/plugin-codex/` (`@cc-plugin-codex/plugin-codex`, depends on runtime + driver-claude-code)

Decisions taken (not in the plan but consistent with it):

- **ESLint v9 flat config** (`eslint.config.mjs`) rather than legacy `.eslintrc.cjs`. Flat config is the supported path in v9; legacy is in the long-deprecation chute.
- **`verbatimModuleSyntax: true`** at the base tsconfig. Forces explicit `import type`/`export type` and prevents accidental runtime imports of types — useful at scale.
- **`noUncheckedIndexedAccess: true`** at the base tsconfig. Surfaces a class of `undefined` bugs the strict-mode default misses.
- **Workspace deps use `"0.0.0"`** literal version strings, matching npm-workspace convention. npm replaces these with symlinks during `npm install`.

**Acceptance evidence (2026-05-30)**:
- `npm install` exited 0.
- `npm run lint` exited 0 with no warnings.
- `npm run typecheck` exited 0; `tsc --build` produced `dist/index.{js,d.ts,js.map,d.ts.map}` in all three packages.
- `npm run format` exited 0 after one auto-fix to `packages/plugin-codex/tsconfig.json` (single-line `references` array).

**Status**: complete.

## T2 — Mock `claude` binary

**Started**: 2026-05-30. **Status**: complete.

Files created:

- `tools/mock-claude/claude` — single-file Node script (executable, shebang `#!/usr/bin/env node`). Implements: `--version`, `auth status`, `daemon status`, `--bg`, `agents --json`, `logs <id>`, `stop <id>`. Unknown commands exit 2 with a usage hint.
- `tools/mock-claude/README.md` — contract documentation (command surface table, env vars, state layout).
- `tools/mock-claude/test/helpers.mjs` — `runClaude()`, `withIsolatedHome()`, `writeConfig()`. Each test gets its own `mkdtempSync` HOME so no cross-test state leakage.
- `tools/mock-claude/test/mock-claude.test.mjs` — 19 tests covering all 8 maintainer-specified scenarios plus tolerance for extra flags, malformed-JSON fixture, log-fail fixture, daemon-stopped fixture, unknown commands.

State / config contract (matches maintainer T2 instruction):
- State dir: `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME` env var; defaults to `${os.tmpdir()}/cc-plugin-codex-mock-claude`. **Never** touches `~/.claude`.
- Config file: `CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG` env var → JSON file with `version`, `authStatus`, `daemonStatus`, `bgFails`, `agentsJsonMalformed`, `logsFail`.
- State layout: `<HOME>/state.json` (sessions array) + `<HOME>/projects/<sanitized-cwd>/session-<shortId>.jsonl` (starter transcript) + `<HOME>/logs/<shortId>.log`.

Behavior choices:
- Short ID format: `randomBytes(3).toString('hex')` → 6 hex chars. Stable across calls within a test, deterministic-looking, never collides in practice.
- Starter transcript includes one `meta` line + one user `message` + one assistant `message`. T3/T8 transcript parser tests can rely on this minimum.
- `claude --bg` tolerates `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--settings`, `--fallback-model`, `--agent` as value-flags (recognized; non-`--name` accepted and ignored). Unknown `--flags` best-effort skipped.

Root `package.json` additions:
- `test:mock` script: `node --test tools/mock-claude/test/*.test.mjs`
- Top-level `test` script now invokes `test:mock`.

One bug found and fixed during T2:
- Initial `cmdBg` called `appendFileSync(logPath, …)` **before** `ensureHome()` ran (via `loadState()`), so an isolated test HOME would fail with `ENOENT: no such file or directory … /logs/<id>.log`. Fix: call `ensureHome()` first thing in `cmdBg`. Tests caught this on the first run.

Deviations from the plan:
- ESLint config still ignores `tools/**` (plain JS, not part of the TS lint surface in v1). The mock's correctness is enforced by its own test suite, not by lint. Revisit if the mock grows.

**Acceptance evidence (2026-05-30)**:
- The executable is named exactly `tools/mock-claude/claude` (no `.sh`, no `.mjs`, no shim), so `PATH=tools/mock-claude:$PATH claude …` resolves the command as plain `claude`. This was the most important T2 acceptance detail.
- `chmod +x tools/mock-claude/claude` set (`-rwxr-xr-x`).
- `PATH=tools/mock-claude:$PATH claude --version` → `Claude Code 2.1.999-mock` (verified via `runClaude` test helper).
- `npm run test:mock` → 19 pass, 0 fail.
- `npm run lint` clean.
- `npm run format` clean (mock files auto-formatted on first prettier pass).
- Real `~/.claude` not touched (mock state isolated to per-test temp dirs).

## T3 — Runtime: paths + job-store primitives

**Started**: 2026-05-30. **Status**: complete.

Files created in `packages/runtime/src/`:

- `paths.ts` — `getCompanionHome()` reads `CC_PLUGIN_CODEX_HOME` env at call time (so test overrides take effect); default `~/.codex/cc-plugin-codex`. Helpers `getJobsDir`, `getLogsDir`, `getDoctorPath`, `getJobRecordPath`, `getJobEventsPath`, `getJobResultPath`, `getJobLockPath`, plus the one mutating helper `ensureCompanionDirs()` (the only function that touches the filesystem).
- `errors.ts` — typed errors: `JobStoreError` (base), `JobNotFoundError`, `JobLockError`, `InvalidJobIdError`, `CorruptJobRecordError`. Each carries structured context (`jobId`, `path`, `lockInfo`, `cause`).
- `types.ts` — `JobStatus`, `JobRecord` + sub-types (`CodexContext`, `WorkspaceContext`, `DriverContext`, `ClaudeSessionContext`, `PromptContext`, `ResultContext`, `JobError`), `CreateJobInput`, `JobStoreWarning`, `ListJobsResult`. `driver.capabilitiesSnapshot` is `unknown` in v1 to avoid circular pressure with the driver package.
- `job-store.ts` — atomic JSON writes (write-temp-then-rename, unique temp names `<target>.<pid>.<hex>.tmp`), `open(path, "wx")` lock files with PID/hostname/operation metadata, strict job-ID validation, corrupt-record tolerance.
- `index.ts` — re-exports everything (`export * from` for value exports; `export type *` for types-only modules).

Files created in `packages/runtime/test/`:
- `job-store.test.mjs` — 27 tests imported from `../dist/index.js` so we exercise the compiled code path. Each test gets its own `mkdtempSync` home; env restoration in afterEach prevents leakage.

Decisions taken:

- **`listJobs()` returns `{ jobs, warnings }`** (not just `jobs`). This matches the maintainer's robust-shape-early guidance — corrupt records become warnings, never crashes. `listJobsForWorkspace` filters the `jobs` array but preserves the same `warnings` shape.
- **Job ID pattern locked to `/^job_[a-z0-9]+_[a-f0-9]{8}$/`**. Strictly excludes `/`, `\`, `..`, whitespace, dots — path-traversal-proof at the validation layer; tested directly.
- **`generateJobId()` does NOT introduce a `ulid` dep**. Format: `job_<base36 ms timestamp>_<8 hex>` — deterministic, monotonic-ish, no extra dependency, fits the validation regex.
- **Lock metadata writes through `handle.writeFile()`** (not `write()`+`fsync`). `wx` mode plus rename-based atomicity is enough for v1; the lock file is small (~120 bytes) and short-lived.
- **`updateJob()` uses try/finally** so the lock releases even when the updater throws. Tested with `updater boom`.
- **In-flight `.tmp` files are skipped** in `listJobs()` so a crash between `writeFile` and `rename` doesn't surface as a warning during a normal listing.
- **`'globals'` package added as a devDependency**. ESLint v9 flat config doesn't know about Node globals by default; adding `globals.node` to the `.ts`/`.mjs` lane fixed `process`/`setTimeout` undef errors in tests. Same lane now covers both source TS and test MJS.

Bugs caught + fixed during T3:
- `JobStoreError.cause` needed `override` modifier (Error.prototype.cause is part of ES2022 / Error). Fixed.
- ESLint flagged `process` and `setTimeout` as undefined in `.mjs` tests. Added `globals.node` to the lint lane.
- Two files needed prettier auto-formatting (`job-store.ts`, `job-store.test.mjs`) — applied on first format pass.

Root `package.json` script additions:
- `test:runtime`: `npm run build && node --test packages/runtime/test/*.test.mjs`
- `test`: now runs `test:mock && test:runtime`.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean (project-reference build succeeded across all three packages).
- `npm run format` clean.
- `npm test` → 19 mock + 27 runtime = 46 pass, 0 fail.
- All 12 maintainer-required test scenarios covered:
  1. path helpers resolve under env override ✓
  2. ensureCompanionDirs creates dirs ✓
  3. createJob writes valid record; derived paths match helpers ✓
  4. readJob round-trip ✓
  5. updateJob changes status + updatedAt ✓
  6. updateJob releases lock on updater throw ✓
  7. updateJob fails with `JobLockError` when lock exists ✓
  8. appendEvent / readEvents round-trip in order ✓
  9. listJobsForWorkspace filters by workspace.root ✓
  10. listJobs skips corrupt JSON, surfaces a warning ✓
  11. invalid job IDs rejected (including path-traversal attempts) ✓
  12. tryReadJob returns null for missing ✓

## T4 — Runtime: doctor probes

**Started**: 2026-05-30. **Status**: complete.

Files created / updated:

- `packages/runtime/src/doctor.ts` — 12 probes, `runDoctor()`, public types (`DoctorProbeStatus`, `DoctorProbeResult`, `DoctorReport`, `DoctorOptions`), and an internal `runCommand` helper using `node:child_process.spawn` (`shell: false`, explicit `timeoutMs`, captures stdout/stderr, never throws — non-zero exits surface as `DoctorProbeResult.fail` with structured evidence).
- `packages/runtime/src/index.ts` — re-exports doctor.
- `packages/runtime/test/doctor.test.mjs` — 28 tests covering each probe in isolation + 9 `runDoctor` aggregation tests.
- `tools/mock-codex/codex` — minimal executable Node script implementing `codex --version` only. Honors `CC_PLUGIN_CODEX_MOCK_CODEX_CONFIG` (`version`, `versionFails`, `sleepMs`).
- `tools/mock-codex/README.md` — contract.
- `tools/mock-codex/test/helpers.mjs` + `tools/mock-codex/test/mock-codex.test.mjs` — 4 tests.
- Updated `tools/mock-claude/claude`:
  - Added `sleepMs` config flag (`Atomics.wait`-based blocking sleep). Used by the doctor timeout test.
  - Added `logs --help` handling (prints usage, exits 0) so `probeClaudeLogs` has a non-mutating help form to call.
  - **Bug fix**: `loadState()` no longer calls `ensureHome()`. Read-only commands (`agents --json`, `logs <unknown>`, `stop <unknown>`) must not create `<HOME>/projects/` as a side effect, because the `transcript-path` probe reads that path next. Caught by `aggregates warn — only transcripts/plugin-trust missing` failing on the first test run.

Probe behavior summary:

| Probe | Strategy |
|---|---|
| `node-version` | `process.versions.node` ≥ 20 |
| `codex-version` | spawn `codex --version`; 0 = ok, nonzero/timeout/ENOENT = fail |
| `claude-binary` | spawn `claude --version`; success = ok |
| `claude-version` | spawn `claude --version`; require non-empty stdout. Feature-probe baseline only — no semver pin (per OQ5). |
| `claude-auth` | spawn `claude auth status`; 0 = ok |
| `claude-bg-flag` | spawn `claude --help` (Option B), look for `--bg` literal |
| `claude-agents-json` | spawn `claude agents --json`; require parseable JSON array |
| `claude-logs` | spawn `claude logs --help` |
| `claude-daemon` | spawn `claude daemon status` |
| `transcript-path` | filesystem `existsSync(<mock-or-real-home>/projects)`; missing = **warn**, not fail (per maintainer instruction) |
| `codex-plugin-trust` | read `~/.codex/config.toml` (or `CC_PLUGIN_CODEX_MOCK_CODEX_TOML`), text-search for `claude-companion` + `trust|enabled`. Missing or unconfirmed = **warn**, not fail. No TOML parser dep. |
| `companion-dir-writable` | `ensureCompanionDirs()` + write/read/delete a probe file under `getCompanionHome()` |

`runDoctor()` aggregates: any fail → fail; else any warn → warn; else ok. Default writes `doctor.json` snapshot atomically (write-temp + rename) at `getDoctorPath()`. `writeSnapshot: false` opts out.

Test scenarios (all 12 maintainer-specified + extras):

| # | Scenario | Test |
|---|---|---|
| 1 | ok against healthy mocks | `runDoctor returns ok against fully healthy mocks` |
| 2 | writes doctor.json by default | `writes doctor.json by default` |
| 3 | skips write when `writeSnapshot=false` | `does NOT write doctor.json when writeSnapshot=false` |
| 4 | unauthenticated → fail aggregate | `aggregates fail when claude-auth fails` |
| 5 | malformed agents JSON → fail | `aggregates fail when agents JSON is malformed` |
| 6 | daemon stopped → fail | `aggregates fail when daemon is stopped` |
| 7 | missing transcripts → warn | `aggregates warn — not fail — when only transcripts/plugin-trust are missing` |
| 8 | missing codex config → warn | same test |
| 9 | companion dir not writable | **positive path only** in v1 (negative path is flaky on macOS temp dirs; documented and deferred) |
| 10 | timeout → fail | `timeout maps a slow probe to fail` (uses `sleepMs: 5000` + `timeoutMs: 50`) |
| 11 | missing claude on PATH | `fail when claude not on PATH` (binary + version probes both fail) |
| 12 | missing codex on PATH | `aggregates fail when codex is missing entirely` |

Decisions taken:

- **`probeClaudeBgFlag` uses `claude --help`**, not `claude --bg --help`. The latter would risk parser ambiguity (real `claude --bg` expects a prompt). The mock's existing `--help` already mentions `--bg`.
- **`probeClaudeBinary` calls `claude --version`**, not `which claude`. Avoids shell dependency and is portable.
- **`probeClaudeVersion` is feature-probe only** — non-empty stdout is enough. No semver gating per OQ5.
- **`probeCodexPluginTrust` is text-search**, not TOML-parser-based. No new dependency. Plan 0005 may revisit when hooks become a real path.
- **`runDoctor` uses an inline atomic write** (write tmp + rename) rather than reaching into the job-store's `atomicWriteJson` private. Doctor and job-store can both grow independent file shapes; sharing prematurely is overfitting.
- **Companion-dir-writable negative test deferred** — chmod 0o000 on macOS temp dirs is flaky and the afterEach cleanup also fails. The probe's failure path is exercised by failing `ensureCompanionDirs` indirectly in production; we'll add a real negative test if real-world failures surface.

Root `package.json` script additions:
- `test:mock`: now globs both `tools/mock-claude/test/*.test.mjs` and `tools/mock-codex/test/*.test.mjs`.
- `test:doctor`: `npm run build && node --test packages/runtime/test/doctor.test.mjs` (quick iteration).

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean (after one prettier auto-fix on `doctor.ts`).
- `npm test` → 23 mock + 55 runtime = **78 pass**, 0 fail.
- `npm run test:doctor` (focused) → 28 pass, 0 fail.
- `runDoctor` produces a stable report against the fully-healthy mock matrix and reports the right aggregate status under every required failure mode.

## T5 — Driver: probe + types

**Started**: 2026-05-30. **Status**: complete.

Files created:

- `packages/runtime/src/driver.ts` — public `Driver` interface + `DriverCapabilities`, `DriverHealth`, `StartSessionOpts`, `SessionHandle`, `TurnHandle`, `SessionStatusValue`, `SessionStatus`, `WatchOpts`. Type-only module.
- `packages/runtime/src/events.ts` — `DriverEvent` discriminated union. v1 subset: `session.started`, `session.status`, `message.completed`, `tool.started`, `tool.completed`, `file.changed`, `usage.updated`, `session.completed`, `session.stopped`, `error`. No per-token deltas; no PTY events.
- `packages/runtime/src/errors.ts` — added `DriverNotImplementedError` extending `Error` directly (not `JobStoreError` — semantically separate). Carries `methodName` and `planReference` so future grepping points at the right T-task.
- `packages/runtime/src/index.ts` — re-exports `driver.ts` (`export type *`) and `events.ts` (`export type *`).
- `packages/driver-claude-code/src/types.ts` — driver-local constants `DRIVER_NAME = 'claude-background'`, `DRIVER_VERSION = '0.0.0'`, and `ClaudeBackgroundDriverOptions` interface.
- `packages/driver-claude-code/src/probe.ts` — `probeClaudeBackgroundDriver(options)` runs exactly 8 Claude-only probes and aggregates them into a `DriverCapabilities`. **Explicitly does NOT call `runDoctor()`** — Codex / plugin-trust / companion-dir state must not affect the driver's view of its own health.
- `packages/driver-claude-code/src/index.ts` — `ClaudeBackgroundDriver implements Driver`. `probe()` is the only real implementation. `startSession`, `status`, `stop` reject with `DriverNotImplementedError(method, 'plan 0001 TX')`. `watch` throws synchronously (it returns an iterable, not a promise). `dispose()` is a no-op (v1 holds no persistent resources).
- `packages/driver-claude-code/test/probe.test.mjs` — 13 tests covering healthy, four degraded modes, Codex-independence, and all five lifecycle stubs.

Probe → capability mapping:

| Capability | Source probe | Rule |
|---|---|---|
| `claudeVersion` | `probeClaudeVersion` | probe.detail if `status === 'ok'`, else `null` |
| `backgroundSessions` | `probeClaudeBgFlag` | `'ok'` → `true` |
| `agentsJson` | `probeClaudeAgentsJson` | `'ok'` → `true` |
| `logsCommand` | `probeClaudeLogs` | `'ok'` → `true` |
| `transcriptPath` | `probeTranscriptPath` | `'ok'` → `true` |
| `attach` | (constant) | always `false` in v1 |
| `structuredStream` | `transcriptPath` | `'transcript'` if ok else `'none'` |
| `toolEvents` | `transcriptPath` | `'transcript'` if ok else `'none'` |
| `permissions` | `probeClaudeAuth` | `'ok'` → `'human-attach'` else `'none'` |
| `health.status` | aggregate | fail > warn > ok |

The aggregation matches the runtime doctor: any fail → fail; else any warn → warn; else ok. Missing transcript only triggers `warn`, not `fail`.

Decisions taken:

- **Driver probe is fully independent of Codex doctor**. Confirmed by the dedicated test `missing codex on PATH does NOT affect driver probe health` which puts only `tools/mock-claude` on PATH and asserts both `health.status === 'ok'` and that no `codex-*` / `companion-dir-writable` / `codex-plugin-trust` probe names leak into `caps.health.probes`.
- **`watch` throws synchronously** (rather than returning an iterable that rejects on first iteration). It is the only non-async-returning method on the interface; the sync throw is the more direct contract and tests it cleanly with `assert.throws`. Async methods use `Promise.reject` so tests use `assert.rejects`.
- **Eight probes in the driver, not nine.** `probeNodeVersion` is interesting for the whole-plugin doctor but is not Claude-specific — leaving it out keeps the driver probe surface tight.
- **Workspace imports work via `@cc-plugin-codex/runtime` package name** (npm workspaces symlink). Confirmed by tests successfully importing `DriverNotImplementedError` from the runtime package.
- **Re-exporting `export type *`** instead of `export *` for `driver.ts` and `events.ts`, because both are pure type modules under `verbatimModuleSyntax: true`.

Root `package.json` script additions:
- `test:driver`: `npm run build && node --test packages/driver-claude-code/test/*.test.mjs`
- `test`: now runs `test:mock && test:runtime && test:driver`.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean (after one fix: removed unused `DRIVER_NAME` / `DRIVER_VERSION` imports from `index.ts` that were already re-exported).
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 23 mock + 55 runtime + 13 driver = **91 pass**, 0 fail.
- All seven maintainer-required test scenarios covered:
  1. healthy mocks → ok with all capabilities populated ✓
  2. missing transcript → warn, structuredStream/toolEvents = 'none' ✓
  3. unauthenticated → fail, permissions = 'none' ✓
  4. malformed agents JSON → agentsJson false, fail ✓
  5. missing claude on PATH → all caps false / null, fail ✓
  6. missing codex on PATH does NOT affect driver probe ✓
  7. lifecycle stubs throw `DriverNotImplementedError`; `dispose` is a no-op ✓

## T6 — Driver: `startSession`

**Started**: 2026-05-30. **Status**: complete.

First task executed under the new "use subagents aggressively from T6 onward" standing instruction. Three subagents ran:
- **Subagent A (executor)** — owned `packages/driver-claude-code/src/background-session.ts` and the `startSession` integration in `index.ts`. Built the spawn helper, arg builder, parser, and main `startSession` function.
- **Subagent B (test-engineer)** — owned `packages/driver-claude-code/test/start-session.test.mjs`. Wrote 14 tests against the maintainer spec in parallel with A.
- **Subagent C (code-reviewer)** — read-only contract/scope review against T6 acceptance criteria, OQ1, OQ2, and scope boundaries. Returned `ready-for-T7` with one medium finding and three nits.

Orchestrator-level work:
- Pre-fanout: added `DriverError` to `packages/runtime/src/errors.ts` (carries `driverName`, `operation`, `exitCode?`, `stdout?`, `stderr?`, `cause?`). Done before launching A so A could import it.
- Integration fix 1: removed the stale `startSession rejects with DriverNotImplementedError` test from `probe.test.mjs` — that T5 stub assertion became obsolete the moment `startSession` was implemented.
- Integration fix 2: tightened the parser's Strategy-2 fallback regex. The maintainer's spec said `/^[a-zA-Z0-9_-]{4,}$/`, which matched English words like `here` from stdout `no id here\n`. Added an additional digit-required pattern `ID_FALLBACK_PATTERN = /^(?=[a-zA-Z0-9_-]*\d)[a-zA-Z0-9_-]{4,}$/` for the no-`session`-keyword fallback. Strategy 1 (token after `session`) still uses the original permissive pattern because the keyword is strong-enough context.
- Subagent-C finding (medium): the private `spawnCommand` helper had `opts.timeoutMs ?? 5000` even though its only caller resolves the timeout to `defaults.timeoutMs ?? 10000` first — making the inner `?? 5000` unreachable dead code. Tightened the helper's signature to require `timeoutMs: number` and removed the inner fallback. Comment block explains why the inner default would be unreachable.

Files touched (final):
- `packages/runtime/src/errors.ts` — added `DriverError` + `DriverErrorContext`.
- `packages/driver-claude-code/src/background-session.ts` — new module: `parseShortId()` (exported), `spawnCommand()` (private), `buildArgv()` (private), `startSession()` (exported, called by the class method).
- `packages/driver-claude-code/src/index.ts` — `startSession` now delegates to `bgStartSession`.
- `packages/driver-claude-code/test/start-session.test.mjs` — new test file, 14 tests.
- `packages/driver-claude-code/test/probe.test.mjs` — removed stale stub test for `startSession`.

Parser behavior (canonical):
- Strategy 1: scan tokens left-to-right; whenever `tokens[i].toLowerCase() === 'session'`, return `tokens[i+1]` if it matches `/^[a-zA-Z0-9_-]{4,}$/`.
- Strategy 2: scan tokens right-to-left; return the first that matches `/^(?=[a-zA-Z0-9_-]*\d)[a-zA-Z0-9_-]{4,}$/` (i.e. at least one digit + 4+ id chars).
- Returns `undefined` if both fail. The function never throws; the caller maps to `DriverError`.

Error behavior:
- Empty `opts.cwd` → `DriverError('cwd is required', { driverName, operation: 'startSession' })`.
- Empty/whitespace `opts.prompt` → `DriverError('prompt is required', { … })`.
- Spawn `ENOENT` → `DriverError('cannot run claude: ENOENT', { cause })`.
- Non-zero exit → `DriverError('claude --bg exited <code>', { exitCode, stdout, stderr })`.
- Timeout → `DriverError('claude --bg timed out after <ms>ms', { stdout, stderr })`.
- Parse failure → `DriverError('could not parse short ID from claude --bg output', { stdout, stderr })`.

OQ conformance (verified by Subagent C):
- **OQ1** — `--permission-mode` only appended when `opts.permissionMode` is explicitly supplied. No bypass flags anywhere. ✓
- **OQ2** — `opts.allowEdit` exists on `StartSessionOpts` but is NOT translated into a CLI flag. Inline comment in `buildArgv` documents that it's a policy/UX flag, not a sandbox. ✓

Scope discipline (verified by Subagent C):
- No `agents --json` parsing beyond what `startSession` strictly needs (which is nothing — long `sessionId` is a T7 concern, the handle is returned with only `shortId`).
- No transcript / logs / reconciler / dispatcher / skills / multi-turn / `node-pty` / `claude -p` anywhere in the diff. ✓

Subagent-C nits NOT addressed in this T6 pass (left for Stage 3/4):
- (low) `try/catch` around `spawn()` may be redundant for ENOENT on some Node versions — the `'error'` handler catches that path too. Defensive but harmless.
- (low) Subagent B's defensive `if (parseShortId) … else …` branch in the test file is technically dead since the export exists.
- (nit) `Date.now().toString(36)` for generated session-name suffix is non-sortable.

Subagent contributions log:
- Subagent A produced a working `background-session.ts` (~265 lines) and `index.ts` integration. Build/lint/format clean. Reported the parser contract precisely so Subagent B could write matching tests.
- Subagent B produced 14 tests covering every maintainer scenario plus the `parseShortId` unit tests (4 sub-cases). One mismatched expectation (parser must reject `no id here`) caused the integration-time parser-tightening described above.
- Subagent C confirmed scope conformance, returned `ready-for-T7`, and surfaced the medium-severity dead-default finding that was fixed in integration.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean (project-reference build green across `runtime`, `driver-claude-code`, `plugin-codex`).
- `npm run format` clean.
- `npm test` → 23 mock + 55 runtime + 27 driver = **105 pass**, 0 fail.
- Subagent C contract review: `ready-for-T7`, no scope violations, no blockers, no high-severity findings.

## T7 — Driver: `agents --json` parsing + `status`

**Started**: 2026-05-30. **Status**: complete.

Second task under the subagent pattern. Three subagents:
- **Subagent A (executor)** — owned `packages/driver-claude-code/src/agents-json.ts` (new) and the `status` integration in `index.ts`. Built `parseAgentsJson`, `findSessionStatus`, `getAgentsJson`, `statusForSession`, and a private `spawnCommand` helper (kept private — extraction to a shared `process.ts` deferred until T8 adds a third caller).
- **Subagent B (test-engineer)** — owned `agents-json.test.mjs`, `status.test.mjs`, and the `agentsJsonFails` mock fixture flag + README + mock test.
- **Subagent C (code-reviewer)** — contract review. Returned `ready-for-T8`, no blockers, no scope violations, two low + two nit findings.

Orchestrator-level integration work:
- Removed the stale `status rejects with DriverNotImplementedError` test from `probe.test.mjs` (same pattern as the T6 stale-stub removal).
- **Field-name realignment**: Subagent A followed my spec literally and put `status: SessionStatusValue` on `ParsedClaudeAgentSession`. Subagent B's tests independently assumed `value: SessionStatusValue` (mirroring runtime `SessionStatus.value`). Tests failed with `actual: undefined, expected: 'unknown'`. Resolution: rename impl `ParsedClaudeAgentSession.status` → `value`. This is the better name anyway — it matches the runtime convention and avoids overloading the word "status".
- **Field-name realignment 2**: Subagent B's first parser test used `s.name` but the impl exposes `s.sessionName` (per spec). Fixed the single test reference.
- **Lint fix**: unused `warnings` destructured variable in one test → removed.
- **Subagent C low #1 (applied)**: status field extraction now uses the same `str(obj, 'status', 'sessionStatus', 'session_status')` alias pattern as every other field. No current impact but defensively consistent.
- **Subagent C low #2 (not actioned)**: shortId raw-fallback only checks `raw['id']`; the `str` helper already normalizes `shortId` from any aliased key so this fallback is functionally a no-op. Left as-is per Subagent C's own observation.
- **Subagent C nits (not actioned)**: duplicate spawn helper between `background-session.ts` and `agents-json.ts` is deliberately tolerated until T8 adds a third caller; empty-string handle guard is correct.

Files touched (final):
- `packages/driver-claude-code/src/agents-json.ts` — new, ~330 lines.
- `packages/driver-claude-code/src/index.ts` — `status` now delegates to `statusForSession`.
- `packages/driver-claude-code/test/agents-json.test.mjs` — new, 30 tests.
- `packages/driver-claude-code/test/status.test.mjs` — new, 8 tests.
- `packages/driver-claude-code/test/probe.test.mjs` — removed obsolete `status` stub test.
- `tools/mock-claude/claude` — added `agentsJsonFails: boolean` config flag (default false). When true, `claude agents --json` writes `agents error\n` to stderr and exits 1. The pre-existing `agentsJsonMalformed` flag is unchanged (exit 0, malformed stdout).
- `tools/mock-claude/test/mock-claude.test.mjs` — added one test for the new flag.
- `tools/mock-claude/README.md` — documented the new flag in the contract table and JSON config example.

Parser alias precedence (camelCase first, then snake_case):

| Parsed field | Keys tried in order |
|---|---|
| `shortId` | `shortId`, `id` |
| `sessionId` | `sessionId`, `session_id` |
| `sessionName` | `sessionName`, `name` |
| `cwd` | `cwd`, `projectPath` |
| `pid` | `pid` |
| `value` (normalized status) | `status`, `sessionStatus`, `session_status` (orchestrator-added) |
| `startedAt` | `startedAt`, `started_at` |
| `updatedAt` | `updatedAt`, `updated_at` |
| `transcriptPath` | `transcriptPath`, `transcript_path` |

Status normalization mapping:
- `working`, `running`, `active`, `in_progress`, `in-progress` → `working`
- `needs_input`, `needs-input`, `waiting_for_input`, `blocked`, `waiting` → `needs_input`
- `idle`, `ready` → `idle`
- `completed`, `complete`, `done`, `finished` → `completed`
- `failed`, `error`, `errored` → `failed`
- `stopped`, `cancelled`, `canceled`, `killed` → `stopped`
- `queued` → `queued`
- `starting`, `initializing` → `starting`
- missing / unrecognized / non-string → `unknown` (no throw)

`findSessionStatus` matching priority (first match wins):
1. `session.sessionId === handle.sessionId` (only if `handle.sessionId` is set)
2. `session.shortId === handle.shortId` (also accepts `raw.id` if `shortId` undefined)
3. `session.sessionName === handle.sessionName` (with cwd disambiguation when multiple match)
4. Final tiebreak among name-only matches: prefer cwd-matching, then most-recent `updatedAt`

No match → `{ value: 'orphaned', shortId, sessionId, sessionName, cwd }` from the handle. Missing session is NOT a thrown error.

`DriverError` emitted by `status()`:

| Condition | Message | operation |
|---|---|---|
| handle missing both shortId and sessionName | `status requires shortId or sessionName on the handle` | `status` |
| Spawn ENOENT | `cannot run claude: <code>` | `status` |
| Timeout | `claude agents --json timed out after <N>ms` | `status` |
| Non-zero exit | `claude agents --json exited <code>` | `status` |
| Malformed / non-array JSON | `claude agents --json returned malformed/non-array JSON` | `status` |

All carry `driverName: 'claude-background'`.

Scope verified (by Subagent C):
- No transcript reader, no logs reader, no reconciler, no dispatcher, no skills.
- `status()` does NOT mutate the job store and does NOT call `runDoctor`.
- No `node-pty`, no `claude -p` anywhere.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 24 mock + 55 runtime + 69 driver = **148 pass**, 0 fail.
- Subagent C: `ready-for-T8`, no blockers, two low + two nits — low #1 actioned, others noted for Stage 3/4.

## T8 — Driver: transcript + logs readers

**Started**: 2026-05-30. **Status**: complete.

Third task under the subagent pattern. Three subagents:
- **Subagent A (executor)** — created `packages/driver-claude-code/src/process.ts` (extracted spawn helper), `transcript.ts` (JSONL parser + path discovery + read facade), `logs.ts` (`claude logs` reader). Refactored `background-session.ts` and `agents-json.ts` to use the new `runCommand`. Exported `transcript` and `logs` from `index.ts`; `process` remains internal.
- **Subagent B (test-engineer)** — created 3 fixture files (`basic.jsonl` 4 lines, `mixed-tools.jsonl` 9 lines, `malformed.jsonl` 5 lines), 17 transcript tests, 7 logs tests.
- **Subagent C (code-reviewer)** — returned `ready-for-T9` with one medium and three low/nit findings. No blockers, no scope violations.

Orchestrator-level integration work:
- One lint cleanup in `transcript.test.mjs` (Subagent B left an unused `resolve` import).
- **Subagent C medium (applied)**: Error event messages from the transcript parser now include the 1-indexed line number (`transcript: malformed JSON at line 3` instead of `transcript: malformed JSON`). The warnings array was already line-aware; this change brings the event stream itself up to parity so consumers reading only events can still diagnose where the failure happened.
- **Subagent C low #2 (applied)**: The hard-coded `10_000` default in `logs.ts` is replaced with the new `DEFAULT_TIMEOUT_MS` constant exported from `process.ts`. Eliminates a desync risk if the default ever changes.
- **Subagent C low #1 (NOT applied)**: silent ISO-timestamp fallback in `extractAt()`. Documented as a deliberate v1 choice; consumers replaying transcripts will see parse-time timestamps when records lack one, which is acceptable.
- **Subagent C nit (NOT applied)**: `_lineNum` unused parameter in `classifyRecord` — could be threaded through to embed in inner error messages, but those paths already go via the outer `parseTranscriptJsonl` which has the line number.

### Files touched (final)

- `packages/driver-claude-code/src/process.ts` — new. `runCommand(cmd, args, opts)`, `RunCommandOptions`, `RunCommandResult`, `DEFAULT_TIMEOUT_MS = 10_000`. `shell: false`, never throws, SIGKILL on timeout, returns `signal` + `spawnError`.
- `packages/driver-claude-code/src/background-session.ts` — refactored to import `runCommand` from `./process.js`; dropped its private `spawnCommand` + `SpawnResult`. All error messages and DriverError shapes preserved byte-identically.
- `packages/driver-claude-code/src/agents-json.ts` — same refactor.
- `packages/driver-claude-code/src/transcript.ts` — new (~470 lines). `parseTranscriptJsonl`, `discoverTranscriptPath`, `readTranscriptEvents` + their option/result types.
- `packages/driver-claude-code/src/logs.ts` — new. `readClaudeLogs` + types.
- `packages/driver-claude-code/src/index.ts` — added `export * from './transcript.js'` and `export * from './logs.js'`. `process.ts` deliberately not re-exported (internal).
- `packages/driver-claude-code/test/transcript.test.mjs` — 17 tests.
- `packages/driver-claude-code/test/logs.test.mjs` — 7 tests.
- `packages/driver-claude-code/test/fixtures/transcripts/basic.jsonl` — 4 lines (meta + user + 2 assistant; one assistant has content array).
- `packages/driver-claude-code/test/fixtures/transcripts/mixed-tools.jsonl` — 9 lines (meta, user, tool_use/tool_result for Read, tool_use/tool_result for Edit with `is_error: true`, file_change, usage with snake_case, assistant).
- `packages/driver-claude-code/test/fixtures/transcripts/malformed.jsonl` — 5 lines; line 3 has invalid JSON, line 4 is an unknown record.

### Transcript schema tolerance

| JSONL record shape | Maps to |
|---|---|
| `{ type: 'meta'|'metadata', ... }` or pure-header (only sessionId/cwd/startedAt) | skipped silently |
| `{ type: 'message', role, content }` / `{ role, content }` / `{ message: { role, content } }` | `message.completed` |
| `content` as string | passed through |
| `content` as array of `{type:'text',text}` | concatenated with `'\n'` |
| `{ type: 'tool_use', name, input }` / `{ tool, status: 'started', input }` | `tool.started` |
| `{ type: 'tool_result', name|tool, content|result, is_error? }` / `{ tool, status: 'completed' }` | `tool.completed` (ok = false when `is_error` truthy or status `failed`) |
| `{ type: 'file_change', path, op }` / `{ file, operation }` | `file.changed` (op normalized: add/modify/delete) |
| `{ usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } }` (snake_case OR camelCase OR top-level) | `usage.updated` (`input`, `output`, `cacheRead`, `cacheCreate`) |
| Anything else | `error` event + `warning` with 1-indexed line number |
| Malformed JSON line | `error` event + `warning` with 1-indexed line number; parsing continues |

### Transcript discovery rules

`discoverTranscriptPath(opts)`:
1. If `opts.transcriptPath` set and exists → return it.
2. If `opts.sessionId` set, walk known projects roots looking for `<sessionId>.jsonl` (at most 2 levels deep: root + immediate subdir).
3. Known roots: `opts.claudeProjectsDir` (if set + exists) → `${MOCK_HOME}/projects` (if env set + exists) → `${homedir()}/.claude/projects` (if exists).
4. Otherwise return `null`. **Never** creates directories.

`readTranscriptEvents(opts)`:
- Discovery fails → `{ transcriptPath: null, events: [], warnings: [{ line: 0, message: 'transcript not found' }] }`. Does NOT throw.
- Discovery succeeds but read fails with ENOENT (race) → same null/warning shape.
- Other I/O errors → throws `DriverError`.

### Logs reader behavior

`readClaudeLogs(shortId, opts)`:
- Empty/non-string `shortId` → `DriverError('logs requires a non-empty shortId', { operation: 'logs' })`.
- Spawn ENOENT → `DriverError('cannot run claude: <code>', { cause })`.
- Timeout → `DriverError('claude logs timed out after <effectiveTimeout>ms', { stdout, stderr })`.
- Non-zero exit → `DriverError('claude logs <shortId> exited <code>', { exitCode, stdout, stderr })`.
- Otherwise → `{ shortId, text: stdout, stdout, stderr }`. Does NOT parse log text into events — logs are human fallback only.

All `DriverError`s carry `driverName: 'claude-background'` and `operation: 'logs'`.

### Process helper extraction

This was the "rule of three" trigger: three callers (`background-session`, `agents-json`, `logs`) now share `runCommand`. T6 and T7 tests (probe/start-session/agents-json/status) still pass post-refactor — the error messages emitted by `background-session.ts` and `agents-json.ts` are byte-identical to before, which the existing tests assert on. `runCommand`'s contract: `shell: false`, captures stdout/stderr, default `DEFAULT_TIMEOUT_MS = 10_000`, never throws, returns `{ exitCode, stdout, stderr, timedOut, signal, spawnError }`.

### Scope verified (by Subagent C)

- No reconciler, no dispatcher, no skills.
- `ClaudeBackgroundDriver.watch()` and `.stop()` still throw `DriverNotImplementedError` — untouched.
- No `node-pty`, no `claude -p` anywhere in the new files.
- `process.ts` not exported publicly (only internal).
- Transcript discovery never creates directories; explicitly verified by a test that snapshots `MOCK_HOME` contents before and after.

### Lessons applied from T7

The T7 retro flagged "inter-subagent type contracts matter — agree on field names verbatim". Did better here:
- Both subagents' prompts pinned to the exact `DriverEvent` field names from `events.ts` (`role`, `content`, `tool`, `ok`, `resultPreview`, `path`, `op`, `cacheRead`, `cacheCreate`, etc.).
- The TypeScript public surface in `transcript.ts` (TranscriptParseWarning, TranscriptParseResult, TranscriptReadOptions, TranscriptReadResult) was spelled out in both prompts with identical signatures.
- Result: zero field-name mismatches at integration. Tests passed on the first integrated build (only one cosmetic lint cleanup needed).

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 24 mock + 55 runtime + 96 driver = **175 pass**, 0 fail.
- Subagent C: `ready-for-T9`, no blockers, no scope violations, 1 medium + 2 low + 1 nit findings. Medium and low #2 actioned; low #1 and nit deferred to Stage 3/4 with rationale.

## T9 — Runtime: reconciler

**Started**: 2026-05-30. **Status**: complete.

Fourth task under the subagent pattern. Three subagents:
- **Subagent A (executor)** — created `packages/runtime/src/reconciler.ts` (~280 lines, post-polish ~290 lines). Implemented `ReconcilerAdapter` interface + `reconcileJob` + `reconcileJobsForWorkspace` with status mapping, non-destructive metadata merging, transcript-first / logs-fallback artifact pipeline, idempotency via structural-equality short-circuit, event-append dedup.
- **Subagent B (test-engineer)** — created `packages/runtime/test/reconciler.test.mjs` with 20+ tests using fake adapter pattern (no spawning, no mock binary required). Includes a static-content architectural-invariant test.
- **Subagent C (code-reviewer)** — read-only contract review. Returned `ready-for-T10`, two MEDIUM and two LOW findings. Both MEDIUMs and one LOW actioned.

### Architectural constraint (load-bearing)

**The runtime must NOT depend on `packages/driver-claude-code/`**. The reconciler accepts a `ReconcilerAdapter` (DI), and only ever sees types: `SessionStatus`, `SessionStatusValue`, `DriverEvent`, `JobRecord`, `JobStatus`, `ResultContext`. T10 will wire the adapter from `ClaudeBackgroundDriver.status()` + `readTranscriptEvents()` + `readClaudeLogs()`.

Static-content test (`reconciler.test.mjs`) asserts `reconciler.ts` contains none of: `driver-claude-code`, `claude --bg`, `claude -p`, `node-pty`. Passes.

### Files touched (final)

- `packages/runtime/src/reconciler.ts` — new.
- `packages/runtime/src/index.ts` — added `export * from './reconciler.js';`.
- `packages/runtime/test/reconciler.test.mjs` — new, 24 tests.

### Public API

```ts
reconcileJob(jobId, adapter, options?): Promise<ReconcileResult>
reconcileJobsForWorkspace(workspaceRoot, adapter, options?): Promise<ReconcileWorkspaceResult>
```

`ReconcilerAdapter`: `status` (required), `readTranscriptEvents?` (optional), `readLogs?` (optional). Each method takes a `ReconcilerSessionRef` (subset of `SessionHandle` plus `transcriptPath?`).

`ReconcileOptions`: `readArtifacts` (default `true`), `appendEvents` (default `true`), `now` (test hook, default `() => new Date().toISOString()`).

`ReconcileResult`: `{ job, previousStatus, statusChanged, appendedEvents, warnings }`.

`ReconcileWorkspaceResult`: `{ results, warnings }` — workspace-level warnings include job-store-level warnings from `listJobsForWorkspace`.

### Status mapping (SessionStatusValue → JobStatus)

| `value` | maps to |
|---|---|
| `queued` | `queued` |
| `starting` | `starting` |
| `working` | `running` |
| `idle` | `running` |
| `needs_input` | `needs_input` |
| `completed` | `completed` |
| `failed` | `failed` |
| `stopped` | `stopped` |
| `orphaned` | `orphaned` |
| `unknown` | keep previous; if previous is `queued`/`starting` → `running` |

### Behavior

- **Non-destructive metadata merge**: `job.claude.sessionId`/`pid`/`transcriptPath`/`cwd` only updated when adapter returns a non-empty value. `shortId`/`sessionName` never replaced (the original handle is canonical).
- **Transcript artifacts**: last assistant `message.completed` becomes the result body; `file.changed.path` values are de-duplicated in encounter order; last `usage.updated` event is captured as `usageSnapshot`. Preview is `trim() + collapse whitespace + truncate to 160 chars + ellipsis`.
- **Result-file write**: when an assistant message exists, write `<jobId>.result.md` (atomic via `writeFile`) and set `job.result.finalMessagePath`/`finalMessagePreview`/`touchedFiles`/`usageSnapshot`.
- **Logs fallback** (conservative): only when (a) transcript is absent or has no assistant message AND (b) `nextStatus === 'completed'` AND (c) log text is non-empty. Logs never imply touched files.
- **Adapter failures → warnings, not throws**: `adapter.status`, `readTranscriptEvents`, `readLogs` can each fail independently; warnings accumulate; job status stays at previous value when status call fails.

### Idempotency

Before calling `updateJob`, the reconciler computes `statusChanged || resultChanged || claudeChanged`. If all false, returns the original record without writing — avoids `updatedAt` churn. Event appends are also deduped against the existing `<jobId>.events.jsonl` (same-transition `reconcile.status`, same-path `reconcile.result`, same-message `reconcile.warning`).

Test 17 verifies: two consecutive reconciles on the same adapter state produce `statusChanged: true` then `statusChanged: false`, with byte-identical `result.md` and zero new appended events on the second call.

### Subagent C findings (actioned + deferred)

**MEDIUM #1 (actioned)** — `updateJob` updater ignored the locked re-read. Subagent A used `updateJob(jobId, () => patched)` where `patched` came from the unlocked initial read; if a concurrent reconciler had written between the read and the lock acquisition, the merge would have stale claude/result fields. Fixed to `updateJob(jobId, (current) => ({ ...current, status: patched.status, claude: patched.claude, result: patched.result }))`. The reconciler now owns only `status`, `claude`, `result`; everything else flows through from the locked read. Eliminates the race.

**MEDIUM #2 (actioned)** — `resultContextEqual` was checking only `finalMessagePreview` and `touchedFiles`. Now also `deepEqual(a.usageSnapshot, b.usageSnapshot)`. Without this, changing token counts on a stable transcript wouldn't have triggered a `updateJob` call.

**LOW #1 (actioned)** — `deepEqual` treated arrays and plain objects with same numeric keys as equal. Added `if (Array.isArray(a) !== Array.isArray(b)) return false;` guard. Not exploitable in current call sites but a latent correctness gap.

**LOW #2 (actioned)** — removed dead-code block where status-failure path was double-handled.

**NIT** — static-content test brittleness. Subagent C confirmed no false-positive risk from current comments. No change needed.

### Lessons applied from T7/T8

The pre-fanout spec for T9 pinned exact field names from `events.ts` and the canonical types. Result: **zero field-name mismatches at integration**. Tests passed on the first integrated build (other than 5 routine lint issues — unused imports + unused params that should have been `_`-prefixed in B's test file, and unused-but-named `result` variable in one test).

### Scope verified (by Subagent C)

- No dispatcher, no skills, no driver-package imports.
- `ClaudeBackgroundDriver.watch()` and `.stop()` untouched.
- No `node-pty`, no `claude -p`, no spawning from `reconciler.ts`.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean (after one round of test-file lint fixes).
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 24 mock + 79 runtime + 96 driver = **199 pass**, 0 fail.
- Subagent C: `ready-for-T10`, no blockers, no scope violations.

## T10 — Plugin entry: `claude-companion.mjs` dispatcher

**Started**: 2026-05-30. **Status**: complete.

Fifth task under the subagent pattern. Three subagents + the `ClaudeBackgroundDriver.stop()` lifecycle method (formerly a T6 stub).

- **Subagent A (executor)** — created `stop.ts` (driver) + 6 plugin files (`claude-companion.mjs` main + `lib/args.mjs` + `lib/format.mjs` + `lib/adapter.mjs` + `lib/ack.mjs` + `lib/prompt-meta.mjs`). Confirmed smoke test from repo root producing a real job summary.
- **Subagent B (test-engineer)** — created `stop.test.mjs` (8 tests) + `dispatcher.test.mjs` (22 tests). Synthetic completed-job fixtures + privacy-ack flow tests + non-TTY simulation via `spawnSync`.
- **Subagent C (code-reviewer)** — returned `ready-for-T11`. No blockers. No scope violations. Two low findings + one nit; not actioned (UX-only, deferred to Stage 3/4).

Orchestrator-level integration work:
1. Removed obsolete `stop rejects with DriverNotImplementedError` test from `probe.test.mjs` (same pattern as T6/T7).
2. Fixed `--help`-without-command exit code from 2 → 0. The dispatcher was conflating "no command at all" (usage error) with "explicit help request"; corrected the `process.exit(...)` ternary to inspect `flags['help']`.
3. Fixed dispatcher test's `WORK_DIR` to use `realpathSync(...)`. On macOS, `mkdtempSync(/var/folders/...)` returns a path that `process.cwd()` resolves through the `/var → /private/var` symlink, so the test-side ack-hash and the subprocess-side ack-hash didn't match. Canonicalizing in the test fixed it without touching the dispatcher.
4. Flattened setup `--json` shape to match Subagent B's pinned test expectation (`{ ok, status, generatedAt, probes }` at top level instead of `{ ok, report: { … } }`). Both shapes are valid; this is the contract.

### Files touched

**Driver package:**
- `packages/driver-claude-code/src/stop.ts` — new. `stopSession(session, options?)` via `runCommand('claude', ['stop', session.shortId], ...)`. `DriverError` on empty shortId, ENOENT, timeout, non-zero exit.
- `packages/driver-claude-code/src/index.ts` — replaced `stop` stub with `stopSession(...)` call; added `export * from './stop.js'`.
- `packages/driver-claude-code/test/stop.test.mjs` — new, 8 tests.
- `packages/driver-claude-code/test/probe.test.mjs` — removed obsolete stop stub assertion.

**Plugin package:**
- `packages/plugin-codex/scripts/claude-companion.mjs` — new, ~380 lines. Shebang `#!/usr/bin/env node`. Imports compiled workspace packages by name.
- `packages/plugin-codex/scripts/lib/args.mjs` — hand-rolled parser + `resolveJobIdPrefix`.
- `packages/plugin-codex/scripts/lib/format.mjs` — human + JSON formatters for all 5 subcommands + error.
- `packages/plugin-codex/scripts/lib/adapter.mjs` — `makeClaudeAdapter(driver, defaults)` returns a `ReconcilerAdapter`.
- `packages/plugin-codex/scripts/lib/ack.mjs` — `hasAck`/`recordAck` under `${getCompanionHome()}/acks/<sha256(workspaceRoot).slice(0,16)>.json`.
- `packages/plugin-codex/scripts/lib/prompt-meta.mjs` — `makePromptMeta(prompt)` returns `{ summary, sha256, bytesLen }`.
- `packages/plugin-codex/test/dispatcher.test.mjs` — new, 22 tests.

**Root:**
- `package.json` — added `test:plugin` script; updated `test` to chain all four suites.

### Subcommand contracts

| Cmd | Flow |
|---|---|
| `setup [--json]` | `runDoctor()`; exit 0 on `ok`/`warn`, exit 1 on `fail`. JSON: `{ ok, status, generatedAt, probes }`. |
| `delegate [flags] -- "prompt"` | Privacy ack → driver.probe() → driver.startSession() → createJob → reconcile once → print job summary. |
| `status [--all] [--json]` | List jobs (workspace or all) → reconcile each → print table or JSON. |
| `result <jobId-or-prefix> [--json]` | Resolve job → reconcile → exit 1 if `starting`/`running`/`queued`/`needs_input` → else print `result.md` content + metadata. |
| `stop <jobId-or-prefix> [--json]` | Resolve job → `driver.stop(handle)` → update `status: 'stopped'` → append `stop.requested` event. |

All commands: `--help` exit 0; unknown subcommand exit 2; usage errors exit 2; runtime errors exit 1; JSON errors as `{ ok: false, error: { message, name, operation? } }`.

### `ClaudeBackgroundDriver.stop()`

- Uses `runCommand` from the T8 shared `process.ts` helper (no duplicate spawn logic).
- All `DriverError`s carry `driverName: 'claude-background'` and `operation: 'stop'`.
- Messages: `stop requires a non-empty shortId on the session` / `cannot run claude: <code>` / `claude stop timed out after <ms>ms` / `claude stop <shortId> exited <code>`.

### Privacy acknowledgement

- Path: `${getCompanionHome()}/acks/<sha256(workspaceRoot).slice(0, 16)>.json` (16 hex chars for filesystem-friendly length; collisions a non-issue at this scale).
- Without `--yes` and non-TTY stdin → exit 1 with the required-acknowledgement message. Test 5 verifies this path with `spawnSync` (no TTY).
- With `--yes` → record the ack (if absent) and proceed. Test 3 verifies ack-file creation.

### OQ conformance (verified by Subagent C)

- **OQ1**: `--permission-mode` only forwarded to `claude --bg` when the user supplied it. No bypass flags anywhere in any file. ✓
- **OQ2**: `--allow-edit` is captured on `StartSessionOpts` and forwarded to the driver but the driver's `buildArgv` deliberately does not translate it into a CLI flag. Inline comment in `background-session.ts` documents this. ✓

### Architectural direction

- `packages/runtime/` does NOT import driver-claude-code (T9 invariant holds; static-content test still passes).
- `packages/plugin-codex/scripts/*` imports both `@cc-plugin-codex/runtime` and `@cc-plugin-codex/driver-claude-code` — this is correct since the plugin is the leaf of the dependency graph.
- No new third-party dependencies (`commander`, `yargs`, `chalk`, etc.) introduced.

### Subagent C findings

- **MEDIUM**: `stop` doesn't pre-check if the job is already terminal (UX hint only; the invariant "status only flips to stopped on successful `claude stop`" holds because `driver.stop()` throws on failure before `updateJob` runs). Deferred.
- **LOW**: dispatcher silently swallows the post-delegate reconcile error (comment says "Non-fatal on first run"). Acceptable v1 behavior; debug logging could be added in polish. Deferred.
- **LOW**: `now` timestamp in `cmdStop` is used for the event but not separately for `updatedAt` (relies on `updateJob`'s implicit timestamp). `updateJob` does set `updatedAt`, so no bug. Deferred.
- **NIT**: `$claude-status` and `$claude-result` shell-variable-looking placeholders in human output. Cosmetic; T11 (skills) will land the real `$skill-name` Codex invocation surface, making the references real. Deferred.

### Lessons applied from T7/T8/T9

Pre-spec'd the JSON output shapes verbatim. There was still one shape drift (Subagent A used `{ ok, report }` for setup vs. test expected `{ ok, probes }`) but it was trivial to flatten. The macOS symlink issue was an environmental snag, not a contract drift — won't repeat. Five integration fixes total (vs. T9's four), each ≤ 5-line change.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 24 mock + 79 runtime + 103 driver + 22 plugin = **228 pass**, 0 fail.
- Subagent C: `ready-for-T11`, no blockers, no scope violations.
- Manual smoke test from repo root: `delegate --yes -- "hello"` succeeds against mock-claude/mock-codex without touching `~/.claude` or `~/.codex`.

## T11 — Skills + manifest

**Started**: 2026-05-30. **Status**: complete (smoke remediation 2026-05-30 lifted the initial limitation).

Sixth task under the subagent pattern. Three subagents:
- **Subagent A (executor)** — created `.codex-plugin/plugin.json` + 5 `skills/<name>/SKILL.md` files. No deviations from baseline.
- **Subagent B (test-engineer)** — created `test/skills-manifest.test.mjs` with 47 tests covering manifest shape, skill frontmatter, dispatcher references, forbidden tokens, scope discipline.
- **Subagent C (code-reviewer)** — returned `ready-for-stage-3-audit`. No blockers. No scope violations. One LOW finding (forbidden-token coverage gap) — actioned.

### Files created

- `packages/plugin-codex/.codex-plugin/plugin.json` — name `claude-companion`, version `0.1.0`, `defaultPrompt` covers all 5 skills, `brandColor` `#D97706`.
- `packages/plugin-codex/skills/claude-setup/SKILL.md` — runs `setup` subcommand.
- `packages/plugin-codex/skills/claude-delegate/SKILL.md` — runs `delegate -- "<prompt>"`; **does NOT inject `--yes`**; lists allowed user-forwarded flags.
- `packages/plugin-codex/skills/claude-status/SKILL.md` — runs `status`; forwards `--all` only if user explicitly asks.
- `packages/plugin-codex/skills/claude-result/SKILL.md` — runs `result <jobId-or-prefix>`; asks user for id if not given.
- `packages/plugin-codex/skills/claude-stop/SKILL.md` — runs `stop <jobId-or-prefix>`; asks user for id if not given.
- `packages/plugin-codex/test/skills-manifest.test.mjs` — 30 net new test cases beyond Subagent B's initial 47, with the orchestrator's pattern-based forbidden-claim guard added.

### Skill contract

Every SKILL.md:
- Has YAML frontmatter `name: <skill-name>` (matches the directory name) and `description: <one line>`.
- Resolves `<plugin-root>` as "two directories above this `SKILL.md` file".
- Runs `node "<plugin-root>/scripts/claude-companion.mjs" <subcommand>` and returns stdout verbatim.
- Does NOT reimplement dispatcher logic.

### OQ4 (cost-claim copy)

No manifest field or SKILL.md body contains: `saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the`, `more efficient than`, or quantitative-claim patterns (`<N>% faster`, `<N>x cheaper`, `save <N>`). Test file pins both the literal-token list and a regex pattern list to keep future drift caught.

### Privacy ack flow preserved

`claude-delegate/SKILL.md` mentions `--yes` only in prose as a user-provided flag. The run line is exactly `node "<plugin-root>/scripts/claude-companion.mjs" delegate -- "<task prompt>"` with NO `--yes`. Test specifically asserts no run-line contains `--yes`. The dispatcher's R4 first-run ack still fires under real Codex invocation.

### Subagent C LOW finding (actioned)

C noted the forbidden-token list was missing three OQ4 phrasings (`avoids the`, `more efficient than`, and quantitative-claim patterns like `<N>%` and `<N>x cheaper`). All added — `FORBIDDEN_TOKENS` extended with two more strings; new `FORBIDDEN_PATTERNS` array with 3 regexes covering quantitative claims. New describe block sweeps both manifest and skills against the patterns. Test count went from 99 to 129 plugin tests (47 manifest/skills + 30 new pattern tests + 22 dispatcher + remainder).

### Manual smoke test — honestly logged

Both real binaries are available on the orchestrator's machine:
- `codex` → `codex-cli 0.135.0` (at `/opt/homebrew/bin/codex`)
- `claude` → `2.1.149 (Claude Code)` (at `/opt/homebrew/bin/claude`)

#### Initial attempt (wrong layout — failed)

The first smoke attempt pointed Codex directly at the plugin directory, then at a synthetic marketplace containing only `plugins/<name>/`. Both failed:

```
codex plugin marketplace add /Users/.../packages/plugin-codex
# → Error: invalid marketplace file …: marketplace root does not contain a supported manifest
codex plugin marketplace add /tmp/cc-plugin-codex-smoke-marketplace-XXXX  (symlink-only)
# → Same error
```

That error message is honest: the official local-marketplace format requires a manifest file at `<marketplace-root>/.agents/plugins/marketplace.json`, with the local plugin reachable via `source: { source: "local", path: "./plugins/claude-companion" }`. The reference checkout `references/codex-plugins-examples/` is the git-source variant and is reserved as `openai-curated`, so its working layout couldn't be cloned as a local marketplace probe.

#### Remediated smoke (2026-05-30) — succeeded

Built a temp marketplace root with the documented layout:

```
$SMOKE_ROOT/
├── .agents/plugins/marketplace.json   ← top-level manifest (see below)
└── plugins/claude-companion/          ← rsync of packages/plugin-codex/
    ├── .codex-plugin/plugin.json
    ├── skills/{claude-setup,…,claude-stop}/SKILL.md
    ├── scripts/claude-companion.mjs
    └── …
```

`.agents/plugins/marketplace.json` content:
```jsonc
{
  "name": "cc-plugin-codex-local-smoke",
  "interface": { "displayName": "cc-plugin-codex Local Smoke" },
  "plugins": [
    {
      "name": "claude-companion",
      "source": { "source": "local", "path": "./plugins/claude-companion" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Coding"
    }
  ]
}
```

Commands and outputs:

```
$ codex plugin marketplace add "$SMOKE_ROOT"
Added marketplace `cc-plugin-codex-local-smoke` from /private/tmp/cc-plugin-codex-marketplace-15INUy.
Installed marketplace root: /private/tmp/cc-plugin-codex-marketplace-15INUy

$ codex plugin marketplace list
MARKETPLACE                  ROOT
openai-curated               /Users/hongjunwu/.codex/.tmp/plugins
cc-plugin-codex-local-smoke  /private/tmp/cc-plugin-codex-marketplace-15INUy

$ codex plugin list | grep claude-companion
claude-companion@cc-plugin-codex-local-smoke  not installed           /private/tmp/cc-plugin-codex-marketplace-15INUy/plugins/claude-companion

$ codex plugin add claude-companion@cc-plugin-codex-local-smoke
Added plugin `claude-companion` from marketplace `cc-plugin-codex-local-smoke`.
Installed plugin root: /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local-smoke/claude-companion/0.1.0

$ codex plugin list | grep claude-companion
claude-companion@cc-plugin-codex-local-smoke  installed, enabled  0.1.0  …
```

Skill-discovery sanity check (Codex copied the plugin to its cache and Codex's installed-plugin layout contains all 5 skills):

```
$ ls /Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local-smoke/claude-companion/0.1.0/skills/
claude-delegate  claude-result  claude-setup  claude-status  claude-stop
```

The plugin is installed and enabled. Codex sees all 5 skills. The marketplace root remains under `/tmp/` (temp fixture only); it is not committed.

#### Status

T11 manual smoke is **complete**. Marketplace packaging (publishing this same layout from inside the repo, not from a temp dir) remains Plan 0006 scope.

The actual `$claude-setup` / `$claude-delegate` / `$claude-status` / `$claude-result` / `$claude-stop` skill invocations from inside a real Codex session are part of **T12** (end-to-end live test), not T11.

### Lessons applied from T7/T8/T9/T10

Pre-spec'd manifest and SKILL.md frontmatter verbatim. **Zero contract mismatches** between Subagent A and Subagent B — A's output matched B's static tests on first integration. The orchestrator-applied LOW finding was about tightening the forbidden-token list, not fixing any drift. Best subagent run of Stage 2 so far.

**Acceptance evidence (2026-05-30)**:
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 24 mock + 79 runtime + 103 driver + 129 plugin = **335 pass**, 0 fail.
- Subagent C: `ready-for-stage-3-audit`, no blockers, no scope violations.
- Manual Codex smoke: skill files exist + dispatcher static, but `codex plugin marketplace add` of a local path requires an undocumented manifest format. Skill-discovery half of the smoke deferred to Plan 0006. No real Codex/Claude state modified during the probe.

## T12 — End-to-end live test

**Started**: 2026-05-30. **Status**: complete (with T12a remediation pass + documented `idle ≠ completed` semantic gap).

### Two phases

T12 ran in two phases because the first live probe surfaced a fundamental schema mismatch:

1. **T12 first probe** — `setup` against real binaries failed two probes (bg-flag, daemon). Direct CLI inspection of real Claude 2.1.149 revealed the mock's schema was idealized: `agents --json` returns different fields, `--bg` prints `backgrounded · <id>` not `Started background session <id>`, `daemon status` subcommand doesn't exist, etc. Detail in artifact + T12a below.
2. **T12a remediation pass** — fix the mock + driver/runtime parsers/probes to match real Claude Code 2.1.149. See § T12a below.
3. **T12 resumed** — full E2E flow re-run against real Claude, end-to-end success.

### T12a — Real Claude 2.1.149 schema remediation

Three subagents:
- **Subagent A (src)** — fixed `doctor.ts` (bg-flag/daemon probes warn-not-fail), `probe.ts` (capability OR-rule), `agents-json.ts` (real-schema tolerance + `deriveShortId` + busy/waiting status + epoch-to-ISO conversion + no-cwd-alone matching), `background-session.ts` (parseShortId handles `backgrounded · <id>`).
- **Subagent B (mock+tests)** — mock-claude gained `agentsJsonSchema` / `bgStdoutStyle` / `daemonAvailable` / `helpListsBg` config flags with defaults flipped to real-2.1.149. Updated 8 test files (legacy opt-in where needed; new real-schema assertions). Mock README updated.
- **Subagent C (review)** — `ready-to-resume-T12-live-E2E`. No blockers; 1 nit + 3 low findings (test gaps, redundant defensive call, order-dependency comment). Deferred as audit material.

Test count after T12a: **335 → 364 tests** (+29), 0 failures. Suite split: 34 mock + 82 runtime + 119 driver + 129 plugin.

Key new exports:
- `deriveShortId(sessionId: string): string | undefined` from `agents-json.ts` — `sessionId.replace(/-/g,'').slice(0,8)`.
- `parseShortId` now uses `KEYWORDS_PRIMARY = ['backgrounded', 'session']` for priority-1 keyword matching with non-token-separator skipping.

Mock real-mode invariant: when `cmdBg` generates a session, it emits a UUID `sessionId` whose first-8-hex matches the printed shortId. This keeps the mock end-to-end coherent with the real Claude pipeline.

### T12 resumed live E2E (all five subcommands)

Real environment:
- `codex-cli 0.135.0` at `/opt/homebrew/bin/codex`
- `claude` `2.1.149 (Claude Code)` at `/opt/homebrew/bin/claude`
- Throwaway repo at `/private/tmp/cc-plugin-codex-e2e-T1UTOe` (README + app.js with 3 TODOs)
- Isolated `CC_PLUGIN_CODEX_HOME` under the E2E temp dir

Full flow captured at `artifacts/e2e-live-20260530.txt`:

| Command | Result |
|---|---|
| `setup` | `warn` aggregate — bg-flag + daemon probes warn-only per T12a; all other probes ok |
| `delegate --yes --name "codex-e2e-plan-0001" -- "Inspect this tiny throwaway repo and report what TODOs exist. Do not edit files."` | Job `job_mpt8p0hz_935caf12` created, real Claude session `6ef69db3` started |
| `status` (polled 18×10s) | Live reconciliation shows job=`running` (driver-`idle` mapped per T9), correctly tracking real Claude state |
| `result <jobId>` (while running) | Exit 1, "not complete yet (status: running). Run: claude-companion status" — correct |
| `stop <jobId>` | Session terminated; job marked `stopped` |
| `result <jobId>` (post-stop) | **Final assistant message extracted and printed**: "Found 3 TODOs in the repo: - README.md:3 — TODO: replace this placeholder, - README.md:4 — TODO: another todo here, - app.js:2 — TODO: implement" ✓ |

The agent's answer is correct — it found all three TODOs and did not edit any files.

### Known limitations (deferred — not T12-blocking)

1. **`idle ≠ completed`**: real Claude reports `idle` (= awaiting next user input) after the agent finishes a turn. Our T9 reconciler maps driver-`idle` → job-`running`, so `result` won't auto-fire on a quiet session. Working user pattern: `delegate` → `status` → `stop` → `result`. Future polish options: map `idle` → `needs_input` (with attach hint), or add `--wait-for-idle` to delegate. Logged as known limitation.

2. **Real Claude transcripts are ANSI TUI byte streams**, not JSON event records. T8's transcript parser doesn't extract events from them. The orphan-then-logs-fallback path in `result` correctly recovered the message text post-stop. For mid-turn streaming or resume-style workflows, transcript parsing would need real-schema rework (Plan 0002+).

3. **`kind: 'background'` (real) vs `'interactive'` (mock-real-mode)** — cosmetic; mock could update for fidelity but not blocking.

### Sanity / privacy

- No real Claude calls in any automated test (mocks only).
- Real `~/.claude` was used (by the actual claude binary itself for session state) but our companion home was isolated to `$CC_PLUGIN_CODEX_HOME` under the E2E temp root.
- Real `~/.codex/config.toml` was used (by codex itself) but no codex skill invocations were made in T12 (skills are out of T12's direct E2E scope; the T11 marketplace install confirmed Codex discovers the skills).
- Live Claude session 6ef69db3 was started for the E2E prompt and stopped before T12 closed. No orphans.
- Throwaway repo cwd was isolated to a `mktemp -d` directory; no source repo or sensitive content was passed to Claude.

### Codex skill E2E (out of T12 scope)

The maintainer's T12 spec also called for a "Subagent B — Codex skill E2E" path: install the plugin via local marketplace (T11 remediation, complete), then invoke `$claude-setup` / `$claude-delegate` / etc. from inside a real Codex session. This requires interactive Codex TUI usage that's not available in this orchestrator context. The T11 marketplace install + skill discovery is confirmed (`claude-companion@cc-plugin-codex-local-smoke installed, enabled  0.1.0`); the dispatcher live path is confirmed in this same artifact. The end-to-end "type `$claude-delegate` inside Codex and see the answer" path is verifiable interactively by the maintainer.

**Acceptance evidence (2026-05-30)**:
- T12a re-grounded the schema; all source/test contracts now match real Claude 2.1.149.
- Real direct-dispatcher E2E succeeded end-to-end against real binaries. Artifact at `artifacts/e2e-live-20260530.txt`.
- All five subcommands verified live.
- `npm test` → 34 mock + 82 runtime + 119 driver + 129 plugin = **364 pass**, 0 fail.
- Subagent C T12a review: `ready-to-resume-T12-live-E2E`, no blockers, no scope violations.
- Codex skill invocation path is confirmed plumbed (T11 install) but the interactive-TUI verification is maintainer-driven.

### T12b — idle semantics remediation (2026-05-31)

The first live T12 run surfaced an `idle ≠ completed` gap that required `stop` before `result` could fire. T12b closed that gap for plan 0001:

**Change**: in `packages/runtime/src/reconciler.ts` `STATUS_MAP`, `idle` now maps to `completed` (was `running`). One source line + comment explaining the rationale + one reconciler test updated (`value: idle maps to completed (plan 0001 start-only model)`).

**Rationale**: plan 0001 is start-only — every `$claude-delegate` creates one fresh background session for one task. When the driver reports `idle` after that turn, the agent has finished the delegated work and is awaiting further input. With no companion-session reuse and no prompt injection in v1, that state is effectively `completed` for the job. Mapping it to `needs_input` would still cause `result` to reject as "not complete yet" under the current dispatcher contract, defeating the UX goal.

Other mappings unchanged: `busy → working`, `waiting → needs_input`, `working → running`, `completed/failed/stopped/orphaned/queued/starting/unknown` all unchanged.

**Plan 0002 caveat**: when session reuse lands, an `idle` session may sit between turns and would not be "completed". The mapping will need to become context-aware then. Documented in the inline comment near `STATUS_MAP`.

**Live retry**: same throwaway repo, fresh delegate invocation:

```
$ claude-companion delegate --yes --name codex-e2e-plan-0001-idle-complete -- "Inspect this tiny throwaway repo and report what TODOs exist. Do not edit files."
Claude job started
Job ID:         job_mpt98g9g_b61e09f1
Status:         completed        ← post-startSession reconcile already saw idle
Claude session: c9de1fba

$ claude-companion status
  job_mpt98g9g_b61e09f1   completed   c9de1fba   codex-e2e-plan-0001-idle-complete

$ claude-companion result job_mpt98g9g_b61e09f1   ← no stop needed
Job:        job_mpt98g9g_b61e09f1
Status:     completed
Logs:       claude logs c9de1fba

Found 3 TODOs in this throwaway repo:

- `README.md:3` — `TODO: replace this placeholder`
- `README.md:4` — `TODO: another todo here`
- `app.js:2` — `// TODO: implement`

No files were modified.

EXIT: 0
```

User flow is now `delegate → status → result` (with optional `stop` for cleanup). The agent's correct answer is retrieved without an intermediate stop.

**Acceptance evidence (2026-05-31)**:
- `npm run lint` clean.
- `npm run typecheck` clean.
- `npm run format` clean.
- `npm test` → 34 mock + 82 runtime + 119 driver + 129 plugin = **364 pass**, 0 fail (architectural-invariant test still green — comment in reconciler.ts deliberately avoids banned substring).
- Live E2E retry succeeded: `delegate → status → result` produces the correct agent answer with no intervening `stop`.
- Artifact `artifacts/e2e-live-20260530.txt` updated with the retry; original `idle ≠ completed` finding preserved as the reason T12b exists.

## T13 — README of the plugin package

_pending_

## T14 — CI

_pending_

## Deviations from the plan

_(Record anything material here. A deviation is a learning, not a failure.)_

## Surprises

_(What the plan didn't anticipate.)_
