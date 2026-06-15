#!/usr/bin/env node
/**
 * tools/package-marketplace.mjs
 *
 * Packages (syncs) the cc plugin from source into the marketplace tree.
 *
 * Usage:
 *   node tools/package-marketplace.mjs --check   (default; verify marketplace matches source)
 *   node tools/package-marketplace.mjs --write   (copy derived files from source to marketplace)
 *   node tools/package-marketplace.mjs --help    (print usage)
 *
 * TEST SEAM
 *   --marketplace-root <path>   Override the default marketplace root directory.
 *                               Useful for pointing the script at a synthetic temp tree
 *                               in tests (e.g. inject an excluded file and verify exit 1).
 *                               Env var equivalent: CC_PLUGIN_CODEX_MARKETPLACE_ROOT
 *
 * EXCLUSIONS
 *   See marketplace/EXCLUSIONS.md for the human-readable categorized exclusion list.
 *   The --check mode runs the exclusion enforcement BEFORE the allowlist comparison.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  statSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Allowlist — authoritative list of files managed by this script.
// Edit this list to add or remove shipped files.
// ---------------------------------------------------------------------------

/**
 * DERIVED_FILES: copied byte-for-byte from packages/plugin-codex/ into
 * marketplace/plugins/cc/.
 *
 * Note: scripts/cc.mjs gets chmod 0755 after copy regardless of
 * source mode (source is 644, marketplace copy must be executable).
 */
const DERIVED_FILES = [
  '.codex-plugin/plugin.json',
  'scripts/cc.mjs',
  'scripts/lib/ack.mjs',
  'scripts/lib/adapter.mjs',
  'scripts/lib/args.mjs',
  'scripts/lib/claude-version.mjs',
  'scripts/lib/format.mjs',
  'scripts/lib/prompt-meta.mjs',
  'scripts/lib/review-parser.mjs',
  'scripts/lib/review-prompts.mjs',
  'scripts/lib/review-result-source.mjs',
  'scripts/lib/workflows-inspector.mjs',
  'skills/claude-setup/SKILL.md',
  'skills/claude-delegate/SKILL.md',
  'skills/claude-status/SKILL.md',
  'skills/claude-result/SKILL.md',
  'skills/claude-stop/SKILL.md',
  'skills/claude-followup/SKILL.md',
  'skills/claude-review/SKILL.md',
  'skills/claude-adversarial-review/SKILL.md',
  'skills/claude-workflow/SKILL.md',
  'skills/claude-goal/SKILL.md',
  'skills/claude-fork/SKILL.md',
  'skills/claude-batch/SKILL.md',
  'skills/claude-deep-research/SKILL.md',
  'skills/claude-workflows/SKILL.md',
];

/**
 * MARKETPLACE_OWNED_FILES: present in marketplace/plugins/cc/ but
 * NOT derived from source. The packaging script never writes or deletes these.
 *
 * README.md — Option A: marketplace-owned placeholder (T2); T12 will replace it.
 */
const MARKETPLACE_OWNED_FILES = ['README.md'];

// ---------------------------------------------------------------------------
// Bundled dependency layout (T9.5).
// ---------------------------------------------------------------------------
//
// The marketplace cache copy of the plugin has no node_modules of its own —
// `codex plugin add` materialises only what is committed under
// marketplace/plugins/cc/. To make the dispatcher resolvable
// when executed from that cache, we bundle the runtime + driver + node-pty
// payload directly under marketplace/plugins/cc/node_modules/.
//
// Choice: we ship `.js` + `.d.ts` only (no `.js.map`/`.d.ts.map`).
//   - Maps roughly double the committed size for zero load-time value.
//   - The cache-execution defect (ERR_MODULE_NOT_FOUND) is a module-resolution
//     failure, not a debug-source-path failure; maps are not part of the fix.
//   - `.d.ts` is kept so type-aware consumers (`tsc --noEmit` against the
//     cached install) still work.

