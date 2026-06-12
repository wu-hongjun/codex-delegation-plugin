# Lane 01 - claude-setup depth test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Skill read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-setup/SKILL.md
```

Exit code: 0

Key instruction excerpt: run `node "<plugin-root>/scripts/cc.mjs" setup`; return dispatcher stdout verbatim; do not reimplement command logic.

## Environment

```sh
codex plugin list | rg 'cc@cc-plugin-codex-local'
```

Exit code: 0

```text
cc@cc-plugin-codex-local  installed, enabled  0.3.3    /Users/hongjunwu/Repositories/Git/cc-plugin-codex/marketplace/plugins/cc
```

```sh
claude --version
```

Exit code: 0

```text
2.1.173 (Claude Code)
```

```sh
codex --version
```

Exit code: 0

```text
codex-cli 0.137.0
```

```sh
sw_vers
```

Exit code: 0

```text
ProductName:		macOS
ProductVersion:		26.5.1
BuildVersion:		25F80
```

```sh
uname -m
```

Exit code: 0

```text
arm64
```

Environment line: `claude --version` = `2.1.173 (Claude Code)`; `codex --version` = `codex-cli 0.137.0`; macOS = `26.5.1 25F80 arm64`.

## Variation 1 - plain setup

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup
```

Exit code: 0

Key excerpts:

```text
Claude companion setup — warn
  delegate capability: ok
  follow-up capability: ok

Shared (delegate + follow-up):
  ok    node-version                   Node 25.8.2
  ok    companion-dir-writable         /Users/hongjunwu/.codex/cc-plugin-codex
  ok    codex-version                  codex-cli 0.137.0
  ok    claude-binary                  claude binary is executable
  ok    claude-version                 2.1.173 (Claude Code)
  ok    claude-agents-json             claude agents --json returned 16 session(s)
  ok    claude-logs                    claude logs --help is available
  ok    transcript-path                /Users/hongjunwu/.claude/projects

Follow-up only (plan 0002):
  ok    claude-attach-help             Usage: claude attach <id>
  ok    claude-bg-no-prompt            claude --bg supported per version floor (2.1.173 (Claude Code) >= 2.1.149)
  ok    sidecar-jobs-dir               /Users/hongjunwu/.claude/jobs
  ok    pty-build                      node-pty PTY smoke passed (/bin/sh -c "echo ok.").

Informational (does not gate either capability):
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session.
  ok    claude-daemon                  pid:     55592
  ok    codex-plugin-trust             Plugin reference found in /Users/hongjunwu/.codex/config.toml.
  ok    opus-4-8-supported             Opus 4.8 supported (--model claude-opus-4-8 available)
  ok    workflows-supported            Dynamic workflows available via /workflows
  ok    bg-exec-supported              claude --bg --exec available

Generated: 2026-06-12T02:51:50.353Z
```

Result: passed with one non-gating warning (`claude-bg-flag`).

## Variation 2 - `--json` parseability

Raw JSON command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup --json
```

Exit code: 0

Key excerpts:

```json
{
  "ok": true,
  "status": "warn",
  "delegateCapability": "ok",
  "followupCapability": "ok",
  "generatedAt": "2026-06-12T02:52:05.973Z"
}
```

Parse command:

```sh
set -o pipefail
node marketplace/plugins/cc/scripts/cc.mjs setup --json | node -e 'const fs = require("node:fs"); const raw = fs.readFileSync(0, "utf8"); const data = JSON.parse(raw); const counts = data.probes.reduce((acc, p) => ((acc[p.status] = (acc[p.status] || 0) + 1), acc), {}); console.log(JSON.stringify({ok:data.ok,status:data.status,delegateCapability:data.delegateCapability,followupCapability:data.followupCapability,probeCount:data.probes.length,counts}, null, 2));'
```

Exit code: 0

Parser output:

```json
{
  "ok": true,
  "status": "warn",
  "delegateCapability": "ok",
  "followupCapability": "ok",
  "probeCount": 19,
  "counts": {
    "ok": 18,
    "warn": 1
  }
}
```

Result: passed. `setup --json` emits valid JSON parseable by `JSON.parse`.

## Variation 3 - rerun/idempotent

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup
```

Exit code: 0

Key excerpts:

```text
Claude companion setup — warn
  delegate capability: ok
  follow-up capability: ok

Shared (delegate + follow-up):
  ok    node-version                   Node 25.8.2
  ok    companion-dir-writable         /Users/hongjunwu/.codex/cc-plugin-codex
  ok    codex-version                  codex-cli 0.137.0
  ok    claude-binary                  claude binary is executable
  ok    claude-version                 2.1.173 (Claude Code)
  ok    claude-agents-json             claude agents --json returned 16 session(s)
  ok    claude-logs                    claude logs --help is available
  ok    transcript-path                /Users/hongjunwu/.claude/projects

Follow-up only (plan 0002):
  ok    claude-attach-help             Usage: claude attach <id>
  ok    claude-bg-no-prompt            claude --bg supported per version floor (2.1.173 (Claude Code) >= 2.1.149)
  ok    sidecar-jobs-dir               /Users/hongjunwu/.claude/jobs
  ok    pty-build                      node-pty PTY smoke passed (/bin/sh -c "echo ok.").

Informational (does not gate either capability):
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session.
  ok    claude-daemon                  pid:     55592
  ok    codex-plugin-trust             Plugin reference found in /Users/hongjunwu/.codex/config.toml.
  ok    opus-4-8-supported             Opus 4.8 supported (--model claude-opus-4-8 available)
  ok    workflows-supported            Dynamic workflows available via /workflows
  ok    bg-exec-supported              claude --bg --exec available

Generated: 2026-06-12T02:52:23.026Z
```

Result: passed. Rerun stayed exit 0 with the same readiness result: overall `warn`, delegate capability `ok`, follow-up capability `ok`, and the same single non-gating `claude-bg-flag` warning.

## Verdict

PASS for lane 01. `$claude-setup` via `node marketplace/plugins/cc/scripts/cc.mjs setup` is functional on `cc@cc-plugin-codex-local` v0.3.3. Plain setup and rerun both exit 0; JSON mode exits 0 and is parseable. The only warning observed is informational/non-gating: `claude-bg-flag` is not advertised in `claude --help`, while background support is separately reported available.
