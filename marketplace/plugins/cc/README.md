# cc - Delegate Codex Tasks to Claude Code

A Codex plugin that lets Codex delegate tasks to Claude Code background
sessions, with structured review and follow-up flows.

This is the cc-plugin-codex marketplace distribution copy. The development
source of truth lives at `packages/plugin-codex/` in the cc-plugin-codex
repository.

## Requirements

- Codex CLI with plugin marketplace support (`codex-cli 0.135.0` or later; 0.136.0 is the tested version).
- Claude Code installed and authenticated locally (`claude auth login`).
- Node.js available on `PATH` (Node 20 or later).

## Install

Install directly from GitHub with the bootstrap helper:

```bash
curl -fsSL https://raw.githubusercontent.com/wu-hongjun/cc-plugin-codex/main/install.sh | bash
```

Or run the underlying Codex marketplace commands directly:

```bash
codex plugin marketplace add https://github.com/wu-hongjun/cc-plugin-codex
codex plugin add "cc@cc-plugin-codex"
codex plugin list
```

This registers the repository root as a Codex Git marketplace. The root
marketplace manifest points Codex at the packaged plugin payload in
`marketplace/plugins/cc/`.

For contributor testing from a local checkout, add the local marketplace
tree instead:

```bash
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "cc@cc-plugin-codex-local"
codex plugin list
```

Replace `<repo-root>` with the absolute path to your cc-plugin-codex
checkout. For example, if you cloned to `~/code/cc-plugin-codex`, run:

```bash
codex plugin marketplace add "$HOME/code/cc-plugin-codex/marketplace"
codex plugin add "cc@cc-plugin-codex-local"
codex plugin list
```

## Verify

After install, list registered plugins and run the setup probe:

```bash
codex plugin list
```

Then open Codex inside any repository and run:

```
$claude-setup
```

`$claude-setup` checks Claude Code authentication, Codex version,
Node.js, and the background-session capabilities. Expected aggregate
status:

- `ok` — all dependencies ready
- `warn` — usable with caveats (e.g., daemon status unavailable)
- `fail` — something blocks delegation; follow the setup output

If `$claude-setup` reports `ok` or `warn`, the install is complete.

## Skills

After install, the plugin makes 15 skills available inside the Codex
TUI. Type the `$<name>` form at the Codex chat prompt.

- `$claude-setup` — probes the local environment (Claude Code auth,
  Codex version, Node.js, `node-pty` availability, background-session
  support). Returns `ok`, `warn`, or `fail` aggregate.
- `$claude-delegate` — starts a Claude Code background session with
  the provided prompt and returns a job id you can use with the other
  skills.
- `$claude-status` — lists delegated jobs in the current workspace
  with their live status. Use `--job <id> --json --compact` for one
  focused lookup, or `--limit <n>` to keep broad lists bounded.
- `$claude-result` — prints clean recorded output for a completed job
  or latest completed turn.
- `$claude-stop` — stops a running background session by id or
  unique prefix; also supports bulk forms like
  `--all-awaiting-followup`.
- `$claude-followup` — sends a follow-up instruction into an existing
  job using PTY attach.
- `$claude-review` — runs a same-session review of a Claude Code job.
- `$claude-adversarial-review` — runs a fresh-session adversarial
  review of a Claude Code job.
- `$claude-workflow` — triggers a Claude Code dynamic workflow and
  returns a job id for async result retrieval.
- `$claude-goal` — sets a goal condition for a Claude Code background
  session; the runtime tracks goal-completion automatically.
- `$claude-fork` — forks a Claude Code subagent for a directive;
  spawns a real subagent process via the `/fork` slash command.
- `$claude-batch` — runs a batch of parallel Claude Code instructions
  via the Batch Parallel Work Orchestration runtime.
- `$claude-deep-research` — runs a Claude Code `/deep-research` workflow
  with multi-agent fan-out, WebSearch, and cross-checked citations.
- `$claude-workflows` — lists and inspects Claude Code workflow
  background sessions started via `$claude-workflow`.
- `$claude-skills` — lists Claude Code skills visible to delegated
  Claude sessions, including user and installed-plugin skills.

### $claude-workflow

Triggers a Claude Code dynamic workflow for multi-phase, multi-agent tasks.

```
$claude-workflow "audit every fetch() call and propose a migration to HttpClient"
```

**Approval flow**: After the skill starts, Claude Code presents a YES / View Script / NO
dialog. The skill does NOT auto-approve. Run `claude attach <shortId>` to open the
approval dialog and select `Yes` to proceed (or `No` to cancel cleanly).

**Token-cost warning**: Workflows can spawn up to 16 concurrent and 1000 total
subagents. Review the generated script before approving.

