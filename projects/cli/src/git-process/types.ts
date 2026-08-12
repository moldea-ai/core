// immutable environment passed to a Git subprocess
export type IGitProcessEnvironment = Readonly<Record<string, string>>;

// reasons a Git subprocess can fail without exposing process diagnostics
export type IGitProcessFailureReason =
  'not-found' | 'access-denied' | 'output-limit-exceeded' | 'command-failed';

// completed Git subprocess output
export interface IGitProcessCompletedResult {
  readonly kind: 'completed';
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

// normalized Git subprocess failure
export interface IGitProcessFailedResult {
  readonly kind: 'failed';
  readonly reason: IGitProcessFailureReason;
}

// normalized result of a Git subprocess
export type IGitProcessResult = IGitProcessCompletedResult | IGitProcessFailedResult;

// trusted arguments and limits for one Git subprocess
export interface IExecuteGitProcessOptions {
  readonly arguments: readonly string[];
  readonly environment?: NodeJS.ProcessEnv;
  readonly maxBufferBytes: number;
}

// injectable Git subprocess boundary
export type IGitProcessExecutor = (
  options: IExecuteGitProcessOptions,
) => Promise<IGitProcessResult>;
