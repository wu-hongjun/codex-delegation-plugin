# Plan 0024 — Installed Heavy Test Lane E: Adversarial Agent-Friction Hunt

**Date:** 2026-06-15
**Dispatcher under test (installed):** `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5/scripts/cc.mjs`
**Plugin version:** 0.3.5  ·  **claude:** 2.1.177 (above all version floors)  ·  **node:** v25.8.2
**Companion home:** `/Users/hongjunwu/.codex/cc-plugin-codex` (jobs: `…/jobs`)
**Invocation form:** `node <cc.mjs> <args>` (the agent-facing surface)

Scope: awkward agent-facing cases — prompts starting with `--` after the separator,
missing `--` separator, repeated value flags, `--allow-edit` rejection wording on
workflow/review, review gates with invalid values, `status --job` compact shape,
result/status ambiguity with prefixes, and `stop` cleanup.

All spawned jobs were tiny and stopped (see [Cleanup](#cleanup--safety)). No commit made.

---

## TL;DR — prioritized frictions

| # | Pri | Friction | Exit | Agent impact |
|---|-----|----------|------|--------------|
| 1 | **P1** | No discoverable single-job status; `status`↔`result` error **loop** | 2 / 1 | Agent ping-pongs, ends up dumping the 387-row list |
| 2 | **P1** | Unbounded ambiguous-prefix candidate dump (399 ids / 9.3 KB on one line) | 1 | Context bloat / unreadable error |
| 3 | **P1** | Flag-like prompt tokens without `--` are **silently swallowed** | 0/2 | Word dropped + mode toggled with no warning |
| 4 | **P2** | `--fail-on=` (empty) **silently disables** the review gate | 0 | CI false-pass when `--fail-on=$VAR` and `$VAR` empty |
| 5 | **P2** | Repeated value flags silently last-wins (`--model a --model b`→`b`) | — | Accidental dup silently changes behavior |
| 6 | **P2** | `status --job` ignores `--compact` (always compact) | 0 | Advertised flag is a silent no-op |
| 7 | **P3** | `--permission-mode`/scalar validation happens **after** ack+probe | 2 | Wasted probe; ack recorded before the reject |
| 8 | **P3** | `--allow-edit` rejection names skills (`$claude-workflow`), not the CLI command | 2 | Cross-surface wording mismatch |
| 9 | **P3** | Parser-level errors omit the `[command]` prefix | 2 | Inconsistent log scraping |
| 10 | **P3** | `stop` on dead/orphaned job says "stopped"; re-stop appends dup event | 0 | Mildly misleading; benign |
| 11 | obs | Fresh delegate jobs reconcile straight to `orphaned` (sandbox/timing) | — | Lifecycle unexercisable here; scary label |
| 12 | obs | Shared job store has **no lane scoping**; `--all*` is cross-lane | — | Concurrent agents stop each other's jobs |

---

## P1 — high impact

### 1. Single-job status is undiscoverable; `status`↔`result` form an error loop
The actual single-job status command is `cc status --job <id>`, but **no error message
ever names it**. An agent that naively asks for one job's status is bounced in a circle:

```
$ cc status job_mqfh6h4j_88aeb857
EXIT 2  [status] Error: cc status does not take a job id (got "job_…").
        For one job use: cc result job_…  (or cc status --all to list every workspace).

$ cc result job_mqfgx3fg_a5b89332        # result then bounces back, for any non-terminal job
EXIT 1  [result] Error: Job job_… is not complete yet (status: running). Run: cc status

$ cc status                               # …which lists ALL 387 jobs in the workspace
```

`status <id>` → "use `cc result`"; `result <id>` (non-terminal) → "Run: `cc status`" (the
full list, here 387 rows). The one correct tool (`cc status --job <id>`) is mentioned by
neither. This is the headline agent friction.

**Suggested patch**
- `cc.mjs` ~L951 (status positional rejection): recommend `cc status --job <id>` first, e.g.
  `For one job use: cc status --job <id>  (or cc result <id> for its final output).`
- `cc.mjs` L1107 (result "not complete yet"): change `Run: cc status` →
  `Run: cc status --job <jobId>`.

### 2. Unbounded ambiguous-prefix candidate dump
`resolveJobIdPrefix` returns every match and the formatter joins them all:

```
$ cc result job_                  # broad prefix
EXIT 1  [result] Error: Ambiguous job ID prefix "job_". Matches: job_…, job_…, <397 more> …
        →  399 candidates, 9255 bytes, one line.   (same for `status --job job_`)
```

The full list is also embedded verbatim in the JSON `error.message`. With a shared store
that accumulates hundreds of jobs (387 here), any short or typo'd prefix produces multi-KB
output that bloats an agent's context window. A controlled prefix (`job_mq4omij`, 10 matches)
is fine — the problem is the absence of a cap.

**Suggested patch:** cap the candidate list at ~8–10 (sorted newest-first) and append
`… (+N more; narrow the prefix or pass the full jobId)`. Apply at every call site
(`status`/`result`/`stop`/`followup`/`review`/`adversarial-review`) — factor a shared
`formatAmbiguous(prefix, candidates)` helper.

### 3. Flag-like prompt tokens without `--` are silently swallowed
For prompt-taking commands the `--` separator is optional, which is a trap. Verified via the
installed parser:

```
delegate write tests for foo            → prompt "write tests for foo"            (OK)
delegate refactor --json the code       → flags.json=true, prompt "refactor the code"  (!!)
delegate fix the --verbose logging      → flags.verbose=true, prompt "fix the logging"  (!!)
delegate "--fix the bug"                → THROW: Unknown flag: --fix the bug
delegate add --foo handling             → THROW: Unknown flag: --foo
```

A prompt that happens to contain a known boolean flag token (`--json`, `--all`, `--yes`,
`--compact`, `--verbose`, …) silently **drops that word from the prompt and toggles the
mode** — no warning. Unknown `--x` tokens throw `Unknown flag: --x` with no hint that the
real problem is a missing separator. The happy path works (`cc delegate -- --upgrade the deps`
stores the prompt verbatim — see [positives](#what-works-well)), but only if the agent
remembers `--`.

**Suggested patch:** for prompt-taking commands (delegate/workflow/goal/fork/batch/
deep-research/followup), when a `--flag` appears before any `--` separator, append a hint to
the error ("did you forget the `--` separator before your prompt?"), and consider warning when
a recognized flag is consumed *after* a positional token has already been seen (strong signal
the flag was meant as prose). Minimal version: make the `Unknown flag` message from these
commands suggest `--`.

---

## P2 — medium impact

### 4. `--fail-on=` (empty value) silently disables the review gate
`stringFlag` treats an empty string as "unset", and `parseReviewGate` treats unset as
"no gate":

```
$ cc review job_nope --fail-on=
EXIT 1  [review] Error: No job found matching "job_nope" …    # NO gate error — gate was dropped
```

So `cc review <job> --fail-on=$SEVERITY` with an unset/empty `$SEVERITY` runs with **no gate
and exits 0 even on blocker findings** — a silent CI false-pass. (A bogus *non-empty* value is
correctly rejected: `--fail-on bogus` → exit 2 with the allowed list.)

**Suggested patch:** in `parseReviewGate` (`cc.mjs` ~L207), distinguish "flag absent" from
"flag present with empty value". If the `fail-on` key exists but is empty, error:
`--fail-on requires a value: fail, any, nit, low, medium, high, blocker`.

### 5. Repeated value flags silently last-wins
The parser overwrites non-repeatable value flags with no warning:

```
delegate --model a --model b -- x       → model "b"
delegate --name n1 --name n2 -- x       → name "n2"
review j --fail-on high --fail-on low    → fail-on "low"
delegate --add-dir a --add-dir b -- x    → ["a","b"]   (add-dir is repeatable — correct)
```

An agent that double-passes a flag from a template silently gets the last value.

**Suggested patch:** in `args.mjs`, warn to stderr (or error) when a `VALUE_FLAGS` key is
assigned more than once; keep `REPEATABLE_FLAGS` accumulating. At minimum document last-wins.

### 6. `status --job` ignores `--compact`
The single-job path hardcodes `compact: true`, so `--compact` is a no-op there although the
help advertises `--compact` for `status`:

```
$ cc status --job <id>            ┐ byte-identical output
$ cc status --job <id> --compact  ┘
```

**Suggested patch:** either honor `--compact` distinctly for `--job` (offer a fuller single-job
shape by default and compact under `--compact`), or document that `--job` is always compact
(and ignore/reject `--compact` explicitly so it isn't a silent no-op).

---

## P3 — polish

### 7. Scalar startup-flag validation runs late
`--permission-mode bogus` is rejected only at `buildStartSessionOptions` (step 6), **after** the
privacy ack and a full `driver.probe()`:

```
$ cc delegate --yes --permission-mode bogus -- x
EXIT 2  [delegate] Error: --permission-mode must be one of: acceptEdits, auto,
        bypassPermissions, default, dontAsk, plan (got "bogus")
```

No job is created (good), but a probe was spent and (on first run) an ack recorded before the
reject. `--model`/`--effort` are not validated by the dispatcher at all (passed through).
**Patch:** validate scalar startup flags up front, before ack/probe.
(The conflict case is clear: `--dangerously-skip-permissions --permission-mode default` →
`…cannot be combined with a different --permission-mode.`)

### 8. `--allow-edit` rejection names skills, not the CLI command
```
cc workflow --allow-edit        → [workflow] Error: --allow-edit is not applicable to $claude-workflow.
cc goal/fork/batch/deep-research → …to $claude-goal / $claude-fork / $claude-batch / $claude-deep-research.
cc workflows --allow-edit        → …to $claude-workflows.
cc review / adversarial-review   → …not applicable to review skills. Reviews are read-only.   (clearer)
```
The agent typed `cc workflow`, not `$claude-workflow`. The review variant's generic phrasing
reads better cross-surface. **Patch:** phrase in terms of the actual invocation
(`cc workflow`) or keep it generic like the review messages.

### 9. Parser-level errors omit the `[command]` prefix
Command-level errors carry `[status] Error: …`; parser-level ones don't:
```
cc status --job          → Error: --job requires a value          (no [status])
cc delegate --frobnicate → Error: Unknown flag: --frobnicate      (no [delegate])
cc boguscommand          → Error: Unknown command: boguscommand
```
JSON shapes are consistent (`{ok:false,error:{message,name}}`) — only the human prefix differs.
**Patch:** thread the detected command into the top-level parse-error formatter.

### 10. `stop` semantics on terminal jobs
`stop` on an `orphaned` job relabels it `stopped` and prints "Claude job stopped"; a second
`stop` on the now-stopped job also exits 0 and appends a **second** `stop.completed` event.
Idempotency is good; the wording ("stopped" for an already-dead session) and the duplicate
event are minor. **Patch:** for already-terminal jobs, report "already terminal (orphaned)"
instead of re-emitting a stop.

---

## Secondary environment observations (not pure CLI-surface bugs)

### 11. Fresh delegate jobs reconcile straight to `orphaned`
Every job spawned in this sandbox is classified `orphaned` within ~650 ms of start. Job A's
event trail:
```
reconcile.status
reconcile.warning  adapter.readLogs failed: claude logs a70edce0 exited 1
```
`claude logs <shortId>` isn't readable immediately after a `--bg` start here, so the single
post-create reconcile declares the job orphaned. Consequence: the whole
`running → awaiting_followup → followup/review` lifecycle is **unexercisable** in this
environment (every job is terminal-orphaned, so `followup`/`review` report "no live idle
session"), and `orphaned` is an alarming label for "just started." Likely sandbox/timing
specific (CODEX_CI), but worth a short grace window or a distinct `starting/unconfirmed`
state before declaring `orphaned`. (Matches the hundreds of pre-existing `orphaned` rows.)

### 12. Shared global job store has no lane scoping
The workspace store held 387 jobs from prior/parallel lanes; sibling `plan0024-*` jobs from
lanes A–D are intermixed with mine. `--name` is a label, not a namespace. During this run a
sibling lane's `awaiting_followup` job (`job_mqfgy4i3_f0ed64c3`) transitioned to `stopped` —
**not by me** (I only ever ran `stop` against my own job A, twice). `cc stop
--all-awaiting-followup` and `--all` operate store-wide with no lane/owner filter, so
concurrent agents step on each other. I deliberately **did not** run the bulk-stop path for
this reason; its behavior is described from code only.

---

## What works well (positives)

- **`--` separator protects leading-`--` prompts end-to-end.** `cc delegate -- --reply-with-only
  the word ok` spawned cleanly (no "Unknown flag") and stored `prompt.summary` =
  `"--reply-with-only the word ok"` verbatim (bytesLen 29). `--json`/flags after `--` are
  treated as literal prompt text.
- **Enumerated validation errors are clean and exit 2:** `--fail-on bogus`,
  `--stored-status bogus`, `--limit abc`/`-5`, `--permission-mode bogus` all list the allowed
  set and the bad value.
- **JSON error envelope is consistent:** `{ "ok": false, "error": { "message", "name" } }` for
  both parse-time and command-time errors.
- **`stop` is robust:** works on a dead/orphaned job (exit 0), idempotent on re-stop (exit 0),
  clean not-found for a bogus id (exit 1, with `--all` hint). `stop --all-idle` →
  `Unknown stop flag: --all-idle`; bare `stop --all` → guidance to use
  `--all-awaiting-followup [--all]` or a `<jobId>`; `stop --all-awaiting-followup job_x` →
  rejects the positional.
- **not-found prefix** messages include the `Re-run with --all` hint.

---

## Exit-code reference (observed)

| Command | Exit |
|---|---|
| `*/--allow-edit` rejections, `--fail-on bogus`, `--stored-status/--limit/--permission-mode` invalid, `status <id>` positional, `status --job`/`--job=`, `stop`/`stop --all`/`--all-idle`/`--all-awaiting-followup job_x`, unknown flag/command, no command | 2 |
| ambiguous prefix, not-found prefix, `result` on non-terminal, `stop` non-existent, review gate trip | 1 |
| `status --job <id>` (+`--compact`/`--json`), `result` on terminal job, `stop` (incl. re-stop), `--help` | 0 |
| `--fail-on=` empty (gate silently dropped → falls through to job resolution) | 1 (not 2) |

---

## Cleanup / safety
- Jobs spawned by this lane: **1** (`job_mqfh6h4j_88aeb857`, name `plan0024-fric-A-260d9d1a`) —
  final status **stopped**. No other jobs created.
- Never ran `stop --all-awaiting-followup` or any `--all` mutation (shared store, sibling lanes).
- Read-only reconciles touched at most one sibling `running` job (`cc result …`, no stop/inject).
- Temp scratch under `$CLAUDE_JOB_DIR/tmp`. No commit; no source files modified (report only).

---

## Note on report location
The background-session isolation guard rejected writes to the shared checkout, so this report
was written inside a git worktree:
`/.claude/worktrees/plan0024-lane-e-friction/documentation/testing/artifacts/20260615-plan0024-installed-polish/agent-friction.md`
(same relative path as requested). Per "do not commit", it is left uncommitted on branch
`worktree-plan0024-lane-e-friction`. Copy it into the main checkout to sit beside the sibling
lane reports (`agent-flags.md`, `agent-followup-review.md`).
