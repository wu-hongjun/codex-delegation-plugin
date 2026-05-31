# Stage 1 — Plan: Follow-up injection for Claude background jobs

> **Status**: drafting 2026-05-31. All eight research open questions resolved by maintainer (§ 6). Ready for Stage 1 review.
> **Author**: Claude (assistant)
> **Date drafted**: 2026-05-31
> **Date approved**: —

---

## 1. Context & references

This plan operationalizes the research at [`documentation/research/20260531-plan-0002-research/report.md`](../../research/20260531-plan-0002-research/report.md) (committed at `b7363be`). It builds directly on Plan 0001 (complete 2026-05-31 at `ba48098`).

**Read the research report before reading the rest of this plan.** Everything below assumes its findings, particularly:

- `claude attach <shortId>` is a documented in-binary subcommand in Claude Code 2.1.149, with `Ctrl+Z` as the documented detach key. The `--help` string is literally: *"Open the background session in this terminal. Detach with Ctrl+Z; the session keeps running."*
- `claude --bg` with no prompt argument creates an **`idle`** background session (its startup banner reads `backgrounded · <shortId> (idle — send a prompt to start)`). Session and prompt are decoupled at the protocol layer.
- A per-job sidecar exists at `~/.claude/jobs/<shortId>/state.json` and `~/.claude/jobs/<shortId>/timeline.jsonl` carrying structured turn-level state (`state`, `tempo`, `inFlight`, `output.result`, `linkScanPath`, `resumeSessionId`, `intent`, etc.). The schema is **undocumented** and treated as best-effort enrichment.
- `node-pty@1.1.0` is healthy and maintained (Microsoft; latest stable 2025-12-22, beta 2026-05-13). It is the load-bearing input transport for Plan 0002.

Plan 0001's locked v1 constraints remain in force for everything not explicitly opened by this plan:

- No `claude -p`. Not even as fallback.
- One fresh `claude --bg` session per `$claude-delegate` invocation (Plan 0002 adds **a separate** `$claude-followup` skill; it does not change `$claude-delegate` semantics).
- No `$claude-review`, no hooks, no benchmark harness, no committed marketplace packaging, no cost-savings claim.
- Privacy ack interactive by default; `--yes` is the only explicit bypass.
- `--permission-mode` only forwarded when the user supplies it; no bypass flags ever injected.
- `--allow-edit` is policy/UX only; never a CLI permission flag.
- `packages/runtime/` does NOT import `packages/driver-claude-code/` (architectural invariant; Plan 0001 Stage 4 A5 broadened the static-content test to walk every `.ts` under `packages/runtime/src/`).

---

## 2. Scope of Plan 0002

### In scope (maintainer scope-lock)

A complete vertical slice that lets a Codex user, from inside an active Codex session in a real repo, send a follow-up prompt to an already-running Claude background job and retrieve the next turn's result:

1. New skill `$claude-followup <jobId-or-prefix> "<follow-up prompt>"`.
2. New dispatcher subcommand `followup`.
3. New driver-level API `send(session, input, opts): Promise<TurnHandle>` implemented in `ClaudeBackgroundDriver` via an internal PTY-attach helper that opens `claude attach <shortId>`, types the prompt + `\r`, polls for turn completion, detaches with `0x1a` (`Ctrl+Z`).
4. `node-pty@1.1.0` as a declared dependency of `@cc-plugin-codex/driver-claude-code`. Doctor probes for PTY readiness.
5. New job-status value `awaiting_followup` and a context-aware reconciler `STATUS_MAP` with a 30-minute TTL (OQ-A).
6. Sidecar-aware state reading as best-effort (OQ-B).
7. Mock-claude updates: `attach` subcommand, no-prompt `--bg`, sidecar emulation, permission-prompt simulation.
8. Tests across all four lanes (mock / runtime / driver / plugin) plus a new `test:attach` PTY-dependent lane.
9. Live E2E in a throwaway repo.

### Out of scope (maintainer scope-lock, deferred to later plans)

