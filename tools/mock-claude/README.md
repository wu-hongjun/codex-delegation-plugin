# mock-claude

A deterministic stand-in for the real `claude` (Claude Code) CLI, used by `cc-plugin-codex` tests so they never make network calls or touch the user's real Claude Code state.

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
| `claude attach <id>` (plan 0002) | T2 stub: exits 1 with a "PTY emulation not implemented in mock-claude yet (plan 0002 T3)" message on stderr. Full PTY emulation lands in T3. |
| `claude logs <id>` | Streams the log file for the matching `shortId` or `sessionId`. Exits 1 on unknown id or when `logsFail = true`. |
| `claude stop <id>` | Marks the session `stopped`, appends a log line, exits 0. Exits 1 on unknown id. |

`claude --help` lists `--bg` only when `helpListsBg = true`.

Any other invocation prints a usage line to stderr and exits 2.

## State and configuration

Configured via two env vars:

- `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME` — state directory. Tests MUST set this to an isolated temp path. Defaults to `${os.tmpdir()}/cc-plugin-codex-mock-claude` for safety, never to `~/.claude`.
- `CC_PLUGIN_CODEX_MOCK_CLAUDE_CONFIG` — optional path to a JSON config controlling fixture behavior. Merged onto the defaults below.

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
  "bgNoPromptAvailable": true          // default: `claude --bg --help` prints usage, exits 0
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

Inside `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME`:

```
<HOME>/
├── state.json            sessions array (one entry per `claude --bg`)
├── projects/
│   └── <sanitized-cwd>/
│       └── <sessionId>.jsonl    starter transcript
└── logs/
    └── <shortId>.log
```

The internal `state.json` always stores all fields (`shortId`, `sessionId`, `name`, `cwd`, `pid`, `status`, `startedAt`, `updatedAt`, `transcriptPath`, `logPath`, `prompt`) regardless of schema mode. The schema mode only affects what `claude agents --json` outputs.

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
