---
name: qwen-followup
description: Continue the exact Qwen Code session recorded for a delegation job.
---

Resolve `<plugin-root>` and run:

    node "<plugin-root>/scripts/delegate.mjs" followup --provider qwen <jobId-or-prefix> -- "<prompt>"

Forward `--all`, `--yes`, and `--json` when requested. Never use `qwen --continue`; the driver uses
the recorded exact session ID. Wait for the current turn to settle before following up.
