---
name: qwen-delegate
description: Delegate a coding task to Qwen Code through its qwen CLI.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file, then run:

    node "<plugin-root>/scripts/delegate.mjs" delegate --provider qwen -- "<task prompt>"

Put dispatcher flags before `--` and preserve everything after it as prompt text. Forward only
explicitly requested supported flags: `--name`, `--model`, `--permission-mode`, `--allow-edit`,
`--add-dir`, `--allowed-tools`, `--disallowed-tools`, `--append-system-prompt`,
`--system-prompt`, `--safe-mode`, `--sandbox`, `--json`, and `--yes`.

Do not invoke `qwen` directly or use its project-global `--continue`; the driver captures the exact
session ID and `$qwen-followup` resumes only that session.

Never add bypass mode unless the user explicitly requests trusted unattended execution. The
dispatcher maps it to Qwen Code's `--approval-mode yolo`. Headless Qwen jobs cannot hand a
permission prompt to a live terminal.

Return dispatcher output verbatim. On failure, include stderr and explain the failure.

Next: `$qwen-wait`, `$qwen-status`, `$qwen-result`, `$qwen-followup`, or `$qwen-stop`.
