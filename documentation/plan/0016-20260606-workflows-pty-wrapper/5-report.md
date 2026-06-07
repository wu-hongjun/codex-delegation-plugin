# Stage 5 — Report: Plan 0016

## Report metadata

- **Plan**: Plan 0016 — `/workflows` panel wrapper (pivoted to CLI-only `$claude-workflows` skill after critical T1 finding)
- **Date**: 2026-06-07
- **Commit reported**: this commit (Stage 3 + Stage 4 + Stage 5)
- **Stage 1 plan**: [`1-plan.md`](1-plan.md) — drafted from Plan 0015 OQ-C handoff. Adaptive scope (A/A-partial/B). Approved 2026-06-06.
- **Stage 2 implementation**: [`2-implement.md`](2-implement.md) — complete 2026-06-06 at commit `c900050`. **T1 returned A-partial with critical pivot**: `/workflows` panel is session-scoped TUI-only — would NOT expose users' `cc workflow --bg` jobs. **Pivoted to CLI-only architecture** (filtered `cc status` + JSONL/subagent enrichment). Local total 1814 tests. CI run [`27081819765`](https://github.com/wu-hongjun/cc-plugin-codex/actions/runs/27081819765) **`success`**.
- **Stage 3 audit**: [`3-audit.md`](3-audit.md) — independent fresh-context audit via `oh-my-claudecode:critic` (Opus). Verdict **`ready-for-polish`** with **2 MAJOR findings** + several MINOR notes. **First non-clean audit since Plan 0014.**
- **Stage 4 polish**: [`4-polish.md`](4-polish.md) — both MAJOR findings fixed (`_sanitizeCwd` leading hyphen + `--all` flag wiring); +5 regression tests; macOS realpath path-normalization issue surfaced and fixed in the same polish round.
- **Final status**: `complete`

---

## Executive summary

Plan 0016 went through the most architectural turbulence of any plan in this session:

1. **Original Stage 1 design**: PTY-injection wrapper for Claude Code's `/workflows` TUI panel. Reuse `attach.ts` pattern. Documented runtime/driver exception.
2. **T1 critical discovery**: `/workflows` is **session-scoped TUI-only**. It shows ONLY workflows started from within the current interactive Claude TUI session (via the `ultracode:` keyword in chat). Background sessions (`cc workflow --bg` — what our skill spawns) do NOT appear. The empty-state text literally reads "No dynamic workflows in this session."
3. **Pivot to CLI-only architecture**: ship `$claude-workflows` as a CLI-only skill that filters `cc status` to workflow-kind sessions + enriches with subagent metadata + JSONL phase records. No PTY. No driver/runtime modifications.
4. **Stage 3 audit caught 2 MAJOR bugs** in the drill-in enrichment path that dispatcher unit tests didn't catch: (1) `_sanitizeCwd` stripped the leading hyphen needed for Claude's project directory format, silently breaking enrichment; (2) `--all` flag was documented but never wired.
5. **Stage 4 polish fixed both** + surfaced and fixed a macOS realpath issue when adding the regression tests.

**Final result**: `$claude-workflows` ships as a working CLI skill with:
- List path: filters workflow-kind sessions; defaults to current cwd; `--all` extends cross-workspace
- Drill-in path: enriches with subagent metadata + JSONL phase records (now correctly resolving the project directory)
- All paths use realpath normalization to handle macOS `/var/folders` ↔ `/private/var/folders` symlinks

**Skill count grows 13 → 14**. **Marketplace allowlist grows 24 → 26** (+2: new SKILL.md + new lib mjs). **Test count: 1774 → 1819 combined** (+45 net across T5 + Stage 4 polish).

**v0.3.0 remains a clean release candidate** — Plan 0016 closes the workflow-management coverage that Plans 0013-0015 left open.

---

## What shipped

### New skill: `$claude-workflows [<jobId>] [--all] [--json]`

`packages/plugin-codex/skills/claude-workflows/SKILL.md` (NEW):
- Frontmatter: `name: claude-workflows`
- Run line: `node "<plugin-root>/scripts/cc.mjs" workflows [<jobId>]`
- Accepted flags: `--all`, `--json`, `--yes`
- Rejects `--allow-edit`
- Cost notice: zero subprocess; pure data read from disk
- **Important note**: covers `$claude-workflow`-started bg jobs only. The Claude Code `/workflows` TUI panel is session-scoped TUI-only — cross-references Plan 0015 OQ-A and Plan 0016 OQ-A artifacts for the session-scope finding.

