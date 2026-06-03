// Static-validation tests for the install-procedure docs — Plan 0006 T6
//
// These tests do NOT spawn processes. They verify that the user-facing install
// documentation in marketplace/plugins/claude-companion/README.md and
// documentation/RELEASING.md contains the correct verbatim install commands,
// the expected post-install gate, and no forbidden cost-claim or
// benchmark/cutover vocabulary.
//
// Pattern mirrors marketplace-layout.test.mjs:
// node:test + node:assert/strict, ESM, import.meta.url path resolution.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
// packages/plugin-codex/test/ -> up 3 levels to repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');

const MARKETPLACE_README = resolve(
  REPO_ROOT,
  'marketplace',
  'plugins',
  'claude-companion',
  'README.md',
);
const RELEASING_MD = resolve(REPO_ROOT, 'documentation', 'RELEASING.md');

// ---------- verbatim install command strings ----------

const CMD_MARKETPLACE_ADD = 'codex plugin marketplace add "<repo-root>/marketplace"';
const CMD_PLUGIN_ADD = 'codex plugin add "claude-companion@cc-plugin-codex-local"';
const CMD_VERIFY = 'codex plugin list';
const CMD_PLUGIN_REMOVE = 'codex plugin remove "claude-companion@cc-plugin-codex-local"';
const CMD_MARKETPLACE_REMOVE = 'codex plugin marketplace remove "cc-plugin-codex-local"';
const POST_INSTALL_GATE = '$claude-setup';
const OLD_RSYNC_CMD = 'rsync -a --delete';
const MARKETPLACE_NAME = 'cc-plugin-codex-local';
const PACKAGE_CHECK_CMD = 'tools/package-marketplace.mjs --check';

// ---------- OQ4 forbidden cost-claim tokens ----------

const FORBIDDEN_COST_TOKENS = [
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

// ---------- Plan 0004 benchmark / cutover vocabulary ----------

const FORBIDDEN_BENCHMARK_TOKENS = [
  'benchmark',
  'cost saving',
  'pre-cutover',
  'post-cutover',
  'cutover',
  'Plan 0004',
];

// ==========================================================================
// Plan 0006 T6 — marketplace install procedure docs
// ==========================================================================

describe('marketplace install procedure docs (Plan 0006 T6)', () => {
  // ========================================================================
  // T6-1: marketplace README.md exists and is non-empty
  // ========================================================================

  it('marketplace/plugins/claude-companion/README.md exists and is non-empty', () => {
    assert.ok(existsSync(MARKETPLACE_README), `README.md not found at ${MARKETPLACE_README}`);
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(content.length > 0, 'marketplace README.md is empty');
  });

  // ========================================================================
  // T6-2: README contains the verbatim marketplace add command
  // ========================================================================

  it('README contains the verbatim `codex plugin marketplace add "<repo-root>/marketplace"` command', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_MARKETPLACE_ADD),
      `README.md must contain the verbatim string: ${CMD_MARKETPLACE_ADD}`,
    );
  });

  // ========================================================================
  // T6-3: README contains the verbatim plugin add command
  // ========================================================================

  it('README contains the verbatim `codex plugin add "claude-companion@cc-plugin-codex-local"` command', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_PLUGIN_ADD),
      `README.md must contain the verbatim string: ${CMD_PLUGIN_ADD}`,
    );
  });

  // ========================================================================
  // T6-4: README contains the verify command `codex plugin list`
  // ========================================================================

  it('README contains the verify command `codex plugin list`', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_VERIFY),
      `README.md must contain the verify command: ${CMD_VERIFY}`,
    );
  });

  // ========================================================================
  // T6-5: README mentions `$claude-setup` as the post-install gate
  // ========================================================================

  it('README mentions `$claude-setup` as the post-install gate', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(POST_INSTALL_GATE),
      `README.md must contain the post-install gate: ${POST_INSTALL_GATE}`,
    );
  });

  // ========================================================================
  // T6-6: README does NOT contain the old rsync install command
  // ========================================================================

  it('README does not contain `rsync -a --delete` (old Plan 0001 install flow)', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.equal(
      content.includes(OLD_RSYNC_CMD),
      false,
      `README.md must not contain the old rsync install command: ${OLD_RSYNC_CMD}`,
    );
  });

  // ========================================================================
  // T6-7: README contains no OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('README contains no OQ4 forbidden cost-claim tokens', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `README.md contains forbidden cost-claim token: "${token}"`,
      );
    }
  });

  // ========================================================================
  // T6-8: README contains no Plan 0004 benchmark/cutover vocabulary
  // ========================================================================

  it('README contains no Plan 0004 benchmark/cutover vocabulary', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `README.md contains forbidden Plan 0004 benchmark/cutover token: "${token}"`,
      );
    }
  });

  // ========================================================================
  // T6-9: documentation/RELEASING.md exists and contains both install commands
  // ========================================================================

  it('documentation/RELEASING.md exists and contains both verbatim install commands', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.ok(content.length > 0, 'documentation/RELEASING.md is empty');
    assert.ok(
      content.includes(CMD_MARKETPLACE_ADD),
      `RELEASING.md must contain the verbatim string: ${CMD_MARKETPLACE_ADD}`,
    );
    assert.ok(
      content.includes(CMD_PLUGIN_ADD),
      `RELEASING.md must contain the verbatim string: ${CMD_PLUGIN_ADD}`,
    );
  });

  // ========================================================================
  // T6-10: documentation/RELEASING.md contains no OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('documentation/RELEASING.md contains no OQ4 forbidden cost-claim tokens', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `RELEASING.md contains forbidden cost-claim token: "${token}"`,
      );
    }
  });

  // ========================================================================
  // T6-11 (optional): README contains both uninstall commands
  // ========================================================================

  it('README contains both uninstall commands', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_PLUGIN_REMOVE),
      `README.md must contain the uninstall command: ${CMD_PLUGIN_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_MARKETPLACE_REMOVE),
      `README.md must contain the marketplace removal command: ${CMD_MARKETPLACE_REMOVE}`,
    );
  });

  // ========================================================================
  // T6-12 (optional): README contains the marketplace name `cc-plugin-codex-local`
  // ========================================================================

  it('README contains the marketplace name `cc-plugin-codex-local`', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(MARKETPLACE_NAME),
      `README.md must contain the marketplace name: ${MARKETPLACE_NAME}`,
    );
  });

  // ========================================================================
  // T6-13 (optional): documentation/RELEASING.md references
  //                    `tools/package-marketplace.mjs --check`
  // ========================================================================

  it('documentation/RELEASING.md references `tools/package-marketplace.mjs --check`', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.ok(
      content.includes(PACKAGE_CHECK_CMD),
      `RELEASING.md must reference the pre-install gate: ${PACKAGE_CHECK_CMD}`,
    );
  });
});
