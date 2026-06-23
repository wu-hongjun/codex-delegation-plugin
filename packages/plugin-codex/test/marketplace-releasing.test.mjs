// Static-validation tests for the consolidated release checklist — Plan 0006 T11
//
// These tests lock the shape of documentation/RELEASING.md as the canonical
// release-day checklist. T11 reorganises content contributed by T4–T10 and
// adds Prerequisites + CI Verification + Tagging + Post-release sections.
//
// The tests verify:
//   - Required headings appear in the canonical release-day order.
//   - Each section contains the commands and rules contributed by its source
//     T-task (Version Bump → T10, Packaging → T4+T5+T9.5, Smoke Test → T9,
//     etc.).
//   - The checklist is scoped to the local marketplace (no external registry
//     submission language) and the smoke helper is not invoked by CI.
//   - The T9.5 runtime-packaging lesson is preserved (ERR_MODULE_NOT_FOUND
//     guard + bundled-deps invariant).
//   - The T8 uninstall ordering and cache-breadcrumb fact are preserved.
//   - No OQ4 forbidden cost-claim tokens and no Plan 0004 benchmark
//     vocabulary appear in the file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
// packages/plugin-codex/test/ -> up 3 levels to repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');

const RELEASING_MD = resolve(REPO_ROOT, 'documentation', 'RELEASING.md');

// ---------- skill names ----------

const SKILL_NAMES = [
  'claude-setup',
  'claude-delegate',
  'claude-status',
  'claude-wait',
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
  'claude-workflows',
  'claude-skills',
  'claude-upgrade',
];

// ---------- forbidden tokens (shared with T6/T7/T8/T9/T10) ----------

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

// ---------- required headings in canonical release-day order ----------
//
// These are the load-bearing sections of the release checklist. They must
// appear in this exact order in RELEASING.md so a maintainer reading from
// top to bottom walks the release flow correctly. Other sections (Install /
// Upgrade / Uninstall procedures, Troubleshooting) may appear before or
// after but must not break the ordering of the canonical list.
const REQUIRED_HEADINGS_IN_ORDER = [
  '## Prerequisites',
  '## Version Bump',
  '## Packaging',
  '## Smoke Test',
  '## CI Verification',
  '## Tagging',
  '## Post-release',
];

// ==========================================================================
// Plan 0006 T11 — consolidated release checklist
// ==========================================================================

