import type { IProjectInspectionResult } from '@moldea.ai/core';

import type { IMoldeaCliCommand } from '../command-line/index.js';
import type { IMoldeaCliCompatibilityResult } from '../compatibility/index.js';
import {
  createMoldeaCliInspectResult,
  createMoldeaCliValidateResult,
  formatMoldeaCliHumanCompatibilityResult,
  formatMoldeaCliHumanError,
  formatMoldeaCliHumanInspectResult,
  formatMoldeaCliHumanValidateResult,
  formatMoldeaCliJsonCompatibilityResult,
  formatMoldeaCliJsonError,
  formatMoldeaCliJsonInspectResult,
  formatMoldeaCliJsonValidateResult,
  type IMoldeaCliError,
} from '../presentation/index.js';

import { MOLDEA_CLI_EXIT_CODES } from './constants.js';
import type { IMoldeaCliExecutionResult } from './types.js';

/**
 * Creates one process-neutral result for a valid compatibility composition.
 * @param result The exact installed compatibility result.
 * @param cliVersion The installed CLI package version.
 * @param isJson Whether machine-readable output was requested.
 * @returns The complete immutable successful process output.
 */
export const createMoldeaCliCompatibilityExecutionResult = (
  result: IMoldeaCliCompatibilityResult,
  cliVersion: string,
  isJson: boolean,
): IMoldeaCliExecutionResult =>
  Object.freeze({
    exitCode: MOLDEA_CLI_EXIT_CODES.Success,
    stderr: '',
    stdout: isJson
      ? formatMoldeaCliJsonCompatibilityResult(result, cliVersion)
      : formatMoldeaCliHumanCompatibilityResult(result, cliVersion),
  });

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

/**
 * Creates one process-neutral result for a completed validate command.
 * @param inspection The complete immutable Core inspection.
 * @param cliVersion The installed CLI package version.
 * @param isJson Whether machine-readable output was requested.
 * @returns The complete immutable process output.
 */
export const createMoldeaCliValidateExecutionResult = (
  inspection: IProjectInspectionResult,
  cliVersion: string,
  isJson: boolean,
): IMoldeaCliExecutionResult => {
  const result = createMoldeaCliValidateResult(inspection);
  const exitCode =
    result.diagnostics.length === 0
      ? MOLDEA_CLI_EXIT_CODES.Success
      : MOLDEA_CLI_EXIT_CODES.StructuralInvalid;

  return Object.freeze({
    exitCode,
    stderr: '',
    stdout: isJson
      ? formatMoldeaCliJsonValidateResult(result, cliVersion)
      : formatMoldeaCliHumanValidateResult(result),
  });
};

/**
 * Creates one process-neutral result for a completed inspect command.
 * @param inspection The complete immutable Core inspection.
 * @param cliVersion The installed CLI package version.
 * @param isJson Whether machine-readable output was requested.
 * @returns The complete immutable process output.
 * @throws If the Core result contradicts its valid, project, and diagnostic invariants.
 */
export const createMoldeaCliInspectExecutionResult = (
  inspection: IProjectInspectionResult,
  cliVersion: string,
  isJson: boolean,
): IMoldeaCliExecutionResult => {
  const result = createMoldeaCliInspectResult(inspection);

  return Object.freeze({
    exitCode: inspection.valid
      ? MOLDEA_CLI_EXIT_CODES.Success
      : MOLDEA_CLI_EXIT_CODES.StructuralInvalid,
    stderr: '',
    stdout: isJson
      ? formatMoldeaCliJsonInspectResult(result, cliVersion)
      : formatMoldeaCliHumanInspectResult(result),
  });
};
