import { spawn } from 'node:child_process';

import type {
  DoctorProbeResult,
  DoctorProbeStatus,
  DriverCapabilities,
} from '@codex-delegation/runtime';

import { DRIVER_NAME, DRIVER_VERSION } from './types.js';
import type { QwenCodeDriverOptions } from './types.js';

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut: boolean;
}

function executable(options: QwenCodeDriverOptions): string {
  return options.executable ?? options.env?.['QWEN_CLI_PATH'] ?? 'qwen';
}

function run(args: string[], options: QwenCodeDriverOptions): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(executable(options), args, {
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

export async function probeQwenCodeDriver(
  options: QwenCodeDriverOptions = {},
): Promise<DriverCapabilities> {
  const versionResult = await run(['--version'], options);
  const version = versionResult.stdout.trim() || versionResult.stderr.trim();
  const binaryOk =
    !versionResult.error && !versionResult.timedOut && versionResult.code === 0;
  const binary: DoctorProbeResult = binaryOk
    ? { name: 'qwen-binary', status: 'ok', detail: version || 'qwen is executable' }
    : {
        name: 'qwen-binary',
        status: 'fail',
        detail: versionResult.timedOut
          ? 'qwen --version timed out'
          : `Cannot run qwen: ${versionResult.error?.code ?? versionResult.stderr.trim()}`,
      };
  const helpResult = binaryOk ? await run(['--help'], options) : null;
  const help = `${helpResult?.stdout ?? ''}\n${helpResult?.stderr ?? ''}`;
  const structured =
    helpResult?.code === 0 && help.includes('--output-format') && help.includes('stream-json');
  const resume = helpResult?.code === 0 && help.includes('--resume');
  const protocol: DoctorProbeResult =
    structured && resume
      ? {
          name: 'qwen-headless-protocol',
          status: 'ok',
          detail: 'stream-json output and exact --resume are available',
        }
      : {
          name: 'qwen-headless-protocol',
          status: 'fail',
          detail: 'qwen --help must advertise stream-json output and --resume',
        };
  const auth: DoctorProbeResult = {
    name: 'qwen-auth',
    status: 'warn',
    detail: 'authentication cannot be verified without making a model request',
  };
  const probes = [binary, protocol, auth];
  return {
    driverName: DRIVER_NAME,
    driverVersion: DRIVER_VERSION,
    cliVersion: binaryOk ? version : null,
    execution: 'supervised-process',
    features: {
      start: structured,
      status: true,
      stop: true,
      followup: structured && resume,
      logs: true,
      liveInput: false,
      permissionHandoff: false,
      nativeFork: false,
      childControl: false,
    },
    backgroundSessions: structured,
    agentsJson: false,
    logsCommand: false,
    transcriptPath: true,
    attach: false,
    structuredStream: 'transcript',
    toolEvents: 'transcript',
    permissions: 'cli-policy',
    health: { status: aggregate(probes), probes },
  };
}
