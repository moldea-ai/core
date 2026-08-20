import ts from 'typescript';

import {
  getClosedObjectProperties,
  getDirectCall,
  getStaticString,
  unwrapExpression,
} from '@moldea.ai/adapter-static-analysis';

import type {
  ICloudflareAgentsClassDefinition,
  ICloudflareAgentsRelationship,
} from '../contracts/index.js';
import { getCloudflareAgentsMethod } from './methods.js';

const mergeInstruction = (
  current: ICloudflareAgentsRelationship,
  expression: ts.Expression,
): ICloudflareAgentsRelationship =>
  current.kind === 'absent'
    ? Object.freeze({ expression, kind: 'present' })
    : Object.freeze({ kind: 'unresolved' });

const getProviderLoader = (expression: ts.Expression): ts.Expression | null => {
  const candidate = unwrapExpression(expression);

  if (!ts.isObjectLiteralExpression(candidate)) {
    return null;
  }

  const properties = getClosedObjectProperties(candidate);

  if (properties === null || !properties.has('get')) {
    return null;
  }

  const getter = unwrapExpression(properties.get('get') as ts.Expression);

  if (ts.isIdentifier(getter)) {
    return ts.factory.createCallExpression(getter, undefined, []);
  }

  if (ts.isArrowFunction(getter) || ts.isFunctionExpression(getter)) {
    if (ts.isBlock(getter.body)) {
      if (getter.body.statements.length !== 1) {
        return null;
      }

      const statement = getter.body.statements[0];
      return statement !== undefined &&
        ts.isReturnStatement(statement) &&
        statement.expression !== undefined
        ? statement.expression
        : null;
    }

    return getter.body;
  }

  return null;
};

/** Extracts an exact Think session-builder instruction source from supported chaining. */
export const getCloudflareAgentsThinkSessionInstructions = (
  definition: ICloudflareAgentsClassDefinition,
): ICloudflareAgentsRelationship => {
  const method = getCloudflareAgentsMethod(definition.methods, 'configureSession', 1);

  if (method === null || method.body.statements.length !== 1) {
    return Object.freeze({ kind: 'absent' });
  }

  const statement = method.body.statements[0];
  const parameter = method.declaration.parameters[0]?.name;

  if (
    statement === undefined ||
    !ts.isReturnStatement(statement) ||
    statement.expression === undefined ||
    parameter === undefined ||
    !ts.isIdentifier(parameter)
  ) {
    return Object.freeze({ kind: 'unresolved' });
  }

  let expression = unwrapExpression(statement.expression);
  let instructions: ICloudflareAgentsRelationship = { kind: 'absent' };

  while (ts.isCallExpression(expression)) {
    const callee = unwrapExpression(expression.expression);

    if (!ts.isPropertyAccessExpression(callee)) {
      return Object.freeze({ kind: 'unresolved' });
    }

    const methodName = callee.name.text;

    if (methodName === 'withInstructions') {
      const argument = expression.arguments[0];

      if (
        expression.arguments.length !== 1 ||
        argument === undefined ||
        getDirectCall(argument) === null
      ) {
        return Object.freeze({ kind: 'unresolved' });
      }
      instructions = mergeInstruction(instructions, argument);
    } else if (methodName === 'withContext') {
      const argument = expression.arguments[0];
      const loader = argument === undefined ? null : getProviderLoader(argument);

      if (expression.arguments.length !== 1 || loader === null || getDirectCall(loader) === null) {
        return Object.freeze({ kind: 'unresolved' });
      }
      instructions = mergeInstruction(instructions, loader);
    } else if (methodName === 'withCachedPrompt') {
      if (expression.arguments.length > 1) {
        return Object.freeze({ kind: 'unresolved' });
      }

      const argument = expression.arguments[0];

      if (argument !== undefined) {
        const loader = getProviderLoader(argument);

        if (loader === null || getDirectCall(loader) === null) {
          return Object.freeze({ kind: 'unresolved' });
        }
        instructions = mergeInstruction(instructions, loader);
      }
    } else if (methodName === 'forSession') {
      if (expression.arguments.length !== 1 || getStaticString(expression.arguments[0]) === null) {
        return Object.freeze({ kind: 'unresolved' });
      }
    } else if (methodName === 'compactAfter') {
      const argument = expression.arguments[0];

      if (
        expression.arguments.length !== 1 ||
        argument === undefined ||
        !ts.isNumericLiteral(unwrapExpression(argument)) ||
        !Number.isSafeInteger(Number(unwrapExpression(argument).getText())) ||
        Number(unwrapExpression(argument).getText()) < 0
      ) {
        return Object.freeze({ kind: 'unresolved' });
      }
    } else {
      return Object.freeze({ kind: 'unresolved' });
    }

    expression = unwrapExpression(callee.expression);
  }

  return ts.isIdentifier(expression) && expression.text === parameter.text
    ? Object.freeze(instructions)
    : Object.freeze({ kind: 'unresolved' });
};
