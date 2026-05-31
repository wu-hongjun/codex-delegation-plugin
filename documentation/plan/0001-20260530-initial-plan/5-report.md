# Stage 5 — Report: Plan 0001

## Report metadata

- **Date**: 2026-05-31
- **Commit reported**: `5be9b9dceb66227f209ad45d85dedfb0bd37649a`
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted and approved 2026-05-30 (all six open questions resolved by maintainer)
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-05-31 (T1–T14 + T11/T12a/T12b remediations; first remote CI green at `56ab723` / run `26703417200`; live E2E captured at [`artifacts/e2e-live-20260530.txt`](artifacts/e2e-live-20260530.txt))
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent context, fresh session; verdict **PASS WITH FINDINGS** (5 low/nit, 0 blocker/high) at commit `63fa9fd` on 2026-05-31
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — bundle commit `42b99c3` resolved all five audit findings (A1–A5); follow-up commit `5be9b9d` fixed a Codex 0.135.0 YAML-strictness rejection of `claude-setup/SKILL.md` and added a strict-frontmatter regression test per SKILL.md; both accepted by the maintainer as Stage 4 work
- **Final status**: `complete`

## Executive summary

Plan 0001 delivers the initial Codex → Claude Code foundation. A user inside a Codex 0.135.0 session can install the `claude-companion` plugin from a local marketplace, run `$claude-setup` to probe their environment, run `$claude-delegate "<task>"` to spawn a real Claude Code background session for that task, inspect live state with `$claude-status`, retrieve the agent's final answer with `$claude-result <jobId>`, and optionally `$claude-stop <jobId>` for cleanup.

Transport is exclusively **Claude Code background sessions** via `claude --bg` / `claude agents --json` / `claude logs` / transcript JSONL discovery / `claude stop`. The plan does **not** use `claude -p`, does **not** use `node-pty`, does **not** introduce multi-turn reuse or PTY attach, does **not** ship `$claude-review` / `$claude-adversarial-review`, does **not** add stop-time hooks, and does **not** make any cost-savings claim — all of those are deferred to later plans (0002–0006) per the locked v1 scope.

All four local gates are clean on the reported commit: `npm run lint`, `npm run typecheck`, `npm run format`, `npm test` all exit 0, with **447 tests passing across 4 lanes (34 mock + 82 runtime + 119 driver + 212 plugin)** and 0 failures. Remote GitHub Actions CI is green on `5be9b9d` across all four matrix legs (`ubuntu-latest` + `macos-latest` × Node 20 + Node 22), run `26711222280`, conclusion `success`. The live E2E artifact captures a successful `delegate → status → result` flow against real `codex-cli 0.135.0` + `Claude Code 2.1.149` on Node `v25.1.0`.

## What shipped

- **npm workspace** at the repository root, with three workspace packages and two test-only tool packages. TypeScript `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`, ESLint v9 flat config + `typescript-eslint`, Prettier, `node:test`. No native dependencies.
- **`packages/runtime/`** (`@cc-plugin-codex/runtime`): typed `Driver` / `DriverEvent` / `SessionStatus` surface (`driver.ts`, `events.ts`), atomic job store with BSD-flock single-writer + corrupt-record tolerance (`job-store.ts`), 12 doctor probes + aggregate (`doctor.ts`), DI-injected reconciler with idempotency + non-destructive metadata merge + transcript-first artifact pipeline + logs fallback (`reconciler.ts`), `~/.codex/cc-plugin-codex/` path helpers (`paths.ts`), typed error hierarchy (`errors.ts`). No driver-package imports anywhere — enforced by a static-content invariant test that walks every `.ts` file under `packages/runtime/src/`.
- **`packages/driver-claude-code/`** (`@cc-plugin-codex/driver-claude-code`): `ClaudeBackgroundDriver` implementing `Driver` with `probe()`, `startSession()`, `status()`, `stop()`, `dispose()`; internal shared `runCommand` helper with `shell: false`; `agents --json` parser tolerant of the real Claude 2.1.149 row schema (camelCase + snake_case aliases, status normalization including `busy → working` / `waiting → needs_input` / `idle` preserved at this layer, `deriveShortId(uuid)` for short-ID matching); transcript JSONL parser with discovery walk over known projects roots (`transcript.ts`); `claude logs` fallback reader (`logs.ts`); `stop` via `claude stop <shortId>`. `watch()` deliberately throws `DriverNotImplementedError('watch', 'plan 0002+ (PTY attach / streaming)')`.
- **`packages/plugin-codex/`** (`@cc-plugin-codex/plugin-codex`):
  - `scripts/claude-companion.mjs` dispatcher with five subcommands (`setup` / `delegate` / `status` / `result` / `stop`) plus `--json` and `--help` everywhere; thin wrapper libraries under `scripts/lib/` for arg parsing, formatting, the driver→reconciler adapter, the first-run privacy ack, and prompt-meta hashing.
  - Five `skills/<name>/SKILL.md` files (`claude-setup`, `claude-delegate`, `claude-status`, `claude-result`, `claude-stop`). The `claude-delegate` skill deliberately does **not** inject `--yes`; the privacy ack remains interactive.
  - `.codex-plugin/plugin.json` manifest (`claude-companion`, `0.1.0`, `defaultPrompt` covers all five skills, `brandColor #D97706`).
  - `README.md` covering install via local marketplace, the five skill commands, direct dispatcher invocation, privacy disclosure, troubleshooting, dev scripts, and the cost paragraph in the approved framing.
