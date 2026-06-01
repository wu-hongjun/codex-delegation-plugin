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
  '## Follow-up injection',
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
  '$claude-followup',
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

// ---------- 3. All six skills mentioned ----------

describe('README.md mentions all six skill names', () => {
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

// ---------- 7. No longer claims "No multi-turn reuse yet" ----------

describe('README.md no longer claims "No multi-turn reuse yet" (plan 0002 T13)', () => {
  it('does not contain the stale "No multi-turn reuse yet" limitation', () => {
    const body = readReadme();
    assert.ok(
      !body.includes('No multi-turn reuse yet'),
      'README.md still contains the stale "No multi-turn reuse yet" limitation; plan 0002 ships follow-up injection',
    );
  });
});

// ---------- 8. No longer claims "No PTY attach yet" ----------

describe('README.md no longer claims "No PTY attach yet" (plan 0002 T13)', () => {
  it('does not contain the stale "No PTY attach yet" limitation', () => {
    const body = readReadme();
    assert.ok(
      !body.includes('No PTY attach yet'),
      'README.md still contains the stale "No PTY attach yet" limitation; plan 0002 ships PTY-based input transport',
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

// ---------- 18. node-pty only in troubleshooting context ----------

describe('README.md mentions node-pty only in troubleshooting context (plan 0002 T13)', () => {
  it('every line mentioning "node-pty" is part of troubleshooting / setup guidance, not a v1 absence claim', () => {
    const body = readReadme();
    const lines = body.split('\n');
    const mentions = lines.filter((l) => l.includes('node-pty'));
    assert.ok(
      mentions.length > 0,
      'README.md should mention node-pty in plan 0002 troubleshooting guidance',
    );
    // No line should claim node-pty is "never installed" or "not used" (that was the v1 wording).
    const stale = mentions.filter((l) => {
      const lower = l.toLowerCase();
      return lower.includes('never installed') || lower.includes('not used');
    });
    assert.equal(
      stale.length,
      0,
      `Lines still treat node-pty as absent in v1:\n${stale.join('\n')}`,
    );
  });
});

// ---------- 19. Skill invocation examples do NOT show --yes ----------

describe('README.md skill invocation examples do not include --yes', () => {
  it('no line that looks like a $claude-* skill invocation also contains "--yes"', () => {
    const body = readReadme();
    // Only flag lines where the skill name appears at the start of the line
    // (i.e. actual invocation examples, not prose paragraphs that mention the skill).
    const offending = body
      .split('\n')
      .filter((l) => /^\s*\$claude-(setup|delegate|status|result|stop|followup)/.test(l))
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

// ==========================================================================
// T13: plugin README updates for plan 0002 follow-up injection
// ==========================================================================

// ---------- T13-1. README mentions $claude-followup ----------

describe('README.md mentions $claude-followup (T13-1)', () => {
  it('contains substring "$claude-followup"', () => {
    const body = readReadme();
    assert.ok(body.includes('$claude-followup'), 'README.md does not mention "$claude-followup"');
  });
});

// ---------- T13-2. README documents the followup dispatcher command ----------

describe('README.md documents the followup dispatcher command (T13-2)', () => {
  it('contains "claude-companion.mjs followup"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('claude-companion.mjs followup'),
      'README.md does not document the direct dispatcher command "claude-companion.mjs followup"',
    );
  });
});

// ---------- T13-3. README documents awaiting_followup ----------

describe('README.md documents awaiting_followup state (T13-3)', () => {
  it('contains substring "awaiting_followup"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('awaiting_followup'),
      'README.md does not document the "awaiting_followup" state',
    );
  });
});

// ---------- T13-4. README documents the 30-minute TTL ----------

describe('README.md documents the 30-minute TTL (T13-4)', () => {
  it('contains "30 minutes" or "30-minute"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('30 minutes') || body.includes('30-minute'),
      'README.md does not document the 30-minute TTL for awaiting_followup state',
    );
  });
});

// ---------- T13-5. README documents target-workspace acknowledgement ----------

describe('README.md documents target-workspace acknowledgement (T13-5)', () => {
  it('mentions "target-workspace", "target job\'s workspace", or "target workspace"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('target-workspace') ||
        body.includes("target job's workspace") ||
        body.includes('target workspace'),
      'README.md does not document the target-workspace acknowledgement requirement',
    );
  });
});

// ---------- T13-6. README says --allow-edit does not bypass acknowledgement ----------

describe('README.md says --allow-edit does not bypass acknowledgement (T13-6)', () => {
  it('has a line mentioning --allow-edit that also contains a negation (not bypass / does not / never bypass)', () => {
    const body = readReadme();
    const lines = body.split('\n');
    const matched = lines
      .filter((l) => l.includes('--allow-edit'))
      .filter((l) => {
        const lower = l.toLowerCase();
        return (
          lower.includes('not bypass') ||
          lower.includes('does not') ||
          lower.includes('never bypass')
        );
      });
    assert.ok(matched.length > 0, 'README.md must say --allow-edit does NOT bypass the ack');
  });
});

// ---------- T13-7. README documents accepted followup flags ----------

describe('README.md documents accepted followup flags (T13-7)', () => {
  for (const flag of ['--all', '--json', '--yes', '--allow-edit']) {
    it(`contains flag "${flag}"`, () => {
      const body = readReadme();
      assert.ok(
        body.includes(flag),
        `README.md does not document accepted followup flag "${flag}"`,
      );
    });
  }
});

// ---------- T13-8. README documents rejected startup-only flags ----------

describe('README.md documents rejected startup-only flags (T13-8)', () => {
  for (const flag of [
    '--model',
    '--effort',
    '--permission-mode',
    '--add-dir',
    '--mcp-config',
    '--name',
  ]) {
    it(`contains flag "${flag}"`, () => {
      const body = readReadme();
      assert.ok(
        body.includes(flag),
        `README.md does not document rejected startup-only flag "${flag}"`,
      );
    });
  }
});

// ---------- T13-9. README documents permission handoff ----------

describe('README.md documents permission handoff (T13-9)', () => {
  it('"permission" and "handoff" appear within 800 characters of each other (closest pair)', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const findAll = (s, needle) => {
      const out = [];
      let i = 0;
      while ((i = s.indexOf(needle, i)) !== -1) {
        out.push(i);
        i += needle.length;
      }
      return out;
    };
    const permHits = findAll(lower, 'permission');
    const handoffHits = findAll(lower, 'handoff');
    assert.ok(
      permHits.length > 0 && handoffHits.length > 0,
      'README.md must mention both "permission" and "handoff"',
    );
    let minDist = Infinity;
    for (const a of permHits) {
      for (const b of handoffHits) {
        const d = Math.abs(a - b);
        if (d < minDist) minDist = d;
      }
    }
    assert.ok(
      minDist < 800,
      `README.md must document the permission handoff (closest "permission"/"handoff" pair is ${minDist} chars apart; expected < 800)`,
    );
  });
});

// ---------- T13-10. README documents non-TTY manual `claude attach` fallback ----------

describe('README.md documents non-TTY manual `claude attach` fallback (T13-10)', () => {
  it('contains "claude attach"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('claude attach'),
      'README.md must mention `claude attach` as the manual fallback',
    );
  });

  it('mentions non-interactive or non-TTY context', () => {
    const body = readReadme();
    const nearby =
      body.toLowerCase().includes('non-tty') || body.toLowerCase().includes('non-interactive');
    assert.ok(
      nearby,
      'README.md must describe the non-interactive (non-TTY) permission fallback path',
    );
  });
});

