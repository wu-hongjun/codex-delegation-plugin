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

// ==========================================================================
// Plan 0006 T7 — marketplace upgrade procedure docs
// ==========================================================================
//
// T1 empirically confirmed that Codex 0.136.0 has no `codex plugin upgrade`
// and no `codex plugin update` command. The user-facing upgrade procedure is
// therefore `codex plugin remove` + `codex plugin add` against the same (or
// refreshed) marketplace pointer. Note: Codex DOES expose
// `codex plugin marketplace upgrade`, but that only refreshes Git
// marketplaces and is not part of the local-marketplace upgrade flow.

// Regex used to assert there is no runnable `codex plugin upgrade` /
// `codex plugin update` line documented as a command. We match against the
// start of a line (optionally indented) so we do not falsely trip on inline
// negated prose like "does not expose an in-place `codex plugin upgrade`".
const CMD_PLUGIN_UPGRADE_BARE_LINE = /^\s*codex plugin upgrade\b/m;
const CMD_PLUGIN_UPDATE_BARE_LINE = /^\s*codex plugin update\b/m;
const NEGATED_UPGRADE_PHRASE = /does not expose .*codex plugin upgrade/i;

const UPGRADE_VERSION_STRING = '0.2.0';

describe('marketplace upgrade procedure docs (Plan 0006 T7)', () => {
  // ========================================================================
  // T7-1: README contains an "## Upgrade" section
  // ========================================================================

  it('README contains an "## Upgrade" section', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(content, /^## Upgrade$/m, 'README.md must contain an "## Upgrade" heading');
  });

  // ========================================================================
  // T7-2: README states Codex 0.136.0 does not expose in-place upgrade/update
  // ========================================================================

  it('README states Codex 0.136.0 does not expose in-place upgrade/update', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(
      content,
      NEGATED_UPGRADE_PHRASE,
      'README.md must explicitly negate the existence of `codex plugin upgrade`',
    );
  });

  // ========================================================================
  // T7-3: README Upgrade section contains the plugin remove command
  // ========================================================================

  it('README contains the plugin remove command for the upgrade flow', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_PLUGIN_REMOVE),
      `README.md must contain the plugin remove command: ${CMD_PLUGIN_REMOVE}`,
    );
  });

  // ========================================================================
  // T7-4: README Upgrade section contains the plugin add command
  // ========================================================================

  it('README contains the plugin add command for the upgrade flow', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_PLUGIN_ADD),
      `README.md must contain the plugin add command: ${CMD_PLUGIN_ADD}`,
    );
  });

  // ========================================================================
  // T7-5: README contains marketplace remove command for path-refresh flow
  // ========================================================================

  it('README contains the marketplace remove command for the path-refresh upgrade flow', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_MARKETPLACE_REMOVE),
      `README.md must contain the marketplace remove command: ${CMD_MARKETPLACE_REMOVE}`,
    );
  });

  // ========================================================================
  // T7-6: README contains marketplace add command for path-refresh flow
  // ========================================================================

  it('README contains the marketplace add command for the path-refresh upgrade flow', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_MARKETPLACE_ADD),
      `README.md must contain the marketplace add command: ${CMD_MARKETPLACE_ADD}`,
    );
  });

  // ========================================================================
  // T7-7: README does NOT document a runnable `codex plugin upgrade` command
  // ========================================================================

  it('README does not document a runnable `codex plugin upgrade` command', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.doesNotMatch(
      content,
      CMD_PLUGIN_UPGRADE_BARE_LINE,
      'README.md must not present `codex plugin upgrade` as a runnable command line',
    );
  });

  // ========================================================================
  // T7-8: README does NOT document a runnable `codex plugin update` command
  // ========================================================================

  it('README does not document a runnable `codex plugin update` command', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.doesNotMatch(
      content,
      CMD_PLUGIN_UPDATE_BARE_LINE,
      'README.md must not present `codex plugin update` as a runnable command line',
    );
  });

  // ========================================================================
  // T7-9: README mentions version 0.2.0 in upgrade verification
  // ========================================================================

  it('README mentions version 0.2.0 in upgrade verification', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(UPGRADE_VERSION_STRING),
      `README.md must mention current plugin version ${UPGRADE_VERSION_STRING} in upgrade verification`,
    );
  });

  // ========================================================================
  // T7-10: RELEASING.md contains the upgrade procedure with both flows
  // ========================================================================

  it('RELEASING.md contains the upgrade procedure with remove + add for both flows', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /^## Upgrade procedure/m,
      'RELEASING.md must contain an "## Upgrade procedure" section',
    );
    assert.match(
      content,
      NEGATED_UPGRADE_PHRASE,
      'RELEASING.md must explicitly negate the existence of `codex plugin upgrade`',
    );
    assert.ok(
      content.includes(CMD_PLUGIN_REMOVE),
      `RELEASING.md must contain the plugin remove command: ${CMD_PLUGIN_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_PLUGIN_ADD),
      `RELEASING.md must contain the plugin add command: ${CMD_PLUGIN_ADD}`,
    );
    assert.ok(
      content.includes(CMD_MARKETPLACE_REMOVE),
      `RELEASING.md must contain the marketplace remove command: ${CMD_MARKETPLACE_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_MARKETPLACE_ADD),
      `RELEASING.md must contain the marketplace add command: ${CMD_MARKETPLACE_ADD}`,
    );
    assert.doesNotMatch(
      content,
      CMD_PLUGIN_UPGRADE_BARE_LINE,
      'RELEASING.md must not present `codex plugin upgrade` as a runnable command line',
    );
    assert.doesNotMatch(
      content,
      CMD_PLUGIN_UPDATE_BARE_LINE,
      'RELEASING.md must not present `codex plugin update` as a runnable command line',
    );
  });
});
