
---
Research report: Architecting cc-plugin-codex for Codex → Claude Code delegation

1. Executive summary

The project’s core goal is sound: Codex should be able to delegate coding work to Claude Code without paying the repeated overhead and capability loss of one-shot claude -p calls. But the brief’s most important architectural assumption needs revision. The right v1 should not be “parse Claude Code’s full-screen TUI as the protocol.” Claude Code now exposes first-party background-session management: claude --bg, claude agents --json, claude logs, claude attach, claude stop, claude respawn, and claude daemon status. Those commands provide a supported session/process primitive, live status, logs, and persistent session recovery. The v1 should use that supervisor as the backbone, use transcripts/logs/status for state, and reserve PTY attach for the one thing still not cleanly exposed by docs: sending follow-up input into an existing interactive/background Claude session.  ￼

The second major finding is that claude -p is not merely a less elegant transport. It is now explicitly part of Claude Code’s headless/Agent SDK surface, and Anthropic’s docs say that, starting June 15, 2026, Agent SDK and claude -p usage on subscription plans draws from a separate monthly Agent SDK credit rather than normal interactive usage. The docs also mark --output-format, stream-json, partial messages, JSON schema output, --max-turns, and similar affordances as print-mode features. That means claude -p is the wrong primary transport for both the user’s cost objective and the project’s “native Claude Code” objective.  ￼

The cost claim is directionally plausible, but it should be stated more precisely. Prompt-cache savings are not caused by “PTY” itself. They come from keeping the same model, effort, MCP/tool configuration, working directory, git state, and conversation prefix stable long enough for Claude Code’s server-side prefix cache to be reused. Claude Code’s subscription path requests one-hour prompt-cache TTL automatically; parallel sessions in the same directory can sometimes read each other’s cache if prefixes match; but compaction, model/effort changes, MCP changes, denying a tool, upgrades, worktree differences, and cache TTL expiry can all invalidate or reduce savings.  ￼

Codex-side assumptions are more favorable than the brief suggests. Codex has a documented plugin structure, skill mechanism, hooks system, and app-server protocol. Skills are instruction bundles, not executable RPC endpoints; hooks are documented and plugin-bundled hooks are supported, but they require explicit trust before execution. The community project’s “installed plugin hooks don’t fire” note should be treated as stale or unresolved until reproduced against current Codex with hook trust configured.  ￼

The recommended architecture is therefore a hybrid background-session driver: a Codex plugin with skills for $claude-review, $claude-delegate, $claude-status, $claude-result, $claude-stop; a Node/TypeScript broker process and job store under ~/.codex/cc-plugin-codex; a ClaudeBackgroundDriver that starts Claude with --bg, polls claude agents --json, reads claude logs and session JSONL transcripts, and uses optional PTY attach only for prompt injection and human permission handoff. This mirrors the durable broker/job-store spirit of openai/codex-plugin-cc, while avoiding brittle human-UI scraping. OpenAI’s opposite-direction plugin keeps a persistent Codex app-server connection, routes streaming notifications, tracks turn/thread IDs, captures final messages and tool events, and uses a broker to preserve a shared runtime. That is the implementation pattern to imitate conceptually, not line-for-line.  ￼  ￼  ￼  ￼

Top five findings

1. Raw TUI parsing is popular-but-wrong as the primary protocol. Claude Code’s interactive bytes are undocumented and human-rendered. Use background-session status, logs, and JSONL transcripts as the machine-readable layer; use PTY attach only where unavoidable.
2. There is no documented interactive stream-json mode. --output-format, --include-partial-messages, JSON schema output, and related structured outputs are documented for print/headless mode, not interactive TUI mode.  ￼
3. claude -p is the wrong primary transport. It is non-interactive, has a different usage-credit surface on subscriptions, and lacks some interactive-only capabilities such as user-invoked slash-command skills.  ￼
4. The best current non-PTY primitive is claude --bg, not Agent SDK, MCP, or full TUI scraping. Background sessions are first-party Claude Code conversations managed by a per-user supervisor, survive terminal detach, show JSON status, expose logs, and can be attached.  ￼
5. The hardest unresolved product gap is prompt delivery into an existing Claude session. Docs show starting background sessions and attaching to them, but not a stable claude send <session> command. For true multi-turn reuse, v1 likely still needs a minimal PTY attach layer or an experimental Claude Code channel.  ￼

Top three risks

1. Protocol stability risk: high impact, medium likelihood. Claude Code Agent View/background sessions and channels are newer surfaces. Raw TUI parsing has no stability guarantee. Mitigation: version probe, feature flags, transcript-based parsing, and integration tests against recorded sessions.
2. Cost-model risk: high impact, medium likelihood. Anthropic’s docs explicitly warn cost reporting can change, and they already changed claude -p/Agent SDK subscription accounting for June 2026. Mitigation: build a benchmark harness before UX polish, report cache metrics, and avoid promising fixed savings.  ￼
3. Security/privacy risk: high impact, high likelihood. This plugin will send repository context to Anthropic and may run commands through Claude Code. Mitigation: explicit disclosure, no default permission bypass, workspace trust checks, minimal MCP/channel surface, worktree isolation, and audit logs.

Top three recommendations

1. Rename the primary transport internally from ClaudePtyDriver to ClaudeBackgroundDriver. The driver may use PTY attach, but its source of truth should be background session status, logs, and transcripts.
2. Make node-pty optional, not a required dependency of the happy path. node-pty is the right JS PTY library if needed, but it has native build requirements and security/flow-control concerns.  ￼
3. Ship a benchmark/doctor before a review gate. The v1 value proposition depends on actual cache/usage behavior; the team should prove it with repeatable measurements before promising cost savings.