// ---------- T13-11. README documents node-pty rebuild remediation ----------

describe('README.md documents node-pty rebuild remediation (T13-11)', () => {
  it('contains "npm rebuild node-pty"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('npm rebuild node-pty'),
      'README.md must include the "npm rebuild node-pty" remediation command in troubleshooting',
    );
  });
});

// ---------- T13-12. README documents sidecar best-effort behavior ----------

describe('README.md documents sidecar best-effort behavior (T13-12)', () => {
  it('contains "sidecar"', () => {
    const body = readReadme();
    assert.ok(body.includes('sidecar'), 'README.md must mention the "sidecar" component');
  });

  it('contains "best-effort" or "best effort"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('best-effort') || body.includes('best effort'),
      'README.md must describe the sidecar as best-effort',
    );
  });
});

// ---------- T13-13. README no longer says "No multi-turn reuse yet" ----------

describe('README.md no longer says "No multi-turn reuse yet" (T13-13)', () => {
  it('does not contain stale limitation phrase "No multi-turn reuse yet"', () => {
    const body = readReadme();
    assert.ok(
      !body.includes('No multi-turn reuse yet'),
      'README.md still contains the stale "No multi-turn reuse yet" limitation',
    );
  });
});

// ---------- T13-14. README no longer says "No PTY attach yet" ----------

describe('README.md no longer says "No PTY attach yet" (T13-14)', () => {
  it('does not contain stale limitation phrase "No PTY attach yet"', () => {
    const body = readReadme();
    assert.ok(
      !body.includes('No PTY attach yet'),
      'README.md still contains the stale "No PTY attach yet" limitation',
    );
  });
});

// ---------- T13-15. README says watch/streaming is not implemented ----------

describe('README.md says watch/streaming is not implemented (T13-15)', () => {
  it('mentions watch() or streaming AND a "not implemented" qualifier', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasWatch = lower.includes('watch()') || lower.includes('streaming');
    const hasNeg = lower.includes('not implemented') || lower.includes('not implemented yet');
    assert.ok(hasWatch && hasNeg, 'README.md must say watch()/streaming is not yet implemented');
  });
});

// ---------- T13-21. Cost paragraph preserved verbatim ----------

describe('README.md preserves the cost paragraph verbatim (plan 0002 T13)', () => {
  it('contains the exact cost-and-prompt-cache paragraph from plan 0001', () => {
    const body = readReadme();
    const expected =
      'This v1 uses Claude Code background sessions and does not use `claude -p`. It is designed to preserve the architecture needed for future session/cache reuse experiments. Cost savings have not been benchmarked yet. Plan 0004 is reserved for measurement.';
    assert.ok(
      body.includes(expected),
      'README.md cost paragraph must be byte-identical to the plan 0001 wording',
    );
  });
});
