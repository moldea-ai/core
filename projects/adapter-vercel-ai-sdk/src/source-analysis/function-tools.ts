import ts from 'typescript';

import {
  analyzeModuleValueMutations,
  isModuleBindingVisible,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  IVercelAiSdkFunctionTool,
  IVercelAiSdkFunctionToolResult,
  IVercelAiSdkRelationship,
  IVercelAiSdkSourceAnalysis,
} from '../contracts/index.js';
import { analyzeVercelAiSdkObjectRelationships, getVercelAiSdkPropertyName } from './bindings.js';

const RELATIONSHIP_NAMES = ['execute', 'inputSchema', 'outputSchema'] as const;
const TOLERATED_PROPERTY_NAMES = new Set([
  'contextSchema',
  'description',
  'execute',
  'inputExamples',
  'inputSchema',
  'metadata',
  'needsApproval',
  'onInputAvailable',
  'onInputDelta',
  'onInputStart',
  'outputSchema',
  'providerOptions',
  'strict',
  'title',
  'toModelOutput',
  'type',
]);

const getFunctionToolObject = (
  initializer: ts.Expression,
  analysis: IVercelAiSdkSourceAnalysis,
): ts.ObjectLiteralExpression | null => {
  const candidate = unwrapExpression(initializer);

  if (!ts.isCallExpression(candidate) || candidate.arguments.length !== 1) {
    return null;
  }

  const callee = unwrapExpression(candidate.expression);

  if (
    !ts.isIdentifier(callee) ||
    !analysis.imports.toolNames.has(callee.text) ||
    !isModuleBindingVisible(callee, analysis)
  ) {
    return null;
  }

  const object = unwrapExpression(candidate.arguments[0] as ts.Expression);
  return ts.isObjectLiteralExpression(object) ? object : null;
};

const isSupportedFunctionToolShape = (object: ts.ObjectLiteralExpression): boolean => {
  const names = new Set<string>();
  let hasInputSchema = false;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return false;
    }

    const name = getVercelAiSdkPropertyName(property.name);

    if (name === null || !TOLERATED_PROPERTY_NAMES.has(name) || names.has(name)) {
      return false;
    }

    names.add(name);

    if (name === 'inputSchema') {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
        return false;
      }
      hasInputSchema = true;
    }

    if (name === 'type') {
      if (!ts.isPropertyAssignment(property)) {
        return false;
      }

      const type = unwrapExpression(property.initializer);

      if (
        (!ts.isStringLiteral(type) && !ts.isNoSubstitutionTemplateLiteral(type)) ||
        type.text !== 'function'
      ) {
        return false;
      }
    }
  }

  return hasInputSchema;
};

/** Classifies one directly exported repository-local function tool. */
export const getVercelAiSdkFunctionTool = (
  analysis: IVercelAiSdkSourceAnalysis,
  symbol: string,
  allowedToolMapReferences: ReadonlySet<ts.Identifier> = new Set(),
): IVercelAiSdkFunctionToolResult => {
  const exported = analysis.exports.get(symbol);

  if (exported === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  if (
    exported.kind !== 'present-supported' ||
    !ts.isVariableDeclaration(exported.declaration) ||
    exported.declaration.initializer === undefined
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const object = getFunctionToolObject(exported.declaration.initializer, analysis);

  if (object === null || !isSupportedFunctionToolShape(object)) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const relationships = analyzeVercelAiSdkObjectRelationships(object, RELATIONSHIP_NAMES);
  const mutations = analyzeModuleValueMutations(
    analysis,
    exported.declaration,
    allowedToolMapReferences,
  );

  if (mutations.hasUnknownMutation || mutations.mutatedMembers.has('type')) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const relationship = (name: (typeof RELATIONSHIP_NAMES)[number]): IVercelAiSdkRelationship =>
    mutations.mutatedMembers.has(name) ? { kind: 'unresolved' } : relationships[name];
  const tool: IVercelAiSdkFunctionTool = Object.freeze({
    declaration: exported.declaration,
    execute: relationship('execute'),
    inputSchema: relationship('inputSchema'),
    object,
    outputSchema: relationship('outputSchema'),
  });

  return Object.freeze({ kind: 'present-supported', tool });
};
