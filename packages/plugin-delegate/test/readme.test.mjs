// Static-validation tests for packages/plugin-delegate/README.md — T13
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
  '# Codex Delegation Plugin',
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
  '$claude-doctor',
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
  it('README.md is present at packages/plugin-delegate/README.md', () => {
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

// ---------- 3. Core skills mentioned ----------

describe('README.md mentions the core skill names', () => {
  for (const skill of REQUIRED_SKILLS) {
    it(`contains substring "${skill}"`, () => {
      const body = readReadme();
      assert.ok(body.includes(skill), `README.md does not mention skill "${skill}"`);
    });
  }
});

// ---------- 4. Dispatcher path ----------

describe('README.md mentions direct dispatcher path', () => {
  it('contains "scripts/delegate.mjs"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('scripts/delegate.mjs'),
      'README.md does not mention "scripts/delegate.mjs"',
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

// ---------- 16. $claude-review is now a shipped skill (Plan 0003 T10) ----------
// Option A: removed the stale Plan-0002 guard that required every $claude-review
// mention to carry a "not/future/later/Plan 0/yet" qualifier. That guard was
// correct while the skill was unshipped; Plan 0003 has shipped it, so the guard
// is now wrong. The T10 tests below provide replacement coverage.
//
// (The old describe block is intentionally deleted rather than inverted — the
// T10 assertions that follow assert positive presence of the shipped skill.)

// ---------- 17. Provider-specific hook surfaces are described accurately ----------

describe('README.md documents the shipped Antigravity lifecycle hooks accurately', () => {
  it('names the bundled Antigravity companion plugin and lifecycle hooks', () => {
    const body = readReadme();
    assert.match(body, /bundled Antigravity companion plugin supplies lifecycle hooks/i);
    assert.match(body, /installs its lifecycle hooks and five native subagent profiles/i);
  });

  it('keeps the external Claude MessageDisplay hook distinct from plugin lifecycle hooks', () => {
    const body = readReadme();
    assert.match(body, /Claude Code `MessageDisplay` hook installed/i);
    assert.match(body, /hook does not affect what is written to the session JSONL/i);
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

// ---------- 25. "What comes next" section includes Plans 0007 and 0008 (shipped) ----------

describe('README.md "What comes next" section includes Plans 0007 and 0008 as shipped', () => {
  it('"What comes next" section mentions Plan 0007 with (shipped) marker', () => {
    const body = readReadme();
    const section = extractSection(body, '## What comes next');
    assert.ok(section !== null, 'Could not locate "## What comes next" section in README.md');
    assert.ok(
      section.includes('Plan 0007') && section.includes('(shipped)'),
      '"What comes next" section must mention Plan 0007 with a (shipped) marker',
    );
  });

  it('"What comes next" section mentions Plan 0008 with (shipped) marker', () => {
    const body = readReadme();
    const section = extractSection(body, '## What comes next');
    assert.ok(section !== null, 'Could not locate "## What comes next" section in README.md');
    assert.ok(
      section.includes('Plan 0008') && section.includes('(shipped)'),
      '"What comes next" section must mention Plan 0008 with a (shipped) marker',
    );
  });
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
  it('contains "delegate.mjs followup"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('delegate.mjs followup'),
      'README.md does not document the direct dispatcher command "delegate.mjs followup"',
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

// ==========================================================================
// T10: Plugin README updates for Plan 0003 review skills
// ==========================================================================

// ---------- T10-1. README has ## Review skills section ----------

describe('README.md has ## Review skills section (T10-1)', () => {
  it('contains "## Review skills"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('## Review skills'),
      'README.md does not contain "## Review skills" section',
    );
  });
});

// ---------- T10-2. README documents $claude-review ----------

describe('README.md documents $claude-review (T10-2)', () => {
  it('contains "### $claude-review" heading', () => {
    const body = readReadme();
    assert.ok(
      body.includes('### $claude-review'),
      'README.md does not contain "### $claude-review" heading',
    );
  });
});

// ---------- T10-3. README documents $claude-adversarial-review ----------

describe('README.md documents $claude-adversarial-review (T10-3)', () => {
  it('contains "### $claude-adversarial-review" heading', () => {
    const body = readReadme();
    assert.ok(
      body.includes('### $claude-adversarial-review'),
      'README.md does not contain "### $claude-adversarial-review" heading',
    );
  });
});

// ---------- T10-4. README documents direct dispatcher review command ----------

describe('README.md documents direct dispatcher review command (T10-4)', () => {
  it('contains "delegate.mjs review"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('delegate.mjs review'),
      'README.md does not document the direct dispatcher command "delegate.mjs review"',
    );
  });
});

// ---------- T10-5. README documents direct dispatcher adversarial-review command ----------

describe('README.md documents direct dispatcher adversarial-review command (T10-5)', () => {
  it('contains "delegate.mjs adversarial-review"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('delegate.mjs adversarial-review'),
      'README.md does not document the direct dispatcher command "delegate.mjs adversarial-review"',
    );
  });
});

// ---------- T10-6. README documents same-session vs fresh-session distinction ----------

describe('README.md documents same-session vs fresh-session distinction (T10-6)', () => {
  it('contains "same" and "fresh" session phrasing within 2000 characters of each other', () => {
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
    // Confirm at least one of the required session-distinction phrases exists
    const hasSameSession =
      lower.includes('same claude code session') ||
      lower.includes('same conversation') ||
      lower.includes('same session');
    const hasFreshSession =
      lower.includes('fresh claude code') ||
      lower.includes('fresh-session') ||
      lower.includes('fresh session') ||
      lower.includes('new claude code session');
    assert.ok(hasSameSession, 'README.md must document same-session behavior for $claude-review');
    assert.ok(
      hasFreshSession,
      'README.md must document fresh-session behavior for $claude-adversarial-review',
    );
    // Confirm the two phrases appear near each other (within the Review skills section)
    const sameHits = findAll(lower, 'same');
    const freshHits = findAll(lower, 'fresh');
    let minDist = Infinity;
    for (const a of sameHits) {
      for (const b of freshHits) {
        const d = Math.abs(a - b);
        if (d < minDist) minDist = d;
      }
    }
    assert.ok(
      minDist <= 2000,
      `"same" and "fresh" session concepts must appear within 2000 characters of each other (closest: ${minDist})`,
    );
  });
});

// ---------- T10-7. README documents sycophancy caveat (verbatim substring) ----------

describe('README.md documents sycophancy caveat verbatim (T10-7)', () => {
  it('contains the exact sycophancy caveat sentence', () => {
    const body = readReadme();
    const caveat =
      'Because this review happens in the same conversation, it may be more prone to agreeing with its own prior work. Use `$claude-adversarial-review` for a more independent fresh-session review.';
    assert.ok(
      body.includes(caveat),
      'README.md does not contain the exact sycophancy caveat sentence',
    );
  });
});

// ---------- T10-8. README documents structured review output ----------

describe('README.md documents structured review output (T10-8)', () => {
  it('contains "structured" near "findings" or "verdict"', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasStructured = lower.includes('structured');
    const hasFindings = lower.includes('findings');
    const hasVerdict = lower.includes('verdict');
    assert.ok(
      hasStructured && (hasFindings || hasVerdict),
      'README.md must document structured review output with "findings" or "verdict"',
    );
  });
});

// ---------- T10-9. README documents severity levels ----------

describe('README.md documents severity levels (T10-9)', () => {
  for (const severity of ['blocker', 'high', 'medium', 'low', 'nit']) {
    it(`contains severity level "${severity}"`, () => {
      const body = readReadme();
      assert.ok(
        body.includes(severity),
        `README.md does not document severity level "${severity}"`,
      );
    });
  }
});

// ---------- T10-10. README documents verdict values ----------

describe('README.md documents verdict values (T10-10)', () => {
  for (const verdict of ['pass', 'fail', 'pass_with_findings']) {
    it(`contains verdict value "${verdict}"`, () => {
      const body = readReadme();
      assert.ok(body.includes(verdict), `README.md does not document verdict value "${verdict}"`);
    });
  }
});

// ---------- T10-11. README documents best-effort parser fallback ----------

describe('README.md documents best-effort parser fallback (T10-11)', () => {
  it('contains "best-effort" or "wraps the raw text" in context of review output', () => {
    const body = readReadme();
    const hasBestEffort = body.includes('best-effort');
    const hasWraps = body.toLowerCase().includes('wraps the raw text');
    assert.ok(
      hasBestEffort || hasWraps,
      'README.md must document best-effort parser fallback for review output',
    );
  });
});

// ---------- T10-12. README documents $claude-review eligibility ----------

describe('README.md documents $claude-review eligibility (T10-12)', () => {
  it('contains "awaiting_followup" in the context of $claude-review eligibility', () => {
    const body = readReadme();
    assert.ok(
      body.includes('awaiting_followup'),
      'README.md must document awaiting_followup as eligible for $claude-review',
    );
  });

  it('documents that needs_input is rejected for $claude-review', () => {
    const body = readReadme();
    // The eligibility table should show needs_input with a No entry
    assert.ok(
      body.includes('needs_input'),
      'README.md must document needs_input status in $claude-review eligibility table',
    );
  });

  it('documents completed with live idle session as eligible', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasCompleted = lower.includes('completed');
    const hasLive = lower.includes('live idle') || lower.includes('live session');
    assert.ok(
      hasCompleted && hasLive,
      'README.md must document completed with live idle session as eligible for $claude-review',
    );
  });
});

// ---------- T10-13. README documents $claude-adversarial-review eligibility ----------

describe('README.md documents $claude-adversarial-review eligibility (T10-13)', () => {
  it('documents that stopped jobs with result are eligible for adversarial review', () => {
    const body = readReadme();
    // The adversarial eligibility table shows stopped (with result) = Yes
    assert.ok(
      body.includes('`stopped` (with result)') || body.includes('stopped` (with result)'),
      'README.md must document stopped-with-result as eligible for $claude-adversarial-review',
    );
  });

  it('documents that running jobs are rejected for adversarial review', () => {
    const body = readReadme();
    // The eligibility tables should show running = No for both review commands
    assert.ok(
      body.includes('`running`'),
      'README.md must document running status rejection in adversarial review eligibility',
    );
  });
});

// ---------- T10-14. README documents review commands target latest completed non-review turn ----------

describe('README.md documents review target selection (T10-14)', () => {
  it('contains "latest completed non-review turn" or "skip turns" phrase', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasTarget =
      lower.includes('latest completed non-review turn') ||
      lower.includes('skip turns') ||
      lower.includes('non-review turn');
    assert.ok(
      hasTarget,
      'README.md must document that review commands target the latest completed non-review turn',
    );
  });
});

// ---------- T10-15. README documents reviewOf link for adversarial jobs ----------

describe('README.md documents reviewOf link for adversarial jobs (T10-15)', () => {
  it('contains "reviewOf"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('reviewOf'),
      'README.md must document the reviewOf link on adversarial review jobs',
    );
  });
});

// ---------- T10-16. README documents --allow-edit rejection for review skills ----------

describe('README.md documents --allow-edit rejection for review skills (T10-16)', () => {
  it('contains "--allow-edit" in context of rejection for review skills', () => {
    const body = readReadme();
    assert.ok(
      body.includes('--allow-edit'),
      'README.md must mention --allow-edit in the context of review skills',
    );
  });

  it('has a line containing "--allow-edit" that also mentions rejection or read-only', () => {
    const body = readReadme();
    const lines = body.split('\n');
    const matched = lines
      .filter((l) => l.includes('--allow-edit'))
      .filter((l) => {
        const lower = l.toLowerCase();
        return (
          lower.includes('rejected') ||
          lower.includes('not applicable') ||
          lower.includes('read-only') ||
          lower.includes('does not') ||
          lower.includes('never bypass')
        );
      });
    assert.ok(
      matched.length > 0,
      'README.md must have a line mentioning --allow-edit with a rejection/read-only qualifier for review skills',
    );
  });
});

// ---------- T10-17. README documents $claude-adversarial-review accepts --model/--effort/--permission-mode ----------

describe('README.md documents adversarial-review accepted flags (T10-17)', () => {
  // These flags appear in the adversarial review section (not just the followup section)
  it('contains "--model" in context of adversarial review', () => {
    const body = readReadme();
    const adversarialIdx = body.indexOf('### $claude-adversarial-review');
    assert.ok(adversarialIdx !== -1, 'README.md must have a $claude-adversarial-review section');
    const afterSection = body.slice(adversarialIdx);
    assert.ok(
      afterSection.includes('--model'),
      'README.md $claude-adversarial-review section must mention --model flag',
    );
  });

  it('contains "--effort" in context of adversarial review', () => {
    const body = readReadme();
    const adversarialIdx = body.indexOf('### $claude-adversarial-review');
    const afterSection = body.slice(adversarialIdx);
    assert.ok(
      afterSection.includes('--effort'),
      'README.md $claude-adversarial-review section must mention --effort flag',
    );
  });

  it('contains "--permission-mode" in context of adversarial review', () => {
    const body = readReadme();
    const adversarialIdx = body.indexOf('### $claude-adversarial-review');
    const afterSection = body.slice(adversarialIdx);
    assert.ok(
      afterSection.includes('--permission-mode'),
      'README.md $claude-adversarial-review section must mention --permission-mode flag',
    );
  });
});

// ---------- T10-18. README troubleshooting includes no-result case ----------

describe('README.md troubleshooting includes the no-result case (T10-18)', () => {
  it('contains "### Review fails: job has no result" heading', () => {
    const body = readReadme();
    assert.ok(
      body.includes('### Review fails: job has no result'),
      'README.md troubleshooting must include "### Review fails: job has no result"',
    );
  });
});

// ---------- T10-19. README troubleshooting includes the running-job case ----------

describe('README.md troubleshooting includes the running-job case (T10-19)', () => {
  it('contains "### Review fails: job is still running" heading', () => {
    const body = readReadme();
    assert.ok(
      body.includes('### Review fails: job is still running'),
      'README.md troubleshooting must include "### Review fails: job is still running"',
    );
  });
});

// ---------- T10-20. README troubleshooting suggests adversarial review when same-session unavailable ----------

describe('README.md troubleshooting suggests adversarial review when same-session unavailable (T10-20)', () => {
  it('contains a troubleshooting entry suggesting $claude-adversarial-review as fallback', () => {
    const body = readReadme();
    // The session-no-longer-live troubleshooting entry should suggest adversarial review
    const troubleshootingIdx = body.indexOf('## Troubleshooting');
    assert.ok(troubleshootingIdx !== -1, 'README.md must have a ## Troubleshooting section');
    const troubleshootingSection = body.slice(troubleshootingIdx);
    assert.ok(
      troubleshootingSection.includes('$claude-adversarial-review'),
      'README.md troubleshooting section must mention $claude-adversarial-review as a fallback option',
    );
  });
});

// ---------- T10-21. README known limitations include sycophancy risk ----------

describe('README.md known limitations include sycophancy risk (T10-21)', () => {
  it('contains "sycophantic" or "same-session review can be sycophantic" in Known limitations', () => {
    const body = readReadme();
    const section = extractSection(body, '## Known limitations');
    assert.ok(section !== null, 'README.md must have a ## Known limitations section');
    assert.ok(
      section.includes('sycophantic') || section.toLowerCase().includes('sycophancy'),
      'README.md Known limitations must mention sycophancy risk for same-session review',
    );
  });
});

// ---------- T10-22. README known limitations include best-effort structured parsing ----------

describe('README.md known limitations include best-effort structured parsing (T10-22)', () => {
  it('contains "best-effort" within the Known limitations section', () => {
    const body = readReadme();
    const section = extractSection(body, '## Known limitations');
    assert.ok(section !== null, 'README.md must have a ## Known limitations section');
    assert.ok(
      section.includes('best-effort'),
      'README.md Known limitations must mention best-effort nature of structured review parsing',
    );
  });
});

// ---------- T10-22b. README documents post-exit claude logs fallback ----------

describe('README.md documents plugin-owned result/status as the post-exit logs fallback', () => {
  it('mentions `claude logs <shortId>` job-not-found and points to plugin artifacts', () => {
    const body = readReadme();
    assert.ok(
      body.includes('claude logs <shortId>') && body.includes('job not found'),
      'README.md must document that raw Claude logs can be unavailable after job exit',
    );
    assert.ok(
      body.includes('$claude-status') &&
        body.includes('$claude-wait') &&
        body.includes('$claude-result') &&
        body.includes('$claude-result --partial'),
      'README.md must point users at plugin-owned result/status artifacts',
    );
  });
});

// ---------- T10-23. README known limitations mention no stop-time review gate yet ----------

describe('README.md known limitations mention no stop-time review gate yet (T10-23)', () => {
  it('contains "stop-time review gate" with a "not yet" or "yet" qualifier', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    const hasStopTimeGate =
      lower.includes('stop-time review gate') || lower.includes('no stop-time review gate');
    assert.ok(
      hasStopTimeGate,
      'README.md must mention the stop-time review gate (as a future capability)',
    );
    // Confirm it appears with a "not yet" qualifier (the gate is not yet implemented)
    const idx = lower.indexOf('stop-time review gate');
    const context = lower.slice(Math.max(0, idx - 100), idx + 200);
    assert.ok(
      context.includes('yet') || context.includes('not') || context.includes('plan'),
      'README.md stop-time review gate mention must carry a deferral qualifier (yet/not/plan)',
    );
  });
});

