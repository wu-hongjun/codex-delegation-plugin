Here's the research brief for Plan 0002. It is written to be self-contained — a
researcher reading it cold should have everything needed to do the work
without re-reading Plan 0001's research or implementation.

---

Research Brief: PTY attach for cc-plugin-codex (Plan 0002)

## Who you are reading this as

You are a senior systems researcher performing a deep-research pass on behalf
of the small team that just shipped Plan 0001 of `cc-plugin-codex` — a Codex
CLI plugin that delegates coding tasks to Claude Code via background sessions.
Plan 0001 is closed and accepted; the team has stopped writing implementation
code so that you can stress-test the next plan's architecture before they
draft `1-plan.md`.

Your job is to do the research the team should have done before sketching
Plan 0002, and to return with concrete recommendations on:

- which technical approaches are correct vs. popular-but-wrong for the next
  scope slice;
- which risks the team has correctly identified, minimized, or missed;
- what an experienced team building this from scratch today would do
  differently.

You are not implementing. You are producing a research report.

---

## What just shipped (Plan 0001 — closed 2026-05-31)

Plan 0001 delivered an end-to-end, start-only Codex → Claude Code foundation:

- Five Codex skills (`$claude-setup` / `$claude-delegate` / `$claude-status` /
  `$claude-result` / `$claude-stop`) backed by a single dispatcher
  (`packages/plugin-codex/scripts/claude-companion.mjs`).
- A `ClaudeBackgroundDriver` that uses **only** these Claude Code commands:
  `claude --bg`, `claude agents --json`, `claude logs <shortId>`, transcript
  JSONL discovery under `~/.claude/projects/.../<sessionId>.jsonl`, and
  `claude stop <shortId>`.
- A runtime (`packages/runtime/`) with a job store, doctor probes, types, and
  a DI-injected reconciler. Runtime does **not** import the driver package
  (enforced by a static-content test that scans every `.ts` under
  `packages/runtime/src/`).
- 447 tests passing, CI green on `ubuntu-latest + macos-latest × Node 20 + 22`,
  live E2E confirmed against real Codex 0.135.0 + Claude Code 2.1.149 on
  Node v25.1.0.

The locked v1 constraints (still in force):

- No `claude -p` transport. Not even as fallback.
- No `node-pty` anywhere. Not as a dependency, not optional, not
  feature-flagged. (This was deliberate for Plan 0001's start-only scope.)
- One fresh `claude --bg` session per `$claude-delegate` invocation.
- No multi-turn reuse, no PTY attach, no `$claude-review`, no hooks, no
  committed marketplace packaging, no cost-savings claim.
- Privacy ack is interactive by default; `--yes` is the only bypass.
- `--permission-mode` is only forwarded when the user supplies it; no bypass
  flags are ever injected.

Real-Claude-2.1.149 facts the Plan 0001 work uncovered (and which any Plan
0002 research should treat as ground truth, not assumption):

- `claude --bg "<prompt>"` prints `Starting background service…\nbackgrounded
  · <8hex>` on success. The 8-hex shortId is the first 8 hex chars of the
  session UUID, stripped of dashes. (`deriveShortId(uuid) =
  uuid.replace(/-/g,'').slice(0,8)`)
- `claude agents --json` returns rows of `{ pid, cwd, kind, startedAt
  (Unix ms int), sessionId (UUID), name?, status }`. There is **no**
  top-level `shortId`, no `transcriptPath`, no `updatedAt` field.
- Observed `status` values: `idle`, `busy`, `waiting`. Driver-layer
  normalization in Plan 0001: `busy → working`, `waiting → needs_input`,
  `idle → idle`. Reconciler-layer additional mapping in Plan 0001:
  `idle → completed` (correct for the start-only model only — see Open
  question OQ-A below).
- `claude --help` does **not** advertise `--bg` (the flag works at runtime
  but is hidden from help output).
- `claude daemon status` does **not** exist as a subcommand in 2.1.149.
- `claude attach <shortId>` does exist (printed in the `claude --bg`
  startup banner alongside `claude logs <id>`). Plan 0001 did not exercise
  it; whether it spawns a PTY, supports mid-session input, supports
  multiple sequential attaches, or supports concurrent attaches is **open**.
- Real Claude transcripts under `~/.claude/projects/<sanitized-cwd>/
  <sessionId>.jsonl` are ANSI-encoded TUI replays, not structured JSONL
  event records. The Plan 0001 transcript parser does not extract events
  from them; the reconciler's logs fallback path recovers the final
  assistant message post-completion.

The Plan 0001 follow-ups bucket lists Plan 0002 as "multi-turn reuse / PTY
attach or structured input path". The maintainer has now locked Plan 0002's
scope to **PTY attach for mid-session prompt injection and human
permission handoff**. Multi-turn reuse without PTY attach (channels, IPC,
structured input) is explicitly OUT of Plan 0002's scope and is not what
this research should focus on.

---

## What Plan 0002 is committing to (do not reopen unless you find
disqualifying evidence)

