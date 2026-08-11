import type { IRepositoryReader } from '@moldea.ai/repository';

import { inspectFrameworkAdapters } from '../adapter-execution/index.js';
import type { IProjectInspectionInput, IProjectInspectionResult } from '../contracts/index.js';
import { CoreOperationException } from '../exceptions/index.js';
import { freezeRecursively } from '../immutable/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';
import { createRepositoryInspectionSession } from '../repository-inspection-session/index.js';
import { inspectUniversalProject } from '../universal-project-inspection/index.js';

interface IValidatedProjectInspectionInput {
  readonly repository: IRepositoryReader;
  readonly signal?: AbortSignal;
}

const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> => {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
};

const invalidArgument = (): never => {
  throw new CoreOperationException({
    code: 'INVALID_ARGUMENT',
    operation: 'inspect-project',
    retryable: false,
  });
};

const isRepositoryReader = (candidate: unknown): candidate is IRepositoryReader => {
  return (
    isRecord(candidate) &&
    typeof candidate['getEntry'] === 'function' &&
    typeof candidate['listEntries'] === 'function' &&
    typeof candidate['readFile'] === 'function'
  );
};

const isAbortSignal = (candidate: unknown): candidate is AbortSignal => {
  return (
    isRecord(candidate) &&
    typeof candidate['aborted'] === 'boolean' &&
    typeof candidate['addEventListener'] === 'function' &&
    typeof candidate['removeEventListener'] === 'function'
  );
};

const validateInput = (candidate: unknown): IValidatedProjectInspectionInput => {
  try {
    if (!isRecord(candidate)) {
      return invalidArgument();
    }

    const repository = candidate['repository'];
    const signal = candidate['signal'];

    if (!isRepositoryReader(repository) || (signal !== undefined && !isAbortSignal(signal))) {
      return invalidArgument();
    }

    return {
      repository,
      ...(signal === undefined ? {} : { signal }),
    };
  } catch (error: unknown) {
    if (error instanceof CoreOperationException) {
      throw error;
    }

    return invalidArgument();
  }
};

/**
 * Inspects one coherent repository snapshot through universal and adapter validation.
 * @param input The untrusted source-neutral reader and optional cancellation signal.
 * @param options The immutable Core configuration snapshot.
 * @returns A promise resolving to the frozen all-or-nothing project inspection result.
 * @throws
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
 * - ADAPTER_EXECUTION_FAILED: A framework adapter failed or returned an invalid result.
 */
export const inspectProject = async (
  input: IProjectInspectionInput,
  options: ICoreOptionsSnapshot,
): Promise<IProjectInspectionResult> => {
  const validatedInput = validateInput(input);
  const session = createRepositoryInspectionSession(
    validatedInput.repository,
    options.limits,
    validatedInput.signal,
  );
  const universal = await inspectUniversalProject(
    {
      session,
      ...(validatedInput.signal === undefined ? {} : { signal: validatedInput.signal }),
    },
    options,
  );

  if (universal.project === null) {
    return freezeRecursively({
      diagnostics: universal.diagnostics,
      evidence: [],
      formatVersion: universal.formatVersion,
      project: null,
      valid: false,
    });
  }

  const adapterInspection = await inspectFrameworkAdapters(
    universal.project,
    session,
    options,
    validatedInput.signal,
  );
  const valid = adapterInspection.diagnostics.length === 0;

  return freezeRecursively({
    diagnostics: adapterInspection.diagnostics,
    evidence: adapterInspection.evidence,
    formatVersion: universal.formatVersion,
    project: valid ? universal.project : null,
    valid,
  });
};
