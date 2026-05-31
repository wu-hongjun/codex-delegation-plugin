---
source_url: https://developers.openai.com/codex/models
canonical_url: https://developers.openai.com/codex/models
title: Codex Models
fetched: 2026-05-30
---

# Models — Codex

> Source: https://developers.openai.com/codex/models

## Recommended models

| Model | Positioning |
|---|---|
| `gpt-5.5` | Newest frontier model; complex coding, computer use, knowledge work, research workflows. |
| `gpt-5.4` | Flagship — industry-leading coding plus reasoning and agentic workflows. |
| `gpt-5.4-mini` | Faster/cheaper, well-suited to responsive coding tasks and subagents. |
| `gpt-5.3-codex` | Industry-leading coding model for complex software engineering; powers GPT-5.4's coding capabilities. |
| `gpt-5.3-codex-spark` | Text-only research preview optimized for near-instant, real-time coding iteration. ChatGPT Pro only. |

## Alternative

- `gpt-5.2` — previous general-purpose model; still appropriate for hard debugging tasks that benefit from deeper deliberation.

## Setting a model

In `config.toml`:

```toml
model = "gpt-5.5"
```

Or on the CLI:

```bash
codex --model gpt-5.5
codex -m gpt-5.4-mini
```

Codex also supports integration with **external** models that speak the Chat Completions or Responses APIs (see `config-advanced.md` for custom `[model_providers.*]` setup).
