# Codex Delegation - Delegate Tasks to Claude, Antigravity, Pi, or Qwen Code

A Codex plugin that lets Codex delegate tasks to Claude Code background sessions or exact Google
Antigravity conversations, Pi sessions, and Qwen Code sessions. Claude uses its background-session
APIs; Antigravity uses a detached,
persistent `agy --prompt-interactive` TUI with native permission cards, live attachment, structured
lifecycle hooks, default-parent orchestration, and bundled native subagent profiles.
Pi and Qwen use supervised headless structured-output processes with exact captured-session resume.
The Pi provider is installed and invoked as `omp`; `pi` is this plugin's provider and skill name.

This is the codex-delegation-plugin marketplace distribution copy. The development
source of truth lives at `packages/plugin-delegate/` in the codex-delegation-plugin
repository.

## Requirements

- Codex CLI with plugin marketplace support (0.136.0 or later; release smoke tested on 0.144.5).
- At least one provider CLI installed and authenticated locally: Claude Code (`claude`), Google
  Antigravity (`agy`), oh-my-pi (`omp`, exposed as Pi), or Qwen Code (`qwen`).
- Node.js available on `PATH` (Node 20 or later).

## Install

Install directly from GitHub with the bootstrap helper:

```bash
curl -fsSL https://raw.githubusercontent.com/wu-hongjun/codex-delegation-plugin/main/install.sh | bash
```

Or run the underlying Codex marketplace commands directly:

```bash
codex plugin marketplace add https://github.com/wu-hongjun/codex-delegation-plugin
codex plugin add "delegate@codex-delegation-plugin"
codex plugin list
```

This registers the repository root as a Codex Git marketplace. The root
marketplace manifest points Codex at the packaged plugin payload in
`marketplace/plugins/delegate/`.

For contributor testing from a local checkout, add the local marketplace
tree instead:

```bash
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
codex plugin list
```

Replace `<repo-root>` with the absolute path to your codex-delegation-plugin
checkout. For example, if you cloned to `~/code/codex-delegation-plugin`, run:

```bash
codex plugin marketplace add "$HOME/code/codex-delegation-plugin/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
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
$claude-doctor
$agy-setup
$agy-doctor
$pi-setup
$pi-doctor
$qwen-setup
$qwen-doctor
```

`$claude-setup` checks Claude Code authentication, Codex version,
Node.js, and the background-session capabilities. Expected aggregate
status:

- `ok` — all dependencies ready
- `warn` — usable with caveats (e.g., daemon status unavailable)
- `fail` — something blocks delegation; follow the setup output

The install is complete when the setup command for the provider you intend to use reports ready
(`ok` or an explained non-blocking `warn`). Before long-running, browser-backed, unattended, or
high-stakes Claude jobs, run `$claude-doctor`; it preflights Claude Code CLI auth, model access,
real Chrome readiness, workspace path, and permission-mode intent.

`$agy-setup` validates and installs the bundled Antigravity companion plugin, then checks the agy
version, persistent-interactive surface, exact resume flags, and terminal runtime without making a
model call. `$agy-doctor` also checks workspace access and native permission handoff. Use them when
Antigravity will handle delegated jobs.

`$pi-setup`/`$pi-doctor` and `$qwen-setup`/`$qwen-doctor` probe the corresponding binary,
structured-output support, exact resume capability, and headless permission constraints without
starting a delegated model turn.

## Choose a provider

- **Claude Code** — full lifecycle plus reviews, workflows, goals, forks, batches, research,
  discovery, and upgrade. Use native `claude attach` for interactive handoff.
- **Google Antigravity** — full lifecycle plus the same advanced plugin workflows and a persistent
  native TUI exposed by `$agy-attach`.
- **Pi** — the eight-skill core lifecycle through the oh-my-pi `omp` executable. Jobs are headless.
- **Qwen Code** — the eight-skill core lifecycle through `qwen`. Jobs are headless.

