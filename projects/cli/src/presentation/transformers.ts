import type { IProjectInspectionResult } from '@moldea.ai/core';

import { MOLDEA_CLI_GIT_WORKING_TREE_SOURCE } from './constants.js';
import type { IMoldeaCliInspectResult, IMoldeaCliValidateResult } from './types.js';

/** Rejects a Core result whose completion fields contradict its validity. */
const assertProjectInspectionInvariant = (inspection: IProjectInspectionResult): void => {
  const hasDiagnostics = inspection.diagnostics.length > 0;
  const hasProject = inspection.project !== null;
  const isConsistent = inspection.valid
    ? hasProject && !hasDiagnostics
    : !hasProject && hasDiagnostics;

  if (!isConsistent) {
    throw new TypeError('The Core inspection result is internally inconsistent.');
  }
};

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

/**
 * Pairs one complete Core inspection with its non-confidential source descriptor.
 * @param inspection The immutable Core inspection result.
 * @returns A frozen result preserving the exact complete Core inspection.
 * @throws If the Core result contradicts its valid, project, and diagnostic invariants.
 */
export const createMoldeaCliInspectResult = (
  inspection: IProjectInspectionResult,
): IMoldeaCliInspectResult => {
  assertProjectInspectionInvariant(inspection);

  return Object.freeze({
    inspection,
    source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
  });
};
