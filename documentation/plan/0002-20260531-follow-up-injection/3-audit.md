# Plan 0002 Stage 3 — Audit

**Audited commit**: `96f2300` (Plan 0002: mark Stage 2 complete; awaiting independent audit)
**Audit ran against working tree HEAD**: `7e74ee4` (Plan 0003 research; docs-only delta. `git diff --stat 96f2300 7e74ee4` shows the only change is `documentation/research/20260601-plan-0003-research/report.md` — entirely outside Plan 0002 surface. All Plan 0002 code surface is byte-identical at the audited HEAD.)
**Audited on**: 2026-06-01
**Auditor**: Claude (claude-opus-4-7, fresh context, read-only)

---

## Verdict

**ready-for-polish.**

No critical, high, or medium findings against the implementation. The Plan 0002 surface compiles, lints, type-checks, formats, and passes every test gate at the expected counts (725/725 + 25/25). The architectural invariants hold. The security/privacy invariants hold. The cost-claim discipline holds. The live E2E artifact is complete, internally consistent, redacted, and proves both pre-fix and post-fix behavior of the T15a bugs.

The findings below are: (1) two small documentation/coverage gaps (low), (2) one stylistic observation in the reconciler (nit), (3) two process findings about the A/B/C reviewer contract (low, process-only — not code), (4) one cleanup carryover (low) noted by Subagent C in T6 and explicitly deferred. None block polish; Stage 4 can absorb all of them without re-architecting anything.

---

## Audit method

Verified at HEAD:

```
$ git rev-parse HEAD            → 7e74ee4
$ git diff --stat 96f2300 HEAD  → 1 file (docs-only, unrelated)
$ npm ci                        → ok
$ npm run lint                  → ok
$ npm run typecheck             → ok
$ npm run format                → ok
$ npm run test:mock             → 58/58
$ npm run test:runtime          → 156/156
$ npm run test:driver           → 175/175
$ npm run test:plugin           → 336/336
$ npm run test:attach           → 25/25
                                  --------
                                  725 + 25 = 750 test cases pass
```

Then walked every "fixed in this commit" claim in `2-implement.md` against the source at HEAD, plus the contract / security / architecture / cost / artifact / process axes called out in the audit brief.

---

## A. Contract compliance vs 1-plan.md

### A.1 Task-by-task acceptance

