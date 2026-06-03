# cc-plugin-codex marketplace exclusion list

> The marketplace package is allowlist-based. Files not listed in
> [`MANIFEST.md`](MANIFEST.md) are not part of the shipped plugin.
> This document is defense-in-depth: it names categories that must
> never appear under `marketplace/plugins/claude-companion/`.

The allowlist is the primary invariant. The exclusion list is a
secondary safety net so that even an accidental inclusion in
`MANIFEST.md` (or a misuse of `--write` against a polluted source
tree) fails `tools/package-marketplace.mjs --check`.

## Excluded categories

| Category | Patterns / paths |
|---|---|
| Tests | `*.test.mjs`, `*.test.js`, `*.test.ts`, `test/`, `tests/` |
| TypeScript sources | `src/`, `*.ts` (excluding `*.d.ts` if ever shipped intentionally) |
| Build config | `tsconfig*.json` |
| Repo CI / lint / format config | `.github/`, `.prettierrc`, `.prettierrc.*`, `eslint.config.mjs`, `eslint.config.js` |
| Internal docs and plans | `documentation/`, `references/` |
| Development tools | `tools/`, including `tools/bench/`, `tools/mock-*` |
| Node dependency trees | `node_modules/` |
| Workspace metadata | `package.json` (when at the packaged-plugin root rather than inside a manifest), `package-lock.json` |
| Orchestration metadata | `CLAUDE.md`, `AGENTS.md`, `.omc/` |
| VCS metadata | `.git/`, `.gitignore` at the packaged-plugin root |
| Secrets | `.env`, `.env.*`, `credentials*`, `*.pem`, `*.key`, `*.crt`, `id_rsa*`, `id_ed25519*` |

## Enforcement

Two enforcement layers exist:

1. **`tools/package-marketplace.mjs --check`** — scans
   `marketplace/plugins/claude-companion/` and fails with a non-zero
   exit if any file matches an excluded pattern, even if that file
   were listed in `MANIFEST.md`. The exclusion check runs *before*
   the allowlist comparison.
2. **`packages/plugin-codex/test/marketplace-layout.test.mjs`** —
   static tests that walk the committed marketplace tree and assert
   no excluded category is present, and synthetic-temp-root tests
   that inject an excluded file and assert `--check` returns
   non-zero.

The allowlist in `MANIFEST.md` is the primary specification; this
exclusion list is defense-in-depth.

## Notes

- Exclusion checks use POSIX-style relative paths (`/` separator)
  even when running on macOS or Linux. Use `path.posix.normalize`
  when comparing.
- A path matches a category if the relative path is the category
  literal (e.g., `node_modules`), or contains the category as a
  path segment (e.g., `scripts/lib/node_modules/foo.js`), or
  matches the suffix pattern (e.g., `foo.test.mjs`).
- Both `EXCLUSIONS.md` and the script's `EXCLUDED_PATTERNS` array
  are the source of truth for what is forbidden. They MUST stay in
  sync. The tests verify this.
