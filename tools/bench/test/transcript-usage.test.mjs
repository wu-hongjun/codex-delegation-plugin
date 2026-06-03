/**
 * Self-tests for tools/bench/lib/transcript-usage.mjs
 * Uses node:test + node:assert/strict only. No third-party deps.
 * Fixture JSONL files are written to a per-test temp dir.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { aggregateUsage, sanitizeCwd } from '../lib/transcript-usage.mjs';

/** Create a temp dir, write a JSONL file with the given lines, return { dir, filePath, cleanup }. */
function makeFixture(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-test-transcript-'));
  const filePath = join(dir, 'session.jsonl');
  writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return { dir, filePath, cleanup };
}

/** Build a JSONL entry with message.usage fields. */
function usageEntry(opts = {}) {
  const {
    inputTokens = 10,
    outputTokens = 5,
    cacheCreation = 0,
    cacheRead = 0,
    ephemeral1h = 0,
    ephemeral5m = 0,
    serviceTier = 'standard',
  } = opts;

  const cacheCreationObj = ephemeral1h > 0 || ephemeral5m > 0
    ? {
        ...(ephemeral1h > 0 ? { ephemeral_1h_input_tokens: ephemeral1h } : {}),
        ...(ephemeral5m > 0 ? { ephemeral_5m_input_tokens: ephemeral5m } : {}),
      }
    : undefined;

  return JSON.stringify({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
        ...(cacheCreationObj ? { cache_creation: cacheCreationObj } : {}),
        service_tier: serviceTier,
      },
    },
  });
}

// ---------------------------------------------------------------------------

describe('aggregateUsage() — missing / empty / no-usage files', () => {
  it('returns null for a path that does not exist', async () => {
    const result = await aggregateUsage('/nonexistent/path/session.jsonl');
    assert.equal(result, null);
  });

  it('returns null for an empty file', async () => {
    const { filePath, cleanup } = makeFixture([]);
    try {
      const result = await aggregateUsage(filePath);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });

  it('returns null when no lines have message.usage', async () => {
    const { filePath, cleanup } = makeFixture([
      JSON.stringify({ type: 'human', message: { role: 'user', content: 'hello' } }),
      JSON.stringify({ type: 'system', event: 'session_started' }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });
});

describe('aggregateUsage() — single message', () => {
  it('returns correct aggregated shape for a single usage entry', async () => {
    const { filePath, cleanup } = makeFixture([
      usageEntry({ inputTokens: 100, outputTokens: 50, serviceTier: 'standard' }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null, 'expected non-null result');
      assert.equal(result.inputTokens, 100);
      assert.equal(result.outputTokens, 50);
      assert.equal(result.cacheCreationInputTokens, 0);
      assert.equal(result.cacheReadInputTokens, 0);
      assert.equal(result.cacheEphemeral1hInputTokens, 0);
      assert.equal(result.cacheEphemeral5mInputTokens, 0);
      assert.equal(result.messageCount, 1);
      assert.equal(result.serviceTier, 'standard');
    } finally {
      cleanup();
    }
  });
});

describe('aggregateUsage() — multi-message aggregation', () => {
  it('sums tokens across multiple messages correctly', async () => {
    const { filePath, cleanup } = makeFixture([
      usageEntry({ inputTokens: 100, outputTokens: 50, cacheCreation: 10, cacheRead: 5 }),
      usageEntry({ inputTokens: 200, outputTokens: 80, cacheCreation: 20, cacheRead: 15 }),
      usageEntry({ inputTokens: 50, outputTokens: 25 }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null);
      assert.equal(result.inputTokens, 350);
      assert.equal(result.outputTokens, 155);
      assert.equal(result.cacheCreationInputTokens, 30);
      assert.equal(result.cacheReadInputTokens, 20);
      assert.equal(result.messageCount, 3);
    } finally {
      cleanup();
    }
  });

  it('reports serviceTier when consistent across all messages', async () => {
    const { filePath, cleanup } = makeFixture([
      usageEntry({ serviceTier: 'standard' }),
      usageEntry({ serviceTier: 'standard' }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null);
      assert.equal(result.serviceTier, 'standard');
    } finally {
      cleanup();
    }
  });

  it('reports serviceTier as null when mixed across messages', async () => {
    const { filePath, cleanup } = makeFixture([
      usageEntry({ serviceTier: 'standard' }),
      usageEntry({ serviceTier: 'priority' }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null);
      assert.equal(result.serviceTier, null);
    } finally {
      cleanup();
    }
  });
});

describe('aggregateUsage() — malformed lines', () => {
  it('skips malformed JSON lines without throwing', async () => {
    const { filePath, cleanup } = makeFixture([
      'this is not json',
      usageEntry({ inputTokens: 42, outputTokens: 7 }),
      '{broken json',
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null);
      assert.equal(result.inputTokens, 42);
      assert.equal(result.outputTokens, 7);
      assert.equal(result.messageCount, 1);
    } finally {
      cleanup();
    }
  });
});

describe('aggregateUsage() — ephemeral cache fields', () => {
  it('aggregates cache_creation.ephemeral_1h_input_tokens correctly', async () => {
    const { filePath, cleanup } = makeFixture([
      usageEntry({ ephemeral1h: 300, ephemeral5m: 0 }),
      usageEntry({ ephemeral1h: 200, ephemeral5m: 0 }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null);
      assert.equal(result.cacheEphemeral1hInputTokens, 500);
      assert.equal(result.cacheEphemeral5mInputTokens, 0);
    } finally {
      cleanup();
    }
  });

  it('aggregates cache_creation.ephemeral_5m_input_tokens correctly', async () => {
    const { filePath, cleanup } = makeFixture([
      usageEntry({ ephemeral1h: 0, ephemeral5m: 100 }),
      usageEntry({ ephemeral1h: 0, ephemeral5m: 50 }),
    ]);
    try {
      const result = await aggregateUsage(filePath);
      assert.ok(result !== null);
      assert.equal(result.cacheEphemeral5mInputTokens, 150);
      assert.equal(result.cacheEphemeral1hInputTokens, 0);
    } finally {
      cleanup();
    }
  });
});

describe('sanitizeCwd()', () => {
  it('replaces all slashes with dashes', () => {
    assert.equal(
      sanitizeCwd('/Users/hongjunwu/Repositories/Git/cc-plugin-codex'),
      '-Users-hongjunwu-Repositories-Git-cc-plugin-codex',
    );
  });

  it('handles a path that already starts with a dash (edge case)', () => {
    // '/foo' → '-foo', which already starts with '-'
    const result = sanitizeCwd('/foo');
    assert.equal(result, '-foo');
  });

  it('prepends a dash if the result does not start with one', () => {
    // A path like 'relative/path' (no leading slash) → 'relative-path' (no leading dash)
    // should get a prepended dash.
    const result = sanitizeCwd('relative/path');
    assert.ok(result.startsWith('-'), `expected leading dash, got: ${result}`);
  });

  it('preserves dots in path segments', () => {
    const result = sanitizeCwd('/home/user/.config');
    assert.equal(result, '-home-user-.config');
  });
});
