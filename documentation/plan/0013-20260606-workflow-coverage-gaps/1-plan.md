# Plan 0013 Stage 1 — Plan

**Plan**: Plan 0013 — Workflow coverage gaps (`$claude-deep-research`, `--effort ultracode`, saved-workflow `args` docs)
**Status**: drafted (awaiting maintainer authorization)
**Date**: 2026-06-06

## 1. Background

Plan 0012 closed at `5876436` with all 12 skills stable and the real-Codex smoke-test issues resolved. Cross-referencing what's shipped against [code.claude.com/docs/en/workflows](https://code.claude.com/docs/en/workflows) surfaced three coverage gaps:

| Docs surface | Codex coverage now | Gap |
|---|---|---|
| `ultracode` keyword in prompt | ✅ `$claude-workflow` injects `ultracode: <prompt>` (Plan 0008) | — |
| `/effort ultracode` (session-level auto-orchestration) | ❌ Untested | Gap 1 |
| `/deep-research <question>` (bundled workflow) | ❌ Not wrapped | Gap 2 |
| Saved `/<name>` workflows + `args` parameter | ⚠️ Undocumented | Gap 3 |
| `/workflows` TUI panel (agent management) | ❌ TUI-only — deferred | Backlog (out of scope) |

Plan 0013 addresses Gaps 1-3. Gap 4 (`/workflows` panel) is deferred to backlog with the same justification as `/tasks` (Plan 0011 Verdict B): TUI-only, blocked on keyboard input.

## 2. Scope

In:
- **T1** — Three empirical probes (OQ-A `/effort ultracode` via CLI flag; OQ-B `/deep-research` via `--bg`; OQ-C confirm saved `/<name>` workflows are invokable via `$claude-delegate`)
- **T2** — `--effort ultracode` documentation OR `$claude-effort` skill (verdict-dependent)
- **T3** — `$claude-deep-research` skill (verdict-dependent)
- **T4** — Saved-workflow / `args` documentation (always — docs only)
- **T5** — Marketplace plumbing + count bumps (conditional on N>0 new skills)
- **T6** — Tests + gates

Out:
- `/workflows` TUI panel wrapper — backlog (TUI-only)
- `/config` dynamic-workflows toggle — settings management, not a workflow trigger
- v0.3.0 release tag — separate maintainer step after Plan 0013 closes
- Plugin rename — separate plan
- Touching frozen dirs (tools/bench, plan 0004-0012, .github/, packages/runtime, packages/driver-claude-code, cost paragraph)

## 3. Open questions

### OQ-A — Does `claude --effort ultracode` work via CLI flag?

**TO BE RESOLVED IN T1**: our existing `--effort` flag passes values through to `claude --effort <value>`. The docs describe `/effort ultracode` as a TUI slash command. Is `ultracode` a valid value for the CLI `--effort` flag, or only for the slash command?

- **Verdict A** — CLI flag accepts `ultracode`; document the value on existing skills. No new skill.
- **Verdict B** — Only TUI slash command works; ship `$claude-effort <mode> -- "<prompt>"` that injects `/effort <mode>\n<prompt>` in a bg session.
- **Verdict C** — Inconclusive; defer.

### OQ-B — Does `/deep-research` work via `claude --bg`?

**TO BE RESOLVED IN T1**: bundled workflow per docs. Requires `WebSearch` tool to be available.

- **Verdict A** — `claude --bg "/deep-research <question>"` parses as a slash command and spawns the workflow runtime. Ship `$claude-deep-research` mirroring `$claude-goal` pattern.
- **Verdict B** — Doesn't work via `--bg` (TUI-only, or requires WebSearch tool not present in bg). Defer to backlog.
- **Verdict C** — Inconclusive; defer.

### OQ-C — Saved-workflow invocation shape

**TO BE RESOLVED IN T1**: confirm that `claude --bg "/<saved-or-bundled-workflow-name> <args>"` works — i.e., the same shape used for `/goal`, `/fork`, `/batch`. Use `/deep-research` (the bundled workflow) as the test target since we can't easily save a custom workflow from a bg session.

- **Verdict A** — Works the same as other slash commands. Document: users invoke saved workflows via `$claude-delegate -- "/<name> <args>"`.
- **Verdict B** — Saved workflows require TUI invocation. Defer to backlog; document the limitation.

### OQ-D — `--allow-edit` policy on new skills

**RESOLVED**: each new skill (if shipped) rejects `--allow-edit` (mirror of `$claude-goal` / `$claude-fork` / `$claude-batch`). Workflow-runtime operations are session-init, not single-turn delegations.

### OQ-E — defaultPrompt wording

