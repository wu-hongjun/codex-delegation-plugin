// claude-version.mjs — semver parsing helpers for the cc doctor probes.
//
// Pure ESM module. No external dependencies. Used by cc.mjs to parse
// `claude --version` output and decide whether a given feature floor is met.

/**
 * Parse the stdout of `claude --version` into a semver tuple.
 *
 * Accepts strings like "2.1.153 (Claude Code)" and extracts the
 * leading M.m.p fragment. Returns null for anything that does not
 * contain a parseable M.m.p prefix (e.g. dev builds with non-semver
 * patch tags, empty strings, or completely unrecognised formats).
 *
 * @param {string} stdout
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseClaudeVersion(stdout) {
  if (typeof stdout !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(stdout.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { major, minor, patch };
}

/**
 * Compare two semver tuples.
 *
 * @param {{ major: number, minor: number, patch: number }} a
 * @param {{ major: number, minor: number, patch: number }} b
 * @returns {-1 | 0 | 1}
 */
export function compare(a, b) {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return 0;
}

/**
 * Return true if `version` is at or above the given floor string (e.g. "2.1.154").
 * Returns false when version is null (unparseable build).
 *
 * @param {{ major: number, minor: number, patch: number } | null} version
 * @param {string} floor  — "M.m.p" string
 * @returns {boolean}
 */
export function meetsFloor(version, floor) {
  if (version === null) return false;
  const floorParsed = parseClaudeVersion(floor);
  if (floorParsed === null) return false;
  return compare(version, floorParsed) >= 0;
}