⸻

2. Block-by-block findings

Block A — PTY/TUI transport

A1. Actual output format of interactive Claude Code

Documented answer: Claude Code’s interactive mode is a terminal UI, not a documented event protocol. The CLI reference distinguishes claude and claude "query" as interactive sessions, while claude -p "query" is the SDK/headless path. The structured-output flags are documented for print mode: --output-format specifies output format for print mode, --include-partial-messages requires --print and --output-format stream-json, and JSON schema/max-turns/budget options are also marked print-mode-only.  ￼

That means there is no documented interactive equivalent of Codex’s app-server stream. If the team attaches to claude in a PTY, the bytes should be treated as ANSI terminal rendering: cursor movement, redraws, alternate-screen behavior, status line changes, line wrapping, and user-facing text. It is not a stable message bus.

Undocumented --output-format stream-json in interactive mode: I found no evidence in the docs that --output-format stream-json works with interactive mode. The docs explicitly tie --output-format and partial-message output to print mode.  ￼

Session ID visibility: Claude Code sessions are persisted. The sessions docs say transcripts are stored at ~/.claude/projects/<project>/<session-id>.jsonl, and each JSONL line represents a message, tool use, or metadata object. Sessions can be resumed with --continue and --resume; sessions created with claude -p/Agent SDK do not appear in the picker but can be resumed by session ID.  ￼

For background sessions, the CLI offers cleaner state. claude --bg "task" starts a background agent and returns a short ID plus management commands; claude agents --json prints live sessions as a JSON array including fields such as PID, cwd, kind, startedAt, sessionId, name, and status; claude attach <id> attaches; claude logs <id> displays logs; and claude daemon status reports supervisor state.  ￼

Slash commands: Slash commands are interactive UI features. Some commands are unavailable in print mode; Anthropic’s headless docs specifically say user-invoked skills such as /code-review and built-in commands are only available in interactive mode, and in -p users should describe the task instead. That is a strong reason not to build the primary transport around -p.  ￼

However, “slash command rendering is parseable” is not documented. The team should not design a state machine that identifies /cost, /resume, /agents, or /usage output by TUI text. Prefer claude agents --json, transcript JSONL, and statusline/usage fields where available.

Tool calls: In TUI, tool calls are visually distinguishable to humans. But no doc promises a byte-level marker that reliably distinguishes Read/Edit/Bash/Task from assistant prose. The machine-readable source is the transcript JSONL, whose docs say each line is a JSON object representing a message, tool use, or metadata.  ￼

Streaming vs completed messages: In interactive TUI, no documented final-message delimiter exists. In print stream-json, there are structured events, including partial message support. But that is print mode, not the target transport. For interactive/background v1, the safest completion signal is a combination of claude agents --json status, claude logs, and transcript tailing. Agent View states include working, needs input, idle, completed, failed, and stopped.  ￼

Recommendation: Do not parse the TUI for semantic events. Use:

* claude --bg to start sessions.
* claude agents --json for session state.
* claude logs <id> for human-readable progress/result fallback.
* ~/.claude/projects/.../<session-id>.jsonl for message/tool/result extraction.
* Optional claude attach <id> PTY only for follow-up prompt injection or permission handoff.

This is the key architectural correction.

A2. Prior art for PTY-driving Claude Code

I found adjacent projects that orchestrate Claude Code or bridge Claude Code and Codex, but no mature public project whose core solution is robustly parsing the Claude Code TUI byte stream.

The most relevant prior art is agent-bridge, which creates a local bidirectional bridge between Claude Code and Codex. It does not solve TUI scraping. It uses a foreground MCP client started by a Claude Code plugin plus a persistent daemon, forwards Codex agentMessage output into Claude Code through Claude Code channels, and sends Claude replies into Codex through Codex app-server turn/start.  ￼

ai-cli-mcp, formerly claude-code-mcp, exposes AI CLI tools such as Claude, Codex, Gemini, Forge, and OpenCode through an MCP server. It can run CLI tools as background processes, manage PIDs, parse structured outputs, and use session IDs. But its documented Claude invocation path leans toward permission-bypass modes and generic CLI process orchestration, not a formally parsed Claude Code TUI protocol.  ￼

claude-code-router routes Claude Code API requests to different model providers by setting environment variables such as ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN. It solves provider routing and request/response transformation, not Codex-to-Claude delegation or interactive session preservation under the user’s Claude subscription.  ￼

vladolaru/claude-code-codex-bridge is a configuration bridge: it reads Claude Code plugins, skills, agents, commands, MCP servers, and instructions and generates equivalent Codex artifacts. It is not a runtime transport.  ￼

EveryInc/compound-engineering-plugin is a multi-runtime skills/agents package for Claude Code, Codex, Cursor, and related tools. It is useful as plugin/skills design context, but not a Codex→Claude Code transport implementation.  ￼

Conclusion: The lack of mature TUI parser prior art is itself evidence. Experienced teams are avoiding the TUI byte stream and instead using app-server, MCP channels, background processes, logs, transcripts, or API-routing layers.

A3. PTY library choice

If the project needs a PTY, use node-pty. It provides forkpty(3) bindings on Unix and ConPTY support on Windows, exposes a terminal object with write and onData, and makes child programs believe they are attached to a real terminal. It is the mature option in Node.  ￼

But node-pty should be optional. Its own build docs require native build tooling: C++ build chain, Python/build-essential on Linux, Xcode tools on macOS, and Windows SDK/Visual Studio on Windows. It also warns that processes launched from node-pty share the parent’s permission level, and it documents flow-control behavior through XON/XOFF handling.  ￼