**RESOLVED INLINE** (subject to verdicts):
- `$claude-deep-research` → `"Run a Claude Code dynamic deep-research workflow on a question."`
- `$claude-effort` (if shipped) → `"Set the Claude Code session effort level (e.g. ultracode)."`

## 4. Tasks

### T1 — Three empirical probes (single executor)

**Agent**: `oh-my-claudecode:executor`
**Artifacts**:
- `artifacts/oq-a-effort-ultracode-probe-20260606.txt`
- `artifacts/oq-b-deep-research-probe-20260606.txt`
- `artifacts/oq-c-saved-workflow-shape-probe-20260606.txt` (uses `/deep-research` as the bundled-workflow proxy)

Repro recipes (each gets 30s SIGKILL timeout):

**OQ-A**:
1. `claude --bg --effort ultracode "Print the literal text ULTRACODE-OK then stop."`
2. Capture exit + agent state. Inspect JSONL for any markers indicating `xhigh` effort or workflow planning.
3. Compare to baseline: `claude --bg "Print ULTRACODE-OK then stop."` (no flag).
4. Cleanup via `claude stop`.

**OQ-B**:
1. `claude --bg "/deep-research What is 2 plus 2?"`
2. 60s SIGKILL timeout (deep-research can be slower than other slash commands).
3. Inspect JSONL: look for workflow runtime markers (`/workflows`-style records, phase tracking, etc.) similar to `/goal`'s `goal_status` records.
4. Cleanup.

