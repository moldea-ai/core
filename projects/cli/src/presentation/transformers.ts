import type { IProjectInspectionResult } from '@moldea.ai/core';

import { MOLDEA_CLI_GIT_WORKING_TREE_SOURCE } from './constants.js';
import type { IMoldeaCliValidateResult } from './types.js';

/**
 * Reduces one complete Core inspection to the content-minimized validate result.
 * @param inspection The immutable Core inspection result.
 * @returns A frozen validation result without project content or adapter evidence.
 */
export const createMoldeaCliValidateResult = (
  inspection: IProjectInspectionResult,
): IMoldeaCliValidateResult =>
  Object.freeze({
    diagnostics: inspection.diagnostics,
    formatVersion: inspection.formatVersion,
    source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
  });
