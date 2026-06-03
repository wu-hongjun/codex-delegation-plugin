# Claude Companion for Codex

## What this is

A Codex plugin that lets a Codex session delegate a task to Claude Code using Claude Code background sessions. The plugin spawns a fresh background session per job, tracks execution state in `~/.codex/cc-plugin-codex`, and retrieves results via a command-line dispatcher that calls `claude --bg`, `claude agents --json`, and transcript/log readers.

Key design choice: this v1 uses Claude Code background sessions directly and does not use `claude -p`. The architecture is designed to preserve the foundation for future session/cache reuse experiments.

## Current v1 scope

Eight skills are available:

- **`$claude-setup`** — probe dependencies and report status (ok/warn/fail)
- **`$claude-delegate`** — start a new background session for a task
- **`$claude-status`** — list all delegated jobs in the current workspace
- **`$claude-result`** — print the final answer and transcript/log paths for a completed job
- **`$claude-stop`** — terminate a background session explicitly
- **`$claude-followup`** — send a follow-up instruction to an existing Claude background job (added in plan 0002)
- **`$claude-review`** — send a structured review prompt into the same Claude Code session (added in plan 0003)
- **`$claude-adversarial-review`** — run a structured review in a fresh independent session (added in plan 0003)

Lifecycle: `delegate` creates one fresh background session; `status` reconciles live state from `claude agents --json` and per-job sidecar; `result` prints the final assistant message of the most recent completed turn; `followup` injects the next instruction into an existing background session via internal PTY attach; `stop` is optional cleanup. After a completed turn, jobs may enter `awaiting_followup` for up to 30 minutes; while in that state, `$claude-followup` is the next-turn entry point. After the TTL elapses, status displays as `completed`, but an explicit follow-up may still attempt to attach if the session is still live.

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

### $claude-followup

Send a follow-up instruction to an existing Claude background job. Useful while a job is in `awaiting_followup` (recently completed; session still live) and you want the next turn without starting a new delegation.

```bash
$claude-followup <jobId> -- "Now sort the TODOs by file name and print the count."
```

Accepted flags:

- `--all` — search for `<jobId-or-prefix>` across all workspaces (default scope is the current workspace).
- `--json` — machine-readable output.
- `--yes` — record the privacy acknowledgement non-interactively (see Privacy section).
- `--allow-edit` — policy / framing flag only; does not bypass the privacy acknowledgement and does not affect Claude permissions.

Rejected at parse time (these are startup-only flags that belong to `$claude-delegate`):

- `--model`
- `--effort`
- `--permission-mode`
- `--add-dir`
- `--mcp-config`
- `--name`

These configure a *new* Claude session; passing them to `$claude-followup` produces a clear error pointing at `$claude-delegate`.

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

All eight commands are also available via the dispatcher script. Useful for scripting and non-interactive workflows:

```bash
node packages/plugin-codex/scripts/claude-companion.mjs setup
node packages/plugin-codex/scripts/claude-companion.mjs delegate --yes -- "Inspect this repo."
node packages/plugin-codex/scripts/claude-companion.mjs status
node packages/plugin-codex/scripts/claude-companion.mjs followup <jobId> -- "Next instruction."
node packages/plugin-codex/scripts/claude-companion.mjs result <jobId>
node packages/plugin-codex/scripts/claude-companion.mjs stop <jobId>
node packages/plugin-codex/scripts/claude-companion.mjs review <jobId>
node packages/plugin-codex/scripts/claude-companion.mjs adversarial-review <jobId>
```

All commands support `--json` for machine-readable output. The `--yes` flag on `delegate` and `followup` skips the interactive privacy acknowledgement; `--allow-edit` is a policy/framing flag and does NOT bypass that acknowledgement.

For bulk-stop of awaiting-followup jobs (added in plan 0002):

```bash
node packages/plugin-codex/scripts/claude-companion.mjs stop --all-awaiting-followup
node packages/plugin-codex/scripts/claude-companion.mjs stop --all-awaiting-followup --all
```

