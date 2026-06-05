# Plan 0009 Stage 1 — Plan

**Plan**: Plan 0009 — Codex-UX polish (docs + skill frontmatter)
**Status**: in progress (Stage 1 awaiting approval; pre-authorized by maintainer)
**Promoted from**: 2026-06-05 inline Codex-UX audit via two parallel `oh-my-claudecode:code-reviewer` agents
**Date**: 2026-06-05

## 1. Background

After Plan 0008 close-out, the maintainer asked for a Codex-UX pass: make sure Codex (the AI in Codex CLI) and a Codex CLI user can easily use this plugin. Two parallel review agents audited the 9 `SKILL.md` files and the user-facing surfaces (plugin README, marketplace README, `interface.defaultPrompt`, `RELEASING.md`). Findings consolidated into 11 polish items spread across 4 medium-severity (MED) and 7 low-severity (LOW).

This plan applies all 11 items as a single coordinated pass. The MEDs are the load-bearing improvements; the LOWs are hygiene that compound when shipped together.

## 2. Scope

### In (the 11 polish items)

**SKILL.md-side (Codex-AI routing):**

- **P1 (MED)** — Add cross-skill chaining hints to all 9 `SKILL.md` bodies. After `$claude-delegate`, mention `$claude-status` / `$claude-result` / `$claude-followup`. After `$claude-result`, mention `$claude-followup` / `$claude-review` / `$claude-adversarial-review`. Mirror for every skill.
- **P2 (MED)** — Sharpen the `claude-review` and `claude-adversarial-review` SKILL.md `description:` frontmatter lines so they distinguish by intent (lightweight vs adversarial) not by implementation (same-session vs fresh-session).
- **P3 (LOW)** — Harmonize the `claude-workflow` SKILL.md run line to use `--` separator (matches delegate/followup).
- **P4 (LOW)** — Replace `claude-followup`'s open-ended "Forward any user-supplied flags" with an explicit allow-list (matches review/adversarial-review style).
- **P5 (LOW)** — Document `--json` and `--all` (where applicable) in the SKILL.md "Accepted flags" sections of `delegate`/`workflow`/`result`/`stop`.
- **P6 (LOW)** — Rename `claude-followup`'s arg from `<jobId>` to `<jobId-or-prefix>` to match the other skills (the dispatcher already accepts prefixes).

**README + defaultPrompt-side (Codex-user picker):**

- **P7 (MED)** — Rewrite `defaultPrompt` entries #7 (`claude-review`) and #8 (`claude-adversarial-review`) to user-intent phrasing.
- **P8 (MED)** — Rewrite `defaultPrompt` entry #9 (`claude-workflow`) with a clearer hint about what the skill does.
- **P9 (MED)** — Update `packages/plugin-codex/README.md` "What comes next" / roadmap section to include Plans 0007 and 0008.
- **P10 (LOW)** — Trim `defaultPrompt` entry #6 (`claude-followup`).
- **P11 (LOW)** — Tweak `marketplace/plugins/claude-companion/README.md` `$claude-status` one-liner so it reflects the multi-job list behavior (not just single-job lookup).

### Out

- Runtime / dispatcher / driver / runtime source changes (none required)
- Plugin version bump or release tag
- Marketplace payload structural changes (no new files in the `marketplace/` tree; only SKILL.md bodies + plugin.json defaultPrompt change, which resync via `package-marketplace --write`)
- New code or new tests beyond what's strictly needed to lock the polish contracts
- `documentation/plan/0004-*` / `documentation/plan/0005-*` / `documentation/plan/0006-*` / `documentation/plan/0007-*` / `documentation/plan/0008-*` (frozen)
- `.github/workflows/ci.yml` (no CI shape changes)
- Cost paragraph at `packages/plugin-codex/README.md:L341` (Plan 0001/0002 invariant)
- Opening any new skills (no `$claude-` additions; only edits to the existing 9)

## 3. Open questions

### OQ-A — Should P1 chaining hints be in a NEW dedicated "See also" subsection, or appended to existing body sections?

**RESOLVED**: append to existing body sections. Each skill body already has a "Behavior" / "Examples" / etc. structure. Adding a 2-3 line "Next steps" or "See also" block at the end of each body is the lightest-touch shape. Avoid creating a NEW top-level section per skill — that adds maintenance burden without adding routing signal.

### OQ-B — Exact rewrites for `description:` frontmatter (P2)?

**RESOLVED inline** — final wording:
- `claude-review`: `Review the output of a Claude job by reusing its existing Claude Code session (lightweight; same-session).`
- `claude-adversarial-review`: `Run an adversarial code review of a Claude job in a fresh independent Claude Code session (thorough; eliminates confirmation bias).`

Both retain the implementation hint in parens (for Codex devs who need it) but lead with intent.

### OQ-C — Exact rewrites for the defaultPrompt entries (P7, P8, P10)?

