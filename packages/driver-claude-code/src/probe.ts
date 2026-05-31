// ClaudeBackgroundDriver.probe() implementation.
//
// IMPORTANT: this is the driver's *own* health probe — Claude-relevant checks only.
// It deliberately does NOT call `runDoctor()`, because `runDoctor()` also probes Codex
// and plugin-trust state. A missing Codex install must not make the Claude driver look
// unavailable. See plan 0001 T5 instruction "Important scope correction".

import {
  type DoctorOptions,
  type DoctorProbeResult,
  type DoctorProbeStatus,
  type DriverCapabilities,
  probeClaudeAgentsJson,
  probeClaudeAuth,
  probeClaudeBgFlag,
  probeClaudeBinary,
  probeClaudeDaemon,
  probeClaudeLogs,
  probeClaudeVersion,
  probeTranscriptPath,
} from '@cc-plugin-codex/runtime';

import { DRIVER_NAME, DRIVER_VERSION } from './types.js';

function aggregate(probes: DoctorProbeResult[]): DoctorProbeStatus {
  if (probes.some((p) => p.status === 'fail')) return 'fail';
  if (probes.some((p) => p.status === 'warn')) return 'warn';
  return 'ok';
}

function findProbe(probes: DoctorProbeResult[], name: string): DoctorProbeResult | undefined {
  return probes.find((p) => p.name === name);
}

function isOk(probes: DoctorProbeResult[], name: string): boolean {
  return findProbe(probes, name)?.status === 'ok';
}

function statusOf(probes: DoctorProbeResult[], name: string): DoctorProbeStatus | undefined {
  return findProbe(probes, name)?.status;
}

export async function probeClaudeBackgroundDriver(
  options: DoctorOptions = {},
): Promise<DriverCapabilities> {
  // Run Claude-only probes sequentially. Codex / plugin-trust / companion-dir probes
  // are explicitly excluded — those belong to the whole-plugin doctor, not the driver.
  const probes: DoctorProbeResult[] = [];
  probes.push(await probeClaudeBinary(options));
  probes.push(await probeClaudeVersion(options));
  probes.push(await probeClaudeAuth(options));
  probes.push(await probeClaudeBgFlag(options));
  probes.push(await probeClaudeAgentsJson(options));
  probes.push(await probeClaudeLogs(options));
  probes.push(await probeClaudeDaemon(options));
  probes.push(await probeTranscriptPath(options));

  const versionProbe = findProbe(probes, 'claude-version');
  const claudeVersion = versionProbe?.status === 'ok' ? versionProbe.detail : null;

  const transcriptOk = isOk(probes, 'transcript-path');
  const authOk = isOk(probes, 'claude-auth');

  return {
    driverName: DRIVER_NAME,
    driverVersion: DRIVER_VERSION,
    claudeVersion,
    backgroundSessions:
      isOk(probes, 'claude-bg-flag') ||
      (statusOf(probes, 'claude-bg-flag') === 'warn' && isOk(probes, 'claude-agents-json')),
    agentsJson: isOk(probes, 'claude-agents-json'),
    logsCommand: isOk(probes, 'claude-logs'),
    transcriptPath: transcriptOk,
    attach: false,
    structuredStream: transcriptOk ? 'transcript' : 'none',
    toolEvents: transcriptOk ? 'transcript' : 'none',
    permissions: authOk ? 'human-attach' : 'none',
    health: { status: aggregate(probes), probes },
  };
}
