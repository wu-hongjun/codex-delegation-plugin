# Plan 0011 Stage 1 — Plan

**Plan**: Plan 0011 — Slash-command wrappers (`$claude-tasks` / `$claude-fork` / `$claude-batch`)
**Status**: in progress (Stage 1; pre-authorized by maintainer)
**Date**: 2026-06-05

## 1. Background

Plan 0010 proved the slash-command-via-`claude --bg` pattern: `$claude-goal <condition>` ships a thin wrapper that calls `claude --bg "/goal <condition>"` via the shared `_runDelegateCore` helper. T3a's empirical probe confirmed `/goal` works as a real slash command via `--bg` (Verdict A — JSONL `goal_status` evidence). T3b shipped the skill in one parallel agent batch.

Plan 0011 extends the same pattern to three more slash commands per the maintainer's ask: `/tasks`, `/fork <directive>`, `/batch <instruction>`. Each gets:

- An empirical `claude --bg "/<cmd> ..."` probe (T1)
- A new SKILL.md if the probe returns Verdict A (T2)
- A dispatcher `case '<cmd>':` + `cmdXxx` mirror of `cmdGoal` (T3)
- Standard 10 → 10+N count bumps + marketplace allowlist 21 → 21+N
- Tests + README updates

If a probe returns Verdict B (TUI-only or unsupported via `--bg`), that command's skill is **deferred** to a future plan. The plan is adaptive.

## 2. Scope

In:
- **T1** — Three empirical probes (one Node helper per command; artifact per command)
- **T2** — Three new SKILL.md files (one per A-verdict command)
- **T3** — Dispatcher: three new `case '<cmd>':` branches + three `cmdXxx` functions
- **T4** — Marketplace plumbing + count bumps (allowlist 21 → 21+N; SKILL_NAMES across 7 consumer files; defaultPrompt 10 → 10+N; "ten-skill"/"other nine" wording bumps in RELEASING.md and smoke-marketplace; READMEs)
- **T5** — Tests (new SKILL.md tests + dispatcher tests + per-skill-iterator effects)
- **T6** — Gates + CI

Out:
- Any slash command not in `{/tasks, /fork, /batch}` (other commands → future plan)
- PTY-injection fallback for B-verdict commands — defer to a future plan; do NOT attempt mid-stage
- Plugin version bump / release tag
- Touching frozen dirs (tools/bench, plan 0004-0010, .github/, packages/runtime, packages/driver-claude-code/src/)
- Cost paragraph

## 3. Open questions

### OQ-A through OQ-C — Probe verdicts (TO BE RESOLVED IN T1)

- **OQ-A**: Does `claude --bg "/tasks <args>"` work as a slash command? Or is `/tasks` interactive-only?
- **OQ-B**: Does `claude --bg "/fork <directive>"` create a forked subagent session?
- **OQ-C**: Does `claude --bg "/batch <instruction>"` work as a slash command?

Each OQ resolves with a per-command verdict A or B. T2/T3/T4 implementation proceeds only for A-verdict commands.

### OQ-D — `--allow-edit` policy per skill

**RESOLVED**: each new skill rejects `--allow-edit` (mirror of `$claude-workflow` + `$claude-goal`). These are session-init operations, not single-turn delegations; the `--allow-edit` flag is structurally inappropriate.

### OQ-E — defaultPrompt entries

**RESOLVED**: one new entry per A-verdict skill. Suggested wording (subject to per-command nuance after probe):
- `$claude-tasks` → `"Manage Claude Code task lists in a background session."` (will refine after probe)
- `$claude-fork` → `"Fork a Claude Code subagent for a directive."`
- `$claude-batch` → `"Run a batch of Claude Code instructions."`

Wording finalized in T4 after each probe shows the actual semantics.

### OQ-F — Per-skill argument shape

