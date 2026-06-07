// workflows-inspector.mjs — CLI-only inspector for Claude Code workflow sessions.
//
// Architecture note (Plan 0016 T2 pivot):
//   The Claude Code /workflows TUI panel is SESSION-SCOPED — it shows only
//   workflows started within the current interactive TUI session, NOT background
//   sessions started via 'cc workflow' (--bg). See Plan 0016 OQ-A artifact
//   (oq-a-workflows-ansi-capture-20260606.txt) for the empirical evidence.
//
//   This module uses the CLI path instead: 'claude agents --json' to list
//   sessions, plus ~/.claude/projects/*/sessionId.jsonl and
//   ~/.claude/projects/*/sessionId/subagents/*.meta.json for enrichment.
//
// Public API (pure data, no console output):
//   listWorkflows({ all, env })         → { sessions: WorkflowSession[] }
//   inspectWorkflow(jobId, { env })     → WorkflowDetail
//
// Workflow session identification heuristic:
//   A session qualifies as a workflow session when its name starts with
//   "ultracode:" (the prompt prefix injected by cmdWorkflow in cc.mjs).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// listWorkflows
// ---------------------------------------------------------------------------

/**
 * List all Claude Code background sessions that are workflow sessions.
 *
 * A session is identified as a workflow session when its `name` field starts
 * with `"ultracode:"` — the prompt prefix cc.mjs injects for $claude-workflow.
 *
 * @param {{ all?: boolean; env?: NodeJS.ProcessEnv }} opts
 * @returns {Promise<{ sessions: WorkflowSession[] }>}
 */
export async function listWorkflows({ all: _all = false, env = process.env } = {}) {
  const agentRows = await _runAgentsJson(env);

  // Filter to workflow sessions only.
  const sessions = agentRows
    .filter((row) => _isWorkflowSession(row))
    .map((row) => _toWorkflowSession(row));

  return { sessions };
}

// ---------------------------------------------------------------------------
// inspectWorkflow
// ---------------------------------------------------------------------------

/**
 * Drill into a single workflow session by jobId (short id or full session id).
 *
 * Reads:
 *   - claude agents --json for the session record
 *   - ~/.claude/projects/<sanitized-cwd>/<sessionId>/subagents/*.meta.json
 *   - ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl (first 30 lines)
 *
 * @param {string} jobId  Short id prefix or full session UUID.
 * @param {{ env?: NodeJS.ProcessEnv }} opts
 * @returns {Promise<WorkflowDetail>}
 */
