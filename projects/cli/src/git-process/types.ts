// immutable environment passed to a Git subprocess
export type IGitProcessEnvironment = Readonly<Record<string, string>>;

// reasons a Git subprocess can fail without exposing process diagnostics
export type IGitProcessFailureReason =
  | 'not-found'
  | 'repository-not-found'
  | 'access-denied'
  | 'output-limit-exceeded'
  | 'command-failed';

// streamed Git failures that distinguish bounded stdout and stderr exhaustion
export type IGitStreamingProcessFailureReason =
  IGitProcessFailureReason | 'stderr-limit-exceeded' | 'stdout-limit-exceeded';

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

// consumer for one bounded Git stdout chunk
export type IGitProcessStdoutConsumer = (chunk: Uint8Array) => void;

// trusted arguments, optional input, and independent stream limits for one Git subprocess
export interface IExecuteGitStreamingProcessOptions {
  readonly arguments: readonly string[];
  readonly consumeStdout: IGitProcessStdoutConsumer;
  readonly environment?: NodeJS.ProcessEnv;
  readonly maxStderrBytes: number;
  readonly maxStdoutBytes: number;
  readonly stdin?: Uint8Array;
}

// successful streamed Git process result without retained stdout
export interface IGitStreamingProcessCompletedResult {
  readonly kind: 'completed';
  readonly stderr: Uint8Array;
  readonly stdoutBytes: number;
}

// safe streamed Git process failure
export interface IGitStreamingProcessFailedResult {
  readonly kind: 'failed';
  readonly reason: IGitStreamingProcessFailureReason;
}

// normalized streamed Git process result
export type IGitStreamingProcessResult =
  IGitStreamingProcessCompletedResult | IGitStreamingProcessFailedResult;

// injectable streamed Git subprocess boundary
export type IGitStreamingProcessExecutor = (
  options: IExecuteGitStreamingProcessOptions,
) => Promise<IGitStreamingProcessResult>;
