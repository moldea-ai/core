import { CoreConfigurationException, CoreOperationException } from '@moldea.ai/core';
import { isRepositoryPath, RepositorySourceException } from '@moldea.ai/repository';

import { GitContentTransformUnsupportedException } from '../repository-content-transformation-guard/index.js';
import { createMoldeaCliOwnedError, type IMoldeaCliError } from '../presentation/index.js';

import {
  CORE_CONFIGURATION_ERROR_MESSAGES,
  CORE_OPERATION_ERROR_MESSAGES,
  REPOSITORY_SOURCE_ERROR_MESSAGES,
} from './constants.js';

const EMPTY_ERROR_DETAILS = Object.freeze({});

/** Creates frozen safe Core metadata without retaining null fields. */
const createCoreErrorDetails = (
  error: CoreConfigurationException | CoreOperationException,
): Readonly<Record<string, string>> => {
  const details: Record<string, string> = { operation: error.operation };

  if (error.adapterId !== null) {
    details['adapterId'] = error.adapterId;
  }

  if (error instanceof CoreOperationException) {
    if (error.agentId !== null) {
      details['agentId'] = error.agentId;
    }

    if (error.limit !== null) {
      details['limit'] = error.limit;
    }
  }

  return Object.freeze(details);
};

/**
 * Maps a known package exception or unknown failure to one safe CLI error object.
 * @param error The failure that escaped command composition.
 * @returns A complete immutable operational error without causes or private host data.
 */
export const mapMoldeaCliOperationalError = (error: unknown): IMoldeaCliError => {
  if (error instanceof GitContentTransformUnsupportedException) {
    return Object.freeze({
      ...createMoldeaCliOwnedError('GIT_CONTENT_TRANSFORM_UNSUPPORTED'),
      path: isRepositoryPath(error.path) ? error.path : null,
    });
  }

  if (error instanceof RepositorySourceException) {
    return Object.freeze({
      code: error.code,
      details: EMPTY_ERROR_DETAILS,
      message: REPOSITORY_SOURCE_ERROR_MESSAGES[error.code],
      path: error.path !== null && isRepositoryPath(error.path) ? error.path : null,
      retryable: error.retryable,
      source: 'repository',
    });
  }

  if (error instanceof CoreConfigurationException) {
    return Object.freeze({
      code: error.code,
      details: createCoreErrorDetails(error),
      message: CORE_CONFIGURATION_ERROR_MESSAGES[error.code],
      path: null,
      retryable: false,
      source: 'core',
    });
  }

  if (error instanceof CoreOperationException) {
    return Object.freeze({
      code: error.code,
      details: createCoreErrorDetails(error),
      message: CORE_OPERATION_ERROR_MESSAGES[error.code],
      path: null,
      retryable: error.retryable,
      source: 'core',
    });
  }

  return createMoldeaCliOwnedError('INTERNAL_ERROR');
};
