// claude --bg lifecycle for ClaudeBackgroundDriver.
//
// Owns: startSession() spawn + parse. Does NOT implement agents --json status,
// transcript reading, log reading, reconciler, or any other lifecycle method.
// Those land in later T-tasks per plan 0001.

import { basename } from 'node:path';
import { randomBytes } from 'node:crypto';

import { DriverError } from '@cc-plugin-codex/runtime';
import type { SessionHandle, StartSessionOpts } from '@cc-plugin-codex/runtime';

import { runCommand } from './process.js';
import { DRIVER_NAME } from './types.js';
import type { ClaudeBackgroundDriverOptions } from './types.js';

// ---------- short ID parser (exported for unit tests) ----------
//
// Tolerant multi-format parser. Accepts at least:
//   "backgrounded · 8f7f2405"          (real Claude 2.1.149)
//   "Started background session abc123"
//   "abc123"
//   "Session abc123 started"
//
// Algorithm:
//   1. Combine stdout + stderr, split on whitespace.
//   2. PRIMARY: scan for the keyword "backgrounded" or "session" (case-insensitive).
//      For each occurrence, scan forward for the next ID-shaped token, skipping
//      symbolic separator tokens (e.g. the middle-dot "·"). This naturally handles
//      "backgrounded · 8f7f2405" as well as "session abc123".
//   3. Fallback A: if stdout has exactly one non-empty line that is itself an ID shape,
//      use it (bare-ID output).
//   4. Fallback B: last token matching ID_FALLBACK_PATTERN (digit-required). This avoids
//      treating common English words as IDs.
//   5. If all fail, return undefined.
//
// Does NOT throw — caller decides whether to surface DriverError.

const ID_CONTEXTUAL_PATTERN = /^[a-zA-Z0-9_-]{4,}$/;
const ID_FALLBACK_PATTERN = /^(?=[a-zA-Z0-9_-]*\d)[a-zA-Z0-9_-]{4,}$/;

// Keywords whose next ID-shaped token is a session ID.
const KEYWORDS_PRIMARY = ['backgrounded', 'session'];

function nextIdToken(tokens: string[], from: number, exclude?: string): string | undefined {
  for (let j = from; j < tokens.length; j++) {
    const t = tokens[j]!;
    // A primary keyword ("session"/"backgrounded") is ID-shaped but is never itself the
    // id — skip it so that, after excluding an echoed name, the scan reaches the real id
    // following a later keyword (e.g. "session <name>" then "backgrounded · <hex>").
    if (KEYWORDS_PRIMARY.includes(t.toLowerCase())) continue;
    if (ID_CONTEXTUAL_PATTERN.test(t) && t !== exclude) return t;
  }
  return undefined;
}

// excludeName: when the session was started with an ID-shaped --name (e.g.
// "cc-v031-delegate-todos", all [a-z0-9-]), Claude Code echoes that name after the
// word "session"/"backgrounded", and Strategy 1 would otherwise capture the NAME as the
// shortId instead of the real session hex (Plan 0020 F2 / deep-test Finding 2b). When
// excludeName is supplied, a candidate that exactly equals it is held back as a LAST-
// RESORT fallback while scanning continues for a non-name candidate. This is strictly
// improving: if the name is the only candidate, we still return it (no regression to
// undefined); if a real hex id is also present, the hex wins.
export function parseShortId(
  stdout: string,
  stderr: string,
  excludeName?: string,
): string | undefined {
  const combined = `${stdout}\n${stderr}`;
  const tokens = combined.split(/\s+/).filter((t) => t.length > 0);
  const excluded = excludeName && excludeName.trim().length > 0 ? excludeName.trim() : undefined;
  const isExcluded = (t: string): boolean => excluded !== undefined && t === excluded;

  // Last-resort fallback: the first excluded (name) candidate we would otherwise have
  // returned. Used only if no non-name candidate is found anywhere.
  let nameFallback: string | undefined;

  // Strategy 1: token after a primary keyword ("backgrounded" or "session").
  // Scanning forward from index i+1 skips symbolic separators like "·".
  for (let i = 0; i < tokens.length - 1; i++) {
    if (KEYWORDS_PRIMARY.includes(tokens[i]!.toLowerCase())) {
      const candidate = nextIdToken(tokens, i + 1, excluded);
      if (candidate) return candidate;
      // No non-excluded candidate after this keyword; remember the name as a fallback.
      if (nameFallback === undefined) {
        const named = nextIdToken(tokens, i + 1);
        if (named && isExcluded(named)) nameFallback = named;
      }
    }
  }

  // Strategy 2 (fallback A): stdout is a single non-empty line that is itself ID-shaped.
  const stdoutLines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (stdoutLines.length === 1 && ID_CONTEXTUAL_PATTERN.test(stdoutLines[0]!)) {
    if (!isExcluded(stdoutLines[0]!)) return stdoutLines[0]!;
    if (nameFallback === undefined) nameFallback = stdoutLines[0]!;
  }

  // Strategy 3 (fallback B): last token matching the digit-requiring fallback pattern.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (ID_FALLBACK_PATTERN.test(t)) {
      if (!isExcluded(t)) return t;
      if (nameFallback === undefined) nameFallback = t;
    }
  }

  // Nothing but the name matched anywhere — return it rather than failing.
  return nameFallback;
}

