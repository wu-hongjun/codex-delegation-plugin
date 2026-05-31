// Static-validation tests for packages/plugin-codex/README.md — T13
//
// These tests do NOT spawn processes. They verify file existence, section
// headings, required content, and the absence of forbidden tokens/patterns.
//
// Pattern mirrors skills-manifest.test.mjs: node:test + node:assert/strict, ESM.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(here, '..', '..');
const README_PATH = resolve(PLUGIN_ROOT, 'README.md');

// ---------- required headings (exact order) ----------

const REQUIRED_HEADINGS = [
  '# Claude Companion for Codex',
  '## What this is',
  '## Current v1 scope',
  '## Requirements',
  '## Install locally',
  '## Setup',
  '## Commands and skills',
  '## Direct dispatcher usage',
  '## Privacy and workspace disclosure',
  '## Cost and prompt-cache wording',
  '## Known limitations',
  '## Troubleshooting',
  '## Development',
  '## What comes next',
];

// ---------- required skills ----------

const REQUIRED_SKILLS = [
  '$claude-setup',
  '$claude-delegate',
  '$claude-status',
  '$claude-result',
  '$claude-stop',
];

// ---------- forbidden tokens / patterns (mirrored from skills-manifest.test.mjs) ----------

const FORBIDDEN_TOKENS = [
  'saves money',
  'cheaper than',
  'reduces cost',
  'preserves prompt-cache savings',
  'avoids the',
  'more efficient than',
];

const FORBIDDEN_PATTERNS = [
  /\b\d+%\s*(faster|cheaper|less)/i,
  /\b\d+x\s*(faster|cheaper)/i,
  /save[sd]?\s+\d+/i,
];

// ---------- helpers ----------

function readReadme() {
  return readFileSync(README_PATH, 'utf8');
}

/** Return only lines that are h1/h2 headings (not h3+). */
function extractHeadings(body) {
  return body
    .split('\n')
    .filter((l) => /^#{1,2}\s+/.test(l))
    .map((l) => l.trimEnd());
}

/** Extract the text content of a named section (## heading until next ## or end). */
function extractSection(body, heading) {
  const lines = body.split('\n');
  const startIdx = lines.findIndex((l) => l.trimEnd() === heading);
  if (startIdx === -1) return null;
  let end = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(startIdx, end).join('\n');
}

// ---------- 1. README exists ----------

describe('README.md exists', () => {
  it('README.md is present at packages/plugin-codex/README.md', () => {
    assert.ok(existsSync(README_PATH), `README.md not found at ${README_PATH}`);
  });
});

// ---------- 2. All 13 required section headings present in order ----------

describe('README.md contains all required section headings in order', () => {
  it('headings match expected ordered list (### sub-headings allowed between)', () => {
    const body = readReadme();
    const actual = extractHeadings(body);
    // Filter actual to only items that appear in REQUIRED_HEADINGS set
    const matched = actual.filter((h) => REQUIRED_HEADINGS.includes(h));
    assert.deepEqual(
      matched,
      REQUIRED_HEADINGS,
      `Required headings mismatch.\nExpected: ${JSON.stringify(REQUIRED_HEADINGS)}\nMatched:  ${JSON.stringify(matched)}`,
    );
  });
});

// ---------- 3. All five skills mentioned ----------

describe('README.md mentions all five skill names', () => {
  for (const skill of REQUIRED_SKILLS) {
    it(`contains substring "${skill}"`, () => {
      const body = readReadme();
      assert.ok(body.includes(skill), `README.md does not mention skill "${skill}"`);
    });
  }
});

// ---------- 4. Dispatcher path ----------

describe('README.md mentions direct dispatcher path', () => {
  it('contains "scripts/claude-companion.mjs"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('scripts/claude-companion.mjs'),
      'README.md does not mention "scripts/claude-companion.mjs"',
    );
  });
});

// ---------- 5. claude --bg ----------

describe('README.md mentions claude --bg', () => {
  it('contains substring "claude --bg"', () => {
    const body = readReadme();
    assert.ok(body.includes('claude --bg'), 'README.md does not mention "claude --bg"');
  });
});

// ---------- 6. States claude -p is NOT used in v1 ----------

describe('README.md clarifies that claude -p is not used in v1', () => {
  it('contains a phrase indicating claude -p is not used (case-insensitive)', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasNegation =
      lower.includes('does not use `claude -p`') ||
      lower.includes("does not use 'claude -p'") ||
      lower.includes('does not use claude -p') ||
      lower.includes('not use claude -p') ||
      lower.includes('claude -p is not') ||
      lower.includes('claude -p`) is not') ||
      lower.includes('not `claude -p`') ||
      lower.includes("not 'claude -p'");
    assert.ok(
      hasNegation,
      'README.md does not contain a clear statement that "claude -p" is not used in v1',
    );
  });

  it('every line containing "claude -p" also contains "not" (case-insensitive)', () => {
    const body = readReadme();
    const offending = body
      .split('\n')
      .filter((l) => l.toLowerCase().includes('claude -p'))
      .filter((l) => !l.toLowerCase().includes('not'));
    assert.equal(
      offending.length,
      0,
      `Some lines mention "claude -p" without a negation:\n${offending.join('\n')}`,
    );
  });
});

