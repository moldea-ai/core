import ts from 'typescript';

import type {
  IStaticAnalysisModuleValueSource,
  IStaticAnalysisMutationAnalysis,
} from '../types.js';
import { isModuleBindingVisible } from './bindings.js';
import { unwrapExpression } from './expressions.js';

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

const isMutatingTarget = (expression: ts.Expression): boolean => {
  const candidate = skipTransparentParents(expression);
  const parent = candidate.parent;

  return (
    (ts.isBinaryExpression(parent) &&
      parent.left === candidate &&
      isAssignmentOperator(parent.operatorToken.kind)) ||
    ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
      parent.operand === candidate &&
      (parent.operator === ts.SyntaxKind.PlusPlusToken ||
        parent.operator === ts.SyntaxKind.MinusMinusToken)) ||
    (ts.isDeleteExpression(parent) && parent.expression === candidate) ||
    ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) &&
      parent.initializer === candidate)
  );
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

const isIgnoredIdentifier = (identifier: ts.Identifier, declarationName: ts.Identifier): boolean =>
  identifier === declarationName ||
  ts.isImportSpecifier(identifier.parent) ||
  (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier) ||
  (ts.isPropertyAssignment(identifier.parent) && identifier.parent.name === identifier);

const addObjectAssignmentMembers = (
  object: ts.ObjectLiteralExpression,
  mutatedMembers: Set<string>,
): boolean => {
  let hasUnknownMutation = false;

  for (const property of object.properties) {
    if (
      (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) ||
      ts.isComputedPropertyName(property.name)
    ) {
      hasUnknownMutation = true;
      continue;
    }

    const propertyName =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : null;

    if (propertyName === null) {
      hasUnknownMutation = true;
    } else {
      mutatedMembers.add(propertyName);
    }
  }

  return hasUnknownMutation;
};

const analyzeMutationCall = (
  identifier: ts.Identifier,
  mutatedMembers: Set<string>,
): boolean | null => {
  const candidate = skipTransparentParents(identifier);
  const parent = candidate.parent;

  if (!ts.isCallExpression(parent)) {
    return null;
  }

  const callee = unwrapExpression(parent.expression);

  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Object' &&
    callee.name.text === 'assign' &&
    parent.arguments[0] === candidate
  ) {
    let hasUnknownMutation = parent.arguments.length < 2;

    for (const source of parent.arguments.slice(1)) {
      const assignmentSource = unwrapExpression(source);

      if (!ts.isObjectLiteralExpression(assignmentSource)) {
        hasUnknownMutation = true;
      } else if (addObjectAssignmentMembers(assignmentSource, mutatedMembers)) {
        hasUnknownMutation = true;
      }
    }

    return hasUnknownMutation;
  }

  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Reflect' &&
    callee.name.text === 'set' &&
    parent.arguments[0] === candidate
  ) {
    const member = parent.arguments[1];

    if (
      member !== undefined &&
      (ts.isStringLiteral(member) || ts.isNoSubstitutionTemplateLiteral(member))
    ) {
      mutatedMembers.add(member.text);
      return false;
    }

    return true;
  }

  return true;
};

/**
 * Classifies module-local mutations and escapes for one returned object value.
 * @param analysis The indexed source containing the binding.
 * @param declaration The module-local constant declaration.
 * @param allowedReferences Bare identifier uses proven to be supported registrations or targets.
 * @param safeMethodCalls Read-only method calls that preserve the value's runtime configuration.
 * @returns Member-specific mutations and whether an unknown use can affect every relationship.
 */
export const analyzeModuleValueMutations = (
  analysis: IStaticAnalysisModuleValueSource,
  declaration: ts.VariableDeclaration,
  allowedReferences: ReadonlySet<ts.Identifier>,
  safeMethodCalls: ReadonlySet<string> = new Set(),
): IStaticAnalysisMutationAnalysis => {
  if (!ts.isIdentifier(declaration.name)) {
    return Object.freeze({ hasUnknownMutation: true, mutatedMembers: new Set<string>() });
  }

  const mutatedMembers = new Set<string>();
  let hasUnknownMutation = false;

  for (const identifier of analysis.identifierUses.get(declaration.name.text) ?? []) {
    if (
      isIgnoredIdentifier(identifier, declaration.name) ||
      !isModuleBindingVisible(identifier, analysis) ||
      allowedReferences.has(identifier)
    ) {
      continue;
    }

    const expression = skipTransparentParents(identifier);
    const parent = expression.parent;
    const member =
      (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === expression
        ? parent
        : null;

    if (member !== null) {
      const memberName = getStaticMemberName(member);

      if (memberName === null) {
        hasUnknownMutation = true;
      } else if (isMutatingTarget(member)) {
        mutatedMembers.add(memberName);
      } else {
        const memberExpression = skipTransparentParents(member);
        const memberParent = memberExpression.parent;

        if (
          (ts.isPropertyAccessExpression(memberParent) ||
            ts.isElementAccessExpression(memberParent)) &&
          memberParent.expression === memberExpression &&
          ts.isCallExpression(skipTransparentParents(memberParent).parent)
        ) {
          mutatedMembers.add(memberName);
        } else if (
          ts.isCallExpression(memberParent) &&
          memberParent.expression === memberExpression
        ) {
          if (!safeMethodCalls.has(memberName)) {
            mutatedMembers.add(memberName);
          }
        }
      }

      continue;
    }

    if (isMutatingTarget(identifier)) {
      hasUnknownMutation = true;
      continue;
    }

    const mutationCall = analyzeMutationCall(identifier, mutatedMembers);
    hasUnknownMutation ||= mutationCall ?? true;
  }

  return Object.freeze({
    hasUnknownMutation,
    mutatedMembers: new Set(mutatedMembers),
  });
};
