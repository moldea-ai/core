// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IStaticAnalysisSourceConfig } from '../types.js';
import {
  analyzeSource,
  getCallableExportState,
  getConstExport,
  getRuntimeExport,
  isSupportedTypeScriptSourcePath,
} from './source-analysis.js';

const SOURCE_CONFIG: IStaticAnalysisSourceConfig = {
  importConfig: {
    namedConstructorImports: ['Client'],
    packageName: 'provider',
    supportsDefaultConstructorImport: true,
  },
  requestConfig: {
    acceptedArgumentCounts: [1],
    methodName: 'create',
    relationshipNames: ['tools'],
    resourceName: 'messages',
    toolRelationshipName: 'tools',
  },
};

describe('TypeScript source analysis', () => {
  test('indexes supported imports, clients, arrays, and direct exports', () => {
    const result = analyzeSource(
      '/src/agent.ts',
      new TextEncoder().encode(
        [
          "import { Client as ProviderClient } from 'provider';",
          'const client = new ProviderClient();',
          'const tools = [tool];',
          'export const schema = { type: `object` } as const;',
          'export const loadSystem = () => `system`;',
          'export const agent = () => client.messages.create({ tools });',
        ].join('\n'),
      ),
      SOURCE_CONFIG,
    );

    if (result.kind !== 'valid') {
      throw new TypeError('The source fixture must be valid.');
    }

    expect(result.analysis.constructorNames).toStrictEqual(new Set(['ProviderClient']));
    expect(result.analysis.clientNames).toStrictEqual(new Set(['client']));
    expect(result.analysis.safeModuleArrayNames).toStrictEqual(new Set(['tools']));
    expect(getRuntimeExport(result.analysis, 'agent').kind).toBe('present-supported');
    expect(getCallableExportState(result.analysis, 'loadSystem').kind).toBe('present-supported');
    expect(getConstExport(result.analysis, 'schema').kind).toBe('present-supported');
  });

  test('returns stable invalid-text and invalid-syntax states', () => {
    expect(analyzeSource('/src/agent.ts', Uint8Array.from([0xff]), SOURCE_CONFIG)).toStrictEqual({
      kind: 'invalid-text',
    });
    expect(
      analyzeSource('/src/agent.ts', new TextEncoder().encode('export const = ;'), SOURCE_CONFIG),
    ).toMatchObject({ kind: 'invalid-syntax' });
  });

  test.each([
    ['/src/agent.ts', true],
    ['/src/agent.tsx', true],
    ['/src/agent.mts', true],
    ['/src/agent.js', false],
  ])('isSupportedTypeScriptSourcePath(%s) -> %s', (path, expected) => {
    expect(isSupportedTypeScriptSourcePath(path)).toBe(expected);
  });
});
