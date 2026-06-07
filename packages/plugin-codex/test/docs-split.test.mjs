// Static-validation tests for the Plan 0006 T12 docs split.
//
// Plan 0006 ships three distinct documentation surfaces:
//
//   1. marketplace/plugins/cc/README.md
//      End-user marketplace README. Short, install / verify / upgrade /
//      uninstall / troubleshooting + 8-skill list. Discoverable from the
//      committed marketplace tree.
//
//   2. packages/plugin-codex/README.md
//      Comprehensive plugin docs. Architecture, dispatcher, skills,
//      design pillars. Primary install flow now points at the committed
//      `marketplace/` tree (Plan 0006). The cost paragraph is preserved
//      byte-identically (Plan 0002 T13 invariant + T6-T11 forbidden-token
//      lists allow it on this surface only).
//
//   3. README.md (root)
//      Workspace / contributor overview. Quick start section points at
//      the marketplace tree + marketplace README + plugin README +
//      RELEASING.md + plan history.
//
// These tests enforce:
//   - Each surface has its required content.
//   - The three surfaces target distinct audiences (no end-user
//     marketplace README leaking development / CI / architecture-only
//     phrases; no plugin / root README claiming rsync is the primary
//     install path).
//   - The cost-paragraph byte-equality is preserved.
//   - No OQ4 forbidden cost-claim tokens or Plan 0004 benchmark
//     vocabulary appears in the end-user marketplace README.
//
// The tests do NOT spawn codex, the smoke helper, or any subprocess
// other than what node:test itself requires.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
// packages/plugin-codex/test/ -> up 3 levels to repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');

const ROOT_README = resolve(REPO_ROOT, 'README.md');
const PLUGIN_README = resolve(REPO_ROOT, 'packages', 'plugin-codex', 'README.md');
const MARKETPLACE_README = resolve(REPO_ROOT, 'marketplace', 'plugins', 'cc', 'README.md');
const RELEASING_MD = resolve(REPO_ROOT, 'documentation', 'RELEASING.md');

// ---------- skill names ----------

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

// ---------- forbidden tokens for END-USER surfaces ----------
// The plugin README (developer-facing) intentionally retains the cost
// paragraph anchored on "Plan 0004" + "benchmarked"; that exemption is
// enforced by readme.test.mjs T13-21. The end-user marketplace README
// is held to a stricter standard.

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

// Phrases that signal development / CI / architecture-only context and
// should not leak into the end-user marketplace README.
const DEV_ONLY_PHRASES = [
  'npm run lint',
  'npm run typecheck',
  'npm run test:attach',
  'npm run test:bench',
  'tsc --build',
  'GitHub Actions matrix',
  'Driver interface',
  'job store',
  'reconciler',
  'design pillars',
  'design pillar',
];

// ==========================================================================
// Plan 0006 T12 — three-surface docs split
// ==========================================================================