1. **Transport addition (not transport replacement)**. `claude --bg` remains
   the way new background sessions start. Plan 0002 adds a PTY-attach lane on
   top of that for **two specific reasons**:
   (a) mid-session prompt injection — sending a follow-up user message to an
   already-running background session without spawning a new one;
   (b) human permission handoff — when Claude Code asks for permission
   mid-session, surface that prompt to the Codex user and forward their
   response back into the same Claude session.

2. **`node-pty` returns to the dependency set, deliberately, with mitigations.**
   It will be an explicit dependency, not `optionalDependencies` with a
   feature flag, because the PTY surface is load-bearing for Plan 0002. The
   research should still take seriously the install-time risks (native
   build pain on Linux ARM, macOS Apple-Silicon-vs-Rosetta mismatches,
   Windows native-build pain) and recommend mitigations.

3. **No `claude -p` fallback.** Same as Plan 0001 — the architecture commits
   to `--bg` + attach. If PTY attach is unavailable, the plugin falls back
   to Plan 0001 behavior (start-only), not to `claude -p`.

4. **`$claude-followup` (or equivalent) is a new skill**, not a flag on
   `$claude-delegate`. The research should recommend the user-visible
   surface; the working name is `$claude-followup <jobId> "<prompt>"`.

5. **Plan 0002 is not Plan 0004.** No cost-savings claim, no benchmark
   harness, no measurement. Cost wording remains "designed to enable future
   session/cache reuse experiments; cost savings have not been benchmarked
   yet" until Plan 0004.

6. **Plan 0002 is not Plan 0003.** No `$claude-review` or
   `$claude-adversarial-review` skills.

7. **Plan 0002 is not Plan 0005.** No stop-time hook or review gate.

8. **No Windows support in Plan 0002.** Same as Plan 0001 — CI matrix
   remains `ubuntu-latest + macos-latest × Node 20 + 22`.

---

## What the research must answer

The questions below are the actual decision-blocking ones. Treat each as a
single deliverable: each should produce a concrete recommendation with
evidence. Do not paper over uncertainty — if the answer is "untested" or
"unverifiable from public docs", say so plainly.

### Block A — `claude attach` real-world surface

A1. What does `claude attach <shortId>` actually do in 2.1.149?
    - Does it spawn an interactive TUI in the current terminal?
    - Does it require a PTY, or does it tolerate stdin/stdout pipes?
    - On exit, does it leave the background session running, kill it, or
      depend on a key/signal?
    - What happens when the same `<shortId>` is attached to a second time
      (sequential, after the first detached)?
    - What happens when two processes attempt to attach concurrently?
    - Is there a programmatic / `--json` / `--no-tui` mode of `attach`, or
      is the TUI the only surface?

A2. How does Claude Code expose "the agent is ready for user input" in the
    PTY byte stream?
    - Is there a stable text marker, ANSI sequence, or prompt prefix that
      can be detected without parsing every cell of the TUI?
    - How brittle is this marker across releases (2.1.x → next minor)?
    - Is there a hidden machine-readable channel (env var, separate fd,
      a sidecar file under `~/.claude/sessions/`) that exposes the same
      signal more reliably?

A3. How does Claude Code surface permission prompts mid-session?
    - Is the permission prompt a modal in the TUI, a separate process, or
      a JSON event in the transcript JSONL?
    - Does Claude have a documented "approve / deny" wire protocol that
      a wrapper can speak without rendering the TUI?
    - What's the failure mode if the wrapper misses or mis-routes the
      prompt (does the session time out? deadlock? auto-deny?)?

A4. Resume semantics:
    - Can the *same* `<shortId>` be re-attached to from a separate
      `node`/`codex` host process (e.g. after the dispatcher exits and a new
      `$claude-followup` invocation runs)?
    - Does `claude attach` see the prior turn's transcript, or only the
      live state from that point forward?
    - Is there a `claude resume <id>` / `claude attach --resume` flag that
      we should be using instead?