// ---------- 7. Mentions no multi-turn reuse ----------

describe('README.md mentions no multi-turn reuse', () => {
  it('contains "multi-turn" or "multi turn" substring', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    assert.ok(
      lower.includes('multi-turn') || lower.includes('multi turn'),
      'README.md does not mention "multi-turn" / "multi turn" (no-multi-turn-reuse contract)',
    );
  });
});

// ---------- 8. Mentions no PTY attach ----------

describe('README.md mentions no PTY attach', () => {
  it('contains "PTY" or "pty" substring', () => {
    const body = readReadme();
    assert.ok(
      body.toLowerCase().includes('pty'),
      'README.md does not mention PTY (missing no-pty-attach disclosure)',
    );
  });
});

// ---------- 9. Mentions no benchmarked cost savings ----------

describe('README.md discloses that cost savings have not been benchmarked', () => {
  it('contains "have not been benchmarked", "not been measured", or "Plan 0004"', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    assert.ok(
      lower.includes('have not been benchmarked') ||
        lower.includes('not been measured') ||
        body.includes('Plan 0004'),
      'README.md does not disclose that cost savings have not been benchmarked (expected "have not been benchmarked", "not been measured", or "Plan 0004")',
    );
  });
});

// ---------- 10. Privacy / workspace disclosure ----------

describe('README.md includes privacy and workspace disclosure', () => {
  it('contains a phrase with "repository" near Claude/Anthropic and send/delegating/delegate', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasRepository = lower.includes('repository');
    const hasAgent = lower.includes('anthropic') || lower.includes('claude code');
    const hasAction =
      lower.includes('send') || lower.includes('delegating') || lower.includes('delegate');
    assert.ok(
      hasRepository && hasAgent && hasAction,
      'README.md privacy section missing: expected "repository" + ("Anthropic"/"Claude Code") + ("send"/"delegating"/"delegate")',
    );
  });
});

// ---------- 11. .agents/plugins/marketplace.json path ----------

describe('README.md includes .agents/plugins/marketplace.json path', () => {
  it('contains literal ".agents/plugins/marketplace.json"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('.agents/plugins/marketplace.json'),
      'README.md does not mention ".agents/plugins/marketplace.json"',
    );
  });
});

// ---------- 12. codex plugin marketplace add ----------

describe('README.md includes "codex plugin marketplace add" command', () => {
  it('contains literal "codex plugin marketplace add"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('codex plugin marketplace add'),
      'README.md does not include the "codex plugin marketplace add" command',
    );
  });
});

// ---------- 13. codex plugin add ----------

describe('README.md includes "codex plugin add" command', () => {
  it('contains literal "codex plugin add"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('codex plugin add'),
      'README.md does not include the "codex plugin add" command',
    );
  });
});

// ---------- 14. Dev commands ----------

describe('README.md mentions all four dev commands', () => {
  for (const cmd of ['npm run lint', 'npm run typecheck', 'npm run format', 'npm test']) {
    it(`contains "${cmd}"`, () => {
      const body = readReadme();
      assert.ok(body.includes(cmd), `README.md does not mention dev command "${cmd}"`);
    });
  }
});

// ---------- 15. No forbidden cost-claim tokens ----------

describe('README.md contains no forbidden cost-claim tokens', () => {
  for (const token of FORBIDDEN_TOKENS) {
    it(`does not contain forbidden token "${token}"`, () => {
      const body = readReadme();
      assert.equal(body.includes(token), false, `README.md contains forbidden token "${token}"`);
    });
  }
});

describe('README.md contains no forbidden quantitative cost-claim patterns', () => {
  for (const pattern of FORBIDDEN_PATTERNS) {
    it(`does not match forbidden pattern ${pattern}`, () => {
      const body = readReadme();
      assert.equal(pattern.test(body), false, `README.md matches forbidden pattern ${pattern}`);
    });
  }
});

// ---------- 16. No $claude-review listed as an available skill ----------

