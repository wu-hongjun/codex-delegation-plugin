# Stage 3 — Audit: Plan 0001

## Audit metadata

- **Auditor**: independent Claude session (fresh context; no prior conversation with Stage 1 / Stage 2 author)
- **Date**: 2026-05-31
- **Commit audited**: `f17f98ab8fd51c0c7ef83e9caa11c33e5bd6f8f8` (origin/main, branch `main`)
- **Local platform**: macOS (Darwin 25.5.0, arm64)
- **Node version**: v25.1.0 (above the v1 floor of Node 20)
- **npm version**: bundled with Node 25 (not pinned; `npm ci` succeeded against committed lockfile)

## Verdict

**PASS WITH FINDINGS** — the v1 scope-locked architecture, transport, safety posture, and cost-claim discipline all check out. The static suite, lint, typecheck, format, and CI are all green on the audited commit. No blocker- or high-severity findings. Five low/nit findings are noted as polish material for Stage 4; none of them stand in the way of advancing to Stage 4.

## Executive summary

Plan 0001 delivers what it promised:

1. A real `ClaudeBackgroundDriver` that uses `claude --bg`, `claude agents --json`, `claude logs`, and `claude stop` exclusively. No `claude -p`. No `node-pty`. No `shell: true`. Transport is verifiably background-session only.
2. A runtime that does not import the driver package (validated by a static-content test and by `package.json` graph). The reconciler is DI-injected via `ReconcilerAdapter`.
3. Five `SKILL.md` files plus a `plugin.json` manifest exactly matching the locked shape. No `$claude-review`, no `hooks.json`, no `--yes` auto-injection in the `claude-delegate` skill.
4. A privacy ack flow (`<companionHome>/acks/<sha256-16>.json`) gating first delegation. `--yes` is the documented bypass. No `--dangerously-skip-permissions` anywhere. `--permission-mode` only forwarded when the user supplies it.
5. Real-Claude (2.1.149) schema tolerance: `deriveShortId(uuid) = uuid.replace(/-/g,'').slice(0,8)`, status normalization (`busy → working`, `waiting → needs_input`, `idle` kept at driver layer), and `idle → completed` at the reconciler layer for the start-only v1 model.
6. The live E2E artifact records both the initial schema mismatch and the T12a/T12b remediations, ending with a successful `delegate → status → result` flow against real Codex 0.135.0 + Claude 2.1.149.
7. No forbidden cost-claim wording anywhere in committed manifests, READMEs, SKILL.md bodies, or skill descriptions. Both READMEs use the approved framing.
8. CI matrix is `ubuntu-latest + macos-latest × Node 20+22`, uses pinned major action versions, has `permissions: contents: read` only, no secrets, no Anthropic install. CI is green on the audited commit (run `26703448264`, conclusion `success`).

The implementation log (`2-implement.md`) is honest about its deviations, surprises, and deferred items. The discrepancy between the mock schema and real Claude 2.1.149 was caught during T12 live testing, surfaced explicitly as a "CRITICAL DISCOVERY", and remediated via T12a/T12b rather than papered over. That is exactly what an honest implementation log should look like.

## Checks performed

For each of the 12 audit tasks specified by the maintainer:

1. **Repository state** — `git rev-parse HEAD` returned `f17f98ab8fd51c0c7ef83e9caa11c33e5bd6f8f8` (matches the requested audit commit). `git status --short` showed only the three submodule `?` lines under `references/`, which is the expected state for this repo's vendored submodules.

2. **Full local suite** — fresh `npm ci` (exit 0), `npm run lint` (exit 0), `npm run typecheck` (exit 0), `npm run format` (exit 0, Prettier `--check`), `npm test` (exit 0, totals below).

3. **CI workflow** — read `.github/workflows/ci.yml` and verified the locked shape. Confirmed both the first-T14 run (`26703417200`, success) and the latest run on the audited commit (`26703448264`, success). Matrix legs: `ubuntu-latest + macos-latest × Node 20+22`, using `actions/checkout@v6` + `actions/setup-node@v6`.

4. **Architecture boundaries** — grep'd `packages/runtime/src/**` for `driver-claude-code`, `claude --bg`, `claude -p`, `node-pty`. Only matches are inside string-literal *test-content* (the reconciler architectural-invariant test) and a single explanatory *comment* in `doctor.ts:8` (which negates, not imports, the forbidden APIs). `packages/runtime/package.json` has no `dependencies` block at all — the runtime is dependency-free at the workspace graph level, confirming it does not depend on the driver.

