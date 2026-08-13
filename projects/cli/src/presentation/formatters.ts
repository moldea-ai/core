import type { IMoldeaCliCommand } from '../command-line/index.js';
import { serializeJsonDeterministically } from '../json-serialization/index.js';

import { MOLDEA_CLI_COMMAND_HELP, MOLDEA_CLI_TOP_LEVEL_HELP } from './constants.js';
import type { IMoldeaCliError, IMoldeaCliJsonErrorEnvelope } from './types.js';

/**
 * Formats top-level or command-specific help with its required trailing line feed.
 * @param command The resolved command, or null for top-level help.
 * @returns Human-readable help text.
 */
export const formatMoldeaCliHelp = (command: IMoldeaCliCommand | null): string => {
  if (command === null) {
    return MOLDEA_CLI_TOP_LEVEL_HELP;
  }

  return MOLDEA_CLI_COMMAND_HELP[command];
};

/**
 * Formats one safe CLI error for human stderr output.
 * @param error The complete safe operational error.
 * @returns One concise line ending with LF.
 */
export const formatMoldeaCliHumanError = (error: IMoldeaCliError): string =>
  `${error.source}:${error.code} ${error.message}\n`;

/**
 * Formats one safe version 1 JSON error envelope.
 * @param error The complete safe operational error.
 * @param command The resolved command, or null when resolution failed.
 * @param cliVersion The installed CLI package version.
 * @returns One compact deterministic JSON document ending with LF.
 */
export const formatMoldeaCliJsonError = (
  error: IMoldeaCliError,
  command: IMoldeaCliCommand | null,
  cliVersion: string,
): string => {
  const envelope: IMoldeaCliJsonErrorEnvelope = {
    cliVersion,
    command,
    error,
    result: null,
    schemaVersion: 1,
    status: 'error',
  };

  return `${serializeJsonDeterministically(envelope)}\n`;
};
