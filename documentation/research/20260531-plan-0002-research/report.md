# Plan 0002 Research Report — PTY attach for cc-plugin-codex

- **Author**: Claude (research agent, cold-start independent pass)
- **Date drafted**: 2026-05-31
- **Subject**: Plan 0002 scope — mid-session prompt injection + human permission handoff via `claude attach`
- **As-of dates for time-sensitive claims**: 2026-05-31 (Claude Code `2.1.149`, Codex `0.135.0`, Node `25.1.0`, `node-pty@1.1.0` published 2025-12-22, `@xterm/headless@6.0.0` published ~5 months ago)
- **Primary-source evidence in this report**: live `claude --help`, `claude attach --help`, `claude agents --help`, `claude logs --help`, `claude stop --help`, `claude --bg --help`, `claude agents --json` output, on-disk inspection of `~/.claude/{daemon,sessions,jobs,projects}/` on a 2.1.149 install, `npm view` registry data for `node-pty`, `@homebridge/node-pty-prebuilt-multiarch`, `@xterm/headless`, `@lydell/node-pty`, and Plan 0001's `e2e-live-20260530.txt` artifact.
- **Side effects taken during evidence-gathering**: one `claude --bg` background session (`0923955d`) was started, used for sidecar inspection, and stopped before the report closed. `claude stop` printed a "couldn't confirm" warning that was a false-negative (the session was actually stopped); this itself is logged as Plan 0002 R16.

---

## 1. Executive summary

Plan 0002's locked scope (PTY-attach for mid-session prompt injection + human permission handoff) is **viable but slightly over-scoped** relative to what real Claude Code 2.1.149 already exposes. The single biggest finding in this pass is that the maintainer's machine carries a previously-undocumented sidecar surface that materially changes the build:

- `claude attach <id>` is a **real, documented, in-binary subcommand** in 2.1.149. Its help string reads literally: *"Open the background session in this terminal. Detach with Ctrl+Z; the session keeps running."* That is the load-bearing primitive Plan 0002 needs.
- `claude stop <id>`'s help reads *"Stop a background session. Its conversation is kept; resume it later with `claude attach <id>`."* Resume of a stopped session is a first-party concept, not a hack we have to invent.
- **`claude --bg` with no prompt argument starts a session in `idle` state**: the live startup banner literally says `backgrounded · <shortId> (idle — send a prompt to start)`. This is a major Plan 0001 mental-model correction — a session and a prompt are decoupled at the protocol layer, not just at the wrapper layer.
- A **structured sidecar** lives at `~/.claude/jobs/<shortId>/state.json` and `~/.claude/jobs/<shortId>/timeline.jsonl`. `state.json` carries fields the Plan 0001 mock never imagined: `state`, `tempo`, `inFlight.{tasks,queued,kinds}`, `output.result`, `respawnFlags`, `resumeSessionId`, `intent` (the **original prompt**), `linkScanPath` (the canonical transcript path), `backend: 'daemon'`, `template: 'bg'`, `nameSource`, `daemonShort`. `timeline.jsonl` is per-state-change. There is also a supervisor sidecar at `~/.claude/daemon/{dispatch/,roster.json}` and per-PID session files at `~/.claude/sessions/<pid>.json` carrying `peerProtocol: 1` and a richer status superset.
- `node-pty` is alive and shipping. Latest stable `1.1.0` (published 2025-12-22 by Microsoft, 195 versions cut, `1.2.0-beta.13` released 2026-05-13 — under 3 weeks ago). It remains the obvious choice for the *input* side. `@homebridge/node-pty-prebuilt-multiarch@0.13.1` exists as a prebuild-shipping fork and `@lydell/node-pty@1.2.0-beta.12` exists as a slimmer redistribution; both are credible mitigation paths for native-build pain.

These findings together support a single recommendation: **build PTY attach for the *input* side only, and use the sidecar (`state.json` + `timeline.jsonl` + `linkScanPath`) as the structured *output* side**. Do not try to parse the TUI byte stream for semantic events. The PTY exists to *speak* into the session (and to relay one human keystroke when Claude wants a permission decision); the sidecar is the *listening* surface.

That decomposition is materially smaller than what the Plan 0002 brief hints at. It splits cleanly into:

1. A `ClaudeAttachWriter` that wraps `claude attach <id>` in a PTY, types a prompt + Enter, then detaches with **Ctrl+Z** (the documented detach key, *not* Ctrl+D and *not* SIGTERM).
2. A new `SidecarReader` in the driver that watches `~/.claude/jobs/<shortId>/state.json` (and tails `timeline.jsonl`) for "the agent is back to `tempo: idle`" and "the agent emitted a new `output.result`".
3. A new `$claude-followup <jobId> "<prompt>"` skill that locates the live `shortId`, runs (1), then waits on (2).

PTY parsing complexity (`xterm-headless`, line-buffered ANSI state machines, prompt-prefix regex) is **not** needed and should not be in Plan 0002. The TUI byte stream is for humans; the sidecar is for our code.

### Five top findings

1. **`claude attach <id>` is real, stable, and documented at the CLI level.** The detach key is `Ctrl+Z` and it is documented in `--help`, so we can rely on it.
2. **A structured sidecar already exists at `~/.claude/jobs/<shortId>/{state.json,timeline.jsonl}`.** It carries the agent's intent, output, resume-session-id, link to the transcript, and a tempo field that distinguishes "currently working" from "idle, awaiting input".
3. **`claude --bg` with no prompt creates an `idle` session** waiting for input; this means a sane Plan 0002 flow is *create blank companion session → attach → type prompt → detach → tail sidecar → repeat*, with no "spawn-with-prompt then reuse later" awkwardness.
4. **`node-pty` is healthy in 2026.** Microsoft published `1.1.0` stable in 2025-12, `1.2.0-beta.13` in 2026-05; the Node-22 / Node-24 install path on macOS / Linux is well-trodden.
5. **`claude --bg` is unchanged in semantics from Plan 0001's discovery**, but the *daemon log* (`~/.claude/daemon.log`) emits machine-readable lines (`[supervisor]`, `[bg] bg spare spawned`, `[bg] bg claimed-spare <shortId>`) confirming there is a real per-user supervisor — meaning `claude stop` and `claude attach` are addressing a long-running process, not respawning.

### Three top risks (rank: likelihood × impact)

