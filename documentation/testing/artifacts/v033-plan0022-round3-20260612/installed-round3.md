# Plan 0022 Round 3 Installed Retest

Date: 2026-06-12

Installed target:
- `cc@cc-plugin-codex-local` 0.3.3
- Installed root: `/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3`
- Marketplace source: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc`

Environment:
- `claude --version`: 2.1.176 (Claude Code)
- `codex --version`: codex-cli 0.137.0
- OS: macOS 26.5.1 (25F80), arm64

Install and cache verification:
- `codex plugin remove cc@cc-plugin-codex-local`: removed installed plugin.
- `codex plugin marketplace add "$(pwd)/marketplace"`: marketplace already registered at this checkout.
- `codex plugin add cc@cc-plugin-codex-local`: installed plugin root refreshed at `~/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3`.
- Installed cache contains `NON_ID_TOKENS` in bundled driver dist.
- Installed cache contains `shouldRepairPseudoShortId` in bundled runtime dist.
- `cc setup --json`: `ok:true`, aggregate `warn` only from the known `claude-bg-flag` help omission; delegate/followup capabilities `ok`.

Local verification:
- `npm run build`: pass.
- Focused test run:
  `node --test packages/driver-claude-code/test/start-session.test.mjs packages/runtime/test/reconciler.test.mjs packages/plugin-codex/test/dispatcher.test.mjs packages/plugin-codex/test/workflows-inspector.test.mjs`
  passed 351 tests, 0 failed.
- `node tools/package-marketplace.mjs --check`: pass.
- `git diff --check`: pass.

Claude lane summary:

| lane | parent job | focus | verdict |
| --- | --- | --- | --- |
| A | `job_mqbh2kwz_bb3b389b` | nested `shortId:"claude"` fix | PASS |
| B | `job_mqbh2krt_6e69507b` | delegate/result/followup/review/status | PASS core |
| C | `job_mqbh2kmh_dd74b13e` | F1/F2/F3 and edge cases | PASS |
| D | `job_mqbh2l2b_ae78f165` | workflow/fork/batch/deep-research/workflows | PASS launch/classification/cleanup |

Regression evidence:

- Nested shortId:
  - Child job `job_mqbh3eb7_f233c81f`
  - `sessionId`: `211378f6-3236-4abc-9b62-bd4634cd11ad`
  - `shortId`: `211378f6`
  - `logsCommand`: `claude logs 211378f6`
  - Result marker: `P22_R3_NESTED_CHILD_OK`
  - Stop: `ok:true`, final status `stopped`

- Followup/review:
  - Child job `job_mqbh349v_f9169060`
  - Initial marker: `P22_R3_B_INITIAL`
  - Followup marker: `P22_R3_B_FOLLOWUP`
  - Review turn completed with `verdict: pass`, `findings: []`
  - Final status after cleanup: `stopped`

- F1 rapid no-name delegates:
  - `job_mqbh6po6_0e09d9c6`: `P22_R3_C_A`, shortId `c85f2802`
  - `job_mqbh6pn3_9e2e5bc5`: `P22_R3_C_B`, shortId `0b106ced`
  - `job_mqbh6pnn_cdd87995`: `P22_R3_C_C`, shortId `0c59a49c`
  - Distinct job IDs, session IDs, and shortIds; no marker cross-contamination observed.

- F2 ID-shaped name:
  - `job_mqbh7bw7_e123f0cb`
  - Session name: `my-test-session-abc-c919e80a`
  - `shortId`: `0ba0c261`
  - Result marker: `P22_R3_C_NAME`
  - PASS: shortId is real hex, not the name.

- F3 and edge cases:
  - Lane C reported `status <realJobId>` and `status bogus-id` rejected with exit 2 guidance.
  - Empty delegate prompt and non-TTY piped delegate were rejected cleanly without job creation.

- Heavy wrappers:
  - Workflow `job_mqbh370z_7e628cc7`: `kind: dynamic_workflow`, status reached `awaiting_followup`, workflows drill-in parsed with phase records.
  - Fork `job_mqbh3bnv_edfebf39`: completed read-only cwd report.
  - Batch `job_mqbh3g91_73ce6234`: launched and completed bounded read-only response.
  - Deep-research `job_mqbh3kx9_3a09e3f6`: `kind: deep_research`, status reached `awaiting_followup`; trivial "capital of France" prompt returned direct answer and did not fan out, which is expected for a too-simple query.

Cleanup:
- Every round-3 job record listed above is `stopped`.
- `claude stop a9871bf1` returned `stopped a9871bf1` twice, and the original PID was absent from `ps`.
- Caveat: `claude agents --json` continued to show a PID-less stale record for Lane D parent `a9871bf1` with `state:"working"` after successful stops. The plugin job record is `stopped`; this looks like a Claude agents listing stale-state issue, not a cc-plugin job-store issue.

Findings:
- Blocker: none.
- High: none.
- Medium: none.
- Low: stale PID-less `claude agents` row for the already-stopped Lane D parent.
