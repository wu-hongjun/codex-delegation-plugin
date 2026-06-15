# cc v0.3.3 Plan 0022 Friction Summary

Date: 2026-06-12

Dispatcher under test:
`/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.3/scripts/cc.mjs`

This pass used four Codex subagents plus one coordinator smoke to test the
installed plugin as a Codex user trying to use Claude Code. Source files were
not edited during this friction pass. The per-lane artifacts are:

- `agent-natural-delegate.md`
- `agent-review-ergonomics.md`
- `agent-fanout-ergonomics.md`
- `agent-automation-errors.md`

## Cleanup

All jobs started by this friction pass were stopped by exact ID. Final exact-ID
sweep:

```text
statusAllCount=298
checkedJobCount=15
activeCheckedJobCount=0
```

Checked jobs:

- `job_mqay5thy_7db6c560` coordinator delegate/followup
- `job_mqay6pvt_e46fbba7`, `job_mqay6q50_626ee75c`, `job_mqay8euh_bee85f43`
- `job_mqayagce_ce149525`
- `job_mqay6joa_7d042ccc`, `job_mqay922m_be7398e8`, `job_mqayb4g6_6d4c9540`
- `job_mqay896b_69adf038`, `job_mqayalob_b5913fe7`, `job_mqaybyps_1c57f0b3`, `job_mqayd8h2_97448468`, `job_mqayelm0_fb81ba64`, `job_mqayfxhe_89e94bde`
- prior installed smoke cleanup rechecked: `job_mqap6jx2_70413b0d`

## Findings

### High: adversarial-review can read the wrong reviewed output after same-session review

Evidence:

- Source job: `job_mqay6joa_7d042ccc`.
- Same-session reviews added turns 1 and 2.
- The job record now has turns 0, 1, and 2 all pointing at the same mutable result path:
  `/Users/hongjunwu/.codex/cc-plugin-codex/jobs/job_mqay6joa_7d042ccc.result.md`.
- Adversarial review jobs `job_mqay922m_be7398e8` and `job_mqayb4g6_6d4c9540` both recorded
  `reviewOf: { jobId: "job_mqay6joa_7d042ccc", turnIndex: 0 }`.
- Their findings nevertheless discussed "the verdict", "meta-review", and missing evidence for a review artifact, matching the overwritten same-session review result rather than the original delegate output.

Impact:

Adversarial review can silently evaluate a later review verdict while metadata says it reviewed the original turn. That undermines the main purpose of independent second-opinion review.

Likely fix:

Make turn outputs immutable. Each turn should get a turn-specific result path, or adversarial-review must read a preserved per-turn result snapshot rather than the job-level result file. Same-session review should not overwrite the only durable path for prior turns.

### High: success JSON is too verbose and includes sensitive diagnostic metadata

Evidence:

- Coordinator `delegate --json` and `result --json` returned full job records, including nested driver capability snapshots.
- Those snapshots include health probe evidence such as Claude auth JSON with email/org metadata.
- `status --json` in this workspace was measured at about `1,387,777` bytes; another lane measured `1,413,534` bytes and 279 jobs.
- A normal Node `execFileSync(..., { encoding: "utf8" })` call failed with `ENOBUFS` while trying to parse `status --json`.

Impact:

Codex automation needs simple fields (`ok`, `jobId`, `status`, `shortId`, result text, maybe turn summaries). The current payload is expensive to parse, easy to buffer-overflow, and risky to paste into logs.

Likely fix:

Add compact JSON output by default or as a new flag, for example `--json --compact`, and reserve full job records for `--verbose-json` or `--debug-json`. Redact auth probe details from persisted job records or formatter output.

### Medium: immediate followup output is stale and internally confusing

Evidence:

- Coordinator job `job_mqay5thy_7db6c560`.
- `followup --json` returned:
  - `job.status: "running"`
  - `turn.index: 1`
  - `turn.status: "completed"`
  - `finalMessagePreview: "P22_FRICTION_COORD_READY"` from the previous turn.
- A later `result --json` poll corrected turn 1 to `P22_FRICTION_COORD_FOLLOWUP_OK`.
- Natural delegate lane reproduced the same stale-preview shape on `job_mqay6pvt_e46fbba7`.

Impact:

Automation cannot trust immediate followup JSON as the final answer for the turn. It must always poll again, and the current response does not say that clearly.

Likely fix:

If the new turn has not been reconciled, report it as `running`/`pending_result` and omit `finalMessagePreview`, or include an explicit `stalePreview: true` / `previousTurnPreview` field.

### Medium: no concise status-by-ID query

Evidence:

- `status <jobId>` is intentionally rejected and points users to `result <jobId>` or `status --all`.
- Exact cleanup verification required parsing the entire workspace/global status JSON and filtering locally.
- In this workspace, that means parsing roughly 1.4 MB of JSON for a single job.

Impact:

Codex needs a cheap "what is this exact job doing now?" primitive. `result <jobId>` is not equivalent because it errors for active jobs and may return full result payloads.

Likely fix:

Keep `status <jobId>` rejection for compatibility if needed, but add an explicit non-ambiguous form such as `status --job <jobId-or-prefix> [--all] [--json]`.

### Medium: workflow/deep-research approval gates block unattended fan-out

Evidence:

- `fork` (`job_mqay896b_69adf038`) and `batch` (`job_mqayalob_b5913fe7`) created real sidechain subagents.
- `$claude-workflow` jobs `job_mqaybyps_1c57f0b3` and `job_mqayd8h2_97448468` stopped at permission or dynamic workflow approval gates with no subagents.
- Web-shaped `$claude-deep-research` job `job_mqayfxhe_89e94bde` reached the dynamic workflow approval prompt before subagents.
- `--yes` only acknowledges plugin privacy; it does not approve Claude Code workflow execution.

Impact:

The most powerful Claude Code fan-out path is not fully unattended. Codex can launch it, but cannot complete it without attach/approval, which limits "delegate and continue" workflows.

Likely fix:

Document the distinction more prominently in command output and consider adding a first-class "approval required" status/next-step field with attach instructions. If Claude Code exposes a safe approval API later, integrate it rather than scripting around the TUI.

### Medium: deep-research workflow sessions are not visible through workflows inspector

Evidence:

- `workflows --json` listed `$claude-workflow` jobs from this pass.
- `workflows job_mqayfxhe_89e94bde --json` rejected the deep-research job:
  `Job "job_mqayfxhe_89e94bde" is not a workflow job (prompt does not begin with "ultracode: ").`
- The deep-research transcript nevertheless showed Claude Code dynamic workflow metadata and approval prompts.

Impact:

Users see workflow behavior but cannot inspect it with the workflow inspector. This is confusing when debugging deep-research approval gates.

Likely fix:

Either broaden `workflows` to include deep-research workflow jobs, or add a dedicated inspector/wording that points deep-research users to the right command.

### Low: JSON errors are parseable but live on stderr

Evidence:

With `--json`, bogus IDs, missing job IDs, empty prompt, and usage errors emitted parseable JSON on stderr while stdout was empty.

Impact:

This is workable, but automation callers must remember to parse both stdout and stderr. It is easy to miss if testing only successful commands.

Likely fix:

Document this clearly in skill docs, or add an option/contract where `--json` always writes the JSON envelope to stdout and reserves stderr for diagnostics.

### Low: TTY privacy prompt plus `--json` is not one parseable stream

Evidence:

Fresh TTY decline in `/tmp/cc-plugin-privacy-tty-decline.HDUHAL` showed human prompt text, echoed `no`, then a JSON error object.

Impact:

The privacy fix is correct for humans. Strict automation should avoid TTY mode for `--json`; otherwise the full PTY stream is not JSON parseable.

Likely fix:

Treat this as documentation unless a stronger machine-mode contract is desired. Non-TTY `--json` already fails closed with parseable stderr JSON.

### Low: subcommand help is global, not command-specific

Evidence:

`cc workflows --help`, `cc fork --help`, and related subcommands print global help.

Impact:

Users need to scan a large command list to find subcommand-specific flags and caveats.

Likely fix:

Add subcommand-specific help paths, especially for workflow/deep-research approval behavior and review/adversarial-review targeting.

### Low: stopped-without-output result is silent

Evidence:

`result job_mqay8euh_bee85f43` after stopping a still-running sleep job printed headers/logs but no explicit "no final result was produced" explanation.

Impact:

Users may wonder whether output was omitted or whether no output exists.

Likely fix:

For stopped/failed/orphaned jobs with no `job.result`, print a short explicit line in human output and include a nullable result reason in JSON.

### Low: cleanup can transiently disagree with later status

Evidence:

Review lane stop commands returned `stopped` for `job_mqay6joa_7d042ccc` and `job_mqay922m_be7398e8`, but the first verification saw `orphaned`; a second exact-ID stop made final status settle to `stopped`.

Impact:

Cleanup may require retries in automation. This needs a smaller repro before treating it as a release blocker.

Likely fix:

Reproduce with exact job records. If confirmed, ensure terminal `stopped` writes cannot be overwritten by a later stale reconcile.

## Positive Notes

- The Plan 0022 followup-state fix held: delegate results reached `awaiting_followup` quickly and followup became usable.
- The privacy polish held: fresh TTY and non-TTY workspaces no longer silently launch without acknowledgement.
- Text-mode `delegate`, `result`, and `stop` are compact and usable.
- Full job IDs were stable across result/followup/review/stop.
- Misuse paths like freeform `review <job> -- "prompt"`, `status <jobId>`, and bare `stop --all` fail fast with useful guidance.
- `fork` and `batch` do produce real Claude Code sidechain subagents when permissions allow them to start.
