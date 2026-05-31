Here's the research brief. It's written to be self-contained — a researcher
   reading it cold should have everything needed to do the work.
     
  ---
  Research Brief: Architecting cc-plugin-codex (Codex → Claude Code, 
  PTY-Native)
  
  Who you are reading this as
  
  You are a senior systems architect performing a deep-research pass on
  behalf of a small team that is about to build an OpenAI Codex CLI plugin
  called cc-plugin-codex (working name; the GitHub repo is
  wu-hongjun/cc-plugin-codex). The team has done the surface-level work —
  references collected, design pillars sketched, scope locked — but has
  explicitly stopped before writing any implementation code so that you can 
  stress-test the architecture and surface risks they haven't seen.

  Your job is to do the research the team should have done before sketching
  the design, and to return with concrete recommendations on:
  - which technical approaches are correct vs. popular-but-wrong;
  - which risks they've correctly identified, minimized, or missed entirely;
  - what an experienced team building this from scratch today would do
  differently.

  You are not implementing. You are producing a research report.
  
  ---
  What the project actually is
  
  One-line description: A plugin for the OpenAI Codex CLI that lets a Codex
  session invoke Claude Code as a delegated coding sub-agent — by attaching
  to Claude Code's interactive TUI over a PTY rather than shelling out to
  claude -p — so prompt-cache reuse and subscription cost benefits are
  preserved across many delegated turns within a single Codex session.
  
  The two players:
  
  1. OpenAI Codex CLI (codex) — OpenAI's terminal coding agent, comparable to
   Claude Code. Has its own plugin/skill system (skills/<name>/SKILL.md +
  .codex-plugin/plugin.json). Repo: https://github.com/openai/codex. Plugin
  examples: https://github.com/openai/plugins (~148 first-party examples).
  Skill examples: https://github.com/openai/skills.
  2. Claude Code (claude) — Anthropic's terminal coding agent. Has its own
  plugin system (commands/, agents/, hooks.json, .claude-plugin/plugin.json).
   Docs: https://code.claude.com/docs.
 
  The two existing pieces of prior art:

  1. openai/codex-plugin-cc (v1.0.4) — OpenAI's official Claude-Code-side
  plugin that goes CC → Codex. Uses Codex's app-server JSON-RPC protocol to
  keep a persistent connection, stream notifications, reuse sessions/threads,
   and (by implication) preserve prompt caching. This is the gold-standard
  implementation of the opposite direction we are building.
  2. pejmanjohn/cc-plugin-codex (community, v0.1.2 + 12 unreleased commits,
  HEAD = cb4a07c) — A Codex-side plugin that goes Codex → CC. Shells out to
  claude -p --output-format json once per call. This means every invocation
  re-tokenizes the entire prompt from scratch; there's no streaming; and
  --resume <session-id> does not actually recover prompt-caching savings
  because -p re-walks context each time. The author's own README admits the
  stop-time review gate doesn't fire because installed Codex plugin hooks are
   unreliable.

  The user's stated motivation, verbatim: "We must natively call claude code,
   instead of using the claude -p method, because claude -p method adds cost.
   We must properly parse and utilize the TUI of claude code."
  
  In short: do for Codex→CC what openai/codex-plugin-cc does for CC→Codex.
  Because Claude Code has no public app-server / JSON-RPC equivalent (we
  believe — please verify), the equivalent on the Claude side has to be
  PTY-driven TUI capture.
 
  ---
  What has been decided (do not reopen unless you find disqualifying 
  evidence)
  
  1. v1 scope is Codex → Claude Code only. No multi-driver implementation in
  v1.
  2. claude -p is NOT the primary transport. It is allowed only as a fallback
   for environments where PTY is unavailable, with a loud cost warning.
  3. The plugin shape conforms to the conventions in openai/plugins and 
  openai/skills. Manifest at .codex-plugin/plugin.json, skills under
  skills/<name>/SKILL.md, optional agents/, commands/, hooks.json, .app.json,
   .mcp.json, assets/ per the catalog.
  4. A driver abstraction exists internally (one ClaudeCodeDriver class
  implementing a Driver interface) so a future Gemini/Grok/Qwen driver is a
  localized addition, not a refactor. The interface is design-allows,
  v1-doesn't-ship multi-driver.
  5. Implementation language candidate: Node.js + TypeScript (matching both
  reference repos, which are Node ESM). Bun is an open question.
  
  These are decisions made during scoping; if your research reveals one of 
  them is wrong, say so loudly with evidence. A research report that confirms
   everything the team already believes is a failed research report.
  
  ---
  What you must research
  
  Block A — The PTY/TUI transport (the load-bearing question)
 
  This is the single most important block. If we are wrong here, the project
  does not work.
  
  A1. What is the actual output format of an interactive Claude Code TUI 
  session?
  
  - When claude is run with no flags inside a real terminal, what bytes come
  - Is there an undocumented --output-format stream-json (or similar) that
  works in interactive mode and not just -p?
  - Is the session ID surfaced anywhere in TUI output (status line, startup
  banner)? If not, can it be retrieved out-of-band (e.g. from
  ~/.claude/sessions/ or a similar on-disk store)?
  - When the user types a slash command (e.g. /cost, /resume, /agents), what
  does the TUI render and is it parseable?
  - When Claude Code makes a tool call (Read, Edit, Bash, Task), is the
  tool-call event distinguishable in the byte stream from regular assistant
  text? How?
  - How are streaming tokens vs. completed messages distinguishable? Is there
   a final-message delimiter?
 
  A2. What prior art exists for PTY-driving Claude Code?
  Search GitHub, blogs, HN, X, Reddit for any project that already PTY-drives
   claude. Likely candidates: IDE wrappers (Cursor, Windsurf, Zed
  integrations), terminal multiplexers, CI/CD wrappers, agentic orchestration
   layers (oh-my-claudecode, claude-code-router, etc.). For each non-trivial
  example: how do they handle stream parsing? Have they encountered
  version-skew breakage? What's their abstraction layer? Cite repos and file
  paths.
  
  A3. What PTY library should be used?
  - node-pty (mature, native bindings) vs. alternatives in Node/Bun/Deno
  (pty.js, native child_process.spawn with FIFOs, script(1) wrappers,
  expect-style libraries).
  - Build and packaging implications of native modules in an npm/skill
  package distributed as a Codex plugin.
  - Backpressure: what happens if Claude Code emits faster than we consume?
  Buffer overflow modes.
 
  A4. Is there a viable non-PTY alternative we've dismissed too quickly?
  
  - Claude Agent SDK (Python and TypeScript): supports streaming, sessions,
  tool-use. Critical billing question: does the Agent SDK use the user's
  per-token? If it's per-token API, it is not a substitute for our use case —
   the user's cost goal is to consume their existing subscription, not pay
  API tokens. Verify with documentation and (if possible) by reading SDK
  source.
  - MCP: Does Claude Code expose an MCP server interface that an external
  tool could drive over stdio? If yes, MCP might be a cleaner transport than
  PTY parsing.
  - claude --print with --output-format stream-json + --resume <session-id>:
  the doc snapshot suggested --resume still re-tokenizes; verify by reading
  code or by running a /cost-comparison test.
  
  A5. Versioning and stability.
  - How often does Claude Code's TUI byte-format change across releases? Pull
   the last 6 months of Claude Code release notes and look for breaking
  output changes.
  - Is there a sanctioned "this is the protocol, we will not break it"
  surface? Document Anthropic's posture on programmatic TUI driving (e.g.
  tweets, docs, GitHub issues, support replies).
  
  Block B — Cost model verification (the headline claim)

  The whole project rests on the claim that PTY-driven session reuse saves
  money vs. claude -p. Verify, don't assume.

  B1. How does Claude Code's prompt caching actually work?
  - Read Anthropic's prompt-caching docs and Claude Code's specific docs on
  caching.
  - Does the cache persist across claude -p invocations? Across claude 
  --resume? Within a single interactive session?
  - What's the TTL? Cache-key shape?

  B2. What does the Max/Pro subscription actually account?
  - Tokens? Messages? Turns? Sessions?
  - Are -p invocations counted differently from interactive turns?
  - Published rate-limiting model?
  
  B3. Empirical benchmark proposal.
  Design (do not run) an experiment that would conclusively prove
  "PTY-session-reuse saves N% vs. claude -p" for a representative Codex→CC
  workload. Specify: workload shape (e.g. 5 delegated review tasks per Codex
  session, each with ~10k context), measurement (/cost, wall-clock, byte
  counts), control (pejmanjohn impl). Identify counter-scenarios: workloads
  where PTY would not save money or could even cost more (e.g. single-shot
  delegations).
  
  Block C — Codex plugin model
 
  We've read openai/plugins examples but we need the actual protocol spec.

  C1. What's the contract between Codex and a skill?
  - When the user invokes $claude-review in a Codex session, what does Codex
  pass to the skill (env vars? stdin? args?)? What does it expect back
  (stdout? a file? structured JSON envelope?)?
  - How is <plugin-root> resolved at runtime?
  - What logging/progress channel exists for a skill that runs for several
  minutes?

  C2. Codex app-server protocol.
  - Does Codex expose a public, documented app-server JSON-RPC protocol the
  way it does internally for openai/codex-plugin-cc? If yes, our plugin could
   also connect to its host Codex to report progress or register additional
  tools.
  - Read references/codex-plugin-cc/scripts/lib/codex.mjs and app-server.mjs
  to reverse-engineer the protocol if not documented.
  
  C3. Hooks reliability.
  - pejmanjohn documents installed-plugin hooks don't fire in Codex. Is this
  still true? What's the root cause — config issue, version issue, or
  architectural limitation?
  - If we cannot use installed-plugin hooks, what's the next-best mechanism
  for a stop-time review gate? (Repo-level hooks? A daemon? A wrapper
  command?)
  
  C4. Installation and distribution.
  - How are Codex plugins actually installed? ~/.codex/plugins/<name>? npm?
  git clone? Tarball?
  - Is there a codex plugin add <url> command? A registry?
  - What does a good install UX look like for a plugin that ships native deps
   (node-pty)?
  
  Block D — Claude Code (the driven side)

  Even though Claude Code is the driven, not the driver, we still need to
  understand its surface.

  D1. What configuration can we pass at startup that affects behavior in our 
  favor?
  --model, --resume, --continue, --add-dir, --mcp-config, --settings, custom
  slash commands, etc.
  - Can we register an MCP server at startup that our PTY-driving process
  owns, enabling structured bidirectional comms via a known channel rather
  than parsing the TUI?

  D2. What's the latest Claude Code capability we should be exploiting in v1?
  Hooks, sub-agents, slash commands, custom agents, the Skill system (a
  recent addition), Agent SDK affordances. Read https://code.claude.com/docs
  end-to-end and produce a checklist of capabilities, marking each as v1-in /
   v1-out and giving reasoning.
 
  Block E — Adjacent prior art (broad scan)

  E1. How do other tools drive Claude programmatically? Survey:
  Cursor's Claude agent mode, Windsurf, Zed's Claude integration, aider's
  Claude support, Continue.dev, crewAI/autogen patterns, oh-my-claudecode.
  For each: transport, billing surface, stream-parsing strategy. Cite repos.

  E2. How do the upstream agent SDKs themselves look?
  Anthropic's Agent SDK architecture (sessions, tool dispatch, streaming).
  OpenAI's Agents SDK architecture for Codex. Are either suitable as
  inspiration for our Driver interface?
  
  E3. What is claude-code-router and similar middleware doing?
  Do any of them solve the PTY problem already? If a working solution exists,
   can we adopt or fork it?
  
  Block F — Driver interface design
  
  Even though only one driver ships in v1, the interface needs to be right
  enough that a second driver (Gemini, Grok, Qwen, DeepSeek) doesn't require
  reworking everything.
  
  F1. What's the minimum set of methods? Strawman:
  interface Driver {
    probe(): Promise<DriverCapabilities>;
    start(workspace: string, opts: StartOpts): Promise<Session>;
    invoke(session: Session, prompt: string): AsyncIterable<DriverEvent>;
    interrupt(session: Session): Promise<void>;
    resume(sessionId: string): Promise<Session>;
    stop(session: Session): Promise<void>;
  }
  Critique this. What events should DriverEvent carry (per-token?
  per-tool-use? per-turn?)? What's the right asynchrony model (AsyncIterable?
   Observable? EventEmitter?)?
   
  F2. How do we model capabilities that some drivers have and others don't
  (hooks, sub-agents, MCP)? Feature flags? Method existence checks?
  Negotiated capability tokens?

  F3. Is there an existing standardized agent protocol we should adopt 
  instead of inventing one? (Agent2Agent, "MCP-as-agent" proposals, the
  various agent-interop drafts in 2025–2026.) If a standard exists, adopting
  it is strictly better than inventing.

  Block G — Job store, persistence, multi-session
  
  openai/codex-plugin-cc uses a job store at ~/.claude/codex-jobs/. We'll do
  similar on the Codex side.
  
  G1. Job record schema. What goes in, what does the user query in
  $claude-status / $claude-result?
  
  G2. Concurrency. What if the user has two Codex sessions open, each
  spawning its own Claude Code? How are sessions namespaced? PTYs cleanly
  torn down? Job records prevented from clobbering each other?
  
  G3. Crash recovery. If our wrapper dies mid-turn but Claude Code is still
  running in its PTY, can we re-attach? (Probably not without a relay/daemon
  — exactly what openai/codex-plugin-cc does with its broker. Recommend or
  rule out a long-lived daemon for our side.)
  
  Block H — Testing strategy

  H1. How do you write deterministic tests for code that PTY-drives an
  external binary whose output is not formally specified?
  - Recorded session playback (golden-file testing of TUI byte streams)
  - A mock claude binary
  - Snapshot testing with version pinning

  H2. CI matrix: OS combinations, Node versions, Claude Code versions. What's
   reasonable for a side-project that nevertheless has to be reliable?
  
  Block I — Failure modes and operational concerns

  I1. Enumerate failure modes and what we do for each:
  - claude binary not on PATH
  - Wrong Claude Code version (older than supported)
  - PTY allocation fails (container, remote SSH, CI)
  - Claude Code requires auth / hits a rate limit / asks for interactive
  confirmation
  - Anthropic outage mid-turn
  - Codex host process killed while a turn is running (orphan PTY)
  - User Ctrl-C's their Codex session
  
  I2. Privacy/security. A delegated turn sends the user's repo contents to
  Anthropic. What disclosures, opt-ins, or sandboxing should the plugin do?
 
  ---
  Resources you should consult
  
  Primary, must-read (all already vendored in references/):
  
  app-server.mjs — gold-standard implementation in the opposite direction.
  Read connection lifecycle, session handling, notification dispatch.
  2. references/cc-plugin-codex/scripts/lib/claude-process.mjs (41 lines) —
  the anti-pattern we're explicitly avoiding. Understand exactly what's
  wrong.
  3. references/codex-plugins-examples/plugins/ — read 3 representative
  plugin manifests + their skill files. Recommended: notion, figma,
  build-web-apps.
  4. references/codex-skills-examples/skills/.system/ and .curated/ — read 3
  representative SKILL.md files end-to-end.
  5. references/documentation-claudecode/ — local snapshot (partial; 4
  files).
  6. references/documentation-codex/ — local snapshot (may be incomplete).
  
  Secondary, fetch as needed:
  - https://code.claude.com/docs/en/overview and the rest of the Claude Code
  docs tree.
  - https://developers.openai.com/codex and the rest of the Codex docs tree.
  - https://github.com/openai/codex — docs/, source for app-server protocol.
  - https://github.com/anthropics/claude-code if it exists publicly.
  - Anthropic prompt-caching documentation.
  
  Tertiary, useful for context:
  - Anthropic Agent SDK (Python + TypeScript) source on GitHub.
  - OpenAI Agents SDK source on GitHub.
  - Recent posts/talks by Anthropic or OpenAI staff on plugin/skill
  architecture.

  ---
  Deliverable

  A single research report, structured as:
  
  1. Executive summary (1 page). Top 5 findings, top 3 risks, top 3
  recommendations.
  2. Block-by-block findings (Blocks A–I above). For each question: clear
  answer with citations to specific files / URLs / commit hashes. Where the
  answer is "unknown / requires empirical test", say so and propose the test.
  3. Recommended architecture (concrete). For each of:
    - PTY transport layer
    - Driver interface shape
    - Codex skill ⇄ driver wire format
    - Job store schema
    - Hook strategy
    - Distribution/install story
    - Test strategy

  give a recommendation with one paragraph of justification.
  4. Risk register. Each entry: description, likelihood (low/med/high),
  impact (low/med/high), proposed mitigation.
  5. What the team is wrong about. Be willing to disagree. The five locked
  decisions above — PTY-not-claude -p, v1-Codex→CC-only, plugin shape from
  openai/plugins, Node+TS, internal Driver interface — if any of them is
  wrong, say so explicitly with evidence.
  6. Recommended v1 implementation sequence. An ordered list of 8–15 tasks
  the engineers should execute in order, with a one-line rationale per task.
  7. Open questions to ask the team back. Things the research couldn't
  resolve without product input.
  
  Target length: 4000–8000 words for the report. Be specific, cite sources,
  prefer code references to vague summaries.

  ---
  Style and ground rules
  
  - Cite everything. Every architectural claim should reference a doc URL, a
  file path + line number, or an empirical observation. No hand-waving.
  - Disagree. If the team's design pillars are wrong, you must say so. A
  report that confirms everything the requester believes is a failed report.
  - Distinguish three epistemic levels. "I read this in the docs" vs. "I
  tested this empirically" vs. "I'm inferring from N similar projects". The
  team will weight your conclusions accordingly.
  - No code. The deliverable is a report, not a starter implementation.
  - Synthesize, don't summarize. Concrete answers beat literature reviews.
  - Length is a feature. Err on the side of more detail. The team explicitly
  asked for a long report.
 
  ---
  That's the prompt. A few things worth flagging about how to use it:
  
  - It's intentionally redundant in places (the "do not reopen these
  decisions unless..." section, the "disagree if we're wrong" instruction
  repeated) because researchers tend to anchor on whatever the requester
  believes. Calling it out twice helps.
  - Block A is load-bearing — if a researcher only finishes one block, that's
   the one. You may want to tell them so explicitly when you hand it over.
  - If you want to give it to a single deep-research run (Claude with web
  access, GPT-5 deep research, whatever you have), it'll fit in one shot. If
  you want to split it across multiple subagents, Blocks A+B go to one
  (cost/PTY), Blocks C+D to another (plugin models), Blocks E+F to a third
  (prior art + interface).