5. **Transport correctness** — read `background-session.ts`, `agents-json.ts`, `logs.ts`, `stop.ts`, and `process.ts`. All five exclusively use the locked transport. `process.ts` uses `shell: false` and never throws (errors map to `spawnError`). No `claude -p` / `claude --print` / `node-pty` references in any driver source file.

6. **Real Claude 2.1.149 schema handling** — verified `deriveShortId(sessionId) = sessionId.replace(/-/g, '').slice(0, 8)` (`packages/driver-claude-code/src/agents-json.ts:80-83`). Verified status alias mapping table (lines 49-58): `busy → working`, `waiting → needs_input`, `idle/ready → idle`. Verified the reconciler's `STATUS_MAP` at `packages/runtime/src/reconciler.ts:95-107` maps driver-`idle → completed` (the T12b remediation), with a load-bearing comment explaining the plan 0001 start-only rationale and Plan 0002 caveat.

7. **Job store + reconciler** — verified `JOB_ID_PATTERN = /^job_[a-z0-9]+_[a-f0-9]{8}$/` (`packages/runtime/src/job-store.ts:33`) statically excludes `/`, `\`, `..`, whitespace, and dots. Verified `atomicWriteJson` writes to `<path>.<pid>.<rand>.tmp` then renames (lines 105-118). Verified `acquireLock` uses `open(path, 'wx')` and maps `EEXIST` to `JobLockError` (lines 66-103). Verified `updateJob` uses `try { ... } finally { await lock.release(); }` (lines 166-179) so a throwing updater still unlocks. Verified `listJobs()` returns `{ jobs, warnings }` and surfaces corrupt records as warnings rather than throwing (lines 213-243). Verified the reconciler is DI-injected via `ReconcilerAdapter` (`packages/runtime/src/reconciler.ts:37-41`) and does not import the driver package. Verified idempotency short-circuits when `!(statusChanged || resultChanged || claudeChanged)` (lines 322-330). Verified the locked-re-read pattern of `updateJob(jobId, (current) => ({ ...current, status, claude, result }))` (lines 338-343) so a concurrent reconciler's writes are preserved. Verified the final-assistant extraction iterates events and keeps the *last* `message.completed` with `role: 'assistant'` (lines 237-245). Verified touched-files de-dup uses `Set` + `Array` preserving encounter order (lines 246-251). Verified `resultContextEqual` includes `deepEqual(a.usageSnapshot, b.usageSnapshot)` (lines 147-154). Verified the logs fallback fires only when `nextStatus === 'completed'` and `logsResult.text.trim().length > 0` (line 293).

8. **Dispatcher** — read `packages/plugin-codex/scripts/claude-companion.mjs` (~383 lines). All five subcommands present. `--json` supported via the `useJson` flag. Invalid args (`no command and no --help`) exit `2`; unknown subcommand exits `2`. `delegate` calls `driver.probe()` (failing fast on `health.status === 'fail'` or missing background/agents capability), then `driver.startSession(...)`, then `createJob(...)`, then a single `reconcileJob(...)`. Privacy ack: `hasAck(workspace)` is checked; without `--yes` and non-TTY, dispatcher exits 1 with the required-acknowledgement message — `--yes` is the explicit (and only) bypass, recorded to disk on use. `status` and `result` both run `reconcileJob` before printing. `stop` reconstitutes a session handle from the job record and calls `driver.stop(...)`. `result` rejects with exit 1 for non-terminal statuses (`completed | failed | stopped | orphaned` are terminal). No `--dangerously-skip-permissions` reference anywhere.

9. **Skills + manifest** — verified five skills exist: `claude-setup`, `claude-delegate`, `claude-status`, `claude-result`, `claude-stop`. Verified `claude-delegate/SKILL.md` does not inject `--yes` (its run line is `node "<plugin-root>/scripts/claude-companion.mjs" delegate -- "<task prompt>"`; `--yes` is only mentioned in prose as a user-provided flag). Verified every skill's documented run command invokes `scripts/claude-companion.mjs`. Verified `plugin.json` points to `./skills/`. No `hooks.json` and no `claude-review*/` directory exist (the test suite has dedicated assertions for both). The plugin description and `defaultPrompt` entries contain no cost claim. The plugin README documents the working local-marketplace install (matching the T11 remediated flow) and uses the approved cost-claim language.

10. **Safety/privacy** — verified `packages/plugin-codex/scripts/lib/ack.mjs` implements `hasAck`/`recordAck` using `<companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json`. The plugin README's "Privacy and workspace disclosure" section explicitly states delegation may send repository contents, prompts, command output, and Claude Code context to Anthropic. No bypass flags exist anywhere; `--permission-mode` is only forwarded when the user passes it (`background-session.ts:104-107` only appends if `opts.permissionMode` is truthy). `--allow-edit` is captured but not translated into a CLI flag — there is an inline comment near `buildArgv` documenting that it is policy/UX, not a sandbox.

11. **Cost-claim discipline** — grep'd `packages/`, `README.md`, and the plugin's manifest for `saves money`, `cheaper than`, `reduces cost`, `preserves prompt-cache savings`, `avoids the \`claude -p\``, `more efficient than`, `\d+%\s*(faster|cheaper|less)`, `\d+x\s*(cheaper|faster)`, `save \d+`. No production-text matches. The plugin's `skills-manifest.test.mjs` and `readme.test.mjs` enforce both the literal-token list and the regex pattern list at CI time.

