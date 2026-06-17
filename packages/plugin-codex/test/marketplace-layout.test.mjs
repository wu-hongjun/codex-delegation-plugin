// Static-validation tests for marketplace/ layout — Plan 0006 T2
//
// These tests do NOT spawn processes. They verify file existence, JSON structure,
// executable bits, directory contents, and the absence of forbidden tokens.
//
// Pattern mirrors readme.test.mjs and skills-manifest.test.mjs:
// node:test + node:assert/strict, ESM, import.meta.url path resolution.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
// packages/plugin-codex/test/ -> up 3 levels to repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const MARKETPLACE_ROOT = resolve(REPO_ROOT, 'marketplace');
const SOURCE_PLUGIN_ROOT = resolve(REPO_ROOT, 'packages', 'plugin-codex');

// Derived paths used across multiple tests
const ROOT_MARKETPLACE_JSON = resolve(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');
const MARKETPLACE_JSON = resolve(MARKETPLACE_ROOT, '.agents', 'plugins', 'marketplace.json');
const MARKETPLACE_PLUGIN_ROOT = resolve(MARKETPLACE_ROOT, 'plugins', 'cc');
const MARKETPLACE_PLUGIN_JSON = resolve(MARKETPLACE_PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const SOURCE_PLUGIN_JSON = resolve(SOURCE_PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const SOURCE_PLUGIN_VERSION = JSON.parse(readFileSync(SOURCE_PLUGIN_JSON, 'utf8')).version;
const BUNDLED_VERSION_MARKER = `${SOURCE_PLUGIN_VERSION}-bundled`;
const MARKETPLACE_SCRIPTS_DIR = resolve(MARKETPLACE_PLUGIN_ROOT, 'scripts');
const MARKETPLACE_ENTRY_SCRIPT = resolve(MARKETPLACE_SCRIPTS_DIR, 'cc.mjs');
const MARKETPLACE_LIB_DIR = resolve(MARKETPLACE_SCRIPTS_DIR, 'lib');
const SOURCE_LIB_DIR = resolve(SOURCE_PLUGIN_ROOT, 'scripts', 'lib');
const MARKETPLACE_SKILLS_DIR = resolve(MARKETPLACE_PLUGIN_ROOT, 'skills');
const MARKETPLACE_README = resolve(MARKETPLACE_PLUGIN_ROOT, 'README.md');

// ---------- forbidden cost-claim tokens (OQ4) ----------

const FORBIDDEN_COST_TOKENS = [
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

// ---------- expected skill names ----------

const EXPECTED_SKILL_NAMES = [
  'claude-adversarial-review',
  'claude-batch',
  'claude-deep-research',
  'claude-delegate',
  'claude-followup',
  'claude-fork',
  'claude-goal',
  'claude-result',
  'claude-review',
  'claude-setup',
  'claude-skills',
  'claude-status',
  'claude-stop',
  'claude-upgrade',
  'claude-workflow',
  'claude-workflows',
];

// ---------- helpers ----------

/**
 * Recursively walk a directory tree, calling `visitor(absoluteFilePath)`
 * for every file found. Does NOT spawn child processes.
 */
function walkFiles(dir, visitor) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, visitor);
    } else if (entry.isFile()) {
      visitor(full);
    }
  }
}

// ==========================================================================
// Check 1: marketplace.json exists, is valid JSON, and has required shape
// ==========================================================================

