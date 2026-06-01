// Static-validation tests for .github/workflows/ci.yml — T14
//
// These tests do NOT spawn processes. They verify file existence, required
// substrings, matrix configuration, and the absence of forbidden tokens.
//
// Pattern mirrors skills-manifest.test.mjs: node:test + node:assert/strict, ESM.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- path constants ----------

const here = fileURLToPath(import.meta.url);
// packages/plugin-codex/test/ → packages/plugin-codex/ → packages/ → repo root
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const CI_PATH = resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml');

// ---------- helper ----------

function readCi() {
  return readFileSync(CI_PATH, 'utf8');
}

// ---------- 1. File existence ----------

describe('ci.yml exists', () => {
  it('ci.yml is present at .github/workflows/ci.yml', () => {
    assert.ok(existsSync(CI_PATH), `ci.yml not found at ${CI_PATH}`);
  });
});

// ---------- 2. File is non-empty ----------

describe('ci.yml is non-empty', () => {
  it('file content has length > 0 after trimming', () => {
    const body = readCi();
    assert.ok(body.trim().length > 0, 'ci.yml is empty');
  });
});

// ---------- 3. Workflow name ----------

describe('ci.yml workflow name', () => {
  it('contains "name: CI"', () => {
    const body = readCi();
    assert.ok(body.includes('name: CI'), 'ci.yml does not contain "name: CI"');
  });
});

// ---------- 4. OS matrix ----------

describe('ci.yml OS matrix', () => {
  it('contains "ubuntu-latest"', () => {
    const body = readCi();
    assert.ok(body.includes('ubuntu-latest'), 'ci.yml does not contain "ubuntu-latest"');
  });

  it('contains "macos-latest"', () => {
    const body = readCi();
    assert.ok(body.includes('macos-latest'), 'ci.yml does not contain "macos-latest"');
  });
});

// ---------- 5. Node matrix ----------

describe('ci.yml Node.js matrix', () => {
  it('contains node version 20 in a node: matrix block', () => {
    const body = readCi();
    assert.ok(
      /node:[\s\S]+?-\s*20\b/.test(body),
      'ci.yml does not list Node 20 in a node: matrix block',
    );
  });

  it('contains node version 22 in a node: matrix block', () => {
    const body = readCi();
    assert.ok(
      /node:[\s\S]+?-\s*22\b/.test(body),
      'ci.yml does not list Node 22 in a node: matrix block',
    );
  });
});

// ---------- 6. Actions versions ----------

describe('ci.yml uses correct action versions', () => {
  it('contains "actions/checkout@v6"', () => {
    const body = readCi();
    assert.ok(
      body.includes('actions/checkout@v6'),
      'ci.yml does not contain "actions/checkout@v6"',
    );
  });

  it('contains "actions/setup-node@v6"', () => {
    const body = readCi();
    assert.ok(
      body.includes('actions/setup-node@v6'),
      'ci.yml does not contain "actions/setup-node@v6"',
    );
  });
});

// ---------- 7. npm commands ----------

describe('ci.yml npm commands', () => {
  it('contains "npm ci"', () => {
    const body = readCi();
    assert.ok(body.includes('npm ci'), 'ci.yml does not contain "npm ci"');
  });

  it('contains "npm run lint"', () => {
    const body = readCi();
    assert.ok(body.includes('npm run lint'), 'ci.yml does not contain "npm run lint"');
  });

  it('contains "npm run typecheck"', () => {
    const body = readCi();
    assert.ok(body.includes('npm run typecheck'), 'ci.yml does not contain "npm run typecheck"');
  });

  it('contains "npm run format"', () => {
    const body = readCi();
    assert.ok(body.includes('npm run format'), 'ci.yml does not contain "npm run format"');
  });

  it('contains "npm test"', () => {
    const body = readCi();
    assert.ok(body.includes('npm test'), 'ci.yml does not contain "npm test"');
  });
});

// ---------- 8. Permissions block ----------

describe('ci.yml permissions', () => {
  it('contains "permissions:" followed within a few lines by "contents: read"', () => {
    const body = readCi();
    assert.ok(body.includes('permissions:'), 'ci.yml does not contain "permissions:" key');
    // Find the first permissions: block and check that contents: read appears within 200 chars after it
    const permIdx = body.indexOf('permissions:');
    const snippet = body.slice(permIdx, permIdx + 200);
    assert.ok(
      snippet.includes('contents: read'),
      '"contents: read" does not appear within 200 characters after "permissions:" in ci.yml',
    );
  });
});

// ---------- 9. Triggers ----------

describe('ci.yml triggers', () => {
  it('contains "push:" trigger', () => {
    const body = readCi();
    assert.ok(body.includes('push:'), 'ci.yml does not contain "push:" trigger');
  });

  it('contains "pull_request:" trigger', () => {
    const body = readCi();
    assert.ok(body.includes('pull_request:'), 'ci.yml does not contain "pull_request:" trigger');
  });
});

// ---------- 10. Concurrency ----------

describe('ci.yml concurrency', () => {
  it('contains "concurrency:" block', () => {
    const body = readCi();
    assert.ok(body.includes('concurrency:'), 'ci.yml does not contain "concurrency:" block');
  });

  it('contains "cancel-in-progress: true"', () => {
    const body = readCi();
    assert.ok(
      body.includes('cancel-in-progress: true'),
      'ci.yml does not contain "cancel-in-progress: true"',
    );
  });
});

// ---------- 11. Strategy ----------

describe('ci.yml matrix strategy', () => {
  it('contains "fail-fast: false"', () => {
    const body = readCi();
    assert.ok(body.includes('fail-fast: false'), 'ci.yml does not contain "fail-fast: false"');
  });
});

// ---------- 12. Checkout security ----------

describe('ci.yml secure checkout', () => {
  it('contains "persist-credentials: false"', () => {
    const body = readCi();
    assert.ok(
      body.includes('persist-credentials: false'),
      'ci.yml does not contain "persist-credentials: false"',
    );
  });
});

// ---------- 13. Node caching ----------

describe('ci.yml node caching', () => {
  it('contains "cache: npm"', () => {
    const body = readCi();
    assert.ok(body.includes('cache: npm'), 'ci.yml does not contain "cache: npm"');
  });

  it('contains "cache-dependency-path: package-lock.json"', () => {
    const body = readCi();
    assert.ok(
      body.includes('cache-dependency-path: package-lock.json'),
      'ci.yml does not contain "cache-dependency-path: package-lock.json"',
    );
  });
});

// ---------- 14. Job timeout ----------

describe('ci.yml job timeout', () => {
  it('contains "timeout-minutes:"', () => {
    const body = readCi();
    assert.ok(body.includes('timeout-minutes:'), 'ci.yml does not contain "timeout-minutes:"');
  });
});

// ---------- 15. Forbidden substrings ----------

describe('ci.yml does not contain forbidden substrings', () => {
  it('does not contain "secrets." (no secret references)', () => {
    const body = readCi();
    assert.equal(
      body.includes('${{ secrets.'),
      false,
      'ci.yml contains "${{ secrets." — no secret references are allowed',
    );
  });

  it('does not contain "claude --bg"', () => {
    const body = readCi();
    assert.equal(
      body.includes('claude --bg'),
      false,
      'ci.yml contains forbidden substring "claude --bg"',
    );
  });

  it('does not contain "claude -p"', () => {
    const body = readCi();
    assert.equal(
      body.includes('claude -p'),
      false,
      'ci.yml contains forbidden substring "claude -p"',
    );
  });

  it('does not contain "codex plugin marketplace add"', () => {
    const body = readCi();
    assert.equal(
      body.includes('codex plugin marketplace add'),
      false,
      'ci.yml contains forbidden substring "codex plugin marketplace add"',
    );
  });

  it('does not contain "windows-latest"', () => {
    const body = readCi();
    assert.equal(
      body.includes('windows-latest'),
      false,
      'ci.yml contains "windows-latest" — Windows is not in plan 0001',
    );
  });

  it('does not list Node 24 in the node matrix', () => {
    const body = readCi();
    const nodeBlock = body.match(/node:\s*\n((?:\s+-\s+\d+\s*\n)+)/);
    assert.ok(nodeBlock, 'node matrix block not found in ci.yml');
    assert.equal(
      /^\s*-\s+24\s*$/m.test(nodeBlock[1]),
      false,
      'Node 24 must not be in the matrix — not in plan 0001',
    );
  });
});