12. **Live E2E artifact** — read `artifacts/e2e-live-20260530.txt` end-to-end (358+ lines). It records: the initial probe failures and CRITICAL DISCOVERY of schema mismatch with Claude 2.1.149, the T12a remediation pass (mock + parser + status normalization), a successful live `setup` (warn aggregate) and `delegate` against real Claude (shortId `6ef69db3`, sessionId `6ef69db3-...`), the discovery that `idle ≠ completed` for the original mapping, the T12b reconciler change (`idle → completed`), and a successful T12b retry showing `delegate → status → result` returning the correct assistant answer without an intermediate `stop`. Versions match the locked floor: `Codex 0.135.0`, `Claude 2.1.149`. The artifact does not need to be re-run; it is self-consistent and the post-T12b reconciler change is unit-tested.

## Findings

### Finding A1 — `cmdStop` records the event as `stop.requested` after the stop has already succeeded

- **Severity**: low
- **Evidence**: `packages/plugin-codex/scripts/claude-companion.mjs:343-348`. The flow is `await driver.stop(sessionHandle); ...; await updateJob(...); await appendEvent(jobId, { type: 'stop.requested', at: now });`. The `driver.stop(...)` call has already returned successfully (otherwise the dispatcher would have thrown into the outer `try/catch`), so by the time the event is appended the stop has *completed*, not just been *requested*. Reading the event log later, a downstream consumer would reasonably infer the request was pending when it was actually done.
- **Impact**: cosmetic. No correctness bug — the job's `status` field is `'stopped'`, which is the authoritative source. The event-log naming is just slightly misleading.
- **Recommendation**: rename to `stop.completed` (or emit two events: `stop.requested` *before* `driver.stop`, `stop.completed` *after*). Not worth a code change on its own; bundle with other Stage 4 polish.

### Finding A2 — `cmdStop` reconstructs `startedAt` from `job.createdAt` rather than the real driver-side `startedAt`

- **Severity**: low
- **Evidence**: `packages/plugin-codex/scripts/claude-companion.mjs:331-338`:
  ```js
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.createdAt,   // ← proxy for handle.startedAt
  };
  ```
  The driver only uses `shortId` from the handle to issue `claude stop <shortId>` (see `stop.ts`), so this does not affect the live call. But future readers expecting a faithful handle reconstruction may be surprised that the timestamp is "when the job record was created" rather than "when the background session started".
- **Impact**: none today. Latent fidelity gap if any future code path reads `handle.startedAt` from a reconstituted handle.
- **Recommendation**: either persist `handle.startedAt` on the `JobRecord.claude` block at job-create time and reuse it here, or rename the field in the reconstituted handle so the proxy is explicit. Not worth a code change on its own.

### Finding A3 — `cmdResult` and `cmdStop` resolve job-ID prefixes against *all* workspaces, not the current one

