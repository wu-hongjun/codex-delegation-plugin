# Plan 0008 Stage 1 — Plan

**Plan**: Plan 0008 — `$claude-workflow` skill
**Status**: in progress (awaiting Stage 1 approval; pre-authorized by maintainer)
**Promoted from**: same-conversation Plan 0007 close-out + 2026-06-05 empirical TUI smoke
**Date**: 2026-06-05

## 1. Background

A 2026-06-04 audit (`documentation/research/20260604-claude-code-w22-audit/report.md`) identified G1 (dynamic workflows) as the highest-impact gap in cc-plugin-codex's coverage of Claude Code w22+. G1 was deferred at Plan 0007 close-out pending Claude Code v2.1.154 (the changelog-attributed workflow feature gate). On 2026-06-05, the maintainer upgraded to v2.1.153 and pushed back on the assumption that workflows were unavailable. A re-test via `oh-my-claudecode:qa-tester` in a real interactive Claude Code TUI (artifact: `documentation/research/20260604-claude-code-w22-audit/artifacts/workflow-tui-smoke-2-1-153-20260605.txt`) **confirmed dynamic workflows are fully available on v2.1.153**:

- `/workflows` opens the "Dynamic workflows" panel
- `ultracode: <prompt>` triggers workflow planning + approval dialog
- Generated scripts use the documented `meta` / `phase()` / `agent()` API (12-line ESM modules)
- Cancellation via "No" is clean; no subagents spawned; no persisted artifacts under `~/.claude/projects/<sanitized-cwd>/workflows/` until the workflow actually runs

The earlier "isn't available in this environment" reading was a `claude -p` print-mode gate, not a feature-absence signal. The Plan 0007 doctor probe `workflows-supported` (floor `2.1.154`) is therefore reporting a false `warn` on v2.1.153.

## 2. Scope

In:

- **`$claude-workflow <prompt>`** — new Codex skill that wraps Claude Code dynamic workflows
- **Dispatcher `workflow` subcommand** — accepts `<prompt>`, prepends `ultracode:`, delegates internally to the existing `delegate` code path
- **Probe fix** — `workflows-supported` floor lowered from `2.1.154` to `2.1.153` (or replaced with feature-detection; see OQ-B below)
- **README docs** — both plugin and marketplace surfaces document the new skill, including the load-bearing warning about workflow approval flow
- **Tests** — skill manifest, dispatcher unit, integration with delegate path

Out:

- **Synchronous workflow result retrieval** — workflows can run for minutes; `$claude-workflow` returns a job ID like `$claude-delegate`. Users retrieve results via `$claude-status` / `$claude-result`. Reusing existing async machinery.
- **Workflow approval automation** — workflows present an interactive YES/View Script/NO approval dialog. Our skill triggers the workflow but does NOT auto-approve. The user attaches via `claude attach <id>` to approve manually. Documented as a known limitation. (Auto-approve via PTY injection is risky and out of scope.)
- **Cost gating / token budget enforcement** — workflows can spawn up to 16 concurrent and 1000 total agents. We document this in the skill's "before you run this" prompt but do NOT add an in-plugin budget guard.
- **Codex-side workflow status surfaces** — workflows have their own `/workflows` TUI inside Claude Code; we don't mirror it. Job-level status via `$claude-status` is sufficient.
- **Opus 4.8 doctor probe fix** — separate finding; `opus-4-8-supported` floor may also be wrong but is not empirically verified. Stays at `2.1.154` until validated.
- **`bg-exec-supported` probe** — empirically still correct on v2.1.153 (`--exec` silently dropped); no fix needed.
- **Workflow stop/cancel from plugin** — defer to native `/workflows` TUI or `$claude-stop <jobId>` for the underlying bg session.

Out-of-scope file list (must not touch):

- `tools/bench/**`
- `documentation/plan/0004-*/artifacts/**`
- `documentation/plan/0005-*`
- `packages/plugin-codex/README.md` L341 cost paragraph (Plan 0001/0002 invariant)
- `.github/workflows/ci.yml` (no CI shape changes)
- `packages/runtime/**`, `packages/driver-claude-code/**` (no runtime/driver behavior changes; the new dispatcher subcommand calls existing exports only)

## 3. Open questions

### OQ-A — Does `claude --bg <prompt>` accept the ultracode keyword?

**RESOLVED** by 2026-06-05 probe: yes. `claude --bg 'echo testing whether claude --bg accepts a positional prompt'` exits 0 and creates a bg session. The `$claude-delegate` already uses this pattern. The plan assumes the same pattern works for `ultracode:`-prefixed prompts. Empirical verification of the full workflow path through `claude --bg` is T1.

### OQ-B — Should the probe fix lower the floor or use feature-detection?

**RESOLVED**: lower the floor to `2.1.153` for the workflows-supported probe. Feature-detection (e.g. attempting `/workflows` via spawned process) is more correct but expensive and brittle. Lowering the floor based on empirical evidence is the minimum-touch fix. Future plans can move to feature-detection if a clear API surfaces.

### OQ-C — Does `claude -p "ultracode: <prompt>"` work non-interactively?

