# cc-plugin-codex

> **Delegate coding work to Claude Code from inside the OpenAI Codex CLI, through Claude Code's native background sessions.**

## Install

Install the public plugin into Codex:

```bash
codex plugin marketplace add https://github.com/wu-hongjun/cc-plugin-codex
codex plugin add "cc@cc-plugin-codex"
```

Then restart Codex and verify the plugin is installed:

```bash
codex plugin list
```

Inside Codex, run:

```text
$claude-setup
$claude-skills
```

`$claude-setup` should return aggregate status `ok` or `warn`. `fail` means an environment dependency is missing; follow the probe output.

On macOS, do not run a bare `cc` shell command for this plugin; `/usr/bin/cc`
is Apple clang. Use the `$claude-*` Codex skills, or use the exact dispatcher
path reported in JSON `meta.dispatcherPath` / `exactActionHints`. After an
upgrade, an already-running Codex session may still list stale versioned skill
paths; either restart Codex or use the stable dispatcher path:
`~/.codex/plugins/cache/cc-plugin-codex/cc/current/scripts/cc.mjs`.

---

## Quick start

- **Install and use:** follow the commands above, then use `$claude-delegate`, `$claude-wait`, `$claude-status`, `$claude-result`, and `$claude-followup` inside Codex.
- **End-user manual:** [`marketplace/plugins/cc/README.md`](marketplace/plugins/cc/README.md) covers verify, update, uninstall, troubleshooting, and the full skill list.
- **Developer manual:** [`packages/plugin-codex/README.md`](packages/plugin-codex/README.md) covers dispatcher commands, runtime behavior, architecture, and contributor workflows.
- **Marketplace payload:** [`marketplace/`](marketplace/) contains the committed plugin tree that Codex installs.
- **Release checklist:** [`documentation/RELEASING.md`](documentation/RELEASING.md).
- **Plan history:** [`documentation/plan/`](documentation/plan/).

---

## Requirements

- Codex CLI with plugin marketplace support (`codex --version`).
- Claude Code installed and authenticated locally (`claude auth login`).
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
```

Useful discovery and maintenance commands:

```text
$claude-setup
$claude-skills
$claude-upgrade
```

The plugin currently ships 17 skills: `$claude-setup`, `$claude-delegate`, `$claude-status`, `$claude-wait`, `$claude-result`, `$claude-stop`, `$claude-followup`, `$claude-review`, `$claude-adversarial-review`, `$claude-workflow`, `$claude-goal`, `$claude-fork`, `$claude-batch`, `$claude-deep-research`, `$claude-workflows`, `$claude-skills`, `$claude-upgrade`.

---

## Real Chrome And Permissions

Use `--chrome` when a delegated Claude job needs the real Chrome browser. There is no `--real` flag. Real Chrome access uses Claude Code's Chrome extension / connected-browser flow, which is separate from Codex's in-app browser.

Some prompts cannot be answered safely by the background wrapper. If Claude asks which Chrome browser to use, asks you to pick in the extension, or reaches a passkey/login/user-gesture step, run `$claude-status --job <jobId> --json --compact` and follow `waiting.userAction` (usually `claude attach <shortId>`). Choose the Chrome profile that already has the needed logged-in session.

For trusted unattended shell/tool QA, you can explicitly start a fresh job with `--bypass-permissions`, `--permission-mode bypassPermissions`, or `--dangerously-skip-permissions`. These launch Claude Code with its literal `--dangerously-skip-permissions` flag. Once you have opted into trusted unattended Claude work for a task/session/project, Codex may reuse `--bypass-permissions` on fresh local shell/tool automation jobs. If Claude still asks for interactive input immediately, the plugin stops the start attempt and marks the job failed with a clear reason instead of leaving a blocked background worker. Bypass can reduce Claude tool permission prompts, but it does not choose among Chrome browsers, complete passkeys, inspect cookies/passwords/session stores, or replace local user gestures.

When a job is already blocked, run `$claude-status --job <jobId> --json --compact`. Blocked jobs include `operatorState`, `blockedOn`, `actionHints.restartWithBypass`, `actionHints.stop`, and `actionHints.cleanupBlocked`. Restart commands require a fresh prompt because cc stores prompt metadata, not the full original prompt text.

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
codex plugin marketplace upgrade "cc-plugin-codex"
codex plugin remove "cc@cc-plugin-codex"
codex plugin add "cc@cc-plugin-codex"
codex plugin list
```

If an older installed dispatcher crashes while running `$claude-upgrade --yes`
or `cc upgrade --yes` (for example, `Cannot read properties of undefined
(reading 'map')`), bypass that old dispatcher and run the shell commands above.
Those commands use Codex's plugin manager directly and replace the broken cached
dispatcher with the current release.

---

## Uninstall

```bash
codex plugin remove "cc@cc-plugin-codex"
codex plugin marketplace remove "cc-plugin-codex"
```

This removes the Codex plugin registration and marketplace pointer. It does not delete Claude Code transcripts or plugin job records.

---

## What This Is

