# Plan 0024 — Lane A: CLI Flag & Permission Parity (installed dispatcher)

**Date:** 2026-06-15
**Dispatcher under test:** `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5/scripts/cc.mjs` (plugin v0.3.5)
**Workspace:** `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
**Claude Code:** 2.1.177 · **Node:** 25.8.2 · background sessions ready, auth OK
**Shorthand below:** `CC="/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5/scripts/cc.mjs"`

All commands were run against the **installed** dispatcher (not the source tree). Six background jobs were intentionally spawned with tiny throwaway prompts (unique `LANEA-*` markers); **all six were stopped** and verified (0 running/queued at end).

> Note: this report was authored inside the git worktree `.claude/worktrees/plan0024-lane-a-flags` because the background-isolation guard blocks writes to the shared checkout. The orchestrator should collect/copy this file to `documentation/testing/artifacts/20260615-plan0024-installed-polish/agent-flags.md` in the main checkout.

---

## Summary verdict

| # | Test | Result |
|---|------|--------|
| 1 | `--help` lists the new flags | **PARTIAL PASS** — `allowedTools`/`disallowedTools`/`tools`/`agent`/`settings` documented; `system-prompt`/`append-system-prompt`/`plugin-dir`/`plugin-url`/`setting-sources`/`agents`/`bare`/`safe-mode`/`ide`/`chrome`/`no-chrome`/`disable-slash-commands`/`exclude-dynamic-system-prompt-sections`/`verbose`/`strict-mcp-config` are accepted+forwarded but **undocumented** |
| 2 | Misspelled `--sangerously-skip-permissions` fails before job creation | **PASS** — `Unknown flag`, exit 2, at parse time (no ack, no probe, no job) |
| 3 | `--dangerously-skip-permissions` alias bypasses without swallowing prompt | **PASS** — boolean flag → `bypassPermissions`; prompt preserved verbatim in job record |
| 4 | Invalid `--permission-mode` fails | **PASS** (with friction) — clear error listing valid modes, exit 2, no job; but validated **after** privacy-ack + probe rather than at parse time |
| 5 | Value flags missing their value fail | **PASS** — every value flag → `--<flag> requires a value`, exit 2, fail-closed (does not swallow the next flag or the prompt) |
| 6 | `allowedTools`/`disallowedTools`/`tools`/`agent`/`settings`/system-prompt/`plugin-dir` accepted or clear Claude-side error | **PASS for acceptance; FRICTION on errors** — all accepted & forwarded with valid values; invalid values produce **no clear delegate-time error** (job runs, or silently goes `orphaned`) |

---

## Architecture notes (white-box, supports the black-box results)

Validation happens in two places:

- **Parse time** (`lib/args.mjs::parseArgs`, called first in `cc.mjs` main, line ~355). Unknown flags throw `Unknown flag: --x`; value flags with no following value throw `--x requires a value`. Both bubble to `process.exit(2)` **before any command runs** — i.e. before privacy ack, before the Claude probe, before `createJob`.
- **Session-build time** (`cc.mjs::normalizePermissionMode`, reached only inside `buildStartSessionOptions` at step 6 of `_runDelegateCore`). This validates `--permission-mode` value membership and the dangerous-skip/permission-mode conflict. It runs **after** the privacy ack (step 2) and the Claude probe (step 4), but still **before** `createJob` (step 7).

Flag forwarding to the `claude` CLI is in `driver-claude-code/dist/background-session.js::buildArgv`. The prompt is **always** the final positional (`argv.push(opts.prompt)`), and `--dangerously-skip-permissions` is a pure boolean (`BOOLEAN_FLAGS`) that never consumes a token — so no flag can structurally swallow the prompt. `allowedTools`/`disallowedTools`/`plugin-dir`/`plugin-url` forward as repeated `--flag value` pairs; `tools`/`agent`/`agents`/`settings`/`setting-sources`/`system-prompt`/`append-system-prompt` forward as single `--flag value`. The dispatcher performs **no semantic validation** of any of these values — they pass straight to Claude.

---

## Detailed test log (commands + observed output)

### Test 1 — `--help` content

```
$ node "$CC" --help        # also: node "$CC" delegate --help (identical generic usage)
EXIT=0
```
Documented under `Flags:`: `--permission-mode`, `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`, `--allowedTools`, `--disallowedTools`, `--tools`, `--agent`, `--settings`, `--add-dir`, `--mcp-config`, `--model`, `--effort`, `--name`, etc.

Grep for the rest returned nothing:
```
$ node "$CC" --help | grep -iE "system-prompt|plugin-dir|plugin-url|setting-sources|strict-mcp|--agents|--bare|--verbose|safe-mode"
(none of those documented in top-level help)
```
`delegate --help` prints the **same** generic top-level usage (no per-command help body for delegate — `printUsage('delegate')` falls through to default).

### Test 2 — misspelled bypass flag fails before job creation

```
$ node "$CC" delegate --sangerously-skip-permissions --yes -- "say OK"
Error: Unknown flag: --sangerously-skip-permissions
EXIT=2