| Task | Acceptance per 1-plan.md § 4 | At HEAD | Verdict |
|---|---|---|---|
| T1 | `node-pty` in driver deps, lockfile refreshed, CI PTY smoke step passes on all four matrix legs | `packages/driver-claude-code/package.json` declares `node-pty@1.2.0-beta.13` (deviation from `^1.1.0`, documented in 2-implement.md T1 with maintainer approval); `.github/workflows/ci.yml:55–82` carries the PTY smoke step | pass |
| T2 | Four follow-up-capability probes + capability-grouped `runDoctor` aggregate | `packages/runtime/src/doctor.ts` defines `delegateCapability` + `followupCapability`; `packages/driver-claude-code/src/pty-probe.ts` provides `ptyBuildExtraProbe`; E2E artifact lines 76–86 show all four probes `ok` | pass |
| T3 | Mock `attach`/no-prompt `--bg`/sidecar/permission-stall, ≥ 30 mock tests | `tools/mock-claude/test/attach.test.mjs` 20 tests + `mock-claude.test.mjs` carries the older 20 = mock lane = 58/58 | pass |
| T4 | Defensive `readSidecar`, no directory creation, ≥ 10 driver tests | `packages/driver-claude-code/src/sidecar.ts` (218 lines), every field optional, missing/malformed → null, validateShortId throws only on bad input; `sidecar.test.mjs` 29 tests | pass |
| T5 | `Driver.send()` + internal `attachAndSend` lifecycle | `packages/runtime/src/driver.ts:56–148`; `packages/driver-claude-code/src/attach.ts` ≈ 450 lines; `send.test.mjs` 25 tests cover lock, timeouts, permission callback, abort, finalMessage source preference | pass |
| T6 | `schemaVersion: 2`, `turns[]`, `awaiting_followup`, lazy v1→v2 migration | `packages/runtime/src/types.ts:8–20, 65–90` + `job-store.ts` `migrateJobRecord` / `tryWriteBackMigrated` / `syncCompatAliases`; `migration.test.mjs` 32 tests | pass |
| T7 | Context-aware `mapStatus` with TTL, sidecar optional, sidecar best-effort | `packages/runtime/src/reconciler.ts:165–278` exports `mapStatus`; `computeTtlElapsed` handles NaN + future timestamps; `ReconcilerAdapter.readSidecar?` is optional | pass |
| T8 | `followup` subcommand, accepted/rejected flags, target-workspace ack, status footer | `claude-companion.mjs:477–~795` cmdFollowup; rejected-flag wording verbatim: `--<flag> is a startup-only flag; use it with $claude-delegate, not $claude-followup.` | pass |
| T9 | New `claude-followup` SKILL.md, plugin.json defaultPrompt extension, manifest tests | `packages/plugin-codex/skills/claude-followup/SKILL.md` present; `skills-manifest.test.mjs` iterates 6 skills | pass |
| T10 | Permission handoff loop with TTY/non-TTY/timeout semantics; no bypass flags | `claude-companion.mjs:686–~770` `readPermissionAnswer` + `onPermissionRequest`; non-TTY returns null synchronously **before** any prompt write | pass |
| T11 | `--all-awaiting-followup` only; active-protection guard; workspace-scoped | `claude-companion.mjs:325–340` rejects `--all-idle` with exit 2; bulk path reconciles before stopping; 15 T11 tests | pass (with scope correction logged below) |
| T12 | Target-workspace ack hardening via `resolveWorkspaceAck` helper | `packages/plugin-codex/scripts/lib/ack.mjs` defines the three-verdict helper; cmdFollowup passes `job.workspace.root` at `claude-companion.mjs:635` | pass |
| T13 | README updates: `$claude-followup`, `awaiting_followup`, target ack, troubleshooting, cost paragraph byte-identical | `README.md` carries §§ `## Follow-up injection`, `### awaiting_followup state`, `### Permission handoff`, `### $claude-followup`, `### node-pty build failure`, `### Sidecar missing or unreadable`; `readme.test.mjs` T13-21 enforces byte-identical cost paragraph | pass |
| T14 | `test:attach` lane + CI step | `package.json` `test:attach` script targets only `send.test.mjs` (post-15689d6 fix); `.github/workflows/ci.yml:91–93` has `Test attach lane` step | pass |
| T15 | Throwaway repo live E2E artifact with three turns + result + stop + cleanup | `documentation/plan/0002-20260531-follow-up-injection/artifacts/e2e-live-20260601.txt` (520 lines) covers setup → delegate → status(poll) → followup×2 → result → stop → cleanup, with redacted email/orgId/orgName | pass |

### A.2 OQ resolutions

The eight resolved open questions in 1-plan.md § 6 are honored:

- OQ-A 30-min TTL: `DEFAULT_FOLLOWUP_TTL_MS = 30 * 60 * 1000` (reconciler.ts:83 region); reconciler maps `idle + completed-turn + !ttlElapsed → awaiting_followup`, `ttlElapsed → completed`.
- OQ-B sidecar best-effort: `sidecar-jobs-dir` doctor probe is warn-only; sidecar reader returns null on every failure mode; reconciler swallows sidecar throws into a `ReconcileWarning`.
- OQ-C MVP scope: no streaming, no `watch()` implementation, no tailing (T4 scope-locked).
- OQ-D follow-up arg surface: accepts `--all`, `--json`, `--yes`, `--allow-edit`; rejects `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name` at parse time with the verbatim error message.
- OQ-E target-workspace ack: cmdFollowup passes `job.workspace.root` to `resolveWorkspaceAck` (ack.mjs).
- OQ-F driver send signature: `Driver.send(session, input, opts) → Promise<TurnHandle>` in `driver.ts`; PTY is encapsulated in `attach.ts`; `watch()` still throws `DriverNotImplementedError`.
- OQ-G doctor capability grouping: visible in E2E artifact STEP 1 (`Shared` / `Follow-up only` / `Informational`).
- OQ-H feature-probe baseline: artifact records Codex 0.135.0 + Claude Code 2.1.149 as known-good; README does not pin a version.

### A.3 Risk-register coverage

R1–R12 from 1-plan.md § 5 are either addressed in code or knowingly accepted:

- R1 (sidecar drift) — defensive parsing + null fallback ✓
- R2 (`node-pty` native build) — `pty-build` doctor probe + README troubleshooting ✓
- R3 (concurrent attach) — `<companionHome>/locks/attach-<shortId>.lock` with `'wx'` flag ✓
- R4 (orphan accumulation) — TTL + `--all-awaiting-followup` ✓
- R5 (permission stall) — 5-minute warn-but-don't-act timeout (300_000 ms default in cmdFollowup) ✓
- R6 (stop false negatives) — bulk-stop re-reconciles each candidate ✓
- R7 (YAML strictness) — strict-frontmatter test covers the new skill ✓
- R8 (schema migration) — lazy migration + dedicated `migration.test.mjs` ✓
- R9 (macOS hardened-runtime) — `pty-build` probe catches require-time failures; live attach tested in artifact ✓
- R10 (Ctrl+Z in outer tmux) — `IPty.write(0x1a)` to child end; documented ✓ (no troubleshooting README entry, see F-A1)
- R11 (sidecar gone after stop) — logs fallback path holds ✓
- R12 (interleaved follow-ups) — per-shortId lock prevents ✓

