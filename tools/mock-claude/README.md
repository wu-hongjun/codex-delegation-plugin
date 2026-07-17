# mock-claude

A deterministic stand-in for the real `claude` (Claude Code) CLI, used by `codex-delegation-plugin` tests so they never make network calls or touch the user's real Claude Code state.

## Contract

The executable lives at `tools/mock-claude/claude` and supports exactly the surface listed below. Real `claude` features outside this list are deliberately not implemented.

| Command | Behavior |
|---|---|
| `claude --version` | Prints `Claude Code <version>` from config; exits 0. |
| `claude auth status` | Prints `Logged in` (exit 0) when `authStatus = "authenticated"`; otherwise prints `Not logged in.` and exits 1. |
| `claude daemon status` | When `daemonAvailable = true`: prints `Claude daemon: running` (exit 0) / `Claude daemon: stopped` (exit 1) per `daemonStatus`. When `daemonAvailable = false` (default): writes `claude: 'daemon' is not a known command` to stderr and exits 1. |
| `claude --bg [--name NAME] [other flags] "<prompt>"` | Creates a mock background session, writes a starter transcript + log, persists state. Output format depends on `bgStdoutStyle`. Fails with exit 1 when `bgFails = true`. |
| `claude --bg --help` (plan 0002) | Prints `--bg` usage and exits 0 without starting a session, when `bgNoPromptAvailable = true` (default). Writes `claude: '--bg' does not accept '--help'` to stderr and exits 1 when `bgNoPromptAvailable = false`. |
| `claude agents --json` | Prints a JSON array of live sessions to stdout. Schema depends on `agentsJsonSchema`. Returns malformed JSON (exit 0) when `agentsJsonMalformed = true`. Writes `"agents error\n"` to stderr and exits 1 when `agentsJsonFails = true`. |
| `claude attach --help` (plan 0002) | Prints `Usage: claude attach <id>\n  Open the background session in this terminal. Detach with Ctrl+Z; the session keeps running.` and exits 0, when `attachHelpAvailable = true` (default). Writes `claude: 'attach' is not a known command` to stderr and exits 1 when `attachHelpAvailable = false`. |
| `claude attach <id>` (plan 0002) | Full PTY-attach emulation. Exits 1 with `unknown session: <id>; cannot attach` if the session is not found. Otherwise enters an interactive byte-reading loop: `Ctrl+Z` (`0x1a`) detaches immediately; `\r`/`\n` submits the accumulated buffer as a prompt; each other byte is appended to the buffer. Writes the scripted response (`attachResponse` with `${prompt}` substituted) to stdout and updates the sidecar. When `permissionStall = true`, the first submit transitions the sidecar to `waiting`, writes a permission prompt to stdout, then resumes on the next submit. See **Lifecycle transitions** below. |
| `claude logs <id>` | Streams the log file for the matching `shortId` or `sessionId`. Exits 1 on unknown id or when `logsFail = true`. |
| `claude stop <id>` | Marks the session `stopped`, appends a log line, writes the sidecar to `state: "stopped"`, exits 0. Exits 1 on unknown id. |

`claude --help` lists `--bg` only when `helpListsBg = true`.

Any other invocation prints a usage line to stderr and exits 2.

## State and configuration

Configured via two env vars:

- `CODEX_DELEGATION_MOCK_CLAUDE_HOME` — state directory. Tests MUST set this to an isolated temp path. Defaults to `${os.tmpdir()}/codex-delegation-plugin-mock-claude` for safety, never to `~/.claude`.
- `CODEX_DELEGATION_MOCK_CLAUDE_CONFIG` — optional path to a JSON config controlling fixture behavior. Merged onto the defaults below.

### Default config (real-2.1.149 mode)