describe('consolidated release checklist (Plan 0006 T11)', () => {
  // ========================================================================
  // T11-1: RELEASING.md exists and is non-empty
  // ========================================================================

  it('documentation/RELEASING.md exists and is non-empty', () => {
    assert.ok(existsSync(RELEASING_MD), `RELEASING.md not found at ${RELEASING_MD}`);
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.ok(content.length > 0, 'RELEASING.md is empty');
  });

  // ========================================================================
  // T11-2: required headings appear in canonical release-day order
  // ========================================================================

  it('required headings appear in canonical release-day order', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    let lastIndex = -1;
    let lastHeading = '<start of file>';
    for (const heading of REQUIRED_HEADINGS_IN_ORDER) {
      // Match the heading at the start of a line. The heading may be followed
      // by additional context in the same line (e.g., "## Version Bump (Plan
      // 0006 T10)"), so we anchor on the heading prefix.
      const regex = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s.*)?$`, 'm');
      const match = content.search(regex);
      assert.ok(
        match !== -1,
        `RELEASING.md must contain heading "${heading}" (case-sensitive, line-anchored)`,
      );
      assert.ok(
        match > lastIndex,
        `RELEASING.md heading "${heading}" must appear AFTER "${lastHeading}" (got index ${match} vs prior ${lastIndex})`,
      );
      lastIndex = match;
      lastHeading = heading;
    }
  });

  // ========================================================================
  // T11-3: Version Bump section content
  // ========================================================================

  it('Version Bump section names source manifest + commands + semver + tag format + workspace decoupling', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.ok(
      content.includes('packages/plugin-codex/.codex-plugin/plugin.json'),
      'Version Bump section must name the source-of-truth manifest path',
    );
    assert.match(
      content,
      /node tools\/package-marketplace\.mjs --write/,
      'Version Bump section must mention `node tools/package-marketplace.mjs --write`',
    );
    assert.match(
      content,
      /node tools\/package-marketplace\.mjs --check/,
      'Version Bump section must mention `node tools/package-marketplace.mjs --check`',
    );
    assert.match(content, /semver/i, 'Version Bump section must mention semver');
    assert.match(
      content,
      /`v0\.[xX]\.[yY]`|`v0\.\d+\.\d+`|v0\.[xX]\.[yY]/,
      'Version Bump section must document the `v0.x.y` tag format',
    );
    assert.match(
      content,
      /workspace.*0\.0\.0|0\.0\.0.*workspace|decoupled/i,
      'Version Bump section must document workspace `0.0.0` decoupling',
    );
  });

  // ========================================================================
  // T11-4: Packaging section content (T4+T5+T9.5)
  // ========================================================================

  it('Packaging section includes package-marketplace commands + marketplace path', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /node tools\/package-marketplace\.mjs --write/,
      'Packaging section must include `package-marketplace --write`',
    );
    assert.match(
      content,
      /node tools\/package-marketplace\.mjs --check/,
      'Packaging section must include `package-marketplace --check`',
    );
    assert.match(
      content,
      /marketplace\/plugins\/cc/,
      'Packaging section must reference the marketplace plugin path',
    );
  });

  // ========================================================================
  // T11-5: Packaging section preserves T9.5 runtime-packaging lesson
  // ========================================================================

  it('Packaging section preserves T9.5 runtime-packaging lesson', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /ERR_MODULE_NOT_FOUND/,
      'Packaging section must mention `ERR_MODULE_NOT_FOUND` as the regression signal',
    );
    assert.match(
      content,
      /bundled|self-contained/i,
      'Packaging section must describe the bundled / self-contained cache requirement',
    );
    assert.match(
      content,
      /scripts\/cc\.mjs setup/,
      'Packaging section must reference the dispatcher setup command as the cache-execution probe',
    );
  });

  // ========================================================================
  // T11-6: Smoke Test section enumerates all 17 skills + gate criterion
  // ========================================================================

  it('Smoke Test section enumerates all 17 skills with $claude-setup as gate (ok/warn)', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    for (const name of SKILL_NAMES) {
      assert.ok(content.includes(`$${name}`), `Smoke Test section must enumerate skill $${name}`);
    }
    assert.match(
      content,
      /\$claude-setup[\s\S]*?gate/i,
      'Smoke Test section must name $claude-setup as the gate skill',
    );
    assert.match(
      content,
      /`ok`\s+or\s+`warn`/,
      'Smoke Test section must specify `ok` or `warn` aggregate as the pass criterion',
    );
  });

  // ========================================================================
  // T11-7: CI Verification section includes all local gates
  // ========================================================================

  it('CI Verification section includes all local gates + Actions matrix', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    const requiredGates = [
      'npm run lint',
      'npm run typecheck',
      'npm run format',
      'npm test',
      'npm run test:attach',
      'npm run test:bench',
    ];
    for (const gate of requiredGates) {
      assert.ok(content.includes(gate), `CI Verification section must list local gate \`${gate}\``);
    }
    assert.match(
      content,
      /ubuntu-latest|macos-latest/i,
      'CI Verification section must mention the GitHub Actions matrix OS legs',
    );
    assert.match(
      content,
      /Node\s*20|Node\s*22/i,
      'CI Verification section must mention the Node 20 + Node 22 matrix',
    );
    assert.match(
      content,
      /green|success|all four matrix legs/i,
      'CI Verification section must require all matrix legs green before tagging',
    );
  });

  // ========================================================================
  // T11-8: Tagging section requires smoke + CI before tag + has v0.3.18 example
  // ========================================================================

  it('Tagging section gates on smoke + CI and shows v0.3.18 example', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /git tag v0\.[xX]\.[yY]|git tag v0\.\d+\.\d+/,
      'Tagging section must include the `git tag v0.x.y` command pattern',
    );
    assert.ok(
      content.includes('v0.3.18'),
      'Tagging section must include the current example tag `v0.3.18`',
    );
    assert.match(
      content,
      /(after|once).*(smoke|CI)[\s\S]*?(CI|smoke|green|pass)/i,
      'Tagging section must require smoke + CI to pass before tagging',
    );
  });

  // ========================================================================
  // T11-9: Post-release section exists with concrete actions
  // ========================================================================

  it('Post-release section exists with at least one concrete action', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    // Lazy-match the Post-release section body up to the next `## ` heading.
    // RELEASING.md always has a Troubleshooting / Install / Upgrade /
    // Uninstall section after Post-release, so the next-heading anchor
    // always exists in the current layout.
    const match = content.match(/^## Post-release[\s\S]*?(?=^## )/m);
    assert.ok(match, 'RELEASING.md must contain a `## Post-release` section');
    const body = match[0];
    assert.match(
      body,
      /git ls-remote --tags/,
      'Post-release section should verify tag visibility on the remote',
    );
  });

  // ========================================================================
  // T11-10: smoke helper is NOT invoked from CI (matches T9-17 invariant)
  // ========================================================================

  it('RELEASING.md does not instruct running the smoke helper in CI', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    // Negative invariant — the file should NOT say "CI runs the smoke helper"
    // or any variant that would make CI a real-codex gate.
    assert.doesNotMatch(
      content,
      /CI (?:runs|invokes|executes) (?:the )?smoke/i,
      'RELEASING.md must not document running the smoke helper from CI — CI does not have a real codex CLI',
    );
    // Positive invariant — the file should state the smoke helper is NOT a
    // CI gate (T9-17 equivalent at the doc level).
    assert.match(
      content,
      /not (?:invoked )?(?:by|part of) CI|not.*CI gate|smoke.*release-time/i,
      'RELEASING.md must state that the smoke helper is not a CI gate',
    );
  });

  // ========================================================================
  // T11-11: scope is local marketplace; no external registry submission
  // ========================================================================

  it('RELEASING.md scope is local marketplace; no external registry submission language', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /local[- ]marketplace|local\s+`marketplace\/`|`marketplace\/`.*?repo|local marketplace/i,
      'RELEASING.md must explicitly scope to the local marketplace at `marketplace/`',
    );
    assert.match(
      content,
      /out of scope|not in scope|future plan/i,
      'RELEASING.md must mark external registry / hosted marketplace as out of scope',
    );
    // Negative: must not contain language that suggests publishing to an
    // external registry (npm publish, marketplace.openai.com, etc.).
    assert.doesNotMatch(
      content,
      /\bnpm publish\b/,
      'RELEASING.md must not contain `npm publish` (external registry submission is out of scope)',
    );
  });

  // ========================================================================
  // T11-12: Uninstall ordering preserved (T8): plugin remove FIRST, marketplace second
  // ========================================================================

  it('Uninstall procedure preserves T8 ordering (plugin remove FIRST, marketplace second)', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    const removeIdx = content.indexOf('codex plugin remove "cc@cc-plugin-codex-local"');
    const marketplaceRemoveIdx = content.indexOf(
      'codex plugin marketplace remove "cc-plugin-codex-local"',
    );
    assert.ok(removeIdx > 0, 'RELEASING.md must contain `codex plugin remove`');
    assert.ok(
      marketplaceRemoveIdx > 0,
      'RELEASING.md must contain `codex plugin marketplace remove`',
    );
    assert.ok(
      removeIdx < marketplaceRemoveIdx,
      `Uninstall ordering: plugin remove must appear BEFORE marketplace remove in RELEASING.md (got plugin-remove@${removeIdx}, marketplace-remove@${marketplaceRemoveIdx})`,
    );
  });

  // ========================================================================
  // T11-13: Uninstall section documents empty-cache-breadcrumb fact (T8)
  // ========================================================================

  it('Uninstall section documents that empty cache breadcrumb directories may remain', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    assert.match(
      content,
      /(empty\s+(?:cache\s+)?breadcrumb|breadcrumb\s+(?:directories|directory))/i,
      'RELEASING.md must document the empty-cache-breadcrumb-may-remain fact from T8',
    );
  });

  // ========================================================================
  // T11-14: No OQ4 forbidden cost-claim tokens
  // ========================================================================

  it('RELEASING.md contains no OQ4 forbidden cost-claim tokens', () => {
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
  // T11-15: No Plan 0004 benchmark/cutover vocabulary
  // ========================================================================

  it('RELEASING.md contains no Plan 0004 benchmark/cutover vocabulary', () => {
    const content = readFileSync(RELEASING_MD, 'utf8');
    for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
      assert.equal(
        content.includes(token),
        false,
        `RELEASING.md contains forbidden Plan 0004 benchmark/cutover token: "${token}"`,
      );
    }
  });
});
