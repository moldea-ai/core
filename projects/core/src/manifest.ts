import { parseRepositoryPath } from '@moldea.ai/repository';

import type { ICoreOptionsSnapshot } from './options.js';
import type { IIndexedTextAsset, IManifestParseResult, ITextDocumentInput } from './contracts.js';
import { createCoreDiagnosticCollector } from './diagnostic-utilities.js';
import { isCanonicalManifestPath } from './format-validation.js';
import { freezeRecursively } from './immutable.js';
import { validateManifest } from './manifest-validation.js';
import { createSourceLocator } from './source-location.js';
import { calculateNormalizedTextDigest, normalizeTextDocument } from './text.js';
import { parseStrictYaml } from './yaml.js';

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
  const normalized = normalizeTextDocument(
    input,
    options.limits,
    'parse-manifest',
    'maxManifestBytes',
  );
  const path = parseRepositoryPath(input.path);
  const diagnostics = createCoreDiagnosticCollector(options.limits, 'parse-manifest');

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
      manifest: null,
      valid: false,
    });
  }

  const locator = createSourceLocator(normalized.text.value);
  const parsed = parseStrictYaml(normalized.text.value, path, locator, diagnostics);
  const manifest =
    parsed.valid && parsed.value !== null
      ? validateManifest(parsed.value, path, options.adapters, diagnostics)
      : null;

  if (manifest === null || diagnostics.size > 0) {
    return freezeRecursively({
      asset: null,
      diagnostics: diagnostics.finalize(),
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
    manifest,
    valid: true,
  });
};
