import { readAgyOutput } from '@cc-plugin-codex/driver-agy-cli';

/**
 * @param {import('@cc-plugin-codex/driver-agy-cli').AgyCliDriver} driver
 * @returns {import('@cc-plugin-codex/runtime').ReconcilerAdapter}
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
      const content = await readAgyOutput(ref.resultPath);
      return {
        transcriptPath: null,
        events:
          content.trim().length > 0
            ? [
                {
                  type: 'message.completed',
                  role: 'assistant',
                  content,
                  at: new Date().toISOString(),
                },
              ]
            : [],
        warnings: [],
      };
    },

    async readLogs(ref) {
      const text = await readAgyOutput(ref.errorPath);
      return { text, stderr: text };
    },
  };
}