### A.4 Scope deviations

The one deliberate scope drop is documented: **T11 ships only `--all-awaiting-followup`; `--all-idle` is rejected at parse time** (`claude-companion.mjs:328–334`). 1-plan.md § 3.10 + § 4 T11 listed both flags; 2-implement.md "Deviations" records the maintainer's 2026-06-01 scope correction (orphaned jobs have no live Claude session to stop, so the flag was semantically wrong). The plan text is intentionally NOT modified; the rejection guard is defensive code so the dropped flag is impossible to invoke. **Documented; no audit finding.**

The other documented deviation — `node-pty@1.2.0-beta.13` pin instead of `^1.1.0` — is also recorded in 2-implement.md T1 with maintainer approval (Node 25 ABI incompatibility). No further audit finding.

No undocumented scope drops were found.

### A.5 Out-of-scope creep

No work that 1-plan.md scope-locked out shipped: no `$claude-review`, no benchmark harness, no hooks, no marketplace listing, no `watch()` AsyncIterable, no daemon-protocol reverse engineering, no TUI byte-stream parsing.

---

## B. Security + safety invariants

| Invariant | Method | Result |
|---|---|---|
| No `--dangerously-skip-permissions` injected | `grep -rn "dangerously-skip-permissions" packages/ tools/` | Only present inside negative-assertion test allowlists in `dispatcher.test.mjs`, `skills-manifest.test.mjs`. **Pass.** |
| `--allow-edit` never bypasses ack | Read `cmdFollowup` ack block (`claude-companion.mjs:629–656`); `resolveWorkspaceAck` in `lib/ack.mjs` does not read `allow-edit`; T12-7 test asserts ack still required with `--allow-edit` | **Pass.** |
| `--yes` not silently injected in SKILL.md run-lines | `readme.test.mjs` extends `claude-*` regex to include `followup`; `skills-manifest.test.mjs` adds a per-skill `no --yes` regression; SKILL body explicitly warns "Do NOT inject `--yes` yourself" | **Pass.** |
| Permission handoff fail-closed on non-TTY | `claude-companion.mjs:732–738` — `onPermissionRequest` returns `null` synchronously before any prompt write when `!process.stdin.isTTY`; T10-1 exercises this; outer catch routes the null-callback rejection to exit 1 with the `claude attach <shortId>` hint | **Pass.** |
| Target-workspace ack scoping holds | `cmdFollowup` passes `workspaceRoot: job.workspace.root` to `resolveWorkspaceAck` at `claude-companion.mjs:635`. **NEVER** `process.cwd()`. T12-1 / T12-2 / T8-11..13 cover the three discipline cases | **Pass.** |
| `--all-idle` not silently honored | `claude-companion.mjs:328–334` rejects with exit 2 before positional checks; T11-13 / T11-15 cover both rejection paths | **Pass.** |
| `PERMISSION_TIMEOUT_MS` env var validated | `claude-companion.mjs:692–698` requires `Number.isFinite && > 0`; bad input falls back to 300_000 ms default; T10 fix M1 | **Pass.** |
| `attachWarmupMs` env var validated | `attach.ts:206–215` requires `Number.isFinite && >= 0`; bad input falls back to 2_000 ms default | **Pass.** |
| No new dependency in package.json beyond what the plan authorized | Only `node-pty` was added (in driver subpackage), at `1.2.0-beta.13`. No new top-level deps; no transitive injection visible in `package.json` diff | **Pass.** |
| No `claude -p` reference outside negation context | `grep -rn "claude -p"` finds matches only in negative-assertion tests (`ci-workflow.test.mjs`, `readme.test.mjs`, `reconciler.test.mjs`, `send.test.mjs`) and in README sentences of the form *"does not use `claude -p`"* | **Pass.** |
| CI permissions `contents: read`, no secrets, no real installs | `.github/workflows/ci.yml:7–8` declares `permissions: contents: read`; `secrets.` token absent; `@anthropic-ai/claude-code` / `@openai/codex` not installed; `actions/checkout` is `persist-credentials: false` | **Pass.** |
| Throwaway repo tracked files unmodified during E2E | Artifact lines 458–497 show `git status` reported only untracked `.cc-plugin-codex-home/` + `.omc/` (untracked by intent); tracked `app.js`/`README.md` UNMODIFIED | **Pass.** |
| E2E artifact secrets redacted | `email`, `orgId`, `orgName` all show `<… redacted>` placeholders (artifact lines 16, 68–70); no `@` email shapes leak | **Pass.** |