describe('marketplace/ layout (Plan 0006 T2)', () => {
  it('root .agents/plugins/marketplace.json exposes the public Git marketplace shape', () => {
    assert.ok(
      existsSync(ROOT_MARKETPLACE_JSON),
      `root marketplace.json not found at ${ROOT_MARKETPLACE_JSON}`,
    );

    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(readFileSync(ROOT_MARKETPLACE_JSON, 'utf8'));
    }, `root marketplace.json is not valid JSON`);

    assert.equal(
      parsed.name,
      'cc-plugin-codex',
      `root marketplace.json name must be "cc-plugin-codex"; got "${parsed.name}"`,
    );
    assert.equal(
      parsed.interface?.displayName,
      'cc-plugin-codex',
      `root marketplace.json interface.displayName must be "cc-plugin-codex"; got "${parsed.interface?.displayName}"`,
    );
    assert.ok(Array.isArray(parsed.plugins), `root marketplace.json "plugins" must be an array`);
    assert.equal(
      parsed.plugins.length,
      1,
      `root marketplace.json "plugins" array must have length 1; got ${parsed.plugins.length}`,
    );
    assert.equal(
      parsed.plugins[0].name,
      'cc',
      `root marketplace.json plugins[0].name must be "cc"; got "${parsed.plugins[0].name}"`,
    );
    assert.equal(
      parsed.plugins[0].source?.source,
      'local',
      `root marketplace.json plugins[0].source.source must be "local"; got "${parsed.plugins[0].source?.source}"`,
    );
    assert.equal(
      parsed.plugins[0].source?.path,
      './marketplace/plugins/cc',
      `root marketplace.json plugins[0].source.path must be "./marketplace/plugins/cc"; got "${parsed.plugins[0].source?.path}"`,
    );
  });

  it('marketplace/.agents/plugins/marketplace.json exists and has required shape', () => {
    assert.ok(existsSync(MARKETPLACE_JSON), `marketplace.json not found at ${MARKETPLACE_JSON}`);

    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(readFileSync(MARKETPLACE_JSON, 'utf8'));
    }, `marketplace.json is not valid JSON`);

    assert.equal(
      parsed.name,
      'cc-plugin-codex-local',
      `marketplace.json name must be "cc-plugin-codex-local"; got "${parsed.name}"`,
    );
    assert.equal(
      parsed.interface?.displayName,
      'cc-plugin-codex Local Marketplace',
      `marketplace.json interface.displayName must be "cc-plugin-codex Local Marketplace"; got "${parsed.interface?.displayName}"`,
    );
    assert.ok(Array.isArray(parsed.plugins), `marketplace.json "plugins" must be an array`);
    assert.equal(
      parsed.plugins.length,
      1,
      `marketplace.json "plugins" array must have length 1; got ${parsed.plugins.length}`,
    );
    assert.equal(
      parsed.plugins[0].name,
      'cc',
      `marketplace.json plugins[0].name must be "cc"; got "${parsed.plugins[0].name}"`,
    );
    assert.equal(
      parsed.plugins[0].source?.source,
      'local',
      `marketplace.json plugins[0].source.source must be "local"; got "${parsed.plugins[0].source?.source}"`,
    );
    assert.equal(
      parsed.plugins[0].source?.path,
      './plugins/cc',
      `marketplace.json plugins[0].source.path must be "./plugins/cc"; got "${parsed.plugins[0].source?.path}"`,
    );
  });

  // ========================================================================
  // Check 2: marketplace plugin.json exists and is valid JSON
  // ========================================================================

  it('marketplace/plugins/cc/.codex-plugin/plugin.json exists', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_JSON),
      `marketplace plugin.json not found at ${MARKETPLACE_PLUGIN_JSON}`,
    );
  });

  it('marketplace plugin.json is valid JSON (readFileSync + JSON.parse does not throw)', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_JSON),
      `marketplace plugin.json not found at ${MARKETPLACE_PLUGIN_JSON}`,
    );
    assert.doesNotThrow(
      () => JSON.parse(readFileSync(MARKETPLACE_PLUGIN_JSON, 'utf8')),
      `marketplace plugin.json is not valid JSON`,
    );
  });

  // ========================================================================
  // Check 2b: marketplace plugin.json version is exactly "0.3.10"
  // ========================================================================

  it('marketplace plugin.json version is exactly "0.3.10"', () => {
    const parsed = JSON.parse(readFileSync(MARKETPLACE_PLUGIN_JSON, 'utf8'));
    assert.equal(
      parsed.version,
      '0.3.10',
      `marketplace plugin.json version must be "0.3.10"; got "${parsed.version}"`,
    );
  });

  // ========================================================================
  // Check 2c: marketplace plugin.json contains no OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('marketplace plugin.json contains no OQ4 forbidden cost-claim tokens (raw file scan)', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_JSON),
      `marketplace plugin.json not found at ${MARKETPLACE_PLUGIN_JSON}`,
    );
    const raw = readFileSync(MARKETPLACE_PLUGIN_JSON, 'utf8');
    const serialized = JSON.stringify(JSON.parse(raw));
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        raw.includes(token),
        false,
        `marketplace plugin.json (raw) contains forbidden token "${token}"`,
      );
      assert.equal(
        serialized.includes(token),
        false,
        `marketplace plugin.json (serialized) contains forbidden token "${token}"`,
      );
    }
  });

  // ========================================================================
  // Check 3: marketplace plugin.json is byte-identical to source plugin.json
  // ========================================================================

  it('marketplace plugin.json is byte-identical to packages/plugin-codex/.codex-plugin/plugin.json', () => {
    assert.ok(
      existsSync(SOURCE_PLUGIN_JSON),
      `source plugin.json not found at ${SOURCE_PLUGIN_JSON}`,
    );
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_JSON),
      `marketplace plugin.json not found at ${MARKETPLACE_PLUGIN_JSON}`,
    );
    const sourceContent = readFileSync(SOURCE_PLUGIN_JSON, 'utf8');
    const marketplaceContent = readFileSync(MARKETPLACE_PLUGIN_JSON, 'utf8');
    assert.equal(
      marketplaceContent,
      sourceContent,
      `marketplace plugin.json must be byte-identical to source plugin.json`,
    );
  });

  // ========================================================================
  // Check 4: marketplace skills/ contains exactly the 8 expected directories
  // ========================================================================

  it('marketplace skills/ contains exactly the 16 expected skill directories', () => {
    assert.ok(
      existsSync(MARKETPLACE_SKILLS_DIR),
      `marketplace skills/ directory not found at ${MARKETPLACE_SKILLS_DIR}`,
    );
    const entries = readdirSync(MARKETPLACE_SKILLS_DIR, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    assert.deepEqual(
      dirs,
      EXPECTED_SKILL_NAMES,
      `marketplace skills/ directories must be exactly ${JSON.stringify(EXPECTED_SKILL_NAMES)}; got ${JSON.stringify(dirs)}`,
    );
  });

  // ========================================================================
  // Check 5: each skill directory contains a non-empty SKILL.md
  // ========================================================================

  it('each of the 16 skill directories contains a non-empty SKILL.md', () => {
    for (const skillName of EXPECTED_SKILL_NAMES) {
      const skillMdPath = join(MARKETPLACE_SKILLS_DIR, skillName, 'SKILL.md');
      assert.ok(
        existsSync(skillMdPath),
        `SKILL.md not found for skill "${skillName}" at ${skillMdPath}`,
      );
      const content = readFileSync(skillMdPath, 'utf8');
      assert.ok(content.length > 0, `SKILL.md for skill "${skillName}" is empty`);
    }
  });

  // ========================================================================
  // Check 6: marketplace cc.mjs exists and has executable bit
  // ========================================================================

  it('marketplace/plugins/cc/scripts/cc.mjs exists and has the user-executable bit set', () => {
    assert.ok(
      existsSync(MARKETPLACE_ENTRY_SCRIPT),
      `cc.mjs not found at ${MARKETPLACE_ENTRY_SCRIPT}`,
    );
    const stat = statSync(MARKETPLACE_ENTRY_SCRIPT);
    assert.ok(
      (stat.mode & 0o100) !== 0,
      `cc.mjs must have the user-executable bit set; mode = ${stat.mode.toString(8)}`,
    );
  });

  // ========================================================================
  // Check 7: marketplace scripts/lib/ contains every .mjs helper from source,
  //          with no missing and no extra files, each with size > 0
  // ========================================================================

  it('marketplace scripts/lib/ contains exactly the same .mjs helpers as source scripts/lib/', () => {
    assert.ok(existsSync(SOURCE_LIB_DIR), `source scripts/lib/ not found at ${SOURCE_LIB_DIR}`);
    assert.ok(
      existsSync(MARKETPLACE_LIB_DIR),
      `marketplace scripts/lib/ not found at ${MARKETPLACE_LIB_DIR}`,
    );

    const sourceFiles = readdirSync(SOURCE_LIB_DIR)
      .filter((f) => f.endsWith('.mjs'))
      .sort();
    const marketplaceFiles = readdirSync(MARKETPLACE_LIB_DIR)
      .filter((f) => f.endsWith('.mjs'))
      .sort();

    assert.deepEqual(
      marketplaceFiles,
      sourceFiles,
      `marketplace scripts/lib/ .mjs files must exactly match source; expected ${JSON.stringify(sourceFiles)}, got ${JSON.stringify(marketplaceFiles)}`,
    );

    // Each lib file must exist in marketplace and have size > 0
    for (const filename of sourceFiles) {
      const marketplacePath = join(MARKETPLACE_LIB_DIR, filename);
      assert.ok(existsSync(marketplacePath), `marketplace lib file missing: ${filename}`);
      const stat = statSync(marketplacePath);
      assert.ok(stat.size > 0, `marketplace lib file is empty: ${filename}`);
    }
  });

  // ========================================================================
  // Check 8: no forbidden internal/test files under marketplace/plugins/cc/
  //
  // Note (Plan 0006 T9.5): the bundled node_modules/ subtree is intentional
  // and governed by the T9.5 describe block. This check skips that subtree so
  // it does not fire on the bundled package.json / dist/ files.
  // ========================================================================

  it('no forbidden internal/test files appear under marketplace/plugins/cc/', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const FORBIDDEN_PATH_SEGMENTS = [
      'test/',
      'tests/',
      'tsconfig',
      '.env',
      '.pem',
      '.key',
      '.crt',
      '.git/',
      '.github/',
      'tools/',
      'documentation/',
      'references/',
    ];

    walkFiles(MARKETPLACE_PLUGIN_ROOT, (filePath) => {
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Skip the bundled node_modules/ subtree — it is validated separately in
      // the "marketplace bundled-dependency tree (Plan 0006 T9.5)" describe block.
      if (normalizedPath.includes('/node_modules/')) return;

      const basename = filePath.split('/').pop() ?? '';

      // Basename must not be a test file
      assert.ok(
        !/\.test\.mjs$|\.test\.js$|\.test\.ts$/.test(basename),
        `forbidden test file found in marketplace: ${filePath}`,
      );

      // File path must not contain forbidden segments
      for (const segment of FORBIDDEN_PATH_SEGMENTS) {
        assert.ok(
          !normalizedPath.includes(segment),
          `file path contains forbidden segment "${segment}": ${filePath}`,
        );
      }
    });
  });

  // ========================================================================
  // Check 9: marketplace.json contains no OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('marketplace.json contains no OQ4 forbidden cost-claim tokens', () => {
    const content = readFileSync(MARKETPLACE_JSON, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `marketplace.json contains forbidden cost-claim token "${token}"`,
      );
    }
  });

  // ========================================================================
  // Check 10: marketplace README.md contains no OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('marketplace/plugins/cc/README.md contains no OQ4 forbidden cost-claim tokens', () => {
    assert.ok(
      existsSync(MARKETPLACE_README),
      `marketplace README.md not found at ${MARKETPLACE_README}`,
    );
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `marketplace README.md contains forbidden cost-claim token "${token}"`,
      );
    }
  });
});

