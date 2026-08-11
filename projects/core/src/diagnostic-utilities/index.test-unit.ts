// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import type { IAdapterDiagnostic } from '../diagnostics/index.js';

import {
  createCoreDiagnostic,
  createCoreDiagnosticCollector,
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
    const diagnostics = normalizeDiagnostics(
      [collector.finalize()[0]!, adapterDiagnostic, adapterDiagnostic],
      DEFAULT_CORE_RESOURCE_LIMITS,
      'inspect-project',
    );

    expect(diagnostics.map(({ source }) => source)).toStrictEqual(['alpha', 'core']);
    expect(diagnostics).toHaveLength(2);
    expect({ ...diagnostics[0]?.details }).toStrictEqual({ alpha: true, zeta: 0 });
  });
});
