# Codex Delegation Plugin

## What this is

A Codex plugin that delegates tasks to Claude Code background sessions, exact Google Antigravity
conversations, oh-my-pi sessions, or Qwen Code sessions. It tracks all four providers under
`~/.codex/codex-delegation-plugin` and routes each operation through the stored job's driver.

Claude uses its native background-session APIs. Antigravity uses a plugin-owned detached PTY
supervisor around a persistent `agy --prompt-interactive` TUI. Pi and Qwen Code use detached
supervisors around their structured-output modes. Pi's installed executable is `omp`; `pi` is the
provider and skill name used by this plugin.
A bundled Antigravity companion plugin supplies lifecycle hooks, transcript discovery, and native
subagent profiles; its persistent TUI remains available for permission input and child control.

## Current v1 scope

Fifty-three skills are available:

- **`$claude-setup`** — probe dependencies and report status (ok/warn/fail)
- **`$claude-doctor`** — preflight Claude Code auth, model access, browser readiness, workspace, and permission mode before long jobs
- **`$claude-delegate`** — start a new background session for a task
- **`$claude-status`** — list all delegated jobs in the current workspace
- **`$claude-wait`** — wait for one delegated job to produce a result, blocker, or timeout
- **`$claude-result`** — print the final answer and transcript/log paths for a completed job
- **`$claude-stop`** — terminate a background session explicitly
- **`$claude-followup`** — send a follow-up instruction to an existing Claude background job (added in plan 0002)
- **`$claude-review`** — send a structured review prompt into the same Claude Code session (added in plan 0003)
- **`$claude-adversarial-review`** — run a structured review in a fresh independent session (added in plan 0003)
- **`$claude-workflow`** — trigger a Claude Code dynamic workflow and return a job ID for async result retrieval (added in plan 0008)
- **`$claude-goal`** — set a goal condition for a Claude Code background session; the runtime tracks goal-completion automatically (added in plan 0010)
- **`$claude-fork`** — fork a Claude Code subagent for a directive; spawns a real subagent process (added in plan 0011)
- **`$claude-batch`** — run a batch of parallel Claude Code instructions via the Batch Parallel Work Orchestration runtime (added in plan 0011)
- **`$claude-deep-research`** — run a Claude Code `/deep-research` workflow with multi-agent fan-out, WebSearch, and cross-checked citations (added in plan 0013)
- **`$claude-workflows`** — list and inspect Claude Code workflow background sessions started via `$claude-workflow` (added in plan 0016)
- **`$claude-skills`** — list Claude Code skills visible to delegated Claude sessions
- **`$claude-upgrade`** — refresh or repair the installed Codex Delegation plugin through Codex plugin commands
- **`$agy-setup`** — validate/install the companion plugin and check `agy`, exact resume, and PTY readiness without a model call
- **`$agy-doctor`** — preflight exact conversation resume, workspace, and permission readiness
- **`$agy-delegate`** — start a supervised persistent Antigravity TUI job
- **`$agy-status`** — list Antigravity jobs in the current workspace
- **`$agy-attach`** — attach a user-owned terminal to the live Antigravity TUI
- **`$agy-wait`** — wait for an Antigravity job to settle or time out
- **`$agy-result`** — read captured Antigravity output
- **`$agy-stop`** — terminate a supervised Antigravity process
- **`$agy-followup`** — continue the exact conversation UUID recorded for a job
- **`$agy-review`** — run a structured review in the same Antigravity conversation
- **`$agy-adversarial-review`** — run an independent review in a fresh Antigravity conversation
- **`$agy-workflow`** — run a phased, verified multi-agent Antigravity workflow
- **`$agy-goal`** — pursue a concrete verified completion condition
- **`$agy-fork`** — request and verify an independent Antigravity subagent
- **`$agy-batch`** — orchestrate independent work items in parallel
- **`$agy-deep-research`** — fan out, cross-check, and synthesize source-linked research
- **`$agy-workflows`** — list and inspect recorded workflow-like parent jobs
- **`$agy-skills`** — discover project, user, and plugin Antigravity skills
- **`$agy-upgrade`** — refresh or repair the installed Codex Delegation plugin
- **`$pi-setup`, `$pi-doctor`, `$pi-delegate`, `$pi-status`, `$pi-wait`, `$pi-result`, `$pi-stop`, `$pi-followup`** — probe and supervise exact Pi sessions through `omp`
- **`$qwen-setup`, `$qwen-doctor`, `$qwen-delegate`, `$qwen-status`, `$qwen-wait`, `$qwen-result`, `$qwen-stop`, `$qwen-followup`** — probe and supervise exact Qwen Code sessions through `qwen`

### Provider capability summary

| Provider | Transport | Exact follow-up | Interactive handoff | Shipped skill surface |
| --- | --- | --- | --- | --- |
| Claude Code | Native background session | Live session attach | `claude attach` | 18 skills: core lifecycle plus advanced workflows |
| Google Antigravity | Persistent supervised TUI | Same TUI and captured UUID | `$agy-attach` | 19 skills: core lifecycle plus advanced workflows and attach |
| Pi | Headless `omp` JSON process | Captured session ID | None | 8 core lifecycle skills |
| Qwen Code | Headless `qwen` stream-JSON process | Captured session ID | None | 8 core lifecycle skills |

The common core is setup, doctor, delegate, status, wait, result, stop, and follow-up. Review,
orchestration, discovery, upgrade, and terminal attachment are not part of the current Pi/Qwen
surface.

Lifecycle: `delegate` creates one fresh background session; `status` reconciles live state from `claude agents --json` and per-job sidecar; `wait` polls one job until it produces a result, blocker, or timeout; `result` prints the final assistant message of the most recent completed turn; `followup` injects the next instruction into an existing background session via internal PTY attach; `stop` is optional cleanup. After a completed turn, jobs may enter `awaiting_followup` for up to 30 minutes; while in that state, `$claude-followup` is the next-turn entry point. After the TTL elapses, status displays as `completed`, but an explicit follow-up may still attempt to attach if the session is still live.

Antigravity lifecycle: `delegate --provider agy` starts one detached persistent TUI and private diagnostic log, captures the exact conversation UUID, and stores it with the job. `status`, `wait`, `result`, `attach`, and `stop` share the normal lifecycle. `followup` sends the next turn through the same live PTY, preserving immutable per-turn results. The plugin intentionally does not use global `agy --continue` state.

Pi and Qwen lifecycle: `delegate --provider pi|qwen` starts a detached structured-output process and
stores its exact captured session ID. `status`, `wait`, `result`, and `stop` use the shared job
lifecycle; `followup` starts the next supervised turn with that exact ID. The drivers never use a
workspace-global “most recent session” selector. This initial core-lifecycle surface does not
include review, orchestration, discovery, upgrade, or terminal attachment skills.

Pi and Qwen jobs are headless. If either CLI asks for permission interactively, the plugin cannot
attach a live terminal to answer it. Choose an explicit, provider-supported permission mode before
launching unattended work; bypass/yolo modes are dangerous and are never added unless the operator
explicitly requests them.

