import { readFile } from 'node:fs/promises';

import type { DriverEvent } from '@codex-delegation/runtime';

export interface TranscriptWarning {
  line: number;
  message: string;
}

export interface QwenTranscript {
  transcriptPath: string | null;
  events: DriverEvent[];
  warnings: TranscriptWarning[];
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function at(row: Record<string, unknown>): string {
  return typeof row['timestamp'] === 'string' ? row['timestamp'] : new Date(0).toISOString();
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseQwenTranscriptJsonl(text: string): {
  events: DriverEvent[];
  warnings: TranscriptWarning[];
} {
  const events: DriverEvent[] = [];
  const warnings: TranscriptWarning[] = [];
  for (const [index, source] of text.split(/\r?\n/).entries()) {
    const line = source.trim();
    if (!line) continue;
    let row: Record<string, unknown>;
    try {
      const parsed = object(JSON.parse(line));
      if (!parsed) throw new Error('row is not an object');
      row = parsed;
    } catch (error) {
      warnings.push({ line: index + 1, message: (error as Error).message });
      continue;
    }
    const timestamp = at(row);
    if (row['type'] === 'assistant') {
      const message = object(row['message']);
      const content = Array.isArray(message?.['content']) ? message['content'] : [];
      const textParts: string[] = [];
      for (const rawBlock of content) {
        const block = object(rawBlock);
        if (!block) continue;
        if (block['type'] === 'text' && typeof block['text'] === 'string') {
          textParts.push(block['text']);
        } else if (
          block['type'] === 'tool_use' &&
          typeof block['name'] === 'string'
        ) {
          events.push({
            type: 'tool.started',
            tool: block['name'],
            input: block['input'],
            at: timestamp,
            raw: block,
          });
        } else if (block['type'] === 'tool_result') {
          const preview =
            typeof block['content'] === 'string' ? block['content'].slice(0, 1000) : undefined;
          events.push({
            type: 'tool.completed',
            tool:
              typeof block['tool_name'] === 'string'
                ? block['tool_name']
                : typeof block['tool_use_id'] === 'string'
                  ? block['tool_use_id']
                  : 'tool',
            ok: block['is_error'] !== true,
            ...(preview ? { resultPreview: preview } : {}),
            at: timestamp,
            raw: block,
          });
        }
      }
      if (textParts.length > 0) {
        events.push({
          type: 'message.completed',
          role: 'assistant',
          content: textParts.join(''),
          at: timestamp,
        });
      }
      const usage = object(message?.['usage']);
      if (usage) {
        events.push({
          type: 'usage.updated',
          input: number(usage['input_tokens']),
          output: number(usage['output_tokens']),
          cacheRead: number(usage['cache_read_input_tokens']),
          cacheCreate: number(usage['cache_creation_input_tokens']),
          at: timestamp,
          raw: usage,
        });
      }
    } else if (row['type'] === 'user') {
      const message = object(row['message']);
      if (typeof message?.['content'] === 'string') {
        events.push({
          type: 'message.completed',
          role: 'user',
          content: message['content'],
          at: timestamp,
          raw: row,
        });
      }
    } else if (row['type'] === 'result' && row['is_error'] === true) {
      const error = object(row['error']);
      events.push({
        type: 'error',
        message:
          typeof error?.['message'] === 'string'
            ? error['message']
            : `Qwen result: ${String(row['subtype'] ?? 'error')}`,
        at: timestamp,
        cause: row,
      });
    }
  }
  return { events, warnings };
}

export async function readQwenTranscriptEvents(options: {
  transcriptPath?: string;
}): Promise<QwenTranscript> {
  if (!options.transcriptPath) {
    return {
      transcriptPath: null,
      events: [],
      warnings: [{ line: 0, message: 'transcript not found' }],
    };
  }
  try {
    const text = await readFile(options.transcriptPath, 'utf8');
    return { transcriptPath: options.transcriptPath, ...parseQwenTranscriptJsonl(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        transcriptPath: null,
        events: [],
        warnings: [{ line: 0, message: 'transcript not found' }],
      };
    }
    throw error;
  }
}

export function finalQwenAssistantMessage(events: DriverEvent[]): string | undefined {
  return events
    .filter(
      (event): event is DriverEvent & { type: 'message.completed'; role: 'assistant' } =>
        event.type === 'message.completed' && event.role === 'assistant',
    )
    .at(-1)?.content;
}
