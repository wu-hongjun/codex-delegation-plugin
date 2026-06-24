// args.mjs — hand-rolled CLI argument parser for cc.mjs.
//
// No external dependencies. Supports:
//   --flag value        long flag with value
//   --flag=value        long flag with inline value
//   --bool-flag         boolean flag (listed in BOOLEAN_FLAGS)
//   --add-dir <path>    repeatable flag (listed in REPEATABLE_FLAGS)
//   known flags only    unknown --flags fail closed instead of consuming prompts
//   --                  end of flags; remaining args are positional
//   --help              boolean flag

/** @type {Set<string>} */
const BOOLEAN_FLAGS = new Set([
  'yes',
  'json',
  'all',
  'allow-edit',
  'all-blocked',
  'compact',
  'partial',
  'dry-run',
  'public',
  'local',
  'claude-access',
  'real',
  'help',
  'all-awaiting-followup',
  'all-needs-input',
  'all-idle',
  'bypass-permissions',
  'dangerously-skip-permissions',
  'allow-dangerously-skip-permissions',
  'blocking',
  'strict-mcp-config',
  'bare',
  'safe-mode',
  'ide',
  'chrome',
  'no-chrome',
  'disable-slash-commands',
  'exclude-dynamic-system-prompt-sections',
  'verbose',
]);

/** @type {Set<string>} */
const REPEATABLE_FLAGS = new Set(['add-dir']);

/** @type {Set<string>} */
const VALUE_FLAGS = new Set([
  'job',
  'limit',
  'stored-status',
  'timeout',
  'interval',
  'name',
  'model',
  'effort',
  'permission-mode',
  'mcp-config',
  'agent',
  'agents',
  'allowedTools',
  'allowed-tools',
  'disallowedTools',
  'disallowed-tools',
  'tools',
  'settings',
  'setting-sources',
  'append-system-prompt',
  'system-prompt',
  'plugin-dir',
  'plugin-url',
  'fail-on',
]);

function ensureKnownFlag(key) {
  if (BOOLEAN_FLAGS.has(key) || REPEATABLE_FLAGS.has(key) || VALUE_FLAGS.has(key)) return;
  throw new Error(`Unknown flag: --${key}`);
}

function ensureFlagValue(argv, i, key) {
  if (i >= argv.length || argv[i] === '--' || argv[i]?.startsWith('--')) {
    throw new Error(`--${key} requires a value`);
  }
  return argv[i];
}

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
        ensureKnownFlag(key);
        if (BOOLEAN_FLAGS.has(key)) {
          throw new Error(`--${key} does not take a value`);
        }
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
      ensureKnownFlag(key);

      // Boolean flags do not consume the next token.
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        i++;
        continue;
      }

      // Repeatable flags consume the next token.
      if (REPEATABLE_FLAGS.has(key)) {
        i++;
        const value = ensureFlagValue(argv, i, key);
        const existing = flags[key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          flags[key] = [value];
        }
        i++;
        continue;
      }

      // Known value flags consume the next token as value.
      i++;
      const value = ensureFlagValue(argv, i, key);
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