This repository is a **Codex-native plugin and runtime** that lets the OpenAI Codex CLI orchestrate Claude Code as a delegated coding agent. The transport is Claude Code's first-party background-session surface (`claude --bg`, `claude agents --json`, transcript JSONL, `claude logs`, `claude attach`, `claude stop`) — **not** `claude -p`.

This plugin delegates work to Claude Code through background sessions (`claude --bg`) rather than `claude -p`. It is designed to preserve the architecture needed for session/cache reuse, but savings have not yet been benchmarked.

The runtime is structured as a `Driver` interface with one implementation today (`ClaudeBackgroundDriver`). Adding a future driver for Gemini CLI / Grok Code / Qwen Code / DeepSeek CLI is a localized addition, not a refactor — but only Claude Code ships in v1.

---

## Local Contributor Install

For development from a checkout:

```bash
git clone https://github.com/wu-hongjun/cc-plugin-codex.git
cd cc-plugin-codex
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add "cc@cc-plugin-codex-local"
codex plugin list
```

After pulling a newer local checkout, refresh the installed local plugin cache:

```bash
git pull
codex plugin remove "cc@cc-plugin-codex-local"
codex plugin add "cc@cc-plugin-codex-local"
codex plugin list
```

If you moved or re-cloned the local repository, refresh the local marketplace pointer too:

```bash
codex plugin remove "cc@cc-plugin-codex-local"
codex plugin marketplace remove "cc-plugin-codex-local"
codex plugin marketplace add "<repo-root>/marketplace"
codex plugin add "cc@cc-plugin-codex-local"
codex plugin list
```

Replace `<repo-root>` with the absolute path to the clone.

## Deployment Model

There is no npm package deployment for this project today. The deployable artifact is the committed marketplace payload:

```text
marketplace/plugins/cc/
```

For users, "deploy" means: add this GitHub repository as a Codex Git marketplace and install `cc@cc-plugin-codex`.

For contributors, the local development path remains: clone the repo, add `marketplace/` to Codex, and install `cc@cc-plugin-codex-local`.

An npm wrapper could be added later, but it would only wrap these Codex marketplace commands unless the project also commits to publishing and maintaining a separate global CLI package.

The root [`install.sh`](install.sh) script is intentionally just a convenience wrapper around the same marketplace install commands; it is not a separate package manager path.

For maintainers, "release" means:

1. Make source changes under `packages/`.
2. Regenerate the marketplace tree with `node tools/package-marketplace.mjs --write`.
3. Keep the root [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) pointing at `./marketplace/plugins/cc`.
4. Verify with `node tools/package-marketplace.mjs --check`, local tests, smoke, and CI.
5. Bump `packages/plugin-codex/.codex-plugin/plugin.json`.
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

- **One direction**: Codex → Claude Code.
- **One primary transport**: `ClaudeBackgroundDriver` — uses `claude --bg`, `claude agents --json`, transcript JSONL, `claude logs`, `claude attach`, and `claude stop`. It does not use `claude -p`.
- **One host plugin**: Codex skills + manifest under `packages/plugin-codex/`.
- **Session-per-job with follow-ups**: every `$claude-delegate` invocation creates a fresh background job. Continue an existing job with `$claude-followup <jobId>`; do not reuse `--name` as a session key.
- **Seventeen skills**: `$claude-setup`, `$claude-delegate`, `$claude-status`, `$claude-wait`, `$claude-result`, `$claude-stop`, `$claude-followup`, `$claude-review`, `$claude-adversarial-review`, `$claude-workflow`, `$claude-goal`, `$claude-fork`, `$claude-batch`, `$claude-deep-research`, `$claude-workflows`, `$claude-skills`, `$claude-upgrade`.

The full v1 plan, including every deliberately-deferred feature, lives at [`documentation/plan/0001-20260530-initial-plan/1-plan.md`](documentation/plan/0001-20260530-initial-plan/1-plan.md). It supersedes any conflicting framing in this README.

---

## Context

OpenAI's official plugin [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) goes the *other* direction — it lets **Claude Code drive Codex** as a sub-agent, using Codex's `app-server` JSON-RPC protocol for a persistent connection with streaming notifications and session/thread reuse. That is the structural template we admire.

