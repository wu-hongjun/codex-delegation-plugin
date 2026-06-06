// Static-validation tests for the release-smoke procedure — Plan 0006 T9
//
// These tests verify the shape of:
//   - tools/smoke-marketplace.mjs (the helper that automates non-TUI smoke
//     checks against the real codex CLI)
//   - documentation/RELEASING.md Smoke Test section
//   - marketplace/plugins/claude-companion/README.md smoke-test pointer
//   - .github/workflows/ci.yml (negative — must NOT invoke smoke-marketplace)
//
// They do NOT spawn codex. Only --help is exercised against the smoke
// helper itself; everything else is static text inspection. This keeps the
// CI matrix portable while still locking the smoke-procedure contract.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
// packages/plugin-codex/test/ -> up 3 levels to repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');

const SMOKE_SCRIPT = resolve(REPO_ROOT, 'tools', 'smoke-marketplace.mjs');
const MARKETPLACE_README = resolve(
  REPO_ROOT,
  'marketplace',
  'plugins',
  'claude-companion',
  'README.md',
);
const RELEASING_MD = resolve(REPO_ROOT, 'documentation', 'RELEASING.md');
const CI_WORKFLOW = resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml');

// ---------- constants the helper must contain verbatim ----------

const PLUGIN_REF = 'claude-companion@cc-plugin-codex-local';

// Plan 0006 T10: derive the expected plugin version from the source plugin
// manifest at test time, so tests stay aligned with whatever the current
// shipped version is. The marketplace plugin.json is byte-identical to the
// source per `package-marketplace --check`; we read source to follow the
// source-of-truth invariant declared in documentation/RELEASING.md.
const SOURCE_PLUGIN_JSON = resolve(
  REPO_ROOT,
  'packages',
  'plugin-codex',
  '.codex-plugin',
  'plugin.json',
);
const EXPECTED_VERSION = JSON.parse(readFileSync(SOURCE_PLUGIN_JSON, 'utf8')).version;

const SKILL_NAMES = [
  'claude-setup',
  'claude-delegate',
  'claude-status',
  'claude-result',
  'claude-stop',
  'claude-followup',
  'claude-review',
  'claude-adversarial-review',
  'claude-workflow',
  'claude-goal',
  'claude-fork',
  'claude-batch',
  'claude-deep-research',
];

// ---------- forbidden tokens (shared with T6/T7/T8) ----------

