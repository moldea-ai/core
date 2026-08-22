import { SUPPORTED_REPOSITORY_FORMAT_VERSIONS } from '@moldea.ai/core';

import { ACTIVE_RUNTIME_ADAPTERS } from '../core-composition/index.js';
import { MINIMUM_GIT_VERSION } from '../git-version/index.js';
import { MOLDEA_CLI_JSON_SCHEMA_VERSION } from '../json-output-contract/index.js';

import { createMoldeaCliCompatibilityResult } from './transformers.js';
import type {
  IMoldeaCliCompatibilityResolution,
  IMoldeaCliCompatibilityStateInput,
  IMoldeaCliInstalledCompatibilityInput,
} from './types.js';
import { isMoldeaCliCompatibilityStateValid } from './validations.js';

const INVALID_COMPATIBILITY_RESOLUTION = Object.freeze({ kind: 'invalid' as const });

/**
 * Resolves one explicit runtime composition without emitting a partial compatibility result.
 * @param input The installed and actual runtime state to compare.
 * @returns A valid immutable result or the single invalid-state outcome.
 */
export const resolveMoldeaCliCompatibility = (
  input: IMoldeaCliCompatibilityStateInput,
): IMoldeaCliCompatibilityResolution => {
  try {
    if (!isMoldeaCliCompatibilityStateValid(input)) {
      return INVALID_COMPATIBILITY_RESOLUTION;
    }

    return Object.freeze({
      kind: 'valid',
      result: createMoldeaCliCompatibilityResult(input),
    });
  } catch {
    return INVALID_COMPATIBILITY_RESOLUTION;
  }
};

/**
 * Resolves compatibility through the fixed package, Core, adapter, Git, and JSON composition.
 * @param input The installed package metadata.
 * @returns A valid immutable result or the single invalid-state outcome.
 */
export const resolveInstalledMoldeaCliCompatibility = (
  input: IMoldeaCliInstalledCompatibilityInput,
): IMoldeaCliCompatibilityResolution =>
  resolveMoldeaCliCompatibility({
    activeAdapters: ACTIVE_RUNTIME_ADAPTERS,
    coreSupportedRepositoryFormatVersions: SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
    minimumGitVersion: MINIMUM_GIT_VERSION,
    outputSchemaVersion: MOLDEA_CLI_JSON_SCHEMA_VERSION,
    packageMetadata: input.packageMetadata,
  });