describe('docs split — three distinct surfaces (Plan 0006 T12)', () => {
  // ========================================================================
  // T12-1: all three surfaces exist
  // ========================================================================

  it('root README, plugin README, and marketplace README all exist', () => {
    assert.ok(existsSync(ROOT_README), `root README not found at ${ROOT_README}`);
    assert.ok(existsSync(PLUGIN_README), `plugin README not found at ${PLUGIN_README}`);
    assert.ok(
      existsSync(MARKETPLACE_README),
      `marketplace README not found at ${MARKETPLACE_README}`,
    );
  });

  // ========================================================================
  // Marketplace README — end-user surface
  // ========================================================================

  describe('marketplace README — end-user surface', () => {
    // T12-2: required section headings
    it('contains required end-user section headings', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      const requiredHeadings = [
        /^# Claude Companion\b/m,
        /^## Requirements\b/m,
        /^## Install\b/m,
        /^## Verify\b/m,
        /^## Skills\b/m,
        /^## Uninstall\b/m,
        /^## Smoke test\b/m,
        /^## Troubleshooting\b/m,
        /^## Upgrade\b/m,
      ];
      for (const heading of requiredHeadings) {
        assert.match(
          content,
          heading,
          `marketplace README must contain heading matching ${heading}`,
        );
      }
    });

    // T12-3: Skills section lists all 13 skills with $-prefix
    it('Skills section enumerates all 13 skill names with $-prefix and a one-line description', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      // Extract the Skills section body.
      const match = content.match(/^## Skills\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'marketplace README must have a `## Skills` section');
      const skillsBody = match[0];
      for (const name of SKILL_NAMES) {
        assert.ok(skillsBody.includes(`$${name}`), `Skills section must list $${name}`);
        // Each skill entry should have a description (dash + space pattern).
        const skillLineRegex = new RegExp(`- \`\\$${name}\``);
        assert.match(
          skillsBody,
          skillLineRegex,
          `Skills section must format $${name} as a list-item like \`- \\\`$${name}\\\` — ...\``,
        );
      }
    });

    // T12-4: install commands exact
    it('contains exact install commands', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      assert.ok(
        content.includes('codex plugin marketplace add "<repo-root>/marketplace"'),
        'marketplace README must contain verbatim `codex plugin marketplace add "<repo-root>/marketplace"`',
      );
      assert.ok(
        content.includes('codex plugin add "cc@cc-plugin-codex-local"'),
        'marketplace README must contain verbatim `codex plugin add "cc@cc-plugin-codex-local"`',
      );
    });

    // T12-5: verify command + $claude-setup
    it('Verify section references `codex plugin list` and `$claude-setup`', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      assert.ok(
        content.includes('codex plugin list'),
        'marketplace README must reference `codex plugin list` as a verify command',
      );
      assert.ok(
        content.includes('$claude-setup'),
        'marketplace README must reference `$claude-setup` as the post-install gate',
      );
    });

    // T12-6: smoke-test pointer to RELEASING.md
    it('Smoke test section points at documentation/RELEASING.md', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      const match = content.match(/^## Smoke test\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'marketplace README must have a `## Smoke test` section');
      const body = match[0];
      assert.match(
        body,
        /documentation\/RELEASING\.md/,
        'Smoke test section must point at `documentation/RELEASING.md`',
      );
    });

    // T12-7: no rsync primary install
    it('does NOT contain `rsync -a --delete` (old Plan 0001 primary install)', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      assert.equal(
        content.includes('rsync -a --delete'),
        false,
        'marketplace README must not contain `rsync -a --delete` (legacy install flow)',
      );
    });

    // T12-8: ERR_MODULE_NOT_FOUND troubleshooting present
    it('Troubleshooting section covers `ERR_MODULE_NOT_FOUND` (T9.5 packaging defect signal)', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      const match = content.match(/^## Troubleshooting\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'marketplace README must have a `## Troubleshooting` section');
      const body = match[0];
      assert.match(
        body,
        /ERR_MODULE_NOT_FOUND/,
        'Troubleshooting section must document `ERR_MODULE_NOT_FOUND` as the T9.5 packaging-defect signal',
      );
    });

    // T12-9: empty-cache-breadcrumb fact in uninstall area
    it('Uninstall section documents the empty-cache-breadcrumb-may-remain fact', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      assert.match(
        content,
        /empty\s+(?:cache\s+)?breadcrumb|breadcrumb\s+(?:directories|directory)/i,
        'marketplace README must document that empty cache breadcrumb directories may remain after uninstall',
      );
    });

    // T12-10: end-user surface contains no dev/CI/architecture-only phrases
    it('does NOT contain development / CI / architecture-only phrases', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      for (const phrase of DEV_ONLY_PHRASES) {
        assert.equal(
          content.includes(phrase),
          false,
          `marketplace README (end-user surface) must not contain dev/CI/architecture phrase: "${phrase}"`,
        );
      }
    });

    // T12-10b: $claude-status description leads with multi-job list behavior
    it('$claude-status description mentions "list" (multi-job phrasing)', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      const match = content.match(/^## Skills\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'marketplace README must have a `## Skills` section');
      const skillsBody = match[0];
      // Find the $claude-status entry (the line(s) after `$claude-status`)
      const statusMatch = skillsBody.match(/`\$claude-status`[^\n]*([\s\S]*?)(?=\n- `\$)/);
      assert.ok(statusMatch, 'Skills section must contain a $claude-status entry');
      const statusEntry = statusMatch[0];
      assert.ok(
        statusEntry.toLowerCase().includes('list'),
        '$claude-status description must mention "list" to reflect multi-job behavior (not just single-job lookup)',
      );
    });

    // T12-11: no OQ4 forbidden cost-claim tokens
    it('contains no OQ4 forbidden cost-claim tokens', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      for (const token of FORBIDDEN_COST_TOKENS) {
        assert.equal(
          content.includes(token),
          false,
          `marketplace README must not contain forbidden cost-claim token: "${token}"`,
        );
      }
    });

    // T12-12: no Plan 0004 benchmark/cutover vocabulary
    it('contains no Plan 0004 benchmark/cutover vocabulary (stricter than plugin README)', () => {
      const content = readFileSync(MARKETPLACE_README, 'utf8');
      for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
        assert.equal(
          content.includes(token),
          false,
          `marketplace README must not contain Plan 0004 benchmark/cutover token: "${token}"`,
        );
      }
    });
  });

  // ========================================================================
  // Plugin README — comprehensive developer surface
  // ========================================================================

  describe('plugin README — comprehensive developer surface', () => {
    // T12-13: install section references the committed marketplace flow
    it('`## Install locally` references the committed `marketplace/` install flow', () => {
      const content = readFileSync(PLUGIN_README, 'utf8');
      const match = content.match(/^## Install locally\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'plugin README must have an `## Install locally` section');
      const body = match[0];
      assert.match(
        body,
        /codex plugin marketplace add "\$\(pwd\)\/marketplace"|codex plugin marketplace add "<repo-root>\/marketplace"/,
        'plugin README install section must reference the committed `marketplace/` install command',
      );
      assert.match(
        body,
        /codex plugin add "cc@cc-plugin-codex-local"/,
        'plugin README install section must reference the `cc@cc-plugin-codex-local` plugin add command',
      );
    });

    // T12-14: install section does NOT present rsync as the primary path
    it('`## Install locally` does NOT present `rsync -a --delete` as the primary install path', () => {
      const content = readFileSync(PLUGIN_README, 'utf8');
      const match = content.match(/^## Install locally\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'plugin README must have an `## Install locally` section');
      const body = match[0];
      // The rsync flow may be referenced in a clearly-labeled legacy/historical
      // subsection, but it must NOT appear as an executable code block at the
      // start of the install section. We check: no `rsync -a --delete` command
      // appears anywhere in the install-locally section.
      assert.equal(
        body.includes('rsync -a --delete'),
        false,
        'plugin README install section must not include `rsync -a --delete` as a runnable command',
      );
    });

    // T12-15: install section points at marketplace README + RELEASING.md
    it('`## Install locally` points at marketplace README and RELEASING.md', () => {
      const content = readFileSync(PLUGIN_README, 'utf8');
      const match = content.match(/^## Install locally\b[\s\S]*?(?=^## )/m);
      assert.ok(match, 'plugin README must have an `## Install locally` section');
      const body = match[0];
      assert.match(
        body,
        /marketplace\/plugins\/cc\/README\.md/,
        'plugin README install section must point at the marketplace README',
      );
      assert.match(
        body,
        /documentation\/RELEASING\.md/,
        'plugin README install section must point at documentation/RELEASING.md',
      );
    });

    // T12-16: cost paragraph remains byte-identical (Plan 0002 T13)
    it('cost paragraph remains byte-identical to the Plan 0001/0002 wording', () => {
      const content = readFileSync(PLUGIN_README, 'utf8');
      const expected =
        'This v1 uses Claude Code background sessions and does not use `claude -p`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement.';
      assert.ok(
        content.includes(expected),
        'plugin README cost paragraph must remain byte-identical to the Plan 0001/0002 wording (this test cross-checks the existing readme.test.mjs T13-21 invariant)',
      );
    });
  });

  // ========================================================================
  // Root README — workspace / contributor overview
  // ========================================================================

  describe('root README — workspace overview', () => {
    // T12-17: Quick start section exists with pointers to all 4 surfaces
    it('contains a Quick start section pointing at all four canonical surfaces', () => {
      const content = readFileSync(ROOT_README, 'utf8');
      assert.match(
        content,
        /^## Quick start\b/m,
        'root README must have a `## Quick start` section',
      );
      // All four canonical pointers must appear in the file.
      assert.match(
        content,
        /marketplace\/plugins\/cc\/README\.md/,
        'root README must link to the marketplace README',
      );
      assert.match(
        content,
        /packages\/plugin-codex\/README\.md/,
        'root README must link to the plugin README',
      );
      assert.match(
        content,
        /documentation\/RELEASING\.md/,
        'root README must link to documentation/RELEASING.md',
      );
      assert.match(
        content,
        /\bmarketplace\/\b|marketplace tree/,
        'root README must reference the committed `marketplace/` tree',
      );
    });

    // T12-18: Quick start section references the plan-history directory
    it('Quick start (or surrounding context) references the plan-history directory', () => {
      const content = readFileSync(ROOT_README, 'utf8');
      assert.match(
        content,
        /documentation\/plan\//,
        'root README must point at the documentation/plan/ directory for plan history',
      );
    });
  });

  // ========================================================================
  // Cross-file invariants
  // ========================================================================

  describe('cross-file invariants', () => {
    // T12-19: RELEASING.md is not structurally rewritten in T12
    //         (the T11 canonical-order test is the authoritative check)
    it('RELEASING.md still contains the T11 canonical-order headings', () => {
      // This is a coarse cross-check; the authoritative ordering check
      // lives in marketplace-releasing.test.mjs T11-2.
      const content = readFileSync(RELEASING_MD, 'utf8');
      const required = [
        '## Prerequisites',
        '## Version Bump',
        '## Packaging',
        '## Smoke Test',
        '## CI Verification',
        '## Tagging',
        '## Post-release',
      ];
      for (const heading of required) {
        const regex = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm');
        assert.match(
          content,
          regex,
          `RELEASING.md must still contain heading "${heading}" (T11 invariant; T12 did not restructure)`,
        );
      }
    });
  });
});

describe('docs polish — Stage 4 audit findings (Plan 0006 Stage 4)', () => {
  describe('F-1: plugin README known-limitation bullet must reflect committed marketplace', () => {
    it('plugin README must NOT contain the stale "No committed marketplace packaging" bullet', () => {
      const content = readFileSync(PLUGIN_README, 'utf8');
      assert.ok(
        !/No committed marketplace packaging/i.test(content),
        'Plugin README still contains the stale "No committed marketplace packaging" bullet from before Plan 0006',
      );
    });

    it('plugin README must mention the committed `marketplace/` tree', () => {
      const content = readFileSync(PLUGIN_README, 'utf8');
      assert.match(
        content,
        /committed[^\n]*`marketplace\/`|`marketplace\/`[^\n]*committed/i,
        'Plugin README must state that the local marketplace packaging under `marketplace/` is committed',
      );
    });
  });

  describe('F-2: root README plan-status checklist must reflect current truth', () => {
    it('root README must mark Plans 0001, 0002, and 0003 complete', () => {
      const content = readFileSync(ROOT_README, 'utf8');
      const required = [
        /^- \[x\][^\n]*Plan 0001[^\n]*(complete|Initial foundation)/m,
        /^- \[x\][^\n]*Plan 0002[^\n]*complete/m,
        /^- \[x\][^\n]*Plan 0003[^\n]*complete/m,
      ];
      for (const regex of required) {
        assert.match(
          content,
          regex,
          `Root README plan-status checklist must mark this plan complete: ${regex}`,
        );
      }
    });

    it('root README must NOT mark Plan 0004 complete', () => {
      const content = readFileSync(ROOT_README, 'utf8');
      assert.ok(
        !/^- \[x\][^\n]*Plan 0004/m.test(content),
        'Root README must not mark Plan 0004 complete (it is paused pending post-cutover measurement)',
      );
    });

    it('root README must mark Plan 0006 complete (post-Stage-5)', () => {
      const content = readFileSync(ROOT_README, 'utf8');
      assert.match(
        content,
        /^- \[x\][^\n]*Plan 0006[^\n]*complete/m,
        'Root README must mark Plan 0006 complete (Stage 5 closed; release tagged from this commit)',
      );
    });
  });
});

// ==========================================================================
// T5: $claude-workflow section present in both README surfaces (Plan 0008)
// ==========================================================================

describe('$claude-workflow documentation — plugin README (Plan 0008 T5)', () => {
  it('plugin README contains "### $claude-workflow" heading', () => {
    const content = readFileSync(PLUGIN_README, 'utf8');
    assert.ok(
      content.includes('### $claude-workflow'),
      'plugin README must contain a "### $claude-workflow" section (Plan 0008 T5)',
    );
  });

  it('plugin README $claude-workflow section mentions the approval flow ("claude attach")', () => {
    const content = readFileSync(PLUGIN_README, 'utf8');
    const idx = content.indexOf('### $claude-workflow');
    assert.ok(idx !== -1, 'plugin README must contain a "### $claude-workflow" section');
    const after = content.slice(idx);
    const nextH3 = after.indexOf('\n### ', 1);
    const section = nextH3 !== -1 ? after.slice(0, nextH3) : after;
    assert.ok(
      section.includes('claude attach'),
      'plugin README $claude-workflow section must mention "claude attach" for the approval flow',
    );
  });

  it('plugin README $claude-workflow section mentions the version floor (v2.1.153)', () => {
    const content = readFileSync(PLUGIN_README, 'utf8');
    const idx = content.indexOf('### $claude-workflow');
    assert.ok(idx !== -1, 'plugin README must contain a "### $claude-workflow" section');
    const after = content.slice(idx);
    const nextH3 = after.indexOf('\n### ', 1);
    const section = nextH3 !== -1 ? after.slice(0, nextH3) : after;
    assert.ok(
      section.includes('2.1.153'),
      'plugin README $claude-workflow section must cite the v2.1.153 version floor',
    );
  });

  it('plugin README Current v1 scope section says "Thirteen skills"', () => {
    const content = readFileSync(PLUGIN_README, 'utf8');
    const match = content.match(/^## Current v1 scope\b[\s\S]*?(?=^## )/m);
    assert.ok(match, 'plugin README must have a "## Current v1 scope" section');
    assert.ok(
      match[0].includes('Thirteen skills'),
      'plugin README ## Current v1 scope must say "Thirteen skills" (updated from Twelve skills)',
    );
  });

  it('plugin README Direct dispatcher usage section mentions the workflow subcommand', () => {
    const content = readFileSync(PLUGIN_README, 'utf8');
    assert.ok(
      content.includes('cc.mjs workflow'),
      'plugin README must document "cc.mjs workflow" in the Direct dispatcher usage section',
    );
  });
});

describe('$claude-workflow documentation — marketplace README (Plan 0008 T5)', () => {
  it('marketplace README Skills section lists $claude-workflow', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    const match = content.match(/^## Skills\b[\s\S]*?(?=^## )/m);
    assert.ok(match, 'marketplace README must have a "## Skills" section');
    assert.ok(
      match[0].includes('$claude-workflow'),
      'marketplace README Skills section must list $claude-workflow',
    );
  });

  it('marketplace README contains "### $claude-workflow" subsection', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    assert.ok(
      content.includes('### $claude-workflow'),
      'marketplace README must contain a "### $claude-workflow" subsection',
    );
  });

  it('marketplace README $claude-workflow subsection mentions approval flow ("claude attach")', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    const idx = content.indexOf('### $claude-workflow');
    assert.ok(idx !== -1, 'marketplace README must contain a "### $claude-workflow" subsection');
    const after = content.slice(idx);
    const nextHeading = after.indexOf('\n## ', 1);
    const section = nextHeading !== -1 ? after.slice(0, nextHeading) : after;
    assert.ok(
      section.includes('claude attach'),
      'marketplace README $claude-workflow subsection must mention "claude attach" for the approval flow',
    );
  });

  it('marketplace README $claude-workflow subsection mentions the version floor (v2.1.153)', () => {
    const content = readFileSync(MARKETPLACE_README, 'utf8');
    const idx = content.indexOf('### $claude-workflow');
    assert.ok(idx !== -1, 'marketplace README must contain a "### $claude-workflow" subsection');
    const after = content.slice(idx);
    const nextHeading = after.indexOf('\n## ', 1);
    const section = nextHeading !== -1 ? after.slice(0, nextHeading) : after;
    assert.ok(
      section.includes('2.1.153'),
      'marketplace README $claude-workflow subsection must cite the v2.1.153 version floor',
    );
  });
});