Pi and Qwen exact follow-up is deterministic, but neither provider currently exposes review,
orchestration, discovery, upgrade, or terminal-attachment skills.

## Skills

After install, the plugin makes 53 skills available inside the Codex
TUI. Type the `$<name>` form at the Codex chat prompt.

- `$claude-setup` — probes the local environment (Claude Code auth,
  Codex version, Node.js, `node-pty` availability, background-session
  support). Returns `ok`, `warn`, or `fail` aggregate.
- `$claude-doctor` — focused read-only preflight before long jobs. It separates
  CLI auth, Claude model access, browser readiness, workspace, and permission
  mode so Codex can stop before launching a doomed delegated job.
- `$claude-delegate` — starts a Claude Code background session with
  the provided prompt and returns a job id you can use with the other
  skills.
- `$claude-status` — lists delegated jobs in the current workspace
  with their live status. Use `--job <id> --json --compact` for one
  focused lookup, or `--limit <n>` to keep broad lists bounded.
- `$claude-wait` — waits for one job to reach a result state, blocker,
  or timeout; useful for automation that would otherwise poll status
  and then call result. Timeout JSON includes `timeoutRecovery` with
  exact status and partial-result commands.
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
- `$claude-upgrade` — refreshes or repairs the installed Codex Delegation plugin through
  Codex plugin commands.
- `$agy-setup` — validates the companion plugin and probes persistent TUI readiness without invoking a model.
- `$agy-doctor` — preflights exact resume, workspace, and native permission handoff.
- `$agy-delegate` — starts a detached, supervised persistent Antigravity TUI.
- `$agy-status` — lists or inspects stored Antigravity jobs.
- `$agy-attach` — attaches the current terminal to the live Antigravity TUI.
- `$agy-wait` — waits for an Antigravity job to settle or time out.
- `$agy-result` — prints the normalized result from an Antigravity job.
- `$agy-stop` — terminates the supervisor and its agy child process.
- `$agy-followup` — resumes the exact stored Antigravity conversation UUID.
- `$agy-review` — runs a structured review in the same conversation.
- `$agy-adversarial-review` — reviews in a fresh independent conversation.
- `$agy-workflow` — runs a phased and verified multi-agent workflow.
- `$agy-goal` — pursues a concrete completion condition and verifies it.
- `$agy-fork` — requests and verifies an independent Antigravity subagent.
- `$agy-batch` — orchestrates independent items in parallel and synthesizes them.
- `$agy-deep-research` — fans out, cross-checks, and cites primary sources.
- `$agy-workflows` — lists or inspects workflow-like parent jobs.
- `$agy-skills` — catalogs project, user, and plugin Antigravity skills.
- `$agy-upgrade` — refreshes or repairs the installed plugin.
- `$pi-setup` — probes oh-my-pi readiness through the `omp` executable.
- `$pi-doctor` — preflights exact resume, workspace, and headless permissions.
- `$pi-delegate` — starts a supervised Pi structured-output job.
- `$pi-status` — lists or inspects stored Pi jobs.
- `$pi-wait` — waits for a Pi job to settle or time out.
- `$pi-result` — prints normalized Pi output.
- `$pi-stop` — terminates a supervised Pi process.
- `$pi-followup` — resumes the exact stored Pi session ID.
- `$qwen-setup` — probes Qwen Code readiness through the `qwen` executable.
- `$qwen-doctor` — preflights exact resume, workspace, and headless permissions.
- `$qwen-delegate` — starts a supervised Qwen Code stream-JSON job.
- `$qwen-status` — lists or inspects stored Qwen Code jobs.
- `$qwen-wait` — waits for a Qwen Code job to settle or time out.
- `$qwen-result` — prints normalized Qwen Code output.
- `$qwen-stop` — terminates a supervised Qwen Code process.
- `$qwen-followup` — resumes the exact stored Qwen Code session ID.