/**
 * Bundled runtime files — `packages/runtime/dist/*.{js,d.ts}` copied to
 * `marketplace/plugins/cc/node_modules/@cc-plugin-codex/runtime/dist/`.
 * Discovered dynamically rather than hardcoded so additions to the runtime
 * package show up automatically.
 */
const RUNTIME_SRC_DIST = 'packages/runtime/dist';
const RUNTIME_DEST_BASE = 'node_modules/@cc-plugin-codex/runtime';

/**
 * Bundled driver files — `packages/driver-claude-code/dist/*.{js,d.ts}` copied
 * to `marketplace/plugins/cc/node_modules/@cc-plugin-codex/driver-claude-code/dist/`.
 */
const DRIVER_SRC_DIST = 'packages/driver-claude-code/dist';
const DRIVER_DEST_BASE = 'node_modules/@cc-plugin-codex/driver-claude-code';

/**
 * Bundled node-pty layout. Sourced from the workspace's npm-installed
 * `node-pty@1.2.0-beta.13`. We ship `lib/**` (the JS runtime), `typings/**`,
 * darwin/linux prebuilds, and the original LICENSE + README (MIT license
 * compliance). Excluded: `src/` (C++), `binding.gyp`, `scripts/` (postinstall
 * hooks), `third_party/`, win32 prebuilds.
 */
const NODEPTY_SRC_BASE = 'node_modules/node-pty';
const NODEPTY_DEST_BASE = 'node_modules/node-pty';
const NODEPTY_INCLUDE_DIRS = [
  'lib',
  'typings',
  'prebuilds/darwin-arm64',
  'prebuilds/darwin-x64',
  'prebuilds/linux-arm64',
  'prebuilds/linux-x64',
];
const NODEPTY_INCLUDE_FILES = ['LICENSE', 'README.md'];

/**
 * Synthesised `package.json` bodies for the two workspace packages.
 *
 * Version marker: `0.3.4-bundled`. The workspace source stays at `0.0.0` so
 * `npm` keeps recognising it as the in-tree workspace; the `-bundled` suffix
 * exists only on the marketplace cache copy to make inspection unambiguous.
 */
const SYNTH_RUNTIME_PKG = {
  name: '@cc-plugin-codex/runtime',
  version: '0.3.4-bundled',
  type: 'module',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  },
  engines: { node: '>=20' },
};

const SYNTH_DRIVER_PKG = {
  name: '@cc-plugin-codex/driver-claude-code',
  version: '0.3.4-bundled',
  type: 'module',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  },
  dependencies: {
    '@cc-plugin-codex/runtime': '0.3.4-bundled',
    'node-pty': '1.2.0-beta.13',
  },
  engines: { node: '>=20' },
};

/**
 * Fields kept from the upstream node-pty package.json. The install +
 * postinstall + prepare + prepublishOnly scripts are stripped so that no
 * package manager attempts to rebuild native bindings against the bundled
 * prebuilds.
 */
const NODEPTY_PKG_KEEP_FIELDS = [
  'name',
  'version',
  'description',
  'author',
  'license',
  'main',
  'types',
  'homepage',
  'bugs',
  'keywords',
  'dependencies',
  'engines',
  'files',
];

/**
 * Compute the bundled-file allowlist (relative to DEST_DIR) by enumerating
 * the source trees. Returns:
 *   {
 *     runtimeDist: string[],         // paths like 'node_modules/@cc-plugin-codex/runtime/dist/index.js'
 *     driverDist: string[],
 *     nodepty: string[],
 *     packageJsons: string[],        // synthesised package.json paths
 *     all: string[],                 // union of the above
 *   }
 */