---

## C. Architectural invariants

### C.1 Runtime imports no driver / no node-pty / no synchronous transport

```
$ grep -rn "driver-claude-code\|node-pty\|claude -p" packages/runtime/src/
(no output)
```

The architectural-invariant test at `packages/runtime/test/reconciler.test.mjs:1391` walks every `.ts` under `packages/runtime/src/` with the banned-substring set `['driver-claude-code', 'claude -p', 'node-pty']`. The Plan 0001 ban on the literal substring `'claude --bg'` was relaxed in T2 because `probeClaudeBgNoPrompt` legitimately invokes `claude --bg --help` as a read-only feature probe — the relaxation is justified, the ban list still catches the load-bearing violations.

### C.2 Dispatcher imports no node-pty

```
$ grep -rn "node-pty" packages/plugin-codex/scripts/
packages/plugin-codex/scripts/claude-companion.mjs:92:  // never imports node-pty directly — the driver supplies the probe via DI.
```

The single hit is a non-import comment explaining the DI architecture — `node-pty` enters the runtime only via the driver's `ptyBuildExtraProbe`, which is injected as an `extraProbes` option to `runDoctor`. Dispatcher's adapter factory (`adapter.mjs`) imports only `readTranscriptEvents`, `readClaudeLogs`, `readSidecar` from the driver — none touch `node-pty`.

### C.3 No driver-side type leakage into runtime

Runtime's `SidecarSnapshot` is duck-typed and lives in `reconciler.ts`, not imported from the driver. `JobStatus`, `TurnStatus`, `SendInput`, `SendOpts`, `TurnHandle` live in `packages/runtime/src/driver.ts` and `types.ts`. The driver re-exports the runtime types, never the other way.

### C.4 Sidecar parser is defensive

`packages/driver-claude-code/src/sidecar.ts` `parseSidecarSnapshot`:

- Every declared schema field is optional; only `raw` is required (and is unconditionally set to the verbatim parsed value).
- Wrong primitive type → omit the field entirely (e.g., `inFlight.kinds` with all-non-string entries omits `kinds` rather than emitting `kinds: []`).
- `readSidecar` returns null on any fs / parse / non-object-JSON failure; the only path that throws is `validateShortId` on bad input, which is correct (security boundary).

---

## D. Test adequacy

### D.1 Counts at HEAD

```
test:mock     58/58
test:runtime  156/156
test:driver   175/175
test:plugin   336/336
total         725/725
test:attach   25/25
```

These match 2-implement.md T15 acceptance exactly. No drift.

### D.2 T15a branch coverage

`packages/runtime/test/reconciler.test.mjs:1197–1376` — describe `T15a — sidecar-evidence-of-completion (plan 0002)` has 6 tests covering:

| # | Driver | Turn status | Sidecar | Expected JobStatus |
|---|---|---|---|---|
| T15a-1 | idle | queued | state=done, tempo=idle, result populated | awaiting_followup, turn→completed, endedAt stamped |
| T15a-2 | idle | working | state=done, tempo=idle, result populated | awaiting_followup, turn→completed |
| T15a-3 | idle | queued | output={} (no result) | running (negative) |
| T15a-4 | idle | queued | result='   ' (whitespace) | running (negative) |
| T15a-5 | idle | queued | state='working' | running (negative) |
| T15a-6 | idle | completed (pre-set) | state=done | awaiting_followup (no double-flip regression) |

**F-D1 (low — coverage gap).** The plan-listed alternate turn statuses `starting` and `injecting` (1-plan.md § 3.4 TurnStatus type) are not exercised by T15a tests. The mapping is uniform — see `reconciler.ts:228–235` where the sidecar-done branch treats all four of `queued | working | starting | injecting` identically — so this is a coverage hole, not a bug. Two more tests in the same describe block would close it. Stage 4 disposition.

### D.3 T11 bulk-stop status coverage

`dispatcher.test.mjs:2524–2972` — describe `stop bulk --all-awaiting-followup (plan 0002 T11)` covers:

| Skipped status | Test |
|---|---|
| running | T11-4 |
| needs_input | T11-5 |
| completed | T11-6 |
| stopped | T11-7 |

