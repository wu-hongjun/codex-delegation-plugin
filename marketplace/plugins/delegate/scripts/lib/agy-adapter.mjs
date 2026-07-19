import {
  readAgyOutput,
  readAgyState,
  readAgyTranscriptEvents,
} from '@codex-delegation/driver-agy-cli';

/**
 * @param {import('@codex-delegation/driver-agy-cli').AgyCliDriver} driver
 * @returns {import('@codex-delegation/runtime').ReconcilerAdapter}
 */
export function makeAgyAdapter(driver) {
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
      return readAgyTranscriptEvents({
        statePath: ref.statePath,
        conversationId: ref.sessionId,
        transcriptPath: ref.transcriptPath,
      });
    },

    async readLogs(ref) {
      const [terminal, stderr] = await Promise.all([
        readAgyOutput(ref.resultPath),
        readAgyOutput(ref.errorPath),
      ]);
      return { text: terminal || stderr, stdout: terminal, stderr };
    },

    async readSidecar(ref) {
      if (!ref.statePath) return null;
      const state = await readAgyState(ref.statePath);
      if (!state) return null;
      return {
        state:
          state.status === 'idle'
            ? 'done'
            : state.status === 'needs_input'
              ? 'waiting'
              : state.status,
        tempo:
          state.status === 'idle' ? 'idle' : state.status === 'needs_input' ? 'blocked' : 'active',
        inFlight: {
          tasks: state.status === 'running' ? 1 : 0,
          queued: 0,
          kinds: state.status === 'needs_input' ? [state.waitingFor ?? 'input'] : [],
        },
        intent: state.waitingMessage ?? state.waitingFor,
      };
    },
  };
}