```jsonc
{
  "version": "2.1.999-mock",
  "authStatus": "authenticated",       // or "unauthenticated"
  "bgFails": false,
  "agentsJsonMalformed": false,        // exit 0, stdout is unparseable JSON
  "agentsJsonFails": false,            // exit 1, stderr "agents error"
  "logsFail": false,
  "sleepMs": 0,

  // Schema mode: controls agents --json output shape and --bg stdout format.
  "agentsJsonSchema": "real-2.1.149",  // default: real Claude 2.1.149 shape
  "bgStdoutStyle": "backgrounded",     // default: "backgrounded · <shortId>" format
  "daemonAvailable": false,            // default: daemon subcommand absent (real mode)
  "helpListsBg": false,                // default: --help does not mention --bg (real mode)

  // Plan 0002 T2: doctor-probe targets for follow-up capability.
  "attachHelpAvailable": true,         // default: `claude attach --help` prints usage, exits 0
  "bgNoPromptAvailable": true,         // default: `claude --bg --help` prints usage, exits 0

  // Plan 0002 T3: PTY-attach emulation.
  "attachResponse": "[mock] Got: ${prompt}",  // response template; ${prompt} is substituted
  "permissionStall": false             // when true, first attach submit triggers waiting state
}
```

### Opt-in to legacy mock mode

To restore the pre-2.1.149 mock behavior (e.g., for tests that assert on `name`, `shortId`, `updatedAt` fields in agents JSON output):

```jsonc
{
  "agentsJsonSchema": "mock",
  "bgStdoutStyle": "started-session",
  "daemonAvailable": true,
  "helpListsBg": true
}
```

## Schema notes

### Real-2.1.149 mode (`agentsJsonSchema: "real-2.1.149"`)

`claude --bg` output:
```
Starting background service…
backgrounded · <shortId>
  claude agents             list sessions
  claude attach <shortId>   open in this terminal
  claude logs <shortId>     show recent output
```

Where `<shortId>` is the **first 8 hex characters** of a UUID-like `sessionId` (hyphens stripped). For example, `sessionId = "9d1558d0-a52e-43f9-a427-4b7d9ba8f4fa"` → `shortId = "9d1558d0"`.

`claude agents --json` entry shape:
```jsonc
{
  "pid": 12345,
  "cwd": "/path/to/project",
  "kind": "interactive",
  "startedAt": 1780019572999,
  "sessionId": "9d1558d0-a52e-43f9-a427-4b7d9ba8f4fa",
  "status": "idle"
}
```

No `id`, `shortId`, `name`, `updatedAt`, or `transcriptPath` fields. `startedAt` is a Unix epoch millisecond integer.

The parser (`parseAgentsJson`) derives the `shortId` from `sessionId` automatically so callers do not need to handle the missing field.

### Legacy mode (`agentsJsonSchema: "mock"`)

`claude --bg` output: `Started background session <shortId>` (6-hex shortId).

`claude agents --json` entry shape (all fields present):
```jsonc
{
  "id": "abc123",
  "shortId": "abc123",
  "sessionId": "session-abc123",
  "name": "bg-abc123",
  "cwd": "/path/to/project",
  "pid": 12345,
  "status": "working",
  "startedAt": "2026-05-30T10:00:00.000Z",
  "updatedAt": "2026-05-30T10:00:00.000Z",
  "transcriptPath": "/path/to/session-abc123.jsonl"
}
```

## State layout

Inside `CODEX_DELEGATION_MOCK_CLAUDE_HOME`:

```
<HOME>/
├── state.json            sessions array (one entry per `claude --bg`)
├── projects/
│   └── <sanitized-cwd>/
│       └── <sessionId>.jsonl    starter transcript
├── logs/
│   └── <shortId>.log
└── jobs/
    └── <shortId>/
        ├── state.json       sidecar: latest state (overwritten on each transition)
        └── timeline.jsonl   sidecar: append-only per-transition log
```

The internal `state.json` always stores all fields (`shortId`, `sessionId`, `name`, `cwd`, `pid`, `status`, `startedAt`, `updatedAt`, `transcriptPath`, `logPath`, `prompt`) regardless of schema mode. The schema mode only affects what `claude agents --json` outputs.

## Sidecar schema (Plan 0002 T3)

`<HOME>/jobs/<shortId>/state.json` shape (mirrors real Claude Code 2.1.149):