Both headless supervisors write launch requests with owner-only (`0600`) permissions and unlink
them immediately after the runner reads them, including on parse failure. Normalized results select
assistant answer text and exclude thinking/reasoning blocks. Raw structured transcripts are
separate diagnostic artifacts and may retain other provider-emitted events.

The driver adds the current Codex workspace to every agy session with `--add-dir`. Native workspace
trust and permission cards become a durable `needs_input` job state. `$agy-attach` replays the live
TUI and proxies user keystrokes, including `/agents`, `/tasks`, and permission decisions; `Ctrl+]`
detaches without stopping the provider. The plugin never approves on the user's behalf.

## Requirements

- **Node.js 20+** (CI covers Node 20 and 22)
- **npm** (comes with Node)
- **Codex CLI** with plugin marketplace support (0.136.0 or later; release smoke tested on 0.144.5)
- **At least one provider CLI**, authenticated locally: Claude Code (release smoke tested on
  2.1.211), Antigravity `agy` (tested on 1.1.4), oh-my-pi `omp`, or Qwen Code `qwen`
- **Provider setup probe:** `$claude-setup` feature-probes Claude background-session support;
  `$agy-setup` checks the Antigravity binary, interactive surface, exact resume, PTY runtime, and
  companion plugin; `$pi-setup` and `$qwen-setup` probe their binaries and structured-output
  capabilities without starting a delegated model turn

## Install locally

The primary install path is the committed local marketplace at the
repo root. Plan 0006 codified this flow as the supported way to add
the plugin to Codex.

```bash
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
codex plugin list
```

That's the whole install. The committed `marketplace/` tree under
the repo root contains the byte-identical plugin payload at
`marketplace/plugins/delegate/`, the marketplace root
manifest at `marketplace/.agents/plugins/marketplace.json`, and the
bundled runtime / driver / `node-pty` dependencies under
`marketplace/plugins/delegate/node_modules/` (Plan 0006
T9.5) needed for the cached install to execute end-to-end.

The streamlined end-user surface for this install is
[`marketplace/plugins/delegate/README.md`](../../marketplace/plugins/delegate/README.md).
That file is short, install/use/troubleshoot focused, and ships
alongside the marketplace tree itself. The full plugin docs (this
README) cover the runtime, dispatcher, skills, and architecture in
depth.

For release maintainers, the canonical release-day checklist —
prerequisites, version bump, packaging, smoke test, CI verification,
tagging, post-release — is at
[`documentation/RELEASING.md`](../../documentation/RELEASING.md).
It is the single source of truth for the `node tools/package-marketplace.mjs --write` / `--check` workflow and the `v0.x.y` tag procedure (Plan 0006 T10 + T11).

## Setup

Run the setup skill to probe your environment:

```text
$claude-setup
```

Expected aggregate status:

- `ok` — all dependencies ready
- `warn` — usable with caveats (e.g., `--bg` not advertised in `--help`, or daemon status unavailable; the runtime path uses direct `--bg` invocation and does not require daemon status)
- `fail` — delegate refuses to start

Direct dispatcher fallback (if the skill is unavailable):

```bash
node packages/plugin-delegate/scripts/delegate.mjs setup
```

For Antigravity, run the separate, no-model-call probe:

```text
$agy-setup
```

```bash
node packages/plugin-delegate/scripts/delegate.mjs agy-setup
```

## Commands and skills

### $claude-setup

Check codex-delegation-plugin readiness. Probes Node version, Codex, Claude binary, authentication, background-session support, agents JSON, transcript paths, and workspace permissions.

```text
$claude-setup
```

### $claude-doctor

Run this before long-running, browser-backed, unattended, or high-stakes
delegated jobs:

```text
$claude-doctor
```

The doctor preflight is read-only. It checks Claude Code CLI auth, Claude model
access, real Chrome launch readiness when requested, the current workspace path,
and permission-mode intent. JSON output distinguishes `cli_auth`,
`model_access`, `browser_auth`, `workspace`, and `permissions` checks so Codex
can stop before launching a doomed long job.

For browser-backed work, pass `--real` to the dispatcher form:

```bash
node "<plugin-root>/scripts/delegate.mjs" doctor --claude-access --real --json
```

`--real` is a doctor-only alias for the future `--chrome` launch path. It does
not inspect cookies, passwords, or Chrome session stores, and it cannot choose
among connected Chrome profiles.

### $claude-delegate

Delegate a coding task to Claude Code. Starts a new background session and prints the job ID.

```text
$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."
```

Job ID from successful delegation: `job_mpt98g9g_b61e09f1` (shown in output as `Job ID:`).

Interactive privacy acknowledgement: on first delegation in a workspace, you will be asked to confirm that delegating may send repository contents, prompts, command output, and Claude Code context to Anthropic. This is interactive by default; you can skip the prompt with `--yes` if you have intentionally pre-approved the policy.

Fresh-session commands (`$claude-delegate`, `$claude-workflow`, `$claude-goal`, `$claude-fork`, `$claude-batch`, `$claude-deep-research`, and `$claude-adversarial-review`) validate startup flags before launching Claude Code. Unknown flags fail with exit 2 instead of consuming the prompt. `--bypass-permissions` and `--dangerously-skip-permissions` are accepted as aliases for `--permission-mode bypassPermissions`; they launch Claude Code with its literal `--dangerously-skip-permissions` flag and should be used only when the operator explicitly chooses an unattended trusted run. Additional Claude Code startup controls such as `--agent`, `--agents`, `--allowedTools`, `--disallowedTools`, `--tools`, `--settings`, `--setting-sources`, `--strict-mcp-config`, `--append-system-prompt`, `--system-prompt`, `--plugin-dir`, `--plugin-url`, `--bare`, and `--safe-mode` can be forwarded when explicitly requested.

For unattended expert-agent QA that intentionally lets Claude Code inspect a
trusted local checkout with shell commands, pass `--permission-mode
bypassPermissions`, `--bypass-permissions`, or `--dangerously-skip-permissions`
explicitly. Once the operator has approved trusted unattended Claude work for a
task/session/project, Codex can reuse `--bypass-permissions` on future fresh
local shell/tool automation jobs. Without it, Claude Code may pause on a
permission prompt; inspect the job with `$claude-status --job <jobId> --json
--compact` and attach with the returned `actionHints.attach` command.
If a bypass-launched job still asks for interactive input immediately, the
dispatcher stops the start attempt, marks the job failed, and prints a clear
non-zero error instead of returning a blocked background worker.

Real Chrome browser work uses Claude Code's `--chrome` startup flag. There is
no `--real` flag, and the real-browser path is separate from Codex's in-app
browser. If Claude asks which connected Chrome browser to use, asks you to pick
in the extension, or reaches a passkey/login/user-gesture step, inspect the job
with `$claude-status --job <jobId> --json --compact` and surface
`waiting.userAction` to the operator. The background wrapper cannot safely
choose among Chrome profiles or complete local user gestures. Permission-mode
flags reduce Claude tool prompts for trusted unattended runs, but they do not
select a browser or replace passkey/extension interaction.

### $claude-workflow