**TO BE RESOLVED IN STAGE 2 T1** — the macOS-missing-`timeout`-binary issue blocked the 2026-06-05 probe. Resolution path: spawn the test as a background process from a node script (no shell `timeout` needed), capture stdout+exit, kill if it exceeds 60s. Result is informational for future plans; **not load-bearing** for the design because Plan 0008 uses `claude --bg` (which is confirmed) regardless.

### OQ-D — Approval flow — what does the skill output tell the Codex user?

**RESOLVED**: skill prints a clear note pointing the user at `claude attach <jobId>` and explaining the 3-option approval dialog (`Yes` / `View raw script` / `No`). Includes a token-cost warning ("workflows can spawn up to 16 concurrent agents"). The skill itself does NOT auto-approve.

### OQ-E — `--model` / `--effort` / `--permission-mode` forwarding

**RESOLVED**: forward all three to the underlying `$claude-delegate` path (parity with the delegate flow). Workflows respect these flags per the workflow docs.

## 4. Tasks

### T1 — Empirical OQ-C probe (informational; safe)

**Files**:
- `documentation/plan/0008-20260605-claude-workflow-skill/artifacts/oq-c-probe-20260605.txt` (NEW) — captures the empirical result.

**Steps**:
- Run `claude -p "ultracode: respond with the literal word OK and stop. one phase, one agent" --output-format json` from a Node script (not shell) with a 60-second hard timeout via `setTimeout` + `child.kill()`.
- Record exit code, stdout, stderr, elapsed time.
- Record whether the model performed workflow planning or treated the prompt as a normal question.

**Acceptance**: artifact written; either a "workflows work in -p mode" verdict or a "does NOT work in -p mode" verdict, both acceptable.

**Risks**: cost. Mitigation: tiny prompt; 60s hard timeout; SIGKILL on overrun.

### T2 — `$claude-workflow` skill manifest

**Files**:
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` (NEW)

**Acceptance**:
- Frontmatter `name: claude-workflow`, descriptive `description`
- Body lists the standard skill usage pattern
- Run line invokes `node "<plugin-root>/scripts/claude-companion.mjs" workflow <prompt>`
- Includes the approval-flow warning + token-cost note
- No `--yes` auto-injection (strict frontmatter)
- Plan target: +0 tests in this task (T6 covers manifest tests)

### T3 — Dispatcher `workflow` subcommand

**Files**:
- `packages/plugin-codex/scripts/claude-companion.mjs` — new `case 'workflow':` branch in the main dispatch switch

**Implementation**:
- Parse flags identical to `$claude-delegate` (`--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config`, `--name`, `--yes`)
- Prepend `ultracode: ` to the user's prompt
- Call the existing internal `cmdDelegate` (or refactor a small shared helper if needed) with the modified prompt
- Output includes the same job ID + management commands as `$claude-delegate`, plus the workflow-specific note about attaching for approval

**Acceptance**:
- `node ... workflow "test prompt"` produces the same shape of output as `$claude-delegate` with the prompt prefixed
- No new runtime / driver imports; reuses existing delegate machinery
- Plan target: +5-8 dispatcher tests

### T4 — `claude-workflow` SKILL.md tests + manifest registration

**Files**:
- `packages/plugin-codex/test/skills-manifest.test.mjs` (EXTEND)
- `packages/plugin-codex/.codex-plugin/plugin.json` (EXTEND `interface.defaultPrompt` array if appropriate; reuse existing skill-counting tests)

**Acceptance**:
- New skill listed in skills manifest tests
- `defaultPrompt` includes a workflow-flavored entry (e.g. "Run a Claude Code dynamic workflow.")
- Existing 8-skill counts updated to 9
- Skill `SKILL.md` body passes existing frontmatter + run-line validation
- Plan target: +4-6 tests

### T5 — README troubleshooting + workflow section

**Files**:
- `packages/plugin-codex/README.md` — new `### $claude-workflow` section under `## Commands and skills`; add to "Current v1 scope" list (9 skills instead of 8)
- `marketplace/plugins/claude-companion/README.md` — short end-user mirror

**Wording constraints**:
- No OQ4 forbidden tokens (`benchmark`, `cutover`, etc.)
- Cost paragraph at L341 byte-identical
- Plan target: +1-2 new tests asserting the section present + skill count = 9

### T6 — Probe fix (workflows-supported floor)

**Files**:
- `packages/plugin-codex/scripts/claude-companion.mjs` — change the `workflows-supported` floor literal from `'2.1.154'` to `'2.1.153'`. (The shared `VERSION_FLOOR` constant at line 111 cannot be re-used because the floors are now diverging across probes; introduce per-probe floors.)
- `packages/plugin-codex/test/setup-probes.test.mjs` — update the regression assertion if it pins the floor anywhere (verify it does not assert specific version strings)

**Acceptance**:
- `node packages/plugin-codex/scripts/claude-companion.mjs setup` now reports `ok` for `workflows-supported` on v2.1.153
- `opus-4-8-supported` and `bg-exec-supported` retain their `2.1.154` floors (still `warn` on v2.1.153, which is empirically correct for `--bg --exec`)
- Plan target: +1-2 tests asserting the divergent floors

