# codex-delegation-plugin

> **Delegate coding work from OpenAI Codex to Claude Code or Google Antigravity.**

## Install

Install the public plugin into Codex:

```bash
codex plugin marketplace add https://github.com/wu-hongjun/codex-delegation-plugin
codex plugin add "delegate@codex-delegation-plugin"
```

Then restart Codex and verify the plugin is installed:

```bash
codex plugin list
```

Inside Codex, run:

```text
$claude-setup
$claude-doctor
$claude-skills
$agy-setup
```

`$claude-setup` should return aggregate status `ok` or `warn`. `fail` means an environment dependency is missing; follow the probe output. Before long, browser-backed, or unattended jobs, run `$claude-doctor` to preflight Claude Code CLI auth, model access, real-browser readiness, workspace path, and permission mode.

Use the `$claude-*` or `$agy-*` Codex skills, or the exact dispatcher path reported in JSON
`meta.dispatcherPath` / `exactActionHints`. After an upgrade, an already-running Codex session may
still list stale versioned skill paths; either restart Codex or use the stable dispatcher path:
`~/.codex/plugins/cache/codex-delegation-plugin/delegate/current/scripts/delegate.mjs`.

---

## Quick start

- **Install and use:** use `$claude-*` for Claude Code or `$agy-*` for Google Antigravity.
- **End-user manual:** [`marketplace/plugins/delegate/README.md`](marketplace/plugins/delegate/README.md) covers verify, update, uninstall, troubleshooting, and the full skill list.
- **Developer manual:** [`packages/plugin-delegate/README.md`](packages/plugin-delegate/README.md) covers dispatcher commands, runtime behavior, architecture, and contributor workflows.
- **Marketplace payload:** [`marketplace/`](marketplace/) contains the committed plugin tree that Codex installs.
- **Release checklist:** [`documentation/RELEASING.md`](documentation/RELEASING.md).
- **Plan history:** [`documentation/plan/`](documentation/plan/).

---

## Requirements

- Codex CLI with plugin marketplace support (`codex --version`).
- At least one provider CLI installed and authenticated locally: Claude Code (`claude`) or Google Antigravity (`agy`).
- Node.js 20 or later on `PATH`.

No `npm install` or manual clone is needed for normal users.

---

## Use

After install, the main Codex skills are:

```text
$claude-delegate "Inspect this repo and summarize the main risks."
$claude-wait <jobId> --json --compact --timeout 5m
$claude-status
$claude-result <jobId>
$claude-followup <jobId> -- "Now check the tests around that area."

$agy-delegate "Inspect this repo and summarize the main risks."
$agy-wait <jobId> --json --compact --timeout 5m
$agy-status
$agy-result <jobId>
```

Useful discovery and maintenance commands:

```text
$claude-setup
$claude-doctor
$claude-skills
$claude-upgrade
```

The plugin ships 24 skills: 18 `$claude-*` skills plus `$agy-setup`, `$agy-delegate`, `$agy-status`, `$agy-wait`, `$agy-result`, and `$agy-stop`.

Antigravity jobs run through `agy --print` under a detached supervisor owned by the plugin. The
supervisor captures stdout/stderr and lifecycle state so separate Codex invocations can wait,
read results, or stop the process. `agy` does not expose stable conversation IDs from print mode,
so Antigravity jobs are single-turn and the plugin does not use the workspace-global
`--continue` flag. Supported launch flags include `--model`, `--agent`, repeatable `--add-dir`,
`--mode accept-edits|plan`, `--sandbox`, `--print-timeout`, `--project`, `--new-project`, and
`--log-file`. The current Codex workspace is always forwarded with `--add-dir`. Antigravity print
mode auto-denies command permissions that would require an interactive prompt; those jobs are
reported as failed. Configure a narrow Antigravity `permissions.allow` rule or explicitly request
`--dangerously-skip-permissions` for a trusted unattended job. `--sandbox` restricts terminal
execution but does not approve commands. Permission bypass is forwarded only when explicitly
requested.

