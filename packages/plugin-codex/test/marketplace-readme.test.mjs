// Static-validation tests for the install-procedure docs — Plan 0006 T6
//
// These tests do NOT spawn processes. They verify that the user-facing install
// documentation in marketplace/plugins/cc/README.md and
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

const MARKETPLACE_README = resolve(REPO_ROOT, 'marketplace', 'plugins', 'cc', 'README.md');
const RELEASING_MD = resolve(REPO_ROOT, 'documentation', 'RELEASING.md');

// ---------- verbatim install command strings ----------

const CMD_MARKETPLACE_ADD = 'codex plugin marketplace add "<repo-root>/marketplace"';
const CMD_PLUGIN_ADD = 'codex plugin add "cc@cc-plugin-codex-local"';
const CMD_GIT_MARKETPLACE_ADD =
  'codex plugin marketplace add https://github.com/wu-hongjun/cc-plugin-codex';
const CMD_GIT_PLUGIN_ADD = 'codex plugin add "cc@cc-plugin-codex"';
const CMD_CURL_INSTALL =
  'curl -fsSL https://raw.githubusercontent.com/wu-hongjun/cc-plugin-codex/main/install.sh | bash';
const CMD_VERIFY = 'codex plugin list';
const CMD_PLUGIN_REMOVE = 'codex plugin remove "cc@cc-plugin-codex-local"';
const CMD_MARKETPLACE_REMOVE = 'codex plugin marketplace remove "cc-plugin-codex-local"';
const CMD_GIT_PLUGIN_REMOVE = 'codex plugin remove "cc@cc-plugin-codex"';
const CMD_GIT_MARKETPLACE_REMOVE = 'codex plugin marketplace remove "cc-plugin-codex"';
const POST_INSTALL_GATE = '$claude-setup';
const OLD_RSYNC_CMD = 'rsync -a --delete';
const MARKETPLACE_NAME = 'cc-plugin-codex-local';
const GIT_MARKETPLACE_NAME = 'cc-plugin-codex';
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

  it('marketplace/plugins/cc/README.md exists and is non-empty', () => {
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

  it('README contains the public Git marketplace install commands', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_CURL_INSTALL),
      `README.md must contain the bootstrap install command: ${CMD_CURL_INSTALL}`,
    );
    assert.ok(
      content.includes(CMD_GIT_MARKETPLACE_ADD),
      `README.md must contain the public Git marketplace command: ${CMD_GIT_MARKETPLACE_ADD}`,
    );
    assert.ok(
      content.includes(CMD_GIT_PLUGIN_ADD),
      `README.md must contain the public Git plugin add command: ${CMD_GIT_PLUGIN_ADD}`,
    );
  });

  // ========================================================================
  // T6-3: README contains the verbatim plugin add command
  // ========================================================================

  it('README contains the verbatim `codex plugin add "cc@cc-plugin-codex-local"` command', () => {
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

  it('README uses shortId/sessionId, not jobId, for claude attach examples', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.equal(
      content.includes('claude attach <jobId>'),
      false,
      'README.md must not tell users to pass a plugin jobId to claude attach',
    );
    assert.ok(
      content.includes('claude attach <shortId>'),
      'README.md must include a claude attach <shortId> example',
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
    assert.ok(
      content.includes(CMD_GIT_PLUGIN_REMOVE),
      `README.md must contain the Git uninstall command: ${CMD_GIT_PLUGIN_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_GIT_MARKETPLACE_REMOVE),
      `README.md must contain the Git marketplace removal command: ${CMD_GIT_MARKETPLACE_REMOVE}`,
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
    assert.ok(
      content.includes(GIT_MARKETPLACE_NAME),
      `README.md must contain the Git marketplace name: ${GIT_MARKETPLACE_NAME}`,
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
// `codex plugin marketplace upgrade` refreshes Git marketplaces only. The
// local-marketplace upgrade flow remains remove + add against the same path.

// Regex used to assert there is no runnable `codex plugin upgrade` /
// `codex plugin update` line documented as a command. We match against the
// start of a line (optionally indented) so we do not falsely trip on inline
// negated prose like "does not expose an in-place `codex plugin upgrade`".
const CMD_PLUGIN_UPGRADE_BARE_LINE = /^\s*codex plugin upgrade\b/m;
const CMD_PLUGIN_UPDATE_BARE_LINE = /^\s*codex plugin update\b/m;
const NEGATED_UPGRADE_PHRASE = /does not expose .*codex plugin upgrade/i;

// Plan 0006 T10: derive the upgrade-verification version from the source
// plugin manifest (source of truth) instead of hard-coding it. The marketplace
// plugin.json is a byte-identical derived copy enforced by `package-marketplace
// --check`, and the marketplace README's upgrade-verification line should
// reference this version.
const SOURCE_PLUGIN_JSON_PATH = resolve(
  REPO_ROOT,
  'packages',
  'plugin-codex',
  '.codex-plugin',
  'plugin.json',
);
const UPGRADE_VERSION_STRING = JSON.parse(readFileSync(SOURCE_PLUGIN_JSON_PATH, 'utf8')).version;

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

  it('README contains the Git marketplace upgrade flow', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes('codex plugin marketplace upgrade "cc-plugin-codex"'),
      'README.md must contain the Git marketplace upgrade command',
    );
    assert.ok(
      content.includes(CMD_GIT_PLUGIN_REMOVE),
      `README.md must contain the Git plugin remove command: ${CMD_GIT_PLUGIN_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_GIT_PLUGIN_ADD),
      `README.md must contain the Git plugin add command: ${CMD_GIT_PLUGIN_ADD}`,
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
  // T7-9: README mentions the current plugin version in upgrade verification
  // ========================================================================

  it('README mentions the current plugin version in upgrade verification', () => {
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

// ==========================================================================
// Plan 0006 T8 — marketplace uninstall procedure docs
// ==========================================================================
//
// T6 first introduced the uninstall commands. T8 promotes uninstall to a
// first-class lifecycle operation: verification commands, post-uninstall
// state assertion, and explicit notes on what uninstall does NOT touch
// (Git checkout and Claude Companion job records under the companion home).

const CMD_MARKETPLACE_LIST = 'codex plugin marketplace list';

describe('marketplace uninstall procedure docs (Plan 0006 T8)', () => {
  // ========================================================================
  // T8-1: README contains an "## Uninstall" section
  // ========================================================================

  it('README contains an "## Uninstall" section', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(content, /^## Uninstall$/m, 'README.md must contain an "## Uninstall" heading');
  });

  // ========================================================================
  // T8-2: README contains the plugin remove command
  // ========================================================================

  it('README contains the plugin remove command for uninstall', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_PLUGIN_REMOVE),
      `README.md must contain the plugin remove command: ${CMD_PLUGIN_REMOVE}`,
    );
  });

  // ========================================================================
  // T8-3: README contains the marketplace remove command
  // ========================================================================

  it('README contains the marketplace remove command for uninstall', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_MARKETPLACE_REMOVE),
      `README.md must contain the marketplace remove command: ${CMD_MARKETPLACE_REMOVE}`,
    );
  });

  // ========================================================================
  // T8-4: README contains both verification commands
  // ========================================================================

  it('README contains both post-uninstall verification commands (`codex plugin list` + `codex plugin marketplace list`)', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes(CMD_VERIFY),
      `README.md must contain the verify command: ${CMD_VERIFY}`,
    );
    assert.ok(
      content.includes(CMD_MARKETPLACE_LIST),
      `README.md must contain the marketplace list verification command: ${CMD_MARKETPLACE_LIST}`,
    );
  });

  // ========================================================================
  // T8-5: README states the plugin should no longer appear in plugin list
  // ========================================================================

  it('README states the plugin should no longer appear in `codex plugin list` after uninstall', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(
      content,
      /no longer\s+appear in[\s\S]*?codex plugin list/i,
      'README.md must state that the plugin should no longer appear in `codex plugin list` after uninstall',
    );
  });

  // ========================================================================
  // T8-6: README states the marketplace should no longer appear in marketplace list
  // ========================================================================

  it('README states the marketplace should no longer appear in `codex plugin marketplace list` after uninstall', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(
      content,
      /no longer\s+appear in[\s\S]*?codex plugin marketplace list/i,
      'README.md must state that the marketplace should no longer appear in `codex plugin marketplace list` after uninstall',
    );
  });

  // ========================================================================
  // T8-7: README states uninstall does not delete the Git checkout
  // ========================================================================

  it('README states uninstall does not delete the Git checkout', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(
      content,
      /(does not|not).*delete.*Git checkout/i,
      'README.md must state that uninstall does not delete the Git checkout',
    );
  });

  // ========================================================================
  // T8-8: README states uninstall does not delete companion-home job records
  // ========================================================================

  it('README states uninstall does not delete Claude Companion job records / companion-home data', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.match(
      content,
      /(does not|not).*delete.*(job records|companion home|companion-home)/i,
      'README.md must state that uninstall does not delete companion-home job records',
    );
  });

  // ========================================================================
  // T8-9: RELEASING.md contains uninstall verification language
  // ========================================================================

  it('RELEASING.md contains an uninstall verification section with both list commands and isolation guidance', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /(uninstall verification|Uninstall verification)/,
      'RELEASING.md must contain an uninstall verification section',
    );
    assert.ok(
      content.includes(CMD_PLUGIN_REMOVE),
      `RELEASING.md must contain the plugin remove command: ${CMD_PLUGIN_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_MARKETPLACE_REMOVE),
      `RELEASING.md must contain the marketplace remove command: ${CMD_MARKETPLACE_REMOVE}`,
    );
    assert.ok(
      content.includes(CMD_VERIFY),
      `RELEASING.md must contain the plugin list verification command: ${CMD_VERIFY}`,
    );
    assert.ok(
      content.includes(CMD_MARKETPLACE_LIST),
      `RELEASING.md must contain the marketplace list verification command: ${CMD_MARKETPLACE_LIST}`,
    );
    assert.match(
      content,
      /CODEX_HOME/,
      'RELEASING.md must reference CODEX_HOME isolation for uninstall verification',
    );
  });

  // ========================================================================
  // T8-10: README and RELEASING.md uninstall surfaces contain no forbidden tokens
  // ========================================================================
  //
  // The T6 suite already enforces the absence of OQ4 cost-claim tokens and
  // Plan 0004 benchmark vocabulary across the whole files. T8 re-asserts the
  // rule explicitly so a regression in the uninstall-specific prose is caught
  // by a T8-named test, not only by the catch-all.

  it('README and RELEASING.md uninstall additions contain no OQ4 forbidden tokens and no Plan 0004 benchmark vocabulary', () => {
    const readmeContent = readFileSync(MARKETPLACE_README, 'utf8');
    const releasingContent = readFileSync(RELEASING_MD, 'utf8');
    for (const token of FORBIDDEN_COST_TOKENS) {
      assert.equal(
        readmeContent.includes(token),
        false,
        `README.md contains forbidden cost-claim token: "${token}"`,
      );
      assert.equal(
        releasingContent.includes(token),
        false,
        `RELEASING.md contains forbidden cost-claim token: "${token}"`,
      );
    }
    for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
      assert.equal(
        readmeContent.includes(token),
        false,
        `README.md contains forbidden Plan 0004 benchmark/cutover token: "${token}"`,
      );
      assert.equal(
        releasingContent.includes(token),
        false,
        `RELEASING.md contains forbidden Plan 0004 benchmark/cutover token: "${token}"`,
      );
    }
  });
});
