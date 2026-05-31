---
source_url: https://developers.openai.com/codex/plugins/build
canonical_url: https://developers.openai.com/codex/plugins/build
title: Building Plugins for Codex
fetched: 2026-05-30
relevance: high
note: Highly relevant for cc-plugin-codex - shows the plugin schema Codex uses, including @plugin-creator skill, manifest fields, hooks, MCP, and marketplace.
---

# Building Plugins for Codex

> Source: https://developers.openai.com/codex/plugins/build

## Quick start with `@plugin-creator`

The fastest way to build a plugin is the built-in `@plugin-creator` skill. It scaffolds the required `.codex-plugin/plugin.json` manifest and creates a local marketplace entry for testing.

## Manual plugin creation

### Minimal directory layout

```
my-first-plugin/
├── .codex-plugin/
│   └── plugin.json
└── skills/
    └── hello/
        └── SKILL.md
```

### Minimal manifest

```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "description": "Reusable greeting workflow",
  "skills": "./skills/"
}
```

Requirements:
- `name` must be **kebab-case**; it doubles as the identifier and component namespace.
- All manifest paths start with `./` and are relative to the plugin root.
- Skills live at `skills/<skill-name>/SKILL.md`.

### Full manifest example

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Bundle reusable skills and app integrations.",
  "author": {
    "name": "Your team",
    "email": "team@example.com",
    "url": "https://example.com"
  },
  "homepage": "https://example.com/plugins/my-plugin",
  "repository": "https://github.com/example/my-plugin",
  "license": "MIT",
  "keywords": ["research", "crm"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "apps": "./.app.json",
  "hooks": "./hooks/hooks.json",
  "interface": {
    "displayName": "My Plugin",
    "shortDescription": "Reusable skills and apps",
    "longDescription": "Distribute skills and app integrations together.",
    "developerName": "Your team",
    "category": "Productivity",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://example.com",
    "privacyPolicyURL": "https://example.com/privacy",
    "termsOfServiceURL": "https://example.com/terms",
    "defaultPrompt": [
      "Use My Plugin to summarize new CRM notes.",
      "Use My Plugin to triage new customer follow-ups."
    ],
    "brandColor": "#10A37F",
    "composerIcon": "./assets/icon.png",
    "logo": "./assets/logo.png",
    "screenshots": ["./assets/screenshot-1.png"]
  }
}
```

## Full plugin layout

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json          # Required
├── skills/
│   └── my-skill/
│       └── SKILL.md         # Optional
├── hooks/
│   └── hooks.json           # Optional
├── .app.json                # Optional: app/connector mappings
├── .mcp.json                # Optional: MCP server config
└── assets/                  # Optional: icons, logos, screenshots
```

## Marketplaces

Plugins are distributed through marketplaces. There are two scopes:

### Repo-local marketplace — `$REPO_ROOT/.agents/plugins/marketplace.json`

```json
{
  "name": "local-repo",
  "plugins": [
    {
      "name": "my-plugin",
      "source": {
        "source": "local",
        "path": "./plugins/my-plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

### Personal marketplace — `~/.agents/plugins/marketplace.json`

Same structure. Plugin payloads typically live at `~/.codex/plugins/`.

### CLI marketplace commands

```bash
codex plugin marketplace add owner/repo
codex plugin marketplace add owner/repo --ref main
codex plugin marketplace add https://github.com/example/plugins.git --sparse .agents/plugins
codex plugin marketplace add ./local-marketplace-root

codex plugin marketplace list
codex plugin marketplace upgrade
codex plugin marketplace upgrade marketplace-name
codex plugin marketplace remove marketplace-name
```

## MCP server bundling — `.mcp.json`

```json
{
  "docs": {
    "command": "docs-mcp",
    "args": ["--stdio"]
  }
}
```

End users can then tune behavior in `config.toml`:

```toml
[plugins."my-plugin".mcp_servers.docs]
enabled = true
default_tools_approval_mode = "prompt"
enabled_tools = ["search"]
```

## Lifecycle hooks — `hooks/hooks.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${PLUGIN_ROOT}/hooks/session_start.py",
            "statusMessage": "Loading plugin context"
          }
        ]
      }
    ]
  }
}
```

Environment variables available inside hook commands:

| Variable | Meaning |
|---|---|
| `PLUGIN_ROOT` | Installed plugin root directory |
| `PLUGIN_DATA` | Writable data directory for the plugin |
| `CLAUDE_PLUGIN_ROOT` | Legacy compatibility alias for `PLUGIN_ROOT` |
| `CLAUDE_PLUGIN_DATA` | Legacy compatibility alias for `PLUGIN_DATA` |

The `CLAUDE_PLUGIN_*` aliases imply Codex's plugin format is intentionally compatible with Anthropic's Claude Code plugin format.

## Manifest field reference

**Top level:** `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`.

**`interface` object:** `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt` (array), `brandColor`, `composerIcon`, `logo`, `screenshots` (array).

## Installation and distribution

### Local manual install

Copy the plugin folder into either:
- Repo-scoped: `$REPO_ROOT/plugins/<plugin-name>`
- User-scoped: `~/.codex/plugins/<plugin-name>`

Then point a marketplace file at it.

### Workspace sharing (Codex app)

1. Open **Plugins → Created by you**.
2. Select the plugin and choose **Share**.
3. Add workspace members or copy the share link.
4. Set access level.

Shared plugins stay inside the workspace/organization — they are not publicly published.

### Disable sharing (admin)

```toml
# requirements.toml
plugin_sharing = false
```

## Installation cache layout

Installed plugins live under:

```
~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/
```

For local plugins, `$VERSION` is `local`. Codex loads from this cache directory rather than the marketplace source.
