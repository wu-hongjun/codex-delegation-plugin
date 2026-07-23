---
name: pi-delegate
description: Delegate a coding task to oh-my-pi (Pi) through its omp CLI.
---

Resolve `<plugin-root>` as the parent of the `skills/` directory containing this file, then run:

    node "<plugin-root>/scripts/delegate.mjs" delegate --provider pi -- "<task prompt>"

Put dispatcher flags before `--` and preserve everything after it as prompt text. Forward only
explicitly requested supported flags: `--name`, `--model`, `--effort`, `--permission-mode`,
`--allowed-tools`, `--tools`, `--append-system-prompt`, `--system-prompt`, `--bare`, `--json`, and
`--yes`.

Pi is installed as `omp`, but this plugin and its skills call the provider `pi`. Do not invoke
`omp` directly or use its global `--continue`; the driver captures the exact session ID and
`$pi-followup` resumes only that session.

Never add bypass mode unless the user explicitly requests trusted unattended execution. The
dispatcher maps it to Pi's `--approval-mode yolo`, which can approve destructive operations.
Headless Pi jobs cannot hand a permission prompt to a live terminal.

Return dispatcher output verbatim. On failure, include stderr and explain the failure.

Next: `$pi-wait`, `$pi-status`, `$pi-result`, `$pi-followup`, or `$pi-stop`.
