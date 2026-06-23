// Static-validation tests for the plugin manifest and five Codex skill files — T11
//
// These tests do NOT spawn processes. They verify file existence, JSON structure,
// YAML frontmatter correctness, and the absence of forbidden tokens/scopes.
//
// Pattern mirrors dispatcher.test.mjs: node:test + node:assert/strict, ESM.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(here, '..', '..');
// PLUGIN_ROOT = packages/plugin-codex/

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

/** Subcommand each skill must reference in its body. */
const SKILL_SUBCOMMANDS = {
  'claude-setup': 'setup',
  'claude-delegate': 'delegate',
  'claude-status': 'status',
  'claude-wait': 'wait',
  'claude-result': 'result',
  'claude-stop': 'stop',
  'claude-followup': 'followup',
  'claude-review': 'review',
  'claude-adversarial-review': 'adversarial-review',
  'claude-workflow': 'workflow',
  'claude-goal': 'goal',
  'claude-fork': 'fork',
  'claude-batch': 'batch',
  'claude-deep-research': 'deep-research',
  'claude-workflows': 'workflows',
  'claude-skills': 'skills',
  'claude-upgrade': 'upgrade',
};

function skillPath(name) {
  return join(PLUGIN_ROOT, 'skills', name, 'SKILL.md');
}

function manifestPath() {
  return join(PLUGIN_ROOT, '.codex-plugin', 'plugin.json');
}

function readManifest() {
  return JSON.parse(readFileSync(manifestPath(), 'utf8'));
}

/**
 * Tiny inline frontmatter parser — no yaml dependency.
 * Returns an object of key→value from the first YAML block, or null if absent.
 * Values have surrounding single/double quotes stripped.
 */
function parseFrontmatter(body) {
  const m = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line
      .slice(i + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

/**
 * Tokens / patterns that must never appear in skill files or the manifest.
 * Tightened to cover OQ4 disallowed phrasings + obvious quantitative-claim shapes.
 */
const FORBIDDEN_TOKENS = [
  'claude -p',
  'node-pty',
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

/** Regex patterns banned by OQ4 (quantitative claims, percentage savings, etc.). */
const FORBIDDEN_PATTERNS = [
  /\b\d+%\s*(faster|cheaper|less)/i,
  /\b\d+x\s*(faster|cheaper)/i,
  /save[sd]?\s+\d+/i,
];

// ---------- Manifest tests ----------

describe('plugin.json exists and is readable', () => {
  it('plugin.json file exists at .codex-plugin/plugin.json', () => {
    assert.ok(existsSync(manifestPath()), `plugin.json not found at ${manifestPath()}`);
  });
});

describe('plugin.json parses as valid JSON', () => {
  it('readFileSync + JSON.parse does not throw', () => {
    assert.doesNotThrow(() => readManifest(), `${manifestPath()} is not valid JSON`);
  });
});

describe('plugin.json.name', () => {
  it('equals "cc"', () => {
    const manifest = readManifest();
    assert.equal(manifest.name, 'cc', `expected name "cc", got "${manifest.name}"`);
  });
});

describe('plugin.json.version', () => {
  it('is a non-empty string', () => {
    const manifest = readManifest();
    assert.equal(typeof manifest.version, 'string', 'version must be a string');
    assert.ok(manifest.version.length > 0, 'version must be non-empty');
  });

  it('is exactly "0.3.15"', () => {
    const manifest = readManifest();
    assert.equal(
      manifest.version,
      '0.3.15',
      `expected version "0.3.15", got "${manifest.version}"`,
    );
  });
});

describe('plugin.json.description', () => {
  it('is a non-empty string that contains no forbidden cost-claim phrases', () => {
    const manifest = readManifest();
    assert.equal(typeof manifest.description, 'string', 'description must be a string');
    assert.ok(manifest.description.length > 0, 'description must be non-empty');
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(
        manifest.description.includes(token),
        false,
        `plugin.json description contains forbidden token "${token}"`,
      );
    }
  });
});

describe('plugin.json.skills', () => {
  it('equals "./skills/"', () => {
    const manifest = readManifest();
    assert.equal(
      manifest.skills,
      './skills/',
      `expected skills field "./skills/", got "${manifest.skills}"`,
    );
  });
});

describe('plugin.json.author', () => {
  it('author.name exists and is a non-empty string', () => {
    const manifest = readManifest();
    assert.equal(typeof manifest.author?.name, 'string', 'author.name must be a string');
    assert.ok(manifest.author.name.length > 0, 'author.name must be non-empty');
  });

  it('author.url exists and is a non-empty string', () => {
    const manifest = readManifest();
    assert.equal(typeof manifest.author?.url, 'string', 'author.url must be a string');
    assert.ok(manifest.author.url.length > 0, 'author.url must be non-empty');
  });
});

describe('plugin.json.interface.displayName and category', () => {
  it('interface.displayName exists and is a non-empty string', () => {
    const manifest = readManifest();
    assert.equal(
      typeof manifest.interface?.displayName,
      'string',
      'interface.displayName must be a string',
    );
    assert.ok(manifest.interface.displayName.length > 0, 'interface.displayName must be non-empty');
  });

  it('interface.category exists and is a non-empty string', () => {
    const manifest = readManifest();
    assert.equal(
      typeof manifest.interface?.category,
      'string',
      'interface.category must be a string',
    );
    assert.ok(manifest.interface.category.length > 0, 'interface.category must be non-empty');
  });
});

describe('plugin.json.interface.brandColor', () => {
  it('is exactly "#D97706"', () => {
    const manifest = readManifest();
    assert.equal(
      manifest.interface?.brandColor,
      '#D97706',
      `expected interface.brandColor "#D97706", got "${manifest.interface?.brandColor}"`,
    );
  });
});

describe('plugin.json.interface.capabilities', () => {
  it('includes "Interactive"', () => {
    const manifest = readManifest();
    assert.ok(
      Array.isArray(manifest.interface?.capabilities),
      'interface.capabilities must be an array',
    );
    assert.ok(
      manifest.interface.capabilities.includes('Interactive'),
      `expected "Interactive" in capabilities; got: ${JSON.stringify(manifest.interface.capabilities)}`,
    );
  });
});

describe('plugin.json.interface.defaultPrompt', () => {
  it('is a non-empty array of strings', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(dp.length > 0, 'interface.defaultPrompt must be non-empty');
    for (const item of dp) {
      assert.equal(
        typeof item,
        'string',
        `each defaultPrompt entry must be a string; got ${typeof item}`,
      );
    }
  });

  it('has at least 6 entries (one per skill including claude-followup)', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.length >= 6,
      `interface.defaultPrompt must have at least 6 entries; got ${dp.length}`,
    );
  });

  it('contains a follow-up-flavored sentence for the claude-followup skill', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.some((s) => /follow-?up/i.test(s)),
      `interface.defaultPrompt must contain a sentence mentioning "follow-up" (for the claude-followup skill); got: ${JSON.stringify(dp)}`,
    );
  });
});