Pi and Qwen currently provide this eight-skill core lifecycle only; review, orchestration,
discovery, upgrade, and terminal attachment remain Claude/Antigravity surfaces.

On macOS, do not run a bare `delegate` shell command for this plugin; `/usr/bin/delegate`
is Apple clang. Use the `$claude-*`, `$agy-*`, `$pi-*`, or `$qwen-*` skills, or use the exact dispatcher path
from JSON `meta.dispatcherPath` / `exactActionHints`.

## Antigravity Jobs

`$agy-delegate` launches `agy --prompt-interactive` under a detached PTY supervisor owned by the
plugin. The same TUI stays alive across turns. The supervisor records atomic state, a raw terminal
log, a private diagnostic log, and a normalized structured transcript. It captures the exact
conversation UUID and never uses global `agy --continue` state, so concurrent jobs cannot select
one another's recent conversation.

Supported launch options include `--model`, `--agent`, repeatable `--add-dir`, `--mode
accept-edits|plan`, `--sandbox`, `--project`, `--new-project`, and `--log-file`. The obsolete
print-only `--print-timeout` flag is rejected instead of being silently ignored.
Use `--provider auto` with the dispatcher to try Pi, Qwen Code, and Antigravity before falling back
to Claude Code.

## Pi And Qwen Jobs

`$pi-delegate` runs oh-my-pi's `omp` executable in JSON mode with a private session directory.
`$qwen-delegate` runs Qwen Code with stream-JSON output. Each supervisor records an exact provider
session ID, and `$pi-followup` or `$qwen-followup` resumes only that session rather than using
global recent-session state.

Both providers are headless in this plugin. Their jobs cannot surface a live permission prompt for
interactive attachment. Choose a supported permission policy before launching unattended work:
Pi maps `acceptEdits` to approval mode `write`; Qwen maps it to `auto-edit` and also supports
`plan`. Explicit bypass maps to `yolo` for both providers and can approve destructive operations,
so the plugin never adds it unless the operator asks.

Pi and Qwen launch requests use temporary owner-only (`0600`) files that the supervisor removes
immediately after reading, including after a parse failure. Normalized results include assistant
answer text but exclude thinking/reasoning blocks. Raw structured transcripts remain separate
diagnostic artifacts and may contain other provider-emitted events.

The Antigravity driver always adds the current Codex workspace with `--add-dir`. Native workspace-trust and
permission cards become durable `needs_input` job states. Run `$agy-attach <jobId>` to inspect and
answer them in the provider TUI; `Ctrl+]` detaches without stopping Antigravity. Narrow
`permissions.allow` rules and explicit `--dangerously-skip-permissions` remain available for
intentional unattended work. The plugin never approves a native prompt on the user's behalf.

The companion plugin contributes lifecycle hooks and five custom agents for workflow, goal,
subagent-fork, batch, and deep-research jobs. Child inspection and control remain native-TUI-only:
attach and use `/agents` to inspect, approve, or kill children. Antigravity's interactive `/fork`
branches a conversation; `$agy-fork` instead uses native subagent tools to match Claude's
independent-subagent operation.