Trigger a Claude Code dynamic workflow. Workflows use Claude Code's built-in workflow engine to plan and execute multi-phase, multi-agent tasks and return a job ID for async result retrieval via `$claude-result` and `$claude-status`.

```text
$claude-workflow "audit every fetch() call and propose a migration to HttpClient"
```

**Requires Claude Code v2.1.153+.** Dynamic workflows were confirmed available on v2.1.153 in the empirical TUI smoke test at `documentation/research/20260604-claude-code-w22-audit/artifacts/workflow-tui-smoke-2-1-153-20260605.txt`.

**Approval flow**: After `$claude-workflow` starts the background session, Claude Code presents an interactive YES / View Script / NO approval dialog inside its own TUI. The skill does NOT auto-approve. To approve, run:

```bash
claude attach <shortId>
```

Use the printed `Claude session` short ID, not the plugin `Job ID`, and select `Yes` (or `View raw script`, then `Yes`) in the approval dialog. Selecting `No` cancels the workflow cleanly with no subagents spawned.

**Token-cost warning**: Workflows can spawn up to 16 concurrent and 1000 total subagents. Token usage scales with the complexity of the requested task. Review the generated script before approving.

Accepted flags (forwarded to the delegate path):

- `--model` — model override for the workflow session.
- `--effort` — effort level.
- `--permission-mode` — permission mode override.
- `--dangerously-skip-permissions` — alias for `--permission-mode bypassPermissions`.
- `--add-dir` — additional directory to expose to Claude Code.
- `--mcp-config` — MCP configuration file path.
- `--name` — session name override.
- `--yes` — record the privacy acknowledgement non-interactively (does NOT auto-approve the workflow approval dialog).

Rejected at parse time:

- `--allow-edit` — not accepted by `$claude-workflow`. Workflows request their own permissions interactively at approval time; this flag is not applicable.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs workflow "audit every fetch() call and propose a migration to HttpClient"
```

### $claude-goal

Set a goal condition for a Claude Code background session. The runtime tracks goal-completion automatically — Claude Code keeps working until the stated condition is met or the session is stopped.

```text
$claude-goal "all unit tests in src/utils/ pass"
```

**Requires Claude Code v2.1.153+.** The `/goal` slash command is confirmed available on v2.1.153 per empirical probe evidence at `documentation/plan/0010-20260605-codex-power-user/artifacts/oq-a-probe-20260605.txt`.

**Approval flow**: After `$claude-goal` starts the background session, the `/goal <condition>` slash command is injected as the prompt. The runtime tracks goal-completion automatically; no interactive approval dialog is required. To watch progress, run:

```bash
claude attach <shortId>
```

Use the printed `Claude session` short ID, not the plugin `Job ID`.

**Cost notice**: Goal sessions iterate until the condition is satisfied or stopped. Consider scoping conditions tightly to avoid open-ended run time. Use `$claude-stop` to terminate early.

Accepted flags (forwarded to the delegate path):

- `--model` — model override for the goal session.
- `--effort` — effort level.
- `--permission-mode` — permission mode override.
- `--add-dir` — additional directory to expose to Claude Code.
- `--mcp-config` — MCP configuration file path.
- `--name` — session name override.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--json` — machine-readable output.

Rejected at parse time:

- `--allow-edit` — not accepted by `$claude-goal`. Goal sessions request their own permissions automatically; this flag is not applicable.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs goal -- "all unit tests in src/utils/ pass"
```

### $claude-fork

Fork a Claude Code subagent for a directive. The `/fork` slash command spawns a real subagent process that executes the directive independently.

```text
$claude-fork "build a proof-of-concept for the new rate-limiter"
```

**Requires Claude Code v2.1.165+.** The `/fork` slash command is confirmed available on v2.1.165 per empirical probe evidence at `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-b-fork-probe-20260605.txt`.

**Approval flow**: After `$claude-fork` starts the background session, the `/fork <directive>` slash command is injected as the prompt. The runtime spawns a real subagent; the parent session completes when the subagent finishes. To watch progress, run:

```bash
claude attach <shortId>
```

Use the printed `Claude session` short ID, not the plugin `Job ID`.

**Cost notice**: `/fork` directives spawn a full subagent — even a trivial directive can consume 20-30k tokens. Consider scope before delegating. Use `$claude-stop` to terminate a fork session early.

Accepted flags (forwarded to the delegate path):

- `--model` — model override for the fork session.
- `--effort` — effort level.
- `--permission-mode` — permission mode override.
- `--add-dir` — additional directory to expose to Claude Code.
- `--mcp-config` — MCP configuration file path.
- `--name` — session name override.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--json` — machine-readable output.

Rejected at parse time:

- `--allow-edit` — not accepted by `$claude-fork`. Fork sessions request their own permissions automatically; this flag is not applicable.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs fork -- "build a proof-of-concept for the new rate-limiter"
```

### $claude-batch

Run a batch of parallel Claude Code instructions via the Batch Parallel Work Orchestration runtime. The `/batch` slash command injects a `# Batch: Parallel Work Orchestration` system prompt that drives research, planning, and parallel execution phases.

```text
$claude-batch "migrate all usages of the old API to the new one"
```

**Requires Claude Code v2.1.165+.** The `/batch` slash command is confirmed available on v2.1.165 per empirical probe evidence at `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-c-batch-probe-20260605.txt`.

**Approval flow**: After `$claude-batch` starts the background session, the `/batch <instruction>` slash command is injected as the prompt. The runtime injects the orchestration system prompt and sets its own tool-access policy. No interactive approval dialog is required. To watch progress, run:

```bash
claude attach <shortId>
```

Use the printed `Claude session` short ID, not the plugin `Job ID`.

**Cost notice**: Batch sessions can spawn multiple parallel tool-calls and subagents. Token usage scales with the number of affected files and the complexity of the instruction. Consider scoping instructions tightly. Use `$claude-stop` to terminate a batch session early.

Accepted flags (forwarded to the delegate path):

- `--model` — model override for the batch session.
- `--effort` — effort level.
- `--permission-mode` — permission mode override.
- `--add-dir` — additional directory to expose to Claude Code.
- `--mcp-config` — MCP configuration file path.
- `--name` — session name override.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--json` — machine-readable output.

Rejected at parse time:

- `--allow-edit` — not accepted by `$claude-batch`. Batch sessions use the orchestration runtime for permissions; this flag is not applicable.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs batch -- "migrate all usages of the old API to the new one"
```

### $claude-deep-research

Run a Claude Code `/deep-research` workflow as a background job. The `/deep-research` slash command triggers Claude's bundled workflow runtime, which fans out parallel web searches, fetches sources, adversarially verifies claims, and synthesizes a cited report.

```text
$claude-deep-research "What are the main tradeoffs between B-trees and LSM-trees for write-heavy workloads?"
```

**Requires Claude Code v2.1.167+.** The `/deep-research` slash command is confirmed available on v2.1.167 per empirical probe evidence at `documentation/plan/0013-20260606-workflow-coverage-gaps/artifacts/oq-b-deep-research-probe-20260606.txt`.

**Approval flow**: After `$claude-deep-research` starts the background session, the `/deep-research <question>` slash command is injected as the prompt. Current Claude Code versions may present a dynamic workflow approval gate before subagents start. To watch or approve if prompted, run:

```bash
claude attach <shortId>
```

Use the printed `Claude session` short ID. `--yes` only acknowledges the plugin privacy prompt; it does not approve Claude Code workflow gates.

**WebSearch requirement**: The `/deep-research` workflow requires the `WebSearch` tool. This tool is auto-available in standard Claude Code background sessions.

**Cost notice**: Research-grade workflows use significant tokens. The runtime can spawn multiple agents fanning out parallel web searches, subject to limits of 16 concurrent agents and 1000 total agents per run. Recommend narrow, specific questions over broad sweeps. Use `$claude-stop` to terminate a deep-research session early.

Accepted flags (forwarded to the delegate path):

- `--model` — model override for the deep-research session.
- `--effort` — effort level.
- `--permission-mode` — permission mode override.
- `--add-dir` — additional directory to expose to Claude Code.
- `--mcp-config` — MCP configuration file path.
- `--name` — session name override.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--json` — machine-readable output.

Rejected at parse time:

- `--allow-edit` — not accepted by `$claude-deep-research`. Workflow-runtime operations are session-init, not single-turn delegations; this flag is not applicable.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs deep-research -- "What are the main tradeoffs between B-trees and LSM-trees for write-heavy workloads?"
```

### $claude-status

List all delegated jobs in the current workspace with their live status.

```text
$claude-status
$claude-status --job <jobId> --json --compact
$claude-status --limit 20 --stored-status running
```

Shows job ID, status (running/completed/stopped/orphaned), Claude session ID, and session name.
Use `--job` for a focused lookup when you already have the job ID. Use
`--limit <n>` to keep broad lists bounded in workspaces with many historical
jobs; `--limit 0` means no limit. `--stored-status <state>` filters by stored job
status before the list is reconciled.

Human status output includes a header row, a relative age column, and a footer
with `claude attach <shortId>` when any listed job needs input.

Compact JSON includes `waiting.kind` plus `actionHints` for the next stable
commands: `status`, `result`, `partialResult`, `stop`, `followup`, `attach`,
and `logs`. On macOS, `actionHints` intentionally avoid the bare `delegate` shell
command because `/usr/bin/delegate` is Apple clang; when the dispatcher path is known
they use `node <dispatcher>/scripts/delegate.mjs ...`. `exactActionHints` repeats the
same dispatcher-safe commands for automation. If `waiting.kind` is
`"permission"`, attach with
`actionHints.attach`. For blocked jobs, compact JSON also includes
`operatorState`, `blockedOn`, `actionHints.restartWithBypass`, and
`actionHints.cleanupBlocked`. Use the `actionHints.restartWithBypass` command
for an explicit trusted unattended retry, or `actionHints.cleanupBlocked` to
clean up blocked jobs in the current workspace. Restart commands require a
fresh prompt because delegate stores prompt metadata, not the full original prompt
text. If `partialResult` is present, use `$claude-result <jobId> --partial` or
the `actionHints.partialResult` command to read recorded progress without
waiting for a terminal state. Check `result.isPartial` and
`latestTurn.resultState` before treating recorded output as final.

When status runs from a codex-delegation-plugin checkout, JSON `meta.versionMismatch`
and the human footer warn if the running dispatcher version differs from the
workspace plugin version. That usually means Codex is using a stale installed
plugin cache; refresh the install or run `node packages/plugin-delegate/scripts/delegate.mjs`
directly for development testing.

### $claude-wait

Poll one delegated job until it reaches a result state, `awaiting_followup`,
`needs_input`, `stopped`, `failed`, `orphaned`, or a timeout.

```text
$claude-wait job_mpt98g9g_b61e09f1 --json --compact --timeout 5m
```

Use this for automation that would otherwise loop across `$claude-status` and
`$claude-result`. JSON output includes the compact status summary, `resultText`
when final or recorded partial output exists, `transcriptTail` when a transcript
path was captured, and blocked-job fields such as `summary.blockedOn` and
`summary.actionHints.restartWithBypass`. If the wait times out, the dispatcher
exits non-zero but still prints the latest JSON payload when `--json` was
requested.
When the wait times out, JSON includes `timeoutRecovery` with the exact status,
partial-result, stop, and attach commands to try next. A timeout means the wait
budget expired, not necessarily that the Claude job is dead.

### $claude-followup

Send a follow-up instruction to an existing Claude background job. Useful while a job is in `awaiting_followup` (recently completed; session still live) and you want the next turn without starting a new delegation.

```text
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

Retrieve the final assistant message and log paths for a completed job or the
latest completed turn.

```text
$claude-result job_mpt98g9g_b61e09f1
$claude-result job_mpt98g9g_b61e09f1 --partial
```

Prints the assistant's final answer, list of touched files, and paths to
transcript (if available) and raw logs. Prefer `$claude-result` over
`claude logs <shortId>` for clean output; logs are the raw Claude Code stream
and may contain TUI control sequences around permission prompts. If
`claude logs <shortId>` returns `job not found` after a job exits, use
`$claude-status`, `$claude-wait`, `$claude-result`, or
`$claude-result --partial`; those plugin-owned artifacts are the supported
post-exit operator path.

`--partial` allows the command to print the latest recorded result artifact for
a running, stopped, or permission-blocked job. Without `--partial`, incomplete
jobs still reject so scripts do not accidentally treat partial output as final.

### $claude-stop

Terminate a background session. The job will be marked `stopped` and can still be accessed via `result`.

```text
$claude-stop job_mpt98g9g_b61e09f1
```

Optional cleanup. Not required before calling `result`. For blocked-job cleanup,
use `$claude-stop --all-needs-input` for the current workspace or
`$claude-stop --all-needs-input --all` for all workspaces. Compact status JSON
also prints the exact cleanup command in `actionHints.cleanupBlocked`.

### $claude-workflows

List and inspect Claude Code workflow-like background sessions started via `$claude-workflow` or `$claude-deep-research`.

```text
$claude-workflows
```

With a job ID, drill into a single workflow session for subagent metadata and phase records:

```text
$claude-workflows <jobId>
```

**Important scope note**: This skill covers job-store-backed workflow-like background sessions from `$claude-workflow` (`ultracode:` prompts) and `$claude-deep-research` (`/deep-research` prompts). The Claude Code `/workflows` TUI panel is session-scoped TUI-only — it shows workflows from a Claude TUI session, not the background sessions this skill surfaces. The two are distinct surfaces (empirically confirmed in Plan 0016 OQ-A artifact).

**Cost notice**: Zero subprocesses started by this skill; reads are disk-only from the codex-delegation-plugin job store and Claude project metadata. No Claude Code session is spawned.

Accepted flags:

- `--all` — list workflow sessions from all workspaces (not just current).
- `--json` — machine-readable JSON output.

Rejected at parse time (exit 2):

- `--allow-edit` — not applicable; this skill is read-only.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs workflows
```

### $claude-skills

List Claude Code skills visible to delegated Claude sessions. This reads project
`.claude/skills`, user `~/.claude/skills`, and skills from installed Claude
Code plugin cache paths.

```text
$claude-skills
$claude-skills --json
```

