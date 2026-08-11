import { parseRepositoryPath } from '@moldea.ai/repository';

import type {
  IDecisionParseResult,
  IIndexedTextAsset,
  ITextDocumentInput,
} from '../contracts/index.js';
import {
  extractDecisionSections,
  validateDecisionBody,
  validateDecisionFrontmatter,
} from '../decision-validation/index.js';
import { createCoreDiagnosticCollector } from '../diagnostic-utilities/index.js';
import type { ICoreOperation } from '../exceptions/index.js';
import { parseDecisionIdFromPath } from '../format-validation/index.js';
import { freezeRecursively } from '../immutable/index.js';
import type { ICoreOptionsSnapshot } from '../options/index.js';
import { createSourceLocator } from '../source-location/index.js';
import { calculateNormalizedTextDigest, normalizeTextDocument } from '../text/index.js';
import { parseStrictYaml } from '../yaml/index.js';

/**
 * Parses and validates one complete decision document without resolving cross-file relationships.
 * @param input The canonical logical path and exact decision text or bytes.
 * @param options The immutable Core limits and adapter snapshots.
 * @param operation The owning public or repository-level operation for typed failures.
 * @returns A frozen all-or-nothing decision parse result.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_ARGUMENT: The Core operation received an invalid argument.
 * - RESOURCE_LIMIT_EXCEEDED: A Core resource limit was exceeded.
 */
export const parseDecisionDocument = async (
  input: ITextDocumentInput,
  options: ICoreOptionsSnapshot,
  operation: Extract<ICoreOperation, 'parse-decision' | 'inspect-project'> = 'parse-decision',
): Promise<IDecisionParseResult> => {
  const normalized = normalizeTextDocument(input, options.limits, operation);
  const path = parseRepositoryPath(input.path);
  const diagnostics = createCoreDiagnosticCollector(options.limits, operation);
  const decisionId = parseDecisionIdFromPath(path);

  if (decisionId === null) {
    diagnostics.add({ code: 'MOLDEA_DECISION_FILENAME_INVALID', path });
  }

  for (const diagnostic of normalized.diagnostics) {
    diagnostics.add(diagnostic);
  }

  if (!normalized.valid || normalized.text === null) {
    return freezeRecursively({
      decision: null,
      diagnostics: diagnostics.finalize(),
      valid: false,
    });
  }

  const context = { decisionId, diagnostics, path };
  const locator = createSourceLocator(normalized.text.value);
  const sections = extractDecisionSections(normalized.text.value, locator, context);
  let metadata: ReturnType<typeof validateDecisionFrontmatter> = null;

  if (sections !== null) {
    validateDecisionBody(sections.body, sections.bodyRange, context);
    const parsed = parseStrictYaml(sections.yaml, path, locator, diagnostics);

    if (parsed.valid && parsed.value !== null) {
      metadata = validateDecisionFrontmatter(parsed.value, context);
    }
  }

  if (decisionId === null || sections === null || metadata === null || diagnostics.size > 0) {
    return freezeRecursively({
      decision: null,
      diagnostics: diagnostics.finalize(),
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
    decision: {
      asset,
      body: sections.body,
      createdAt: metadata.createdAt,
      id: decisionId,
      path,
      status: metadata.status,
      supersedes: metadata.supersedes,
    },
    diagnostics: diagnostics.finalize(),
    valid: true,
  });
};
