import type { IMoldeaCliCommandInvocation } from '../command-line/index.js';
import type { IMoldeaCliPackageMetadata } from '../package-metadata/index.js';
import type { IMoldeaCliReleaseMetadata } from '../release-metadata/index.js';

// complete process output produced by one handled CLI invocation
export interface IMoldeaCliExecutionResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

// private command-dispatch input with optional operation cancellation
export interface IMoldeaCliCommandExecutionInput {
  readonly invocationDirectory: string;
  readonly invocation: IMoldeaCliCommandInvocation;
  readonly packageMetadata: IMoldeaCliPackageMetadata;
  readonly releaseMetadata: IMoldeaCliReleaseMetadata;
  readonly signal?: AbortSignal;
}

// private dispatch boundary extended as command implementations are introduced
export type IMoldeaCliCommandExecutor = (
  input: IMoldeaCliCommandExecutionInput,
) => Promise<IMoldeaCliExecutionResult>;

// process-neutral inputs required to handle one optionally cancellable invocation
export interface IRunMoldeaCliOptions {
  readonly commandLineArguments: readonly string[];
  readonly executeCommand?: IMoldeaCliCommandExecutor;
  readonly invocationDirectory: string;
  readonly packageMetadata: IMoldeaCliPackageMetadata;
  readonly releaseMetadata: IMoldeaCliReleaseMetadata;
  readonly signal?: AbortSignal;
}
