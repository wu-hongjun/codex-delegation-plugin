import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { makePiAdapter } from '../scripts/lib/pi-adapter.mjs';

test('Pi adapter resolves the current turn transcript from runner state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-adapter-'));
  try {
    const staleTranscript = join(dir, 'turn-0.jsonl');
    const currentTranscript = join(dir, 'turn-1.jsonl');
    const errorPath = join(dir, 'stderr.log');
    const statePath = join(dir, 'state.json');
    await Promise.all([
      writeFile(
        staleTranscript,
        `${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'old answer' }] } })}\n`,
      ),
      writeFile(
        currentTranscript,
        `${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'new answer' }] } })}\n`,
      ),
      writeFile(errorPath, ''),
      writeFile(
        statePath,
        JSON.stringify({
          schemaVersion: 1,
          driverName: 'pi-cli',
          shortId: 'abc',
          sessionName: 'test',
          cwd: dir,
          status: 'completed',
          runnerPid: 1,
          startedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          resultPath: join(dir, 'result.md'),
          errorPath,
          transcriptPath: currentTranscript,
          sessionDir: join(dir, 'sessions'),
          resumeArgs: [],
          turnIndex: 1,
        }),
      ),
    ]);

    const adapter = makePiAdapter({ status: async () => ({ value: 'completed' }) });
    const ref = {
      driverName: 'pi-cli',
      shortId: 'abc',
      sessionName: 'test',
      cwd: dir,
      statePath,
      transcriptPath: staleTranscript,
      errorPath,
    };
    const transcript = await adapter.readTranscriptEvents(ref);
    assert.equal(transcript.transcriptPath, currentTranscript);
    assert.equal(
      transcript.events.find((event) => event.type === 'message.completed')?.content,
      'new answer',
    );
    assert.match((await adapter.readLogs(ref)).stdout, /new answer/);
    assert.doesNotMatch((await adapter.readLogs(ref)).stdout, /old answer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
