// transcript.ts — JSONL transcript parsing and path discovery for ClaudeBackgroundDriver.
//
// Owns: discoverTranscriptPath, parseTranscriptJsonl, readTranscriptEvents.
// Does NOT spawn processes or do reconciliation.

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { DriverError } from '@cc-plugin-codex/runtime';
import type { DriverEvent } from '@cc-plugin-codex/runtime';

// ---------- public types ----------

export interface TranscriptParseWarning {
  line: number; // 1-indexed line number in the raw text
  message: string;
  raw?: string; // the raw line text
  parsed?: unknown; // parsed-but-rejected JSON, when applicable
}

export interface TranscriptParseResult {
  events: DriverEvent[];
  warnings: TranscriptParseWarning[];
}

export interface TranscriptReadOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  transcriptPath?: string;
  sessionId?: string;
  sessionName?: string;
  claudeProjectsDir?: string;
}

export interface TranscriptReadResult {
  transcriptPath: string | null;
  events: DriverEvent[];
  warnings: TranscriptParseWarning[];
}

// ---------- parseTranscriptJsonl ----------

function extractAt(r: Record<string, unknown>): string {
  const ts = r['timestamp'] ?? r['createdAt'] ?? r['created_at'] ?? r['time'] ?? r['at'];
  if (typeof ts === 'string' && ts.length > 0) return ts;
  return new Date().toISOString();
}

function extractContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((el) => {
        if (typeof el === 'string') return el;
        if (el !== null && typeof el === 'object') {
          const o = el as Record<string, unknown>;
          if (o['type'] === 'text' && typeof o['text'] === 'string') return o['text'];
        }
        return '';
      })
      .filter((s) => s.length > 0)
      .join('\n');
  }
  return '';
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

function isMetadata(r: Record<string, unknown>): boolean {
  // Explicit meta/metadata type.
  if (r['type'] === 'meta' || r['type'] === 'metadata') return true;

  // Pure header record: has sessionId/session_id and no other recognized fields.
  const hasSessionId = typeof r['sessionId'] === 'string' || typeof r['session_id'] === 'string';
  if (!hasSessionId) return false;

  const recognizedFields = new Set([
    'type',
    'sessionId',
    'session_id',
    'startedAt',
    'started_at',
    'cwd',
    'sessionName',
    'session_name',
    'name',
  ]);
  const keys = Object.keys(r);
  const hasOnlyHeaderFields = keys.every((k) => recognizedFields.has(k));
  return hasOnlyHeaderFields;
}

