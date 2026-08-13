import { MOLDEA_CLI_ERROR_DEFINITIONS } from './constants.js';
import type { IMoldeaCliError, IMoldeaCliOwnedErrorCode } from './types.js';

const EMPTY_ERROR_DETAILS = Object.freeze({});

/**
 * Creates one immutable safe error from a CLI- or Git-owned definition.
 * @param code The stable executable-owned error code.
 * @returns The complete safe error object.
 */
export const createMoldeaCliOwnedError = (code: IMoldeaCliOwnedErrorCode): IMoldeaCliError => {
  const definition = MOLDEA_CLI_ERROR_DEFINITIONS[code];

  return Object.freeze({
    code,
    details: EMPTY_ERROR_DETAILS,
    message: definition.message,
    path: null,
    retryable: definition.retryable,
    source: definition.source,
  });
};