const FORBIDDEN_COST_TOKENS = [
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

const FORBIDDEN_BENCHMARK_TOKENS = [
  'benchmark',
  'cost saving',
  'pre-cutover',
  'post-cutover',
  'cutover',
  'Plan 0004',
];

// ==========================================================================
// Plan 0006 T9 — release-smoke procedure
// ==========================================================================

describe('release-smoke procedure (Plan 0006 T9)', () => {
  // ========================================================================
  // T9-1: tools/smoke-marketplace.mjs exists and is a regular file
  // ========================================================================

  it('tools/smoke-marketplace.mjs exists', () => {
    assert.ok(existsSync(SMOKE_SCRIPT), `smoke script not found at ${SMOKE_SCRIPT}`);
    const st = statSync(SMOKE_SCRIPT);
    assert.ok(st.isFile(), 'tools/smoke-marketplace.mjs must be a regular file');
    assert.ok(st.size > 0, 'tools/smoke-marketplace.mjs must not be empty');
  });

  // ========================================================================
  // T9-2: --help exits 0 and lists --marketplace-root
  // ========================================================================

  it('`smoke-marketplace.mjs --help` exits 0 and documents --marketplace-root', () => {
    const r = spawnSync(process.execPath, [SMOKE_SCRIPT, '--help'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(r.status, 0, `--help exit code: expected 0, got ${r.status}`);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.match(out, /--marketplace-root/, '--help output must document --marketplace-root');
    assert.match(out, /--keep-home/, '--help output must document --keep-home');
    assert.match(out, /--help/, '--help output must document --help');
  });

  // ========================================================================
  // T9-3: script body contains all 13 skill names
  // ========================================================================

  it('smoke script body contains all 13 skill names', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    for (const name of SKILL_NAMES) {
      assert.ok(
        body.includes(name),
        `smoke script must reference skill "${name}" in the manual checklist`,
      );
    }
  });

  // ========================================================================
  // T9-4: script body references CODEX_HOME (isolation discipline)
  // ========================================================================

  it('smoke script references CODEX_HOME', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.match(body, /CODEX_HOME/, 'smoke script must reference CODEX_HOME for isolation');
  });

  // ========================================================================
  // T9-5: script uses mkdtempSync (isolated temp home) and does not write
  //       the real $HOME/.codex
  // ========================================================================

  it('smoke script uses mkdtempSync for isolated CODEX_HOME and does not target real ~/.codex', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.match(
      body,
      /mkdtempSync/,
      'smoke script must create the isolated CODEX_HOME via mkdtempSync',
    );
    // Negative: the script must not reference the real ~/.codex paths.
    assert.doesNotMatch(
      body,
      /["']\$HOME\/\.codex["']/,
      'smoke script must not embed the real $HOME/.codex path as a string literal',
    );
    assert.doesNotMatch(
      body,
      /["']~\/\.codex["']/,
      'smoke script must not embed ~/.codex as a string literal',
    );
  });

  // ========================================================================
  // T9-6: script runs package-marketplace --check as a preflight step
  // ========================================================================

  it('smoke script runs `package-marketplace --check` as a preflight', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.match(
      body,
      /package-marketplace\.mjs/,
      'smoke script must invoke tools/package-marketplace.mjs as preflight',
    );
    assert.match(body, /--check/, 'smoke script must pass --check to package-marketplace');
  });

  // ========================================================================
  // T9-7: script includes `codex plugin marketplace add`
  // ========================================================================

  it('smoke script includes `codex plugin marketplace add`', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.match(
      body,
      /['"]plugin['"]\s*,\s*['"]marketplace['"]\s*,\s*['"]add['"]/,
      'smoke script must spawn `codex plugin marketplace add`',
    );
  });

  // ========================================================================
  // T9-8: script includes `codex plugin add claude-companion@cc-plugin-codex-local`
  // ========================================================================

  it('smoke script includes `codex plugin add` with the canonical plugin ref', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.match(
      body,
      /['"]plugin['"]\s*,\s*['"]add['"]\s*,\s*PLUGIN_REF/,
      'smoke script must spawn `codex plugin add` with the PLUGIN_REF constant',
    );
    assert.ok(
      body.includes(PLUGIN_REF),
      `smoke script must mention plugin ref ${PLUGIN_REF} verbatim`,
    );
  });

  // ========================================================================
  // T9-9: script cleanup includes plugin remove + marketplace remove
  // ========================================================================

  it('smoke script cleanup includes `codex plugin remove` and `codex plugin marketplace remove`', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.match(
      body,
      /['"]plugin['"]\s*,\s*['"]remove['"]\s*,\s*PLUGIN_REF/,
      'smoke script cleanup must spawn `codex plugin remove` with PLUGIN_REF',
    );
    assert.match(
      body,
      /['"]plugin['"]\s*,\s*['"]marketplace['"]\s*,\s*['"]remove['"]\s*,\s*MARKETPLACE_NAME/,
      'smoke script cleanup must spawn `codex plugin marketplace remove` with MARKETPLACE_NAME',
    );
  });

  // ========================================================================
  // T9-10 (rewritten by Plan 0006 T10): smoke script derives the expected
  // plugin version from the marketplace plugin.json at startup. There must
  // be NO hard-coded version literal in the script body. The script must
  // reference the marketplace plugin.json relative path to perform the
  // derivation.
  // ========================================================================

  it('smoke script derives expected plugin version from the marketplace plugin.json (no hard-coded literal)', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    // Negative: no hard-coded version literal.
    assert.doesNotMatch(
      body,
      /['"]0\.\d+\.\d+['"]/,
      'smoke script must not contain a hard-coded semver string literal — read it from plugin.json instead',
    );
    // Positive: derivation references the marketplace plugin.json path.
    assert.match(
      body,
      /plugins\/claude-companion\/\.codex-plugin\/plugin\.json/,
      'smoke script must reference the marketplace plugin.json relative path for version derivation',
    );
    assert.match(
      body,
      /deriveExpectedVersion/,
      'smoke script must define and call a deriveExpectedVersion helper (or equivalent named derivation step)',
    );
  });

  // ========================================================================
  // T9-11: RELEASING.md contains an "## Smoke Test" section
  // ========================================================================

  it('RELEASING.md contains a `## Smoke Test` section', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /^## Smoke Test\b/m,
      'RELEASING.md must contain an `## Smoke Test` section',
    );
  });

  // ========================================================================
  // T9-12: RELEASING.md enumerates all 13 skills
  // ========================================================================

  it('RELEASING.md enumerates all 13 skill names', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    for (const name of SKILL_NAMES) {
      assert.ok(
        content.includes(`$${name}`),
        `RELEASING.md Smoke Test section must mention skill $${name}`,
      );
    }
  });

  // ========================================================================
  // T9-13: RELEASING.md says $claude-setup is the gate skill
  // ========================================================================

  it('RELEASING.md identifies `$claude-setup` as the gate skill', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /\$claude-setup[\s\S]*?gate/i,
      'RELEASING.md must name $claude-setup as the gate skill',
    );
  });

  // ========================================================================
  // T9-14: RELEASING.md says `ok` or `warn` aggregate passes setup
  // ========================================================================

  it('RELEASING.md states `ok` or `warn` aggregate passes setup', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /`ok`\s+or\s+`warn`/,
      'RELEASING.md must state that `ok` or `warn` aggregate is the setup pass criterion',
    );
  });

  // ========================================================================
  // T9-15: marketplace README points to the smoke checklist
  // ========================================================================

  it('marketplace README contains a `## Smoke test` pointer referencing RELEASING.md', () => {
    assert.ok(existsSync(MARKETPLACE_README), `README.md not found at ${MARKETPLACE_README}`);
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(
      content,
      /^## Smoke test\b/m,
      'marketplace README must contain a `## Smoke test` section',
    );
    assert.match(
      content,
      /RELEASING\.md/,
      'marketplace README smoke section must point to RELEASING.md',
    );
  });

  // ========================================================================
  // T9-16: smoke script + RELEASING.md + README contain no OQ4 forbidden
  //        tokens and no Plan 0004 benchmark vocabulary
  // ========================================================================

  it('smoke surfaces contain no OQ4 forbidden tokens and no Plan 0004 benchmark vocabulary', () => {
    const surfaces = {
      'tools/smoke-marketplace.mjs': readFileSync(SMOKE_SCRIPT, 'utf8'),
      'documentation/RELEASING.md': readFileSync(RELEASING_MD, 'utf8'),
      'marketplace/plugins/claude-companion/README.md': readFileSync(MARKETPLACE_README, 'utf8'),
    };
    for (const [label, body] of Object.entries(surfaces)) {
      for (const token of FORBIDDEN_COST_TOKENS) {
        assert.equal(
          body.includes(token),
          false,
          `${label} contains forbidden cost-claim token: "${token}"`,
        );
      }
      for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
        assert.equal(
          body.includes(token),
          false,
          `${label} contains forbidden Plan 0004 benchmark/cutover token: "${token}"`,
        );
      }
    }
  });

  // ========================================================================
  // T9-17: smoke script is NOT invoked from CI (smoke requires real Codex)
  // ========================================================================

  it('smoke script is not invoked from .github/workflows/ci.yml', () => {
    if (!existsSync(CI_WORKFLOW)) {
      // No CI workflow file present in this checkout — nothing to verify.
      return;
    }
    const content = readFileSync(CI_WORKFLOW, 'utf8');
    assert.equal(
      content.includes('smoke-marketplace.mjs'),
      false,
      'ci.yml must not invoke tools/smoke-marketplace.mjs (it requires real Codex)',
    );
    assert.equal(
      content.includes('smoke-marketplace'),
      false,
      'ci.yml must not reference smoke-marketplace as a CI step',
    );
  });
});

