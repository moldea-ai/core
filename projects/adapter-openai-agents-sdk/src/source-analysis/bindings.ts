import ts from 'typescript';

import {
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

/**
 * Classifies a direct relationship to one explicitly bound runtime symbol.
 * @param relationship The supported configuration relationship.
 * @param analysis The source containing the relationship.
 * @param reference The exact manifest binding.
 * @returns `true` for a match, `false` for proved absence, or `null` when unresolved.
 */
export const classifyOpenAiAgentsSdkDirectBinding = (
  relationship: IOpenAiAgentsSdkRelationship,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  reference: IRepositoryReference,
): boolean | null => {
  if (relationship.kind === 'absent') {
    return false;
  }

  if (relationship.kind === 'unresolved' || reference.symbol === undefined) {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return ts.isStringLiteral(candidate) ||
      ts.isNoSubstitutionTemplateLiteral(candidate) ||
      ts.isNumericLiteral(candidate) ||
      ts.isObjectLiteralExpression(candidate) ||
      ts.isArrayLiteralExpression(candidate) ||
      ts.isArrowFunction(candidate) ||
      ts.isFunctionExpression(candidate) ||
      ts.isClassExpression(candidate) ||
      candidate.kind === ts.SyntaxKind.NullKeyword ||
      candidate.kind === ts.SyntaxKind.TrueKeyword ||
      candidate.kind === ts.SyntaxKind.FalseKeyword
      ? false
      : null;
  }

  if (isBoundIdentifier(candidate, analysis, reference)) {
    return true;
  }

  return resolveBindingReferences(candidate, analysis).length > 0 ? false : null;
};
