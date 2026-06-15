# TICKET: Distribution trust, install docs, and brand cleanup

**Type**: implementation planning ticket
**Owner**: maintainer
**Executor**: Codex/Claude
**Source**: Claude audit lane 2026-06-15 (`job_mqftwmjs_ea21b12e`, shortId `3aab635f`) plus direct repo inspection
**Status**: OPEN
**Priority**: P1/P2

## Problem

The README now has an install path, but the distribution story still asks users to trust a shell installer without enough adjacent trust material. There is no root `LICENSE`, `PRIVACY.md`, `CHANGELOG.md`, or `SECURITY.md`. The plugin metadata is minimal. The docs still contain old "Claude Companion" naming in skill descriptions and marketplace copies. The plugin README also has `$claude-*` examples inside `bash` fences, which can invite accidental shell execution.

These issues do not block local use, but they matter if this is going to be handed to other Codex users for production use.

## Evidence

- `README.md:38` to `58`: quick-start install path centers on the one-line installer and setup check.
- `README.md:309`: privacy caveat exists but is buried in the reference section.
- `packages/plugin-codex/.codex-plugin/plugin.json:1` to `32`: plugin metadata is minimal.
- `marketplace/plugins/cc/.codex-plugin/plugin.json:1` to `32`: marketplace metadata is also minimal.
- Root repository currently lacks `LICENSE`, `PRIVACY.md`, `CHANGELOG.md`, and `SECURITY.md`.
- `packages/plugin-codex/skills/claude-setup/SKILL.md:3`: skill description still says "Claude Companion".
- Source and bundled skill bodies still contain "Claude Companion dispatcher" text.
- `packages/plugin-codex/README.md` contains many `$claude-*` examples in `bash` fences, while the root README correctly uses `text` fences for skill invocations.

## Scope

1. Add trust documents.
   - `LICENSE`
   - `PRIVACY.md`
   - `CHANGELOG.md`
   - Consider `SECURITY.md` if maintainers want a reporting path.

2. Improve install documentation.
   - Keep the one-line installer.
   - Add a "read first" or direct-command path for users who do not want `curl | bash`.
   - Document tag pinning for stable installs.
   - Show the expected setup/smoke commands after install.
   - Include a short sample of successful `$claude-setup` output or status.

3. Clarify data boundaries earlier in the README.
   - Explain that prompts and workspace context are sent to Claude Code/Anthropic when jobs are spawned.
   - Explain what local files are written under Codex and Claude job directories.
   - Link to the new privacy document.

4. Clean old naming.
   - Replace "Claude Companion" with the current plugin name or neutral "cc dispatcher" language.
   - Update both source plugin files and bundled marketplace files.

5. Fix command fences.
   - Convert `$claude-*` skill-call examples in plugin docs from `bash` to `text`.
   - Keep actual shell commands in `bash`.

6. Extend metadata only if the Codex plugin schema accepts it.
   - Probe or test schema before adding fields such as repository, license, support, or homepage.
   - If schema rejects those fields, keep links in README and marketplace docs instead.

## Verification

- `rg "Claude Companion" packages marketplace README.md documentation` returns no stale user-facing references, except historical notes if intentionally retained.
- `rg '```bash\n\$claude' packages/plugin-codex marketplace/plugins/cc` returns no matches.
- `node tools/package-marketplace.mjs --check` passes after bundled docs are regenerated.
- Install instructions are validated from a clean or temporary Codex home where feasible.
- Plugin schema or package check confirms whether new metadata fields are allowed.

## Acceptance Criteria

- A new user can choose between one-line install and inspectable direct install steps.
- The repo has clear license, privacy, changelog, and support/security posture.
- Docs no longer carry stale "Claude Companion" branding.
- Skill invocations are not presented as shell commands.

## Guardrails

- Do not overpromise feature parity.
- Do not hide privacy or cost implications.
- Do not edit user-level Claude or Codex config directly while validating docs.
