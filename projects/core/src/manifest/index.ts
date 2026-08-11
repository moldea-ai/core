import { parseRepositoryPath } from '@moldea.ai/repository';

import type { ICoreOptionsSnapshot } from '../options/index.js';
import type {
  IIndexedTextAsset,
  IManifestParseResult,
  ITextDocumentInput,
} from '../contracts/index.js';
import { createCoreDiagnosticCollector } from '../diagnostic-utilities/index.js';
import type { ICoreOperation } from '../exceptions/index.js';
import { isCanonicalManifestPath } from '../format-validation/index.js';
import { freezeRecursively } from '../immutable/index.js';
import { detectSupportedManifestVersion, validateManifest } from '../manifest-validation/index.js';
import { createSourceLocator } from '../source-location/index.js';
import { calculateNormalizedTextDigest, normalizeTextDocument } from '../text/index.js';
import { parseStrictYaml } from '../yaml/index.js';

// richer manifest parse state retained only by repository inspection
export interface IManifestDocumentInspectionResult extends IManifestParseResult {
  readonly formatVersion: 1 | null;
}

/**
 * Inspects one complete manifest while retaining an independently trustworthy supported version.
 * @param input The canonical logical path and exact manifest text or bytes.
 * @param options The immutable Core limits and adapter snapshots.
 * @param operation The owning public or repository-level operation for typed failures.
 * @returns Frozen inspection state with all-or-nothing manifest assets and values.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
export const inspectManifestDocument = async (
  input: ITextDocumentInput,
  options: ICoreOptionsSnapshot,
  operation: Extract<ICoreOperation, 'parse-manifest' | 'inspect-project'> = 'parse-manifest',
): Promise<IManifestDocumentInspectionResult> => {
  const normalized = normalizeTextDocument(input, options.limits, operation, 'maxManifestBytes');
  const path = parseRepositoryPath(input.path);
  const diagnostics = createCoreDiagnosticCollector(options.limits, operation);

  if (!isCanonicalManifestPath(path)) {
    diagnostics.add({ code: 'MOLDEA_MANIFEST_PATH_INVALID', path });
  }

  for (const diagnostic of normalized.diagnostics) {
    diagnostics.add(diagnostic);
  }

  if (!normalized.valid || normalized.text === null) {
    return freezeRecursively({
      asset: null,
      diagnostics: diagnostics.finalize(),
      formatVersion: null,
      manifest: null,
      valid: false,
    });
  }

  const locator = createSourceLocator(normalized.text.value);
  const parsed = parseStrictYaml(normalized.text.value, path, locator, diagnostics);
  const formatVersion = parsed.value === null ? null : detectSupportedManifestVersion(parsed.value);
  const manifest =
    parsed.valid && parsed.value !== null
      ? validateManifest(parsed.value, path, options.adapters, diagnostics)
      : null;

  if (manifest === null || diagnostics.size > 0) {
    return freezeRecursively({
      asset: null,
      diagnostics: diagnostics.finalize(),
      formatVersion,
      manifest: null,
      valid: false,
    });
  }

  const digest = await calculateNormalizedTextDigest(normalized.text);
  const asset: IIndexedTextAsset = {
    content: normalized.text.value,
    digest,
    path,
    scalarLength: normalized.text.scalarLength,
    utf8ByteLength: normalized.text.utf8ByteLength,
  };

  return freezeRecursively({
    asset,
    diagnostics: diagnostics.finalize(),
    formatVersion,
    manifest,
    valid: true,
  });
};

/**
 * Parses and validates one complete version 1 manifest document.
 * @param input The canonical logical path and exact manifest text or bytes.
 * @param options The immutable Core limits and adapter snapshots.
 * @returns A frozen all-or-nothing manifest parse result.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
export const parseManifestDocument = async (
  input: ITextDocumentInput,
  options: ICoreOptionsSnapshot,
): Promise<IManifestParseResult> => {
  const inspection = await inspectManifestDocument(input, options);

  return freezeRecursively({
    asset: inspection.asset,
    diagnostics: inspection.diagnostics,
    manifest: inspection.manifest,
    valid: inspection.valid,
  });
};
