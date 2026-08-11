import type {
  ICore,
  ICoreOptions,
  IProjectInspectionInput,
  ITextDocumentInput,
} from '../contracts/index.js';
import { parseDecisionDocument } from '../decision/index.js';
import { freezeRecursively } from '../immutable/index.js';
import { parseManifestDocument } from '../manifest/index.js';
import { normalizeCoreOptions } from '../options/index.js';
import { inspectProject } from '../project-inspection/index.js';
import { calculateContentDigest, normalizeTextDocument } from '../text/index.js';

/**
 * Creates one immutable Core instance from detached configuration snapshots.
 * @param options Optional framework adapters and resource-limit overrides.
 * @returns A frozen Core instance safe for concurrent independent operations.
 * @throws
 * - DUPLICATE_ADAPTER_ID: A framework adapter ID is registered more than once.
 * - RESERVED_ADAPTER_ID: A reserved framework adapter ID was supplied.
 * - INVALID_ADAPTER_DEFINITION: A framework adapter definition is invalid.
 * - INVALID_RESOURCE_LIMIT: A Core resource limit is invalid.
 */
export const createCore = (options?: ICoreOptions): ICore => {
  const snapshot = normalizeCoreOptions(options);

  return freezeRecursively({
    calculateContentDigest: (input: ITextDocumentInput) =>
      calculateContentDigest(input, snapshot.limits),
    inspectProject: (input: IProjectInspectionInput) => inspectProject(input, snapshot),
    normalizeText: (input: ITextDocumentInput) =>
      normalizeTextDocument(input, snapshot.limits, 'normalize-text'),
    parseDecision: (input: ITextDocumentInput) => parseDecisionDocument(input, snapshot),
    parseManifest: (input: ITextDocumentInput) => parseManifestDocument(input, snapshot),
  });
};