// ---------- Skill directory / file existence ----------

describe('all skill directories and SKILL.md files exist', () => {
  for (const name of SKILL_NAMES) {
    it(`skills/${name}/SKILL.md exists`, () => {
      assert.ok(existsSync(skillPath(name)), `SKILL.md not found at ${skillPath(name)}`);
    });
  }
});

// ---------- Frontmatter tests ----------

describe('each SKILL.md has valid YAML frontmatter with name and description', () => {
  for (const name of SKILL_NAMES) {
    it(`${name}: frontmatter parses; name matches directory; description is non-empty`, () => {
      const body = readFileSync(skillPath(name), 'utf8');

      // Must start with ---
      const firstNonEmpty = body.split('\n').find((l) => l.trim().length > 0) ?? '';
      assert.equal(
        firstNonEmpty.trim(),
        '---',
        `${name}: SKILL.md must start with YAML frontmatter delimiter "---"`,
      );

      const fm = parseFrontmatter(body);
      assert.ok(fm !== null, `${name}: could not parse YAML frontmatter`);

      // name: must match directory name
      assert.equal(
        fm.name,
        name,
        `${name}: frontmatter "name" field is "${fm.name}", expected "${name}"`,
      );

      // description: must be non-empty string
      assert.ok(
        typeof fm.description === 'string' && fm.description.length > 0,
        `${name}: frontmatter "description" must be a non-empty string`,
      );
    });
  }
});

/**
 * Strict frontmatter parse. Mirrors what Codex's stricter YAML parser does for the
 * simple `key: scalar` lines we ship: each line must be `key: value` with `value`
 * either quoted, or unquoted and free of `: ` (which YAML treats as a new mapping)
 * and `#` (which YAML treats as a comment marker). Throws on the first offending line.
 */
function strictParseFrontmatter(body) {
  const m = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter block');
  const out = {};
  for (const line of m[1].split('\n')) {
    if (line.trim().length === 0) continue;
    const km = line.match(/^([a-z][a-z0-9_-]*):\s+(.+)$/);
    if (!km) throw new Error(`unparseable frontmatter line: "${line}"`);
    const [, key, raw] = km;
    const quoted = /^".*"$/.test(raw) || /^'.*'$/.test(raw);
    if (!quoted) {
      if (raw.includes(': ')) {
        throw new Error(
          `unquoted ": " in scalar value for "${key}": Codex's YAML parser treats this as a nested mapping. Quote the value or remove the inner colon.`,
        );
      }
      if (raw.includes(' #') || raw.startsWith('#')) {
        throw new Error(
          `unquoted "#" in scalar value for "${key}": YAML treats this as a comment marker.`,
        );
      }
    }
    out[key] = raw.replace(/^['"]|['"]$/g, '');
  }
  return out;
}

describe('each SKILL.md frontmatter is parseable by a strict YAML reader (Codex compatibility)', () => {
  for (const name of SKILL_NAMES) {
    it(`${name}: strict frontmatter parse does not throw`, () => {
      const body = readFileSync(skillPath(name), 'utf8');
      let fm;
      assert.doesNotThrow(() => {
        fm = strictParseFrontmatter(body);
      }, `${name}: strict YAML frontmatter parse failed`);
      assert.equal(fm.name, name, `${name}: strict-parsed name should match directory`);
      assert.ok(
        typeof fm.description === 'string' && fm.description.length > 0,
        `${name}: strict-parsed description must be non-empty`,
      );
    });
  }
});

// ---------- Body content tests ----------

describe('each SKILL.md references scripts/cc.mjs', () => {
  for (const name of SKILL_NAMES) {
    it(`${name}: body contains "scripts/cc.mjs"`, () => {
      const body = readFileSync(skillPath(name), 'utf8');
      assert.ok(
        body.includes('scripts/cc.mjs'),
        `${name}: SKILL.md does not reference "scripts/cc.mjs"`,
      );
    });
  }
});

describe('each SKILL.md references its own subcommand', () => {
  for (const name of SKILL_NAMES) {
    it(`${name}: body contains subcommand "${SKILL_SUBCOMMANDS[name]}"`, () => {
      const body = readFileSync(skillPath(name), 'utf8');
      const sub = SKILL_SUBCOMMANDS[name];
      assert.ok(body.includes(sub), `${name}: SKILL.md body does not contain subcommand "${sub}"`);
    });
  }
});

// ---------- claude-delegate --yes auto-injection guard ----------

describe('claude-delegate/SKILL.md does not auto-inject --yes on dispatcher run lines', () => {
  it('no line containing both "cc.mjs" and "delegate" also contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-delegate'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('delegate'))
      .filter((line) => line.includes(' --yes'));

    assert.equal(
      offendingLines.length,
      0,
      `claude-delegate/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

// ---------- claude-followup --yes auto-injection guard ----------

describe('claude-followup/SKILL.md does not auto-inject --yes on dispatcher run lines', () => {
  it('no line containing both "cc.mjs" and "followup" also contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-followup'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('followup'))
      .filter((line) => line.includes(' --yes'));

    assert.equal(
      offendingLines.length,
      0,
      `claude-followup/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

// ---------- Forbidden token sweep across all skill files ----------

describe('no forbidden tokens appear in any SKILL.md', () => {
  for (const name of SKILL_NAMES) {
    for (const token of FORBIDDEN_TOKENS) {
      it(`${name}: does not contain forbidden token "${token}"`, () => {
        const body = readFileSync(skillPath(name), 'utf8');
        assert.equal(
          body.includes(token),
          false,
          `${name}/SKILL.md contains forbidden token "${token}"`,
        );
      });
    }
  }
});

describe('no quantitative cost-claim patterns appear in any SKILL.md or the manifest', () => {
  const targets = [
    ...SKILL_NAMES.map((n) => ({ label: `${n}/SKILL.md`, path: skillPath(n) })),
    { label: 'plugin.json', path: manifestPath() },
  ];
  for (const target of targets) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      it(`${target.label}: does not match forbidden pattern ${pattern}`, () => {
        const body = readFileSync(target.path, 'utf8');
        assert.equal(
          pattern.test(body),
          false,
          `${target.label} matches forbidden pattern ${pattern}`,
        );
      });
    }
  }
});

// ---------- Scope discipline: no out-of-scope files ----------

describe('no hooks.json at package root', () => {
  it('hooks.json does not exist in packages/plugin-codex/', () => {
    assert.equal(
      existsSync(join(PLUGIN_ROOT, 'hooks.json')),
      false,
      'hooks.json must not exist in packages/plugin-codex/',
    );
  });

  it('hooks/ directory does not exist in packages/plugin-codex/', () => {
    assert.equal(
      existsSync(join(PLUGIN_ROOT, 'hooks')),
      false,
      'hooks/ directory must not exist in packages/plugin-codex/',
    );
  });
});

describe('review skill directories exist (T8 additions)', () => {
  it('skills/claude-review/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-review')),
      'skills/claude-review/ directory must exist',
    );
  });

  it('skills/claude-adversarial-review/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-adversarial-review')),
      'skills/claude-adversarial-review/ directory must exist',
    );
  });
});