### Block B — PTY transport options

B1. `node-pty` viability in 2026:
    - What's the current maintainer activity, last release, and outstanding
      install-time bug count for `node-pty`?
    - Are there known Node 22 / Node 24 incompatibilities?
    - On Apple Silicon, what's the install-time experience under both
      native ARM Node and Rosetta-emulated x64 Node?
    - On `ubuntu-latest` GitHub runners, does `npm ci` build it cleanly with
      the default toolchain, or does it require apt-installing
      `build-essential` + `python3`?

B2. Alternatives to `node-pty`:
    - `@homebridge/node-pty-prebuilt-multiarch` — does it offer the same API
      with prebuilt binaries that avoid native-build risk?
    - Pure-JS PTY-like shims (`pty.js`, `child_process` with `stdio: "inherit"`
      tricks, `tty.WriteStream` over a socketpair). What do they actually
      give up vs. a real PTY?
    - Is there a way to attach to Claude Code's already-running PTY (via the
      sidecar daemon mentioned in `claude --bg` output) instead of opening
      a fresh PTY of our own?

B3. PTY byte-stream parsing:
    - What's the minimum we *must* parse to know "the agent has finished
      this turn"? (full xterm emulator? line-level diff? a regex on
      assistant prompt prefix?)
    - Are there libraries that solve this generically
      (`node-pty` + `xterm-headless`, `tmux capture-pane`, `script(1)` log
      replay, etc.) without us having to write our own emulator?
    - What's the cost (CPU, memory, complexity) of running a headless
      xterm per active session?

### Block C — Job-store schema evolution

C1. Plan 0001's `JobRecord` is one prompt per job. Plan 0002 adds follow-up
    turns. Recommended schema shape:
    - Extend `JobRecord` with a `turns[]` array? Each turn carries its own
      prompt sha, result preview, usage snapshot, started/ended timestamps?
    - Add a sibling `InteractionRecord` keyed by `(jobId, turnIndex)`?
    - Treat `$claude-followup` as a new job with `parentJobId`?
    - Tradeoffs: cardinality (one record getting big vs. many small
      records), prefix-resolution UX (does the user resolve a turn ID or
      the parent job?), backwards compatibility for Plan 0001 records.

C2. The Plan 0001 reconciler maps driver-`idle → completed` because the
    start-only model has no "between turns" state. Plan 0002 must
    distinguish:
    - `idle (no follow-up issued)` → terminal-for-this-turn but
      reusable. What's the right state name? `awaiting_followup`?
      `ready_for_followup`? Both terms appear in adjacent ecosystems
      (e.g. OpenAI Assistants API uses "requires_action" + "completed").
    - `idle (waiting for permission)` → currently `waiting → needs_input`
      at the driver layer. Should this collapse with the above, or stay
      distinct?
    - `working (mid-turn)` → unchanged.
    - The status state machine probably needs a diagram. The research
      should produce one or recommend a canonical reference.

### Block D — Skill surface and user flows

D1. Recommend the user-visible surface:
    - Working name `$claude-followup <jobId> "<prompt>"`. Better names?
    - Should `$claude-delegate` be smart enough to detect "this workspace
      already has an idle reusable session" and propose continuing it,
      or should it always start fresh and require `$claude-followup` for
      reuse?
    - What does `$claude-status` show for a reusable-but-idle session?

D2. Permission-handoff UX:
    - When the Codex session is blocking on a Claude permission prompt,
      how do we surface it? Inline in the dispatcher stdout? A separate
      `$claude-permissions` skill? A side-channel notification?
    - What's the failure mode if the user walks away mid-prompt? Does
      the session time out, sit forever, auto-deny?

D3. Privacy ack:
    - Plan 0001 records one ack per workspace at first delegation. Does
      each `$claude-followup` need its own ack? Once per session? Once
      per workspace forever?
    - When the workspace contents have changed materially since the last
      ack (new files staged, new submodules added), is there a
      ground-truth signal we can re-ack on?

### Block E — Reliability & failure modes

E1. What happens when the PTY attach process crashes mid-prompt?
    - Does the background session keep running and the next attach see
      the orphaned mid-turn input?
    - Is there a `claude attach --recover` story?
    - What's the user-visible message we should produce?

E2. What happens when the Codex dispatcher exits between attach cycles
    (Codex session ends, user opens a new one)?
    - Does the Claude background session keep running? (Plan 0001 says
      yes — `agents --json` keeps reporting it.)
    - Can the next dispatcher invocation re-attach with full history?

