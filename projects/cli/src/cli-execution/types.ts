import type { IMoldeaCliCommandInvocation } from '../command-line/index.js';
import type { IMoldeaCliReleaseMetadata } from '../release-metadata/index.js';

// complete process output produced by one handled CLI invocation
export interface IMoldeaCliExecutionResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

// private command-dispatch input and seam used by later behavioral slices
export interface IMoldeaCliCommandExecutionInput {
  readonly cliVersion: string;
  readonly invocationDirectory: string;
  readonly invocation: IMoldeaCliCommandInvocation;
  readonly releaseMetadata: IMoldeaCliReleaseMetadata;
}

// private dispatch boundary extended as command implementations are introduced
export type IMoldeaCliCommandExecutor = (
  input: IMoldeaCliCommandExecutionInput,
) => Promise<IMoldeaCliExecutionResult>;

// process-neutral inputs required to handle one invocation
export interface IRunMoldeaCliOptions {
  readonly cliVersion: string;
  readonly commandLineArguments: readonly string[];
  readonly executeCommand?: IMoldeaCliCommandExecutor;
  readonly invocationDirectory: string;
  readonly releaseMetadata: IMoldeaCliReleaseMetadata;
}
