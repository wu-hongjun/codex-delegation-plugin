# Pre-compact handover — cc-plugin-codex, mid-Plan-0011

**Generated**: 2026-06-05, just before /compact
**Status**: Plan 0011 Stage 2 implementation COMPLETE on disk; NOT yet committed.

## Where we are

- **Repo**: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
- **Branch**: `main` (in sync with `origin/main` at `b643649` — last commit was Plan 0011 Stage 1 approval)
- **Working tree**: dirty with Plan 0011 Stage 2 changes (NEW: `packages/plugin-codex/skills/claude-fork/` + `packages/plugin-codex/skills/claude-batch/` + their marketplace mirrors; MODIFIED: dispatcher, plugin.json, 7 test files, both READMEs, RELEASING.md, MANIFEST.md, package-marketplace.mjs, smoke-marketplace.mjs)
- **Environment shift mid-session**: Claude Code upgraded from brew 2.1.153 → native 2.1.165 (at `~/.local/bin/claude`). All 3 Plan 0007 doctor probes (`opus-4-8-supported`, `workflows-supported`, `bg-exec-supported`) now report `ok` (were partial-warn on 2.1.153). `claude --bg --exec '<cmd>'` actually runs now.

## What Plan 0011 shipped (Stage 2 work done, uncommitted)

