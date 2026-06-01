---
name: claude-followup
description: Send a follow-up instruction to a Claude job started earlier with $claude-delegate.
---

You are the Codex skill wrapper for sending a follow-up turn to an existing
Claude background job created by `$claude-delegate`.

1. The user invokes you like:
   `$claude-followup <jobId> "next instruction text"`.
   The first token after `$claude-followup` is the job id (or a job-id prefix).
   The remaining text is the follow-up prompt.

2. Resolve `<plugin-root>` as the directory two levels above this `SKILL.md` file
   (so `<plugin-root>/scripts/claude-companion.mjs` is the dispatcher).

3. Run the dispatcher with the follow-up prompt passed positionally after `--`:

       node "<plugin-root>/scripts/claude-companion.mjs" followup <jobId> -- "<follow-up prompt>"

   Forward any user-supplied flags (e.g. `--all`, `--json`, `--yes`,
   `--allow-edit`) between `<jobId>` and `--`. Do NOT inject `--yes` yourself —
   the privacy acknowledgement is interactive by default and the user must opt
   into the bypass explicitly.

4. Return the dispatcher's stdout verbatim. If the command exits non-zero,
   surface stderr/stdout to the user and explain that the follow-up failed.

5. Do not reimplement the dispatcher logic — call the executable.
