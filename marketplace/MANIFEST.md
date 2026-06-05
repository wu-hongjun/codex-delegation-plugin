# cc-plugin-codex marketplace packaged-file manifest

> Generated and verified by `node tools/package-marketplace.mjs --check`.
> Source tree: `packages/plugin-codex/`
> Marketplace tree: `marketplace/plugins/claude-companion/`

## Plugin-tree files (sourced from `packages/plugin-codex/`)

The following 21 files are copied byte-for-byte from `packages/plugin-codex/` into `marketplace/plugins/claude-companion/`:

- `.codex-plugin/plugin.json`
- `scripts/claude-companion.mjs`
- `scripts/lib/ack.mjs`
- `scripts/lib/adapter.mjs`
- `scripts/lib/args.mjs`
- `scripts/lib/claude-version.mjs`
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
- `skills/claude-workflow/SKILL.md`
- `skills/claude-goal/SKILL.md`

Note: `scripts/claude-companion.mjs` is copied from source and the packaging script sets the user-executable bit (chmod 0755) on the marketplace copy unconditionally, since the source file has mode 644 but the marketplace copy must be executable.

## Bundled-dependency tree (sourced from workspace + npm install)

> Added in Plan 0006 T9.5 to fix the cache-execution `ERR_MODULE_NOT_FOUND`
> defect: `codex plugin add` materialises only what is committed under
> `marketplace/plugins/claude-companion/`, so the dispatcher's
> `@cc-plugin-codex/*` and `node-pty` imports must resolve from a committed
> `node_modules/` under the same plugin root.

All paths are relative to `marketplace/plugins/claude-companion/`.

### `node_modules/@cc-plugin-codex/runtime/`
- `package.json` — synthesized minimal shape (version marker: `0.2.0-bundled`).
- `dist/*.js` and `dist/*.d.ts` — copied byte-for-byte from
  `packages/runtime/dist/` after `npm run build`.
- Sourcemaps (`*.js.map`, `*.d.ts.map`) and `*.tsbuildinfo` are excluded
  (see `EXCLUSIONS.md`).

### `node_modules/@cc-plugin-codex/driver-claude-code/`
- `package.json` — synthesized minimal shape with `dependencies:
  { "@cc-plugin-codex/runtime": "0.2.0-bundled", "node-pty": "1.2.0-beta.13" }`.
- `dist/*.js` and `dist/*.d.ts` — copied byte-for-byte from
  `packages/driver-claude-code/dist/` after `npm run build`.

### `node_modules/node-pty/`
Bundled from the workspace's npm-installed `node-pty@1.2.0-beta.13`:
- `package.json` — upstream `package.json` reduced to the runtime-required
  fields. The `install`, `postinstall`, `prepare`, and `prepublishOnly`
  scripts are stripped so no package manager attempts to rebuild native
  bindings against the bundled prebuilds.
- `lib/**` — JS runtime (the `loadNativeModule` helper searches
  `prebuilds/<platform>-<arch>/pty.node` at call time).
- `typings/node-pty.d.ts`.
- `prebuilds/darwin-arm64/`, `prebuilds/darwin-x64/`,
  `prebuilds/linux-arm64/`, `prebuilds/linux-x64/` — native `.node` and
  `spawn-helper` binaries.
- `LICENSE`, `README.md` — kept for MIT license compliance (the LICENSE
  must accompany binary redistribution).

Excluded from the node-pty payload: `src/` (C++ source), `binding.gyp`
(gyp build descriptor), `scripts/` (postinstall hooks), `third_party/`,
`prebuilds/win32-arm64/`, `prebuilds/win32-x64/`. See `EXCLUSIONS.md`.

The exact file list is computed dynamically by
`tools/package-marketplace.mjs` from the source trees. `--check` verifies
byte-identity for every file and verifies the synthesized `package.json`
files match their canonical shape.

## Marketplace-owned files (not derived from source)

- `README.md` — owned in-place; Plan 0006 T2 created this as a placeholder (11 lines). Plan 0006 T12 will replace it with the final marketplace-facing README. The packaging script does NOT copy or overwrite this file.
- `.agents/plugins/marketplace.json` — the Codex marketplace root manifest, owned by the marketplace, not derived from the plugin source. The packaging script leaves it in place.

**Option A** is in effect: `README.md` is treated as marketplace-owned, not derived from `packages/plugin-codex/README.md` (which is the full 551-line plugin documentation). This prevents the packaging script from clobbering the marketplace placeholder with the source README.

## Marketplace-root files (lives directly under `marketplace/`)

- `.agents/plugins/marketplace.json`

This file is the Codex marketplace root manifest. It is owned by the marketplace, not derived from the plugin source. The packaging script leaves it in place.

## Exclusions

Anything not listed above is not part of the packaged plugin. See
[`EXCLUSIONS.md`](EXCLUSIONS.md) for the categorized list of file types and
paths that must not appear in the packaged plugin (defense-in-depth alongside
the allowlist above). The `tools/package-marketplace.mjs --check` command
enforces both the allowlist and the exclusion list.
