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
const EXPECTED_VERSION = '0.2.0';

const SKILL_NAMES = [
  'claude-setup',
  'claude-delegate',
  'claude-status',
  'claude-result',
  'claude-stop',
  'claude-followup',
  'claude-review',
  'claude-adversarial-review',
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
  // T9-3: script body contains all 8 skill names
  // ========================================================================

  it('smoke script body contains all 8 skill names', () => {
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
  // T9-10: script asserts the expected plugin version (0.2.0)
  // ========================================================================

  it('smoke script asserts expected plugin version 0.2.0', () => {
    const body = readFileSync(SMOKE_SCRIPT, 'utf8');
    assert.ok(
      body.includes(EXPECTED_VERSION),
      `smoke script must reference expected version ${EXPECTED_VERSION}`,
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
  // T9-12: RELEASING.md enumerates all 8 skills
  // ========================================================================

  it('RELEASING.md enumerates all 8 skill names', () => {
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