- `$claude-review` / `$claude-adversarial-review` → Plan 0003
- Benchmark harness + cost-claim copy update → Plan 0004
- Stop-time review gate via hooks → Plan 0005
- Marketplace packaging + distribution polish → Plan 0006
- Broad terminal UI streaming / persistent daemon/watch mode (no `watch()` implementation; current `DriverNotImplementedError` marker on `watch()` stays in force, updated to point at "later plan (streaming AsyncIterable)")
- Windows support (CI matrix stays `ubuntu-latest + macos-latest × Node 20 + 22`)
- Cost claims (Plan 0001's OQ4 forbidden-token discipline continues to apply verbatim)

### Why this scope

It is the smallest end-to-end demonstration that the follow-up-injection capability works end-to-end. Every load-bearing piece (PTY transport, sidecar reading, schema v2, reconciler context-awareness, dispatcher, skill, doctor, mock, tests) gets one real implementation. The expensive next questions (`watch()` streaming, richer state model for reused sessions, hooks, review skills, benchmarks) are postponed until the foundation is real enough to test against — exactly as Plan 0001 did for `$claude-delegate`.

---

## 3. Approach

### 3.1 User-facing surface (the load-bearing framing decision)

Plan 0002 is named "follow-up injection for Claude background jobs" because the user capability is sending a follow-up prompt to an existing Claude background job. PTY attach is the implementation detail underneath. The plan, the skill name, the dispatcher subcommand, and the driver API all reflect this framing — the user-visible capability is "continue an existing Claude conversation from inside Codex"; the transport could change later without renaming the plan.

New skill: `$claude-followup <jobId-or-prefix> "<follow-up prompt>"`.

Args accepted (per OQ-D):

- `--all` — search jobs across all workspaces, not only the current cwd (mirrors `$claude-status --all` / `$claude-result --all` from Plan 0001 Stage 4 A3)
- `--json` — machine-readable output
- `--yes` — skip the interactive privacy-ack prompt (when re-ack is required per OQ-E)
- `--allow-edit` — same policy/UX flag as `$claude-delegate`; framing-only, never a permission flag

Args rejected at parse time with a clear error pointing at `$claude-delegate`:

- `--model`
- `--effort`
- `--permission-mode`
- `--add-dir`
- `--mcp-config`
- `--name`

Reason: these are startup-only flags that configure a *new* Claude session. The session a follow-up targets was already configured at `$claude-delegate` time; passing these flags to `$claude-followup` would silently no-op, which is a worse UX than a hard parse-time error.

### 3.2 Driver-level API (OQ-F)

Plan 0001's `Driver` interface gets exactly one new method:

```ts
interface Driver {
  // ...unchanged from Plan 0001...
  send(
    session: SessionHandle,
    input: { type: 'text'; text: string },
    opts?: SendOpts,
  ): Promise<TurnHandle>;
}

interface SendOpts {
  timeoutMs?: number;      // default 600_000 (10 min) for turn completion
  signal?: AbortSignal;
  mode?: 'auto' | 'pty';   // 'auto' selects the best available transport; 'pty' forces PTY-attach
}

interface TurnHandle {
  jobId: string;
  turnIndex: number;       // 0-based index into JobRecord.turns
  startedAt: string;       // ISO
  endedAt?: string;
  finalMessage?: string;
  touchedFiles?: string[];
  usageSnapshot?: UsageSnapshot;
  status: TurnStatus;
}
```

The `ClaudeBackgroundDriver` implements `send()` via an internal helper `attachAndSend(session, text, opts)` that:

1. Acquires a per-`shortId` file lock under `<companionHome>/locks/attach-<shortId>.lock`.
2. Opens `claude attach <shortId>` under `node-pty.spawn`.
3. Drains PTY output into a bounded 8 KiB ring buffer (**never parsed for semantics**).
4. Writes the user's text + `\r`.
5. Polls sidecar (`~/.claude/jobs/<shortId>/state.json`) or `claude agents --json` for turn completion (`tempo: idle && inFlight.tasks: 0` from sidecar, or `status: idle` from agents-json fallback).
6. Writes `0x1a` (`Ctrl+Z`) to detach.
7. Releases the lock.

Public driver consumers (the runtime, the dispatcher) never see `node-pty`. The PTY surface is encapsulated in `packages/driver-claude-code/src/attach.ts`.

`watch()` remains `DriverNotImplementedError`. The error marker is updated from "plan 0002+ (PTY attach / streaming)" to **"later plan (streaming AsyncIterable)"** — the next plan that wants streaming claims it explicitly.

### 3.3 Sidecar reading (OQ-B, research Block A2)

Best-effort. The driver adds a `readSidecar(shortId): SidecarSnapshot | null` helper that reads `~/.claude/jobs/<shortId>/state.json`. The schema is treated as defensively-parsed unknown JSON; every field is optional in the type.

```ts
interface SidecarSnapshot {
  state?: string;          // observed: "done" | "working" | "waiting" | ...
  tempo?: string;          // observed: "idle" | "active" | ...
  inFlight?: { tasks?: number; queued?: number; kinds?: string[] };
  output?: { result?: string };
  linkScanPath?: string;
  resumeSessionId?: string;
  intent?: string;
  cliVersion?: string;
  cwd?: string;
  raw: unknown;            // verbatim parsed JSON for forward-compat
}
```

When sidecar is unavailable, the reconciler falls back to Plan 0001's existing pipeline: `claude agents --json` for status + `claude logs <shortId>` for the final assistant message + transcript discovery for events.

Doctor probe `sidecar-jobs-dir` reports `ok` if `~/.claude/jobs/` exists and is readable, `warn` if missing — **never `fail`**. Sidecar absence does not gate `$claude-followup` from running. PTY transport is the load-bearing dependency; sidecar is enrichment.

### 3.4 Job schema v2 and state model (OQ-A, OQ-C)

Schema bumps from 1 → 2. Lazy migration on first read of v1 records.

```ts
interface JobRecord {
  // ...all Plan 0001 fields...
  schemaVersion: 2;
  turns: TurnRecord[];          // NEW; len ≥ 1 after migration

  // Plan 0001 compat aliases (deprecated; remove in a later plan):
  //   prompt  = turns[0].prompt
  //   result  = turns[turns.length - 1].result
}

interface TurnRecord {
  prompt: PromptContext;        // same shape as Plan 0001
  startedAt: string;            // ISO
  endedAt?: string;
  result?: ResultContext;
  usageSnapshot?: UsageSnapshot;
  status: TurnStatus;
}

type TurnStatus =
  | 'queued' | 'starting' | 'injecting'
  | 'working' | 'needs_input'
  | 'completed' | 'failed';

type JobStatus =
  | 'queued' | 'starting' | 'running'
  | 'needs_input' | 'completed' | 'failed' | 'stopped' | 'orphaned'
  | 'awaiting_followup';        // NEW
```

New `JobStatus` value `awaiting_followup` means: driver session is `idle`, the most recent turn is `completed`, and the 30-minute TTL has not elapsed. This is the "Plan-0001-completed but reusable" state.

Lazy migration: when the job store reads a v1 record, it wraps the existing `prompt` + `result` into a `turns[0]` entry and writes the migrated v2 record back atomically. The lazy-migration path is covered by a dedicated test.

### 3.5 Reconciler (OQ-A, OQ-B, OQ-F)

The `STATUS_MAP` becomes context-aware. Inputs:

- Driver status value (`idle | busy | waiting | working | needs_input | completed | failed | stopped | orphaned | unknown`).
- Most recent turn's `TurnStatus`.
- Whether the 30-minute TTL has elapsed since the most recent activity timestamp.
- Whether the driver session is still present in `agents --json`.

Mapping table:

| Driver value | Most-recent turn status | TTL state | → JobStatus | Notes |
|---|---|---|---|---|
| `busy` | (any) | (any) | `running` | turn maps to `working` |
| `waiting` | (any) | (any) | `needs_input` | permission stall |
| `idle` | `injecting` | (any) | `running` | mid-write |
| `idle` | `completed` | not elapsed | `awaiting_followup` | reusable |
| `idle` | `completed` | elapsed | `completed` | TTL expired |
| `idle` | `failed` | (any) | `failed` | |
| `completed` / `failed` / `stopped` | (any) | (any) | passthrough | terminal |
| missing from `agents --json` | (any) | (any) | `orphaned` | |

The TTL is configurable; default 30 minutes from the most recent activity timestamp (most recent event or most recent driver status change). TTL is **default UX/status**, not a hard capability cutoff — an explicit `$claude-followup <jobId>` may still attempt to attach if the live Claude session exists in `agents --json`.

The reconciler accepts an extended `ReconcilerAdapter` with optional `readSidecar?(ref): SidecarSnapshot | null` in addition to Plan 0001's `status` / `readTranscriptEvents` / `readLogs`. All new adapter methods are optional and best-effort.

Architectural invariant unchanged: `packages/runtime/` imports no driver package; the static-content test from Plan 0001 Stage 4 A5 (walking every `.ts` under `packages/runtime/src/`) continues to pass.

### 3.6 Doctor (OQ-G)

Doctor splits into two capability groups; `$claude-setup` output groups probes by capability and shows which user-facing commands are usable.

**Plan 0001 delegate capability (unchanged)** — required for `$claude-delegate` to work. All Plan 0001 probes (`node-version`, `claude-binary`, `claude-version`, `claude-auth`, `claude-bg-flag`, `claude-agents-json`, `claude-logs`, `claude-daemon`, `transcript-path`, `codex-plugin-trust`, `companion-dir-writable`, `codex-version`).

**Plan 0002 follow-up injection capability (NEW)** — required for `$claude-followup` to work:

| Probe | Behavior | Pass/fail |
|---|---|---|
| `pty-build` | `require('node-pty').spawn('echo', ['ok'], {})` works | hard fail if missing |
| `claude-attach-help` | `claude attach --help` parseable | hard fail if missing |
| `claude-bg-no-prompt` | `claude --bg` no-prompt accepted (idle-session creation works) | hard fail if missing |
| `claude-agents-json` | already in Plan 0001 group, also required for follow-up | (Plan 0001 status) |
| `claude-logs` | already in Plan 0001 group, also required for follow-up | (Plan 0001 status) |
| `sidecar-jobs-dir` | `~/.claude/jobs/` exists + readable | **warn-only** (per OQ-B) |

`$claude-delegate` does NOT fail merely because PTY-related probes fail (Plan 0001 path stays available). `$claude-followup` fails fast if any required follow-up-capability probe fails, with an error message that points to `$claude-setup` and the specific failed probe.

### 3.7 PTY transport details (research Block B)

- `node-pty@1.1.0` is declared in `packages/driver-claude-code/package.json` `dependencies` (not `optionalDependencies` — the PTY surface is load-bearing).
- Native-build failure modes are surfaced by the `pty-build` doctor probe with an actionable message: try `npm rebuild node-pty`, or switch to `@homebridge/node-pty-prebuilt-multiarch@0.13.1` (prebuilt binaries, same API surface).
- Per-`shortId` file lock prevents concurrent attaches to the same session. Lock path: `<companionHome>/locks/attach-<shortId>.lock`. Concurrent attempts return a clear `EBUSY` error and ask the user to retry.
- Timeouts:
  - 5 seconds for the prompt to register (sidecar `tempo` leaves `idle` OR `agents --json` status flips off `idle`); if neither fires, the PTY write is treated as not-landed and the turn is marked `failed`.
  - 10 minutes (default; configurable via `SendOpts.timeoutMs`) for turn completion (sidecar `tempo: idle && inFlight.tasks: 0` OR `agents --json status: idle`).

### 3.8 Permission handoff (OQ-F, research Block D2)

When `send()`'s polling detects `status: waiting` (Plan 0001 normalization: `needs_input`), the dispatcher prints to stdout:

```
Claude is asking for permission inside session <shortId>.
Type your answer below; we will route it back into the session.
(To abort, press Ctrl+C; the session keeps running.)
> 
```

It reads one line from `process.stdin`, writes that line + `\r` into the attached PTY, and continues waiting for `tempo: idle` (or `agents --json status: idle`).

Non-TTY stdin handling: if `process.stdin.isTTY` is false, the dispatcher exits 1 with: *"Permission required, but this dispatcher is non-interactive. Run `claude attach <shortId>` in your own terminal to approve manually."*

5-minute warn-but-don't-act timeout: if `waiting` persists for more than 5 minutes with no new sidecar activity, the dispatcher emits a warning and exits 0 with the job left in `needs_input`. `$claude-status` will continue to show it; the user can resume via `claude attach <shortId>` manually.

No bypass flag is introduced. `--allow-edit` remains policy/UX only.

### 3.9 Privacy ack (OQ-E)

Ack model unchanged from Plan 0001: per-workspace, stored at `<companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json`.

Plan 0002 detail: when `$claude-followup --all <jobId>` resolves a job in a different workspace, the ack check is against the **target job's workspace**, not the caller's `cwd`. This prevents silent inheritance of an ack across workspaces.

No re-ack on every follow-up.

### 3.10 Orphan management (research Block E3)

`$claude-stop` gains two flags:

- `--all-awaiting-followup` — stops every job in the current workspace with status `awaiting_followup` (the new TTL-bounded reusable state).
- `--all-idle` — stops every job with status `awaiting_followup` OR `orphaned`.

Both flags are workspace-scoped by default; `--all` opts into cross-workspace (consistent with Plan 0001 Stage 4 A3 polish). Both flags refuse to stop jobs in `active` / `working` / `needs_input` — bulk stop never interrupts an in-flight turn.

### 3.11 Mock claude updates

- New `attach <shortId>` subcommand: emulates the PTY surface. Reads input from PTY stdin (handles `\r` as turn-submit and `0x1a` as detach). Writes scripted fixture responses to stdout. Updates the emulated sidecar between turn-start and turn-complete states.
- `claude --bg` with no prompt argument is supported: creates a session in `idle` state, prints the appropriate startup banner.
- Sidecar emulation: when `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME=<dir>` is set, the mock writes `<dir>/jobs/<shortId>/state.json` and `<dir>/jobs/<shortId>/timeline.jsonl` mirroring the real schema discovered in the research report (defensively-parsed: only the fields the production code reads are emitted).
- Permission-prompt simulation: fixture flag (`agentsJsonPermissionStall` or similar) triggers `waiting` during attach; the mock reads the permission answer from PTY stdin; resumes to `working`.

### 3.12 Manifest / skill

- New `packages/plugin-codex/skills/claude-followup/SKILL.md` mirrors Plan 0001's `claude-delegate` skill shape.
- **Frontmatter must pass `strictParseFrontmatter`** (the Plan 0001 Stage 4 5be9b9d follow-up test). The new skill's frontmatter is written from the start to avoid unquoted `: ` in scalar values.
- The skill body does NOT inject `--yes`. Privacy ack stays interactive by default for the workspaces where re-ack is required (per OQ-E).
- `.codex-plugin/plugin.json` `defaultPrompt` is extended with a `claude-followup`-flavored sentence (e.g. *"Send a follow-up instruction to a Claude job I started earlier."*).
- The plugin manifest test surface (`skills-manifest.test.mjs`) is extended to cover the new skill the same way Plan 0001 covered its five.

### 3.13 CI

- New CI workflow step **before** `npm test`: a PTY smoke check that runs `node -e "require('node-pty').spawn('echo', ['ok'], {}).onData(d => process.stdout.write(d))"` and asserts the substring `ok` appears on stdout within 5 seconds.
- New test lane `test:attach` distinct from `test:driver`. Contains PTY-dependent driver tests (the `attachAndSend` helper, lock contention, permission handoff). Locally, this lane is skippable if `node-pty` fails to build; in CI it must run (no silent skip).
- Matrix unchanged: `ubuntu-latest + macos-latest × Node 20 + 22`.
- Continues to use `permissions: contents: read` only, no secrets, no real Claude/Codex install.

### 3.14 Cost-claim discipline (continuing Plan 0001 OQ4)

Plan 0001's OQ4 forbidden-token discipline continues to apply verbatim. Plan 0002 introduces no new approved framing. The plugin README is extended to describe the `$claude-followup` flow; the cost paragraph is unchanged.

### 3.15 Baseline Claude Code version (OQ-H)

No semver pin. **Feature-probe baseline**. Plan 0002 supports any Claude Code version where the required probes (per § 3.6) pass.

Live-tested with **Claude Code 2.1.149**. Required features:

- `claude --bg`
- `claude attach <id>`
- `claude agents --json`
- `claude logs <id>`
- `claude stop <id>`
- Real-2.1.149-style `sessionId` / `shortId` derivation (`shortId = sessionId.replace(/-/g, '').slice(0, 8)`) OR a compatible equivalent

If a user's Claude Code version (older or newer than 2.1.149) passes all required probes, Plan 0002 supports it. The plugin README documents the live-tested version as a known-good reference, not a floor.

---

## 4. Tasks (with acceptance criteria)

In order. Each task has a checkbox + acceptance criteria. A task is not complete until its acceptance criterion is demonstrable in commit/PR review.

### T1. `node-pty` dependency + CI PTY smoke

- [ ] Add `node-pty@^1.1.0` to `packages/driver-claude-code/package.json` `dependencies`.
- [ ] Update `package-lock.json` via `npm install` from repo root.
- [ ] Add a CI workflow step before `npm test` that spawns `node -e "require('node-pty').spawn('echo', ['ok'], {}).onData(d => process.stdout.write(d))"` and asserts `ok` appears on stdout within 5 seconds.
- **Acceptance**: `npm ci` succeeds locally on `ubuntu-latest + macos-latest × Node 20 + 22`; CI PTY smoke step passes on all four matrix legs.

### T2. Doctor probes for follow-up capability

- [ ] Add probes to `packages/runtime/src/doctor.ts`: `pty-build`, `claude-attach-help`, `claude-bg-no-prompt`, `sidecar-jobs-dir`.
- [ ] `pty-build`, `claude-attach-help`, `claude-bg-no-prompt` are **hard-fail** for follow-up capability.
- [ ] `sidecar-jobs-dir` is **warn-only**.
- [ ] `runDoctor()` aggregates by capability group; the return shape distinguishes `delegateCapability: 'ok'|'warn'|'fail'` from `followupCapability: 'ok'|'warn'|'fail'`.
- [ ] `$claude-setup` output formats by capability group with a clear summary line of which user-facing commands are usable.
- **Acceptance**: against a mock environment with `node-pty` available, all four new probes pass and `followupCapability === 'ok'`; flipping the mock to disable `attach --help` turns `claude-attach-help` to `fail` and `followupCapability` to `fail` while `delegateCapability` stays `ok`.

### T3. Mock-claude: attach + sidecar + no-prompt --bg

- [ ] New `claude attach <shortId>` subcommand in `tools/mock-claude/claude`: emulates the PTY surface; reads PTY stdin; handles `\r` as turn-submit, `0x1a` as detach; writes scripted fixture responses.
- [ ] `claude --bg` no-prompt creates an idle session and prints the appropriate startup banner.
- [ ] Sidecar emulation: under `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME=<dir>`, write `<dir>/jobs/<shortId>/{state.json,timeline.jsonl}` mirroring the real schema's read-fields.
- [ ] Permission-prompt simulation: fixture flag triggers a `waiting` state during attach; mock reads the permission answer from PTY stdin; resumes to `working`.
- [ ] Update `tools/mock-claude/README.md` to document the new config flags and subcommands.
- **Acceptance**: 30+ new mock tests in `tools/mock-claude/test/` cover all scenarios; `PATH=tools/mock-claude:$PATH claude attach <id>` works correctly under `node-pty.spawn` in a smoke test from a temp HOME.

### T4. Driver: sidecar reader

- [ ] New module `packages/driver-claude-code/src/sidecar.ts` exporting `readSidecar(shortId, opts?): SidecarSnapshot | null` and `SidecarSnapshot` interface.
- [ ] Reads `~/.claude/jobs/<shortId>/state.json` (or `<mockHome>/jobs/<shortId>/state.json` under the mock-home env var) defensively; every field optional; missing file returns `null` (does NOT throw).
- [ ] Re-export from `packages/driver-claude-code/src/index.ts`.
- [ ] Never creates directories.
- **Acceptance**: reads a fixture sidecar (committed under `packages/driver-claude-code/test/fixtures/sidecar/`) matching real 2.1.149 schema; tolerates missing fields; tolerates absent file without throwing; covered by ≥ 10 driver tests.

### T5. Driver: `send()` public API + `attachAndSend` internal helper

- [ ] Add `send()` to the `Driver` interface in `packages/runtime/src/driver.ts` per § 3.2.
- [ ] Add `SendOpts`, `TurnHandle` types to `packages/runtime/src/driver.ts` (or `types.ts`).
- [ ] Implement `send()` in `ClaudeBackgroundDriver` (`packages/driver-claude-code/src/index.ts`) by delegating to a new internal helper in `packages/driver-claude-code/src/attach.ts` that uses `node-pty`.
- [ ] `attachAndSend` flow per § 3.2 (lock acquire → PTY spawn → drain → write text + `\r` → poll completion → write `0x1a` → release lock).
- [ ] Per-`shortId` file lock under `<companionHome>/locks/attach-<shortId>.lock` (BSD `flock`-style, same primitives as Plan 0001's job-store lock).
- [ ] PTY output drained into bounded ring buffer; never parsed for semantics.
- [ ] Timeouts per § 3.7 (5s prompt-register, 10min turn-complete default).
- [ ] All errors surface as `DriverError` with `operation: 'send' | 'attach'`.
- **Acceptance**: against mock-claude, `driver.send(session, { type: 'text', text: 'hello' })` returns a `TurnHandle` whose `finalMessage` matches the mock's scripted response; a second concurrent `send()` call on the same session blocks until the first completes (lock contention test); a `send()` with `{ timeoutMs: 100 }` against a slow-mock returns a `DriverError` with `operation: 'send'`.

### T6. Job schema v2 + lazy migration

- [ ] Bump `JobRecord.schemaVersion` to `2`.
- [ ] Add `turns: TurnRecord[]` (required, len ≥ 1) to `JobRecord` in `packages/runtime/src/types.ts`.
- [ ] Add `TurnRecord`, `TurnStatus` types.
- [ ] Add `JobStatus` value `awaiting_followup`.
- [ ] Implement lazy migration in `job-store.ts` `readJob` / `listJobs`: when `schemaVersion === 1`, synthesize `turns[0]` from existing `prompt` + `result` and write the migrated v2 record back atomically.
- [ ] Keep `prompt` and `result` on `JobRecord` as compat aliases of `turns[0].prompt` and `turns[turns.length-1].result`; mark them `// deprecated, use turns[]` and remove in a later plan.
- **Acceptance**: existing Plan 0001 dispatcher tests still pass (compat aliases hold); reading a synthetic v1 record produces a v2 record with `turns[0]` populated; writing a v2 record round-trips; lazy migration is covered by a dedicated test that writes a v1 file by hand and reads it back as v2.

### T7. Reconciler: context-aware status mapping

- [ ] Replace the Plan 0001 `STATUS_MAP` constant with a `mapStatus(driverValue, turnStatus, ttlElapsed, isOrphan): JobStatus` function in `packages/runtime/src/reconciler.ts`.
- [ ] Implement the mapping table from § 3.5.
- [ ] TTL configurable; default 30 minutes from `Math.max(latest event at, latest reconcile activity)`.
- [ ] Extend `ReconcilerAdapter` interface with optional `readSidecar?(ref): SidecarSnapshot | null`.
- [ ] The architectural-invariant test (every `.ts` under `packages/runtime/src/` contains none of `driver-claude-code`, `claude --bg`, `claude -p`, `node-pty`) continues to pass.
- **Acceptance**: reconciler tests cover (a) fresh turn → `awaiting_followup`; (b) 30 min later (via injected `now` clock) → `completed`; (c) follow-up injected (turn-status `injecting`) → `running`; (d) driver-`waiting` → `needs_input`; (e) sidecar absent → falls back to logs path; (f) static-content invariant still holds.

### T8. Dispatcher: `followup` subcommand

- [ ] New subcommand `node claude-companion.mjs followup <jobId-or-prefix> -- "<prompt>"` in `packages/plugin-codex/scripts/claude-companion.mjs`.
- [ ] Arg parser accepts `--all`, `--json`, `--yes`, `--allow-edit` only.
- [ ] Arg parser rejects `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name` at parse time with: `Error: --<flag> is a startup-only flag; use it with $claude-delegate, not $claude-followup.`
- [ ] Prefix resolution defaults to current workspace; `--all` opts into global (consistent with Plan 0001 A3).
- [ ] Refuses to inject if the target job's status is not in `{active, awaiting_followup, needs_input}`. Returns clear error pointing at `$claude-delegate` for `completed`/`stopped`/`failed`/`orphaned`.
- [ ] Privacy ack check against the **target job's workspace** (OQ-E); `--yes` bypass.
- [ ] On success, writes `turn.requested`, `turn.injected`, `turn.completed` (or `turn.failed`) to `<jobId>.events.jsonl`; appends a new `TurnRecord` to `JobRecord.turns`; reconciles once before printing.
- [ ] `$claude-status` is updated to render the new `awaiting_followup` status row with a footer hint about `$claude-followup`.
- **Acceptance**: new dispatcher tests cover all arg combinations including each rejected-flag error message verbatim; against mock-claude, `followup <prefix> -- "test"` correctly injects, returns, and stores the new turn; cross-workspace ack check is covered.

### T9. Skill + manifest

- [ ] New `packages/plugin-codex/skills/claude-followup/SKILL.md` mirroring Plan 0001's `claude-delegate` shape.
- [ ] Frontmatter passes `strictParseFrontmatter` (the Plan 0001 Stage 4 5be9b9d follow-up test) — no unquoted `: ` or `#` in scalar values.
- [ ] Body does NOT inject `--yes`.
- [ ] Update `.codex-plugin/plugin.json` `defaultPrompt` with a `claude-followup` example.
- [ ] Extend `packages/plugin-codex/test/skills-manifest.test.mjs` to cover the new skill identically to the existing five.
- **Acceptance**: all skill-manifest tests pass for the new skill (frontmatter strict-parse, dispatcher path resolution, no forbidden tokens, no hooks.json, no out-of-scope skills, default-prompt sentence present).

### T10. Permission-handoff loop

- [ ] Dispatcher detects `status: waiting` / `needs_input` during a `followup` poll (and also during `delegate`'s post-start initial reconcile, for symmetry).
- [ ] Prints the prompt block from § 3.8 to stdout.
- [ ] Reads one line from `process.stdin`; writes line + `\r` into the attached PTY.
- [ ] Non-TTY stdin (`process.stdin.isTTY === false`) → exit 1 with the message from § 3.8.
- [ ] 5-minute warn-but-don't-act timeout: emit a warning to stderr, exit 0, job left in `needs_input`.
- **Acceptance**: mock-driven test: mock triggers `waiting`; dispatcher prompts; test injects the answer via piped stdin (separate `spawnSync` test from a TTY-emulated parent); mock returns to `working`; final result extracted.

### T11. `$claude-stop` bulk-stop extensions

- [ ] Add `--all-awaiting-followup` flag.
- [ ] Add `--all-idle` flag.
- [ ] Both workspace-scoped by default; `--all` opts into cross-workspace (consistent with Plan 0001 A3).
- [ ] Both refuse to stop jobs in `active` / `working` / `needs_input`; emit a clear "skipped N active jobs" line in the output.
- [ ] Existing single-`<jobId>` `stop` path is unchanged.
- **Acceptance**: dispatcher tests cover the bulk-flag behavior including the active-not-stopped guard and the workspace scoping.

### T12. Privacy ack: target-job-workspace scoping for `--all`

- [ ] `$claude-followup --all <jobId>` ack check uses the **target job's** `workspace.root`, not the caller's `process.cwd()`.
- [ ] If no ack exists for the target workspace AND stdin is non-TTY AND `--yes` was not passed, exit 1 with the same Plan 0001 message but referencing the target workspace path.
- [ ] If stdin is TTY, prompt interactively as Plan 0001 does, then record the ack for the target workspace.
- **Acceptance**: dispatcher test: ack present for workspace A, not for B; running `followup --all <jobId-in-B>` from cwd A fails without `--yes`; running with `--yes` records ack against workspace B and proceeds.

### T13. Plugin README updates

- [ ] Add a "Follow-up injection" section to `packages/plugin-codex/README.md` documenting `$claude-followup` syntax, the new `awaiting_followup` status, the 30-minute TTL, and the workspace-scoped target-ack model.
- [ ] Add troubleshooting entries: PTY install failure (with the `npm rebuild node-pty` and `@homebridge/...` fallback); sidecar missing (informational); permission handoff under non-TTY (point at `claude attach <shortId>`).
- [ ] Update the "Known limitations" list — drop "No multi-turn reuse" and "No PTY attach"; add the new Plan-0002-aware limitations ("Plan 0002 may need a richer state model in a later plan"; "TTL is default-UX, not a hard cutoff").
- [ ] Cost paragraph unchanged.
- [ ] Extend `packages/plugin-codex/test/readme.test.mjs` to cover the new sections (no forbidden-token regressions; new section markers present).
- **Acceptance**: README test extensions pass; lint/typecheck/format/test all green; cost-claim discipline holds across all surfaces.

### T14. CI workflow updates

- [ ] Add PTY smoke step before `npm test` in `.github/workflows/ci.yml`.
- [ ] Add new `test:attach` lane invocation after the existing four lanes.
- [ ] Matrix unchanged.
- [ ] No secrets, no real Claude/Codex install — same posture as Plan 0001.
- **Acceptance**: green CI on `main` after the workflow change lands.

### T15. End-to-end live test

- [ ] In a throwaway temp repo with three TODOs (matching Plan 0001's E2E fixture for continuity), run the full flow:
  1. `$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."` → wait for `awaiting_followup` (or `completed` if reuse policy is off).
  2. `$claude-status` → expect `awaiting_followup` row + footer hint about `$claude-followup`.
  3. `$claude-followup <jobId> "Now sort the TODOs by file name and print the count."` → expect a new turn injected, sidecar `tempo: idle` after completion, the answer printed.
  4. `$claude-followup <jobId> "Finally, confirm you did not edit any files."` → expect a final turn injected and answered.
  5. `$claude-result <jobId>` → expect the latest turn's result printed.
  6. `$claude-stop <jobId>` → cleanup.
- [ ] Bonus: capture a permission-handoff flow if one organically arises during the live run.
- [ ] Capture sidecar `state.json` + `timeline.jsonl` snapshots (or diff against the prior turn's snapshots) at each transition.
- [ ] Artifact at `artifacts/e2e-live-<date>.txt`.
- **Acceptance**: full flow completes without manual intervention beyond running the skills and answering any permission prompts; final assistant message extracted; no orphan sessions left behind; live versions (Codex / Claude Code / Node) recorded in the artifact header.

---

## 5. Risks (filtered subset from research § 4)

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Sidecar schema (`~/.claude/jobs/<shortId>/state.json`) drift in a future 2.1.x release | M | H | Defensively parse unknown JSON; sidecar is best-effort (OQ-B); fall back to `agents --json` + `logs` |
| R2 | `node-pty` native build failure on user machine | M | M | `pty-build` doctor probe with actionable remediation message; document `@homebridge/node-pty-prebuilt-multiarch` fallback in plugin README |
| R3 | Concurrent `claude attach` to same `shortId` corrupts session | L | H | Per-`shortId` file lock under `<companionHome>/locks/attach-<shortId>.lock`; clear `EBUSY`-style error if held |
| R4 | Orphan accumulation from `awaiting_followup` jobs | H | M | 30-min TTL (OQ-A) + `$claude-stop --all-awaiting-followup` (T11) |
| R5 | Permission prompt missed → session stalls in `waiting` indefinitely | M | M | Sidecar + `agents --json` polls; 5-min warn-but-don't-act timeout; surface `claude attach` instructions |
| R6 | `claude stop` "couldn't confirm" false negative during supervisor restart | M | L | Re-verify via `agents --json` poll (Plan 0001 pattern); extend to bulk-stop (T11) |
| R7 | Codex 0.135.0 YAML strictness rejects the new `claude-followup` SKILL.md frontmatter | M | L | The existing `strictParseFrontmatter` test (Plan 0001 5be9b9d) catches this; write the new frontmatter to be safe from the start |
| R8 | Schema-v2 migration breaks existing Plan 0001 records | L | H | Lazy migration on read; explicit `schemaVersion === 1` check; dedicated unit test (T6) |
| R9 | macOS Sequoia hardened-runtime blocks `claude attach` under PTY | L | H | `pty-build` probe catches require-time failures; live `attach` smoke is maintainer-driven E2E (T15) |
| R10 | `Ctrl+Z` detach interacts oddly with outer tmux/screen | L | M | `IPty.write(0x1a)` writes to the PTY child end, not user's outer tty; document in plugin README troubleshooting |
| R11 | Sidecar `state.json` gone after `claude stop` → `linkScanPath` unavailable for post-stop result | M | L | Reconciler already has `claude logs` fallback (Plan 0001); no extra work |
| R12 | Multiple `$claude-followup` invocations against same session interleave answers | L | H | Per-`shortId` lock (same as R3); dispatcher refuses if lock held |

Full R1–R16 table lives in the research report. The Plan 0002 Stage 3 audit should re-check it for completeness.

---

## 6. Open questions — resolved 2026-05-31

All eight research open questions were answered by the maintainer on 2026-05-31. Decisions are recorded below for traceability and govern the implementation.

### OQ-A — Auto-`completed` TTL for `awaiting_followup` → resolved

**Decision**: **30 minutes** from the most recent observed idle / follow-up-complete activity timestamp.

After the 30-minute TTL, the job displays as `completed` in `$claude-status`. But an explicit `$claude-followup <jobId>` may still attempt to attach if the live Claude session still exists in `agents --json`. TTL controls **default UX/status reporting**, not a hard capability cutoff.

Plan 0002 may need a richer state model in a later plan; documented as a known limitation in § 8.

Reflected in §§ 3.4–3.5 and T7.

### OQ-B — Sidecar required vs best-effort → resolved

**Decision**: **best-effort**.

- Prefer `~/.claude/jobs/<shortId>/state.json` and `timeline.jsonl` when present.
- Fall back to `agents --json` + `logs` + transcript discovery when sidecar is absent.
- Doctor reports missing/unreadable sidecar as `warn`, never `fail`.

The undocumented sidecar is never a hard runtime requirement in Plan 0002.

Reflected in §§ 3.3, 3.6 and T2, T4.

### OQ-C — Plan 0002 vs 0002.5 split → resolved

**Decision**: keep Plan 0002 narrow as a follow-up-injection MVP. Do not split before drafting. If sidecar tailing or state modeling grows beyond MVP during implementation, split into Plan 0002.5 then.

Reflected in § 2 (scope-lock list).

### OQ-D — `$claude-followup` arg parity → resolved

**Decision**: not full `$claude-delegate` parity.

Accepted flags: `--all`, `--json`, `--yes`, `--allow-edit`.

Rejected at parse time with a clear error pointing at `$claude-delegate`: `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`.

Reason: those are startup-only flags. They apply when creating a Claude background session, not when injecting text into an existing one.

`--allow-edit` remains policy/prompt-intent only — it must NOT become a hidden permission bypass.

Reflected in §§ 3.1 and T8.

### OQ-E — Re-ack policy → resolved

**Decision**: same workspace acknowledgement model as Plan 0001, but for `--all` cross-workspace follow-up, the ack check is against the **target job's workspace**, not the caller's `cwd`.

No re-ack on every follow-up.

Reflected in §§ 3.9 and T12.

### OQ-F — Driver attach/send signature → resolved

**Decision**: do not expose raw PTY attach as the main public driver API. Add a driver-level follow-up/send API:

```ts
send(
  session: SessionHandle,
  input: { type: 'text'; text: string },
  opts?: SendOpts,
): Promise<TurnHandle>;

interface SendOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
  mode?: 'auto' | 'pty';
}
```

The Claude implementation may use an internal `attachAndSend(session, text, opts)` helper, but the runtime and plugin think in terms of "send follow-up input to an existing session" — not "own an interactive TUI".

`watch()` remains deferred; the `DriverNotImplementedError` marker is updated to "later plan (streaming AsyncIterable)".

Reflected in §§ 3.2 and T5.

### OQ-G — Doctor probes for Plan 0002 → resolved

**Decision**: add a Plan-0002-specific follow-up-readiness probe group, distinct from Plan 0001 delegate capability.

Hard fails for follow-up capability:

- `pty-build`
- `claude-attach-help`
- `claude-bg-no-prompt`
- `claude-agents-json` (already in Plan 0001 group, also required for follow-up)
- `claude-logs` (already in Plan 0001 group, also required for follow-up)

Warnings, not fails:

- `sidecar-jobs-dir`
- `claude-daemon` (Plan 0001 already warn-only)
- `claude-bg-flag` not advertised in `--help` (Plan 0001 already warn-only)

`$claude-delegate` does NOT fail if PTY-related probes fail (Plan 0001 path stays available). `$claude-followup` fails fast if PTY is unavailable.

Reflected in §§ 3.6 and T2.

### OQ-H — Baseline Claude Code version → resolved

**Decision**: no semver pin. **Feature-probe baseline**.

Live-tested with Claude Code 2.1.149. Plan 0002 support requires the features, not the version string:

- `claude --bg`
- `claude attach <id>`
- `claude agents --json`
- `claude logs <id>`
- `claude stop <id>`
- Real-2.1.149-style `sessionId` / `shortId` derivation OR compatible equivalent

If a user's Claude Code version (older or newer than 2.1.149) passes all required probes, Plan 0002 supports it. The plugin README documents the live-tested version as a known-good reference, not a floor.

Reflected in §§ 3.6 and 3.15.

---

## 7. Definition of done for Plan 0002

- [x] All eight research open questions resolved (2026-05-31). Plan transitions `planning` → `implementing` on Stage 1 approval.

Plan 0002 is ready to transition `implementing` → `auditing` when:

- All 15 tasks have their checkboxes ticked.
- CI is green on `main` for the matrix `ubuntu-latest + macos-latest × Node 20 + 22`.
- The artifact `artifacts/e2e-live-<date>.txt` exists and shows a real Codex session driving a real Claude Code background session through `delegate → status → followup → followup → result → stop` with no errors.
- `2-implement.md` is filled in.

Plan 0002 is `complete` when all five stages have substantive content and the readme status reads `complete`.

---

## 8. Things explicitly *not* decided in this plan

These belong in later plans. Listing them here so they don't get smuggled into Plan 0002:

- `$claude-review` / `$claude-adversarial-review` skills (Plan 0003).
- Benchmark workload, measurement procedure, and cost-claim copy update (Plan 0004).
- Stop-time review gate via hooks (Plan 0005).
- Marketplace listing, `.codex-marketplace` config, install-doc polish (Plan 0006).
- `watch()` AsyncIterable implementation. Deferred per OQ-F; the existing `DriverNotImplementedError` marker is updated to point at "later plan (streaming AsyncIterable)".
- Richer state model for `awaiting_followup` (a TTL is sufficient for Plan 0002; richer modeling may surface as Plan 0002.5 or later).
- Multi-OS support beyond macOS + Linux (Windows = post-v1).
- Telemetry (intentionally off; revisit only if there is a real need).
- Daemon-protocol IPC (the `~/.claude/daemon/dispatch/` + `peerProtocol: 1` surface hinted at by the research is **explicitly not** to be reverse-engineered; bypassing `claude attach` would be undocumented internal-API surface).
- TUI byte-stream parsing (the PTY exists to speak into the session; reading its output for semantic events is explicitly **not** in Plan 0002).
