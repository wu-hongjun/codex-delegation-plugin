/**
 * Task registry for Plan 0004 benchmark harness.
 * Three-task corpus. Corpus content (fixture files) lives in T3.
 *
 * @typedef {{ id: string, prompt: string, expectedBehavior: string }} TaskEntry
 */

/** @type {TaskEntry[]} */
export const TASKS = [
  {
    id: 'summarize-todos',
    prompt: 'Inspect this repo and summarize TODOs. Do not edit files.',
    expectedBehavior: 'produces a list of TODO items found in the codebase',
  },
  {
    id: 'rename-variable',
    prompt: 'Rename the variable `oldName` to `newName` throughout `src/app.js`. Show the diff.',
    expectedBehavior: 'produces diff',
  },
  {
    id: 'answer-question',
    prompt: 'How many test files are in the `test/` directory? Answer with just the count.',
    expectedBehavior: 'answers with integer',
  },
];

/**
 * Returns the subset of tasks to run given parsed CLI options.
 *
 * @param {{ taskIds: string[] | null }} opts
 * @returns {TaskEntry[]}
 */
export function selectTasks({ taskIds }) {
  if (taskIds == null) {
    return TASKS;
  }

  for (const id of taskIds) {
    if (!TASKS.find((t) => t.id === id)) {
      throw new Error(`Unknown task id: "${id}". Valid ids: ${TASKS.map((t) => t.id).join(', ')}`);
    }
  }

  return TASKS.filter((t) => taskIds.includes(t.id));
}
