import { spawn } from 'node:child_process';

import type {
  DoctorProbeResult,
  DoctorProbeStatus,
  DriverCapabilities,
} from '@codex-delegation/runtime';

import { DRIVER_NAME, DRIVER_VERSION } from './types.js';
import type { AgyCliDriverOptions } from './types.js';

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut: boolean;
}

function runAgy(args: string[], options: AgyCliDriverOptions): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(options.executable ?? options.env?.['AGY_CLI_PATH'] ?? 'agy', args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let error: NodeJS.ErrnoException | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs ?? 5000);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.once('error', (value) => (error = value));
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, error, timedOut });
    });
  });
}

function aggregate(probes: DoctorProbeResult[]): DoctorProbeStatus {
  if (probes.some((probe) => probe.status === 'fail')) return 'fail';
  if (probes.some((probe) => probe.status === 'warn')) return 'warn';
  return 'ok';
}

export async function probeAgyCliDriver(
  options: AgyCliDriverOptions = {},
): Promise<DriverCapabilities> {
  const versionResult = await runAgy(['--version'], options);
  const version = versionResult.stdout.trim() || versionResult.stderr.trim();
  const binaryOk = !versionResult.error && !versionResult.timedOut && versionResult.code === 0;
  const binaryProbe: DoctorProbeResult = binaryOk
    ? { name: 'agy-binary', status: 'ok', detail: version || 'agy is executable' }
    : {
        name: 'agy-binary',
        status: 'fail',
        detail: versionResult.timedOut
          ? 'agy --version timed out'
          : `Cannot run agy: ${versionResult.error?.code || versionResult.stderr.trim() || 'unknown error'}`,
      };

  const helpResult = binaryOk
    ? await runAgy(['--help'], options)
    : { code: null, stdout: '', stderr: '', timedOut: false };
  const help = `${helpResult.stdout}\n${helpResult.stderr}`;
  const interactiveOk = helpResult.code === 0 && help.includes('--prompt-interactive');
  const interactiveProbe: DoctorProbeResult = interactiveOk
    ? {
        name: 'agy-interactive-prompt',
        status: 'ok',
        detail: 'agy --prompt-interactive is available for supervised PTY sessions',
      }
    : {
        name: 'agy-interactive-prompt',
        status: 'fail',
        detail: binaryOk
          ? 'agy --help does not advertise --prompt-interactive'
          : 'agy binary unavailable',
      };
  const targetedResumeOk =
    helpResult.code === 0 && help.includes('--conversation') && help.includes('--log-file');
  const resumeProbe: DoctorProbeResult = targetedResumeOk
    ? {
        name: 'agy-targeted-resume',
        status: 'ok',
        detail: 'agy supports job-scoped --conversation resumes with per-job diagnostic logs',
      }
    : {
        name: 'agy-targeted-resume',
        status: 'warn',
        detail:
          'agy --help does not advertise both --conversation and --log-file; delegation works but exact follow-up is unavailable',
      };
  const modelsResult = binaryOk
    ? await runAgy(['models'], options)
    : { code: null, stdout: '', stderr: '', timedOut: false };
  const authProbe: DoctorProbeResult =
    modelsResult.code === 0 && modelsResult.stdout.trim().length > 0
      ? {
          name: 'agy-model-access',
          status: 'ok',
          detail: 'agy models returned the authenticated model catalog without starting a turn',
        }
      : {
          name: 'agy-model-access',
          status: 'warn',
          detail:
            modelsResult.stderr.trim() ||
            'agy model access could not be confirmed without starting a delegated turn',
        };

  const pluginResult = binaryOk
    ? await runAgy(['plugin', 'list'], options)
    : { code: null, stdout: '', stderr: '', timedOut: false };
  const controlPluginOk =
    pluginResult.code === 0 && pluginResult.stdout.includes('codex-delegation-control');
  const controlPluginProbe: DoctorProbeResult = controlPluginOk
    ? {
        name: 'agy-control-plugin',
        status: 'ok',
        detail:
          'codex-delegation-control lifecycle hooks and native subagent profiles are installed',
      }
    : {
        name: 'agy-control-plugin',
        status: 'warn',
        detail:
          'codex-delegation-control is not installed; run $agy-setup for structured lifecycle, transcript discovery, and native subagent profiles',
      };

  let ptyOk = false;
  try {
    const pty = await import('node-pty');
    ptyOk = typeof pty.spawn === 'function';
  } catch {
    ptyOk = false;
  }
  const ptyProbe: DoctorProbeResult = ptyOk
    ? {
        name: 'agy-pty-runtime',
        status: 'ok',
        detail: 'node-pty is loadable for persistent Antigravity TUI supervision',
      }
    : {
        name: 'agy-pty-runtime',
        status: 'fail',
        detail: 'node-pty is unavailable; reinstall the delegate plugin',
      };

  const probes = [
    binaryProbe,
    interactiveProbe,
    resumeProbe,
    authProbe,
    controlPluginProbe,
    ptyProbe,
  ];

  return {
    driverName: DRIVER_NAME,
    driverVersion: DRIVER_VERSION,
    cliVersion: binaryOk ? version : null,
    execution: 'supervised-interactive',
    features: {
      start: interactiveOk && ptyOk,
      status: true,
      stop: true,
      followup: interactiveOk && ptyOk && targetedResumeOk,
      logs: true,
      liveInput: interactiveOk && ptyOk,
      permissionHandoff: interactiveOk && ptyOk,
      nativeFork: interactiveOk && ptyOk,
      childControl: interactiveOk && ptyOk,
    },
    backgroundSessions: interactiveOk && ptyOk,
    agentsJson: false,
    logsCommand: true,
    transcriptPath: controlPluginOk,
    attach: interactiveOk && ptyOk,
    structuredStream: controlPluginOk ? 'transcript' : 'output',
    toolEvents: controlPluginOk ? 'transcript' : 'none',
    permissions: interactiveOk && ptyOk ? 'human-attach' : 'none',
    health: { status: aggregate(probes), probes },
  };
}
