// Doctor probes for the cc-plugin-codex companion.
//
// Each probe is a `Promise<DoctorProbeResult>` and is independently testable. `runDoctor()`
// runs every probe sequentially, aggregates a single `DoctorReport`, and (by default)
// snapshots the JSON report to `getDoctorPath()` so `$claude-setup` and future skills can
// surface the latest state without re-running probes.
//
// Probes never start a real Claude background session, never invoke the synchronous
// print-mode transport, and never use a shell. Spawned commands run via
// `node:child_process.spawn` with `shell: false` and an explicit timeout (default 5s).

import { spawn } from 'node:child_process';
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ensureCompanionDirs, getCompanionHome, getDoctorPath } from './paths.js';

// ---------- public types ----------

export type DoctorProbeStatus = 'ok' | 'warn' | 'fail';

// Which user-facing capability a probe gates. A probe may gate both (e.g. claude-agents-json
// is needed for $claude-delegate AND $claude-followup). A probe that gates neither is
// purely informational (e.g. claude-daemon, codex-plugin-trust).
export type DoctorCapability = 'delegate' | 'followup';

export interface DoctorProbeResult {
  name: string;
  status: DoctorProbeStatus;
  detail: string;
  evidence?: unknown;
  capabilities?: DoctorCapability[];
}

export interface DoctorReport {
  status: DoctorProbeStatus;
  delegateCapability: DoctorProbeStatus;
  followupCapability: DoctorProbeStatus;
  generatedAt: string;
  probes: DoctorProbeResult[];
}

// Extra probe injection point. A consumer layer (driver or plugin) can hand the runtime
// additional probes via `runDoctor({ extraProbes: [...] })`. Preserves the runtime invariant
// that `packages/runtime/` imports no concrete driver package and no PTY library — those
// concerns live in the driver layer.
export interface DoctorExtraProbe {
  name: string;
  capabilities: DoctorCapability[];
  run: (opts: DoctorOptions) => Promise<DoctorProbeResult>;
}

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  writeSnapshot?: boolean;
  timeoutMs?: number;
  extraProbes?: DoctorExtraProbe[];
}

// ---------- internal helpers ----------

const DEFAULT_TIMEOUT_MS = 5000;

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: NodeJS.ErrnoException;
}

interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

function runCommand(cmd: string, args: string[], opts: RunCommandOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        shell: false,
      });
    } catch (err) {
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        spawnError: err as NodeJS.ErrnoException,
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => {
      spawnError = err as NodeJS.ErrnoException;
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code, stdout, stderr, timedOut, spawnError });
    });
  });
}

function getEnv(opts: DoctorOptions): NodeJS.ProcessEnv {
  return opts.env ?? process.env;
}

function runOpts(opts: DoctorOptions): RunCommandOptions {
  return { cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs };
}

function preview(text: string, max = 240): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed;
}

function spawnFailureDetail(cmd: string, r: RunResult): string {
  if (r.timedOut) return `${cmd} timed out`;
  if (r.spawnError) {
    return `cannot run ${cmd}: ${r.spawnError.code ?? r.spawnError.message}`;
  }
  return `${cmd} exited ${r.exitCode}: ${preview(r.stderr || r.stdout)}`;
}

// ---------- probes ----------

export async function probeNodeVersion(_opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const versionStr = process.versions.node;
  const majorRaw = versionStr.split('.')[0];
  const major = Number.parseInt(majorRaw ?? '', 10);
  if (Number.isNaN(major)) {
    return {
      name: 'node-version',
      status: 'fail',
      detail: `Unparseable Node version: ${versionStr}`,
      evidence: versionStr,
    };
  }
  if (major < 20) {
    return {
      name: 'node-version',
      status: 'fail',
      detail: `Node ${versionStr} is below the supported minimum (20).`,
      evidence: versionStr,
    };
  }
  return {
    name: 'node-version',
    status: 'ok',
    detail: `Node ${versionStr}`,
    evidence: versionStr,
  };
}

