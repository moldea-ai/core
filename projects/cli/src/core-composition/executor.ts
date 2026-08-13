import { createCore } from '@moldea.ai/core';
import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import { ACTIVE_RUNTIME_ADAPTERS } from './constants.js';
import type { IMoldeaCliCoreFactory, IMoldeaCliCoreInspectionExecutor } from './types.js';

const compareAdapterIds = (left: IRuntimeAdapter, right: IRuntimeAdapter): number => {
  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
};

/**
 * Creates the private attempt-local Core composition boundary.
 * @param coreFactory The immutable Core construction boundary.
 * @param activeAdapters The package-backed adapters active in this CLI release.
 * @returns An executor that creates and runs a fresh Core instance per snapshot attempt.
 */
export const createMoldeaCliCoreInspectionExecutor = (
  coreFactory: IMoldeaCliCoreFactory = createCore,
  activeAdapters: readonly IRuntimeAdapter[] = ACTIVE_RUNTIME_ADAPTERS,
): IMoldeaCliCoreInspectionExecutor => {
  const normalizedAdapters = Object.freeze([...activeAdapters].sort(compareAdapterIds));

  return async (input) => {
    const core = coreFactory({
      adapters: normalizedAdapters,
      limits: Object.freeze({
        maxDiagnostics: input.resourceLimits.maxDiagnostics,
        maxEntries: input.resourceLimits.maxEntries,
        maxEvidence: input.resourceLimits.maxEvidence,
        maxFileBytes: input.resourceLimits.maxFileBytes,
        maxManifestBytes: input.resourceLimits.maxManifestBytes,
        maxTotalBytesRead: input.resourceLimits.maxTotalBytes,
      }),
    });

    return core.inspectProject({ repository: input.repository });
  };
};

/**
 * Executes one project inspection through a fresh CLI-configured Core instance.
 * @returns A promise resolving to Core's complete immutable inspection result.
 * @throws
 * - DUPLICATE_ADAPTER_ID: A runtime adapter ID is registered more than once.
 * - RESERVED_ADAPTER_ID: A reserved runtime adapter ID was supplied.
 * - INVALID_ADAPTER_DEFINITION: A runtime adapter definition is invalid.
 * - INVALID_RESOURCE_LIMIT: A Core resource limit is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - INVALID_REPOSITORY_PATH: A repository path is invalid.
 * - ENTRY_NOT_FOUND: A discovered file disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: A discovered file changed type during inspection.
 * - ENTRY_NOT_DIRECTORY: A discovered directory changed type during inspection.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during inspection.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Project inspection or a repository operation was aborted.
 * - ADAPTER_EXECUTION_FAILED: A runtime adapter failed or returned an invalid result.
 */
export const executeMoldeaCliCoreInspection = createMoldeaCliCoreInspectionExecutor();
