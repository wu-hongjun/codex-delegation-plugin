# TICKET: Cost, turn, and remaining Claude CLI flag parity

**Type**: implementation planning ticket
**Owner**: maintainer
**Executor**: Codex/Claude
**Source**: Claude audit lane 2026-06-15 (`job_mqftwmoi_127848fa`, shortId `3832b2ed`) plus direct repo inspection
**Status**: OPEN
**Priority**: P1/P2

## Problem

The plugin now covers the most important edit, permission, and MCP flags, but the large fan-out workflows still lack first-class cost and turn guardrails. Claude Code documents flags such as `--max-turns` and `--max-budget-usd`; the plugin parser, runtime driver contract, and background-session argv builder do not currently expose them.

There are also remaining documented flags that may matter for parity or low-friction agent use. They should be probed against the live Claude Code binary in background mode before being implemented or documented as supported.

## Evidence

- `references/documentation-claudecode/02-cli-reference.md:40`: documents `--thinking`.
- `references/documentation-claudecode/02-cli-reference.md:60`: documents `--no-sandbox`.
- `references/documentation-claudecode/02-cli-reference.md:78`: documents `--append-system-prompt-file`.
- `references/documentation-claudecode/02-cli-reference.md:80`: documents `--system-prompt-file`.
- `references/documentation-claudecode/02-cli-reference.md:98`: documents `--no-session-persistence`.
- `references/documentation-claudecode/02-cli-reference.md:99`: documents `--max-turns`.
- `references/documentation-claudecode/02-cli-reference.md:100`: documents `--max-budget-usd`.
- `packages/plugin-codex/scripts/lib/args.mjs:13` to `63`: current plugin flag allowlist does not include those flags.
- `packages/runtime/src/driver.ts:35` to `66`: `StartSessionOpts` does not model those options.
- `packages/driver-claude-code/src/background-session.ts:164` to `248`: `buildArgv` cannot forward those options.
- Audit lane C confirmed the live binary was available for read-only probing, but permission prompts prevented completing the full matrix in that lane.

## Scope

1. Probe live Claude Code support in background mode.
   - Test each candidate flag with `claude --bg` or the exact invocation shape used by the driver.
   - Record whether the flag is accepted, rejected, ignored, or incompatible with background sessions.
   - Keep the probe read-only.

2. Add supported cost and turn guardrails first.
   - `--max-turns`
   - `--max-budget-usd`
   - Expose through CLI parsing, `StartSessionOpts`, driver argv, skills, README, and marketplace bundle.

3. Evaluate remaining flags individually.
   - `--thinking`
   - `--system-prompt-file`
   - `--append-system-prompt-file`
   - `--no-sandbox`
   - `--no-session-persistence`
   - Add only if the live background invocation proves they work.

4. Add clear rejection behavior.
   - Unknown or unsupported passthrough flags should fail with actionable text.
   - If a flag is documented by Claude Code but unsupported by this plugin, say so explicitly.

5. Improve workflow guardrails.
   - Allow batch, workflow, and deep-research skills to pass max-turn and max-budget caps to every spawned job where supported.
   - Document sensible examples for high-fanout audits.

## Verification

- Add argv unit tests for every newly supported flag.
- Add parser tests for boolean and value flag handling.
- Add negative tests for unsupported or incompatible flags.
- Add a live-probe artifact or documented transcript before claiming support.
- Run full package tests and `node tools/package-marketplace.mjs --check`.

## Acceptance Criteria

- Users can set turn and cost caps from Codex when spawning Claude jobs.
- The driver forwards supported flags byte-for-byte to Claude Code.
- Unsupported Claude Code flags are documented as unsupported rather than silently ignored.
- High-fanout workflows can be run with explicit cost bounds.

## Guardrails

- Do not document behavior based only on the CLI reference; verify against the live binary.
- Do not add new production dependencies.
- Keep all new flags compatible with the existing two-commit release process.