See the official Antigravity documentation for the [`agy` CLI](https://antigravity.google/docs/cli/using)
and [permission rules](https://antigravity.google/docs/cli/permissions).

## Privacy

Delegation may send repository contents, prompts, command output, and file metadata to the selected
provider through the user's local account. The first delegation requires acknowledgment for that
workspace and provider. Provider acknowledgments are separate; use `--yes` only
for intentional non-interactive approval.

## Real Chrome And Permissions

Use `--chrome` when a delegated Claude job needs the real Chrome browser.
There is no `--real` flag. Real Chrome access uses Claude Code's Chrome
extension / connected-browser flow, which is separate from Codex's in-app
browser.

Some prompts cannot be answered safely by the background wrapper. If Claude
asks which Chrome browser to use, asks you to pick in the extension, or reaches
a passkey/login/user-gesture step, run `$claude-status --job <jobId> --json
--compact` and follow `waiting.userAction` (usually `claude attach <shortId>`).
Choose the Chrome profile that already has the needed logged-in session.

For trusted unattended shell/tool QA, you can explicitly start a fresh job with
`--bypass-permissions`, `--permission-mode bypassPermissions`, or
`--dangerously-skip-permissions`. Once you have opted into trusted unattended
Claude work for a task/session/project, Codex may reuse `--bypass-permissions`
on fresh local shell/tool automation jobs. That can reduce Claude tool
permission prompts, but it does not choose among Chrome browsers, complete
passkeys, inspect cookies/passwords/session stores, or replace local user
gestures.

When a job is already blocked, run `$claude-status --job <jobId> --json
--compact`. Blocked jobs include `operatorState`, `blockedOn`,
`actionHints.restartWithBypass`, `actionHints.stop`, and
`actionHints.cleanupBlocked`. These hints avoid the bare `delegate` shell command on
macOS and use the stable dispatcher path when it is available. Restart commands
require a fresh prompt because delegate stores prompt metadata, not the full original
prompt text.

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

### $claude-upgrade

Refreshes or repairs the installed Codex Delegation plugin through Codex's plugin manager.
Without `--yes`, it prints the exact plan and makes no changes.

```
$claude-upgrade
$claude-upgrade --yes
$claude-upgrade --json
```

The `--yes` form auto-detects public Git vs local cached installs. Use
`--public` or `--local` only when you need to override that target. After a
successful refresh, run `$claude-setup`.

Each skill prints a usage message when invoked without the arguments
it needs (e.g., a job id). That usage message is normal behaviour —
it confirms the skill is registered and reachable. The full plugin
docs (including dispatcher subcommands and exit codes) are at
[`packages/plugin-delegate/README.md`](../../../packages/plugin-delegate/README.md)
in the codex-delegation-plugin repository.

## Uninstall

Remove the installed plugin first, then remove the marketplace registration.

For the GitHub install:

```bash
codex plugin remove "delegate@codex-delegation-plugin"
codex plugin marketplace remove "codex-delegation-plugin"
```

For a local contributor checkout:

```bash
codex plugin remove "delegate@codex-delegation-plugin-local"
codex plugin marketplace remove "codex-delegation-plugin-local"
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
`delegate@codex-delegation-plugin-local` and `codex-delegation-plugin-local`.

What uninstall does **not** do:

- It does not delete this Git checkout. A local codex-delegation-plugin clone
  remains on disk; only the Codex plugin and marketplace registrations
  are removed.
- It does not delete plugin job records under
  `~/.codex/codex-delegation-plugin` or provider-owned transcripts. Those
  records are outside the Codex plugin registry and persist after uninstall.

To remove the Git checkout itself, delete the directory manually. To clear
plugin job records, remove the relevant files under
`~/.codex/codex-delegation-plugin/jobs`; uninstalling this plugin does not
touch them.

After uninstall, an empty cache breadcrumb directory such as
`<CODEX_HOME>/plugins/cache/codex-delegation-plugin/` or
`<CODEX_HOME>/plugins/cache/codex-delegation-plugin-local/` may remain on disk.
This is normal Codex plugin-manager behaviour — `codex plugin remove` empties
the per-version cache contents but does not prune the parent directories.
The empty breadcrumbs have no user-visible effect and do not block
reinstall.

## Smoke test

Before release, run the smoke checklist in
[`documentation/RELEASING.md`](../../../documentation/RELEASING.md).
It verifies the local marketplace install and all 53 skill names
(`$claude-setup`, `$claude-doctor`, `$claude-delegate`, `$claude-status`, `$claude-wait`, `$claude-result`,
`$claude-stop`, `$claude-followup`, `$claude-review`,
`$claude-adversarial-review`, `$claude-workflow`, `$claude-goal`,
`$claude-fork`, `$claude-batch`, `$claude-deep-research`,
`$claude-workflows`, `$claude-skills`, `$claude-upgrade`, `$agy-setup`, `$agy-delegate`,
`$agy-status`, `$agy-wait`, `$agy-result`, `$agy-stop`) under an isolated `CODEX_HOME`.

## Troubleshooting

### `codex plugin list` fails with "marketplace root does not contain a supported manifest"

This usually means a previously-added marketplace points at a path that
no longer exists (e.g., a deleted temp directory from an earlier smoke
test). Identify the stale entry from the error message and remove it:

```bash
codex plugin marketplace remove "<stale-marketplace-name>"
```

Then re-add the codex-delegation-plugin marketplace with the install commands
above.

### `$claude-setup` is not recognized

Confirm the plugin install succeeded:

```bash
codex plugin list
```

If neither `delegate@codex-delegation-plugin` nor `delegate@codex-delegation-plugin-local` appears,
repeat the install commands. If `codex plugin list` itself fails, address
the stale-entry issue first.

### `$claude-setup` reports `warn` or `fail`

Read the detailed probe output. Common causes:

- Claude Code not authenticated — run `claude auth login`.
- Claude CLI not on `PATH` — verify `which claude` works.
- Codex too old — upgrade Codex to a version with plugin marketplace
  support (0.136.0 or later; release smoke tested on 0.144.5).

### Skill invocation fails with `ERR_MODULE_NOT_FOUND`

If the dispatcher reports
`Cannot find package '@codex-delegation/runtime'` or similar when a
skill is invoked, the packaged runtime dependencies are missing from
the installed plugin cache. This is a packaging defect, not a
configuration problem on your machine.

End-user remediation: refresh the Git marketplace and re-install the
plugin. If you are using a local contributor checkout, re-install from
a fresh clone of the codex-delegation-plugin repo. If the defect persists,
report it via the codex-delegation-plugin issue tracker — the maintainer will
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

If `claude logs <shortId>` returns `job not found` after a background job
exits, use `$claude-status`, `$claude-wait`, `$claude-result`, or
`$claude-result --partial` instead. Post-exit Claude logs lookup is a
best-effort Claude Code surface; the plugin-owned status/result artifacts are
the supported operator path.

## Upgrade

The Codex plugin manager does not expose an in-place `codex plugin upgrade` or
`codex plugin update` command. The plugin upgrade procedure is to remove
the installed plugin and re-add it from the same marketplace pointer.

For the GitHub install, refresh the Git marketplace snapshot first:

```bash
codex plugin marketplace upgrade "codex-delegation-plugin"
codex plugin remove "delegate@codex-delegation-plugin"
codex plugin add "delegate@codex-delegation-plugin"
codex plugin list
```

After `$claude-upgrade --yes`, an already-running Codex session can still display
old versioned `SKILL.md` paths. Restart Codex to refresh the generated skill
catalog, or use the stable dispatcher path:
`~/.codex/plugins/cache/codex-delegation-plugin/delegate/current/scripts/delegate.mjs`.

Codex also exposes `codex plugin marketplace upgrade`, but that
subcommand refreshes Git marketplace snapshots only. It is not used
for the local checkout marketplace below.

After pulling new commits in the codex-delegation-plugin repo, if the
marketplace path has not changed, run:

```bash
codex plugin remove "delegate@codex-delegation-plugin-local"
codex plugin add "delegate@codex-delegation-plugin-local"
```

If you moved or re-cloned the repository, refresh the marketplace
pointer first:

```bash
codex plugin remove "delegate@codex-delegation-plugin-local"
codex plugin marketplace remove "codex-delegation-plugin-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
```

Verify the upgrade:

```bash
codex plugin list
```

You should see `delegate@codex-delegation-plugin-local` with version
`0.6.1` (the current plugin version), reported as `installed, enabled`.
