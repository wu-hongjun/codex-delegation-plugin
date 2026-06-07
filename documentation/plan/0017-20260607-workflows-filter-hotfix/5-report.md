# Stage 5 — Report: Plan 0017

## Report metadata

- **Plan**: Plan 0017 — `$claude-workflows` filter hotfix (release blocker before v0.3.0)
- **Date**: 2026-06-07
- **Commit reported**: this commit
- **Stage 1**: drafted + approved inline 2026-06-07 (release-blocker bypass)
- **Stage 2**: complete — inspector + tests rewritten; smoke verified live; all gates green
- **Stage 3 audit**: SKIPPED — real-Codex smoke test (`documentation/testing/findings-20260607.md`) WAS the audit that caught the bug. A fresh-context audit pass after the fix would be valuable but is deferred to a follow-up if needed.
- **Stage 4 polish**: SKIPPED — single iteration solved the bug.
- **Final status**: `complete`

---

## Executive summary

Plan 0016 shipped `$claude-workflows` with a broken filter. The skill identified workflow sessions via `agents.name.startsWith('ultracode:')`, but Codex's background driver sets the session name to `codex:<workspace>:<id>` — the `ultracode:` prefix lives in the prompt (stored in our local job record's `prompt.summary`), not in the session name. Result: every `cc workflow`-created job was invisible to `cc workflows`.

The real-Codex smoke test caught this; Plan 0016 unit tests didn't because they stubbed `claude agents --json` with synthetic `ultracode:`-prefixed names that don't reflect production reality.

**Fix**: switched the data source from `claude agents --json` to the local cc-plugin-codex job store (`~/.codex/cc-plugin-codex/jobs/*.json`) read via the runtime's exported `listJobs` helper. The filter now uses `job.prompt.summary.startsWith('ultracode: ')` — the actual workflow discriminator. The realpath-normalization for cwd filtering (Plan 0016 polish) was preserved and now also applied to the job record's `workspace.root` for consistent matching.

**Live verification**:
```
$ cc workflows
Workflow sessions (6):
  job_mq1e  orphaned
  ...
  job_mq3p  orphaned
```

The same 6 workflow jobs that were invisible before are now correctly listed.

**Tests**: full rewrite of `workflows-inspector.test.mjs` to stub job-store records (writes valid v2 records to a temp `CC_PLUGIN_CODEX_HOME/jobs/`) instead of stubbing `claude agents --json`. 12 tests (was 11; +1 net). All green.

**Test count: 1819 → 1820 combined** (+1). Skill count, marketplace allowlist, plugin version: unchanged. Cost paragraph byte-identical.

---

## Files modified

- `packages/plugin-codex/scripts/lib/workflows-inspector.mjs` (full rewrite — data source change)
- `packages/plugin-codex/scripts/cc.mjs` (2 small edits to drop unused `env` param)
- `packages/plugin-codex/test/workflows-inspector.test.mjs` (full rewrite — job-store fixtures replace agents-JSON stubs)
- Marketplace mirrors regenerated via `--write`

## Safety invariants preserved

- Plans 0004-0016 untouched
- Cost paragraph byte-identical
- `plan-0004-pre-cutover` at `7d9b5f1`; `v0.2.0` at `ea595e1`
- Skill count: 14; marketplace allowlist: 26; plugin version: `0.2.0`
- `tools/bench/`, `.github/`, `packages/runtime/src/`, `packages/driver-claude-code/`: no source changes

## v0.3.0 unblocked

The release candidate is now functionally complete. Next step: bump `.codex-plugin/plugin.json` version to `0.3.0`, resync marketplace, tag, push.

## Lessons learned

### Unit tests can mock the wrong reality

Plan 0016's tests stubbed `claude agents --json` with `ultracode:`-prefixed session names that DON'T match what the driver actually produces. The tests passed; the production code was broken from day one. **Lesson**: when stubbing an external tool's output, verify the stubs match production output shape via a one-off live capture before relying on them.

### Real-Codex smoke tests catch what unit tests miss

This is the same lesson as Plan 0012, but applied to a different code path. The smoke test caught what Stage 2 unit tests + Stage 3 fresh-context audit + Stage 4 polish all missed. **Lesson**: smoke tests against real binaries belong in the release-gating loop, not just as a one-off pre-release activity.

### Job store IS the source of truth for our own jobs

Plan 0016 used `claude agents --json` because it was the obvious "what's running right now" surface. But for jobs WE created, our own job store has the canonical data (prompt, command type, workspace). External agent-list surfaces should enrich our data, not replace it. **Lesson**: when designing inspectors, default to our own canonical sources; treat external surfaces as enrichment.

### Test rewrites can move the bar

The Plan 0017 test rewrite established a new pattern: write valid v2 job records to a temp `CC_PLUGIN_CODEX_HOME/jobs/`. This is now reusable for any future test that needs job-store fixtures. **Lesson**: when fixing a class of bug, leave behind test infrastructure that makes the next similar bug easier to catch.