// ---------- T10-24. README documents claude ultrareview distinction (tightened) ----------

describe('README.md documents claude ultrareview distinction (T10-24 — tightened)', () => {
  it('T10-24a: README mentions "claude ultrareview" literally', () => {
    const body = readReadme();
    assert.ok(
      body.includes('claude ultrareview'),
      'README.md must mention "claude ultrareview" literally (fenced or unfenced) so the distinction is explicit',
    );
  });

  it('T10-24b: README states the plugin does not wrap claude ultrareview', () => {
    const body = readReadme();
    // At least one line that mentions ultrareview must also carry a negation token
    const ultraLines = body.split('\n').filter((l) => l.toLowerCase().includes('ultrareview'));
    assert.ok(ultraLines.length > 0, 'README.md must mention ultrareview at least once');
    const negationTokens = ['not', 'does not', 'no ', 'never', 'without', 'separate'];
    const hasNegatedLine = ultraLines.some((l) => {
      const lw = l.toLowerCase();
      return negationTokens.some((tok) => lw.includes(tok));
    });
    assert.ok(
      hasNegatedLine,
      `README.md must have at least one ultrareview line with a negation (not/does not/no/separate). Lines found:\n${ultraLines.join('\n')}`,
    );
  });

  it('T10-24c: README contains the verbatim Review skills intro sentence distinguishing local-session vs ultrareview', () => {
    const body = readReadme();
    const sentence =
      "They do not wrap Anthropic's `claude ultrareview` command, which is a separate Claude Code review surface.";
    assert.ok(
      body.includes(sentence),
      'README.md ## Review skills intro must contain the verbatim ultrareview-distinction sentence',
    );
  });

  it('T10-24d: README contains no positive integration claim for ultrareview', () => {
    const body = readReadme();
    // Positive integration phrases that must NOT appear on a line without a negation
    const positivePatterns = [
      'uses ultrareview',
      'wraps ultrareview',
      'via ultrareview',
      'integrates ultrareview',
    ];
    for (const phrase of positivePatterns) {
      const offending = body
        .split('\n')
        .filter((l) => l.toLowerCase().includes(phrase.toLowerCase()))
        .filter((l) => {
          const lw = l.toLowerCase();
          return !lw.includes('not') && !lw.includes('does not') && !lw.includes('no ');
        });
      assert.equal(
        offending.length,
        0,
        `README.md must not claim "${phrase}" without negation. Offending lines:\n${offending.join('\n')}`,
      );
    }
  });
});

// ---------- T10-25. README contains no OQ4-forbidden cost-claim tokens (extended) ----------
// The main FORBIDDEN_TOKENS / FORBIDDEN_PATTERNS coverage above (tests 15) already covers
// these. This test validates that the review-skills sections specifically do not introduce
// new forbidden tokens. We re-run the same check on the Review skills section only to make
// the scoped assertion explicit.

describe('README.md Review skills section contains no forbidden cost-claim tokens (T10-25)', () => {
  it('Review skills section has no forbidden cost tokens', () => {
    const body = readReadme();
    const reviewIdx = body.indexOf('## Review skills');
    assert.ok(reviewIdx !== -1, 'README.md must have a ## Review skills section');
    // Extract from ## Review skills to the next ## heading
    const afterReview = body.slice(reviewIdx);
    const nextH2 = afterReview.indexOf('\n## ', 1);
    const reviewSection = nextH2 !== -1 ? afterReview.slice(0, nextH2) : afterReview;
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(
        reviewSection.includes(token),
        false,
        `Review skills section contains forbidden cost token "${token}"`,
      );
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(
        pattern.test(reviewSection),
        false,
        `Review skills section matches forbidden cost pattern ${pattern}`,
      );
    }
  });
});

// ---------- T10-26. Cost paragraph still byte-identical after T10 additions ----------
// Already covered by T13-21 above. Documented here for cross-reference per the
// maintainer's pinned list. No new test needed; the T13-21 test is the canonical check.

// ---------- T10-optional-A. Neutral usage wording in adversarial section ----------

describe('README.md adversarial-review section uses neutral usage wording (T10-optional-A)', () => {
  it('adversarial-review section contains the neutral usage sentence', () => {
    const body = readReadme();
    const neutral =
      'This starts a new Claude Code session and may count toward your Claude Code usage.';
    assert.ok(
      body.includes(neutral),
      'README.md $claude-adversarial-review section must contain the neutral usage sentence',
    );
  });
});

// ---------- T10-optional-B. Direct dispatcher usage mentions all commands ----------

describe('README.md Direct dispatcher usage mentions thirty-seven skill commands', () => {
  it('contains "thirty-seven skill commands"', () => {
    const body = readReadme();
    const lower = body.toLowerCase();
    assert.ok(
      lower.includes('thirty-seven skill commands'),
      'README.md Direct dispatcher usage section must say "thirty-seven skill commands"',
    );
  });
});

// ---------- Current v1 scope lists all provider skills ----------

describe('README.md Current v1 scope lists Thirty-seven skills', () => {
  it('contains "Thirty-seven skills" in the Current v1 scope section', () => {
    const body = readReadme();
    const section = extractSection(body, '## Current v1 scope');
    assert.ok(section !== null, 'README.md must have a ## Current v1 scope section');
    assert.ok(
      section.includes('Thirty-seven skills'),
      'README.md ## Current v1 scope must say "Thirty-seven skills"',
    );
  });
});

// ---------- T10-optional-D. What comes next: Plan 0003 marked shipped ----------

describe('README.md What comes next marks Plan 0003 as shipped (T10-optional-D)', () => {
  it('Plan 0003 entry contains "(shipped)"', () => {
    const body = readReadme();
    const whatNextIdx = body.indexOf('## What comes next');
    assert.ok(whatNextIdx !== -1, 'README.md must have a ## What comes next section');
    const section = body.slice(whatNextIdx);
    // Plan 0003 must now be marked shipped
    const plan0003Line = section.split('\n').find((l) => l.includes('Plan 0003'));
    assert.ok(plan0003Line, 'README.md ## What comes next section must mention Plan 0003');
    assert.ok(
      plan0003Line.includes('shipped'),
      `README.md ## What comes next Plan 0003 entry must say "(shipped)" but got: "${plan0003Line.trim()}"`,
    );
  });
});

// ---------- T10-27. README documents operator escape hatches ----------

describe('README.md documents operator escape hatches (T10-27)', () => {
  /** Extract text from "### Tuning operator escape hatches" to the next ### heading or end of file. */
  function extractTuningSubsection(body) {
    const heading = '### Tuning operator escape hatches';
    const idx = body.indexOf(heading);
    if (idx === -1) return null;
    const after = body.slice(idx + heading.length);
    // Find the next ### heading
    const nextH3 = after.indexOf('\n###');
    return nextH3 !== -1 ? after.slice(0, nextH3) : after;
  }

  it('T10-27a: README contains the "### Tuning operator escape hatches" heading exactly', () => {
    const body = readReadme();
    assert.ok(
      body.includes('### Tuning operator escape hatches'),
      'README.md must contain the heading "### Tuning operator escape hatches" exactly',
    );
  });

  it('T10-27b: README mentions CODEX_DELEGATION_ATTACH_WARMUP_MS in fenced-backtick form', () => {
    const body = readReadme();
    assert.ok(
      body.includes('`CODEX_DELEGATION_ATTACH_WARMUP_MS`'),
      'README.md must mention `CODEX_DELEGATION_ATTACH_WARMUP_MS` in fenced-backtick form',
    );
    // Must appear in the Tuning subsection specifically
    const section = extractTuningSubsection(body);
    assert.ok(
      section !== null,
      'README.md must have the Tuning operator escape hatches subsection',
    );
    assert.ok(
      section.includes('`CODEX_DELEGATION_ATTACH_WARMUP_MS`'),
      'The Tuning subsection must mention `CODEX_DELEGATION_ATTACH_WARMUP_MS`',
    );
  });

  it('T10-27c: README mentions CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS in fenced-backtick form', () => {
    const body = readReadme();
    const section = extractTuningSubsection(body);
    assert.ok(
      section !== null,
      'README.md must have the Tuning operator escape hatches subsection',
    );
    assert.ok(
      section.includes('`CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS`'),
      'The Tuning subsection must mention `CODEX_DELEGATION_PROMPT_REGISTER_TIMEOUT_MS` in fenced-backtick form',
    );
  });

  it('T10-27d: README mentions CODEX_DELEGATION_REVIEW_RECONCILE_DELAY_MS in fenced-backtick form', () => {
    const body = readReadme();
    const section = extractTuningSubsection(body);
    assert.ok(
      section !== null,
      'README.md must have the Tuning operator escape hatches subsection',
    );
    assert.ok(
      section.includes('`CODEX_DELEGATION_REVIEW_RECONCILE_DELAY_MS`'),
      'The Tuning subsection must mention `CODEX_DELEGATION_REVIEW_RECONCILE_DELAY_MS` in fenced-backtick form',
    );
  });

  it('T10-27e: README characterizes the env vars as "operator escape hatches"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('operator escape hatches'),
      'README.md must contain the phrase "operator escape hatches"',
    );
  });

  it('T10-27f: The Tuning subsection does not expose env vars as CLI flags', () => {
    const body = readReadme();
    const section = extractTuningSubsection(body);
    assert.ok(
      section !== null,
      'README.md must have the Tuning operator escape hatches subsection',
    );
    // Must not contain a CLI-flag form of the env vars
    assert.equal(
      section.includes('--CODEX_DELEGATION_'),
      false,
      'The Tuning subsection must not expose env vars as --CODEX_DELEGATION_ CLI flags',
    );
    assert.equal(
      section.includes('--codex-delegation-plugin-'),
      false,
      'The Tuning subsection must not expose env vars as --codex-delegation-plugin- CLI flags',
    );
  });

  it('T10-27g: The Tuning subsection contains no OQ4-forbidden cost-claim tokens', () => {
    const body = readReadme();
    const section = extractTuningSubsection(body);
    assert.ok(
      section !== null,
      'README.md must have the Tuning operator escape hatches subsection',
    );
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(
        section.includes(token),
        false,
        `Tuning subsection contains forbidden cost token "${token}"`,
      );
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(
        pattern.test(section),
        false,
        `Tuning subsection matches forbidden cost pattern ${pattern}`,
      );
    }
  });
});

// ==========================================================================
// T1 (Plan 0010): Subagent fan-out patterns section
// ==========================================================================

// ---------- T1-1. Section exists ----------

describe('README.md has ## Subagent fan-out patterns section (T1-1)', () => {
  it('contains "## Subagent fan-out patterns (Codex → Claude Code)"', () => {
    const body = readReadme();
    assert.ok(
      body.includes('## Subagent fan-out patterns (Codex → Claude Code)'),
      'README.md must contain the "## Subagent fan-out patterns (Codex → Claude Code)" section',
    );
  });
});

// ---------- T1-2. Section contains at least 3 example prompts ----------

describe('README.md fan-out section contains at least 3 example prompts (T1-2)', () => {
  it('fan-out section contains at least 3 numbered example prompts', () => {
    const body = readReadme();
    const fanOutIdx = body.indexOf('## Subagent fan-out patterns (Codex → Claude Code)');
    assert.ok(fanOutIdx !== -1, 'Fan-out section must exist');
    const nextH2 = body.indexOf('\n## ', fanOutIdx + 1);
    const section = nextH2 !== -1 ? body.slice(fanOutIdx, nextH2) : body.slice(fanOutIdx);
    // Count numbered example lines (1. 2. 3. etc.) or $claude-delegate example blocks
    const delegateExamples = (section.match(/\$claude-delegate\s+"/g) || []).length;
    assert.ok(
      delegateExamples >= 3,
      `Fan-out section must contain at least 3 $claude-delegate example prompts, found ${delegateExamples}`,
    );
  });
});

// ---------- T1-3. Section is BEFORE the cost paragraph ----------

describe('README.md fan-out section appears before the cost paragraph (T1-3)', () => {
  it('"## Subagent fan-out patterns" appears before "## Cost and prompt-cache wording"', () => {
    const body = readReadme();
    const fanOutIdx = body.indexOf('## Subagent fan-out patterns (Codex → Claude Code)');
    const costIdx = body.indexOf('## Cost and prompt-cache wording');
    assert.ok(fanOutIdx !== -1, 'Fan-out section must exist');
    assert.ok(costIdx !== -1, 'Cost paragraph section must exist');
    assert.ok(
      fanOutIdx < costIdx,
      `Fan-out section (pos ${fanOutIdx}) must appear before cost paragraph (pos ${costIdx})`,
    );
  });
});

// ---------- T1-4. claude-delegate SKILL.md references the new section ----------

describe('claude-delegate SKILL.md references the fan-out section (T1-4)', () => {
  it('claude-delegate/SKILL.md mentions "Subagent fan-out patterns"', () => {
    const skillPath = resolve(PLUGIN_ROOT, 'skills', 'claude-delegate', 'SKILL.md');
    assert.ok(existsSync(skillPath), `SKILL.md not found at ${skillPath}`);
    const body = readFileSync(skillPath, 'utf8');
    assert.ok(
      body.includes('Subagent fan-out patterns'),
      'claude-delegate/SKILL.md must reference the "Subagent fan-out patterns" section',
    );
  });
});

// ---------- T1-5. claude-workflow SKILL.md references the new section ----------

describe('claude-workflow SKILL.md references the fan-out section (T1-5)', () => {
  it('claude-workflow/SKILL.md mentions "Subagent fan-out patterns"', () => {
    const skillPath = resolve(PLUGIN_ROOT, 'skills', 'claude-workflow', 'SKILL.md');
    assert.ok(existsSync(skillPath), `SKILL.md not found at ${skillPath}`);
    const body = readFileSync(skillPath, 'utf8');
    assert.ok(
      body.includes('Subagent fan-out patterns'),
      'claude-workflow/SKILL.md must reference the "Subagent fan-out patterns" section',
    );
  });
});

// ==========================================================================
// T2 (Plan 0010): Dynamic workflows in depth section
// ==========================================================================

/** Return the body of the '## Dynamic workflows in depth' section (heading to next ##). */
function extractDynWorkflowsSection(body) {
  // Use \n## to match only actual headings, not inline references
  const headingMarker = '\n## Dynamic workflows in depth\n';
  const startPos = body.indexOf(headingMarker);
  if (startPos === -1) return null;
  const contentStart = startPos + 1; // include the \n so we start at '## ...'
  const nextH2 = body.indexOf('\n## ', contentStart + headingMarker.length - 1);
  return nextH2 !== -1 ? body.slice(contentStart, nextH2) : body.slice(contentStart);
}

// ---------- T2-1. Section exists ----------

describe('README.md has ## Dynamic workflows in depth section (T2-1)', () => {
  it('contains "## Dynamic workflows in depth" as a standalone heading', () => {
    const body = readReadme();
    assert.ok(
      extractDynWorkflowsSection(body) !== null,
      'README.md must contain the "## Dynamic workflows in depth" section as a standalone heading',
    );
  });
});

// ---------- T2-2. Section contains at least 2 example workflow scripts ----------

describe('README.md dynamic-workflows section contains at least 2 example scripts (T2-2)', () => {
  it('dynamic-workflows section contains at least 2 phase() calls', () => {
    const body = readReadme();
    const section = extractDynWorkflowsSection(body);
    assert.ok(section !== null, 'Dynamic workflows section must exist');
    const phaseMatches = (section.match(/^phase\(/gm) || []).length;
    assert.ok(
      phaseMatches >= 2,
      `Dynamic workflows section must contain at least 2 phase() calls (found ${phaseMatches})`,
    );
  });
});

// ---------- T2-3. Section mentions meta / phase() / agent() primitives ----------

describe('README.md dynamic-workflows section documents meta/phase/agent primitives (T2-3)', () => {
  for (const primitive of ['export const meta', 'phase(', 'agent(']) {
    it(`dynamic-workflows section mentions "${primitive}"`, () => {
      const body = readReadme();
      const section = extractDynWorkflowsSection(body);
      assert.ok(section !== null, 'Dynamic workflows section must exist');
      assert.ok(
        section.includes(primitive),
        `Dynamic workflows section must mention "${primitive}"`,
      );
    });
  }
});

// ---------- T2-4. Section mentions cost / cancel / approval keywords ----------

describe('README.md dynamic-workflows section covers cost/cancel/approval (T2-4)', () => {
  for (const keyword of ['cost', 'cancel', 'approval']) {
    it(`dynamic-workflows section mentions "${keyword}"`, () => {
      const body = readReadme();
      const section = extractDynWorkflowsSection(body);
      assert.ok(section !== null, 'Dynamic workflows section must exist');
      assert.ok(
        section.toLowerCase().includes(keyword.toLowerCase()),
        `Dynamic workflows section must mention "${keyword}"`,
      );
    });
  }
});

// ---------- T2-5. claude-workflow SKILL.md has an example script ----------

describe('claude-workflow SKILL.md has an example workflow script (T2-5)', () => {
  it('claude-workflow/SKILL.md contains "export const meta" and "phase("', () => {
    const skillPath = resolve(PLUGIN_ROOT, 'skills', 'claude-workflow', 'SKILL.md');
    assert.ok(existsSync(skillPath), `SKILL.md not found at ${skillPath}`);
    const body = readFileSync(skillPath, 'utf8');
    assert.ok(
      body.includes('export const meta'),
      'claude-workflow/SKILL.md must contain an example script with "export const meta"',
    );
    assert.ok(
      body.includes('phase('),
      'claude-workflow/SKILL.md must contain an example script with "phase("',
    );
  });
});

// ---------- Plan 0013 T2: --effort clarification regression tests ----------

describe('at least one skill SKILL.md contains the --effort ultracode clarification (Plan 0013 T2)', () => {
  it('claude-workflow/SKILL.md contains the --effort valid-values note', () => {
    const body = readFileSync(
      resolve(PLUGIN_ROOT, 'skills', 'claude-workflow', 'SKILL.md'),
      'utf8',
    );
    assert.ok(
      body.includes('low') && body.includes('xhigh') && body.includes('max'),
      'claude-workflow/SKILL.md must document valid --effort values (low, xhigh, max) per Plan 0013 T2',
    );
    assert.ok(
      body.includes('ultracode') && body.includes('TUI-only'),
      'claude-workflow/SKILL.md must note that ultracode is TUI-only per Plan 0013 T2',
    );
  });
});

// ---------- Plan 0013 T4: saved-workflow docs regression tests ----------

describe('claude-workflow/SKILL.md contains the Saved workflows section (Plan 0013 T4)', () => {
  it('claude-workflow/SKILL.md contains the phrase "Saved workflows"', () => {
    const body = readFileSync(
      resolve(PLUGIN_ROOT, 'skills', 'claude-workflow', 'SKILL.md'),
      'utf8',
    );
    assert.ok(
      body.includes('Saved workflows'),
      'claude-workflow/SKILL.md must contain a "Saved workflows" section per Plan 0013 T4',
    );
  });
});

describe('claude-delegate/SKILL.md cross-references saved workflows (Plan 0013 T4)', () => {
  it('claude-delegate/SKILL.md mentions saved workflows or cross-references $claude-workflow', () => {
    const body = readFileSync(
      resolve(PLUGIN_ROOT, 'skills', 'claude-delegate', 'SKILL.md'),
      'utf8',
    );
    const mentionsSavedWorkflow =
      body.toLowerCase().includes('saved workflow') ||
      body.includes('$claude-workflow') ||
      body.includes('saved-or-bundled-workflow');
    assert.ok(
      mentionsSavedWorkflow,
      'claude-delegate/SKILL.md must cross-reference saved workflows or $claude-workflow per Plan 0013 T4',
    );
  });
});

// ---------- Plan 0015 T2: /tasks and /workflows panel coverage notes ----------

describe('claude-status/SKILL.md documents /tasks panel equivalence (Plan 0015 T2)', () => {
  it('claude-status/SKILL.md mentions /tasks equivalence with claude agents --json', () => {
    const body = readFileSync(resolve(PLUGIN_ROOT, 'skills', 'claude-status', 'SKILL.md'), 'utf8');
    assert.ok(
      body.includes('/tasks'),
      'claude-status/SKILL.md must mention /tasks per Plan 0015 T2',
    );
    assert.ok(
      body.includes('claude agents --json') || body.includes('claude agents'),
      'claude-status/SKILL.md must explain the data source (claude agents --json) per Plan 0015 T2',
    );
  });
});

describe('claude-status/SKILL.md notes /workflows panel deferral (Plan 0015 T2)', () => {
  it('claude-status/SKILL.md mentions /workflows panel and the deferral to Plan 0016', () => {
    const body = readFileSync(resolve(PLUGIN_ROOT, 'skills', 'claude-status', 'SKILL.md'), 'utf8');
    assert.ok(
      body.includes('/workflows'),
      'claude-status/SKILL.md must mention /workflows per Plan 0015 T2',
    );
    assert.ok(
      body.includes('Plan 0016') || body.includes('PTY-injection'),
      'claude-status/SKILL.md must note the deferral to Plan 0016 or PTY-injection per Plan 0015 T2',
    );
  });
});

describe('claude-status/SKILL.md documents claude attach interactive path (Plan 0015 T2)', () => {
  it('claude-status/SKILL.md mentions claude attach for interactive session inspection', () => {
    const body = readFileSync(resolve(PLUGIN_ROOT, 'skills', 'claude-status', 'SKILL.md'), 'utf8');
    assert.ok(
      body.includes('claude attach'),
      'claude-status/SKILL.md must mention claude attach as the interactive path per Plan 0015 T2',
    );
  });
});

describe('README.md documents macOS-safe dispatcher and wait timeout recovery', () => {
  it('warns that bare delegate is Apple clang and points at exact dispatcher hints', () => {
    const body = readFileSync(README_PATH, 'utf8');
    assert.ok(
      body.includes('/usr/bin/delegate'),
      'README.md must mention the macOS delegate collision',
    );
    assert.ok(body.includes('Apple clang'), 'README.md must identify Apple clang');
    assert.ok(
      body.includes('exactActionHints'),
      'README.md must point automation at exactActionHints',
    );
  });

  it('documents timeoutRecovery for wait timeouts and the stable current dispatcher path', () => {
    const body = readFileSync(README_PATH, 'utf8');
    assert.ok(body.includes('timeoutRecovery'), 'README.md must document wait timeoutRecovery');
    assert.ok(
      body.includes('delegate/current/scripts/delegate.mjs'),
      'README.md must mention the stable current dispatcher path',
    );
  });
});