### New library: `workflows-inspector.mjs`

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (NEW):
- `listWorkflows({all, cwd, env})` — runs `claude agents --json`, filters to workflow sessions (name starts with `ultracode:`), filters by cwd (default) or includes all workspaces (`--all`), returns enriched list. Uses realpath path normalization (Stage 4 polish fix).
- `inspectWorkflow(jobId, {env})` — drills into one workflow. Reads `claude agents --json`, the session JSONL (first 30 lines for phase records), and `~/.claude/projects/<sanitized-cwd>/<sessionId>/subagents/*.meta.json` for per-subagent data.
- `_sanitizeCwd(cwd)` (exported for testing; Stage 4 polish) — converts `/Users/foo/bar` to `-Users-foo-bar` (leading hyphen preserved to match Claude's on-disk format).

### Dispatcher subcommand

`packages/plugin-codex/scripts/cc.mjs`:
- New `case 'workflows':` at L125
- New `cmdWorkflows` function at L2104
- Rejects `--allow-edit` at parse time (exit 2)
- Parses `--all`, `--json`, optional `<jobId>` positional
- Calls `listWorkflows({all, env})` or `inspectWorkflow(jobId, {env})`
- Formats human output OR JSON output

### Plugin manifest

`packages/plugin-codex/.codex-plugin/plugin.json`: defaultPrompt 13 → 14

### Empirical artifacts (T1)

- [`artifacts/oq-a-workflows-ansi-capture-20260606.txt`](artifacts/oq-a-workflows-ansi-capture-20260606.txt) — empirical ANSI capture showing the session-scoped panel evidence ("No dynamic workflows in this session.")
- [`artifacts/oq-b-architectural-sketch-20260606.txt`](artifacts/oq-b-architectural-sketch-20260606.txt) — original PTY sketch (now superseded by the CLI pivot but retained for historical traceability)

### Marketplace plumbing (count math correction)

1-plan.md projected 24→25 (+1 SKILL.md). Reality is **24 → 26** (+2: new SKILL.md AND new lib mjs are both tracked in `DERIVED_FILES`). All 10 lib files in `scripts/lib/` are tracked; adding `workflows-inspector.mjs` bumped the count.

Updated:
- `tools/package-marketplace.mjs` (DERIVED_FILES +2)
- `marketplace/MANIFEST.md` (24 → 26)
- `documentation/RELEASING.md` (24 → 26 ×3; thirteen-skill → fourteen-skill; skill list +1)
- `tools/smoke-marketplace.mjs` (SKILL_NAMES +1; wording bumps)
- Both READMEs (13 → 14; new bullet; new subsection)
- All 7 plugin test files (SKILL_NAMES extension; count assertions bumped)

### Test additions (8 files, +45 net)

- **NEW** `test/workflows-inspector.test.mjs` — 11 tests (8 T5 dispatcher integration + 3 Stage 4 `_sanitizeCwd` + 2 Stage 4 `--all` filter)
- `dispatcher.test.mjs` — 7 new `workflows` subcommand tests
- `skills-manifest.test.mjs` — 7 new `claude-workflows`-specific tests + SKILL_NAMES extension
- 5 marketplace/docs tests — iterator effects + count assertions

---

## Stage-by-stage summary

- **Stage 1 (Plan)** — Approved 2026-06-06. Adaptive scope (A/A-partial/B) with PTY-injection harness sketch.
- **Stage 2 (Implement)** — Complete 2026-06-06 at commit `c900050`. T1 returned A-partial with critical pivot. T2-T5 implemented CLI-only architecture. 1488 → 1528 npm test (+40). CI `27081819765` `success`.
- **Stage 3 (Audit)** — Complete 2026-06-06. Independent fresh-context audit. Verdict **`ready-for-polish`** with **2 MAJOR findings**:
  - MAJOR-1: `_sanitizeCwd` stripped leading hyphen (drill-in enrichment broken)
  - MAJOR-2: `--all` flag documented but never wired
- **Stage 4 (Polish)** — Complete 2026-06-07. Both MAJOR findings fixed; macOS realpath path-normalization surfaced and fixed in the same round; +5 regression tests; 1528 → 1533 npm test (+5).
- **Stage 5 (Report)** — This document. Plan status flipped `auditing → polishing → reporting → complete`.

---

## T-task summary

| Task | Outcome | Status | Evidence |
|---|---|---|---|
| T1 ANSI capture + sketch | A-partial + pivot | complete | OQ-A + OQ-B artifacts; session-scoped discovery |
| T2 library helper | CLI-only (pivoted) | complete | `workflows-inspector.mjs` |
| T3 skill + dispatcher | shipped | complete | `claude-workflows/SKILL.md` + `cmdWorkflows` |
| T4 marketplace + count bumps | 13→14 / 24→26 | complete | 7 files updated; straggler-grep clean |
| T5 tests | shipped | complete | +45 net across 8 files |
| T6 gates + CI | green | complete | local + CI green |
| Stage 4 polish MAJOR-1 | fixed | complete | `_sanitizeCwd` no longer strips leading hyphen |
| Stage 4 polish MAJOR-2 | fixed | complete | `--all` flag wired through cmdWorkflows + listWorkflows |
| Stage 4 polish macOS realpath | fixed | complete | `_normalizePath` helper added |

---

## Test and CI evidence

Final local totals on this commit (Stage 5 close):

| Lane | Plan 0015 close | Plan 0016 Stage 2 | Plan 0016 close (Stage 4) | Delta total |
|---|---|---|---|---|
| `test:mock` | 68 | 68 | 68 | 0 |
| `test:runtime` | 173 | 173 | 173 | 0 |
| `test:driver` | 187 | 187 | 187 | 0 |
| `test:plugin` | 1060 | 1100 | **1105** | +45 |
| **`npm test` chain** | **1488** | **1528** | **1533** | **+45** |
| `test:attach` | 28 | 28 | 28 | 0 |
| `test:bench` | 258 | 258 | 258 | 0 |
| **Combined** | **1774** | **1814** | **1819** | **+45** |

Plan target was +35 to +40 (Verdict A scope). Actual: **+45** (slight overshoot — Stage 4 polish added +5 regression tests for the MAJOR fixes). Each test asserts a distinct contract.

Remote CI:
- **Stage 2 (`c900050`)** — run `27081819765`: **`success`** on all 4 matrix legs.
- **Stage 3 + 4 + 5 (this commit)** — to be recorded post-push.

---

## Safety invariants preserved

| Invariant | Status |
|---|---|
| `plan-0004-pre-cutover` tag at `7d9b5f1` | unchanged |
| `v0.2.0` tag at `ea595e1` | unchanged (no retag) |
| Plan 0005 status `deferred` | unchanged |
| `packages/plugin-codex/README.md` cost paragraph byte-identical | preserved (`grep -c` = 1 before AND after Stage 2 AND after Stage 4) |
| `tools/bench/**` untouched | preserved |
| `documentation/plan/0004-*` through `0015-*` untouched | preserved |
| `.github/workflows/ci.yml` untouched | preserved |
| `packages/runtime/**` untouched | preserved (CLI pivot avoided the planned runtime exception) |
| `packages/driver-claude-code/**` untouched | preserved (CLI pivot avoided the planned driver exception) |
| Plan 0006 T9.5 cache-execution invariant | preserved (26 derived byte-identical between source + mirror; mirror regenerated via `--write` after Stage 4) |
| No `~/.claude/` or `~/.codex/` mutation | preserved |
| Skill count: 14 (was 13); marketplace allowlist: 26 (was 24); plugin version: `0.2.0` (unchanged) | preserved |

---

## Adaptive scope outcome

Plan 0016 was scoped with verdict-conditioned scope (A/A-partial/B). T1 returned **A-partial with a critical pivot** that the plan's adaptive mechanic correctly absorbed. The original PTY-injection design solved the wrong problem (session-scoped panel doesn't show users' bg jobs). The CLI pivot:
- **Simpler implementation** (no PTY, no ANSI parsing fragility)
- **No documented exceptions** (no driver/runtime touches)
- **More stable** (JSON data path)
- **Actually serves users** (covers their `cc workflow --bg` jobs)

This is the **first plan in the session to absorb a mid-implementation architectural pivot**. The adaptive scope mechanic earned its keep.

Stage 3 audit found 2 MAJOR bugs that Stage 2 unit tests missed — both in the drill-in enrichment path which was the least-tested code path. Stage 4 polish fixed both + a macOS realpath issue surfaced by the new regression tests.

---

## Deferred / future work

- **Interactive workflow control** (pause/resume/restart/save keystrokes for the TUI panel) — Plan 0017+ if maintainer authorizes
- **Skill-discovery surface test** — separate plan
- **v0.3.0 release tag** — separate maintainer step. Plans 0013 + 0014 + 0015 + 0016 together make a strong release candidate.
- **Display-name prose harmonization** — Plan 0014 backlog candidate
- **`_resolveProjectDir` JSDoc accuracy fix** (Stage 3 MINOR-1) — future docs cleanup
- **Full filesystem integration test for `inspectWorkflow`** (Stage 3 MINOR-2) — future polish
- Plan 0004 T11/T12 (paused; ≥ 2026-06-16)
- Plan 0005 (deferred)
- Opus 4.8 probe floor verification
- G7-G10 LOW backlog from Plan 0007 audit

---

## Lessons learned

### Empirical probes can invalidate entire architectural directions

T1's empirical capture discovered that `/workflows` is session-scoped TUI-only — wrapping it via PTY would expose ZERO of Codex users' bg workflow jobs. Without the probe, Plan 0016 would have shipped PTY infrastructure that solved the wrong problem. **Lesson**: when a plan's premise depends on a TUI feature serving a specific use case, probe the use case BEFORE the infrastructure investment.

### Adaptive scope absorbed the pivot cleanly

Plan 0016 1-plan.md described 3 verdicts (A/A-partial/B). The actual T1 outcome was "A-partial with pivot" — a mid-implementation architectural rewrite. The adaptive mechanic absorbed it without requiring a Plan 0016-B refactor cycle. **Lesson**: design plans with adaptive scope branches when probe outcomes are uncertain. The branches don't need to cover every possible pivot, just be permissive enough to allow one.

### Drill-in enrichment paths need their own integration tests

Stage 3 audit found 2 MAJOR bugs in the drill-in path. Both were in code that the Stage 2 dispatcher tests didn't exercise (private helpers, fixture-less behaviors). The dispatcher tests passed; the audit revealed silent breakage. **Lesson**: when shipping an enrichment feature, write a test that exercises the enrichment path end-to-end against a real filesystem fixture — not just the dispatcher exit code.

### macOS `/var/folders` symlinks bite path-equality tests

The Stage 4 cwd-filter regression tests initially failed because macOS resolves tmpdir paths through `/private/var/folders/` while the test stub data used the un-resolved `/var/folders/...` form. `realpathSync` normalization in `_normalizePath` fixed it. **Lesson**: when filtering by filesystem paths, normalize via realpath — never compare raw strings.

### Count math projections can be wrong

Plan 0016 1-plan.md projected 24→25 (skill count +1). Reality was 24→26 (skill + lib mjs both tracked). The orchestrator caught this during Stage 2. **Lesson**: when adding a skill that comes with a new lib file, project the marketplace allowlist delta as +2 (or count derive files explicitly before locking the projection).

### Stage 4 polish is the right disposition for MAJOR findings in a still-shippable plan

Stage 3 audit returned `ready-for-polish` (REVISE), not `needs-redo`. The architecture was sound; only the drill-in path had bugs. Stage 4 polish (a 4-line `_sanitizeCwd` fix + 5-line `--all` wiring + 5 regression tests) was the right scope vs. re-doing Stage 2. **Lesson**: distinguish "architecture has bugs" (Stage 4 polish) from "architecture is wrong" (needs-redo). The verdict scale paid off here.

### Eighth plan, first non-clean audit

Plans 0009, 0010, 0011, 0013, 0015 closed zero-finding. Plans 0012, 0014 closed with 1 MINOR each. Plan 0016 closed with 2 MAJOR + polish. Of all the plans this session, Plan 0016 had the most architectural turbulence (mid-implementation pivot + bugs in the drill-in path). The audit-then-polish cycle handled it cleanly. **Lesson**: trust the audit cycle — even on the 8th plan in a row, fresh-context skepticism catches what familiar implementers miss.

---

## Final verdict

Plan 0016 ships. T1 returned A-partial with a critical pivot; T2-T5 implemented CLI-only architecture; Stage 3 audit returned `ready-for-polish` with 2 MAJOR findings; Stage 4 polish fixed both + a macOS realpath issue surfaced in the regression tests; all standing safety invariants preserved; **1819 tests pass (0 fail)** across all lanes (post-Stage-4 polish); marketplace payload byte-identity intact; cost paragraph byte-identical.

The plugin now ships **14 skills**. The newest, `$claude-workflows`, is the **first read-only inspector** (vs the bg-flow lifecycle skills). It serves a real Codex user need: listing + inspecting workflow sessions started via `cc workflow`. The Claude Code `/workflows` TUI panel is a separate surface for in-TUI workflows; this asymmetry is documented in the SKILL.md.

Plan 0017+ candidates listed in deferred work.
