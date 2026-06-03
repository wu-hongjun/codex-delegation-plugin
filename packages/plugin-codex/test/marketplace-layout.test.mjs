// Static-validation tests for marketplace/ layout — Plan 0006 T2
//
// These tests do NOT spawn processes. They verify file existence, JSON structure,
// executable bits, directory contents, and the absence of forbidden tokens.
//
// Pattern mirrors readme.test.mjs and skills-manifest.test.mjs:
// node:test + node:assert/strict, ESM, import.meta.url path resolution.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Check 2: marketplace plugin.json exists
  // ========================================================================

  it('marketplace/plugins/claude-companion/.codex-plugin/plugin.json exists', () => {
    assert.ok(
      existsSync(MARKETPLACE_PLUGIN_JSON),
      `marketplace plugin.json not found at ${MARKETPLACE_PLUGIN_JSON}`,
    );
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
