// @vitest-environment node
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { analyzeTypeScriptModule } from './source-analysis.js';
import { analyzeModuleValueMutations } from './mutations.js';

const analyze = (source: string) => {
  const result = analyzeTypeScriptModule('/src/runtime.ts', new TextEncoder().encode(source), {
    namedConstructorImports: [],
    packageName: '@example/sdk',
    supportsDefaultConstructorImport: false,
  });

  expect(result.kind).toBe('valid');

  if (result.kind !== 'valid') {
    throw new Error('Expected valid source analysis.');
  }

  return result.analysis;
};

describe('analyzeModuleValueMutations', () => {
  test('classifies direct member assignments and Object.assign sources', () => {
    const analysis = analyze(`
      export const config = { prompt: 'initial', tools: [] };
      config.prompt = 'changed';
      Object.assign(config, { tools: ['updated'] });
    `);
    const declaration = analysis.moduleConstDeclarations.get('config');

    expect(declaration).toBeDefined();

    if (declaration !== undefined) {
      expect(analyzeModuleValueMutations(analysis, declaration, new Set())).toStrictEqual({
        hasUnknownMutation: false,
        mutatedMembers: new Set(['prompt', 'tools']),
      });
    }
  });

  test('treats explicitly allowed registration references as safe', () => {
    const analysis = analyze(`
      export const config = { description: 'target' };
      export const registrations = { target: config };
    `);
    const declaration = analysis.moduleConstDeclarations.get('config');
    const allowedReference = (analysis.identifierUses.get('config') ?? []).find(
      (identifier) =>
        ts.isPropertyAssignment(identifier.parent) && identifier.parent.initializer === identifier,
    );

    expect(declaration).toBeDefined();
    expect(allowedReference).toBeDefined();

    if (declaration !== undefined && allowedReference !== undefined) {
      expect(
        analyzeModuleValueMutations(analysis, declaration, new Set([allowedReference])),
      ).toStrictEqual({
        hasUnknownMutation: false,
        mutatedMembers: new Set(),
      });
    }
  });

  test('marks unproved aliases as unknown mutation paths', () => {
    const analysis = analyze(`
      export const config = { prompt: 'initial' };
      consume(config);
    `);
    const declaration = analysis.moduleConstDeclarations.get('config');

    expect(declaration).toBeDefined();

    if (declaration !== undefined) {
      expect(analyzeModuleValueMutations(analysis, declaration, new Set())).toMatchObject({
        hasUnknownMutation: true,
      });
    }
  });
});