## Privacy and workspace disclosure

Delegating a task may send repository contents, prompts, command output, file metadata, and Claude Code context to Anthropic through the user's local Claude Code account.

On first delegation in a workspace, you will be prompted to acknowledge this policy. Acknowledgement is stored in `~/.codex/cc-plugin-codex/acks/` and is workspace-specific.

The `--yes` flag skips this prompt for intentional non-interactive use only.

For `$claude-followup`, the acknowledgement is checked against the **target job's workspace**, not the caller's current directory. If you run `$claude-followup --all` from repository A against a job that was created in repository B, the acknowledgement must exist for repository B. The `--yes` flag records the acknowledgement against the target workspace; the `--allow-edit` flag is policy/framing only and never bypasses the acknowledgement.

## Follow-up injection

Plan 0002 adds follow-up injection: after `$claude-delegate` completes its first turn, the background session is still alive and idle. You can send the next instruction via `$claude-followup` without spawning a new session. The mechanism is internal: the dispatcher attaches via PTY, writes the next prompt, polls the per-job sidecar (`~/.claude/jobs/<shortId>/state.json`) for completion, and detaches.

Typical flow:

```bash
$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."
$claude-status
$claude-followup <jobId> -- "Now sort the TODOs by file name and print the count."
$claude-result <jobId>
$claude-stop <jobId>
```

### `awaiting_followup` state

`awaiting_followup` means the most recent Claude turn has completed, the background session is still alive (`idle` in `claude agents --json`), and the follow-up TTL has not elapsed. While in this state, the job is a valid target for `$claude-followup`.

The default follow-up window is **30 minutes** from the last completed activity. After the TTL, `$claude-status` displays the job as `completed`, but an explicit `$claude-followup <jobId>` may still attempt to attach if the live Claude session still exists. The TTL is default UX/status reporting, not a hard capability cutoff.

This state model is Plan 0002-specific and may be refined in a later plan if richer session-reuse semantics surface.

### Permission handoff

If Claude asks for permission mid-turn during `$claude-followup`, an interactive terminal prompts for one line and routes it back into the attached Claude session. In non-interactive (non-TTY) mode, the dispatcher fails closed and prints a manual `claude attach <shortId>` instruction — there is no automatic approval and no bypass flag. If the dispatcher times out waiting for a permission answer, the Claude session keeps running and the job remains inspectable with `$claude-status`; you can resume the permission turn manually with `claude attach <shortId>`.

## Review skills

Plan 0003 adds two review skills that request a structured evaluation of a delegated job's output. Both produce a verdict (`pass`, `fail`, or `pass_with_findings`) and a list of severity-rated findings (`blocker`, `high`, `medium`, `low`, `nit`), each with a description and optional file and line reference.

These review skills are local cc-plugin-codex flows: `$claude-review` uses the existing Claude Code session, and `$claude-adversarial-review` starts a fresh Claude Code background session. They do not wrap Anthropic's `claude ultrareview` command, which is a separate Claude Code review surface.

### $claude-review

Send a structured review prompt into the **same** Claude Code session that produced the work.

```
$claude-review <jobId-or-prefix>
```

Direct dispatcher equivalent:

```bash
node packages/plugin-codex/scripts/claude-companion.mjs review <jobId-or-prefix>
```

Accepted flags:

- `--all` — search across all workspaces (default scope is the current workspace).
- `--json` — machine-readable structured findings output.
- `--yes` — record the privacy acknowledgement non-interactively.

Rejected at parse time:

- `--allow-edit` — Reviews are read-only. Error: `"--allow-edit is not applicable to review skills. Reviews are read-only."`
- `--model`, `--effort`, `--permission-mode` — same-session; inherited from the original session.
- `--add-dir`, `--mcp-config`, `--name` — startup-only flags that do not apply to an existing session.

