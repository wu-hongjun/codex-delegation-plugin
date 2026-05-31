// Typed errors for the runtime job store. Each error carries enough structured context
// to drive future CLI messages and test assertions.

export class JobStoreError extends Error {
  override readonly name: string = 'JobStoreError';
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export class JobNotFoundError extends JobStoreError {
  override readonly name = 'JobNotFoundError';
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.jobId = jobId;
  }
}

export class JobLockError extends JobStoreError {
  override readonly name = 'JobLockError';
  readonly jobId: string;
  readonly lockInfo: unknown;

  constructor(jobId: string, lockInfo?: unknown) {
    super(`Job is locked: ${jobId}`);
    this.jobId = jobId;
    this.lockInfo = lockInfo;
  }
}

export class InvalidJobIdError extends JobStoreError {
  override readonly name = 'InvalidJobIdError';
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Invalid job ID: ${jobId}`);
    this.jobId = jobId;
  }
}

export class CorruptJobRecordError extends JobStoreError {
  override readonly name = 'CorruptJobRecordError';
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Corrupt job record at ${path}`, cause);
    this.path = path;
  }
}

/**
 * Thrown by driver lifecycle methods that haven't been implemented yet in plan 0001.
 * The plan reference helps future readers grep for where the method lands.
 */
export class DriverNotImplementedError extends Error {
  override readonly name = 'DriverNotImplementedError';
  readonly methodName: string;
  readonly planReference: string | undefined;

  constructor(methodName: string, planReference?: string) {
    const where = planReference ? ` (planned for ${planReference})` : '';
    super(`Driver method not implemented yet: ${methodName}${where}`);
    this.methodName = methodName;
    this.planReference = planReference;
  }
}

/**
 * Operational error from a driver — spawn failure, non-zero exit, parse failure,
 * invalid input, timeout, etc. Carries structured context so dispatcher / status
 * surfaces can render useful messages without re-running the command.
 */
export interface DriverErrorContext {
  driverName: string;
  operation: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  cause?: unknown;
}

export class DriverError extends Error {
  override readonly name = 'DriverError';
  readonly driverName: string;
  readonly operation: string;
  readonly exitCode: number | undefined;
  readonly stdout: string | undefined;
  readonly stderr: string | undefined;
  override readonly cause: unknown;

  constructor(message: string, ctx: DriverErrorContext) {
    super(message);
    this.driverName = ctx.driverName;
    this.operation = ctx.operation;
    this.exitCode = ctx.exitCode;
    this.stdout = ctx.stdout;
    this.stderr = ctx.stderr;
    this.cause = ctx.cause;
  }
}