Use the listed skills in delegated Claude prompts as `/skill-name` when the
skill is user-invocable:

```text
$claude-delegate "Use /pcb-optimize to audit this KiCad board layout. Report findings only."
```

Duplicate skill names are reported instead of hidden. Human output marks them
as ambiguous because Claude Code may namespace, reject, or otherwise
disambiguate direct slash invocation differently from this catalog. JSON output
keeps every skill entry and adds `counts.duplicateNames`, top-level
`duplicates`, and per-skill `duplicateGroup`, `duplicateCount`,
`duplicateSourceRank`, `duplicateSource`, and `duplicateAmbiguous` fields when
a name appears more than once.

### $claude-upgrade

Refresh or repair the installed Codex Delegation plugin through Codex's plugin manager.
Without `--yes`, this prints the exact plan and does not change the install.

```text
$claude-upgrade
$claude-upgrade --yes
$claude-upgrade --json
$claude-upgrade --local --yes
```

The `--yes` form auto-detects the installed target. Public installs refresh the
Git marketplace snapshot, remove the cached `delegate@codex-delegation-plugin` install if
present, reinstall it, and print `codex plugin list`. Local cached installs use
`delegate@codex-delegation-plugin-local` and skip the Git marketplace refresh. It does not
edit Codex config files directly.

Use `--public` or `--local` only when you need to override auto-detection.

After a successful upgrade, an already-running Codex session can still display
the old versioned `SKILL.md` paths in its generated skill catalog. Restart
Codex to refresh the catalog, or use the stable dispatcher path created by the
upgrade: `~/.codex/plugins/cache/codex-delegation-plugin/delegate/current/scripts/delegate.mjs`.

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs upgrade
```

## Antigravity commands

Antigravity jobs use a 19-skill provider surface:

```text
$agy-setup
$agy-doctor
$agy-delegate --mode plan -- "Inspect this repository and report risks."
$agy-wait <jobId> --json --compact --timeout 5m
$agy-status --job <jobId> --json --compact
$agy-attach <jobId>
$agy-result <jobId>
$agy-followup <jobId> -- "Verify the same area."
$agy-review <jobId>
$agy-adversarial-review <jobId>
$agy-workflow -- "Plan, fan out, verify, and implement this migration."
$agy-goal -- "all tests pass and the documentation is current"
$agy-fork -- "independently audit the parser"
$agy-batch -- "audit every package and return an ordered report"
$agy-deep-research -- "compare the current primary-source guidance"
$agy-workflows
$agy-skills
$agy-upgrade
$agy-stop <jobId>
```

`$agy-delegate` accepts `--model`, `--agent`, repeatable `--add-dir`, `--mode
accept-edits|plan`, `--sandbox`, `--project`, `--new-project`, and `--log-file`.
The current Codex workspace is always added. The driver captures the job's UUID from its private
diagnostic log and subsequent turns use targeted `--conversation <uuid>` resume rather than global
`agy --continue` state.
The dispatcher accepts `--provider agy` on `followup` and same-conversation `review` as a target
assertion; a provider mismatch fails before a turn is sent.

Native permission cards are preserved. Run `$agy-attach <jobId>` to review and answer one in the
provider TUI, or configure narrow `permissions.allow` rules for known-safe operations. An explicit
`--dangerously-skip-permissions` remains available for trusted unattended work; `--sandbox`
restricts command execution but does not grant permission. See the official
[`agy` CLI guide](https://antigravity.google/docs/cli-overview),
[permission reference](https://antigravity.google/docs/cli-permissions), and
[`/agents` reference](https://antigravity.google/docs/cli/commands/agents).

## Pi and Qwen Code commands

Pi and Qwen Code each expose the same eight-skill core lifecycle:

```text
$pi-setup
$pi-doctor
$pi-delegate -- "Inspect this repository and report risks."
$pi-status --job <jobId> --json --compact
$pi-wait <jobId> --timeout 5m
$pi-result <jobId>
$pi-followup <jobId> -- "Verify the same area."
$pi-stop <jobId>