**RESOLVED inline by probe semantics**:
- `claude-tasks`: `<args?>` (optional — `/tasks` may take a sub-command like `add`/`list`)
- `claude-fork`: `<directive>` (mirror `$claude-goal <condition>` shape)
- `claude-batch`: `<instruction>` (mirror `$claude-goal <condition>` shape)

## 4. Tasks

### T1 — Three empirical probes (parallel)

For each of `/tasks`, `/fork`, `/batch`:
- Write a Node helper to `/tmp/probe-t1-<cmd>.mjs` (mirror Plan 0010 T3a's helper shape)
- Run with 30-second SIGKILL timeout
- Capture: exit code, stdout, stderr, `claude agents --json` after probe, `~/.claude/projects/<sanitized>/<sessionId>.jsonl` first 30 lines (redacted)
- Write artifact: `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-{a,b,c}-probe-20260605.txt`
- Verdict A: slash command was parsed and produced expected behavior (e.g. JSONL records showing the command, or session metadata reflecting it)
- Verdict B: command was treated as literal prompt (no slash-command parse), OR command errored out

Cleanup after each probe: `claude stop <sessionId>` for any spawned bg sessions.

**Acceptance**: 3 artifacts written; per-command verdict explicit; load-bearing evidence quoted.

### T2 — New SKILL.md files (one per A-verdict)

For each A-verdict command:
- `packages/plugin-codex/skills/claude-<cmd>/SKILL.md` (NEW)
- Mirror the shape of `claude-goal/SKILL.md` exactly
- Frontmatter: `name: claude-<cmd>` + a description that pairs naturally with the command's semantics (refine post-probe based on observed behavior)
- Body: run line `node "<plugin-root>/scripts/claude-companion.mjs" <cmd> -- "<arg>"`; accepted flags (same set as `$claude-goal`); `--allow-edit` rejected; `### Next steps` cross-references to `$claude-status` / `$claude-result` / `$claude-followup` / `$claude-stop`

**Acceptance**: per-command SKILL.md exists, strict frontmatter, mirrors `$claude-goal` shape, no OQ4 forbidden tokens.

### T3 — Dispatcher subcommands (one `cmdXxx` per A-verdict)

For each A-verdict command, in `packages/plugin-codex/scripts/claude-companion.mjs`:
- Add `case '<cmd>':` to the main dispatch switch (after `case 'goal':`)
- Add `cmdXxx` function mirroring `cmdGoal`:
  - Reject `--allow-edit` at parse time (exit 2 with clear error)
  - Call `_runDelegateCore(commandName, args, env, { promptTransformer: p => '/<cmd> ' + p, extraOutput: '<cmd>-specific approval-flow / behavior note' })`
- Update `printUsage`:
  - Add `<cmd> [flags] -- <arg>` row in Commands (after `goal`)
  - All applicable flag parentheticals updated to include `<cmd>`: `--yes`, `--json`, `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`
  - `--allow-edit` rejection list extended with the new commands

**Acceptance**: `--help` shows new commands + applicability parentheticals; tests verify `cmdXxx` rejects `--allow-edit` + accepts standard flags + uses correct prompt prefix.

### T4 — Marketplace plumbing + count bumps

For each A-verdict command, update:

| File | Change |
|---|---|
| `packages/plugin-codex/.codex-plugin/plugin.json` | `interface.defaultPrompt` array +N entries (one per new skill); 10 → 10+N |
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +N (`skills/claude-<cmd>/SKILL.md`); 21 → 21+N |
| `marketplace/MANIFEST.md` | "21 files" → "(21+N) files" + N new bullets |
| `documentation/RELEASING.md` | "21 derived"/"21 source-derived" → "(21+N)" (3 occurrences); skill list extended; "ten-skill" → "(10+N)-skill" (if N>0); "other nine" → "other (9+N)" |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +N; "Ten"/"ten"/"ten-skill"/"10 skill names"/"10 skills" → "(10+N)"-form wording |
| All 7 test files (marketplace-layout/smoke/releasing, skills-manifest, docs-split, readme, dispatcher) | SKILL_NAMES extended; all "10"/"Ten"/"21" count assertions bumped |

**Acceptance**: `--check` exit 0 with the new derived-file count; `smoke --help` lists the new skill count; all count-pinning tests bumped coherently; **pre-emptive straggler-grep** (per Plan 0010 lesson) — `grep -rE '\b10\b|\bten\b|\b21 derived\b' tests/ tools/ docs/RELEASING.md marketplace/MANIFEST.md` returns zero stragglers.

### T5 — Tests

For each A-verdict command:
- **Dispatcher tests** (~7 per command in `dispatcher.test.mjs`): `--help` row, happy path, prompt-prefix verification (`/<cmd> ` prefix), non-TTY rejection, `--allow-edit` rejection, standard-flags acceptance, approval-flow note
- **Skills-manifest tests** (~7 per command): dir exists, SKILL.md exists, run line uses `<cmd>` subcommand, no `--yes` auto-injection, no `--allow-edit` in run lines, defaultPrompt entry, frontmatter strictness

Total per command: ~14 tests × N commands. If all three A-verdict: ~42 tests; plus per-skill-iterator effects across the 4 marketplace/docs-split tests ≈ ~50-60 new tests.

### T6 — Gates + CI (orchestrator-absorbed)

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 with correct derived count
- `node tools/smoke-marketplace.mjs --help` exit 0 with correct skill count
- `npm run lint` / `typecheck` / `format` all exit 0
- `npm test`, `test:attach`, `test:bench` all pass; combined ≈ 1661 + 50-60 = ~1710-1720 (if all three are A)
- Remote CI `success` across `ubuntu-latest + macos-latest × Node 20 + 22`

## 5. Risks

- **R1 — Probe outcomes may be B**: at least one of `/tasks`, `/fork`, `/batch` may be TUI-only. Mitigation: adaptive scope — skip those commands; document in 2-implement.md and defer to backlog.
- **R2 — Probe outcomes may be UNCERTAIN**: e.g. command parses without error but produces no observable behavior. Mitigation: capture all evidence in the artifact; orchestrator decides "implement" vs "defer" per the evidence.
- **R3 — Plan 0008 F-1-style stragglers after 10→10+N count bumps**: Plan 0010 prevented this with explicit pre-commit grep. **Mitigation**: same step in T4 — grep for `\b10\b`, `\bten\b`, `\b21 derived\b` patterns before committing.
- **R4 — Cost paragraph drift**: Mitigation: existing `docs-split.test.mjs` cost-paragraph byte-identity test catches drift; T1-T6 forbidden from touching L636.
- **R5 — `--allow-edit` rejection list growth in `printUsage`**: needs to accommodate up to 3 more commands. Mitigation: existing test (per Plan 0008 F-3 fix) uses contains-checks, not exact-string matches.
- **R6 — Some commands may produce side effects** (e.g. `/batch` might run real commands). Mitigation: T1 probes use a benign argument (e.g. `/batch "respond with OK"`); 30s SIGKILL; cleanup `claude stop`.

## 6. Test count target

Plan 0010 close baseline: **1661** (1375 npm test + 28 attach + 258 bench).

Plan 0011 target net delta (assuming all 3 A-verdict): **+50 to +60 tests**.

Final combined: **~1711-1721** (if all three are A; smaller if some are B).

## 7. Acceptance criteria (overall)

- All T-tasks complete; T2-T4 implementation matches the actual T1 probe outcomes (skips B-verdict commands)
- All local + remote CI gates green
- New skills discoverable via `smoke --help`
- `--check` exit 0 with the new derived-file count
- Cost paragraph at L636 byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged)
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish`

## 8. Backlog (carried forward, NOT in Plan 0011)

- Any B-verdict commands from T1 — defer to Plan 0012+ with PTY-injection fallback design
- Other slash-command wrappers not in this batch — future plans
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred until Plan 0004 closes)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit
- Release tag `v0.3.0` (separate maintainer step)
