# Lane 01 - `$claude-setup` Depth Test

Workdir: `/Users/hongjunwu/Repositories/Git/cc-plugin-codex`

Skill read first:

```sh
sed -n '1,220p' marketplace/plugins/cc/skills/claude-setup/SKILL.md
```

The skill resolves the dispatcher to `marketplace/plugins/cc/scripts/cc.mjs` and runs `setup`.

## Summary

Status: partial

Reason: all dispatcher invocations exited `0`, `delegateCapability` and `followupCapability` were `ok`, and `--json` output parsed successfully. The setup report's own status was `warn` because the informational `claude-bg-flag` probe warned that `--bg` is not advertised in `claude --help`.

## Variation A - Plain

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup
```

Exit code: `0`
JSON parse: not applicable
Status: partial
stderr: empty

Concise stdout excerpt:

```text
Claude companion setup — warn
  delegate capability: ok
  follow-up capability: ok

Shared (delegate + follow-up):
  ok    node-version                   Node 25.8.2
  ok    companion-dir-writable         /Users/hongjunwu/.codex/cc-plugin-codex
  ok    codex-version                  codex-cli 0.137.0
  ok    claude-binary                  claude binary is executable
  ok    claude-version                 2.1.169 (Claude Code)
  ok    claude-agents-json             claude agents --json returned 18 session(s)
  ok    claude-logs                    claude logs --help is available
  ok    transcript-path                /Users/hongjunwu/.claude/projects

Follow-up only (plan 0002):
  ok    claude-attach-help             Usage: claude attach <id>
  ok    claude-bg-no-prompt            claude --bg supported per version floor (2.1.169 (Claude Code) >= 2.1.149)
  ok    sidecar-jobs-dir               /Users/hongjunwu/.claude/jobs
  ok    pty-build                      node-pty PTY smoke passed (/bin/sh -c "echo ok").

Informational (does not gate either capability):
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session.
  ok    claude-daemon                  pid:     70535
  ok    codex-plugin-trust             Plugin reference found in /Users/hongjunwu/.codex/config.toml.
  ok    opus-4-8-supported             Opus 4.8 supported (--model claude-opus-4-8 available)
  ok    workflows-supported            Dynamic workflows available via /workflows
  ok    bg-exec-supported              claude --bg --exec available

Generated: 2026-06-11T22:44:49.951Z
```

Failure text: none. Warning text captured above under `claude-bg-flag`.

## Variation B - `--json`

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup --json
```

JSON parse check command:

```sh
node -e 'const fs=require("fs"); const p=process.argv[1]; try { const data=JSON.parse(fs.readFileSync(p,"utf8")); console.log("ok keys="+Object.keys(data).join(",")); } catch (e) { console.log("fail "+e.message); process.exitCode=3; }' "$tmpdir/json.out"
```

Exit code: `0`
JSON parse: parsed successfully
JSON parse exit code: `0`
JSON parse output: `ok keys=ok,status,delegateCapability,followupCapability,generatedAt,probes`
Status: partial
stderr: empty

Concise stdout excerpt:

```json
{
  "ok": true,
  "status": "warn",
  "delegateCapability": "ok",
  "followupCapability": "ok",
  "generatedAt": "2026-06-11T22:44:59.369Z",
  "probes": [
    {
      "name": "node-version",
      "status": "ok",
      "detail": "Node 25.8.2"
    },
    {
      "name": "claude-version",
      "status": "ok",
      "detail": "2.1.169 (Claude Code)"
    },
    {
      "name": "claude-bg-flag",
      "status": "warn",
      "detail": "--bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session."
    }
  ]
}
```

Failure text: none. Warning text captured above under `claude-bg-flag`.

## Variation C - Rerun / Idempotent

Command:

```sh
node marketplace/plugins/cc/scripts/cc.mjs setup
```

Exit code: `0`
JSON parse: not applicable
Status: partial
stderr: empty
Idempotence result: rerun completed without error; delegate and follow-up capabilities remained `ok`. Volatile fields changed, including `Generated` timestamp and the `claude-version` probe value.

Concise stdout excerpt:

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
  ok    claude-agents-json             claude agents --json returned 18 session(s)
  ok    claude-logs                    claude logs --help is available
  ok    transcript-path                /Users/hongjunwu/.claude/projects

Follow-up only (plan 0002):
  ok    claude-attach-help             Usage: claude attach <id>
  ok    claude-bg-no-prompt            claude --bg supported per version floor (2.1.173 (Claude Code) >= 2.1.149)
  ok    sidecar-jobs-dir               /Users/hongjunwu/.claude/jobs
  ok    pty-build                      node-pty PTY smoke passed (/bin/sh -c "echo ok").

Informational (does not gate either capability):
  warn  claude-bg-flag                 --bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session.
  ok    claude-daemon                  pid:     70535
  ok    codex-plugin-trust             Plugin reference found in /Users/hongjunwu/.codex/config.toml.
  ok    opus-4-8-supported             Opus 4.8 supported (--model claude-opus-4-8 available)
  ok    workflows-supported            Dynamic workflows available via /workflows
  ok    bg-exec-supported              claude --bg --exec available

Generated: 2026-06-11T22:45:02.426Z
```

Failure text: none. Warning text captured above under `claude-bg-flag`.
