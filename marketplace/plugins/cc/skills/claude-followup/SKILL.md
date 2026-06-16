---
name: claude-followup
description: Send a follow-up instruction to a Claude job started earlier with $claude-delegate.
---

You are the Codex skill wrapper for sending a follow-up turn to an existing
Claude background job created by `$claude-delegate`.

1. The user invokes you like:
   `$claude-followup <jobId-or-prefix> "next instruction text"`.
   The first token after `$claude-followup` is the job id (or a job-id prefix).
   The remaining text is the follow-up prompt.

2. Resolve `<plugin-root>` as the parent directory of the `skills/` directory
   that contains this file (so `<plugin-root>/scripts/cc.mjs` is the
   dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

3. Run the dispatcher with the follow-up prompt passed positionally after `--`:

       node "<plugin-root>/scripts/cc.mjs" followup <jobId-or-prefix> -- "<follow-up prompt>"

   Accepted flags (forwarded to the dispatcher):

   - `--all` — search across workspaces
   - `--json` — machine-readable output
   - `--yes` — acknowledge privacy disclosure
   - `--allow-edit` — policy/framing flag (does not bypass privacy ack)

   Rejected at parse time (these are startup-only flags for `$claude-delegate`):

   - `--model`
   - `--effort`
   - `--permission-mode`
   - `--add-dir`
   - `--mcp-config`
   - `--name`

   Do NOT inject `--yes` yourself — the privacy acknowledgement is interactive
   by default and the user must opt into the bypass explicitly.

4. Return the dispatcher's stdout verbatim. If the command exits non-zero,
   surface stderr/stdout to the user and explain that the follow-up failed.

5. Do not reimplement the dispatcher logic — call the executable.

### Next steps

After sending a follow-up, the user typically wants one of:

- `$claude-status` — check progress of the follow-up turn
- `$claude-result` — read the output once the turn completes
