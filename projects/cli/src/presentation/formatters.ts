import type { IMoldeaCliCommand } from '../command-line/index.js';
import { serializeJsonDeterministically } from '../json-serialization/index.js';

import {
  MOLDEA_CLI_COMMAND_HELP,
  MOLDEA_CLI_ERROR_DEFINITIONS,
  MOLDEA_CLI_TOP_LEVEL_HELP,
} from './constants.js';
import type { IMoldeaCliErrorCode, IMoldeaCliJsonErrorEnvelope } from './types.js';

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
 * @param code The stable CLI error code.
 * @returns One concise line ending with LF.
 */
export const formatMoldeaCliHumanError = (code: IMoldeaCliErrorCode): string => {
  const definition = MOLDEA_CLI_ERROR_DEFINITIONS[code];

  return `${definition.source}:${code} ${definition.message}\n`;
};

/**
 * Formats one safe version 1 JSON error envelope.
 * @param code The stable CLI error code.
 * @param command The resolved command, or null when resolution failed.
 * @param cliVersion The installed CLI package version.
 * @returns One compact deterministic JSON document ending with LF.
 */
export const formatMoldeaCliJsonError = (
  code: IMoldeaCliErrorCode,
  command: IMoldeaCliCommand | null,
  cliVersion: string,
): string => {
  const definition = MOLDEA_CLI_ERROR_DEFINITIONS[code];
  const envelope: IMoldeaCliJsonErrorEnvelope = {
    cliVersion,
    command,
    error: {
      code,
      details: {},
      message: definition.message,
      path: null,
      retryable: definition.retryable,
      source: definition.source,
    },
    result: null,
    schemaVersion: 1,
    status: 'error',
  };

  return `${serializeJsonDeterministically(envelope)}\n`;
};
