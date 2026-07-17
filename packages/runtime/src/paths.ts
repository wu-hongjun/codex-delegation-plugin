// Filesystem path helpers for Codex Delegation runtime state.
//
// Default state lives under `~/.codex/codex-delegation-plugin/`. Tests MUST override via the
// CODEX_DELEGATION_HOME env var to an isolated temp directory so they do not touch real state.
//
// Path helpers do NOT create directories on their own. The only function that touches the
// filesystem is `ensureDelegationDirs()`, called explicitly by job-store entry points.

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENV_VAR = 'CODEX_DELEGATION_HOME';

function defaultHome(): string {
  return join(homedir(), '.codex', 'codex-delegation-plugin');
}

export function getDelegationHome(): string {
  const override = process.env[ENV_VAR];
  return override && override.length > 0 ? override : defaultHome();
}

export function getJobsDir(): string {
  return join(getDelegationHome(), 'jobs');
}

export function getLogsDir(): string {
  return join(getDelegationHome(), 'logs');
}

export function getProviderSessionsDir(provider: string): string {
  if (!/^[a-z0-9-]+$/.test(provider)) {
    throw new Error(`Invalid provider session directory: ${provider}`);
  }
  return join(getDelegationHome(), 'sessions', provider);
}

export function getDoctorPath(): string {
  return join(getDelegationHome(), 'doctor.json');
}

export function getJobRecordPath(jobId: string): string {
  return join(getJobsDir(), `${jobId}.json`);
}

export function getJobEventsPath(jobId: string): string {
  return join(getJobsDir(), `${jobId}.events.jsonl`);
}

export function getJobResultPath(jobId: string): string {
  return join(getJobsDir(), `${jobId}.result.md`);
}

export function getJobTurnResultPath(jobId: string, turnIndex: number): string {
  return join(getJobsDir(), `${jobId}.turn-${turnIndex}.result.md`);
}

export function getJobLockPath(jobId: string): string {
  return join(getJobsDir(), `${jobId}.lock`);
}

export async function ensureDelegationDirs(): Promise<void> {
  await mkdir(getJobsDir(), { recursive: true });
  await mkdir(getLogsDir(), { recursive: true });
}

export async function ensureProviderSessionsDir(provider: string): Promise<string> {
  const path = getProviderSessionsDir(provider);
  await mkdir(path, { recursive: true });
  return path;
}