$ node "$CC" delegate --json --sangerously-skip-permissions --yes -- "say OK"
{ "ok": false, "error": { "message": "Unknown flag: --sangerously-skip-permissions", "name": "Error" } }
EXIT=2
```
Fails at parse time — no privacy ack, no probe, no `createJob`. **PASS.**

### Test 3 — value flags missing values (fail-closed)

```
$ node "$CC" delegate --yes --permission-mode            -> Error: --permission-mode requires a value      [exit 2]
$ node "$CC" delegate --model --yes -- "say OK"          -> Error: --model requires a value                [exit 2]   (refuses to eat the following --yes)
$ node "$CC" delegate --allowedTools --yes -- "say OK"   -> Error: --allowedTools requires a value          [exit 2]
$ node "$CC" delegate --yes --settings                   -> Error: --settings requires a value              [exit 2]
$ node "$CC" delegate --yes --system-prompt -- "say OK"  -> Error: --system-prompt requires a value         [exit 2]
$ node "$CC" delegate --yes --plugin-dir -- "say OK"     -> Error: --plugin-dir requires a value            [exit 2]
```
`ensureFlagValue` treats a following `--` or `--flag` token as "no value", so a missing value never silently consumes the next flag **or** the prompt. **PASS.**

Recognition sweep (missing-value path proves a flag is a *known* value flag, not an unknown one):
```
--allowed-tools      -> --allowed-tools requires a value        [exit 2]
--disallowed-tools   -> --disallowed-tools requires a value     [exit 2]
--agent              -> --agent requires a value                [exit 2]
--tools              -> --tools requires a value                [exit 2]
--append-system-prompt -> --append-system-prompt requires a value [exit 2]
--setting-sources    -> --setting-sources requires a value      [exit 2]
--plugin-url         -> --plugin-url requires a value           [exit 2]
--totally-made-up-flag -> Unknown flag: --totally-made-up-flag  [exit 2]   (contrast: genuinely unknown)
```

### Test 4 — invalid / conflicting `--permission-mode`

```
$ node "$CC" delegate --yes --permission-mode bogus -- "say OK"
[delegate] Error: --permission-mode must be one of: acceptEdits, auto, bypassPermissions, default, dontAsk, plan (got "bogus")
EXIT=2

$ node "$CC" delegate --json --yes --permission-mode notreal -- "say OK"
{ "ok": false, "error": { "message": "--permission-mode must be one of: ... (got \"notreal\")", "name": "Error" } }
EXIT=2

$ node "$CC" delegate --yes --dangerously-skip-permissions --permission-mode plan -- "say OK"
[delegate] Error: --dangerously-skip-permissions is an alias for --permission-mode bypassPermissions and cannot be combined with a different --permission-mode.
EXIT=2
```
Clear, actionable errors; exit 2; **no job created** (validation precedes `createJob`). **PASS.** Friction: see F1.

### Test 5 — `--dangerously-skip-permissions` alias bypass + prompt preservation

Same-value combo is explicitly allowed (alias == its long form):
```
$ node "$CC" delegate --json --yes --dangerously-skip-permissions --permission-mode bypassPermissions -- "Reply with exactly the token LANEA-CONFLICTOK-7be9 and nothing else"
ok: true  jobId: job_mqfh29oq_bd736415  status: running
prompt.summary: "Reply with exactly the token LANEA-CONFLICTOK-7be9 and nothing else"   # prompt intact
```
Bare alias (no explicit `--permission-mode`):
```
$ node "$CC" delegate --json --yes --dangerously-skip-permissions -- "Reply with exactly the token LANEA-BAREALIAS-7be9 and nothing else"
ok: true  jobId: job_mqfh3bmz_4f26e224
prompt.summary: "Reply with exactly the token LANEA-BAREALIAS-7be9 and nothing else"    # prompt intact
```
Alias maps to `bypassPermissions` and the prompt survives verbatim. **PASS.** (Both jobs stopped.)

### Test 6 — forwarding flags: acceptance vs. invalid-value error surface

**Valid values → accepted (job created/running):**
```
$ node "$CC" delegate --json --yes --dangerously-skip-permissions \
    --allowedTools "Read,Bash(echo:*)" --disallowedTools "Write,Edit" --tools "Read" \
    --append-system-prompt "You are terse." -- "Reply ... LANEA-FWDFLAGS-7be9 ..."
ok: true  jobId: job_mqfh3fw9_c445e6f2  status: running        # accepted
```

**Invalid values → NO clear delegate-time error (friction F2):**
```
$ node "$CC" delegate ... --agent nonexistent-agent-xyz -- "... LANEA-BADAGENT-7be9 ..."
ok: true  jobId: job_mqfh3y35_481a1e33  status: running        # bogus agent accepted; no validation

$ node "$CC" delegate ... --settings /tmp/does-not-exist-lanea-7be9.json -- "... LANEA-BADSETTINGS-7be9 ..."
ok: true  jobId: job_mqfh46af_cebc94c4  status: orphaned       # silent failure -> opaque "orphaned"

