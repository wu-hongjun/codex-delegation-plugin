# Plan 0024 — Installed-plugin heavy test, Lane C: workflow-style subcommands

- **Date:** 2026-06-15
- **Dispatcher under test:** `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5/scripts/cc.mjs` (installed cache, pluginVersion 0.3.5)
- **Workspace:** `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`
- **Node:** v25.8.2 · **Claude Code:** 2.1.177
- **Scope:** `workflow`, `goal`, `fork`, `batch`, `deep-research`, and `workflows` list/drill-in.
- **Constraints honored:** tiny local prompts only; no web-heavy research (deep-research stopped immediately after spawn); every spawned job stopped; no commit.

## Verdict: **PASS**

All six subcommands plus the read-only `workflows` inspector behave correctly. Attach hints use shortId/session-id language, all JSON outputs parse, and invalid IDs fail clearly with non-zero exit. Two low-severity friction points (cosmetic/inconsistency), no functional defects.

---

## Results matrix

| # | Test | Command | Result |
|---|------|---------|--------|
| T1 | workflows list (current ws, text) | `cc workflows` | PASS — 63 sessions; columns `shortId status kind name`; footer `Run \`cc workflows <sessionId>\` to drill into a session.` |
| T2 | workflows list (JSON) | `cc workflows --json` | PASS |
| T3 | workflows list JSON parse | `… --json \| JSON.parse` | PASS — `sessions=63` (array) |
| T4 | workflows `--all` JSON parse | `cc workflows --all --json` | PASS — `sessions=63`, each has `shortId/kind/status` |
| T5 | drill-in by shortId (text) | `cc workflows 2b741235` | PASS — full sessionId, Name/Kind/Status/CWD/StartedAt, phase records (first 30 JSONL) |
| T6 | drill-in by shortId (JSON parse) | `cc workflows 2c00730b --json` | PASS — `jobId/sessionId/kind=deep_research/status/subagents/phaseRecords` all present |
| T7 | drill-in INVALID id (text) | `cc workflows zzzzbadid123` | PASS — `Error: No workflow found matching job id or session id "zzzzbadid123"`, exit 1 |
| T8 | drill-in INVALID id (JSON) | `… --json` | PASS — `{ok:false, error:{message,name}}`, exit 1 |
| T9 | drill-in NON-workflow job | `cc workflows job_mqfgx3g6` | PASS — `Error: Job "…" is not workflow-inspectable (prompt does not begin with "ultracode: " or "/deep-research ").`, exit 1 |
| T10 | `workflow --help` | — | PASS — usage + `claude attach <shortId>` guidance |
| T11 | `deep-research --help` | — | PASS — usage + workflow-gate note + `claude attach <shortId>` |
| T12 | `workflows --help` | — | PASS — read-only inspector usage |
| T13 | missing prompt ×5 | `cc <sub> --yes --` | PASS — `Error: prompt is required: cc <sub> -- "<prompt>"`, exit 2 (all of workflow/goal/fork/batch/deep-research) |
| T14 | `--allow-edit` rejection ×6 | `cc <sub> --allow-edit -- x` | PASS — `Error: --allow-edit is not applicable to $claude-<sub>.`, exit 2 (workflow/goal/fork/batch/deep-research/workflows) |
| T15 | `result` invalid id (text+JSON) | `cc result zzzbad999` | PASS — `No job found matching "…" in this workspace. Re-run with --all…`, exit 1; JSON `ok:false` |
| T16 | `stop` invalid id (text+JSON) | `cc stop zzzbad999` | PASS — same clear message, exit 1; JSON `ok:false` |
| T17 | `status --job` invalid id (text+JSON) | `cc status --job zzzbad999` | PASS — same clear message, exit 1; JSON `ok:false` |
| S-goal | spawn `goal` + stop | `cc goal --yes -- "…"` | PASS — job block + attach hint; stop `ok:true` → stopped |
| S-fork | spawn `fork` + stop | `cc fork --yes -- "…"` | PASS — attach hint + 20-30k token warning; stopped |
| S-batch | spawn `batch` + stop | `cc batch --yes -- "…"` | PASS — attach hint + batch-orchestration note; stopped |
| S-wf | spawn `workflow` + stop | `cc workflow --yes -- "…"` | PASS — attach hint with **actual** shortId; stopped |
| S-dr | spawn `deep-research` + stop | `cc deep-research --yes -- "…"` | PASS — attach hint with **actual** shortId; stopped immediately (no web work) |
| T18b | `workflow --json` spawn shape | `cc workflow --yes --json -- "…"` | PASS — parses; `ok:true`; `shortId` is 8-char prefix of `sessionId`; `extraOutput` suppressed in JSON; `promptSummary="ultracode: …"` |
| T19 | new wf/dr jobs appear in `workflows` list | `cc workflows --json` | PASS — laneC `workflow` + `deep-research` listed; `goal/fork/batch` correctly absent (not workflow-prefixed) |
| T20 | drill-in fresh workflow job | `cc workflows e2eab918` | PASS — kind=dynamic_workflow, status=stopped |

---

## Attach-hint verification (core requirement)

All attach hints use shortId / session-id language. Two rendering styles observed:

- **`workflow` and `deep-research`** substitute the **live** shortId into a copy-paste-ready command:
  - workflow → `  claude attach e2eab918`
  - deep-research → `  claude attach 57c4b9ec`
- **`goal`, `fork`, `batch`** print a **literal placeholder**: `Attach via \`claude attach <shortId>\` to watch progress.` The real shortId is still visible two lines up (`Claude session: <shortId>` and `Raw logs: claude logs <shortId>`), so it is discoverable, just not inlined.