Packaging implication: A Codex plugin distributed through a GitHub marketplace/cache path should not assume every user can compile native modules. A plugin that fails installation because node-gyp cannot build is a bad first impression. The architecture should therefore have:

* A no-native-dependency path using claude --bg, claude agents --json, claude logs, and transcript parsing.
* Optional PTY support loaded lazily only for attach/input injection.
* A doctor command that reports whether PTY attach is available.

Backpressure: If a PTY emits faster than the driver consumes, the plugin needs bounded buffers, flow control, and raw-byte capture. node-pty supports flow-control handling; the driver should still maintain a ring buffer, avoid unbounded string concatenation, and never let a TUI flood exhaust memory.  ￼

A4. Viable non-PTY alternatives

Claude Agent SDK: Not a substitute for this use case. It has streaming, sessions, tool use, structured outputs, and the same agent loop/tooling concepts, but Anthropic’s docs tie Agent SDK and claude -p usage on subscription plans to a separate monthly Agent SDK credit starting June 15, 2026. If the user’s goal is to consume normal interactive Claude Code subscription quota and reuse the interactive session/cache path, Agent SDK is not the primary answer.  ￼

MCP: Claude Code can connect to MCP servers, and plugins can ship MCP servers. Claude Code can also run as an MCP server via claude mcp serve, exposing tools such as View/Edit/LS to MCP clients. But this exposes Claude Code’s tools, not a public “send prompt to Claude Code agent loop” protocol.  ￼

Channels: Claude Code channels are closer to what this project wants: an MCP server can push events into a running Claude session and optionally provide reply and permission relay. However, channels are a research-preview feature, custom channels may require development flags, and the docs describe allowlisting and org/workspace restrictions. Channels are excellent experimental infrastructure, but too unstable as the only v1 transport.  ￼

Remote Control: Claude Code Remote Control lets web/mobile connect to a local Claude Code session, but it is framed as a human remote access feature, not a local programmatic driver. It also requires the local process to keep running and has limitations around local-only commands.  ￼

claude --bg: This is the viable alternative the brief dismissed too quickly. It keeps the local Claude Code auth/session path, produces a background session ID, runs under a per-user supervisor, survives terminal detachment, exposes JSON status, logs, attach, stop, respawn, and daemon state, and persists state/transcripts on disk.  ￼

Caveat: The docs do not show a stable non-TUI command to send a follow-up prompt into an existing background session. For true “many delegated turns within a single Claude session,” v1 still needs either minimal PTY attach or experimental channels. This is the remaining load-bearing empirical test.

A5. Versioning and stability

The interactive TUI byte stream has no documented stability promise. Claude Code’s docs explicitly mark Agent View/background sessions and channels as research-preview surfaces in several places, with version minimums and caveats. Agent View requires recent versions, and some features such as custom channels have explicit “may change” warnings.  ￼

The project should version-gate aggressively. At startup, run:

* claude --version
* claude auth status
* claude agents --json
* claude daemon status
* a transcript-location probe
* optional claude attach <id> PTY smoke test

Do not assume the rendering of a status line, slash command, or tool-call card is stable.

⸻

Block B — Cost model verification

B1. Claude Code prompt caching

Claude Code prompt caching is prefix-based and server-side. The docs explain that repeated full-history requests are cheaper and faster when the beginning of the request matches prior prefixes. The request ordering matters: system prompt, project context, and conversation history form the cached prefix. Model and effort are part of the cache key. Changing MCP servers, model, effort, or denying an entire tool can invalidate cache.  ￼

The cache TTL differs by plan and surface. Claude Code’s docs say subscription users automatically get one-hour TTL prompt caching included in their plan; API-key paths generally use five-minute TTL unless configured otherwise. Cache hits reset the timer.  ￼

Cache scope is subtle. The docs say the cache is effectively scoped to one machine and directory, and parallel sessions in the same directory can read each other’s cache if prefixes match. Worktrees may differ. Sequential sessions require the git status snapshot to match. Subagents have their own conversation/cache and five-minute TTL even on subscription, though a fork can inherit parent prompt/history and read parent cache.  ￼

Conclusion: PTY or background-session reuse is likely valuable, but the claim should be: “keeping a stable interactive Claude Code session and stable prompt prefix should maximize subscription-path cache reuse.” Do not claim that PTY itself saves money.

B2. Pro/Max subscription accounting

Claude Code’s cost docs distinguish API token usage from subscription usage. /usage can show API token counts and local approximate costs, but for Pro/Max subscribers, plan usage bars and activity stats are what matter; dollar amounts are not direct billing.  ￼

Most importantly, Anthropic’s headless docs say that starting June 15, 2026, Agent SDK and claude -p usage on subscription plans draws from a new monthly Agent SDK credit, separate from interactive usage limits. That directly supports the user’s concern that claude -p is the wrong primary path for a subscription-oriented Codex→Claude plugin.  ￼

B3. Empirical benchmark proposal

The benchmark should compare at least four arms:

1. Existing community baseline: claude -p --output-format json once per delegated task, optionally with --resume.
2. Fresh background session per task: claude --bg "task" for each delegated task.
3. Single reused background session: one claude --bg companion session, subsequent prompts delivered via attach PTY or channel.
4. Interactive PTY session: one claude session under PTY, prompts injected, TUI not used for semantic parsing.

Representative workload:

