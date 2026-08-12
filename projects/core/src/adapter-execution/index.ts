import { RepositoryPathException, RepositorySourceException } from '@moldea.ai/repository';

import type { IRuntimeAdapterContext, IRuntimeAdapterEvidence } from '../adapter/index.js';
import type { IMoldeaProjectIndex } from '../contracts/index.js';
import {
  normalizeRuntimeAdapterEvidence,
  validateRuntimeAdapterResult,
  type IRuntimeAdapterOutputCounts,
} from '../adapter-validation/index.js';
import { normalizeDiagnostics } from '../diagnostic-utilities/index.js';
import type { IAdapterDiagnostic } from '../diagnostics/index.js';
import { CoreOperationException } from '../exceptions/index.js';
import { freezeRecursively } from '../immutable/index.js';
import type { ICoreOptionsSnapshot, IRuntimeAdapterSnapshot } from '../options/index.js';
import type { IRepositoryInspectionSession } from '../repository-inspection-session/index.js';

// complete normalized output from every applicable runtime adapter
export interface IRuntimeAdapterInspectionResult {
  readonly evidence: readonly IRuntimeAdapterEvidence[];
  readonly diagnostics: readonly IAdapterDiagnostic[];
}

const isInspectionBoundaryFailure = (error: unknown): boolean => {
  return (
    error instanceof RepositoryPathException ||
    error instanceof RepositorySourceException ||
    (error instanceof CoreOperationException &&
      error.operation === 'inspect-project' &&
      (error.code === 'ABORTED' || error.code === 'RESOURCE_LIMIT_EXCEEDED'))
  );
};

const invokeAdapter = async (
  adapter: IRuntimeAdapterSnapshot,
  project: IMoldeaProjectIndex,
  session: IRepositoryInspectionSession,
  options: ICoreOptionsSnapshot,
  outputCounts: IRuntimeAdapterOutputCounts,
  signal?: AbortSignal,
): Promise<IRuntimeAdapterInspectionResult> => {
  const agents = freezeRecursively(
    project.agents.filter(({ declaration }) => declaration.runtime.id === adapter.id),
  );

  if (agents.length === 0) {
    return freezeRecursively({ diagnostics: [], evidence: [] });
  }

  const context: IRuntimeAdapterContext = Object.freeze({
    agents,
    project,
    repository: session.reader,
    ...(signal === undefined ? {} : { signal }),
  });

  let candidate: unknown;

  try {
    session.throwIfAborted();
    candidate = await adapter.inspect(context);
    session.throwIfAborted();
  } catch (error: unknown) {
    session.throwIfAborted();

    if (isInspectionBoundaryFailure(error)) {
      throw error;
    }

    throw new CoreOperationException({
      adapterId: adapter.id,
      cause: error,
      code: 'ADAPTER_EXECUTION_FAILED',
      operation: 'inspect-project',
    });
  }

  return validateRuntimeAdapterResult(
    candidate,
    {
      adapterId: adapter.id,
      agents,
      limits: options.limits,
      project,
      repository: session.reader,
      ...(signal === undefined ? {} : { signal }),
    },
    outputCounts,
  );
};

/**
 * Invokes every applicable configured adapter in canonical ID order.
 * @param project The complete frozen universal project index.
 * @param session The shared inspection reader, cache, and resource budget.
 * @param options The immutable Core adapter registry and resource limits.
 * @param signal Optional cancellation shared by the complete inspection.
 * @returns A promise resolving to normalized evidence and adapter diagnostics.
 * @throws
 * - INVALID_REPOSITORY_PATH: An adapter repository path is invalid.
 * - ENTRY_NOT_FOUND: A requested repository entry is absent.
 * - ENTRY_NOT_FILE: A requested repository entry is not a regular file.
 * - ENTRY_NOT_DIRECTORY: A requested repository entry is not a directory.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during adapter inspection.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Adapter inspection or a repository operation was aborted.
 * - ADAPTER_EXECUTION_FAILED: An adapter failed or returned an invalid result.
 */
export const inspectRuntimeAdapters = async (
  project: IMoldeaProjectIndex,
  session: IRepositoryInspectionSession,
  options: ICoreOptionsSnapshot,
  signal?: AbortSignal,
): Promise<IRuntimeAdapterInspectionResult> => {
  const evidence: IRuntimeAdapterEvidence[] = [];
  const diagnostics: IAdapterDiagnostic[] = [];
  const outputCounts: IRuntimeAdapterOutputCounts = { diagnostics: 0, evidence: 0 };

  for (const adapter of options.adapters) {
    const result = await invokeAdapter(adapter, project, session, options, outputCounts, signal);
    evidence.push(...result.evidence);
    diagnostics.push(...result.diagnostics);
  }

  return freezeRecursively({
    diagnostics: normalizeDiagnostics(diagnostics),
    evidence: normalizeRuntimeAdapterEvidence(evidence),
  });
};
