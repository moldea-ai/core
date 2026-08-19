import ts from 'typescript';

import { isModuleBindingVisible, unwrapExpression } from '@moldea.ai/adapter-static-analysis';

import type {
  IVercelAiSdkOutputSchemaRelationship,
  IVercelAiSdkSourceAnalysis,
} from '../contracts/index.js';
import { getVercelAiSdkPropertyName, hasVercelAiSdkPrototypeSetter } from './bindings.js';

/** Classifies a direct Output.object(...) expression in its owning module. */
export const getVercelAiSdkOutputSchema = (
  expression: ts.Expression,
  analysis: IVercelAiSdkSourceAnalysis,
): IVercelAiSdkOutputSchemaRelationship => {
  const candidate = unwrapExpression(expression);

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

  if (!analysis.imports.outputNames.has(output.text) || !isModuleBindingVisible(output, analysis)) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const object = unwrapExpression(candidate.arguments[0] as ts.Expression);

  if (!ts.isObjectLiteralExpression(object) || hasVercelAiSdkPrototypeSetter(object)) {
    return Object.freeze({ kind: 'unresolved' });
  }

  const seen = new Set<string>();
  let schema: IVercelAiSdkOutputSchemaRelationship = { kind: 'absent' };

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    const name = getVercelAiSdkPropertyName(property.name);

    if (name === null || !['description', 'name', 'schema'].includes(name) || seen.has(name)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    seen.add(name);

    if (name !== 'schema') {
      continue;
    }

    if (ts.isPropertyAssignment(property)) {
      schema = { expression: unwrapExpression(property.initializer), kind: 'present' };
    } else if (ts.isShorthandPropertyAssignment(property)) {
      schema = { expression: property.name, kind: 'present' };
    } else {
      return Object.freeze({ kind: 'unresolved' });
    }
  }

  return Object.freeze(schema.kind === 'absent' ? { kind: 'unresolved' } : schema);
};
