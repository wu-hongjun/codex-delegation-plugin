---
name: claude-skills
description: List Claude Code skills visible to delegated Claude sessions.
---

You are the Codex skill wrapper for the cc dispatcher.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/cc.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/cc.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/cc.mjs" skills

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Accepted flags (forwarded to the dispatcher):

- `--json` — machine-readable JSON output.

Rejected at parse time (exit 2):

- `--allow-edit` — not applicable; this skill is read-only.
- `--model`, `--effort`, `--permission-mode`, `--add-dir`, `--mcp-config` — not applicable.

Behavior rules:

- Use this before delegation when the user asks whether Claude Code has a
  particular installed skill or when a task might benefit from a Claude Code
  skill that is not installed as a Codex skill.
- The dispatcher lists project `.claude/skills`, user `~/.claude/skills`, and
  skills from installed Claude Code plugin cache paths.
- Claude Code skills are invoked in Claude prompts with `/skill-name`; when
  delegating, include the desired `/skill-name` explicitly in the prompt.
- Forward `--json` only if the user explicitly asks for machine-readable output.
- Do NOT auto-inject `--yes`; this skill reads local files only and does not
  start a Claude Code session.

### Next steps

After checking Claude Code skills, the user typically wants one of:

- `$claude-delegate` — delegate work and explicitly mention `/skill-name`
- `$claude-setup` — verify the full cc-plugin-codex environment
- `$claude-status` — inspect already delegated Claude jobs