```jsonc
{
  "state": "idle" | "working" | "waiting" | "done" | "stopped",
  "tempo": "idle" | "active",
  "inFlight": { "tasks": 0|1, "queued": 0, "kinds": [] | ["permission"] },
  "output": { "result": "<latest assistant message>" },  // present after first turn
  "linkScanPath": "<absolute path to <HOME>/projects/<sanitized-cwd>/<sessionId>.jsonl>",
  "template": "bg",
  "intent": "<original prompt or empty string>",
  "name": "<sessionName>",
  "nameSource": "user",
  "sessionId": "<UUID>",
  "resumeSessionId": "<UUID>",
  "daemonShort": "<shortId>",
  "cliVersion": "<config.version>",
  "cwd": "<absolute path>",
  "backend": "daemon"
}
```

`<HOME>/jobs/<shortId>/timeline.jsonl` per-line shape:

```jsonc
{ "at": "<ISO timestamp>", "state": "<state value>", "detail": "<prose>", "text": "<only on done>" }
```

## Lifecycle transitions (Plan 0002 T3)

### Transition 1 — `cmdBg` with a prompt

The sidecar transitions `working → done` synchronously before the process exits. In-memory `state.sessions[].status` remains `"working"` (legacy compat).

1. `state.json`: `state: "working"`, `tempo: "active"`, `inFlight.tasks: 1`, `intent: <prompt>`.
   `timeline.jsonl` appends: `{ at, state: "working", detail: "starting turn" }`.
2. `state.json`: `state: "done"`, `tempo: "idle"`, `inFlight.tasks: 0`, `output.result: <response>`.
   `timeline.jsonl` appends: `{ at, state: "done", detail: "turn complete", text: <response> }`.

`<response>` is `config.attachResponse` with literal `${prompt}` substituted. Default: `"[mock] Got: ${prompt}"`.

### Transition 2 — `cmdBg` without a prompt (no-prompt invocation)

- `state.json`: `state: "idle"`, `tempo: "idle"`, `inFlight.tasks: 0`, `intent: ""`.
- `timeline.jsonl` appends: `{ at, state: "idle", detail: "session created (idle, awaiting prompt)" }`.

### Transition 3 — `cmdAttach <shortId>` (interactive, under node-pty)

1. Resolve session by `shortId`. If not found → exit 1 with stderr `unknown session: <id>; cannot attach`.
2. If `process.stdin.isTTY` → calls `process.stdin.setRawMode(true)`. Resumes stdin. Listens for `data`.
3. Maintains per-attach `buf` (string), `awaitingPermissionAnswer` (boolean, initially false), `firstTurn` (boolean, initially true).
4. On each byte:
   - `0x1a` (Ctrl+Z) → `process.exit(0)`. Session stays alive; no sidecar mutation.
   - `0x0d` or `0x0a` → submit: treat accumulated `buf` as prompt; clear `buf`; run submit flow.
   - Any other byte → append to `buf`.
5. Submit flow:
   - If `config.permissionStall === true` AND `firstTurn === true` AND `awaitingPermissionAnswer === false`:
     - `state.json` → `state: "waiting"`, `tempo: "idle"`, `inFlight.kinds: ["permission"]`.
     - `timeline.jsonl` appends: `{ state: "waiting", detail: "agent requested permission" }`.
     - Writes `"Permission required. Type your answer and press Enter:\r\n"` to stdout.
     - Sets `awaitingPermissionAnswer = true`. Returns; waits for next submit.
   - If `awaitingPermissionAnswer === true`:
     - Clears `awaitingPermissionAnswer = false`. Uses the remembered prompt. Falls through.
   - Process the turn:
     - `state.json` → `state: "working"`, `tempo: "active"`, `inFlight.tasks: 1`, `intent: <prompt>`.
     - `timeline.jsonl` appends: `{ state: "working", detail: "starting turn" }`.
     - Writes `<response> + "\r\n"` to stdout.
     - `state.json` → `state: "done"`, `tempo: "idle"`, `inFlight.tasks: 0`, `output.result: <response>`.
     - `timeline.jsonl` appends: `{ state: "done", detail: "turn complete", text: <response> }`.
     - Sets `firstTurn = false`.

### Transition 4 — `cmdStop <shortId>`

In addition to the existing legacy behavior (state.sessions update + log line + stdout):