E3. Quota and orphans:
    - How does Plan 0002 affect orphan accumulation? More attach cycles
      → more opportunities to leave a session idle. Should
      `$claude-stop` get a `--stop-all-idle` flag in Plan 0002?

### Block F — Driver interface evolution

F1. Plan 0001's `Driver` interface deliberately omitted `send()`,
    `attach()`, `resume()`. Recommend the new shape:
    - `send(session, input)` — synchronous? returns the next assistant
      message? returns immediately and the reconciler handles the
      response?
    - `attach(session)` — exposes a stream of `DriverEvent`s? returns
      a handle to the PTY?
    - `resume(sessionRef)` — needed at all if the same `Driver` instance
      can attach to an existing session by `shortId` + `sessionId`?

F2. Capabilities flip on the driver:
    - `attach: false → true` (Plan 0002 lands the first `true`).
    - `structuredStream: "transcript" → "pty-line"`? Some other token?
    - Recommend any new capability flags Plan 0002 should introduce.

F3. Watch vs. attach:
    - Plan 0001's `watch()` was deferred to Plan 0002 ("plan 0002+ (PTY
      attach / streaming)"). Recommend whether Plan 0002 should
      implement `watch()` as part of the same lane, or defer streaming
      to a later plan and keep Plan 0002 attach-only.

### Block G — Test strategy

G1. Plan 0001's mock (`tools/mock-claude/`) covers `--bg`, `agents
    --json`, `logs`, `stop`, etc. What does the mock need for Plan 0002?
    - `attach` subcommand that emulates the PTY surface enough to drive
      tests through `node-pty`?
    - A scripted "agent" that responds to follow-up inputs with
      fixture-defined assistant messages?
    - Permission-prompt simulation (mock raises a prompt; test asserts
      dispatcher surfaces it; test injects the response; mock continues)?

G2. CI consideration: PTY tests on `ubuntu-latest` and `macos-latest`
    matrix — what install-time and runtime gotchas should we expect?
    Should Plan 0002 ship a smoke test that actually opens a PTY?

G3. Live E2E expectations: Plan 0001's live E2E artifact is the gold
    standard. What should Plan 0002's equivalent capture?

### Block H — Risks the team may have missed

This block is open-ended. Surface risks the team hasn't articulated yet,
ranked by likelihood × impact, with mitigations. Be willing to recommend
that Plan 0002's scope be cut down further if a load-bearing risk
materializes (e.g. "PTY attach is not stable on macOS Sequoia under
TouchID-protected sessions; recommend deferring to a later plan").

---

## What you are *not* researching

- Cost benchmarking. Plan 0004 owns this. Do not produce token-cost
  estimates; do not recommend cost-saving framing.
- `$claude-review` / `$claude-adversarial-review`. Plan 0003.
- Hooks. Plan 0005.
- Marketplace packaging. Plan 0006.
- Windows support. Out of v1 scope.
- The Claude `-p` / Agent SDK / non-interactive transports. Locked out.
- The job store's BSD-flock single-writer / atomic-write story. Plan 0001
  is the source of truth; only revisit it if your Plan 0002 schema
  recommendation changes the assumptions.

---

## Deliverable

Produce `documentation/research/20260531-plan-0002-research/report.md`,
structured to mirror Plan 0001's `report.md` shape (sections labeled by
Block A–H, with concrete recommendations + evidence + cited sources for
each). Include:

- Executive summary (≤ 1 page)
- Block-by-block findings + recommendations
- Open questions the team must answer before drafting `1-plan.md`
- A risks-and-mitigations table
- A short "what would you do differently" reflection at the end

Cite primary sources (Claude Code docs, GitHub source, `node-pty` README,
issue trackers, npm registry) over secondary blog posts. If you cannot
find primary evidence for a claim, mark it `unverified` rather than
guessing.

---

## How the team will use this report

The maintainer will read this report and then draft Plan 0002's
`1-plan.md`. Recommendations in the report become open questions in the
plan if they require maintainer choice (model: Plan 0001 had six open
questions all answered by the maintainer before implementation started).
Anything the report leaves ambiguous becomes a blocker on Stage 1
approval.

The team is small (one maintainer + Claude Code agents). Time is
finite. Bias the report toward "smallest plan that lands real PTY attach
+ permission handoff" rather than "complete redesign of the driver
surface". If the smallest plan is still too big, say so and recommend a
Plan 0002 / Plan 0002.5 split.
