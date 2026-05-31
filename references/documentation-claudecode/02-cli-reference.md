# CLI Reference

Complete reference for Claude Code command-line interface, including commands and flags.

## CLI commands

You can start sessions, pipe content, resume conversations, and manage updates with these commands:

| Command | Description |
|---------|-------------|
| `claude` | Start an interactive session |
| `claude <prompt>` | Run a one-off task (equivalent to `claude -p "<prompt>"`) |
| `claude -p <prompt>` | Non-interactive mode; prints response and exits |
| `claude --continue` | Resume the most recent session |
| `claude --resume [name\|id]` | Resume a specific session by name or ID |
| `claude --from-pr <number>` | Resume session linked to a pull request |
| `claude -n <name>` | Start a new session with a specific name |
| `claude --fork-session` | Fork the current/resumed session into a new one |
| `claude --version` | Show version information |
| `claude --help` | Show help text |
| `claude mcp add [options] <name> <config>` | Add an MCP server |
| `claude mcp list` | List configured MCP servers |
| `claude mcp remove <name>` | Remove an MCP server |
| `claude mcp get <name>` | Get details for an MCP server |
| `claude mcp serve` | Start Claude Code as an MCP server |
| `claude auth login` | Log in to your Anthropic account |
| `claude auth logout` | Log out |
| `claude auth status` | Show authentication status |

## CLI flags

These flags customize behavior for a single session:

### Model & reasoning

| Flag | Default | Description |
|------|---------|-------------|
| `--model <model>` | From settings | Select Claude model (sonnet, opus, haiku, etc.) |
| `--effort <level>` | high | Reasoning effort: low, medium, high, xhigh, max |
| `--thinking <type>` | adaptive | Extended thinking: enabled, disabled, adaptive (Opus 4.7+) |

### Session management

| Flag | Default | Description |
|------|---------|-------------|
| `--continue` | false | Resume the most recent session in current directory |
| `--resume <id\|name>` | false | Resume specific session by ID or name |
| `--fork-session` | false | Fork a resumed session into a new ID |
| `--from-pr <number>` | false | Find and resume session linked to PR |
| `-n, --name <name>` | auto | Name the session |
| `--cwd <path>` | current | Set working directory |

### Tool permissions

| Flag | Default | Description |
|------|---------|-------------|
| `--allowedTools <list>` | none | Auto-approve comma-separated tools (e.g., "Read,Edit,Bash") |
| `--disallowedTools <list>` | none | Deny tools by name or pattern |
| `--permission-mode <mode>` | default | Mode: default, acceptEdits, plan, auto, dontAsk, bypassPermissions |
| `--no-sandbox` | false | Disable sandbox for Bash commands |

### Input/Output

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --print` | false | Non-interactive mode; prints response and exits |
| `--output-format <format>` | text | Format: text, json, stream-json |
| `--json-schema <schema>` | none | JSON Schema for structured output (with --output-format json) |
| `--verbose` | false | Show additional output including tool calls |
| `--include-partial-messages` | false | Include streaming events (with stream-json) |
| `--bare` | false | Skip auto-discovery of skills, hooks, MCP servers, CLAUDE.md |

### System prompt

| Flag | Default | Description |
|------|---------|-------------|
| `--append-system-prompt <text>` | none | Add text to system prompt |
| `--append-system-prompt-file <path>` | none | Append system prompt from file |
| `--system-prompt <text>` | default | Replace entire system prompt |
| `--system-prompt-file <path>` | none | Replace system prompt from file |

### Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--settings <path\|json>` | auto-load | Load settings from file or JSON |
| `--settings-sources <list>` | user,project,local | Which settings to load: user, project, local |
| `--mcp-config <path\|json>` | auto-load | Load MCP config from file or JSON |
| `--agents <json>` | none | Define subagents as JSON |
| `--add-dir <path>` | none | Add accessible directory (can be used multiple times) |
| `--plugins <path>` | none | Path to plugin directory or marketplace URL |

### Output & display

| Flag | Default | Description |
|------|---------|-------------|
| `--prompt-suggestions` | true | Enable/disable prompt suggestions |
| `--no-session-persistence` | false | Don't save session transcript to disk |
| `--max-turns <n>` | none | Stop after N agentic turns |
| `--max-budget-usd <amount>` | none | Stop when cost reaches this USD value |

### Advanced

| Flag | Default | Description |
|------|---------|-------------|
| `--init` | false | (In `-p` mode) Run initialization hooks only |
| `--maintenance` | false | (In `-p` mode) Run maintenance operations |
| `--no-verify-server` | false | Skip MCP server certificate verification (dev only) |
| `--teleport <url>` | none | Connect to a remote session |

## System prompt flags

When building the system prompt, these options control how the default is modified:

- **`--system-prompt <text>`**: Replace the entire system prompt with your text. This removes Claude Code's default instructions, so you must provide your own.
- **`--system-prompt-file <path>`**: Replace the system prompt with the contents of a file.
- **`--append-system-prompt <text>`**: Append your text to the default system prompt. Claude Code's core instructions remain.
- **`--append-system-prompt-file <path>`**: Append system prompt from a file to the default.

## Output formats

### Text (default)

Plain text response, suitable for piping to other tools.

### JSON

```bash
claude -p "What is 2+2?" --output-format json
```

Returns:

```json
{
  "type": "result",
  "result": "2 + 2 = 4",
  "session_id": "abc123...",
  "num_turns": 1,
  "total_cost_usd": 0.0012,
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "cache_read_tokens": 0,
    "cache_creation_tokens": 0
  }
}
```

### Stream JSON

```bash
claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages
```

Returns newline-delimited JSON for each event:
- `type: "stream_event"` with raw API events
- `type: "assistant"` for complete messages
- `type: "result"` for final output

## Environment variables

Key environment variables that affect CLI behavior:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for authentication |
| `CLAUDE_CONFIG_DIR` | Override default config directory (~/.claude) |
| `CLAUDE_PROJECT_DIR` | Hint to override project root detection |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Set to 1 to disable auto memory |
| `CLAUDE_CODE_SKIP_PROMPT_HISTORY` | Set to 1 to skip saving transcripts |
| `ENABLE_TOOL_SEARCH` | Control MCP tool search (true, auto, false) |
| `MAX_MCP_OUTPUT_TOKENS` | Limit MCP tool output size |
| `MCP_TIMEOUT` | Timeout for MCP server startup (milliseconds) |

