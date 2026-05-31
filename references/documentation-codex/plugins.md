---
source_url: https://developers.openai.com/codex/plugins
canonical_url: https://developers.openai.com/codex/plugins
title: Codex Plugins Overview
fetched: 2026-05-30
related: plugins-build.md
---

# Plugins — Codex

> Source: https://developers.openai.com/codex/plugins

Plugins bundle **skills**, **app integrations**, and **MCP servers** into reusable workflows. Examples shipping in the Codex catalog include security scanning, email management, cloud storage, and team communication.

## What a plugin can include

- **Skills**: reusable, task-specific instruction packages Codex loads on demand.
- **Apps**: connections to tools like GitHub, Slack, Google Drive for reading/acting.
- **MCP servers**: services that expose additional tools and shared information over Model Context Protocol.

## Where users install plugins

1. **Codex App**: Browse the Plugins directory (OpenAI-curated, shared, user-created).
2. **CLI**: `/plugins` opens the in-terminal plugin browser organized by marketplace.
3. **Invocation**: Either ask in natural language ("use my-plugin to ...") or invoke specific skills with `@`.

## Permissions and data

- Installing plugins makes their workflows available without weakening approval/sandbox settings.
- External services (apps, MCP servers) bring their own auth and privacy policies.
- Plugins can be disabled with `enabled = false` in config, or fully uninstalled from the browser.

## Building your own

See `plugins-build.md` (https://developers.openai.com/codex/plugins/build) for the full manifest schema, marketplace format, hooks bundle, MCP bundle, and CLI commands.