function computeBundledFiles() {
  const runtimeAbsDist = join(REPO_ROOT, RUNTIME_SRC_DIST);
  const driverAbsDist = join(REPO_ROOT, DRIVER_SRC_DIST);
  const nodeptyAbsBase = join(REPO_ROOT, NODEPTY_SRC_BASE);

  const runtimeDistRel = readdirSync(runtimeAbsDist, { withFileTypes: true })
    .filter((e) => e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.d.ts')))
    .map((e) => `${RUNTIME_DEST_BASE}/dist/${e.name}`)
    .sort();

  const driverDistRel = readdirSync(driverAbsDist, { withFileTypes: true })
    .filter((e) => e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.d.ts')))
    .map((e) => `${DRIVER_DEST_BASE}/dist/${e.name}`)
    .sort();

  const nodeptyRel = [];
  for (const dir of NODEPTY_INCLUDE_DIRS) {
    const abs = join(nodeptyAbsBase, dir);
    const found = collectFiles(abs).map((f) => `${NODEPTY_DEST_BASE}/${dir}/${f}`);
    nodeptyRel.push(...found);
  }
  for (const f of NODEPTY_INCLUDE_FILES) {
    nodeptyRel.push(`${NODEPTY_DEST_BASE}/${f}`);
  }
  nodeptyRel.sort();

  const packageJsons = [
    `${RUNTIME_DEST_BASE}/package.json`,
    `${DRIVER_DEST_BASE}/package.json`,
    `${NODEPTY_DEST_BASE}/package.json`,
  ];

  return {
    runtimeDist: runtimeDistRel,
    driverDist: driverDistRel,
    nodepty: nodeptyRel,
    packageJsons,
    all: [...runtimeDistRel, ...driverDistRel, ...nodeptyRel, ...packageJsons],
  };
}

/**
 * Forbidden paths under the bundled node_modules tree. Even if `--write`
 * misbehaves, these must never appear in the committed marketplace.
 */
function isForbiddenBundledPath(rel) {
  const normalized = rel.split('\\').join('/');
  if (!normalized.startsWith('node_modules/')) return null;
  const checks = [
    { match: 'node_modules/node-pty/src/', reason: 'node-pty C++ sources' },
    { match: 'node_modules/node-pty/binding.gyp', reason: 'node-pty gyp build descriptor' },
    { match: 'node_modules/node-pty/scripts/', reason: 'node-pty install/postinstall scripts' },
    { match: 'node_modules/node-pty/third_party/', reason: 'node-pty third_party tree' },
    { match: 'node_modules/node-pty/prebuilds/win32-', reason: 'win32 prebuild' },
  ];
  for (const { match, reason } of checks) {
    if (normalized === match || normalized.startsWith(match)) {
      return reason;
    }
  }
  if (normalized.endsWith('.tsbuildinfo')) {
    return 'non-deterministic tsbuildinfo';
  }
  if (normalized.endsWith('.js.map') || normalized.endsWith('.d.ts.map')) {
    return 'sourcemap (excluded for size; see EXCLUSIONS.md)';
  }
  return null;
}

// The complete set of expected files under marketplace/plugins/cc/.
// Bundled files are computed lazily because they depend on dist contents which
// must exist; runCheck/runWrite compute and merge them at call time.

// ---------------------------------------------------------------------------
// Defense-in-depth exclusion list.
// Keep in sync with marketplace/EXCLUSIONS.md.
// ---------------------------------------------------------------------------

/**
 * Patterns are either:
 *   - exact path segment (matches a segment equal to the string anywhere in the path,
 *     e.g., 'node_modules', '.git', 'test', 'tests', 'src',
 *     'documentation', 'references', 'tools', '.omc', '.github')
 *   - suffix glob ('*.test.mjs', '*.test.ts', '*.test.js', '*.ts',
 *     '*.pem', '*.key', '*.crt')
 *   - exact basename ('tsconfig.json', 'tsconfig.build.json',
 *     'package-lock.json', '.env', '.gitignore', '.prettierrc',
 *     'eslint.config.mjs', 'eslint.config.js', 'CLAUDE.md',
 *     'AGENTS.md', 'credentials.json', 'id_rsa', 'id_ed25519')
 *   - basename prefix ('tsconfig', '.env.', 'credentials')
 *
 * Keep this list in sync with marketplace/EXCLUSIONS.md.
 */
const EXCLUDED_SEGMENTS = [
  'node_modules',
  '.git',
  '.github',
  '.omc',
  'test',
  'tests',
  'src',
  'documentation',
  'references',
  'tools',
];
const EXCLUDED_SUFFIXES = [
  '.test.mjs',
  '.test.ts',
  '.test.js',
  '.ts', // covers source TS files; excludes nothing currently shipped
  '.pem',
  '.key',
  '.crt',
];
const EXCLUDED_EXACT_BASENAMES = [
  'tsconfig.json',
  'tsconfig.build.json',
  'package-lock.json',
  '.env',
  '.gitignore',
  '.prettierrc',
  'eslint.config.mjs',
  'eslint.config.js',
  'CLAUDE.md',
  'AGENTS.md',
  'credentials.json',
  'id_rsa',
  'id_ed25519',
  'id_rsa.pub',
  'id_ed25519.pub',
];
const EXCLUDED_BASENAME_PREFIXES = [
  'tsconfig', // covers tsconfig*.json
  '.env.', // covers .env.local etc.
  'credentials',
];

/**
 * Check whether a relative path (using OS separators or forward slashes) matches
 * any excluded pattern. Returns { excluded: true, reason: string } or { excluded: false }.
 */
function isExcluded(rel) {
  const normalized = rel.split('\\').join('/');
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1];

  // Path-segment match anywhere along the path
  for (const seg of segments) {
    if (EXCLUDED_SEGMENTS.includes(seg)) {
      return { excluded: true, reason: `excluded segment: ${seg}` };
    }
  }
  // Suffix match on the basename
  for (const suf of EXCLUDED_SUFFIXES) {
    if (basename.endsWith(suf)) {
      return { excluded: true, reason: `excluded suffix: ${suf}` };
    }
  }
  // Exact basename
  if (EXCLUDED_EXACT_BASENAMES.includes(basename)) {
    return { excluded: true, reason: `excluded exact basename: ${basename}` };
  }
  // Basename prefix
  for (const pre of EXCLUDED_BASENAME_PREFIXES) {
    if (basename.startsWith(pre)) {
      return { excluded: true, reason: `excluded basename prefix: ${pre}` };
    }
  }
  return { excluded: false };
}

// ---------------------------------------------------------------------------
// Repo-root resolution
// ---------------------------------------------------------------------------

function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
      if (pkg.name === 'cc-plugin-codex') {
        return dir;
      }
    } catch {
      // not found or not parseable — keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Could not find repo root (package.json with name "cc-plugin-codex")');
    }
    dir = parent;
  }
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(SCRIPT_DIR);
const SOURCE_DIR = join(REPO_ROOT, 'packages', 'plugin-codex');