function classifyRecord(
  r: Record<string, unknown>,
  _lineNum: number,
): DriverEvent | 'metadata' | 'unknown' {
  const at = extractAt(r);

  // --- Metadata (skip silently) ---
  if (isMetadata(r)) return 'metadata';

  // --- Message ---
  const isMessageType = r['type'] === 'message' && r['role'];
  const isTopLevelRoleContent = r['role'] && 'content' in r;
  const nested = r['message'];
  const isNestedMessage =
    nested !== null &&
    typeof nested === 'object' &&
    !Array.isArray(nested) &&
    (nested as Record<string, unknown>)['role'] &&
    'content' in (nested as Record<string, unknown>);

  if (isMessageType || isTopLevelRoleContent || isNestedMessage) {
    let rawRole: unknown;
    let rawContent: unknown;

    if (isNestedMessage) {
      const msg = nested as Record<string, unknown>;
      rawRole = msg['role'];
      rawContent = msg['content'];
    } else {
      rawRole = r['role'];
      rawContent = r['content'];
    }

    if (rawRole !== 'user' && rawRole !== 'assistant') return 'unknown';

    const role = rawRole as 'user' | 'assistant';
    const content = extractContent(rawContent);

    const event: DriverEvent = {
      type: 'message.completed',
      role,
      content,
      at,
      raw: r,
    };
    return event;
  }

  // --- Tool start ---
  const isToolUseType = r['type'] === 'tool_use' && r['name'];
  const isToolStarted = r['tool'] && r['status'] === 'started';
  const toolCall = r['tool_call'];
  const isToolCallNoResult =
    toolCall !== null &&
    typeof toolCall === 'object' &&
    !Array.isArray(toolCall) &&
    (toolCall as Record<string, unknown>)['name'] &&
    !r['result'];

  if (isToolUseType || isToolStarted || isToolCallNoResult) {
    let tool: string;
    if (isToolUseType) {
      tool = r['name'] as string;
    } else if (isToolStarted) {
      tool = r['tool'] as string;
    } else {
      tool = (toolCall as Record<string, unknown>)['name'] as string;
    }

    const input =
      r['input'] ?? (toolCall ? (toolCall as Record<string, unknown>)['input'] : undefined);

    const event: DriverEvent = {
      type: 'tool.started',
      tool,
      input,
      at,
      raw: r,
    };
    return event;
  }

  // --- Tool complete ---
  const isToolResultType = r['type'] === 'tool_result' && (r['name'] || r['tool']);
  const isToolCompleted = r['tool'] && r['status'] === 'completed';

  if (isToolResultType || isToolCompleted) {
    const tool = (r['name'] ??
      r['tool'] ??
      (toolCall ? (toolCall as Record<string, unknown>)['name'] : undefined)) as string;

    const ok = r['status'] !== 'failed' && !r['error'] && r['is_error'] !== true;

    let resultPreview: string | undefined;
    if (typeof r['content'] === 'string') {
      resultPreview = truncate(r['content'], 240);
    } else if (typeof r['result'] === 'string') {
      resultPreview = truncate(r['result'], 240);
    } else if (r['content'] !== undefined || r['result'] !== undefined) {
      const summary = JSON.stringify(r['content'] ?? r['result']);
      resultPreview = truncate(summary, 240);
    }

    const event: DriverEvent = {
      type: 'tool.completed',
      tool,
      ok,
      resultPreview,
      at,
      raw: r,
    };
    return event;
  }

  // --- File change ---
  const isFileChangeType = r['type'] === 'file_change' && r['path'];
  const isFileField = typeof r['file'] === 'string' && (r['operation'] || r['op']);

  if (isFileChangeType || isFileField) {
    const path = (r['path'] ?? r['file']) as string;
    const rawOp = ((r['operation'] ?? r['op']) as string | undefined)?.toLowerCase().trim() ?? '';

    let op: 'add' | 'modify' | 'delete';
    if (['create', 'add', 'write'].includes(rawOp)) {
      op = 'add';
    } else if (['edit', 'modify', 'update'].includes(rawOp)) {
      op = 'modify';
    } else if (['delete', 'remove', 'rm'].includes(rawOp)) {
      op = 'delete';
    } else {
      op = 'modify';
    }

    const event: DriverEvent = {
      type: 'file.changed',
      path,
      op,
      at,
      raw: r,
    };
    return event;
  }

  // --- Usage ---
  const usageObj = r['usage'];
  const hasUsageField =
    usageObj !== null && typeof usageObj === 'object' && !Array.isArray(usageObj);
  const hasTopLevelTokens =
    'input_tokens' in r ||
    'output_tokens' in r ||
    'inputTokens' in r ||
    'outputTokens' in r ||
    'cacheReadInputTokens' in r ||
    'cache_read_input_tokens' in r ||
    'cacheCreationInputTokens' in r ||
    'cache_creation_input_tokens' in r;

  if (hasUsageField || hasTopLevelTokens) {
    const src = hasUsageField ? (usageObj as Record<string, unknown>) : r;

    const getNum = (...keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = src[k];
        if (typeof v === 'number') return v;
      }
      return undefined;
    };

    const input = getNum('inputTokens', 'input_tokens');
    const output = getNum('outputTokens', 'output_tokens');
    const cacheRead = getNum('cacheReadInputTokens', 'cache_read_input_tokens');
    const cacheCreate = getNum('cacheCreationInputTokens', 'cache_creation_input_tokens');

    const event: DriverEvent = {
      type: 'usage.updated',
      ...(input !== undefined && { input }),
      ...(output !== undefined && { output }),
      ...(cacheRead !== undefined && { cacheRead }),
      ...(cacheCreate !== undefined && { cacheCreate }),
      at,
      raw: r,
    };
    return event;
  }

  // --- Unknown ---
  return 'unknown';
}

