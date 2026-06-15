// workflows-inspector.mjs — CLI-only inspector for Claude Code workflow sessions.
//
// Architecture note (Plan 0016 T2 pivot + Plan 0017 hotfix):
//   The Claude Code /workflows TUI panel is SESSION-SCOPED — it shows only
//   workflows started within the current interactive TUI session, NOT background
//   sessions started via 'cc workflow' (--bg). See Plan 0016 OQ-A artifact
//   (oq-a-workflows-ansi-capture-20260606.txt) for the empirical evidence.
//
//   This module reads from the local cc-plugin-codex job store at
//   ~/.codex/cc-plugin-codex/jobs/*.json (resolved via the runtime's
//   getJobsDir helper, which honors CC_PLUGIN_CODEX_HOME for tests). The
//   `prompt.summary` field of each job record reveals which jobs were
//   triggered as workflow-like sessions: "ultracode: " from cmdWorkflow and
//   "/deep-research " from cmdDeepResearch.
//
//   Per-subagent / phase enrichment still reads
//   ~/.claude/projects/<sanitized-cwd>/<sessionId>/subagents/*.meta.json and
//   the corresponding session JSONL.
//
// Public API (pure data, no console output):
//   listWorkflows({ all, cwd })             → { sessions: WorkflowSession[] }
//   inspectWorkflow(jobId)                  → WorkflowDetail

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { listJobs } from '@cc-plugin-codex/runtime';

const WORKFLOW_PROMPT_KINDS = [
  { kind: 'dynamic_workflow', prefix: 'ultracode: ' },
  { kind: 'deep_research', prefix: '/deep-research ' },
];

// ---------------------------------------------------------------------------
// listWorkflows
// ---------------------------------------------------------------------------

/**
 * List all cc-plugin-codex background jobs that were started as workflows.
 *
 * A job qualifies as workflow-inspectable when its `prompt.summary` field
 * starts with a known workflow-like command prefix. The session NAME field is
 * unreliable for this filter because the driver sets it to
 * "codex:<workspace>:<id>".
 *
 * @param {{ all?: boolean; cwd?: string }} opts
 * @returns {Promise<{ sessions: WorkflowSession[] }>}
 */
export async function listWorkflows({ all = false, cwd } = {}) {
  const currentCwd = _normalizePath(cwd ?? process.cwd());

  const result = await listJobs();
  const jobs = result.jobs ?? [];

  // Filter to workflow jobs and, when `all` is false (default), scope to
  // the current workspace via realpath-normalized comparison. This mirrors
  // the macOS /var/folders ↔ /private/var/folders behavior — the job
  // record's stored workspace.root may differ syntactically from
  // process.cwd() even when they reference the same directory.
  const sessions = jobs
    .filter(_isWorkflowJob)
    .filter((job) => all || _normalizePath(job.workspace?.root) === currentCwd)
    .map(_toWorkflowSession);

  return { sessions };
}

// ---------------------------------------------------------------------------
// inspectWorkflow
// ---------------------------------------------------------------------------

/**
 * Drill into a single workflow job by jobId (full id or short prefix).
 *
 * Reads:
 *   - The local job record at ~/.codex/cc-plugin-codex/jobs/<jobId>.json
 *   - ~/.claude/projects/<sanitized-cwd>/<sessionId>/subagents/*.meta.json
 *   - ~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl (first 30 lines)
 *
 * @param {string} jobId  Full id or prefix.
 * @returns {Promise<WorkflowDetail>}
 */