describe('ci.yml PTY smoke step (plan 0002)', () => {
  it('contains a "PTY smoke (node-pty)" step name', () => {
    const body = readCi();
    assert.ok(
      body.includes('PTY smoke (node-pty)'),
      'ci.yml must declare a "PTY smoke (node-pty)" step (plan 0002 T1)',
    );
  });

  it('references "node-pty" (required dependency for plan 0002)', () => {
    const body = readCi();
    assert.ok(
      body.includes('node-pty'),
      'ci.yml must reference node-pty in the PTY smoke step (plan 0002 T1)',
    );
  });

  it('runs the PTY smoke step before the test step', () => {
    const body = readCi();
    const ptyIdx = body.indexOf('PTY smoke (node-pty)');
    const testIdx = body.indexOf('- name: Test');
    assert.ok(ptyIdx > 0, 'PTY smoke step not found');
    assert.ok(testIdx > 0, 'Test step not found');
    assert.ok(
      ptyIdx < testIdx,
      'PTY smoke step must appear before the Test step so native-build failures fail CI before the full suite runs',
    );
  });
});

// ==========================================================================
// T14: test:attach lane visibility (plan 0002)
// ==========================================================================

// ---------- T14-1: package.json exports test:attach ----------

describe('package.json declares the test:attach script (plan 0002 T14)', () => {
  it('root package.json has a "test:attach" entry in scripts', () => {
    const pkgPath = resolve(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      pkg.scripts && typeof pkg.scripts['test:attach'] === 'string',
      'root package.json must declare a "test:attach" npm script',
    );
  });
});

// ---------- T14-2: test:attach targets the PTY-dependent driver file(s) ----------

// Note: the PTY-dependent test coverage lives entirely in send.test.mjs
// (which exercises driver.send() + the attachAndSend internal helper). There
// is no separate attach.test.mjs file in the repo — driver-claude-code/test/
// has only: agents-json, logs, probe, pty-probe, send, sidecar, start-session,
// status, stop, transcript. The initial T14 brief listed both, but the actual
// PTY-dependent file is just send.test.mjs. Node 22 silently skips missing
// test paths passed to --test; Node 20 errors. T14's first CI run failed on
// Node 20 for exactly this reason; the script and this assertion were
// tightened to match the on-disk reality.
describe('test:attach targets the PTY-dependent driver test(s) (plan 0002 T14)', () => {
  it('test:attach script body references send.test.mjs', () => {
    const pkgPath = resolve(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const script = pkg.scripts['test:attach'];
    assert.ok(
      script.includes('send.test.mjs'),
      `test:attach must include send.test.mjs: got ${script}`,
    );
  });

  it('test:attach script does not list non-existent test files', () => {
    const pkgPath = resolve(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const script = pkg.scripts['test:attach'];
    // Guard against drift: only reference files that exist on disk.
    assert.ok(
      !script.includes('attach.test.mjs'),
      `test:attach must not reference attach.test.mjs (file does not exist; Node 20 errors on missing --test paths). Got: ${script}`,
    );
  });
});

// ---------- T14-3: ci.yml runs npm run test:attach ----------

describe('ci.yml runs the test:attach lane (plan 0002 T14)', () => {
  it('ci.yml contains "npm run test:attach"', () => {
    const body = readCi();
    assert.ok(
      body.includes('npm run test:attach'),
      'ci.yml must explicitly run "npm run test:attach" as a separate step',
    );
  });
});

// ---------- T14-4: ci.yml has a Test attach lane named step ----------

describe('ci.yml exposes Test attach lane as a named step (plan 0002 T14)', () => {
  it('ci.yml contains "- name: Test attach lane"', () => {
    const body = readCi();
    assert.ok(
      body.includes('- name: Test attach lane'),
      'ci.yml must declare a "Test attach lane" step for visibility',
    );
  });
});

// ---------- T14-5: Test attach lane step appears AFTER the main Test step ----------

describe('Test attach lane step ordering (plan 0002 T14)', () => {
  it('"Test attach lane" appears after "- name: Test" in ci.yml', () => {
    const body = readCi();
    const testIdx = body.indexOf('- name: Test\n');
    const attachIdx = body.indexOf('- name: Test attach lane');
    assert.ok(testIdx > 0, '"- name: Test" step not found in ci.yml');
    assert.ok(attachIdx > 0, '"- name: Test attach lane" step not found in ci.yml');
    assert.ok(
      attachIdx > testIdx,
      'Test attach lane must appear AFTER the main Test step (lane visibility, not a replacement)',
    );
  });
});

// ---------- T14-6: Test attach lane step appears AFTER the PTY smoke step ----------

describe('Test attach lane step ordering vs PTY smoke (plan 0002 T14)', () => {
  it('"Test attach lane" appears after "PTY smoke (node-pty)"', () => {
    const body = readCi();
    const ptyIdx = body.indexOf('PTY smoke (node-pty)');
    const attachIdx = body.indexOf('- name: Test attach lane');
    assert.ok(ptyIdx > 0, 'PTY smoke step not found');
    assert.ok(attachIdx > 0, 'Test attach lane step not found');
    assert.ok(
      attachIdx > ptyIdx,
      'Test attach lane must appear after PTY smoke so PTY build is verified before attach tests run',
    );
  });
});

// ---------- T14-7: Exactly one PTY smoke step (no duplication from T14) ----------

describe('ci.yml contains exactly one PTY smoke step (plan 0002 T14)', () => {
  it('substring "PTY smoke (node-pty)" appears exactly once', () => {
    const body = readCi();
    const matches = body.match(/PTY smoke \(node-pty\)/g) ?? [];
    assert.equal(
      matches.length,
      1,
      `PTY smoke step must appear exactly once in ci.yml; found ${matches.length}`,
    );
  });
});

// ---------- T14-10: No real Claude install command ----------

describe('ci.yml does not install real Claude Code (plan 0002 T14)', () => {
  it('does not contain "npm install -g @anthropic-ai/claude-code"', () => {
    const body = readCi();
    assert.equal(
      body.includes('npm install -g @anthropic-ai/claude-code'),
      false,
      'ci.yml must NOT install the real claude-code binary',
    );
  });

  it('does not contain "npm i -g @anthropic-ai/claude-code"', () => {
    const body = readCi();
    assert.equal(
      body.includes('npm i -g @anthropic-ai/claude-code'),
      false,
      'ci.yml must NOT install the real claude-code binary (short form)',
    );
  });
});

// ---------- T14-11: No real Codex install command ----------

describe('ci.yml does not install real Codex CLI (plan 0002 T14)', () => {
  it('does not contain "@openai/codex" install', () => {
    const body = readCi();
    // Block any install line that targets the codex package.
    const installPatterns = [
      'npm install -g @openai/codex',
      'npm i -g @openai/codex',
      'pip install codex-cli',
      'curl -fsSL https://codex',
    ];
    for (const p of installPatterns) {
      assert.equal(body.includes(p), false, `ci.yml contains forbidden install: "${p}"`);
    }
  });
});

// ---------- T14-12: No benchmark / live E2E in CI ----------

describe('ci.yml does not run benchmarks or live E2E (plan 0002 T14)', () => {
  it('does not contain "npm run bench"', () => {
    const body = readCi();
    assert.equal(body.includes('npm run bench'), false, 'ci.yml must not run benchmarks');
  });

  it('does not contain "npm run e2e"', () => {
    const body = readCi();
    assert.equal(body.includes('npm run e2e'), false, 'ci.yml must not run live E2E');
  });

  it('does not contain "npm run test:e2e"', () => {
    const body = readCi();
    assert.equal(body.includes('npm run test:e2e'), false, 'ci.yml must not run live E2E');
  });
});

// ---------- T14-13: npm test step still exists (existing test step preserved) ----------

describe('ci.yml preserves the main Test step (plan 0002 T14)', () => {
  it('contains both "- name: Test" and "npm test"', () => {
    const body = readCi();
    assert.ok(body.includes('- name: Test\n'), 'ci.yml must keep the "- name: Test" step');
    assert.ok(body.includes('npm test'), 'ci.yml must still run "npm test"');
  });
});