* Same repo, same cwd, same git status, same model, same effort, same MCP config.
* Five delegated tasks per Codex session.
* Each task has about 10k tokens of repository/task context.
* Tasks include one review, one edit plan, one implementation, one verification/debug, one final review.
* Run each arm three times after a cold start and three times within one hour after warming cache.

Measurements:

* current_usage.cache_creation_input_tokens and current_usage.cache_read_input_tokens, because Anthropic docs identify these as the cache effectiveness fields.  ￼
* /usage or statusline usage before/after, noting that subscription usage bars are approximate and local.
* claude logs, transcripts, final status, wall-clock time.
* Number of model requests, compactions, tool invocations, permission prompts.
* Whether session remained interactive/background or moved to Agent SDK credit.

Controls:

* No model or effort changes mid-run.
* No MCP server connect/disconnect mid-run.
* Same permission mode.
* Same git status.
* Same Claude Code version.
* No compaction unless being tested.

Counter-scenarios where PTY/background may not save:

* Single-shot delegation.
* Long gaps past TTL.
* Delegations with different cwd/worktrees.
* Tasks that force compaction.
* Changes to MCP configuration between tasks.
* Subagent-heavy workflows that create separate five-minute caches.
* Any scenario where PTY input overhead, permission prompts, or stuck UI causes retries.

⸻

Block C — Codex plugin model

C1. Contract between Codex and a skill

Codex skills are not an RPC ABI. The docs define skills as task-specific instructions that Codex can load explicitly via /skills or $, or implicitly based on description. A skill is a directory containing SKILL.md, and plugins are installable distribution units that can bundle skills, MCP servers, hooks, apps, and assets.  ￼

Therefore, $claude-review should be treated as an instruction surface that tells Codex how to invoke a plugin script or command, not as an executable function automatically receiving args/stdin. The actual worker should be a script/broker shipped with the plugin and invoked by Codex through shell commands specified in the skill instructions.

For progress, the skill itself has no separate progress channel. The worker should write concise progress to stdout/stderr, persist structured events in the job store, and let $claude-status / $claude-result read that store.

C2. Codex app-server protocol

Codex app-server is documented. It uses JSON-RPC-like messages over stdio, with JSONL framing and omitted jsonrpc header. The docs describe requests, responses, notifications, initialization, threads, turns, items, and streaming progress via notifications.  ￼

openai/codex-plugin-cc confirms the pattern. Its client spawns codex app-server, reads JSON lines, distinguishes responses, server requests, and notifications, initializes with client info/capabilities, and supports a broker connection over a socket.  ￼  ￼  ￼

The opposite-direction plugin also shows how to capture structured turn progress. It maps Codex item/started, item/completed, turn/started, turn/completed, thread/started, and error notifications into progress and final state.  ￼

For this project, Codex app-server is useful for understanding structured agent-driver design, but it does not magically expose the current Codex host session to a plugin skill. If the plugin wants a persistent local worker, it should run its own broker/job daemon rather than assume an inbound host connection.

C3. Hooks reliability

Codex hooks are documented and enabled by default unless disabled. Hook discovery includes user config, repo config, and installed plugins; plugin-bundled hooks use hooks/hooks.json by default or manifest overrides. But plugin hooks are not automatically trusted merely by installing/enabling a plugin; the user must review/trust them. Hook scripts receive PLUGIN_ROOT and PLUGIN_DATA.  ￼

The community pejmanjohn/cc-plugin-codex README says its stop-time review gate was missing because installed-plugin hooks did not execute after official install. Current Codex docs contradict the broad claim that plugin hooks are unsupported; the likely explanations are stale Codex version, missing trust, wrong hook path, unsupported matcher, or a real bug needing reproduction. The docs also say Stop matchers are not supported, meaning stop hooks fire for all stop events if trusted.  ￼

Recommendation: Do not make stop-time review hooks a v1 critical path. Ship manual $claude-review first. Add a hook installer/checker that explains trust status, then add stop-time review as opt-in.

C4. Installation and distribution

Codex plugins can be installed via plugin marketplaces. The docs show codex plugin marketplace add supporting GitHub shorthand, URLs, SSH/local paths, refs, and sparse paths. Plugins are cached under ~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/, and enable/disable state is stored in ~/.codex/config.toml.  ￼

A native dependency such as node-pty makes install UX harder. A good v1 install story should be:

* Pure Node/TypeScript for baseline status/log/transcript/background-session management.
* Optional node-pty dependency installed only for attach mode.
* doctor command explaining missing PTY support rather than failing plugin install.
* Marketplace install plus local path support for early adopters.

⸻

Block D — Claude Code, the driven side

D1. Startup configuration

Useful startup flags include:

* --bg to start a background agent and return management commands.
* --name to name the session; names can also appear on prompt bars and resume flows.
* --model, --effort, --permission-mode, --add-dir, --mcp-config, --settings, --plugin-dir, and --plugin-url.
* --agent for background sessions where custom agents are desired.
* --fallback-model in background/print modes.
* --channels for channel integrations, though preview-gated.
* --worktree / background session worktree behavior for isolation.  ￼

The best v1 startup strategy is:

claude --bg --name "codex:<repo>:<job>" --model <model?> --permission-mode <safe-mode?> --mcp-config <file?> "<initial prompt>"

Then monitor with claude agents --json, claude logs <id>, and transcripts.

Can we register an MCP server at startup to create structured bidirectional comms? Yes, Claude Code can load MCP servers through --mcp-config, and plugins can ship MCP servers. Channels can push events into a running Claude session, but they are research preview and may require allowlists/dev flags. For stable v1, use MCP for tools only; keep channels as experimental.  ￼

D2. Capability checklist