This skill appends a `[review]` turn to the existing job. It reviews the **latest completed non-review turn** by default. Because this review happens in the same conversation, it may be more prone to agreeing with its own prior work. Use `$claude-adversarial-review` for a more independent fresh-session review.

#### Session eligibility for `$claude-review`

| Job status | Allowed |
| --- | --- |
| `awaiting_followup` | Yes |
| `completed` (live idle session) | Yes |
| `completed` (no live session) | No — use `$claude-adversarial-review` instead |
| `needs_input` | No — resolve the permission request first, then run `$claude-review` |
| `running` | No — wait for the job to reach `awaiting_followup` |
| `queued`, `starting` | No — wait for the job to reach `awaiting_followup` |
| `failed`, `stopped`, `orphaned` | No — use `$claude-adversarial-review` for a fresh-session review of the prior output |

### $claude-adversarial-review

Start a **fresh** Claude Code background session to evaluate the output of a completed job.

```
$claude-adversarial-review <jobId-or-prefix>
```

Direct dispatcher equivalent:

```bash
node packages/plugin-codex/scripts/claude-companion.mjs adversarial-review <jobId-or-prefix>
```

Accepted flags:

- `--all` — search across all workspaces (default scope is the current workspace).
- `--json` — machine-readable structured findings output.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--model` — model for the fresh review session.
- `--effort` — effort level for the fresh review session.
- `--permission-mode` — permission mode override for the fresh review session.

Rejected at parse time:

- `--allow-edit` — Reviews are read-only. Error: `"--allow-edit is not applicable to review skills. Reviews are read-only."`
- `--add-dir` — the review session runs in the target job's workspace.
- `--mcp-config` — not accepted by adversarial review.
- `--name` — session names are generated automatically (`codex:<repo>:review-<jobId-short>`).

This starts a new Claude Code session and may count toward your Claude Code usage. A new job record is created with a `reviewOf` link to the original job. The review session operates in the target job's workspace and is given the original task description and the job's final output as context.

#### Session eligibility for `$claude-adversarial-review`

Adversarial review requires a `result` to be present on the job (something to evaluate). It can review terminal jobs whose original session is no longer live.

| Job status | Allowed |
| --- | --- |
| `awaiting_followup` (with result) | Yes |
| `completed` (with result) | Yes |
| `stopped` (with result) | Yes |
| `failed` (with result) | Yes |
| `orphaned` (with result) | Yes |
| `running` | No — wait for the job to finish |
| `queued`, `starting` | No — wait for the job to finish |
| `needs_input` | No — resolve the permission request first |
| Any status without a `result` | No — no output to evaluate |

### Structured output

Both review commands produce:

- A `verdict`: `pass`, `fail`, or `pass_with_findings`.
- A `findings` array, each with `severity` (`blocker`, `high`, `medium`, `low`, `nit`), `description`, optional `recommendation`, optional `file`, and optional `line`.

With `--json`, the output includes `verdict`, `findingsCount`, per-severity counts, and the full `findings` array. Claude is prompted to emit structured JSON. If the output does not match the expected format, the dispatcher wraps the raw text as a single `nit` finding so `--json` still returns a verdict and findings array.

### Review target selection

Review commands choose the latest completed non-review turn by default. They skip turns whose `prompt.summary` starts with `[review]` or `[adversarial-review]`. Reviewing a review is allowed but not the default workflow.

## Cost and prompt-cache wording

This v1 uses Claude Code background sessions and does not use `claude -p`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement.

## Known limitations

- **One fresh session per job** — each delegation creates a new background session. No session reuse across delegations.
- **Follow-up injection exists; `watch()` / streaming AsyncIterable is not implemented yet** — `$claude-followup` polls the sidecar for turn completion rather than streaming intermediate events. A later plan may add an AsyncIterable streaming API.
- **PTY is used internally for input injection only** — the plugin does not parse TUI bytes for semantic events. PTY output is drained into a bounded buffer for diagnostics only.
- **Sidecar reading is best-effort** — the `~/.claude/jobs/<shortId>/state.json` schema is undocumented. The plugin parses it defensively and falls back to `claude agents --json` and `claude logs <shortId>` when sidecar is absent or malformed.
- **No Claude Code channels yet** — prompt injection via channels is not supported.
- **Same-session review can be sycophantic** — `$claude-review` evaluates work within the same conversation and may be more prone to agreeing with its own prior output. Use `$claude-adversarial-review` for a structurally independent evaluation.
- **Structured review parsing is best-effort** — both review commands prompt Claude to emit structured JSON findings. If the output does not match the expected format, the raw text is wrapped as a single `nit` finding. No JSON-schema validation library is used.
- **Review-of-review recursion is not hard-prevented** — default target selection skips review turns, but no hard depth limit is enforced. A future plan may add explicit depth tracking.
- **No stop-time review gate yet** — plan 0005 will add this.
- **No benchmarked cost-savings claim** — we measure in plan 0004.
- **No committed marketplace packaging** — plan 0006 handles distribution polish.
- **Windows not supported or tested in plan 0001 or plan 0002** — development and testing are on macOS and Linux only.
- **Real Claude agents --json schema differs from mock** — plan 0001 supports the 2.1.149-style row format with derived short IDs (shortId is the first 8 hex characters of the UUID, stripped of dashes). The reconciler uses this derivation for matching.
- **No `claude ultrareview` wrapper** — the plugin review skills are local-session and fresh-session review flows; Anthropic's `claude ultrareview` remains a separate Claude Code review surface and is not wrapped by this plugin.

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

### Permission handoff during `$claude-followup`

If Claude asks for permission while `$claude-followup` is attached, the dispatcher prints a one-line prompt to stdout and waits for your answer on stdin. Type your response (e.g. `y` or `n`) and press Enter; the dispatcher writes that line back into the attached Claude session and continues waiting for turn completion.

In non-interactive contexts (no TTY on stdin), the dispatcher exits 1 with a message pointing at `claude attach <shortId>` so you can approve manually in your own terminal. There is no automatic approval and no bypass flag.

If the dispatcher times out waiting for a permission answer (default ~5 minutes), it emits a warning, exits 0, and leaves the Claude session running. `$claude-status` will continue to show the job in `needs_input`; you can resume the permission turn with `claude attach <shortId>`.

### `node-pty` build failure

Follow-up injection requires `node-pty` to load successfully. Run `$claude-setup` and inspect the "follow-up capability" group; if the `pty-build` probe is failing, the most common cause is a native-build error.

```
npm rebuild node-pty
```

If `npm rebuild` does not resolve the issue, see the `node-pty` upstream documentation for platform-specific guidance. Plan 0002 ships `node-pty` as a dispatcher dependency; prebuilt alternative packages mentioned in setup output are troubleshooting guidance only — the production dependency is `node-pty`.

### Sidecar missing or unreadable

The plugin reads Claude's per-job sidecar at `~/.claude/jobs/<shortId>/state.json` for richer status (turn `tempo`, `inFlight` counts, final-message hints). The schema is undocumented and treated as best-effort. If the sidecar file is missing, malformed, or unreadable, the plugin falls back to `claude agents --json` and `claude logs <shortId>`. `$claude-setup` reports a warning (not a hard fail) when `~/.claude/jobs/` is missing — sidecar absence does not gate `$claude-followup` from running.

### Follow-up prompt did not register (slow TTY warmup)

**Symptom**: `$claude-followup` exits with `Error: follow-up prompt did not register within 5000ms`, or the follow-up input appears to be silently ignored on the first attempt, requiring a retry.

**Cause**: After attaching to the Claude PTY, the dispatcher waits a short period for the terminal handshake to settle before writing the follow-up prompt. On slower machines or high-load environments, the default wait (2000 ms) may not be sufficient.

**Resolution**: Set `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` to a higher value before running `$claude-followup`:

```bash
CC_PLUGIN_CODEX_ATTACH_WARMUP_MS=4000 $claude-followup <jobId> "your follow-up prompt"
```

Acceptable values: any non-negative integer (milliseconds). Use `0` only in mock-driven test environments where the PTY responds instantly — setting it to `0` in a real Claude session will cause the follow-up prompt to be dropped.

### Tuning operator escape hatches

The plugin uses PTY attach for follow-up and same-session review input. Most users should not need tuning. If a local Claude Code version is slow to accept pasted input or to flush an assistant message after a turn completes, the following environment variables can help operators diagnose timing issues:

- `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` — wait before writing to `claude attach`. Default is tuned for current Claude Code versions.
- `CC_PLUGIN_CODEX_PROMPT_REGISTER_TIMEOUT_MS` — deadline for a follow-up or same-session review prompt to register on the attached Claude session.
- `CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS` — wait before `$claude-review` reads the reconciled review result file.

These are operator escape hatches, not normal workflow flags. Prefer the defaults unless you are debugging a local Claude Code timing issue.

### Review fails: job has no result

If the job did not produce a result before stopping (e.g., it was cancelled before completing its first turn), `$claude-adversarial-review` exits with:

```
No reviewable output. The job <status> before producing a result.
```

Wait for the job to complete and produce a result, or delegate a new job.

### Review fails: job is still running

`$claude-review` and `$claude-adversarial-review` both reject jobs in `running`, `queued`, or `starting` states. Wait for `$claude-status` to show `awaiting_followup` or `completed` before running a review.

### Same-session review fails: session no longer live

`$claude-review` requires a live idle Claude session. If the original session has exited or its TTL has elapsed, the dispatcher exits with:

```
Job <jobId> is completed and no live idle Claude session was found; use $claude-adversarial-review instead.
```

Use `$claude-adversarial-review <jobId>` instead. The adversarial variant starts a fresh session and does not require the original session to be alive.

### Same-session review may agree with its own prior answer

`$claude-review` runs within the same conversation as the original work. It may be more prone to agreeing with its own prior output. If you need a more independent evaluation, use `$claude-adversarial-review <jobId>` instead.

### Structured parser fallback: review returns one `nit` finding

If a review returns a single `nit` finding whose description contains raw text, Claude did not follow the structured output format. The raw response is still saved in the review turn result. You can inspect it with `$claude-result <jobId>`. Running `$claude-adversarial-review <jobId>` may produce a better-structured response in a fresh session.

### `$claude-followup` inside a terminal multiplexer (tmux / GNU screen)

**Symptom**: `$claude-followup` appears to hang or detach unexpectedly when run inside an outer `tmux` or GNU `screen` session.

**Cause**: `$claude-followup` attaches to the Claude PTY and uses `Ctrl+Z` (`0x1a`) as part of the attach/detach handshake. When the outer terminal multiplexer's escape sequence overlaps with `Ctrl+Z`, the signal can be intercepted by the multiplexer rather than forwarded to the Claude child process.

**Workarounds**:
- Run `$claude-followup` outside the multiplexer (e.g., in a plain terminal or a sub-shell that is not inside `tmux`/`screen`).
- Configure the multiplexer to use a different escape key so that `Ctrl+Z` is forwarded to the child. For `tmux`, this is done by changing `prefix` in `~/.tmux.conf`. For GNU `screen`, set `escape` in `~/.screenrc`.

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

- **Plan 0002** *(shipped)* — follow-up injection for Claude background jobs (`$claude-followup`, `awaiting_followup`, PTY-based input transport, sidecar best-effort enrichment).
- **Plan 0003** *(shipped)* — `$claude-review` and `$claude-adversarial-review` skills (same-session and fresh-session structured review, severity-rated findings, `reviewOf` job link)
- **Plan 0004** — benchmark harness and cost-savings measurement
- **Plan 0005** — stop-time hook and review gate integration
- **Plan 0006** — marketplace packaging and distribution polish