- **`tools/mock-claude/`**: executable `claude` shim defaulting to the real-2.1.149-style schema (configurable per-test via env vars); covers `--version`, `auth status`, `--bg`, `agents --json`, `logs`, `stop`, `daemon status` (configurable availability).
- **`tools/mock-codex/`**: executable `codex --version` shim used by the doctor probe.
- **`.github/workflows/ci.yml`**: matrix `ubuntu-latest + macos-latest × Node 20 + 22`, `actions/checkout@v6` + `actions/setup-node@v6` (with `cache: npm`), `npm ci → lint → typecheck → format → test`, workflow-level `permissions: contents: read`, `persist-credentials: false`, `concurrency` cancel-in-progress per branch, `fail-fast: false`, `timeout-minutes: 15`, no secrets, no real Claude/Codex install.

## What changed from the original plan

- **No PTY parsing.** The PTY-driven transport that earlier drafts of the README implied was rejected during research; the locked v1 transport is `claude --bg` exclusively. `node-pty` is not a dependency anywhere — not as a required dep, not as an `optionalDependencies` entry, not as a feature-flagged code path. Deferred to Plan 0002.
- **No `claude -p`.** The plan never used `claude -p` and the driver never falls back to it. The cost framing was downgraded to "designed to enable future session/cache reuse experiments; cost savings have not been benchmarked yet" per OQ4.
- **Real Claude 2.1.149 schema differed from the initial mock.** Discovered during T12 live E2E. Remediated in T12a:
  - Real `claude --bg` prints `backgrounded · <8hex>` (not `Started background session <id>`). `parseShortId` was taught the new keyword priority.
  - Real `agents --json` rows are `{ pid, cwd, kind, startedAt (unix ms int), sessionId (UUID), name?, status }` — no top-level `shortId`, no `transcriptPath`, no `updatedAt`. `deriveShortId(sessionId) = sessionId.replace(/-/g, '').slice(0, 8)` plus camelCase/snake_case alias tolerance was added.
  - Observed statuses include `busy`, `waiting`, `idle`. Normalization at the driver layer: `busy → working`, `waiting → needs_input`, `idle → idle`.
  - `claude --help` does not advertise `--bg`; `claude daemon status` does not exist in 2.1.149. The `claude-bg-flag` and `claude-daemon` doctor probes were downgraded from `fail` to `warn` (informational), and the driver `probe()` compensates via a capability OR-rule so that an `ok` `agents --json` plus a non-`fail` bg-flag still yields `backgroundSessions: true`.
