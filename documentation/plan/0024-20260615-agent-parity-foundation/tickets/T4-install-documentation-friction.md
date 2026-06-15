# T4 - Install and documentation friction

## Goal

Remove the low-level polish issues that make the plugin feel harder than
oh-my-codex-style installation and day-to-day use.

## Problem

The current install path is documented, but users still have to copy several
commands and understand marketplace identity. Some marketplace docs say to
attach with a plugin job id where Claude Code expects a short/session id. The
root `.gitignore` still references the old `claude-companion` marketplace path,
making bundled-dependency staging easy to get wrong.

## Implementation Notes

- Add a tiny bootstrap installer script or documented `curl | bash` compatible
  path that wraps:
  `codex plugin marketplace add https://github.com/wu-hongjun/cc-plugin-codex`
  and `codex plugin add "cc@cc-plugin-codex"`.
- Keep npm clearly contributor-only unless a real package is introduced.
- Fix attach docs in root README, package README, marketplace README, and skills:
  use Claude short/session id, never plugin job id.
- Fix `.gitignore` negations/comments from `claude-companion` to `cc`.
- Add/update docs tests for the install block and attach wording.

## Acceptance

- A new user can install with one documented command or a two-command explicit
  fallback.
- Docs consistently distinguish:
  - plugin `jobId` for `cc result/status/followup/stop`
  - Claude `shortId`/`sessionId` for `claude attach`
- `.gitignore` no longer requires contributors to remember stale path names.
- Marketplace packaging check remains byte-identical after regeneration.