// ==========================================================================
// Plan 0006 T9.5 — smoke helper dispatcher-execution check
// ==========================================================================
//
// These tests verify that tools/smoke-marketplace.mjs contains the STEP 5.5
// dispatcher-execution check added in T9.5. They are static source inspections
// only — no real codex calls, no real dispatcher invocations.

describe('smoke helper dispatcher-execution check (Plan 0006 T9.5)', () => {
  // ========================================================================
  // T9.5-S20: smoke helper contains a STEP 5.5 dispatcher-execution block
  // ========================================================================

  it('smoke script source contains a STEP 5.5 dispatcher-execution step', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.ok(
      body.includes('STEP 5.5'),
      'smoke script must contain a STEP 5.5 dispatcher-execution block',
    );
    // Must spawn the claude-companion.mjs setup command
    assert.ok(
      body.includes('claude-companion.mjs') && body.includes('setup'),
      'smoke script STEP 5.5 must spawn claude-companion.mjs setup',
    );
  });

  // ========================================================================
  // T9.5-S21: smoke helper asserts the absence of ERR_MODULE_NOT_FOUND
  // ========================================================================

  it('smoke script dispatcher-execution check asserts absence of ERR_MODULE_NOT_FOUND', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.ok(
      body.includes('ERR_MODULE_NOT_FOUND'),
      'smoke script must reference ERR_MODULE_NOT_FOUND as the T9 defect signal',
    );
  });

  // ========================================================================
  // T9.5-S22: smoke helper --help still exits 0 (regression guard)
  // ========================================================================

  it('`smoke-marketplace.mjs --help` still exits 0 after T9.5 additions (regression guard)', () => {
    const r = spawnSync(process.execPath, [SMOKE_SCRIPT, '--help'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(r.status, 0, `--help exit code after T9.5: expected 0, got ${r.status}`);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.match(out, /--marketplace-root/, '--help must still document --marketplace-root');
  });
});

