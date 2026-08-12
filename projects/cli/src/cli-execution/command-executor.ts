import { MOLDEA_CLI_COMMANDS } from '../command-line/index.js';
import { checkGitVersion, type IGitVersionPreflight } from '../git-version/index.js';

import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import { createMoldeaCliErrorResult } from './results.js';
import type { IMoldeaCliCommandExecutor, IMoldeaCliExecutionResult } from './types.js';

/**
 * Creates the private command dispatcher around an injectable Git prerequisite preflight.
 * @param gitVersionPreflight The Git prerequisite check.
 * @returns A command executor for the current behavioral slice.
 */
export const createMoldeaCliCommandExecutor =
  (gitVersionPreflight: IGitVersionPreflight = checkGitVersion): IMoldeaCliCommandExecutor =>
  async (input): Promise<IMoldeaCliExecutionResult> => {
    if (input.invocation.command !== MOLDEA_CLI_COMMANDS.Compatibility) {
      const preflightResult = await gitVersionPreflight();

      if (preflightResult.kind === 'failed') {
        return createMoldeaCliErrorResult(
          preflightResult.errorCode,
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