export async function probeCodexVersion(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('codex', ['--version'], runOpts(opts));
  if (r.spawnError || r.timedOut || r.exitCode !== 0) {
    return {
      name: 'codex-version',
      status: 'fail',
      detail: spawnFailureDetail('codex --version', r),
      evidence: { exitCode: r.exitCode, stderr: preview(r.stderr) },
    };
  }
  const out = preview(r.stdout);
  return {
    name: 'codex-version',
    status: 'ok',
    detail: out || 'codex --version succeeded',
    evidence: out,
  };
}

export async function probeClaudeBinary(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['--version'], runOpts(opts));
  if (r.spawnError) {
    return {
      name: 'claude-binary',
      status: 'fail',
      detail: `Cannot run \`claude\`: ${r.spawnError.code ?? r.spawnError.message}`,
      evidence: r.spawnError.code,
    };
  }
  if (r.timedOut) {
    return { name: 'claude-binary', status: 'fail', detail: 'claude --version timed out' };
  }
  if (r.exitCode !== 0) {
    return {
      name: 'claude-binary',
      status: 'fail',
      detail: `claude --version exited ${r.exitCode}`,
      evidence: preview(r.stderr),
    };
  }
  return { name: 'claude-binary', status: 'ok', detail: 'claude binary is executable' };
}

export async function probeClaudeVersion(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['--version'], runOpts(opts));
  if (r.spawnError || r.timedOut || r.exitCode !== 0) {
    return {
      name: 'claude-version',
      status: 'fail',
      detail: spawnFailureDetail('claude --version', r),
      evidence: { exitCode: r.exitCode },
    };
  }
  const out = r.stdout.trim();
  if (out.length === 0) {
    return {
      name: 'claude-version',
      status: 'fail',
      detail: 'claude --version produced no output',
    };
  }
  return {
    name: 'claude-version',
    status: 'ok',
    detail: out,
    evidence: out,
  };
}

export async function probeClaudeAuth(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['auth', 'status'], runOpts(opts));
  if (r.spawnError || r.timedOut) {
    return {
      name: 'claude-auth',
      status: 'fail',
      detail: spawnFailureDetail('claude auth status', r),
    };
  }
  if (r.exitCode !== 0) {
    return {
      name: 'claude-auth',
      status: 'fail',
      detail: `Not authenticated (exit ${r.exitCode}).`,
      evidence: preview(r.stdout || r.stderr),
    };
  }
  return {
    name: 'claude-auth',
    status: 'ok',
    detail: preview(r.stdout) || 'authenticated',
  };
}

export async function probeClaudeBgFlag(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['--help'], runOpts(opts));
  if (r.spawnError) {
    return {
      name: 'claude-bg-flag',
      status: 'fail',
      detail: spawnFailureDetail('claude --help', r),
    };
  }
  if (r.timedOut || r.exitCode !== 0) {
    return {
      name: 'claude-bg-flag',
      status: 'fail',
      detail: spawnFailureDetail('claude --help', r),
    };
  }
  if (!r.stdout.includes('--bg')) {
    return {
      name: 'claude-bg-flag',
      status: 'warn',
      detail:
        '--bg not advertised in --help; Claude docs say help may omit flags. Background support will be verified when starting a session.',
      evidence: preview(r.stdout),
    };
  }
  return {
    name: 'claude-bg-flag',
    status: 'ok',
    detail: 'claude --help advertises --bg',
  };
}

export async function probeClaudeAgentsJson(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['agents', '--json'], runOpts(opts));
  if (r.spawnError || r.timedOut || r.exitCode !== 0) {
    return {
      name: 'claude-agents-json',
      status: 'fail',
      detail: spawnFailureDetail('claude agents --json', r),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    return {
      name: 'claude-agents-json',
      status: 'fail',
      detail: 'claude agents --json returned malformed JSON',
      evidence: {
        error: err instanceof Error ? err.message : String(err),
        preview: preview(r.stdout),
      },
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      name: 'claude-agents-json',
      status: 'fail',
      detail: 'claude agents --json did not return an array',
      evidence: { type: typeof parsed },
    };
  }
  return {
    name: 'claude-agents-json',
    status: 'ok',
    detail: `claude agents --json returned ${parsed.length} session(s)`,
    evidence: { sessionCount: parsed.length },
  };
}