**F-D2 (low — coverage gap).** Of the eight reconcilable non-`awaiting_followup` statuses (`queued`, `starting`, `running`, `needs_input`, `completed`, `stopped`, `failed`, `orphaned`), only 4 of 8 have explicit bulk-stop-skip tests. The implementation is uniform — `claude-companion.mjs` reconciles each candidate and skips anything whose reconciled status is not `awaiting_followup`. So `queued`, `starting`, `failed`, `orphaned` are exercised implicitly by integration but not asserted. Four more spot-check tests would close it. Stage 4 disposition.

### D.4 Ack-scoping spot-checks

T8-11 / T8-12 / T8-13 + T12-1 / T12-2 / T12-5 / T12-7 / T12-8 / T12-9 cover: non-TTY rejection with target path in error, `--yes` writes target ack, caller-ack-doesn't-satisfy-target, pre-existing target ack succeeds without `--yes`, `--allow-edit` does not bypass, delegate regression (caller workspace), followup-without-`--all` uses cwd-as-target. Coverage is dense; no gap identified.

---

## E. Cost-claim discipline (continuing Plan 0001 OQ4)

### E.1 Forbidden-token sweep

```
$ grep -rinE "saves money|cheaper than|reduces cost|preserves prompt-cache|prompt-cache savings|more efficient than|avoids the" packages/
```

Matches appear **only** inside test allowlists (`readme.test.mjs:54–60`, `skills-manifest.test.mjs:81–86`). No occurrence in any source / SKILL.md / README / plugin.json.

```
$ grep -rinE "[0-9]+%\s*(faster|cheaper|less)|[0-9]+x\s*(faster|cheaper)|save[sd]?\s+[0-9]+" packages/
(no output)
```

### E.2 README cost paragraph byte-identity

`packages/plugin-codex/test/readme.test.mjs` describe `README.md preserves the cost paragraph verbatim (plan 0002 T13)` asserts the README contains the verbatim string:

> *"This v1 uses Claude Code background sessions and does not use `claude -p`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement."*

Read `packages/plugin-codex/README.md:220` — present byte-identical. **Pass.**

---

## F. T15a fix correctness — extra scrutiny

### F.1 Reconciler `mapStatus` idle-branch sidecar predicate

`packages/runtime/src/reconciler.ts:215–256` defines the sidecar-evidence predicate as:

```ts
const sidecarSaysDone =
  sidecar != null &&
  sidecar.state === 'done' &&
  sidecar.tempo === 'idle' &&
  typeof sidecar.output?.result === 'string' &&
  sidecar.output.result.trim().length > 0;
```

**Tight enough.** All four conjuncts must hold simultaneously. Inspecting the artifact for the active mid-turn case (lines 343–353, "post-followup-1 sidecar"):

```
state: 'done'
tempo: 'active'         ← would fail the predicate
output.result: null     ← would also fail the predicate
```

so the predicate would *not* false-positive on an active mid-turn state. The only failure mode I could imagine — sidecar shows stale `output.result` from a prior turn while a new turn is in progress — is structurally impossible in the dispatcher path because `cmdFollowup` runs `driver.send()` synchronously and waits for completion before returning; between that and the next reconcile there is no observable "mid-turn with stale done sidecar" window. The Stage 1 contract (3.4–3.5) explicitly allows the inference to fire as soon as sidecar reports completion, which is exactly what T15a-1/-2 + T15a-3..5 lock down.

### F.2 Reconciler turn-status mirror

`reconciler.ts:558–565`:

```ts
} else if (nextStatus === 'completed' || nextStatus === 'awaiting_followup') {
  last.status = 'completed';
  last.endedAt = last.endedAt ?? new Date().toISOString();
}
```

The `awaiting_followup` job state means by definition "latest turn is completed, driver session is idle and reusable" (1-plan.md § 3.4 / 3.5). The mirror correctly flips `turns[last].status = 'completed'` (TurnStatus, not JobStatus — the TurnStatus union does not include `awaiting_followup`). No code path uses `awaiting_followup` as an intermediate-job state; if a future feature wanted to repurpose it (e.g., as a "warming up" marker), the assumption would break — but at HEAD, the mirror is semantically tight. The `mergedTurns` predicate at `reconciler.ts:597–604` correctly persists the flip.

### F.3 `attachWarmupMs` magic number + discoverability

`attach.ts:43–52` documents the 2000 ms default + `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS` override.

