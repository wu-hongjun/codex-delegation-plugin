// Doctor probes for the cc-plugin-codex companion.
//
// Each probe is a `Promise<DoctorProbeResult>` and is independently testable. `runDoctor()`
// runs every probe sequentially, aggregates a single `DoctorReport`, and (by default)
// snapshots the JSON report to `getDoctorPath()` so `$claude-setup` and future skills can
// surface the latest state without re-running probes.
//
// Probes never start a real Claude background session, never fall back to `claude -p`, and
// never use a shell. Spawned commands run via `node:child_process.spawn` with
// `shell: false` and an explicit timeout (default 5s).

import { spawn } from 'node:child_process';
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ensureCompanionDirs, getCompanionHome, getDoctorPath } from './paths.js';

// ---------- public types ----------

export type DoctorProbeStatus = 'ok' | 'warn' | 'fail';

export interface DoctorProbeResult {
  name: string;
  status: DoctorProbeStatus;
  detail: string;
  evidence?: unknown;
}

export interface DoctorReport {
  status: DoctorProbeStatus;
  generatedAt: string;
  probes: DoctorProbeResult[];
}

export interface DoctorOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  writeSnapshot?: boolean;
  timeoutMs?: number;
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

// Probe order is meaningful: cheaper / structural probes first, then external commands.
const PROBES: Array<(opts: DoctorOptions) => Promise<DoctorProbeResult>> = [
  probeNodeVersion,
  probeCompanionDirWritable,
  probeCodexVersion,
  probeClaudeBinary,
  probeClaudeVersion,
  probeClaudeAuth,
  probeClaudeBgFlag,
  probeClaudeAgentsJson,
  probeClaudeLogs,
  probeClaudeDaemon,
  probeTranscriptPath,
  probeCodexPluginTrust,
];

function aggregateStatus(probes: DoctorProbeResult[]): DoctorProbeStatus {
  if (probes.some((p) => p.status === 'fail')) return 'fail';
  if (probes.some((p) => p.status === 'warn')) return 'warn';
  return 'ok';
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const probes: DoctorProbeResult[] = [];
  for (const probe of PROBES) {
    probes.push(await probe(options));
  }
  const report: DoctorReport = {
    status: aggregateStatus(probes),
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