Two new slash-command wrapper skills (mirrors of `$claude-goal`'s Plan 0010 pattern):

- **`$claude-fork <directive>`** — wraps `/fork`; spawns a forked subagent in a bg session. Heavier-token (20-30k for trivial directive per T1 evidence). Rejects `--allow-edit`. Prompt transformer: `p => '/fork ' + p`.
- **`$claude-batch <instruction>`** — wraps `/batch`; runtime injects `# Batch: Parallel Work Orchestration` system prompt. Rejects `--allow-edit`. Prompt transformer: `p => '/batch ' + p`.

`/tasks` was probed in T1 (artifact at `documentation/plan/0011-20260605-slash-command-wrappers/artifacts/oq-a-tasks-probe-20260605.txt`) → **Verdict B (TUI-only, opens task-picker dialog requiring keyboard input)** → **deferred**. Adaptive scope worked correctly.

Skill count: **10 → 12**. Marketplace allowlist: **21 → 23 derived files**.

## Test counts (verified just before /compact)

| Lane | Plan 0010 close | Plan 0011 close (uncommitted) | Delta |
|---|---|---|---|
| `test:mock` | 68 | 68 | 0 |
| `test:runtime` | 172 | 172 | 0 |
| `test:driver` | 187 | 187 | 0 |
| `test:plugin` | 948 | **1016** | **+68** |
| **`npm test` chain** | **1375** | **1443** | **+68** |
| `test:attach` | 28 | 28 (assumed unchanged; verify) | 0 |
| `test:bench` | 258 | 258 (assumed unchanged; verify) | 0 |
| **Combined** | **1661** | **~1729** | **+68** |

Plan target was +50-60 (assuming 3 A-verdicts; we only got 2). Actual +68 overshoot justified per `feedback_test_count_overshoot` — 14 dispatcher + 14 skills-manifest + per-skill iterator effects.

## Standing invariants (DO NOT VIOLATE post-compact)

- `plan-0004-pre-cutover` tag at `7d9b5f14e44cf49ca73371b78698b25f0cb9d8ff` (Plan 0004 frozen since 2026-06-04)
- Plan 0005 status `deferred` (waiting for Plan 0004 T11/T12 post-cutover ≥ 2026-06-16)
- `packages/plugin-codex/README.md` L636-ish cost paragraph byte-identical (locked Plan 0001/0002 wording)
- `v0.2.0` tag at `ea595e146e26edbd1942486ac98ea38560947210` (immutable; do NOT retag)
- Plans 0006-0010 all `complete`; do NOT modify their files
- `.github/workflows/ci.yml` untouched since Plan 0001
- `tools/bench/**`, `packages/runtime/**`, `packages/driver-claude-code/src/**` untouched (except Plan 0007's STATUS_MAP widening)
- Real `~/.codex` config.toml has stale `cc-plugin-codex-local-smoke` entries the maintainer asked us to preserve (don't edit them)

## Next steps (deterministic)

1. **Verify local state**: `cd /Users/hongjunwu/Repositories/Git/cc-plugin-codex && git status --short && claude --version`
2. **Re-verify gates** (if cache is cold): `node tools/package-marketplace.mjs --check` (expect 23 derived), `npm run lint`, `npm run typecheck`, `npm run format`, `npm test` (expect 1443 total in npm test chain), `npm run test:attach` (expect 28), `npm run test:bench` (expect 258)
3. **Run a straggler grep** (Plan 0010 lesson — Plan 0011 executor already did this, but verify): `grep -rnE "\b10\b|\bten\b|\b21 derived\b" packages/plugin-codex/test/ tools/ documentation/RELEASING.md marketplace/MANIFEST.md packages/plugin-codex/README.md marketplace/plugins/claude-companion/README.md 2>/dev/null | grep -v '2026-06-' | head` — should return nothing relevant
4. **Write `documentation/plan/0011-20260605-slash-command-wrappers/2-implement.md`** — follow the Plan 0010 2-implement.md pattern; include T1 verdicts (B/A/A → defer/implement/implement), T2-T5 file lists, test counts, safety invariants. Set readme.md status `implementing` → `auditing` and mark Stage 2 complete-pending-CI.
5. **Commit Stage 2** with a message similar to Plan 0010's Stage 2 commit (`Plan 0011 Stage 2: ...`)
6. **Push** + watch CI for the new commit (`gh run list --branch main --limit 1` → `gh run view <id> --json conclusion,jobs`)
7. **Dispatch Stage 3 audit** via `oh-my-claudecode:critic` (Opus, fresh-context subagent). Expected verdict: `ready-for-report` per the Plans 0009/0010 pattern (the executor was disciplined; straggler-grep was pre-emptive). If verdict has findings, Stage 4 polish. Mirror the Plan 0010 3-audit.md structure.
8. **Skip Stage 4** if Stage 3 returns `ready-for-report`. Otherwise apply polish fixes.
9. **Write `5-report.md`** mirroring Plan 0010 5-report.md structure. Note Plan 0011's distinguishing feature: ADAPTIVE SCOPE (T1 deferred `/tasks` based on empirical Verdict B; only 2 of 3 commands shipped).
10. **Commit Stage 3 + 5** together (Stage 4 skipped); push; final CI watch.
11. **Flip plan readme status to `complete`**. Verify all standing invariants intact. Standing by for the next maintainer ask.

## Open follow-up work (after Plan 0011 closes)

- `/tasks` (Verdict B from T1) — defer to Plan 0012+ with PTY-injection fallback design if desired
- Other slash-command wrappers not in this batch (e.g. `/deep-research` — but covered by `$claude-workflow`; `/simplify`; `/code-review`)
- Plan 0004 T11/T12 (post-cutover ≥ 2026-06-16) — paused
- Plan 0005 un-defer — pending Plan 0004 closure
- Release tag `v0.3.0` — separate maintainer-driven step via `documentation/RELEASING.md` (10+2 new skills since `v0.2.0`)

## Memory references

User auto-memory: `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/memory/MEMORY.md`

Key memory entries to honor:
- `feedback_stale_hooks` — PostToolUse "Edit/Bash operation failed" hooks fire spuriously; trust the tool result
- `feedback_compact_corrupts_long_fences` — persist load-bearing artifacts to disk before compaction (this file IS that artifact)
- `feedback_test_count_overshoot` — overshoots are fine if each test is a distinct contract (Plan 0011 +68 is justified)
- `feedback_orchestrator_b_role` — orchestrator can absorb B (test-engineer) when verbatim-template
- `feedback_engineer_playbook_handoff` — persist follow-up briefs to 2-implement.md (this handover lives in HANDOVER-PRE-COMPACT.md instead since it's pre-compact temporary)
- `feedback_redirect_chain_masks_exit` — `cmd > log 2>&1; echo $?` masks exit; read the log directly
- `user_collaboration_style` — terse structured updates, heavy delegation, tolerance for orchestrator judgment calls

## Anti-corruption notes

The compaction may corrupt long fenced code blocks (per memory). The actual delta-evidence (file paths, line ranges, test counts) is short and survives. The 2-implement.md you'll write in step 4 should pull from the **executor agent's final report** (the prior turn's last big message in the conversation transcript) which lists every modified file. If that's gone post-compact, re-derive from `git diff HEAD` since HEAD is at the Stage 1 commit `b643649` and Stage 2 changes are uncommitted.

## Recovery path if context is fully lost

The conversation transcript file at `/Users/hongjunwu/.claude/projects/-Users-hongjunwu-Repositories-Git-cc-plugin-codex/<session>.jsonl` contains the full history (including the executor agent's reports). Use `git log --oneline -20` to see the plan progression. Plans 0001-0010 are all in `documentation/plan/` with full 5-stage docs. Plan 0011 Stage 1 + this handover are the only Plan 0011 artifacts before commit.
