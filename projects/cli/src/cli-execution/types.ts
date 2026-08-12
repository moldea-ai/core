import type { IMoldeaCliCommandInvocation } from '../command-line/index.js';

// complete process output produced by one handled CLI invocation
export interface IMoldeaCliExecutionResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

// private command-dispatch input and seam used by later behavioral slices
export interface IMoldeaCliCommandExecutionInput {
  readonly cliVersion: string;
  readonly invocation: IMoldeaCliCommandInvocation;
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
}
