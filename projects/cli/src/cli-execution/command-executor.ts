import { MOLDEA_CLI_COMMANDS } from '../command-line/index.js';
import {
  discoverGitWorkingTree,
  type IGitWorkingTreeDiscovery,
} from '../git-working-tree/index.js';
import {
  executeWorkingTreeSnapshot,
  type IWorkingTreeSnapshotExecutor,
} from '../working-tree-snapshot/index.js';

import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import { createMoldeaCliErrorResult } from './results.js';
import type { IMoldeaCliCommandExecutor, IMoldeaCliExecutionResult } from './types.js';

/**
 * Creates the private command dispatcher around discovery and bounded snapshot execution.
 * @param workingTreeDiscovery The Git working-tree discovery operation.
 * @param workingTreeSnapshotExecutor The complete working-tree snapshot operation.
 * @returns A command executor for the current behavioral slice.
 */
export const createMoldeaCliCommandExecutor =
  (
    workingTreeDiscovery: IGitWorkingTreeDiscovery = discoverGitWorkingTree,
    workingTreeSnapshotExecutor: IWorkingTreeSnapshotExecutor = executeWorkingTreeSnapshot,
  ): IMoldeaCliCommandExecutor =>
  async (input): Promise<IMoldeaCliExecutionResult> => {
    if (input.invocation.command !== MOLDEA_CLI_COMMANDS.Compatibility) {
      const discoveryResult = await workingTreeDiscovery({
        invocationDirectory: input.invocationDirectory,
        repositoryDirectory: input.invocation.options.repositoryDirectory,
      });

      if (discoveryResult.kind === 'failed') {
        return createMoldeaCliErrorResult(
          discoveryResult.errorCode,
          input.invocation.command,
          input.cliVersion,
          input.invocation.options.isJson,
          MOLDEA_CLI_EXIT_CODES.OperationalError,
        );
      }

      const snapshotResult = await workingTreeSnapshotExecutor({
        operation: () => Promise.resolve(),
        repositoryRoot: discoveryResult.repositoryRoot,
        resourceLimits: input.invocation.options.resourceLimits,
      });

      if (snapshotResult.kind === 'failed') {
        return createMoldeaCliErrorResult(
          snapshotResult.errorCode,
          input.invocation.command,
          input.cliVersion,
          input.invocation.options.isJson,
          MOLDEA_CLI_EXIT_CODES.OperationalError,
        );
      }
    }

    return createMoldeaCliErrorResult(
      'INTERNAL_ERROR',
      input.invocation.command,
      input.cliVersion,
      input.invocation.options.isJson,
      MOLDEA_CLI_EXIT_CODES.OperationalError,
    );
  };

// default private command dispatcher used by the executable runner
export const executeMoldeaCliCommand = createMoldeaCliCommandExecutor();