- **`idle → completed` at the reconciler layer (T12b).** For the start-only v1 model — one fresh background session per delegation, no companion reuse, no prompt injection — driver-`idle` after the turn is the terminal state for the job. The reconciler maps `idle → completed` so `delegate → status → result` works without an intermediate `stop`. This mapping will need to become context-aware in Plan 0002 when session reuse exists; the rationale is captured in an inline comment near `STATUS_MAP`.
- **Local marketplace install layout (T11).** Pointing `codex plugin marketplace add` at the plugin directory directly was rejected by Codex 0.135.0 with "marketplace root does not contain a supported manifest". The working layout is a temporary marketplace root containing `.agents/plugins/marketplace.json` + `plugins/claude-companion/`. The plugin README documents that exact layout; the marketplace root itself is not committed (Plan 0006).
- **Codex 0.135.0 YAML strictness (5be9b9d follow-up).** Codex 0.135.0's frontmatter parser rejected `description: Check Claude Companion readiness: Codex, Claude Code, auth, transcripts, daemon.` in `claude-setup/SKILL.md` because the unquoted `: ` after "readiness" reads as a nested mapping. The description was rephrased to `Check Claude Companion readiness across Codex, Claude Code, auth, transcripts, and daemon.` (semantically identical, YAML-safe). The lenient inline `parseFrontmatter` in `skills-manifest.test.mjs` had hidden this; a strict variant was added that rejects unquoted `: ` and `#` in scalar values (one new test per SKILL.md, +5 tests).

## Architecture delivered

The runtime call graph in v1:

```
Codex skill ($claude-…)
  → packages/plugin-codex/scripts/claude-companion.mjs   (dispatcher)
    → scripts/lib/{args, format, adapter, ack, prompt-meta}
    → @cc-plugin-codex/runtime
        - job-store (atomic JSON writes, BSD flock, event log)
        - reconciler (DI-injected via ReconcilerAdapter)
        - doctor + paths + errors + types
    → @cc-plugin-codex/driver-claude-code (ClaudeBackgroundDriver)
        - background-session.ts   → claude --bg
        - agents-json.ts          → claude agents --json
        - logs.ts                 → claude logs <shortId>
        - transcript.ts           → ~/.claude/projects/.../<sessionId>.jsonl
        - stop.ts                 → claude stop <shortId>
        - process.ts              → spawn (shell: false, never throws)
```

**Dependency direction (load-bearing, enforced by tests):**