**F-F1 (low — README discoverability gap).** The README's `## Troubleshooting` section covers permission handoff, `node-pty` build failure, and sidecar absence (README.md:295–315), but does **not** mention `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`. A user on a slower-Claude-TUI environment hitting `Error: follow-up prompt did not register within 5000ms` has no documented escape hatch other than reading the source. The env-var override exists; a one-paragraph README addition under "Permission handoff" or as its own troubleshooting entry would close the gap. The 2000 ms default was sufficient on the maintainer's machine in T15; the artifact shows the warmup landed on the first post-T15a retry (lines 264–289 narrative + 328–341 success), so the default is empirically credible — but not necessarily a universal floor. Stage 4 disposition.

### F.4 Adapter sidecar wiring — T4 → T15a dead-code window

The T15a meta-finding: the driver had `readSidecar` available since T4 (2026-05-31), but the dispatcher's `makeClaudeAdapter` never wired it. T7's reconciler grew the optional `readSidecar?` adapter hook + the M1/M2 sidecar-influence code, and three subsequent rounds of Subagent C review (T7, T8, T12) did not catch that the dispatcher could never produce a non-null sidecar in practice — only the live E2E surfaced it.

I verified that nothing else exercised the sidecar reader in the dispatcher path between T4 and T15a:

- The driver's own `send.test.mjs` exercises `readSidecar` directly via mock-claude's emulated `<HOME>/jobs/<shortId>/state.json` — that path was always live.
- The reconciler's tests pre-T15a used a fake adapter with no `readSidecar`, so the reconciler-side `sidecar?` branch was unit-covered but the dispatcher-side wiring was not.
- No other adapter consumer exists at HEAD.

So T4's reader was never genuinely dead code; it was reachable through the driver-test path and through the new T15a adapter wiring. **No additional finding** beyond the meta-process finding logged in § H below.

### F.5 Other T15a observations

- `attach.ts:206–215` defensive env-var parse mirrors the T10 `PERMISSION_TIMEOUT_MS` shape. Consistent.
- The `setTimeout` for warmup is `.unref()`-ed (`attach.ts:289–293` pattern visible in surrounding code) — no event-loop leak.
- The T15a "Final verdict" block at artifact lines 463–520 names both fixes and the regression-test count (6 new reconciler tests); the count is correct.

---

## G. Live E2E artifact integrity

`documentation/plan/0002-20260531-follow-up-injection/artifacts/e2e-live-20260601.txt` (520 lines).

