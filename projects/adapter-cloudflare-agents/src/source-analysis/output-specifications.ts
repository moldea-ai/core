import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsRelationship,
  ICloudflareAgentsSourceAnalysis,
} from '../contracts/index.js';
import { getCloudflareAgentsPropertyName, hasCloudflareAgentsPrototypeSetter } from './bindings.js';

/** Classifies a direct AI SDK `Output.object(...)` schema relationship. */
export const getCloudflareAgentsOutputSchema = (
  relationship: ICloudflareAgentsRelationship,
  analysis: ICloudflareAgentsSourceAnalysis,
): ICloudflareAgentsRelationship => {
  if (relationship.kind !== 'present') {
    return relationship;
  }

  const candidate = unwrapExpression(relationship.expression);

  if (!ts.isCallExpression(candidate) || candidate.arguments.length !== 1) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const callee = unwrapExpression(candidate.expression);

  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'object' ||
    !ts.isIdentifier(unwrapExpression(callee.expression))
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const output = unwrapExpression(callee.expression) as ts.Identifier;
  const object = unwrapExpression(candidate.arguments[0] as ts.Expression);

  if (
    !analysis.imports.outputNames.has(output.text) ||
    !isModuleBindingVisible(output, analysis) ||
    !ts.isObjectLiteralExpression(object) ||
    hasCloudflareAgentsPrototypeSetter(object)
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  let schema: ICloudflareAgentsRelationship = { kind: 'absent' };
  const seen = new Set<string>();

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    const name = getCloudflareAgentsPropertyName(property.name);

    if (name === null || !['description', 'name', 'schema'].includes(name) || seen.has(name)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    seen.add(name);

    if (name === 'schema') {
      schema = ts.isPropertyAssignment(property)
        ? { expression: unwrapExpression(property.initializer), kind: 'present' }
        : ts.isShorthandPropertyAssignment(property)
          ? { expression: property.name, kind: 'present' }
          : { kind: 'unresolved' };
    }
  }

  return Object.freeze(schema.kind === 'absent' ? { kind: 'unresolved' } : schema);
};