describe('no .codex-marketplace config file exists', () => {
  it('.codex-marketplace.json does not exist in packages/plugin-codex/', () => {
    assert.equal(
      existsSync(join(PLUGIN_ROOT, '.codex-marketplace.json')),
      false,
      '.codex-marketplace.json must not exist in packages/plugin-codex/',
    );
  });

  it('.codex-marketplace does not exist (directory variant)', () => {
    assert.equal(
      existsSync(join(PLUGIN_ROOT, '.codex-marketplace')),
      false,
      '.codex-marketplace must not exist in packages/plugin-codex/',
    );
  });
});

// ---------- Manifest forbidden token sweep (any depth) ----------

describe('plugin.json contains no forbidden tokens at any depth', () => {
  for (const token of FORBIDDEN_TOKENS) {
    it(`manifest JSON does not contain "${token}"`, () => {
      const raw = readFileSync(manifestPath(), 'utf8');
      // Parse to canonical form to catch tokens split across formatting whitespace,
      // then also check the raw file in case the token straddles a newline.
      const serialized = JSON.stringify(JSON.parse(raw));
      assert.equal(
        serialized.includes(token),
        false,
        `plugin.json (serialized) contains forbidden token "${token}"`,
      );
      assert.equal(
        raw.includes(token),
        false,
        `plugin.json (raw) contains forbidden token "${token}"`,
      );
    });
  }
});

// ---------- v0.2.0: cost-savings / benchmark heuristic scan on manifest string fields ----------

/**
 * Tokens that must not appear in manifest JSON string values (case-insensitive).
 * These legitimately appear in tests/docs but are banned from manifest content.
 */
const MANIFEST_COST_BENCHMARK_TOKENS = ['benchmark', 'cost saving', 'saves', 'cheaper', 'faster'];

describe('plugin.json string fields contain no cost-savings or benchmark claims (v0.2.0)', () => {
  /**
   * Walk all string values in a parsed JSON object (recursively).
   * Returns an array of { path, value } for each string leaf.
   */
  function collectStringValues(obj, path = '') {
    const results = [];
    if (typeof obj === 'string') {
      results.push({ path, value: obj });
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => results.push(...collectStringValues(item, `${path}[${i}]`)));
    } else if (obj !== null && typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        results.push(...collectStringValues(val, path ? `${path}.${key}` : key));
      }
    }
    return results;
  }

  for (const token of MANIFEST_COST_BENCHMARK_TOKENS) {
    it(`no string field contains "${token}" (case-insensitive)`, () => {
      const manifest = readManifest();
      const stringFields = collectStringValues(manifest);
      const offending = stringFields.filter(({ value }) =>
        value.toLowerCase().includes(token.toLowerCase()),
      );
      assert.equal(
        offending.length,
        0,
        `plugin.json string field(s) contain banned token "${token}": ${offending.map(({ path, value }) => `${path}="${value}"`).join(', ')}`,
      );
    });
  }
});

// ---------- T8: review skills — per-skill guards ----------

const APPROVED_USAGE_NOTICE =
  'This skill sends an additional prompt through Claude Code and may count toward your Claude Code usage.';

describe('claude-review/SKILL.md: approved usage notice is present verbatim', () => {
  it('contains the exact approved usage notice', () => {
    const body = readFileSync(skillPath('claude-review'), 'utf8');
    assert.ok(
      body.includes(APPROVED_USAGE_NOTICE),
      `claude-review/SKILL.md is missing the exact approved usage notice: "${APPROVED_USAGE_NOTICE}"`,
    );
  });
});

describe('claude-adversarial-review/SKILL.md: approved usage notice is present verbatim', () => {
  it('contains the exact approved usage notice', () => {
    const body = readFileSync(skillPath('claude-adversarial-review'), 'utf8');
    assert.ok(
      body.includes(APPROVED_USAGE_NOTICE),
      `claude-adversarial-review/SKILL.md is missing the exact approved usage notice: "${APPROVED_USAGE_NOTICE}"`,
    );
  });
});