Capability	v1 decision	Reason
claude --bg background sessions	In	Best first-party session primitive; returns manageable session ID and runs under supervisor.  ￼
claude agents --json	In	Machine-readable live session state.  ￼
claude logs <id>	In	Useful result/progress fallback.  ￼
Transcript JSONL parsing	In	Best machine-readable record of messages/tool use/metadata.  ￼
claude attach <id>	In, optional	Needed for follow-up prompt injection and human permission handoff; avoid semantic TUI scraping.
claude -p	Fallback only	Separate headless/Agent SDK credit and print-mode limitations.  ￼
Claude Code channels	Experimental	Promising structured injection path, but preview/allowlist/dev-flag risk.  ￼
Remote Control	Out	Human remote access feature, not a stable local automation protocol.  ￼
claude mcp serve	Out as transport	Exposes tools, not the Claude agent loop.  ￼
Custom agents/subagents	Optional	Useful for review/delegate personas, but can multiply sessions/cache behavior.
Hooks	Opt-in	Valuable for review gate, but requires trust and can be noisy.  ￼

⸻

Block E — Adjacent prior art

E1. How other tools drive Claude programmatically

Most agent tools that “use Claude” do so through API/model-provider integrations, not through the local Claude Code interactive subscription surface. That distinction matters. API integrations can stream and structure events cleanly, but they do not satisfy this project’s goal of using Claude Code’s local auth/session/prompt-cache behavior.

The projects most relevant to this effort are:

* openai/codex-plugin-cc: The gold-standard inverse. It uses Codex app-server, a broker, structured notifications, thread/turn capture, progress mapping, and job-like persistence. The important lesson is “use a structured protocol or broker, not TUI scraping.”  ￼  ￼  ￼
* pejmanjohn/cc-plugin-codex: A direct Codex→Claude attempt. It exposes commands such as $claude-review, $claude-delegate, $claude-status, $claude-result, and $claude-cancel, but the README acknowledges missing stop-time hook behavior. Its architecture is useful for UX names, not for transport.  ￼
* agent-bridge: Most interesting for the future. It uses Claude Code channels and Codex app-server, which is closer to the correct abstraction than PTY scraping.  ￼
* ai-cli-mcp: Useful for MCP-based CLI orchestration and background process management, but its documented bypass flags are too permissive for default v1.  ￼
* claude-code-router: Useful provider-routing prior art, not a subscription-preserving Claude Code session driver.  ￼

E2. Upstream SDK architecture

Claude Agent SDK is good inspiration for the driver event model: sessions, streaming, tool use, structured outputs, approval callbacks, and native message objects. But it is the wrong billing/auth surface for this project’s primary goal because of Agent SDK credit accounting.  ￼

Codex app-server is better inspiration for the plugin’s driver contract. It represents work as threads, turns, and items, emits progress notifications, and cleanly distinguishes started/completed/error states. openai/codex-plugin-cc’s capture logic is especially relevant: it buffers notifications until a turn ID is known, filters by thread/turn, records agent messages, tool calls, file changes, command executions, and final state.  ￼  ￼  ￼

E3. claude-code-router and middleware

claude-code-router solves a different problem: it interposes on Claude Code’s network/API routing by setting environment variables and mapping providers. It can route Claude Code requests to OpenRouter, DeepSeek, Ollama, and others, but that moves the problem away from Claude subscription reuse and into provider/API billing. It does not provide a stable Claude Code interactive-agent protocol to Codex.  ￼

⸻

Block F — Driver interface design

F1. Minimum methods

The strawman is close but needs separate concepts for session, turn, job, and observation. A better v1 shape is:

Driver.probe(): Promise<DriverCapabilities>
Driver.startSession(opts): Promise<SessionHandle>
Driver.invoke(session, input, opts): Promise<TurnHandle>
Driver.watch(target, opts): AsyncIterable<DriverEvent>
Driver.send(session, input, opts): Promise<TurnHandle>
Driver.interrupt(turnOrSession): Promise<void>
Driver.stop(session): Promise<void>
Driver.resume(sessionRef, opts): Promise<SessionHandle>
Driver.attach(session, opts): Promise<AttachHandle>
Driver.logs(session, opts): AsyncIterable<LogEvent>
Driver.dispose(): Promise<void>

The key change is that invoke() should not necessarily be the entire stream. With Claude background sessions, the driver may start a turn, return a handle, and let a watcher reconcile status/log/transcript asynchronously.

DriverEvent should be turn-level rather than token-first. Token deltas are optional. Recommended events:

* session.started
* session.status
* turn.started
* message.delta optional
* message.completed
* tool.started
* tool.completed
* permission.required
* file.changed
* command.started
* command.completed
* usage.updated
* turn.completed
* error
* session.stopped

The app should not depend on per-token events, because Claude interactive mode does not expose a stable token stream. Codex app-server’s item lifecycle is the better model.  ￼

F2. Capabilities

Use a typed capability map, not method-existence checks. Example capability dimensions:

structuredStream: false | "print-json" | "app-server" | "transcript"
backgroundSessions: boolean
attach: boolean
promptInjection: "start-only" | "pty-attach" | "channel" | "api"
toolEvents: "none" | "transcript" | "stream"
usageMetrics: "none" | "statusline" | "transcript" | "json-output"
interrupt: boolean
resume: boolean
permissions: "human-attach" | "relay" | "bypass" | "none"

For Claude Code v1, the honest capability profile is likely:

backgroundSessions: true
structuredStream: "transcript"
attach: true
promptInjection: "pty-attach" or "start-only"
toolEvents: "transcript"
usageMetrics: "statusline/transcript where available"
interrupt: true via stop/attach
resume: true
permissions: "human-attach"

