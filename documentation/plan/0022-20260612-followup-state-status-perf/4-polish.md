# Plan 0022 Stage 4 — Polish

**Status**: complete
**Date**: 2026-06-12
**Scope**: installed depth-test follow-up

## Finding

The installed v0.3.3 depth test found one plugin-side medium issue after the main
Plan 0022 implementation: in a fresh TTY workspace, `delegate --json -- <prompt>`
without `--yes` launched immediately and silently recorded the privacy
acknowledgement. The non-TTY path already failed closed with the disclosure text.

## Change

- Updated `packages/plugin-codex/scripts/lib/ack.mjs` so `resolveWorkspaceAck`
  no longer treats TTY status as acknowledgement. An ack is satisfied only by an
  existing workspace ack file or explicit `--yes`.
- Added `ensureWorkspaceAck` in `packages/plugin-codex/scripts/cc.mjs`.
  It prompts on TTY, records the ack only after an explicit `yes`, and writes
  the prompt to stderr so `--json` stdout remains reserved for command JSON.
- Routed delegate/workflow/goal/fork/batch/deep-research, followup, review, and
  adversarial-review ack checks through the shared helper.
- Added PTY regression coverage for the exact installed-run failure mode:
  a fresh TTY `delegate --json` declines without creating an ack/job, and
  proceeds only after an explicit `yes`.
- Regenerated marketplace output and refreshed the local installed cache.

## Verification

- `node --test --test-name-pattern "delegate privacy acknowledgement|delegate without --yes|T12-8|workflow without --yes|goal without --yes|fork without --yes|batch without --yes|deep-research without --yes" packages/plugin-codex/test/dispatcher.test.mjs` — pass, 9/9.
- `node --test packages/plugin-codex/test/dispatcher.test.mjs` — pass, 235/235.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `node tools/package-marketplace.mjs --check` — pass.
- `npx prettier --check` on touched tracked files — pass.
- `npm test` — pass, including mock/runtime/driver/plugin suites.
- Installed cache smoke:
  - Fresh PTY decline path printed the privacy acknowledgement, accepted `no`,
    exited 1, and created no job.
  - Fresh PTY accept path printed the acknowledgement, accepted `yes`, created
    `job_mqap6jx2_70413b0d`, then `stop job_mqap6jx2_70413b0d --all --json`
    set it to `stopped`.
