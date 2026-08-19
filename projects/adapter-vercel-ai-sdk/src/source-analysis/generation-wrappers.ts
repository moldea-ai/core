import ts from 'typescript';

import {
  getRuntimeExport,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IVercelAiSdkGenerationRequest,
  IVercelAiSdkGenerationWrapperResult,
  IVercelAiSdkRelationship,
  IVercelAiSdkSourceAnalysis,
} from '../contracts/index.js';
import { analyzeVercelAiSdkObjectRelationships, hasVercelAiSdkObjectProperty } from './bindings.js';

const REQUEST_RELATIONSHIP_NAMES = ['instructions', 'output', 'system', 'tools'] as const;

const getGenerationCallKind = (
  expression: ts.Expression,
  analysis: IVercelAiSdkSourceAnalysis,
): 'generateText' | 'streamText' | null => {
  const callee = unwrapExpression(expression);

  if (!ts.isIdentifier(callee) || !isModuleBindingVisible(callee, analysis)) {
    return null;
  }

  if (analysis.imports.generateTextNames.has(callee.text)) {
    return 'generateText';
  }

  return analysis.imports.streamTextNames.has(callee.text) ? 'streamText' : null;
};

const analyzeRequest = (
  call: ts.CallExpression,
  callKind: 'generateText' | 'streamText',
): IVercelAiSdkGenerationRequest | null => {
  if (call.arguments.length !== 1) {
    return null;
  }

  const object = unwrapExpression(call.arguments[0] as ts.Expression);

  if (!ts.isObjectLiteralExpression(object)) {
    return null;
  }

  const relationships = analyzeVercelAiSdkObjectRelationships(object, REQUEST_RELATIONSHIP_NAMES);
  let instructions: IVercelAiSdkRelationship =
    relationships.instructions.kind === 'absent'
      ? relationships.system
      : relationships.instructions;

  if (hasVercelAiSdkObjectProperty(object, 'prepareStep')) {
    instructions = { kind: 'unresolved' };
  }

  return Object.freeze({
    call: callKind,
    instructions,
    object,
    output: relationships.output,
    tools: relationships.tools,
  });
};

const isNestedLexicalBoundary = (node: ts.Node, root: ts.Node): boolean =>
  node !== root &&
  (ts.isFunctionLike(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isClassStaticBlockDeclaration(node));

const containsGenerationCandidate = (
  node: ts.Node,
  analysis: IVercelAiSdkSourceAnalysis,
): boolean => {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (
      !found &&
      ts.isCallExpression(candidate) &&
      getGenerationCallKind(candidate.expression, analysis) !== null
    ) {
      found = true;
      return;
    }

    ts.forEachChild(candidate, visit);
  };

  visit(node);
  return found;
};

/**
 * Classifies one directly exported generation wrapper and all direct request calls.
 * @param analysis The indexed source module.
 * @param symbol The exact exported wrapper symbol.
 * @returns The absent, unsupported, or supported wrapper state.
 */
export const getVercelAiSdkGenerationWrapper = (
  analysis: IVercelAiSdkSourceAnalysis,
  symbol: string,
): IVercelAiSdkGenerationWrapperResult => {
  const exported = getRuntimeExport(analysis, symbol);

  if (exported.kind === 'absent') {
    return Object.freeze({ kind: 'absent' });
  }

  if (exported.kind !== 'present-supported' || exported.body === undefined) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const requests: IVercelAiSdkGenerationRequest[] = [];
  let hasAmbiguousCandidate = false;
  const visit = (node: ts.Node): void => {
    if (isNestedLexicalBoundary(node, exported.body as ts.Node)) {
      hasAmbiguousCandidate ||= containsGenerationCandidate(node, analysis);
      return;
    }

    if (ts.isCallExpression(node)) {
      const callKind = getGenerationCallKind(node.expression, analysis);

      if (callKind !== null) {
        const request = analyzeRequest(node, callKind);

        if (request === null) {
          hasAmbiguousCandidate = true;
        } else {
          requests.push(request);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(exported.body);

  if (requests.length === 0) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  return Object.freeze({
    kind: 'present-supported',
    wrapper: Object.freeze({
      declaration: exported.declaration,
      hasAmbiguousCandidate,
      requests: Object.freeze(requests),
    }),
  });
};