### T7 — Marketplace repackage + gates

**Files**: no manual edits — re-run `tools/package-marketplace.mjs --write` after T2/T3/T5/T6 changes. Update `marketplace/MANIFEST.md` if the new skill adds a file to the derived count (`scripts/lib/` files don't change; only `skills/claude-workflow/SKILL.md` is added, bumping 19 → 20 derived).

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 with `20 derived files match source` (was 19)
- `MANIFEST.md` updated to "20 files"
- `tools/package-marketplace.mjs` `DERIVED_FILES` allowlist includes `skills/claude-workflow/SKILL.md`
- `packages/plugin-codex/test/marketplace-layout.test.mjs` `DERIVED_FILES_ALLOWLIST` updated
- `documentation/RELEASING.md` "19 derived files" / "19 source-derived files" references bumped to "20" (3 spots: L141, L164, L175)

### T8 — Local gates + CI evidence (orchestrator-absorbed)

**Files**: none.

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 (20 derived)
- `node tools/smoke-marketplace.mjs --help` exit 0; now lists **9** skills
- `npm run lint` clean
- `npm run typecheck` clean
- `npm run format` clean
- `npm test` 0 fail; counts +10-15 vs Plan 0007 baseline of 1245
- `npm run test:attach` 0 fail (unchanged 28)
- `npm run test:bench` 0 fail (unchanged 258)
- Remote CI `success` across `ubuntu-latest + macos-latest × Node 20 + 22`

## 5. Risks

- **R1 — Workflow approval flow is interactive; users may not realize they need to `claude attach`.** Mitigation: skill output prints the next-step command in bold; README documents the approval flow explicitly. Codified in T2 + T5 acceptance.
- **R2 — Workflows can run for minutes and spawn many subagents (cost).** Mitigation: skill output prints a token-cost warning before delegating. Documented in T2 + T5.
- **R3 — `claude --bg "ultracode: ..."` may not actually trigger workflow planning** (untested; OQ-A only confirmed bg-session start, not workflow planning specifically in bg). Mitigation: T1 partially probes this via the related OQ-C; if T3 implementation discovers the bg path doesn't work, fall back to PTY-inject after `claude attach` (similar to `$claude-followup` mechanism). Stage 2 contingency.
- **R4 — Probe-floor divergence increases code complexity.** Mitigation: per-probe floor constants documented inline. T6 acceptance explicit.
- **R5 — Plan 0001/0002 cost paragraph drift.** Mitigation: existing `docs-split.test.mjs` cost-paragraph test catches drift; T5 forbidden from touching L341.
- **R6 — Skill count drift across surfaces (8 → 9).** Mitigation: T4 explicitly updates skills-manifest tests; T5 + T7 update doc counts in lockstep.
- **R7 — Marketplace `node_modules/` bundled deps unchanged**: this plan adds a NEW skill (SKILL.md) but no new lib file. Bundled dependency tree stays at 64 files. The `claude-version.mjs` added in Plan 0007 is unaffected.

## 6. Test count target

Plan 0007 close baseline: **1531** (1245 npm test + 28 attach + 258 bench).

Plan 0008 target net delta: **+10 to +15 tests**, all in `npm test` plugin lane. Final combined: **1541-1546**.

Per `feedback_test_count_overshoot`, B's actual count may exceed target; C confirms per-describe redundancy.

## 7. Acceptance criteria (overall)

- All 8 T-tasks complete with per-task acceptance.
- All local + remote CI gates green.
- Marketplace `--check` exit 0 with 20 derived files (was 19).
- `$claude-workflow` skill discoverable in real Codex TUI (manual verification via `tools/smoke-marketplace.mjs --marketplace-root ...` recommended but not required for Stage 2 close — same posture as Plan 0006 T9 / Plan 0007).
- `workflows-supported` probe reports `ok` on v2.1.153.
- Cost paragraph at L341 byte-identical.
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged).
- Plan 0005 status `deferred` (unchanged).
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish` (no critical/high).

## 8. Backlog (carried forward, NOT in Plan 0008)

- `claude -p` workflow path (G1-async): if T1 OQ-C resolves "yes", a future plan could add a non-interactive `$claude-workflow --print` mode for short workflows.
- Workflow approval auto-injection (auto-`Yes` via PTY): high-risk; needs a separate plan with explicit user-policy framing.
- `claude --bg --exec` skill (G8 from Plan 0007 audit): still LOW priority backlog.
- `claude respawn` / `claude rm` skills (G7).
- `claude --bg --agent <name>` forwarding (G9).
- Opus 4.8 probe floor verification (probe is at v2.1.154; may also be wrong on v2.1.153; not empirically tested).
- Codex-side `defaultEnabled` / `disallowed-tools` parity (G11/G12): not actionable from plugin side; Codex CLI feature.
- $claude-result-rich (parse `claude -p --output-format json` shape to surface model + cost + cache info): backlog from Plan 0007 OQ-C.