- **Severity**: low
- **Evidence**: `packages/plugin-codex/scripts/claude-companion.mjs:251-253` (`cmdResult`) and `:314-316` (`cmdStop`) both call `await listJobs()` (workspace-unbounded) to build the prefix candidate set. `cmdStatus` correctly filters by `listJobsForWorkspace(workspace)` unless `--all` is passed.
- **Impact**: A user could resolve and `stop`/`result` a job from a different workspace by guessing or auto-completing its prefix. The job ID is opaque, so this is unlikely in practice, but it is inconsistent with `cmdStatus`'s workspace-scoped default. The privacy ack does not gate this read path (the ack is for `delegate`).
- **Recommendation**: default prefix resolution to the current workspace; require an `--all` (or explicit `--workspace <root>`) opt-in to reach jobs elsewhere. Bundle with Stage 4 polish.

### Finding A4 — `DriverNotImplementedError('watch', 'plan 0001 T8/T9')` references the wrong plan task

- **Severity**: nit
- **Evidence**: `packages/driver-claude-code/src/index.ts:52`. The string `'plan 0001 T8/T9'` was the original T5-era marker for "this lands later in plan 0001". By the time T8 and T9 landed, the architecture had moved away from a `watch()` stream (the transcript reader and reconciler took its place), so `watch` is now a deliberate deferral to a later plan, not a forthcoming T8/T9 task. The plan reference is stale.
- **Impact**: cosmetic. No runtime effect; just slightly misleads anyone grepping for unfinished plan-0001 work.
- **Recommendation**: change the marker to `'plan 0002+ (PTY attach / streaming)'` or similar.

### Finding A5 — Architectural-invariant test only checks `reconciler.ts`, not every runtime source file

- **Severity**: nit
- **Evidence**: `packages/runtime/test/reconciler.test.mjs:560-564`. The test reads `reconciler.ts` and asserts no `driver-claude-code` / `claude --bg` / `claude -p` / `node-pty` substrings. The constraint *"runtime must NOT depend on packages/driver-claude-code"* is broader than just `reconciler.ts` — it applies to every file in `packages/runtime/src/**`. The constraint is also enforced at the workspace-graph level (`packages/runtime/package.json` has no `dependencies` block at all), so the gap is already covered defensively; the test just doesn't catch a hypothetical drift in (say) `doctor.ts` or `job-store.ts`.
- **Impact**: very low. Workspace graph guarantees the constraint at install time, so a slip in another file would have to be deliberately published and would surface at typecheck. The test is a useful redundant guard but is narrower than the documented invariant.
- **Recommendation**: extend the static-content test to glob all `packages/runtime/src/**/*.ts`. Trivial change; bundle with Stage 4 polish.

## Scope compliance

The plan's "locked v1 constraints" (1-plan.md § 6 + § 2 + § 3.14) are all upheld:

