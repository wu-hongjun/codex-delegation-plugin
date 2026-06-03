/**
 * RunResult shape, factory, and helpers for Plan 0004 benchmark harness.
 * All flow runners (T4-T8) produce and return this shape.
 */

/**
 * @typedef {Object} TokenUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheCreationInputTokens
 * @property {number} cacheReadInputTokens
 * @property {number} cacheEphemeral1hInputTokens
 * @property {number} cacheEphemeral5mInputTokens
 * @property {number} messageCount               Count of assistant messages aggregated
 * @property {string | null} serviceTier         If consistent across messages; null if mixed
 */

/**
 * @typedef {Object} RunResult
 * @property {string} flow                      Flow id (e.g., 'delegate')
 * @property {string} task                      Task id (e.g., 'summarize-todos')
 * @property {number} runIndex                  0-based run index within the cell
 * @property {number} wallClockMs               Total wall-clock latency for the full flow
 * @property {number[]} turnsWallClockMs        Per-turn latency. Single-turn flows: [wallClockMs]. Multi-turn: e.g., [delegateMs, followupMs].
 * @property {number | null} tempoTransitions   Count of sidecar tempo idle<->active transitions if observed; null if not available.
 * @property {TokenUsage | null} tokenCounts    Aggregated transcript usage; null if transcript parse failed.
 * @property {string | null} reviewVerdict      'pass' | 'fail' | 'pass_with_findings' | null (review flows only)
 * @property {number | null} findingsCount      Count of findings in the review verdict; null if not a review flow
 * @property {string | null} error              null on success; 'timeout' / 'ttl_expired' / 'review_timeout' / 'spawn_error' / free-form string on failure
 * @property {string[]} caveats                 Per-run caveats (e.g., 'transcript not found at expected path')
 */

/**
 * Create a fresh empty RunResult with all fields at their zero/null defaults.
 *
 * @param {{ flow: string, task: string, runIndex: number }} opts
 * @returns {RunResult}
 */
export function createEmptyRunResult({ flow, task, runIndex }) {
  return {
    flow,
    task,
    runIndex,
    wallClockMs: 0,
    turnsWallClockMs: [],
    tempoTransitions: null,
    tokenCounts: null,
    reviewVerdict: null,
    findingsCount: null,
    error: null,
    caveats: [],
  };
}

/**
 * Mark a RunResult as errored. Mutates result in-place and returns it for chaining.
 *
 * @param {RunResult} result
 * @param {string} error
 * @returns {RunResult}
 */
export function markError(result, error) {
  result.error = error;
  return result;
}
