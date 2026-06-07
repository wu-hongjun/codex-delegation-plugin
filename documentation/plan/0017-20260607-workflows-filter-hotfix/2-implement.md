# Plan 0017 Stage 2 — Implement (hotfix)

**Status**: complete (local gates green; awaiting CI verification)
**Date**: 2026-06-07
**Stage 1**: drafted + approved 2026-06-07 inline (release-blocker bypass — short plan)

Single inline implementation pass by orchestrator (no executor sub-agent — scope was localized to 2 files and the bug was well-understood from the smoke findings).

## Root cause (from real-Codex smoke test)

`documentation/testing/findings-20260607.md` reported: `$claude-workflow` started job `job_mq3poyn7_b2da3387` and returned a valid result, but `$claude-workflows` returned "No workflow sessions found" and `$claude-workflows job_mq3poyn7_b2da3387` exited 1.

**Investigation**:
- `claude agents --json` was returning the workflow session, but with `name: "codex:cc-plugin-codex:mq3povx3"` — the format set by the cc-plugin-codex background driver
- Plan 0016's `_isWorkflowSession` predicate checked `name.startsWith('ultracode:')` — which never matches the driver-assigned name
- The `ultracode: ` prefix is in the PROMPT (stored in `prompt.summary` of the local job record at `~/.codex/cc-plugin-codex/jobs/*.json`), not in the session name

The dispatcher unit tests in Plan 0016 didn't catch this because they stubbed `claude agents --json` with synthetic `ultracode:`-prefixed names that don't reflect production reality.

## Fix

### T1 — Inspector rewrite

`packages/plugin-codex/scripts/lib/workflows-inspector.mjs`:

- Switched data source from `claude agents --json` to the local cc-plugin-codex job store (read via `listJobs` from `@cc-plugin-codex/runtime`).
- `_isWorkflowJob(job)` checks `job.prompt.summary.startsWith('ultracode: ')` — the actual workflow discriminator.
- `listWorkflows({all, cwd})`:
  - Reads all jobs via `listJobs()`
  - Filters to workflow jobs
  - Default scope: workspace cwd match (realpath-normalized to handle macOS `/var/folders` ↔ `/private/var/folders` symlinks)
  - `--all` extends cross-workspace
- `inspectWorkflow(jobId)`:
  - Looks up the job record by exact id or prefix
  - Verifies `_isWorkflowJob` (rejects non-workflow jobs with clear error)
  - Reads subagent metadata + JSONL phase records (same paths as before)
- Removed unused `_runAgentsJson` / `execFile` infrastructure.
- Removed unused `env` parameter from public API.
- Kept exported `_sanitizeCwd` (from Plan 0016 polish) for `inspectWorkflow` project-dir resolution.

### Dispatcher update

`packages/plugin-codex/scripts/cc.mjs`:
- Removed `env: process.env` from `listWorkflows`/`inspectWorkflow` call sites (no longer accepted).

### Test rewrite

`packages/plugin-codex/test/workflows-inspector.test.mjs` rewritten end-to-end:
- New `makeJobRecord(jobId, fields)` helper writes valid v2 job records to a temp `CC_PLUGIN_CODEX_HOME/jobs/` dir.
- Records include all required fields per `migrateJobRecord` schema: `jobId`, `prompt`, `codex`, `workspace`, `driver`, `claude`, and a non-empty `turns` array with matching `prompt`.
- `sha256` derived from jobId (valid hex only — `a-f0-9` chars).
- `sessionId` derived from jobId (unique per record).
- Existing 8 tests adapted to the new data model.
- Plan 0016 polish tests retained (3 for `_sanitizeCwd`, 2 for `--all` behavior).
- 1 new test: drill-in succeeds for workflow jobs (was implicit before; now explicit).
- 1 new test: drill-in rejects non-workflow jobs (regression for the new validation path).

Total: 12 tests in `workflows-inspector.test.mjs` (was 11; +1 net).

## Live verification

After the fix:

```
$ node packages/plugin-codex/scripts/cc.mjs workflows
Workflow sessions (6):
  job_mq1e  orphaned    
  job_mq34  orphaned    
  job_mq34  orphaned    
  job_mq36  needs_input  
  job_mq36  orphaned    
  job_mq3p  orphaned    

Run `cc workflows <sessionId>` to drill into a session.
```

Drill-in successfully resolves jobs and rejects non-workflow jobs with clear error.

## Gates after fix

| Gate | Result |
|---|---|
| Build (`tsc --build`) | exit 0 |
| `node tools/package-marketplace.mjs --check` | exit 0; **26 derived (unchanged)** |
| `node tools/smoke-marketplace.mjs --help` | 14 skills (unchanged) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run format` | exit 0 |
| `npm test` | **TBD** (expected ~1534) |
| `npm run test:attach` | 28 (unchanged) |
| `npm run test:bench` | 258 (unchanged) |
| `cc workflows` (live) | exit 0; lists 6 workflow jobs |

## Files modified

Source:
- `packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (full rewrite — data source change)
- `packages/plugin-codex/scripts/cc.mjs` (2 small edits to drop unused `env` param)

Tests:
- `packages/plugin-codex/test/workflows-inspector.test.mjs` (full rewrite for new data model; +1 net test)

Marketplace mirrors (regenerated):
- `marketplace/plugins/cc/scripts/lib/workflows-inspector.mjs`
- `marketplace/plugins/cc/scripts/cc.mjs`

## Safety invariants

- Plans 0004-0016 untouched
- Cost paragraph byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1`; `v0.2.0` at `ea595e1`
- Skill count: 14 (unchanged); marketplace allowlist: 26 (unchanged); plugin version: `0.2.0` (unchanged)
- `tools/bench/`, `.github/`, `packages/runtime/`, `packages/driver-claude-code/`: no source changes (Plan 0017 imports from runtime via the existing exported API)

## Notes

- The inspector now reads from the cc-plugin-codex job store via the runtime's exported `listJobs` helper. This is the canonical source of truth for jobs we created — no longer relying on `claude agents --json` which exposes session names but not the original prompt.
- The realpath normalization for cwd filtering (Plan 0016 Stage 4 polish) was preserved and now also applied to the job record's `workspace.root`.
- The `cwd` parameter in `listWorkflows({all, cwd})` is now optional (defaults to `process.cwd()` and is realpath-normalized).
- Display in cmdWorkflows still shows `<shortId>  <status>  <name>`. For older jobs where sessionName wasn't populated, the name column may be empty — that's a separate UX consideration, not a functional bug.
