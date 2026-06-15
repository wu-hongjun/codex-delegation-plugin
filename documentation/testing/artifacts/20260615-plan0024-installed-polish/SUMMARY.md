# Plan 0024 Installed Polish Summary

Date: 2026-06-15

Installed plugin under test before polish:
`/Users/hongjunwu/.codex/plugins/cache/cc-plugin-codex-local/cc/0.3.5`

## Heavy-test lanes

- `agent-flags.md`: permission/startup flag parity, fail-closed parsing, help coverage.
- `agent-followup-review.md`: follow-up lifecycle, status compact shape, review gates.
- `agent-workflows.md`: workflow, goal, fork, batch, deep-research, workflows inspector.
- `agent-docs-cache.md`: installed cache, docs, skills, marketplace copy.
- `agent-friction.md`: adversarial agent-friction sweep.

## Fixed in polish

- `status <jobId>` now points to `cc status --job <jobId>` instead of sending agents into the `status`/`result` loop.
- `result <jobId>` for non-terminal jobs now suggests `cc status --job <jobId>`.
- Broad ambiguous job prefixes now cap displayed candidates and report how many were omitted.
- `--fail-on=` is rejected instead of silently disabling review gates.
- Invalid `--permission-mode` is validated before privacy acknowledgement/probe on fresh-session commands.
- Parser-level errors now include the command label when the command is inferable.
- Goal/fork/batch output now prints a ready-to-copy `claude attach <shortId>` command.
- Main help now advertises the accepted advanced fresh-session passthrough flags.
- Shipped marketplace README no longer uses stale "Claude Companion" branding and clarifies the Codex version floor.

## Remaining frictions

- Prompt-taking commands still allow known flag tokens before `--` to be consumed as flags. Agents should keep using `-- <prompt>`; changing parse semantics needs a compatibility pass.
- Repeated scalar value flags are still last-wins. Consider warning or rejecting duplicates in a follow-up parser ticket.
- `status --job` is intentionally always compact; help now states that, but there is no expanded single-job JSON mode.
- Shared global job storage still makes concurrent `--all*` cleanup risky without lane/owner scoping.