Requires Claude Code v2.1.153+.

### $claude-goal

Sets a goal condition for a Claude Code background session. The runtime tracks
goal-completion automatically — Claude Code keeps working until the stated
condition is met or the session is stopped.

```
$claude-goal "all unit tests pass"
```

**Approval flow**: No interactive approval dialog is required. After the job ID
is printed, run `claude attach <shortId>` to watch progress.

**Token-cost notice**: Goal sessions iterate until the condition is satisfied.
Scope conditions tightly to avoid open-ended run time. Use `$claude-stop` to
terminate early.

Requires Claude Code v2.1.153+.

### $claude-fork

Forks a Claude Code subagent for a directive. The `/fork` slash command spawns a real
subagent process that executes the directive independently.

```
$claude-fork "build a proof-of-concept for the new rate-limiter"
```

**Approval flow**: No interactive approval dialog is required. After the job ID is
printed, run `claude attach <shortId>` to watch progress.

**Token-cost notice**: `/fork` directives spawn a full subagent — even a trivial
directive can consume 20-30k tokens. Consider scope before delegating.

Requires Claude Code v2.1.165+.

### $claude-batch

Runs a batch of parallel Claude Code instructions via the Batch Parallel Work
Orchestration runtime. The `/batch` slash command injects an orchestration system
prompt that drives research, planning, and parallel execution phases.

```
$claude-batch "migrate all usages of the old API to the new one"
```

**Approval flow**: No interactive approval dialog is required. After the job ID is
printed, run `claude attach <shortId>` to watch progress.

**Token-cost notice**: Batch sessions can spawn multiple parallel tool-calls and
subagents. Token usage scales with the number of affected files and instruction
complexity. Scope instructions tightly.

Requires Claude Code v2.1.165+.

### $claude-deep-research

Runs a Claude Code `/deep-research` workflow as a background job. The runtime
fans out parallel web searches, fetches sources, adversarially verifies claims,
and synthesizes a cited report.

```
$claude-deep-research "What are the main tradeoffs between B-trees and LSM-trees for write-heavy workloads?"
```

**Approval flow**: No interactive approval dialog is required. After the job ID
is printed, run `claude attach <shortId>` to watch progress.

**Token-cost notice**: Research-grade workflows can spawn multiple agents fanning
out parallel web searches (up to 16 concurrent, 1000 total). Prefer narrow,
specific questions over broad sweeps.

**WebSearch requirement**: The `/deep-research` workflow requires the `WebSearch`
tool, which is auto-available in standard Claude Code background sessions.

Requires Claude Code v2.1.167+.

### $claude-workflows

Lists and inspects Claude Code workflow background sessions started via
`$claude-workflow`. Read-only — no subprocess is spawned.

```
$claude-workflows
$claude-workflows <jobId>
```

**Scope note**: This skill surfaces `$claude-workflow`-started background
sessions (sessions whose name begins with `ultracode:`). The Claude Code
`/workflows` TUI panel is session-scoped TUI-only and is a distinct surface.

### $claude-skills

Lists Claude Code skills visible to delegated Claude sessions. Read-only — no
Claude Code session is spawned.

```
$claude-skills
$claude-skills --json
```

Use listed user-invocable skills in delegated prompts as `/skill-name`.

Each skill prints a usage message when invoked without the arguments
it needs (e.g., a job id). That usage message is normal behaviour —
it confirms the skill is registered and reachable. The full plugin
docs (including dispatcher subcommands and exit codes) are at
[`packages/plugin-codex/README.md`](../../../packages/plugin-codex/README.md)
in the cc-plugin-codex repository.

## Uninstall

Remove the installed plugin first, then remove the marketplace registration.

For the GitHub install:

```bash
codex plugin remove "cc@cc-plugin-codex"
codex plugin marketplace remove "cc-plugin-codex"
```

For a local contributor checkout:

```bash
codex plugin remove "cc@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
```

The first command removes the installed plugin from Codex. The second
removes the local marketplace registration. Running `codex plugin remove`
alone keeps the marketplace entry so you can re-install without re-adding
the marketplace.

Verify the uninstall:

```bash
codex plugin list
codex plugin marketplace list
```

After uninstall, the installed plugin should no longer appear in
`codex plugin list`, and the matching marketplace name should no longer
appear in `codex plugin marketplace list`. For local installs, that means
`cc@cc-plugin-codex-local` and `cc-plugin-codex-local`.

What uninstall does **not** do:

- It does not delete this Git checkout. A local cc-plugin-codex clone
  remains on disk; only the Codex plugin and marketplace registrations
  are removed.
- It does not delete existing plugin job records or Claude Code transcripts
  under your configured companion home. Those are owned by your local
  Claude Code installation, not by the Codex plugin registry, and persist
  after uninstall.

