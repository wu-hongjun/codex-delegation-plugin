---
name: claude-workflow
description: Trigger a Claude Code dynamic workflow as a background sub-agent.
---

You are the Codex skill wrapper for the delegate dispatcher's workflow
subcommand.

Resolve `<plugin-root>` as the parent directory of the `skills/` directory that contains this file
(so `<plugin-root>/scripts/delegate.mjs` is the dispatcher). Confirm `<plugin-root>/scripts/delegate.mjs` exists before running.

Run:

    node "<plugin-root>/scripts/delegate.mjs" workflow -- "<prompt>"

Return the dispatcher's stdout verbatim. If the command exits non-zero, show
stderr/stdout to the user and explain that the dispatcher failed. Do not
reimplement the command logic yourself.

Behavior rules:

- Treat the user's remaining text after the skill invocation as the workflow
  prompt. If empty, ask the user for a prompt before running.
- Forward only these flags **when the user explicitly requests them**:
  `--name`, `--model`, `--effort`, `--permission-mode`, `--add-dir`,
  `--bypass-permissions`, `--dangerously-skip-permissions`,
  `--allow-dangerously-skip-permissions`, `--mcp-config`, `--agent`, `--agents`, `--allowedTools`,
  `--allowed-tools`, `--disallowedTools`, `--disallowed-tools`, `--tools`,
  `--settings`, `--setting-sources`, `--strict-mcp-config`,
  `--append-system-prompt`, `--system-prompt`, `--plugin-dir`,
  `--plugin-url`, `--bare`, `--safe-mode`, `--ide`, `--chrome`,
  `--no-chrome`, `--disable-slash-commands`,
  `--exclude-dynamic-system-prompt-sections`, `--verbose`, `--json`.
- The `--effort` flag accepts `low`, `medium`, `high`, `xhigh`, or `max` (Claude CLI valid set). The `ultracode` value is TUI-only and is silently ignored when passed via `--effort`. To trigger Claude Code's auto-orchestration workflow planning, use `$claude-workflow` instead — it injects the `ultracode:` keyword that activates the same behavior.
- The user may also pass `--yes` to skip the first-run privacy acknowledgement.
  Do not inject `--yes` for ordinary jobs. Exception: if the user explicitly
  asks for trusted unattended Claude work and you forward `--bypass-permissions`,
  `--dangerously-skip-permissions`, or `--permission-mode bypassPermissions`,
  include `--yes` in the same command so the job stays inside the delegate
  status/result surface instead of falling back to native `claude`. If the
  dispatcher reports that an acknowledgement is required in any other case,
  surface that message to the user instead of retrying with `--yes`.
- If the user explicitly asks for trusted unattended Claude work, or has already
  approved that mode for the current task/session/project, forward
  `--bypass-permissions` for fresh local shell/tool automation jobs. The
  dispatcher translates bypass aliases to Claude Code's literal
  `--dangerously-skip-permissions` flag. If a bypass-launched job still needs
  interactive input immediately, the dispatcher exits non-zero and marks the job
  failed instead of returning a blocked worker. This does not resolve browser
  selection, passkeys, or other local user-gesture prompts.
- Do NOT forward `--allow-edit` — it is not applicable to this subcommand.

Approval flow — important:

Dynamic workflows present an interactive YES / View raw script / NO approval
dialog inside the Claude Code TUI before any subagents are spawned. This skill
starts the background job but does NOT auto-approve the dialog. After the job
ID and Claude session short ID are printed, the user must run:

    claude attach <shortId>

using the printed Claude session short ID to review the generated workflow
script and choose whether to proceed.

Cost notice:

Dynamic workflows can spawn up to 16 concurrent agents and up to 1000 total
agents across all phases. Review the generated script before approving. If the
scope looks larger than intended, choose "No" in the approval dialog — no
subagents are spawned and no artifacts are written until the user explicitly
approves.

### Next steps

Workflow sessions appear as standard background jobs; after starting one:

- `$claude-status` — check live progress (workflow appears as a bg job)
- `$claude-result` — read the final output once the workflow completes
- `$claude-stop` — terminate the workflow early

### Saved workflows and args parameter

Saved workflows (created via `/workflows` → `s` in Claude Code TUI) appear as slash commands `/<name>`. Invoke them from Codex via `$claude-delegate -- "/<name> <args>"` — use `$claude-delegate`, NOT `$claude-workflow`, because `$claude-workflow` prepends the `ultracode:` keyword (which works for new workflows but breaks slash-command parsing for saved ones).

The workflow runtime exposes the trailing prose as the `args` global to the script.

Example invoking a saved workflow `/triage-issues` that reads issue numbers from `args`:

```
$claude-delegate -- "/triage-issues on issues 1024, 1025, 1030"
```

### Script API reference and examples

Workflow scripts are JavaScript/ESM. The ground-truth API shape (confirmed on Claude Code v2.1.153):

```javascript
export const meta = {
  name: 'count-readme-lines',
  description: 'Count lines in README.md',
  phases: [{ title: 'Count', detail: 'one agent counts lines in README.md' }],
}

phase('Count')
const result = await agent(
  'Count the exact number of lines in README.md. Return ONLY the integer.',
  { label: 'count-lines' }
)
return { lineCount: result }
```

Key primitives: `phase(title)` declares a phase barrier; `agent(prompt, opts?)` spawns a subagent and returns its output; `parallel(tasks)` fans out an array of agent calls concurrently within the current phase.

For a full decision matrix (when to use `$claude-workflow` vs `$claude-delegate`), multi-phase migration and research examples, and cost/cancel/approval patterns, see the `## Dynamic workflows in depth` and `## Subagent fan-out patterns (Codex → Claude Code)` sections of the plugin README.
