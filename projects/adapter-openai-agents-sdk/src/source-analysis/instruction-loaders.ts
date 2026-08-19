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
  IOpenAiAgentsSdkRelationship,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';

const getWrapperReturn = (expression: ts.Expression): ts.Expression | null => {
  const candidate = unwrapExpression(expression);

  if (!ts.isArrowFunction(candidate) && !ts.isFunctionExpression(candidate)) {
    return null;
  }

  if (!ts.isBlock(candidate.body)) {
    return candidate.body;
  }

  if (candidate.body.statements.length !== 1) {
    return null;
  }

  const statement = candidate.body.statements[0];
  return statement !== undefined &&
    ts.isReturnStatement(statement) &&
    statement.expression !== undefined
    ? statement.expression
    : null;
};

const classifyCall = (
  expression: ts.Expression,
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  reference: IRepositoryReference,
): boolean | null => {
  const call = getDirectCall(expression);

  if (call === null) {
    return null;
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

/**
 * Classifies the supported direct, called, or single-return instruction-loader relationship.
 * @param relationship The Agent instructions relationship.
 * @param analysis The source containing the Agent definition.
 * @param reference The exact declared instruction-loader binding.
 * @returns `true` for wired, `false` for provably unwired, or `null` when unresolved.
 */
export const classifyOpenAiAgentsSdkInstructionLoader = (
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

  if (ts.isIdentifier(candidate) && isModuleBindingVisible(candidate, analysis)) {
    if (isBoundIdentifier(candidate, analysis, reference)) {
      return true;
    }

    return resolveBindingReferences(candidate, analysis).length > 0 ? false : null;
  }

  const directCall = classifyCall(candidate, analysis, reference);

  if (directCall !== null) {
    return directCall;
  }

  const wrapperReturn = getWrapperReturn(candidate);

  if (wrapperReturn !== null) {
    return classifyCall(wrapperReturn, analysis, reference);
  }

  return ts.isStringLiteral(candidate) ||
    ts.isNoSubstitutionTemplateLiteral(candidate) ||
    ts.isNumericLiteral(candidate) ||
    candidate.kind === ts.SyntaxKind.NullKeyword ||
    candidate.kind === ts.SyntaxKind.TrueKeyword ||
    candidate.kind === ts.SyntaxKind.FalseKeyword
    ? false
    : null;
};