The standard job block (`formatDelegate`) consistently exposes the shortId via `Claude session:` and `Raw logs: claude logs <shortId>`. In `--json` mode the shortId/sessionId live under `job.claude.{shortId,sessionId}` and `shortId === sessionId.slice(0,8)` (verified T18b).

`--yes` semantics are clearly communicated: workflow & deep-research both print `Note: --yes only acknowledges the plugin privacy prompt; it does not approve <the Claude Code workflow gate>.` — no risk of a user assuming `--yes` auto-approves the dynamic-workflow gate.

## JSON-parse verification

Every JSON surface parsed cleanly: `workflows --json`, `workflows --all --json`, `workflows <id> --json` (drill-in), `workflows <bad> --json` (error envelope), `result/stop/status --json` (success and error), and the `workflow --json` spawn shape. Error envelopes are uniform: `{ "ok": false, "error": { "message", "name" } }`.

## Invalid-ID handling

- `workflows <bad>` → `No workflow found matching job id or session id "<bad>"` (exit 1).
- `workflows <non-workflow job>` → `not workflow-inspectable (prompt does not begin with "ultracode: " or "/deep-research ")` (exit 1) — distinct, more specific message than the not-found case.
- `result/stop/status --job <bad>` → `No job found matching "<bad>" in this workspace. Re-run with --all to search every workspace.` (exit 1) — helpful next-step hint.
- All also emit the structured `ok:false` envelope under `--json`. No stack traces leak to the user.

## Job lifecycle / cleanup

7 jobs spawned this lane (goal, fork, batch, workflow, deep-research, plus two workflow `--json` smoke jobs). **Final sweep across all workspaces: all 7 are `stopped` (NOT_TERMINAL_COUNT=0).** A pre-existing job from a parallel lane (`job_mqfgx3g6_5a3fce35`) was left untouched (still `running`), confirming I only stopped jobs I created.

Spawned job IDs (all stopped):
- `job_mqfh2a5b_1d99a01e` goal
- `job_mqfh2x1n_4a1cc546` fork
- `job_mqfh31u1_487913bc` batch
- `job_mqfh3ek9_6595dc7f` workflow
- `job_mqfh3jtr_65821c7e` deep-research
- `job_mqfh46gy_53ab8a9c` workflow --json smoke #1
- `job_mqfh5ic6_6a565487` workflow --json smoke #2

---

## Friction points

1. **[Low — inconsistency] Attach-hint shortId is inlined for `workflow`/`deep-research` but a literal `<shortId>` placeholder for `goal`/`fork`/`batch`.**
   - `goal/fork/batch` print `claude attach <shortId>` verbatim, requiring the user to copy the shortId from the `Claude session:` line above. `workflow/deep-research` print the ready-to-run `claude attach <actual-shortId>`. Requirement ("attach hints use shortId/session id language") is met by all five, but the inconsistency is a polish gap.
   - Source: `cmdGoal`/`cmdFork`/`cmdBatch` use static `extraOutput` strings (cc.mjs:643,668,693); `cmdWorkflow`/`cmdDeepResearch` use a function form that interpolates `job.claude.shortId` (cc.mjs:614,725). Fix is mechanical: convert the three static strings to the function form.

2. **[Low — cosmetic/data] `workflows` list shows duplicate rows for some sessions.**
   - Several historical entries appear twice with identical `shortId`+name (e.g. `01fffbd7 cc-v031-workflow-survey`, `ae503a1f cc-v031-workflow-json`, plus two `…two-phase` rows). Most likely multiple job records resolving to one Claude sessionId (e.g. follow-up turns creating additional job records). It slightly inflates the `Workflow sessions (N)` count. No functional impact on drill-in (the shortId still resolves). Consider de-duping the list by `sessionId` before render. Pre-existing data from earlier rounds, not introduced by this lane.

3. **[Informational — environment, not a dispatcher defect] `NO_COLOR ignored due to FORCE_COLOR` node warning.**
   - When piping `--json` through a secondary `node -e` parser, a Node warning surfaces on stderr because both `NO_COLOR` and `FORCE_COLOR` are set in this session's env. The dispatcher's own stdout JSON is unaffected (stderr-only; `stderr_bytes=0` from the dispatcher itself in T18b). Belongs to the harness env, noted for completeness.

## Test-harness note (for future lanes — not a dispatcher issue)

Capturing a `--json` payload into a shell variable and re-emitting it with zsh `echo "$out" | node` corrupts escaped `\n` inside embedded probe strings (`capabilitiesSnapshot…claude-auth.detail`), producing a false `SyntaxError: Bad control character`. Direct piping (`cc … --json | node`) or redirecting to a file and reading it back (used in T18b) parses correctly. The dispatcher's JSON is valid; only the `echo` round-trip mangles it. This also silently dropped a jobId extraction once, briefly leaving a spawned job un-stopped until the final sweep caught it — prefer file capture over `$(...)`+`echo` when scripting these spawns.

## Notable good behaviors

- `extraOutput` token-cost warnings are accurate and present where it matters: `fork` warns "20-30k tokens even for trivial directives"; `workflow` warns "up to 16 concurrent agents and 1000 total per run"; `deep-research` describes the web-fanout/verify/synthesize pipeline.
- `workflow` correctly prepends `ultracode: ` (T18b `promptSummary`), which is what triggers Claude Code dynamic-workflow planning; `deep-research` prepends `/deep-research `, `goal` prepends `/goal `, etc.
- The `workflows` inspector is genuinely read-only — it never spawns a subprocess (confirmed by no new jobs appearing after list/drill-in calls) and correctly filters workflow-like jobs by `prompt.summary` prefix, so `goal/fork/batch` jobs are excluded from the workflow list as designed.
- Exit codes are conventional: `2` for usage/argument errors (missing prompt, `--allow-edit`), `1` for runtime/not-found errors, `0` for success.