**OQ-C**:
1. `claude --bg "/deep-research What is 2 plus 2?"` — same as OQ-B
2. Verify: is the prompt parsed as a slash command (XML `<command-name>` record like `/goal`'s) vs treated as plain text?
3. If A: by extension, any saved `/<name>` workflow follows the same invocation shape.

**Acceptance**: 3 artifacts written; verdicts explicit; load-bearing evidence quoted.

### T2 — `--effort ultracode` skill or docs (based on OQ-A verdict)

**Agent**: `oh-my-claudecode:executor`

**If Verdict A (CLI flag works)**:
- No new skill.
- Update `$claude-workflow/SKILL.md`, `$claude-delegate/SKILL.md`, `$claude-goal/SKILL.md`, `$claude-fork/SKILL.md`, `$claude-batch/SKILL.md` to document the `--effort ultracode` value: "When passed `ultracode`, the session uses `xhigh` reasoning + automatic workflow planning per Claude Code's `/effort ultracode` mode."
- Also note: lasts for the session; resets on new sessions.
- Add 1-2 README mentions of the same.

**If Verdict B (TUI-only)**:
- Ship `packages/plugin-codex/skills/claude-effort/SKILL.md` mirroring `$claude-goal` shape.
- Dispatcher: `case 'effort':` + `cmdEffort` that injects `/effort <mode>\n<prompt>` (concatenated as one prompt).
- Mode accepted: must validate against {low, medium, high, xhigh, ultracode}.
- Accepted flags: same set as `$claude-goal`.
- Skill count 12 → 13; defaultPrompt 12 → 13.

**Acceptance**: docs updated OR new skill shipped per verdict; tests added accordingly.

### T3 — `$claude-deep-research` skill (based on OQ-B verdict)

**Agent**: `oh-my-claudecode:executor`

**If Verdict A**:
- `packages/plugin-codex/skills/claude-deep-research/SKILL.md` (NEW)
- Mirror `$claude-goal` shape; promptTransformer `p => '/deep-research ' + p`
- Accepted flags: same as `$claude-goal`
- Cost notice: research-grade workflow; multi-agent fan-out; can spawn many agents (subject to 16 concurrent / 1000 total)
- Note: requires WebSearch tool — surface this in the SKILL.md
- Skill count +1; defaultPrompt +1

**If Verdict B**: defer; document in backlog.

**Acceptance**: skill present (or deferred) per verdict; tests added if shipped.

### T4 — Saved-workflow / `args` documentation (always)

**Agent**: `oh-my-claudecode:executor`

Append `### Saved workflows and args parameters` subsection to `$claude-workflow/SKILL.md`:

> Saved workflows (created via `/workflows` → press `s` in Claude Code TUI) appear as slash commands `/<name>`. Invoke them from Codex via `$claude-delegate -- "/<name> <args>"` — the workflow runtime's `args` global receives the structured input.
>
> Example: a saved workflow `/triage-issues` reads issue numbers from `args`:
>
> ```text
> $claude-delegate -- "/triage-issues on issues 1024, 1025, 1030"
> ```
>
> Use `$claude-delegate` (not `$claude-workflow`) — `$claude-workflow` prepends the `ultracode:` keyword which is incorrect for saved-workflow invocation.

Mirror via marketplace `--write`. Update `$claude-delegate/SKILL.md` with a one-line cross-reference: "Also accepts saved-workflow invocations like `/<name> <args>` — see `$claude-workflow` for details."

**Acceptance**: subsection added to both SKILL.md files; marketplace mirrors resynced; 1 regression test that the subsection contains the literal phrase "saved workflow" in `$claude-workflow/SKILL.md`.

### T5 — Marketplace plumbing + count bumps (conditional)

**Conditional on T2 + T3 shipping new skills**:

| File | Change (per new skill) |
|---|---|
| `packages/plugin-codex/.codex-plugin/plugin.json` | `interface.defaultPrompt` +1 entry; 12 → 12+N |
| `tools/package-marketplace.mjs` | `DERIVED_FILES` +1 entry; 23 → 23+N |
| `marketplace/MANIFEST.md` | "23 files" → "(23+N) files" + N new bullets |
| `documentation/RELEASING.md` | Three "23 derived"/"23 source-derived" → "(23+N)"; skill list extended; "twelve-skill" → "(12+N)-skill" |
| `tools/smoke-marketplace.mjs` | `SKILL_NAMES` +N; wording bumps |
| All 7 test files (marketplace-{layout,smoke,releasing}, skills-manifest, dispatcher, docs-split, readme) | SKILL_NAMES extended; all 12/twelve/23 count assertions bumped |

If N=0 (both probes return non-A): no marketplace plumbing needed. T5 collapses to no-op.

**Pre-emptive straggler-grep** per Plan 0011 lesson: `grep -rE "\b12\b|\btwelve\b|\b23 derived\b"` before commit.

### T6 — Tests + gates

Per new skill (T2 if Verdict B, T3 if Verdict A):
- 7 dispatcher tests (--help row, happy path, prompt-prefix, non-TTY, --allow-edit rejection, standard-flags, approval-flow)
- 7 skills-manifest tests (dir exists, SKILL.md exists, run line, no --yes auto-injection, no --allow-edit, defaultPrompt entry, frontmatter strictness)
- Iterator effects across 4 marketplace/docs tests (~3 per new skill)

T4 doc-only: +1 test.

**Local gates**:
- `--check` exit 0 with correct derived count
- `smoke --help` exit 0 with correct skill count
- `npm run lint` / `typecheck` / `format` clean
- `npm test`, `test:attach`, `test:bench` all pass
- Total combined: 1734 + (~17 per new skill × N) + 1 = 1735 to ~1769

**Remote CI**: `success` across all 4 matrix legs.

## 5. Risks

- **R1 — Both probes Verdict B**: T2+T3 both defer; plan ships only T4 (docs). Mitigation: this is acceptable; the docs change alone is high-value.
- **R2 — `/deep-research` requires WebSearch tool not auto-available in bg sessions**: T1 OQ-B probe must check this. If WebSearch is gated, the skill might work but fail at runtime. Mitigation: document the WebSearch requirement prominently in SKILL.md.
- **R3 — `--effort ultracode` partial success** (accepts the flag but doesn't actually enable auto-workflow planning): T1 OQ-A must confirm BOTH that the flag is accepted AND that workflow planning is activated. Verdict A only if both.
- **R4 — Count bump regression after 12→13 or 12→14**: same Plan 0011 lesson — pre-emptive straggler-grep mitigates.
- **R5 — Saved-workflow invocation via `$claude-delegate` may not work**: OQ-C confirms by testing the bundled `/deep-research` proxy. If even that fails, T4 docs need a different recommendation.

## 6. Test count target

Plan 0012 close baseline: **1734** (1448 npm test + 28 attach + 258 bench).

Plan 0013 target net delta:
- Worst case (both A): ~+35 tests
- Probable (1 A): ~+18 tests
- Worst case (both B): +1 test (T4 docs only)

Final combined: **1735 to ~1769**.

## 7. Acceptance criteria (overall)

- All T-tasks complete with explicit verdicts per probe
- T4 docs ship unconditionally
- T2 + T3 ship per their respective verdicts (or defer with documented justification)
- All local + remote CI gates green
- Marketplace `--check` exit 0 with the new derived count (12+N or unchanged)
- Cost paragraph at L636 byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1` (unchanged); Plan 0005 `deferred` (unchanged); v0.2.0 immutable
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish`

## 8. Backlog (carried forward, NOT in Plan 0013)

- **`/workflows` TUI panel wrapper** — Plan 0014+ if/when Claude exposes a JSON surface or we invest in PTY injection. Same deferral class as `/tasks` (Plan 0011 Verdict B).
- v0.3.0 release tag — separate maintainer step
- Plugin rename (`claude-companion` → `cc`/`claude` etc.) — separate plan
- Skill-discovery surface test (typing `$claude-*` directly in Codex chat vs shell-out) — separate plan
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit
