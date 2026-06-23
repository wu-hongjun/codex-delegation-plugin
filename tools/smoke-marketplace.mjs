#!/usr/bin/env node
/**
 * tools/smoke-marketplace.mjs
 *
 * Plan 0006 T9 release-smoke automation for the committed cc-plugin-codex
 * marketplace layout. Runs the safe, non-TUI portions of the smoke
 * checklist against a real local Codex CLI installation, using an
 * isolated CODEX_HOME so the real $HOME/.codex is never mutated.
 *
 * Codex 0.136.0 exposes no documented non-interactive skill-invocation
 * interface, so this helper covers automated install/list/version
 * assertions only and prints the seventeen-skill manual checklist for the
 * maintainer to run inside Codex. The smoke artifact under the
 * documentation/plan/0006-...-marketplace-packaging-distribution
 * artifacts/ folder records what the helper covered and what was
 * deferred to the manual checklist.
 *
 * Usage:
 *   node tools/smoke-marketplace.mjs [--help]
 *   node tools/smoke-marketplace.mjs [--marketplace-root <path>] [--keep-home]
 *
 * Options:
 *   --marketplace-root <path>   Path to the local marketplace root. Defaults
 *                               to ./marketplace relative to the current
 *                               working directory.
 *   --keep-home                 Do not delete the isolated CODEX_HOME on exit.
 *                               Useful for post-mortem inspection. The path
 *                               is printed at exit.
 *   --help                      Print this usage block and exit 0.
 *
 * Behavior:
 *   1. Runs node tools/package-marketplace.mjs --check first.
 *   2. Creates an isolated CODEX_HOME under the OS tempdir.
 *   3. codex --version (logged).
 *   4. codex plugin marketplace add <marketplace-root>
 *   5. codex plugin add "cc@cc-plugin-codex-local"
 *   6. codex plugin list (parsed for installed,enabled,<plugin-version>).
 *   7. Asserts the plugin appears as installed,enabled at the version
 *      declared in marketplace/plugins/cc/.codex-plugin/plugin.json
 *      (single source of truth; not hard-coded in this script — see T10).
 *   8. Prints the seventeen-skill manual TUI checklist.
 *   9. Cleanup: codex plugin remove + codex plugin marketplace remove.
 *  10. rm -rf CODEX_HOME unless --keep-home.
 *
 * Exit code 0 only when all automated assertions pass. The manual TUI
 * checklist is intentionally not gated by exit code; the maintainer must
 * verify it inside Codex and record the result in the smoke artifact.
 *
 * Not for CI: this script requires the real codex CLI on PATH. The CI
 * matrix never invokes this file. The static test
 * packages/plugin-codex/test/marketplace-smoke.test.mjs verifies the
 * script's shape (--help text, 17 skill names, isolation invariants,
 * cleanup commands) without spawning codex.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_REF = 'cc@cc-plugin-codex-local';
const MARKETPLACE_NAME = 'cc-plugin-codex-local';

// Plan 0006 T10: the expected plugin version is derived from the marketplace
// plugin.json at startup, not hard-coded. The source-of-truth is the source
// plugin.json under packages/plugin-codex/.codex-plugin/, copied byte-identically
// into the marketplace tree by tools/package-marketplace.mjs --write. The
// derivation lives below `parseArgs` so it can use the resolved marketplaceRoot.
const PLUGIN_MANIFEST_REL_PATH = 'plugins/cc/.codex-plugin/plugin.json';

function deriveExpectedVersion(marketplaceRoot) {
  const manifestPath = join(marketplaceRoot, PLUGIN_MANIFEST_REL_PATH);
  if (!existsSync(manifestPath)) {
    throw new Error(`marketplace plugin.json not found at ${manifestPath}`);
  }
  const raw = readFileSync(manifestPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`marketplace plugin.json is not valid JSON: ${e.message}`);
  }
  const version = parsed?.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`marketplace plugin.json has no string "version" field`);
  }
  return version;
}

// All seventeen skills shipped by the cc-plugin-codex marketplace plugin. Order
// follows the natural delegate -> verify lifecycle so the maintainer can
// walk the list inside Codex in a sensible sequence.
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

// ---------------------------------------------------------------------------
// Argument parsing (intentionally tiny — no third-party flags lib)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    help: false,
    keepHome: false,
    marketplaceRoot: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--keep-home') {
      opts.keepHome = true;
    } else if (a === '--marketplace-root') {
      const v = argv[++i];
      if (!v) {
        throw new Error('--marketplace-root requires a path argument');
      }
      opts.marketplaceRoot = v;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  process.stdout.write(
    [
      'tools/smoke-marketplace.mjs — Plan 0006 T9 release-smoke automation',
      '',
      'Usage:',
      '  node tools/smoke-marketplace.mjs [--help]',
      '  node tools/smoke-marketplace.mjs [--marketplace-root <path>] [--keep-home]',
      '',
      'Options:',
      '  --marketplace-root <path>   Path to the local marketplace root.',
      '                              Default: ./marketplace (relative to cwd).',
      '  --keep-home                 Do not delete the isolated CODEX_HOME on exit.',
      '  --help                      Print this help and exit 0.',
      '',
      'The helper runs against the real codex CLI on PATH. It creates an',
      'isolated CODEX_HOME under the OS tempdir so the real $HOME/.codex',
      'is never mutated. Codex 0.136.0 has no documented non-interactive',
      'skill-invocation interface, so the seventeen-skill discovery check must',
      'be run manually inside Codex. The helper prints the skill checklist',
      'after the automated install/list/version assertions pass.',
      '',
      'Seventeen skills covered by the manual TUI checklist:',
      ...SKILL_NAMES.map((s) => `  - $${s}`),
      '',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function logStep(title) {
  process.stdout.write(`\n==> ${title}\n`);
}

function run(cmd, args, opts = {}) {
  process.stdout.write(`+ ${cmd} ${args.map(quoteIfNeeded).join(' ')}\n`);
  const r = spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.stdout.write(`exit=${r.status ?? 'null'}\n`);
  return r;
}

function quoteIfNeeded(s) {
  return /\s|"/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const here = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(here), '..');
const PACKAGE_MARKETPLACE = resolve(REPO_ROOT, 'tools', 'package-marketplace.mjs');

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`smoke-marketplace: ${e.message}\n\n`);
  printHelp();
  process.exit(2);
}

if (opts.help) {
  printHelp();
  process.exit(0);
}

const marketplaceRoot = opts.marketplaceRoot
  ? resolve(opts.marketplaceRoot)
  : resolve(process.cwd(), 'marketplace');

if (!existsSync(marketplaceRoot)) {
  process.stderr.write(`smoke-marketplace: marketplace root not found: ${marketplaceRoot}\n`);
  process.exit(2);
}

const EXPECTED_VERSION = deriveExpectedVersion(marketplaceRoot);

let codexHome = mkdtempSync(join(tmpdir(), 'smoke-codex-home-'));
codexHome = realpathSync(codexHome);
const childEnv = { ...process.env, CODEX_HOME: codexHome };

let failures = 0;
let cleanupRan = false;

function recordFailure(msg) {
  process.stderr.write(`FAIL: ${msg}\n`);
  failures += 1;
}

function safeCleanup() {
  if (cleanupRan) return;
  cleanupRan = true;
  // Best-effort uninstall: ignore errors because the install steps may
  // have failed before reaching the registration phase.
  logStep('Cleanup: codex plugin remove + marketplace remove');
  spawnSync('codex', ['plugin', 'remove', PLUGIN_REF], {
    env: childEnv,
    stdio: 'inherit',
  });
  spawnSync('codex', ['plugin', 'marketplace', 'remove', MARKETPLACE_NAME], {
    env: childEnv,
    stdio: 'inherit',
  });
  if (opts.keepHome) {
    process.stdout.write(`Isolated CODEX_HOME preserved at: ${codexHome}\n`);
  } else {
    try {
      rmSync(codexHome, { recursive: true, force: true });
      process.stdout.write(`Removed isolated CODEX_HOME: ${codexHome}\n`);
    } catch (e) {
      process.stderr.write(`WARN: failed to remove ${codexHome}: ${e.message}\n`);
    }
  }
}

process.on('exit', safeCleanup);
process.on('SIGINT', () => {
  safeCleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  safeCleanup();
  process.exit(143);
});

process.stdout.write(`Plan 0006 T9 release smoke\n`);
process.stdout.write(`Repo root: ${REPO_ROOT}\n`);
process.stdout.write(`Marketplace root: ${marketplaceRoot}\n`);
process.stdout.write(`Isolated CODEX_HOME: ${codexHome}\n`);

// Step 1: package-marketplace --check
logStep('STEP 1: node tools/package-marketplace.mjs --check');
{
  const r = run(process.execPath, [PACKAGE_MARKETPLACE, '--check']);
  if (r.status !== 0) recordFailure('package-marketplace --check did not exit 0');
}

// Step 2: codex --version
logStep('STEP 2: codex --version');
{
  const r = run('codex', ['--version'], { env: childEnv });
  if (r.status !== 0) recordFailure('codex --version did not exit 0');
}

// Step 3: marketplace add
logStep('STEP 3: codex plugin marketplace add');
{
  const r = run('codex', ['plugin', 'marketplace', 'add', marketplaceRoot], {
    env: childEnv,
  });
  if (r.status !== 0) recordFailure('codex plugin marketplace add did not exit 0');
}

// Step 4: plugin add
logStep('STEP 4: codex plugin add');
{
  const r = run('codex', ['plugin', 'add', PLUGIN_REF], { env: childEnv });
  if (r.status !== 0) recordFailure('codex plugin add did not exit 0');
}

// Step 5: plugin list + assertions
logStep('STEP 5: codex plugin list + assertions');
{
  const r = run('codex', ['plugin', 'list'], { env: childEnv });
  if (r.status !== 0) {
    recordFailure('codex plugin list did not exit 0');
  } else {
    const out = (r.stdout || '') + '\n' + (r.stderr || '');
    if (!out.includes(PLUGIN_REF)) {
      recordFailure(`plugin list does not contain ${PLUGIN_REF}`);
    }
    if (!/\binstalled\b/i.test(out)) {
      recordFailure('plugin list does not report the plugin as installed');
    }
    if (!/\benabled\b/i.test(out)) {
      recordFailure('plugin list does not report the plugin as enabled');
    }
    if (!out.includes(EXPECTED_VERSION)) {
      recordFailure(`plugin list does not show expected version ${EXPECTED_VERSION}`);
    }
  }
}

// Step 5.5: dispatcher execution from cache
//
// Spawn `node <PLUGIN_ROOT>/scripts/cc.mjs setup` against the
// cached install to verify the T9.5 fix: the dispatcher must be resolvable
// from the committed bundled node_modules/ tree. The T9 defect was
// ERR_MODULE_NOT_FOUND because the runtime/driver/node-pty packages were
// absent from the marketplace cache. After T9.5 they are bundled, so this
// probe must NOT produce ERR_MODULE_NOT_FOUND.
//
// Exit-code logic: a successful probe returns exit 0; the probe may exit
// non-zero if (for example) the claude binary is missing or fails — that is
// an environment issue, not a packaging defect. The packaging defect is
// specifically ERR_MODULE_NOT_FOUND; its absence is the T9.5 contract.
logStep('STEP 5.5: dispatcher execution from cache');
{
  const pluginRoot = join(
    codexHome,
    'plugins',
    'cache',
    'cc-plugin-codex-local',
    'cc',
    EXPECTED_VERSION,
  );
  const dispatcherScript = join(pluginRoot, 'scripts', 'cc.mjs');
  process.stdout.write(`  Plugin root: ${pluginRoot}\n`);
  process.stdout.write(`  Dispatcher:  ${dispatcherScript}\n`);

  const r = spawnSync(process.execPath, [dispatcherScript, 'setup'], {
    env: childEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  const combined = (r.stdout || '') + (r.stderr || '');
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.stdout.write(`exit=${r.status ?? 'null'}\n`);

  // Extract aggregate line if present (e.g. "aggregate: ok")
  const aggMatch = combined.match(/aggregate:\s*(\S+)/);
  if (aggMatch) {
    process.stdout.write(`  aggregate: ${aggMatch[1]}\n`);
  }

  // T9.5 contract: ERR_MODULE_NOT_FOUND must be absent.
  if (combined.includes('ERR_MODULE_NOT_FOUND')) {
    recordFailure(
      'STEP 5.5: ERR_MODULE_NOT_FOUND in dispatcher output — bundled-dep packaging defect (T9 regression)',
    );
  } else if (r.status === 0) {
    process.stdout.write('  ok    dispatcher-execution    exit 0, no ERR_MODULE_NOT_FOUND\n');
  } else {
    process.stdout.write(
      `  warn  dispatcher-execution    exit ${r.status} (environment issue, not a packaging defect)\n`,
    );
  }
}

// Step 6: manual TUI checklist
logStep('STEP 6: manual Codex TUI skill checklist (operator-driven)');
process.stdout.write(
  [
    'The helper cannot drive the Codex TUI. Open Codex with this isolated',
    `CODEX_HOME and verify each of the 17 skills below is recognized.`,
    '',
    `  CODEX_HOME=${codexHome} codex`,
    '',
    'Skill checklist (each must NOT return an unknown-skill error):',
    ...SKILL_NAMES.map((s) => `  [ ] $${s}`),
    '',
    'Pass criteria:',
    '  - $claude-setup returns an "ok" or "warn" aggregate.',
    '  - The other 16 skills do not return "unknown skill" or',
    '    "unrecognized skill" when invoked or shown in Codex skill',
    '    discovery. A skill that needs a job-id may stop at a usage',
    '    or error message; that still counts as recognized.',
    '',
  ].join('\n'),
);

// Final summary
logStep('Automated smoke summary');
if (failures === 0) {
  process.stdout.write('Automated checks: PASS\n');
} else {
  process.stdout.write(
    `Automated checks: FAIL (${failures} failure${failures === 1 ? '' : 's'})\n`,
  );
}
process.stdout.write(
  'Manual TUI skill checklist: must be verified by the operator and recorded in the smoke artifact.\n',
);

process.exit(failures === 0 ? 0 : 1);
