import ts from 'typescript';

import {
  getDirectCall,
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import type {
  ILangChainBindingResult,
  ILangChainRelationship,
  ILangChainSourceAnalysis,
} from '../contracts/index.js';

/** Returns an exact supported object-property name. */
export const getLangChainPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

/** Determines whether an object uses JavaScript's non-own `__proto__` setter form. */
export const hasLangChainPrototypeSetter = (object: ts.ObjectLiteralExpression): boolean =>
  object.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      !ts.isComputedPropertyName(property.name) &&
      getLangChainPropertyName(property.name) === '__proto__',
  );

/** Classifies one direct expression against an exact manifest binding. */
export const classifyLangChainDirectBinding = (
  expression: ts.Expression,
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): ILangChainBindingResult => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    const isClosedDifferent =
      ts.isStringLiteral(candidate) ||
      ts.isNoSubstitutionTemplateLiteral(candidate) ||
      ts.isNumericLiteral(candidate) ||
      ts.isObjectLiteralExpression(candidate) ||
      ts.isArrayLiteralExpression(candidate) ||
      ts.isArrowFunction(candidate) ||
      ts.isFunctionExpression(candidate) ||
      ts.isClassExpression(candidate) ||
      candidate.kind === ts.SyntaxKind.NullKeyword ||
      candidate.kind === ts.SyntaxKind.TrueKeyword ||
      candidate.kind === ts.SyntaxKind.FalseKeyword;

    return isClosedDifferent
      ? Object.freeze({ expression: candidate, kind: 'different' })
      : Object.freeze({ kind: 'unresolved' });
  }

  if (isBoundIdentifier(candidate, analysis, reference)) {
    return Object.freeze({ expression: candidate, kind: 'wired' });
  }

  return resolveBindingReferences(candidate, analysis).length > 0
    ? Object.freeze({ expression: candidate, kind: 'different' })
    : Object.freeze({ kind: 'unresolved' });
};

/** Classifies a relationship as absent, unresolved, or directly bound. */
export const classifyLangChainRelationshipBinding = (
  relationship: ILangChainRelationship,
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): ILangChainBindingResult => {
  if (relationship.kind === 'absent') {
    return Object.freeze({ expression: null, kind: 'different' });
  }

  return relationship.kind === 'unresolved'
    ? Object.freeze({ kind: 'unresolved' })
    : classifyLangChainDirectBinding(relationship.expression, analysis, reference);
};

/** Classifies a direct or awaited call to an exact bound loader. */
export const classifyLangChainLoaderCall = (
  expression: ts.Expression,
  analysis: ILangChainSourceAnalysis,
  reference: IRepositoryReference & { readonly symbol: string },
): ILangChainBindingResult => {
  const call = getDirectCall(expression);

  if (call === null) {
    const candidate = unwrapExpression(expression);
    return ts.isStringLiteral(candidate) || ts.isNoSubstitutionTemplateLiteral(candidate)
      ? Object.freeze({ expression: candidate, kind: 'different' })
      : Object.freeze({ kind: 'unresolved' });
  }

  const callee = unwrapExpression(call.expression);

  if (!ts.isIdentifier(callee) || !isModuleBindingVisible(callee, analysis)) {
    return Object.freeze({ kind: 'unresolved' });
  }

  if (isBoundIdentifier(callee, analysis, reference)) {
    return Object.freeze({ expression: call, kind: 'wired' });
  }

  return resolveBindingReferences(callee, analysis).length > 0
    ? Object.freeze({ expression: call, kind: 'different' })
    : Object.freeze({ kind: 'unresolved' });
};
