// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IStaticAnalysisModuleValueSource, IStaticAnalysisSourceResult } from '../types.js';
import { analyzeTypeScriptModule } from './source-analysis.js';
import { resolveStaticString } from './static-strings.js';

const IMPORT_CONFIG = Object.freeze({
  namedConstructorImports: [],
  packageName: '@example/sdk',
  supportsDefaultConstructorImport: false,
});

const createAnalysis = (path: string, source: string): IStaticAnalysisModuleValueSource => {
  const result = analyzeTypeScriptModule(path, new TextEncoder().encode(source), IMPORT_CONFIG);

  expect(result.kind).toBe('valid');

  if (result.kind !== 'valid') {
    throw new Error('Expected valid source analysis.');
  }

  return result.analysis;
};

describe('resolveStaticString', () => {
  test('resolves exact local and relative named-import constants', async () => {
    const analyses = new Map([
      [
        '/src/runtime.ts',
        createAnalysis(
          '/src/runtime.ts',
          "import { routingName as importedName } from './metadata.js';\nexport const localName = importedName;\n",
        ),
      ],
      [
        '/src/metadata.ts',
        createAnalysis('/src/metadata.ts', "export const routingName = '  Billing 😀  ';\n"),
      ],
    ]);
    const analysis = analyses.get('/src/runtime.ts');
    const declaration = analysis?.moduleConstDeclarations.get('localName');

    expect(analysis).toBeDefined();
    expect(declaration?.initializer).toBeDefined();

    if (analysis !== undefined && declaration?.initializer !== undefined) {
      await expect(
        resolveStaticString({
          analysis,
          analyzeSource: (path) => {
            const imported = analyses.get(path);
            return Promise.resolve(
              imported === undefined
                ? { kind: 'invalid-text' as const }
                : { analysis: imported, kind: 'valid' as const },
            );
          },
          expression: declaration.initializer,
          getEntry: (path) => Promise.resolve(analyses.has(path) ? { path, type: 'file' } : null),
          parsePath: (path) => path,
        }),
      ).resolves.toMatchObject({ kind: 'supported', value: '  Billing 😀  ' });
    }
  });

  test('rejects interpolated and cyclic sources', async () => {
    const analysis = createAnalysis(
      '/src/runtime.ts',
      'export const first = second;\nexport const second = first;\nexport const interpolated = `name-${first}`;\n',
    );
    const analyzeSource = () => Promise.resolve({ analysis, kind: 'valid' as const });
    const first = analysis.moduleConstDeclarations.get('first')?.initializer;
    const interpolated = analysis.moduleConstDeclarations.get('interpolated')?.initializer;

    expect(first).toBeDefined();
    expect(interpolated).toBeDefined();

    if (first !== undefined && interpolated !== undefined) {
      const options = {
        analysis,
        analyzeSource,
        getEntry: () => Promise.resolve({ type: 'file' }),
        parsePath: (path: string) => path,
      };

      await expect(resolveStaticString({ ...options, expression: first })).resolves.toStrictEqual({
        kind: 'unsupported',
      });
      await expect(
        resolveStaticString({ ...options, expression: interpolated }),
      ).resolves.toStrictEqual({ kind: 'unsupported' });
    }
  });

  test.each([
    [{ kind: 'invalid-text' as const }, '/src/metadata.ts', null],
    [
      {
        kind: 'invalid-syntax' as const,
        range: {
          end: { column: 2, line: 1, offset: 1 },
          start: { column: 1, line: 1, offset: 0 },
        },
      },
      '/src/metadata.ts',
      {
        end: { column: 2, line: 1, offset: 1 },
        start: { column: 1, line: 1, offset: 0 },
      },
    ],
  ])('reports imported $kind sources', async (sourceFailure, expectedPath, expectedRange) => {
    const analysis = createAnalysis(
      '/src/runtime.ts',
      "import { routingName } from './metadata.js';\nexport const localName = routingName;\n",
    );
    const expression = analysis.moduleConstDeclarations.get('localName')?.initializer;
    const observedFailures: Array<{
      readonly path: string;
      readonly result: Exclude<IStaticAnalysisSourceResult, { readonly kind: 'valid' }>;
    }> = [];

    expect(expression).toBeDefined();

    if (expression !== undefined) {
      await expect(
        resolveStaticString({
          analysis,
          analyzeSource: () => Promise.resolve(sourceFailure),
          expression,
          getEntry: (path) =>
            Promise.resolve(path === '/src/metadata.ts' ? { path, type: 'file' } : null),
          onSourceFailure: (path, result) => observedFailures.push({ path, result }),
          parsePath: (path) => path,
        }),
      ).resolves.toStrictEqual({ kind: 'unsupported' });
      expect(observedFailures).toStrictEqual([
        {
          path: expectedPath,
          result:
            expectedRange === null
              ? { kind: 'invalid-text' }
              : { kind: 'invalid-syntax', range: expectedRange },
        },
      ]);
    }
  });
});
