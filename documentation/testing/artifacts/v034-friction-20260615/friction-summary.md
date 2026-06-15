# v0.3.4 supplemental friction round - 2026-06-15

## Environment

- Claude Code: 2.1.177
- Codex CLI: 0.139.0
- OS: macOS 26.5.1 (25F80) arm64
- Plugin: `cc@cc-plugin-codex-local` 0.3.4 installed from the local marketplace
  cache

## Jobs

- `job_mqeiayev_46cc8806` / `8beddccb` / `v034-core-readonly-c84f8e89`:
  reached `needs_input` on a Claude Code shell permission prompt, then stopped.
- `job_mqeiay1j_e84cc468` / `8b5d5f3b` / `v034-status-json-9703a6ce`:
  reached `needs_input` on a Claude Code shell permission prompt, then stopped.
- `job_mqeiay1j_6ef5a894` / `569530a0` / `v034-followup-target-4ab3f11a`:
  initial result `V034_FOLLOWUP_READY`; follow-up result
  `V034_FOLLOWUP_DONE`; stopped after verification.
- `job_mqeiay7c_00579ec1` / `a21740f1` / `v034-review-target-013956a6`:
  same-session review returned `pass_with_findings`; latest turn had a result
  before the job row settled from `running` to `awaiting_followup`.
- `job_mqeiay1j_8b73844c` / `4e6c2188` / `v034-batch-readonly-396fa2e7`:
  produced useful mapping output, then reached `needs_input` on a Claude Code
  shell permission prompt; stopped after verification.

## Frictions

1. `cc result` rejected a same-session review while the job row still said
   `running`, even though the latest review turn was `completed` and had an
   immutable result.
2. Unattended read-only QA lanes can stop at Claude Code shell permission
   prompts unless the operator explicitly passes
   `--permission-mode bypassPermissions`.
3. Broad `status --all --json --compact` remains too large for routine
   automation in a workspace with extensive job history; focused
   `status --job <id> --json --compact` is the practical path.
4. `claude logs <shortId>` is noisy around TUI permission prompts because raw
   ANSI/control output is preserved.

## Follow-up Subagents

Spawned through the installed v0.3.4 dispatcher:

- `job_mqeikzdz_0a263551` / `v034-friction-result-inspect-*` inspected the
  `cmdResult` read path. It confirmed the friction is a result-read gate, not a
  reconciler ownership bug. Accepted: use latest-turn completion evidence for
  `cc result`. Rejected: returning the 160-character preview when
  `finalMessagePath` is empty; `$claude-result` should prefer durable result
  artifacts.
- `job_mqeikzdx_77749d44` / `v034-friction-status-docs-*` inspected skill docs,
  README, and dispatcher help. Accepted: document explicit unattended
  `--permission-mode bypassPermissions`, steer users toward focused
  `status --job`, and clarify raw `claude logs` vs clean `$claude-result`.
- `job_mqeikzee_d01bef84` / `v034-friction-prune-status-*` inspected status
  scaling options. Accepted: additive `status --limit <n>` and
  `--stored-status <state>` controls. Rejected for this pass: destructive pruning or
  automatic cleanup of historical job records.

## Cleanup

All eight jobs listed above were stopped. Final `status --job` checks showed
`status:"stopped"` for each tested job.