F3. Standardized protocol

MCP is not a whole-agent delegation protocol. It is a tool/resource/prompt protocol. Claude Code channels extend MCP in a direction that could become useful for agent-to-agent messaging, but the docs call channels a research preview.  ￼

The team should not adopt an immature agent interoperability standard as the internal driver contract. Instead, model the internal events after Codex app-server’s thread/turn/item lifecycle because the host is Codex and the inverse plugin already validated that shape.  ￼

⸻

Block G — Job store, persistence, multi-session

G1. Job record schema

Store records under:

~/.codex/cc-plugin-codex/jobs/<jobId>.json
~/.codex/cc-plugin-codex/jobs/<jobId>.events.jsonl
~/.codex/cc-plugin-codex/jobs/<jobId>.result.md

Recommended schema fields:

jobId
schemaVersion
createdAt
updatedAt
status: queued | starting | running | needs_input | completed | failed | stopped | orphaned
workspaceRoot
git: { branch, head, dirtyHash }
codex: { sessionId?, cwd, pluginVersion }
driver: { name, version, transport, capabilities }
claude: {
  version,
  shortId?,
  sessionId?,
  sessionName,
  pid?,
  cwd,
  worktree?,
  transcriptPath?,
  logsCommand,
  agentsJsonSnapshot?
}
prompt: { path, sha256, summary }
result: { path?, finalMessage?, touchedFiles?, commands?, usage? }
usageSnapshots: [...]
errors: [...]
locks: { ownerPid, acquiredAt }

$claude-status should show job ID, Claude session ID/short ID, status, elapsed time, current phase, last log line, and whether user input is required. $claude-result should show final answer, files touched, commands run, transcript/log paths, and error details.

G2. Concurrency

Multiple Codex sessions can run simultaneously. Use:

* Globally unique job IDs.
* Workspace-root hash and Codex session ID in job metadata.
* Per-job lock files with atomic create.
* A per-workspace “companion session” option only if prompt injection into an existing Claude session is proven reliable.
* Separate background sessions for concurrent jobs unless the user explicitly opts into serial reuse.

Important caveat: Claude docs warn that resuming the same session in two terminals without forking can interleave messages into one transcript. Do not attach the same Claude session from multiple Codex jobs concurrently.  ￼

G3. Crash recovery

Raw PTY alone has poor crash recovery. If the wrapper dies, the child process and PTY may be orphaned and unrecoverable unless a relay/daemon owns them.

Claude background sessions solve much of this. The docs say background sessions are hosted by a per-user supervisor, continue without a terminal attached, and preserve transcript/state on disk; if the supervisor stops after about an hour, state remains and reattach/reply restarts from where it left off.  ￼

Still, the plugin should run a lightweight local broker or at least reconcile state on every command. openai/codex-plugin-cc’s broker pattern is instructive: one process owns a long-lived app-server client, routes notifications, rejects concurrent stream conflicts with a busy error, and allows interrupts during active streams.  ￼  ￼

⸻

Block H — Testing strategy

H1. Deterministic tests

The project needs three layers of tests:

1. Mock Claude binary. A fake claude executable should implement --version, auth status, --bg, agents --json, logs, attach, stop, and transcript writes. It should simulate success, failure, rate limit, permission prompt, crashed session, malformed JSON, and version mismatch.
2. Golden transcript tests. Record real ~/.claude/projects/.../<session-id>.jsonl snippets and claude agents --json outputs. Parse those deterministically. Treat transcripts/status as the semantic source of truth.
3. PTY attach smoke tests. If using node-pty, record raw byte sessions only for attach/input behavior, not final-answer parsing. Golden tests should assert that the driver can launch, detect idle/needs-input, paste a prompt, and detach/stop safely.

Do not make live Anthropic calls part of ordinary CI. Provide an opt-in integration suite for maintainers with a Claude subscription.

H2. CI matrix

Reasonable side-project matrix:

* OS: macOS latest, Ubuntu latest. Windows optional until PTY/ConPTY behavior is supported.
* Node: 20 LTS, 22 LTS, latest stable if feasible.
* Claude Code: minimum supported version plus latest.
* Codex CLI: latest stable; one previous minor if plugin APIs are volatile.
* node-pty: optional test job only.

Given Agent View/background docs mention v2.1.139+ and other features in v2.1.144+, I would set the first practical minimum at a version where claude agents --json, claude --bg, and background resume behavior are all present, then feature-probe rather than rely only on semver.  ￼

⸻

Block I — Failure modes and operational concerns

Failure mode	Handling
claude not on PATH	doctor fails early; show install/auth instructions; $claude-* commands refuse to run.
Wrong Claude Code version	Probe required commands/flags; explain minimum supported features; fall back to -p only with explicit warning.
PTY allocation fails	Continue with start-only background sessions; disable multi-turn attach; mark attach unavailable.
Claude requires auth	Run claude auth status; surface required action; do not try to automate login.  ￼
Usage/rate limit	Mark job failed or needs_input; include logs; never retry in a loop that burns quota.
Permission prompt	Mark needs_input; offer attach command; do not default to bypass permissions.
Anthropic outage	Preserve job state; allow retry/respawn; include logs and transcript path.
Codex process killed	Background session keeps running; status command reconciles later using claude agents --json and job store.
User Ctrl-C	Stop local watcher; default should leave Claude job running unless command explicitly says stop; print recovery command.
Orphan background session	$claude-status --reconcile discovers unmanaged Codex-named Claude sessions and offers stop/adopt.
Transcript path missing	Fall back to claude logs; mark structured parsing degraded.
agents --json malformed	Treat as version incompatibility or transient daemon failure; include raw output in diagnostic log.