export async function probeClaudeLogs(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['logs', '--help'], runOpts(opts));
  if (r.spawnError || r.timedOut || r.exitCode !== 0) {
    return {
      name: 'claude-logs',
      status: 'fail',
      detail: spawnFailureDetail('claude logs --help', r),
    };
  }
  return { name: 'claude-logs', status: 'ok', detail: 'claude logs --help is available' };
}

export async function probeClaudeDaemon(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['daemon', 'status'], runOpts(opts));
  if (r.spawnError) {
    // Binary missing is caught by probeClaudeBinary; a spawn error here means claude is gone.
    return {
      name: 'claude-daemon',
      status: 'warn',
      detail: 'daemon status is diagnostic only; not required for plan 0001 runtime path.',
    };
  }
  if (r.timedOut || r.exitCode !== 0) {
    return {
      name: 'claude-daemon',
      status: 'warn',
      detail: 'daemon status is diagnostic only; not required for plan 0001 runtime path.',
      evidence: preview(r.stdout || r.stderr),
    };
  }
  return { name: 'claude-daemon', status: 'ok', detail: preview(r.stdout) || 'daemon running' };
}

export async function probeTranscriptPath(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const env = getEnv(opts);
  const mockHome = env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME;
  const root = mockHome ? join(mockHome, 'projects') : join(homedir(), '.claude', 'projects');
  try {
    if (existsSync(root) && statSync(root).isDirectory()) {
      return { name: 'transcript-path', status: 'ok', detail: root };
    }
    return {
      name: 'transcript-path',
      status: 'warn',
      detail: `Transcript directory not found at ${root}. Logs fallback will be used.`,
      evidence: root,
    };
  } catch (err) {
    return {
      name: 'transcript-path',
      status: 'warn',
      detail: `Could not stat ${root}: ${err instanceof Error ? err.message : String(err)}`,
      evidence: root,
    };
  }
}

