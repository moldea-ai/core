import type { IRepositoryPath } from '@moldea.ai/repository';

import { escapeJsonPointerSegment, type ICoreDiagnosticCollector } from './diagnostic-utilities.js';
import type { IDiagnosticEntity, ISourceRange } from './diagnostics.js';
import { compareExactStrings, hasNonWhitespace } from './format-validation.js';
import type { IDecisionStatus, IParsedDecision } from './format.js';
import type { ISourceLocator } from './source-location.js';
import type { IYamlNode } from './yaml.js';

interface IDecisionValidationContext {
  readonly decisionId: string | null;
  readonly diagnostics: ICoreDiagnosticCollector;
  readonly path: IRepositoryPath;
}

const DECISION_STATUSES = new Set<IDecisionStatus>([
  'accepted',
  'proposed',
  'rejected',
  'superseded',
]);
const DECISION_ID_PATTERN = /^\d{13}$/u;
const CREATED_AT_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const getEntity = (decisionId: string | null): IDiagnosticEntity | null => {
  return decisionId === null ? null : { decisionId };
};

const addInvalidFrontmatter = (
  context: IDecisionValidationContext,
  range: ISourceRange | null,
  reason: string,
  pointer: string | null = null,
): void => {
  context.diagnostics.add({
    code: 'MOLDEA_DECISION_FRONTMATTER_INVALID',
    details: { reason },
    entity: getEntity(context.decisionId),
    path: context.path,
    pointer,
    range,
  });
};