**RESOLVED inline**:
- #6 `claude-followup`: `Send a follow-up instruction to a running Claude job.` (was: `Send a follow-up instruction to a Claude job I started earlier.`)
- #7 `claude-review`: `Review the output of a Claude job.` (was: `Review a Claude job in the same session.`)
- #8 `claude-adversarial-review`: `Get an independent second-opinion review of a Claude job.` (was: `Run an adversarial (fresh-session) review of a Claude job.`)
- #9 `claude-workflow`: `Run a Claude Code dynamic workflow (multi-step, plan + execute).` (was: `Run a Claude Code dynamic workflow.`)

### OQ-D — Should P4's `claude-followup` flag allow-list also be enforced in the dispatcher?

**RESOLVED**: no. The dispatcher already validates flags in `cmdFollowup` (Plan 0002 T9 + T10 work). P4 is a DOCUMENTATION change in `claude-followup/SKILL.md` only — it brings the SKILL.md body in line with the dispatcher's actual contract. No runtime change.

### OQ-E — Should the chaining hints (P1) include `$claude-status` after `$claude-workflow` even though workflow sessions appear as standard bg jobs?

**RESOLVED**: yes. Workflow sessions ARE bg jobs (per Plan 0008 design), so `$claude-status` / `$claude-result` / `$claude-stop` apply uniformly. The "Next steps" block in `claude-workflow/SKILL.md` should mention `$claude-status` and clarify the approval-flow note remains relevant.

## 4. Tasks

### T1 — Cross-skill chaining hints (P1)

**Files**: `packages/plugin-codex/skills/<each>/SKILL.md` — all 9 files.

Append a `### Next steps` (or "See also") subsection at the end of each body containing 2-4 short pointers to adjacent skills:

| Skill | Chains to |
|---|---|
| `claude-setup` | `$claude-delegate` (start first job) |
| `claude-delegate` | `$claude-status` (check progress) / `$claude-result` (read output) / `$claude-followup` (continue) / `$claude-stop` (terminate) |
| `claude-status` | `$claude-result` (read a completed job) / `$claude-followup` (continue an awaiting-followup job) |
| `claude-result` | `$claude-followup` (continue) / `$claude-review` (lightweight review) / `$claude-adversarial-review` (adversarial review) |
| `claude-stop` | `$claude-status` (verify stopped) / `$claude-result` (read final output) |
| `claude-followup` | `$claude-status` (check the follow-up turn) / `$claude-result` (read output) |
| `claude-review` | `$claude-adversarial-review` (independent second opinion) / `$claude-result` (re-read original output) |
| `claude-adversarial-review` | `$claude-status` (check the review session) / `$claude-result` (read the review verdict) |
| `claude-workflow` | `$claude-status` (workflow appears as a bg job) / `$claude-result` (read final output) / `$claude-stop` (terminate) |

**Acceptance**: each SKILL.md ends with a `### Next steps` (or equivalent) subsection containing at least 1 cross-skill reference. **Test target: +9 tests** asserting the subsection's presence + that the skill references at least one adjacent skill.

### T2 — Sharpen review/adversarial-review descriptions (P2)

**Files**:
- `packages/plugin-codex/skills/claude-review/SKILL.md` — update `description:` frontmatter per OQ-B
- `packages/plugin-codex/skills/claude-adversarial-review/SKILL.md` — same

**Acceptance**:
- Both descriptions match the OQ-B wording exactly
- The pair distinguishes by intent (lightweight vs adversarial) in the first half of the sentence
- **Test target: +2 tests** asserting the new wording

### T3 — Run-line + arg-shape consistency (P3 + P6)

**Files**:
- `packages/plugin-codex/skills/claude-workflow/SKILL.md` — change `workflow "<prompt>"` to `workflow -- "<prompt>"`
- `packages/plugin-codex/skills/claude-followup/SKILL.md` — change `<jobId>` arg label to `<jobId-or-prefix>`

**Acceptance**:
- `claude-workflow` run line uses `--` separator (matches `delegate` + `followup`)
- `claude-followup` argument label matches the other skills' convention
- **Test target: +2 tests** asserting the run-line shape

### T4 — Followup flag allow-list (P4)

**Files**: `packages/plugin-codex/skills/claude-followup/SKILL.md`

Replace the "Forward any user-supplied flags (e.g. --all, --json, --yes, --allow-edit)" sentence with an explicit allow-list matching the review/adversarial-review style:

```
Accepted flags (forwarded to the dispatcher):
  --all          search across workspaces
  --json         machine-readable output
  --yes          acknowledge privacy disclosure
  --allow-edit   policy/framing flag (does not bypass privacy ack)

Rejected at parse time (these are startup-only flags for $claude-delegate):
  --model
  --effort
  --permission-mode
  --add-dir
  --mcp-config
  --name
```

**Acceptance**: the SKILL.md body has the explicit allow-list and the explicit reject-list, matching the dispatcher's actual flag-parsing behavior. **Test target: +2 tests** asserting both lists are present.

### T5 — Document --json / --all on lifecycle skills (P5)

**Files**: `packages/plugin-codex/skills/{claude-delegate,claude-workflow,claude-result,claude-stop}/SKILL.md`

Add to each skill's "Accepted flags" section the `--json` line (already accepted by the dispatcher globally) and `--all` where applicable (`result`, `stop`). Do NOT change runtime; this is doc-only.

