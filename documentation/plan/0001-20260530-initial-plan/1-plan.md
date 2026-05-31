# Stage 1 — Plan: Initial foundation

> **Status**: approved 2026-05-30 by maintainer; transitioning to `implementing`. All open questions resolved (§ 6).
> **Author**: Claude (assistant)
> **Date drafted**: 2026-05-30
> **Date approved**: 2026-05-30

---

## 1. Context & references

This plan operationalizes the design corrected by [`documentation/research/20260530-initial-research/report.md`](../../research/20260530-initial-research/report.md). The repo-level mission, design pillars, and v1 scope lock live in [`README.md`](../../../README.md).

**Read the research report before reading the rest of this plan.** Everything below assumes its findings, particularly:

- The primary transport is not "parse the Claude Code TUI byte stream." It is **`claude --bg` (background sessions) + `claude agents --json` (machine-readable state) + `~/.claude/projects/<project>/<session-id>.jsonl` (transcripts) + `claude logs` (fallback)**. PTY attach exists only for *prompt injection* and *human permission handoff*, not for parsing semantic events.
- `claude -p` is now demonstrably the wrong primary transport: starting **2026-06-15**, Anthropic accounts Agent SDK / `claude -p` usage on subscription plans against a *separate* monthly Agent SDK credit pool, distinct from interactive usage.
- The cost savings claim must be precise: cache reuse depends on stable model, effort, MCP config, cwd, git status, and prompt prefix. PTY by itself saves nothing.
- `node-pty` must be **optional**, not a required dependency of the happy path. Native build failure is the leading install-time killer for Node plugins.
- The pejmanjohn "installed-plugin hooks don't fire" claim is unverified against current Codex. Reproduce before designing around it.

These corrections override the README's earlier "PTY-driven, no-`claude -p`" framing where they conflict.

---

## 2. Scope of plan 0001

### In scope

A complete vertical slice that lets a Codex user, from inside an active Codex session in a real repo:

1. Run `$claude-setup` once and have it report green/yellow/red status for every dependency the plugin needs.
2. Run `$claude-delegate "<task description>"` and have it spawn a real Claude Code background session that works on the task.
3. Run `$claude-status` and see the live state of all delegated jobs in the current workspace.
4. Run `$claude-result <jobId>` and see the final assistant message + touched files + transcript / log paths.
5. Run `$claude-stop <jobId>` to halt a job cleanly.

This vertical slice does **not** include multi-turn prompt injection back into an existing background session. Each delegation creates a fresh `claude --bg` job. That is sufficient to prove the architecture and is consistent with the research report's recommendation 6 ("Implement `$claude-delegate` as start-only").

### Out of scope (deferred to later plans)

- **Multi-turn reuse via PTY attach.** Once a Claude session is running, sending follow-up prompts into it requires either PTY attach or experimental channels. Both are real risks. Deferred to plan 0002.
- **`$claude-review` / `$claude-adversarial-review`.** Useful UX but layers on top of `$claude-delegate`. Plan 0003.
- **Benchmark harness.** The cost claim cannot be honestly stated without measurement. Plan 0004 will compare `-p`, `-p --resume`, fresh-per-task background, and (if 0002 succeeds) reused-background.
- **Stop-time review gate / hook integration.** Plan 0005.
- **Marketplace packaging + distribution polish.** Plan 0006.

### Why this scope

It is the smallest end-to-end demonstration that the corrected architecture works. Every layer (manifest, skill, plugin script, job store, driver, reconciler, doctor) gets one real implementation. The expensive open questions (multi-turn, PTY, hooks) are postponed until after the foundation is real enough to test against.

---

## 3. Approach

### 3.1 Tech stack

- **Node.js + TypeScript** (matches both reference repos; gives a real `Driver` interface).
  - Target Node 20 LTS. Test on 22 LTS.
  - ESM modules (matches `openai/codex-plugin-cc` and `pejmanjohn/cc-plugin-codex`).
- **No mandatory native dependencies.** `node-pty` is **not** a v1 dependency; deferred to plan 0002 as an `optionalDependencies` entry with feature-flag fallback.
- **Package manager**: npm (lowest common denominator; `openai/codex-plugin-cc` and `openai/plugins` plugins all use npm).
- **Linting / formatting**: ESLint + Prettier, default-ish configs. No bike-shedding in this plan.
- **Test runner**: `node:test` (built-in, zero-dep) for unit tests; reserve heavier frameworks for plan 0002+ if needed.

