import {
  finalQwenAssistantMessage,
  readQwenOutput,
  readQwenState,
  readQwenTranscriptEvents,
} from '@codex-delegation/driver-qwen-code';

export function makeQwenAdapter(driver) {
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
      return readQwenTranscriptEvents({ transcriptPath: ref.transcriptPath });
    },

    async readLogs(ref) {
      const [stdout, stderr] = await Promise.all([
        readQwenOutput(ref.transcriptPath),
        readQwenOutput(ref.errorPath),
      ]);
      return { text: stdout || stderr, stdout, stderr };
    },

    async readSidecar(ref) {
      if (!ref.statePath) return null;
      const state = await readQwenState(ref.statePath);
      if (!state) return null;
      const transcript = await readQwenTranscriptEvents({ transcriptPath: state.transcriptPath });
      const result = finalQwenAssistantMessage(transcript.events);
      return {
        state:
          state.status === 'idle'
            ? 'done'
            : state.status === 'failed' || state.status === 'stopped'
              ? state.status
              : state.status,
        tempo: state.status === 'idle' ? 'idle' : 'active',
        inFlight: { tasks: state.status === 'running' ? 1 : 0, queued: 0, kinds: [] },
        output: state.status === 'idle' && result ? { result } : undefined,
      };
    },
  };
}