$qwen-setup
$qwen-doctor
$qwen-delegate -- "Inspect this repository and report risks."
$qwen-status --job <jobId> --json --compact
$qwen-wait <jobId> --timeout 5m
$qwen-result <jobId>
$qwen-followup <jobId> -- "Verify the same area."
$qwen-stop <jobId>
```

The public Pi name maps to the oh-my-pi `omp` executable. Pi runs in JSON mode with a private
session directory; Qwen Code runs with `--output-format stream-json`. Both drivers capture the
provider's exact session ID and pass it to `--resume` for follow-up, so concurrent jobs do not
compete for a global recent session.

These providers intentionally ship only setup, doctor, delegate, status, wait, result, follow-up,
and stop in this MVP. Their supervisors are headless and there is no Pi/Qwen equivalent of
`$agy-attach`. Default permission prompts therefore cannot be handed to an operator after launch.
For trusted unattended work, explicitly select a supported permission policy: Pi maps
`acceptEdits` to `--approval-mode write` and bypass to `yolo`; Qwen maps `acceptEdits` to
`auto-edit`, `plan` to `plan`, and bypass to `yolo`. Treat bypass/yolo as dangerous.

## Direct dispatcher usage

All 53 skill commands are also available via the dispatcher script. Useful for scripting and non-interactive workflows:

```bash
node packages/plugin-delegate/scripts/delegate.mjs setup
node packages/plugin-delegate/scripts/delegate.mjs doctor --claude-access --json
node packages/plugin-delegate/scripts/delegate.mjs delegate --yes -- "Inspect this repo."
node packages/plugin-delegate/scripts/delegate.mjs status
node packages/plugin-delegate/scripts/delegate.mjs wait <jobId> --json --compact --timeout 5m
node packages/plugin-delegate/scripts/delegate.mjs skills --json
node packages/plugin-delegate/scripts/delegate.mjs followup <jobId> -- "Next instruction."
node packages/plugin-delegate/scripts/delegate.mjs result <jobId>
node packages/plugin-delegate/scripts/delegate.mjs stop <jobId>
node packages/plugin-delegate/scripts/delegate.mjs review <jobId>
node packages/plugin-delegate/scripts/delegate.mjs adversarial-review <jobId>
node packages/plugin-delegate/scripts/delegate.mjs workflow "audit every fetch() call and propose a migration to HttpClient"
node packages/plugin-delegate/scripts/delegate.mjs goal -- "all unit tests pass"
node packages/plugin-delegate/scripts/delegate.mjs fork -- "build a proof-of-concept for the new rate-limiter"
node packages/plugin-delegate/scripts/delegate.mjs batch -- "migrate all usages of the old API to the new one"
node packages/plugin-delegate/scripts/delegate.mjs deep-research -- "What are the main tradeoffs between B-trees and LSM-trees for write-heavy workloads?"
node packages/plugin-delegate/scripts/delegate.mjs workflows
node packages/plugin-delegate/scripts/delegate.mjs upgrade
node packages/plugin-delegate/scripts/delegate.mjs agy-setup
node packages/plugin-delegate/scripts/delegate.mjs agy-doctor --json
node packages/plugin-delegate/scripts/delegate.mjs delegate --provider agy --yes -- "Inspect this repo."
node packages/plugin-delegate/scripts/delegate.mjs status --provider agy
node packages/plugin-delegate/scripts/delegate.mjs attach <agy-jobId>
node packages/plugin-delegate/scripts/delegate.mjs wait <agy-jobId> --timeout 5m
node packages/plugin-delegate/scripts/delegate.mjs result <agy-jobId>
node packages/plugin-delegate/scripts/delegate.mjs followup <agy-jobId> -- "Next instruction."
node packages/plugin-delegate/scripts/delegate.mjs review <agy-jobId>
node packages/plugin-delegate/scripts/delegate.mjs adversarial-review --provider agy <agy-jobId>
node packages/plugin-delegate/scripts/delegate.mjs workflow --provider agy -- "Plan and implement it."
node packages/plugin-delegate/scripts/delegate.mjs workflows --provider agy
node packages/plugin-delegate/scripts/delegate.mjs skills --provider agy
node packages/plugin-delegate/scripts/delegate.mjs stop <agy-jobId>
node packages/plugin-delegate/scripts/delegate.mjs setup --provider pi --json
node packages/plugin-delegate/scripts/delegate.mjs doctor --provider pi --json
node packages/plugin-delegate/scripts/delegate.mjs delegate --provider pi --yes -- "Inspect this repo."
node packages/plugin-delegate/scripts/delegate.mjs followup <pi-jobId> -- "Verify the same area."
node packages/plugin-delegate/scripts/delegate.mjs setup --provider qwen --json
node packages/plugin-delegate/scripts/delegate.mjs doctor --provider qwen --json
node packages/plugin-delegate/scripts/delegate.mjs delegate --provider qwen --yes -- "Inspect this repo."
node packages/plugin-delegate/scripts/delegate.mjs followup <qwen-jobId> -- "Verify the same area."
```

All commands support `--json` for machine-readable output. The `--yes` flag on `delegate` and `followup` skips the interactive privacy acknowledgement; `--allow-edit` is a policy/framing flag and does NOT bypass that acknowledgement.

For bulk-stop of awaiting-followup jobs (added in plan 0002):

```bash
node packages/plugin-delegate/scripts/delegate.mjs stop --all-awaiting-followup
node packages/plugin-delegate/scripts/delegate.mjs stop --all-awaiting-followup --all
```

## Privacy and workspace disclosure

Delegating a task may send repository contents, prompts, command output, and file metadata through
the selected local Claude Code, Google Antigravity, oh-my-pi, or Qwen Code account/configuration.

On first delegation to each provider in a workspace, you will be prompted to acknowledge this
policy. Acknowledgement is stored in `~/.codex/codex-delegation-plugin/acks/` and is scoped to both the
workspace and provider, so approving one provider does not approve another.

The `--yes` flag skips this prompt for intentional non-interactive use only.

For `$claude-followup`, the acknowledgement is checked against the **target job's workspace**, not the caller's current directory. If you run `$claude-followup --all` from repository A against a job that was created in repository B, the acknowledgement must exist for repository B. The `--yes` flag records the acknowledgement against the target workspace; the `--allow-edit` flag is policy/framing only and never bypasses the acknowledgement.

## Follow-up injection

Plan 0002 adds follow-up injection: after `$claude-delegate` completes its first turn, the background session is still alive and idle. You can send the next instruction via `$claude-followup` without spawning a new session. The mechanism is internal: the dispatcher attaches via PTY, writes the next prompt, polls the per-job sidecar (`~/.claude/jobs/<shortId>/state.json`) for completion, and detaches.

Typical flow:

```text
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

These review skills are local codex-delegation-plugin flows: `$claude-review` uses the existing Claude Code session, and `$claude-adversarial-review` starts a fresh Claude Code background session. They do not wrap Anthropic's `claude ultrareview` command, which is a separate Claude Code review surface.

### $claude-review

Send a structured review prompt into the **same** Claude Code session that produced the work.

```
$claude-review <jobId-or-prefix>
```

Direct dispatcher equivalent:

```bash
node packages/plugin-delegate/scripts/delegate.mjs review <jobId-or-prefix>
```

Accepted flags:

- `--all` — search across all workspaces (default scope is the current workspace).
- `--json` — machine-readable structured findings output.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--blocking` — exit 1 after printing the review if any `high`/`blocker` finding or a `fail` verdict is returned.
- `--fail-on <gate>` — exit 1 after printing the review when the gate trips. Gates: `fail`, `any`, `nit`, `low`, `medium`, `high`, `blocker`.

With `--json`, `review.blocking` is true when the same high/blocker/fail threshold would trip `--blocking`.

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
node packages/plugin-delegate/scripts/delegate.mjs adversarial-review <jobId-or-prefix>
```

Accepted flags:

- `--all` — search across all workspaces (default scope is the current workspace).
- `--json` — machine-readable structured findings output.
- `--yes` — record the privacy acknowledgement non-interactively.
- `--model` — model for the fresh review session.
- `--effort` — effort level for the fresh review session.
- `--permission-mode` — permission mode override for the fresh review session.
- `--dangerously-skip-permissions` — alias for `--permission-mode bypassPermissions`.
- `--blocking` — exit 1 after printing the review if any `high`/`blocker` finding or a `fail` verdict is returned.
- `--fail-on <gate>` — exit 1 after printing the review when the gate trips. Gates: `fail`, `any`, `nit`, `low`, `medium`, `high`, `blocker`.

With `--json`, `review.blocking` is true when the same high/blocker/fail threshold would trip `--blocking`.

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

## Subagent fan-out patterns (Codex → Claude Code)

Codex CLI has its own limit on concurrent subagents per turn. When a task is large and parallelizable — for example, auditing every callsite of a function across a 500-file codebase — delegating to Claude Code via `$claude-delegate` or `$claude-workflow` makes more subagents available, because Claude Code's subagent ceiling is higher than Codex's per-turn cap.

### When to delegate vs orchestrate yourself

| Task shape | Recommended path |
| --- | --- |
| "Run command X, summarize output" | Codex does it directly — single-step, no parallel decomposition needed |
| "Audit every X across the codebase" | `$claude-delegate "audit ..."` with explicit parallel-subagent guidance |
| "Plan + execute a multi-phase migration" | `$claude-workflow "..."` — the workflow runtime auto-orchestrates phases |

### How to phrase a fan-out-friendly `$claude-delegate` prompt

Ask explicitly for parallel decomposition and specify how results should be aggregated:

- **Request parallelism**: "Use parallel subagents to scan each directory independently."
- **Specify decomposition**: "Split this task into N independent units of work, one per file."
- **Specify aggregation**: "Have each subagent return a JSON object; the parent merges all results."

**Example prompts with annotated behavior:**

1. `$claude-delegate "Audit every usage of fetchData() across the codebase. Use parallel subagents — one per top-level directory. Each subagent should return a JSON array of {file, line, signature}. Merge into one report."`
   — Fans out one agent per directory, merges JSON results.

