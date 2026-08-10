// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IFrameworkAdapterResult } from './adapter.js';
import { DEFAULT_CORE_RESOURCE_LIMITS, SUPPORTED_REPOSITORY_FORMAT_VERSIONS } from './constants.js';
import { createCore } from './core.js';
import { CoreConfigurationException, CoreOperationException } from './exceptions.js';
import { normalizeCoreOptions } from './options.js';

const emptyAdapterResult = (): IFrameworkAdapterResult => ({
  diagnostics: [],
  evidence: [],
});

describe('Core constants and construction', () => {
  test('exports exact deeply immutable version and resource-limit constants', () => {
    expect(SUPPORTED_REPOSITORY_FORMAT_VERSIONS).toStrictEqual([1]);
    expect(DEFAULT_CORE_RESOURCE_LIMITS).toStrictEqual({
      maxDiagnostics: 10_000,
      maxEntries: 100_000,
      maxFileBytes: 8_388_608,
      maxManifestBytes: 2_097_152,
      maxTotalBytesRead: 134_217_728,
    });
    expect(Object.isFrozen(SUPPORTED_REPOSITORY_FORMAT_VERSIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CORE_RESOURCE_LIMITS)).toBe(true);
  });

  test('creates one frozen Core instance with only the implemented method surface', () => {
    const core = createCore();

    expect(Object.isFrozen(core)).toBe(true);
    expect(Object.keys(core).sort()).toStrictEqual([
      'calculateContentDigest',
      'normalizeText',
      'parseManifest',
    ]);
    expect(typeof core.calculateContentDigest).toBe('function');
    expect(typeof core.normalizeText).toBe('function');
    expect(typeof core.parseManifest).toBe('function');
  });

  test('copies resource limits without freezing caller-owned configuration', () => {
    const limits = { maxFileBytes: 1 };
    const options = { limits };
    const core = createCore(options);

    limits.maxFileBytes = 100;

    expect(Object.isFrozen(options)).toBe(false);
    expect(Object.isFrozen(limits)).toBe(false);
    expect(() =>
      core.normalizeText({
        content: 'ab',
        path: parseRepositoryPath('/two-bytes.txt'),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT_EXCEEDED',
        limit: 'maxFileBytes',
        operation: 'normalize-text',
      }),
    );
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects invalid resource limit %o',
    (maxFileBytes) => {
      expect(() => createCore({ limits: { maxFileBytes } })).toThrowError(
        expect.objectContaining({
          code: 'INVALID_RESOURCE_LIMIT',
          operation: 'create-core',
        }),
      );
    },
  );

  test('rejects unknown resource-limit properties', () => {
    expect(() => createCore({ limits: { maxUnknown: 1 } as never })).toThrowError(
      CoreConfigurationException,
    );
  });

  test('snapshots and sorts adapter configuration without freezing caller objects', async () => {
    const originalInspect = (): Promise<IFrameworkAdapterResult> =>
      Promise.resolve(emptyAdapterResult());
    const replacementInspect = (): Promise<IFrameworkAdapterResult> =>
      Promise.resolve({
        diagnostics: [],
        evidence: [null as never],
      });
    const versions: 1[] = [1];
    const adapter = {
      id: 'zeta-adapter',
      inspect: originalInspect,
      supportedRepositoryFormatVersions: versions,
    };
    const options = {
      adapters: [
        adapter,
        {
          id: 'alpha-adapter',
          inspect: originalInspect,
          supportedRepositoryFormatVersions: [1] as const,
        },
      ],
    };
    const snapshot = normalizeCoreOptions(options);

    adapter.id = 'changed-adapter';
    adapter.inspect = replacementInspect;
    versions.splice(0, 1);

    expect(Object.isFrozen(options)).toBe(false);
    expect(Object.isFrozen(adapter)).toBe(false);
    expect(Object.isFrozen(versions)).toBe(false);
    expect(snapshot.adapters.map(({ id }) => id)).toStrictEqual(['alpha-adapter', 'zeta-adapter']);
    expect(snapshot.adapters[1]?.supportedRepositoryFormatVersions).toStrictEqual([1]);
    await expect(snapshot.adapters[1]?.inspect(null as never)).resolves.toStrictEqual(
      emptyAdapterResult(),
    );
  });

  test('rejects reserved, duplicated, and malformed adapter definitions', () => {
    const inspect = (): Promise<IFrameworkAdapterResult> => Promise.resolve(emptyAdapterResult());
    const adapter = {
      id: 'eve',
      inspect,
      supportedRepositoryFormatVersions: [1] as const,
    };

    expect(() =>
      createCore({
        adapters: [adapter, { ...adapter, supportedRepositoryFormatVersions: [1] as const }],
      }),
    ).toThrowError(expect.objectContaining({ adapterId: 'eve', code: 'DUPLICATE_ADAPTER_ID' }));
    expect(() =>
      createCore({
        adapters: [{ ...adapter, id: 'custom' }],
      }),
    ).toThrowError(expect.objectContaining({ adapterId: 'custom', code: 'RESERVED_ADAPTER_ID' }));
    expect(() =>
      createCore({
        adapters: [{ ...adapter, id: 'Invalid_ID' }],
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ADAPTER_DEFINITION' }));
    expect(() =>
      createCore({
        adapters: [
          {
            ...adapter,
            supportedRepositoryFormatVersions: [2] as never,
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ adapterId: 'eve', code: 'INVALID_ADAPTER_DEFINITION' }),
    );
    expect(() => createCore({ adapters: Array<never>(1) })).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ADAPTER_DEFINITION',
        operation: 'create-core',
      }),
    );
  });

  test('uses typed operation failures for invalid public document arguments', async () => {
    const core = createCore();

    expect(() => core.normalizeText(null as never)).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ARGUMENT',
        operation: 'normalize-text',
        retryable: false,
      }),
    );
    await expect(core.calculateContentDigest({ content: 1 } as never)).rejects.toBeInstanceOf(
      CoreOperationException,
    );
    await expect(core.parseManifest({ content: 1 } as never)).rejects.toBeInstanceOf(
      CoreOperationException,
    );
  });
});
