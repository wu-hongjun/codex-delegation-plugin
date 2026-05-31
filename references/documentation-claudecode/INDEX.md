# Claude Code Documentation Index

This directory contains a comprehensive offline snapshot of the Claude Code documentation as of May 2026. These documents are organized by topic and provide complete reference information for building tools that drive Claude Code as a sub-agent.

## Core Documentation

| File | Source | Description |
|------|--------|-------------|
| `01-overview.md` | https://code.claude.com/docs/en/overview | Overview of Claude Code, installation methods, and key capabilities |
| `02-cli-reference.md` | https://code.claude.com/docs/en/cli-reference | Complete CLI command reference with all flags and options |
| `03-interactive-mode.md` | https://code.claude.com/docs/en/interactive-mode | Keyboard shortcuts, commands, vim mode, task lists, and interactive features |
| `04-how-claude-code-works.md` | https://code.claude.com/docs/en/how-claude-code-works | Architecture, agentic loop, tools, sessions, context management |
| `05-sessions.md` | https://code.claude.com/docs/en/sessions | Session management, resume, branch, naming, transcript storage |

## Configuration & Settings

| File | Source | Description |
|------|--------|-------------|
| `06-settings.md` | https://code.claude.com/docs/en/settings | Configuration scopes, settings files, precedence, all available settings |
| `07-memory.md` | https://code.claude.com/docs/en/memory | CLAUDE.md files, auto memory, rules organization, memory persistence |
| `08-permissions.md` | https://code.claude.com/docs/en/permissions | Permission modes, rules, tool-specific patterns, managed settings |

## Hooks & Automation

| File | Source | Description |
|------|--------|-------------|
| `09-hooks-reference.md` | https://code.claude.com/docs/en/hooks | Complete hook reference with all events, schemas, input/output formats |
| `10-hooks-guide.md` | https://code.claude.com/docs/en/hooks-guide | Practical guide to hooks, use cases, examples |

## Commands & Extensions

| File | Source | Description |
|------|--------|-------------|
| `11-commands.md` | https://code.claude.com/docs/en/commands | Complete command reference for built-in and custom commands |
| `12-sub-agents.md` | https://code.claude.com/docs/en/sub-agents | Custom subagent creation, configuration, delegation patterns |

## Tools & Integrations

| File | Source | Description |
|------|--------|-------------|
| `13-mcp.md` | https://code.claude.com/docs/en/mcp | Model Context Protocol integration, server configuration, examples |

## Agent SDK (Python & TypeScript)

| File | Source | Description |
|------|--------|-------------|
| `14-agent-sdk-overview.md` | https://code.claude.com/docs/en/agent-sdk/overview | Agent SDK overview, capabilities, vs CLI vs Managed Agents |
| `15-agent-sdk-quickstart.md` | https://code.claude.com/docs/en/agent-sdk/quickstart | Quick start guide for Python and TypeScript SDKs |
| `16-agent-sdk-streaming.md` | https://code.claude.com/docs/en/agent-sdk/streaming-output | Streaming text and tool calls in real-time |
| `17-agent-sdk-sessions.md` | https://code.claude.com/docs/en/agent-sdk/sessions | Session management: continue, resume, fork |
| `18-agent-sdk-custom-tools.md` | https://code.claude.com/docs/en/agent-sdk/custom-tools | Defining custom tools with MCP, error handling, returns |
| `19-agent-sdk-typescript.md` | https://code.claude.com/docs/en/agent-sdk/typescript | Complete TypeScript SDK API reference |
| `20-agent-sdk-python.md` | https://code.claude.com/docs/en/agent-sdk/python | Complete Python SDK API reference |

## Programmatic Usage

| File | Source | Description |
|------|--------|-------------|
| `21-headless.md` | https://code.claude.com/docs/en/headless | Running Claude Code programmatically with `-p` flag, output formats |

## Key Topics for Non-Claude Agents Driving Claude Code

The following documentation is most relevant for building a tool that drives Claude Code as a sub-agent:

1. **CLI Usage & Flags** (02-cli-reference.md) - All ways to invoke Claude Code and configuration flags
2. **Interactive TUI** (03-interactive-mode.md) - How the terminal interface renders, prompt formats, keyboard shortcuts, streaming output
3. **Hooks System** (09-hooks-reference.md, 10-hooks-guide.md) - How to intercept and control Claude Code behavior at key points
4. **Sessions & State** (05-sessions.md) - Session persistence, resume/continue mechanics, transcript storage
5. **Permissions & Controls** (08-permissions.md) - Fine-grained permission rules and auto mode
6. **Agent SDK** (14-21) - Programmatic APIs for Python and TypeScript that allow embedding Claude Code as a library
7. **Programmatic Execution** (21-headless.md) - Non-interactive (`-p`) mode and structured output formats
8. **Output Formats** - Stream JSON, structured outputs, cost tracking

## Documentation Not Included

The following categories of documentation exist but are not included in this snapshot because they are less relevant for non-Claude agent drivers:

- VS Code extension guide
- JetBrains IDE integration
- Desktop app features
- Web/cloud features
- GitHub/GitLab CI/CD integration
- Slack integration
- Remote Control features
- Mobile/iOS features
- Third-party provider authentication
- Cloud provider setup (Bedrock, Vertex AI, Azure Foundry)

## Coverage Completeness

**Total Pages Fetched**: 21 comprehensive documentation files covering 100+ source pages

**What We Know From These Docs**:
- Full Claude Code CLI syntax and all available flags
- Complete interactive TUI keyboard shortcuts and command formats
- Comprehensive hooks system with all event types and decision patterns
- Full Agent SDK APIs (Python and TypeScript) for programmatic use
- Session management and persistence mechanisms
- All permission modes and fine-grained permission rules
- MCP integration and tool definition patterns
- Output formats including stream-json and structured outputs

## What's Still Not Fully Documented

Based on these docs, the following gaps remain for non-Claude agents driving Claude Code:

1. **Stable Non-Interactive Interface**: The docs mention `claude -p` (print mode) as the main way to drive Claude Code without the TUI. However:
   - It's unclear if there's a stable, versioned programmatic interface beyond the SDK
   - The SDK documentation focuses on the Python/TypeScript libraries, not direct CLI automation
   - There's no documented guarantee of output format stability across versions

2. **Prompt Caching Benefits in Programmatic Mode**: While the Agent SDK docs mention prompt caching, it's unclear:
   - Whether running Claude Code with `-p` preserves prompt cache benefits vs SDK usage
   - How session resumption interacts with prompt cache
   - Whether external drivers can leverage prompt caching or if it requires SDK use

3. **TUI-to-PTY Communication Protocol**: The docs describe keyboard shortcuts and command formats, but:
   - There's no documented API for external tools to drive the TUI directly
   - The streaming output formats are only documented for the SDK and `-p` mode
   - It's unclear if there's a stable protocol for PTY-based interaction

4. **Sub-agent Spawning from External Context**: While subagent documentation exists, it's unclear:
   - How an external tool can spawn a Claude Code subagent and get results back
   - Whether there's a documented contract for subagent communication
   - If subagents can be invoked programmatically or only through the interactive interface

## How to Use This Documentation

For building a tool that drives Claude Code:

1. **Start with CLI reference** (02-cli-reference.md) to understand all flags and options
2. **Review interactive mode** (03-interactive-mode.md) if building a TUI-based driver
3. **Study hooks** (09-hooks-reference.md) to intercept and control Claude Code behavior
4. **Check Agent SDK** (14-21) if building in Python or TypeScript
5. **Review programmatic execution** (21-headless.md) for non-interactive mode details

**Last Updated**: May 30, 2026

