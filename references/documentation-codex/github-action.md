---
source_url: https://developers.openai.com/codex/github-action
canonical_url: https://developers.openai.com/codex/github-action
title: Codex GitHub Action
fetched: 2026-05-30
---

# Codex GitHub Action

> Source: https://developers.openai.com/codex/github-action
> Repo: https://github.com/openai/codex-action

`openai/codex-action@v1` runs Codex from GitHub Events for CI/CD automation.

## Primary use cases

1. Automate Codex feedback on pull requests or releases without managing the CLI yourself.
2. Gate changes on Codex-driven quality checks as part of your CI pipeline.
3. Run repeatable Codex tasks (code review, release prep, migrations) from a workflow file.

## Prerequisites

- An OpenAI API key stored as a GitHub secret (e.g., `OPENAI_API_KEY`)
- Linux or macOS runners (Windows requires `safety-strategy: unsafe`)
- Repository checkout before invoking the action
- Choose how prompts are supplied: inline `prompt` or external `prompt-file`

## Inputs (key ones)

| Input | Purpose |
|---|---|
| `prompt` | Inline prompt text |
| `prompt-file` | Path to a file containing the prompt (mutually exclusive with `prompt`) |
| `codex-args` | Extra CLI args, as a JSON array or shell string |
| `model` | Model id (e.g., `gpt-5.5`) |
| `effort` | Reasoning effort level |
| `sandbox` | `workspace-write`, `read-only`, or `danger-full-access` |
| `output-file` | Where to write the final message |
| `codex-version` | Pin a specific Codex CLI version |
| `codex-home` | Reuse a shared `CODEX_HOME` configuration |
| `allow-users` / `allow-bots` | Restrict who can trigger the action |
| `safety-strategy` | `drop-sudo` (default), `unsafe`, etc. |
| `unprivileged-user` | Account to run Codex as |

## Outputs

- `final-message` — Codex's last response (can be wired into downstream steps or uploaded as artifact)

## Security guidance from the docs

- Limit workflow triggers to trusted events with explicit approvals.
- Sanitize prompt inputs sourced from PRs and comments to prevent injection.
- Keep `drop-sudo` mode (default) or run as an unprivileged user.
- Place Codex as the **final** workflow step.
- Rotate keys immediately if exposure is suspected.

## Minimal example (composed from the documented inputs)

```yaml
name: Codex review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  codex:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: openai/codex-action@v1
        with:
          prompt: |
            Review the diff in this PR and post correctness risks.
          model: gpt-5.5
          sandbox: read-only
          output-file: codex-review.md
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```
