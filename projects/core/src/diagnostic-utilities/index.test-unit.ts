// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import type { IAdapterDiagnostic } from '../diagnostics/index.js';

import {
  createCoreDiagnostic,
  createCoreDiagnosticCollector,
  createCoreOperationResourceLimits,
  normalizeDiagnosticDetails,
  normalizeDiagnostics,
} from './index.js';

describe('Core diagnostic normalization', () => {
  test('constructs the generic empty-text diagnostic from the exhaustive catalog', () => {
    const diagnostic = createCoreDiagnostic({ code: 'MOLDEA_TEXT_EMPTY', path: null });

    expect(JSON.parse(JSON.stringify(diagnostic))).toStrictEqual({
      code: 'MOLDEA_TEXT_EMPTY',
      details: {},
      entity: null,
      message: 'The required text document is empty.',
      path: null,
      pointer: null,
      range: null,
      source: 'core',
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.details)).toBe(true);
    expect(Object.getPrototypeOf(diagnostic.details)).toBeNull();
  });

  test('deduplicates, normalizes, and sorts diagnostics by the public contract', () => {
    const collector = createCoreDiagnosticCollector(
      { ...DEFAULT_CORE_RESOURCE_LIMITS, maxDiagnostics: 4 },
      'parse-manifest',
    );
    const bmpPath = parseRepositoryPath('/\ue000');
    const astralPath = parseRepositoryPath('/𐀀');
    const duplicate = {
      code: 'MOLDEA_MANIFEST_PATH_INVALID' as const,
      details: { zeta: -0, alpha: true },
      path: astralPath,
    };

    collector.add(duplicate);
    collector.add({ code: 'MOLDEA_MANIFEST_PATH_INVALID', path: bmpPath });
    collector.add(duplicate);
    const diagnostics = collector.finalize();

    expect(diagnostics.map(({ path }) => path)).toStrictEqual([bmpPath, astralPath]);
    expect({ ...diagnostics[1]?.details }).toStrictEqual({ alpha: true, zeta: 0 });
    expect(Object.getPrototypeOf(diagnostics[1]?.details)).toBeNull();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[1])).toBe(true);
  });

  test('rejects diagnostic overflow instead of truncating it', () => {
    const collector = createCoreDiagnosticCollector(
      { ...DEFAULT_CORE_RESOURCE_LIMITS, maxDiagnostics: 1 },
      'parse-manifest',
    );

    collector.add({ code: 'MOLDEA_MANIFEST_PATH_INVALID', path: null });

    expect(() => collector.add({ code: 'MOLDEA_MANIFEST_ROOT_INVALID', path: null })).toThrowError(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxDiagnostics',
        operation: 'parse-manifest',
      }),
    );
  });

  test('counts exact duplicate Core diagnostics before deduplication', () => {
    const collector = createCoreDiagnosticCollector(
      { ...DEFAULT_CORE_RESOURCE_LIMITS, maxDiagnostics: 1 },
      'parse-manifest',
    );
    const diagnostic = { code: 'MOLDEA_MANIFEST_PATH_INVALID' as const, path: null };

    collector.add(diagnostic);

    expect(() => collector.add(diagnostic)).toThrowError(
      expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED', limit: 'maxDiagnostics' }),
    );
  });

  test('shares one raw diagnostic budget across nested operation collectors', () => {
    const limits = createCoreOperationResourceLimits({
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxDiagnostics: 2,
    });
    const inner = createCoreDiagnosticCollector(limits, 'inspect-project');
    const outer = createCoreDiagnosticCollector(limits, 'inspect-project');
    const diagnostic = { code: 'MOLDEA_MANIFEST_PATH_INVALID' as const, path: null };

    inner.add(diagnostic);
    outer.merge(inner.finalize()[0]!);
    outer.add({ code: 'MOLDEA_MANIFEST_ROOT_INVALID', path: null });

    expect(() => inner.add(diagnostic)).toThrowError(
      expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED', limit: 'maxDiagnostics' }),
    );
    expect(outer.size).toBe(2);
  });

  test('combines Core and adapter diagnostics in deterministic public order', () => {
    const collector = createCoreDiagnosticCollector(
      DEFAULT_CORE_RESOURCE_LIMITS,
      'inspect-project',
    );
    collector.add({
      code: 'MOLDEA_MANIFEST_PATH_INVALID',
      path: parseRepositoryPath('/zeta'),
    });
    const adapterDiagnostic: IAdapterDiagnostic = {
      code: 'ALPHA_INVALID',
      details: normalizeDiagnosticDetails({ zeta: -0, alpha: true }),
      entity: null,
      message: 'The adapter observation is invalid.',
      path: null,
      pointer: null,
      range: null,
      source: 'alpha',
    };
    const diagnostics = normalizeDiagnostics([
      collector.finalize()[0]!,
      adapterDiagnostic,
      adapterDiagnostic,
    ]);

    expect(diagnostics.map(({ source }) => source)).toStrictEqual(['alpha', 'core']);
    expect(diagnostics).toHaveLength(2);
    expect({ ...diagnostics[0]?.details }).toStrictEqual({ alpha: true, zeta: 0 });
  });

  test('orders tied ranges by their exclusive end coordinates', () => {
    const baseDiagnostic: IAdapterDiagnostic = {
      code: 'OPENAI_INVALID',
      details: normalizeDiagnosticDetails(undefined),
      entity: null,
      message: 'The adapter observation is invalid.',
      path: parseRepositoryPath('/source.ts'),
      pointer: null,
      range: null,
      source: 'openai',
    };
    const createRange = (endColumn: number) => ({
      end: { column: endColumn, line: 1, offset: endColumn - 1 },
      start: { column: 1, line: 1, offset: 0 },
    });
    const diagnostics = normalizeDiagnostics([
      { ...baseDiagnostic, range: createRange(5) },
      { ...baseDiagnostic, range: createRange(3) },
    ]);

    expect(diagnostics.map(({ range }) => range?.end.column)).toStrictEqual([3, 5]);
  });

  test('orders integer-like detail keys by exact code point', () => {
    const createDiagnostic = (key: string): IAdapterDiagnostic => ({
      code: 'OPENAI_INVALID',
      details: normalizeDiagnosticDetails({ [key]: true }),
      entity: null,
      message: 'The adapter observation is invalid.',
      path: null,
      pointer: null,
      range: null,
      source: 'openai',
    });
    const diagnostics = normalizeDiagnostics([createDiagnostic('2'), createDiagnostic('10')]);

    expect(Object.hasOwn(diagnostics[0]?.details ?? {}, '10')).toBe(true);
    expect(Object.hasOwn(diagnostics[1]?.details ?? {}, '2')).toBe(true);
  });
});
