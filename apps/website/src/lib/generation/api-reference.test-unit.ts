// @vitest-environment node
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

import {
  createApiEntrypointAnchorId,
  createApiSymbolAnchorId,
  generateApiReference,
  getApiDeclarationKind,
} from './api-reference.ts';

describe('generateApiReference', () => {
  test('ignores source component and style entry points without TypeScript declarations', () => {
    expect(
      generateApiReference(resolve('../../projects/repository'), {
        './component': { import: './src/component.astro' },
        './styles.css': { default: './src/styles.css', style: './src/styles.css' },
      }),
    ).toStrictEqual([]);
  });

  test('rejects runtime entry points without TypeScript declarations', () => {
    expect(() =>
      generateApiReference(resolve('../../projects/repository'), {
        './missing-types': { import: './dist/missing-types.js' },
      }),
    ).toThrow('Public entry point ./missing-types has no TypeScript declaration target.');
  });

  test('fails clearly for a public declaration kind without generator support', () => {
    const sourceFile = ts.createSourceFile(
      'unsupported.ts',
      'export namespace Unsupported {}',
      ts.ScriptTarget.ES2024,
      true,
      ts.ScriptKind.TS,
    );
    const declaration = sourceFile.statements[0];

    if (!declaration || !ts.isModuleDeclaration(declaration)) {
      throw new Error('The unsupported API declaration fixture is invalid.');
    }

    expect(() => getApiDeclarationKind(declaration, 'Unsupported')).toThrow(
      'Public export Unsupported uses unsupported declaration kind ModuleDeclaration.',
    );
  });
});

describe('API fragment identifiers', () => {
  test('qualifies symbol anchors by public entry point', () => {
    expect(createApiEntrypointAnchorId('.')).toBe('entrypoint-root');
    expect(createApiEntrypointAnchorId('./adapter')).toBe('entrypoint-subpath-adapter');
    expect(createApiSymbolAnchorId('.', 'IRuntimeAdapterEvidence')).toBe(
      'api-root-IRuntimeAdapterEvidence',
    );
    expect(createApiSymbolAnchorId('./adapter', 'IRuntimeAdapterEvidence')).toBe(
      'api-subpath-adapter-IRuntimeAdapterEvidence',
    );
  });

  test('encodes punctuation without colliding with its readable spelling', () => {
    expect(createApiSymbolAnchorId('.', 'Name-With-Dashes')).not.toBe(
      createApiSymbolAnchorId('.', 'Name2dWith2dDashes'),
    );
  });
});