export async function probeCodexPluginTrust(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const env = getEnv(opts);
  // Allow tests to point at a sandbox config path. Real path is ~/.codex/config.toml.
  const configPath =
    env.CC_PLUGIN_CODEX_MOCK_CODEX_TOML ?? join(homedir(), '.codex', 'config.toml');
  if (!existsSync(configPath)) {
    return {
      name: 'codex-plugin-trust',
      status: 'warn',
      detail: `Codex config not found at ${configPath}. Plugin trust status unknown.`,
      evidence: configPath,
    };
  }
  let body: string;
  try {
    body = await readFile(configPath, 'utf8');
  } catch (err) {
    return {
      name: 'codex-plugin-trust',
      status: 'warn',
      detail: `Could not read ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  // Informational text search only; no TOML parser dependency in v1.
  const mentionsPlugin = /claude-companion/.test(body);
  const mentionsTrust = /trust|enabled/i.test(body);
  if (mentionsPlugin && mentionsTrust) {
    return {
      name: 'codex-plugin-trust',
      status: 'ok',
      detail: `Plugin reference found in ${configPath}.`,
    };
  }
  return {
    name: 'codex-plugin-trust',
    status: 'warn',
    detail: `Plugin trust state could not be confirmed from ${configPath}.`,
    evidence: { mentionsPlugin, mentionsTrust },
  };
}

export async function probeCompanionDirWritable(
  _opts: DoctorOptions = {},
): Promise<DoctorProbeResult> {
  try {
    await ensureCompanionDirs();
  } catch (err) {
    return {
      name: 'companion-dir-writable',
      status: 'fail',
      detail: `Cannot create companion dirs under ${getCompanionHome()}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const probeName = `.doctor-probe-${process.pid}-${Date.now()}.tmp`;
  const probePath = join(getCompanionHome(), probeName);
  try {
    await writeFile(probePath, 'probe', 'utf8');
    const back = await readFile(probePath, 'utf8');
    if (back !== 'probe') {
      throw new Error(`probe file contents mismatch: ${back}`);
    }
  } catch (err) {
    return {
      name: 'companion-dir-writable',
      status: 'fail',
      detail: `Cannot round-trip a probe file in ${getCompanionHome()}: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    try {
      rmSync(probePath, { force: true });
    } catch {
      // ignore cleanup failure
    }
  }
  return {
    name: 'companion-dir-writable',
    status: 'ok',
    detail: getCompanionHome(),
  };
}

// Plan 0002 probe: `claude attach --help` is parseable.
// Used by $claude-followup to validate the PTY-attach input transport at setup time.
export async function probeClaudeAttachHelp(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const r = await runCommand('claude', ['attach', '--help'], runOpts(opts));
  if (r.spawnError || r.timedOut || r.exitCode !== 0) {
    return {
      name: 'claude-attach-help',
      status: 'fail',
      detail: spawnFailureDetail('claude attach --help', r),
      evidence: { exitCode: r.exitCode, stderr: preview(r.stderr) },
    };
  }
  return {
    name: 'claude-attach-help',
    status: 'ok',
    detail: preview(r.stdout) || 'claude attach --help is available',
    evidence: preview(r.stdout),
  };
}

// Plan 0002 probe: `claude --bg` is available on this binary (supports no-prompt invocation).
// Used by $claude-followup to validate that a companion session can be created without
// a startup prompt — the model Plan 0002 depends on for clean follow-up injection.
//
// Plan 0012 T5 fix: the previous strategy ran `claude --bg --help` which actually CREATES
// an idle background session (--help is silently ignored when combined with --bg). Under
// no-TTY contexts (piped stdio, shell:false) — exactly the shape Codex uses for dispatcher
// subprocesses — `claude --bg` hangs and SIGTERMs at the 5s DEFAULT_TIMEOUT_MS. Instead
// we use a version-floor check: --bg has been available since 2.1.149, so we run
// `claude --version` (fast, TTY-independent) and compare against that floor.
const FLOOR_BG_NO_PROMPT = '2.1.149';
export async function probeClaudeBgNoPrompt(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  // Strategy: version-floor check via `claude --version` (mirrors bgExecProbe in companion).
  // Never spawns `claude --bg` — that creates idle sessions and hangs without a TTY.
  const r = await runCommand('claude', ['--version'], runOpts(opts));
  if (r.spawnError || r.timedOut) {
    return {
      name: 'claude-bg-no-prompt',
      status: 'fail',
      detail: spawnFailureDetail('claude --version', r),
    };
  }
  const versionStr = r.stdout.trim();
  // Match M.m.p anywhere in the version string; real claude outputs "M.m.p (Claude Code)",
  // mock outputs "Claude Code M.m.p[-tag]". Accept optional "-" pre-release suffix.
  const match = /(\d+)\.(\d+)\.(\d+)(?:[-\s]|$)/.exec(versionStr);
  if (!match) {
    return {
      name: 'claude-bg-no-prompt',
      status: 'warn',
      detail: `unparseable claude version: ${versionStr || '(empty)'}`,
    };
  }
  const [, maj, min, pat] = match;
  const version = { major: Number(maj), minor: Number(min), patch: Number(pat) };
  const floor = { major: 2, minor: 1, patch: 149 };
  const meetsFloor =
    version.major > floor.major ||
    (version.major === floor.major && version.minor > floor.minor) ||
    (version.major === floor.major &&
      version.minor === floor.minor &&
      version.patch >= floor.patch);
  if (meetsFloor) {
    return {
      name: 'claude-bg-no-prompt',
      status: 'ok',
      detail: `claude --bg supported per version floor (${versionStr} >= ${FLOOR_BG_NO_PROMPT})`,
    };
  }
  return {
    name: 'claude-bg-no-prompt',
    status: 'fail',
    detail: `claude --bg requires >= ${FLOOR_BG_NO_PROMPT} (current ${versionStr})`,
  };
}

// Plan 0002 probe: `~/.claude/jobs/` exists and is a readable directory.
// Best-effort per OQ-B: missing → warn, never fail. Sidecar reading is enrichment; the
// follow-up path falls back to `agents --json` + `logs` when the sidecar is absent.
export async function probeSidecarJobsDir(opts: DoctorOptions = {}): Promise<DoctorProbeResult> {
  const env = getEnv(opts);
  const mockHome = env.CC_PLUGIN_CODEX_MOCK_CLAUDE_HOME;
  const root = mockHome ? join(mockHome, 'jobs') : join(homedir(), '.claude', 'jobs');
  try {
    if (existsSync(root) && statSync(root).isDirectory()) {
      return {
        name: 'sidecar-jobs-dir',
        status: 'ok',
        detail: root,
        evidence: root,
      };
    }
    return {
      name: 'sidecar-jobs-dir',
      status: 'warn',
      detail: `Sidecar jobs directory not found at ${root}. Follow-up will use claude logs / agents --json fallback.`,
      evidence: root,
    };
  } catch (err) {
    return {
      name: 'sidecar-jobs-dir',
      status: 'warn',
      detail: `Could not stat ${root}: ${err instanceof Error ? err.message : String(err)}`,
      evidence: root,
    };
  }
}

// Built-in probe registry. Each entry carries capability metadata so runDoctor can compute
// per-capability aggregates. A probe's `capabilities` lists which user-facing capabilities
// the probe gates; empty means informational only.
//
// Probe order is meaningful: cheaper / structural probes first, then external commands.
interface BuiltinProbeEntry {
  run: (opts: DoctorOptions) => Promise<DoctorProbeResult>;
  capabilities: DoctorCapability[];
}

const PROBES: BuiltinProbeEntry[] = [
  { run: probeNodeVersion, capabilities: ['delegate', 'followup'] },
  { run: probeCompanionDirWritable, capabilities: ['delegate', 'followup'] },
  { run: probeCodexVersion, capabilities: ['delegate', 'followup'] },
  { run: probeClaudeBinary, capabilities: ['delegate', 'followup'] },
  { run: probeClaudeVersion, capabilities: ['delegate', 'followup'] },
  { run: probeClaudeAuth, capabilities: ['delegate', 'followup'] },
  // claude-bg-flag is informational: real Claude 2.1.149's --help omits --bg. The probe
  // returns warn in that case, but background-session support is verified at session-start
  // time, not here. Does not gate either capability.
  { run: probeClaudeBgFlag, capabilities: [] },
  { run: probeClaudeAgentsJson, capabilities: ['delegate', 'followup'] },
  { run: probeClaudeLogs, capabilities: ['delegate', 'followup'] },
  // claude-daemon: informational only (warn-only).
  { run: probeClaudeDaemon, capabilities: [] },
  { run: probeTranscriptPath, capabilities: ['delegate', 'followup'] },
  // codex-plugin-trust: informational only (warn-only).
  { run: probeCodexPluginTrust, capabilities: [] },
  // Plan 0002 follow-up-only probes:
  { run: probeClaudeAttachHelp, capabilities: ['followup'] },
  { run: probeClaudeBgNoPrompt, capabilities: ['followup'] },
  { run: probeSidecarJobsDir, capabilities: ['followup'] },
];

function aggregateStatus(probes: DoctorProbeResult[]): DoctorProbeStatus {
  if (probes.some((p) => p.status === 'fail')) return 'fail';
  if (probes.some((p) => p.status === 'warn')) return 'warn';
  return 'ok';
}

function aggregateCapability(
  probes: DoctorProbeResult[],
  capability: DoctorCapability,
): DoctorProbeStatus {
  const relevant = probes.filter((p) => p.capabilities?.includes(capability));
  if (relevant.length === 0) return 'ok';
  return aggregateStatus(relevant);
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const probes: DoctorProbeResult[] = [];

  for (const entry of PROBES) {
    const result = await entry.run(options);
    probes.push({ ...result, capabilities: entry.capabilities });
  }

  for (const extra of options.extraProbes ?? []) {
    const result = await extra.run(options);
    probes.push({
      ...result,
      name: result.name || extra.name,
      capabilities: extra.capabilities,
    });
  }

  const report: DoctorReport = {
    status: aggregateStatus(probes),
    delegateCapability: aggregateCapability(probes, 'delegate'),
    followupCapability: aggregateCapability(probes, 'followup'),
    generatedAt: new Date().toISOString(),
    probes,
  };
  if (options.writeSnapshot !== false) {
    await ensureCompanionDirs();
    const tmp = `${getDoctorPath()}.${process.pid}.tmp`;
    // Intentionally simple: doctor.json is overwritten each run.
    writeFileSync(tmp, JSON.stringify(report, null, 2) + '\n', 'utf8');
    const { rename } = await import('node:fs/promises');
    await rename(tmp, getDoctorPath());
  }
  return report;
}