Privacy/security disclosures should be explicit. A delegated Claude turn may send repository files, diffs, prompts, command outputs, and environment-derived context to Anthropic through the user’s Claude Code account. The plugin should require an initial opt-in, record which directories are delegated, avoid permission-bypass modes by default, and warn before attaching MCP servers or channels. Claude Code already has workspace trust and permission mechanisms; the plugin should preserve them, not bypass them. Security research on MCP clients and tool poisoning reinforces that untrusted tools/channels are a real attack surface, but the more immediate project risk is simple over-delegation of private repository context.  ￼

⸻

3. Recommended architecture

PTY transport layer

Use PTY as an input/attach adapter, not as the semantic transport. The layer should be optional and lazy-loaded. Its responsibilities are: attach to claude attach <id>, deliver a prompt or user-approved response, handle Ctrl-C/detach/stop, and expose a bounded raw log for debugging. It should not parse final answers, tool calls, or slash-command output from the screen. The semantic state should come from claude agents --json, claude logs, and transcript JSONL. This keeps the project aligned with Claude’s documented surfaces while still satisfying the requirement to natively call Claude Code instead of claude -p.

Driver interface shape

Adopt a session/turn/event model inspired by Codex app-server. Driver.invoke() should return a handle, and Driver.watch() should produce an AsyncIterable<DriverEvent>. Do not require token deltas. A Claude Code background session may not produce stable deltas, but it can produce status changes, completed messages, transcript tool events, and logs. The interface should represent capabilities explicitly so future Gemini/Grok/Qwen drivers can declare different surfaces without refactoring.

Codex skill ⇄ driver wire format

Skills should be thin instructions that ask Codex to run plugin scripts. The plugin script should accept a structured JSON request file or CLI flags, create a job record, start or reuse a Claude session, then print a compact summary and job ID. Long results should be written to the job store. $claude-status and $claude-result should read the job store, reconcile with Claude background sessions, and output deterministic summaries. Do not depend on Codex skill invocation passing structured stdin; skills are instruction bundles, not RPC handlers.  ￼

Job store schema

Use a durable JSON record plus event JSONL per job, under ~/.codex/cc-plugin-codex. Include Codex workspace/session, Claude session/short ID, driver version, Claude version, prompt hash, transcript path, logs, status, usage snapshots, and error details. Use atomic writes and lock files. Reconciliation should be idempotent: a status command should be able to reconstruct current job state from claude agents --json, claude logs, and transcript paths.

Hook strategy

Do not rely on hooks for v1 core. Ship manual commands first. Add optional stop-time review gate later, with a setup command that verifies hook discovery, hook trust, and features.hooks status. Current Codex docs support plugin-bundled hooks, but they are skipped until trusted; the community report of non-firing hooks should be reproduced before designing around it.  ￼

Distribution/install story

Use Codex plugin marketplace conventions and keep the baseline install pure Node/TypeScript. Put native PTY support behind optional dependency detection. The install flow should be:

codex plugin marketplace add wu-hongjun/cc-plugin-codex
codex plugin add claude-companion@<marketplace>
$claude-setup

$claude-setup should check Codex, Claude Code, auth, background-session support, transcript access, optional PTY attach, and hook trust. Plugin cache/install behavior should follow Codex’s documented plugin marketplace structure.  ￼

Test strategy

Build the mock Claude binary first. Then test job-store reconciliation, transcript parsing, status parsing, background-session lifecycle, and optional PTY attach. Use live Claude tests only as opt-in integration tests. Version-pin recorded outputs and treat every new Claude Code release as a compatibility event.

⸻

4. Risk register

Risk	Likelihood	Impact	Mitigation
Raw TUI byte format changes	High	High	Do not parse TUI semantically; use transcripts/status/logs.
No stable prompt-send command for existing background session	High	High	Minimal PTY attach for input; evaluate channels experimentally; document limitation.
Background sessions change because Agent View is research preview	Medium	High	Version probes, feature flags, fallback, integration tests.
claude -p fallback burns separate Agent SDK credit	High	Medium	Loud warning; off by default; show docs-supported credit distinction.
Prompt-cache savings smaller than expected	Medium	High	Benchmark harness; report cache read/create tokens; avoid fixed savings claims.
Node native dependency install failure	Medium	Medium	Make node-pty optional; pure Node baseline.
Permission prompts stall unattended jobs	High	Medium	Mark needs_input; attach/human handoff; no default bypass.
Multiple Codex sessions interleave one Claude transcript	Medium	High	Per-job locks; prohibit concurrent writes to same Claude session.
Orphaned Claude sessions consume quota	Medium	Medium	Reconcile/adopt/stop commands; job TTL; named sessions.
Hook review gate not trusted	High	Low for core, medium for gate	Manual commands first; setup verifies trust.
Private repo data sent to Anthropic	High	High	Explicit opt-in, workspace disclosure, logs, permission modes.
MCP/channel prompt injection	Medium	High	Disable untrusted MCP/channel by default; only load plugin-owned servers.
Claude outage/version regression	Medium	Medium	Preserve job state; retry/respawn; diagnostics.
Codex plugin API changes	Medium	Medium	Keep skills simple; rely on documented plugin structure; test latest Codex.

⸻

5. What the team is wrong about

1. “Because Claude Code has no Codex-like app-server, the equivalent has to be PTY-driven TUI capture.”
    This is the biggest correction. Claude Code does not expose a documented Codex-style app-server for agent turns, but it now exposes background-session management, JSON session listing, logs, attach, stop, respawn, and transcript JSONL. The equivalent should be background-session-driven with optional PTY attach, not TUI-byte-driven.  ￼
