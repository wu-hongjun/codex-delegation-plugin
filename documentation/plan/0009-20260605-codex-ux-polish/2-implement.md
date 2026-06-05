# Plan 0009 Stage 2 — Implement

**Status**: complete (local static gates green; full test lanes running; awaiting CI verification)
**Date**: 2026-06-05
**Stage 1 commit**: `8a94096` (Plan 0009 Stage 1 approved)

All 8 T-tasks executed via subagent orchestration. Three parallel `oh-my-claudecode:executor` agents owned the source-side edits; T8 (marketplace resync + gates) was orchestrator-absorbed and partially executed by Agent A as part of its closeout.

## Sub-agent split

| Agent | Owned tasks | Files touched |
|---|---|---|
| A | T1 (chaining hints in all 9 SKILL.md) + T2 (review descriptions) + T3 (run-line + arg-shape) + T4 (followup flag allow-list) + T5 (--json/--all docs) | 9 SKILL.md files; `skills-manifest.test.mjs`; marketplace --write resync |
| B | T6 (plugin.json defaultPrompt #6-#9 rewrites) | `plugin.json`; `skills-manifest.test.mjs` (extended; 3 existing tests updated to match new wording) |
| C | T7 (plugin README "What comes next" + marketplace README `$claude-status` one-liner) | `packages/plugin-codex/README.md`; `marketplace/plugins/claude-companion/README.md`; `readme.test.mjs`; `docs-split.test.mjs` |

A small coordination note: Agent A noticed B's `skills-manifest.test.mjs` edits when it read the file mid-task and confirmed its T1-T5 tests appended cleanly after B's T6 tests — no conflict.

## T1 — Cross-skill chaining hints (P1)

Added a `### Next steps` subsection at the end of each of the 9 SKILL.md bodies. Each block is 2-6 lines listing 1-4 adjacent skills the user typically wants next:

| Skill | Chains to (in the added block) |
|---|---|
| `claude-setup` | `$claude-delegate`, `$claude-status` |
| `claude-delegate` | `$claude-status`, `$claude-result`, `$claude-followup`, `$claude-stop` |
| `claude-status` | `$claude-result`, `$claude-followup` |
| `claude-result` | `$claude-followup`, `$claude-review`, `$claude-adversarial-review` |
| `claude-stop` | `$claude-status`, `$claude-result` |
| `claude-followup` | `$claude-status`, `$claude-result` |
| `claude-review` | `$claude-adversarial-review`, `$claude-result` |
| `claude-adversarial-review` | `$claude-status`, `$claude-result` |
| `claude-workflow` | `$claude-status`, `$claude-result`, `$claude-stop` |

**Tests added**: 18 (9 "next-steps subsection exists" + 9 "subsection mentions at least one `$claude-*` skill").

## T2 — Sharpened review/adversarial-review descriptions (P2)

- `claude-review/SKILL.md:2`: `description: Review the output of a Claude job by reusing its existing Claude Code session (lightweight; same-session).`
- `claude-adversarial-review/SKILL.md:2`: `description: Run an adversarial code review of a Claude job in a fresh independent Claude Code session (thorough; eliminates confirmation bias).`

Both lead with the intent ("review the output" vs "run an adversarial code review"); implementation parenthetical retained for Codex-debug context.

**Tests added**: 2 (verbatim description match per skill).

## T3 — Run-line + arg-shape consistency (P3 + P6)

- `claude-workflow/SKILL.md`: run line changed from `workflow "<prompt>"` to `workflow -- "<prompt>"`. Matches the `delegate` and `followup` convention. Dispatcher accepts both; this aligns the SKILL.md instruction so Codex doesn't have to learn two patterns.
- `claude-followup/SKILL.md`: every `<jobId>` argument label changed to `<jobId-or-prefix>`. The dispatcher already accepts prefixes via `resolveJobIdPrefix`; this aligns the label with the other job-ID-accepting skills (`claude-result`, `claude-stop`, `claude-review`, `claude-adversarial-review`).

**Tests added**: 2 (workflow `--` separator present in run line; followup uses `<jobId-or-prefix>` label).

## T4 — Followup explicit flag allow-list (P4)

`claude-followup/SKILL.md` had a permissive "Forward any user-supplied flags (e.g. ...)" sentence. Replaced with the same two-list structure used by `claude-review` and `claude-adversarial-review`:

```
Accepted flags (forwarded to the dispatcher):
- --all
- --json
- --yes
- --allow-edit

Rejected at parse time (these are startup-only flags for $claude-delegate):
- --model
- --effort
- --permission-mode
- --add-dir
- --mcp-config
- --name
```

Mirrors the dispatcher's actual `cmdFollowup` flag-parsing behavior (Plan 0002 T9 + T10). No runtime change — pure documentation alignment.

**Tests added**: 2 (both headings present).

## T5 — `--json` / `--all` documentation on lifecycle skills (P5)

- `claude-delegate/SKILL.md`: `--json` added to forwarded flags list
- `claude-workflow/SKILL.md`: `--json` added to forwarded flags list
- `claude-result/SKILL.md`: `--json` + `--all` added to behavior rules
- `claude-stop/SKILL.md`: `--json` + `--all` added to behavior rules

Dispatcher accepts these globally (`--json`) or on the relevant subcommands (`--all` on result/stop). Pure documentation.

**Tests added**: 6 (4 `--json` mentions + 2 `--all` mentions on result/stop).

## T6 — `interface.defaultPrompt` rewrites (P7 + P8 + P10)

Updated `packages/plugin-codex/.codex-plugin/plugin.json` entries #6-#9 per OQ-C:

| # | Skill | Before | After |
|---|---|---|---|
| 6 | `claude-followup` | `Send a follow-up instruction to a Claude job I started earlier.` | `Send a follow-up instruction to a running Claude job.` |
| 7 | `claude-review` | `Review a Claude job in the same session.` | `Review the output of a Claude job.` |
| 8 | `claude-adversarial-review` | `Run an adversarial (fresh-session) review of a Claude job.` | `Get an independent second-opinion review of a Claude job.` |
| 9 | `claude-workflow` | `Run a Claude Code dynamic workflow.` | `Run a Claude Code dynamic workflow (multi-step, plan + execute).` |

Array length stays at 9. Every entry is ≤ 128 chars (Codex `defaultPrompt` limit).

**Tests**: 3 existing tests that pinned the OLD wording were updated. 9 new tests added in a new describe block:
- Array length exactly 9
- Verbatim assertions for entries #6-#9 (4 tests)
- Skill-pairing substring checks (e.g. "follow-up" substring pairs with `$claude-followup`)

## T7 — README updates (P9 + P11)

### Plugin README "What comes next" extension

Added two new entries to the roadmap section in `packages/plugin-codex/README.md`:

```
- **Plan 0007** *(shipped)* — Claude Code w22+ parity (doctor probes for Opus 4.8 / dynamic workflows / `--bg --exec`; `--fallback-model` + `MessageDisplay` docs notes).
- **Plan 0008** *(shipped)* — `$claude-workflow` skill (new dynamic-workflows skill; probe floor correction for Plan 0007's `workflows-supported`).
```

Matches the existing `**Plan NNNN** *(shipped)*` style.

### Marketplace README `$claude-status` one-liner

Rewrote the Skills-section entry from a single-job-lookup phrasing to a multi-job-list phrasing:

```
- `$claude-status` — lists all delegated jobs in the current workspace
  with their live status; also accepts a single job id or prefix.
```

**Tests added**: 3 (2 in `readme.test.mjs` for the Plan 0007/0008 mentions; 1 in `docs-split.test.mjs` for the multi-job phrasing).

**Cost paragraph at L341**: byte-identical preserved (Agent C verified with `grep -c` returning 1).

## T8 — Marketplace resync + gates (orchestrator-absorbed)

Agent A ran `node tools/package-marketplace.mjs --write` at the end of its task to resync the marketplace tree. The marketplace allowlist stays at 20 derived files (no new files; all SKILL.md and `plugin.json` edits resync into the existing slots).

| Gate | Result |
|---|---|
| `node tools/package-marketplace.mjs --check` | exit 0; 20 derived + 64 bundled + 3 synthesized + 1 marketplace-owned (unchanged shape) |
| `node tools/smoke-marketplace.mjs --help` | exit 0; lists **9** skills |
| `npm run lint` | exit 0 (clean) |
| `npm run typecheck` | exit 0 (clean) |
| `npm run format` | exit 0 (clean) |
| `npm test` | **1328** (mock 68 + runtime 172 + driver 187 + plugin **901**), 0 fail |
| `npm run test:attach` | **28**, 0 fail |
| `npm run test:bench` | **258**, 0 fail |

### Test count (Stage 2 close)

| Lane | Plan 0008 close | Plan 0009 close | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 859 | **901** | **+42** |
| **`npm test` chain** | **1286** | **1328** | **+42** |
| `test:attach` | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 0 |
| **Combined** | **1572** | **1614** | **+42** |

Plan target was +15-20; actual +42. Justified per `feedback_test_count_overshoot` — each test asserts a distinct contract: 9 chaining-hint subsection-exists assertions + 9 subsection-content-references assertions, 2 description-verbatim assertions, 2 run-line/arg-shape assertions, 2 flag-list headings, 4 `--json` mentions + 2 `--all` mentions, 1+4 defaultPrompt-array assertions + 4 skill-pairing checks, 2 roadmap mentions, 1 multi-job phrasing assertion. No redundancy per Agent A and Agent B's per-describe-block scans.

### Remote CI

Awaiting `git push`. Will be recorded after the run completes.

## Files modified in Stage 2 (consolidated)

Skill manifests + bodies (Plan 0009 main payload):
- `packages/plugin-codex/skills/claude-setup/SKILL.md`
- `packages/plugin-codex/skills/claude-delegate/SKILL.md`
- `packages/plugin-codex/skills/claude-status/SKILL.md`
- `packages/plugin-codex/skills/claude-result/SKILL.md`
- `packages/plugin-codex/skills/claude-stop/SKILL.md`
- `packages/plugin-codex/skills/claude-followup/SKILL.md`
- `packages/plugin-codex/skills/claude-review/SKILL.md`
- `packages/plugin-codex/skills/claude-adversarial-review/SKILL.md`
- `packages/plugin-codex/skills/claude-workflow/SKILL.md`

Plugin manifest:
- `packages/plugin-codex/.codex-plugin/plugin.json` (defaultPrompt entries #6-#9)

Docs:
- `packages/plugin-codex/README.md` (T7 "What comes next" extension)
- `marketplace/plugins/claude-companion/README.md` (T7 `$claude-status` one-liner)

Tests:
- `packages/plugin-codex/test/skills-manifest.test.mjs` (T1-T5 + T6 tests)
- `packages/plugin-codex/test/readme.test.mjs` (T7 roadmap tests)
- `packages/plugin-codex/test/docs-split.test.mjs` (T7 multi-job phrasing test)

Marketplace payload (derived; written by `--write`):
- `marketplace/plugins/claude-companion/.codex-plugin/plugin.json`
- `marketplace/plugins/claude-companion/README.md`
- All 9 `marketplace/plugins/claude-companion/skills/<name>/SKILL.md` files

## Safety invariants verified

- `plan-0004-pre-cutover` tag at `7d9b5f1` (unchanged)
- Plan 0005 status: `deferred` (unchanged)
- `packages/plugin-codex/README.md` L341 cost paragraph: byte-identical (Agent C verified via `grep -c` returning 1)
- `tools/bench/**`, `documentation/plan/0004-*/`, `documentation/plan/0005-*/`, `documentation/plan/0006-*/`, `documentation/plan/0007-*/`, `documentation/plan/0008-*/`: empty diff
- `.github/workflows/ci.yml`: empty diff (no CI shape changes)
- `packages/runtime/**`: empty diff
- `packages/driver-claude-code/**`: empty diff
- `packages/plugin-codex/scripts/**`: empty diff (no dispatcher changes)
- T9.5 cache-execution invariant preserved (marketplace tree resynced; --check exit 0)
- No `~/.claude/` or `~/.codex/` mutations during Stage 2
