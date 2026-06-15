# Plan 0024 Stage 2 - Implement

**Status**: complete
**Date**: 2026-06-15
**Commit basis**: main after v0.3.5.

## Work Log

- Filed the Plan 0024 ticket set from the parity audit.
- Spawned four Claude Code subagents, one per ticket, for parallel investigation
  and implementation proposals.
- Implemented T1 in the main tree:
  - `parseArgs` now fails closed on unknown flags.
  - `--dangerously-skip-permissions` aliases
    `--permission-mode bypassPermissions`.
  - Permission modes are validated before spawning Claude.
  - Fresh-session startup flags for tools, agents, settings, system prompts,
    plugin dirs/URLs, MCP strictness, browser/IDE toggles, and safe/bare modes
    are forwarded through runtime and driver layers.
- Implemented T2:
  - `claude agents --json` `waitingFor`/`state` variants are parsed and
    normalized.
  - Reconciler persists `claude.waitingFor` while a job is `needs_input` and
    clears stale waiting detail after the job resumes.
  - Human and compact JSON status output expose the waiting detail and attach
    hint.
- Implemented T3:
  - Reconciler extracts touched files from mutating tool events
    (`Edit`, `MultiEdit`, `Write`, `NotebookEdit`) while excluding failed
    edits.
  - `review` and `adversarial-review` accept `--blocking` and
    `--fail-on <gate>`.
  - Review JSON now includes `review.blocking` for the same high/blocker/fail
    threshold used by `--blocking`.
- Implemented T4:
  - Added root `install.sh` bootstrapper.
  - Added one-command install docs and explicit marketplace fallback.
  - Fixed attach docs to use Claude short/session ids.
  - Replaced stale `claude-companion` bundled-path `.gitignore` negations with
    `cc` paths.
- Regenerated the marketplace bundle after source/docs changes.
- Removed stopped Plan 0024 Claude scratch worktrees after their useful changes
  had been folded into the main tree; otherwise repo-wide lint scanned the
  nested worktrees.

## Subagents

- T1: `job_mqfez1fa_c674dc8f` / `2f301bea`
- T2: `job_mqfez1ge_3b2ba07f` / `37e1b082`
- T3: `job_mqfez1fh_14558099` / `e5fb3278`
- T4: `job_mqfez1gk_df0bb05e` / `0ae90703`

All Plan 0024 Claude Code sessions were stopped after their work was collected.
T1 and T4 created scratch worktrees; T4's installer/docs work was folded into
the main tree, then both worktrees were removed.

## Verification

- `node --test --test-name-pattern "delegate flag parsing parity" packages/plugin-codex/test/dispatcher.test.mjs`
- `node --test packages/plugin-codex/test/dispatcher.test.mjs`
- `node --test --test-name-pattern "review JSON blocking field|T4-3|T6-4|Plan 0024: --fail-on" packages/plugin-codex/test/dispatcher.test.mjs`
- `npm run lint`
- `npm run typecheck`
- `npm run format`
- `npm test`
- `npm run test:attach`
- `node tools/package-marketplace.mjs --check`

Final full verification was rerun after marketplace regeneration and Plan 0024
documentation updates.