// ---------------------------------------------------------------------------
// CLI argument parsing (before DEST_DIR so --marketplace-root is available)
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

// Resolve --marketplace-root or env var override
let marketplaceRootOverride = process.env.CC_PLUGIN_CODEX_MARKETPLACE_ROOT ?? null;
const filteredArgs = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--marketplace-root' && i + 1 < rawArgs.length) {
    marketplaceRootOverride = rawArgs[i + 1];
    i++; // skip value
  } else {
    filteredArgs.push(rawArgs[i]);
  }
}

const MARKETPLACE_ROOT = marketplaceRootOverride
  ? resolve(marketplaceRootOverride)
  : join(REPO_ROOT, 'marketplace');
const DEST_DIR = join(MARKETPLACE_ROOT, 'plugins', 'cc');

const flag = filteredArgs[0] ?? '--check';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect relative paths of all files under a directory. */
function collectFiles(dir, base = dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, base, results);
    } else if (entry.isFile()) {
      // Use forward slashes for portability
      results.push(
        resolve(full)
          .slice(resolve(base).length + 1)
          .replace(/\\/g, '/'),
      );
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
tools/package-marketplace.mjs — sync cc plugin into marketplace tree

USAGE
  node tools/package-marketplace.mjs [--check | --write | --help]
                                     [--marketplace-root <path>]

FLAGS
  --check   (default) Verify the marketplace tree matches the source.
            Runs exclusion enforcement FIRST (see marketplace/EXCLUSIONS.md),
            then the allowlist comparison.
            Exits 0 if clean; exits 1 with ISSUE messages on any problem.
  --write   Copy derived files from packages/plugin-codex/ into
            marketplace/plugins/cc/.
            Marketplace-owned files (README.md) are never touched.
            Prints a summary: "Wrote N derived files, skipped M marketplace-owned files."
  --help    Print this message and exit 0.

  --marketplace-root <path>
            Override the default marketplace root directory (default: <repo>/marketplace).
            Useful for pointing the script at a synthetic temp tree in tests.
            Env var equivalent: CC_PLUGIN_CODEX_MARKETPLACE_ROOT

EXAMPLES
  node tools/package-marketplace.mjs --check
  node tools/package-marketplace.mjs --write
  node tools/package-marketplace.mjs --write && node tools/package-marketplace.mjs --check
  node tools/package-marketplace.mjs --check --marketplace-root /tmp/synthetic-marketplace

EXCLUSIONS
  See marketplace/EXCLUSIONS.md for the human-readable categorized exclusion list.
  The --check mode runs exclusion enforcement before the allowlist comparison.

SOURCE
  packages/plugin-codex/

DESTINATION
  marketplace/plugins/cc/

DERIVED FILES (${DERIVED_FILES.length})
${DERIVED_FILES.map((f) => '  ' + f).join('\n')}

MARKETPLACE-OWNED FILES (not copied from source)
${MARKETPLACE_OWNED_FILES.map((f) => '  ' + f).join('\n')}
`);
}

// ---------------------------------------------------------------------------
// Bundled-tree helpers (T9.5)
// ---------------------------------------------------------------------------

/**
 * Map a bundled-destination relative path back to its source-of-truth absolute
 * path on disk. Used by `--check` byte-identity verification and by `--write`
 * to know what to copy.
 *
 * Returns null if the path is not a known bundled file (caller should treat
 * that as an unexpected-extra error).
 */
function bundledSourceFor(rel) {
  const norm = rel.split('\\').join('/');
  if (norm.startsWith(`${RUNTIME_DEST_BASE}/dist/`)) {
    const basename = norm.slice(`${RUNTIME_DEST_BASE}/dist/`.length);
    return join(REPO_ROOT, RUNTIME_SRC_DIST, basename);
  }
  if (norm.startsWith(`${DRIVER_DEST_BASE}/dist/`)) {
    const basename = norm.slice(`${DRIVER_DEST_BASE}/dist/`.length);
    return join(REPO_ROOT, DRIVER_SRC_DIST, basename);
  }
  if (norm.startsWith(`${NODEPTY_DEST_BASE}/`)) {
    const subpath = norm.slice(`${NODEPTY_DEST_BASE}/`.length);
    // package.json is synthesised, not byte-copied; caller handles separately.
    if (subpath === 'package.json') return null;
    return join(REPO_ROOT, NODEPTY_SRC_BASE, subpath);
  }
  return null;
}

/**
 * Synthesise the canonical bytes for a given bundled package.json.
 * Returns a Buffer with a trailing newline. Returns null if `rel` is not a
 * package.json we manage.
 */
function synthesizedPackageJsonBytes(rel) {
  if (rel === `${RUNTIME_DEST_BASE}/package.json`) {
    return Buffer.from(JSON.stringify(SYNTH_RUNTIME_PKG, null, 2) + '\n', 'utf8');
  }
  if (rel === `${DRIVER_DEST_BASE}/package.json`) {
    return Buffer.from(JSON.stringify(SYNTH_DRIVER_PKG, null, 2) + '\n', 'utf8');
  }
  if (rel === `${NODEPTY_DEST_BASE}/package.json`) {
    const srcAbs = join(REPO_ROOT, NODEPTY_SRC_BASE, 'package.json');
    const upstream = JSON.parse(readFileSync(srcAbs, 'utf8'));
    const reduced = {};
    for (const field of NODEPTY_PKG_KEEP_FIELDS) {
      if (upstream[field] !== undefined) reduced[field] = upstream[field];
    }
    return Buffer.from(JSON.stringify(reduced, null, 2) + '\n', 'utf8');
  }
  return null;
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

function runCheck() {
  const issues = [];

  // Compute bundled-file allowlist (depends on source dist contents).
  let bundled;
  try {
    bundled = computeBundledFiles();
  } catch (err) {
    issues.push(
      `ISSUE: failed to enumerate bundled-dep source files (did you run 'npm run build'?): ${err.message}`,
    );
    bundled = { runtimeDist: [], driverDist: [], nodepty: [], packageJsons: [], all: [] };
  }

  const allExpected = new Set([...DERIVED_FILES, ...MARKETPLACE_OWNED_FILES, ...bundled.all]);

  // 0. Exclusion enforcement (defense-in-depth, runs BEFORE allowlist comparison).
  let actualFilesForExclusion;
  try {
    actualFilesForExclusion = collectFiles(DEST_DIR);
  } catch {
    // Directory missing — will be reported in step 3 below
    actualFilesForExclusion = [];
  }
  for (const rel of actualFilesForExclusion) {
    // The bundled tree intentionally contains `node_modules/`, which is on the
    // global exclusion list. Skip exclusion enforcement for paths under the
    // bundled tree; instead, apply the bundled-specific forbidden-paths check.
    if (rel.split('\\').join('/').startsWith('node_modules/')) {
      const reason = isForbiddenBundledPath(rel);
      if (reason) {
        issues.push(
          `ISSUE: marketplace/plugins/cc/${rel} is forbidden in bundled tree (${reason})`,
        );
      }
      continue;
    }
    const result = isExcluded(rel);
    if (result.excluded) {
      issues.push(`ISSUE: marketplace/plugins/cc/${rel} is excluded (${result.reason})`);
    }
  }

  // 1. Verify each derived file exists in both source and destination, and is byte-identical.
  for (const rel of DERIVED_FILES) {
    const src = join(SOURCE_DIR, rel);
    const dst = join(DEST_DIR, rel);

    let srcBuf, dstBuf;
    try {
      srcBuf = readFileSync(src);
    } catch {
      issues.push(`ISSUE: derived file missing from source: packages/plugin-codex/${rel}`);
      continue;
    }
    try {
      dstBuf = readFileSync(dst);
    } catch {
      issues.push(`ISSUE: derived file missing from marketplace: marketplace/plugins/cc/${rel}`);
      continue;
    }
    if (!srcBuf.equals(dstBuf)) {
      issues.push(`ISSUE: byte mismatch between source and marketplace for: ${rel}`);
    }
  }

  // 1b. Verify each bundled-dep file exists in destination and is byte-identical to source.
  const bundledByteCheck = [...bundled.runtimeDist, ...bundled.driverDist, ...bundled.nodepty];
  for (const rel of bundledByteCheck) {
    const srcAbs = bundledSourceFor(rel);
    if (!srcAbs) {
      issues.push(`ISSUE: internal: no source mapping for bundled file: ${rel}`);
      continue;
    }
    const dst = join(DEST_DIR, rel);
    let srcBuf, dstBuf;
    try {
      srcBuf = readFileSync(srcAbs);
    } catch {
      issues.push(`ISSUE: bundled-dep source missing on disk: ${srcAbs}`);
      continue;
    }
    try {
      dstBuf = readFileSync(dst);
    } catch {
      issues.push(`ISSUE: bundled-dep missing from marketplace: marketplace/plugins/cc/${rel}`);
      continue;
    }
    if (!srcBuf.equals(dstBuf)) {
      issues.push(`ISSUE: byte mismatch between source and marketplace for bundled-dep: ${rel}`);
    }
  }

  // 1c. Verify synthesized package.json files match the canonical shape.
  for (const rel of bundled.packageJsons) {
    const expected = synthesizedPackageJsonBytes(rel);
    if (!expected) {
      issues.push(`ISSUE: internal: no synthesized shape for: ${rel}`);
      continue;
    }
    const dst = join(DEST_DIR, rel);
    let actual;
    try {
      actual = readFileSync(dst);
    } catch {
      issues.push(
        `ISSUE: bundled package.json missing from marketplace: marketplace/plugins/cc/${rel}`,
      );
      continue;
    }
    if (!expected.equals(actual)) {
      issues.push(`ISSUE: bundled package.json does not match canonical synthesized shape: ${rel}`);
    }
  }

  // 2. Verify marketplace-owned files exist (but do not compare to source).
  for (const rel of MARKETPLACE_OWNED_FILES) {
    const dst = join(DEST_DIR, rel);
    try {
      statSync(dst);
    } catch {
      issues.push(`ISSUE: marketplace-owned file missing: marketplace/plugins/cc/${rel}`);
    }
  }

  // 3. Check for unexpected files in the destination tree.
  let actualFiles;
  try {
    actualFiles = collectFiles(DEST_DIR);
  } catch {
    issues.push(`ISSUE: marketplace destination directory missing: ${DEST_DIR}`);
    actualFiles = [];
  }
  for (const rel of actualFiles) {
    if (!allExpected.has(rel)) {
      issues.push(`ISSUE: unexpected file in marketplace tree: marketplace/plugins/cc/${rel}`);
    }
  }

  // 4. Verify executable bit on scripts/cc.mjs.
  const entrypointDst = join(DEST_DIR, 'scripts', 'cc.mjs');
  try {
    const st = statSync(entrypointDst);
    if (!(st.mode & 0o100)) {
      issues.push(
        `ISSUE: scripts/cc.mjs in marketplace is missing user-executable bit (mode=${st.mode.toString(8)})`,
      );
    }
  } catch {
    // Already reported above as missing derived file
  }

  // 5. Verify marketplace root manifest exists and parses with correct name.
  //    Only run this check when using the default marketplace root (skip for synthetic roots).
  if (!marketplaceRootOverride) {
    const marketplaceJson = join(MARKETPLACE_ROOT, '.agents', 'plugins', 'marketplace.json');
    try {
      const parsed = JSON.parse(readFileSync(marketplaceJson, 'utf8'));
      if (parsed.name !== 'cc-plugin-codex-local') {
        issues.push(
          `ISSUE: marketplace.json has unexpected name: "${parsed.name}" (expected "cc-plugin-codex-local")`,
        );
      }
    } catch (err) {
      issues.push(
        `ISSUE: marketplace.json missing or invalid JSON: ${marketplaceJson} (${err.message})`,
      );
    }
  }

  // Report
  if (issues.length === 0) {
    console.log(
      `check: OK — ${DERIVED_FILES.length} derived files match source, ` +
        `${bundledByteCheck.length} bundled-dep files match source, ` +
        `${bundled.packageJsons.length} synthesized package.json files match canonical shape, ` +
        `${MARKETPLACE_OWNED_FILES.length} marketplace-owned files present, no unexpected files.`,
    );
    return 0;
  } else {
    for (const issue of issues) {
      console.error(issue);
    }
    return 1;
  }
}

// ---------------------------------------------------------------------------
// --write
// ---------------------------------------------------------------------------

function runWrite() {
  // Ensure source dists are fresh before copying.
  // Skipped when CC_PLUGIN_CODEX_SKIP_BUILD=1 (used by tests that already built).
  if (!process.env.CC_PLUGIN_CODEX_SKIP_BUILD) {
    console.log('Building workspace packages (tsc --build)...');
    try {
      execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
    } catch (err) {
      console.error(`ERROR: npm run build failed: ${err.message}`);
      return 1;
    }
  }

  let wrote = 0;
  const skipped = MARKETPLACE_OWNED_FILES.length;

  // 1. Derived files (plugin scripts + skills).
  for (const rel of DERIVED_FILES) {
    const src = join(SOURCE_DIR, rel);
    const dst = join(DEST_DIR, rel);

    mkdirSync(dirname(dst), { recursive: true });
    const buf = readFileSync(src);
    writeFileSync(dst, buf);
    wrote++;

    if (rel === 'scripts/cc.mjs') {
      chmodSync(dst, 0o755);
    }
  }

  // 2. Bundled-dep tree.
  const bundled = computeBundledFiles();

  // Pre-clean the bundled tree so removed/renamed source files don't linger.
  // Keeps the operation idempotent across source-tree changes.
  const bundledRoot = join(DEST_DIR, 'node_modules');
  try {
    const existing = collectFiles(bundledRoot);
    const expected = new Set(bundled.all);
    for (const rel of existing) {
      const fullRel = `node_modules/${rel}`;
      if (!expected.has(fullRel)) {
        const fullPath = join(bundledRoot, rel);
        try {
          rmSync(fullPath, { force: true });
        } catch {
          /* best-effort; --check will flag any leftover */
        }
      }
    }
  } catch {
    /* bundled tree does not yet exist; nothing to clean */
  }

  let bundledWrote = 0;

  // 2a. Copy runtime + driver dist + node-pty source files.
  const byteCopy = [...bundled.runtimeDist, ...bundled.driverDist, ...bundled.nodepty];
  for (const rel of byteCopy) {
    const srcAbs = bundledSourceFor(rel);
    if (!srcAbs) {
      console.error(`internal: no source mapping for bundled file: ${rel}`);
      return 1;
    }
    const dst = join(DEST_DIR, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(srcAbs, dst);
    bundledWrote++;
  }

  // 2b. Write synthesized package.json files.
  let pkgsWrote = 0;
  for (const rel of bundled.packageJsons) {
    const bytes = synthesizedPackageJsonBytes(rel);
    if (!bytes) {
      console.error(`internal: no synthesized shape for: ${rel}`);
      return 1;
    }
    const dst = join(DEST_DIR, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, bytes);
    pkgsWrote++;
  }

  console.log(
    `Wrote ${wrote} derived files, ${bundledWrote} bundled-dep files, ` +
      `${pkgsWrote} synthesized package.json files, ` +
      `skipped ${skipped} marketplace-owned files.`,
  );

  // Post-write check: warn about any unexpected extras (do not delete them).
  const allExpected = new Set([...DERIVED_FILES, ...MARKETPLACE_OWNED_FILES, ...bundled.all]);
  const actualFiles = collectFiles(DEST_DIR);
  const extras = actualFiles.filter((f) => !allExpected.has(f));
  if (extras.length > 0) {
    console.warn(
      `\nWARNING: the following unexpected files exist in the marketplace tree and were not removed:`,
    );
    for (const f of extras) {
      console.warn(`  marketplace/plugins/cc/${f}`);
    }
    console.warn(`Run --check to see the full issue list. Clean up manually if needed.`);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (flag === '--help' || flag === '-h') {
  printHelp();
  process.exit(0);
} else if (flag === '--write') {
  process.exit(runWrite());
} else if (flag === '--check') {
  process.exit(runCheck());
} else {
  console.error(`Unknown flag: ${flag}`);
  console.error('Use --help for usage.');
  process.exit(1);
}
