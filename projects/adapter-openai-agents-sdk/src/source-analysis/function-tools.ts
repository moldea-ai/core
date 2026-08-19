import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IOpenAiAgentsSdkFunctionTool,
  IOpenAiAgentsSdkFunctionToolResult,
  IOpenAiAgentsSdkRelationship,
  IOpenAiAgentsSdkSourceAnalysis,
} from '../contracts/index.js';

const REQUIRED_PROPERTIES = new Set(['description', 'execute', 'name', 'parameters']);
const SUPPORTED_PROPERTIES = new Set([
  ...REQUIRED_PROPERTIES,
  'allowedCallers',
  'customDataExtractor',
  'deferLoading',
  'errorFunction',
  'inputGuardrails',
  'isEnabled',
  'needsApproval',
  'outputGuardrails',
  'outputSchema',
  'providerData',
  'strict',
  'timeoutBehavior',
  'timeoutErrorFunction',
  'timeoutMs',
]);

const getStaticPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

const createRelationship = (
  properties: ReadonlyMap<string, ts.Expression>,
  name: string,
): IOpenAiAgentsSdkRelationship => {
  const expression = properties.get(name);
  return expression === undefined ? { kind: 'absent' } : { expression, kind: 'present' };
};

const getToolProperties = (
  object: ts.ObjectLiteralExpression,
): ReadonlyMap<string, ts.Expression> | null => {
  const properties = new Map<string, ts.Expression>();

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return null;
    }

    const propertyName = getStaticPropertyName(property.name);

    if (
      propertyName === null ||
      !SUPPORTED_PROPERTIES.has(propertyName) ||
      properties.has(propertyName)
    ) {
      return null;
    }

    properties.set(propertyName, unwrapExpression(property.initializer));
  }

  return [...REQUIRED_PROPERTIES].every((propertyName) => properties.has(propertyName))
    ? properties
    : null;
};

/**
 * Classifies one directly exported root tool(...) declaration.
 * @param analysis The indexed tool source.
 * @param symbol The exact exported tool registration symbol.
 * @returns The absent, unsupported, or structurally supported function-tool state.
 */
export const getOpenAiAgentsSdkFunctionTool = (
  analysis: IOpenAiAgentsSdkSourceAnalysis,
  symbol: string,
): IOpenAiAgentsSdkFunctionToolResult => {
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

  const initializer = unwrapExpression(exported.declaration.initializer);

  if (!ts.isCallExpression(initializer) || initializer.arguments.length !== 1) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const helper = unwrapExpression(initializer.expression);

  if (
    !ts.isIdentifier(helper) ||
    !analysis.imports.toolNames.has(helper.text) ||
    !isModuleBindingVisible(helper, analysis)
  ) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const object = unwrapExpression(initializer.arguments[0] as ts.Expression);

  if (!ts.isObjectLiteralExpression(object)) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const properties = getToolProperties(object);

  if (properties === null) {
    return Object.freeze({ declaration: exported.declaration, kind: 'present-unsupported' });
  }

  const tool: IOpenAiAgentsSdkFunctionTool = Object.freeze({
    declaration: exported.declaration,
    execute: createRelationship(properties, 'execute'),
    name: properties.get('name') as ts.Expression,
    object,
    outputSchema: createRelationship(properties, 'outputSchema'),
    parameters: createRelationship(properties, 'parameters'),
  });

  return Object.freeze({ kind: 'present-supported', tool });
};
