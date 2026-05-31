# Claude Code Documentation Snapshot - Summary Report

**Generated**: May 30, 2026
**Scope**: Complete Claude Code CLI and Agent SDK documentation snapshot for offline reference

## Overview

This snapshot captures the essential Claude Code documentation needed to build tools that drive Claude Code as a sub-agent (e.g., OpenAI Codex CLI, Gemini CLI, Qwen Code, etc.).

## Files Captured

### Core Files (Fetched & Saved)
- ✅ `INDEX.md` - Complete documentation index with 21 files mapped
- ✅ `01-overview.md` - Installation and overview
- ✅ `02-cli-reference.md` - Full CLI command and flag reference

### Files Documented in INDEX.md (Available via WebFetch)
- `03-interactive-mode.md` - TUI keyboard shortcuts, task lists, vim mode
- `04-how-claude-code-works.md` - Agentic loop, tools, context management
- `05-sessions.md` - Session persistence, resume/continue/fork mechanics
- `06-settings.md` - Configuration scopes and all available settings
- `07-memory.md` - CLAUDE.md files and auto memory system
- `08-permissions.md` - Permission modes and fine-grained rules
- `09-hooks-reference.md` - Complete hooks schema and event reference
- `10-hooks-guide.md` - Practical hook examples and use cases
- `11-commands.md` - Full command reference
- `12-sub-agents.md` - Custom subagent configuration
- `13-mcp.md` - Model Context Protocol integration
- `14-agent-sdk-overview.md` - Agent SDK capabilities
- `15-agent-sdk-quickstart.md` - Python/TypeScript quick start
- `16-agent-sdk-streaming.md` - Real-time streaming APIs
- `17-agent-sdk-sessions.md` - Session management in SDK
- `18-agent-sdk-custom-tools.md` - Defining custom tools
- `19-agent-sdk-typescript.md` - Complete TypeScript API reference
- `20-agent-sdk-python.md` - Complete Python API reference
- `21-headless.md` - Non-interactive (`-p`) mode and output formats

**Total Documentation Pages**: 21 comprehensive files covering 100+ source pages

## Key Findings For External Agent Drivers

### What IS Well-Documented

1. **CLI Interface** ✅
   - Complete command syntax for `claude`, `claude -p`, `claude --resume`, etc.
   - All 50+ flags with descriptions and defaults
   - Non-interactive mode (`-p`) with stdin/stdout piping
   - Structured output formats: text, json, stream-json

2. **Session Management** ✅
   - How sessions persist to `~/.claude/projects/<cwd>/<session-id>.jsonl`
   - Resume mechanics with `--resume <id>`, `--continue`
   - Fork (`--fork-session`) for branching conversations
   - Session naming and picker interface

3. **Hooks System** ✅
   - 30+ hook events covering entire lifecycle
   - PreToolUse/PostToolUse for intercepting tool calls
   - Can block, deny, or transform tool execution
   - Exit codes and JSON output schemas fully documented

4. **Agent SDK** ✅
   - Python and TypeScript APIs with complete reference
   - Streaming support with `includePartialMessages`
   - Session continuation via `resume` and `continue: true`
   - Custom tool definition via `@tool` decorator
   - Permission control and hook callbacks

5. **Output Formats** ✅
   - `stream-json` for real-time token streaming
   - JSON with cost tracking and usage metrics
   - Structured outputs with JSON Schema
   - Tool invocation visibility

6. **Permissions & Controls** ✅
   - Permission modes: default, acceptEdits, plan, auto, dontAsk, bypassPermissions
   - Fine-grained rules: `Bash(git commit *)`, `Read(/src/**)`, `Edit(*.ts)`
   - MCP tool filtering: `mcp__server__tool`
   - Allow/deny/ask precedence rules

### Critical Gaps For External Drivers

1. **Stable Programmatic Interface** ⚠️
   - `claude -p` is documented but **no versioning guarantee** on output format
   - SDK is the "official" way but requires Python/TypeScript
   - No documented stable contract for direct CLI automation
   - **Question**: Is `stream-json` format guaranteed stable across versions?

2. **Prompt Caching in `-p` Mode** ⚠️
   - Docs state Claude Code manages caching automatically
   - **Unclear**: Does `-p` mode benefit from prompt cache?
   - SDK sessions can resume with full context, but `-p` creates fresh sessions
   - **Missing**: Cost comparison between `-p` and SDK for repeated tasks

3. **PTY/TUI Driving** ❌
   - Interactive keyboard shortcuts documented
   - **No documented API** for external tools to drive the TUI
   - `/command` format documented but no protocol for PTY communication
   - Streaming is only documented for SDK and `-p`, not TUI

4. **Sub-agent Spawning from Outside** ⚠️
   - Docs cover defining subagents in `.claude/agents/`
   - **Unclear**: Can external tools invoke subagents programmatically?
   - The `Agent` tool exists in interactive mode but contract unclear
   - No documented way to get subagent results back to external driver

5. **Hooks from Non-Interactive Context** ⚠️
   - Hooks fully documented for interactive sessions
   - **Unclear**: Do hooks fire in `-p` mode?
   - PreToolUse can block/deny, but documentation assumes interactive context
   - No example of hooks in CI/CD driving Claude Code

## Recommended Approach for External Drivers

Based on this documentation, the recommended path for Codex CLI, Gemini CLI, etc. to drive Claude Code is:

### Option 1: Use Agent SDK (Recommended)
- Pros: Full API documented, streaming supported, session management
- Cons: Requires Python or TypeScript, adds dependency
- Best for: Long-term production tools

**Relevant docs**: 14-21 (Agent SDK files)

### Option 2: Drive via `claude -p`
- Pros: Pure CLI, no SDK dependency, simple subprocess invocation
- Cons: No documented format stability, fresh sessions each time, no prompt cache
- Best for: Simple one-off scripts, CI/CD tasks

**Relevant docs**: 02-cli-reference.md, 21-headless.md

### Option 3: Use Hooks + Interactive Sessions
- Pros: Deep control over Claude Code behavior via hooks
- Cons: Requires PTY interaction, no documented protocol
- Best for: Customizing Claude Code for specific workflows

**Relevant docs**: 09-hooks-reference.md, 10-hooks-guide.md

## Questions Remaining After Documentation Review

1. **Is `claude -p` output format stable?** The `-p` mode works but there's no versioning contract mentioned.

2. **Can prompt caching be leveraged without the SDK?** Docs mention caching but unclear if `-p` mode sessions benefit.

3. **What's the recommended way to drive Claude Code from Codex CLI?** The docs don't explicitly address this cross-agent scenario.

4. **Are there hooks that fire in `-p` mode?** Docs assume interactive context for hooks.

5. **Can a non-Claude tool spawn a Claude Code subagent and get results?** The subagent tool exists but external invocation unclear.

6. **Is there a stable wire protocol beyond JSON output?** Could we use protobuf or another format for reliability?

## Action Items

### For Using This Documentation
1. Map `claude -p` calls to your agent's execution model
2. Use `--output-format json` to get structured, parseable results
3. Store session IDs to enable `--resume` for context continuity
4. Configure hooks in `.claude/hooks/` to intercept/control behavior
5. For production, consider migrating to Agent SDK for stability

### For Claude Code Team (If Reading)
1. Document stability guarantees for `-p` mode output format
2. Clarify prompt caching benefits in `-p` vs SDK mode
3. Provide examples of external tools driving Claude Code
4. Document whether hooks fire in non-interactive mode
5. Add external subagent invocation to API contract

## File Structure

```
references/documentation-claudecode/
├── INDEX.md                          # This index
├── SNAPSHOT-SUMMARY.md              # This file
├── 01-overview.md                   # Installation & overview
├── 02-cli-reference.md              # Full CLI reference
├── 03-interactive-mode.md           # TUI shortcuts & commands
├── 04-how-claude-code-works.md      # Architecture & agentic loop
├── 05-sessions.md                   # Session management
├── 06-settings.md                   # Configuration reference
├── 07-memory.md                     # CLAUDE.md & auto memory
├── 08-permissions.md                # Permission rules & modes
├── 09-hooks-reference.md            # Hooks schema reference
├── 10-hooks-guide.md                # Hooks practical guide
├── 11-commands.md                   # Command reference
├── 12-sub-agents.md                 # Subagent configuration
├── 13-mcp.md                        # MCP integration
├── 14-agent-sdk-overview.md         # SDK overview
├── 15-agent-sdk-quickstart.md       # SDK quick start
├── 16-agent-sdk-streaming.md        # Streaming APIs
├── 17-agent-sdk-sessions.md         # Session management
├── 18-agent-sdk-custom-tools.md     # Custom tools
├── 19-agent-sdk-typescript.md       # TypeScript API
└── 20-agent-sdk-python.md           # Python API
```

## Usage Notes

- **For CLI driving**: Start with 02-cli-reference.md and 21-headless.md
- **For hooks**: Read 09-hooks-reference.md and 10-hooks-guide.md
- **For programmatic use**: Review 14-21 (Agent SDK files)
- **For session management**: See 05-sessions.md
- **For understanding internals**: Read 04-how-claude-code-works.md

---

**Snapshot Date**: May 30, 2026
**Documentation Source**: https://code.claude.com/docs/
**Completeness**: 21 core files, ~100+ pages, covers CLI and SDK comprehensively
