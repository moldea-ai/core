import ts from 'typescript';

import type { IStaticAnalysisSource } from '../types.js';
import { isModuleBindingVisible } from './bindings.js';
import { unwrapExpression } from './expressions.js';

const READONLY_ARRAY_METHODS = new Set([
  'at',
  'concat',
  'entries',
  'flat',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'slice',
  'toLocaleString',
  'toReversed',
  'toSpliced',
  'toString',
  'values',
  'with',
]);

const skipTransparentParents = (node: ts.Node): ts.Node => {
  let current = node;

  while (
    ts.isAsExpression(current.parent) ||
    ts.isParenthesizedExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent)
  ) {
    current = current.parent;
  }

  return current;
};

const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

const isAssignmentTarget = (expression: ts.Expression): boolean => {
  let current = skipTransparentParents(expression);

  while (true) {
    const parent = current.parent;

    if (ts.isBinaryExpression(parent) && isAssignmentOperator(parent.operatorToken.kind)) {
      return parent.left === current;
    }

    if (
      (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
      parent.operand === current &&
      (parent.operator === ts.SyntaxKind.PlusPlusToken ||
        parent.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      return true;
    }

    if (ts.isDeleteExpression(parent) && parent.expression === current) {
      return true;
    }

    if (
      (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) &&
      parent.initializer === current
    ) {
      return true;
    }

    if (
      ts.isPropertyAccessExpression(parent) ||
      ts.isElementAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isSpreadAssignment(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isObjectLiteralExpression(parent)
    ) {
      current = skipTransparentParents(parent);
      continue;
    }

    return false;
  }
};

const getStaticMemberName = (
  member: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null => {
  if (ts.isPropertyAccessExpression(member)) {
    return member.name.text;
  }

  const argument = member.argumentExpression;

  return argument !== undefined &&
    (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ? argument.text
    : null;
};

const isSafeArrayMemberUse = (
  member: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): boolean => {
  if (isAssignmentTarget(member)) {
    return false;
  }

  const candidate = skipTransparentParents(member);
  const parent = candidate.parent;

  if (!ts.isCallExpression(parent) || parent.expression !== candidate) {
    return ts.isPropertyAccessExpression(member) && member.name.text === 'length';
  }

  const memberName = getStaticMemberName(member);
  const call = skipTransparentParents(parent);

  return (
    memberName !== null &&
    READONLY_ARRAY_METHODS.has(memberName) &&
    ts.isExpressionStatement(call.parent)
  );
};

const isIgnoredIdentifierPosition = (
  identifier: ts.Identifier,
  declarationName: ts.Identifier | null,
): boolean =>
  identifier === declarationName ||
  ts.isImportSpecifier(identifier.parent) ||
  (ts.isPropertyAssignment(identifier.parent) && identifier.parent.name === identifier) ||
  (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier);

/**
 * Determines whether a module value binding has only explicitly allowed value uses.
 * @param analysis The indexed source containing the binding references.
 * @param bindingName The exact lexically visible module binding name.
 * @param declarationName The optional local declaration identifier to exclude.
 * @param allowedReferences Exact bare identifier occurrences owned by supported relationships.
 * @param kind Whether array read-only member access is permitted for the value.
 * @returns Whether the binding cannot be aliased, escaped, reassigned, or mutated.
 */
export const isModuleValueBindingSafe = (
  analysis: IStaticAnalysisSource,
  bindingName: string,
  declarationName: ts.Identifier | null,
  allowedReferences: ReadonlySet<ts.Identifier>,
  kind: 'array' | 'object',
): boolean => {
  const identifierUses = analysis.identifierUses.get(bindingName) ?? [];

  for (const identifier of identifierUses) {
    if (
      isIgnoredIdentifierPosition(identifier, declarationName) ||
      !isModuleBindingVisible(identifier, analysis)
    ) {
      continue;
    }

    if (allowedReferences.has(identifier)) {
      continue;
    }

    const expression = skipTransparentParents(identifier);
    const parent = expression.parent;
    const member =
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === expression
        ? parent
        : null;

    if (kind !== 'array' || member === null || !isSafeArrayMemberUse(member)) {
      return false;
    }
  }

  return true;
};

/**
 * Determines whether a module-local constant literal has only explicitly allowed value uses.
 * @param analysis The indexed source containing the declaration and its references.
 * @param declaration The module-local constant declaration to inspect.
 * @param allowedReferences Exact bare identifier occurrences owned by supported relationships.
 * @param kind Whether array read-only member access is permitted for the value.
 * @returns Whether the binding cannot be aliased, escaped, reassigned, or mutated.
 */
export const isModuleConstValueSafe = (
  analysis: IStaticAnalysisSource,
  declaration: ts.VariableDeclaration,
  allowedReferences: ReadonlySet<ts.Identifier>,
  kind: 'array' | 'object',
): boolean => {
  if (!ts.isIdentifier(declaration.name)) {
    return false;
  }

  return isModuleValueBindingSafe(
    analysis,
    declaration.name.text,
    declaration.name,
    allowedReferences,
    kind,
  );
};

/**
 * Resolves a direct module-local constant initializer of the requested literal kind.
 * @param expression The relationship expression expected to reference the module constant.
 * @param analysis The indexed source containing the binding.
 * @param allowedReferences Exact supported uses of that binding.
 * @param kind The required literal kind.
 * @returns The literal initializer and declaration, or `null` when unsupported or unsafe.
 */
export function getSafeModuleConstLiteral(
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  allowedReferences: ReadonlySet<ts.Identifier>,
  kind: 'array',
): {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression;
} | null;
export function getSafeModuleConstLiteral(
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  allowedReferences: ReadonlySet<ts.Identifier>,
  kind: 'object',
): {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ObjectLiteralExpression;
} | null;
export function getSafeModuleConstLiteral(
  expression: ts.Expression,
  analysis: IStaticAnalysisSource,
  allowedReferences: ReadonlySet<ts.Identifier>,
  kind: 'array' | 'object',
): {
  readonly declaration: ts.VariableDeclaration;
  readonly expression: ts.ArrayLiteralExpression | ts.ObjectLiteralExpression;
} | null {
  const candidate = unwrapExpression(expression);

  if (!ts.isIdentifier(candidate) || !isModuleBindingVisible(candidate, analysis)) {
    return null;
  }

  const declaration = analysis.moduleConstDeclarations.get(candidate.text);
  const initializer =
    declaration?.initializer === undefined ? null : unwrapExpression(declaration.initializer);
  const isExpectedLiteral =
    initializer !== null &&
    (kind === 'array'
      ? ts.isArrayLiteralExpression(initializer)
      : ts.isObjectLiteralExpression(initializer));

  if (
    declaration === undefined ||
    !isExpectedLiteral ||
    !isModuleConstValueSafe(analysis, declaration, allowedReferences, kind)
  ) {
    return null;
  }

  return Object.freeze({
    declaration,
    expression: initializer as ts.ArrayLiteralExpression | ts.ObjectLiteralExpression,
  });
}