### 3.2 Repo layout (the v1 commitment)

```
cc-plugin-codex/
├── README.md
├── package.json                          ← root, mostly a workspace coordinator
├── tsconfig.base.json
├── .eslintrc.cjs, .prettierrc, .gitignore, .editorconfig
├── packages/
│   ├── runtime/                          ← Driver interface, job store, reconciler, doctor primitives
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── driver.ts                 ← Driver interface + capability types
│   │   │   ├── events.ts                 ← DriverEvent union
│   │   │   ├── job-store.ts              ← read/write/lock job records
│   │   │   ├── reconciler.ts             ← cross-checks job store ↔ claude agents --json
│   │   │   ├── doctor.ts                 ← probe functions used by $claude-setup
│   │   │   ├── paths.ts                  ← ~/.codex/cc-plugin-codex/* path helpers
│   │   │   └── index.ts
│   │   └── test/
│   ├── driver-claude-code/               ← ClaudeBackgroundDriver
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  ← exports ClaudeBackgroundDriver
│   │   │   ├── background-session.ts     ← claude --bg lifecycle
│   │   │   ├── agents-json.ts            ← parse `claude agents --json`
│   │   │   ├── transcript.ts             ← read/tail ~/.claude/projects/*.jsonl
│   │   │   ├── logs.ts                   ← `claude logs <id>` fallback reader
│   │   │   ├── probe.ts                  ← version + feature detection
│   │   │   └── types.ts
│   │   └── test/
│   │       └── fixtures/                 ← recorded `agents --json` outputs, sample transcripts
│   └── plugin-codex/                     ← the user-facing Codex plugin
│       ├── .codex-plugin/
│       │   └── plugin.json               ← manifest
│       ├── skills/
│       │   ├── claude-setup/SKILL.md
│       │   ├── claude-delegate/SKILL.md
│       │   ├── claude-status/SKILL.md
│       │   ├── claude-result/SKILL.md
│       │   └── claude-stop/SKILL.md
│       ├── scripts/
│       │   ├── claude-companion.mjs      ← single entry point all skills call
│       │   └── lib/                      ← thin wrappers that import from runtime + driver
│       └── package.json
├── tools/
│   └── mock-claude/                      ← fake `claude` binary for tests (executable)
└── (existing) references/, documentation/, .omc/
```

Reasoning:
- Three packages, not one. The driver is replaceable; the runtime is the abstraction layer; the plugin is the Codex-facing surface. This is the v1 "design seam" the README commits to.
- `scripts/claude-companion.mjs` is the single executable each Codex skill shells out to with subcommands (`setup`, `delegate`, `status`, `result`, `stop`). This mirrors `pejmanjohn/cc-plugin-codex`'s pattern (which despite using `claude -p` got this dispatcher shape right) and `openai/codex-plugin-cc`'s pattern.
- `tools/mock-claude/` ships a fake `claude` binary that Stage 2 tests use to avoid hitting Anthropic in CI.

### 3.3 The `Driver` interface (v1 commitment)

Based on research § F1, adapted for the start-only scope:

```ts
// packages/runtime/src/driver.ts
export interface Driver {
  probe(): Promise<DriverCapabilities>;
  startSession(opts: StartSessionOpts): Promise<SessionHandle>;
  watch(target: SessionHandle | TurnHandle, opts?: WatchOpts): AsyncIterable<DriverEvent>;
  status(session: SessionHandle): Promise<SessionStatus>;
  stop(session: SessionHandle): Promise<void>;
  dispose(): Promise<void>;
}
```

**Deliberately not in v1 of the interface** (added by plan 0002 / 0003):
- `send(session, input)` — multi-turn prompt injection. Needs PTY attach or channels.
- `interrupt(turn)` — only meaningful with mid-turn cancel.
- `resume(sessionRef)` — needed when reusing a session across plugin invocations.
- `attach(session)` — explicit PTY handle.
- `logs(session)` — log streaming separate from event stream.

These are sketched in the type file as `// future:` comments so the interface evolution is visible.

`DriverCapabilities` is a typed map (research § F2), populated by `probe()`. v1 fields:

