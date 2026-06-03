# cc-plugin-codex marketplace packaged-file manifest

> Generated and verified by `node tools/package-marketplace.mjs --check`.
> Source tree: `packages/plugin-codex/`
> Marketplace tree: `marketplace/plugins/claude-companion/`

## Plugin-tree files (sourced from `packages/plugin-codex/`)

The following 18 files are copied byte-for-byte from `packages/plugin-codex/` into `marketplace/plugins/claude-companion/`:

- `.codex-plugin/plugin.json`
- `scripts/claude-companion.mjs`
- `scripts/lib/ack.mjs`
- `scripts/lib/adapter.mjs`
- `scripts/lib/args.mjs`
- `scripts/lib/format.mjs`
- `scripts/lib/prompt-meta.mjs`
- `scripts/lib/review-parser.mjs`
- `scripts/lib/review-prompts.mjs`
- `scripts/lib/review-result-source.mjs`
- `skills/claude-setup/SKILL.md`
- `skills/claude-delegate/SKILL.md`
- `skills/claude-status/SKILL.md`
- `skills/claude-result/SKILL.md`
- `skills/claude-stop/SKILL.md`
- `skills/claude-followup/SKILL.md`
- `skills/claude-review/SKILL.md`
- `skills/claude-adversarial-review/SKILL.md`

Note: `scripts/claude-companion.mjs` is copied from source and the packaging script sets the user-executable bit (chmod 0755) on the marketplace copy unconditionally, since the source file has mode 644 but the marketplace copy must be executable.

## Marketplace-owned files (not derived from source)

- `README.md` — owned in-place; Plan 0006 T2 created this as a placeholder (11 lines). Plan 0006 T12 will replace it with the final marketplace-facing README. The packaging script does NOT copy or overwrite this file.
- `.agents/plugins/marketplace.json` — the Codex marketplace root manifest, owned by the marketplace, not derived from the plugin source. The packaging script leaves it in place.

**Option A** is in effect: `README.md` is treated as marketplace-owned, not derived from `packages/plugin-codex/README.md` (which is the full 551-line plugin documentation). This prevents the packaging script from clobbering the marketplace placeholder with the source README.

## Marketplace-root files (lives directly under `marketplace/`)

- `.agents/plugins/marketplace.json`

This file is the Codex marketplace root manifest. It is owned by the marketplace, not derived from the plugin source. The packaging script leaves it in place.

## Exclusions (informational; T5 owns the authoritative exclusion list)

Anything not listed above is not part of the packaged plugin. The T2 `marketplace-layout.test.mjs` already enforces that no test files, `node_modules/`, `tsconfig*`, `package.json`, `.env*`, `*.pem`, `*.key`, `*.crt`, `dist/`, `.git/`, `.github/`, `tools/`, `documentation/`, or `references/` appear under `marketplace/plugins/claude-companion/`.
