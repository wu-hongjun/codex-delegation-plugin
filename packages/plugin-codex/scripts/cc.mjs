#!/usr/bin/env node
// cc.mjs — user-facing CLI dispatcher for the cc-plugin-codex plugin.
//
// Subcommands: setup | delegate | workflow | goal | status | result | stop
// Exit codes: 0 success, 1 failure, 2 usage error

import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runDoctor,
  createJob,
  readJob,
  updateJob,
  listJobsForWorkspace,
  listJobs,
  appendEvent,
  reconcileJob,
} from '@cc-plugin-codex/runtime';
import {
  ClaudeBackgroundDriver,
  DRIVER_VERSION,
  ptyBuildExtraProbe,
} from '@cc-plugin-codex/driver-claude-code';

import { parseArgs, resolveJobIdPrefix } from './lib/args.mjs';
import { listWorkflows, inspectWorkflow } from './lib/workflows-inspector.mjs';
import {
  formatSetup,
  formatDelegate,
  formatStatus,
  formatResult,
  formatWait,
  formatStop,
  formatBulkStop,
  formatFollowup,
  formatReviewHuman,
  formatReviewJson,
  formatAdversarialReviewJson,
  formatError,
} from './lib/format.mjs';
import { makeClaudeAdapter } from './lib/adapter.mjs';
import { recordAck, resolveWorkspaceAck } from './lib/ack.mjs';
import { makePromptMeta } from './lib/prompt-meta.mjs';
import { SAME_SESSION_REVIEW_PROMPT, ADVERSARIAL_REVIEW_PROMPT } from './lib/review-prompts.mjs';
import { parseReviewOutput } from './lib/review-parser.mjs';
import { readTurnFinalMessageOrFallback } from './lib/review-result-source.mjs';
import { parseClaudeVersion, meetsFloor } from './lib/claude-version.mjs';

// ---------- plugin version ----------

// Read the canonical plugin version from .codex-plugin/plugin.json (co-located with this
// script's package root) rather than from workspace package.json (which reports 0.0.0 in
// the monorepo root). This matches what `codex plugin list` reports.
function loadPluginVersion() {
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const pluginJsonPath = join(scriptDir, '..', '.codex-plugin', 'plugin.json');
    const raw = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
    return typeof raw.version === 'string' ? raw.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const PLUGIN_VERSION = loadPluginVersion();
const FLOOR_OPUS_4_8 = '2.1.154';
const FLOOR_WORKFLOWS = '2.1.153';
const FLOOR_BG_EXEC = '2.1.154';
const MODEL_ACCESS_MARKER = 'CC_PLUGIN_CODEX_SETUP_MODEL_ACCESS_OK';

const UPGRADE_TARGETS = Object.freeze({
  public: Object.freeze({
    source: 'public',
    marketplace: 'cc-plugin-codex',
    plugin: 'cc@cc-plugin-codex',
    repoUrl: 'https://github.com/wu-hongjun/cc-plugin-codex',
    refreshMarketplace: true,
  }),
  local: Object.freeze({
    source: 'local',
    marketplace: 'cc-plugin-codex-local',
    plugin: 'cc@cc-plugin-codex-local',
    repoUrl: null,
    refreshMarketplace: false,
  }),
});

function readJsonFileMaybe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function findWorkspacePluginVersion(cwd) {
  const candidates = [
    join(cwd, 'packages', 'plugin-codex', '.codex-plugin', 'plugin.json'),
    join(cwd, '.codex-plugin', 'plugin.json'),
  ];
  for (const candidate of candidates) {
    const parsed = readJsonFileMaybe(candidate);
    if (typeof parsed?.version === 'string' && parsed.version.length > 0) {
      return { version: parsed.version, path: candidate };
    }
  }
  return null;
}

function worktreeVersionMismatch(cwd) {
  const worktree = findWorkspacePluginVersion(cwd);
  if (worktree === null || worktree.version === PLUGIN_VERSION) return null;
  return {
    dispatcherVersion: PLUGIN_VERSION,
    worktreeVersion: worktree.version,
    worktreePluginJson: worktree.path,
  };
}

// ---------- startup flag handling ----------

const PERMISSION_MODES = new Set([
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
]);

const STARTUP_ONLY_FLAGS = [
  'model',
  'effort',
  'permission-mode',
  'bypass-permissions',
  'dangerously-skip-permissions',
  'allow-dangerously-skip-permissions',
  'add-dir',
  'mcp-config',
  'name',
  'agent',
  'agents',
  'allowedTools',
  'allowed-tools',
  'disallowedTools',
  'disallowed-tools',
  'tools',
  'settings',
  'setting-sources',
  'strict-mcp-config',
  'append-system-prompt',
  'system-prompt',
  'plugin-dir',
  'plugin-url',
  'bare',
  'safe-mode',
  'ide',
  'chrome',
  'no-chrome',
  'disable-slash-commands',
  'exclude-dynamic-system-prompt-sections',
  'verbose',
];

const PROMPT_DELIMITER_FOOTGUN_FLAGS = new Set([
  'all',
  'all-blocked',
  'all-needs-input',
  'allow-edit',
  'compact',
  'bypass-permissions',
  'dangerously-skip-permissions',
  'dry-run',
  'effort',
  'job',
  'json',
  'limit',
  'model',
  'name',
  'partial',
  'permission-mode',
  'stored-status',
  'timeout',
  'interval',
  'yes',
  ...STARTUP_ONLY_FLAGS,
]);

function promptDelimiterFlagName(token) {
  if (!token.startsWith('--') || token === '--') return null;
  const name = token.slice(2).split('=')[0];
  return PROMPT_DELIMITER_FOOTGUN_FLAGS.has(name) ? name : null;
}

function findLateDispatcherFlagInPrompt(positional, promptStartIndex = 0) {
  let sawPromptText = false;
  for (let i = promptStartIndex; i < positional.length; i += 1) {
    const token = positional[i];
    const flagName = promptDelimiterFlagName(token);
    if (!sawPromptText) {
      if (flagName === null) sawPromptText = true;
      continue;
    }
    if (flagName !== null) return token;
  }
  return null;
}

function rejectLateDispatcherFlagInPrompt(positional, promptStartIndex, commandName, json) {
  const lateFlag = findLateDispatcherFlagInPrompt(positional, promptStartIndex);
  if (lateFlag === null) return false;
  const example = dispatcherCommandForHints(`${commandName} --json --compact -- "<prompt>"`);
  process.stderr.write(
    formatError(
      new Error(
        `${lateFlag} appears after -- and would be sent to Claude as prompt text. Put dispatcher flags before --, for example: ${example}`,
      ),
      commandName,
      json,
    ) + '\n',
  );
  process.exit(2);
  return true;
}

function stringFlag(flags, name) {
  const value = flags[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringListFlag(flags, ...names) {
  const values = [];
  for (const name of names) {
    const value = flags[name];
    if (typeof value === 'string' && value.length > 0) values.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.length > 0) values.push(item);
      }
    }
  }
  return values.length > 0 ? values : undefined;
}

