// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import type { IStaticAnalysisSource, IStaticAnalysisSourceConfig } from '../types.js';
import { getSafeModuleConstLiteral } from './module-values.js';
import { analyzeSource } from './source-analysis.js';

const SOURCE_CONFIG: IStaticAnalysisSourceConfig = {
  importConfig: {
    namedConstructorImports: ['Client'],
    packageName: 'provider',
    supportsDefaultConstructorImport: false,
  },
  requestConfig: {
    acceptedArgumentCounts: [1],
    methodName: 'run',
    relationshipNames: ['config'],
    resourceName: 'models',
  },
};

/** Parses one module-value fixture and returns its indexed source. */
const analyzeFixture = (source: string): IStaticAnalysisSource => {
  const result = analyzeSource('/src/agent.ts', new TextEncoder().encode(source), SOURCE_CONFIG);

  if (result.kind !== 'valid') {
    throw new TypeError('The module-value fixture must contain valid source.');
  }

  return result.analysis;
};

/** Finds the identifier used as the initializer of the requested property. */
const findPropertyReference = (
  analysis: IStaticAnalysisSource,
  propertyName: string,
): ts.Identifier => {
  let reference: ts.Identifier | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === propertyName
    ) {
      const initializer = node.initializer;

      if (ts.isIdentifier(initializer)) {
        reference = initializer;
      }
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === propertyName) {
      reference = node.name;
    }

    ts.forEachChild(node, visit);
  };

  visit(analysis.sourceFile);

  if (reference === null) {
    throw new TypeError('The fixture must contain the requested property reference.');
  }

  return reference;
};

describe('safe module-local constant values', () => {
  test('resolves an array used only by an explicitly allowed relationship', () => {
    const analysis = analyzeFixture(
      [
        "import { Client } from 'provider';",
        'const client = new Client();',
        "const tools = [{ name: 'search' }];",
        'export const agent = () => client.models.run({ config: { tools } });',
      ].join('\n'),
    );
    const reference = findPropertyReference(analysis, 'tools');

    expect(
      getSafeModuleConstLiteral(reference, analysis, new Set([reference]), 'array')?.expression
        .elements,
    ).toHaveLength(1);
  });

  test.each([
    ['an alias', 'const alias = tools;'],
    ['a mutation', "tools.push({ name: 'other' });"],
    ['an escape', 'consume(tools);'],
    ['an element alias', 'const alias = tools[0];'],
    ['an alias through a non-mutating method', 'const alias = tools.slice();'],
    ['a callback mutation', "tools.forEach((tool) => { tool.name = 'other'; });"],
  ])('rejects a module array with %s', (_description, extraStatement) => {
    const analysis = analyzeFixture(
      [
        "import { Client } from 'provider';",
        'const client = new Client();',
        'const tools = [];',
        extraStatement,
        'export const agent = () => client.models.run({ config: { tools } });',
      ].join('\n'),
    );
    const reference = findPropertyReference(analysis, 'tools');

    expect(
      getSafeModuleConstLiteral(reference, analysis, new Set([reference]), 'array'),
    ).toBeNull();
  });

  test('allows non-mutating array member reads', () => {
    const analysis = analyzeFixture(
      [
        "import { Client } from 'provider';",
        'const client = new Client();',
        'const tools = [];',
        'tools.slice();',
        'export const agent = () => client.models.run({ config: { tools } });',
      ].join('\n'),
    );
    const reference = findPropertyReference(analysis, 'tools');

    expect(
      getSafeModuleConstLiteral(reference, analysis, new Set([reference]), 'array'),
    ).not.toBeNull();
  });
});
