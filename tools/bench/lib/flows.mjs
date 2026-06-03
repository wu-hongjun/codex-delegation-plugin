/**
 * Flow registry for Plan 0004 benchmark harness.
 * Runners are wired up in T4-T8; this file only contains metadata.
 *
 * @typedef {{ id: string, label: string, description: string, requiresBaselineFlag: boolean }} FlowEntry
 */

/** @type {FlowEntry[]} */
export const FLOWS = [
  {
    id: 'delegate',
    label: 'delegate',
    description: 'Single-turn $claude-delegate invocation',
    requiresBaselineFlag: false,
  },
  {
    id: 'delegate-followup',
    label: 'delegate + followup',
    description: 'Delegate invocation followed by a followup turn',
    requiresBaselineFlag: false,
  },
  {
    id: 'delegate-review',
    label: 'delegate + review',
    description: 'Delegate invocation followed by $claude-review in the same session',
    requiresBaselineFlag: false,
  },
  {
    id: 'delegate-adversarial',
    label: 'delegate + adversarial review',
    description: 'Delegate invocation followed by $claude-adversarial-review',
    requiresBaselineFlag: false,
  },
  {
    id: 'baseline-p',
    label: 'baseline claude -p',
    description: 'Opt-in baseline: plain claude -p invocation (no plugin)',
    requiresBaselineFlag: true,
  },
];

/**
 * Returns the subset of flows to run given parsed CLI options.
 *
 * @param {{ flowIds: string[] | null, includeBaselineP: boolean }} opts
 * @returns {FlowEntry[]}
 */
export function selectFlows({ flowIds, includeBaselineP }) {
  let pool = FLOWS.filter((f) => !f.requiresBaselineFlag || includeBaselineP);

  if (flowIds != null) {
    for (const id of flowIds) {
      if (!FLOWS.find((f) => f.id === id)) {
        throw new Error(
          `Unknown flow id: "${id}". Valid ids: ${FLOWS.map((f) => f.id).join(', ')}`,
        );
      }
    }
    pool = pool.filter((f) => flowIds.includes(f.id));
  }

  return pool;
}