The community port [`pejmanjohn/cc-plugin-codex`](https://github.com/pejmanjohn/cc-plugin-codex) goes our direction — Codex drives Claude Code — but does so by shelling out to `claude -p --output-format json …` once per call. That choice has architectural consequences this project does not want to inherit, and it is also the wrong subscription-side surface starting 2026-06-15, when Anthropic accounts `claude -p` and Agent SDK usage on subscription plans against a separate monthly Agent SDK credit pool rather than normal interactive usage.

This project takes a different approach: drive Claude Code through its first-party **background-session** surface, treat machine-readable transcripts and `claude agents --json` as the semantic source of truth, and resist the temptation to parse the human-facing TUI. The detailed reasoning lives in [`documentation/research/20260530-initial-research/report.md`](documentation/research/20260530-initial-research/report.md).

---

## Design pillars

### 1. Driver abstraction (`Driver` interface) — *design seam; v1 ships one implementation*

A single interface that every supported coding agent could implement. In v1, only `ClaudeBackgroundDriver` is built. The interface exists so a future second driver is a localized addition, not a rewrite — and so Codex-specific assumptions do not leak into the runtime.

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
- One Node entry point (`scripts/cc.mjs`) handles every skill via subcommands.

### 4. Universal plugin descriptor — *design seam; v1 ships Codex shape only*

The intent is one descriptor schema that could describe the same plugin for any host CLI. **v1 only emits the Codex shape**; the shared shape is preserved internally so other host emitters can be added later without churn.

### 5. Capability negotiation by feature probe

At startup, `ClaudeBackgroundDriver.probe()` runs feature probes — `claude --bg` works, `claude agents --json` returns parseable JSON, `claude logs` works, `claude daemon status` works, transcript directory is detectable or logs fallback works. There is no semver pin in v1; the doctor either says all green or says exactly which probe failed. A concrete minimum semver may be pinned in a later plan after live testing confirms the actual floor.

### 6. Persistent job store

Jobs are recorded under `~/.codex/cc-plugin-codex/jobs/` with the Claude session ID, transcript path, and result preview. `$claude-status`, `$claude-result`, and `$claude-stop` work from the job store without re-invoking the underlying agent.

---

## Repository layout

```
cc-plugin-codex/
├── README.md                          ← you are here
├── packages/                          ← implementation
│   ├── runtime/                       ← Driver interface, job store, reconciler, doctor primitives
│   ├── driver-claude-code/            ← ClaudeBackgroundDriver
│   └── plugin-codex/                  ← Codex skills + manifest + entry script
├── tools/
│   └── mock-claude/                   ← fake `claude` binary used by tests
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
- **Not Claude-Code-specific.** Claude Code is the only driver in v1, but the runtime is designed so additional drivers (Gemini, Grok, Qwen, DeepSeek) are localized additions later.
- **Not a re-implementation of `openai/codex-plugin-cc`.** That plugin goes CC→Codex; this one goes Codex→CC.
- **Not a TUI parser.** The Claude Code interactive TUI is a human rendering layer; this plugin uses background-session APIs as the semantic source.

---

## Status

Plans 0001-0003 and Plan 0006 are complete; Plan 0004 is paused pending post-cutover measurement; Plan 0005 is deferred. See the [plan history](documentation/plan/) for details.

- [x] Repository scaffolded; four reference submodules pinned; docs snapshotted.
- [x] Architectural research complete and corrected ([report](documentation/research/20260530-initial-research/report.md)).
- [x] Plan 0001 drafted and approved 2026-05-30; all six open questions resolved by the maintainer.
- [x] Plan 0001 — Initial foundation ([readme](documentation/plan/0001-20260530-initial-plan/readme.md)) — complete.
- [x] Plan 0002 — multi-turn reuse via PTY attach / channels — complete.
- [x] Plan 0003 — `$claude-review`, `$claude-adversarial-review` — complete.
- [ ] Plan 0004 — benchmark harness comparing `-p`, `-p --resume`, fresh-per-task background, reused background (paused pending post-cutover T11/T12).
- [ ] Plan 0005 — stop-time review gate via hooks (deferred).
- [x] Plan 0006 — marketplace packaging + distribution polish — complete.

### Known risks

- **`claude agents --json` schema or transcript path may change between Claude Code versions.** The driver uses a tolerant parser, the doctor feature-probes at every run, and tests pin recorded fixtures so version drift is caught fast.
- **The maintainer's local Claude Code version is the de-facto v1 floor** until the benchmark harness lands; the doctor reports the exact running version every time it runs, and `2-implement.md` records it.
- **Private-repo contents are delegated to Anthropic via the user's Claude Code account.** `$claude-delegate` discloses this on first run per workspace and records the acknowledgement in the job store. Plugin defaults preserve Claude Code's permission system; no bypass flags are ever passed.
- **`--allow-edit` is a policy/UX flag, not a filesystem sandbox.** The safety boundary is Claude Code's permission system + workspace trust, which this plugin must not undermine.

---

## References

- [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) — the canonical CC→Codex plugin. Source of the persistent-broker pattern we apply in reverse.
- [`pejmanjohn/cc-plugin-codex`](https://github.com/pejmanjohn/cc-plugin-codex) — community Codex→CC plugin. Useful for skill names and dispatcher shape; transport differs from this project.
- [`openai/plugins`](https://github.com/openai/plugins) — first-party Codex plugin examples. Our manifest schema, skill layout, and companion-file conventions are anchored to this catalog.
- [`openai/skills`](https://github.com/openai/skills) — first-party Codex skill catalog. Defines the canonical `SKILL.md` format and the `$skill-installer` distribution flow.
- [Codex docs (mirrored)](references/documentation-codex/)
- [Claude Code docs (mirrored)](references/documentation-claudecode/)

---

## Plan and research

All non-trivial work in this repo flows through a five-stage cycle: **plan → implement → audit → polish → report**. The workflow is documented at [`documentation/plan/README.md`](documentation/plan/README.md). Research that informs a plan lives at [`documentation/research/<id>/`](documentation/research/).
