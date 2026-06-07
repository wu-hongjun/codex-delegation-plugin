# Plan 0017 Stage 1 — Plan (hotfix)

**Plan**: Plan 0017 — `$claude-workflows` filter hotfix
**Status**: approved (release blocker)
**Date**: 2026-06-07

## 1. Background

Plan 0016 shipped `$claude-workflows` with `_isWorkflowSession` filter checking `agents.name.startsWith('ultracode:')`. Real-Codex smoke test (`documentation/testing/findings-20260607.md`) revealed the filter never matches: Codex's background driver sets `name = "codex:<workspace>:<id>"`, NOT `"ultracode:..."`. The `ultracode:` prefix is in the PROMPT, stored in `prompt.summary` of our own job record at `~/.codex/cc-plugin-codex/jobs/*.json`.

**Impact**: every `cc workflow`-created job is invisible to `cc workflows`. The list path returns "No workflow sessions found"; the drill-in path returns "No session found matching jobId". Plan 0016 audit's MAJOR-1 and MAJOR-2 fixes did not surface this because tests stubbed agents JSON with synthetic `ultracode:`-prefixed names that don't match reality.

## 2. Scope

**In**:
- T1: rewrite `_isWorkflowSession` (and surrounding `listWorkflows`/`inspectWorkflow`) to use the job store as the data source. Filter by `prompt.summary.startsWith('ultracode: ')`. Use job record's `sessionId`, `cwd`, `status` fields directly (no need to round-trip through `claude agents --json` for list operations).
- T2: rewrite existing `workflows-inspector.test.mjs` to stub job-store records on disk instead of stubbing `claude agents --json`. Same coverage, different data source.
- T3: gates + CI

**Out**:
- Skill API changes (the SKILL.md and dispatcher stay as-is from user's perspective)
- v0.3.0 release (separate step after Plan 0017 closes)
- Any non-workflow related fixes

## 3. T-task design

### T1 — Inspector rewrite

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs`:

- Drop `_runAgentsJson` and `agents`-based filter
- Import `listJobsForWorkspace` from runtime (or read job files directly — simpler since runtime API may have other concerns)
- `listWorkflows({all, cwd, env})`:
  - Read job records from `~/.codex/cc-plugin-codex/jobs/*.json`
  - Filter to records where `prompt.summary` starts with `ultracode: `
  - Apply cwd filter (default current workspace; `--all` cross-workspace) on `workspace.root` (job record field)
  - Map to summary records (sessionId, name, status, cwd, startedAt, pid placeholder)
- `inspectWorkflow(jobId, {env})`:
  - Read the job record at `~/.codex/cc-plugin-codex/jobs/<jobId>.json`
  - Verify `prompt.summary` starts with `ultracode: `
  - Read `~/.claude/projects/<sanitized-cwd>/<sessionId>/subagents/*.meta.json` for per-subagent data
  - Read first 30 lines of session JSONL for phase records
  - Return enriched detail

### T2 — Test rewrite

`packages/plugin-codex/test/workflows-inspector.test.mjs`:

- Add a `JOBS_DIR` constant per test (under tmpdir)
- Add `makeJobRecord(jobsDir, {jobId, sessionName, cwd, prompt, status})` helper
- Set `CC_PLUGIN_CODEX_HOME` env var to the test tmpdir so the inspector reads from there
- Existing tests that stubbed agents JSON: convert each to write a corresponding job record fixture instead
- Keep `_sanitizeCwd` and `--all`/realpath tests as-is

### T3 — Gates

- Marketplace `--check` exit 0; 26 derived (unchanged)
- All test lanes pass
- Live verify: `cc workflows` should now list workflow jobs on this machine

## 4. Risks

- **R1**: env var for job home isn't read by the inspector. Mitigation: check how runtime reads it; mirror.
- **R2**: existing tests fail in unexpected ways during rewrite. Mitigation: small commits per test.
- **R3**: real job records have schema variations the rewrite doesn't handle. Mitigation: tolerate missing fields gracefully (return empty enrichment).

## 5. Acceptance criteria

- `cc workflows` correctly lists `cc workflow`-created jobs on this machine
- `cc workflows <jobId>` correctly drills into a workflow with non-empty enrichment if subagents exist
- All gates green
- v0.3.0 unblocked