**Acceptance**: each of the 4 SKILL.md files mentions `--json` in its Accepted flags. `result` + `stop` mention `--all`. **Test target: +4 tests**.

### T6 — defaultPrompt rewrites (P7 + P8 + P10)

**Files**: `packages/plugin-codex/.codex-plugin/plugin.json`

Update the `interface.defaultPrompt` array entries #6, #7, #8, #9 per OQ-C. The array length stays at 9.

**Acceptance**: each new defaultPrompt entry matches OQ-C wording verbatim. **Test target: +1 test** asserting all 4 new entries are present.

### T7 — README updates (P9 + P11)

**Files**:
- `packages/plugin-codex/README.md` — extend "What comes next" / roadmap section to mention Plans 0007 (shipped) and 0008 (shipped)
- `marketplace/plugins/claude-companion/README.md` — rewrite `$claude-status` one-liner to reflect multi-job list behavior

**Acceptance**:
- Plugin README "What comes next" section references Plan 0007 + Plan 0008 with `*(shipped)*` markers
- Marketplace README `$claude-status` one-liner says something like "lists all delegated jobs in the current workspace; also accepts a single job id or prefix"
- Cost paragraph at plugin README L341 byte-identical (verified by existing test)
- **Test target: +2 tests**

### T8 — Marketplace repackage + gates (orchestrator-absorbed)

**Files**: no manual edits. Re-run `tools/package-marketplace.mjs --write` after T1-T7. The marketplace's `skills/<name>/SKILL.md` files + `.codex-plugin/plugin.json` will be resynced from source.

**Acceptance**:
- `node tools/package-marketplace.mjs --check` exit 0 (still 20 derived files; allowlist unchanged because no new files)
- `node tools/smoke-marketplace.mjs --help` exit 0; lists 9 skills
- All local gates green: `npm run lint`, `npm run typecheck`, `npm run format`, `npm test`, `npm run test:attach`, `npm run test:bench`
- Combined test count: Plan 0008 close baseline 1572 + ~20 new tests = ~1592
- Remote CI `success` across `ubuntu-latest + macos-latest × Node 20 + 22`

## 5. Risks

- **R1 — Existing snapshot tests over-pin SKILL.md content.** Adding "Next steps" subsections may break tests that assert exact body byte-counts or full-content matches. **Mitigation**: inspect existing SKILL.md tests before T1 and verify they use contains-checks, not deepEqual. If they don't, relax them as part of T1.
- **R2 — Plugin README cost paragraph drift.** Adding "What comes next" entries near L341 risks accidental edits to the locked paragraph. **Mitigation**: T7 inserts content nowhere near L341; the existing `docs-split.test.mjs` cost-paragraph byte-identity test will catch any drift.
- **R3 — Marketplace `package-marketplace --check` failure if `claude-workflow/SKILL.md` byte-changes** but the marketplace copy isn't resynced. **Mitigation**: T8 explicit resync step.
- **R4 — defaultPrompt entries breaking existing Codex catalog limits.** Codex's `interface.defaultPrompt` spec caps entries at 128 chars. **Mitigation**: all OQ-C rewrites are under 70 chars.
- **R5 — Cross-skill chaining hints introducing OQ4 forbidden tokens.** Adding new prose risks accidentally introducing `benchmark`, `cutover`, etc. **Mitigation**: existing per-surface forbidden-token tests catch this.

## 6. Test count target

Plan 0008 close baseline: **1572** (1286 npm test + 28 test:attach + 258 test:bench).

Plan 0009 target net delta: **+15 to +20 tests**, all in `npm test` plugin lane.

Final combined: **1587 to 1592**.

Per `feedback_test_count_overshoot`, B's actual count may exceed target if each test is a distinct contract.

## 7. Acceptance criteria (overall)

- All 8 T-tasks complete with per-task acceptance.
- All local + remote CI gates green.
- 9 skills all have a "Next steps" / chaining-hints subsection.
- defaultPrompt entries #6-#9 match OQ-C wording exactly.
- Plugin README "What comes next" lists Plans 0007 + 0008 as shipped.
- Cost paragraph at L341 byte-identical (verified by existing test).
- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged).
- Plan 0005 status `deferred` (unchanged).
- Marketplace `--check` exit 0 (20 derived files; allowlist unchanged).
- 5-stage cycle completed; Stage 3 audit verdict at least `ready-for-polish` (no critical/high).

## 8. Backlog (carried forward, NOT in Plan 0009)

- Plan 0004 T11 / T12 (still paused; ≥ 2026-06-16 post-cutover)
- Plan 0005 (still deferred)
- Opus 4.8 probe floor verification (still at 2.1.154; may be wrong on 2.1.153 but not empirically tested)
- G7-G10 LOW backlog from Plan 0007 audit (`claude respawn`, `claude rm`, `--bg --exec` skill, `--bg --agent` flag forwarding)
- G11/G12 (Codex-side gaps; not actionable from plugin side)
- Release tag `v0.3.0` (separate maintainer-driven step)
- Per-subcommand `--help` text (would require restructuring `printUsage`; out of scope)
