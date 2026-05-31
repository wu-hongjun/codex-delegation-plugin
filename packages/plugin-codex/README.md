# Claude Companion for Codex

## What this is

A Codex plugin that lets a Codex session delegate a task to Claude Code using Claude Code background sessions. The plugin spawns a fresh background session per job, tracks execution state in `~/.codex/cc-plugin-codex`, and retrieves results via a command-line dispatcher that calls `claude --bg`, `claude agents --json`, and transcript/log readers.

Key design choice: this v1 uses Claude Code background sessions directly and does not use `claude -p`. The architecture is designed to preserve the foundation for future session/cache reuse experiments.

## Current v1 scope

Five skills are available:

- **`$claude-setup`** — probe dependencies and report status (ok/warn/fail)
- **`$claude-delegate`** — start a new background session for a task
- **`$claude-status`** — list all delegated jobs in the current workspace
- **`$claude-result`** — print the final answer and transcript/log paths for a completed job
- **`$claude-stop`** — terminate a background session explicitly

Lifecycle: `delegate` creates one fresh background session; `status` reconciles live state from `claude agents --json`; `result` prints the final assistant message; `stop` is optional cleanup. For plan 0001's start-only jobs, real Claude Code `idle` status is treated as `completed` because there is no v1 follow-up prompt injection. This mapping may change in the future when multi-turn session reuse exists.

## Requirements

- **Node.js 20+** (tested on v25.1.0)
- **npm** (comes with Node)
- **Codex CLI** (tested on 0.135.0)
- **Claude Code CLI** (tested on 2.1.149), authenticated locally
- **`$claude-setup` feature-probes** background-session support and reports warnings if the environment is degraded but usable

## Install locally

Use this marketplace-based installation. The commands below use `rsync` to mirror the plugin into a local marketplace root, then add it to Codex.

```bash
REPO_ROOT="$(pwd)"
MARKETPLACE_ROOT="$(mktemp -d /tmp/cc-plugin-codex-marketplace-XXXXXX)"
mkdir -p "$MARKETPLACE_ROOT/.agents/plugins"
mkdir -p "$MARKETPLACE_ROOT/plugins"
rsync -a --delete \
  "$REPO_ROOT/packages/plugin-codex/" \
  "$MARKETPLACE_ROOT/plugins/claude-companion/"
cat > "$MARKETPLACE_ROOT/.agents/plugins/marketplace.json" <<'JSON'
{
  "name": "cc-plugin-codex-local",
  "interface": { "displayName": "cc-plugin-codex Local" },
  "plugins": [
    {
      "name": "claude-companion",
      "source": { "source": "local", "path": "./plugins/claude-companion" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Coding"
    }
  ]
}
JSON
codex plugin marketplace add "$MARKETPLACE_ROOT"
codex plugin add "claude-companion@cc-plugin-codex-local"
```

Note: marketplace packaging is intentionally not committed in plan 0001. Plan 0006 handles distribution polish.

## Setup

Run the setup skill to probe your environment:

```bash
$claude-setup
```

Expected aggregate status:

- `ok` — all dependencies ready
- `warn` — usable with caveats (e.g., `--bg` not advertised in `--help`, or daemon status unavailable; the runtime path uses direct `--bg` invocation and does not require daemon status)
- `fail` — delegate refuses to start

Direct dispatcher fallback (if the skill is unavailable):

```bash
node packages/plugin-codex/scripts/claude-companion.mjs setup
```

## Commands and skills

### $claude-setup

Check Claude Companion readiness. Probes Node version, Codex, Claude binary, authentication, background-session support, agents JSON, transcript paths, and workspace permissions.

```bash
$claude-setup
```

### $claude-delegate

Delegate a coding task to Claude Code. Starts a new background session and prints the job ID.

```bash
$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."
```

Job ID from successful delegation: `job_mpt98g9g_b61e09f1` (shown in output as `Job ID:`).

Interactive privacy acknowledgement: on first delegation in a workspace, you will be asked to confirm that delegating may send repository contents, prompts, command output, and Claude Code context to Anthropic. This is interactive by default; you can skip the prompt with `--yes` if you have intentionally pre-approved the policy.

### $claude-status

List all delegated jobs in the current workspace with their live status.

```bash
$claude-status
```

Shows job ID, status (running/completed/stopped/orphaned), Claude session ID, and session name.

### $claude-result

Retrieve the final assistant message and log paths for a completed job.

```bash
$claude-result job_mpt98g9g_b61e09f1
```

Prints the assistant's final answer, list of touched files, and paths to transcript (if available) and logs.

### $claude-stop

Terminate a background session. The job will be marked `stopped` and can still be accessed via `result`.

```bash
$claude-stop job_mpt98g9g_b61e09f1
```

Optional cleanup. Not required before calling `result`.

## Direct dispatcher usage

All five commands are also available via the dispatcher script. Useful for scripting and non-interactive workflows:

```bash
node packages/plugin-codex/scripts/claude-companion.mjs setup
node packages/plugin-codex/scripts/claude-companion.mjs delegate --yes -- "Inspect this repo."
node packages/plugin-codex/scripts/claude-companion.mjs status
node packages/plugin-codex/scripts/claude-companion.mjs result <jobId>
node packages/plugin-codex/scripts/claude-companion.mjs stop <jobId>
```

All commands support `--json` for machine-readable output. The `--yes` flag on `delegate` skips the interactive privacy acknowledgement.

## Privacy and workspace disclosure

Delegating a task may send repository contents, prompts, command output, file metadata, and Claude Code context to Anthropic through the user's local Claude Code account.

On first delegation in a workspace, you will be prompted to acknowledge this policy. Acknowledgement is stored in `~/.codex/cc-plugin-codex/acks/` and is workspace-specific.

The `--yes` flag skips this prompt for intentional non-interactive use only.

## Cost and prompt-cache wording

This v1 uses Claude Code background sessions and does not use `claude -p`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement.

## Known limitations

- **One fresh session per job** — each delegation creates a new background session. No session reuse across delegations.
- **No multi-turn reuse yet** — delegations are start-only. Follow-up input requires a new delegation or manual attach.
- **No PTY attach yet** — you cannot interactively attach to a background session from Codex in v1.
- **No Claude Code channels yet** — prompt injection via channels is not supported.
- **No `$claude-review` yet** — review/adversarial-review skills are planned for plan 0003.
- **No stop-time hook or review gate yet** — plan 0005 will add this.
- **No benchmarked cost-savings claim** — we measure in plan 0004.
- **No committed marketplace packaging** — plan 0006 handles distribution polish.
- **Windows not tested in plan 0001** — development and testing are on macOS and Linux only.
- **Real Claude agents --json schema differs from mock** — plan 0001 supports the 2.1.149-style row format with derived short IDs (shortId is the first 8 hex characters of the UUID, stripped of dashes). The reconciler uses this derivation for matching.

## Troubleshooting

### `$claude-setup` reports `fail`

Run setup again with more detail:

```bash
node packages/plugin-codex/scripts/claude-companion.mjs setup
```

The detailed output will show which probes failed. Common causes:

- Claude Code not authenticated — run `claude auth login`
- Codex not installed — install from the Codex marketplace
- Claude binary not on PATH — verify `which claude` works

### Claude auth missing

```bash
claude auth login
```

Then retry `$claude-setup`.

### `--bg` flag not advertised in `--help`

`$claude-setup` may warn that `--bg` is not listed in `claude --help` output. This is expected in recent Claude Code versions; the flag works at runtime even if hidden from help. The warning is informational; delegation will still work.

### Daemon status warning

`$claude-setup` may warn that `claude daemon status` is unavailable. This is diagnostic only; plan 0001 does not require it. The delegate path uses `claude --bg` directly.

### Delegate asks for privacy acknowledgement

On first delegation in a workspace, you will see:

```
Delegating may send repository contents and Claude Code context to Anthropic.
Do you want to proceed? (yes/no)
```

Type `yes` to acknowledge. This is stored and will not be asked again for the same workspace. To skip interactively in future runs, pass `--yes` to the delegate command.

### Result says job is not complete yet

```
Job <jobId> is not complete yet (status: running).
```

The session is still executing. Run `$claude-status` to check live status. Once status shows `completed`, retry `result`.

### Result has no transcript path

Transcripts are available only if Claude Code writes them. If transcripts are missing, the dispatcher falls back to printing logs via `claude logs <sessionId>`. The result output will show `Logs: claude logs <sessionId>` for manual inspection.

### Stop fails

If `$claude-stop` exits non-zero, verify the job ID is correct by running `$claude-status`. The job may already be stopped or orphaned.

## Development

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

Generates `dist/` in each package.

### Lint and format

```bash
npm run lint
npm run format
```

Format check (no auto-fix): `npm run format` (uses `--check` internally).

### Type check

```bash
npm run typecheck
```

### Tests

```bash
npm test
```

Test suite covers:

- **mock** — mock Claude and Codex binaries (tools/mock-claude, tools/mock-codex)
- **runtime** — job store, doctor probes, paths (packages/runtime)
- **driver** — Claude Code background driver (packages/driver-claude-code)
- **plugin** — dispatcher integration (packages/plugin-codex)

Tests use `node:test` (built-in); no external test framework dependency.

## What comes next

Later plans are reserved for:

- **Plan 0002** — multi-turn reuse via PTY attach or structured input
- **Plan 0003** — `$claude-review` and `$claude-adversarial-review` skills
- **Plan 0004** — benchmark harness and cost-savings measurement
- **Plan 0005** — stop-time hook and review gate integration
- **Plan 0006** — marketplace packaging and distribution polish
