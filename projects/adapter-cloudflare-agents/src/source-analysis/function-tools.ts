import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsFunctionTool,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import {
  analyzeCloudflareAgentsObjectRelationships,
  getCloudflareAgentsPropertyName,
} from './bindings.js';

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

/** Classifies one direct AI SDK function-tool declaration. */
export const getCloudflareAgentsFunctionTool = (
  analysis: ICloudflareAgentsSourceAnalysis,
  declaration: ts.VariableDeclaration,
): ICloudflareAgentsFunctionTool | null => {
  if (declaration.initializer === undefined) {
    return null;
  }

  const call = unwrapExpression(declaration.initializer);

  if (!ts.isCallExpression(call) || call.arguments.length !== 1) {
    return null;
  }

  const callee = unwrapExpression(call.expression);
  const object = unwrapExpression(call.arguments[0] as ts.Expression);

  if (
    !ts.isIdentifier(callee) ||
    !analysis.imports.toolNames.has(callee.text) ||
    !isModuleBindingVisible(callee, analysis) ||
    !ts.isObjectLiteralExpression(object)
  ) {
    return null;
  }

  const names = new Set<string>();

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }

    const name = getCloudflareAgentsPropertyName(property.name);

    if (name === null || !TOLERATED_PROPERTY_NAMES.has(name) || names.has(name)) {
      return null;
    }
    names.add(name);
  }

  if (!names.has('inputSchema')) {
    return null;
  }

  const relationships = analyzeCloudflareAgentsObjectRelationships(object, [
    'execute',
    'inputSchema',
    'outputSchema',
  ] as const);

  return Object.freeze({ declaration, ...relationships });
};
