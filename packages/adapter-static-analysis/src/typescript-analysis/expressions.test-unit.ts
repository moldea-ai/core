// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import {
  getClosedObjectProperties,
  getDirectCall,
  getStaticString,
  isStaticLiteralValue,
} from './expressions.js';

/** Parses the initializer from one source-level constant fixture. */
const parseInitializer = (initializer: string): ts.Expression => {
  const sourceFile = ts.createSourceFile(
    '/fixture.ts',
    `const fixture = ${initializer};`,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TS,
  );
  const statement = sourceFile.statements[0];

  if (statement === undefined || !ts.isVariableStatement(statement)) {
    throw new TypeError('The expression fixture must contain a variable statement.');
  }

  const expression = statement.declarationList.declarations[0]?.initializer;

  if (expression === undefined) {
    throw new TypeError('The expression fixture must contain an initializer.');
  }

  return expression;
};

describe('static TypeScript expressions', () => {
  test('unwraps supported wrappers and direct awaited calls', () => {
    const call = getDirectCall(parseInitializer('(await load()) satisfies unknown'));

    expect(call).not.toBeNull();
    expect(call && ts.isIdentifier(call.expression) ? call.expression.text : null).toBe('load');
  });

  test('indexes exact closed properties and static strings', () => {
    const expression = parseInitializer("{ name: 'lookup', 'description': `Find an item` }");

    if (!ts.isObjectLiteralExpression(expression)) {
      throw new TypeError('The object fixture must be an object literal.');
    }

    const properties = getClosedObjectProperties(expression);

    expect(properties && [...properties.keys()]).toStrictEqual(['name', 'description']);
    expect(getStaticString(properties?.get('name'))).toBe('lookup');
    expect(getStaticString(properties?.get('description'))).toBe('Find an item');
  });

  test.each([
    ['nested literals', "{ type: 'object', values: [-1, true, null, { name: `item` }] }", true],
    ['an object spread', '{ ...schema }', false],
    ['an array hole', '[true, , false]', false],
    ['an interpolated template', '`item-${suffix}`', false],
  ])('classifies %s in the static literal grammar', (_description, expression, expected) => {
    expect(isStaticLiteralValue(parseInitializer(expression))).toBe(expected);
  });

  test.each([
    ["{ name: 'first', name: 'second' }"],
    ["{ ['name']: 'first' }"],
    ["{ ...other, name: 'first' }"],
  ])('rejects the non-closed object %s', (initializer) => {
    const expression = parseInitializer(initializer);

    if (!ts.isObjectLiteralExpression(expression)) {
      throw new TypeError('The object fixture must be an object literal.');
    }

    expect(getClosedObjectProperties(expression)).toBeNull();
  });
});