const isCanonicalCreatedAt = (value: string): boolean => {
  if (!CREATED_AT_PATTERN.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const readMapping = (
  node: IYamlNode,
  context: IDecisionValidationContext,
): ReadonlyMap<string, IYamlNode> | null => {
  if (node.kind !== 'mapping') {
    addInvalidFrontmatter(context, node.range, 'mapping-required');
    return null;
  }

  const entries = new Map<string, IYamlNode>();

  for (const entry of node.entries) {
    if (entry.key.kind !== 'scalar' || typeof entry.key.value !== 'string') {
      addInvalidFrontmatter(context, entry.key.range, 'string-key-required');
      continue;
    }

    const key = entry.key.value;

    if (key !== 'status' && key !== 'createdAt' && key !== 'supersedes') {
      context.diagnostics.add({
        code: 'MOLDEA_DECISION_PROPERTY_UNKNOWN',
        entity: getEntity(context.decisionId),
        path: context.path,
        pointer: `/${escapeJsonPointerSegment(key)}`,
        range: entry.key.range,
      });
      continue;
    }

    entries.set(key, entry.value);
  }

  return entries;
};

const readStatus = (
  node: IYamlNode | undefined,
  context: IDecisionValidationContext,
): IDecisionStatus | null => {
  if (
    node?.kind !== 'scalar' ||
    typeof node.value !== 'string' ||
    !DECISION_STATUSES.has(node.value as IDecisionStatus)
  ) {
    context.diagnostics.add({
      code: 'MOLDEA_DECISION_STATUS_INVALID',
      entity: getEntity(context.decisionId),
      path: context.path,
      pointer: '/status',
      range: node?.range ?? null,
    });
    return null;
  }

  return node.value as IDecisionStatus;
};

const readCreatedAt = (
  node: IYamlNode | undefined,
  context: IDecisionValidationContext,
): string | null => {
  if (
    node?.kind !== 'scalar' ||
    typeof node.value !== 'string' ||
    !isCanonicalCreatedAt(node.value)
  ) {
    context.diagnostics.add({
      code: 'MOLDEA_DECISION_CREATED_AT_INVALID',
      entity: getEntity(context.decisionId),
      path: context.path,
      pointer: '/createdAt',
      range: node?.range ?? null,
    });
    return null;
  }

  if (context.decisionId !== null && Date.parse(node.value) !== Number(context.decisionId)) {
    context.diagnostics.add({
      code: 'MOLDEA_DECISION_TIMESTAMP_MISMATCH',
      entity: getEntity(context.decisionId),
      path: context.path,
      pointer: '/createdAt',
      range: node.range,
    });
  }

  return node.value;
};

const readSupersedes = (
  node: IYamlNode | undefined,
  context: IDecisionValidationContext,
): readonly string[] | null => {
  if (node === undefined) {
    return [];
  }

  if (node.kind !== 'sequence' || node.items.length === 0) {
    addInvalidFrontmatter(
      context,
      node.range,
      'non-empty-supersedes-sequence-required',
      '/supersedes',
    );
    return null;
  }

  const supersedes: string[] = [];
  const seen = new Set<string>();

  node.items.forEach((item, index) => {
    const pointer = `/supersedes/${index}`;

    if (
      item.kind !== 'scalar' ||
      typeof item.value !== 'string' ||
      !DECISION_ID_PATTERN.test(item.value)
    ) {
      addInvalidFrontmatter(context, item.range, 'decision-id-string-required', pointer);
      return;
    }

    if (seen.has(item.value)) {
      context.diagnostics.add({
        code: 'MOLDEA_ID_DUPLICATE',
        entity: getEntity(context.decisionId),
        path: context.path,
        pointer,
        range: item.range,
      });
      return;
    }

    seen.add(item.value);
    supersedes.push(item.value);

    if (item.value === context.decisionId) {
      context.diagnostics.add({
        code: 'MOLDEA_DECISION_SELF_SUPERSESSION',
        entity: getEntity(context.decisionId),
        path: context.path,
        pointer,
        range: item.range,
      });
    }
  });

  return supersedes.sort(compareExactStrings);
};

/**
 * Locates exact decision frontmatter delimiters and preserves the complete Markdown body.
 * @param value The complete normalized decision document.
 * @param locator The full-document scalar-aware source locator.
 * @param context The decision diagnostic context.
 * @returns The YAML prefix and exact body, or `null` when delimiters are unavailable.
 */
export const extractDecisionSections = (
  value: string,
  locator: ISourceLocator,
  context: IDecisionValidationContext,
): { readonly body: string; readonly bodyRange: ISourceRange; readonly yaml: string } | null => {
  const firstLineEnd = value.indexOf('\n');
  const openingLineEnd = firstLineEnd === -1 ? value.length : firstLineEnd;

  if (value.slice(0, openingLineEnd) !== '---') {
    context.diagnostics.add({
      code: 'MOLDEA_DECISION_FRONTMATTER_MISSING',
      entity: getEntity(context.decisionId),
      path: context.path,
      range: locator.locateRange(0, openingLineEnd),
    });
    return null;
  }

  let lineStart = firstLineEnd === -1 ? value.length : firstLineEnd + 1;

  while (lineStart <= value.length) {
    const nextLineBreak = value.indexOf('\n', lineStart);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;

    if (value.slice(lineStart, lineEnd) === '---') {
      const bodyStart = nextLineBreak === -1 ? lineEnd : nextLineBreak + 1;

      return {
        body: value.slice(bodyStart),
        bodyRange: locator.locateRange(bodyStart, value.length),
        yaml: value.slice(0, lineStart),
      };
    }

    if (nextLineBreak === -1) {
      break;
    }

    lineStart = nextLineBreak + 1;
  }

  context.diagnostics.add({
    code: 'MOLDEA_DECISION_FRONTMATTER_MISSING',
    entity: getEntity(context.decisionId),
    path: context.path,
    range: locator.locateRange(value.length, value.length),
  });
  return null;
};

/**
 * Validates one parsed decision-frontmatter mapping without resolving other files.
 * @param node The strict parser-neutral YAML root.
 * @param context The decision diagnostic context.
 * @returns Canonical decision metadata when every document-level rule is valid.
 */
export const validateDecisionFrontmatter = (
  node: IYamlNode,
  context: IDecisionValidationContext,
): Pick<IParsedDecision, 'createdAt' | 'status' | 'supersedes'> | null => {
  const initialDiagnosticCount = context.diagnostics.size;
  const entries = readMapping(node, context);

  if (entries === null) {
    return null;
  }

  const status = readStatus(entries.get('status'), context);
  const createdAt = readCreatedAt(entries.get('createdAt'), context);
  const supersedes = readSupersedes(entries.get('supersedes'), context);

  if (
    status === null ||
    createdAt === null ||
    supersedes === null ||
    context.diagnostics.size > initialDiagnosticCount
  ) {
    return null;
  }

  return { createdAt, status, supersedes };
};

/** Adds the decision-body diagnostic when the preserved Markdown has no content. */
export const validateDecisionBody = (
  body: string,
  range: ISourceRange,
  context: IDecisionValidationContext,
): boolean => {
  if (hasNonWhitespace(body)) {
    return true;
  }

  context.diagnostics.add({
    code: 'MOLDEA_DECISION_BODY_EMPTY',
    entity: getEntity(context.decisionId),
    path: context.path,
    range,
  });
  return false;
};
