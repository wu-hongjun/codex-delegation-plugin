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
const DEST_DIR = join(REPO_ROOT, 'marketplace', 'plugins', 'claude-companion');
const MARKETPLACE_ROOT = join(REPO_ROOT, 'marketplace');

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

FLAGS
  --check   (default) Verify the marketplace tree matches the source.
            Exits 0 if clean; exits 1 with ISSUE messages on any problem.
  --write   Copy derived files from packages/plugin-codex/ into
            marketplace/plugins/claude-companion/.
            Marketplace-owned files (README.md) are never touched.
            Prints a summary: "Wrote N derived files, skipped M marketplace-owned files."
  --help    Print this message and exit 0.

EXAMPLES
  node tools/package-marketplace.mjs --check
  node tools/package-marketplace.mjs --write
  node tools/package-marketplace.mjs --write && node tools/package-marketplace.mjs --check

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

const args = process.argv.slice(2);
const flag = args[0] ?? '--check';

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
