/**
 * Output directory helpers for Plan 0004 benchmark harness.
 * Creates the run output directory under artifacts/ or a caller-specified path.
 */

import { mkdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

/**
 * Compute the default output directory name for a benchmark run.
 *
 * @param {string} dateYYYYMMDD  e.g. '20260614'
 * @param {string} runId         e.g. 'abc123'
 * @returns {string}             e.g. 'bench-20260614-abc123'
 */
export function defaultOutputDirName(dateYYYYMMDD, runId) {
  return `bench-${dateYYYYMMDD}-${runId}`;
}

/**
 * Create the output directory and return its absolute path.
 *
 * Two usage modes:
 *   1. absolutePath set: creates that exact path (ignores repoRoot/date/runId).
 *   2. dateYYYYMMDD + runId set: creates `<repoRoot>/artifacts/<dirName>/`.
 *
 * The directory (and any required parent directories) is created with mkdirSync
 * using { recursive: true }, so existing directories are not an error.
 *
 * @param {object} opts
 * @param {string} opts.repoRoot          Absolute path to the repository root.
 * @param {string=} opts.absolutePath     If set, creates this path verbatim.
 * @param {string=} opts.dateYYYYMMDD     Required when absolutePath is not set.
 * @param {string=} opts.runId            Required when absolutePath is not set.
 * @returns {string}  Absolute path to the created directory.
 * @throws {Error}    If neither absolutePath nor (dateYYYYMMDD + runId) are provided.
 */
export function createOutputDir(opts) {
  const { repoRoot, absolutePath, dateYYYYMMDD, runId } = opts;

  let targetPath;

  if (absolutePath) {
    if (!isAbsolute(absolutePath)) {
      throw new Error(
        `absolutePath must be an absolute path; got: "${absolutePath}"`,
      );
    }
    targetPath = absolutePath;
  } else if (dateYYYYMMDD && runId) {
    const dirName = defaultOutputDirName(dateYYYYMMDD, runId);
    targetPath = join(repoRoot, 'artifacts', dirName);
  } else {
    throw new Error(
      'createOutputDir: must provide either opts.absolutePath or both opts.dateYYYYMMDD and opts.runId',
    );
  }

  mkdirSync(targetPath, { recursive: true });
  return targetPath;
}