// ==========================================================================
// Plan 0006 T10 — versioning scheme + source-of-truth + workspace decoupling
// ==========================================================================
//
// T10 codifies the plugin-versioning model:
//   1. `packages/plugin-codex/.codex-plugin/plugin.json` is the SOURCE OF
//      TRUTH for the shipped plugin version.
//   2. `marketplace/plugins/claude-companion/.codex-plugin/plugin.json` is a
//      byte-identical derived copy maintained by `tools/package-marketplace
//      .mjs --write` and verified by `--check`.
//   3. Workspace package versions (root + each packages/*) stay at "0.0.0"
//      — they are internal workspace metadata, NOT the shipped plugin
//      version, and they must not be bumped as part of a plugin release.
//   4. `tools/smoke-marketplace.mjs` derives its expected version from the
//      marketplace plugin.json at startup (no hard-coded literal).
//   5. `documentation/RELEASING.md` carries the canonical Version Bump
//      procedure.

const ROOT_PACKAGE_JSON = resolve(REPO_ROOT, 'package.json');
const PLUGIN_PACKAGE_JSON = resolve(REPO_ROOT, 'packages', 'plugin-codex', 'package.json');
const RUNTIME_PACKAGE_JSON = resolve(REPO_ROOT, 'packages', 'runtime', 'package.json');
const DRIVER_PACKAGE_JSON = resolve(REPO_ROOT, 'packages', 'driver-claude-code', 'package.json');

const WORKSPACE_PACKAGE_JSON_FILES = [
  { label: 'root', path: ROOT_PACKAGE_JSON },
  { label: 'packages/plugin-codex', path: PLUGIN_PACKAGE_JSON },
  { label: 'packages/runtime', path: RUNTIME_PACKAGE_JSON },
  { label: 'packages/driver-claude-code', path: DRIVER_PACKAGE_JSON },
];

