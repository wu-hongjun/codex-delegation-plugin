# Claude Code Functionality Audit vs cc-plugin-codex v0.2.0

**Date**: 2026-06-04
**Trigger**: Maintainer ask following the [Claude Code w22 digest](https://code.claude.com/docs/en/whats-new/2026-w22) ("dynamic workflows" surfaced as a feature we don't cover).
**Claude Code latest at audit time**: v2.1.162 (2026-06-03) — eight versions past where this plugin was last validated (2.1.152, recorded in Plan 0006 T9 / T9.5).
**Plugin baseline**: `claude-companion@cc-plugin-codex-local` v0.2.0, tag `v0.2.0` at `ea595e1`.
**Methodology**: 6 parallel `claude-code-guide` (Opus) subagents, each fetching official docs + changelog for one slice. Sources cited inline. No reverse-engineering — only public docs.

This report is **not a plan**. It's a research artifact intended to inform a future plan. Per maintainer's standing rule: no new plan starts without explicit authorization.

---

## 1. Scope of the plugin today (what's actually shipped in v0.2.0)

The committed surface is:

- 8 skills: `$claude-setup`, `$claude-delegate`, `$claude-status`, `$claude-result`, `$claude-stop`, `$claude-followup`, `$claude-review`, `$claude-adversarial-review`.
- Dispatcher (`packages/plugin-codex/scripts/claude-companion.mjs`) consumes:
  - `claude --bg`, `claude attach <id>`, `claude stop <id>`
  - `claude agents --json` (pinned to the 2.1.149+ row format)
  - `claude logs <id>` (used informationally in setup)
  - `~/.claude/jobs/<shortId>/state.json` sidecar (defensively parsed; schema is undocumented)
  - `claude --bg-pty-host` daemon at `~/.claude/daemon.json`
- node-pty 1.2.0-beta.13 for PTY-based input injection (for `$claude-followup` / `$claude-review`'s same-session input path).
- Three forwarded CLI flags: `--model`, `--effort`, `--permission-mode`.

The plugin makes deliberately conservative claims: no benchmarking, no claim of cost savings, no claim of session reuse beyond what's been validated.

---

## 2. Claude Code in 2026-w22 — what changed

Quoting the [digest](https://code.claude.com/docs/en/whats-new/2026-w22):

> *"Run Claude Code on Claude Opus 4.8, orchestrate large tasks with dynamic workflows, catch security issues with the security-guidance plugin, and use fast mode on Opus 4.8 at a lower price."*

Headline features (v2.1.150 → v2.1.157, per the digest + changelog research):

1. **Opus 4.8** — new default model on Max / Team Premium / Enterprise PAYG / API. Defaults to high effort; `/effort xhigh` for harder tasks. Requires v2.1.154+.
2. **Dynamic workflows** (research preview) — Claude writes a JavaScript orchestration script that runs subagents in the background. Managed with `/workflows`. Triggered by the `ultracode` keyword or natural language ("create a workflow that …"). Up to 16 concurrent agents, 1000 total per run.
3. **Security-guidance plugin** — Anthropic-published; installed via `/plugin install security-guidance@claude-plugins-official`.
4. **Fast mode on Opus 4.8** — `/fast`; `$10/$50` per MTok (2× standard for ~2.5× speed). Opus 4.6 fast mode deprecated.

Other items from the digest (12 "wins"): `claude --bg --exec`, `!shell` in `claude agents`, `.claude/skills/` auto-load, `claude plugin init`, `/reload-skills`, `SessionStart.reloadSkills`, `disallowed-tools` in skill frontmatter, `MessageDisplay` hook, `--fallback-model` session-wide, `defaultEnabled: false` in `plugin.json`, vim-mode `/` history search, streaming tool execution always on, `←←` agents view everywhere, `claude mcp list/get` pending-approval display when piped.

Versions newer than w22 picked up in research (v2.1.158–v2.1.162, late May / early June 2026) also affect us — see § 6.

---

## 3. Dynamic workflows — full deep dive

**Source**: https://code.claude.com/docs/en/workflows + w22 digest.

### Object model

- A workflow is a **JavaScript orchestration script** Claude writes for the task, then a runtime executes in the background. The script lives at `~/.claude/projects/<project-path>/workflows/`. It is **not** a single `claude --bg` session — it is a parallel system with its own runtime.
- Subagents inside the workflow are **ephemeral children of the workflow runtime**. They do not appear in `claude agents --json`.
- Up to 16 concurrent agents, 1000 total per run.
- Subagents inherit the parent session's tool allowlist but always run in `acceptEdits` mode (file edits auto-approved) regardless of parent permission mode.

### Public surface

- `/workflows` — TUI to list runs, drill into phases / agents / results.
- `/deep-research <question>` — built-in bundled workflow.
- `ultracode` keyword (renamed from `workflow` in v2.1.154 → v2.1.160) — triggers Claude to write a workflow for the current task.
- `/effort ultracode` — enable automatic workflow planning for all substantive tasks in the session.
- Inside `/workflows` TUI: `p` (pause/resume), `x` (stop), `r` (restart agent), `s` (save script as `/command`).

### What is **NOT** in the public surface (the audit-blocker for us)

- **No `claude workflows` CLI verb**. No `claude --workflow`. No CLI entry point.
- **No `claude workflows --json`**. No machine-readable list / status / result.
- **No sidecar** like `~/.claude/jobs/<id>/state.json`. The runtime tracks state internally; visible only via TUI.
- **No hooks** for workflow lifecycle (`WorkflowStart`, `WorkflowPhase*`, `WorkflowComplete`). The existing `PreToolUse`/`PostToolUse` fire inside subagent turns, but no workflow-level events.
- **No documented status enum** for the run itself.
- **No documented error model** — failure / retry / timeout behavior is unstated.
- Run does NOT survive `claude` session exit: "Resume works within the same Claude Code session. If you exit Claude Code while a workflow is running, the next session starts the workflow fresh."

### Implication for us

To wrap dynamic workflows in our plugin, **we'd have to reverse-engineer**:
- the script-write path under `~/.claude/projects/<project>/workflows/`
- some way to start a workflow non-interactively (the digest's example is interactive: `> create a workflow that migrates every internal fetch() call`)
- some way to observe run state without the TUI

This is a substantial investment, and any of it could break in a single Claude Code release because the surface is explicitly "research preview." A more conservative wrapping is **a passthrough**: `$claude-workflow <prompt>` opens an attached Claude session with the workflow-trigger prompt prefilled, and the user manages the run interactively from there.

---

## 4. Background sessions — what we use vs what now exists

### Our current coverage (v0.2.0)

| Surface | Coverage | Notes |
|---|---|---|
| `claude --bg` | ✅ used for `$claude-delegate` | `--model`, `--effort`, `--permission-mode` forwarded |
| `claude attach` | ✅ used for follow-up + same-session review | PTY-based; bracketed-paste wrap; warmup tuned for 2.1.150 |
| `claude agents --json` | ✅ used for status reconcile | parser pinned to 2.1.149+ row format |
| `claude logs` | ✅ probed in `$claude-setup` | not used for read-back |
| `~/.claude/jobs/<id>/state.json` | ✅ defensively parsed | schema undocumented; fragile by design |
| `~/.claude/daemon.json` | ✅ probed in `$claude-setup` | format also undocumented |

### What's been added since 2.1.150 that we don't touch

| Surface | Version | Relevance |
|---|---|---|
| `claude --bg --exec '<cmd>'` | v2.1.154+ | Shell-command-as-bg-job. Different from our conversation-delegate. Doctor could probe support. |
| `! <command>` in `claude agents` UI | v2.1.154+ | TUI-only, orthogonal. |
| `claude --bg --agent <name>` | v2.1.157+ | Dispatch to specific subagent. Could be forwarded as `--agent` on `$claude-delegate`. |
| `claude agents --json` `waitingFor` field | v2.1.162+ | **Affects us** — our parser was written against the 2.1.149+ row format. New columns should be tolerated (we already do this defensively, but should be re-verified). |
| Pinned sessions survive idle | v2.1.154+ | Affects status-enum interpretation. |
| `claude respawn <id>` / `claude respawn --all` | new in the v2.1.150-v2.1.162 window per CLI agent | Useful after Claude Code updates. Our plugin has no `$claude-respawn` skill. |
| `claude rm <id>` | new in the same window | Removes session from list; keeps transcript. We don't expose this. |
| `claude daemon status` / `claude daemon stop --any` | exists in current docs | We don't expose; could be useful for diagnostics. |

### Sidecar / daemon manifest

Both `~/.claude/jobs/<id>/state.json` and `~/.claude/daemon.json` remain **intentionally undocumented** per the public Claude Code docs. The "background sessions" agent flagged this explicitly: documented surfaces are CLI + JSON + hooks; sidecar layout is reverse-engineered and unstable across versions. Our defensive parser is the correct posture; the risk is that the schema mutated between 2.1.150 and 2.1.162 in ways we haven't probed.

### Status enum drift

Subagent surfaced public-facing statuses now visible in agent view: `running`, `working` (with `done/total` from v2.1.161+), `awaiting_followup`, `completed`, `failed`, `stopped`, `idle`. Our internal status enum should be re-checked against these — particularly `working` (new) and the `done/total` parallel-work display.

---

## 5. Plugin / skill / marketplace ecosystem — Claude Code vs Codex

The plugin / marketplace research agent compared Claude Code's plugin ecosystem to Codex's. Findings:

### Claude Code's `plugin.json` schema (now)

Required: `name`, `description`. Optional: `version`, `author`, `homepage`, `repository`, `license`, and — **new in w22** — `defaultEnabled: false` (plugin installs but does not auto-enable; user enables via `/plugin enable`).

### Claude Code's skill frontmatter

Plus **new in w22**: `disallowed-tools` (array of tool names removed from Claude while the skill is active). This is a security tightening surface our skills don't use — none of our 8 skills declares one, and Codex 0.136.0's support for the field is currently unverified.

### New skill auto-load (w22)

Plugins in `.claude/skills/` (or `~/.claude/skills/`) are loaded automatically, no marketplace required. `claude plugin init <name>` scaffolds one. **Not relevant to our plugin** (we ship via the Codex marketplace), but worth noting as a Codex parity question.

### `SessionStart` hook returning `reloadSkills: true`

New in w22 (v2.1.152): hook can ask Claude Code to re-scan skill directories mid-session. Could be exploited by `$claude-setup` if it ever installs new skills, but currently doesn't.

### Comparison to Codex

The Codex plugin model (the one we ship into) has its own schema (`.codex-plugin/plugin.json`) with fields like `defaultPrompt`, `brandColor` that don't exist in Claude Code's. Conversely, Claude Code's `defaultEnabled`, `disallowed-tools`, and `.claude/skills/` auto-load don't have Codex parallels in 0.136.0 as far as Codex's docs show. **Cross-pollination is a separate research turn**, not action material today.

---

## 6. Hooks — every event type now in Claude Code

The hooks agent enumerated **~30 hook event types**:

Session & lifecycle: `SessionStart`, `SessionEnd`, `Setup`.
User input: `UserPromptSubmit`, `UserPromptExpansion`.
Tool execution: `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`.
Workflow & files: `FileChanged`, `CwdChanged`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`.
Context: `PreCompact`, `PostCompact`, `InstructionsLoaded`.
Message: **`MessageDisplay`** (new w22 v2.1.152), `Notification`.
Agents / tasks: `SubagentStart`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`.
Response: `Stop`, `StopFailure`.
MCP elicitation: `Elicitation`, `ElicitationResult`.

### Items most relevant to us

- **`MessageDisplay`** can transform / hide assistant message text as it's displayed. If a user installs a `MessageDisplay` hook in Claude Code (e.g. for redaction), our `$claude-result` is reading from `~/.claude/projects/<sanitized-cwd>/<session>.jsonl` and the sidecar, not the displayed text — so the hook does NOT affect our output. **Worth a docs note**: the divergence between "what the user sees in Claude Code" and "what `$claude-result` reads" widens with `MessageDisplay`.
- **`SessionStart.reloadSkills`** is irrelevant to our plugin runtime but useful if we ever ship a skill that installs new Claude Code skills.
- **No workflow-lifecycle hooks exist.** Confirms that workflow integration requires either TUI-bridging or polling reverse-engineered state.

### Hook fan-out & background sessions

Per the hooks agent: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, **and** `MessageDisplay` all fire in background sessions, with the same JSON contract. So a `claude --bg` job our plugin starts is subject to the user's Claude Code hooks. If `MessageDisplay` rewrites text, our `$claude-result` may read content that no human ever saw in their Claude Code TUI.

---

## 7. CLI / slash / model / settings surface

### CLI verbs we don't currently touch but might want to

- `claude respawn <id>` / `claude respawn --all` — restart stopped session preserving conversation. Useful after Claude Code updates. Could become `$claude-respawn` skill.
- `claude rm <id>` — remove from list, preserve transcript. Currently mixed into `$claude-stop` (which only stops). Could be `--rm` flag or `$claude-rm`.
- `claude daemon status` — diagnostics in `$claude-setup`.
- `claude --output-format json|stream-json` — print mode. Could matter for SDK-style ingestion.

### Slash commands

All TUI-only. Our plugin doesn't drive the Claude Code TUI directly (we spawn `claude --bg` and use PTY attach), so `/model`, `/effort`, `/fast`, `/workflows`, `/reload-skills`, `/plugin`, `/mcp` are out of scope for direct invocation. We *could* in theory open `claude attach` then send a slash command via PTY input — that's how `/workflows` would be triggered if we ever wrapped workflows the "passthrough" way.

### Models & effort

- **Opus 4.8** is the new API default (v2.1.154+). Defaults to `high` effort.
- Effort levels: `low`, `medium`, `high`, `xhigh`, `max`, and `ultracode` (session-only; triggers dynamic workflow planning).
- We forward `--effort` but **do not validate values** in our delegate path. If a user passes `--effort ultracode`, behavior is undefined from our perspective.

### `--fallback-model` (new w22)

When the primary model isn't found, Claude Code switches to the configured fallback for the rest of the session. Affects our `$claude-adversarial-review --model X` — if `X` isn't installed, the review silently runs on the fallback. **Worth a docs note**.

### Fast mode

`/fast` is intra-session. Our `claude --bg` sessions don't start in fast mode by default. Worth a note that fast mode is not a delegate-side knob.

---

## 8. Recent changelog (v2.1.148 → v2.1.162) — items that touch our plugin

The changelog agent itemized every release between v2.1.148 and v2.1.162. Items most relevant to us (the others were fixes/internal):

| Version | Item | Relevance to plugin |
|---|---|---|
| v2.1.152 | `disallowed-tools` skill frontmatter; `MessageDisplay` hook; `SessionStart.reloadSkills`; `--fallback-model` session-wide | New surfaces; not used. Docs notes recommended. |
| v2.1.153 | `--strict-mcp-config` no longer strips inline `mcpServers` from explicit agent definitions; `/model` keybinding rename | Edge case; we don't pass `--strict-mcp-config`. |
| v2.1.154 | Opus 4.8; dynamic workflows; `--bg --exec`; `defaultEnabled: false`; `←←` agents view on all backends; streaming tool execution always on | Material — see §3 and §5. |
| v2.1.157 | `.claude/skills/` auto-load; `claude plugin init`; `claude agents` agent-field honored | Not directly used. Possible parity work for Codex. |
| v2.1.158 | Auto mode on Bedrock/Vertex/Foundry for Opus 4.7+4.8 (opt-in env) | Doctor could probe `CLAUDE_CODE_ENABLE_AUTO_MODE`. |
| v2.1.160 | `ultracode` rename (was `workflow`); `acceptEdits` prompts before writing build-tool config files | First is a real keyword breakage if anyone wrote tooling against `workflow`. We didn't. |
| v2.1.161 | `claude agents` `done/total` parallel-work display; failed parallel tool no longer cancels batch | Status display drift; our parser is forgiving. |
| v2.1.162 | `claude agents --json` includes `waitingFor` field | **Re-verify our defensive parser tolerates the new column.** Probably yes (we ignore unknown fields). |

**Items the changelog agent could not retrieve**: v2.1.151 appears to have been skipped or internal-only.

---

## 9. Gap analysis (consolidated, by priority)

### HIGH — net-new functionality not covered

**G1. Dynamic workflows (the named ask).** No surface, no skill, no plumbing. Two candidate scopings:

- **G1a. Passthrough skill.** `$claude-workflow <prompt>` opens `claude attach` against a fresh `claude --bg` session and PTY-injects `/effort ultracode\n<prompt>\n`. Run is managed interactively from Codex's attach. ~½ T-task. Lowest risk; high user value.
- **G1b. Workflow runtime integration.** Wrap `/workflows` semantics with our own list / status / stop / result skills, reverse-engineering script paths under `~/.claude/projects/<project>/workflows/`. Multi-T-task. **High risk** because the underlying surface is research-preview and the script storage path is undocumented.

Recommended next step: **research turn** specifically against `/workflows` TUI behavior (drive it via tmux + qa-tester) before scoping G1b.

### MEDIUM — coverage drift on existing surfaces

**G2. `claude agents --json` `waitingFor` field (v2.1.162).** Re-verify our parser tolerates the new column. Likely already fine (defensive), but worth a one-line test.

**G3. Status enum re-check.** Public statuses now include `working` with `done/total` (v2.1.161+). Our internal status mapping should be re-checked.

**G4. Opus 4.8 readiness probe in `$claude-setup`.** Doctor currently reports raw `claude-version`. Adding a version-floor compare (`>= 2.1.154` → Opus 4.8 supported) is one small change. Surfacing `--effort xhigh` / `--effort max` / `--effort ultracode` validity per model would be a small extension.

**G5. `--fallback-model` interaction.** Docs note in plugin README troubleshooting: when `$claude-adversarial-review --model X` runs and `X` isn't available, fallback silently kicks in.

**G6. `MessageDisplay` hook divergence.** Docs note: `$claude-result` reads from session JSONL + sidecar, not from the displayed text. If a user has a `MessageDisplay` hook redacting output in the TUI, `$claude-result` may show the un-redacted content.

### LOW — new CLI verbs / surfaces with no critical-path use case

**G7. `claude respawn` / `claude rm`.** Could become `$claude-respawn` / a `--rm` flag on `$claude-stop`. Not high-priority.

**G8. `claude --bg --exec '<cmd>'`.** Different abstraction (shell job, not conversation delegate). Doctor probe could note its availability. No skill wrapper makes sense for us.

**G9. `claude --bg --agent <name>` forwarding.** v2.1.157+ flag for dispatching to a specific subagent. Could become a `--agent` forward on `$claude-delegate`.

**G10. `claude daemon status` diagnostic.** Could be included in `$claude-setup` output. Already partly probed.

### NIT — parity / hygiene items

**G11. `defaultEnabled` field in plugin.json.** Codex 0.136.0 support is currently unverified. Even if supported, our current UX is "user explicitly opts in via `codex plugin add`", so we likely want default-enabled.

**G12. `disallowed-tools` in skill frontmatter.** Codex's support is unverified. Even if supported, our skills don't currently need to declare it (they shell out to one dispatcher).

**G13. Security-guidance plugin downstream effect.** If a user has Anthropic's `security-guidance@claude-plugins-official` enabled in Claude Code, our `$claude-delegate`'s `claude --bg` inherits it, which may add review chatter to `$claude-result` output. One-line note in plugin README troubleshooting.

---

## 10. Recommended next steps (in order, all requiring maintainer authorization)

1. **Read more** — fetch the actual `/workflows` doc + the Claude Code `agent.json` / skill auto-load docs directly (this report relies on agent summaries; verify before scoping).
2. **TUI smoke against `/workflows`** — drive Claude Code 2.1.162's `/workflows` via tmux + `qa-tester` to confirm the surface, observe script-write paths, and answer: does `/workflows` itself attach if started from a non-interactive `claude --bg` session? This is the load-bearing question for G1a vs G1b.
3. **Scoping** — based on (2), decide between G1a (passthrough, fast) and G1b (full integration, multi-stage).
4. **Bundle G2–G6 as a single Plan 0007 "Claude Code w22 + w23 parity" docs/probe pass.** All five are small, none change marketplace payload, all are docs + setup-doctor adjustments.
5. **G7–G13 are backlog**, not Plan 0007 candidates.

This is not a plan, not a commitment, and not a tag. Plan 0004 T11 + T12 and Plan 0005 remain the bottleneck path.

---

## 11. Source URLs (consolidated)

- https://code.claude.com/docs/llms.txt (index)
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/agents (background sessions)
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/cli
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/fast-mode
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/whats-new/2026-w22
- https://code.claude.com/docs/en/changelog (v2.1.148–v2.1.162 covered)

---

## 12. Follow-up sequencing turn (2026-06-05) — doc verification + live TUI smoke

After the original audit, a focused follow-up turn ran two parallel subagents to re-ground §3 against the public docs and to empirically probe `/workflows` on the local install.

### Sub-A — Doc verification on `/workflows` (claude-code-guide, Opus)

Re-grounded §3 with direct citations. Confirms the prior summary on most points but adds three load-bearing corrections / additions:

**A1 — `claude -p` IS a documented non-interactive trigger.** The prior §3 said "every public entry point goes through the `/workflows` TUI or the `ultracode` keyword inside an interactive session" — that overstates the picture. The workflows doc says verbatim:

> "Workflows are available in the CLI, the Desktop app, the IDE extensions, **non-interactive mode with `claude -p`**, and the Agent SDK."
> — https://code.claude.com/docs/en/workflows#turn-workflows-off

And on approval flow:

> "In `claude -p` and the Agent SDK there is no one to prompt, so tool calls follow your configured permission rules without interactive confirmation."
> — same page

This materially changes our G1 scoping. A `claude -p "ultracode: <task>"` invocation (or the Agent SDK equivalent) is a real programmatic surface. Whether it produces structured streaming output suitable for our dispatcher to consume is the next empirical question; the docs don't show an example.

**A2 — `claude --bg` workflow support is NOT documented.** The doc lists CLI / Desktop / IDE / `claude -p` / Agent SDK but does NOT list `claude --bg` as a workflow-trigger surface. We cannot assume it works.

**A3 — Hook-based triggering is explicitly NOT supported.** No workflow lifecycle hooks. A `SessionStart` hook injecting `ultracode` would only fire in a session that the user has already attached to.

Other small additions confirmed by Sub-A:

- `disableWorkflows: true` is a real `settings.json` field (and there's a `CLAUDE_CODE_DISABLE_WORKFLOWS=1` env var).
- The script storage path is "under your session's directory in `~/.claude/projects/`" — exact subdir layout and file extension are NOT documented. To know the on-disk shape we have to observe it empirically.
- Limits: 16 concurrent agents, 1000 total per run — confirmed verbatim. Per-phase timeout: not documented. Max script size: not documented.
- Telemetry / OpenTelemetry surface for workflows: not documented (no `app.entrypoint` label or workflow-specific metrics).

### Sub-B — Live TUI smoke (qa-tester, tmux)

Empirical result against the local `claude` binary. Artifact: `artifacts/workflow-tui-smoke-20260605.txt` (368 lines).

**B1 — Local `claude` is v2.1.152.** That is **two minor releases below the v2.1.154 feature gate** for both dynamic workflows and `--bg --exec`. The local install was the same version used during Plan 0006 T9 / T9.5 smoke. Plan 0006 did not require any feature past 2.1.152, so this was correct at the time; it is now a constraint on this audit's follow-up work.

**B2 — `/workflows` returns `Unknown command`** on the local install. Confirmed via tmux drive.

**B3 — `claude --bg --exec 'echo hello-from-exec'` is rejected.** The `--bg` flag is accepted (creates an idle background session), but `--exec` returns `error: unknown option '--exec'`. When combined, `--exec` is silently dropped.

**B4 — The workflow-creation prompt was handled as a plain authoring task, not a workflow trigger.** The qa-tester sent `> create a tiny workflow that counts the lines in README.md. only one phase, only one agent.` The model used the Write tool to create a static 8-line `workflow.yaml` file in the cwd. No "Dynamic workflow requested" indicator appeared; no runtime started. This is exactly what we'd expect from a pre-feature-gate Claude Code: the keyword has no special meaning yet.

**B5 — `~/.claude/projects/` state after the smoke** showed only a standard session JSONL transcript under the sanitized-cwd directory. **No `workflows/` directory was created.** No `state.json`-shaped sidecar appeared. This is consistent with B2–B4: with workflows not installed, no workflow state can land on disk.

**B6 — Cleanup**: tmux session killed; throwaway cwd `rm -rf`'d; background bg session stopped via `claude stop`. `~/.claude/` was left intact aside from the standard session transcript.

### Consolidated implication

Before any of our G1 scoping options (passthrough G1a or full integration G1b) can be tested empirically on this machine, the maintainer needs to upgrade Claude Code to **≥ v2.1.154** (and ideally to v2.1.162 to match the latest changelog this audit covered). Suggestion: `brew upgrade claude-code` (or whichever installer was used originally).

Once upgraded, the next empirical turn should:

1. Re-run the same `/workflows` + `--bg --exec` smoke against the upgraded binary, capturing the workflow script path under `~/.claude/projects/<sanitized-cwd>/workflows/` (or wherever it actually lands).
2. Test `claude -p "ultracode: <prompt>"` (or the equivalent) to see whether the workflow runtime fires non-interactively and what output format it produces. If `claude -p --output-format stream-json` emits workflow events as line-delimited JSON, that's a real programmatic surface and G1a-as-passthrough may not even be needed — we could wrap workflows directly via `claude -p`.
3. Confirm whether `claude --bg` accepts workflow keywords (undocumented; needs probe).
4. Capture the actual script storage path and file shape so we can rule on G1b reverse-engineering risk.

### Adjusted next-step recommendation (replaces §10)

- **Step 0 (blocker)**: maintainer upgrades local `claude` to v2.1.154+ (preferably v2.1.162). One command. No plan needed.
- **Step 1**: re-run Sub-B (the same qa-tester smoke) against the upgraded binary. Concrete questions in the bullets above. ~30 minutes of agent time, low API spend (cancel before subagents run).
- **Step 2**: separately, test `claude -p "ultracode: <prompt>"` outside the TUI in print mode. Capture stdout shape with and without `--output-format stream-json`. ~10 minutes of agent time, low API spend.
- **Step 3**: based on (1) + (2), decide G1 scoping:
  - if `claude -p` gives clean structured output → wrap directly, no PTY needed, much simpler
  - if `claude -p` works but output is unstructured → still wrap, but parse stdout (similar pattern to our existing dispatcher)
  - if `claude -p` doesn't work or workflows really are interactive-only → fall back to G1a passthrough (PTY-inject `ultracode` into an attached session)
- **Step 4**: bundle G2–G6 as the Plan 0007 docs/probe pass (unchanged from §10).
- **Step 5**: G7–G13 backlog (unchanged).

This is still not a plan. Plan 0004 T11 + T12 + Plan 0005 remain the bottleneck path. Step 0 (the binary upgrade) is the only thing that could happen today.

## 13. Honest caveats

- Some of the subagents' specific version-attribution claims (e.g. "agent field honored from v2.1.157") were not double-cited; treat individual version pins as approximate until a follow-up research turn re-verifies.
- The hooks agent listed `/ultraplan` in passing; this appears to be a separate skill, **not** the workflow trigger (which is `ultracode`). Don't conflate.
- The "Codex parity" sections of the plugin-research agent are based on Claude Code public docs only — Codex's own plugin schema in 0.136.0 needs an independent read before any cross-pollination commitment.
- This report is one snapshot of agent output. Re-running the same prompt against the same docs may surface additional items.
