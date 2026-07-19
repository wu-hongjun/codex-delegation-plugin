---
name: agy-delegate
description: Delegate a coding task to Google Antigravity through the agy CLI.
---

You are the Codex skill wrapper for the delegate dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file.
Confirm `<plugin-root>/scripts/delegate.mjs` exists, then run:

    node "<plugin-root>/scripts/delegate.mjs" delegate --provider agy -- "<task prompt>"

Forwarded flags go before `--`; everything after `--` is the prompt verbatim. Return the
dispatcher's stdout verbatim. If the command exits non-zero, show stderr/stdout to the user and
explain that delegation failed. Do not invoke `agy` directly or reimplement job supervision.

Behavior rules:

- Treat the user's remaining text as the task prompt. Ask for it when empty.
- Forward only these flags when the user explicitly requests them: `--name`, `--model`, `--agent`,
  `--add-dir`, `--mode`, `--sandbox`, `--project`, `--new-project`, `--log-file`,
  `--permission-mode`, `--bypass-permissions`, `--dangerously-skip-permissions`, `--allow-edit`,
  `--json`, and `--yes`.
- `--mode` accepts `accept-edits` or `plan`. `--permission-mode acceptEdits` and
  `--permission-mode plan` map to the same Antigravity modes.
- Forward `--sandbox` when the user asks for Antigravity's OS-level terminal sandbox.
- The driver always adds the current Codex workspace with `--add-dir`; forward additional
  `--add-dir` values only when the user requests more workspace roots.
- Antigravity runs in a persistent native TUI. If it asks for workspace trust, a command, a URL, or
  a subagent action, preserve the `needs_input` state and direct the user to `$agy-attach`. Never
  approve or deny on the user's behalf. `--sandbox` restricts terminal execution but does not itself
  approve commands.
- Never add `--dangerously-skip-permissions` or `--bypass-permissions` unless the user explicitly
  requests a trusted unattended run. Include `--yes` when forwarding an explicit bypass request.
- For ordinary jobs, do not inject `--yes`. Surface the dispatcher's workspace privacy
  acknowledgement instead.
- The driver captures the conversation UUID from a private per-job diagnostic log and stores it
  with the job. Use `$agy-followup` for another turn in that exact conversation.
- Do not use global `agy --continue` for follow-up. The dispatcher resumes with
  `agy --conversation <uuid>` so concurrent jobs cannot steal one another's recent state.

### Next steps

- `$agy-wait <jobId> --json --compact --timeout 5m` - wait for completion
- `$agy-status` - inspect Antigravity jobs
- `$agy-result <jobId>` - read completed output
- `$agy-followup <jobId> -- "next instruction"` - continue the exact conversation
- `$agy-attach <jobId>` - interact with the native TUI, permissions, tasks, or subagents
- `$agy-stop <jobId>` - terminate a running job