- ✅ No `claude -p` transport (transport is verifiably `--bg` only across all driver subcommands).
- ✅ No `node-pty` anywhere (grep'd `packages/`, `tools/`; only matches are in test-content strings of skill/README enforcement tests).
- ✅ No multi-turn reuse — `startSession` produces one fresh `claude --bg` job; there is no `send`, `resume`, or `attach` implementation.
- ✅ No `$claude-review` and no `hooks.json` in the plugin package.
- ✅ No marketplace packaging committed (`.codex-marketplace.json` and `.codex-marketplace/` are absent; the working install is documented in the plugin README only).
- ✅ `packages/runtime` does NOT import `packages/driver-claude-code` (workspace graph + grep + static test all confirm).
- ✅ `packages/plugin-codex` imports both runtime and driver (confirmed in `package.json` dependencies and in `claude-companion.mjs` imports).
- ✅ Driver `idle` → job `completed` mapping is in place (`packages/runtime/src/reconciler.ts:100`), with the load-bearing comment explaining Plan 0001 start-only semantics.
- ✅ `--permission-mode` only forwarded when user supplies it (`packages/driver-claude-code/src/background-session.ts:104-107`). No bypass flags ever injected.
- ✅ `--allow-edit` captured but never translated into a CLI flag — policy/UX only, with an inline comment documenting the discipline.

## Test results

Fresh local run on the audited commit:

| Suite | Tests | Suites | Pass | Fail |
|---|---|---|---|---|
| `test:mock` (mock-claude + mock-codex) | 34 | 16 | 34 | 0 |
| `test:runtime` | 82 | 28 | 82 | 0 |
| `test:driver` | 119 | 73 | 119 | 0 |
| `test:plugin` | 204 | 78 | 204 | 0 |
| **Total** | **439** | **195** | **439** | **0** |

`npm run lint` / `typecheck` / `format` all exit 0.

This matches the implementer's claim in `2-implement.md` T14 verbatim. No discrepancy.

## CI results

`.github/workflows/ci.yml` (read at the audited commit):

- ✅ Triggers: `push` to `main` + `pull_request`.
- ✅ Workflow-level `permissions: contents: read` (no write scopes).
- ✅ `concurrency` group `ci-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
- ✅ Matrix legs: `{ubuntu-latest, macos-latest} × {Node 20, Node 22}`, `fail-fast: false`, `timeout-minutes: 15`.
- ✅ Steps: `actions/checkout@v6` (`persist-credentials: false`) → `actions/setup-node@v6` with `cache: npm` → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run format` → `npm test`.
- ✅ No `${{ secrets.* }}` references anywhere.
- ✅ No Anthropic / Claude / Codex install step.
- ✅ No `windows-latest` in matrix (correct per research § H2 deferral).

Remote run on the audited commit: `gh run list --branch main --limit 1` returns conclusion `success` (run created `2026-05-31T04:41:46Z` for SHA `f17f98ab...`). The first T14 run (`26703417200`) is also `success`. Both confirm the workflow runs to completion green across all four matrix legs.

## Architecture boundary review

| Constraint | Evidence |
|---|---|
| Runtime does not depend on driver | `packages/runtime/package.json` has no `dependencies` block. `grep -r 'driver-claude-code' packages/runtime/src` returns no matches. |
| Runtime does not invoke Claude/Codex CLIs directly | The only `claude` strings in `packages/runtime/src` are: (a) doctor probes that explicitly use `claude --version`, `claude auth status`, `claude --help`, `claude agents --json`, `claude logs --help`, `claude daemon status` — none of which are `--bg` lifecycle calls, and (b) a comment in `doctor.ts:8` documenting the negative ("Probes never start a real Claude background session, never fall back to `claude -p`"). |
| Reconciler is DI-injected | `ReconcilerAdapter` interface declared at `packages/runtime/src/reconciler.ts:37-41`. The reconciler's only inputs are job-store reads + the injected adapter. |
| Driver does not bypass `process.ts` | `background-session.ts`, `agents-json.ts`, `logs.ts`, `stop.ts` all import `runCommand` from `./process.js`. `process.ts` is internal (not re-exported in `index.ts`). |
| `shell: false` everywhere | `packages/driver-claude-code/src/process.ts:53` sets `shell: false` explicitly; `packages/runtime/src/doctor.ts:69` also sets `shell: false`. `grep -rn 'shell: true' packages/` returns nothing. |
| Plugin sits at the leaf of the dependency graph | `packages/plugin-codex/package.json` declares both `@cc-plugin-codex/runtime` and `@cc-plugin-codex/driver-claude-code` as dependencies. The dispatcher's imports match. |

## Safety/privacy review

- ✅ **First-run ack gate**: `cmdDelegate` calls `hasAck(workspace)`; without `--yes` and without a TTY, the dispatcher exits 1 with a privacy-acknowledgement message and a `--yes` hint. With a TTY *or* `--yes`, the ack is recorded to `<companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json` and the flow proceeds. Storage path matches the plan's R4 mitigation.
- ✅ **Disclosure**: the plugin README's "Privacy and workspace disclosure" section explicitly says delegation may send repository contents, prompts, command output, file metadata, and Claude Code context to Anthropic via the user's local Claude Code account. The root README's "Known risks" bullet repeats this.
- ✅ **No bypass flags**: `grep -rn 'dangerously-skip-permissions' packages/ README.md` finds only the test enforcing its absence in the manifest. The driver's `buildArgv` only appends `--permission-mode <mode>` when `opts.permissionMode` is truthy.
- ✅ **`--allow-edit` is not a sandbox**: captured on `StartSessionOpts`, not translated into a CLI flag, and explicitly documented as policy/UX only in inline comments and in the plugin README + root README. Audit found no place where it is misrepresented as enforcement.
- ✅ **No accidental TUI parsing**: the only transcript reader is JSONL-based (`packages/driver-claude-code/src/transcript.ts`). The artifact records that real Claude transcripts are ANSI TUI byte streams that the parser intentionally does not interpret — the logs fallback is the documented recovery path, and that path is gated on `nextStatus === 'completed'` so it cannot silently hijack the result of a job that the driver still considers active.

No safety regressions, no privacy regressions.

## Cost-claim review

Searched `packages/`, `README.md`, and `packages/plugin-codex/.codex-plugin/plugin.json` for every forbidden substring and pattern listed in `1-plan.md § 3.14` and the auditor's brief:

| Forbidden | Production-text occurrences |
|---|---|
| `saves money` | 0 |
| `cheaper than` | 0 |
| `reduces cost` | 0 |
| `preserves prompt-cache savings` | 0 |
| `avoids the` (in the `claude -p` cost-claim sense) | 0 |
| `more efficient than` | 0 |
| `\d+%\s*(faster\|cheaper\|less)` | 0 |
| `\d+x\s*(cheaper\|faster)` | 0 |
| `save \d+` | 0 |

All occurrences of these strings are in *test enforcement code*, not production text, which is correct.

Approved framing is present and accurate:

- Root `README.md:7` — "designed to preserve the architecture needed for session/cache reuse, but savings have not yet been benchmarked."
- Plugin `README.md:7` — "designed to preserve the foundation for future session/cache reuse experiments."
- Plugin `README.md:157` — full approved paragraph: "does not use `claude -p`", "preserve the architecture needed for future session/cache reuse experiments", "Cost savings have not been benchmarked yet", "Plan 0004 is reserved for measurement".

No findings here.

## Live E2E artifact review

`artifacts/e2e-live-20260530.txt` is honest, sufficient, and self-consistent:

- ✅ Records the initial CRITICAL DISCOVERY: real Claude 2.1.149 does not advertise `--bg` in `--help`, does not implement `claude daemon status`, prints `backgrounded · <id>` (not `Started background session <id>`), and emits an `agents --json` schema that differs significantly from the mock's idealized shape.
- ✅ Records the T12a remediation (mock and parser updates) before resuming the live E2E. The implementation log corroborates the exact code changes and test counts.
- ✅ Records the resumed live `delegate` (`shortId 6ef69db3`, name `codex-e2e-plan-0001`), a long polling loop, the `result <jobId>`-while-running rejection (correct), the explicit `stop`, and a successful post-stop `result` that printed the agent's correct answer ("Found 3 TODOs ... README.md:3, README.md:4, app.js:2").
- ✅ Records the `idle ≠ completed` finding *as a finding*, not as a success — and surfaces two reasonable remediations.
- ✅ Records the T12b retry showing `delegate → status → result` succeeding without an intermediate `stop` after the reconciler change.
- ✅ Records real versions: `codex-cli 0.135.0`, `Claude Code 2.1.149`, `node v25.1.0`.
- ✅ Records that the orphan session was stopped before the artifact closed and that companion home was isolated to a temp directory.

I did not judge a re-run necessary. The artifact is sufficient: it captures both the initial probe failures and the remediated success, and the remediated reconciler behavior is unit-tested.

## Required fixes before Stage 4

**None.** No blocker or high-severity findings.

## Optional polish items

(Stage 4 candidates; severity ≤ low/nit:)

- **A1** — rename the `stop.requested` event to `stop.completed` (or split into a pre/post pair).
- **A2** — persist driver-side `startedAt` on `JobRecord.claude` so `cmdStop` can reconstitute a fully faithful handle (or make the proxy explicit).
- **A3** — default `cmdResult` and `cmdStop` prefix resolution to the current workspace; require explicit opt-in to reach jobs elsewhere.
- **A4** — update `DriverNotImplementedError('watch', 'plan 0001 T8/T9')` to point at a later plan.
- **A5** — extend the architectural-invariant test to all of `packages/runtime/src/**`, not just `reconciler.ts`.
- (also already known and deferred by the implementer in `2-implement.md`:)
  - `cmdStop` does not pre-check whether the job is already terminal (Subagent-C medium, deferred).
  - Dispatcher silently swallows the post-delegate reconcile error (Subagent-C low, deferred).
  - Subagent-A duplicate-spawn-helper comment / test brittleness nits.

## Final audit verdict

**PASS WITH FINDINGS — ready to advance to Stage 4 (Polish).**

The implementation meets every locked constraint in Plan 0001, all 14 tasks have demonstrable acceptance evidence, the test/lint/typecheck/format/CI gates are all green on the audited commit, the live E2E artifact is honest about both its initial failure mode and its successful remediated retry, and the cost-claim discipline holds throughout. The five findings recorded above are low/nit-level polish material; none of them block the polish stage and most of them can be batched into a single Stage 4 commit.

Approval: **yes — proceed to Stage 4**.