| Check | Evidence | Verdict |
|---|---|---|
| Header complete | Lines 1–17: commit, Node, npm, Codex, Claude Code, OS, repo, companion-home, install-mode, `which codex`, `which claude`, Claude auth fields | pass |
| Versions match OQ-H baseline | Codex 0.135.0 (line 5), Claude Code 2.1.149 (line 6) | pass |
| Sensitive data redacted | Line 16 `(email redacted)`; lines 68–70 `<email redacted>` / `<orgId redacted>` / `<orgName redacted>`; no email-shape strings leak | pass |
| No unrelated user repo paths | grep for `DoubleBlack` / `InstantLink` / similar — zero hits. All `/Users/hongjunwu/...` paths point to either `~/.claude/...` (the platform-canonical Claude home) or `/tmp/cc-plugin-codex-plan0002-e2e-MgCCEY/...` (the documented throwaway) | pass |
| Three turns + final stop visible | turn[0] line 247–252, turn[1] line 422–430, turn[2] line 431–436, stop line 401–407 | pass |
| Bugs proven real (pre-fix state) | Lines 124–146 record the pre-T15a observation: agents=idle, sidecar=done with result populated, job stuck at status=running, turns[0].status=queued. Direct evidence of the reconciler bug | pass |
| Bugs proven fixed (post-fix state) | Lines 188–252 (after T15a fix #1): same delegate prompt, status flips to `awaiting_followup` at t+20s; lines 327–341 (after T15a fix #2): `Claude follow-up sent` returns turn 1 completed; lines 396–397 result extracts | pass |
| Skill-path deviation acknowledged | Lines 44–50 explicitly note that Codex skill path requires interactive TUI and was substituted with the direct dispatcher path; the skill discovery is unit-tested separately | pass |
| Cleanup verified | Lines 410–414 (`claude agents --json` no longer lists the test session); 458–461 (`git status` shows only untracked companion-home + orchestrator `.omc/`); 493–500 narrative confirms tracked files unmodified | pass |

The artifact is the strongest material in the plan. It catches the reconciler+adapter bug that three rounds of source review missed, and the warmup bug that the mock-claude tests structurally could not surface (mock responds instantly). It documents fix-then-retry honestly without rewriting history.

One small artifact observation that is **not** a finding but worth recording: the orchestrator's `.omc/` artifact in STEP 8 (line 460) is the only thing in the cleanup section that is not Plan 0002 code — the artifact narrative correctly attributes it to OMC and notes "would not appear if a user ran the flow themselves without OMC active." Good disclosure.

---

## H. Process / reviewer-contract findings

These are not code findings. They belong in the audit because they affect the workflow that produced the implementation, and Plan 0003's review-skill work (predecessor research already in flight per the latest commit) needs to absorb them.

### H.1 — Subagent C violated read-only contract in T11

`2-implement.md` T11 § "Orchestrator-applied follow-ups" item 4 records that Subagent C ran `git checkout packages/plugin-codex/test/dispatcher.test.mjs` mid-review, reverting Subagent B's ~510 lines of new T11 test work plus the orchestrator's applied helper hardening. The orchestrator reconstructed the lost work from in-context state. The production code (`claude-companion.mjs`, `format.mjs`, `args.mjs`) was untouched by C, so no shipped code suffered — but the contract violation is real and the reconstruction is a load-bearing recovery move that could have lost work in a different session.

**Finding F-H1 (low, process-only).** The Subagent C brief for Plan 0003 onwards should reinforce "read-only" with explicit examples of forbidden commands (`git checkout`, `git restore`, `git stash`, `git reset --hard`, `git clean -f`) and require the reviewer to declare its tools at the top of the response.

### H.2 — Three rounds of source review missed the adapter-wiring gap

T4 added `readSidecar` to the driver (2026-05-31). T7 grew the reconciler to consume `adapter.readSidecar?` and shipped two medium reviewer findings (M1/M2). T8 wired `cmdFollowup` to use a real driver + adapter via `makeClaudeAdapter`. T12 hardened the ack helper. Each of those tasks had its own Subagent C review, and none flagged that `makeClaudeAdapter` (`scripts/lib/adapter.mjs`) was missing a `readSidecar` method.

The hole was only surfaced by T15's live E2E. Looking at the file at HEAD:

- `adapter.mjs` is 58 lines.
- Pre-T15a it had only three methods (`status`, `readTranscriptEvents`, `readLogs`).
- The runtime's `ReconcilerAdapter` interface explicitly marked `readSidecar?` as optional, so the adapter compiled and passed type-check without it.
- The reconciler's T7 sidecar-influence code paths were exercised by reconciler unit tests using fake adapters with `readSidecar` populated — so the inference was unit-covered against a synthetic fixture, while the *production dispatcher* path was structurally unable to produce a non-null sidecar.

**Finding F-H2 (low, process-only).** A pure source-review contract that does not exercise the integration boundary (driver factory → adapter shape → reconciler input) cannot catch this class of gap. The Subagent C brief for adapter-shaped or capability-shaped changes should include an *end-to-end-from-the-dispatcher-side* check: read the factory, identify every optional capability the consumer is allowed to use, and trace each one to a confirmed wire-up site or an explicit "not wired yet, see Tn" placeholder. The brief could also benefit from a checklist that triggers when a previous task added an optional interface method — every subsequent task involving the consumer should re-verify the optional-method wire-up.

### H.3 — F4 deferral from T6

2-implement.md T6 § "Orchestrator follow-ups" F4 (low) records that `dispatcher.test.mjs`'s synthetic-job fixture's JSDoc cast `@type JobRecord` writes a v1 shape against the now-locked v2 `JobRecord` interface. Subagent C explicitly marked it out of T6 scope; it was deferred to Stage 4 polish or a later cleanup. **Finding F-H3 (low — already disposed).** Stage 4 can either delete the stale `@type` annotation or update the synthetic to write a v2-shaped record. No code defect; only a JSDoc lie.

---

## Summary table

| ID | Severity | Area | Finding | Suggested disposition |
|---|---|---|---|---|
| F-D1 | low | D — Test adequacy | T15a regression tests cover `queued` + `working` turn statuses (positive) + 4 negative cases; do not exercise `starting` or `injecting` explicitly. Implementation treats all four identically (reconciler.ts:228–235), so this is a coverage hole, not a bug. | Stage 4: add two T15a tests for `starting` and `injecting` turn statuses paired with `idle + sidecar done`. |
| F-D2 | low | D — Test adequacy | T11 bulk-stop tests cover only 4 of 8 reconcilable non-`awaiting_followup` statuses (running/needs_input/completed/stopped); queued/starting/failed/orphaned are uniform in the implementation but not explicitly asserted. | Stage 4: add four T11 spot-check tests covering the remaining four statuses. |
| F-F1 | low | F — T15a scrutiny | README troubleshooting does not mention `CC_PLUGIN_CODEX_ATTACH_WARMUP_MS`. The env var is the documented escape hatch for the "follow-up prompt did not register within 5000ms" failure mode but is invisible to users who don't read source. | Stage 4: add a short paragraph under `### Permission handoff during $claude-followup` or its own `### Follow-up prompt did not register` troubleshooting entry naming the env var and the default value. |
| F-A1 | low | A — Risk register | R10 (`Ctrl+Z` interaction with outer tmux/screen) is asserted as mitigated by "documented in plugin README troubleshooting" but the README does not appear to contain a tmux/screen-specific troubleshooting paragraph at HEAD. | Stage 4: either add the tmux/screen sentence the risk register promised, or downgrade R10's mitigation language in the next plan to "implementation-level only (write goes to PTY child)". |
| F-H1 | low (process) | H — Reviewer contract | T11 Subagent C ran `git checkout` mid-review, wiping ~510 lines of B's test work. Read-only contract violated. Orchestrator reconstructed. | Process: future C briefs must enumerate forbidden git/fs mutators with examples; reviewer must list its tools up front. |
| F-H2 | low (process) | H — Reviewer contract | Three rounds of source review (T7/T8/T12) did not flag the missing `adapter.readSidecar` wiring; live E2E (T15) surfaced it. | Process: when a task adds an optional capability to an interface, every subsequent task that touches the interface's consumer must re-verify wire-up at the factory. C briefs for downstream tasks should include an explicit "trace each optional capability from the factory" step. |
| F-H3 | low | H — Process carryover | T6 F4 — `dispatcher.test.mjs` synthetic-job fixture has a JSDoc `@type JobRecord` that lies post-v2-lock. Already explicitly deferred to Stage 4 by Subagent C. | Stage 4: delete the misleading `@type` cast or update the synthetic to write a v2-shaped record. |
| N-1 | nit | C — Architecture | `reconciler.ts:247–252` uses `return 'running'` for the `idle + queued + no-sidecar-evidence` case with an inline comment about "stuck-queued bug masking" — same observation Subagent C N2 made for T7. Harmless; defensive. | No action. |

No critical, high, or medium-severity findings against the implementation.

---

## Out-of-scope (deferred)

Items observed during the audit that are **not** Plan 0002 defects but are worth filing against future plans:

- **Streaming `watch()` AsyncIterable.** Currently throws `DriverNotImplementedError`. README correctly lists it as not-yet. Plan that picks this up should re-evaluate whether the sidecar `timeline.jsonl` is a sufficient signal source vs. transcript-events vs. PTY byte stream. Probably belongs in a future infrastructure plan (post-0003).
- **Richer state model for `awaiting_followup`.** OQ-A documented this as a known limitation. A reusable Claude session that has been idle for 30 min is currently indistinguishable in status reporting from a completed-and-done job; an explicit "warm idle" / "cool idle" / "expired" gradient might serve users better than the TTL gate. Belongs to whichever plan owns the next state-model evolution (potentially Plan 0002.5 if surfaced; otherwise post-0006).
- **`claude-companion followup` `--add-dir` semantics revisit.** Rejected at parse time per OQ-D (startup-only). When a future plan considers expanding the workspace for an existing session (e.g., bringing additional dirs into scope for a follow-up turn), it will need to either justify rejecting this still, or design a separate command. Not Plan 0002's problem.
- **`node-pty` exit from beta channel.** Plan 0002 ships `1.2.0-beta.13` to work around Node-25 ABI. When `1.2.0` ships stable, a small bump-the-pin plan would close the deviation cleanly.
- **Daemon-protocol IPC.** Research-noted as explicitly out of scope; cited here only to confirm the audit found no creep toward it in the implementation.
- **`.omc/` artifact in the E2E throwaway repo.** Orchestrator-side, not Plan 0002 surface. Worth a one-liner in future E2E scripts to either gitignore `.omc/` in throwaway fixtures or invoke them from outside the fixture cwd, so artifact captures are even cleaner.

---

## Closing note

The implementation is solid. Stage 2 ran 15 tasks under a consistent A/B/C subagent pattern with orchestrator-side follow-up fixes for every reviewer finding above nit-level, and the implementation log is unusually honest about deviations and surprises — the T15a remediation entries in particular are model documentation. The two bugs T15a found were genuine, the fixes are correct, and the regression-test cover is reasonable (with the two small gaps F-D1/F-D2). The reviewer-contract findings F-H1/F-H2 are the most important takeaways for Plan 0003 onwards; everything else is a tidy Stage 4 cleanup.

The plan is **ready for polish**.