- `state.json` → `state: "stopped"`, `tempo: "idle"`, `inFlight.tasks: 0`.
- `timeline.jsonl` appends: `{ at, state: "stopped", detail: "session stopped" }`.

## New config flags (Plan 0002 T3)

| Flag | Type | Default | Description |
|---|---|---|---|
| `attachResponse` | `string` | `"[mock] Got: ${prompt}"` | Response template for each turn. The literal substring `${prompt}` is replaced with the submitted prompt. Used by both `cmdAttach` and `cmdBg`. |
| `permissionStall` | `boolean` | `false` | When `true`, the FIRST submit under each attach transitions the sidecar to `waiting` with `inFlight.kinds: ["permission"]`, writes a permission prompt to stdout, then continues after the next one-line input. Subsequent turns under the same attach do NOT re-trigger the stall. |

## Review fixtures (Plan 0003 T9)

### Fixture files

Three fixture files live under `tools/mock-claude/fixtures/reviews/`:

| File | Purpose |
|---|---|
| `structured-review.txt` | Well-formed fenced-JSON review output. Parsed successfully by `review-parser.mjs` step 1 (fenced block). Used by default on the attach path. |
| `malformed-review.txt` | A fenced block containing invalid JSON. Forces the parser to fall back to a single `nit` finding. Must be opted into via config. |
| `adversarial-review.txt` | Well-formed fenced-JSON review output with findings written from an independent perspective. Used by default on the `--bg` path. |

### Detection heuristic

The mock inspects the submitted prompt to decide whether a review fixture should be returned instead of the normal `attachResponse` template:

- **Attach path** (`claude attach <id>`): if the prompt contains the substring `"You are acting as an independent code reviewer"` (unique to `SAME_SESSION_REVIEW_PROMPT`), the mock returns the attach review fixture instead of `attachResponse`.
- **`--bg` path** (`claude --bg <prompt>`): if the prompt contains the substring `"--- BEGIN REVIEWED OUTPUT ---"` (the data-delimiter unique to `ADVERSARIAL_REVIEW_PROMPT`), the mock returns the `--bg` review fixture instead of `attachResponse`.

Prompts that do not match either heuristic continue to use the existing `attachResponse`/`formatResponse` behavior — no regression on non-review paths.

### Config override

Add `reviewFixture` to the JSON config file to override the auto-selected fixture:

```jsonc
{
  "reviewFixture": "structured-review"   // or "malformed-review" or "adversarial-review"
}
```

| Value | Fixture loaded |
|---|---|
| `"structured-review"` | `fixtures/reviews/structured-review.txt` |
| `"malformed-review"` | `fixtures/reviews/malformed-review.txt` |
| `"adversarial-review"` | `fixtures/reviews/adversarial-review.txt` |
| `null` (default) | Auto-select: attach path → `structured-review`; `--bg` path → `adversarial-review` |

### Default behavior

| Path | No config override | With `reviewFixture` set |
|---|---|---|
| `claude attach <id>` — review prompt detected | `structured-review.txt` | Config value |
| `claude attach <id>` — non-review prompt | Normal `attachResponse` template | Normal `attachResponse` template |
| `claude --bg <prompt>` — review prompt detected | `adversarial-review.txt` | Config value |
| `claude --bg <prompt>` — non-review prompt | Normal `attachResponse` template | Normal `attachResponse` template |

The `malformed-review` fixture is opt-in only — it is never the auto-selected default.

### Sidecar behavior

On the review path the sidecar `output.result` contains the full fixture text (same as any other completed turn). The sidecar transitions `working → done` with `state: "done"`, `tempo: "idle"`, and `output.result` set to the fixture contents. This satisfies the reconciler's `sidecarSaysDone` guard which requires a non-empty `output.result` to signal completion.

## Running tests

```bash
node --test tools/mock-claude/test/*.test.mjs
```

or from the workspace root:

```bash
npm run test:mock
```

## Scope

This mock is a fixture, not a reimplementation. If a test needs new behavior (e.g. simulating `needs_input`, mid-turn cancellation, transcript tailing), extend the config and the relevant command — but keep the surface minimal. Anything that doesn't appear in the table above should not be implemented here.