- `packages/runtime/package.json` has no `dependencies` block — runtime imports no other workspace package and no third-party runtime dep.
- `packages/driver-claude-code` imports `@cc-plugin-codex/runtime` for shared types only.
- `packages/plugin-codex` imports both `@cc-plugin-codex/runtime` and `@cc-plugin-codex/driver-claude-code` (it's the leaf of the workspace graph).

The Stage 4 A5 polish broadened the architectural-invariant test to walk every `.ts` file under `packages/runtime/src/` and assert none contains the substrings `driver-claude-code`, `claude --bg`, `claude -p`, or `node-pty`. The `doctor.ts` header comment was rephrased ("the synchronous print-mode transport" instead of the literal `claude -p` token) so the broader scan stays clean without per-file allowlists.

## User-facing workflow

```
$claude-setup
$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."
$claude-status
$claude-result <jobId>
$claude-stop <jobId>      # optional cleanup
```

Direct dispatcher equivalents:

```
node packages/plugin-codex/scripts/claude-companion.mjs setup
node packages/plugin-codex/scripts/claude-companion.mjs delegate --yes -- "<task>"
node packages/plugin-codex/scripts/claude-companion.mjs status [--all] [--json]
node packages/plugin-codex/scripts/claude-companion.mjs result <jobId> [--all] [--json]
node packages/plugin-codex/scripts/claude-companion.mjs stop   <jobId> [--all] [--json]
```

After T12b, `delegate → status → result` returns the agent's final message without an intermediate `stop`. After Stage 4 A3, `result` and `stop` resolve job-ID prefixes against the **current workspace** by default; `--all` opts back into global resolution (mirroring `status --all`). Privacy ack remains interactive: a non-TTY first-delegation in a fresh workspace exits with a clear acknowledgement message unless `--yes` is supplied; the ack is stored at `<companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json` and is workspace-scoped.

## Test and CI results

Local on `5be9b9d` (verified 2026-05-31):

| Lane | Tests | Pass | Fail |
|---|---|---|---|
| `test:mock` (mock-claude + mock-codex) | 34 | 34 | 0 |
| `test:runtime` | 82 | 82 | 0 |
| `test:driver` | 119 | 119 | 0 |
| `test:plugin` | 212 | 212 | 0 |
| **Total** | **447** | **447** | **0** |

`npm run lint`, `npm run typecheck`, `npm run format` all exit 0.

Remote CI on `5be9b9d`, run `26711222280`, conclusion `success`:

- `ubuntu-latest` / Node 20 → success
- `ubuntu-latest` / Node 22 → success
- `macos-latest`  / Node 20 → success
- `macos-latest`  / Node 22 → success

The plugin-lane growth from 204 (T14) → 212 reflects three Stage 4 A3 regression tests (workspace-scoped prefix resolution for `result` and `stop`) plus five strict-frontmatter regression tests (one per SKILL.md, the 5be9b9d follow-up). Mock, runtime, and driver lane totals are unchanged from Stage 2's final count; the audit-finding fixes reshaped existing assertions rather than adding new tests.

## Live E2E results

Captured at [`artifacts/e2e-live-20260530.txt`](artifacts/e2e-live-20260530.txt). Real binaries: `codex-cli 0.135.0`, `Claude Code 2.1.149`, Node `v25.1.0`. Throwaway fixture repo at `/tmp/cc-plugin-codex-e2e-T1UTOe/` (README + `app.js`, three TODO markers), isolated `CC_PLUGIN_CODEX_HOME` under the same temp dir.

- `setup` against real binaries — initial run surfaced the `claude-bg-flag` + `claude-daemon` failures plus the deeper schema mismatch; flagged as a **CRITICAL DISCOVERY** in the artifact and remediated by T12a (mock + parser + status normalization + probe softening).
- Resumed `setup` post-T12a → `warn` aggregate (bg-flag + daemon downgraded to warn, all other probes ok).
- `delegate --yes --name codex-e2e-plan-0001 -- "<task>"` → real Claude background session started (`shortId 6ef69db3`, `sessionId 6ef69db3-695d-4420-a2d1-442b89c5d1c2`).
- `status` polled 18 × 10s → live reconciliation reported `running` (driver-`idle` mapped per the original T9 rule at that time).
- `result <jobId>` while still `running` → exit 1 with "not complete yet" — correct behavior.
- `stop <jobId>` → session terminated; job marked `stopped`.
- Post-stop `result` → printed the agent's correct answer: "Found 3 TODOs … README.md:3, README.md:4, app.js:2 …".
- T12b retry (after the reconciler started mapping `idle → completed`) → `delegate → status → result` returned the correct answer **without** an intermediate `stop`. The retry transcript is preserved in the same artifact.
- Cleanup: live session stopped before the artifact closed; orphan inventory empty.

No live Claude calls were made from any automated test. The throwaway fixture cwd contained no sensitive content.

## Audit findings and polish resolution

Stage 3 (independent context, fresh session) returned **PASS WITH FINDINGS — 5 low/nit, 0 blocker/high**. All five findings were resolved in Stage 4.

| ID | Severity | Finding | Stage 4 resolution |
|---|---|---|---|
| [A1](3-audit.md#finding-a1--cmdstop-records-the-event-as-stoprequested-after-the-stop-has-already-succeeded) | low | `cmdStop` appended `stop.requested` after `driver.stop()` already returned, mislabeling a completed action | Event renamed to `stop.completed` in `cmdStop`. Still fires post-`driver.stop`, but the name now matches the actual lifecycle point. |
| [A2](3-audit.md#finding-a2--cmdstop-reconstructs-startedat-from-jobcreatedat-rather-than-the-real-driver-side-startedat) | low | Reconstituted `SessionHandle.startedAt` proxied through `job.createdAt` instead of the real driver-side `startedAt` | Added optional `startedAt?: string` to `ClaudeSessionContext`. `cmdDelegate` persists `handle.startedAt` on `job.claude.startedAt` at job-create time; `cmdStop` reconstitutes from there, falling back to `job.createdAt` for pre-A2 records. |
| [A3](3-audit.md#finding-a3--cmdresult-and-cmdstop-resolve-job-id-prefixes-against-all-workspaces-not-the-current-one) | low | `cmdResult` / `cmdStop` resolved prefixes against `listJobs()` (all workspaces) while `cmdStatus` already filtered to the current workspace | Both now default to `listJobsForWorkspace(workspace)`; new `--all` flag (mirroring `cmdStatus --all`) opts back to global. Three new dispatcher tests cover the workspace-scoped default and the `--all` opt-in. |
| [A4](3-audit.md#finding-a4--drivernotimplementederrorwatch-plan-0001-t8t9-references-the-wrong-plan-task) | nit | Stale `'plan 0001 T8/T9'` marker on `watch()`'s `DriverNotImplementedError` (T8/T9 landed without using `watch`) | Marker changed to `'plan 0002+ (PTY attach / streaming)'`; matching regex in `probe.test.mjs` updated; driver header comment rewritten to reflect the v1 surface that actually shipped. |
| [A5](3-audit.md#finding-a5--architectural-invariant-test-only-checks-reconcilerts-not-every-runtime-source-file) | nit | The "runtime does not import driver" invariant test only scanned `reconciler.ts` | Test rewritten in `packages/runtime/test/reconciler.test.mjs` to recursively walk `packages/runtime/src/` and assert the four banned substrings appear in no `.ts` file. `doctor.ts` header comment rephrased so the broader scan stays clean without per-file allowlists. |

**Audit findings deferred**: none. All five Stage 3 findings were resolved in `42b99c3` (Stage 4 bundle).

**Stage 4 follow-up (5be9b9d)**: after the audit-finding bundle landed, the maintainer reported a Codex 0.135.0 startup warning rejecting `claude-setup/SKILL.md` with `invalid YAML: mapping values are not allowed in this context at line 2 column 46`. The frontmatter `description` was rephrased to drop the unquoted `: ` (semantically identical, YAML-safe). A `strictParseFrontmatter` helper was added to `packages/plugin-codex/test/skills-manifest.test.mjs` that requires each frontmatter line to match `^([a-z][a-z0-9_-]*):\s+(.+)$` and rejects unquoted `: ` or `#` in scalar values — the exact failure mode. Five new tests (one per `SKILL.md`) lock that contract. The maintainer accepted this follow-up as part of Stage 4 polish, not a separate plan.

## Scope compliance

Every locked v1 constraint upheld on the reported commit:

- ✅ **No `claude -p`** — transport is `--bg` only across `background-session.ts`, `agents-json.ts`, `logs.ts`, `transcript.ts`, `stop.ts`, `process.ts`. No fallback path exists.
- ✅ **No `node-pty`** — not in any `package.json`, not in any source file, not as an `optionalDependencies` entry.
- ✅ **No multi-turn reuse** — `startSession()` produces one fresh `claude --bg` per call; there is no `send`, `resume`, or `attach` method on the driver.
- ✅ **No `$claude-review` / `$claude-adversarial-review`** — the skills directory contains only the five v1 skills; tests assert the review-skill directories are absent.
- ✅ **No `hooks.json`** — absent from the plugin package; test asserts.
- ✅ **No benchmark harness** — no benchmark code, no measurement runner, no benchmarked claim anywhere.
- ✅ **No committed marketplace packaging** — no `.codex-marketplace.json` / `.codex-marketplace/` at the package root; the working marketplace install lives only in the plugin README and in temp dirs at smoke time.
- ✅ **No cost-savings claim** — none of the OQ4 forbidden tokens (`saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the`, `more efficient than`) or quantitative-claim patterns (`\d+%\s*(faster|cheaper|less)`, `\d+x\s*(cheaper|faster)`, `save[sd]?\s+\d+`) appears in any production text. Plugin README, root README, manifest, SKILL.md bodies, and dispatcher output all use the approved framing.
- ✅ **No live Claude/Codex in CI** — workflow installs no external CLI; `npm test` uses mocks only.
- ✅ **`--permission-mode` only forwarded when user supplies it** — `buildArgv` in `background-session.ts` only appends the flag when `opts.permissionMode` is truthy. No bypass flags injected anywhere.
- ✅ **`--allow-edit` is policy/UX only** — captured on `StartSessionOpts`, forwarded to the driver, deliberately not translated into a CLI permission flag; inline comment documents this.
- ✅ **`claude-delegate` skill does NOT inject `--yes`** — the skill body's run line is `node "<plugin-root>/scripts/claude-companion.mjs" delegate -- "<task prompt>"` with no `--yes`; tests assert.
- ✅ **Privacy ack preserved as interactive by default** — non-TTY first-run delegate exits non-zero with an acknowledgement message; `--yes` is the only explicit bypass; ack-on-disk path is `<companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json`.
- ✅ **Real `~/.claude` and `~/.codex` not modified by automated tests** — mocks use isolated `mktemp -d` HOMEs throughout.

## Known limitations

- **One fresh background session per delegate** — no companion-session reuse; multi-turn input requires a new delegate or manual `claude attach`. Plan 0002.
- **No PTY attach** — interactive prompt injection from inside Codex is not supported in v1. Plan 0002.
- **No Claude Code channels integration** — channels remain experimental; not used. Plan 0002 may revisit.
- **No `$claude-review` / `$claude-adversarial-review`** — Plan 0003.
- **No stop-time hook or review gate** — Plan 0005.
- **No benchmarked cost-savings claim** — copy uses the approved framing only. Plan 0004 is reserved for measurement.
- **No committed marketplace packaging** — install layout documented in the plugin README, not shipped from the repo. Plan 0006.
- **Windows not supported in plan 0001** — CI matrix is `ubuntu-latest + macos-latest` only (per research § H2).
- **`idle → completed` mapping is correct only for the start-only model** — when Plan 0002 introduces session reuse, an `idle` reused session is "awaiting next turn", not "completed". The reconciler will need a richer state model; the rationale is captured in an inline comment.
- **Real Claude transcripts are ANSI TUI byte streams**, not the JSONL the transcript parser expects. The reconciler's logs-fallback path correctly recovers the final assistant message post-completion; structured event extraction from real transcripts is a deeper rework (Plan 0002+).

## Follow-up plans

- **Plan 0002** — multi-turn reuse / PTY attach or structured input path; richer reconciler state model for reused sessions.
- **Plan 0003** — `$claude-review` and `$claude-adversarial-review` skills layered on top of `$claude-delegate`.
- **Plan 0004** — benchmark harness comparing `-p`, `-p --resume`, fresh-per-task background, and reused-background sessions. Re-evaluates cost-claim copy with measured data.
- **Plan 0005** — stop-time review gate and hook trust UX.
- **Plan 0006** — marketplace packaging and distribution polish (including a committed marketplace root layout).

New follow-up surfaced by Plan 0001:

- **Real Claude schema compatibility** should remain covered by tests as the Claude CLI evolves. The mock defaults to the real-2.1.149 schema; future schema drift should be caught at unit-test time, not at live E2E time. The Stage 4 follow-up (Codex 0.135.0 YAML strictness) is the same lesson on the Codex side — the strict-frontmatter test should keep catching this class of regression early.

## Risks remaining

- **R1 — Claude CLI schema drift.** The real-2.1.149 schema differed materially from the original mock and required T12a remediation. Future Claude releases may shift `agents --json` row shape, `--bg` stdout style, status vocabulary, or transcript format again. Mitigation: the doctor probes are feature-probes (no semver pin), the parser is alias-tolerant, the mock defaults to the real schema, and the reconciler is DI-injected so a future schema rework lives in the driver layer only.
- **R2 — Codex CLI compatibility drift.** Codex 0.135.0's stricter YAML parser was a real example; future Codex releases may surface other latent incompatibilities (manifest schema, skill frontmatter, marketplace layout). Mitigation: the strict-frontmatter test catches this exact failure mode at CI time; the install layout is documented and was validated live.
- **R3 — Privacy / data-leak risk on first delegation in a fresh workspace.** Mitigation: workspace-scoped first-run ack is interactive by default, recorded on disk, and the plugin README documents what gets sent to Anthropic. No silent bypass exists.
- **R4 — Orphaned background sessions consuming quota.** Mitigation: `$claude-status` shows live state including orphaned jobs; `$claude-stop` cleans up explicitly. Plan 0001 does not yet add a `--stop-all-orphans` workflow; that can be added incrementally.

## Final verdict

Plan 0001 closes as `complete`.

Every locked v1 constraint holds on the reported commit. All 14 Stage 2 tasks have demonstrable acceptance evidence in `2-implement.md`. The independent Stage 3 audit returned PASS WITH FINDINGS with only five low/nit findings; all five were resolved in Stage 4 (`42b99c3`). The user-reported Codex 0.135.0 YAML strictness rejection was caught and fixed as a Stage 4 follow-up (`5be9b9d`) with regression coverage. Local gates are clean (lint, typecheck, format, 447 tests pass / 0 fail). Remote CI is green on `5be9b9d` across all four matrix legs. The live E2E artifact captures a successful delegation against real Codex + Claude binaries.

The foundation is real enough to build Plan 0002 on top of.
