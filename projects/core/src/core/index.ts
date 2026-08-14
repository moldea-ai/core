import type {
  ICore,
  ICoreOptions,
  IProjectInspectionInput,
  ITextDocumentInput,
} from '../contracts/index.js';
import { parseDecisionDocument } from '../decision/index.js';
import { freezeRecursively } from '../immutable/index.js';
import { parseManifestDocument } from '../manifest/index.js';
import { createCoreOperationOptionsSnapshot, normalizeCoreOptions } from '../options/index.js';
import { inspectProject } from '../project-inspection/index.js';
import { calculateContentDigest, normalizeTextDocument } from '../text/index.js';

/**
 * Creates one immutable Core instance from detached configuration snapshots.
 * @param options Optional runtime adapters and resource-limit overrides.
 * @returns A frozen Core instance safe for concurrent independent operations.
 * @throws
 * - DUPLICATE_ADAPTER_ID: A runtime adapter ID is registered more than once.
 * - RESERVED_ADAPTER_ID: A reserved runtime adapter ID was supplied.
 * - INVALID_ADAPTER_DEFINITION: A runtime adapter definition is invalid.
 * - INVALID_RESOURCE_LIMIT: A Core resource limit is invalid.
 */
export const createCore = (options?: ICoreOptions): ICore => {
  const snapshot = normalizeCoreOptions(options);

  return freezeRecursively({
    calculateContentDigest: (input: ITextDocumentInput) => {
      const operation = createCoreOperationOptionsSnapshot(snapshot);
      return calculateContentDigest(input, operation.limits);
    },
    inspectProject: (input: IProjectInspectionInput) =>
      inspectProject(input, createCoreOperationOptionsSnapshot(snapshot)),
    normalizeText: (input: ITextDocumentInput) => {
      const operation = createCoreOperationOptionsSnapshot(snapshot);
      return normalizeTextDocument(input, operation.limits, 'normalize-text');
    },
    parseDecision: (input: ITextDocumentInput) =>
      parseDecisionDocument(input, createCoreOperationOptionsSnapshot(snapshot)),
    parseManifest: (input: ITextDocumentInput) =>
      parseManifestDocument(input, createCoreOperationOptionsSnapshot(snapshot)),
  });
};
