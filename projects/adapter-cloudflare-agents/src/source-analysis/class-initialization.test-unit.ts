// @vitest-environment node
import { describe, expect, test } from 'vitest';
import ts from 'typescript';

import { isCloudflareAgentsClassInitializationSupported } from './class-initialization.js';

/** Parses the only class declaration from a focused source fixture. */
const parseClass = (sourceText: string): ts.ClassDeclaration => {
  const sourceFile = ts.createSourceFile(
    '/src/agent.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isClassDeclaration);

  if (declaration === undefined) {
    throw new TypeError('The class declaration fixture is required.');
  }

  return declaration;
};

describe('isCloudflareAgentsClassInitializationSupported', () => {
  test('accepts a side-effect-free class with a pass-through constructor', () => {
    expect(
      isCloudflareAgentsClassInitializationSupported(
        parseClass('class Agent { constructor(state, env) { super(state, env); } }'),
      ),
    ).toBe(true);
  });

  test.each([
    ['a static block', 'class Agent { static {} }'],
    ['a generator method', 'class Agent { *getTools() {} }'],
    [
      'a constructor parameter property',
      'class Agent { constructor(private state, env) { super(state, env); } }',
    ],
  ])('rejects %s', (_description, sourceText) => {
    expect(isCloudflareAgentsClassInitializationSupported(parseClass(sourceText))).toBe(false);
  });
});
