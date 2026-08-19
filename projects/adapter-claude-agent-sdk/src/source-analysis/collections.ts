import ts from 'typescript';

import {
  getSafeModuleConstLiteral,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IClaudeAgentSdkMapEntry,
  IClaudeAgentSdkRelationship,
  IClaudeAgentSdkSourceAnalysis,
} from '../contracts/index.js';

/**
 * Resolves a closed inline or immutable module-local array relationship.
 * @param relationship The relationship containing the array.
 * @param analysis The source containing the relationship.
 * @param allowedReferences Direct supported uses of the module array.
 * @returns Exact elements, `null` when unresolved, or an empty array when absent.
 */
export const getClaudeAgentSdkClosedArray = (
  relationship: IClaudeAgentSdkRelationship,
  analysis: IClaudeAgentSdkSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
): readonly ts.Expression[] | null => {
  if (relationship.kind === 'absent') {
    return [];
  }

  if (relationship.kind !== 'present') {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);
  const moduleArray = ts.isArrayLiteralExpression(candidate)
    ? null
    : getSafeModuleConstLiteral(candidate, analysis, allowedReferences, 'array');
  const array = ts.isArrayLiteralExpression(candidate) ? candidate : moduleArray?.expression;

  if (
    array === undefined ||
    array.elements.some((element) => ts.isOmittedExpression(element) || ts.isSpreadElement(element))
  ) {
    return null;
  }

  return Object.freeze(array.elements.map((element) => unwrapExpression(element)));
};

/**
 * Resolves a closed inline or immutable module-local object relationship.
 * @param relationship The relationship containing the map.
 * @param analysis The source containing the relationship.
 * @param allowedReferences Direct supported uses of the module object.
 * @returns Static direct entries, `null` when unresolved, or an empty array when absent.
 */
export const getClaudeAgentSdkClosedMapEntries = (
  relationship: IClaudeAgentSdkRelationship,
  analysis: IClaudeAgentSdkSourceAnalysis,
  allowedReferences: ReadonlySet<ts.Identifier>,
): readonly IClaudeAgentSdkMapEntry[] | null => {
  if (relationship.kind === 'absent') {
    return [];
  }

  if (relationship.kind !== 'present') {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);
  const moduleObject = ts.isObjectLiteralExpression(candidate)
    ? null
    : getSafeModuleConstLiteral(candidate, analysis, allowedReferences, 'object');
  const object = ts.isObjectLiteralExpression(candidate) ? candidate : moduleObject?.expression;

  if (object === undefined) {
    return null;
  }

  const entries: IClaudeAgentSdkMapEntry[] = [];
  const names = new Set<string>();

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return null;
    }

    const name =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : ts.isComputedPropertyName(property.name)
          ? null
          : undefined;

    if (name === undefined || (name !== null && names.has(name))) {
      return null;
    }

    if (name !== null) {
      names.add(name);
    }
    entries.push(
      Object.freeze({
        keyExpression: ts.isComputedPropertyName(property.name)
          ? property.name.expression
          : property.name,
        name,
        value: unwrapExpression(property.initializer),
      }),
    );
  }

  return Object.freeze(entries);
};

/**
 * Determines whether an identifier resolves to one exact expected source reference.
 * @param expression The map or collection element.
 * @param analysis The source containing the element.
 * @param path The expected source path.
 * @param symbol The expected exported symbol.
 * @returns Whether the exact binding is established.
 */
export const isClaudeAgentSdkBoundReference = (
  expression: ts.Expression,
  analysis: IClaudeAgentSdkSourceAnalysis,
  path: string,
  symbol: string,
): boolean => {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return false;
  }

  return resolveBindingReferences(candidate, analysis).some(
    (reference) => reference.path === path && reference.symbol === symbol,
  );
};
