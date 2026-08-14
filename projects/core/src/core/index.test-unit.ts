// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { IRuntimeAdapterResult } from '../adapter/index.js';
import {
  DEFAULT_CORE_RESOURCE_LIMITS,
  RECOGNIZED_RUNTIME_ADAPTER_IDS,
  SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import { CoreConfigurationException, CoreOperationException } from '../exceptions/index.js';
import { normalizeCoreOptions } from '../options/index.js';

import { createCore } from './index.js';

const emptyAdapterResult = (): IRuntimeAdapterResult => ({
  diagnostics: [],
  evidence: [],
});

const createEmptyEntryIterable = (): AsyncIterable<IRepositoryEntry> => ({
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true, value: undefined }),
  }),
});

describe('Core constants and construction', () => {
  test('exports exact deeply immutable version and resource-limit constants', () => {
    expect(RECOGNIZED_RUNTIME_ADAPTER_IDS).toStrictEqual([
      'anthropic',
      'claude-agent-sdk',
      'cloudflare-agents',
      'custom',
      'eve',
      'google-genai',
      'langchain',
      'langgraph',
      'openai',
      'openai-agents-sdk',
      'pydantic-ai',
      'vercel-ai-sdk',
    ]);
    expect(SUPPORTED_REPOSITORY_FORMAT_VERSIONS).toStrictEqual([1]);
    expect(DEFAULT_CORE_RESOURCE_LIMITS).toStrictEqual({
      maxDiagnostics: 10_000,
      maxEntries: 100_000,
      maxEvidence: 10_000,
      maxFileBytes: 8_388_608,
      maxManifestBytes: 2_097_152,
      maxTotalBytesRead: 134_217_728,
    });
    expect(Object.isFrozen(RECOGNIZED_RUNTIME_ADAPTER_IDS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_REPOSITORY_FORMAT_VERSIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CORE_RESOURCE_LIMITS)).toBe(true);
  });

  test('creates one frozen Core instance with only the implemented method surface', () => {
    const core = createCore();

    expect(Object.isFrozen(core)).toBe(true);
    expect(Object.keys(core).sort()).toStrictEqual([
      'calculateContentDigest',
      'inspectProject',
      'normalizeText',
      'parseDecision',
      'parseManifest',
    ]);
    expect(typeof core.calculateContentDigest).toBe('function');
    expect(typeof core.inspectProject).toBe('function');
    expect(typeof core.normalizeText).toBe('function');
    expect(typeof core.parseDecision).toBe('function');
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
    const originalInspect = (): Promise<IRuntimeAdapterResult> =>
      Promise.resolve(emptyAdapterResult());
    const replacementInspect = (): Promise<IRuntimeAdapterResult> =>
      Promise.resolve({
        diagnostics: [],
        evidence: [null as never],
      });
    const versions: 1[] = [1];
    const adapter = {
      id: 'openai',
      inspect: originalInspect,
      supportedRepositoryFormatVersions: versions,
    };
    const options = {
      adapters: [
        adapter,
        {
          id: 'anthropic',
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
    expect(snapshot.adapters.map(({ id }) => id)).toStrictEqual(['anthropic', 'openai']);
    expect(snapshot.adapters[1]?.supportedRepositoryFormatVersions).toStrictEqual([1]);
    await expect(snapshot.adapters[1]?.inspect(null as never)).resolves.toStrictEqual(
      emptyAdapterResult(),
    );
  });

  test('rejects reserved, duplicated, and malformed adapter definitions', () => {
    const inspect = (): Promise<IRuntimeAdapterResult> => Promise.resolve(emptyAdapterResult());
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
        adapters: [{ ...adapter, id: 'unrecognized-adapter' }],
      }),
    ).toThrowError(
      expect.objectContaining({
        adapterId: 'unrecognized-adapter',
        code: 'INVALID_ADAPTER_DEFINITION',
      }),
    );
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

  test('preserves a class adapter instance as the inspect receiver', async () => {
    class PrivateFieldAdapter {
      readonly id = 'openai';

      readonly supportedRepositoryFormatVersions = [1] as const;

      readonly #result = emptyAdapterResult();

      inspect(): Promise<IRuntimeAdapterResult> {
        return Promise.resolve(this.#result);
      }
    }

    const adapter = new PrivateFieldAdapter();
    const snapshot = normalizeCoreOptions({ adapters: [adapter] });

    await expect(snapshot.adapters[0]?.inspect(null as never)).resolves.toStrictEqual(
      emptyAdapterResult(),
    );
    expect(Object.isFrozen(adapter)).toBe(false);
  });

  test('uses typed operation failures for invalid public arguments', async () => {
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
    await expect(core.parseDecision({ content: 1 } as never)).rejects.toBeInstanceOf(
      CoreOperationException,
    );
    await expect(core.inspectProject(null as never)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      operation: 'inspect-project',
      retryable: false,
    });
    await expect(
      core.inspectProject({ repository: { getEntry: null } } as never),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      operation: 'inspect-project',
    });
    await expect(
      core.inspectProject({
        repository: {
          getEntry: () => Promise.resolve(null),
          listEntries: createEmptyEntryIterable,
          readFile: () => Promise.resolve(new Uint8Array()),
        },
        signal: null,
      } as never),
    ).rejects.toBeInstanceOf(CoreOperationException);
  });

  test('snapshots the repository input property before inspection', async () => {
    const repository: IRepositoryReader = {
      getEntry: () => Promise.resolve(null),
      listEntries: createEmptyEntryIterable,
      readFile: () => Promise.resolve(new Uint8Array()),
    };
    let repositoryReads = 0;
    const input = Object.defineProperty({}, 'repository', {
      enumerable: true,
      get: () => {
        repositoryReads += 1;
        return repositoryReads === 1 ? repository : null;
      },
    });
    const result = await createCore().inspectProject(input as never);

    expect(repositoryReads).toBe(1);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MOLDEA_MANIFEST_MISSING' }),
    );
  });
});