export async function inspectWorkflow(jobId) {
  const result = await listJobs();
  const jobs = result.jobs ?? [];

  // Accept either the cc job id (job_…) OR the Claude session id. The list
  // view shows the 8-char session shortId in its first column and instructs
  // "cc workflows <sessionId>", so the displayed id must resolve here.
  const job = jobs.find((j) => {
    if (j.jobId === jobId) return true;
    if (typeof j.jobId === 'string' && j.jobId.startsWith(jobId)) return true;
    const sid = _sessionId(j);
    return sid !== '' && (sid === jobId || sid.startsWith(jobId));
  });

  if (!job) {
    throw new Error(`No workflow found matching job id or session id "${jobId}"`);
  }

  if (!_isWorkflowJob(job)) {
    throw new Error(
      `Job "${job.jobId}" is not workflow-inspectable (prompt does not begin with "ultracode: " or "/deep-research ").`,
    );
  }

  const sessionId = _sessionId(job);
  const cwd = job.workspace?.root ?? job.codex?.cwd ?? process.cwd();
  const projectDir = _resolveProjectDir(cwd);

  const subagents = _readSubagentMeta(projectDir, sessionId);
  const phaseRecords = _readPhaseRecords(projectDir, sessionId, 30);

  return {
    jobId: job.jobId,
    sessionId,
    name: _sessionName(job),
    kind: _workflowKind(job),
    status: job.status ?? 'unknown',
    cwd,
    startedAt: job.createdAt ?? null,
    subagents,
    phaseRecords,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * A job is workflow-inspectable when its prompt.summary starts with a known
 * workflow-like prefix.
 * @param {any} job
 */
function _isWorkflowJob(job) {
  return _workflowKind(job) !== null;
}

/**
 * @param {any} job
 * @returns {'dynamic_workflow' | 'deep_research' | null}
 */
function _workflowKind(job) {
  const summary = job?.prompt?.summary;
  if (typeof summary !== 'string') return null;
  return WORKFLOW_PROMPT_KINDS.find((entry) => summary.startsWith(entry.prefix))?.kind ?? null;
}

/**
 * Resolve the Claude session id from a job record. The driver stores it under
 * `job.claude.sessionId`; older/forward-compat records may carry a top-level
 * `job.sessionId`. Returns '' when neither is present.
 * @param {any} job
 */
function _sessionId(job) {
  return job?.claude?.sessionId ?? job?.sessionId ?? '';
}

/**
 * Resolve the Claude session name from a job record (`job.claude.sessionName`,
 * with a top-level `job.sessionName` fallback). Returns '' when neither exists.
 * @param {any} job
 */
function _sessionName(job) {
  return job?.claude?.sessionName ?? job?.sessionName ?? '';
}

/**
 * Map a JobRecord to a WorkflowSession summary.
 * @param {any} job
 * @returns {WorkflowSession}
 */
function _toWorkflowSession(job) {
  const sessionId = _sessionId(job);
  return {
    jobId: job.jobId ?? '',
    sessionId,
    shortId: _shortId(sessionId || job.jobId || ''),
    name: _sessionName(job),
    kind: _workflowKind(job),
    status: job.status ?? 'unknown',
    cwd: job.workspace?.root ?? job.codex?.cwd ?? '',
    startedAt: job.createdAt ?? null,
    promptSummary: job.prompt?.summary ?? '',
  };
}

/**
 * Return first 8 chars of a UUID-shaped id.
 * @param {string} id
 */
function _shortId(id) {
  return id.slice(0, 8);
}

/**
 * Normalize a filesystem path for equality comparison.
 * Falls back to the input string if the path does not exist on disk.
 * @param {string|undefined} p
 */
function _normalizePath(p) {
  if (!p) return '';
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Sanitize a cwd path to the format Claude uses for project directories.
 *   /Users/foo/bar  →  -Users-foo-bar  (leading hyphen preserved)
 * Matches the actual on-disk format under ~/.claude/projects/.
 * @param {string} cwd
 */
export function _sanitizeCwd(cwd) {
  return cwd.replace(/\//g, '-');
}

/**
 * Resolve the per-project directory under ~/.claude/projects/.
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
 */
function _readSubagentMeta(projectDir, sessionId) {
  const subagentsDir = join(projectDir, sessionId, 'subagents');
  if (!existsSync(subagentsDir)) return [];

  const entries = readdirSync(subagentsDir).filter((f) => f.endsWith('.meta.json'));
  const subagents = [];
  for (const entry of entries) {
    try {
      const raw = readFileSync(join(subagentsDir, entry), 'utf8');
      const meta = JSON.parse(raw);
      subagents.push({
        agentId: meta.agentId ?? entry.replace(/\.meta\.json$/, ''),
        status: meta.status ?? null,
        tokens: meta.tokens ?? null,
        duration_ms: meta.duration_ms ?? null,
        tool_uses: meta.tool_uses ?? null,
        result: meta.result ?? null,
      });
    } catch {
      // Skip unparseable meta files.
    }
  }
  return subagents;
}

/**
 * Read the first N lines of the session JSONL for phase records.
 * @param {string} projectDir
 * @param {string} sessionId
 * @param {number} maxLines
 */
function _readPhaseRecords(projectDir, sessionId, maxLines) {
  const jsonlPath = join(projectDir, `${sessionId}.jsonl`);
  if (!existsSync(jsonlPath)) return [];

  try {
    const raw = readFileSync(jsonlPath, 'utf8');
    const lines = raw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(0, maxLines);
    const records = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // Skip unparseable lines.
      }
    }
    return records;
  } catch {
    return [];
  }
}
