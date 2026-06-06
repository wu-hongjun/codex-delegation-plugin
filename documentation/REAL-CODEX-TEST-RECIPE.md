# Real-Codex test recipe

**Audience**: maintainer (or anyone) installing the plugin into a fresh / real Codex CLI to validate the 12 skills end-to-end. Self-contained — no other docs required.
**Tested commit**: `main` at or after [`0386b54`](https://github.com/wu-hongjun/cc-plugin-codex/commit/0386b54) (Plan 0011 close — 12 skills, 1729 tests green).
**Plugin version on disk**: `0.2.0` (the version field hasn't been bumped since Plan 0006; the code includes everything from Plans 0007-0011).

## 1. Prerequisites on the test machine

| Dep | Minimum | How to check |
|---|---|---|
| Codex CLI | `0.136.0` | `codex --version` |
| Claude Code CLI | `2.1.153`+ (recommend `2.1.165`) | `claude --version` |
| Claude Code auth | logged in | `claude auth status` |
| Node.js | `20` or `22` (matches CI) | `node -v` |
| Git | any recent | `git --version` |

If `claude` isn't installed: `curl -fsSL https://claude.ai/install.sh \| bash` (puts it at `~/.local/bin/claude`; ensure that's on PATH ahead of any brew install).

The plugin doesn't require any other ambient deps — its runtime is bundled in `marketplace/plugins/claude-companion/node_modules/`.

## 2. Install (4 commands)

```bash
# 1. Clone the repo somewhere durable
git clone https://github.com/wu-hongjun/cc-plugin-codex.git
cd cc-plugin-codex

# 2. Register the committed local marketplace
codex plugin marketplace add "$(pwd)/marketplace"

# 3. Install the plugin from that marketplace
codex plugin add "claude-companion@cc-plugin-codex-local"

# 4. Confirm it's installed + enabled
codex plugin list
```

You should see one row with id `claude-companion`, source `cc-plugin-codex-local`, version `0.2.0`, status `installed, enabled`.

If `codex plugin add` fails on a fresh box, re-run `codex plugin marketplace add "$(pwd)/marketplace"` first — Codex sometimes caches a stale marketplace listing.

## 3. First-time skill discovery sanity check

In a Codex session inside any workspace, type `$` and the autocomplete should show all 12 skill names:

```
$claude-setup
$claude-delegate
$claude-status
$claude-result
$claude-stop
$claude-followup
$claude-review
$claude-adversarial-review
$claude-workflow
$claude-goal
$claude-fork
$claude-batch
```

If only 7 or 9 or 10 show, the install hit a stale cache — `codex plugin remove claude-companion`, then re-run step 3 above.

## 4. Golden-path test sequence

Run these in order in a Codex chat. Each builds on the previous one. **First time you delegate, you'll see a privacy disclosure prompt** — answer "yes" (or pass `--yes` to skip future prompts).

**Terminal states for background jobs**: `complete`, `idle`, `awaiting_followup`, `failed`, `stopped`, `orphaned`. The most common terminal state for bg-flow skills (delegate / workflow / goal / fork / batch) is `awaiting_followup` — that means the model finished its turn and is waiting for either a followup or a stop. Poll until you hit one of these states (do NOT poll forever expecting `complete` or `idle` alone).

### 4.1 `$claude-setup` — environment probe

```
$claude-setup
```

Expected: aggregate status `ok` (or `warn` with a clear caveat). Look for:
- `claude binary: 2.1.165` (or `2.1.153`)
- `claude auth: ok`
- `bg-exec-supported: ok` (was `warn` pre-2.1.153)
- `workflows-supported: ok`
- `opus-4-8-supported: ok` (was the latest gate to flip)
- `agents-json: ok`

If any probe is `fail`, that's the real blocker; everything downstream depends on it.

### 4.2 `$claude-delegate` — basic background session

```
$claude-delegate "Inspect this repo and summarize TODOs. Do not edit files."
```

Expected output ends with `Job ID: job_<id>`. **First run will show a privacy disclosure** — answer yes, then re-run. Subsequent delegations skip the prompt for this workspace.

### 4.3 `$claude-status` — check the job's progress

```
$claude-status job_<id-from-above>
```

Expected: a status block with `state: running` (or `complete`), session info, and current activity.

### 4.4 `$claude-result` — fetch final output

Wait until status shows `complete`, `idle`, or `awaiting_followup` (see the terminal-state note above — `awaiting_followup` is the most common final state). Then:

```
$claude-result job_<id>
```

Expected: the model's final message text. If empty / partial, the model is still mid-stream — wait and re-run.

### 4.5 `$claude-followup` — send another instruction mid-session

```
$claude-followup job_<id> "Also list any files larger than 100 lines."
```

Expected: confirmation that the followup was queued. `$claude-status` will show activity again. `$claude-result` will eventually include the new turn.

### 4.6 `$claude-review` — same-session review of a completed job

**Important**: `$claude-review` takes a `<jobId-or-prefix>` of an existing background job (from delegate / workflow / goal / fork / batch), NOT a freeform prompt. It sends a review prompt INTO that job's existing Claude Code session and reviews the most recent non-review turn. Use the delegate job from steps 4.2-4.5:

```
$claude-review job_<id-from-4.2>
```

Expected: a same-session review of the delegate job's output. Status becomes `awaiting_followup` again once the review turn completes. Re-read with `$claude-result <jobId>`.

### 4.7 `$claude-adversarial-review` — fresh-session second-opinion pass

Same input shape as `$claude-review` — takes a `<jobId-or-prefix>`. Spawns a FRESH Claude Code session that reads the original job's transcript and reviews it independently. Heavier-weight model can be selected with `--model opus`.

```
$claude-adversarial-review job_<id-from-4.2>
```

Expected: a new job ID (the fresh adversarial-review session). Poll its status; `$claude-result` returns the independent verdict.

### 4.8 `$claude-stop` — terminate the delegate session

```
$claude-stop job_<id-from-4.2>
```

Expected: confirmation the session was stopped.

### 4.9 `$claude-workflow` — dynamic multi-agent workflow

```
$claude-workflow "Survey the test suite organization across packages/plugin-codex/test/ and recommend reorganization."
```

Expected: returns a Job ID like delegate. The runtime triggers ultracode planning + parallel subagents. **This one shows the biggest Claude Code-over-Codex advantage** — fan-out across many subagents.

Verify via `$claude-status <job-id>` that you see workflow-style phase tracking, then `$claude-result <job-id>` once complete.

### 4.10 `$claude-goal` — set a stop-condition

```
$claude-goal "Keep iterating until all TODO comments in scripts/ are converted to GitHub issues. Do not edit other files."
```

Expected: Job ID returned. The runtime injects a `/goal` slash command — the session keeps working until the goal is met (Stop hook fires when met) or the user stops it. `$claude-status` shows `goal_status` records mid-run.

### 4.11 `$claude-fork` — spawn a forked subagent

```
$claude-fork "Read packages/plugin-codex/scripts/claude-companion.mjs L1-L100 and explain the dispatcher architecture in 5 bullet points."
```

Expected: Job ID returned. A subagent runs to completion (30k tokens baseline for a trivial directive — designed behavior). `$claude-result <job-id>` returns the subagent's final output.

### 4.12 `$claude-batch` — parallel-work orchestration

```
$claude-batch "Add a JSDoc one-liner comment above every exported function in packages/plugin-codex/scripts/claude-companion.mjs that doesn't already have one. Do not change function bodies."
```

Expected: Job ID returned. The runtime injects the `# Batch: Parallel Work Orchestration` system prompt — the session goes into plan mode → decomposes → parallel execution. This is the heaviest skill; it can run for many minutes. Track via `$claude-status`. If you want to abort: `$claude-stop`.

## 5. Edge cases worth probing

Once the golden path works, try these to surface real issues:

1. **`--allow-edit` rejection**: try `$claude-fork --allow-edit "anything"` — expected to be rejected with exit 2 ("not applicable to this subcommand"). Same for `workflow`, `goal`, `batch`, `review`, `adversarial-review`.
2. **Multiple parallel delegations**: run `$claude-delegate "..."` three times rapidly. Verify each gets a distinct Job ID and `$claude-status --all` lists all three.
3. **Bulk stop** — `$claude-stop --all-awaiting-followup` stops every `awaiting_followup` job in this workspace. Add `--all` for cross-workspace bulk-stop: `$claude-stop --all-awaiting-followup --all`. Note: a bare `$claude-stop --all` (without `--all-awaiting-followup`) is intentionally rejected — the dispatcher requires either a `<jobId>` or the explicit bulk-stop flag, to prevent accidentally killing every session.
4. **Workspace isolation**: run delegations from two different workspaces. `$claude-status` in workspace A should NOT show workspace B's jobs unless you pass `--all`.
5. **`$claude-result --json`**: machine-readable JSON output. Should be valid parseable JSON across all background-flow skills.
6. **Non-TTY rejection**: pipe input into a skill (`echo "test" \| $claude-delegate`) — should be rejected cleanly, not silently misbehave.
7. **First-run on a fresh workspace**: delete `~/.codex/data/codex-openai-codex/sessions/` to simulate a fresh first run, then verify the privacy disclosure fires properly.

## 6. Known caveats / not-bugs

- **Plugin version reporting is inconsistent** — `codex plugin list` shows `0.2.0` (the value in `.codex-plugin/plugin.json`); dispatcher / package metadata reports `0.0.0` (the workspace `package.json` is intentionally pinned to `0.0.0` per `documentation/RELEASING.md` § "Version Bump"). The `marketplace --check` script enforces byte-identity of the committed marketplace tree, not the version string. Plan 0012 candidate: surface `0.2.0` consistently across both report paths.
- **`$claude-tasks` is intentionally not shipped** — Plan 0011 probed it (verdict B); `/tasks` opens a TUI dialog that blocks on keyboard input. Deferred to a future plan with PTY-injection fallback design.
- **Fork token cost is high** (~30k tokens baseline for a trivial directive). This is `/fork`'s designed cost — it spawns a full subagent with its own context.
- **Batch sessions can run for many minutes**. The `# Batch: Parallel Work Orchestration` system prompt drives multi-phase work. Stop early with `$claude-stop` if it goes off-rails.
- **`MessageDisplay` hooks don't affect `$claude-result`** — by design, `$claude-result` reads canonical JSONL storage, not the display layer.
- **`--fallback-model` silent fallback** — if `--model opus` isn't installed and Claude Code's `--fallback-model` is configured, the review proceeds on the fallback model without warning in skill output. Note in your test report which model actually ran (visible via `$claude-status --json`).

## 7. How to report findings back

For each skill you test, capture:

1. **Skill name** (e.g. `$claude-fork`)
2. **Status**: `pass` / `partial` / `fail`
3. **What you ran** (exact command + args)
4. **What happened** (output excerpt; for failures, the full error)
5. **Environment**: `claude --version`, `codex --version`, OS

Group failures by severity:
- **Blocker**: skill doesn't work at all on a fresh install
- **High**: skill works but exhibits unexpected behavior (wrong output, wrong job state, etc.)
- **Medium**: rough UX (confusing error message, unclear progress, etc.)
- **Low**: cosmetic / docs gaps

A simple format works: paste a markdown table into the next conversation, or write to `documentation/testing/findings-YYYYMMDD.md` if you want a persistent record. Anything that hits Blocker/High level becomes a Plan 0012+ candidate; Medium/Low can roll into a polish plan.

## 8. After testing

Two paths depending on results:

- **All green** → cut `v0.3.0`: bump `packages/plugin-codex/.codex-plugin/plugin.json` version field, follow `documentation/RELEASING.md` Plan 0006 T10 procedure, tag + GitHub release. The plugin will then have a stable tagged version for any future installs that want to pin.
- **Issues surface** → fix-and-iterate on `main`, re-test, then cut `v0.3.0` when stable. The committed marketplace tree updates automatically as part of the fix cycle (`node tools/package-marketplace.mjs --write` resyncs).
