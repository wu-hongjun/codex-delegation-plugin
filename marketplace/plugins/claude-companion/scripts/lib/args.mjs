// args.mjs — hand-rolled CLI argument parser for claude-companion.mjs.
//
// No external dependencies. Supports:
//   --flag value        long flag with value
//   --flag=value        long flag with inline value
//   --bool-flag         boolean flag (listed in BOOLEAN_FLAGS)
//   --add-dir <path>    repeatable flag (listed in REPEATABLE_FLAGS)
//   --                  end of flags; remaining args are positional
//   --help              boolean flag

/** @type {Set<string>} */
const BOOLEAN_FLAGS = new Set([
  'yes',
  'json',
  'all',
  'allow-edit',
  'help',
  'all-awaiting-followup',
]);

/** @type {Set<string>} */
const REPEATABLE_FLAGS = new Set(['add-dir']);

/**
 * Parse process.argv-style array into command, flags, and positionals.
 *
 * @param {string[]} argv  The argument list (typically process.argv.slice(2))
 * @returns {{ command: string; flags: Record<string, unknown>; positional: string[] }}
 */
export function parseArgs(argv) {
  /** @type {Record<string, unknown>} */
  const flags = {};
  /** @type {string[]} */
  const positional = [];
  /** @type {string | undefined} */
  let command;

  let i = 0;
  let endOfFlags = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (endOfFlags) {
      positional.push(arg);
      i++;
      continue;
    }

    if (arg === '--') {
      endOfFlags = true;
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const withoutDashes = arg.slice(2);

      // Handle --flag=value inline form.
      const eqIdx = withoutDashes.indexOf('=');
      if (eqIdx !== -1) {
        const key = withoutDashes.slice(0, eqIdx);
        const value = withoutDashes.slice(eqIdx + 1);
        if (REPEATABLE_FLAGS.has(key)) {
          const existing = flags[key];
          if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            flags[key] = [value];
          }
        } else {
          flags[key] = value;
        }
        i++;
        continue;
      }

      const key = withoutDashes;

      // Boolean flags do not consume the next token.
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        i++;
        continue;
      }

      // Repeatable flags consume the next token.
      if (REPEATABLE_FLAGS.has(key)) {
        i++;
        const value = i < argv.length ? argv[i] : '';
        const existing = flags[key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          flags[key] = [value];
        }
        i++;
        continue;
      }

      // Generic --flag value: consume next token as value.
      i++;
      const value = i < argv.length ? argv[i] : '';
      flags[key] = value;
      i++;
      continue;
    }

    // Not a flag: first non-flag is the command, rest are positionals.
    if (command === undefined) {
      command = arg;
    } else {
      positional.push(arg);
    }
    i++;
  }

  return {
    command: command ?? '',
    flags,
    positional,
  };
}

/**
 * Resolve a job ID from a prefix against a list of known IDs.
 *
 * @param {string[]} allJobIds
 * @param {string} prefix
 * @returns {{ match: string } | { error: 'not-found' | 'ambiguous'; candidates: string[] }}
 */
export function resolveJobIdPrefix(allJobIds, prefix) {
  // Exact match wins immediately.
  if (allJobIds.includes(prefix)) {
    return { match: prefix };
  }

  const matches = allJobIds.filter((id) => id.startsWith(prefix));

  if (matches.length === 0) {
    return { error: 'not-found', candidates: [] };
  }
  if (matches.length === 1) {
    return { match: matches[0] };
  }
  return { error: 'ambiguous', candidates: matches };
}