// ==========================================================================
// Plan 0006 T4 — marketplace packaging procedure tests
// ==========================================================================

// ---------- T4 path constants ----------

const MANIFEST_MD = resolve(MARKETPLACE_ROOT, 'MANIFEST.md');
const PACKAGE_SCRIPT = resolve(REPO_ROOT, 'tools', 'package-marketplace.mjs');

// Authoritative allowlist of the 27 derived files (relative to marketplace plugin root).
const DERIVED_FILES_ALLOWLIST = [
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
  'skills/claude-skills/SKILL.md',
  'skills/claude-upgrade/SKILL.md',
];

// Marketplace-owned files (present in plugin root but NOT derived from source).
const MARKETPLACE_OWNED = new Set(['README.md']);

/**
 * Parse MANIFEST.md and return the set of relative paths listed under
 * "Plugin-tree files". A bullet line counts if it contains a backtick-wrapped
 * token that looks like a relative file path (contains a '.' or '/').
 */
function readManifestList(manifestPath) {
  const content = readFileSync(manifestPath, 'utf8');
  const listed = new Set();
  for (const line of content.split('\n')) {
    // Match any backtick-wrapped token that contains '/' or starts with '.'
    const matches = [...line.matchAll(/`([^`]+)`/g)];
    for (const m of matches) {
      const token = m[1];
      if ((token.includes('/') || token.startsWith('.')) && !token.startsWith('node ')) {
        listed.add(token);
      }
    }
  }
  return listed;
}

/**
 * Recursively collect relative (forward-slash) paths of all files under dir.
 */
function collectRelFiles(dir, base = dir, results = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRelFiles(full, base, results);
    } else if (entry.isFile()) {
      results.push(
        resolve(full)
          .slice(resolve(base).length + 1)
          .replace(/\\/g, '/'),
      );
    }
  }
  return results;
}

describe('marketplace packaging procedure (Plan 0006 T4)', () => {
  // ========================================================================
  // T4-1: MANIFEST.md exists and is non-empty
  // ========================================================================

  it('marketplace/MANIFEST.md exists and is non-empty', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    const content = readFileSync(MANIFEST_MD, 'utf8');
    assert.ok(content.length > 0, 'MANIFEST.md is empty');
  });

  // ========================================================================
  // T4-2: MANIFEST.md lists every derived file in the marketplace tree
  // ========================================================================

  it('MANIFEST.md lists every derived file under marketplace/plugins/cc/', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const listed = readManifestList(MANIFEST_MD);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);

    // Every actual file that is NOT marketplace-owned and NOT under the bundled
    // node_modules/ subtree must appear in the manifest list.
    // (Bundled dep files are documented at a section level in MANIFEST.md, not
    // file-by-file; their structure is governed by the T9.5 describe block.)
    const missing = [];
    for (const rel of actualFiles) {
      if (rel.startsWith('node_modules/')) continue;
      if (!MARKETPLACE_OWNED.has(rel) && !listed.has(rel)) {
        missing.push(rel);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `MANIFEST.md is missing entries for these marketplace files: ${JSON.stringify(missing)}`,
    );
  });

  // ========================================================================
  // T4-3: No file under marketplace/plugins/cc/ is outside
  //        the MANIFEST.md list (reverse direction)
  // ========================================================================

  it('marketplace/plugins/cc/ contains no file outside the MANIFEST.md list (reverse check)', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const listed = readManifestList(MANIFEST_MD);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);

    // Bundled node_modules/ files are documented at section level in MANIFEST.md,
    // not file-by-file. Skip them here; T9.5 block enforces their structure.
    const unlisted = [];
    for (const rel of actualFiles) {
      if (rel.startsWith('node_modules/')) continue;
      if (!MARKETPLACE_OWNED.has(rel) && !listed.has(rel)) {
        unlisted.push(rel);
      }
    }
    assert.deepEqual(
      unlisted,
      [],
      `Files present in marketplace tree but not in MANIFEST.md (and not marketplace-owned): ${JSON.stringify(unlisted)}`,
    );
  });

  // ========================================================================
  // T4-4: Source <-> marketplace byte-identity for all 27 derived files
  // ========================================================================

  it('all 27 derived files are byte-identical between source and marketplace', () => {
    for (const rel of DERIVED_FILES_ALLOWLIST) {
      const srcPath = resolve(SOURCE_PLUGIN_ROOT, rel);
      const dstPath = resolve(MARKETPLACE_PLUGIN_ROOT, rel);

      assert.ok(existsSync(srcPath), `source file missing: packages/plugin-codex/${rel}`);
      assert.ok(existsSync(dstPath), `marketplace file missing: marketplace/plugins/cc/${rel}`);

      const srcBytes = readFileSync(srcPath);
      const dstBytes = readFileSync(dstPath);
      assert.equal(
        srcBytes.equals(dstBytes),
        true,
        `byte mismatch between source and marketplace for: ${rel}`,
      );
    }
  });

  // ========================================================================
  // T4-5: `node tools/package-marketplace.mjs --check` exits 0
  // ========================================================================

  it('`node tools/package-marketplace.mjs --check` exits 0 on the current tree', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
    assert.equal(
      result.status,
      0,
      `--check exited ${result.status}; stdout: ${result.stdout}; stderr: ${result.stderr}`,
    );
  });

  // ========================================================================
  // T4-6: `--check` detects drift (file-content-restore approach)
  //
  // Strategy: overwrite one derived file's first byte in the marketplace copy,
  // run --check, assert non-zero exit, then restore via try/finally.
  // This is safe as long as the restore executes — the try/finally guarantees it.
  // ========================================================================

  it('`node tools/package-marketplace.mjs --check` exits non-zero when marketplace drifts from source', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    // Pick the simplest derived file to mutate (plugin.json — always present).
    const targetRel = '.codex-plugin/plugin.json';
    const targetPath = resolve(MARKETPLACE_PLUGIN_ROOT, targetRel);
    assert.ok(existsSync(targetPath), `drift-test target not found: ${targetPath}`);

    const originalBytes = readFileSync(targetPath);

    // Introduce a single-byte mutation: flip the first byte.
    const mutated = Buffer.from(originalBytes);
    mutated[0] = mutated[0] === 0x78 ? 0x79 : 0x78; // 'x' <-> 'y' (both printable, won't break Buffer)

    try {
      writeFileSync(targetPath, mutated);

      const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
      assert.notEqual(
        result.status,
        0,
        `--check should have exited non-zero after introducing drift, but exited 0; stdout: ${result.stdout}; stderr: ${result.stderr}`,
      );
    } finally {
      // RESTORE: always write back original bytes, even if assertions above fail.
      writeFileSync(targetPath, originalBytes);
    }
  });

  // ========================================================================
  // T4-7: scripts/cc.mjs in marketplace has executable bit
  //        (already covered by T2 Check 6 — verify it still passes)
  // ========================================================================

  it('marketplace/plugins/cc/scripts/cc.mjs still has user-executable bit (T2 guard)', () => {
    assert.ok(
      existsSync(MARKETPLACE_ENTRY_SCRIPT),
      `cc.mjs not found at ${MARKETPLACE_ENTRY_SCRIPT}`,
    );
    const stat = statSync(MARKETPLACE_ENTRY_SCRIPT);
    assert.ok(
      (stat.mode & 0o100) !== 0,
      `cc.mjs must have the user-executable bit set; mode = ${stat.mode.toString(8)}`,
    );
  });

  // ========================================================================
  // T4-8: No extra files under marketplace/plugins/cc/
  //        (T2 Check 8 guard — MANIFEST.md lives at marketplace/MANIFEST.md,
  //         not inside plugins/cc/, so the walker is unaffected)
  // ========================================================================

  it('no extra files appear under marketplace/plugins/cc/ beyond the allowlist + README.md', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const allExpected = new Set([...DERIVED_FILES_ALLOWLIST, ...MARKETPLACE_OWNED]);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);
    // Bundled node_modules/ files are not in DERIVED_FILES_ALLOWLIST (they are a
    // different, dynamic set). Skip them here; T9.5 block validates that subtree.
    const extras = actualFiles.filter((f) => !allExpected.has(f) && !f.startsWith('node_modules/'));

    assert.deepEqual(
      extras,
      [],
      `unexpected files found under marketplace/plugins/cc/: ${JSON.stringify(extras)}`,
    );
  });

  // ========================================================================
  // T4-9: marketplace/MANIFEST.md contains no OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('marketplace/MANIFEST.md contains no OQ4 forbidden cost-claim tokens', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    const content = readFileSync(MANIFEST_MD, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `marketplace/MANIFEST.md contains forbidden cost-claim token "${token}"`,
      );
    }
  });

  // ========================================================================
  // T4-10: tools/package-marketplace.mjs does not reference forbidden source
  //         directories in its allowlist or copy logic
  // ========================================================================

  it('tools/package-marketplace.mjs does not contain forbidden path literals in allowlist/copy logic', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    // Note: 'node_modules/' is intentionally omitted — the bundler script
    // legitimately references it as the destination for bundled deps (T9.5).
    const FORBIDDEN_PATH_LITERALS = [
      'tools/bench',
      'documentation/plan',
      'references/',
      '.github/',
    ];

    const scriptSource = readFileSync(PACKAGE_SCRIPT, 'utf8');

    // Strip comment lines before scanning to avoid false positives in docstrings/help text.
    const nonCommentLines = scriptSource
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');

    const hits = [];
    for (const literal of FORBIDDEN_PATH_LITERALS) {
      if (nonCommentLines.includes(literal)) {
        hits.push(literal);
      }
    }

    assert.deepEqual(
      hits,
      [],
      `tools/package-marketplace.mjs non-comment source contains forbidden path literal(s): ${JSON.stringify(hits)}`,
    );
  });
});

// ==========================================================================
// Plan 0006 T5 — marketplace exclusion-list enforcement tests
// ==========================================================================

// ---------- T5 path constants ----------

const EXCLUSIONS_MD = resolve(MARKETPLACE_ROOT, 'EXCLUSIONS.md');

// OQ4 forbidden tokens — same list as rest of the suite
const OQ4_FORBIDDEN = [
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

describe('marketplace exclusion enforcement (Plan 0006 T5)', () => {
  // ========================================================================
  // T5-1: marketplace/EXCLUSIONS.md exists and is non-empty
  // ========================================================================

  it('marketplace/EXCLUSIONS.md exists and is non-empty', () => {
    assert.ok(existsSync(EXCLUSIONS_MD), `EXCLUSIONS.md not found at ${EXCLUSIONS_MD}`);
    const content = readFileSync(EXCLUSIONS_MD, 'utf8');
    assert.ok(content.length > 0, 'EXCLUSIONS.md is empty');
  });

  // ========================================================================
  // T5-2: EXCLUSIONS.md contains all required category substrings
  // ========================================================================

  it('EXCLUSIONS.md contains all required category substrings', () => {
    assert.ok(existsSync(EXCLUSIONS_MD), `EXCLUSIONS.md not found at ${EXCLUSIONS_MD}`);
    const content = readFileSync(EXCLUSIONS_MD, 'utf8');

    const REQUIRED_CATEGORIES = [
      'Tests',
      'TypeScript sources',
      'Build config',
      'CI',
      'Internal docs and plans',
      'Development tools',
      'Workspace metadata',
      'Orchestration metadata',
      'VCS metadata',
      'Secrets',
    ];
    for (const cat of REQUIRED_CATEGORIES) {
      assert.ok(
        content.includes(cat),
        `EXCLUSIONS.md is missing required category substring: "${cat}"`,
      );
    }

    // lint or format (either is acceptable)
    assert.ok(
      content.includes('lint') || content.includes('format'),
      'EXCLUSIONS.md must contain "lint" or "format"',
    );

    // Node dependency trees or node_modules (either is acceptable)
    assert.ok(
      content.includes('Node dependency trees') || content.includes('node_modules'),
      'EXCLUSIONS.md must contain "Node dependency trees" or "node_modules"',
    );
  });

  // ========================================================================
  // T5-3: EXCLUSIONS.md contains no OQ4 forbidden tokens
  // ========================================================================

  it('EXCLUSIONS.md contains no OQ4 forbidden cost-claim tokens', () => {
    assert.ok(existsSync(EXCLUSIONS_MD), `EXCLUSIONS.md not found at ${EXCLUSIONS_MD}`);
    const content = readFileSync(EXCLUSIONS_MD, 'utf8');
    for (const token of OQ4_FORBIDDEN) {
      assert.equal(
        content.includes(token),
        false,
        `EXCLUSIONS.md contains forbidden cost-claim token "${token}"`,
      );
    }
  });

  // ========================================================================
  // T5-4: `node tools/package-marketplace.mjs --check` exits 0 on committed tree
  //        (guard — same as T4-5, verify still passes after T5 additions)
  // ========================================================================

  it('`node tools/package-marketplace.mjs --check` exits 0 on committed tree (T5 guard)', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);
    const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
    assert.equal(
      result.status,
      0,
      `--check exited ${result.status}; stdout: ${result.stdout}; stderr: ${result.stderr}`,
    );
  });

  // ========================================================================
  // T5-5: --check fails when a .test.mjs file is injected into the real tree
  //
  // Strategy: inject into real marketplace tree inside try/finally.
  // The exclusion check (step 0) fires BEFORE the allowlist comparison,
  // so the script exits 1 immediately on the injected file.
  // ========================================================================

  it('`--check` exits non-zero and reports excluded suffix when a .test.mjs file is injected', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    const injectPath = resolve(MARKETPLACE_PLUGIN_ROOT, 'scripts', 'lib', 'foo.test.mjs');
    writeFileSync(injectPath, 'export {};\n');
    try {
      const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
      assert.notEqual(
        result.status,
        0,
        `--check should exit non-zero when .test.mjs is injected; stdout: ${result.stdout}; stderr: ${result.stderr}`,
      );
      const output = result.stdout + result.stderr;
      assert.ok(
        output.includes('excluded'),
        `--check output should contain "excluded" substring; got: ${output}`,
      );
    } finally {
      rmSync(injectPath, { force: true });
    }
  });

  // ========================================================================
  // T5-6: --check fails when a .ts file is injected (TypeScript source)
  // ========================================================================

  it('`--check` exits non-zero and reports excluded when a .ts file is injected', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    const injectPath = resolve(MARKETPLACE_PLUGIN_ROOT, 'scripts', 'lib', 'foo.ts');
    writeFileSync(injectPath, 'export const x = 1;\n');
    try {
      const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
      assert.notEqual(
        result.status,
        0,
        `--check should exit non-zero when .ts file is injected; stdout: ${result.stdout}; stderr: ${result.stderr}`,
      );
      const output = result.stdout + result.stderr;
      assert.ok(
        output.includes('excluded'),
        `--check output should contain "excluded" substring; got: ${output}`,
      );
    } finally {
      rmSync(injectPath, { force: true });
    }
  });

  // ========================================================================
  // T5-7: --check fails when a .env file is injected (secrets)
  // ========================================================================

  it('`--check` exits non-zero and reports excluded exact basename when a .env file is injected', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    const injectPath = resolve(MARKETPLACE_PLUGIN_ROOT, '.env');
    writeFileSync(injectPath, 'SECRET=hunter2\n');
    try {
      const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
      assert.notEqual(
        result.status,
        0,
        `--check should exit non-zero when .env is injected; stdout: ${result.stdout}; stderr: ${result.stderr}`,
      );
      const output = result.stdout + result.stderr;
      assert.ok(
        output.includes('excluded'),
        `--check output should contain "excluded" substring; got: ${output}`,
      );
    } finally {
      rmSync(injectPath, { force: true });
    }
  });

  // ========================================================================
  // T5-8: --check fails when node_modules/ is injected
  // ========================================================================

  it('`--check` exits non-zero when an unexpected package is injected under node_modules/', () => {
    // Note (Plan 0006 T9.5): the real bundled tree already has a node_modules/
    // directory. Injecting an unknown package (node_modules/foo/) makes it
    // appear as an unexpected file in the bundled-dep allowlist, so --check
    // reports "unexpected file" rather than "excluded".
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);

    const injectDir = resolve(MARKETPLACE_PLUGIN_ROOT, 'node_modules', 'foo');
    const injectPath = resolve(injectDir, 'index.js');
    mkdirSync(injectDir, { recursive: true });
    writeFileSync(injectPath, 'module.exports = {};\n');
    try {
      const result = spawnSync('node', [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
      assert.notEqual(
        result.status,
        0,
        `--check should exit non-zero when unexpected node_modules/foo/ is injected; stdout: ${result.stdout}; stderr: ${result.stderr}`,
      );
      const output = result.stdout + result.stderr;
      // The tool reports the unknown file as either "unexpected" or "excluded".
      assert.ok(
        output.includes('unexpected') || output.includes('excluded'),
        `--check output should contain "unexpected" or "excluded" substring; got: ${output}`,
      );
    } finally {
      rmSync(injectPath, { force: true });
      rmSync(injectDir, { recursive: true, force: true });
    }
  });

  // ========================================================================
  // T5-9: Real marketplace tree contains no excluded files
  //        (manual re-implementation of exclusion semantics — does NOT import
  //         the packaging script, tests the committed state independently)
  // ========================================================================

  it('real marketplace tree contains no excluded files (independent exclusion walk)', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    // Excluded suffix patterns (applied to basename)
    const EXCL_SUFFIXES = ['.test.mjs', '.test.ts', '.test.js', '.ts', '.pem', '.key', '.crt'];

    // Excluded path segments (any segment in the path equal to these)
    const EXCL_SEGMENTS = new Set([
      'test',
      'tests',
      'src',
      'node_modules',
      '.git',
      '.github',
      '.omc',
      'documentation',
      'references',
      'tools',
    ]);

    // Excluded exact basenames
    const EXCL_EXACT_BASENAMES = new Set([
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
    ]);

    // Excluded basename prefixes
    const EXCL_BASENAME_PREFIXES = ['tsconfig', '.env.', 'credentials'];

    walkFiles(MARKETPLACE_PLUGIN_ROOT, (filePath) => {
      const normalized = filePath.replace(/\\/g, '/');

      // Skip the bundled node_modules/ subtree — it is validated separately in
      // the "marketplace bundled-dependency tree (Plan 0006 T9.5)" describe block.
      // The bundled tree intentionally contains node_modules/, src/ (node-pty lib
      // files named after src-style modules), package.json, etc.
      if (normalized.includes('/node_modules/')) return;

      const segments = normalized.split('/');
      const bn = segments[segments.length - 1];

      // Check segments
      for (const seg of segments) {
        assert.ok(
          !EXCL_SEGMENTS.has(seg),
          `real marketplace file has excluded path segment "${seg}": ${filePath}`,
        );
      }

      // Check suffixes
      for (const suf of EXCL_SUFFIXES) {
        assert.ok(
          !bn.endsWith(suf),
          `real marketplace file has excluded suffix "${suf}": ${filePath}`,
        );
      }

      // Check exact basenames
      assert.ok(
        !EXCL_EXACT_BASENAMES.has(bn),
        `real marketplace file has excluded exact basename "${bn}": ${filePath}`,
      );

      // Check basename prefixes
      for (const pre of EXCL_BASENAME_PREFIXES) {
        assert.ok(
          !bn.startsWith(pre),
          `real marketplace file has excluded basename prefix "${pre}": ${filePath}`,
        );
      }
    });
  });

  // ========================================================================
  // T5-10: Every real marketplace file remains listed in MANIFEST.md
  //         (guard — T4-2 / T4-3 coverage, verify still passes after T5)
  // ========================================================================

  it('every real marketplace file is listed in MANIFEST.md (T5 guard)', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const listed = readManifestList(MANIFEST_MD);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);

    // Bundled node_modules/ files are documented at section level in MANIFEST.md.
    // Skip them here; T9.5 block enforces their structure.
    const missing = [];
    for (const rel of actualFiles) {
      if (rel.startsWith('node_modules/')) continue;
      if (!MARKETPLACE_OWNED.has(rel) && !listed.has(rel)) {
        missing.push(rel);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `MANIFEST.md is missing entries for these marketplace files after T5: ${JSON.stringify(missing)}`,
    );
  });
});

// ==========================================================================
// Plan 0006 T9.5 — marketplace bundled-dependency tree
// ==========================================================================
//
// These tests lock in the structure of the committed bundled node_modules/
// tree under marketplace/plugins/cc/. They are purely static:
// only fs reads + spawnSync against deterministic helpers. No real codex calls.

// ---------- T9.5 path constants ----------

const BUNDLED_ROOT = resolve(MARKETPLACE_PLUGIN_ROOT, 'node_modules');
const BUNDLED_RUNTIME = resolve(BUNDLED_ROOT, '@cc-plugin-codex', 'runtime');
const BUNDLED_DRIVER = resolve(BUNDLED_ROOT, '@cc-plugin-codex', 'driver-claude-code');
const BUNDLED_NODEPTY = resolve(BUNDLED_ROOT, 'node-pty');

const SOURCE_RUNTIME_DIST = resolve(REPO_ROOT, 'packages', 'runtime', 'dist');
const SOURCE_DRIVER_DIST = resolve(REPO_ROOT, 'packages', 'driver-claude-code', 'dist');
const SOURCE_NODEPTY_LIB = resolve(REPO_ROOT, 'node_modules', 'node-pty', 'lib');

/**
 * Collect all files under dir (recursively), returning relative paths
 * using forward slashes. Does not follow symlinks.
 */
function collectRelFilesDeep(dir, base = dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRelFilesDeep(full, base, results);
    } else if (entry.isFile()) {
      results.push(
        resolve(full)
          .slice(resolve(base).length + 1)
          .replace(/\\/g, '/'),
      );
    }
  }
  return results;
}

describe('marketplace bundled-dependency tree (Plan 0006 T9.5)', () => {
  // ========================================================================
  // T9.5-1: bundled node_modules/ directory exists
  // ========================================================================

  it('marketplace/plugins/cc/node_modules/ directory exists', () => {
    assert.ok(existsSync(BUNDLED_ROOT), `bundled node_modules/ not found at ${BUNDLED_ROOT}`);
  });

  // ========================================================================
  // T9.5-2: runtime package.json has required shape
  // ========================================================================

  it('bundled @cc-plugin-codex/runtime/package.json has required shape', () => {
    const pkgPath = resolve(BUNDLED_RUNTIME, 'package.json');
    assert.ok(existsSync(pkgPath), `runtime package.json not found at ${pkgPath}`);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, '@cc-plugin-codex/runtime', 'runtime package.json name');
    assert.equal(pkg.version, BUNDLED_VERSION_MARKER, 'runtime package.json version marker');
    assert.equal(pkg.type, 'module', 'runtime package.json type');
    assert.equal(pkg.main, './dist/index.js', 'runtime package.json main');
    assert.equal(pkg?.engines?.node, '>=20', 'runtime package.json engines.node');
  });

  // ========================================================================
  // T9.5-3: bundled runtime dist/ contains same .js files as source dist/
  //         (excluding .map and .tsbuildinfo)
  // ========================================================================

  it('bundled runtime dist/ contains the same set of .js files as packages/runtime/dist/', () => {
    const srcFiles = readdirSync(SOURCE_RUNTIME_DIST)
      .filter((f) => f.endsWith('.js'))
      .sort();
    const bundledDistDir = resolve(BUNDLED_RUNTIME, 'dist');
    assert.ok(existsSync(bundledDistDir), `bundled runtime dist/ not found at ${bundledDistDir}`);
    const bundledFiles = readdirSync(bundledDistDir)
      .filter((f) => f.endsWith('.js'))
      .sort();
    assert.deepEqual(
      bundledFiles,
      srcFiles,
      `bundled runtime .js files must match source; src=${JSON.stringify(srcFiles)} bundled=${JSON.stringify(bundledFiles)}`,
    );
  });

  // ========================================================================
  // T9.5-4: each .js file under bundled runtime is byte-identical to source
  // ========================================================================

  it('each .js file under bundled runtime dist/ is byte-identical to its source counterpart', () => {
    const bundledDistDir = resolve(BUNDLED_RUNTIME, 'dist');
    const files = readdirSync(bundledDistDir).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      const src = readFileSync(resolve(SOURCE_RUNTIME_DIST, f));
      const dst = readFileSync(resolve(bundledDistDir, f));
      assert.ok(src.equals(dst), `byte mismatch for bundled runtime dist/${f}`);
    }
  });

  // ========================================================================
  // T9.5-5: each .d.ts file under bundled runtime is byte-identical to source
  // ========================================================================

  it('each .d.ts file under bundled runtime dist/ is byte-identical to its source counterpart', () => {
    const bundledDistDir = resolve(BUNDLED_RUNTIME, 'dist');
    const files = readdirSync(bundledDistDir).filter((f) => f.endsWith('.d.ts'));
    assert.ok(files.length > 0, 'bundled runtime dist/ must contain .d.ts files');
    for (const f of files) {
      const src = readFileSync(resolve(SOURCE_RUNTIME_DIST, f));
      const dst = readFileSync(resolve(bundledDistDir, f));
      assert.ok(src.equals(dst), `byte mismatch for bundled runtime dist/${f}`);
    }
  });

  // ========================================================================
  // T9.5-6: driver package.json shape + runtime/node-pty dependency pinning
  // ========================================================================

  it('bundled @cc-plugin-codex/driver-claude-code/package.json has required shape and pinned deps', () => {
    const pkgPath = resolve(BUNDLED_DRIVER, 'package.json');
    assert.ok(existsSync(pkgPath), `driver package.json not found at ${pkgPath}`);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, '@cc-plugin-codex/driver-claude-code', 'driver package.json name');
    assert.equal(pkg.version, BUNDLED_VERSION_MARKER, 'driver package.json version marker');
    assert.equal(pkg.type, 'module', 'driver package.json type');
    assert.equal(pkg.main, './dist/index.js', 'driver package.json main');
    assert.equal(pkg?.engines?.node, '>=20', 'driver package.json engines.node');
    assert.equal(
      pkg?.dependencies?.['node-pty'],
      '1.2.0-beta.13',
      'driver must pin node-pty to 1.2.0-beta.13',
    );
    assert.equal(
      pkg?.dependencies?.['@cc-plugin-codex/runtime'],
      BUNDLED_VERSION_MARKER,
      `driver must pin @cc-plugin-codex/runtime to ${BUNDLED_VERSION_MARKER}`,
    );
  });

  it('bundled driver dist/ contains the same set of .js files as packages/driver-claude-code/dist/', () => {
    const srcFiles = readdirSync(SOURCE_DRIVER_DIST)
      .filter((f) => f.endsWith('.js'))
      .sort();
    const bundledDistDir = resolve(BUNDLED_DRIVER, 'dist');
    assert.ok(existsSync(bundledDistDir), `bundled driver dist/ not found at ${bundledDistDir}`);
    const bundledFiles = readdirSync(bundledDistDir)
      .filter((f) => f.endsWith('.js'))
      .sort();
    assert.deepEqual(
      bundledFiles,
      srcFiles,
      `bundled driver .js files must match source; src=${JSON.stringify(srcFiles)} bundled=${JSON.stringify(bundledFiles)}`,
    );
  });

  it('each .js file under bundled driver dist/ is byte-identical to its source counterpart', () => {
    const bundledDistDir = resolve(BUNDLED_DRIVER, 'dist');
    const files = readdirSync(bundledDistDir).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      const src = readFileSync(resolve(SOURCE_DRIVER_DIST, f));
      const dst = readFileSync(resolve(bundledDistDir, f));
      assert.ok(src.equals(dst), `byte mismatch for bundled driver dist/${f}`);
    }
  });

  it('each .d.ts file under bundled driver dist/ is byte-identical to its source counterpart', () => {
    const bundledDistDir = resolve(BUNDLED_DRIVER, 'dist');
    const files = readdirSync(bundledDistDir).filter((f) => f.endsWith('.d.ts'));
    assert.ok(files.length > 0, 'bundled driver dist/ must contain .d.ts files');
    for (const f of files) {
      const src = readFileSync(resolve(SOURCE_DRIVER_DIST, f));
      const dst = readFileSync(resolve(bundledDistDir, f));
      assert.ok(src.equals(dst), `byte mismatch for bundled driver dist/${f}`);
    }
  });

  // ========================================================================
  // T9.5-7: node-pty package.json shape + stripped install scripts
  // ========================================================================

  it('bundled node-pty/package.json has name, version, and no install/postinstall scripts', () => {
    const pkgPath = resolve(BUNDLED_NODEPTY, 'package.json');
    assert.ok(existsSync(pkgPath), `node-pty package.json not found at ${pkgPath}`);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, 'node-pty', 'node-pty package.json name');
    assert.equal(pkg.version, '1.2.0-beta.13', 'node-pty package.json version');
    assert.equal(
      pkg?.scripts?.install,
      undefined,
      'node-pty package.json must not have scripts.install (stripped)',
    );
    assert.equal(
      pkg?.scripts?.postinstall,
      undefined,
      'node-pty package.json must not have scripts.postinstall (stripped)',
    );
  });

  // ========================================================================
  // T9.5-8: every file under bundled node-pty/lib/ is byte-identical to source
  // ========================================================================

  it('every file under bundled node-pty/lib/ is byte-identical to the workspace source', () => {
    const bundledLib = resolve(BUNDLED_NODEPTY, 'lib');
    assert.ok(existsSync(bundledLib), `bundled node-pty/lib/ not found at ${bundledLib}`);
    const files = collectRelFilesDeep(bundledLib);
    assert.ok(files.length > 0, 'bundled node-pty/lib/ must contain files');
    for (const rel of files) {
      const src = readFileSync(resolve(SOURCE_NODEPTY_LIB, rel));
      const dst = readFileSync(resolve(bundledLib, rel));
      assert.ok(src.equals(dst), `byte mismatch for bundled node-pty/lib/${rel}`);
    }
  });

  // ========================================================================
  // T9.5-9: each required platform prebuild exists
  // ========================================================================

  it('bundled node-pty prebuilds/{darwin-arm64,darwin-x64,linux-arm64,linux-x64}/pty.node exist', () => {
    const REQUIRED_PREBUILDS = [
      'darwin-arm64/pty.node',
      'darwin-x64/pty.node',
      'linux-arm64/pty.node',
      'linux-x64/pty.node',
    ];
    for (const rel of REQUIRED_PREBUILDS) {
      const p = resolve(BUNDLED_NODEPTY, 'prebuilds', rel);
      assert.ok(existsSync(p), `required prebuild missing: node-pty/prebuilds/${rel}`);
    }
  });

  // ========================================================================
  // T9.5-10: win32 prebuilds are NOT present
  // ========================================================================

  it('bundled node-pty does not contain win32 prebuilds', () => {
    const win32Arm64 = resolve(BUNDLED_NODEPTY, 'prebuilds', 'win32-arm64');
    const win32X64 = resolve(BUNDLED_NODEPTY, 'prebuilds', 'win32-x64');
    assert.ok(!existsSync(win32Arm64), `forbidden win32-arm64 prebuild found at ${win32Arm64}`);
    assert.ok(!existsSync(win32X64), `forbidden win32-x64 prebuild found at ${win32X64}`);
  });

  // ========================================================================
  // T9.5-11: node-pty/src/ (C++ sources) is NOT present
  // ========================================================================

  it('bundled node-pty does not contain src/ (C++ sources)', () => {
    const srcDir = resolve(BUNDLED_NODEPTY, 'src');
    assert.ok(!existsSync(srcDir), `forbidden node-pty/src/ found at ${srcDir}`);
  });

  // ========================================================================
  // T9.5-12: node-pty/binding.gyp is NOT present
  // ========================================================================

  it('bundled node-pty does not contain binding.gyp', () => {
    const gyp = resolve(BUNDLED_NODEPTY, 'binding.gyp');
    assert.ok(!existsSync(gyp), `forbidden node-pty/binding.gyp found at ${gyp}`);
  });

  // ========================================================================
  // T9.5-13: node-pty/scripts/ is NOT present
  // ========================================================================

  it('bundled node-pty does not contain scripts/', () => {
    const scripts = resolve(BUNDLED_NODEPTY, 'scripts');
    assert.ok(!existsSync(scripts), `forbidden node-pty/scripts/ found at ${scripts}`);
  });

  // ========================================================================
  // T9.5-14: node-pty/third_party/ is NOT present
  // ========================================================================

  it('bundled node-pty does not contain third_party/', () => {
    const thirdParty = resolve(BUNDLED_NODEPTY, 'third_party');
    assert.ok(!existsSync(thirdParty), `forbidden node-pty/third_party/ found at ${thirdParty}`);
  });

  // ========================================================================
  // T9.5-15: no .tsbuildinfo files anywhere in the bundled tree
  // ========================================================================

  it('bundled tree contains no .tsbuildinfo files', () => {
    const all = collectRelFilesDeep(BUNDLED_ROOT);
    const bad = all.filter((f) => f.endsWith('.tsbuildinfo'));
    assert.deepEqual(
      bad,
      [],
      `bundled tree must not contain .tsbuildinfo files: ${JSON.stringify(bad)}`,
    );
  });

  // ========================================================================
  // T9.5-16: no .js.map or .d.ts.map files anywhere in the bundled tree
  // ========================================================================

  it('bundled tree contains no .js.map or .d.ts.map files', () => {
    const all = collectRelFilesDeep(BUNDLED_ROOT);
    const bad = all.filter((f) => f.endsWith('.js.map') || f.endsWith('.d.ts.map'));
    assert.deepEqual(
      bad,
      [],
      `bundled tree must not contain sourcemap files: ${JSON.stringify(bad)}`,
    );
  });

  // ========================================================================
  // T9.5-17: bundled runtime index.js contains the named exports the dispatcher needs
  // ========================================================================

  it('bundled runtime dist/index.js re-exports runDoctor, createJob, readJob, updateJob, listJobsForWorkspace, listJobs, appendEvent, reconcileJob', () => {
    // index.js uses `export * from './doctor.js'` etc. Check in the individual
    // modules (which are the actual export source after the re-export chain).
    const REQUIRED_EXPORTS = [
      { symbol: 'runDoctor', file: 'doctor.js' },
      { symbol: 'createJob', file: 'job-store.js' },
      { symbol: 'readJob', file: 'job-store.js' },
      { symbol: 'updateJob', file: 'job-store.js' },
      { symbol: 'listJobsForWorkspace', file: 'job-store.js' },
      { symbol: 'listJobs', file: 'job-store.js' },
      { symbol: 'appendEvent', file: 'job-store.js' },
      { symbol: 'reconcileJob', file: 'reconciler.js' },
    ];
    const distDir = resolve(BUNDLED_RUNTIME, 'dist');
    for (const { symbol, file } of REQUIRED_EXPORTS) {
      const src = readFileSync(resolve(distDir, file), 'utf8');
      assert.ok(
        src.includes(`export`) && src.includes(symbol),
        `bundled runtime dist/${file} must export "${symbol}"`,
      );
    }
    // Also verify index.js re-exports all source modules
    const indexSrc = readFileSync(resolve(distDir, 'index.js'), 'utf8');
    assert.match(indexSrc, /export \* from/, 'runtime index.js must use export * re-exports');
  });

  // ========================================================================
  // T9.5-18: bundled driver index.js contains ClaudeBackgroundDriver, DRIVER_VERSION, ptyBuildExtraProbe
  // ========================================================================

  it('bundled driver dist/index.js exports ClaudeBackgroundDriver, DRIVER_VERSION, ptyBuildExtraProbe', () => {
    const distDir = resolve(BUNDLED_DRIVER, 'dist');
    const indexSrc = readFileSync(resolve(distDir, 'index.js'), 'utf8');
    assert.ok(
      indexSrc.includes('ClaudeBackgroundDriver'),
      'bundled driver index.js must contain ClaudeBackgroundDriver',
    );
    assert.ok(
      indexSrc.includes('DRIVER_VERSION'),
      'bundled driver index.js must export DRIVER_VERSION',
    );
    // ptyBuildExtraProbe is exported from pty-probe.js via `export * from './pty-probe.js'`
    const ptyProbeSrc = readFileSync(resolve(distDir, 'pty-probe.js'), 'utf8');
    assert.ok(
      ptyProbeSrc.includes('ptyBuildExtraProbe'),
      'bundled driver dist/pty-probe.js must contain ptyBuildExtraProbe',
    );
  });

  // ========================================================================
  // T9.5-19: node tools/package-marketplace.mjs --check exits 0 with bundled section
  // ========================================================================

  it('`node tools/package-marketplace.mjs --check` exits 0 and reports bundled-dep files (T9.5 guard)', () => {
    assert.ok(existsSync(PACKAGE_SCRIPT), `packaging script not found at ${PACKAGE_SCRIPT}`);
    const result = spawnSync(process.execPath, [PACKAGE_SCRIPT, '--check'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `--check exited ${result.status}; stderr: ${result.stderr}`);
    const out = (result.stdout || '') + (result.stderr || '');
    assert.ok(
      out.includes('bundled-dep'),
      `--check output must mention "bundled-dep" files; got: ${out}`,
    );
  });
});