2. “We must properly parse and utilize the TUI.”
    You may need to utilize the TUI for input injection or human handoff, but “properly parse” is the wrong goal. Parse transcripts/status/logs. Treat the TUI as a lossy rendering layer.
3. “--resume <session-id> does not actually recover prompt-caching savings.”
    Too broad. Docs say sessions can resume and caches can be reused when prefixes match, but many factors invalidate cache: model, effort, MCP changes, compaction, upgrades, cwd/worktree, git state, and TTL. The correct statement is: -p --resume may still be inferior because it is headless/Agent SDK credit and may reprocess context depending on prefix/cache conditions; this requires measurement.  ￼
4. “Installed Codex plugin hooks are unreliable.”
    Current Codex docs say plugin hooks are supported but require trust. The community README’s observation is not enough to conclude architectural unreliability. Reproduce it with current Codex and trusted hooks.  ￼
5. “Node+TypeScript plus PTY is the obvious implementation.”
    Node+TypeScript is fine. A mandatory PTY dependency is not. Native module build failures are predictable in plugin distribution. Use PTY only when needed.

The locked decisions mostly survive with modifications:

* v1 Codex→Claude only: correct.
* claude -p not primary: strongly correct.
* Codex plugin/skill shape: correct, but remember skills are instructions, not functions.
* Driver abstraction: correct.
* Node+TypeScript: correct, but Bun should not be required for v1; optional tooling only.
* PTY-native: revise to “Claude Code native, background-session-first, PTY attach when necessary.”

⸻

6. Recommended v1 implementation sequence

1. Write a compatibility matrix and doctor probe.
    Verify codex, claude, claude auth status, claude --bg, claude agents --json, claude logs, claude attach, transcript directory, and optional PTY support.
2. Set the minimum Claude Code feature baseline.
    Choose a version where background sessions, JSON agent listing, logs, attach, and daemon status are all present; feature-probe anyway.
3. Build the job store and reconciliation engine.
    Before transport, make $claude-status able to reconcile records with claude agents --json, logs, and transcripts.
4. Implement ClaudeBackgroundDriver.startSession().
    Start claude --bg --name ... "<initial prompt>", capture the short ID, and persist metadata.
5. Implement transcript/log/result parsing.
    Tail ~/.claude/projects/.../<session-id>.jsonl where available and fall back to claude logs <id>.
6. Implement $claude-delegate as start-only.
    First version can start one background job per delegation. This proves native Claude Code session management without solving multi-turn reuse yet.
7. Add optional PTY attach for follow-up prompt injection.
    Use node-pty lazily to run claude attach <id> and deliver input only when the session is idle/needs input. Do not parse semantic events from the screen.
8. Decide companion-session reuse policy.
    If attach injection is reliable, allow one named Claude companion per Codex session/workspace. Otherwise keep per-job sessions and report cache behavior honestly.
9. Implement $claude-review, $claude-status, $claude-result, $claude-stop, $claude-rescue.
    Mirror the useful UX of pejmanjohn/cc-plugin-codex, but back it with the new driver/job store.
10. Build the benchmark harness.
    Compare -p, -p --resume, per-job background, reused background+PTY, and optional channel mode. Capture cache read/create tokens and usage deltas.
11. Add hook support as opt-in.
    Implement review gate only after manual commands work; setup must verify hook trust and show exact Codex hook status.
12. Add mock-Claude and golden-transcript tests.
    Make CI deterministic before adding live integration tests.
13. Package for Codex marketplace with optional native PTY.
    Keep install pure where possible; doctor should explain how to enable attach support.
14. Run a live compatibility sweep.
    Test macOS and Linux, at least two Node versions, current Codex, and current Claude Code.
15. Document privacy, cost, and fallback behavior.
    Users must understand what goes to Anthropic, when -p fallback is used, and how to stop orphaned sessions.

⸻

7. Open questions for the team

1. Is same-session multi-turn reuse mandatory for v1, or is one background Claude session per delegated job acceptable?
    This determines whether optional PTY attach is required in v1.
2. What permission posture is acceptable?
    Safe default should be human approval/attach, not --dangerously-skip-permissions. But unattended delegation may be a product goal.
3. Should the plugin ever modify files through Claude Code, or is v1 review/delegation-only?
    If edits are allowed, worktree isolation and conflict handling become first-class.
4. What savings claim is the team willing to make before benchmark data?
    The report supports “likely saves in repeated stable-prefix workflows,” not a fixed N%.
5. Will the team support channels as an experimental feature?
    Channels could become the clean structured input path, but they are preview-gated and should not be the only v1 transport.
6. Should there be one Claude companion per Codex session, per workspace, or per job?
    Per-session maximizes reuse; per-job is safer and simpler; per-workspace risks concurrency collisions.
7. What is the minimum acceptable install experience?
    If users must compile native modules, adoption will suffer. That argues for optional PTY.
8. What private-data disclosure language is required?
    The plugin should not silently delegate repo content across model/vendor boundaries.

⸻

Bottom line

Build the plugin, but do not build it as a TUI parser. The strongest architecture today is:

Codex skill
  → plugin script / local broker
  → job store
  → ClaudeBackgroundDriver
      → claude --bg / agents --json / logs / transcripts
      → optional PTY attach only for input and human permission handoff

That architecture honors the user’s real requirement — native Claude Code, not claude -p — while avoiding the most brittle interpretation of “properly parse the TUI.”