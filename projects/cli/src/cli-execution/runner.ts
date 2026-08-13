import { parseMoldeaCliArguments } from '../command-line/index.js';
import { createMoldeaCliOwnedError, formatMoldeaCliHelp } from '../presentation/index.js';

import { executeMoldeaCliCommand } from './command-executor.js';
import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import { createMoldeaCliErrorResult } from './results.js';
import type { IMoldeaCliExecutionResult, IRunMoldeaCliOptions } from './types.js';

/**
 * Runs one process-neutral CLI invocation through parsing and private command dispatch.
 * @param options The arguments, installed version, generated release metadata, and executor seam.
 * @returns A promise resolving to exact process output and the handled exit code.
 */
export const runMoldeaCli = async (
  options: IRunMoldeaCliOptions,
): Promise<IMoldeaCliExecutionResult> => {
  const parseResult = parseMoldeaCliArguments(options.commandLineArguments);

  if (parseResult.kind === 'help') {
    return {
      exitCode: MOLDEA_CLI_EXIT_CODES.Success,
      stderr: '',
      stdout: formatMoldeaCliHelp(parseResult.command),
    };
  }

  if (parseResult.kind === 'version') {
    return {
      exitCode: MOLDEA_CLI_EXIT_CODES.Success,
      stderr: '',
      stdout: `${options.cliVersion}\n`,
    };
  }

  if (parseResult.kind === 'error') {
    return createMoldeaCliErrorResult(
      createMoldeaCliOwnedError(parseResult.code),
      parseResult.command,
      options.cliVersion,
      parseResult.isJson,
      MOLDEA_CLI_EXIT_CODES.UsageError,
    );
  }

  const executeCommand = options.executeCommand ?? executeMoldeaCliCommand;

  try {
    return await executeCommand({
      cliVersion: options.cliVersion,
      invocationDirectory: options.invocationDirectory,
      invocation: parseResult.invocation,
      releaseMetadata: options.releaseMetadata,
    });
  } catch {
    return createMoldeaCliErrorResult(
      createMoldeaCliOwnedError('INTERNAL_ERROR'),
      parseResult.invocation.command,
      options.cliVersion,
      parseResult.invocation.options.isJson,
      MOLDEA_CLI_EXIT_CODES.OperationalError,
    );
  }
};
