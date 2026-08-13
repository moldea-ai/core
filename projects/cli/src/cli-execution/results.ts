import type { IMoldeaCliCommand } from '../command-line/index.js';
import {
  formatMoldeaCliHumanError,
  formatMoldeaCliJsonError,
  type IMoldeaCliError,
} from '../presentation/index.js';

import type { IMoldeaCliExecutionResult } from './types.js';

/**
 * Creates one safe process-neutral error result in the requested output mode.
 * @param error The complete safe operational error.
 * @param command The resolved command, or null when resolution failed.
 * @param cliVersion The installed CLI package version.
 * @param isJson Whether machine-readable output was requested.
 * @param exitCode The handled process exit code.
 * @returns The complete immutable process output.
 */
export const createMoldeaCliErrorResult = (
  error: IMoldeaCliError,
  command: IMoldeaCliCommand | null,
  cliVersion: string,
  isJson: boolean,
  exitCode: number,
): IMoldeaCliExecutionResult =>
  Object.freeze(
    isJson
      ? {
          exitCode,
          stderr: '',
          stdout: formatMoldeaCliJsonError(error, command, cliVersion),
        }
      : {
          exitCode,
          stderr: formatMoldeaCliHumanError(error),
          stdout: '',
        },
  );