export function parseTranscriptJsonl(text: string): TranscriptParseResult {
  const events: DriverEvent[] = [];
  const warnings: TranscriptParseWarning[] = [];

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1; // 1-indexed
    const line = lines[i]!;

    // Skip blank lines.
    if (line.trim().length === 0) continue;

    // Parse JSON.
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      const at = new Date().toISOString();
      const message = `transcript: malformed JSON at line ${lineNum}`;
      events.push({ type: 'error', message, cause: err, at });
      warnings.push({ line: lineNum, message, raw: line });
      continue;
    }

    // Must be a non-null object.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const at = new Date().toISOString();
      const message = `transcript: unknown record at line ${lineNum}`;
      events.push({ type: 'error', message, cause: undefined, at });
      warnings.push({ line: lineNum, message, parsed });
      continue;
    }

    const r = parsed as Record<string, unknown>;
    const result = classifyRecord(r, lineNum);

    if (result === 'metadata') {
      // Silently skip.
      continue;
    }

    if (result === 'unknown') {
      const at = new Date().toISOString();
      const message = `transcript: unknown record at line ${lineNum}`;
      events.push({ type: 'error', message, cause: undefined, at });
      warnings.push({ line: lineNum, message, parsed: r });
      continue;
    }

    events.push(result);
  }

  return { events, warnings };
}

// ---------- discoverTranscriptPath ----------

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function searchRootForSessionId(root: string, sessionId: string): Promise<string | null> {
  // Walk at most 2 levels deep: root + immediate subdirs.
  const target = `${sessionId}.jsonl`;

  // Level 1: directly in root.
  const direct = join(root, target);
  if (await fileExists(direct)) return direct;

  // Level 2: subdirectories of root.
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const subdir = join(root, entry);
    let isDir: boolean;
    try {
      const stat = await fs.stat(subdir);
      isDir = stat.isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const candidate = join(subdir, target);
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

export async function discoverTranscriptPath(opts: TranscriptReadOptions): Promise<string | null> {
  // 1. Explicit path provided and exists.
  if (opts.transcriptPath) {
    if (await fileExists(opts.transcriptPath)) return opts.transcriptPath;
  }

  // 2. sessionId-based search.
  if (opts.sessionId) {
    const roots: string[] = [];

    // Priority a: claudeProjectsDir option.
    if (opts.claudeProjectsDir) {
      roots.push(opts.claudeProjectsDir);
    }

    // Priority b: CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME env var → /projects subdir.
    const mockHome =
      opts.env?.['CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME'] ??
      process.env['CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME'];
    if (mockHome) {
      roots.push(join(mockHome, 'projects'));
    }

    // Priority c: ~/.claude/projects.
    roots.push(join(homedir(), '.claude', 'projects'));

    for (const root of roots) {
      if (!(await dirExists(root))) continue;
      const found = await searchRootForSessionId(root, opts.sessionId);
      if (found) return found;
    }
  }

  return null;
}

// ---------- readTranscriptEvents ----------

export async function readTranscriptEvents(
  opts: TranscriptReadOptions,
): Promise<TranscriptReadResult> {
  const path = await discoverTranscriptPath(opts);

  if (path === null) {
    return {
      transcriptPath: null,
      events: [],
      warnings: [{ line: 0, message: 'transcript not found' }],
    };
  }

  let text: string;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return {
        transcriptPath: null,
        events: [],
        warnings: [{ line: 0, message: 'transcript not found' }],
      };
    }
    throw new DriverError(`transcript read failed: ${nodeErr.message}`, {
      driverName: 'claude-background',
      operation: 'readTranscript',
      cause: err,
    });
  }

  return {
    transcriptPath: path,
    ...parseTranscriptJsonl(text),
  };
}