2. `$claude-delegate "Check every TypeScript file in src/ for missing return-type annotations. Use parallel subagents to process files in batches. Return a flat list of {file, line, function} objects."`
   — Parallel scan with structured per-agent output.

3. `$claude-delegate "Rename the config.host field to config.hostname across all files. Use parallel subagents — one per module directory — and return a list of files changed."`
   — Parallel rename with change manifest per agent.

4. `$claude-delegate "Summarize the test coverage gaps in each package under packages/. Spawn one subagent per package. Each subagent should return a markdown summary of untested paths."`
   — One agent per package, markdown summaries aggregated by parent.

5. `$claude-delegate "Verify that every exported function in lib/ has a corresponding entry in docs/api.md. Use parallel subagents — one per file — and return a list of undocumented exports."`
   — Parallel documentation audit.

### When `$claude-workflow` is structurally better than `$claude-delegate`

`$claude-delegate` gives Claude Code a free-form prompt and lets it spawn subagents as it sees fit. This works well when the task is a single decomposable unit.

`$claude-workflow` is better when the task has **clear phases that depend on each other** — for example:

1. Discover all callsites of a function (phase 1)
2. Transform each callsite independently (phase 2, fans out per site)
3. Verify all transformations compile (phase 3, single aggregation agent)

The workflow runtime's `phase()` + `agent()` API gives explicit barriers between phases. Phase 2 cannot start until phase 1 completes; phase 3 cannot start until all phase-2 agents finish. With `$claude-delegate`, you would have to describe those sequencing constraints in prose and rely on Claude to honor them. With `$claude-workflow`, the script structure enforces them.

See `## Dynamic workflows in depth` below for the full script API and example scripts.

## Dynamic workflows in depth

A workflow is an orchestration script Claude writes for your task and runs across many subagents in the background. The user approves the generated script before any subagents are spawned.

Use `$claude-workflow` when:

| Scenario | Recommended skill |
| --- | --- |
| Single-turn task, one session | `$claude-delegate` |
| Multi-phase orchestration with phase dependencies | `$claude-workflow` |
| Cross-checked research with parallel angles | `$claude-workflow` (or `/deep-research` directly in Claude Code) |
| Free-form exploration, uncertain structure | `$claude-delegate` — more flexible, less structured overhead |

### The `meta` / `phase()` / `agent()` script API

Workflow scripts are JavaScript/ESM modules. Claude generates them in-memory; the user reviews and approves the script in the TUI before execution begins.

**`export const meta`** — required top-level export describing the workflow:

```javascript
export const meta = {
  name: 'my-workflow',          // short identifier (kebab-case)
  description: 'What it does', // shown in the TUI confirmation dialog
  phases: [
    { title: 'Phase name', detail: 'Optional longer description' },
  ],
}
```

**`phase(title)`** — declares a phase barrier. All `agent()` calls made after `phase('X')` and before the next `phase()` call belong to phase X. The runtime waits for all agents in the current phase to complete before advancing.

**`agent(prompt, opts?)`** — spawns a subagent. Returns the subagent's final output as a string.

```javascript
const result = await agent(
  'Count the exact number of lines in README.md. Return only the integer.',
  { label: 'count-lines' }   // optional label shown in TUI progress view
)
```

**`parallel(tasks)`** — helper that fans out an array of `agent()` calls concurrently within the current phase. Returns an array of results in the same order as the input.

**`pipeline(stages)`** — chains phases: the output of each stage is passed as context to the next.

Ground-truth script shape captured from an empirical TUI smoke test (Claude Code v2.1.153):

```javascript
export const meta = {
  name: 'count-readme-lines',
  description: 'Count lines in README.md',
  phases: [{ title: 'Count', detail: 'one agent counts lines in README.md' }],
}

phase('Count')
const result = await agent(
  'Count the exact number of lines in the file README.md in the current ' +
  'working directory. Use `wc -l README.md` via Bash. Return ONLY the ' +
  'integer line count as your final answer — no prose.',
  { label: 'count-lines' }
)
return { lineCount: result }
```

### Example workflow scripts

**Cross-file audit** — one agent per file, results merged by parent:

```javascript
export const meta = {
  name: 'audit-fetch-calls',
  description: 'Audit every fetch() call across src/ and report usage patterns',
  phases: [{ title: 'Audit', detail: 'one agent per source file' }],
}

phase('Audit')
const files = await agent(
  'List every .ts and .js file under src/. Return a JSON array of relative paths, no prose.',
  { label: 'list-files' }
)
const paths = JSON.parse(files)
const findings = await parallel(
  paths.map(p => agent(
    `Inspect ${p} for fetch() calls. Return a JSON array of {line, url, method} objects, ` +
    'or an empty array if none. No prose.',
    { label: `audit-${p}` }
  ))
)
return { findings: findings.flat() }
```

**Migration** — two-phase: discover sites, then transform each independently:

```javascript
export const meta = {
  name: 'migrate-http-client',
  description: 'Migrate fetch() calls to HttpClient across the codebase',
  phases: [
    { title: 'Discover', detail: 'find all fetch() callsites' },
    { title: 'Transform', detail: 'rewrite each callsite independently' },
  ],
}

phase('Discover')
const sitesJson = await agent(
  'Find every file under src/ that calls fetch(). ' +
  'Return a JSON array of {file, line} objects. No prose.',
  { label: 'discover-sites' }
)
const sites = JSON.parse(sitesJson)

phase('Transform')
await parallel(
  sites.map(s => agent(
    `In ${s.file} at line ${s.line}, rewrite the fetch() call to use HttpClient. ` +
    'Follow the existing HttpClient usage pattern in the file. Return the updated file content.',
    { label: `transform-${s.file}` }
  ))
)
return { transformed: sites.length }
```

**Research / deep-dive** — parallel angles within a single phase:

```javascript
export const meta = {
  name: 'deep-dive-auth',
  description: 'Research authentication approaches from multiple angles in parallel',
  phases: [{ title: 'Research', detail: 'parallel research angles' }],
}

phase('Research')
const [securityAnalysis, performanceAnalysis, uxAnalysis] = await parallel([
  agent('Analyze the security tradeoffs of session tokens vs JWTs for this codebase. Return a markdown summary.', { label: 'security' }),
  agent('Analyze the performance implications of the current auth middleware. Return a markdown summary.', { label: 'performance' }),
  agent('Summarize the current user-facing auth flow and list friction points. Return a markdown summary.', { label: 'ux' }),
])
return { securityAnalysis, performanceAnalysis, uxAnalysis }
```

### Cost, cancel, and approval patterns

**Cost**: Workflows can spawn up to 16 concurrent subagents and up to 1000 total subagents across all phases. Token usage scales with the number of agents and the complexity of each agent's task. Review the generated script before approving — if the scope looks larger than intended, choose `No` in the approval dialog.

**Approval**: After `$claude-workflow` starts the background session, Claude Code presents an interactive `Yes` / `View raw script` / `No` dialog inside its TUI before any subagents are spawned. The skill does NOT auto-approve. To review and approve:

```bash
claude attach <shortId>
```

Use the printed `Claude session` short ID. Select `View raw script` to inspect the generated JavaScript/ESM script before committing. Select `Yes` to proceed or `No` to cancel cleanly — no subagents are spawned and no artifacts are written until explicit approval.