function normalizePermissionMode(flags, commandName, json) {
  const explicitMode = stringFlag(flags, 'permission-mode');
  const bypassPermissions = Boolean(
    flags['bypass-permissions'] || flags['dangerously-skip-permissions'],
  );
  const permissionMode = bypassPermissions ? 'bypassPermissions' : explicitMode;

  if (bypassPermissions && explicitMode !== undefined && explicitMode !== 'bypassPermissions') {
    process.stderr.write(
      formatError(
        new Error(
          '--bypass-permissions and --dangerously-skip-permissions are aliases for --permission-mode bypassPermissions and cannot be combined with a different --permission-mode.',
        ),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  if (permissionMode !== undefined && !PERMISSION_MODES.has(permissionMode)) {
    process.stderr.write(
      formatError(
        new Error(
          `--permission-mode must be one of: ${Array.from(PERMISSION_MODES).join(', ')} (got "${permissionMode}")`,
        ),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  return permissionMode;
}

function buildStartSessionOptions(flags, commandName, json, overrides = {}) {
  const permissionMode = normalizePermissionMode(flags, commandName, json);
  return {
    model: stringFlag(flags, 'model'),
    effort: stringFlag(flags, 'effort'),
    permissionMode,
    dangerouslySkipPermissions: permissionMode === 'bypassPermissions',
    allowDangerouslySkipPermissions: Boolean(flags['allow-dangerously-skip-permissions']),
    addDirs: Array.isArray(flags['add-dir']) ? flags['add-dir'] : [],
    mcpConfig: stringFlag(flags, 'mcp-config'),
    agent: stringFlag(flags, 'agent'),
    agents: stringFlag(flags, 'agents'),
    allowedTools: stringListFlag(flags, 'allowedTools', 'allowed-tools'),
    disallowedTools: stringListFlag(flags, 'disallowedTools', 'disallowed-tools'),
    tools: stringFlag(flags, 'tools'),
    settings: stringFlag(flags, 'settings'),
    settingSources: stringFlag(flags, 'setting-sources'),
    strictMcpConfig: Boolean(flags['strict-mcp-config']),
    appendSystemPrompt: stringFlag(flags, 'append-system-prompt'),
    systemPrompt: stringFlag(flags, 'system-prompt'),
    pluginDirs: stringListFlag(flags, 'plugin-dir'),
    pluginUrls: stringListFlag(flags, 'plugin-url'),
    bare: Boolean(flags['bare']),
    safeMode: Boolean(flags['safe-mode']),
    ide: Boolean(flags['ide']),
    chrome: Boolean(flags['chrome']),
    noChrome: Boolean(flags['no-chrome']),
    disableSlashCommands: Boolean(flags['disable-slash-commands']),
    excludeDynamicSystemPromptSections: Boolean(flags['exclude-dynamic-system-prompt-sections']),
    verbose: Boolean(flags['verbose']),
    ...overrides,
  };
}

function shouldAcknowledgeForStartSession(flags, startSessionOptions) {
  return Boolean(flags['yes']) || startSessionOptions.permissionMode === 'bypassPermissions';
}

function launchPolicyFromStartSessionOptions(startSessionOptions) {
  const permissionMode =
    typeof startSessionOptions.permissionMode === 'string'
      ? startSessionOptions.permissionMode
      : undefined;
  const dangerouslySkipPermissions = Boolean(startSessionOptions.dangerouslySkipPermissions);
  const allowDangerouslySkipPermissions = Boolean(
    startSessionOptions.allowDangerouslySkipPermissions,
  );
  const unattendedRequested = permissionMode === 'bypassPermissions' || dangerouslySkipPermissions;
  return {
    ...(permissionMode !== undefined ? { permissionMode } : {}),
    dangerouslySkipPermissions,
    allowDangerouslySkipPermissions,
    unattendedRequested,
  };
}

async function failUnattendedBypassNeedsInput(job, driver, commandName, json) {
  const waitingFor = job.claude?.waitingFor ?? 'interactive input';
  const now = new Date().toISOString();
  let stopError;
  try {
    await driver.stop(sessionHandleFromJob(job));
    await appendEvent(job.jobId, {
      type: 'session.stopped',
      shortId: job.claude.shortId,
      reason: 'unattended bypass still required interactive input',
      at: now,
    });
  } catch (error) {
    stopError = error;
  }

  const message =
    `Unattended bypass was requested, but Claude Code immediately asked for interactive input (${waitingFor}). ` +
    `Job ${job.jobId} was marked failed${stopError ? '; stopping the Claude session also failed' : ' after a stop attempt'}.`;

  await updateJob(job.jobId, (current) => {
    const turns = Array.isArray(current.turns) ? current.turns.map((turn) => ({ ...turn })) : [];
    if (turns.length > 0) {
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = {
        ...last,
        status: 'failed',
        endedAt: last.endedAt ?? now,
      };
    }
    return {
      ...current,
      status: 'failed',
      errors: [
        ...(Array.isArray(current.errors) ? current.errors : []),
        {
          at: now,
          message,
          cause: stopError instanceof Error ? stopError.message : String(waitingFor),
        },
      ],
      turns,
    };
  });

  process.stderr.write(formatError(new Error(message), commandName, json) + '\n');
  process.exit(1);
}

const REVIEW_SEVERITY_RANK = new Map([
  ['nit', 0],
  ['low', 1],
  ['medium', 2],
  ['high', 3],
  ['blocker', 4],
]);

function parseReviewGate(flags, commandName, json) {
  const failOnFlagPresent = Object.prototype.hasOwnProperty.call(flags, 'fail-on');
  const rawFailOn = stringFlag(flags, 'fail-on');
  const blocking = Boolean(flags['blocking']);
  const allowed = ['fail', 'any', ...REVIEW_SEVERITY_RANK.keys()];

  if (failOnFlagPresent && rawFailOn === undefined) {
    process.stderr.write(
      formatError(
        new Error(`--fail-on requires a value: ${allowed.join(', ')}`),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  if (rawFailOn === undefined && !blocking) return null;

  const failOn = rawFailOn ?? 'high';
  if (!allowed.includes(failOn)) {
    process.stderr.write(
      formatError(
        new Error(`--fail-on must be one of: ${allowed.join(', ')} (got "${failOn}")`),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  return { failOn, source: rawFailOn === undefined ? '--blocking' : `--fail-on ${failOn}` };
}

function reviewGateFailed(review, gate) {
  if (gate === null) return false;
  if (review.verdict === 'fail') return true;
  if (gate.failOn === 'fail') return false;
  if (gate.failOn === 'any') return review.findings.length > 0;

  const threshold = REVIEW_SEVERITY_RANK.get(gate.failOn);
  if (threshold === undefined) return false;
  return review.findings.some((finding) => {
    const rank = REVIEW_SEVERITY_RANK.get(finding.severity) ?? 0;
    return rank >= threshold;
  });
}

function exitIfReviewGateFailed(review, gate, commandName) {
  if (!reviewGateFailed(review, gate)) return;
  process.stderr.write(`[${commandName}] review gate failed (${gate.source})\n`);
  process.exit(1);
}

// ---------- privacy acknowledgement ----------

/**
 * @param {{
 *   workspaceRoot: string;
 *   header: string;
 *   actionLines: string[];
 *   workspaceLabel: string;
 *   nonInteractive: boolean;
 * }} input
 * @returns {string}
 */
function formatPrivacyAckMessage({
  workspaceRoot,
  header,
  actionLines,
  workspaceLabel,
  nonInteractive,
}) {
  return [
    header,
    '',
    ...actionLines,
    '',
    `${workspaceLabel}: ${workspaceRoot}`,
    '',
    nonInteractive
      ? 'Re-run with --yes to acknowledge and proceed.'
      : 'Type yes to acknowledge and proceed, or no to cancel.',
  ].join('\n');
}

function writeRuntimeError(err, commandName, json) {
  const formatted = formatError(err, commandName, json);
  if (json) {
    process.stdout.write(formatted + '\n');
  } else {
    process.stderr.write(formatted + '\n');
  }
}

function shellQuote(value) {
  return JSON.stringify(value);
}

function dispatcherPathForHints() {
  const versioned = fileURLToPath(import.meta.url);
  const pluginRoot = dirname(dirname(versioned));
  const currentDispatcher = join(dirname(pluginRoot), 'current', 'scripts', 'cc.mjs');
  return existsSync(currentDispatcher) ? currentDispatcher : versioned;
}

function dispatcherCommandForHints(command) {
  return `node ${shellQuote(dispatcherPathForHints())} ${command}`;
}

function privacyAckRetryCommand(commandName) {
  const retryArgs = process.argv.slice(2);
  if (!retryArgs.includes('--yes')) {
    const commandIndex = retryArgs.findIndex((arg) => arg === commandName);
    retryArgs.splice(commandIndex >= 0 ? commandIndex + 1 : 0, 0, '--yes');
  }
  return `node ${shellQuote(fileURLToPath(import.meta.url))} ${retryArgs.map(shellQuote).join(' ')}`;
}

function makePrivacyAckError({ message, workspaceRoot, commandName, useYes }) {
  const err = new Error(message);
  err.operation = {
    type: 'ackRequired',
    workspaceRoot,
    retryCommand: privacyAckRetryCommand(commandName),
    persistence: useYes ? 'already_requested' : 'workspace',
    note: '--yes records a persistent plugin privacy acknowledgement for this workspace only; it does not approve Claude Code permission prompts.',
  };
  return err;
}

/**
 * @param {{
 *   workspaceRoot: string;
 *   commandName: string;
 *   json: boolean;
 *   useYes: boolean;
 *   header?: string;
 *   actionLines: string[];
 *   workspaceLabel?: string;
 * }} input
 */
async function ensureWorkspaceAck({
  workspaceRoot,
  commandName,
  json,
  useYes,
  header = 'Privacy acknowledgement required.',
  actionLines,
  workspaceLabel = 'Workspace',
}) {
  const ackResult = resolveWorkspaceAck({
    workspaceRoot,
    useYes,
    isTTY: process.stdin.isTTY === true,
  });
  if (ackResult.verdict !== 'rejected') return;

  if (!process.stdin.isTTY) {
    const msg = formatPrivacyAckMessage({
      workspaceRoot: ackResult.workspaceRoot,
      header,
      actionLines,
      workspaceLabel,
      nonInteractive: true,
    });
    process.stderr.write(
      formatError(
        makePrivacyAckError({
          message: msg,
          workspaceRoot: ackResult.workspaceRoot,
          commandName,
          useYes,
        }),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  const msg = formatPrivacyAckMessage({
    workspaceRoot: ackResult.workspaceRoot,
    header,
    actionLines,
    workspaceLabel,
    nonInteractive: false,
  });
  process.stderr.write(`${msg}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  let answer = '';
  try {
    answer = await rl.question('Do you want to proceed? (yes/no) ');
  } finally {
    rl.close();
  }

  if (/^y(?:es)?$/i.test(answer.trim())) {
    recordAck(ackResult.workspaceRoot);
    return;
  }

  const declineMsg = [
    'Privacy acknowledgement declined.',
    '',
    `${workspaceLabel}: ${ackResult.workspaceRoot}`,
  ].join('\n');
  process.stderr.write(formatError(new Error(declineMsg), commandName, json) + '\n');
  process.exit(1);
}

// ---------- Claude Code skill discovery ----------

function truncateOneLine(value, max = 180) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function parseSimpleFrontmatter(body) {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(body);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readClaudeSkill(skillDir, source) {
  const skillPath = join(skillDir, 'SKILL.md');
  const body = readFileSync(skillPath, 'utf8');
  const fm = parseSimpleFrontmatter(body);
  const fallbackName = basename(skillDir);
  const name = truncateOneLine(fm.name || fallbackName, 80);
  const userInvocable =
    fm['user-invocable'] === undefined ? true : String(fm['user-invocable']) !== 'false';
  return {
    name,
    invocation: `/${name}`,
    description: truncateOneLine(fm.description || '', 360),
    userInvocable,
    path: skillPath,
    source,
  };
}

function collectClaudeSkillDir(root, source, errors) {
  if (!existsSync(root)) return [];
  let stat;
  try {
    stat = statSync(root);
  } catch (err) {
    errors.push({ root, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
  if (!stat.isDirectory()) return [];

  const skills = [];
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (err) {
    errors.push({ root, error: err instanceof Error ? err.message : String(err) });
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(root, entry.name);
    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    try {
      skills.push(readClaudeSkill(skillDir, source));
    } catch (err) {
      errors.push({ root: skillDir, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return skills;
}

function claudeSkillSourceOrderRank(source) {
  if (source?.type === 'project') return 0;
  if (source?.type === 'user') return 1;
  if (source?.type === 'plugin') return 2;
  return 99;
}

function claudeSkillSourceOrderLabel(rank) {
  if (rank === 0) return 'project';
  if (rank === 1) return 'user';
  if (rank === 2) return 'plugin';
  return 'unknown';
}

function claudeSkillDuplicateRef(skill) {
  return {
    name: skill.name,
    invocation: skill.invocation,
    source: skill.source,
    path: skill.path,
  };
}

function annotateClaudeSkillDuplicates(skills) {
  const byName = new Map();
  for (const skill of skills) {
    const group = byName.get(skill.name) ?? [];
    group.push(skill);
    byName.set(skill.name, group);
  }

  const duplicates = [];
  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    const ranked = [...group].sort((a, b) => {
      const byRank = claudeSkillSourceOrderRank(a.source) - claudeSkillSourceOrderRank(b.source);
      if (byRank !== 0) return byRank;
      const bySource = String(a.source.label).localeCompare(String(b.source.label));
      if (bySource !== 0) return bySource;
      return a.path.localeCompare(b.path);
    });

    for (const skill of group) {
      const rank = claudeSkillSourceOrderRank(skill.source);
      skill.duplicateGroup = name;
      skill.duplicateCount = group.length;
      skill.duplicateSourceRank = rank;
      skill.duplicateSource = claudeSkillSourceOrderLabel(rank);
      skill.duplicateAmbiguous = true;
    }

    duplicates.push({
      name,
      invocation: `/${name}`,
      count: group.length,
      sourceOrder: ['project', 'user', 'plugin'],
      resolution: {
        status: 'ambiguous',
        note: 'Duplicate invocation names are reported, not resolved. Claude Code may namespace, reject, or otherwise disambiguate direct slash invocation differently from this catalog.',
      },
      entries: ranked.map((skill) => ({
        ...claudeSkillDuplicateRef(skill),
        duplicateSourceRank: claudeSkillSourceOrderRank(skill.source),
        duplicateSource: claudeSkillSourceOrderLabel(claudeSkillSourceOrderRank(skill.source)),
      })),
    });
  }

  duplicates.sort((a, b) => a.name.localeCompare(b.name));
  return duplicates;
}

function readJsonFileIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function installedClaudePluginEntries(claudeHome) {
  const installedPath = join(claudeHome, 'plugins', 'installed_plugins.json');
  const installed = readJsonFileIfPresent(installedPath);
  if (
    !installed ||
    typeof installed !== 'object' ||
    !installed.plugins ||
    typeof installed.plugins !== 'object'
  ) {
    return [];
  }

  const entries = [];
  for (const [pluginRef, installs] of Object.entries(installed.plugins)) {
    if (!Array.isArray(installs)) continue;
    for (const install of installs) {
      if (!install || typeof install !== 'object') continue;
      if (typeof install.installPath !== 'string' || install.installPath.length === 0) continue;
      entries.push({
        pluginRef,
        installPath: install.installPath,
        version: typeof install.version === 'string' ? install.version : null,
        scope: typeof install.scope === 'string' ? install.scope : null,
      });
    }
  }
  return entries;
}

function discoverClaudeSkills({ cwd = process.cwd(), env = process.env } = {}) {
  const claudeHome = env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME || join(homedir(), '.claude');
  const errors = [];
  const roots = [];
  const skills = [];

  const projectRoot = join(cwd, '.claude', 'skills');
  roots.push({ sourceType: 'project', root: projectRoot });
  skills.push(
    ...collectClaudeSkillDir(
      projectRoot,
      { type: 'project', label: 'project .claude/skills' },
      errors,
    ),
  );

  const userRoot = join(claudeHome, 'skills');
  roots.push({ sourceType: 'user', root: userRoot });
  skills.push(
    ...collectClaudeSkillDir(userRoot, { type: 'user', label: '~/.claude/skills' }, errors),
  );

  for (const plugin of installedClaudePluginEntries(claudeHome)) {
    const root = join(plugin.installPath, 'skills');
    roots.push({
      sourceType: 'plugin',
      root,
      plugin: plugin.pluginRef,
      version: plugin.version,
      scope: plugin.scope,
    });
    skills.push(
      ...collectClaudeSkillDir(
        root,
        {
          type: 'plugin',
          label: plugin.pluginRef,
          plugin: plugin.pluginRef,
          version: plugin.version,
          scope: plugin.scope,
        },
        errors,
      ),
    );
  }

  skills.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return String(a.source.label).localeCompare(String(b.source.label));
  });

  const bySource = { project: 0, user: 0, plugin: 0 };
  for (const skill of skills) {
    if (skill.source.type in bySource) bySource[skill.source.type]++;
  }
  const duplicates = annotateClaudeSkillDuplicates(skills);

  return {
    claudeHome,
    roots,
    counts: {
      total: skills.length,
      uniqueNames: new Set(skills.map((s) => s.name)).size,
      duplicateNames: duplicates.length,
      ...bySource,
    },
    duplicates,
    skills,
    warnings: errors,
  };
}

function formatClaudeSkills(catalog, json) {
  if (json) return JSON.stringify({ ok: true, ...catalog }, null, 2);

  const { counts } = catalog;
  const lines = [
    `Claude Code skills — ${counts.total} installed (${counts.uniqueNames} unique name${counts.uniqueNames === 1 ? '' : 's'})`,
    `  project: ${counts.project}  user: ${counts.user}  plugin: ${counts.plugin}  duplicate names: ${counts.duplicateNames}`,
    '',
    'Use these in delegated Claude prompts as /skill-name when the skill is user-invocable.',
  ];
  if (counts.duplicateNames > 0) {
    lines.push(
      'Duplicate-name note: names are ambiguous; Claude Code may namespace or reject direct slash invocation. Use --json to inspect all entries.',
    );
  }

  if (catalog.skills.length === 0) {
    lines.push(
      '',
      'No Claude Code skills found in project, user, or installed-plugin skill roots.',
    );
  } else {
    lines.push('');
    for (const skill of catalog.skills) {
      const invocable = skill.userInvocable ? skill.invocation : `${skill.invocation} (internal)`;
      const source =
        skill.source.type === 'plugin'
          ? `${skill.source.plugin}${skill.source.version ? ` v${skill.source.version}` : ''}`
          : skill.source.label;
      const desc = skill.description ? ` — ${truncateOneLine(skill.description, 140)}` : '';
      const duplicate = skill.duplicateAmbiguous ? ' (duplicate name: ambiguous)' : '';
      lines.push(`  ${invocable.padEnd(28)} [${source}]${duplicate}${desc}`);
    }
  }

  if (catalog.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of catalog.warnings) {
      lines.push(`  ${warning.root}: ${warning.error}`);
    }
  }

  return lines.join('\n');
}

// ---------- main ----------

const argv = process.argv.slice(2);
const firstArg = argv[0] ?? '';
const versionRequested =
  argv.length > 0 && (firstArg === 'version' || firstArg === '--version' || firstArg === '-v');
if (versionRequested) {
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ ok: true, version: PLUGIN_VERSION }) + '\n');
  } else {
    process.stdout.write(`${PLUGIN_VERSION}\n`);
  }
  process.exit(0);
}

const KNOWN_COMMANDS = new Set([
  'setup',
  'doctor',
  'delegate',
  'workflow',
  'goal',
  'fork',
  'batch',
  'deep-research',
  'status',
  'result',
  'wait',
  'stop',
  'followup',
  'review',
  'adversarial-review',
  'workflows',
  'skills',
  'upgrade',
  'restart',
]);

function inferCommandForParseError(args) {
  return args.find((arg) => KNOWN_COMMANDS.has(arg)) ?? '';
}

let parsed;
try {
  parsed = parseArgs(argv);
} catch (err) {
  const useJsonForParseError = argv.includes('--json');
  process.stderr.write(
    formatError(err, inferCommandForParseError(argv), useJsonForParseError) + '\n',
  );
  process.exit(2);
}
const { command, flags, positional } = parsed;
const useJson = Boolean(flags['json']);

if (flags['help']) {
  printUsage(command);
  process.exit(0);
}

if (!command) {
  printUsage();
  // --help is a user request, not a usage error — exit 0. Only exit 2 when no
  // command was given AND no --help was requested.
  process.exit(2);
}

if (command !== 'doctor' && (flags['real'] !== undefined || flags['claude-access'] !== undefined)) {
  const badFlag = flags['real'] !== undefined ? '--real' : '--claude-access';
  const message =
    badFlag === '--real'
      ? '--real is only supported by cc doctor as a preflight alias; use --chrome when launching Claude Code.'
      : '--claude-access is only supported by cc doctor.';
  process.stderr.write(formatError(new Error(message), command, useJson) + '\n');
  process.exit(2);
}

try {
  switch (command) {
    case 'setup':
      await cmdSetup(flags, useJson);
      break;
    case 'doctor':
      await cmdDoctor(flags, positional, useJson);
      break;
    case 'delegate':
      await cmdDelegate(flags, positional, useJson);
      break;
    case 'restart':
      await cmdRestart(flags, positional, useJson);
      break;
    case 'workflow':
      await cmdWorkflow(flags, positional, useJson);
      break;
    case 'goal':
      await cmdGoal(flags, positional, useJson);
      break;
    case 'fork':
      await cmdFork(flags, positional, useJson);
      break;
    case 'batch':
      await cmdBatch(flags, positional, useJson);
      break;
    case 'deep-research':
      await cmdDeepResearch(flags, positional, useJson);
      break;
    case 'status':
      await cmdStatus(flags, positional, useJson);
      break;
    case 'result':
      await cmdResult(flags, positional, useJson);
      break;
    case 'wait':
      await cmdWait(flags, positional, useJson);
      break;
    case 'stop':
      await cmdStop(flags, positional, useJson);
      break;
    case 'followup':
      await cmdFollowup(flags, positional, useJson);
      break;
    case 'review':
      await cmdReview(flags, positional, useJson);
      break;
    case 'adversarial-review':
      await cmdAdversarialReview(flags, positional, useJson);
      break;
    case 'workflows':
      await cmdWorkflows(flags, positional, useJson);
      break;
    case 'skills':
      await cmdSkills(flags, positional, useJson);
      break;
    case 'upgrade':
      await cmdUpgrade(flags, positional, useJson);
      break;
    default:
      process.stderr.write(
        formatError(new Error(`Unknown command: ${command}`), '', useJson) + '\n',
      );
      printUsage();
      process.exit(2);
  }
} catch (err) {
  if (useJson) {
    process.stdout.write(formatError(err, command, true) + '\n');
  } else {
    process.stderr.write(formatError(err, command, false) + '\n');
  }
  process.exit(1);
}

// ---------- setup ----------

function aggregateProbeStatus(probes) {
  if (probes.some((probe) => probe.status === 'fail')) return 'fail';
  if (probes.some((probe) => probe.status === 'warn')) return 'warn';
  return 'ok';
}

function aggregateCapabilityStatus(probes, capability) {
  return aggregateProbeStatus(
    probes.filter(
      (probe) => Array.isArray(probe.capabilities) && probe.capabilities.includes(capability),
    ),
  );
}

function withAppendedDetail(probe, detail) {
  if (probe.detail.includes(detail)) return probe;
  return { ...probe, detail: `${probe.detail} ${detail}` };
}

function truncateProbeText(value, max = 500) {
  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function normalizeSetupReport(report) {
  const probes = report.probes.map((probe) => {
    if (probe.name === 'sidecar-jobs-dir' && probe.status === 'warn') {
      return withAppendedDetail(
        probe,
        'No action required unless you need Claude sidecar job tracking; follow-up can continue via fallback.',
      );
    }
    if (probe.name === 'claude-bg-flag' && probe.status === 'warn') {
      const bgExec = report.probes.find((p) => p.name === 'bg-exec-supported');
      const noPrompt = report.probes.find((p) => p.name === 'claude-bg-no-prompt');
      if (bgExec?.status === 'ok' || noPrompt?.status === 'ok') {
        return {
          ...probe,
          status: 'ok',
          detail:
            '--bg is not advertised in --help, but version/probe checks confirm background-session support. No action required.',
        };
      }
    }
    return probe;
  });

  return {
    ...report,
    probes,
    status: aggregateProbeStatus(probes),
    delegateCapability: aggregateCapabilityStatus(probes, 'delegate'),
    followupCapability: aggregateCapabilityStatus(probes, 'followup'),
  };
}

function makeSetupExtraProbes() {
  // Inject the driver-owned pty-build probe so the unified setup report covers both
  // Plan 0001 (delegate) and Plan 0002 (follow-up) capability groups. The runtime
  // never imports node-pty directly — the driver supplies the probe via DI.
  //
  // Plan 0007 T3: also inject three version-floor probes that report feature availability
  // based on the locally installed Claude Code version. Floors diverge per empirical
  // evidence on Claude Code v2.1.153: workflows are available, but --bg --exec is
  // silently dropped. Opus 4.8 is unverified at v2.1.153.
  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const modelAccessProbe = {
    name: 'claude-model-access',
    capabilities: ['delegate', 'followup'],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      try {
        const r = await execFileAsync(
          'claude',
          ['--print', `Return exactly: ${MODEL_ACCESS_MARKER}`],
          {
            cwd: opts.cwd ?? process.cwd(),
            env: opts.env ?? process.env,
            timeout: 10000,
            maxBuffer: 1024 * 1024,
          },
        );
        const stdout = r.stdout.trim();
        if (stdout.includes(MODEL_ACCESS_MARKER)) {
          return {
            name: 'claude-model-access',
            status: 'ok',
            detail: 'claude --print can reach the configured Claude model',
            evidence: truncateProbeText(stdout),
          };
        }
        return {
          name: 'claude-model-access',
          status: 'warn',
          detail:
            'claude --print exited successfully but did not echo the setup marker; model access exists, but responses may be altered by policy or prompt handling',
          evidence: truncateProbeText(stdout),
        };
      } catch (err) {
        const stdout = err && typeof err === 'object' && 'stdout' in err ? err.stdout : '';
        const stderr = err && typeof err === 'object' && 'stderr' in err ? err.stderr : '';
        const output = truncateProbeText(`${stdout ?? ''}\n${stderr ?? ''}`);
        const disabledSubscription =
          /disabled Claude subscription access|Use an Anthropic API key/i.test(output);
        return {
          name: 'claude-model-access',
          status: 'fail',
          detail: disabledSubscription
            ? 'Claude Code model access is unavailable: your organization has disabled Claude subscription access. Ask an admin to enable Claude Code access or configure an Anthropic API key before delegating.'
            : `claude --print failed; delegation is expected to fail until Claude Code model access is fixed.${output ? ` Output: ${output}` : ''}`,
          evidence: output || null,
        };
      }
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const opus48Probe = {
    name: 'opus-4-8-supported',
    capabilities: [],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      let stdout = '';
      try {
        const r = await execFileAsync('claude', ['--version'], {
          env: opts.env ?? process.env,
          timeout: 5000,
        });
        stdout = r.stdout.trim();
      } catch {
        stdout = '';
      }
      const version = parseClaudeVersion(stdout);
      if (version === null) {
        return {
          name: 'opus-4-8-supported',
          status: 'warn',
          detail: 'unparseable version',
        };
      }
      if (meetsFloor(version, FLOOR_OPUS_4_8)) {
        return {
          name: 'opus-4-8-supported',
          status: 'ok',
          detail: 'Opus 4.8 supported (--model claude-opus-4-8 available)',
        };
      }
      return {
        name: 'opus-4-8-supported',
        status: 'warn',
        detail: `Opus 4.8 requires Claude Code >= ${FLOOR_OPUS_4_8} (current ${stdout})`,
      };
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const workflowsProbe = {
    name: 'workflows-supported',
    capabilities: [],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      let stdout = '';
      try {
        const r = await execFileAsync('claude', ['--version'], {
          env: opts.env ?? process.env,
          timeout: 5000,
        });
        stdout = r.stdout.trim();
      } catch {
        stdout = '';
      }
      const version = parseClaudeVersion(stdout);
      if (version === null) {
        return {
          name: 'workflows-supported',
          status: 'warn',
          detail: 'unparseable version',
        };
      }
      if (meetsFloor(version, FLOOR_WORKFLOWS)) {
        return {
          name: 'workflows-supported',
          status: 'ok',
          detail: 'Dynamic workflows available via /workflows',
        };
      }
      return {
        name: 'workflows-supported',
        status: 'warn',
        detail: `Dynamic workflows require Claude Code >= ${FLOOR_WORKFLOWS} (current ${stdout})`,
      };
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const bgExecProbe = {
    name: 'bg-exec-supported',
    capabilities: [],
    run: async (opts) => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      let stdout = '';
      try {
        const r = await execFileAsync('claude', ['--version'], {
          env: opts.env ?? process.env,
          timeout: 5000,
        });
        stdout = r.stdout.trim();
      } catch {
        stdout = '';
      }
      const version = parseClaudeVersion(stdout);
      if (version === null) {
        return {
          name: 'bg-exec-supported',
          status: 'warn',
          detail: 'unparseable version',
        };
      }
      if (meetsFloor(version, FLOOR_BG_EXEC)) {
        return {
          name: 'bg-exec-supported',
          status: 'ok',
          detail: 'claude --bg --exec available',
        };
      }
      return {
        name: 'bg-exec-supported',
        status: 'warn',
        detail: `claude --bg --exec requires Claude Code >= ${FLOOR_BG_EXEC} (current ${stdout}); --exec is silently dropped on older versions`,
      };
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const claudeSkillsProbe = {
    name: 'claude-skills',
    capabilities: [],
    run: async (opts) => {
      const catalog = discoverClaudeSkills({
        cwd: opts.cwd ?? process.cwd(),
        env: opts.env ?? process.env,
      });
      const { counts } = catalog;
      return {
        name: 'claude-skills',
        status: catalog.warnings.length > 0 ? 'warn' : 'ok',
        detail: `found ${counts.total} Claude Code skill(s) (${counts.project} project, ${counts.user} user, ${counts.plugin} plugin; ${counts.uniqueNames} unique); run $claude-skills or the dispatcher skills --json command for the catalog`,
        evidence: catalog,
      };
    },
  };

  /** @type {import('@cc-plugin-codex/runtime').DoctorExtraProbe} */
  const worktreeVersionProbe = {
    name: 'cc-worktree-version',
    capabilities: [],
    run: async (opts) => {
      const mismatch = worktreeVersionMismatch(opts.cwd ?? process.cwd());
      if (mismatch === null) {
        return {
          name: 'cc-worktree-version',
          status: 'ok',
          detail: `dispatcher version ${PLUGIN_VERSION} matches visible cc worktree, or no cc worktree was detected`,
        };
      }
      return {
        name: 'cc-worktree-version',
        status: 'warn',
        detail: `dispatcher version ${mismatch.dispatcherVersion} differs from workspace plugin version ${mismatch.worktreeVersion}; refresh the installed plugin or run node packages/plugin-codex/scripts/cc.mjs for development testing`,
        evidence: mismatch,
      };
    },
  };

  return [
    modelAccessProbe,
    ptyBuildExtraProbe,
    opus48Probe,
    workflowsProbe,
    bgExecProbe,
    claudeSkillsProbe,
    worktreeVersionProbe,
  ];
}

async function runSetupDoctorReport() {
  return normalizeSetupReport(
    await runDoctor({
      cwd: process.cwd(),
      readOnly: true,
      writeSnapshot: false,
      extraProbes: makeSetupExtraProbes(),
    }),
  );
}

async function cmdSetup(_flags, json) {
  const report = await runSetupDoctorReport();
  process.stdout.write(formatSetup(report, json) + '\n');
  if (report.status === 'fail') {
    process.exit(1);
  }
}

function findProbe(report, name) {
  return report.probes.find((probe) => probe.name === name) ?? null;
}

function gitShaForCwd(cwd) {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    timeout: 3000,
  });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length > 0 ? sha : null;
}

function buildProbeCheck(report, name, category, label = name) {
  const probe = findProbe(report, name);
  if (probe === null) {
    return {
      name: label,
      category,
      status: 'fail',
      detail: `setup probe ${name} was not present`,
      remediation: 'Run $claude-setup and report the missing probe as a plugin bug.',
    };
  }
  return {
    name: label,
    category,
    status: probe.status,
    detail: probe.detail,
    ...(probe.evidence !== undefined ? { evidence: probe.evidence } : {}),
    ...(probe.status === 'fail' && name === 'claude-model-access'
      ? {
          remediation:
            'Ask an org admin to enable Claude Code subscription access, or configure an Anthropic API key before starting a long delegated job.',
        }
      : {}),
    ...(probe.status === 'fail' && name === 'claude-auth'
      ? { remediation: 'Run `claude login` or fix Claude Code auth before delegating.' }
      : {}),
  };
}

function buildWorkspaceCheck(cwd) {
  try {
    const stat = statSync(cwd);
    return {
      name: 'workspace',
      category: 'workspace',
      status: stat.isDirectory() ? 'ok' : 'fail',
      detail: stat.isDirectory()
        ? `workspace path exists: ${cwd}`
        : `workspace path is not a directory: ${cwd}`,
      evidence: {
        cwd,
        gitSha: gitShaForCwd(cwd),
        writeCheck: 'not_performed_read_only',
      },
    };
  } catch (err) {
    return {
      name: 'workspace',
      category: 'workspace',
      status: 'fail',
      detail: `workspace path is not readable: ${cwd}`,
      evidence: {
        cwd,
        error: err instanceof Error ? err.message : String(err),
        writeCheck: 'not_performed_read_only',
      },
      remediation: 'Start Codex from the target workspace or pass the correct working directory.',
    };
  }
}

function buildPermissionModeCheck(flags, json) {
  const permissionMode = normalizePermissionMode(flags, 'doctor', json) ?? 'default';
  const bypass =
    permissionMode === 'bypassPermissions' ||
    flags['bypass-permissions'] === true ||
    flags['dangerously-skip-permissions'] === true;
  return {
    name: 'permission-mode',
    category: 'permissions',
    status: bypass ? 'ok' : 'warn',
    detail: bypass
      ? 'trusted unattended permission bypass is requested for future delegated jobs'
      : 'default Claude Code permission mode may block unattended jobs on tool prompts',
    evidence: {
      permissionMode,
      unattended: bypass,
      dangerouslySkipPermissions: bypass,
    },
    ...(bypass
      ? {
          launchFlags: [
            '--bypass-permissions',
            '--permission-mode bypassPermissions',
            '--dangerously-skip-permissions',
          ],
        }
      : {
          remediation:
            'For trusted unattended shell/tool work, start the future job with --bypass-permissions or --permission-mode bypassPermissions.',
        }),
  };
}

function buildRealBrowserCheck(flags) {
  const requested = flags['real'] === true || flags['chrome'] === true;
  const disabled = flags['no-chrome'] === true;
  if (!requested && !disabled) {
    return {
      name: 'real-browser',
      category: 'browser_auth',
      status: 'ok',
      detail:
        'real Chrome access not requested; pass --real or --chrome to preflight browser-backed jobs',
      evidence: { requested: false },
    };
  }
  if (requested && disabled) {
    return {
      name: 'real-browser',
      category: 'browser_auth',
      status: 'fail',
      detail: '--real/--chrome conflicts with --no-chrome',
      evidence: { requested: true, noChrome: true },
      remediation: 'Use either --real/--chrome for real browser access or --no-chrome, not both.',
    };
  }

  const help = spawnSync('claude', ['--help'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 5000,
  });
  const output = `${help.stdout ?? ''}\n${help.stderr ?? ''}`;
  const advertisesChrome = output.includes('--chrome');
  if (help.error || help.status !== 0) {
    return {
      name: 'real-browser',
      category: 'browser_auth',
      status: 'fail',
      detail: help.error
        ? `cannot check Claude Code Chrome support: ${help.error.message}`
        : `claude --help exited ${help.status}; cannot verify Chrome support`,
      evidence: { requested: true, alias: flags['real'] === true ? '--real -> --chrome' : null },
      remediation: 'Fix Claude Code installation before starting browser-backed delegated jobs.',
    };
  }

  return {
    name: 'real-browser',
    category: 'browser_auth',
    status: 'warn',
    detail: advertisesChrome
      ? 'Claude Code advertises --chrome. Connected Chrome profile/session auth still cannot be verified non-interactively; browser selection, passkeys, and login gestures may require claude attach.'
      : 'Claude Code help did not advertise --chrome. Browser-backed delegation may fail or require an interactive attach; verify the Claude Code Chrome extension and connected browser before launching a long job.',
    evidence: {
      requested: true,
      launchFlag: '--chrome',
      alias: flags['real'] === true ? '--real -> --chrome' : null,
      advertisedByHelp: advertisesChrome,
      canInspectCookies: false,
      canVerifyProfileLogin: false,
    },
    remediation:
      'Connect only the intended Chrome browser/profile before launch, or start attached and choose the browser interactively.',
  };
}

function aggregateDoctorChecks(checks) {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'ok';
}

function buildDoctorPreflight(report, flags, json) {
  const permissionCheck = buildPermissionModeCheck(flags, json);
  const checks = [
    buildWorkspaceCheck(process.cwd()),
    buildProbeCheck(report, 'claude-auth', 'cli_auth', 'claude-cli-auth'),
    buildProbeCheck(report, 'claude-model-access', 'model_access', 'claude-model-access'),
    buildRealBrowserCheck(flags),
    permissionCheck,
  ];
  const status = aggregateDoctorChecks(checks);
  const blockers = checks.filter((check) => check.status === 'fail').map((check) => check.name);
  const warnings = checks.filter((check) => check.status === 'warn').map((check) => check.name);
  return {
    ok: status !== 'fail',
    status,
    generatedAt: new Date().toISOString(),
    version: PLUGIN_VERSION,
    intent: {
      claudeAccess: flags['claude-access'] === true ? 'required' : 'checked',
      realBrowser: flags['real'] === true || flags['chrome'] === true,
      chromeLaunchFlag:
        flags['real'] === true || flags['chrome'] === true
          ? '--chrome'
          : flags['no-chrome'] === true
            ? '--no-chrome'
            : null,
      permissionMode: permissionCheck.evidence.permissionMode,
      unattended: permissionCheck.evidence.unattended,
      cwd: process.cwd(),
    },
    checks,
    blockers,
    warnings,
    setup: {
      status: report.status,
      delegateCapability: report.delegateCapability,
      followupCapability: report.followupCapability,
    },
    nextAction:
      status === 'fail'
        ? 'fix blockers before starting a long delegated job'
        : status === 'warn'
          ? 'review warnings; browser/profile or permission prompts may still require attach'
          : 'safe to start the requested delegated job',
  };
}

function formatDoctor(preflight, json) {
  if (json) return JSON.stringify(preflight, null, 2);
  const label = preflight.status.toUpperCase();
  const lines = [
    `CC doctor preflight — ${label}`,
    `  summary: ${preflight.nextAction}`,
    `  cwd: ${preflight.intent.cwd}`,
    `  Claude access: ${preflight.intent.claudeAccess}`,
    `  real browser: ${preflight.intent.realBrowser ? preflight.intent.chromeLaunchFlag : 'not requested'}`,
    `  permission mode: ${preflight.intent.permissionMode}`,
    '',
    'Checks:',
  ];
  for (const check of preflight.checks) {
    lines.push(`  ${check.status.padEnd(4)}  ${check.name.padEnd(22)} ${check.detail}`);
    if (check.remediation) lines.push(`        next: ${check.remediation}`);
  }
  if (preflight.blockers.length > 0) {
    lines.push('', `Blockers: ${preflight.blockers.join(', ')}`);
  }
  if (preflight.warnings.length > 0) {
    lines.push('', `Warnings: ${preflight.warnings.join(', ')}`);
  }
  lines.push('', 'Use this before long `delegate`, `workflow`, `batch`, or browser-backed jobs.');
  return lines.join('\n');
}

async function cmdDoctor(flags, positional, json) {
  if (positional.length > 0) {
    process.stderr.write(
      formatError(new Error('cc doctor does not take positional arguments'), 'doctor', json) + '\n',
    );
    process.exit(2);
  }
  const report = await runSetupDoctorReport();
  const preflight = buildDoctorPreflight(report, flags, json);
  process.stdout.write(formatDoctor(preflight, json) + '\n');
  if (preflight.status === 'fail') {
    process.exit(1);
  }
}

// ---------- delegate ----------

async function cmdDelegate(flags, positional, json) {
  // --allow-edit is accepted; no rejection here.
  await _runDelegateCore(flags, positional, json, {
    commandName: 'delegate',
    promptTransformer: (p) => p,
    extraOutput: null,
  });
}

// ---------- workflow ----------

async function cmdWorkflow(flags, positional, json) {
  // --allow-edit is not applicable to workflow; workflows are planning sessions.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to cc workflow.'), 'workflow', json) +
        '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'workflow',
    promptTransformer: (p) => `ultracode: ${p}`,
    extraOutput: (job) =>
      [
        '',
        'This is a Claude Code dynamic workflow request.',
        'Approval is required before workflow subagents start.',
        '',
        `  claude attach ${job.claude.shortId}`,
        '',
        'Then choose Yes, View raw script, or No in Claude Code.',
        'Note: --yes only acknowledges the plugin privacy prompt; it does not approve this workflow gate.',
        'Workflows can spawn up to 16 concurrent agents and 1000 total per run. Token',
        "usage scales with the workflow's complexity.",
      ].join('\n'),
  });
}

// ---------- goal ----------

async function cmdGoal(flags, positional, json) {
  // --allow-edit is not applicable to goal; goal sessions track a condition automatically.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to cc goal.'), 'goal', json) + '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'goal',
    promptTransformer: (p) => `/goal ${p}`,
    extraOutput: (job) =>
      [
        '',
        'This is a Claude Code goal-condition request.',
        'The runtime tracks goal-completion automatically; attach via',
        `claude attach ${job.claude.shortId}`,
        'to watch progress.',
      ].join('\n'),
  });
}

// ---------- fork ----------

async function cmdFork(flags, positional, json) {
  // --allow-edit is not applicable to fork; fork sessions spawn a subagent automatically.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to cc fork.'), 'fork', json) + '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'fork',
    promptTransformer: (p) => `/fork ${p}`,
    extraOutput: (job) =>
      [
        '',
        'This is a Claude Code fork request.',
        'The runtime spawns a real subagent process to execute the directive.',
        'Note: /fork directives consume 20-30k tokens even for trivial directives.',
        `Attach via \`claude attach ${job.claude.shortId}\` to watch progress.`,
      ].join('\n'),
  });
}

// ---------- batch ----------

async function cmdBatch(flags, positional, json) {
  // --allow-edit is not applicable to batch; batch sessions use the orchestration runtime.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(new Error('--allow-edit is not applicable to cc batch.'), 'batch', json) + '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'batch',
    promptTransformer: (p) => `/batch ${p}`,
    extraOutput: (job) =>
      [
        '',
        'This is a Claude Code batch request.',
        'The runtime injects a "# Batch: Parallel Work Orchestration" system prompt.',
        'Batch sessions can spawn multiple parallel tool-calls and subagents.',
        `Attach via \`claude attach ${job.claude.shortId}\` to watch progress.`,
      ].join('\n'),
  });
}

// ---------- deep-research ----------

async function cmdDeepResearch(flags, positional, json) {
  // --allow-edit is not applicable to deep-research; workflow-runtime operations are session-init.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to cc deep-research.'),
        'deep-research',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  await _runDelegateCore(flags, positional, json, {
    commandName: 'deep-research',
    promptTransformer: (p) => `/deep-research ${p}`,
    extraOutput: (job) =>
      [
        '',
        'This is a Claude Code deep-research request.',
        'The /deep-research runtime fans out parallel web searches, fetches sources,',
        'adversarially verifies claims, and synthesizes a cited report.',
        'WebSearch is auto-available in standard bg sessions.',
        'Current Claude Code versions may present a dynamic workflow approval gate.',
        '',
        `  claude attach ${job.claude.shortId}`,
        '',
        'Note: --yes only acknowledges the plugin privacy prompt; it does not approve Claude Code workflow gates.',
      ].join('\n'),
  });
}

// ---------- _runDelegateCore (shared helper) ----------

/**
 * Shared implementation for cmdDelegate and cmdWorkflow.
 *
 * @param {Record<string, unknown>} flags
 * @param {string[]} positional
 * @param {boolean} json
 * @param {{
 *   commandName: string;
 *   promptTransformer: (raw: string) => string;
 *   extraOutput: string | ((job: object) => string) | null;
 *   workspaceRoot?: string;
 * }} opts
 */
async function _runDelegateCore(
  flags,
  positional,
  json,
  { commandName, promptTransformer, extraOutput, workspaceRoot },
) {
  // 1. Collect prompt from positionals (after -- or all remaining).
  rejectLateDispatcherFlagInPrompt(positional, 0, commandName, json);
  const rawPrompt = positional.join(' ').trim();
  if (!rawPrompt) {
    process.stderr.write(
      formatError(
        new Error(`prompt is required: cc ${commandName} -- "<prompt>"`),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  const prompt = promptTransformer(rawPrompt);

  const workspace = workspaceRoot ?? process.cwd();
  const startSessionOptions = buildStartSessionOptions(flags, commandName, json, {
    name: typeof flags['name'] === 'string' ? flags['name'] : undefined,
  });
  const useYes = shouldAcknowledgeForStartSession(flags, startSessionOptions);

  // 2. Privacy ack.
  await ensureWorkspaceAck({
    workspaceRoot: workspace,
    commandName,
    json,
    useYes,
    actionLines: [
      'This command will send your prompt to Claude Code as a background session.',
      'Claude Code will have access to files in the current workspace.',
    ],
  });

  // 3. Build driver.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });

  // 4. Probe.
  const caps = await driver.probe();
  if (caps.health.status === 'fail' || !caps.backgroundSessions || !caps.agentsJson) {
    const failedProbes = caps.health.probes
      .filter((p) => p.status === 'fail')
      .map((p) => `  - ${p.name}: ${p.detail}`)
      .join('\n');
    const detail = [
      'Claude Code is not ready for background sessions.',
      ...(failedProbes ? ['\nFailed probes:', failedProbes] : []),
      ...(!caps.backgroundSessions ? ['\n  - backgroundSessions: not supported'] : []),
      ...(!caps.agentsJson ? ['\n  - agentsJson: not supported'] : []),
      '\nRun: $claude-setup',
    ].join('');
    process.stderr.write(formatError(new Error(detail), commandName, json) + '\n');
    process.exit(1);
  }

  // 5. Prompt meta.
  const { summary, sha256, bytesLen } = makePromptMeta(prompt);

  // 6. Start session.
  const handle = await driver.startSession({
    cwd: workspace,
    prompt,
    ...startSessionOptions,
    allowEdit: Boolean(flags['allow-edit']),
  });

  // 7. Create job record.
  const job = await createJob({
    codex: {
      cwd: workspace,
      pluginVersion: PLUGIN_VERSION,
    },
    workspace: {
      root: workspace,
    },
    driver: {
      name: 'claude-background',
      version: DRIVER_VERSION,
      capabilitiesSnapshot: caps,
    },
    claude: {
      version: caps.claudeVersion ?? 'unknown',
      shortId: handle.shortId,
      sessionName: handle.sessionName,
      cwd: handle.cwd,
      startedAt: handle.startedAt,
      logsCommand: `claude logs ${handle.shortId}`,
      launchPolicy: launchPolicyFromStartSessionOptions(startSessionOptions),
    },
    prompt: { summary, sha256, bytesLen },
  });

  // 8. Build adapter.
  const adapter = makeClaudeAdapter(driver, {
    startedAt: handle.startedAt,
  });

  // 9. Reconcile once.
  let finalJob = job;
  try {
    const reconciled = await reconcileJob(job.jobId, adapter);
    finalJob = reconciled.job;
  } catch {
    // Non-fatal: job was created; reconcile warnings are acceptable on first run.
  }

  if (
    startSessionOptions.permissionMode === 'bypassPermissions' &&
    finalJob.status === 'needs_input'
  ) {
    await failUnattendedBypassNeedsInput(finalJob, driver, commandName, json);
  }

  // 10. Print summary.
  process.stdout.write(
    formatDelegate(finalJob, json, {
      compact: Boolean(flags['compact']),
      dispatcherPath: dispatcherPathForHints(),
    }) + '\n',
  );

  // 11. Workflow-specific note (appended after the standard job block).
  if (extraOutput !== null && !json) {
    const renderedExtra = typeof extraOutput === 'function' ? extraOutput(finalJob) : extraOutput;
    process.stdout.write(renderedExtra + '\n');
  }
}

// ---------- restart ----------

function isStoppableStatus(status) {
  return (
    status === 'queued' ||
    status === 'starting' ||
    status === 'running' ||
    status === 'needs_input' ||
    status === 'awaiting_followup'
  );
}

function sessionHandleFromJob(job) {
  return {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.claude.startedAt ?? job.createdAt,
  };
}

async function stopJobWithDriver(job, driver) {
  await driver.stop(sessionHandleFromJob(job));
  const now = new Date().toISOString();
  const stoppedJob = await updateJob(job.jobId, (current) => ({
    ...current,
    status: 'stopped',
  }));
  await appendEvent(job.jobId, { type: 'stop.completed', at: now });
  return stoppedJob;
}

async function cmdRestart(flags, positional, json) {
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error('usage: cc restart <jobId-or-prefix> [fresh-session-flags] -- "<prompt>"'),
        'restart',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  rejectLateDispatcherFlagInPrompt(positional, 1, 'restart', json);
  const promptParts = positional.slice(1);
  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    const restartExample = dispatcherCommandForHints('restart <jobId> -- "<prompt>"');
    process.stderr.write(
      formatError(
        new Error(
          `restart requires a fresh prompt because cc job records store only prompt metadata. Run: ${restartExample}`,
        ),
        'restart',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listResult = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listResult.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'restart', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  const original = await readJob(jobId);
  const targetWorkspace = original.workspace.root;
  const driver = new ClaudeBackgroundDriver({ cwd: targetWorkspace });

  let stopNote = `Original job ${jobId} was not running; no stop was needed.`;
  if (isStoppableStatus(original.status)) {
    try {
      await stopJobWithDriver(original, driver);
      stopNote = `Original job ${jobId} was stopped before restart.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      await appendEvent(jobId, { type: 'restart.stop_failed', at: now, message });
      stopNote = `Original job ${jobId} could not be stopped first: ${message}`;
    }
  }

  await _runDelegateCore(flags, promptParts, json, {
    commandName: 'restart',
    promptTransformer: (p) => p,
    workspaceRoot: targetWorkspace,
    extraOutput: () =>
      [
        '',
        'Restart context:',
        `  Restarted from: ${jobId}`,
        `  Original prompt summary: ${original.prompt?.summary ?? '(not recorded)'}`,
        `  ${stopNote}`,
      ].join('\n'),
  });
}

// ---------- status ----------

function shouldReconcileForStatusList(job) {
  switch (job.status) {
    case 'completed':
    case 'failed':
    case 'stopped':
    case 'orphaned':
      return false;
    default:
      return true;
  }
}

function updatedAtMs(job) {
  const parsed = Date.parse(job.updatedAt ?? job.createdAt ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortNewestFirst(jobs) {
  return jobs.slice().sort((a, b) => updatedAtMs(b) - updatedAtMs(a));
}

function formatAmbiguousJobPrefix(prefix, candidates) {
  const limit = 10;
  const shown = candidates.slice(0, limit);
  const remaining = Math.max(0, candidates.length - shown.length);
  const suffix =
    remaining > 0 ? `, ... (+${remaining} more; narrow the prefix or pass the full jobId)` : '';
  return `Ambiguous job ID prefix "${prefix}". Matches: ${shown.join(', ')}${suffix}`;
}

function parseStatusLimit(rawLimit, json) {
  if (rawLimit === undefined) return null;
  const text = typeof rawLimit === 'string' ? rawLimit : String(rawLimit);
  if (!/^\d+$/.test(text)) {
    process.stderr.write(
      formatError(
        new Error(`--limit must be a non-negative integer (got "${text}")`),
        'status',
        json,
      ) + '\n',
    );
    process.exit(2);
  }
  return Number.parseInt(text, 10);
}

function parseStoredStatusFilter(rawStatus, json) {
  if (rawStatus === undefined) return null;
  const allowedStatuses = [
    'queued',
    'starting',
    'running',
    'needs_input',
    'awaiting_followup',
    'completed',
    'failed',
    'stopped',
    'orphaned',
  ];
  const status = typeof rawStatus === 'string' ? rawStatus : String(rawStatus);
  if (!allowedStatuses.includes(status)) {
    process.stderr.write(
      formatError(
        new Error(
          `--stored-status must be one of: ${allowedStatuses.join(', ')} (got "${status}")`,
        ),
        'status',
        json,
      ) + '\n',
    );
    process.exit(2);
  }
  return status;
}

function parseDurationMs(rawValue, flagName, defaultMs, commandName, json, opts = {}) {
  if (rawValue === undefined) return defaultMs;
  const text = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
  const match = /^(\d+)(ms|s|m)?$/.exec(text);
  if (!match) {
    process.stderr.write(
      formatError(
        new Error(`--${flagName} must be a duration like 500ms, 30s, or 2m (got "${text}")`),
        commandName,
        json,
      ) + '\n',
    );
    process.exit(2);
  }
  const amount = Number.parseInt(match[1], 10);
  if (amount === 0 && !opts.allowZero) {
    process.stderr.write(
      formatError(new Error(`--${flagName} must be greater than zero`), commandName, json) + '\n',
    );
    process.exit(2);
  }
  const unit = match[2] ?? 's';
  if (unit === 'ms') return amount;
  if (unit === 'm') return amount * 60 * 1000;
  return amount * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isResultTerminalStatus(status) {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'stopped' ||
    status === 'orphaned' ||
    status === 'awaiting_followup'
  );
}

function selectReadableResult(job, allowPartial) {
  const latestTurn = Array.isArray(job.turns) ? job.turns[job.turns.length - 1] : undefined;
  const latestCompletedTurnResult =
    latestTurn?.status === 'completed' &&
    typeof latestTurn.result?.finalMessagePath === 'string' &&
    latestTurn.result.finalMessagePath.length > 0
      ? latestTurn.result
      : undefined;
  const partialResult =
    typeof job.result?.finalMessagePath === 'string' && job.result.finalMessagePath.length > 0
      ? job.result
      : latestTurn?.result;
  const canReadResult =
    isResultTerminalStatus(job.status) ||
    latestCompletedTurnResult !== undefined ||
    (allowPartial && typeof partialResult?.finalMessagePath === 'string');
  const resultContext = allowPartial
    ? (partialResult ?? latestCompletedTurnResult)
    : (latestCompletedTurnResult ?? job.result);
  return {
    latestCompletedTurnResult,
    partialResult,
    canReadResult,
    resultContext,
  };
}

async function readResultTextFromContext(resultContext) {
  if (!resultContext?.finalMessagePath) return null;
  try {
    return await readFile(resultContext.finalMessagePath, 'utf8');
  } catch {
    return null;
  }
}

async function readTranscriptTail(job, maxLines = 12) {
  const transcriptPath = job.claude?.transcriptPath;
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) return null;
  try {
    const text = await readFile(transcriptPath, 'utf8');
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return null;
  }
}

function isWaitSettled(job) {
  return (
    isResultTerminalStatus(job.status) || job.status === 'needs_input' || job.status === 'orphaned'
  );
}

async function cmdStatus(flags, positional, json) {
  const workspace = process.cwd();
  const dispatcherPath = dispatcherPathForHints();
  const showAll = Boolean(flags['all']);
  const compact = Boolean(flags['compact']);
  const jobFlag = flags['job'];
  const limit = parseStatusLimit(flags['limit'], json);
  const storedStatusFilter = parseStoredStatusFilter(flags['stored-status'], json);
  const versionMismatch = worktreeVersionMismatch(workspace);

  // `status` is a list command (current workspace, or every workspace with --all).
  // It does not take a <jobId>; silently ignoring one (printing the full list with
  // exit 0) misleads the caller into thinking they filtered (deep-test Finding 3).
  // Reject an unexpected positional and point at the single-job lookup commands.
  if (positional.length > 0) {
    process.stderr.write(
      formatError(
        new Error(
          `cc status does not take a job id (got "${positional[0]}"). ` +
            `For one job use: ${dispatcherCommandForHints(`status --job ${positional[0]} --json --compact`)}  ` +
            `(or ${dispatcherCommandForHints(`result ${positional[0]}`)} for final output; use status --all to list every workspace).`,
        ),
        'status',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  if (jobFlag !== undefined) {
    const prefix = typeof jobFlag === 'string' ? jobFlag : '';
    if (!prefix) {
      process.stderr.write(
        formatError(new Error('usage: cc status --job <jobId-or-prefix>'), 'status', json) + '\n',
      );
      process.exit(2);
    }

    const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
    const allIds = listed.jobs.map((j) => j.jobId);
    const resolved = resolveJobIdPrefix(allIds, prefix);
    if ('error' in resolved) {
      const msg =
        resolved.error === 'ambiguous'
          ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
          : showAll
            ? `No job found matching "${prefix}"`
            : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
      process.stderr.write(formatError(new Error(msg), 'status', json) + '\n');
      process.exit(1);
    }

    const driver = new ClaudeBackgroundDriver({ cwd: workspace });
    const adapter = makeClaudeAdapter(driver);
    let job =
      listed.jobs.find((j) => j.jobId === resolved.match) ?? (await readJob(resolved.match));
    if (shouldReconcileForStatusList(job)) {
      try {
        const r = await reconcileJob(job.jobId, adapter);
        job = r.job;
      } catch {
        // Keep the stored row if one-job reconcile fails.
      }
    }

    process.stdout.write(
      formatStatus([job], json, workspace, {
        compact: true,
        singleJob: true,
        dispatcherPath,
        versionMismatch,
      }) + '\n',
    );
    return;
  }

  let jobRecords;
  if (showAll) {
    const result = await listJobs();
    jobRecords = result.jobs;
  } else {
    const result = await listJobsForWorkspace(workspace);
    jobRecords = result.jobs;
  }

  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let recordsForDisplay = sortNewestFirst(jobRecords);
  if (storedStatusFilter !== null) {
    recordsForDisplay = recordsForDisplay.filter((job) => job.status === storedStatusFilter);
  }
  const matchedBeforeLimit = recordsForDisplay.length;
  if (limit !== null && limit > 0) {
    recordsForDisplay = recordsForDisplay.slice(0, limit);
  }

  const reconciled = [];
  for (const job of recordsForDisplay) {
    if (!shouldReconcileForStatusList(job)) {
      reconciled.push(job);
      continue;
    }
    try {
      const r = await reconcileJob(job.jobId, adapter);
      reconciled.push(r.job);
    } catch {
      reconciled.push(job);
    }
  }

  const hiddenCount =
    limit !== null && limit > 0 ? Math.max(0, matchedBeforeLimit - recordsForDisplay.length) : 0;
  process.stdout.write(
    formatStatus(reconciled, json, workspace, {
      compact,
      limit,
      storedStatusFilter,
      hiddenCount,
      dispatcherPath,
      versionMismatch,
    }) + '\n',
  );
}

// ---------- result ----------

async function cmdResult(flags, positional, json) {
  const prefix = positional[0];
  const allowPartial = Boolean(flags['partial']);
  const dispatcherPath = dispatcherPathForHints();
  if (!prefix) {
    process.stderr.write(formatError(new Error('usage: cc result <jobId>'), 'result', json) + '\n');
    process.exit(2);
  }

  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'result', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let job;
  try {
    const r = await reconcileJob(jobId, adapter);
    job = r.job;
  } catch {
    job = await readJob(jobId);
  }

  const { partialResult, canReadResult, resultContext } = selectReadableResult(job, allowPartial);

  if (!canReadResult) {
    const partialHint =
      typeof partialResult?.finalMessagePath === 'string'
        ? ` Partial output exists; run: ${dispatcherCommandForHints(`result ${jobId} --partial`)}`
        : '';
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is not complete yet (status: ${job.status}). Run: ${dispatcherCommandForHints(`status --job ${jobId} --json --compact`)}.${partialHint}`,
        ),
        'result',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // Prefer the latest completed turn's immutable result artifact when it exists.
  // Do not treat sendFollowupTurn's immediate empty finalMessagePath as durable
  // result content; that path only becomes reliable after reconciliation writes
  // the per-turn result file.
  const displayJob =
    resultContext !== undefined && resultContext !== job.result
      ? { ...job, result: resultContext }
      : job;
  const resultText = await readResultTextFromContext(resultContext);

  process.stdout.write(
    formatResult(displayJob, resultText, json, {
      compact: Boolean(flags['compact']),
      partial: allowPartial && !isResultTerminalStatus(job.status),
      dispatcherPath,
    }) + '\n',
  );
}

// ---------- wait ----------

async function cmdWait(flags, positional, json) {
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(formatError(new Error('usage: cc wait <jobId>'), 'wait', json) + '\n');
    process.exit(2);
  }
  if (positional.length > 1) {
    process.stderr.write(
      formatError(
        new Error(`cc wait takes exactly one job id (got extra argument "${positional[1]}")`),
        'wait',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  const timeoutMs = parseDurationMs(flags['timeout'], 'timeout', 5 * 60 * 1000, 'wait', json, {
    allowZero: true,
  });
  const intervalMs = parseDurationMs(flags['interval'], 'interval', 2000, 'wait', json);
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const dispatcherPath = dispatcherPathForHints();
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'wait', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  let job = listed.jobs.find((j) => j.jobId === jobId) ?? (await readJob(jobId));
  const driver = new ClaudeBackgroundDriver({ cwd: job.workspace.root });
  const adapter = makeClaudeAdapter(driver);
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;

  for (;;) {
    try {
      const r = await reconcileJob(jobId, adapter);
      job = r.job;
    } catch {
      job = await readJob(jobId);
    }

    if (isWaitSettled(job)) break;

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      timedOut = true;
      break;
    }
    await sleep(Math.min(intervalMs, remaining));
  }

  const { resultContext } = selectReadableResult(job, true);
  const displayJob =
    resultContext !== undefined && resultContext !== job.result
      ? { ...job, result: resultContext }
      : job;
  const [resultText, transcriptTail] = await Promise.all([
    readResultTextFromContext(resultContext),
    readTranscriptTail(job),
  ]);

  process.stdout.write(
    formatWait(displayJob, resultText, json, {
      compact: Boolean(flags['compact']),
      timedOut,
      timeoutMs,
      dispatcherPath,
      transcriptTail,
    }) + '\n',
  );
  if (timedOut) process.exit(1);
}

// ---------- stop ----------

async function cmdStop(flags, positional, json) {
  // Defense-in-depth: --all-idle is not implemented; reject it explicitly so it
  // doesn't silently consume a positional token via the generic flag parser.
  if (flags['all-idle'] !== undefined) {
    process.stderr.write(
      formatError(new Error('Unknown stop flag: --all-idle'), 'stop', json) + '\n',
    );
    process.exit(2);
  }

  const bulkAwaitingFollowup = Boolean(flags['all-awaiting-followup']);
  const bulkNeedsInput = Boolean(flags['all-needs-input'] || flags['all-blocked']);

  if (bulkAwaitingFollowup || bulkNeedsInput) {
    // Bulk path — no positional argument allowed.
    if (positional[0] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            bulkAwaitingFollowup
              ? 'stop --all-awaiting-followup takes no positional argument'
              : 'stop --all-needs-input takes no positional argument',
          ),
          'stop',
          json,
        ) + '\n',
      );
      process.exit(2);
    }

    const workspace = process.cwd();
    const showAll = Boolean(flags['all']);
    const candidates = showAll
      ? (await listJobs()).jobs
      : (await listJobsForWorkspace(workspace)).jobs;

    const driver = new ClaudeBackgroundDriver({ cwd: workspace });
    const adapter = makeClaudeAdapter(driver);

    /** @type {Array<{ jobId: string; shortId: string; status: string }>} */
    const stopped = [];
    /** @type {Array<{ jobId: string; status: string; reason: string }>} */
    const skipped = [];
    /** @type {Array<{ jobId: string; message: string }>} */
    const failed = [];

    const sorted = candidates.slice().sort((a, b) => a.jobId.localeCompare(b.jobId));

    for (const candidate of sorted) {
      // Reconcile to get fresh status, mirroring cmdFollowup pattern.
      let current;
      try {
        const r = await reconcileJob(candidate.jobId, adapter);
        current = r.job;
      } catch {
        current = await readJob(candidate.jobId);
      }

      const targetStatus = bulkAwaitingFollowup ? 'awaiting_followup' : 'needs_input';
      if (current.status !== targetStatus) {
        skipped.push({
          jobId: current.jobId,
          status: current.status,
          reason: bulkAwaitingFollowup ? 'not awaiting_followup' : 'not needs_input',
        });
        continue;
      }

      try {
        await stopJobWithDriver(current, driver);
        stopped.push({
          jobId: current.jobId,
          shortId: current.claude.shortId,
          status: 'stopped',
        });
      } catch (err) {
        failed.push({
          jobId: current.jobId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    process.stdout.write(formatBulkStop({ stopped, skipped, failed, showAll }, json) + '\n');
    process.exit(failed.length > 0 ? 1 : 0);
  }

  // Single-job path.
  const prefix = positional[0];
  if (!prefix) {
    // Bare --all without --all-awaiting-followup is not a valid stop shape; guide the user.
    if (flags['all'] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            'bare --all is not allowed; use --all-awaiting-followup [--all], --all-needs-input [--all], or pass a <jobId>.',
          ),
          'stop',
          json,
        ) + '\n',
      );
      process.exit(2);
    }
    process.stderr.write(formatError(new Error('usage: cc stop <jobId>'), 'stop', json) + '\n');
    process.exit(2);
  }

  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listResult = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listResult.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'stop', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;
  const job = await readJob(jobId);

  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const stoppedJob = await stopJobWithDriver(job, driver);

  process.stdout.write(
    formatStop(stoppedJob, json, {
      compact: Boolean(flags['compact']),
      dispatcherPath: dispatcherPathForHints(),
    }) + '\n',
  );
}

// ---------- sendFollowupTurn (shared helper) ----------

/**
 * Execute a single follow-up turn: append a TurnRecord, fire driver.send,
 * record turn events, and reconcile. Does NOT own: job lookup, eligibility
 * checks, privacy ack, argument parsing, or output formatting. Process exits
 * on permission-handoff timeout (0) and send failure (1) remain inside this
 * helper because they are intrinsic to driver.send's error-path side effects;
 * future review consumers reuse the same exit semantics.
 *
 * @param {{
 *   jobId: string;
 *   prompt: string;
 *   driver: import('@cc-plugin-codex/driver-claude-code').ClaudeBackgroundDriver;
 *   adapter: object;
 *   json: boolean;
 *   sessionHandle: object;
 *   job: object;
 *   promptSummaryPrefix?: string;
 * }} opts
 * @returns {Promise<{ finalJob: object; sendResult: object; newTurnIndex: number; previousTurnPreview: string | null }>}
 */
async function sendFollowupTurn({
  jobId,
  prompt,
  driver,
  adapter,
  json,
  sessionHandle,
  job,
  promptSummaryPrefix,
}) {
  // 9. Build new TurnRecord and append to job.turns.
  const now = new Date().toISOString();
  const newTurnIndex = job.turns.length;
  const previousTurn = job.turns[job.turns.length - 1];
  const previousTurnPreview =
    previousTurn?.result?.finalMessagePreview ?? job.result?.finalMessagePreview ?? null;
  const promptMeta = makePromptMeta(prompt);

  // Apply optional prefix to the turn's prompt.summary (e.g. '[review] ').
  const baseSummary = promptMeta.summary;
  const summary = promptSummaryPrefix ? `${promptSummaryPrefix}${baseSummary}` : baseSummary;
  const newTurn = {
    prompt: { ...promptMeta, summary },
    startedAt: now,
    status: 'injecting',
  };

  await updateJob(jobId, (current) => ({
    ...current,
    status: 'running',
    turns: [...current.turns, newTurn],
  }));

  // 10. Write turn.requested event.
  await appendEvent(jobId, { type: 'turn.requested', at: now, turnIndex: newTurnIndex });

  // 11. Build permission callback and call driver.send (T10 permission-handoff loop).
  //
  // The timeout default is 5 minutes (300_000 ms). Tests may override it via the
  // CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS environment variable. This is a test seam
  // only — do NOT expose it as a CLI flag.
  //
  // Defensive parse: a non-numeric, empty, zero, or negative env-var value falls
  // back to the 5-minute default rather than firing an immediate timeout (which
  // would silently change permission-handoff semantics in CI / misconfigured envs).
  const PERMISSION_TIMEOUT_DEFAULT_MS = 300_000;
  const rawTimeoutOverride = process.env.CC_PLUGIN_CODEX_PERMISSION_TIMEOUT_MS;
  const parsedTimeoutOverride = rawTimeoutOverride ? Number(rawTimeoutOverride) : NaN;
  const PERMISSION_TIMEOUT_MS =
    Number.isFinite(parsedTimeoutOverride) && parsedTimeoutOverride > 0
      ? parsedTimeoutOverride
      : PERMISSION_TIMEOUT_DEFAULT_MS;

  // Flag set by the callback when the 5-minute read times out. Used in the outer
  // catch block to distinguish timeout (exit 0) from hard failures (exit 1).
  let permissionTimedOut = false;

  /**
   * Read one line from stdin with a soft timeout.
   * Returns { timedOut: false, line: string } or { timedOut: true }.
   * @param {number} timeoutMs
   */
  async function readPermissionAnswer(timeoutMs) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const line = await rl.question('> ', { signal: controller.signal });
      return { timedOut: false, line };
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') {
        return { timedOut: true };
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
      rl.close();
    }
  }

  /**
   * onPermissionRequest callback passed to driver.send.
   * @param {{ shortId: string; message?: string }} request
   * @returns {Promise<string | null>}
   */
  async function onPermissionRequest({ shortId: reqShortId }) {
    // Non-TTY: fail closed immediately without printing the prompt.
    if (!process.stdin.isTTY) {
      return null;
    }

    // Print the prompt block to stdout (not stderr), as specified.
    process.stdout.write(
      [
        `Claude is asking for permission inside session ${reqShortId}.`,
        'Type your answer below; we will route it back into the session.',
        '(To abort, press Ctrl+C; the session keeps running.)',
        '',
      ].join('\n'),
    );

    const result = await readPermissionAnswer(PERMISSION_TIMEOUT_MS);

    if (result.timedOut) {
      process.stderr.write(
        `[followup] WARNING: timed out waiting for permission answer for session ${reqShortId}. ` +
          `The session is left in needs_input state. Run \`claude attach ${reqShortId}\` to respond manually.\n`,
      );
      permissionTimedOut = true;
      return null;
    }

    // Trim trailing newline; return the answer (empty string is acceptable).
    return result.line.replace(/\r?\n$/, '');
  }

  let sendResult;
  try {
    sendResult = await driver.send(
      sessionHandle,
      { type: 'text', text: prompt },
      { onPermissionRequest },
    );
  } catch (err) {
    // Check for permission stall.
    const msg = err instanceof Error ? err.message : String(err);
    const isPermissionStall =
      err != null &&
      typeof err === 'object' &&
      'permissionStall' in err &&
      /** @type {Record<string, unknown>} */ (err)['permissionStall'] === true;

    const endedAt = new Date().toISOString();

    // Mark turn failed.
    await updateJob(jobId, (current) => {
      const turns = [...current.turns];
      const failedTurn = turns[newTurnIndex];
      if (failedTurn) {
        turns[newTurnIndex] = { ...failedTurn, status: 'failed', endedAt };
      }
      return { ...current, turns };
    });
    await appendEvent(jobId, {
      type: 'turn.failed',
      at: endedAt,
      turnIndex: newTurnIndex,
      message: msg,
    });

    // Timeout path: the callback returned null after 5 min with no answer.
    // Exit 0 — the job stays in needs_input and the reconciler will surface it.
    if (permissionTimedOut) {
      process.stderr.write(
        `[followup] Permission handoff timed out. Job ${jobId} is left in needs_input state.\n`,
      );
      process.exit(0);
    }

    if (isPermissionStall) {
      writeRuntimeError(
        new Error(
          `Claude is asking for permission. Run claude attach ${sessionHandle.shortId} to approve manually, then retry $claude-followup.`,
        ),
        'followup',
        json,
      );
    } else if (msg.includes('permission required but no response')) {
      // Non-TTY null-return path: driver threw after callback returned null.
      writeRuntimeError(
        new Error(
          `Permission required, but this dispatcher is non-interactive. Run \`claude attach ${sessionHandle.shortId}\` in your own terminal to approve manually.`,
        ),
        'followup',
        json,
      );
    } else {
      writeRuntimeError(err, 'followup', json);
    }
    process.exit(1);
  }

  // 12. On success: update the new turn from sendResult.
  const endedAt = new Date().toISOString();
  const successTurnResult = sendResult.finalMessage
    ? {
        finalMessagePath: '',
        finalMessagePreview: sendResult.finalMessage.slice(0, 160),
        ...(sendResult.touchedFiles ? { touchedFiles: sendResult.touchedFiles } : {}),
        ...(sendResult.usageSnapshot ? { usageSnapshot: sendResult.usageSnapshot } : {}),
      }
    : undefined;

  const updatedJob = await updateJob(jobId, (current) => {
    const turns = [...current.turns];
    const doneTurn = turns[newTurnIndex];
    if (doneTurn) {
      turns[newTurnIndex] = {
        ...doneTurn,
        status: 'completed',
        endedAt,
        ...(successTurnResult ? { result: successTurnResult } : {}),
        ...(sendResult.usageSnapshot ? { usageSnapshot: sendResult.usageSnapshot } : {}),
      };
    }
    return { ...current, turns };
  });

  await appendEvent(jobId, {
    type: 'turn.completed',
    at: endedAt,
    turnIndex: newTurnIndex,
    ...(successTurnResult?.finalMessagePath
      ? { finalMessagePath: successTurnResult.finalMessagePath }
      : {}),
  });

  // 13. Best-effort reconcile after send.
  let finalJob = updatedJob;
  try {
    const r = await reconcileJob(jobId, adapter);
    finalJob = r.job;
  } catch {
    // Non-fatal: surface as warning only.
    process.stderr.write('[followup] warning: post-send reconcile failed\n');
  }

  return { finalJob, sendResult, newTurnIndex, previousTurnPreview };
}

// ---------- followup ----------

async function cmdFollowup(flags, positional, json) {
  // Flags that are startup-only and must be rejected at parse time for followup.
  // Defined locally (not at module scope) because the top-level dispatch switch
  // runs before later module-scope `const` declarations are initialized; a
  // module-scope const referenced from inside an early-dispatch path would hit
  // the temporal-dead-zone (TDZ) and throw `Cannot access ... before initialization`.
  const FOLLOWUP_REJECTED_FLAGS = new Set(STARTUP_ONLY_FLAGS);
  // 1. Check for rejected startup-only flags.
  for (const flag of FOLLOWUP_REJECTED_FLAGS) {
    if (flags[flag] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            `--${flag} is a startup-only flag; use it with $claude-delegate, not $claude-followup.`,
          ),
          'followup',
          json,
        ) + '\n',
      );
      process.exit(2);
    }
  }

  // 2. jobId-or-prefix positional.
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error('usage: cc followup <jobId-or-prefix> [flags] -- "<prompt>"'),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 3. Prompt (remaining positionals after the prefix — everything after --).
  rejectLateDispatcherFlagInPrompt(positional, 1, 'followup', json);
  const promptParts = positional.slice(1);
  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    process.stderr.write(
      formatError(
        new Error(`prompt is required: cc followup <jobId-or-prefix> -- "<prompt>"`),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 4. Prefix resolution.
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'followup', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;

  // 5. Reconcile to get fresh status.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let job;
  try {
    const r = await reconcileJob(jobId, adapter);
    job = r.job;
  } catch {
    job = await readJob(jobId);
  }

  // 6. Status eligibility check.
  const { status } = job;

  if (status === 'running') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is running; wait for $claude-status to show awaiting_followup before sending a follow-up.`,
        ),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (
    status === 'queued' ||
    status === 'starting' ||
    status === 'failed' ||
    status === 'stopped' ||
    status === 'orphaned'
  ) {
    process.stderr.write(
      formatError(
        new Error(`Job ${jobId} is ${status}; start a new $claude-delegate job instead.`),
        'followup',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'completed') {
    // Require a live idle Claude session.
    const sessionHandle = {
      driverName: job.driver.name,
      shortId: job.claude.shortId,
      sessionId: job.claude.sessionId,
      sessionName: job.claude.sessionName,
      cwd: job.claude.cwd,
      startedAt: job.claude.startedAt ?? job.createdAt,
    };
    let driverStatus;
    try {
      driverStatus = await driver.status(sessionHandle);
    } catch {
      driverStatus = null;
    }
    if (!driverStatus || driverStatus.value !== 'idle') {
      process.stderr.write(
        formatError(
          new Error(
            `Job ${jobId} is completed and no live idle Claude session was found; start a new $claude-delegate job instead.`,
          ),
          'followup',
          json,
        ) + '\n',
      );
      process.exit(1);
    }
  }

  // At this point status must be awaiting_followup, needs_input, or completed-with-idle-session.

  // 7. Target-workspace privacy ack — MUST use job.workspace.root, not process.cwd().
  // The dispatcher already resolved the target job above; ack is scoped to the
  // job's workspace so that --all cannot inherit an ack across workspaces.
  await ensureWorkspaceAck({
    workspaceRoot: job.workspace.root,
    commandName: 'followup',
    json,
    useYes: Boolean(flags['yes']),
    header: 'Privacy acknowledgement required for target workspace.',
    actionLines: [
      `This command will inject a follow-up prompt into job ${jobId}.`,
      "Claude Code's existing session has access to files in:",
    ],
    workspaceLabel: 'Target workspace',
  });

  // 8. Reconstitute session handle.
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.claude.startedAt ?? job.createdAt,
  };

  // 9-13. Send the follow-up turn and record all events (delegated to shared helper).
  const { finalJob, sendResult, newTurnIndex, previousTurnPreview } = await sendFollowupTurn({
    jobId,
    prompt,
    driver,
    adapter,
    json,
    sessionHandle,
    job,
    promptSummaryPrefix: undefined, // T3: no prefix; T4 will pass '[review] '
  });

  // 14. Print result.
  process.stdout.write(
    formatFollowup(finalJob, sendResult, newTurnIndex, json, { previousTurnPreview }) + '\n',
  );
}

// ---------- review ----------

async function cmdReview(flags, positional, json) {
  // 1. Parse args: reject startup-only and inapplicable flags at parse time.
  const reviewGate = parseReviewGate(flags, 'review', json);

  // --allow-edit is categorically rejected for all review skills.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to review skills. Reviews are read-only.'),
        'review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // Startup-only flags rejected with the pinned review-specific message.
  const REVIEW_REJECTED_STARTUP_FLAGS = new Set(STARTUP_ONLY_FLAGS);
  for (const flag of REVIEW_REJECTED_STARTUP_FLAGS) {
    if (flags[flag] !== undefined) {
      process.stderr.write(
        formatError(
          new Error(
            `--${flag} is a startup-only flag; use it with $claude-adversarial-review, not $claude-review.`,
          ),
          'review',
          json,
        ) + '\n',
      );
      process.exit(2);
    }
  }

  // 2. jobId-or-prefix positional (required).
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error('usage: cc review <jobId-or-prefix> [--all] [--json] [--yes]'),
        'review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // Reject unexpected freeform positional args beyond the job ID.
  if (positional.length > 1) {
    process.stderr.write(
      formatError(
        new Error(
          'review does not accept a freeform prompt; the dispatcher constructs the review prompt.',
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 3. Resolve job by prefix.
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    // Hint for likely misuse: user may have passed a freeform prompt instead of a jobId.
    if (prefix.includes(' ') || prefix.length > 50 || !prefix.startsWith('job_')) {
      process.stderr.write(
        '[review] Hint: $claude-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?\n',
      );
    }
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'review', json) + '\n');
    process.exit(1);
  }

  const jobId = resolved.match;

  // 4. Reconcile to get fresh status.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let job;
  try {
    const r = await reconcileJob(jobId, adapter);
    job = r.job;
  } catch {
    job = await readJob(jobId);
  }

  // 5. Status eligibility check (§ 3.6).
  const { status } = job;

  if (status === 'needs_input') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} needs input. Resolve the permission request first, then run $claude-review.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'running') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is running; wait for $claude-status to show awaiting_followup before running $claude-review.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'queued' || status === 'starting') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${jobId} is ${status}; wait for the job to reach awaiting_followup before running $claude-review.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'failed' || status === 'stopped' || status === 'orphaned') {
    process.stderr.write(
      formatError(
        new Error(
          `$claude-review is not applicable to ${status} jobs; use $claude-adversarial-review for a fresh-session review of the prior output.`,
        ),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'completed') {
    // Require a live idle Claude session.
    const sessionHandleForStatus = {
      driverName: job.driver.name,
      shortId: job.claude.shortId,
      sessionId: job.claude.sessionId,
      sessionName: job.claude.sessionName,
      cwd: job.claude.cwd,
      startedAt: job.claude.startedAt ?? job.createdAt,
    };
    let driverStatus;
    try {
      driverStatus = await driver.status(sessionHandleForStatus);
    } catch {
      driverStatus = null;
    }
    if (!driverStatus || driverStatus.value !== 'idle') {
      process.stderr.write(
        formatError(
          new Error(
            `Job ${jobId} is completed and no live idle Claude session was found; use $claude-adversarial-review instead.`,
          ),
          'review',
          json,
        ) + '\n',
      );
      process.exit(1);
    }
  }

  // At this point status is awaiting_followup or completed-with-idle-session.

  // 6. Review target selection (§ 3.X): latest completed non-review turn with a result.
  let targetTurn = null;
  let targetTurnIndex = -1;
  for (let i = job.turns.length - 1; i >= 0; i--) {
    const t = job.turns[i];
    if (
      t.status === 'completed' &&
      t.result != null &&
      !t.prompt.summary.startsWith('[review] ') &&
      !t.prompt.summary.startsWith('[adversarial-review] ')
    ) {
      targetTurn = t;
      targetTurnIndex = i;
      break;
    }
  }

  if (targetTurn === null) {
    process.stderr.write(
      formatError(
        new Error('No reviewable non-review output found for this job.'),
        'review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 7. Privacy ack — target workspace, 4-step rule.
  await ensureWorkspaceAck({
    workspaceRoot: job.workspace.root,
    commandName: 'review',
    json,
    useYes: Boolean(flags['yes']),
    header: 'Privacy acknowledgement required for target workspace.',
    actionLines: [
      `This command will inject a review prompt into job ${jobId}.`,
      "Claude Code's existing session has access to files in:",
    ],
    workspaceLabel: 'Target workspace',
  });

  // 8. Build review prompt.
  // SAME_SESSION_REVIEW_PROMPT accepts { targetTurnIndex?, targetTurnPromptSummary? }.
  // Same-session review relies on Claude's in-context memory; no content injection needed.
  const prompt = SAME_SESSION_REVIEW_PROMPT({
    targetTurnIndex,
    targetTurnPromptSummary: targetTurn.prompt.summary,
  });

  // 9. Reconstitute session handle.
  const sessionHandle = {
    driverName: job.driver.name,
    shortId: job.claude.shortId,
    sessionId: job.claude.sessionId,
    sessionName: job.claude.sessionName,
    cwd: job.claude.cwd,
    startedAt: job.claude.startedAt ?? job.createdAt,
  };

  // 10. Call shared helper to send the review turn.
  const { finalJob, sendResult, newTurnIndex } = await sendFollowupTurn({
    jobId,
    prompt,
    driver,
    adapter,
    json,
    sessionHandle,
    job,
    promptSummaryPrefix: '[review] ',
  });

  // 11. Plan 0003 T12b: parse structured findings from the *reconciled* review
  // turn's full result file, not from sendResult.finalMessage. The driver's
  // sendResult.finalMessage is sourced from sidecar `output.result`, which on
  // Claude Code 2.1.150 ends up as a short SUMMARY string ("review verdict:
  // pass — all TODOs found, no omissions") rather than the full assistant
  // message containing the fenced JSON block. The reconciler (transcript /
  // sidecar / logs path) populates `<jobId>.result.md` and mirrors it onto
  // `turn.result.finalMessagePath` — reading that file gives us the
  // structured JSON parseReviewOutput needs. Fall back to
  // sendResult.finalMessage only if the reconciled result file is missing
  // or empty (e.g., when sidecar emits the summary but logs/transcript are
  // not yet flushed). See lib/review-result-source.mjs for the resolver.
  // T12b: Claude Code 2.1.150 can take 3-5 s after the turn-complete state
  // flips to flush its final assistant message to the transcript file. The
  // reconcile inside sendFollowupTurn may race with that flush; this second
  // reconcile gives the transcript path a chance to land the structured
  // output before we read it. Bounded by a brief deterministic sleep so
  // mock-claude tests (which respond instantly) don't slow down.
  let reviewJobForParse = finalJob;
  // Brief pre-reconcile wait so Claude has a moment to flush. The wait is
  // bypassed entirely under the test seam CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS
  // (set to 0 by the mock-driven test env).
  const reviewWaitRaw = process.env.CC_PLUGIN_CODEX_REVIEW_RECONCILE_DELAY_MS;
  const reviewWaitParsed = reviewWaitRaw != null ? Number(reviewWaitRaw) : NaN;
  const REVIEW_RECONCILE_DELAY_MS = Number.isFinite(reviewWaitParsed)
    ? Math.max(0, reviewWaitParsed)
    : 8_000;
  if (REVIEW_RECONCILE_DELAY_MS > 0) {
    await new Promise((res) => setTimeout(() => res(undefined), REVIEW_RECONCILE_DELAY_MS));
  }
  try {
    const r2 = await reconcileJob(jobId, adapter);
    reviewJobForParse = r2.job;
  } catch {
    // Non-fatal: keep finalJob from sendFollowupTurn.
  }
  const reviewTurnAfter = reviewJobForParse.turns[newTurnIndex];
  const reviewTextSource = await readTurnFinalMessageOrFallback(
    reviewTurnAfter,
    sendResult.finalMessage,
  );

  const review = parseReviewOutput(reviewTextSource);

  // 12. Format and print.
  const reviewTurn = reviewJobForParse.turns[newTurnIndex];
  const turnMeta = {
    index: newTurnIndex,
    status: reviewTurn?.status ?? 'completed',
  };

  if (json) {
    process.stdout.write(
      formatReviewJson({ review, job: reviewJobForParse, turn: turnMeta }) + '\n',
    );
  } else {
    process.stdout.write(
      formatReviewHuman({ review, job: reviewJobForParse, turn: turnMeta }) + '\n',
    );
  }
  exitIfReviewGateFailed(review, reviewGate, 'review');
}

// ---------- adversarial-review ----------

async function cmdAdversarialReview(flags, positional, json) {
  // 1. Parse args: reject inapplicable flags at parse time.
  const reviewGate = parseReviewGate(flags, 'adversarial-review', json);
  const permissionMode = normalizePermissionMode(flags, 'adversarial-review', json);

  // --allow-edit is categorically rejected for all review skills.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to review skills. Reviews are read-only.'),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // --name is not accepted; session names are auto-generated.
  if (flags['name'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error(
          '--name is not accepted for adversarial review; session names are generated automatically.',
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // --add-dir is not accepted; the review runs in the target job's workspace.
  if (flags['add-dir'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error(
          "--add-dir is not accepted by $claude-adversarial-review; the review session runs in the target job's workspace.",
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // --mcp-config is not accepted.
  if (flags['mcp-config'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--mcp-config is not accepted by $claude-adversarial-review.'),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 2. jobId-or-prefix positional (required).
  const prefix = positional[0];
  if (!prefix) {
    process.stderr.write(
      formatError(
        new Error(
          'usage: cc adversarial-review <jobId-or-prefix> [--all] [--json] [--yes] [--model <model>] [--effort <effort>] [--permission-mode <mode>]',
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // Reject unexpected freeform positional args beyond the job ID.
  if (positional.length > 1) {
    process.stderr.write(
      formatError(
        new Error(
          'adversarial-review does not accept a freeform prompt; the dispatcher constructs the review prompt.',
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  // 3. Resolve job by prefix.
  const workspace = process.cwd();
  const showAll = Boolean(flags['all']);
  const listed = showAll ? await listJobs() : await listJobsForWorkspace(workspace);
  const allIds = listed.jobs.map((j) => j.jobId);
  const resolved = resolveJobIdPrefix(allIds, prefix);

  if ('error' in resolved) {
    // Hint for likely misuse: user may have passed a freeform prompt instead of a jobId.
    if (prefix.includes(' ') || prefix.length > 50 || !prefix.startsWith('job_')) {
      process.stderr.write(
        '[adversarial-review] Hint: $claude-adversarial-review takes a <jobId-or-prefix> of an existing background job, not a freeform prompt. Did you mean $claude-delegate?\n',
      );
    }
    const msg =
      resolved.error === 'ambiguous'
        ? formatAmbiguousJobPrefix(prefix, resolved.candidates)
        : showAll
          ? `No job found matching "${prefix}"`
          : `No job found matching "${prefix}" in this workspace. Re-run with --all to search every workspace.`;
    process.stderr.write(formatError(new Error(msg), 'adversarial-review', json) + '\n');
    process.exit(1);
  }

  const targetJobId = resolved.match;

  // 4. Reconcile to get fresh status of the target job.
  const driver = new ClaudeBackgroundDriver({ cwd: workspace });
  const adapter = makeClaudeAdapter(driver);

  let targetJob;
  try {
    const r = await reconcileJob(targetJobId, adapter);
    targetJob = r.job;
  } catch {
    targetJob = await readJob(targetJobId);
  }

  // 5. Status eligibility check (§ 3.6).
  const { status } = targetJob;

  if (status === 'queued' || status === 'starting') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${targetJobId} is ${status}; wait for the job to produce a result before running $claude-adversarial-review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'running') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${targetJobId} is running; wait for it to produce a result before running $claude-adversarial-review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (status === 'needs_input') {
    process.stderr.write(
      formatError(
        new Error(
          `Job ${targetJobId} needs input. Resolve the permission request first, then run $claude-adversarial-review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // At this point status is awaiting_followup, completed, stopped, failed, or orphaned.
  // These statuses are allowed IF job.result exists.
  if (!targetJob.result) {
    process.stderr.write(
      formatError(
        new Error(`No reviewable output. The job ${status} before producing a result.`),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 6. Privacy ack — target workspace, 4-step rule.
  await ensureWorkspaceAck({
    workspaceRoot: targetJob.workspace.root,
    commandName: 'adversarial-review',
    json,
    useYes: Boolean(flags['yes']) || permissionMode === 'bypassPermissions',
    header: 'Privacy acknowledgement required for target workspace.',
    actionLines: [
      `This command will start an adversarial review session for job ${targetJobId}.`,
      'The review session will have access to files in:',
    ],
    workspaceLabel: 'Target workspace',
  });

  // 7. Review target selection (§ 3.X): latest completed non-review turn with a result.
  let targetTurn = null;
  let selectedTurnIndex = -1;
  for (let i = targetJob.turns.length - 1; i >= 0; i--) {
    const t = targetJob.turns[i];
    if (
      t.status === 'completed' &&
      t.result != null &&
      !t.prompt.summary.startsWith('[review] ') &&
      !t.prompt.summary.startsWith('[adversarial-review] ')
    ) {
      targetTurn = t;
      selectedTurnIndex = i;
      break;
    }
  }

  if (targetTurn === null) {
    process.stderr.write(
      formatError(
        new Error('No reviewable non-review output found for this job.'),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  let latestResultTurnIndex = -1;
  for (let i = targetJob.turns.length - 1; i >= 0; i--) {
    if (targetJob.turns[i]?.result != null) {
      latestResultTurnIndex = i;
      break;
    }
  }

  // 8. Read the selected turn's content for prompt injection.
  const originalTaskSummary = targetTurn.prompt.summary;

  // Read finalMessage from the turn's result.finalMessagePath.
  const finalMessagePath = targetTurn.result?.finalMessagePath;
  if (!finalMessagePath) {
    process.stderr.write(
      formatError(
        new Error(
          `Reviewed output file is missing: (no path). Cannot construct adversarial review prompt.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  if (
    selectedTurnIndex !== latestResultTurnIndex &&
    targetJob.result?.finalMessagePath &&
    finalMessagePath === targetJob.result.finalMessagePath
  ) {
    process.stderr.write(
      formatError(
        new Error(
          `Selected turn ${selectedTurnIndex} uses a legacy shared result path that now points at a later turn. Re-run the original task or use a job with immutable per-turn result snapshots before adversarial review.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  let finalMessage;
  try {
    finalMessage = await readFile(finalMessagePath, 'utf8');
  } catch {
    process.stderr.write(
      formatError(
        new Error(
          `Reviewed output file is missing: ${finalMessagePath}. Cannot construct adversarial review prompt.`,
        ),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  const touchedFiles = targetTurn.result?.touchedFiles;

  // 9. Construct adversarial prompt via ADVERSARIAL_REVIEW_PROMPT.
  const adversarialPrompt = ADVERSARIAL_REVIEW_PROMPT({
    originalTask: originalTaskSummary,
    finalMessage,
    touchedFiles,
  });

  // 10. Start the review session via driver.startSession.
  const repoBasename = basename(targetJob.workspace.root);
  const targetJobIdShort = targetJobId.slice(0, 12);
  const reviewSessionName = `codex:${repoBasename}:review-${targetJobIdShort}`;
  const reviewStartSessionOptions = buildStartSessionOptions(flags, 'adversarial-review', json, {
    name: reviewSessionName,
    addDirs: [],
    mcpConfig: undefined,
    permissionMode,
  });

  const reviewHandle = await driver.startSession({
    cwd: targetJob.workspace.root,
    prompt: adversarialPrompt,
    ...reviewStartSessionOptions,
  });

  // 11. Create the review JobRecord via createJob.
  const promptMeta = makePromptMeta(adversarialPrompt);
  const prefixedSummary = `[adversarial-review] ${promptMeta.summary}`;

  const caps = await driver.probe();

  const reviewJob = await createJob({
    codex: {
      cwd: targetJob.workspace.root,
      pluginVersion: PLUGIN_VERSION,
    },
    workspace: {
      root: targetJob.workspace.root,
    },
    driver: {
      name: 'claude-background',
      version: DRIVER_VERSION,
      capabilitiesSnapshot: caps,
    },
    claude: {
      version: caps.claudeVersion ?? 'unknown',
      shortId: reviewHandle.shortId,
      sessionName: reviewHandle.sessionName,
      cwd: reviewHandle.cwd,
      startedAt: reviewHandle.startedAt,
      logsCommand: `claude logs ${reviewHandle.shortId}`,
      launchPolicy: launchPolicyFromStartSessionOptions(reviewStartSessionOptions),
    },
    prompt: { summary: prefixedSummary, sha256: promptMeta.sha256, bytesLen: promptMeta.bytesLen },
    reviewOf: { jobId: targetJobId, turnIndex: selectedTurnIndex },
  });

  // 12. Build review session handle for stop calls.
  const reviewSessionHandle = {
    driverName: reviewJob.driver.name,
    shortId: reviewHandle.shortId,
    sessionId: reviewHandle.sessionId,
    sessionName: reviewHandle.sessionName,
    cwd: reviewHandle.cwd,
    startedAt: reviewHandle.startedAt,
  };

  // 13. Reconcile loop with DD-1 timeout.
  //
  // Default timeout: 30 minutes (1_800_000 ms).
  // Env-var override: CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS.
  // Defensive parse: parseInt; NaN or <= 0 → use default.
  //
  // Poll interval default: 2000 ms. Override via CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS
  // (TEST SEAM ONLY — not user-facing).
  const ADVERSARIAL_REVIEW_TIMEOUT_DEFAULT_MS = 1_800_000;
  const rawTimeoutEnv = process.env.CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_TIMEOUT_MS;
  const parsedTimeoutEnv = rawTimeoutEnv ? parseInt(rawTimeoutEnv, 10) : NaN;
  const ADVERSARIAL_REVIEW_TIMEOUT_MS =
    !Number.isNaN(parsedTimeoutEnv) && parsedTimeoutEnv > 0
      ? parsedTimeoutEnv
      : ADVERSARIAL_REVIEW_TIMEOUT_DEFAULT_MS;

  const ADVERSARIAL_REVIEW_POLL_DEFAULT_MS = 2000;
  const rawPollEnv = process.env.CC_PLUGIN_CODEX_ADVERSARIAL_REVIEW_POLL_MS;
  const parsedPollEnv = rawPollEnv ? parseInt(rawPollEnv, 10) : NaN;
  const ADVERSARIAL_REVIEW_POLL_MS =
    !Number.isNaN(parsedPollEnv) && parsedPollEnv > 0
      ? parsedPollEnv
      : ADVERSARIAL_REVIEW_POLL_DEFAULT_MS;

  const reviewAdapter = makeClaudeAdapter(driver, {
    startedAt: reviewHandle.startedAt,
  });

  const startTime = Date.now();
  let currentReviewJob = reviewJob;
  let timedOut = false;

  while (true) {
    // Check timeout first.
    const elapsed = Date.now() - startTime;
    if (elapsed >= ADVERSARIAL_REVIEW_TIMEOUT_MS) {
      timedOut = true;
      break;
    }

    // Poll: wait then reconcile.
    await new Promise((resolve) => setTimeout(resolve, ADVERSARIAL_REVIEW_POLL_MS));

    try {
      const r = await reconcileJob(reviewJob.jobId, reviewAdapter);
      currentReviewJob = r.job;
    } catch {
      // Non-fatal; retry on next iteration.
    }

    // Success path: review job has a result.
    if (currentReviewJob.result) {
      break;
    }

    // Failure path: review job is in a terminal non-result status.
    if (
      currentReviewJob.status === 'failed' ||
      currentReviewJob.status === 'stopped' ||
      currentReviewJob.status === 'orphaned'
    ) {
      // Exit non-zero with the review job's status.
      process.stderr.write(
        formatError(
          new Error(
            `Adversarial review session ended with status: ${currentReviewJob.status}. No findings were produced.`,
          ),
          'adversarial-review',
          json,
        ) + '\n',
      );
      process.exit(1);
    }
  }

  // Timeout cleanup branch (per DD-1 + R16).
  if (timedOut) {
    // Best-effort: stop the review session (errors ignored).
    await driver.stop(reviewSessionHandle).catch(() => {});

    // Mark the review job failed.
    await updateJob(reviewJob.jobId, (current) => ({ ...current, status: 'failed' }));

    // Append review.failed event.
    const now = new Date().toISOString();
    await appendEvent(reviewJob.jobId, {
      type: 'review.failed',
      at: now,
      reason: 'timeout',
      timeoutMs: ADVERSARIAL_REVIEW_TIMEOUT_MS,
    });

    // Leave target job UNCHANGED.

    const timeoutMinutes = Math.round(ADVERSARIAL_REVIEW_TIMEOUT_MS / 60_000);
    process.stderr.write(
      formatError(
        new Error(`Adversarial review did not complete within ${timeoutMinutes} minutes.`),
        'adversarial-review',
        json,
      ) + '\n',
    );
    process.exit(1);
  }

  // 14. Parse + format results.
  // Read the final message from the review job's result.finalMessagePath.
  let reviewFinalMessage = '';
  if (currentReviewJob.result?.finalMessagePath) {
    try {
      reviewFinalMessage = await readFile(currentReviewJob.result.finalMessagePath, 'utf8');
    } catch {
      reviewFinalMessage = '';
    }
  }

  const review = parseReviewOutput(reviewFinalMessage);

  if (json) {
    process.stdout.write(
      formatAdversarialReviewJson({
        review,
        job: currentReviewJob,
        targetJob,
      }) + '\n',
    );
  } else {
    // Human format: reuse formatReviewHuman with a synthetic turn shape.
    const turnMeta = {
      index: 0,
      status: currentReviewJob.status,
    };
    process.stdout.write(
      formatReviewHuman({ review, job: currentReviewJob, turn: turnMeta }) + '\n',
    );
  }
  exitIfReviewGateFailed(review, reviewGate, 'adversarial-review');
}

// ---------- usage ----------

// ---------- workflows ----------

async function cmdWorkflows(flags, positional, json) {
  // --allow-edit is not applicable; this command is read-only.
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to cc workflows; this command is read-only.'),
        'workflows',
        json,
      ) + '\n',
    );
    process.exit(2);
  }

  const jobId = positional[0];

  if (jobId) {
    // Drill-in path: inspect a single workflow session.
    const detail = await inspectWorkflow(jobId);
    if (json) {
      process.stdout.write(JSON.stringify(detail, null, 2) + '\n');
    } else {
      const lines = [
        `Workflow session: ${detail.sessionId}`,
        `  Name:      ${detail.name}`,
        `  Kind:      ${detail.kind ?? 'unknown'}`,
        `  Status:    ${detail.status}`,
        `  CWD:       ${detail.cwd}`,
        `  StartedAt: ${detail.startedAt ? new Date(detail.startedAt).toISOString() : 'unknown'}`,
      ];
      if (detail.subagents.length > 0) {
        lines.push('', `  Subagents (${detail.subagents.length}):`);
        for (const sa of detail.subagents) {
          const parts = [`    - ${sa.agentId}`];
          if (sa.status) parts.push(`status=${sa.status}`);
          if (sa.tokens != null) parts.push(`tokens=${sa.tokens}`);
          if (sa.duration_ms != null) parts.push(`duration=${sa.duration_ms}ms`);
          if (sa.tool_uses != null) parts.push(`tool_uses=${sa.tool_uses}`);
          lines.push(parts.join(' '));
        }
      } else {
        lines.push('', '  Subagents: none recorded');
      }
      if (detail.phaseRecords.length > 0) {
        lines.push('', `  Phase records (first ${detail.phaseRecords.length} JSONL lines):`);
        for (const rec of detail.phaseRecords.slice(0, 5)) {
          lines.push(`    ${JSON.stringify(rec)}`);
        }
        if (detail.phaseRecords.length > 5) {
          lines.push(`    ... (${detail.phaseRecords.length - 5} more)`);
        }
      }
      process.stdout.write(lines.join('\n') + '\n');
    }
  } else {
    // List path: enumerate workflow sessions.
    const showAll = Boolean(flags['all']);
    const { sessions } = await listWorkflows({ all: showAll });
    if (json) {
      process.stdout.write(JSON.stringify({ sessions }, null, 2) + '\n');
    } else {
      if (sessions.length === 0) {
        process.stdout.write(
          [
            'No workflow sessions found.',
            '',
            'Workflow sessions are background jobs started via $claude-workflow or $claude-deep-research.',
            `Use \`${dispatcherCommandForHints('status')}\` to list all background sessions.`,
          ].join('\n') + '\n',
        );
      } else {
        const lines = [`Workflow sessions (${sessions.length}):`];
        for (const s of sessions) {
          const kind = String(s.kind ?? 'unknown').padEnd(16);
          lines.push(`  ${s.shortId}  ${s.status.padEnd(10)}  ${kind}  ${s.name.slice(0, 60)}`);
        }
        lines.push(
          '',
          `Run \`${dispatcherCommandForHints('workflows <sessionId>')}\` to drill into a session.`,
        );
        process.stdout.write(lines.join('\n') + '\n');
      }
    }
  }
}

// ---------- skills ----------

async function cmdSkills(flags, positional, json) {
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error('--allow-edit is not applicable to cc skills; this command is read-only.'),
        'skills',
        json,
      ) + '\n',
    );
    process.exit(2);
  }
  if (positional.length > 0) {
    process.stderr.write(
      formatError(new Error('skills does not take positional arguments.'), 'skills', json) + '\n',
    );
    process.exit(2);
  }

  const catalog = discoverClaudeSkills({ cwd: process.cwd(), env: process.env });
  process.stdout.write(formatClaudeSkills(catalog, json) + '\n');
}

// ---------- upgrade ----------

function detectUpgradeTarget(flags) {
  if (flags['public'] && flags['local']) {
    throw new Error('Use only one of --public or --local.');
  }
  if (flags['public']) return UPGRADE_TARGETS.public;
  if (flags['local']) return UPGRADE_TARGETS.local;

  const scriptPath = fileURLToPath(import.meta.url);
  if (scriptPath.includes('/cc-plugin-codex-local/')) return UPGRADE_TARGETS.local;
  return UPGRADE_TARGETS.public;
}

function upgradePlan(target) {
  const steps = [];
  if (target.refreshMarketplace) {
    steps.push({
      label: 'refresh-marketplace',
      command: 'codex',
      args: ['plugin', 'marketplace', 'upgrade', target.marketplace],
      fallback: target.repoUrl
        ? {
            command: 'codex',
            args: ['plugin', 'marketplace', 'add', target.repoUrl],
          }
        : null,
      required: true,
    });
  }
  steps.push(
    {
      label: 'remove-installed-plugin',
      command: 'codex',
      args: ['plugin', 'remove', target.plugin],
      required: false,
    },
    {
      label: 'install-plugin',
      command: 'codex',
      args: ['plugin', 'add', target.plugin, '--json'],
      required: true,
    },
    {
      label: 'list-plugins',
      command: 'codex',
      args: ['plugin', 'list'],
      required: true,
    },
  );
  return steps;
}

function upgradeSourceLabel(target) {
  return target.source === 'local'
    ? 'local marketplace (cc-plugin-codex-local)'
    : 'public Git marketplace (cc-plugin-codex)';
}
function formatCommandForDisplay(step) {
  if (typeof step.command !== 'string') {
    return String(step.label ?? 'step');
  }
  const args = Array.isArray(step.args) ? step.args : [];
  return [
    step.command,
    ...args.map((arg) => {
      const value = String(arg);
      return value.includes(' ') ? JSON.stringify(value) : value;
    }),
  ].join(' ');
}

function runUpgradeStep(step) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(step.command, step.args, {
    env: process.env,
    encoding: 'utf8',
  });
  return {
    label: step.label,
    command: step.command,
    args: step.args,
    required: step.required !== false,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? String(result.error.message ?? result.error) : null,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function parseInstalledPathFromAddStep(result) {
  if (result.label !== 'install-plugin' || result.status !== 0) return null;
  try {
    const parsed = JSON.parse(String(result.stdout ?? ''));
    return typeof parsed.installedPath === 'string' && parsed.installedPath.length > 0
      ? parsed.installedPath
      : null;
  } catch {
    return null;
  }
}

function currentScriptPluginRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

function refreshSymlink(linkPath, targetPath) {
  const startedAt = new Date().toISOString();
  try {
    mkdirSync(dirname(linkPath), { recursive: true });
    if (existsSync(linkPath) || lstatSync(linkPath, { throwIfNoEntry: false })) {
      const stat = lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        rmSync(linkPath, { force: true });
      } else {
        return {
          label: 'refresh-cache-symlink',
          linkPath,
          targetPath,
          status: 'warn',
          detail: `${linkPath} exists and is not a symlink; left unchanged.`,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      }
    }
    symlinkSync(targetPath, linkPath, 'dir');
    return {
      label: 'refresh-cache-symlink',
      linkPath,
      targetPath,
      status: 'ok',
      detail: `${linkPath} -> ${targetPath}`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      label: 'refresh-cache-symlink',
      linkPath,
      targetPath,
      status: 'warn',
      detail: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}

function refreshCacheSymlinks(installedPath) {
  if (installedPath == null) {
    return [
      {
        label: 'refresh-cache-symlink',
        status: 'warn',
        detail:
          'codex plugin add did not return an installedPath; stable current symlink was not refreshed.',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
    ];
  }

  const versionParent = dirname(installedPath);
  const currentRoot = currentScriptPluginRoot();
  const links = [join(versionParent, 'current')];
  if (currentRoot !== installedPath && dirname(currentRoot) === versionParent) {
    links.push(currentRoot);
  }
  return links.map((linkPath) => refreshSymlink(linkPath, installedPath));
}

async function cmdUpgrade(flags, positional, json) {
  if (flags['allow-edit'] !== undefined) {
    process.stderr.write(
      formatError(
        new Error(
          '--allow-edit is not applicable to cc upgrade; it only calls Codex plugin commands.',
        ),
        'upgrade',
        json,
      ) + '\n',
    );
    process.exit(2);
  }
  if (positional.length > 0) {
    process.stderr.write(
      formatError(new Error('upgrade does not take positional arguments.'), 'upgrade', json) + '\n',
    );
    process.exit(2);
  }

  let target;
  try {
    target = detectUpgradeTarget(flags);
  } catch (err) {
    process.stderr.write(formatError(err, 'upgrade', json) + '\n');
    process.exit(2);
  }
  const steps = upgradePlan(target);
  const commands = steps.map((step) => ({
    label: step.label,
    command: step.command,
    args: step.args,
    required: step.required !== false,
    fallback: step.fallback
      ? {
          command: step.fallback.command,
          args: step.fallback.args,
        }
      : null,
  }));

  const dryRun = Boolean(flags['dry-run']) || !flags['yes'];
  if (dryRun) {
    const payload = {
      ok: true,
      dryRun: true,
      version: PLUGIN_VERSION,
      target,
      commands,
      next: `Run \`${dispatcherCommandForHints('upgrade --yes')}\` or $claude-upgrade --yes to execute this plan.`,
    };
    if (json) {
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } else {
      const lines = [
        'CC upgrade plan',
        `  Current dispatcher version: ${PLUGIN_VERSION}`,
        `  Source:      ${upgradeSourceLabel(target)}`,
        `  Marketplace: ${target.marketplace}`,
        `  Plugin:      ${target.plugin}`,
        '',
        'Commands:',
      ];
      for (const step of steps) {
        lines.push(`  ${formatCommandForDisplay(step)}`);
        if (step.fallback) {
          lines.push(`    fallback: ${formatCommandForDisplay(step.fallback)}`);
        }
      }
      lines.push(
        '',
        `Run \`${dispatcherCommandForHints('upgrade --yes')}\` or $claude-upgrade --yes to execute this plan.`,
      );
      process.stdout.write(lines.join('\n') + '\n');
    }
    return;
  }

  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  for (const step of steps) {
    let result = runUpgradeStep(step);
    if (result.status !== 0 && step.fallback) {
      results.push({ ...result, continuedWithFallback: true });
      result = runUpgradeStep({
        ...step.fallback,
        label: `${step.label}-fallback`,
        required: true,
      });
    }
    results.push(result);
    if (result.status === 0 && result.label === 'install-plugin') {
      results.push(...refreshCacheSymlinks(parseInstalledPathFromAddStep(result)));
    }

    if (result.status !== 0 && step.required !== false) {
      const detail = result.stderr || result.stdout || result.error || `exit ${result.status}`;
      throw new Error(`${formatCommandForDisplay(step)} failed: ${String(detail).trim()}`);
    }
  }

  const payload = {
    ok: true,
    dryRun: false,
    version: PLUGIN_VERSION,
    target,
    steps: results,
    next: 'Restart Codex if the skill catalog does not refresh immediately, then run $claude-setup.',
  };

  if (json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    const lines = ['CC plugin refresh complete.', ''];
    for (const step of results) {
      const ok =
        step.status === 0 || step.status === 'ok'
          ? 'ok'
          : step.status === 'warn' || step.required === false
            ? 'warn'
            : 'fail';
      lines.push(`${ok}: ${formatCommandForDisplay(step)}`);
      const stdout = String(step.stdout ?? '').trim();
      const stderr = String(step.stderr ?? '').trim();
      const detail = typeof step.detail === 'string' ? step.detail.trim() : '';
      if (stdout) lines.push(`  ${stdout.split('\n')[0]}`);
      if (stderr) lines.push(`  ${stderr.split('\n')[0]}`);
      if (!stdout && !stderr && detail) lines.push(`  ${detail.split('\n')[0]}`);
    }
    lines.push('', 'Next: run $claude-setup.');
    process.stdout.write(lines.join('\n') + '\n');
  }
}

function printUsage(commandName = '') {
  const commandHelp = {
    doctor: [
      'Usage: cc doctor [--claude-access] [--real|--chrome|--no-chrome] [permission flags] [--json]',
      '',
      'Runs a focused read-only preflight before long or browser-backed Claude jobs.',
      'Checks workspace path, Claude Code CLI auth, Claude model access, real Chrome launch readiness, and permission-mode intent.',
      'Use --real as a doctor-only alias for the Claude Code --chrome launch path.',
      '',
      'Options: --json --claude-access --real --chrome --no-chrome --permission-mode <mode> --bypass-permissions --dangerously-skip-permissions',
    ],
    delegate: [
      'Usage: cc delegate [options] -- "<prompt>"',
      '',
      'Starts a Claude Code background session and records a cc job.',
      'Use --yes to acknowledge plugin privacy non-interactively.',
      'Use --bypass-permissions (or --permission-mode bypassPermissions) for explicit trusted unattended runs.',
      'Use --chrome for Claude Code real-browser access; if Claude asks which browser to use, attach and choose interactively.',
      'Put all dispatcher flags before --; anything after -- is the Claude prompt.',
      '',
      'Options: --yes --json --compact --name <name> --model <model> --effort <effort> --permission-mode <mode> --bypass-permissions --dangerously-skip-permissions --add-dir <dir> --mcp-config <path> --chrome --no-chrome --allow-edit',
    ],
    restart: [
      'Usage: cc restart <jobId-or-prefix> [fresh-session-flags] -- "<prompt>"',
      '',
      'Stops the original job if it is still live, then starts a fresh Claude Code background session in the same workspace.',
      'The original prompt is not replayed because cc stores prompt metadata, not full prompt text.',
      'Use --bypass-permissions for explicit trusted unattended retries of permission-blocked jobs.',
      '',
      'Options: --all --yes --json --compact --name <name> --model <model> --effort <effort> --permission-mode <mode> --bypass-permissions --dangerously-skip-permissions --add-dir <dir> --mcp-config <path> --chrome --no-chrome --allow-edit',
    ],
    workflow: [
      'Usage: cc workflow [options] -- "<prompt>"',
      '',
      'Starts a Claude Code dynamic workflow background session.',
      'After startup, attach to the printed Claude session short ID:',
      '  claude attach <shortId>',
      'Then choose Yes, View raw script, or No in Claude Code.',
      'Put all dispatcher flags before --; anything after -- is the Claude prompt.',
      '',
      'Options: --yes --json --compact --model <model> --effort <effort> --permission-mode <mode> --bypass-permissions --dangerously-skip-permissions',
      'Note: --yes only acknowledges plugin privacy; it does not approve the Claude Code workflow gate.',
    ],
    'deep-research': [
      'Usage: cc deep-research [options] -- "<question>"',
      '',
      'Starts a Claude Code /deep-research background session with WebSearch-backed fanout.',
      'Current Claude Code versions may show a dynamic workflow approval gate.',
      'If prompted, attach to the printed Claude session short ID:',
      '  claude attach <shortId>',
      'Put all dispatcher flags before --; anything after -- is the Claude prompt.',
      '',
      'Options: --yes --json --compact --model <model> --effort <effort> --permission-mode <mode> --bypass-permissions --dangerously-skip-permissions',
      'Note: --yes only acknowledges plugin privacy; it does not approve Claude Code workflow gates.',
    ],
    status: [
      'Usage: cc status [--all] [--json] [--compact] [--limit <n>] [--stored-status <state>]',
      '       cc status --job <jobId-or-prefix> [--all] [--json]',
      '',
      'Lists Claude jobs for the current workspace by default.',
      'Use --job for one focused lookup; use --limit to keep broad lists small.',
      'The --job form already returns the compact public job shape.',
      '',
      'Options: --all --json --compact --job <jobId-or-prefix> --limit <n> --stored-status <state>',
    ],
    result: [
      'Usage: cc result <jobId-or-prefix> [--all] [--json] [--compact] [--partial]',
      '',
      'Shows the final result of a completed Claude job.',
      'Use --partial to read the latest recorded partial output from a running or blocked job.',
      '',
      'Options: --all --json --compact --partial',
    ],
    wait: [
      'Usage: cc wait <jobId-or-prefix> [--all] [--json] [--compact] [--timeout <duration>] [--interval <duration>]',
      '',
      'Polls one Claude job until it reaches a result state, awaiting-followup, needs_input, stopped, failed, orphaned, or timeout.',
      'Duration examples: 500ms, 30s, 2m. Bare numbers are seconds.',
      'JSON output includes the compact job summary, any recorded result text, transcript tail when captured, and blocker details.',
      '',
      'Options: --all --json --compact --timeout <duration> --interval <duration>',
    ],
    stop: [
      'Usage: cc stop <jobId-or-prefix> [--all] [--json] [--compact]',
      '       cc stop --all-awaiting-followup [--all] [--json]',
      '       cc stop --all-needs-input [--all] [--json]',
      '',
      'Stops one Claude job, or bulk-stops matching jobs in the current workspace.',
      '',
      'Options: --all --json --compact --all-awaiting-followup --all-needs-input --all-blocked',
    ],
    followup: [
      'Usage: cc followup <jobId-or-prefix> [options] -- "<prompt>"',
      '',
      'Sends a follow-up prompt to an awaiting Claude job in the existing session.',
      'If JSON output reports resultPending:true, run $claude-result <jobId> after status settles.',
      '',
      'Options: --all --yes --json --allow-edit',
    ],
    workflows: [
      'Usage: cc workflows [<jobId-or-sessionId>] [--all] [--json]',
      '',
      'Read-only inspector for workflow-like background jobs.',
      'Includes sessions started by $claude-workflow and $claude-deep-research.',
      '',
      'Options: --all --json',
    ],
    skills: [
      'Usage: cc skills [--json]',
      '',
      'Read-only catalog of Claude Code skills visible to delegated Claude sessions.',
      'Includes project .claude/skills, user ~/.claude/skills, and skills from installed Claude Code plugin cache paths.',
      'Use listed skills in delegated prompts as /skill-name when user-invocable.',
      '',
      'Options: --json',
    ],
    upgrade: [
      'Usage: cc upgrade [--dry-run] [--yes] [--json] [--public|--local]',
      '',
      'Refreshes or repairs the installed CC plugin through the Codex CLI.',
      'Auto-detects local cached installs; use --public or --local to override.',
      'Defaults to a dry-run plan. Use --yes to execute.',
      '',
      'Options: --dry-run --yes --json --public --local',
    ],
  };

  if (commandName && Object.prototype.hasOwnProperty.call(commandHelp, commandName)) {
    process.stdout.write(commandHelp[commandName].join('\n') + '\n');
    return;
  }

  process.stdout.write(
    [
      'Usage: cc <command> [options]',
      '',
      'Commands:',
      '  setup                                     Run doctor probes and report status',
      '  doctor [--claude-access] [--real] [--json]  Preflight auth, model access, browser, workspace, and permission mode',
      '  delegate [flags] -- <prompt>              Start a Claude background session',
      '  restart <jobId-or-prefix> [flags] -- <prompt>  Stop a job and start a fresh one in the same workspace',
      '  workflow [flags] -- <prompt>              Start a Claude Code dynamic workflow (triggers ultracode planning)',
      '  goal [flags] -- <condition>               Start a Claude Code background session with a /goal condition',
      '  fork [flags] -- <directive>               Fork a Claude Code subagent for a directive',
      '  batch [flags] -- <instruction>            Run a batch of parallel Claude Code instructions',
      '  deep-research [flags] -- <question>       Run a Claude Code /deep-research workflow (multi-agent fan-out with WebSearch)',
      '  status [--all] [--json] [--compact] [--limit <n>] [--stored-status <state>]',
      '                                            List jobs for current workspace',
      '  status --job <jobId-or-prefix> [--all] [--json]  Show one job status',
      '  result <jobId-or-prefix> [--all] [--json] [--partial]  Show final or recorded partial result',
      '  wait <jobId-or-prefix> [--all] [--json] [--timeout <duration>]  Wait for result, blocker, or timeout',
      '  stop <jobId-or-prefix> [--all] [--json]   Stop a running job',
      '  stop --all-awaiting-followup [--all]      Bulk-stop awaiting-followup jobs',
      '  stop --all-needs-input [--all]            Bulk-stop permission/input-blocked jobs',
      '  followup <jobId-or-prefix> [flags] -- <prompt>  Send a follow-up prompt to an existing job',
      '  review <jobId-or-prefix> [--all] [--json] [--yes] [--blocking|--fail-on <gate>]',
      '                                            Same-session structured review of the latest non-review turn',
      '  adversarial-review <jobId-or-prefix> [--all] [--json] [--yes] [--model <model>] [--effort <effort>] [--permission-mode <mode>] [--blocking|--fail-on <gate>]',
      '                                            Fresh-session independent review of the latest non-review turn',
      '  workflows [<jobId>] [--all] [--json]      List workflow/deep-research sessions or drill into one (read-only; no subprocess spawned)',
      '  skills [--json]                          List Claude Code skills visible to delegated Claude sessions',
      '  upgrade [--dry-run] [--yes] [--json] [--public|--local]  Refresh or repair the installed CC plugin',
      '  version | --version                       Print the installed plugin version',
      '',
      'Flags:',
      '  --json                       Machine-readable JSON output (doctor/status/result/wait/stop/followup/review/adversarial-review/goal/fork/batch/deep-research/workflows/skills/upgrade)',
      '  --compact                    Compact redacted JSON shape for delegate/status/result/wait/stop',
      '  --partial                    Allow result to print recorded partial output for incomplete jobs',
      '  --job <jobId-or-prefix>      Select one job for status',
      '  --limit <n>                  Limit status lists after newest-first sorting (0 = no limit)',
      '  --stored-status <state>      Pre-filter status lists by stored job status',
      '  --timeout <duration>         Wait timeout (examples: 500ms, 30s, 2m; bare numbers are seconds)',
      '  --interval <duration>        Poll interval for wait (examples: 500ms, 2s)',
      '  --yes                        Acknowledge privacy disclosure automatically (delegate/workflow/goal/fork/batch/deep-research/followup/review/adversarial-review)',
      '  --dry-run                    Print the upgrade plan without changing the Codex plugin install',
      '  --claude-access              Doctor preflight: require Claude Code CLI auth and model access before launch',
      '  --real                       Doctor preflight alias for future --chrome real-browser launch checks',
      '  --public                     Force public Git marketplace target for upgrade',
      '  --local                      Force local marketplace target for upgrade',
      '  --name <name>                Session name (delegate, workflow, goal, fork, batch, deep-research)',
      '  --model <model>              Model selection (delegate, workflow, goal, fork, batch, deep-research, adversarial-review)',
      '  --effort <effort>            Effort level (delegate, workflow, goal, fork, batch, deep-research, adversarial-review)',
      '  --permission-mode <mode>     Permission mode (delegate, workflow, goal, fork, batch, deep-research, adversarial-review; bypassPermissions is for explicit trusted unattended runs)',
      '  --bypass-permissions         Preferred alias for --permission-mode bypassPermissions on fresh Claude sessions',
      '  --dangerously-skip-permissions  Claude Code alias for --permission-mode bypassPermissions on fresh Claude sessions',
      '  --allow-dangerously-skip-permissions  Allow bypass-permissions as an option without defaulting to it',
      '  --allowedTools <tools>       Claude Code allowed tools list for fresh sessions (comma-separated or quoted)',
      '  --allowed-tools <tools>      Alias for --allowedTools',
      '  --disallowedTools <tools>    Claude Code disallowed tools list for fresh sessions (comma-separated or quoted)',
      '  --disallowed-tools <tools>   Alias for --disallowedTools',
      '  --tools <tools>              Claude Code built-in tool list for fresh sessions',
      '  --agent <agent>              Claude Code agent for fresh sessions',
      '  --agents <json-or-file>      Claude Code agents configuration for fresh sessions',
      '  --settings <file-or-json>    Claude Code settings file or JSON for fresh sessions',
      '  --setting-sources <sources>  Claude Code setting sources for fresh sessions',
      '  --strict-mcp-config          Require strict MCP config handling in Claude Code',
      '  --system-prompt <text>       Override Claude Code system prompt for fresh sessions',
      '  --append-system-prompt <text> Append text to the Claude Code system prompt',
      '  --plugin-dir <dir>           Claude Code plugin directory for fresh sessions',
      '  --plugin-url <url>           Claude Code plugin URL for fresh sessions',
      '  --add-dir <dir>              Additional directory (delegate, workflow, goal, fork, batch, deep-research; repeatable)',
      '  --mcp-config <path>          MCP config file (delegate, workflow, goal, fork, batch, deep-research)',
      '  --bare / --safe-mode         Forward Claude Code bare or safe-mode startup toggles',
      '  --ide / --chrome / --no-chrome  Forward Claude Code IDE/browser startup toggles; --chrome uses real Chrome and may require interactive browser selection via claude attach',
      '  --disable-slash-commands     Disable slash commands in fresh Claude Code sessions',
      '  --exclude-dynamic-system-prompt-sections  Exclude dynamic system-prompt sections',
      '  --verbose                    Forward verbose startup mode to Claude Code',
      '  --blocking                  Review gate alias for --fail-on high',
      '  --fail-on <gate>            Exit 1 after review output when gate trips: fail, any, nit, low, medium, high, blocker',
      '  --allow-edit                 Policy/framing flag (delegate, followup); does NOT bypass the privacy acknowledgement and is rejected by review, adversarial-review, workflow, goal, fork, batch, deep-research, workflows, and skills',
      '  --all                        Search all workspaces (status/result/stop/followup/review/adversarial-review)',
      '  --all-awaiting-followup      Bulk-stop all awaiting-followup jobs (stop only; combine with --all for every workspace)',
      '  --version                    Print the installed plugin version',
      '  --help                       Show this help',
      '',
    ].join('\n'),
  );
}
