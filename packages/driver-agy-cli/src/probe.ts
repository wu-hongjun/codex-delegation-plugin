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
  const printOk = helpResult.code === 0 && /--print(?:\s|string|,)/.test(help);
  const printProbe: DoctorProbeResult = printOk
    ? { name: 'agy-print-mode', status: 'ok', detail: 'agy --print is available' }
    : {
        name: 'agy-print-mode',
        status: 'fail',
        detail: binaryOk ? 'agy --help does not advertise --print' : 'agy binary unavailable',
      };
  const authProbe: DoctorProbeResult = {
    name: 'agy-auth',
    status: 'warn',
    detail: 'Authentication is checked on first delegation to avoid a token-spending probe.',
  };
  const probes = [binaryProbe, printProbe, authProbe];

  return {
    driverName: DRIVER_NAME,
    driverVersion: DRIVER_VERSION,
    cliVersion: binaryOk ? version : null,
    execution: 'supervised-process',
    features: {
      start: printOk,
      status: true,
      stop: true,
      followup: false,
      logs: true,
    },
    backgroundSessions: printOk,
    agentsJson: false,
    logsCommand: true,
    transcriptPath: false,
    attach: false,
    structuredStream: 'output',
    toolEvents: 'none',
    permissions: 'cli-policy',
    health: { status: aggregate(probes), probes },
  };
}
