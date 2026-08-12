import { MOLDEA_CLI_COMMANDS } from '../command-line/index.js';
import {
  discoverGitWorkingTree,
  type IGitWorkingTreeDiscovery,
} from '../git-working-tree/index.js';

import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import { createMoldeaCliErrorResult } from './results.js';
import type { IMoldeaCliCommandExecutor, IMoldeaCliExecutionResult } from './types.js';

/**
 * Creates the private command dispatcher around injectable working-tree discovery.
 * @param workingTreeDiscovery The Git working-tree discovery operation.
 * @returns A command executor for the current behavioral slice.
 */
export const createMoldeaCliCommandExecutor =
  (
    workingTreeDiscovery: IGitWorkingTreeDiscovery = discoverGitWorkingTree,
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
