import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { DriverEvent } from '@codex-delegation/runtime';

import { readAgyState } from './state.js';

export interface AgyTranscriptWarning {
  line: number;
  message: string;
}

export interface AgyTranscriptReadOptions {
  transcriptPath?: string;
  conversationId?: string;
  statePath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface AgyTranscriptReadResult {
  transcriptPath: string | null;
  events: DriverEvent[];
  warnings: AgyTranscriptWarning[];
}

const TOOL_RESULT_TYPES = new Set([
  'RUN_COMMAND',
  'VIEW_FILE',
  'WRITE_TO_FILE',
  'REPLACE_FILE_CONTENT',
  'MULTI_REPLACE_FILE_CONTENT',
  'LIST_DIR',
  'FIND_BY_NAME',
  'GREP_SEARCH',
  'SEARCH_WEB',
  'READ_URL_CONTENT',
  'MANAGE_TASK',
  'INVOKE_SUBAGENT',
  'DEFINE_SUBAGENT',
  'SEND_MESSAGE',
  'MANAGE_SUBAGENTS',
  'ASK_QUESTION',
  'GENERATE_IMAGE',
]);

const FILE_TOOL_NAMES = new Set([
  'write_to_file',
  'replace_file_content',
  'multi_replace_file_content',
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function atFor(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : new Date(0).toISOString();
}

function normalizeToolArgs(value: unknown): unknown {
  const raw = record(value);
  if (!raw) return value;
  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(raw)) {
    if (typeof item !== 'string') {
      normalized[key] = item;
      continue;
    }
    try {
      normalized[key] = JSON.parse(item);
    } catch {
      normalized[key] = item;
    }
  }
  return normalized;
}

function filePathFromTool(tool: string, input: unknown): string | undefined {
  if (!FILE_TOOL_NAMES.has(tool)) return undefined;
  const args = record(input);
  const candidate =
    args?.['TargetFile'] ?? args?.['targetFile'] ?? args?.['file_path'] ?? args?.['path'];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function truncate(value: string, max = 240): string {
  return value.length <= max ? value : value.slice(0, max) + '…';
}

export function parseAgyTranscriptJsonl(text: string): {
  events: DriverEvent[];
  warnings: AgyTranscriptWarning[];
} {
  const events: DriverEvent[] = [];
  const warnings: AgyTranscriptWarning[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    let raw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line);
      const parsedRecord = record(parsed);
      if (!parsedRecord) {
        warnings.push({ line: index + 1, message: 'transcript row is not an object' });
        continue;
      }
      raw = parsedRecord;
    } catch (error) {
      warnings.push({
        line: index + 1,
        message: error instanceof Error ? error.message : 'invalid JSON',
      });
      continue;
    }

    const type = typeof raw['type'] === 'string' ? raw['type'] : '';
    const at = atFor(raw['created_at']);

    if (type === 'PLANNER_RESPONSE') {
      const toolCalls = Array.isArray(raw['tool_calls']) ? raw['tool_calls'] : [];
      for (const item of toolCalls) {
        const call = record(item);
        if (!call || typeof call['name'] !== 'string') continue;
        const tool = call['name'];
        const input = normalizeToolArgs(call['args']);
        events.push({ type: 'tool.started', tool, input, at, raw: call });
        const changedPath = filePathFromTool(tool, input);
        if (changedPath) {
          events.push({ type: 'file.changed', path: changedPath, op: 'modify', at, raw: call });
        }
      }

      // Deliberately ignore the provider's private `thinking` field. Only the
      // assistant-visible content is surfaced through the runtime.
      if (typeof raw['content'] === 'string' && raw['content'].length > 0) {
        events.push({
          type: 'message.completed',
          role: 'assistant',
          content: raw['content'],
          at,
          raw: { step_index: raw['step_index'], type, status: raw['status'] },
        });
      }
      continue;
    }

    if (TOOL_RESULT_TYPES.has(type)) {
      const tool = type.toLowerCase();
      const content = typeof raw['content'] === 'string' ? raw['content'] : '';
      events.push({
        type: 'tool.completed',
        tool,
        ok: raw['status'] !== 'FAILED' && !raw['error'],
        ...(content ? { resultPreview: truncate(content) } : {}),
        at,
        raw: { step_index: raw['step_index'], type, status: raw['status'] },
      });
    }
  }

  return { events, warnings };
}

async function readable(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf8');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function discoverAgyTranscriptPath(
  opts: AgyTranscriptReadOptions,
): Promise<string | null> {
  const state = opts.statePath ? await readAgyState(opts.statePath) : null;
  const explicit = opts.transcriptPath ?? state?.transcriptPath;
  if (explicit && (await readable(explicit))) return explicit;

  const conversationId = opts.conversationId ?? state?.conversationId;
  if (!conversationId) return null;
  const userHome = opts.env?.['HOME'] ?? homedir();
  const logsDir = join(
    userHome,
    '.gemini',
    'antigravity-cli',
    'brain',
    conversationId,
    '.system_generated',
    'logs',
  );
  for (const filename of ['transcript.jsonl', 'transcript_full.jsonl']) {
    const candidate = join(logsDir, filename);
    if (await readable(candidate)) return candidate;
  }
  return null;
}

export async function readAgyTranscriptEvents(
  opts: AgyTranscriptReadOptions,
): Promise<AgyTranscriptReadResult> {
  const transcriptPath = await discoverAgyTranscriptPath(opts);
  if (!transcriptPath) {
    return {
      transcriptPath: null,
      events: [],
      warnings: [{ line: 0, message: 'transcript not found' }],
    };
  }
  const text = await readFile(transcriptPath, 'utf8');
  return { transcriptPath, ...parseAgyTranscriptJsonl(text) };
}

export function finalAgyAssistantMessage(events: DriverEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'message.completed' && event.role === 'assistant') {
      return event.content;
    }
  }
  return undefined;
}