$ node "$CC" delegate ... --plugin-dir /tmp/no-such-plugin-dir-lanea-7be9 -- "... LANEA-BADPLUGINDIR-7be9 ..."
ok: true  jobId: job_mqfh4am1_76160c32  status: running        # nonexistent plugin-dir accepted
```
Status detail on the orphaned `--settings` job:
```
$ node "$CC" status --job job_mqfh46af_cebc94c4 --json
status: orphaned | statusReason: (none) | turn0.error: (none)
```
**Acceptance: PASS. Error surfacing: FRICTION** — invalid `--settings` produced an `orphaned` job with **no `statusReason`/error**, and invalid `--agent`/`--plugin-dir` were accepted with `ok:true status:running` (any failure would only surface later in the transcript). The dispatcher never raises a "clear Claude-side error" at delegate time for bad forwarded values.

### Cleanup

```
$ for jid in job_mqfh29oq_bd736415 job_mqfh3bmz_4f26e224 job_mqfh3fw9_c445e6f2 \
             job_mqfh3y35_481a1e33 job_mqfh46af_cebc94c4 job_mqfh4am1_76160c32; do node "$CC" stop "$jid"; done
# all -> stopped
$ node "$CC" status --all --json | (filter LANEA-)
LANEA-marked jobs found: 6   STILL RUNNING/QUEUED: 0
```
All 6 spawned jobs stopped and verified. No commits made.

---

## Friction points

**F1 — `--permission-mode` value/conflict validation runs late (after ack + probe).**
Unknown flags and missing values are caught at parse time, but an *invalid permission-mode value* (or the dangerous-skip/permission-mode conflict) is only checked inside `buildStartSessionOptions` → `normalizePermissionMode`, which runs after the interactive privacy ack and the Claude readiness probe. Consequence: with a fresh workspace (no `--yes`/no prior ack) the user is prompted to acknowledge privacy and waits through a `claude` probe **before** being told their `--permission-mode foo` is invalid. Worse, if the probe fails (Claude not ready) the user sees a generic "not ready, run cc setup" error that completely masks the real cause (the bad flag value). *Suggested fix:* validate `--permission-mode` membership and the conflict in the same parse pass as the other flag checks (or immediately after `parseArgs`, before ack/probe), so a typo'd mode fails instantly and identically to a typo'd flag name.

**F2 — Forwarded flag values are never validated and Claude-side failures surface opaquely.**
`--agent`, `--settings`, `--plugin-dir`, `--plugin-url`, `--tools`, `--mcp-config`, etc. are forwarded verbatim with zero dispatcher-side checks. A nonexistent `--settings` file yields a job that silently becomes `orphaned` with **no `statusReason`** and no error in the delegate output (`ok:true`); a bogus `--agent`/`--plugin-dir` yields `ok:true status:running` with the failure (if any) buried in the transcript. There is no "clear Claude-side error" returned to the caller at delegate time. *Suggested improvements:* (a) for path-bearing flags (`--settings`, `--mcp-config`, `--plugin-dir`) do a cheap existence check pre-spawn and emit a clear usage error; (b) when a freshly spawned session orphans/fails immediately, populate `statusReason` with the captured `claude --bg` stderr so `cc status`/`cc result` can explain *why*.

**F3 — Several accepted flags are undocumented in `--help`.**
The dispatcher accepts and forwards `--system-prompt`, `--append-system-prompt`, `--plugin-dir`, `--plugin-url`, `--setting-sources`, `--strict-mcp-config`, `--agents`, `--bare`, `--safe-mode`, `--ide`, `--chrome`, `--no-chrome`, `--disable-slash-commands`, `--exclude-dynamic-system-prompt-sections`, and `--verbose`, but none appear in `--help`. The plan task names `system-prompt` and `plugin-dir` explicitly — both work but are invisible to a user reading help. *Suggested fix:* add the missing flags to `printUsage`, ideally grouped as "Claude session passthrough flags."

**F4 — `delegate --help` (and other per-command `--help`) is generic.**
`printUsage(command)` only specializes `workflow`, `deep-research`, `status`, and `workflows`; `delegate`/`goal`/`fork`/`batch`/`followup`/`review`/`adversarial-review` fall through to the full top-level dump. Minor, but a per-command help body for `delegate` would help discoverability of the passthrough flags from F3.

**F5 (nit) — stderr noise.** Every JSON invocation emits `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` from Node. Harmless, but it pollutes captured stderr for machine consumers.

---

## Bottom line

Permission/flag **parity and fail-closed parsing are solid**: unknown flags, missing values, invalid permission modes, and alias/permission-mode conflicts all fail with clear messages and exit 2, and the `--dangerously-skip-permissions` alias correctly maps to `bypassPermissions` without ever swallowing the prompt. The gaps are in **discoverability** (F3/F4 undocumented passthrough flags) and **error surfacing** (F1 late permission-mode validation behind ack+probe; F2 opaque/`orphaned` outcomes for invalid forwarded values). None are correctness regressions; all are polish opportunities for parity with Claude Code's own flag UX.
