---
name: qwen-wait
description: Wait for one Qwen Code job to finish, fail, stop, or time out.
---

Resolve `<plugin-root>` and run:

    node "<plugin-root>/scripts/delegate.mjs" wait --provider qwen <jobId-or-prefix>

Forward `--all`, `--json`, `--compact`, `--timeout`, and `--interval` when requested. A timeout does
not stop the job. Return output verbatim.
