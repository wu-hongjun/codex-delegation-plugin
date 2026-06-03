import { withRetry } from './lib/helpers.js';

const oldName = 'demo-app';

export function processData(input) {
  if (input == null) return [];
  return withRetry(() => input.map((row) => ({ ...row, source: oldName })), 3);
}

export function describe() {
  return `${oldName} processor`;
}
