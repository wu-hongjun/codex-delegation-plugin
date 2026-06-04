# cc-plugin-codex

> **Delegate coding work to Claude Code from inside the OpenAI Codex CLI, through Claude Code's native background sessions.**

This repository is a **Codex-native plugin and runtime** that lets the OpenAI Codex CLI orchestrate Claude Code as a delegated coding agent. The transport is Claude Code's first-party background-session surface (`claude --bg`, `claude agents --json`, transcript JSONL, `claude logs`, `claude attach`, `claude stop`) — **not** `claude -p`.

This plugin delegates work to Claude Code through background sessions (`claude --bg`) rather than `claude -p`. It is designed to preserve the architecture needed for session/cache reuse, but savings have not yet been benchmarked.

The runtime is structured as a `Driver` interface with one implementation today (`ClaudeBackgroundDriver`). Adding a future driver for Gemini CLI / Grok Code / Qwen Code / DeepSeek CLI is a localized addition, not a refactor — but only Claude Code ships in v1.

---

## Quick start

This repo is the cc-plugin-codex workspace. Different surfaces target different audiences:

- **Install / use the plugin (end users):** [`marketplace/plugins/claude-companion/README.md`](marketplace/plugins/claude-companion/README.md) — short, install / verify / upgrade / uninstall / troubleshooting + the 8-skill list.
- **Local marketplace tree:** [`marketplace/`](marketplace/) — committed, ready for `codex plugin marketplace add "$(pwd)/marketplace"`.
- **Full plugin docs (developers + contributors):** [`packages/plugin-codex/README.md`](packages/plugin-codex/README.md) — comprehensive runtime, dispatcher, skill, and architecture docs.
- **Release maintainers:** [`documentation/RELEASING.md`](documentation/RELEASING.md) — canonical release-day checklist (prerequisites, version bump, packaging, smoke, CI, tagging, post-release).
- **Plan history:** [`documentation/plan/`](documentation/plan/) — engineering-plan workflow and per-plan implementation logs.

The rest of this README covers the v1 scope, design pillars, and repository layout for contributors. It is not a duplicate of the plugin docs.

---

## v1 scope (what actually ships)

- **One direction**: Codex → Claude Code.
- **One transport**: `ClaudeBackgroundDriver` — uses `claude --bg`, `claude agents --json`, transcript JSONL, `claude logs`. **No PTY in v1.** No `claude -p` fallback in v1.
- **One host plugin**: Codex skills + manifest under `packages/plugin-codex/`.
- **Session-per-job**: every `$claude-delegate` invocation creates a fresh background job. Multi-turn reuse, PTY attach, and companion-session models are deferred to a later plan.
- **Five skills**: `$claude-setup`, `$claude-delegate`, `$claude-status`, `$claude-result`, `$claude-stop`. Review / adversarial-review skills come later.

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

Future-stage methods (`send` for prompt injection, `interrupt`, `resume`, `attach`, `logs`) are sketched as `// future:` comments so the interface evolution is visible but unimplemented.

### 2. Background sessions, not `claude -p`

The `ClaudeBackgroundDriver` does not call `claude -p`. Instead it:

- Spawns `claude --bg --name <sessionName> "<prompt>"` to start a Claude Code conversation as a first-party background session.
- Polls `claude agents --json` for live state — working, needs-input, idle, completed, failed, stopped.
- Reads `~/.claude/projects/<project>/<session-id>.jsonl` (the Claude Code transcript) for messages, tool uses, and metadata.
- Falls back to `claude logs <id>` when transcripts are unavailable.
- **Does not parse the interactive TUI byte stream.** The TUI is a human rendering layer, not a stable protocol.
- **Does not use `claude -p` as a fallback in v1.** If the local Claude Code doesn't support background sessions, the doctor fails hard with upgrade instructions.

This pillar replaces the earlier "PTY-driven TUI" framing. PTY attach is reserved for follow-up prompt injection and human permission handoff and is deferred to plan 0002.

### 3. Codex-first plugin shape

Codex's plugin model is intentionally thinner than Claude Code's — skills are LLM-facing markdown wrappers that shell out to scripts. We embrace that and anchor every convention to the first-party catalogs at [`openai/plugins`](https://github.com/openai/plugins) (vendored at `references/codex-plugins-examples/`) and [`openai/skills`](https://github.com/openai/skills) (vendored at `references/codex-skills-examples/`):

- Manifest at `.codex-plugin/plugin.json` — same shape as the ~148 examples in `references/codex-plugins-examples/plugins/`.
- Skills at `skills/<name>/SKILL.md` — same shape as `references/codex-skills-examples/skills/.system/` and `.curated/`.
- One Node entry point (`scripts/claude-companion.mjs`) handles every skill via subcommands.

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
│   ├── codex-plugins-examples/        ← submodule, openai/plugins @ main (~148 first-party Codex plugin examples)
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
| `references/codex-plugins-examples` | `fef63ec` (`heads/main`, no tags) | `openai/plugins` — first-party Codex plugin manifests. Authoritative reference for `.codex-plugin/plugin.json`, `skills/`, `.app.json`, `.mcp.json`, `agents/`, `commands/`, `hooks.json` conventions. |
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