**Cancel**: To stop a running workflow from the Codex side:

```text
$claude-stop <jobId>
```

This terminates the background session running the workflow. You can also cancel from inside the Claude Code TUI by running `/workflows` and selecting the active workflow.

**Limits empirically confirmed**: 16 concurrent + 1000 total subagent limits confirmed via Plan 0008 T1 + T9.5 empirical testing. The `/workflows` slash command and `ultracode:` trigger keyword confirmed available on Claude Code v2.1.153 via TUI smoke test.

**CLI vs TUI distinction**: The `--effort` CLI flag accepts `low`, `medium`, `high`, `xhigh`, or `max` only; the `ultracode` value is TUI-only (`/effort ultracode` slash command) and is silently ignored when passed as `--effort ultracode`. Use `$claude-workflow` to trigger the `ultracode:` planning path from Codex.

## Cost and prompt-cache wording

This v1 uses Claude Code background sessions and does not use `claude -p`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement.

## Known limitations

- **Antigravity child control is native-TUI-only** — `$agy-attach` exposes `/agents`, where the user
  can inspect, approve, and kill child agents. The current CLI does not document a machine-readable
  child lifecycle or cancel API, so the plugin does not invent one.
- **Fork names hide different provider semantics** — Claude's `/fork` skill spawns a subagent;
  Antigravity's TUI `/fork` branches a whole conversation. `$agy-fork` uses the default parent and
  a bundled native subagent profile to match Claude's operation, while the branch command remains available
  interactively through `$agy-attach`.
- **The companion plugin is required for the strongest Antigravity path** — `$agy-setup` validates
  and installs its lifecycle hooks and five native subagent profiles. Delegation still has a
  tested prompt-contract fallback when the companion is absent, but structured lifecycle and
  specialized child roles are reduced.
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
- **Local marketplace packaging is committed; no external registry submission** — plan 0006 ships the local marketplace tree under `marketplace/`, installed via `codex plugin marketplace add "<repo-root>/marketplace"`. Submission to an external / hosted plugin registry is not part of this release.
- **Windows not supported or tested in plan 0001 or plan 0002** — development and testing are on macOS and Linux only.
- **Real Claude agents --json schema differs from mock** — plan 0001 supports the 2.1.149-style row format with derived short IDs (shortId is the first 8 hex characters of the UUID, stripped of dashes). The reconciler uses this derivation for matching.
- **No `claude ultrareview` wrapper** — the plugin review skills are local-session and fresh-session review flows; Anthropic's `claude ultrareview` remains a separate Claude Code review surface and is not wrapped by this plugin.

## Troubleshooting

### `$claude-setup` reports `fail`

Run setup again with more detail:

```bash
node packages/plugin-delegate/scripts/delegate.mjs setup
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
If the latest turn already has an immutable completed-turn result, `$claude-result`
may return that output while the job-level status is still catching up.
If the status output reports `result.hasResult: true` or an
`actionHints.partialResult` command, run `$claude-result <jobId> --partial` to
inspect the recorded partial output.

### Result has no transcript path

Transcripts are available only if Claude Code writes them. If transcripts are
missing, the dispatcher falls back to printing logs via `claude logs <sessionId>`.
The result output will show `Logs: claude logs <sessionId>` for raw manual
inspection.

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

**Symptom**: `$claude-followup` or same-session `$claude-review` exits with `Error: follow-up prompt did not register within 20000ms`, or the follow-up input appears to be silently ignored on the first attempt, requiring a retry.

**Cause**: After attaching to the Claude PTY, the dispatcher waits for the terminal handshake to settle before writing the follow-up prompt, then waits for Claude Code's sidecar or `agents --json` state to show that the prompt registered. On slower machines or high-load environments, either phase may need more time.

**Resolution**: Start Codex with a higher `CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS` value if prompt registration times out. If the prompt appears to be dropped before registration starts, raise `CODEX_DELEGATION_ATTACH_WARMUP_MS` too.

```bash
CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS=30000 codex
```

```text
$claude-followup <jobId> -- "your follow-up prompt"
```

Acceptable values: positive integers in milliseconds for `CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS`; non-negative integers in milliseconds for `CODEX_DELEGATION_ATTACH_WARMUP_MS`. Use attach warmup `0` only in mock-driven test environments where the PTY responds instantly — setting it to `0` in a real Claude session can cause the follow-up prompt to be dropped.

### Tuning operator escape hatches

The plugin uses PTY attach for follow-up and same-session review input. Most users should not need tuning. If a local Claude Code version is slow to accept pasted input or to flush an assistant message after a turn completes, the following environment variables can help operators diagnose timing issues:

- `CODEX_DELEGATION_ATTACH_WARMUP_MS` — wait before writing to `claude attach`. Default: `8000`.
- `CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS` — deadline for a follow-up or same-session review prompt to register on the attached Claude session. Default: `20000`.
- `CODEX_DELEGATION_REVIEW_RECONCILE_DELAY_MS` — wait before `$claude-review` reads the reconciled review result file.

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

### `--model` interaction with `--fallback-model`

When `$claude-adversarial-review --model X` runs and model `X` is not installed in your Claude Code setup, Claude Code's `--fallback-model` setting (if configured) will silently take over for the rest of that session. The review will proceed on the fallback model without any warning in the skill output.

To verify which model was actually used, run `$claude-result --json` after the review completes. The JSON output surfaces the `model` field from the session transcript, so you can confirm whether the intended model or a fallback handled the review.

### `$claude-result` reads raw transcript, not the display layer

`$claude-result` reads the session JSONL file and the sidecar at `~/.claude/jobs/<shortId>/state.json`. It does not read the text displayed in the Claude Code TUI.

If you have a Claude Code `MessageDisplay` hook installed (available in Claude Code v2.1.152+) that redacts or transforms assistant output before display, `$claude-result` will still return the un-redacted content — the hook does not affect what is written to the session JSONL. This is not a bug; by design, the dispatcher reads from canonical storage rather than the display layer.

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
- **plugin** — dispatcher integration (packages/plugin-delegate)

Tests use `node:test` (built-in); no external test framework dependency.

## What comes next

Later plans are reserved for:

- **Plan 0002** *(shipped)* — follow-up injection for Claude background jobs (`$claude-followup`, `awaiting_followup`, PTY-based input transport, sidecar best-effort enrichment).
- **Plan 0003** *(shipped)* — `$claude-review` and `$claude-adversarial-review` skills (same-session and fresh-session structured review, severity-rated findings, `reviewOf` job link)
- **Plan 0004** — benchmark harness and cost-savings measurement
- **Plan 0005** — stop-time hook and review gate integration
- **Plan 0006** — marketplace packaging and distribution polish
- **Plan 0007** *(shipped)* — Claude Code w22+ parity (doctor probes for Opus 4.8 / dynamic workflows / `--bg --exec`; `--fallback-model` + `MessageDisplay` docs notes).
- **Plan 0008** *(shipped)* — `$claude-workflow` skill (new dynamic-workflows skill; probe floor correction for Plan 0007's `workflows-supported`).