```ts
export interface DriverCapabilities {
  driverName: string;
  driverVersion: string;
  claudeVersion: string;
  backgroundSessions: boolean;
  agentsJson: boolean;
  logsCommand: boolean;
  transcriptPath: boolean;
  attach: false;                          // v1 always false; flipped in plan 0002
  structuredStream: "transcript" | "none";
  toolEvents: "transcript" | "none";
  permissions: "human-attach" | "none";
}
```

### 3.4 `DriverEvent` shape (v1 subset)

```ts
export type DriverEvent =
  | { type: "session.started"; sessionId: string; shortId: string; cwd: string; startedAt: string }
  | { type: "session.status"; status: SessionStatus }     // working | needs_input | idle | completed | failed | stopped
  | { type: "message.completed"; role: "assistant" | "user"; content: string; at: string }
  | { type: "tool.started"; tool: string; input?: unknown; at: string }
  | { type: "tool.completed"; tool: string; ok: boolean; resultPreview?: string; at: string }
  | { type: "file.changed"; path: string; op: "add" | "modify" | "delete"; at: string }
  | { type: "usage.updated"; cacheRead?: number; cacheCreate?: number; input?: number; output?: number; at: string }
  | { type: "session.completed"; sessionId: string; at: string }
  | { type: "session.stopped"; sessionId: string; reason: string; at: string }
  | { type: "error"; message: string; cause?: unknown; at: string };
```

No `message.delta` / token-stream events in v1. Background-session transcripts are line-buffered messages, not token deltas. This matches research § F1 ("DriverEvent should be turn-level rather than token-first").

### 3.5 Job store schema

Per research § G1, with v1 trimming:

**Layout:**
```
~/.codex/cc-plugin-codex/
├── jobs/
│   ├── <jobId>.json              ← record
│   ├── <jobId>.events.jsonl      ← append-only event log
│   ├── <jobId>.result.md         ← final assistant message + summary
│   └── <jobId>.lock              ← BSD flock for single-writer
├── logs/
│   └── companion-<date>.log
└── doctor.json                   ← last probe output
```

**Record fields (v1):**
```ts
interface JobRecord {
  jobId: string;                    // ulid; unique
  schemaVersion: 1;
  createdAt: string;                // ISO
  updatedAt: string;
  status: "queued" | "starting" | "running" | "completed" | "failed" | "stopped" | "orphaned";

  codex: {
    pluginVersion: string;
    cwd: string;
    sessionId?: string;             // if Codex exposes one; otherwise omit
  };
  workspace: {
    root: string;
    gitBranch?: string;
    gitHead?: string;
    gitDirtyHash?: string;          // sha256 of `git status --porcelain`
  };
  driver: {
    name: "claude-background";
    version: string;
    capabilitiesSnapshot: DriverCapabilities;
  };
  claude: {
    version: string;
    shortId: string;                // from `claude --bg` output
    sessionId?: string;             // long form, from `claude agents --json` after start
    sessionName: string;            // `codex:<repo>:<jobId>`
    pid?: number;
    cwd: string;
    transcriptPath?: string;
    logsCommand: string;            // e.g. `claude logs <shortId>`
  };
  prompt: {
    summary: string;                // first ~120 chars, for display
    sha256: string;
    bytesLen: number;
  };
  result?: {
    finalMessagePath: string;       // pointer to <jobId>.result.md
    finalMessagePreview: string;
    touchedFiles?: string[];
    usageSnapshot?: UsageSnapshot;
  };
  errors?: Array<{ at: string; message: string; cause?: string }>;
}
```

Fields like `usageSnapshots[]`, `agentsJsonSnapshot`, and `locks: { ownerPid, acquiredAt }` from the research full schema are deliberately out of v1 — they belong with the benchmark harness (plan 0004) and concurrency hardening (later).

### 3.6 Reconciliation

`reconciler.ts` exposes one function:

```ts
async function reconcile(jobId: string): Promise<JobRecord>;
```

It:
1. Reads the on-disk record.
2. Runs `claude agents --json` and matches by `sessionName` and/or `shortId`.
3. If the live session exists, updates `status`, `pid`, `sessionId`, `transcriptPath`.
4. If the live session is missing but the record is `running`, tries `claude logs <shortId>` — if log exists, status becomes `completed`; if not, `orphaned`.
5. Tail-reads `<jobId>.events.jsonl` for the most recent event timestamp; updates `updatedAt`.
6. Writes the updated record atomically.

