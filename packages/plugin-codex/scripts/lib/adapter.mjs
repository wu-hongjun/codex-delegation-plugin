// adapter.mjs — ReconcilerAdapter factory for the ClaudeBackgroundDriver.

import {
  readTranscriptEvents,
  readClaudeLogs,
  readSidecar,
} from '@cc-plugin-codex/driver-claude-code';

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

    // T15a: wire the sidecar reader so the reconciler can observe Claude's
    // per-job state.json (state/tempo/inFlight/output.result). Without this,
    // the reconciler always saw sidecar=null and could never transition
    // idle+queued jobs to awaiting_followup via sidecar-evidence inference.
    async readSidecar(ref) {
      try {
        return await readSidecar(ref.shortId);
      } catch {
        // Best-effort: sidecar absence/malformation is not a hard error.
        return null;
      }
    },
  };
}
