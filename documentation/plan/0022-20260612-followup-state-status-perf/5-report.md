# Plan 0022 Stage 5 - Report

**Status**: complete
**Date**: 2026-06-12
**Scope**: installed friction polish after the depth-test verification

## Subagent Inputs

Four read-only subagents tested the installed plugin from the perspective of Codex using Claude Code and then produced fix guidance:

- `documentation/testing/artifacts/v033-plan0022-friction-20260612/fix-agent-adversarial-result.md`
- `documentation/testing/artifacts/v033-plan0022-friction-20260612/fix-agent-json-status.md`
- `documentation/testing/artifacts/v033-plan0022-friction-20260612/fix-agent-followup-preview.md`
- `documentation/testing/artifacts/v033-plan0022-friction-20260612/fix-agent-workflow-inspector.md`

The raw friction summary is `documentation/testing/artifacts/v033-plan0022-friction-20260612/friction-summary.md`.

## Changes

- Runtime now writes immutable per-turn result snapshots via `getJobTurnResultPath(jobId, turnIndex)`, while keeping `<jobId>.result.md` as the latest-result compatibility alias.
- Reconciliation no longer mirrors a previous turn's result onto a newly appended turn when no fresh result evidence belongs to that turn.
- Adversarial review reads touched files from the selected turn and refuses older legacy turns whose result still points at the mutable latest-result path.
- JSON automation gained `--compact` and `status --job <jobId-or-prefix>`, with compact output avoiding driver capability snapshots, workspace paths, raw prompt metadata, and usage snapshots.
- Immediate `followup` output now marks stale previews explicitly instead of presenting a previous turn's preview as the new answer.
- Workflow/deep-research command output and help now use the real Claude session short ID for `claude attach`, state that `--yes` does not approve Claude Code workflow gates, and let `cc workflows` inspect `/deep-research` workflow-like jobs.
- Round-2 installed retest fix: nested Claude Code launches no longer persist `claude.shortId:"claude"`; the parser skips CLI words in `claude --bg` output and the reconciler repairs existing pseudo-ID records from `sessionId`.

## Verification

- `npm run build` - pass.
- `node --test packages/runtime/test/job-store.test.mjs packages/runtime/test/reconciler.test.mjs` - pass.
- `node --test packages/plugin-codex/test/workflows-inspector.test.mjs` - pass.
- `node --test packages/plugin-codex/test/dispatcher.test.mjs` - pass.
- `node --test packages/plugin-codex/test/readme.test.mjs packages/plugin-codex/test/skills-manifest.test.mjs` - pass.
- `npm run lint` - pass.
- `npm run typecheck` - pass.
- `npm exec -- prettier --check` on touched source, test, README, and skill files - pass.
- `node tools/package-marketplace.mjs --check` - pass.
- `npm test` - pass.
- Installed cache refresh from the local marketplace - pass.
- Installed smoke for cached dispatcher help, `status --job --json`, `status --json --compact`, and `workflows --json` kind classification - pass.
- Installed nested smoke for the `shortId:"claude"` fix - pass: child job `job_mqbff163_528a66a9` stored shortId `1861b2c2`, `logsCommand` used `claude logs 1861b2c2`, and `cc stop` succeeded.

## Release State

No version bump, release commit, tag, or push was made. This remains a current-version fix pass against v0.3.3 source and regenerated marketplace output.