describe('neither review skill contains "incurs API usage"', () => {
  for (const name of ['claude-review', 'claude-adversarial-review']) {
    it(`${name}: does not contain "incurs API usage"`, () => {
      const body = readFileSync(skillPath(name), 'utf8');
      assert.equal(
        body.includes('incurs API usage'),
        false,
        `${name}/SKILL.md contains forbidden phrase "incurs API usage"`,
      );
    });
  }
});

describe('claude-review/SKILL.md: --yes auto-injection guard', () => {
  it('no dispatcher run line for "review" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-review'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes(' review'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-review/SKILL.md auto-injects "--yes" on a dispatcher run line:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-adversarial-review/SKILL.md: --yes auto-injection guard', () => {
  it('no dispatcher run line for "adversarial-review" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-adversarial-review'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('adversarial-review'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-adversarial-review/SKILL.md auto-injects "--yes" on a dispatcher run line:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-adversarial-review/SKILL.md: no empty-prompt sequence on run line', () => {
  it('dispatcher run line does not contain "-- \\"\\""  or bare "--" at end of line', () => {
    const body = readFileSync(skillPath('claude-adversarial-review'), 'utf8');
    // Check each line that invokes the dispatcher
    const runLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('adversarial-review'));
    for (const line of runLines) {
      // Must not end with bare "--" (optionally followed by whitespace)
      assert.equal(
        /--\s*$/.test(line),
        false,
        `claude-adversarial-review/SKILL.md: dispatcher run line ends with bare "--": ${line}`,
      );
      // Must not contain '-- ""' (empty-prompt sequence)
      assert.equal(
        line.includes('-- ""'),
        false,
        `claude-adversarial-review/SKILL.md: dispatcher run line contains empty-prompt sequence '-- ""': ${line}`,
      );
      // Must not contain "-- ''" (single-quoted variant)
      assert.equal(
        line.includes("-- ''"),
        false,
        `claude-adversarial-review/SKILL.md: dispatcher run line contains empty-prompt sequence "-- ''": ${line}`,
      );
    }
  });
});

describe('plugin.json interface.defaultPrompt contains verbatim T8 entries', () => {
  it('includes "Review the output of a Claude job."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Review the output of a Claude job.'),
      `interface.defaultPrompt must contain "Review the output of a Claude job."; got: ${JSON.stringify(dp)}`,
    );
  });

  it('includes "Get an independent second-opinion review of a Claude job."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Get an independent second-opinion review of a Claude job.'),
      `interface.defaultPrompt must contain "Get an independent second-opinion review of a Claude job."; got: ${JSON.stringify(dp)}`,
    );
  });

  it('still contains the original 4 pre-T8 entries', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    const originals = [
      'Set up CC.',
      'Delegate a task to Claude Code.',
      'Check my Claude jobs.',
      'Show the result of a Claude job.',
    ];
    for (const entry of originals) {
      assert.ok(
        dp.includes(entry),
        `interface.defaultPrompt is missing original entry "${entry}"; got: ${JSON.stringify(dp)}`,
      );
    }
  });

  it('has at least 17 entries after wait addition', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.length >= 17,
      `interface.defaultPrompt must have at least 17 entries; got ${dp.length}`,
    );
  });
});

describe('plugin.json.interface.defaultPrompt length is exactly 17 (adds claude-wait)', () => {
  it('array length equals 17', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.equal(
      dp.length,
      17,
      `interface.defaultPrompt must have exactly 17 entries; got ${dp.length}`,
    );
  });
});

// ---------- T4: claude-workflow skill guards ----------

describe('claude-workflow skill directory and SKILL.md exist', () => {
  it('skills/claude-workflow/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-workflow')),
      'skills/claude-workflow/ directory must exist',
    );
  });

  it('skills/claude-workflow/SKILL.md exists', () => {
    assert.ok(
      existsSync(skillPath('claude-workflow')),
      `SKILL.md not found at ${skillPath('claude-workflow')}`,
    );
  });
});

describe('claude-workflow/SKILL.md: run line invokes dispatcher with "workflow" subcommand', () => {
  it('body contains "cc.mjs" and "workflow"', () => {
    const body = readFileSync(skillPath('claude-workflow'), 'utf8');
    assert.ok(body.includes('cc.mjs'), 'claude-workflow/SKILL.md must reference scripts/cc.mjs');
    assert.ok(
      body.includes('workflow'),
      'claude-workflow/SKILL.md must reference the "workflow" subcommand',
    );
  });
});

