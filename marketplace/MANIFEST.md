# codex-delegation-plugin marketplace packaged-file manifest

> Generated and verified by `node tools/package-marketplace.mjs --check`.
> Source tree: `packages/plugin-delegate/`
> Marketplace tree: `marketplace/plugins/delegate/`

## Plugin-tree files (sourced from `packages/plugin-delegate/`)

The following 37 files are copied byte-for-byte from `packages/plugin-delegate/` into `marketplace/plugins/delegate/`:

- `.codex-plugin/plugin.json`
- `scripts/delegate.mjs`
- `scripts/lib/ack.mjs`
- `scripts/lib/adapter.mjs`
- `scripts/lib/agy-adapter.mjs`
- `scripts/lib/args.mjs`
- `scripts/lib/claude-version.mjs`
- `scripts/lib/format.mjs`
- `scripts/lib/prompt-meta.mjs`
- `scripts/lib/review-parser.mjs`
- `scripts/lib/review-prompts.mjs`
- `scripts/lib/review-result-source.mjs`
- `scripts/lib/workflows-inspector.mjs`
- `skills/claude-setup/SKILL.md`
- `skills/claude-doctor/SKILL.md`
- `skills/claude-delegate/SKILL.md`
- `skills/claude-status/SKILL.md`
- `skills/claude-wait/SKILL.md`
- `skills/claude-result/SKILL.md`
- `skills/claude-stop/SKILL.md`
- `skills/claude-followup/SKILL.md`
- `skills/claude-review/SKILL.md`
- `skills/claude-adversarial-review/SKILL.md`
- `skills/claude-workflow/SKILL.md`
- `skills/claude-goal/SKILL.md`
- `skills/claude-fork/SKILL.md`
- `skills/claude-batch/SKILL.md`
- `skills/claude-deep-research/SKILL.md`
- `skills/claude-workflows/SKILL.md`
- `skills/claude-skills/SKILL.md`
- `skills/claude-upgrade/SKILL.md`
- `skills/agy-setup/SKILL.md`
- `skills/agy-delegate/SKILL.md`
- `skills/agy-status/SKILL.md`
- `skills/agy-wait/SKILL.md`
- `skills/agy-result/SKILL.md`
- `skills/agy-stop/SKILL.md`

Note: `scripts/delegate.mjs` is copied from source and the packaging script sets the user-executable bit (chmod 0755) on the marketplace copy unconditionally, since the source file has mode 644 but the marketplace copy must be executable.

## Bundled-dependency tree (sourced from workspace + npm install)

> Added in Plan 0006 T9.5 to fix the cache-execution `ERR_MODULE_NOT_FOUND`
> defect: `codex plugin add` materialises only what is committed under
> `marketplace/plugins/delegate/`, so the dispatcher's
> `@codex-delegation/*` and `node-pty` imports must resolve from a committed
> `node_modules/` under the same plugin root.

All paths are relative to `marketplace/plugins/delegate/`.

### `node_modules/@codex-delegation/runtime/`
- `package.json` — synthesized minimal shape (version marker: `<plugin-version>-bundled`).
- `dist/*.js` and `dist/*.d.ts` — copied byte-for-byte from
  `packages/runtime/dist/` after `npm run build`.
- Sourcemaps (`*.js.map`, `*.d.ts.map`) and `*.tsbuildinfo` are excluded
  (see `EXCLUSIONS.md`).

### `node_modules/@codex-delegation/driver-claude-code/`
- `package.json` — synthesized minimal shape with `dependencies:
  { "@codex-delegation/runtime": "<plugin-version>-bundled", "node-pty": "1.2.0-beta.13" }`.
- `dist/*.js` and `dist/*.d.ts` — copied byte-for-byte from
  `packages/driver-claude-code/dist/` after `npm run build`.

### `node_modules/@codex-delegation/driver-agy-cli/`
- `package.json` — synthesized minimal shape with the bundled runtime dependency.
- `dist/*.js` and `dist/*.d.ts` — copied byte-for-byte from
  `packages/driver-agy-cli/dist/` after `npm run build`, including the detached
  print-mode supervisor runner.

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

**Option A** is in effect: `README.md` is treated as marketplace-owned, not derived from `packages/plugin-delegate/README.md` (which is the full 551-line plugin documentation). This prevents the packaging script from clobbering the marketplace placeholder with the source README.

## Marketplace-root files (lives directly under `marketplace/`)

- `.agents/plugins/marketplace.json`

This file is the Codex marketplace root manifest. It is owned by the marketplace, not derived from the plugin source. The packaging script leaves it in place.

## Exclusions

Anything not listed above is not part of the packaged plugin. See
[`EXCLUSIONS.md`](EXCLUSIONS.md) for the categorized list of file types and
paths that must not appear in the packaged plugin (defense-in-depth alongside
the allowlist above). The `tools/package-marketplace.mjs --check` command
enforces both the allowlist and the exclusion list.
