import { MOLDEA_CLI_COMMANDS } from '../command-line/index.js';
import {
  executeMoldeaCliCoreInspection,
  type IMoldeaCliCoreInspectionExecutor,
} from '../core-composition/index.js';
import {
  discoverGitWorkingTree,
  type IGitWorkingTreeDiscovery,
} from '../git-working-tree/index.js';
import { mapMoldeaCliOperationalError } from '../operational-error/index.js';
import { createMoldeaCliOwnedError } from '../presentation/index.js';
import {
  executeWorkingTreeSnapshot,
  type IWorkingTreeSnapshotExecutor,
} from '../working-tree-snapshot/index.js';

import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import { createMoldeaCliErrorResult, createMoldeaCliValidateExecutionResult } from './results.js';
import type { IMoldeaCliCommandExecutor, IMoldeaCliExecutionResult } from './types.js';

/**
 * Creates the private command dispatcher around discovery and bounded snapshot execution.
 * @param workingTreeDiscovery The Git working-tree discovery operation.
 * @param workingTreeSnapshotExecutor The complete working-tree snapshot operation.
 * @param coreInspectionExecutor The attempt-local Core inspection composition.
 * @returns A command executor for the current behavioral slice.
 */
export const createMoldeaCliCommandExecutor =
  (
    workingTreeDiscovery: IGitWorkingTreeDiscovery = discoverGitWorkingTree,
    workingTreeSnapshotExecutor: IWorkingTreeSnapshotExecutor = executeWorkingTreeSnapshot,
    coreInspectionExecutor: IMoldeaCliCoreInspectionExecutor = executeMoldeaCliCoreInspection,
  ): IMoldeaCliCommandExecutor =>
  async (input): Promise<IMoldeaCliExecutionResult> => {
    if (input.invocation.command !== MOLDEA_CLI_COMMANDS.Compatibility) {
      const discoveryResult = await workingTreeDiscovery({
        invocationDirectory: input.invocationDirectory,
        repositoryDirectory: input.invocation.options.repositoryDirectory,
      });

      if (discoveryResult.kind === 'failed') {
        return createMoldeaCliErrorResult(
          createMoldeaCliOwnedError(discoveryResult.errorCode),
          input.invocation.command,
          input.cliVersion,
          input.invocation.options.isJson,
          MOLDEA_CLI_EXIT_CODES.OperationalError,
        );
      }

      try {
        const resourceLimits = input.invocation.options.resourceLimits;
        const snapshotResult = await workingTreeSnapshotExecutor({
          operation: (repository) => coreInspectionExecutor({ repository, resourceLimits }),
          repositoryRoot: discoveryResult.repositoryRoot,
          resourceLimits,
        });

        if (snapshotResult.kind === 'failed') {
          return createMoldeaCliErrorResult(
            createMoldeaCliOwnedError(snapshotResult.errorCode),
            input.invocation.command,
            input.cliVersion,
            input.invocation.options.isJson,
            MOLDEA_CLI_EXIT_CODES.OperationalError,
          );
        }

        if (input.invocation.command === MOLDEA_CLI_COMMANDS.Validate) {
          return createMoldeaCliValidateExecutionResult(
            snapshotResult.result,
            input.cliVersion,
            input.invocation.options.isJson,
          );
        }
      } catch (error) {
        return createMoldeaCliErrorResult(
          mapMoldeaCliOperationalError(error),
          input.invocation.command,
          input.cliVersion,
          input.invocation.options.isJson,
          MOLDEA_CLI_EXIT_CODES.OperationalError,
        );
      }
    }

    return createMoldeaCliErrorResult(
      createMoldeaCliOwnedError('INTERNAL_ERROR'),
      input.invocation.command,
      input.cliVersion,
      input.invocation.options.isJson,
      MOLDEA_CLI_EXIT_CODES.OperationalError,
    );
  };

// default private command dispatcher used by the executable runner
export const executeMoldeaCliCommand = createMoldeaCliCommandExecutor();
