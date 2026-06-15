# T1 - CLI flag and permission-mode parity

## Goal

Make the dispatcher safe and predictable for Codex by rejecting unknown flags,
accepting Claude Code's dangerous-skip aliases explicitly, validating permission
modes, and forwarding high-value Claude Code startup flags to `claude --bg`.

## Problem

`parseArgs` treats every unknown long flag as a value-taking flag. This means a
user or agent can pass a real Claude Code flag, get no error, and accidentally
change the prompt/positionals. The most visible example is
`--dangerously-skip-permissions`, which Claude Code users naturally expect to
work.

## Implementation Notes

- Update `packages/plugin-codex/scripts/lib/args.mjs` to support a declared
  flag schema or allowlist and fail closed for unknown flags.
- Add boolean aliases:
  - `--dangerously-skip-permissions`
  - `--allow-dangerously-skip-permissions`
- Map `--dangerously-skip-permissions` to
  `permissionMode: "bypassPermissions"`.
- Treat `--allow-dangerously-skip-permissions` as an explicit opt-in that
  forwards the Claude flag if supported, without enabling bypass by default.
- Validate `--permission-mode` against Claude Code 2.1.177 choices:
  `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`.
- Forward these additional startup flags where compatible with `claude --bg`:
  `--allowed-tools`/`--allowedTools`, `--disallowed-tools`/`--disallowedTools`,
  `--tools`, `--agent`, `--agents`, `--append-system-prompt`,
  `--system-prompt`, `--settings`, `--setting-sources`,
  `--strict-mcp-config`, `--bare`, `--safe-mode`, and `--cwd` as a plugin-side
  workspace override if safely resolvable.
- Extend runtime/driver `StartSessionOpts` and driver argv tests.
- Update skill/help docs to list the newly accepted flags and explain explicit
  trusted unattended behavior.

## Acceptance

- Unknown flag tests cover both `delegate --unknown -- "prompt"` and
  `delegate --dangerously-skip-permissions "prompt without --"` style cases.
- Driver argv tests prove the new flags are forwarded as arrays, not shell
  strings.
- `--dangerously-skip-permissions` does not require users to know the plugin's
  internal `bypassPermissions` spelling.
- Invalid permission modes fail before spawning Claude.
