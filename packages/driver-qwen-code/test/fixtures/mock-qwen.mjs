#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('0.20.1');
  process.exit(0);
}
if (args[0] === '--help') {
  console.log('--output-format text|json|stream-json --resume <id> --approval-mode');
  process.exit(0);
}

if (process.env.MOCK_QWEN_INVOCATIONS) {
  appendFileSync(
    process.env.MOCK_QWEN_INVOCATIONS,
    JSON.stringify({ args, cwd: process.cwd() }) + '\n',
  );
}
const value = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const resumed = value('--resume');
const sessionId =
  resumed ?? process.env.MOCK_QWEN_SESSION_ID ?? '123e4567-e89b-12d3-a456-426614174000';
const prompt = value('--prompt') ?? args.at(-1) ?? '';
const sleep = Number(process.env.MOCK_QWEN_DELAY_MS ?? 0);
if (sleep) await new Promise((resolve) => setTimeout(resolve, sleep));

console.log(
  JSON.stringify({
    type: 'system',
    subtype: 'session_start',
    uuid: 'system-1',
    session_id: sessionId,
    model: 'qwen-test',
  }),
);
console.log(
  JSON.stringify({
    type: 'assistant',
    uuid: 'assistant-1',
    session_id: sessionId,
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'README.md' } },
        { type: 'text', text: `Qwen completed: ${prompt}` },
      ],
      usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 2 },
    },
  }),
);
if (process.env.MOCK_QWEN_FAIL === '1') {
  console.error('mock failure');
  process.exit(7);
}
console.log(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    uuid: 'result-1',
    session_id: sessionId,
    is_error: false,
    result: `Qwen completed: ${prompt}`,
  }),
);
