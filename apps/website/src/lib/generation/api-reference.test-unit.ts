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
  test('derives entry-point distinctions and symbols from actual public package exports', () => {
    const projectDirectory = resolve('../../projects/repository');
    const reference = generateApiReference(projectDirectory, {
      '.': { types: './dist/index.d.ts' },
      './memory': { types: './dist/memory.d.ts' },
    });

    expect(reference.map(({ name }) => name)).toStrictEqual(['.', './memory']);
    expect(reference[0].symbols.map(({ name }) => name)).toContain('IRepositoryReader');
    expect(reference[1].symbols.map(({ name }) => name)).toStrictEqual([
      'createMemoryRepositoryReader',
      'IMemoryRepositoryEntry',
    ]);
    expect(JSON.stringify(reference)).not.toContain('IStoredRepositoryEntry');
  });

  test('fails clearly when a declaration target cannot resolve to a public source entry point', () => {
    expect(() =>
      generateApiReference(resolve('../../projects/repository'), {
        './missing': { types: './dist/missing.d.ts' },
      }),
    ).toThrow('Cannot resolve public declaration ./dist/missing.d.ts to a source entry point.');
  });

  test('renders declaration-only public class members without implementation bodies', () => {
    const reference = generateApiReference(resolve('../../projects/core'), {
      '.': { types: './dist/index.d.ts' },
    });
    const exception = reference[0].symbols.find(({ name }) => name === 'CoreOperationException');

    expect(exception?.signature).toContain('export class CoreOperationException extends Exception');
    expect(exception?.signature).toContain('public readonly retryable: boolean;');
    expect(exception?.signature).toContain(
      'public constructor(options: ICoreOperationExceptionOptions);',
    );
    expect(exception?.signature).not.toContain('super(');
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