export async function inspectWorkflow(jobId, { env = process.env } = {}) {
  const agentRows = await _runAgentsJson(env);

  const row = agentRows.find(
    (r) =>
      r.sessionId === jobId || (typeof r.sessionId === 'string' && r.sessionId.startsWith(jobId)),
  );

  if (!row) {
    throw new Error(`No session found matching jobId "${jobId}"`);
  }

  if (!_isWorkflowSession(row)) {
    throw new Error(
      `Session "${row.sessionId}" is not a workflow session (name does not start with "ultracode:").`,
    );
  }

  const sessionId = row.sessionId;
  const cwd = row.cwd ?? process.cwd();

  // Resolve the project directory under ~/.claude/projects/
  const projectDir = _resolveProjectDir(cwd);

  // Read subagents/*.meta.json
  const subagents = _readSubagentMeta(projectDir, sessionId);

  // Read first 30 lines of the session JSONL for phase records.
  const phaseRecords = _readPhaseRecords(projectDir, sessionId, 30);

  return {
    jobId,
    sessionId,
    name: row.name ?? '',
    status: row.status ?? 'unknown',
    cwd,
    startedAt: row.startedAt ?? null,
    subagents,
    phaseRecords,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run `claude agents --json` and return the parsed array.
 * Returns [] on any failure (missing binary, empty output, parse error).
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<AgentRow[]>}
 */
async function _runAgentsJson(env) {
  let stdout = '';
  try {
    const result = await execFileAsync('claude', ['agents', '--json'], {
      env,
      timeout: 10_000,
    });
    stdout = result.stdout.trim();
  } catch {
    return [];
  }
  if (!stdout) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * A session is a workflow session when its name starts with "ultracode:".
 * @param {AgentRow} row
 */
function _isWorkflowSession(row) {
  return typeof row.name === 'string' && row.name.startsWith('ultracode:');
}

/**
 * Map an AgentRow to a WorkflowSession summary.
 * @param {AgentRow} row
 * @returns {WorkflowSession}
 */
function _toWorkflowSession(row) {
  return {
    sessionId: row.sessionId ?? '',
    shortId: _shortId(row.sessionId ?? ''),
    name: row.name ?? '',
    status: row.status ?? 'unknown',
    cwd: row.cwd ?? '',
    startedAt: row.startedAt ?? null,
    pid: row.pid ?? null,
  };
}

/**
 * Return first 8 chars of a UUID-shaped sessionId (the short id Claude uses).
 * @param {string} sessionId
 */
function _shortId(sessionId) {
  return sessionId.slice(0, 8);
}

/**
 * Sanitize a cwd path to the format Claude uses for project directories:
 *   /Users/foo/bar  →  -Users-foo-bar
 * @param {string} cwd
 */
function _sanitizeCwd(cwd) {
  return cwd.replace(/\//g, '-').replace(/^-/, '');
}

/**
 * Resolve the per-project directory under ~/.claude/projects/.
 * Falls back to the home-relative path if the directory does not exist.
 * @param {string} cwd
 */
function _resolveProjectDir(cwd) {
  const sanitized = _sanitizeCwd(cwd);
  return join(homedir(), '.claude', 'projects', sanitized);
}

/**
 * Read subagent meta.json files for a given session.
 * Returns [] if the subagents directory does not exist.
 * @param {string} projectDir
 * @param {string} sessionId
 * @returns {SubagentMeta[]}
 */
function _readSubagentMeta(projectDir, sessionId) {
  const subagentsDir = join(projectDir, sessionId, 'subagents');
  if (!existsSync(subagentsDir)) return [];

  let entries;
  try {
    entries = readdirSync(subagentsDir);
  } catch {
    return [];
  }

  const metas = [];
  for (const entry of entries) {
    if (!entry.endsWith('.meta.json')) continue;
    const filePath = join(subagentsDir, entry);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      metas.push({
        agentId: parsed.agentId ?? entry.replace('.meta.json', ''),
        name: parsed.name ?? '',
        tokens: parsed.tokens ?? null,
        duration_ms: parsed.duration_ms ?? null,
        tool_uses: parsed.tool_uses ?? null,
        result: parsed.result ?? null,
        status: parsed.status ?? 'unknown',
      });
    } catch {
      // Skip unreadable or malformed meta files.
    }
  }
  return metas;
}

/**
 * Read the first `limit` lines of a session JSONL file and parse each line.
 * Returns [] if the file does not exist or is unreadable.
 * @param {string} projectDir
 * @param {string} sessionId
 * @param {number} limit
 * @returns {object[]}
 */
function _readPhaseRecords(projectDir, sessionId, limit) {
  const jsonlPath = join(projectDir, `${sessionId}.jsonl`);
  if (!existsSync(jsonlPath)) return [];

  let raw = '';
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return [];
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const records = [];
  for (const line of lines.slice(0, limit)) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Skip malformed JSONL lines.
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// JSDoc typedefs (not exported at runtime; used only for type documentation)
// ---------------------------------------------------------------------------

/**
 * @typedef {{ sessionId?: string; name?: string; status?: string; cwd?: string; startedAt?: number | null; pid?: number | null; kind?: string }} AgentRow
 * @typedef {{ sessionId: string; shortId: string; name: string; status: string; cwd: string; startedAt: number | null; pid: number | null }} WorkflowSession
 * @typedef {{ jobId: string; sessionId: string; name: string; status: string; cwd: string; startedAt: number | null; subagents: SubagentMeta[]; phaseRecords: object[] }} WorkflowDetail
 * @typedef {{ agentId: string; name: string; tokens: number | null; duration_ms: number | null; tool_uses: number | null; result: string | null; status: string }} SubagentMeta
 */