To remove the Git checkout itself, delete the directory manually. To clear
plugin job records, refer to your Claude Code session-management
documentation; uninstalling this plugin does not touch them.

After uninstall, an empty cache breadcrumb directory such as
`<CODEX_HOME>/plugins/cache/cc-plugin-codex/` or
`<CODEX_HOME>/plugins/cache/cc-plugin-codex-local/` may remain on disk.
This is normal Codex 0.136.0 behaviour — `codex plugin remove` empties
the per-version cache contents but does not prune the parent directories.
The empty breadcrumbs have no user-visible effect and do not block
reinstall.

## Smoke test

Before release, run the smoke checklist in
[`documentation/RELEASING.md`](../../../documentation/RELEASING.md).
It verifies the local marketplace install and all 15 skill names
(`$claude-setup`, `$claude-delegate`, `$claude-status`, `$claude-result`,
`$claude-stop`, `$claude-followup`, `$claude-review`,
`$claude-adversarial-review`, `$claude-workflow`, `$claude-goal`,
`$claude-fork`, `$claude-batch`, `$claude-deep-research`,
`$claude-workflows`, `$claude-skills`) under an isolated `CODEX_HOME`.

## Troubleshooting

### `codex plugin list` fails with "marketplace root does not contain a supported manifest"

This usually means a previously-added marketplace points at a path that
no longer exists (e.g., a deleted temp directory from an earlier smoke
test). Identify the stale entry from the error message and remove it:

```bash
codex plugin marketplace remove "<stale-marketplace-name>"
```

Then re-add the cc-plugin-codex marketplace with the install commands
above.

### `$claude-setup` is not recognized

Confirm the plugin install succeeded:

```bash
codex plugin list
```

If neither `cc@cc-plugin-codex` nor `cc@cc-plugin-codex-local` appears,
repeat the install commands. If `codex plugin list` itself fails, address
the stale-entry issue first.

### `$claude-setup` reports `warn` or `fail`

Read the detailed probe output. Common causes:

- Claude Code not authenticated — run `claude auth login`.
- Claude CLI not on `PATH` — verify `which claude` works.
- Codex too old — upgrade Codex to a version with plugin marketplace
  support (`codex-cli 0.135.0` or later; 0.136.0 is the tested version).

### Skill invocation fails with `ERR_MODULE_NOT_FOUND`

If the dispatcher reports
`Cannot find package '@cc-plugin-codex/runtime'` or similar when a
skill is invoked, the packaged runtime dependencies are missing from
the installed plugin cache. This is a packaging defect, not a
configuration problem on your machine.

End-user remediation: refresh the Git marketplace and re-install the
plugin. If you are using a local contributor checkout, re-install from
a fresh clone of the cc-plugin-codex repo. If the defect persists,
report it via the cc-plugin-codex issue tracker — the maintainer will
need to re-run `node tools/package-marketplace.mjs --write` and
re-publish the marketplace tree (see
[`documentation/RELEASING.md`](../../../documentation/RELEASING.md)).

### `$claude-result` reads raw transcript, not the display layer

`$claude-result` reads the session JSONL directly, not the text shown in
the Claude Code TUI. If you have a `MessageDisplay` hook installed in
Claude Code (v2.1.152+) that redacts assistant output, `$claude-result`
will still return the un-redacted content. This is by design. Prefer
`$claude-result` over `claude logs <shortId>` for clean output; logs are
the raw Claude Code stream and can include TUI control sequences around
permission prompts.

## Upgrade

Codex 0.136.0 does not expose an in-place `codex plugin upgrade` or
`codex plugin update` command. The plugin upgrade procedure is to remove
the installed plugin and re-add it from the same marketplace pointer.

For the GitHub install, refresh the Git marketplace snapshot first:

```bash
codex plugin marketplace upgrade "cc-plugin-codex"
codex plugin remove "cc@cc-plugin-codex"
codex plugin add "cc@cc-plugin-codex"
codex plugin list
```

Codex also exposes `codex plugin marketplace upgrade`, but that
subcommand refreshes Git marketplace snapshots only. It is not used
for the local checkout marketplace below.

After pulling new commits in the cc-plugin-codex repo, if the
marketplace path has not changed, run:

```bash
codex plugin remove "cc@cc-plugin-codex-local"
codex plugin add "cc@cc-plugin-codex-local"
```

If you moved or re-cloned the repository, refresh the marketplace
pointer first:

```bash
codex plugin remove "cc@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "cc@cc-plugin-codex-local"
```

Verify the upgrade:

```bash
codex plugin list
```

You should see `cc@cc-plugin-codex-local` with version
`0.3.10` (the current plugin version), reported as `installed, enabled`.