// ---------- arg builder ----------
//
// Builds the argv array for `claude --bg`. Uses an array, never a shell string.
// OQ1: --permission-mode is only appended when opts.permissionMode is supplied.
//      No bypass flags are ever added.
// OQ2: opts.allowEdit is kept on StartSessionOpts but NOT translated into a CLI flag here.
//      // future: v1 policy/UX flag — when OFF the caller should frame the prompt as
//      // read-only/review-oriented; this is NOT a sandbox, enforcement is Claude Code's
//      // own permission system. See plan 0001 § 3.8 OQ2.

function buildArgv(sessionName: string, opts: StartSessionOpts): string[] {
  const argv: string[] = ['--bg', '--name', sessionName];

  if (opts.model) {
    argv.push('--model', opts.model);
  }
  if (opts.effort) {
    argv.push('--effort', opts.effort);
  }
  if (opts.permissionMode) {
    // OQ1: only pass --permission-mode when the caller explicitly set it.
    argv.push('--permission-mode', opts.permissionMode);
  }
  for (const dir of opts.addDirs ?? []) {
    argv.push('--add-dir', dir);
  }
  if (opts.mcpConfig) {
    argv.push('--mcp-config', opts.mcpConfig);
  }

  // Prompt is the final positional argument.
  argv.push(opts.prompt);

  return argv;
}

// ---------- common DriverError context ----------

function errCtx(extra: { exitCode?: number; stdout?: string; stderr?: string; cause?: unknown }) {
  return {
    driverName: DRIVER_NAME,
    operation: 'startSession' as const,
    ...extra,
  };
}

// ---------- startSession ----------

export async function startSession(
  opts: StartSessionOpts,
  defaults: ClaudeBackgroundDriverOptions,
): Promise<SessionHandle> {
  // 1. Validate cwd.
  if (!opts.cwd || opts.cwd.trim().length === 0) {
    throw new DriverError('cwd is required', errCtx({}));
  }

  // 2. Validate prompt.
  if (!opts.prompt || opts.prompt.trim().length === 0) {
    throw new DriverError('prompt is required', errCtx({}));
  }

  // 3. Derive sessionName.
  //
  // Claude Code keys background sessions by --name: two sessions started with the
  // same name MERGE into one (the second attaches to the first). The auto-generated
  // default must therefore be unique even under concurrency — `Date.now()` alone has
  // millisecond granularity, so two delegates launched in the same millisecond in the
  // same cwd would collide and cross-contaminate (Plan 0020 F1 / deep-test Finding 1).
  // Append crypto entropy after the `codex:<basename>:` prefix. The colons keep the
  // token non-ID-shaped, so parseShortId never mistakes it for a session id.
  //
  // An explicit `opts.name` is passed through verbatim: an explicit name is an
  // idempotent session key by design — reusing it deliberately resumes the same
  // session (deep-test Finding 2a, documented behavior).
  const sessionName =
    opts.name && opts.name.trim().length > 0
      ? opts.name.trim()
      : `codex:${basename(opts.cwd)}:${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;

  // 4 & 5. Build argv (array, no shell string).
  const argv = buildArgv(sessionName, opts);

  // 6–9. Spawn, capture stdout/stderr, enforce timeout.
  const timeoutMs = defaults.timeoutMs ?? 10000;
  const env = defaults.env ? { ...process.env, ...defaults.env } : process.env;

  const result = await runCommand('claude', argv, {
    cwd: opts.cwd,
    env,
    timeoutMs,
  });

  // Map spawn error (ENOENT, EACCES, etc.) to DriverError.
  if (result.spawnError) {
    throw new DriverError(
      `cannot run claude: ${result.spawnError.code ?? result.spawnError.message}`,
      errCtx({ cause: result.spawnError }),
    );
  }

  // Map timeout to DriverError.
  if (result.timedOut) {
    throw new DriverError(
      `claude --bg timed out after ${timeoutMs}ms`,
      errCtx({ stdout: result.stdout, stderr: result.stderr }),
    );
  }

  // Map non-zero exit to DriverError.
  if (result.exitCode !== 0) {
    throw new DriverError(
      `claude --bg exited ${result.exitCode}`,
      errCtx({
        exitCode: result.exitCode ?? undefined,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    );
  }

  // 10. Parse shortId from stdout (tolerant). Pass sessionName so an ID-shaped name
  // echoed by Claude is not mistaken for the session id (Plan 0020 F2).
  const shortId = parseShortId(result.stdout, result.stderr, sessionName);
  if (!shortId) {
    throw new DriverError(
      'could not parse short ID from claude --bg output',
      errCtx({ stdout: result.stdout, stderr: result.stderr }),
    );
  }

  // 11. Return SessionHandle. sessionId (long form) comes from agents --json in T7.
  return {
    driverName: DRIVER_NAME,
    shortId,
    sessionName,
    cwd: opts.cwd,
    startedAt: new Date().toISOString(),
  };
}
