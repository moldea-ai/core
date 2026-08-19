import ts from 'typescript';

import {
  getClosedObjectProperties,
  getDirectCall,
  getStaticString,
  isBoundIdentifier,
  isModuleBindingVisible,
  resolveBindingReferences,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryReference } from '@moldea.ai/core/format';

import type {
  IClaudeAgentSdkRelationship,
  IClaudeAgentSdkSourceAnalysis,
} from '../contracts/index.js';

const classifyCall = (
  expression: ts.Expression,
  analysis: IClaudeAgentSdkSourceAnalysis,
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

const classifyPreset = (
  expression: ts.Expression,
  analysis: IClaudeAgentSdkSourceAnalysis,
  reference: IRepositoryReference,
): boolean | null => {
  const candidate = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return null;
  }

  const properties = getClosedObjectProperties(candidate);

  if (
    properties === null ||
    [...properties.keys()].some(
      (name) => !['append', 'excludeDynamicSections', 'preset', 'type'].includes(name),
    ) ||
    getStaticString(properties.get('type') ?? candidate) !== 'preset' ||
    getStaticString(properties.get('preset') ?? candidate) !== 'claude_code'
  ) {
    return null;
  }

  const append = properties.get('append');
  return append === undefined ? false : classifyCall(append, analysis, reference);
};

/**
 * Classifies a direct loader call used by a canonical Claude prompt relationship.
 * @param relationship The systemPrompt or AgentDefinition.prompt relationship.
 * @param analysis The source containing the relationship.
 * @param reference The exact declared instruction-loader binding.
 * @param supportsPreset Whether the query-level claude_code preset is allowed.
 * @returns `true` for wired, `false` for provably unwired, or `null` when unresolved.
 */
export const classifyClaudeAgentSdkInstructionLoader = (
  relationship: IClaudeAgentSdkRelationship,
  analysis: IClaudeAgentSdkSourceAnalysis,
  reference: IRepositoryReference,
  supportsPreset: boolean,
): boolean | null => {
  if (relationship.kind === 'absent') {
    return false;
  }

  if (relationship.kind === 'unresolved' || reference.symbol === undefined) {
    return null;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (ts.isArrayLiteralExpression(candidate)) {
    return null;
  }

  const directCall = classifyCall(candidate, analysis, reference);

  if (directCall !== null) {
    return directCall;
  }

  if (supportsPreset) {
    const preset = classifyPreset(candidate, analysis, reference);

    if (preset !== null) {
      return preset;
    }
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
