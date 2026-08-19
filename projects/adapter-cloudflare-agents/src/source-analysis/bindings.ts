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
  ICloudflareAgentsRelationship,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';

/** Returns an exact supported object or class member name. */
export const getCloudflareAgentsPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

/** Determines whether an object uses JavaScript's non-own `__proto__` setter form. */
export const hasCloudflareAgentsPrototypeSetter = (object: ts.ObjectLiteralExpression): boolean =>
  object.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      !ts.isComputedPropertyName(property.name) &&
      getCloudflareAgentsPropertyName(property.name) === '__proto__',
  );

/** Classifies exact fields in one closed or partially unrelated object literal. */
export const analyzeCloudflareAgentsObjectRelationships = <TName extends string>(
  object: ts.ObjectLiteralExpression,
  names: readonly TName[],
): Record<TName, ICloudflareAgentsRelationship> => {
  const relationships = Object.fromEntries(
    names.map((name) => [name, { kind: 'absent' }]),
  ) as Record<TName, ICloudflareAgentsRelationship>;
  const relationshipNames = new Set<string>(names);
  const markAllUnresolved = (): void => {
    for (const name of names) {
      relationships[name] = { kind: 'unresolved' };
    }
  };

  if (hasCloudflareAgentsPrototypeSetter(object)) {
    markAllUnresolved();
    return relationships;
  }

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      markAllUnresolved();
      continue;
    }

    const propertyName = getCloudflareAgentsPropertyName(property.name);

    if (propertyName === null || !relationshipNames.has(propertyName)) {
      continue;
    }

    const name = propertyName as TName;

    if (relationships[name].kind !== 'absent') {
      relationships[name] = { kind: 'unresolved' };
    } else if (ts.isPropertyAssignment(property)) {
      relationships[name] = { expression: unwrapExpression(property.initializer), kind: 'present' };
    } else if (ts.isShorthandPropertyAssignment(property)) {
      relationships[name] = { expression: property.name, kind: 'present' };
    } else {
      relationships[name] = { kind: 'unresolved' };
    }
  }

  return relationships;
};

/** Classifies a direct relationship to one explicitly bound runtime symbol. */
export const classifyCloudflareAgentsDirectBinding = (
  relationship: ICloudflareAgentsRelationship,
  analysis: ICloudflareAgentsSourceAnalysis,
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

/** Classifies a required direct or awaited instruction-loader call. */
export const classifyCloudflareAgentsInstructionLoader = (
  relationship: ICloudflareAgentsRelationship,
  analysis: ICloudflareAgentsSourceAnalysis,
  reference: IRepositoryReference,
): boolean | null => {
  if (relationship.kind === 'absent') {
    return false;
  }

  if (relationship.kind === 'unresolved' || reference.symbol === undefined) {
    return null;
  }

  const call = getDirectCall(relationship.expression);

  if (call === null) {
    return ts.isStringLiteral(unwrapExpression(relationship.expression)) ? false : null;
  }

  const callee = unwrapExpression(call.expression);

  if (!ts.isIdentifier(callee) || !isModuleBindingVisible(callee, analysis)) {
    return null;
  }

  if (isBoundIdentifier(callee, analysis, reference)) {
    return true;
  }

  return resolveBindingReferences(callee, analysis).length > 0 ? false : null;
};