describe('claude-workflow/SKILL.md: --yes auto-injection guard', () => {
  it('no dispatcher run line for "workflow" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-workflow'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('workflow'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-workflow/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-workflow/SKILL.md: --allow-edit is not referenced in run lines', () => {
  it('no dispatcher run line contains "--allow-edit"', () => {
    const body = readFileSync(skillPath('claude-workflow'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs'))
      .filter((line) => line.includes('--allow-edit'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-workflow/SKILL.md references "--allow-edit" on a dispatcher run line, which is not applicable:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains workflow entry', () => {
  it('includes "Run a Claude Code dynamic workflow (multi-step, plan + execute)."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Run a Claude Code dynamic workflow (multi-step, plan + execute).'),
      `interface.defaultPrompt must contain "Run a Claude Code dynamic workflow (multi-step, plan + execute)."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('no unexpected review-adjacent skill directories exist', () => {
  it('skills/ does not contain any review-adjacent dir beyond claude-review and claude-adversarial-review', () => {
    const skillsDir = join(PLUGIN_ROOT, 'skills');
    if (!existsSync(skillsDir)) return;
    const entries = readdirSync(skillsDir);
    const unexpected = entries.filter((e) => {
      // Allow the two sanctioned review skills
      if (e === 'claude-review' || e === 'claude-adversarial-review') return false;
      // Flag anything else that looks review-adjacent
      return /review|critic/i.test(e);
    });
    assert.equal(
      unexpected.length,
      0,
      `Unexpected review-adjacent skill directories found: ${unexpected.join(', ')}`,
    );
  });
});

// ---------- T6: OQ-C defaultPrompt rewrites (entries #6-#9) ----------

describe('plugin.json interface.defaultPrompt: T6 OQ-C rewrites (entries #6-#9)', () => {
  it('array length is exactly 17', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.equal(
      dp.length,
      17,
      `interface.defaultPrompt must have exactly 17 entries; got ${dp.length}`,
    );
  });

  it('entry #6 is verbatim: "Send a follow-up instruction to a running Claude job."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Send a follow-up instruction to a running Claude job.'),
      `interface.defaultPrompt must contain "Send a follow-up instruction to a running Claude job."; got: ${JSON.stringify(dp)}`,
    );
  });

  it('entry #7 is verbatim: "Review the output of a Claude job."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Review the output of a Claude job.'),
      `interface.defaultPrompt must contain "Review the output of a Claude job."; got: ${JSON.stringify(dp)}`,
    );
  });

  it('entry #8 is verbatim: "Get an independent second-opinion review of a Claude job."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Get an independent second-opinion review of a Claude job.'),
      `interface.defaultPrompt must contain "Get an independent second-opinion review of a Claude job."; got: ${JSON.stringify(dp)}`,
    );
  });

  it('entry #9 is verbatim: "Run a Claude Code dynamic workflow (multi-step, plan + execute)."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Run a Claude Code dynamic workflow (multi-step, plan + execute).'),
      `interface.defaultPrompt must contain "Run a Claude Code dynamic workflow (multi-step, plan + execute)."; got: ${JSON.stringify(dp)}`,
    );
  });

  it('"follow-up" entry pairs with $claude-followup skill (substring check)', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.some((s) => s.includes('follow-up')),
      `interface.defaultPrompt must contain an entry with "follow-up" to pair with $claude-followup; got: ${JSON.stringify(dp)}`,
    );
  });

  it('"output of a Claude job" entry pairs with $claude-review skill (substring check)', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.some((s) => s.includes('output of a Claude job')),
      `interface.defaultPrompt must contain an entry with "output of a Claude job" to pair with $claude-review; got: ${JSON.stringify(dp)}`,
    );
  });

  it('"second-opinion review" entry pairs with $claude-adversarial-review skill (substring check)', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.some((s) => s.includes('second-opinion review')),
      `interface.defaultPrompt must contain an entry with "second-opinion review" to pair with $claude-adversarial-review; got: ${JSON.stringify(dp)}`,
    );
  });

  it('"multi-step, plan + execute" entry pairs with $claude-workflow skill (substring check)', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.some((s) => s.includes('multi-step, plan + execute')),
      `interface.defaultPrompt must contain an entry with "multi-step, plan + execute" to pair with $claude-workflow; got: ${JSON.stringify(dp)}`,
    );
  });
});

// ---------- T1 (Plan 0009): cross-skill chaining hints — all skills ----------

describe('each SKILL.md ends with a "Next steps" subsection (T1 Plan 0009)', () => {
  for (const name of SKILL_NAMES) {
    it(`${name}: body contains "### Next steps"`, () => {
      const body = readFileSync(skillPath(name), 'utf8');
      assert.ok(
        body.includes('### Next steps'),
        `${name}/SKILL.md is missing the "### Next steps" subsection`,
      );
    });
  }
});

describe('each SKILL.md Next steps subsection references at least one $claude-* skill (T1 Plan 0009)', () => {
  for (const name of SKILL_NAMES) {
    it(`${name}: "### Next steps" section mentions at least one $claude- skill`, () => {
      const body = readFileSync(skillPath(name), 'utf8');
      const nextStepsIdx = body.indexOf('### Next steps');
      assert.ok(nextStepsIdx !== -1, `${name}/SKILL.md missing "### Next steps" subsection`);
      const afterNextSteps = body.slice(nextStepsIdx);
      assert.ok(
        /\$claude-/.test(afterNextSteps),
        `${name}/SKILL.md "### Next steps" section does not reference any $claude-* skill`,
      );
    });
  }
});

// ---------- T2 (Plan 0009): sharpened review descriptions ----------

describe('claude-review/SKILL.md: sharpened description matches T2 wording exactly (Plan 0009)', () => {
  it('description equals the new T2 wording verbatim', () => {
    const body = readFileSync(skillPath('claude-review'), 'utf8');
    const fm = parseFrontmatter(body);
    assert.equal(
      fm.description,
      'Review the output of a Claude job by reusing its existing Claude Code session (lightweight; same-session).',
      `claude-review description does not match T2 wording; got: "${fm.description}"`,
    );
  });
});

describe('claude-adversarial-review/SKILL.md: sharpened description matches T2 wording exactly (Plan 0009)', () => {
  it('description equals the new T2 wording verbatim', () => {
    const body = readFileSync(skillPath('claude-adversarial-review'), 'utf8');
    const fm = parseFrontmatter(body);
    assert.equal(
      fm.description,
      'Run an adversarial code review of a Claude job in a fresh independent Claude Code session (thorough; eliminates confirmation bias).',
      `claude-adversarial-review description does not match T2 wording; got: "${fm.description}"`,
    );
  });
});

// ---------- T3 (Plan 0009): run-line + arg-shape consistency ----------

describe('claude-workflow/SKILL.md: run line uses -- separator (T3 Plan 0009)', () => {
  it('body contains workflow -- "<', () => {
    const body = readFileSync(skillPath('claude-workflow'), 'utf8');
    assert.ok(
      body.includes('workflow -- "<'),
      'claude-workflow/SKILL.md run line does not use the "-- \\"<" separator convention',
    );
  });
});

describe('claude-followup/SKILL.md: argument label uses <jobId-or-prefix> (T3 Plan 0009)', () => {
  it('body contains <jobId-or-prefix>', () => {
    const body = readFileSync(skillPath('claude-followup'), 'utf8');
    assert.ok(
      body.includes('<jobId-or-prefix>'),
      'claude-followup/SKILL.md does not use the <jobId-or-prefix> argument label',
    );
  });
});

// ---------- T4 (Plan 0009): followup explicit flag allow/reject lists ----------

describe('claude-followup/SKILL.md: explicit "Accepted flags" section present (T4 Plan 0009)', () => {
  it('body contains "Accepted flags (forwarded to the dispatcher):"', () => {
    const body = readFileSync(skillPath('claude-followup'), 'utf8');
    assert.ok(
      body.includes('Accepted flags (forwarded to the dispatcher):'),
      'claude-followup/SKILL.md is missing the "Accepted flags" section',
    );
  });
});

describe('claude-followup/SKILL.md: explicit "Rejected at parse time" section present (T4 Plan 0009)', () => {
  it('body contains "Rejected at parse time"', () => {
    const body = readFileSync(skillPath('claude-followup'), 'utf8');
    assert.ok(
      body.includes('Rejected at parse time'),
      'claude-followup/SKILL.md is missing the "Rejected at parse time" section',
    );
  });
});

// ---------- T5 (Plan 0009): --json / --all on lifecycle skills ----------

describe('claude-delegate/SKILL.md: mentions --json in accepted flags (T5 Plan 0009)', () => {
  it('body contains "--json"', () => {
    const body = readFileSync(skillPath('claude-delegate'), 'utf8');
    assert.ok(
      body.includes('--json'),
      'claude-delegate/SKILL.md does not mention "--json" in its accepted flags',
    );
  });
});

describe('claude-workflow/SKILL.md: mentions --json in accepted flags (T5 Plan 0009)', () => {
  it('body contains "--json"', () => {
    const body = readFileSync(skillPath('claude-workflow'), 'utf8');
    assert.ok(
      body.includes('--json'),
      'claude-workflow/SKILL.md does not mention "--json" in its accepted flags',
    );
  });
});

describe('claude-result/SKILL.md: mentions --json and --all (T5 Plan 0009)', () => {
  it('body contains "--json"', () => {
    const body = readFileSync(skillPath('claude-result'), 'utf8');
    assert.ok(body.includes('--json'), 'claude-result/SKILL.md does not mention "--json"');
  });

  it('body contains "--all"', () => {
    const body = readFileSync(skillPath('claude-result'), 'utf8');
    assert.ok(body.includes('--all'), 'claude-result/SKILL.md does not mention "--all"');
  });
});

describe('claude-stop/SKILL.md: mentions --json and --all (T5 Plan 0009)', () => {
  it('body contains "--json"', () => {
    const body = readFileSync(skillPath('claude-stop'), 'utf8');
    assert.ok(body.includes('--json'), 'claude-stop/SKILL.md does not mention "--json"');
  });

  it('body contains "--all"', () => {
    const body = readFileSync(skillPath('claude-stop'), 'utf8');
    assert.ok(body.includes('--all'), 'claude-stop/SKILL.md does not mention "--all"');
  });
});

// ---------- T3b (Plan 0010): claude-goal skill guards ----------

describe('claude-goal skill directory and SKILL.md exist (T3b Plan 0010)', () => {
  it('skills/claude-goal/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-goal')),
      'skills/claude-goal/ directory must exist',
    );
  });

  it('skills/claude-goal/SKILL.md exists', () => {
    assert.ok(
      existsSync(skillPath('claude-goal')),
      `SKILL.md not found at ${skillPath('claude-goal')}`,
    );
  });
});

describe('claude-goal/SKILL.md: run line invokes dispatcher with "goal" subcommand (T3b Plan 0010)', () => {
  it('body contains "cc.mjs" and "goal"', () => {
    const body = readFileSync(skillPath('claude-goal'), 'utf8');
    assert.ok(body.includes('cc.mjs'), 'claude-goal/SKILL.md must reference scripts/cc.mjs');
    assert.ok(body.includes('goal'), 'claude-goal/SKILL.md must reference the "goal" subcommand');
  });

  it('run line uses -- separator', () => {
    const body = readFileSync(skillPath('claude-goal'), 'utf8');
    assert.ok(
      body.includes('goal -- "<'),
      'claude-goal/SKILL.md run line does not use the "-- \\"<" separator convention',
    );
  });
});

describe('claude-goal/SKILL.md: --yes auto-injection guard (T3b Plan 0010)', () => {
  it('no dispatcher run line for "goal" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-goal'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('goal'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-goal/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-goal/SKILL.md: --allow-edit is not referenced in run lines (T3b Plan 0010)', () => {
  it('no dispatcher run line contains "--allow-edit"', () => {
    const body = readFileSync(skillPath('claude-goal'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs'))
      .filter((line) => line.includes('--allow-edit'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-goal/SKILL.md references "--allow-edit" on a dispatcher run line, which is not applicable:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains goal entry (T3b Plan 0010)', () => {
  it('includes "Set a goal condition for a Claude Code session."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Set a goal condition for a Claude Code session.'),
      `interface.defaultPrompt must contain "Set a goal condition for a Claude Code session."; got: ${JSON.stringify(dp)}`,
    );
  });
});

// ---------- Plan 0011: claude-fork skill guards ----------

describe('claude-fork skill directory and SKILL.md exist (Plan 0011)', () => {
  it('skills/claude-fork/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-fork')),
      'skills/claude-fork/ directory must exist',
    );
  });

  it('skills/claude-fork/SKILL.md exists', () => {
    assert.ok(
      existsSync(skillPath('claude-fork')),
      `SKILL.md not found at ${skillPath('claude-fork')}`,
    );
  });
});

describe('claude-fork/SKILL.md: run line invokes dispatcher with "fork" subcommand (Plan 0011)', () => {
  it('body contains "cc.mjs" and "fork"', () => {
    const body = readFileSync(skillPath('claude-fork'), 'utf8');
    assert.ok(body.includes('cc.mjs'), 'claude-fork/SKILL.md must reference scripts/cc.mjs');
    assert.ok(body.includes('fork'), 'claude-fork/SKILL.md must reference the "fork" subcommand');
  });

  it('run line uses -- separator', () => {
    const body = readFileSync(skillPath('claude-fork'), 'utf8');
    assert.ok(
      body.includes('fork -- "<'),
      'claude-fork/SKILL.md run line does not use the "-- \\"<" separator convention',
    );
  });
});

describe('claude-fork/SKILL.md: --yes auto-injection guard (Plan 0011)', () => {
  it('no dispatcher run line for "fork" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-fork'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('fork'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-fork/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-fork/SKILL.md: --allow-edit is not referenced in run lines (Plan 0011)', () => {
  it('no dispatcher run line contains "--allow-edit"', () => {
    const body = readFileSync(skillPath('claude-fork'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs'))
      .filter((line) => line.includes('--allow-edit'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-fork/SKILL.md references "--allow-edit" on a dispatcher run line, which is not applicable:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains fork entry (Plan 0011)', () => {
  it('includes "Fork a Claude Code subagent for a directive."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Fork a Claude Code subagent for a directive.'),
      `interface.defaultPrompt must contain "Fork a Claude Code subagent for a directive."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('claude-fork/SKILL.md: strict frontmatter parse (Plan 0011)', () => {
  it('strict frontmatter parse does not throw and name/description are correct', () => {
    const body = readFileSync(skillPath('claude-fork'), 'utf8');
    let fm;
    assert.doesNotThrow(() => {
      fm = strictParseFrontmatter(body);
    }, 'claude-fork/SKILL.md: strict YAML frontmatter parse failed');
    assert.equal(fm.name, 'claude-fork', 'claude-fork: strict-parsed name should match directory');
    assert.ok(
      typeof fm.description === 'string' && fm.description.length > 0,
      'claude-fork: strict-parsed description must be non-empty',
    );
  });
});

// ---------- Plan 0011: claude-batch skill guards ----------

describe('claude-batch skill directory and SKILL.md exist (Plan 0011)', () => {
  it('skills/claude-batch/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-batch')),
      'skills/claude-batch/ directory must exist',
    );
  });

  it('skills/claude-batch/SKILL.md exists', () => {
    assert.ok(
      existsSync(skillPath('claude-batch')),
      `SKILL.md not found at ${skillPath('claude-batch')}`,
    );
  });
});

describe('claude-batch/SKILL.md: run line invokes dispatcher with "batch" subcommand (Plan 0011)', () => {
  it('body contains "cc.mjs" and "batch"', () => {
    const body = readFileSync(skillPath('claude-batch'), 'utf8');
    assert.ok(body.includes('cc.mjs'), 'claude-batch/SKILL.md must reference scripts/cc.mjs');
    assert.ok(
      body.includes('batch'),
      'claude-batch/SKILL.md must reference the "batch" subcommand',
    );
  });

  it('run line uses -- separator', () => {
    const body = readFileSync(skillPath('claude-batch'), 'utf8');
    assert.ok(
      body.includes('batch -- "<'),
      'claude-batch/SKILL.md run line does not use the "-- \\"<" separator convention',
    );
  });
});

describe('claude-batch/SKILL.md: --yes auto-injection guard (Plan 0011)', () => {
  it('no dispatcher run line for "batch" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-batch'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('batch'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-batch/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-batch/SKILL.md: --allow-edit is not referenced in run lines (Plan 0011)', () => {
  it('no dispatcher run line contains "--allow-edit"', () => {
    const body = readFileSync(skillPath('claude-batch'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs'))
      .filter((line) => line.includes('--allow-edit'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-batch/SKILL.md references "--allow-edit" on a dispatcher run line, which is not applicable:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains batch entry (Plan 0011)', () => {
  it('includes "Run a batch of parallel Claude Code instructions."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Run a batch of parallel Claude Code instructions.'),
      `interface.defaultPrompt must contain "Run a batch of parallel Claude Code instructions."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('claude-batch/SKILL.md: strict frontmatter parse (Plan 0011)', () => {
  it('strict frontmatter parse does not throw and name/description are correct', () => {
    const body = readFileSync(skillPath('claude-batch'), 'utf8');
    let fm;
    assert.doesNotThrow(() => {
      fm = strictParseFrontmatter(body);
    }, 'claude-batch/SKILL.md: strict YAML frontmatter parse failed');
    assert.equal(
      fm.name,
      'claude-batch',
      'claude-batch: strict-parsed name should match directory',
    );
    assert.ok(
      typeof fm.description === 'string' && fm.description.length > 0,
      'claude-batch: strict-parsed description must be non-empty',
    );
  });
});

// ---------- Plan 0013: claude-deep-research skill guards ----------

describe('claude-deep-research skill directory and SKILL.md exist (Plan 0013)', () => {
  it('skills/claude-deep-research/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-deep-research')),
      'skills/claude-deep-research/ directory must exist',
    );
  });

  it('skills/claude-deep-research/SKILL.md exists', () => {
    assert.ok(
      existsSync(skillPath('claude-deep-research')),
      `SKILL.md not found at ${skillPath('claude-deep-research')}`,
    );
  });
});

describe('claude-deep-research/SKILL.md: run line invokes dispatcher with "deep-research" subcommand (Plan 0013)', () => {
  it('body contains "cc.mjs" and "deep-research"', () => {
    const body = readFileSync(skillPath('claude-deep-research'), 'utf8');
    assert.ok(
      body.includes('cc.mjs'),
      'claude-deep-research/SKILL.md must reference scripts/cc.mjs',
    );
    assert.ok(
      body.includes('deep-research'),
      'claude-deep-research/SKILL.md must reference the "deep-research" subcommand',
    );
  });

  it('run line uses -- separator', () => {
    const body = readFileSync(skillPath('claude-deep-research'), 'utf8');
    assert.ok(
      body.includes('deep-research -- "<'),
      'claude-deep-research/SKILL.md run line does not use the "-- \\"<" separator convention',
    );
  });
});

describe('claude-deep-research/SKILL.md: --yes auto-injection guard (Plan 0013)', () => {
  it('no dispatcher run line for "deep-research" subcommand contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-deep-research'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('deep-research'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-deep-research/SKILL.md auto-injects "--yes" on a dispatcher run line, violating privacy-ack contract:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-deep-research/SKILL.md: --allow-edit is not referenced in run lines (Plan 0013)', () => {
  it('no dispatcher run line contains "--allow-edit"', () => {
    const body = readFileSync(skillPath('claude-deep-research'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs'))
      .filter((line) => line.includes('--allow-edit'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-deep-research/SKILL.md references "--allow-edit" on a dispatcher run line, which is not applicable:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains deep-research entry (Plan 0013)', () => {
  it('includes "Run a Claude Code dynamic deep-research workflow on a question."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Run a Claude Code dynamic deep-research workflow on a question.'),
      `interface.defaultPrompt must contain "Run a Claude Code dynamic deep-research workflow on a question."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('claude-deep-research/SKILL.md: strict frontmatter parse (Plan 0013)', () => {
  it('strict frontmatter parse does not throw and name/description are correct', () => {
    const body = readFileSync(skillPath('claude-deep-research'), 'utf8');
    let fm;
    assert.doesNotThrow(() => {
      fm = strictParseFrontmatter(body);
    }, 'claude-deep-research/SKILL.md: strict YAML frontmatter parse failed');
    assert.equal(
      fm.name,
      'claude-deep-research',
      'claude-deep-research: strict-parsed name should match directory',
    );
    assert.ok(
      typeof fm.description === 'string' && fm.description.length > 0,
      'claude-deep-research: strict-parsed description must be non-empty',
    );
  });
});

// ---------- Plan 0016: claude-workflows skill guards ----------

describe('claude-workflows skill directory and SKILL.md exist (Plan 0016)', () => {
  it('skills/claude-workflows/ directory exists', () => {
    assert.ok(
      existsSync(join(PLUGIN_ROOT, 'skills', 'claude-workflows')),
      'skills/claude-workflows/ directory must exist',
    );
  });

  it('skills/claude-workflows/SKILL.md exists', () => {
    assert.ok(
      existsSync(skillPath('claude-workflows')),
      `SKILL.md not found at ${skillPath('claude-workflows')}`,
    );
  });
});

describe('claude-workflows/SKILL.md: run line invokes dispatcher with "workflows" subcommand (Plan 0016)', () => {
  it('body contains "cc.mjs" and "workflows"', () => {
    const body = readFileSync(skillPath('claude-workflows'), 'utf8');
    assert.ok(body.includes('cc.mjs'), 'claude-workflows/SKILL.md must reference scripts/cc.mjs');
    assert.ok(
      body.includes('workflows'),
      'claude-workflows/SKILL.md must reference the "workflows" subcommand',
    );
  });
});

describe('claude-workflows/SKILL.md: no --yes auto-injection (Plan 0016)', () => {
  it('no dispatcher run line contains " --yes"', () => {
    const body = readFileSync(skillPath('claude-workflows'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs') && line.includes('workflows'))
      .filter((line) => line.includes(' --yes'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-workflows/SKILL.md auto-injects "--yes" on a dispatcher run line:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('claude-workflows/SKILL.md: --allow-edit is not referenced in run lines (Plan 0016)', () => {
  it('no dispatcher run line contains "--allow-edit"', () => {
    const body = readFileSync(skillPath('claude-workflows'), 'utf8');
    const offendingLines = body
      .split('\n')
      .filter((line) => line.includes('cc.mjs'))
      .filter((line) => line.includes('--allow-edit'));
    assert.equal(
      offendingLines.length,
      0,
      `claude-workflows/SKILL.md references "--allow-edit" on a dispatcher run line:\n${offendingLines.join('\n')}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains workflows entry (Plan 0016)', () => {
  it('includes "List my Claude Code workflow sessions."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('List my Claude Code workflow sessions.'),
      `interface.defaultPrompt must contain "List my Claude Code workflow sessions."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains Claude skills catalog entry', () => {
  it('includes "List installed Claude Code skills."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('List installed Claude Code skills.'),
      `interface.defaultPrompt must contain "List installed Claude Code skills."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('plugin.json interface.defaultPrompt contains CC upgrade entry', () => {
  it('includes "Upgrade or refresh the installed CC plugin."', () => {
    const manifest = readManifest();
    const dp = manifest.interface?.defaultPrompt;
    assert.ok(Array.isArray(dp), 'interface.defaultPrompt must be an array');
    assert.ok(
      dp.includes('Upgrade or refresh the installed CC plugin.'),
      `interface.defaultPrompt must contain "Upgrade or refresh the installed CC plugin."; got: ${JSON.stringify(dp)}`,
    );
  });
});

describe('claude-workflows/SKILL.md: strict frontmatter parse (Plan 0016)', () => {
  it('strict frontmatter parse does not throw and name/description are correct', () => {
    const body = readFileSync(skillPath('claude-workflows'), 'utf8');
    let fm;
    assert.doesNotThrow(() => {
      fm = strictParseFrontmatter(body);
    }, 'claude-workflows/SKILL.md: strict YAML frontmatter parse failed');
    assert.equal(
      fm.name,
      'claude-workflows',
      'claude-workflows: strict-parsed name should match directory',
    );
    assert.ok(
      typeof fm.description === 'string' && fm.description.length > 0,
      'claude-workflows: strict-parsed description must be non-empty',
    );
  });
});

describe('claude-workflows/SKILL.md: Next steps subsection references $claude-status (Plan 0016)', () => {
  it('body contains "### Next steps" and mentions $claude-status', () => {
    const body = readFileSync(skillPath('claude-workflows'), 'utf8');
    assert.ok(
      body.includes('### Next steps'),
      'claude-workflows/SKILL.md is missing the "### Next steps" subsection',
    );
    const nextStepsIdx = body.indexOf('### Next steps');
    const afterNextSteps = body.slice(nextStepsIdx);
    assert.ok(
      afterNextSteps.includes('$claude-status'),
      'claude-workflows/SKILL.md "### Next steps" section does not reference $claude-status',
    );
  });
});