1. **Sidecar schema drift.** `~/.claude/jobs/<shortId>/state.json` is not in any public doc I can find. Anthropic could rename, restructure, or move it to a daemon-protocol-only surface in any minor release. **Mitigation**: feature-probe the sidecar at startup; if missing, degrade to "PTY-attach + post-detach `claude logs` read" (Plan 0001's logs-fallback path); never make the sidecar a hard requirement in `probe()`.
2. **PTY install-time native build failures.** `node-pty@1.1.0` is the only path Microsoft maintains; native ARM build on a Linux runner without `build-essential` will fail. Apple Silicon under Rosetta can also mis-build. **Mitigation**: make `node-pty` a *required* dependency of `@cc-plugin-codex/driver-claude-code` (because the PTY surface is load-bearing for Plan 0002 — `optionalDependencies` would silently disable the new skill), but ship a doctor probe that surfaces a build error as an *actionable* warning and recommend the prebuilt fork (`@homebridge/node-pty-prebuilt-multiarch`) only when native build fails. Do not gate Plan 0001's start-only path on the PTY dependency — keep that path's behavior degradable.
3. **Concurrent attach is unspecified.** Plan 0001 never exercised it. `claude attach --help` is silent on what happens when two processes attach simultaneously, or when an attach process crashes mid-input. **Mitigation**: serialize all `attach` calls per-`shortId` with a file lock under `~/.codex/cc-plugin-codex/locks/attach-<shortId>.lock`; treat concurrent attempts as `EBUSY` and ask the user to retry.

### Three top recommendations

1. **Split the input and output paths.** Use PTY for input only (`claude attach <id>` + type + Ctrl+Z). Use the sidecar (`state.json` + `timeline.jsonl`) for output and lifecycle signals. Do **not** parse the TUI byte stream for semantics.
2. **Make `$claude-followup` a new skill with `(jobId, prompt)` semantics**; resist scope creep into "smart `$claude-delegate` that reuses idle sessions". Reuse complicates the privacy-ack story, the workspace-resolution story, and the orphan-cleanup story; each of those is its own Plan-N decision and shouldn't be smuggled in. `$claude-delegate` keeps Plan 0001 semantics (always-fresh `claude --bg`).
3. **Defer `watch()` (streaming `DriverEvent` AsyncIterable) past Plan 0002.** It is currently `throw new DriverNotImplementedError('watch', 'plan 0002+ ...')`. Implementing it correctly requires settling the sidecar-vs-PTY-vs-transcript event model. Plan 0002 should add a new `attach()` driver method and a `tailSidecar()` helper, not a full `watch()` AsyncIterable. Promote to AsyncIterable in Plan 0002.5 or a later plan after live exercise.

### Scope-altering surfaces

| Surface | Plan 0001 status | Plan 0002 recommendation |
|---|---|---|
| `claude attach <id>` | unexercised | required; PTY input only |
| `~/.claude/jobs/<shortId>/state.json` | unknown | **structured status source** |
| `~/.claude/jobs/<shortId>/timeline.jsonl` | unknown | **structured event source** |
| `~/.claude/sessions/<pid>.json` | unknown | best-effort enrichment only |
| `~/.claude/daemon/roster.json` | unknown | diagnostic only |
| TUI byte stream | unexercised | **do not parse** for semantics |

If during implementation it turns out the sidecar isn't writable/queryable everywhere (e.g. some Claude Code versions, locked-down sandboxes), the fallback is Plan 0001's existing `claude logs <id>` reader, not TUI scraping. That's a smaller, safer fallback than the brief implies.

---

## 2. Block-by-block findings

### Block A — `claude attach` real-world surface

#### A1. What `claude attach <shortId>` actually does in 2.1.149

**Claim**: `claude attach <shortId>` is a documented in-binary subcommand. It opens the background session interactively in the current terminal. Detach is `Ctrl+Z`. Detach does **not** stop the session.

**Evidence (primary, live, this report)**:

```
$ claude attach --help
Usage: claude attach <id>

  Open the background session in this terminal. Detach with Ctrl+Z; the session keeps running.
```

The `claude --bg` startup banner also shows `claude attach <id>    open in this terminal` (confirmed in Plan 0001's `e2e-live-20260530.txt` line 77 and re-confirmed live in this pass).

`claude stop --help` says: *"Stop a background session. Its conversation is kept; resume it later with `claude attach <id>`."* That confirms re-attach after `stop` is the documented behaviour.

**Recommendation**:

- Plan 0002 uses `claude attach <shortId>` as the input transport.
- The detach key is **`Ctrl+Z`** (a single byte: `0x1a`, SUB control character). Type the user's prompt, type `\r` (Enter), then **wait for the sidecar `tempo` to leave `idle`** (start-of-turn), then **wait for `tempo` to return to `idle`** (end-of-turn), then write the `0x1a` byte to the PTY to detach. Do **not** use `Ctrl+D` (which would close stdin) and do **not** use SIGTERM (which would behave like `claude stop`).
- A "soft timeout" should fire if `tempo` does not transition off `idle` within ~5 seconds of typing the prompt; that indicates either the PTY input never reached Claude or Claude is in a `waiting` (permission) state. Permission handling is Block A3.

**Residual uncertainty**:

- Whether `claude attach` exits with a non-zero code when the `<shortId>` does not exist (vs. printing an error and entering some other mode) is **unverified** without a live attach probe, which the brief excludes. Plan 0002 implementation must check this in T-something and document it.
- Whether `claude attach` requires a real PTY (read: `node-pty`) vs. tolerates a pipe is **unverified** but high-confidence "requires PTY". The help string says "open … in this terminal"; the binary uses an alternate-screen TUI on attach; alternate-screen requires `ioctl(TIOCSWINSZ)` and a `termios` fd. Without `node-pty`, `spawn('claude', ['attach', id], { stdio: 'inherit' })` would likely either fail to allocate a tty or render to the parent Codex terminal in a way that corrupts it. **Plan 0002 should assume PTY is required and validate this with a non-mutating PTY smoke test (a fresh `--bg` blank session in a temp cwd, then `attach` to it under PTY, then `stop`) as part of T-doctor.**

#### A2. How "ready for user input" is exposed in the PTY byte stream

**Claim**: It's exposed *much more reliably* off the PTY byte stream — in the sidecar at `~/.claude/jobs/<shortId>/state.json`, fields `state` (`done`) and `tempo` (`idle`). The same signal is also visible in `claude agents --json` as `status: "idle"`. Parsing the TUI prompt prefix is not necessary and is brittle across Claude releases.

**Evidence (primary, live, this report)**:

`~/.claude/jobs/6ef69db3/state.json` (a prior Plan 0001 E2E job, read-only inspection):

```jsonc
{
  "state": "done",
  "detail": "found 3 TODOs: README.md:3-4 (placeholder, another todo), app.js:2 (implement)",
  "tempo": "idle",
  "inFlight": { "tasks": 0, "queued": 0, "kinds": [] },
  "output": { "result": "3 TODOs found: README.md lines 3–4, app.js line 2" },
  "linkScanPath": "/Users/hongjunwu/.claude/projects/-private-tmp-cc-plugin-codex-e2e-T1UTOe/6ef69db3-695d-4420-a2d1-442b89c5d1c2.jsonl",
  "template": "bg",
  "respawnFlags": ["--name", "codex-e2e-plan-0001"],
  "intent": "Inspect this tiny throwaway repo and report what TODOs exist. Do not edit files.",
  "name": "codex-e2e-plan-0001",
  "nameSource": "user",
  "sessionId": "6ef69db3-695d-4420-a2d1-442b89c5d1c2",
  "resumeSessionId": "6ef69db3-695d-4420-a2d1-442b89c5d1c2",
  "daemonShort": "6ef69db3",
  "cliVersion": "2.1.149",
  "cwd": "/private/tmp/cc-plugin-codex-e2e-T1UTOe",
  "backend": "daemon"
}
```

The corresponding `timeline.jsonl` has lines of shape `{at, state, detail, text}` — a coarse per-state-change log. On the maintainer's machine the post-completion entry was a single line containing the final assistant message as `text`.

**Recommendation**:

- `SidecarReader.statusOf(shortId)` reads `~/.claude/jobs/<shortId>/state.json` and returns `{ state, tempo, output, inFlight, linkScanPath }`. Idempotent, single fs.read, sub-millisecond.
- The "agent is ready for the next prompt" signal is `tempo === "idle"` **and** `inFlight.tasks === 0`. This is *strictly* a stronger signal than `claude agents --json` status `idle`, because `tempo` distinguishes "currently between turns waiting for human input" from "doing internal accounting between sub-steps".
- The "the turn is done, here is the answer" signal is the latest `output.result` field, plus the `text` field of the last `timeline.jsonl` entry. Plan 0002's reconciler should prefer `output.result` over `claude logs` for the final-message extraction.

**Residual uncertainty**:

- **Sidecar schema drift**. The `state.json` / `timeline.jsonl` shape is not in `claude --help`; field names (`linkScanPath`, `respawnFlags`, `nameSource`, `template`, `peerProtocol`) are unmistakably internal-implementation names, not API names. Anthropic could rename or move them in any minor release. **Mitigation**: treat the sidecar as a best-effort *enrichment* layer; the doctor probe must classify "sidecar present and parseable" as a separate capability flag (`structuredStream: "sidecar"`); fall back to `claude logs` if absent. Do not make sidecar parsing block `attach()` from working.
- Whether `timeline.jsonl` ever gets *more* than one line per turn (e.g. mid-turn tool-use events) is **unverified** — the only example I could observe was a fully-done turn with one entry. If `timeline.jsonl` carries mid-turn events on longer runs, that strengthens the "no TUI parsing" recommendation further; if it doesn't, sidecar still beats TUI scraping because the *terminal* state (`tempo: idle`, `state: done`) is in `state.json`.

#### A3. How Claude Code surfaces permission prompts mid-session

**Claim**: From this pass's evidence, the most likely permission surface in `claude attach` is **the TUI itself** (a modal in the alternate-screen render) — i.e. the same human-facing prompt a user would see if they ran `claude` directly. There is no observable "permission required" record in the sidecar's single-entry timeline I inspected, but the `claude agents --json` schema documents a `status: "waiting"` state (Plan 0001's E2E captured this, and Plan 0001's driver normalizes `waiting → needs_input`). That is the most reliable "the agent is blocked on a human decision" signal we have.

**Evidence**:

- `claude agents --json` status `waiting` is normalized to `needs_input` by the driver today (see `packages/driver-claude-code/src/agents-json.ts` STATUS_MAP: `['needs_input', 'needs-input', 'waiting_for_input', 'blocked', 'waiting'], 'needs_input'`).
- `claude --help` lists `--brief` with description *"Enable SendUserMessage tool for agent-to-user communication"* — this implies there is an internal `SendUserMessage` tool. **Unverified** whether `--brief` changes the structured surface in a way that exposes permission requests as a discrete record. Worth a single follow-up probe in Plan 0002's T-doctor.
- `~/.claude/jobs/<shortId>/state.json` carries `inFlight.kinds: []` (a string array). The empty example I saw means we cannot tell from that snapshot whether `kinds` would contain `"permission"` during a permission stall. **Unverified**.

**Recommendation**:

- Plan 0002's `attach()` flow detects "permission required" by polling the sidecar / `claude agents --json` for status transitioning to `waiting` (or normalized `needs_input`). When detected, the PTY-attached process should hand the user a clear message — e.g. *"Claude is asking for permission inside session `<shortId>`. Type your answer below; we will route it back into the session. (To abort, press Ctrl+C in the dispatcher.)"* — read one line from the dispatcher's own stdin, then write that line + `\r` into the PTY.
- This is **slower and less rich** than a wire-protocol approve/deny — but it is the safest UX the current Claude Code surface can support without bypass flags. Plan 0002 should **not** introduce `--dangerously-skip-permissions` or any equivalent.

**Failure modes the wrapper must handle**:

- Wrapper misses the prompt → Claude will stay in `waiting` indefinitely (no auto-deny observed; sessions in `waiting` status persist across `agents --json` polls). **Detection**: a Plan 0002 timeout that warns when a session has been in `waiting` for > N minutes. **Default action**: surface to the user, do NOT auto-deny.
- Wrapper mis-routes the answer to a different session → high-impact data corruption. **Mitigation**: lock by `shortId`; only one attach session at a time; refuse `$claude-followup` if a prior PTY is still attached to the same `shortId`.

**Residual uncertainty**:

- Whether 2.1.149 actually emits a *machine-readable* permission record anywhere (a `peerProtocol` socket message under `~/.claude/daemon/dispatch/`? a record in `timeline.jsonl`?) is **unverified**. Plan 0002's T-doctor should include a one-off "trigger a permission prompt, snapshot all four sidecar locations" smoke run.

#### A4. Resume semantics

**Claim**: Same-`shortId` re-attach across host processes is supported. `claude stop` keeps the conversation. `claude attach <id>` re-enters with full prior turn context. No separate `claude resume <id>` flag is needed — `--resume` is a flag on the top-level `claude` command for resuming an interactive session by **sessionId** (UUID), not by `shortId`.

**Evidence**:

- `claude stop --help` (live, this report): *"Stop a background session. Its conversation is kept; resume it later with `claude attach <id>`."*
- `claude --help` (live, this report) lists `-r, --resume [value]` as a flag for *the top-level* `claude` invocation: *"Resume a conversation by session ID, or open interactive picker with optional search term."* This is distinct from background-session attach.
- Plan 0001's `~/.claude/jobs/<shortId>/state.json` carries `resumeSessionId: <sessionId UUID>` — confirming the daemon's mental model: a `shortId` is a process-level handle, a `sessionId` is the conversation. `claude attach <shortId>` reconnects to the live process; `claude --resume <sessionId>` would replay the conversation as a *new* interactive process.

**Recommendation**:

- Plan 0002 uses `claude attach <shortId>` exclusively for follow-up. Do not use `claude --resume <sessionId>` — that's a fresh process, not a re-attach to the live one, and it has different permission/credit semantics.
- The same `shortId` *can* be re-attached from a separate `codex`/`node` host process; Plan 0001's E2E artifact confirmed that the Claude daemon and session survive Codex dispatcher exit. Plan 0002 should assume re-attach from a fresh dispatcher process works.

**Residual uncertainty**:

- Whether the prior turn's transcript is visible to the new attach in the TUI scroll-back, or only the live state from this point forward, is **unverified** but doesn't matter for Plan 0002 — we never parse the TUI. The sidecar's `linkScanPath` (the JSONL transcript) is the authoritative scroll-back.

---

### Block B — PTY transport options

#### B1. `node-pty` viability in 2026

**Claim**: `node-pty` (Microsoft/node-pty) is currently maintained and shippable on Node 20 / 22 / 24 across macOS and Linux. As-of 2026-05-31: latest stable `1.1.0` published 2025-12-22; `1.2.0-beta.13` published 2026-05-13. 195 versions cut. Native build dependency: `node-addon-api@^7.1.0`. Repo: `https://github.com/microsoft/node-pty`.

**Evidence (primary, live, this report)**:

```
$ npm view node-pty
node-pty@1.1.0 | MIT | deps: 1 | versions: 195
Fork pseudoterminals in Node.JS
https://github.com/microsoft/node-pty
dependencies: node-addon-api: ^7.1.0
dist-tags: latest: 1.1.0, beta: 1.2.0-beta.13
published 5 months ago by microsoft1es
```

Release cadence (sampled): `1.1.0-beta40` 2025-12-10 → `1.1.0` stable 2025-12-22 → `1.2.0-beta.1` 2025-12-30 → `1.2.0-beta.13` 2026-05-13. Active maintenance.

Known install-time gotchas (general; not from a primary issue-tracker search in this pass — marked `unverified` only on the specifics):

- Linux without `build-essential` / `python3` will fail at `node-gyp` rebuild.
- Apple Silicon under Rosetta-emulated x64 Node will build an x64 binary that fails to load in arm64 Node, and vice versa.
- Node 22 / 24 are both ABI-stable; `node-addon-api@^7` covers Node 18–24.

**Recommendation**:

- Plan 0002 takes `node-pty` as a **declared `dependencies` entry** (not `optionalDependencies` — the PTY surface is load-bearing).
- CI matrix stays `ubuntu-latest + macos-latest × Node 20 + 22`. Both runners have toolchains in their default images, so `npm ci` should build cleanly; add a CI smoke step that imports `node-pty` and spawns `bash -c 'echo ok'` under it before any other test runs.
- Add a doctor probe (`pty-build`) that does a tiny `require('node-pty').spawn('echo', ['ok'], {})` and surfaces a clear error if the require fails. On failure, the probe's `detail` should recommend either rebuilding (`npm rebuild node-pty`) or switching to the prebuilt fork.

**Residual uncertainty**:

- Outstanding GitHub issue count is **unverified** in this pass. Plan 0002 implementation should spot-check `github.com/microsoft/node-pty/issues` for any *new* (post-2026-01) install-blocking regressions before committing to v1.1.0.

#### B2. Alternatives to `node-pty`

**Claim**: Two credible alternatives exist, ranked by recommendation:

1. **Primary**: `node-pty@1.1.0` (Microsoft). Build native; latest stable.
2. **Fallback for users without a toolchain**: `@homebridge/node-pty-prebuilt-multiarch@0.13.1`. Same API surface (`spawn`, `IPty.write`, `IPty.onData`). Ships prebuilt binaries via `prebuild-install`. Last published 11 months ago. Risk: lagging behind Microsoft mainline.
3. **Slim alternative**: `@lydell/node-pty@1.2.0-beta.12`. 13.5 kB unpacked vs. Microsoft's 64.4 MB. Marketed as "smaller distribution of node-pty". Published 1 month ago. Beta only; not recommended for v1.

Pure-JS PTY-like shims (`pty.js`, `stdio: "inherit"` tricks, socketpair-based TTYs) **do not** give Claude Code what it needs. Claude Code's TUI uses ANSI alternate-screen and queries the terminal size via `ioctl(TIOCGWINSZ)`. Without a real pty file descriptor pair, alternate-screen rendering glitches, `winch` events miss, and (more importantly) Claude Code may refuse to enter interactive mode at all if `isatty(0/1)` returns false.

**Re-attach to "Claude Code's already-running PTY"**: This is the cleverest idea in the brief, and the answer is **no, you can't, and you shouldn't try**. Claude Code's daemon spawns each background session as its own host process (see `~/.claude/daemon.log`: `[bg] bg spare spawned host pid=64023`), and the running TUI binds its alternate-screen to whichever terminal *most recently* `attach`-ed. There is no published API for "give me a duplicate fd to the running PTY". The closest legitimate primitive is `claude attach`, which is what we already plan to use; trying to bypass it (e.g. by opening `/dev/ttysN` for the live host process) is undocumented, would need root, and would not work under macOS sandboxing.

**Recommendation**:

- Default to `node-pty@1.1.0`.
- Doctor probe: if `node-pty` require fails, suggest `npm rebuild node-pty` OR switching to `@homebridge/node-pty-prebuilt-multiarch`. Do not auto-install either.
- Document this in `packages/driver-claude-code/README.md` so users hitting native build errors have a clear path.

**Residual uncertainty**: none material; the choice is settled.

#### B3. PTY byte-stream parsing

**Claim**: **You do not need a TUI emulator for Plan 0002.** The sidecar (Block A2) supplies all the structured signals Plan 0002 needs (`state`, `tempo`, `output.result`, `inFlight`). The PTY is for *typing*. Reading the PTY's output is for one purpose only: ensuring Claude has actually rendered its prompt-input box before we type (a single-byte "echo" check). That's a regex on the first ~200 bytes after attach, not a full xterm emulator.

`@xterm/headless@6.0.0` exists (published ~5 months ago, MIT, no deps, 2.0 MB unpacked) and would work as a fallback if the sidecar disappeared. But making it Plan 0002's primary semantic surface adds CPU (1 emulator per attach) and complexity that the sidecar makes unnecessary.

**Recommendation**:

- Plan 0002 owns a tiny `PtyReadDrain` helper: read PTY output into a bounded ring buffer (8 KiB max), discarded periodically; never feed it to an emulator. The buffer exists *only* so the PTY's pipe doesn't backpressure and stall the writer.
- All semantic signals come from the sidecar.
- Do **not** add `@xterm/headless` to `dependencies` in Plan 0002. If the sidecar turns out to be unreliable later, revisit in Plan 0002.5 / 0003.

**Residual uncertainty**: Only the sidecar-disappears scenario. Doctor probe must catch this and degrade gracefully.

---

### Block C — Job-store schema evolution

#### C1. JobRecord shape for multi-turn

**Claim**: Extend `JobRecord` with a `turns: TurnRecord[]` array. Do **not** introduce sibling `InteractionRecord` files keyed by `(jobId, turnIndex)`; do **not** make `$claude-followup` a new top-level job with `parentJobId`. The first approach is simplest, preserves Plan 0001's prefix-resolution UX, and keeps cardinality manageable (turns are user-typed; we are not generating thousands per job).

**Evidence / rationale**:

- Plan 0001's `JobRecord.prompt: PromptContext` is already a single-turn shape (`{ summary, sha256, bytesLen }`). The cleanest extension is `turns: TurnRecord[]` where each `TurnRecord` has its own `{ prompt: PromptContext, startedAt, endedAt, result?: ResultContext, usageSnapshot?, status: TurnStatus }`. Turn 0 carries the original delegate prompt; subsequent turns carry `$claude-followup` prompts.
- `JobRecord.result` becomes `latestResult` (or stays `result` and means "most recent terminal turn's result") for backwards compatibility with Plan 0001's reconciler artifacts pipeline.
- New `TurnStatus` values: `queued | starting | injecting | working | needs_input | completed | failed`. (`injecting` = "PTY-attach is mid-write of the prompt".)
- `JobRecord.schemaVersion` increments to `2`. Plan 0001 records (schemaVersion 1) are upgraded lazily on first read: `if (job.schemaVersion === 1) { migrate(job); }`. The migration is mechanical — wrap the existing single prompt/result into a `turns[0]` entry.

**Recommendation**:

- Schema-version bump to 2; lazy migration on read.
- Add `turns: TurnRecord[]` (required, len ≥ 1 after migration).
- Keep `prompt` and `result` on `JobRecord` as aliases of `turns[0]` and `turns[turns.length-1]` *only* for Plan 0001 callers; mark them `// deprecated, use turns[]` and remove in a later plan.
- `appendEvent` already exists; reuse it. Per-turn lifecycle events: `turn.requested`, `turn.injected`, `turn.completed`, `turn.failed`. Plus existing `reconcile.status`, `reconcile.result`, `reconcile.warning`.

**Why not a separate `InteractionRecord`**: it would double the file count under `~/.codex/cc-plugin-codex/jobs/`, complicate the existing prefix resolver in `cmdResult`/`cmdStop` (which currently matches a single `jobId` prefix), and make `--json` consumers need to read two files per result. The cardinality argument doesn't apply — even a chatty user types O(10) follow-ups per job, not O(1000).

**Why not `parentJobId` and treating follow-ups as new jobs**: it inverts the UX. Users think "my Plan 0001 job is now multi-turn"; if each turn became its own jobId with a parent link, the `$claude-status` table grows linearly with turn count and prefix collisions get worse. The `(jobId, turnIndex)` namespace is the right unit of identity for the user.

**Residual uncertainty**:

- `turns[]` cardinality bound: if a user attempts 1000 follow-ups, the record grows. Recommend a soft cap of 200 turns per job with a warning. **Unverified** whether real users would hit this; defer the cap to Plan 0002 implementation.

#### C2. Status state machine for multi-turn

**Claim**: Plan 0002 needs a richer state machine. The cleanest model has three orthogonal axes:

1. **Job lifecycle**: `queued | starting | active | completed | failed | stopped | orphaned`. Active means "the underlying Claude session is still alive and can take more turns". Completed means "the user has marked this job done; the underlying Claude session may have been stopped".
2. **Turn lifecycle (per current turn)**: `idle | injecting | working | needs_input | completed | failed`. Idle is the new key state — "Plan 0001-completed", but reusable.
3. **Driver session value** (unchanged from Plan 0001): `idle | busy | waiting | working | needs_input | completed | failed | stopped | orphaned | unknown`.

The Plan 0001 reconciler currently collapses these three by mapping `driver-idle → job-completed` (correct only for the start-only model). Plan 0002 has to *uncollapse* that mapping.

**Recommendation**:

- New `JobStatus`: add `awaiting_followup`. Use this when the underlying driver reports `idle` *and* the job's most recent turn is `completed`. This is the "Plan 0001-completed-but-reusable" state.
- Status mapping (driver → job) becomes context-aware:
  - driver-`idle` + most-recent-turn-`completed` + job's reuse policy is "session-reusable" → job-`awaiting_followup`
  - driver-`idle` + most-recent-turn-`completed` + job's reuse policy is "single-shot" (Plan 0001 compat) → job-`completed`
  - driver-`idle` + most-recent-turn-`injecting` → still job-`active`, turn-`injecting` (we're mid-write)
  - driver-`busy` → job-`active`, turn-`working`
  - driver-`waiting` → job-`active`, turn-`needs_input`
  - driver-`idle` + most-recent-turn-`failed` → job-`failed`
- `$claude-status` displays job-status. `--verbose` shows current-turn status too.
- `$claude-result <jobId>` returns the *latest completed turn's* result by default. `--turn N` returns the Nth turn's result.
- Naming: `awaiting_followup` is preferred over OpenAI's `requires_action` (which implies an action is required of the model, not the user) and over `ready_for_followup` (which sounds like a passive state). The name parses well in `$claude-status` output.

**State-machine diagram (canonical for Plan 0002)**:

```
job-lifecycle (Plan 0002):

  queued ──► starting ──► active ──┬──► completed
                                   │
                                   ├──► awaiting_followup ──► active (via $claude-followup)
                                   │                       │
                                   │                       └──► completed (via timeout or explicit "done")
                                   │
                                   ├──► failed
                                   ├──► stopped (via $claude-stop)
                                   └──► orphaned (driver lost track)

per-turn lifecycle (Plan 0002):

  queued ──► starting ──► injecting ──► working ──► completed
                                          │
                                          ├──► needs_input ──► working (after human handoff)
                                          ├──► failed
                                          └──► stopped (parent job stopped)
```

**Residual uncertainty**:

- Whether `awaiting_followup` should auto-`completed` after some TTL is an open question for the maintainer. Recommended default: yes, after 1 hour idle, mark `completed` and `claude stop` the underlying session. This bounds quota orphans without burning UX. Maintainer chooses TTL in OQ-A below.

---

### Block D — Skill surface and user flows

#### D1. User-visible surface

**Claim**: Ship `$claude-followup <jobId> "<prompt>"` as a new skill. Keep `$claude-delegate` start-only (Plan 0001 semantics).

**Evidence / rationale**:

- Privacy ack is per-workspace, recorded once at first delegation. `$claude-delegate` is where the user opts in; making it "smart-detect-reuse" would surface a follow-up message in a session the user didn't think about opting into — the privacy ack story gets muddier without proportional UX benefit.
- Workspace resolution: Plan 0001 polished `cmdResult` / `cmdStop` to filter by current workspace. Auto-detecting reusable sessions would re-broaden that filter or require workspace-tagging the session at start time, both of which are larger changes.
- Plan 0002's brief explicitly directs `$claude-followup` to be a *new* skill, not a flag on `$claude-delegate`. The research agrees.

**Alternative names considered, and why not**:

- `$claude-continue` — collides with the user mental model of `--continue` in raw `claude`; risk of misuse.
- `$claude-send` — too generic; could imply sending a message *out* of Claude (e.g. to a Slack).
- `$claude-followup` — clear, unambiguous, lines up with `result`/`status`/`stop` verbs already in use.

**`$claude-status` for reusable-but-idle sessions**: Surface as new column "reuse" with values `yes` (status: `awaiting_followup`) / `no` (status: `completed`). If `awaiting_followup`, the table footer should show: *"To send a follow-up: `$claude-followup <jobId> \"<prompt>\"`"*.

**Recommendation**:

- New skill `claude-followup` with `SKILL.md` body that mirrors Plan 0001's `claude-delegate` shape.
- Dispatcher subcommand: `node claude-companion.mjs followup <jobId> -- "<prompt>"`.
- Args: same `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--allow-edit`, `--yes`, `--json` as `delegate`. *But*: most of these are inert for a follow-up because the underlying Claude session was already configured at `$claude-delegate` time. Recommend forwarding only `--permission-mode` (relevant per-turn) and `--allow-edit` (UX framing per-turn); document the rest as no-ops with a one-line warning. Maintainer decides in OQ-D below whether to keep them, warn, or refuse.

#### D2. Permission-handoff UX

**Claim**: Inline in the dispatcher stdout. No separate `$claude-permissions` skill. Failure mode if the user walks away: session sits in `waiting` indefinitely; no auto-deny; a Plan 0002 timeout *warns* (does not auto-act).

**Evidence**:

- `claude agents --json` reports `waiting` indefinitely on permission stalls (Plan 0001 driver behavior; reconciler maps `waiting → needs_input`).
- No `auto-deny-after-N-minutes` behavior was observed in Plan 0001's E2E, and `claude --help` documents no such flag.

**Recommendation**:

- When the dispatcher polls and sees `tempo/state` indicating a permission wait, it prints:
  ```
  Claude is asking for permission inside session <shortId>.
  Type your answer below; we will route it back into the session.
  (To abort, press Ctrl+C; the session keeps running.)
  >
  ```
- Read one line from `process.stdin`, write it + `\r` into the attached PTY, then continue waiting for `tempo: idle`.
- If `process.stdin` is non-TTY (Codex skill flow may exec under a non-TTY), refuse with a clear error: *"Permission required, but this dispatcher is non-interactive. Run `claude attach <shortId>` in your own terminal to approve manually."*
- Timeout: if `waiting` persists > 5 minutes with no new sidecar activity, the dispatcher emits a warning (not an error) and exits 0 with the job left in state `active` / turn-status `needs_input`. The next `$claude-status` will still show this; the user can resume by `claude attach <shortId>` manually.

#### D3. Privacy ack

**Claim**: One workspace-scoped ack is sufficient. Do not require re-ack on every `$claude-followup`. Do re-ack if the workspace's git head has materially changed since the last ack.

**Evidence**:

- Plan 0001's `JobRecord.workspace.gitDirtyHash` already captures workspace state. The ack record under `<companionHome>/acks/<sha256(workspaceRoot)[0:16]>.json` is keyed by workspace, not by job.

**Recommendation**:

- Keep Plan 0001's per-workspace ack.
- Extend the ack record with `lastAckedGitHead` (the commit SHA at ack time). On `$claude-followup`, compute the current head; if it differs *and* the working tree is dirty, emit a one-line warning before injecting the prompt: *"Workspace has new files since your last ack; your follow-up may send them to Anthropic via Claude Code. Continue? [y/N]"*. The user can pass `--yes` to skip this gate, same as `$claude-delegate`.
- Do **not** re-ack on `$claude-followup` by default — that would train users to spam `--yes` and defeat the ack.

---

### Block E — Reliability & failure modes

#### E1. PTY attach process crashes mid-prompt

**Claim**: The background session keeps running (per `~/.claude/daemon.log`: the daemon is independent of attach clients). The next attach will see whatever bytes the crashed process managed to push before death — possibly a partial prompt, possibly nothing. The most defensive design is to **watch the sidecar for the prompt having been processed** before considering the turn "fired".

**Evidence**:

- `~/.claude/daemon.log` shows `[supervisor] workers=0` / `[supervisor] idle 5s with no clients — exiting` — the supervisor is independent of attach clients and can come and go.
- `claude stop --help`: *"Stop a background session. Its conversation is kept; resume it later."* The conversation surviving process death is documented.

**Recommendation**:

- After typing the user's prompt, type `\r` (Enter, the actual "submit" key in Claude Code's TUI). Sentinels beyond Enter risk being interpreted as part of the prompt.
- Watch the sidecar for `tempo` to leave `idle` *and* `output.result` to update *and* a new `timeline.jsonl` line to appear. All three signals confirm the prompt landed and was processed.
- If only the first signal (tempo) trips but the second/third never do, mark the turn `failed` and surface a clear message: *"Prompt landed in session `<shortId>` but Claude never produced output. Inspect manually with `claude attach <shortId>` or `claude logs <shortId>`."*
- No `claude attach --recover` exists; do not invent one.

#### E2. Codex dispatcher exits between attach cycles

**Claim**: Background session keeps running. Next dispatcher invocation re-attaches; full history is on disk at `~/.claude/projects/.../<sessionId>.jsonl`. The sidecar at `~/.claude/jobs/<shortId>/state.json` survives until the supervisor garbage-collects the session.

**Evidence**: Plan 0001 § 5-report and E2E artifact. Confirmed re-listable in `agents --json` after Codex exit.

**Recommendation**: no additional work needed — this is already covered by the job store + reconciler.

**Residual uncertainty**: How long the sidecar persists after `claude stop` (whether `state.json` is deleted, archived, or left in place) is **unverified** in this pass. Plan 0002 should check this in T-doctor; the conservative assumption is "may be deleted at supervisor's discretion", so the reconciler must tolerate sidecar-absent.

#### E3. Quota and orphans

**Claim**: Plan 0002 strictly increases orphan-accumulation risk because (a) follow-up flows leave a session deliberately idle, and (b) `awaiting_followup` is a new terminal-from-user-perspective state that doesn't auto-stop. Add a `$claude-stop --idle` (or `--all-awaiting-followup`) flag.

**Evidence**:

- Plan 0001 § 5-report risks-remaining R4: "Orphaned background sessions consuming quota."
- Live evidence on this machine: `claude agents --json` returned 6 sessions, all `interactive`, several `idle` from days ago. They are persistent.

**Recommendation**:

- Plan 0002 extends `$claude-stop` with two new modes:
  - `$claude-stop --all-awaiting-followup` — stops every job in the current workspace with status `awaiting_followup`.
  - `$claude-stop --all-idle [--workspace=<root>]` — stops every Claude background session whose `shortId` corresponds to a tracked job in `awaiting_followup` or `orphaned`.
- TTL: `awaiting_followup` jobs auto-promote to `completed` (and the underlying session auto-stops) after a configurable idle duration. Recommended default: 1 hour. The exact TTL is OQ-A.
- The doctor adds a probe `idle-orphans` that counts how many `claude agents --json` entries are in `idle` for > 1 hour with no tracked job; warns if > 5.

---

### Block F — Driver interface evolution

#### F1. New driver methods

**Claim**: Plan 0002 should add **exactly two new methods** to the `Driver` interface: `attach()` and `tailSidecar()`. Do **not** add a general `send()` (it implies a non-PTY structured input that we don't have) and do **not** implement `watch()` as a full AsyncIterable yet.

**Recommended new shape**:

```ts
export interface AttachHandle {
  /** PTY-attached process handle. dispose() detaches with Ctrl+Z and returns. */
  dispose(): Promise<void>;
  /** Send a turn into the attached PTY. Returns when the sidecar reports tempo: idle. */
  sendTurn(prompt: string, opts?: SendTurnOpts): Promise<TurnResult>;
  /** Send a single line in response to a permission prompt. */
  sendPermissionAnswer(answer: string): Promise<void>;
}

export interface SendTurnOpts {
  /** soft timeout for the turn to complete; default 10 min */
  timeoutMs?: number;
  /** AbortSignal to interrupt the turn (writes Ctrl+C, not Ctrl+Z) */
  signal?: AbortSignal;
}

export interface TurnResult {
  /** Final assistant message from the sidecar's output.result */
  finalMessage: string;
  /** Touched files inferred from the transcript (best-effort) */
  touchedFiles: string[];
  /** Usage snapshot from the transcript */
  usageSnapshot?: unknown;
  /** Indexing into the per-job timeline.jsonl */
  timelineRange: { firstAt: string; lastAt: string };
}

export interface SidecarSnapshot {
  state: string;       // "done" | "working" | "waiting" | ...
  tempo: string;       // "idle" | "active" | ...
  inFlight: { tasks: number; queued: number; kinds: string[] };
  output?: { result: string };
  linkScanPath?: string;
  resumeSessionId?: string;
  cliVersion: string;
  // ... raw passthrough
  raw: unknown;
}

export interface Driver {
  // unchanged from Plan 0001:
  probe(): Promise<DriverCapabilities>;
  startSession(opts: StartSessionOpts): Promise<SessionHandle>;
  status(session: SessionHandle): Promise<SessionStatus>;
  stop(session: SessionHandle): Promise<void>;
  dispose(): Promise<void>;

  // unchanged surface, but Plan 0002 promotes from throw to a usable implementation:
  watch(target: SessionHandle | TurnHandle, opts?: WatchOpts): AsyncIterable<DriverEvent>;

  // NEW in Plan 0002:
  attach(session: SessionHandle, opts?: AttachOpts): Promise<AttachHandle>;
  tailSidecar(session: SessionHandle, opts?: TailSidecarOpts): AsyncIterable<SidecarSnapshot>;
}
```

**Why not `send()`**: `send` implies a non-PTY structured input. We don't have one (no `claude send <id> "<prompt>"` exists in 2.1.149). `attach().sendTurn()` is honest about the underlying mechanism: open a PTY, type, wait, detach.

**Why not `resume()`**: A `SessionHandle` plus the driver's existing `status()` already lets you re-attach in a new host process. Don't introduce a method that does what the existing handle already supports.

**Why `tailSidecar()` is its own method and not the body of `watch()`**: `watch()` is supposed to be a transport-agnostic AsyncIterable of `DriverEvent` (transcript-derived events). `tailSidecar()` is a *new* event source. We need both; conflating them invites a refactor that's bigger than Plan 0002's scope.

#### F2. Capabilities flip

**Claim**: Two capability flips in Plan 0002:

- `attach: false → true`
- `structuredStream: "transcript" → "sidecar+transcript"` (introduce a new value)

Plus one new capability: `sidecar: boolean` (the doctor probe verifies `~/.claude/jobs/` is readable and parseable).

**Recommended `DriverCapabilities` additions**:

```ts
export interface DriverCapabilities {
  // ...existing...
  attach: boolean;                                          // was: false
  structuredStream: 'transcript' | 'sidecar' | 'sidecar+transcript' | 'none';
  sidecar: boolean;                                         // NEW
  followup: boolean;                                        // NEW
  promptInjection: 'pty-attach' | 'start-only';             // NEW
  toolEvents: 'transcript' | 'sidecar' | 'none';
  permissions: 'human-attach' | 'pty-relay' | 'none';       // NEW value: pty-relay
}
```

#### F3. Watch vs. attach

**Claim**: Defer `watch()` past Plan 0002. Plan 0001's research already recommended `watch()` produce an `AsyncIterable<DriverEvent>`; that's still the right design, but landing it correctly requires the sidecar event model to settle. Plan 0002 should add `tailSidecar()` (a leaner `AsyncIterable<SidecarSnapshot>`) and leave `watch()` throwing.

**Recommendation**: keep `watch()` deferred. Add `tailSidecar()`. Compose them into a real `watch()` in a later plan.

---

### Block G — Test strategy

#### G1. Mock-Claude needs

**Claim**: The mock at `tools/mock-claude/` needs four additions:

1. **`claude attach <shortId>`** subcommand — opens an interactive readline that reads user-typed prompts and writes scripted fixture responses. Detach on `Ctrl+Z` (`\x1a` byte on stdin).
2. **`claude --bg` (no prompt)** — supported; creates a session in `idle` state.
3. **Sidecar emulation** — when started under `CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME=<dir>`, writes `<dir>/jobs/<shortId>/state.json` and `<dir>/jobs/<shortId>/timeline.jsonl` mirroring the real schema discovered in this report.
4. **Permission-prompt simulation** — a fixture flag that triggers a `waiting` state during an attach, requires the mock to read a permission answer from PTY stdin, and resumes to `working` afterward.

**Recommendation**:

- Add a new test lane `test:attach` distinct from `test:driver` so the PTY surface can be skipped on a runner where `node-pty` failed to build.
- All sidecar tests live in `test:driver` (no PTY needed; just fs writes).

#### G2. CI matrix considerations

**Claim**: CI matrix stays `ubuntu-latest + macos-latest × Node 20 + 22`. Add one new CI step: a "PTY smoke" test that spawns `node -e "require('node-pty').spawn('echo', ['ok'], {}).onData(d=>process.stdout.write(d))"` and asserts `ok\n` on stdout.

**Recommendation**:

- Add PTY smoke step before `npm test`.
- If PTY smoke fails, fail the workflow with a clear message ("native build of node-pty failed; check toolchain"); do not silently skip PTY tests in CI.
- Plan 0002 should not ship a *live* PTY test (one that actually exercises real Claude through a PTY) in CI; live testing remains opt-in for the maintainer.

#### G3. Live E2E expectations

**Claim**: Plan 0002's live E2E artifact should capture, end-to-end:

1. `$claude-delegate "<task>"` → session started, `shortId` printed (Plan 0001 baseline).
2. Wait for Plan 0001-style `awaiting_followup` (the new state).
3. `$claude-followup <jobId> "<follow-up task>"` → injected into the same session, results retrieved.
4. **Permission handoff**: `$claude-followup <jobId> "<task that requires permission>"`, dispatcher prompts the human, human answers `y`, session continues, result printed.
5. `$claude-stop <jobId>` → cleanup.
6. **Crash-recovery**: kill the dispatcher mid-`$claude-followup`, confirm `claude agents --json` still reports the session, then run `$claude-status` and `$claude-result` to recover.
7. Sidecar `state.json` + `timeline.jsonl` snapshots captured for each transition.

---

### Block H — Risks the team may have missed

(See risks-and-mitigations table in § 4.)

The most under-articulated risks in the Plan 0002 brief, in my view:

1. **Sidecar dependency.** The brief assumed Plan 0002 would need TUI parsing because no structured output channel was known. Discovering the sidecar removes that risk *but introduces a different one*: now we depend on an undocumented surface. Mitigated by feature-probe + graceful degradation, but the dependency exists.
2. **Concurrent attach.** Plan 0001 explicitly didn't exercise `claude attach`; Plan 0002 must. Multiple Codex windows in the same workspace, or two `$claude-followup` invocations racing, are foreseeable. Mitigated by per-`shortId` file locks under `<companionHome>/locks/`.
3. **`Ctrl+Z` portability.** macOS Terminal.app, iTerm2, and most Linux terminals all map `Ctrl+Z` to byte `0x1a`. **Tmux and screen** intercept `Ctrl+Z` by default unless the user has rebound `C-b` / `C-a`. If a user runs Codex inside tmux without a custom prefix, our `0x1a` write will still detach the Claude session (because we're writing to the PTY's child end, not to the user's outer tmux). But test this in T-doctor anyway.
4. **macOS Sequoia TouchID / SIP edge cases.** `claude attach` under a TouchID-protected directory (or under macOS's hardened-runtime sandbox) is **unverified**. Defer the test to T-doctor; not a Plan 0002 blocker but a risk to record.
5. **Daemon respawn behavior.** `~/.claude/daemon.log` shows the supervisor exits after 5s idle and respawns on next bg activity. If our dispatcher does `claude agents --json` to find the `shortId`, then `claude attach <shortId>` immediately, and the supervisor was mid-respawn, the attach may transiently fail. Mitigation: retry attach once with 1s backoff on transient failure.
6. **Codex 0.135.0 YAML strictness on the new `claude-followup` SKILL.md.** Plan 0001's Stage 4 follow-up caught the unquoted `: ` parser issue. The new skill's frontmatter must pass the same `strictParseFrontmatter` test added in `packages/plugin-codex/test/skills-manifest.test.mjs`.
7. **`claude stop` warns `couldn't confirm <id> was stopped`** when the supervisor is restarting (observed live in this pass; orphan `0923955d` was *actually* stopped, but `claude stop` printed an inconclusive message). Plan 0002's stop wrapper must tolerate this exact stderr message and re-verify by re-polling `claude agents --json` for the session's absence rather than relying on `claude stop`'s exit code alone.

---

## 3. Recommended Plan 0002 implementation sequence (suggested, non-binding)

The maintainer drafts `1-plan.md`; this is a recommendation, not a directive.

1. Doctor: extend with `pty-build`, `claude-attach-help`, `claude-bg-no-prompt`, `sidecar-jobs-dir` probes.
2. Driver: add `tailSidecar()` against a fixture, no PTY needed.
3. Mock-Claude: add `attach` subcommand + sidecar emulation.
4. Driver: add `attach()` returning `AttachHandle`. Smoke against mock with PTY.
5. Runtime: schema bump `JobRecord` to v2, add `turns[]`, lazy-migrate v1.
6. Reconciler: rewrite `STATUS_MAP` to be context-aware (`idle → awaiting_followup | completed` based on job mode).
7. Dispatcher: new `followup` subcommand; new `claude-followup` SKILL.md.
8. Permission handoff loop in `followup` and `delegate` (when initial turn stalls).
9. `$claude-stop --all-awaiting-followup` / `--all-idle`.
10. Live E2E artifact.

Steps 1–4 are the load-bearing ones; they can ship without 5–9 if Plan 0002 needs to split into 0002 + 0002.5.

**Plan 0002 / 0002.5 split recommendation**: If the maintainer wants a smaller plan, split as:

- **Plan 0002 proper**: steps 1–4 + a thin `$claude-followup` that creates a *new* session per call (degrade to Plan 0001 reuse semantics inside the new skill). This proves the PTY-attach lane is correct without the multi-turn reuse complexity.
- **Plan 0002.5**: steps 5–9. Adds true multi-turn reuse and the `awaiting_followup` state machine.

This split is recommended only if the open questions below (especially OQ-A and OQ-C) prove contentious; otherwise ship them together.

---

## 4. Risks and mitigations table

Likelihood × Impact (L/M/H × L/M/H). Sorted by L×I.

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Sidecar schema (`~/.claude/jobs/<shortId>/state.json`) drift in a 2.1.x release | M | H | Feature-probe; graceful degrade to `claude logs` fallback; never make sidecar a hard `probe()` requirement |
| R2 | `node-pty` native build failure on user machine | M | M | Recommend prebuilt fork (`@homebridge/node-pty-prebuilt-multiarch`) in doctor failure message; ship a `pty-build` probe |
| R3 | Concurrent `claude attach` to same `shortId` corrupts session | L | H | Per-`shortId` file lock; refuse `$claude-followup` if lock held |
| R4 | `Ctrl+Z` detach intercepted by user's outer tmux / screen | L | M | Test in T-doctor; `IPty.write(0x1a)` goes to slave fd, not user's tty, so should be safe; document workaround |
| R5 | Permission prompt missed → session stalls in `waiting` indefinitely | M | M | Sidecar + `agents --json` polls; warn-but-don't-act timeout; surface `claude attach <shortId>` instructions |
| R6 | Daemon respawn races attach (5s idle exit) | M | L | Retry once with 1s backoff on transient attach failure |
| R7 | Orphan accumulation from `awaiting_followup` jobs | H | M | TTL auto-`completed`+stop (default 1h); `$claude-stop --all-awaiting-followup` |
| R8 | Schema-v2 migration breaks existing Plan 0001 records | L | H | Lazy migration on read; explicit `schemaVersion === 1` check; cover with unit test |
| R9 | `claude attach` returns non-zero on missing `shortId` in an unexpected way | M | M | Handle in T-doctor; surface as `DriverError` with original stderr captured |
| R10 | Privacy ack staleness when workspace grows between turns | M | M | New-file detection; re-prompt with `--yes` bypass; explicit copy in skill body |
| R11 | macOS Sequoia hardened-runtime blocks `claude attach` under PTY | L | H | T-doctor includes a no-mutation PTY smoke; document the failure if it materializes |
| R12 | Codex 0.135.0 YAML strictness rejects new `claude-followup` SKILL.md | M | L | Strict-frontmatter test already exists from Plan 0001 Stage 4 — extend to new skill |
| R13 | TUI prompt rendering changes in 2.1.x → our PTY read-drain corrupts (because we never parse it, just discard) | L | L | None needed — we don't parse the byte stream |
| R14 | Multiple `$claude-followup` invocations against same session interleave answers | L | H | Per-`shortId` lock (same as R3); document "one open follow-up per job at a time" |
| R15 | Sidecar `state.json` gone after `claude stop` → reconciler can't find `linkScanPath` | M | L | Reconciler already has logs fallback; no change needed |
| R16 | `claude stop` "couldn't confirm" stderr while session is actually stopped | M | L | Re-verify via `agents --json` poll; treat absence as confirmation |

---

## 5. Open questions the maintainer must resolve before drafting `1-plan.md`

### OQ-A: Auto-`completed` TTL for `awaiting_followup`

Recommended default: 1 hour. Maintainer must pick.

- **30 min** — aggressive, fewer orphans, may annoy users who walk away briefly
- **1 hour** — recommended
- **24 hours** — generous, more orphans, requires `--stop-all-awaiting-followup` UX
- **No TTL** — user must explicitly stop or follow-up; matches Plan 0001 exactly; orphan accumulation maximally risky

### OQ-B: Sidecar reading — required or best-effort?

Recommended: **best-effort**. Doctor probe `sidecar-jobs-dir` is informational (warn if missing, never fail). If sidecar is unavailable, the driver degrades to `claude logs` fallback (Plan 0001's path). Pro: robust against schema drift. Con: a future Claude release that removes the sidecar would silently degrade UX without breaking the build.

Alternative: **required**. Probe fails if sidecar dir is unreadable. Pro: catches Anthropic removing it loudly. Con: locks Plan 0002 to a specific Claude Code minor.

### OQ-C: Plan 0002 vs. Plan 0002.5 split

Should `$claude-followup` v1 actually inject into the same session (true multi-turn) or should v1 of `$claude-followup` create a *new* session per call (just renames the skill, keeps Plan 0001 reuse semantics)?

- **Option A**: Ship true multi-turn in 0002. PTY-attach lane + sidecar + schema-v2 + reconciler context-aware + UX timeouts. Larger plan; ~10 tasks.
- **Option B**: Split as recommended above. 0002 lands PTY-attach + sidecar + doctor; `$claude-followup` is a thin wrapper that creates a fresh session per call. 0002.5 lands multi-turn reuse, schema-v2, awaiting_followup state.

Recommended: Option A (single Plan 0002) unless schedule pressure makes Option B clearly preferable.

### OQ-D: `$claude-followup` arg parity

Should the new skill accept `--model` / `--effort` / `--add-dir` / `--mcp-config` flags? They are no-ops at follow-up time (the underlying session is already configured), but accepting them keeps `delegate` and `followup` symmetric. Options:

- **Accept and warn**: flag passed → print warning, continue
- **Accept and refuse**: flag passed → exit 1 with explanation
- **Reject at parse-time**: flag not in `$claude-followup`'s arg schema

Recommended: **Accept and warn**, except for `--permission-mode` (forward) and `--allow-edit` (forward; affects per-turn framing).

### OQ-E: Re-ack policy on workspace growth

When does the privacy ack need to be re-prompted on `$claude-followup`? Options:

- **Never** — once per workspace, forever (Plan 0001 status quo)
- **Re-ack on new files in workspace since last ack** — recommended default
- **Re-ack on every follow-up** — safest, most annoying
- **Re-ack on N-day expiry** — TTL-based

Recommended: re-ack on new files (the `gitDirtyHash` already partially supports this; extend to also fingerprint new untracked-file paths).

### OQ-F: `attach()` driver method signature

Recommended in this report:

```ts
attach(session: SessionHandle, opts?: AttachOpts): Promise<AttachHandle>;
```

with `AttachHandle.sendTurn(prompt) → TurnResult`. Maintainer should sanity-check this shape and decide whether `sendTurn` should be on `Driver` directly (less indirection but worse for testability) vs. on `AttachHandle` (current rec, better for testability).

### OQ-G: Doctor probes to add

Recommended additions:

- `pty-build` — `require('node-pty').spawn('echo', ['ok'], {})` works
- `claude-attach-help` — `claude attach --help` is parseable
- `claude-bg-no-prompt` — `claude --bg` with no prompt is accepted (idle-session creation works)
- `sidecar-jobs-dir` — `~/.claude/jobs/` exists and is readable
- `idle-orphans` — count of long-idle orphans in `claude agents --json`

Maintainer can drop any of these. The first three are recommended-required; the last two are recommended-informational.

### OQ-H: Plan 0002 minimum baseline Claude Code version

Plan 0001 used a feature-probe baseline rather than a semver pin. Plan 0002 should do the same, but the required-probe set grows:

- Plan 0001's required probes (all of them)
- `claude attach --help` returns usage with the literal token "Detach with Ctrl+Z"
- `~/.claude/jobs/` exists (best-effort per OQ-B)

The maintainer might prefer a concrete semver floor (`>= 2.1.149`) for documentation/marketing clarity. Recommend: feature-probe primary, with a documented "known-good: 2.1.149" claim.

---

## 6. What I'd do differently if building from scratch today

If a different team were building this from scratch on 2026-05-31, knowing what this research pass uncovered, I would:

1. **Start with the sidecar, not the TUI.** The whole Plan 0001 mental model — "Claude Code's TUI is the protocol" — was already corrected in Plan 0001's research. The Plan 0002 brief still carries a residue of "we need PTY because there's no structured channel". The sidecar at `~/.claude/jobs/<shortId>/` is exactly that structured channel for *output*; PTY is needed only for *input*. The plan's name should arguably be "sidecar-driven multi-turn" with PTY input as a sub-component, not "PTY-attach for mid-session injection".

2. **Treat `claude attach` as a write-only channel, not a session driver.** Today's plan and even my own recommended driver method treat `attach()` as something that returns an `AttachHandle` you can repeatedly call `sendTurn()` on. A simpler design: each `sendTurn()` opens a fresh PTY attach, types, detaches. No long-lived `AttachHandle`. This makes the failure model dramatically simpler (no half-attached zombies, no lock-management across turns) and trades a few hundred ms of attach overhead per turn for a much smaller code surface. Plan 0002 could ship this minimal shape first and only add a persistent `AttachHandle` if the per-turn overhead proves painful.

3. **Skip the `awaiting_followup` job-state.** If `$claude-followup` is the *only* way to re-engage a session, and the user is the one who decides when, then `completed` is fine — `$claude-followup` simply transitions a `completed` job back to `active` with a new turn. The state machine flattens. The price: `$claude-status` doesn't visually distinguish "reusable" from "done"; mitigated by surfacing `claude agents --json` `idle` vs. `stopped` as the reusability hint. This is a real tradeoff; my main report recommends `awaiting_followup` for UX clarity, but a smaller plan could skip it.

4. **Move the privacy ack from per-workspace to per-session.** Plan 0001's per-workspace ack predates multi-turn. Once a session is reusable, the ack should arguably live on the session, not the workspace: each new `claude --bg` triggers an ack; subsequent `$claude-followup` on that session does not. This matches the user's mental model better ("I started a Claude session in this directory; everything that session sees is what I acked"). But this is a backwards-incompatible change to Plan 0001's ack store layout, and the maintainer should decide whether the migration cost is worth it.

5. **Sketch a `peerProtocol: 1` client as a research spike, then explicitly reject it.** `~/.claude/daemon/roster.json` mentions `peerProtocol: 1`, and `~/.claude/daemon/dispatch/` is a directory shape that suggests Unix-socket IPC. A future plan could speak the daemon's protocol directly and bypass `claude attach`. But it would be reverse-engineering an unstable internal API; this is what *not* to do, ever. Mention it in the report so the team has the right answer ready when someone proposes it.

6. **Stop calling it "PTY attach".** Call it "follow-up injection" or "interactive turn injection". The PTY is an implementation detail of the input transport. Naming the *plan* after the implementation locks the mental model to a specific tactic; naming it after the user-visible capability ("continue an existing Claude conversation from inside Codex") leaves room for a future plan to switch transports without renaming the plan series.

---

## 7. Citations and primary sources

Where evidence is from this pass's own observations on the maintainer's machine, the citation is "live, this report" and the observation is reproducible by running the same command in the same environment.

| Source | Type | Used in |
|---|---|---|
| `claude --help` output (2.1.149) | live, this report | A1, A3, A4, B (rejection of TUI parsing) |
| `claude attach --help` output (2.1.149) | live, this report | A1, A2, A3, A4 |
| `claude agents --help` output (2.1.149) | live, this report | A2, F2 |
| `claude logs --help` output (2.1.149) | live, this report | A1, B3 |
| `claude stop --help` output (2.1.149) | live, this report | A4 |
| `claude --bg` startup banner (no-prompt invocation; 2.1.149) | live, this report | A1, exec summary finding 3 |
| `claude agents --json` output (live, 2.1.149, this report) | live, this report | A2, E3, F2 |
| `~/.claude/jobs/<shortId>/state.json` schema (2.1.149) | live, this report | A2, A3, F1 |
| `~/.claude/jobs/<shortId>/timeline.jsonl` shape (2.1.149) | live, this report | A2, F1 |
| `~/.claude/sessions/<pid>.json` schema (2.1.149) | live, this report | A2, summary |
| `~/.claude/daemon/roster.json` shape (2.1.149) | live, this report | A2, E1, "what I'd do differently" |
| `~/.claude/daemon.log` (2.1.149) | live, this report | A1, E1, E2, R6 |
| `npm view node-pty` (registry, 2026-05-31) | live, this report | B1, B2 |
| `npm view @homebridge/node-pty-prebuilt-multiarch` | live, this report | B2 |
| `npm view @lydell/node-pty` | live, this report | B2 |
| `npm view @xterm/headless` | live, this report | B3 |
| Plan 0001 `e2e-live-20260530.txt` artifact | repository | A1, A4, E2, E3, H |
| Plan 0001 `1-plan.md` § 3, § 6 | repository | C1, C2, D3, F1 |
| Plan 0001 `5-report.md` | repository | E3, R7, R12 |
| `packages/driver-claude-code/src/index.ts` | repository | F1 (existing `Driver` shape) |
| `packages/driver-claude-code/src/agents-json.ts` STATUS_MAP | repository | A3, C2 |
| `packages/driver-claude-code/src/background-session.ts` | repository | F1 |
| `packages/runtime/src/driver.ts` | repository | F1, F2 |
| `packages/runtime/src/events.ts` | repository | F1 (DriverEvent shape) |
| `packages/runtime/src/reconciler.ts` STATUS_MAP | repository | C2 |
| `packages/runtime/src/types.ts` JobRecord | repository | C1 |

Marked `unverified` claims:

- Exact behavior of `claude attach` on a non-existent `<shortId>` (exit code, stderr)
- Whether `claude attach` works without a real PTY (high-confidence "no", but not live-probed)
- Whether `timeline.jsonl` carries mid-turn records on longer runs
- Outstanding `node-pty` GitHub issue count (not probed in this pass)
- Exact behavior of `Ctrl+Z` byte in `IPty.write` under tmux / screen
- Behavior of `claude attach` under macOS Sequoia hardened-runtime / TouchID
- Whether `state.json` survives `claude stop` (lifetime of sidecar files post-stop)
- Whether `--brief`'s `SendUserMessage` tool changes any structured surface

These are flagged in the relevant residual-uncertainty sections so the maintainer (or a Plan 0002 implementation pass) knows to validate them with a non-destructive probe in T-doctor.

---

## 8. One-paragraph closing

Plan 0002 is buildable, smaller-than-the-brief-implies, and benefits from a 2.1.149 surface that didn't exist publicly when Plan 0001 was drafted: the per-job sidecar at `~/.claude/jobs/<shortId>/{state.json,timeline.jsonl}` lets the driver read structured turn-level state without parsing the TUI byte stream, leaving `claude attach <id>` to be a write-only PTY-input transport with `Ctrl+Z` detach. `node-pty@1.1.0` is healthy enough to be a required dependency. The biggest residual unknowns are concurrent-attach semantics and the sidecar's stability across Claude Code minors; both are mitigable with feature-probes and per-`shortId` file locks. The maintainer's main decision before drafting `1-plan.md` is whether to ship Plan 0002 as a single plan (recommended) or split off the multi-turn state-machine work into Plan 0002.5; either way, the PTY-attach + sidecar pairing is the load-bearing architectural choice and is well-supported by the evidence.
