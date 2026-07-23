import { readFile } from 'node:fs/promises';

import { readPiState, readPiTranscript } from '@codex-delegation/driver-pi-cli';

export function makePiAdapter(driver) {
  return {
    async status(ref) {
      return driver.status({
        driverName: ref.driverName,
        shortId: ref.shortId,
        sessionId: ref.sessionId,
        sessionName: ref.sessionName,
        cwd: ref.cwd,
        startedAt: new Date(0).toISOString(),
        statePath: ref.statePath,
        resultPath: ref.resultPath,
        errorPath: ref.errorPath,
      });
    },

    async readTranscriptEvents(ref) {
      const state = ref.statePath ? await readPiState(ref.statePath) : null;
      const transcriptPath = state?.transcriptPath ?? ref.transcriptPath;
      if (!transcriptPath) return { transcriptPath: null, events: [], warnings: [] };
      const parsed = await readPiTranscript(transcriptPath);
      return {
        transcriptPath,
        events: parsed.events,
        warnings: parsed.warnings,
      };
    },

    async readLogs(ref) {
      const state = ref.statePath ? await readPiState(ref.statePath) : null;
      const transcriptPath = state?.transcriptPath ?? ref.transcriptPath;
      const errorPath = state?.errorPath ?? ref.errorPath;
      const [stdout, stderr] = await Promise.all([
        readFile(transcriptPath ?? '', 'utf8').catch(() => ''),
        readFile(errorPath ?? '', 'utf8').catch(() => ''),
      ]);
      // Reconciliation may promote `text` into result.md. Keep raw JSONL
      // available as diagnostic stdout, but never use it as a result fallback:
      // provider transcripts can contain private reasoning blocks.
      return { text: stderr, stdout, stderr };
    },

    async readSidecar(ref) {
      if (!ref.statePath) return null;
      const state = await readPiState(ref.statePath);
      if (!state) return null;
      return {
        state:
          state.status === 'completed'
            ? 'done'
            : state.status === 'failed' || state.status === 'stopped'
              ? state.status
              : state.status,
        tempo: state.status === 'completed' ? 'idle' : 'active',
        inFlight: { tasks: state.status === 'running' ? 1 : 0, queued: 0, kinds: [] },
        output:
          state.status === 'completed'
            ? { result: await readFile(state.resultPath, 'utf8').catch(() => '') }
            : undefined,
      };
    },
  };
}
