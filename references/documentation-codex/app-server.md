---
source_url: https://developers.openai.com/codex/app-server
canonical_url: https://developers.openai.com/codex/app-server
title: Codex App Server (JSON-RPC)
fetched: 2026-05-30
relevance: highest
note: This JSON-RPC protocol is exactly how external clients (and a Claude-Code-style plugin) would drive Codex.
---

# Codex App Server

> Source: https://developers.openai.com/codex/app-server

The Codex app-server is a JSON-RPC 2.0 interface that powers rich client integrations: authentication, conversation history, approvals, and streamed agent events.

## Transports

- **stdio** (default) — newline-delimited JSON
- **WebSocket** (experimental) — `ws://IP:PORT`, optional auth
- **Unix socket** — WebSocket over a custom path
- **Off** — disabled local transport

WebSocket endpoints include health endpoints (`/readyz`, `/healthz`) and support **capability tokens** or **signed bearer tokens** for auth.

## Core abstractions

| Concept | Description |
|---|---|
| **Thread** | Conversation between user and agent across multiple turns |
| **Turn** | A single request plus the agent work that follows |
| **Item** | A unit of work — message, command run, file change, etc. |

## Initialization handshake

Client sends `initialize`, then acknowledges with `initialized`:

```json
{
  "method": "initialize",
  "id": 0,
  "params": {
    "clientInfo": {
      "name": "my_client",
      "title": "My Client",
      "version": "0.1.0"
    },
    "capabilities": {
      "experimentalApi": true
    }
  }
}
```

Suppress notifications with `optOutNotificationMethods` (exact method names).

## Thread API

### Start a thread

```json
{
  "method": "thread/start",
  "id": 10,
  "params": {
    "model": "gpt-5.4",
    "cwd": "/Users/me/project",
    "approvalPolicy": "never",
    "sandbox": "workspaceWrite",
    "personality": "friendly"
  }
}
```

### Resume a thread

```json
{
  "method": "thread/resume",
  "id": 11,
  "params": {
    "threadId": "thr_123",
    "personality": "friendly"
  }
}
```

### Fork a thread

`thread/fork` branches history into a new conversation id.

### List threads

`thread/list` — cursor-based pagination, filter by model provider, source kind, archive status, cwd, or search term.

## Turn API

### Start a turn

```json
{
  "method": "turn/start",
  "id": 30,
  "params": {
    "threadId": "thr_123",
    "input": [
      { "type": "text", "text": "Run tests" }
    ],
    "model": "gpt-5.4",
    "effort": "medium"
  }
}
```

Input item types: `text`, image, local image, skill.

### Steer an active turn

`turn/steer` — appends input to an in-flight turn without starting a new one.

### Interrupt

`turn/interrupt` — cancels active work.

## Sandbox policies

- `dangerFullAccess`
- `readOnly` — read-only filesystem, optional restricted roots
- `workspaceWrite` — write access to specified roots; optional restricted read access; `readOnlyAccess.includePlatformDefaults` on macOS uses Seatbelt defaults

## Models & features

### `model/list`

```json
{
  "method": "model/list",
  "id": 6,
  "params": { "limit": 20, "includeHidden": false }
}
```

Returns models with effort options, modalities, personality support, upgrade paths.

### `experimentalFeature/list`

Query feature flags + lifecycle metadata.

## Command execution

### Standalone exec

```json
{
  "method": "command/exec",
  "id": 50,
  "params": {
    "command": ["ls", "-la"],
    "cwd": "/Users/me/project",
    "sandboxPolicy": { "type": "workspaceWrite" }
  }
}
```

### `process/*` (experimental)

Explicit process spawning outside the sandbox. Requires `experimentalApi: true`.

## Approvals

Server requests decisions from the client for:

- **Command execution** — accept / decline / cancel / amend policy
- **File changes** — accept / decline / cancel

Each approval includes `threadId`, `turnId`, optional reasons, and available decision types.

## Skills

### `skills/list`

```json
{
  "method": "skills/list",
  "id": 25,
  "params": {
    "cwds": ["/Users/me/project"],
    "forceReload": true
  }
}
```

### Invoke a skill

Include `$<skill-name>` in text input and add a `skill` input item.

### Configure

`skills/config/write` — enable or disable by path.

## Apps (connectors)

### `app/list`

```json
{
  "method": "app/list",
  "id": 50,
  "params": { "limit": 50, "threadId": "thread-1" }
}
```

Returns accessibility, enablement, branding, metadata for each app.

### Invoke an app

Include `$<app-slug>` in text and add a `mention` input item with path `app://<id>`.

## Configuration

### Read

```json
{
  "method": "config/read",
  "id": 60,
  "params": { "includeLayers": false }
}
```

### Write

- `config/value/write` — single value
- `config/batchWrite` — atomic batch of values

## Authentication

### API key

```json
{
  "method": "account/login/start",
  "id": 2,
  "params": { "type": "apiKey", "apiKey": "sk-..." }
}
```

### ChatGPT browser flow

```json
{
  "method": "account/login/start",
  "id": 3,
  "params": { "type": "chatgpt" }
}
```

Returns authorization URL + `loginId`.

### Device code

```json
{
  "method": "account/login/start",
  "id": 4,
  "params": { "type": "chatgptDeviceCode" }
}
```

Returns verification URL + user code.

### External token (experimental)

Requires `experimentalApi: true`. Host supplies access tokens and account details.

## Notifications & events

### Turn events

- `turn/started`
- `turn/completed`
- `turn/diff/updated`
- `turn/plan/updated`

### Item events

- `item/started`
- `item/completed`

Common item types: user message, agent message, command execution, file change, MCP tool call, web search, review-mode transitions.

### Streamed deltas

Updates for agent messages, plans, reasoning, and command output.

## Filesystem

The v2 API uses absolute paths:

```json
{
  "method": "fs/watch",
  "id": 54,
  "params": {
    "watchId": "uuid",
    "path": "/Users/me/project/.git/HEAD"
  }
}
```

Emits `fs/changed` notifications.

## Errors

`codexErrorInfo` variants: `ContextWindowExceeded`, `UsageLimitExceeded`, `HttpConnectionFailed`, `SandboxError`, `ResponseStreamDisconnected`. An `httpStatusCode` field gives upstream HTTP status when available.

## Rate limits

```json
{
  "method": "account/rateLimits/read",
  "id": 6
}
```

Returns usage percentages, window durations, reset times (ChatGPT-based deployments).