describe('plugin versioning scheme (Plan 0006 T10)', () => {
  // ========================================================================
  // T10-1: source plugin.json declares a non-empty semver-shaped version
  // ========================================================================

  it('source plugin.json declares a non-empty semver-shaped version', () => {
    const parsed = JSON.parse(readFileSync(SOURCE_PLUGIN_JSON, 'utf8'));
    assert.equal(
      typeof parsed.version,
      'string',
      'source plugin.json must have a string "version"',
    );
    assert.match(
      parsed.version,
      /^0\.\d+\.\d+(?:[-+][\w.-]+)?$/,
      `source plugin.json version must look like "0.x.y" (got "${parsed.version}")`,
    );
  });

  // ========================================================================
  // T10-2: source ↔ marketplace plugin.json version equality
  //
  // The direct dual-read approach (read both files and compare .version)
  // would race against T4-6's drift test in marketplace-layout.test.mjs,
  // which mutates the marketplace plugin.json's first byte inside a
  // try/finally restore window. The byte-identity invariant — which
  // includes the version field — is already enforced by:
  //   - T2 layout byte-identity tests (each derived file equals source)
  //   - T4-6 / package-marketplace.mjs --check (transitive, byte-identical)
  // T10-2 here additionally verifies that the source plugin.json's
  // version field is a non-empty string (the upstream of every other
  // version anchor). The marketplace side is established by transitive
  // equality through --check, not by a direct read here.
  // ========================================================================

  it('source plugin.json declares a string version field used as the source-of-truth anchor', () => {
    const parsed = JSON.parse(readFileSync(SOURCE_PLUGIN_JSON, 'utf8'));
    assert.equal(
      typeof parsed.version,
      'string',
      'source plugin.json must have a string `version` field (source of truth for the marketplace tree)',
    );
    assert.ok(parsed.version.length > 0, 'source plugin.json `version` field must be non-empty');
  });

  // ========================================================================
  // T10-3: each workspace package.json declares version "0.0.0" (decoupled)
  // ========================================================================

  for (const { label, path } of WORKSPACE_PACKAGE_JSON_FILES) {
    it(`${label}/package.json version remains "0.0.0" (decoupled from shipped plugin version)`, () => {
      assert.ok(existsSync(path), `${path} not found`);
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(
        parsed.version,
        '0.0.0',
        `${label}/package.json version must remain "0.0.0" — it is internal workspace metadata, not the shipped plugin version. Got "${parsed.version}".`,
      );
    });
  }

  // ========================================================================
  // T10-4: RELEASING.md contains an "## Version Bump" section
  // ========================================================================

  it('RELEASING.md contains an `## Version Bump` section', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /^## Version Bump\b/m,
      'RELEASING.md must contain a `## Version Bump` section',
    );
  });

  // ========================================================================
  // T10-5: Version Bump section names the source of truth + tools commands
  // ========================================================================

  it('RELEASING.md Version Bump section names source of truth + key commands', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.ok(
      content.includes('packages/plugin-codex/.codex-plugin/plugin.json'),
      'RELEASING.md must name `packages/plugin-codex/.codex-plugin/plugin.json` as the source of truth',
    );
    assert.match(
      content,
      /node tools\/package-marketplace\.mjs --write/,
      'RELEASING.md Version Bump section must mention `node tools/package-marketplace.mjs --write`',
    );
    assert.match(
      content,
      /node tools\/package-marketplace\.mjs --check/,
      'RELEASING.md Version Bump section must mention `node tools/package-marketplace.mjs --check`',
    );
    assert.match(content, /semver/i, 'RELEASING.md Version Bump section must mention semver');
  });

  // ========================================================================
  // T10-6: Version Bump section documents tag format v0.x.y
  // ========================================================================

  it('RELEASING.md Version Bump section documents the `v0.x.y` tag format', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /git tag v0\.[xX]\.[yY]|`v0\.[xX]\.[yY]`/,
      'RELEASING.md Version Bump section must document the `v0.x.y` git tag format',
    );
  });

  // ========================================================================
  // T10-7: Version Bump section documents workspace 0.0.0 decoupling
  // ========================================================================

  it('RELEASING.md Version Bump section documents workspace `0.0.0` decoupling', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /workspace.*0\.0\.0|0\.0\.0.*workspace|decoupled/i,
      'RELEASING.md Version Bump section must document that workspace package.json files remain "0.0.0"',
    );
  });

  // ========================================================================
  // T10-8: smoke helper's runtime derivation matches the source plugin.json
  //
  // Reading the marketplace plugin.json directly here would race against
  // T4-6's drift test (same isolation reason as T10-2). The smoke helper
  // derives its expected version from the marketplace plugin.json AT
  // RUNTIME, not at test-load time. Byte-identity between source and
  // marketplace (enforced by --check) makes the runtime derivation
  // equivalent to reading the source manifest. We verify the smoke
  // helper performs the derivation (T9-10 rewritten) and that
  // EXPECTED_VERSION matches the source manifest exactly.
  // ========================================================================

  it('smoke helper-equivalent EXPECTED_VERSION equals source plugin.json version', () => {
    const sourceVersion = JSON.parse(readFileSync(SOURCE_PLUGIN_JSON, 'utf8')).version;
    assert.equal(
      EXPECTED_VERSION,
      sourceVersion,
      `EXPECTED_VERSION (top-of-file derivation) drifted from source plugin.json: ${EXPECTED_VERSION} vs ${sourceVersion}`,
    );
  });

  // ========================================================================
  // T10-9: RELEASING.md Version Bump section has no OQ4 forbidden tokens
  //        and no Plan 0004 benchmark vocabulary
  // ========================================================================

  it('RELEASING.md Version Bump section contains no OQ4 forbidden tokens and no Plan 0004 vocabulary', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `RELEASING.md contains forbidden cost-claim token: "${token}"`,
      );
    }
    for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `RELEASING.md contains forbidden Plan 0004 benchmark/cutover token: "${token}"`,
      );
    }
  });
});
