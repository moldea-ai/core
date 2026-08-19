import ts from 'typescript';

import {
  getSafeModuleConstLiteral,
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import type {
  IOpenAiAgentsSdkRelationship,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';

const getClosedToolArray = (
  relationship: IOpenAiAgentsSdkRelationship,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  allowedCollectionReferences: ReadonlySet<ts.Identifier>,
): readonly ts.Expression[] | null => {
  if (relationship.kind !== 'present') {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);
  const moduleArray = ts.isArrayLiteralExpression(candidate)
    ? null
    : getSafeModuleConstLiteral(candidate, analysis, allowedCollectionReferences, 'array');
  const array = ts.isArrayLiteralExpression(candidate) ? candidate : moduleArray?.expression;

  if (
    array === undefined ||
    array.elements.some((element) => ts.isOmittedExpression(element) || ts.isSpreadElement(element))
  ) {
    return null;
  }

  return array.elements.map((element) => unwrapExpression(element));
};

/**
 * Collects module-array references that are direct supported Agent tool relationships.
 * @param relationships Agent tool relationships in one source module.
 * @returns Bare collection identifiers allowed to share one immutable module array.
 */
export const collectOpenAiAgentsSdkToolCollectionReferences = (
  relationships: readonly IOpenAiAgentsSdkRelationship[],
): ReadonlySet<ts.Identifier> =>
  new Set(
    relationships.flatMap((relationship) => {
      if (relationship.kind !== 'present') {
        return [];
      }

      const candidate = unwrapExpression(relationship.expression);
      return ts.isIdentifier(candidate) ? [candidate] : [];
    }),
  );

/**
 * Classifies whether one declared function tool appears in a closed Agent tools collection.
 * @param relationship The Agent tools relationship.
 * @param analysis The Agent source analysis.
 * @param reference The exact declared tool registration binding.
 * @param allowedCollectionReferences All supported references to shared module arrays.
 * @returns `true` for registered, `false` for proved absence, or `null` when unresolved.
 */
export const classifyOpenAiAgentsSdkToolRegistration = (
  relationship: IOpenAiAgentsSdkRelationship,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  reference: IRepositoryReference,
  allowedCollectionReferences: ReadonlySet<ts.Identifier>,
): boolean | null => {
  if (relationship.kind === 'absent') {
    return false;
  }

  if (relationship.kind === 'unresolved' || reference.symbol === undefined) {
    return null;
  }

  const elements = getClosedToolArray(relationship, analysis, allowedCollectionReferences);

  if (elements === null) {
    return null;
  }

  let hasUnresolvedElement = false;

  for (const element of elements) {
    if (!ts.isIdentifier(element) || !isModuleBindingVisible(element, analysis)) {
      hasUnresolvedElement = true;
      continue;
    }

    if (isBoundIdentifier(element, analysis, reference)) {
      return true;
    }

    if (resolveBindingReferences(element, analysis).length === 0) {
      hasUnresolvedElement = true;
    }
  }

  return hasUnresolvedElement ? null : false;
};

/**
 * Returns identifier elements from one supported tools collection.
 * @param relationship The Agent tools relationship.
 * @param analysis The source containing the collection.
 * @param allowedCollectionReferences All supported references to shared module arrays.
 * @returns Direct identifier elements or an empty collection for unsupported forms.
 */
export const getOpenAiAgentsSdkToolElements = (
  relationship: IOpenAiAgentsSdkRelationship,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  allowedCollectionReferences: ReadonlySet<ts.Identifier>,
): readonly ts.Identifier[] =>
  (getClosedToolArray(relationship, analysis, allowedCollectionReferences) ?? []).filter(
    (element): element is ts.Identifier => ts.isIdentifier(element),
  );
