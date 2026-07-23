import { readFile } from 'node:fs/promises';
import type { DriverEvent } from '@codex-delegation/runtime';

export interface PiTranscriptWarning {
  line: number;
  message: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contentText(message: Record<string, unknown>): string {
  const content = message['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((item) => {
      const row = record(item);
      return row?.['type'] === 'text' && typeof row['text'] === 'string' ? [row['text']] : [];
    })
    .join('\n');
}

export function parsePiTranscriptJsonl(text: string): {
  events: DriverEvent[];
  warnings: PiTranscriptWarning[];
  sessionId?: string;
  finalMessage?: string;
} {
  const events: DriverEvent[] = [];
  const warnings: PiTranscriptWarning[] = [];
  let sessionId: string | undefined;
  let finalMessage: string | undefined;
  for (const [index, source] of text.split(/\r?\n/).entries()) {
    if (!source.trim()) continue;
    let raw: Record<string, unknown>;
    try {
      const parsed = record(JSON.parse(source));
      if (!parsed) throw new Error('row is not an object');
      raw = parsed;
    } catch (error) {
      warnings.push({
        line: index + 1,
        message: error instanceof Error ? error.message : 'invalid JSON',
      });
      continue;
    }
    const type = raw['type'];
    const at = typeof raw['timestamp'] === 'string' ? raw['timestamp'] : new Date(0).toISOString();
    if (type === 'session' && typeof raw['id'] === 'string') sessionId = raw['id'];
    if (type === 'tool_execution_start' && typeof raw['toolName'] === 'string') {
      events.push({ type: 'tool.started', tool: raw['toolName'], input: raw['args'], at, raw });
    } else if (type === 'tool_execution_end' && typeof raw['toolName'] === 'string') {
      events.push({
        type: 'tool.completed',
        tool: raw['toolName'],
        ok: raw['isError'] !== true,
        ...(raw['result'] === undefined
          ? {}
          : { resultPreview: String(raw['result']).slice(0, 240) }),
        at,
        raw,
      });
    } else if (type === 'message_end') {
      const message = record(raw['message']);
      if (!message) continue;
      const role = message['role'];
      const content = contentText(message);
      if ((role === 'assistant' || role === 'user') && content) {
        events.push({ type: 'message.completed', role, content, at, raw });
        if (role === 'assistant') finalMessage = content;
      }
    }
  }
  return {
    events,
    warnings,
    ...(sessionId ? { sessionId } : {}),
    ...(finalMessage ? { finalMessage } : {}),
  };
}

export async function readPiTranscript(
  path: string,
): Promise<ReturnType<typeof parsePiTranscriptJsonl>> {
  try {
    return parsePiTranscriptJsonl(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [], warnings: [] };
    throw error;
  }
}
