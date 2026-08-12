import { parseMoldeaCliArguments } from '../command-line/index.js';
import type { IMoldeaCliCommand } from '../command-line/index.js';
import {
  formatMoldeaCliHelp,
  formatMoldeaCliHumanError,
  formatMoldeaCliJsonError,
} from '../presentation/index.js';
import type { IMoldeaCliErrorCode } from '../presentation/index.js';

import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import type {
  IMoldeaCliCommandExecutionInput,
  IMoldeaCliExecutionResult,
  IRunMoldeaCliOptions,
} from './types.js';

const createErrorResult = (
  code: IMoldeaCliErrorCode,
  command: IMoldeaCliCommand | null,
  cliVersion: string,
  isJson: boolean,
  exitCode: number,
): IMoldeaCliExecutionResult => {
  return isJson
    ? {
        exitCode,
        stderr: '',
        stdout: formatMoldeaCliJsonError(code, command, cliVersion),
      }
    : {
        exitCode,
        stderr: formatMoldeaCliHumanError(code),
        stdout: '',
      };
};

/** Reports the unpublished foundation's intentionally unavailable command handlers safely. */
const executeUnavailableCommand = (
  input: IMoldeaCliCommandExecutionInput,
): Promise<IMoldeaCliExecutionResult> => {
  return Promise.resolve(
    createErrorResult(
      'INTERNAL_ERROR',
      input.invocation.command,
      input.cliVersion,
      input.invocation.options.isJson,
      MOLDEA_CLI_EXIT_CODES.OperationalError,
    ),
  );
};

/**
 * Runs one process-neutral CLI invocation through parsing and private command dispatch.
 * @param options The arguments, installed version, and optional command executor.
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
    return createErrorResult(
      parseResult.code,
      parseResult.command,
      options.cliVersion,
      parseResult.isJson,
      MOLDEA_CLI_EXIT_CODES.UsageError,
    );
  }

  const executeCommand = options.executeCommand ?? executeUnavailableCommand;

  try {
    return await executeCommand({
      cliVersion: options.cliVersion,
      invocation: parseResult.invocation,
    });
  } catch {
    return createErrorResult(
      'INTERNAL_ERROR',
      parseResult.invocation.command,
      options.cliVersion,
      parseResult.invocation.options.isJson,
      MOLDEA_CLI_EXIT_CODES.OperationalError,
    );
  }
};