`$claude-status` calls `reconcile` for every job in the workspace before printing.

### 3.7 `$claude-setup` / doctor

Sequential probes; each emits `{ name, status: "ok"|"warn"|"fail", detail }`:

| Probe | What it checks |
|---|---|
| `node-version` | `process.version` ≥ 20 |
| `codex-version` | `codex --version` reachable + parseable |
| `claude-binary` | `which claude` succeeds |
| `claude-version` | `claude --version` ≥ baseline (TBD; see open question #5) |
| `claude-auth` | `claude auth status` reports authenticated |
| `claude-bg-flag` | `claude --bg --help` mentions `--bg` (feature probe, not version check) |
| `claude-agents-json` | `claude agents --json` returns parseable JSON |
| `claude-logs` | `claude logs --help` shows usage |
| `claude-daemon` | `claude daemon status` succeeds |
| `transcript-path` | `~/.claude/projects/` exists and is a directory |
| `codex-plugin-trust` | reads `~/.codex/config.toml` and reports plugin enable/trust state |
| `companion-dir-writable` | `~/.codex/cc-plugin-codex/` can be created and written |

Output is human-readable in stdout and JSON-machine-readable at `~/.codex/cc-plugin-codex/doctor.json` (one snapshot, overwritten each run).

If any `fail`, `$claude-delegate` refuses to run with a pointer to `$claude-setup`. If only `warn`s, it proceeds with a one-line warning.

### 3.8 `$claude-delegate` flow

1. Parse args: positional prompt text, `--name`, `--model`, `--effort`, `--permission-mode` (optional; default = unset, see below), `--add-dir`, `--mcp-config`, `--allow-edit` (default OFF, see below).
2. Run minimal doctor check (subset: binary, auth, agents-json). If any fail, abort.
3. Generate `jobId` (ulid).
4. Compute workspace metadata (git branch/head/dirty hash).
5. Choose `sessionName`: `codex:<repo-basename>:<jobId-short>`.
6. Compose `claude --bg --name <sessionName> [optional flags] "<prompt>"`.
7. Spawn the command, capture stdout for the short ID and any startup metadata.
8. Persist initial `JobRecord` with status `starting`.
9. Reconcile once to pick up the long `sessionId` and `transcriptPath`.
10. Print a compact human summary + the `jobId` to stdout. Skill instruction tells Codex to surface this to the user.

Important: v1 explicitly does **not** stream events back into the Codex skill output. The skill is fire-and-forget. Streaming is what `$claude-status` does later.

**Permission posture (resolves OQ1).** The default is to pass **no** `--permission-mode` flag, so Claude Code uses its own default permission behavior. No bypass flags (`--dangerously-skip-permissions` etc.) are ever passed by the plugin. If Claude needs approval mid-session, the job will move to `needs_input`; `$claude-status` shows this and prints the `claude attach <id>` command so the user can approve manually. The user may pass `--permission-mode` explicitly to override.

**`--allow-edit` (resolves OQ2) is a policy/UX flag, NOT a filesystem sandbox.** When OFF (default), the plugin frames the user's prompt for Claude in a read-only/review-oriented way (e.g. prepends "Inspect, reason, and propose changes — do not write to files" to the prompt). When ON, it removes that framing. The actual enforcement boundary is Claude Code's permission system and the user's workspace trust settings — not the plugin. The doctor output and `$claude-setup` copy must say this explicitly so users do not mistake `--allow-edit OFF` for hard sandboxing.

### 3.9 `$claude-status` flow

1. Enumerate all jobs in the current workspace (filter by `workspace.root`).
2. `reconcile()` each.
3. Print: jobId, status, elapsed, current phase (from latest event), last touched file, last assistant-message preview (≤ 120 chars), `logsCommand` for drill-in.
4. Support `--all` to include jobs outside the current workspace.
5. Support `--watch` to repeat every 2s until interrupted (uses `setInterval` + `console.log`, not a TUI redraw).

### 3.10 `$claude-result` flow

1. Look up job by id (or short prefix).
2. If status is `running` / `starting`, exit non-zero with a message pointing to `$claude-status`.
3. If `completed` / `failed` / `stopped`, print:
   - Final assistant message (from `<jobId>.result.md`)
   - Touched files
   - Pointers to `transcriptPath` and `logsCommand`
   - Usage snapshot (cache read / cache create tokens) if available
4. `--json` flag for machine-readable output.

### 3.11 `$claude-stop` flow

1. Look up job.
2. Run `claude stop <shortId>`.
3. Update job record to `stopped`.

### 3.12 Skill `SKILL.md` shape

Skills are instructions to Codex, per research § C1. They tell Codex how to call `claude-companion.mjs`. Pattern (lifted from `pejmanjohn/cc-plugin-codex/claude/skills/claude-review/SKILL.md` since the dispatcher shape is correct even though its transport is wrong):

```markdown
---
name: claude-delegate
description: Delegate a coding task to Claude Code as a background sub-agent.
---

You are the thin skill wrapper for the cc-plugin-codex companion.

1. Treat the remaining user text after the skill mention as the task prompt.
2. Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file.
3. Run `node <plugin-root>/scripts/claude-companion.mjs delegate -- "<task prompt>"` with any user-provided flags forwarded after `--`.
4. Return stdout verbatim.
```

Five such SKILL.md files: `claude-setup`, `claude-delegate`, `claude-status`, `claude-result`, `claude-stop`.

### 3.13 Manifest

`packages/plugin-codex/.codex-plugin/plugin.json`:

```jsonc
{
  "name": "claude-companion",
  "version": "0.1.0",
  "description": "Codex-native Claude Code background-session driver.",
  "author": { "name": "Hongjun Wu", "url": "https://github.com/wu-hongjun" },
  "skills": "./skills/",
  "interface": {
    "displayName": "Claude Companion",
    "category": "Coding",
    "capabilities": ["Interactive"],
    "defaultPrompt": [
      "Delegate a task to Claude Code.",
      "Check the status of my Claude jobs.",
      "Show me the result of my last Claude job."
    ],
    "brandColor": "#D97706"
  }
}
```

Schema details pinned to `openai/plugins` examples (e.g. `references/codex-plugins-examples/plugins/notion/.codex-plugin/plugin.json`).

No `hooks.json` in v1 — hooks are plan 0005.

### 3.14 Cost-claim and disclosure copy rules

Until plan 0004 (benchmark harness) produces measurements, **no user-facing surface** — README, plugin description, manifest fields, skill descriptions, `$claude-setup` output, error messages, marketing — may claim cost savings.

**Allowed wording** (or close paraphrase):
> "This plugin delegates work to Claude Code through background sessions (`claude --bg`) rather than `claude -p`. It is designed to preserve the architecture needed for session/cache reuse, but savings have not yet been benchmarked."

**Disallowed wording** (any of these is a finding in audit):
- "saves money"
- "reduces cost by using prompt caching"
- "cheaper than `claude -p`"
- "preserves prompt-cache savings"
- "avoids the `claude -p` cost tax"
- "more efficient than `claude -p`"
- any quantitative claim ("saves N%", "Nx cheaper", etc.)

When plan 0004 produces real numbers, this rule is relaxed and copy can be updated. Until then, the architectural framing is the headline: **native background sessions, not `claude -p`** — *why* that's better is a hypothesis pending measurement.

This rule applies to plan 0001 only; it pre-empties an audit-stage finding by making the constraint explicit at planning time.

### 3.15 Mock Claude binary

`tools/mock-claude/mock-claude` (executable). A small Node script that implements just enough of the surface for tests:

- `claude --version` → prints a configurable version
- `claude auth status` → prints a configurable status
- `claude --bg "<prompt>"` → prints a fake short ID, forks itself into a "background" sleep
- `claude agents --json` → returns a fake JSON snapshot
- `claude logs <id>` → prints lines from a fixture file
- `claude stop <id>` → exits 0

The test runner places `tools/mock-claude/` on `PATH` so the real driver code thinks it's talking to a real `claude`.

---

## 4. Tasks (with acceptance criteria)

In order. Each task has a checkbox + acceptance criteria. A task is not complete until its acceptance criterion is demonstrable in commit/PR review.

### T1. Repo scaffolding
- [ ] Initialize root `package.json` as private workspace; add `packages/runtime`, `packages/driver-claude-code`, `packages/plugin-codex`.
- [ ] `tsconfig.base.json` with strict mode on; per-package `tsconfig.json` extends it.
- [ ] `.eslintrc.cjs` (typescript-eslint, recommended), `.prettierrc`, `.editorconfig`.
- [ ] `.gitignore` updated for `node_modules/`, `dist/`, `*.tsbuildinfo`.
- [ ] `npm install` at root succeeds with no warnings about peer deps for v1 deps.
- **Acceptance**: `npm run lint && npm run typecheck` passes on empty `src/index.ts` in all three packages.

### T2. Mock `claude` binary
- [ ] `tools/mock-claude/mock-claude` script + tiny config-file mechanism.
- [ ] Implements `--version`, `auth status`, `--bg`, `agents --json`, `logs`, `stop`, `daemon status`.
- [ ] Fixture directory under `tools/mock-claude/fixtures/` for scripted scenarios.
- **Acceptance**: `PATH=tools/mock-claude:$PATH claude --version` returns the configured version; `claude --bg "hi"` returns a short ID; `claude agents --json` returns a parseable array including that ID.

### T3. Runtime: paths + job-store primitives
- [ ] `paths.ts`: constants for `~/.codex/cc-plugin-codex/{jobs,logs,doctor.json}`, with override env var `CC_PLUGIN_CODEX_HOME` for tests.
- [ ] `job-store.ts`: `createJob`, `readJob`, `updateJob`, `listJobsForWorkspace`, `appendEvent`. All writes atomic (write-temp-then-rename). BSD `flock` for single-writer.
- [ ] Tests: round-trip a job record; concurrent-write rejection; empty store enumeration; corrupt-record recovery (warn + skip).
- **Acceptance**: `node --test packages/runtime/test/job-store.test.ts` passes.

### T4. Runtime: doctor probes
- [ ] `doctor.ts`: one async function per probe in the table at § 3.7.
- [ ] Each probe returns `{ name, status: "ok"|"warn"|"fail", detail, evidence? }`.
- [ ] `runDoctor()` runs them sequentially, writes JSON snapshot to `doctor.json`, returns aggregate.
- [ ] Tests use the mock claude.
- **Acceptance**: against mock-claude, `runDoctor()` returns all `ok`; flipping the mock's auth fixture to "unauthenticated" turns `claude-auth` into `fail` and that propagates to the aggregate.

### T5. Driver: probe + types
- [ ] `driver.ts`, `events.ts`, `types.ts` per § 3.3–3.4.
- [ ] `ClaudeBackgroundDriver.probe()` calls runtime doctor + version parsing, returns `DriverCapabilities`.
- **Acceptance**: probe against mock-claude returns populated capabilities; against missing claude returns `{ backgroundSessions: false, ... }` without throwing.

### T6. Driver: `startSession`
- [ ] `background-session.ts`: spawn `claude --bg --name <name> "<prompt>"`, parse stdout for short ID + initial metadata.
- [ ] On spawn failure → throw a typed `DriverError` with stderr captured.
- [ ] Returns `SessionHandle` containing `{ shortId, sessionName, startedAt }`.
- **Acceptance**: against mock-claude, `startSession({ prompt: "hello" })` returns a `SessionHandle` whose `shortId` matches what mock emits.

### T7. Driver: `agents --json` parsing + `status`
- [ ] `agents-json.ts`: typed parser for the JSON array. Tolerant of extra/missing fields; logs warnings on unknown fields.
- [ ] `status(session)` returns the matching entry as `SessionStatus`.
- [ ] Tests use recorded fixtures from running real Claude Code in a sandbox (collected during T2 fixture work).
- **Acceptance**: parser correctly identifies a session by `sessionName` and reports its status; missing session returns `"orphaned"`.

### T8. Driver: transcript + logs readers
- [ ] `transcript.ts`: locate `<sessionId>.jsonl` under `~/.claude/projects/<sanitized-cwd>/`, parse JSONL into `DriverEvent[]`. Read-only, no tailing in v1.
- [ ] `logs.ts`: run `claude logs <shortId>`, return as string.
- [ ] Both surface gracefully when the file/command is unavailable.
- **Acceptance**: given a fixture transcript with mixed message/tool/metadata records, the parser emits a correctly-typed event sequence; unknown record types are mapped to an `error` event with the raw payload preserved.

### T9. Runtime: reconciler
- [ ] `reconciler.ts` per § 3.6.
- [ ] Idempotent: running it twice on a settled job produces the same record.
- **Acceptance**: simulate (via mock-claude) a job that starts, runs, and completes; reconcile after each phase shows correct status transitions.

### T10. Plugin entry: `claude-companion.mjs` dispatcher
- [ ] CLI dispatcher with subcommands: `setup`, `delegate`, `status`, `result`, `stop`.
- [ ] Each subcommand a thin wrapper calling runtime + driver. No business logic in the dispatcher.
- [ ] Pretty-printer for human stdout; `--json` flag everywhere for machine output.
- **Acceptance**: `node packages/plugin-codex/scripts/claude-companion.mjs setup` runs and prints the doctor table; `delegate -- "hello"` (against mock-claude) creates a job and prints its id.

### T11. Skills + manifest
- [ ] Five `SKILL.md` files per § 3.12.
- [ ] `plugin.json` per § 3.13.
- [ ] Manual smoke test: install the plugin locally into a real Codex install, run each skill from inside Codex, verify dispatcher is invoked correctly.
- **Acceptance**: from a real Codex session, `$claude-setup`, `$claude-delegate "list TODOs in this repo"`, `$claude-status`, `$claude-result <id>`, `$claude-stop <id>` each produce sensible output. (This is the first task that touches real Codex + real Claude, so it surfaces real-world bugs.)

### T12. End-to-end live test
- [ ] On a single throwaway repo, run the full flow: setup → delegate → status until completed → result → stop a fresh job. Capture stdout to `artifacts/e2e-live-<date>.txt`.
- **Acceptance**: full flow completes without manual intervention beyond running the skills.

### T13. README of the plugin package
- [ ] `packages/plugin-codex/README.md`: install instructions, the five skills, expected behavior, known limitations (no multi-turn reuse yet, no review skills yet, no hooks yet).
- **Acceptance**: a new contributor can follow it from clone to working `$claude-delegate`.

### T14. CI
- [ ] GitHub Actions workflow: `lint`, `typecheck`, `test`, on push and PR.
- [ ] Matrix: macOS-latest + ubuntu-latest × node 20 + node 22. (No Windows in v1 per research § H2.)
- [ ] No live Anthropic calls in CI.
- **Acceptance**: green CI on `main`.

---

## 5. Risks (filtered subset from research)

| # | Risk | Likelihood | Impact | Mitigation in v1 |
|---|---|---|---|---|
| R1 | `claude agents --json` schema changes between versions | medium | high | Tolerant parser; capture raw payload in events; version-probe on every run |
| R2 | Transcript file path naming changes | medium | high | Fall back to `claude logs <id>` when transcript not found; report `structuredStream: "none"` |
| R3 | Maintainer's Claude Code version is older than the `--bg` baseline | high | medium | Doctor fails loudly with upgrade instructions; do not silently `-p`-fallback in v1 |
| R4 | Privacy / data-leak: user delegates a private repo without realizing | high | high | `$claude-delegate` prints a one-line "this sends `<cwd>` content to Anthropic via your Claude Code account; continue? [y/N]" on first run per workspace; recorded in job store |
| R5 | Orphaned background sessions accumulate quota | medium | medium | `$claude-status --all --orphans` discovers + offers `--stop-all`; this lands in v1 |
| R6 | Codex plugin install UX is rough on first try | medium | low | `$claude-setup` is the first thing users run; output is human-friendly; no native deps required |
| R7 | Two Codex sessions in the same workspace clobber each other's job records | medium | medium | jobIds are ulids; per-job lock; status command filters by `workspace.root` not by session |
| R8 | The benchmark claim ("saves cost vs. -p") is unverified | high | medium | Plan 0001 does not make the claim. The README's claim is downgraded to "designed to enable session/cache reuse"; benchmark is plan 0004 |
| R9 | Real Claude Code outputs format that the fixture-based tests don't cover | high | medium | Stage 2 T11/T12 require live smoke tests; fixtures get updated from those runs |
| R10 | Codex skill ↔ dispatcher contract is misunderstood | medium | medium | T11 is explicitly a real-Codex test before T12; if it fails, replan rather than push through |

R1–R3 are the load-bearing risks. R4 is the load-bearing user-facing risk. The rest are operational.

---

## 6. Open questions — resolved 2026-05-30

All six open questions were answered by the maintainer on 2026-05-30. Decisions are recorded below for traceability and govern the implementation.

### OQ1 — Permission posture default → **resolved**

**Decision**: use Claude Code's **default** permission behavior. Do not pass any `--permission-mode` flag. Do not pass any bypass flag. If Claude needs approval mid-session, the job moves to `needs_input` and `$claude-status` prints the `claude attach <id>` command for manual approval.

Reflected in § 3.8 ("Permission posture").

### OQ2 — File-modification policy → **resolved**

**Decision**: `--allow-edit` flag on `$claude-delegate`, default **OFF**. When OFF, the plugin frames the prompt for Claude in a read-only/review-oriented way. When ON, that framing is removed. **`--allow-edit` is a policy/UX flag, not a filesystem sandbox** — the real safety boundary is Claude Code's permission system + the user's workspace trust settings. This must be stated explicitly in `$claude-setup` output, `$claude-delegate --help`, and `packages/plugin-codex/README.md`.

Reflected in § 3.8 ("`--allow-edit` is a policy/UX flag, NOT a filesystem sandbox").

### OQ3 — Session-per-job vs. companion-session reuse → **resolved**

**Decision**: **session-per-job** for plan 0001. Every `$claude-delegate` invocation creates one fresh `claude --bg` job. No companion-session reuse, no PTY attach, no follow-up prompt injection, no multi-turn reuse in this plan. Companion-session reuse moves to plan 0002.

Reflected throughout § 2 and § 3.

### OQ4 — Cost-claim language → **resolved**

**Decision**: until plan 0004 produces benchmark data, no user-facing surface (README, plugin description, manifest, skill descriptions, doctor output, error messages, marketing) may claim cost savings. The conservative wording in § 3.14 is the only allowed copy. Disallowed phrasings are enumerated explicitly so audit can catch them.

Reflected in new § 3.14 ("Cost-claim and disclosure copy rules"). Also requires trimming the root `README.md`.

### OQ5 — Minimum Claude Code version baseline → **resolved (revised)**

The original recommendation ("pin to whatever version the maintainer is running on 2026-05-30") was correctly rejected by the maintainer as non-reproducible.

**Decision**: use a **feature-probe baseline**, not a semver pin. A Claude Code version is supported if and only if it passes all required probes:
- `claude --bg` works
- `claude agents --json` returns parseable JSON
- `claude logs <id>` works
- `claude daemon status` works
- Transcript directory behavior is detectable, OR `claude logs` fallback works

The doctor (§ 3.7) fails hard if any required probe fails, regardless of semver. During implementation (T11/T12), the live `claude --version` used for the e2e artifact is recorded in `2-implement.md` and in `artifacts/e2e-live-<date>.txt`. A concrete minimum semver can be pinned later, after live testing confirms the actual floor.

Reflected in § 3.7 (the doctor probes are already feature-probes, not version checks) and the doctor table is the source of truth.

### OQ6 — Distribution model → **resolved**

**Decision**: **local-path install only** for plan 0001. The v1 install/smoke-test instructions assume a checked-out repo + a local Codex plugin install path. Marketplace polish (`.codex-marketplace` config, listing, publishing) is deferred to plan 0006.

Reflected in T11 and T13.

---

## 7. Definition of done for plan 0001

- [x] All six open questions resolved (2026-05-30). Plan transitioned `planning` → `implementing`.

Plan 0001 is ready to transition `implementing` → `auditing` when:
- All 14 tasks have their checkboxes ticked.
- CI is green on `main`.
- The artifact `artifacts/e2e-live-<date>.txt` exists and shows a real Codex session driving a real Claude Code background session through delegate → status → result → stop with no errors.
- `2-implement.md` is filled in.

Plan 0001 is `complete` when all five stages have substantive content and the readme status reads `complete`.

---

## 8. Things explicitly *not* decided in this plan

These belong in later plans. Listing them here so they don't get smuggled into plan 0001:

- The exact PTY-attach implementation (plan 0002).
- Whether to support experimental Claude Code channels (plan 0002 or 0003).
- `$claude-review` content prompting / system-message engineering (plan 0003).
- Benchmark workload + measurement procedure (plan 0004).
- Stop-time review-gate UX + hook trust UX (plan 0005).
- Marketplace listing, `.codex-marketplace` config, install-doc polish (plan 0006).
- Multi-OS support beyond macOS + Linux (Windows = post-v1).
- Bun support.
- Telemetry (intentionally off in v1; revisit only if there's a real need).
