# Nested `shortId:"claude"` Fix

Date: 2026-06-12

## Fix

The round-2 installed retest found that cc jobs launched from inside Claude Code
could persist `claude.shortId: "claude"` instead of the real session prefix. That
broke `cc stop`, `logsCommand`, attach guidance, and attach-lock scoping.

Changes:

- Hardened the Claude Code `--bg` short-id parser so it no longer treats CLI
  words such as `claude`, `agents`, `attach`, or `logs` as session IDs.
- Preserved support for normal current IDs, including all-letter 8-hex IDs such
  as `deadbeef`.
- Added a runtime reconciler repair path for records already created with
  `shortId:"claude"`: when status returns a real `sessionId`, the job's
  `claude.shortId` and default `logsCommand` are rewritten to the first 8 hex
  chars of that session ID.

## Source Tests

- `node --test packages/driver-claude-code/test/start-session.test.mjs` - pass.
- `node --test packages/runtime/test/reconciler.test.mjs` - pass.
- `node --test packages/driver-claude-code/test/start-session.test.mjs packages/driver-claude-code/test/agents-json.test.mjs packages/driver-claude-code/test/stop.test.mjs` - pass.
- `node --test packages/runtime/test/reconciler.test.mjs packages/runtime/test/job-store.test.mjs` - pass.
- `npm run lint` - pass.
- `npm run typecheck` - pass.
- `npm exec -- prettier --check` on touched source/test files - pass.
- `node tools/package-marketplace.mjs --check` - pass.

## Installed Smoke

Refreshed install:

```sh
codex plugin remove cc@cc-plugin-codex-local
codex plugin marketplace add "$(pwd)/marketplace"
codex plugin add cc@cc-plugin-codex-local
```

Cached code evidence:

- Installed driver dist contains `NON_ID_TOKENS`.
- Installed runtime dist contains `shouldRepairPseudoShortId`.

Live nested smoke:

- Controller job: `job_mqbfepmv_ab70be6d`, shortId `edcc6621`.
- Nested child job launched from inside Claude Code: `job_mqbff163_528a66a9`.
- Nested child result: `P22_FIX_NESTED_CHILD_OK`.
- Nested child `claude.shortId`: `1861b2c2`.
- Nested child `claude.sessionId` prefix: `1861b2c2`.
- Nested child `logsCommand`: `claude logs 1861b2c2`.
- `cc stop job_mqbff163_528a66a9 --all --json --compact` succeeded and set the child job to `stopped`.

Final cleanup:

- Controller job was stopped, then its live idle session was cleared directly with `claude stop edcc6621`.
- Final `claude agents --json` check found no `p22-fix-nested`, `job_mqbff163`, `job_mqbfepmv`, `1861b2c2`, or `edcc6621` matches.
