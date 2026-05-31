// adapter.mjs — ReconcilerAdapter factory for the ClaudeBackgroundDriver.

import { readTranscriptEvents, readClaudeLogs } from '@cc-plugin-codex/driver-claude-code';

/**
 * @param {import('@cc-plugin-codex/driver-claude-code').ClaudeBackgroundDriver} driver
 * @param {{ env?: NodeJS.ProcessEnv; timeoutMs?: number; startedAt?: string }} [defaults]
 * @returns {import('@cc-plugin-codex/runtime').ReconcilerAdapter}
 */
export function makeClaudeAdapter(driver, defaults = {}) {
  return {
    async status(ref) {
      return driver.status({
        driverName: ref.driverName,
        shortId: ref.shortId,
        sessionId: ref.sessionId,
        sessionName: ref.sessionName,
        cwd: ref.cwd,
        startedAt: defaults.startedAt ?? new Date(0).toISOString(),
      });
    },

    async readTranscriptEvents(ref) {
      return readTranscriptEvents({
        cwd: ref.cwd,
        env: defaults.env,
        sessionId: ref.sessionId,
        transcriptPath: ref.transcriptPath,
      });
    },

    async readLogs(ref) {
      return readClaudeLogs(ref.shortId, {
        cwd: ref.cwd,
        env: defaults.env,
        timeoutMs: defaults.timeoutMs,
      });
    },
  };
}
