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
const MARKETPLACE_JSON = resolve(MARKETPLACE_ROOT, '.agents', 'plugins', 'marketplace.json');
const MARKETPLACE_PLUGIN_ROOT = resolve(MARKETPLACE_ROOT, 'plugins', 'claude-companion');
const MARKETPLACE_PLUGIN_JSON = resolve(MARKETPLACE_PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const SOURCE_PLUGIN_JSON = resolve(SOURCE_PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
const MARKETPLACE_SCRIPTS_DIR = resolve(MARKETPLACE_PLUGIN_ROOT, 'scripts');
const MARKETPLACE_ENTRY_SCRIPT = resolve(MARKETPLACE_SCRIPTS_DIR, 'claude-companion.mjs');
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
  'claude-delegate',
  'claude-followup',
  'claude-result',
  'claude-review',
  'claude-setup',
  'claude-status',
  'claude-stop',
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
      'claude-companion',
      `marketplace.json plugins[0].name must be "claude-companion"; got "${parsed.plugins[0].name}"`,
    );
    assert.equal(
      parsed.plugins[0].source?.source,
      'local',
      `marketplace.json plugins[0].source.source must be "local"; got "${parsed.plugins[0].source?.source}"`,
    );
    assert.equal(
      parsed.plugins[0].source?.path,
      './plugins/claude-companion',
      `marketplace.json plugins[0].source.path must be "./plugins/claude-companion"; got "${parsed.plugins[0].source?.path}"`,
    );
  });

  // ========================================================================
  // Check 2: marketplace plugin.json exists and is valid JSON
  // ========================================================================

  it('marketplace/plugins/claude-companion/.codex-plugin/plugin.json exists', () => {
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
  // Check 2b: marketplace plugin.json version is exactly "0.2.0"
  // ========================================================================

  it('marketplace plugin.json version is exactly "0.2.0"', () => {
    const parsed = JSON.parse(readFileSync(MARKETPLACE_PLUGIN_JSON, 'utf8'));
    assert.equal(
      parsed.version,
      '0.2.0',
      `marketplace plugin.json version must be "0.2.0"; got "${parsed.version}"`,
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

  it('marketplace skills/ contains exactly the 8 expected skill directories', () => {
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

  it('each of the 8 skill directories contains a non-empty SKILL.md', () => {
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
  // Check 6: marketplace claude-companion.mjs exists and has executable bit
  // ========================================================================

  it('marketplace/plugins/claude-companion/scripts/claude-companion.mjs exists and has the user-executable bit set', () => {
    assert.ok(
      existsSync(MARKETPLACE_ENTRY_SCRIPT),
      `claude-companion.mjs not found at ${MARKETPLACE_ENTRY_SCRIPT}`,
    );
    const stat = statSync(MARKETPLACE_ENTRY_SCRIPT);
    assert.ok(
      (stat.mode & 0o100) !== 0,
      `claude-companion.mjs must have the user-executable bit set; mode = ${stat.mode.toString(8)}`,
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
  // Check 8: no forbidden internal/test files under marketplace/plugins/claude-companion/
  // ========================================================================

  it('no forbidden internal/test files appear under marketplace/plugins/claude-companion/', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const FORBIDDEN_PATH_SEGMENTS = [
      'test/',
      'tests/',
      'node_modules/',
      'tsconfig',
      '.env',
      '.pem',
      '.key',
      '.crt',
      'dist/',
      '.git/',
      '.github/',
      'tools/',
      'documentation/',
      'references/',
    ];

    walkFiles(MARKETPLACE_PLUGIN_ROOT, (filePath) => {
      const basename = filePath.split('/').pop() ?? '';

      // Basename must not be a test file
      assert.ok(
        !/\.test\.mjs$|\.test\.js$|\.test\.ts$/.test(basename),
        `forbidden test file found in marketplace: ${filePath}`,
      );

      // File path must not contain forbidden segments
      // Normalize to use forward slashes for consistent matching
      const normalizedPath = filePath.replace(/\\/g, '/');
      for (const segment of FORBIDDEN_PATH_SEGMENTS) {
        assert.ok(
          !normalizedPath.includes(segment),
          `file path contains forbidden segment "${segment}": ${filePath}`,
        );
      }

      // package.json as a file is forbidden (word may appear in SKILL.md content,
      // but an actual package.json FILE must not exist under the marketplace plugin)
      if (basename === 'package.json') {
        assert.fail(`forbidden file "package.json" found in marketplace plugin tree: ${filePath}`);
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

  it('marketplace/plugins/claude-companion/README.md contains no OQ4 forbidden cost-claim tokens', () => {
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

// Authoritative allowlist of the 18 derived files (relative to marketplace plugin root).
const DERIVED_FILES_ALLOWLIST = [
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

  it('MANIFEST.md lists every derived file under marketplace/plugins/claude-companion/', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const listed = readManifestList(MANIFEST_MD);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);

    // Every actual file that is NOT marketplace-owned must appear in the manifest list.
    const missing = [];
    for (const rel of actualFiles) {
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
  // T4-3: No file under marketplace/plugins/claude-companion/ is outside
  //        the MANIFEST.md list (reverse direction)
  // ========================================================================

  it('marketplace/plugins/claude-companion/ contains no file outside the MANIFEST.md list (reverse check)', () => {
    assert.ok(existsSync(MANIFEST_MD), `MANIFEST.md not found at ${MANIFEST_MD}`);
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const listed = readManifestList(MANIFEST_MD);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);

    const unlisted = [];
    for (const rel of actualFiles) {
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
  // T4-4: Source <-> marketplace byte-identity for all 18 derived files
  // ========================================================================

  it('all 18 derived files are byte-identical between source and marketplace', () => {
    for (const rel of DERIVED_FILES_ALLOWLIST) {
      const srcPath = resolve(SOURCE_PLUGIN_ROOT, rel);
      const dstPath = resolve(MARKETPLACE_PLUGIN_ROOT, rel);

      assert.ok(existsSync(srcPath), `source file missing: packages/plugin-codex/${rel}`);
      assert.ok(
        existsSync(dstPath),
        `marketplace file missing: marketplace/plugins/claude-companion/${rel}`,
      );

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
  // T4-7: scripts/claude-companion.mjs in marketplace has executable bit
  //        (already covered by T2 Check 6 — verify it still passes)
  // ========================================================================

  it('marketplace/plugins/claude-companion/scripts/claude-companion.mjs still has user-executable bit (T2 guard)', () => {
    assert.ok(
      existsSync(MARKETPLACE_ENTRY_SCRIPT),
      `claude-companion.mjs not found at ${MARKETPLACE_ENTRY_SCRIPT}`,
    );
    const stat = statSync(MARKETPLACE_ENTRY_SCRIPT);
    assert.ok(
      (stat.mode & 0o100) !== 0,
      `claude-companion.mjs must have the user-executable bit set; mode = ${stat.mode.toString(8)}`,
    );
  });

  // ========================================================================
  // T4-8: No extra files under marketplace/plugins/claude-companion/
  //        (T2 Check 8 guard — MANIFEST.md lives at marketplace/MANIFEST.md,
  //         not inside plugins/claude-companion/, so the walker is unaffected)
  // ========================================================================

  it('no extra files appear under marketplace/plugins/claude-companion/ beyond the allowlist + README.md', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_ROOT),
      `marketplace plugin root not found at ${MARKETPLACE_PLUGIN_ROOT}`,
    );

    const allExpected = new Set([...DERIVED_FILES_ALLOWLIST, ...MARKETPLACE_OWNED]);
    const actualFiles = collectRelFiles(MARKETPLACE_PLUGIN_ROOT);
    const extras = actualFiles.filter((f) => !allExpected.has(f));

    assert.deepEqual(
      extras,
      [],
      `unexpected files found under marketplace/plugins/claude-companion/: ${JSON.stringify(extras)}`,
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

    const FORBIDDEN_PATH_LITERALS = [
      'tools/bench',
      'documentation/plan',
      'references/',
      'node_modules/',
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

  it('`--check` exits non-zero and reports excluded segment when node_modules/ is injected', () => {
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
        `--check should exit non-zero when node_modules/ is injected; stdout: ${result.stdout}; stderr: ${result.stderr}`,
      );
      const output = result.stdout + result.stderr;
      assert.ok(
        output.includes('excluded'),
        `--check output should contain "excluded" substring; got: ${output}`,
      );
    } finally {
      rmSync(resolve(MARKETPLACE_PLUGIN_ROOT, 'node_modules'), { recursive: true, force: true });
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

    const missing = [];
    for (const rel of actualFiles) {
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
