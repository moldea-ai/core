// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import { createCoreDiagnosticCollector } from './diagnostic-utilities.js';

describe('Core diagnostic normalization', () => {
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
});
