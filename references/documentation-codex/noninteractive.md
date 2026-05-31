---
source_url: https://developers.openai.com/codex/noninteractive
canonical_url: https://developers.openai.com/codex/noninteractive
title: Non-interactive Mode (codex exec)
fetched: 2026-05-30
relevance: high
note: This is how plugins/scripts drive Codex from CI or another agent. Essential for the cc-plugin-codex use case.
---

# Non-interactive Mode (`codex exec`)

> Source: https://developers.openai.com/codex/noninteractive

`codex exec` runs Codex without the TUI. Use it for CI, pre-merge checks, scheduled jobs, or chaining inside other CLI workflows.

## Basic invocation

```bash
codex exec "summarize the repository structure and list the top 5 risky areas"
```

Progress streams to **stderr**; only the final agent message is written to **stdout** so redirection is clean:

```bash
codex exec "generate release notes for the last 10 commits" | tee release-notes.md
```

## Ephemeral mode (no session files)

```bash
codex exec --ephemeral "triage this repository and suggest next steps"
```

## Piping content into Codex

```bash
curl -s https://jsonplaceholder.typicode.com/comments \
  | codex exec "format the top 20 items into a markdown table" \
  > table.md
```

## Safety & permissions

By default `codex exec` is **read-only**. Adjust with `--sandbox`:

- `--sandbox workspace-write` — file edits allowed
- `--sandbox danger-full-access` — broad access; controlled environments only

The deprecated `--full-auto` prints a warning; new scripts should use `--sandbox`.

## Machine-readable output

JSONL streaming with `--json`:

```bash
codex exec --json "summarize the repo structure" | jq
```

Event types include `thread.started`, `turn.started`, `item.*`, `turn.completed`.

Write only the final message to a file with `-o <path>`:

```bash
codex exec "Extract project metadata" \
  --output-schema ./schema.json \
  -o ./project-metadata.json
```

## Authentication in CI

```bash
CODEX_API_KEY=<api-key> codex exec --json "triage open bug reports"
```

`CODEX_API_KEY` is supported **only** in `codex exec`. For GitHub Actions, prefer the official [`openai/codex-action`](https://github.com/openai/codex-action) over exposing raw keys.

## Resuming non-interactive runs

```bash
codex exec "review the change for race conditions"
codex exec resume --last "fix the race conditions you found"
# or
codex exec resume <SESSION_ID> "Implement the plan"
```

## Git-repo requirement

Codex requires running inside a Git repo to prevent destructive changes. Bypass with:

```bash
codex exec --skip-git-repo-check "..."
```