See the official Antigravity documentation for the [`agy` CLI](https://antigravity.google/docs/cli/using)
and its [permission rules](https://antigravity.google/docs/cli/permissions).

---

## Real Chrome And Permissions

Use `--chrome` when a delegated Claude job needs the real Chrome browser. There is no `--real` flag. Real Chrome access uses Claude Code's Chrome extension / connected-browser flow, which is separate from Codex's in-app browser.

Some prompts cannot be answered safely by the background wrapper. If Claude asks which Chrome browser to use, asks you to pick in the extension, or reaches a passkey/login/user-gesture step, run `$claude-status --job <jobId> --json --compact` and follow `waiting.userAction` (usually `claude attach <shortId>`). Choose the Chrome profile that already has the needed logged-in session.

For trusted unattended shell/tool QA, you can explicitly start a fresh job with `--bypass-permissions`, `--permission-mode bypassPermissions`, or `--dangerously-skip-permissions`. These launch Claude Code with its literal `--dangerously-skip-permissions` flag. Once you have opted into trusted unattended Claude work for a task/session/project, Codex may reuse `--bypass-permissions` on fresh local shell/tool automation jobs. If Claude still asks for interactive input immediately, the plugin stops the start attempt and marks the job failed with a clear reason instead of leaving a blocked background worker. Bypass can reduce Claude tool permission prompts, but it does not choose among Chrome browsers, complete passkeys, inspect cookies/passwords/session stores, or replace local user gestures.

When a job is already blocked, run `$claude-status --job <jobId> --json --compact`. Blocked jobs include `operatorState`, `blockedOn`, `actionHints.restartWithBypass`, `actionHints.stop`, and `actionHints.cleanupBlocked`. Restart commands require a fresh prompt because the plugin stores prompt metadata, not the full original prompt text.

If `$claude-wait --timeout ... --json --compact` times out, the job may still
be healthy. Read `timeoutRecovery.status` and `timeoutRecovery.partialResult`
from the JSON payload, or run `$claude-status --job <jobId> --json --compact`
followed by `$claude-result <jobId> --partial`.

---

## Update

Inside Codex:

```text
$claude-upgrade
$claude-upgrade --yes
```

`$claude-upgrade` prints the exact plan without changing anything. `$claude-upgrade --yes` refreshes the Git marketplace and reinstalls the plugin through Codex's plugin manager.

From a shell, the manual equivalent is:

```bash
codex plugin marketplace upgrade "codex-delegation-plugin"
codex plugin remove "delegate@codex-delegation-plugin"
codex plugin add "delegate@codex-delegation-plugin"
codex plugin list
```

---

## Uninstall

```bash
codex plugin remove "delegate@codex-delegation-plugin"
codex plugin marketplace remove "codex-delegation-plugin"
```

This removes the Codex plugin registration and marketplace pointer. It does not delete Claude Code transcripts or plugin job records.

---

## What This Is

This repository is a **Codex-native plugin and runtime** that lets the OpenAI Codex CLI orchestrate Claude Code and Google Antigravity as delegated coding agents.

This plugin delegates work to Claude Code through background sessions (`claude --bg`) rather than `claude -p`. It is designed to preserve the architecture needed for session/cache reuse, but savings have not yet been benchmarked.

The runtime has two driver implementations: `ClaudeBackgroundDriver` for Claude Code's native background sessions and `AgyCliDriver` for supervised Antigravity print-mode processes.

---

## Local Contributor Install

For development from a checkout:

```bash
git clone https://github.com/wu-hongjun/codex-delegation-plugin.git
cd codex-delegation-plugin
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
codex plugin list
```

After pulling a newer local checkout, refresh the installed local plugin cache:

```bash
git pull
codex plugin remove "delegate@codex-delegation-plugin-local"
codex plugin add "delegate@codex-delegation-plugin-local"
codex plugin list
```

If you moved or re-cloned the local repository, refresh the local marketplace pointer too:

```bash
codex plugin remove "delegate@codex-delegation-plugin-local"
codex plugin marketplace remove "codex-delegation-plugin-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "delegate@codex-delegation-plugin-local"
codex plugin list
```

Replace `<repo-root>` with the absolute path to the clone.

## Deployment Model

There is no npm package deployment for this project today. The deployable artifact is the committed marketplace payload:

```text
marketplace/plugins/delegate/
```

For users, "deploy" means: add this GitHub repository as a Codex Git marketplace and install `delegate@codex-delegation-plugin`.

For contributors, the local development path remains: clone the repo, add `marketplace/` to Codex, and install `delegate@codex-delegation-plugin-local`.

An npm wrapper could be added later, but it would only wrap these Codex marketplace commands unless the project also commits to publishing and maintaining a separate global CLI package.

The root [`install.sh`](install.sh) script is intentionally just a convenience wrapper around the same marketplace install commands; it is not a separate package manager path.

For maintainers, "release" means:

1. Make source changes under `packages/`.
2. Regenerate the marketplace tree with `node tools/package-marketplace.mjs --write`.
3. Keep the root [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) pointing at `./marketplace/plugins/delegate`.
4. Verify with `node tools/package-marketplace.mjs --check`, local tests, smoke, and CI.
5. Bump `packages/plugin-delegate/.codex-plugin/plugin.json`.
6. Commit, tag, and publish a GitHub release.

The full procedure is in [`documentation/RELEASING.md`](documentation/RELEASING.md).

## Development Setup

Use npm for contributor workflows only:

```bash
npm ci
npm run lint
npm run typecheck
npm test
node tools/package-marketplace.mjs --check
```

When source files that ship in the plugin change, regenerate the marketplace copy before testing or releasing:

```bash
node tools/package-marketplace.mjs --write
```

`npm install` or `npm ci` does not install the plugin into Codex. It only installs this workspace's development dependencies.

---

## Current scope (what actually ships)

- **One direction**: Codex to delegated provider.
- **Two transports**: native Claude Code background sessions and supervised Antigravity `agy --print` processes.
- **One host plugin**: Codex skills + manifest under `packages/plugin-delegate/`.
- **Session-per-job with follow-ups**: every `$claude-delegate` invocation creates a fresh background job. Continue an existing job with `$claude-followup <jobId>`; do not reuse `--name` as a session key.
- **Single-turn Antigravity jobs**: `$agy-delegate` creates a supervised print-mode process with status, wait, result, and stop support.
- **Twenty-four skills**: 18 Claude skills and 6 Antigravity skills.

The full v1 plan, including every deliberately-deferred feature, lives at [`documentation/plan/0001-20260530-initial-plan/1-plan.md`](documentation/plan/0001-20260530-initial-plan/1-plan.md). It supersedes any conflicting framing in this README.

---

## Context

OpenAI's official plugin [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) goes the *other* direction — it lets **Claude Code drive Codex** as a sub-agent, using Codex's `app-server` JSON-RPC protocol for a persistent connection with streaming notifications and session/thread reuse. That is the structural template we admire.

The community port [`pejmanjohn/cc-plugin-codex`](https://github.com/pejmanjohn/cc-plugin-codex) goes our direction — Codex drives Claude Code — but does so by shelling out to `claude -p --output-format json …` once per call. That one-shot transport has architectural consequences this project does not want to inherit.

This project takes a different approach: drive Claude Code through its first-party **background-session** surface, treat machine-readable transcripts and `claude agents --json` as the semantic source of truth, and resist the temptation to parse the human-facing TUI. The detailed reasoning lives in [`documentation/research/20260530-initial-research/report.md`](documentation/research/20260530-initial-research/report.md).

---

## Design pillars

### 1. Driver abstraction (`Driver` interface)

A single interface covers both `ClaudeBackgroundDriver` and `AgyCliDriver`. Provider-neutral job session records let status, wait, result, and stop dispatch to the correct implementation. Claude-only follow-up and restart guidance stays outside the shared provider contract.

```
Driver
├── probe()                              → DriverCapabilities
├── startSession(opts)                   → SessionHandle
├── watch(target)                        → AsyncIterable<DriverEvent>
├── status(session)                      → SessionStatus
├── stop(session)                        → void
└── dispose()                            → void
```

Follow-up prompt injection is implemented via PTY attach. Future-stage methods such as `interrupt` and deeper resume/attach controls are still explicit interface seams rather than broad refactors.

### 2. Background sessions, not `claude -p`

The `ClaudeBackgroundDriver` does not call `claude -p`. Instead it:

- Spawns `claude --bg --name <sessionName> "<prompt>"` to start a Claude Code conversation as a first-party background session.
- Polls `claude agents --json` for live state — working, needs-input, idle, completed, failed, stopped.
- Reads `~/.claude/projects/<project>/<session-id>.jsonl` (the Claude Code transcript) for messages, tool uses, and metadata.
- Falls back to `claude logs <id>` when transcripts are unavailable.
- **Does not parse the interactive TUI byte stream.** The TUI is a human rendering layer, not a stable protocol.
- **Does not use `claude -p` as a fallback in v1.** If the local Claude Code doesn't support background sessions, the doctor fails hard with upgrade instructions.

PTY attach is used for follow-up prompt injection and human permission handoff. The plugin still treats transcripts, sidecars, and job records as the semantic source of truth rather than scraping the TUI display.

### 3. Codex-first plugin shape

Codex's plugin model is intentionally thinner than Claude Code's — skills are LLM-facing markdown wrappers that shell out to scripts. We embrace that and anchor every convention to the first-party catalogs at [`openai/plugins`](https://github.com/openai/plugins) (vendored at `references/codex-plugins-examples/`) and [`openai/skills`](https://github.com/openai/skills) (vendored at `references/codex-skills-examples/`):

- Manifest at `.codex-plugin/plugin.json` — same shape as the examples in `references/codex-plugins-examples/plugins/`.
- Skills at `skills/<name>/SKILL.md` — same shape as `references/codex-skills-examples/skills/.system/` and `.curated/`.
- One Node entry point (`scripts/delegate.mjs`) handles every skill via subcommands.

### 4. Universal plugin descriptor — *design seam; v1 ships Codex shape only*

The intent is one descriptor schema that could describe the same plugin for any host CLI. **v1 only emits the Codex shape**; the shared shape is preserved internally so other host emitters can be added later without churn.

### 5. Capability negotiation by feature probe

At startup, `ClaudeBackgroundDriver.probe()` checks the installed Claude Code binary, authentication, background-session behavior, agents JSON, logs, daemon status, and transcript availability. `AgyCliDriver.probe()` checks the `agy` binary and the print-mode command surface without making a model call. The setup and doctor commands report the exact failing capability instead of relying only on a version check.

### 6. Persistent job store

Jobs are recorded under `~/.codex/codex-delegation-plugin/jobs/` with a provider identifier plus provider-specific session, process, transcript, log, and result metadata. Status, wait, result, and stop resolve the stored provider before dispatching, so later Codex sessions do not need to rediscover the underlying agent process.

---

## Repository layout

```
codex-delegation-plugin/
├── README.md                          ← you are here
├── packages/                          ← implementation
│   ├── runtime/                       ← Driver interface, job store, reconciler, doctor primitives
│   ├── driver-claude-code/            ← ClaudeBackgroundDriver
│   ├── driver-agy-cli/                ← AgyCliDriver + detached supervisor
│   └── plugin-delegate/                ← Codex skills + manifest + entry script
├── tools/
│   ├── mock-claude/                   ← fake `claude` binary used by tests
│   └── mock-agy/                      ← fake `agy` binary used by tests
├── references/
│   ├── codex-plugin-cc/               ← submodule, openai/codex-plugin-cc @ v1.0.4 (CC→Codex official plugin)
│   ├── cc-plugin-codex/               ← submodule, pejmanjohn/cc-plugin-codex @ cb4a07c (Codex→CC community port)
│   ├── codex-plugins-examples/        ← submodule, openai/plugins @ main (first-party Codex plugin examples)
│   ├── codex-skills-examples/         ← submodule, openai/skills @ main (curated/system Codex skills)
│   ├── documentation-codex/           ← local snapshot of developers.openai.com/codex docs (28 files + github/)
│   └── documentation-claudecode/      ← local snapshot of code.claude.com/docs (overview + CLI ref + index + summary)
├── documentation/
│   ├── research/20260530-initial-research/   ← initial deep-research prompt + report
│   └── plan/                                  ← engineering plan workflow (see plan/README.md)
└── .omc/                              ← oh-my-claudecode scratch space (orchestration state)
```

### Submodule pins

| Submodule | Pinned at | Purpose |
|---|---|---|
| `references/codex-plugin-cc` | `v1.0.4` (`807e03a`) | Canonical CC→Codex plugin. Source of the persistent-app-server / streaming-notification pattern we mirror in reverse. |
| `references/cc-plugin-codex` | `cb4a07c` (12 commits past `v0.1.0`; no newer tag) | Community Codex→CC port. Useful reverse-port reference for skill names and dispatcher shape. |
| `references/codex-plugins-examples` | `c6ea566d` (`heads/main`, no tags) | `openai/plugins` — first-party Codex plugin manifests. Authoritative reference for `.codex-plugin/plugin.json`, `skills/`, `.app.json`, `.mcp.json`, `agents/`, `commands/`, `hooks.json` conventions. |
| `references/codex-skills-examples` | `a8924c2` (`heads/main`, no tags) | `openai/skills` — curated + system Codex skills. Authoritative reference for `SKILL.md` format and the `$skill-installer` distribution flow. |

Update with `git submodule update --remote --merge`.

---

## What this is *not*

- **Not a fork of `pejmanjohn/cc-plugin-codex`.** That repo is a useful reference; the runtime, transport, and plugin model here are different.
- **Not a wrapper around `claude -p`.** v1 does not use `claude -p` at all — not as primary transport, and not as fallback.
- **Not Claude-Code-specific.** The runtime currently ships Claude Code and Antigravity drivers;
  additional providers remain localized driver additions.
- **Not a re-implementation of `openai/codex-plugin-cc`.** That plugin goes CC→Codex; this one goes Codex→CC.
- **Not a TUI parser.** The Claude Code interactive TUI is a human rendering layer; this plugin uses background-session APIs as the semantic source.

---

## Status

The plugin currently ships 24 Codex skills, Claude Code background-session delegation, and
supervised Antigravity print-mode delegation. The shipped version is defined in
[`packages/plugin-delegate/.codex-plugin/plugin.json`](packages/plugin-delegate/.codex-plugin/plugin.json),
and release validation follows [`documentation/RELEASING.md`](documentation/RELEASING.md).
Historical implementation status, including deferred benchmark and review-gate work, remains in
the [plan history](documentation/plan/); those reports are records rather than current setup docs.

### Known risks

- **`claude agents --json` schema or transcript path may change between Claude Code versions.** The driver uses a tolerant parser, the doctor feature-probes at every run, and tests pin recorded fixtures so version drift is caught fast.
- **Provider CLI surfaces can drift between releases.** Setup and doctor commands feature-probe the installed binaries, and release tests cover recorded schemas plus live smoke checks.
- **Private-repo contents may be delegated to Anthropic or Google through the selected local CLI.**
  The plugin discloses this on first use per workspace and provider, and stores separate
  acknowledgements so approval for one provider never authorizes another.
- **`--allow-edit` is a policy/UX flag, not a filesystem sandbox.** The safety boundary is Claude Code's permission system + workspace trust, which this plugin must not undermine.

---

## References

- [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) — the canonical CC→Codex plugin. Source of the persistent-broker pattern we apply in reverse.
- [`pejmanjohn/cc-plugin-codex`](https://github.com/pejmanjohn/cc-plugin-codex) — community Codex→CC plugin. Useful for skill names and dispatcher shape; transport differs from this project.
- [`openai/plugins`](https://github.com/openai/plugins) — first-party Codex plugin examples. Our manifest schema, skill layout, and auxiliary-file conventions are anchored to this catalog.
- [`openai/skills`](https://github.com/openai/skills) — first-party Codex skill catalog. Defines the canonical `SKILL.md` format and the `$skill-installer` distribution flow.
- [Google Antigravity CLI usage](https://antigravity.google/docs/cli/using) — official `agy` command and print-mode reference.
- [Google Antigravity CLI permissions](https://antigravity.google/docs/cli/permissions) — official permission rule and bypass behavior.
- [Codex docs (mirrored)](references/documentation-codex/)
- [Claude Code docs (mirrored)](references/documentation-claudecode/)

---

## Plan and research

All non-trivial work in this repo flows through a five-stage cycle: **plan → implement → audit → polish → report**. The workflow is documented at [`documentation/plan/README.md`](documentation/plan/README.md). Research that informs a plan lives at [`documentation/research/<id>/`](documentation/research/).