describe('README.md does not present $claude-review as currently available', () => {
  it('every line mentioning "$claude-review" also has a "not"/"future"/"later"/"Plan 0" qualifier', () => {
    const body = readReadme();
    const offending = body
      .split('\n')
      .filter((l) => l.includes('$claude-review'))
      .filter((l) => {
        const lower = l.toLowerCase();
        return (
          !lower.includes('not') &&
          !lower.includes('future') &&
          !lower.includes('later') &&
          !lower.includes('plan 0') &&
          !lower.includes('yet')
        );
      });
    assert.equal(
      offending.length,
      0,
      `Lines mention "$claude-review" without a qualifying word (not/future/later/Plan/yet):\n${offending.join('\n')}`,
    );
  });
});

// ---------- 17. No hooks listed as currently available ----------

describe('README.md does not present hooks as currently available', () => {
  it('every line mentioning "hook" also mentions "not", "future", "later", or a Plan number', () => {
    const body = readReadme();
    const offending = body
      .split('\n')
      .filter((l) => l.toLowerCase().includes('hook'))
      .filter((l) => {
        const lower = l.toLowerCase();
        return (
          !lower.includes('not') &&
          !lower.includes('future') &&
          !lower.includes('later') &&
          !lower.includes('plan 0')
        );
      });
    assert.equal(
      offending.length,
      0,
      `Some lines mention "hook" without a qualifying word (not/future/later/Plan):\n${offending.join('\n')}`,
    );
  });
});

// ---------- 18. No node-pty ----------

describe('README.md does not mention node-pty as installed or required', () => {
  it('substring "node-pty" is absent', () => {
    const body = readReadme();
    assert.equal(
      body.includes('node-pty'),
      false,
      'README.md mentions "node-pty" — it is never installed in v1',
    );
  });
});

// ---------- 19. Skill invocation examples do NOT show --yes ----------

describe('README.md skill invocation examples do not include --yes', () => {
  it('no line that looks like a $claude-* skill invocation also contains "--yes"', () => {
    const body = readReadme();
    const offending = body
      .split('\n')
      .filter((l) => /\$claude-(setup|delegate|status|result|stop)/.test(l))
      .filter((l) => l.includes('--yes'));
    assert.equal(
      offending.length,
      0,
      `Skill invocation lines must not contain "--yes":\n${offending.join('\n')}`,
    );
  });
});

// ---------- 21. README is non-empty and >= 200 lines ----------

describe('README.md is substantive (>= 200 lines)', () => {
  it('has at least 200 lines', () => {
    const body = readReadme();
    const lineCount = body.split('\n').length;
    assert.ok(
      lineCount >= 200,
      `README.md has only ${lineCount} lines; expected at least 200 for a substantive document`,
    );
  });

  it('is non-empty', () => {
    const body = readReadme();
    assert.ok(body.trim().length > 0, 'README.md is empty');
  });
});

// ---------- 22. Mentions T12b idle→completed behavior ----------

describe('README.md documents idle→completed behavior (T12b)', () => {
  it('some occurrence of "idle" is within 200 characters of some occurrence of "completed"', () => {
    const body = readReadme().toLowerCase();
    const findAll = (s, needle) => {
      const out = [];
      let i = 0;
      while ((i = s.indexOf(needle, i)) !== -1) {
        out.push(i);
        i += needle.length;
      }
      return out;
    };
    const idleHits = findAll(body, 'idle');
    const completedHits = findAll(body, 'completed');
    assert.ok(
      idleHits.length > 0 && completedHits.length > 0,
      'README.md must mention both "idle" and "completed" (T12b idle→completed behavior)',
    );
    let minDist = Infinity;
    for (const a of idleHits) {
      for (const b of completedHits) {
        const d = Math.abs(a - b);
        if (d < minDist) minDist = d;
      }
    }
    assert.ok(
      minDist <= 200,
      `closest "idle"/"completed" pair is more than 200 characters apart — T12b behavior may be undocumented (closest distance: ${minDist})`,
    );
  });
});

// ---------- 23. Known limitations section has at least 5 items ----------

describe('README.md Known limitations section lists at least 5 limitations', () => {
  it('## Known limitations section contains >= 5 list items', () => {
    const body = readReadme();
    const section = extractSection(body, '## Known limitations');
    assert.ok(section !== null, 'Could not locate "## Known limitations" section in README.md');
    // Count lines that start with a list marker (-, *, 1., 2., etc.) or numbered item
    const listItems = section
      .split('\n')
      .filter((l) => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l));
    assert.ok(
      listItems.length >= 5,
      `"## Known limitations" section has only ${listItems.length} list item(s); expected at least 5`,
    );
  });
});

// ---------- 24. Future plan numbers mentioned ----------

describe('README.md mentions future plan numbers', () => {
  for (const plan of ['Plan 0002', 'Plan 0003', 'Plan 0004', 'Plan 0005', 'Plan 0006']) {
    it(`contains "${plan}"`, () => {
      const body = readReadme();
      assert.ok(body.includes(plan), `README.md does not mention "${plan}"`);
    });
  }
});
