#!/usr/bin/env node
/**
 * tools/package-marketplace.mjs
 *
 * Packages (syncs) the claude-companion plugin from source into the marketplace tree.
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

import { readFileSync, writeFileSync, mkdirSync, chmodSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Allowlist — authoritative list of files managed by this script.
// Edit this list to add or remove shipped files.
// ---------------------------------------------------------------------------

/**
 * DERIVED_FILES: copied byte-for-byte from packages/plugin-codex/ into
 * marketplace/plugins/claude-companion/.
 *
 * Note: scripts/claude-companion.mjs gets chmod 0755 after copy regardless of
 * source mode (source is 644, marketplace copy must be executable).
 */
const DERIVED_FILES = [
  '.codex-plugin/plugin.json',
  'scripts/claude-companion.mjs',
  'scripts/lib/ack.mjs',
  'scripts/lib/adapter.mjs',
  'scripts/lib/args.mjs',
  'scripts/lib/format.mjs',
  'scripts/lib/prompt-meta.mjs',
  'scripts/lib/review-parser.mjs',
  'scripts/lib/review-prompts.mjs',
  'scripts/lib/review-result-source.mjs',
  'skills/claude-setup/SKILL.md',
  'skills/claude-delegate/SKILL.md',
  'skills/claude-status/SKILL.md',
  'skills/claude-result/SKILL.md',
  'skills/claude-stop/SKILL.md',
  'skills/claude-followup/SKILL.md',
  'skills/claude-review/SKILL.md',
  'skills/claude-adversarial-review/SKILL.md',
];

/**
 * MARKETPLACE_OWNED_FILES: present in marketplace/plugins/claude-companion/ but
 * NOT derived from source. The packaging script never writes or deletes these.
 *
 * README.md — Option A: marketplace-owned placeholder (T2); T12 will replace it.
 */
const MARKETPLACE_OWNED_FILES = ['README.md'];

// The complete set of expected files under marketplace/plugins/claude-companion/
const ALL_EXPECTED_FILES = new Set([...DERIVED_FILES, ...MARKETPLACE_OWNED_FILES]);

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
const DEST_DIR = join(MARKETPLACE_ROOT, 'plugins', 'claude-companion');

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
tools/package-marketplace.mjs — sync claude-companion plugin into marketplace tree

USAGE
  node tools/package-marketplace.mjs [--check | --write | --help]
                                     [--marketplace-root <path>]

FLAGS
  --check   (default) Verify the marketplace tree matches the source.
            Runs exclusion enforcement FIRST (see marketplace/EXCLUSIONS.md),
            then the allowlist comparison.
            Exits 0 if clean; exits 1 with ISSUE messages on any problem.
  --write   Copy derived files from packages/plugin-codex/ into
            marketplace/plugins/claude-companion/.
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
  marketplace/plugins/claude-companion/

DERIVED FILES (${DERIVED_FILES.length})
${DERIVED_FILES.map((f) => '  ' + f).join('\n')}

MARKETPLACE-OWNED FILES (not copied from source)
${MARKETPLACE_OWNED_FILES.map((f) => '  ' + f).join('\n')}
`);
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

function runCheck() {
  const issues = [];

  // 0. Exclusion enforcement (defense-in-depth, runs BEFORE allowlist comparison).
  let actualFilesForExclusion;
  try {
    actualFilesForExclusion = collectFiles(DEST_DIR);
  } catch {
    // Directory missing — will be reported in step 3 below
    actualFilesForExclusion = [];
  }
  for (const rel of actualFilesForExclusion) {
    const result = isExcluded(rel);
    if (result.excluded) {
      issues.push(
        `ISSUE: marketplace/plugins/claude-companion/${rel} is excluded (${result.reason})`,
      );
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
      issues.push(
        `ISSUE: derived file missing from marketplace: marketplace/plugins/claude-companion/${rel}`,
      );
      continue;
    }
    if (!srcBuf.equals(dstBuf)) {
      issues.push(`ISSUE: byte mismatch between source and marketplace for: ${rel}`);
    }
  }

  // 2. Verify marketplace-owned files exist (but do not compare to source).
  for (const rel of MARKETPLACE_OWNED_FILES) {
    const dst = join(DEST_DIR, rel);
    try {
      statSync(dst);
    } catch {
      issues.push(
        `ISSUE: marketplace-owned file missing: marketplace/plugins/claude-companion/${rel}`,
      );
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
    if (!ALL_EXPECTED_FILES.has(rel)) {
      issues.push(
        `ISSUE: unexpected file in marketplace tree: marketplace/plugins/claude-companion/${rel}`,
      );
    }
  }

  // 4. Verify executable bit on scripts/claude-companion.mjs.
  const entrypointDst = join(DEST_DIR, 'scripts', 'claude-companion.mjs');
  try {
    const st = statSync(entrypointDst);
    if (!(st.mode & 0o100)) {
      issues.push(
        `ISSUE: scripts/claude-companion.mjs in marketplace is missing user-executable bit (mode=${st.mode.toString(8)})`,
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
      `check: OK — ${DERIVED_FILES.length} derived files match source, ${MARKETPLACE_OWNED_FILES.length} marketplace-owned files present, no unexpected files.`,
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
  let wrote = 0;
  const skipped = MARKETPLACE_OWNED_FILES.length;

  for (const rel of DERIVED_FILES) {
    const src = join(SOURCE_DIR, rel);
    const dst = join(DEST_DIR, rel);

    // Ensure destination directory exists
    mkdirSync(dirname(dst), { recursive: true });

    // Copy bytes
    const buf = readFileSync(src);
    writeFileSync(dst, buf);
    wrote++;

    // Preserve / enforce executable bit for the entrypoint
    if (rel === 'scripts/claude-companion.mjs') {
      chmodSync(dst, 0o755);
    }
  }

  console.log(`Wrote ${wrote} derived files, skipped ${skipped} marketplace-owned files.`);

  // Post-write check: warn about any unexpected extras (do not delete them)
  const actualFiles = collectFiles(DEST_DIR);
  const extras = actualFiles.filter((f) => !ALL_EXPECTED_FILES.has(f));
  if (extras.length > 0) {
    console.warn(
      `\nWARNING: the following unexpected files exist in the marketplace tree and were not removed:`,
    );
    for (const f of extras) {
      console.warn(`  marketplace/plugins/claude-companion/${f}`);
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
