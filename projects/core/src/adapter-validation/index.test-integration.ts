// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import type { IRuntimeAdapter, IRuntimeAdapterResult } from '../adapter/index.js';
import { createCore } from '../core/index.js';

interface IAdapterFixture {
  readonly manifest: string;
  readonly entries: readonly {
    readonly path: string;
    readonly text?: string;
    readonly type: 'file' | 'symlink';
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/adapter-contract/cases.json', import.meta.url),
    'utf8',
  ),
) as IAdapterFixture;
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');
const evidencePath = parseRepositoryPath('/src/evidence.ts');

const createEntries = (): readonly IMemoryRepositoryEntry[] => [
  { content: fixture.manifest, path: manifestPath, type: 'file' },
  ...fixture.entries.map((entry): IMemoryRepositoryEntry => {
    if (entry.type === 'symlink') {
      return { path: entry.path, type: 'symlink' };
    }

    if (entry.text === undefined) {
      throw new TypeError('An adapter fixture file must include text.');
    }

    return { content: entry.text, path: entry.path, type: 'file' };
  }),
];

const createValidEvidence = (): Record<string, unknown> => ({
  agentId: 'alpha',
  capabilityId: null,
  capabilityKind: null,
  details: { language: 'typescript' },
  kind: 'language',
  references: [{ path: evidencePath }],
  runtimeName: null,
  source: 'anthropic',
});

const createValidDiagnostic = (): Record<string, unknown> => ({
  code: 'ANTHROPIC_INVALID_REGISTRATION',
  details: {},
  entity: { agentId: 'alpha' },
  message: 'The registration is invalid.',
  path: evidencePath,
  pointer: null,
  range: null,
  source: 'anthropic',
});

const createValidResult = (): Record<string, unknown> => ({
  diagnostics: [],
  evidence: [createValidEvidence()],
});

const createCyclicResult = (): Record<string, unknown> => {
  const details: Record<string, unknown> = {};
  details['self'] = details;

  return {
    diagnostics: [],
    evidence: [{ ...createValidEvidence(), details }],
  };
};

const malformedCases: readonly [string, () => unknown][] = [
  ['null result', () => null],
  ['missing result array', () => ({ diagnostics: [] })],
  [
    'incorrect evidence source',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), source: 'other-adapter' }] }),
  ],
  [
    'unsupported evidence kind',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), kind: 'unknown-kind' }] }),
  ],
  [
    'out-of-scope evidence agent',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), agentId: 'zeta' }] }),
  ],
  [
    'inconsistent evidence capability',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), capabilityKind: 'tool' }] }),
  ],
  [
    'trimmed evidence runtime name',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), runtimeName: ' Alpha' }] }),
  ],
  [
    'empty evidence references',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), references: [] }] }),
  ],
  [
    'duplicate evidence references',
    () => ({
      diagnostics: [],
      evidence: [
        {
          ...createValidEvidence(),
          references: [{ path: evidencePath }, { path: evidencePath }],
        },
      ],
    }),
  ],
  [
    'multiline evidence symbol',
    () => ({
      diagnostics: [],
      evidence: [
        {
          ...createValidEvidence(),
          references: [{ path: evidencePath, symbol: 'invalid\nsymbol' }],
        },
      ],
    }),
  ],
  [
    'canonical evidence symbol',
    () => ({
      diagnostics: [],
      evidence: [
        {
          ...createValidEvidence(),
          references: [{ path: parseRepositoryPath('/moldea/project.md'), symbol: 'project' }],
        },
      ],
    }),
  ],
  [
    'missing evidence reference',
    () => ({
      diagnostics: [],
      evidence: [
        {
          ...createValidEvidence(),
          references: [{ path: parseRepositoryPath('/src/missing.ts') }],
        },
      ],
    }),
  ],
  [
    'symlinked evidence reference',
    () => ({
      diagnostics: [],
      evidence: [
        {
          ...createValidEvidence(),
          references: [{ path: parseRepositoryPath('/src/symlink.ts') }],
        },
      ],
    }),
  ],
  [
    'unsafe evidence details',
    () => ({ diagnostics: [], evidence: [{ ...createValidEvidence(), details: { nested: {} } }] }),
  ],
  [
    'NUL detail key',
    () => ({
      diagnostics: [],
      evidence: [{ ...createValidEvidence(), details: { ['unsafe\0key']: true } }],
    }),
  ],
  [
    'non-finite evidence details',
    () => ({
      diagnostics: [],
      evidence: [{ ...createValidEvidence(), details: { confidence: Number.NaN } }],
    }),
  ],
  ['cyclic evidence details', createCyclicResult],
  [
    'incorrect diagnostic source',
    () => ({
      diagnostics: [{ ...createValidDiagnostic(), source: 'other-adapter' }],
      evidence: [],
    }),
  ],
  [
    'incorrect diagnostic namespace',
    () => ({
      diagnostics: [{ ...createValidDiagnostic(), code: 'OTHER_ADAPTER_INVALID' }],
      evidence: [],
    }),
  ],
  [
    'malformed diagnostic pointer',
    () => ({
      diagnostics: [{ ...createValidDiagnostic(), pointer: '/invalid~pointer' }],
      evidence: [],
    }),
  ],
  [
    'reversed diagnostic range',
    () => ({
      diagnostics: [
        {
          ...createValidDiagnostic(),
          range: {
            end: { column: 1, line: 1, offset: 0 },
            start: { column: 2, line: 1, offset: 1 },
          },
        },
      ],
      evidence: [],
    }),
  ],
  [
    'out-of-scope diagnostic entity',
    () => ({
      diagnostics: [{ ...createValidDiagnostic(), entity: { agentId: 'zeta' } }],
      evidence: [],
    }),
  ],
  [
    'undeclared diagnostic capability',
    () => ({
      diagnostics: [
        {
          ...createValidDiagnostic(),
          entity: { agentId: 'alpha', capabilityId: 'missing', capabilityKind: 'tool' },
        },
      ],
      evidence: [],
    }),
  ],
  [
    'undeclared diagnostic variable',
    () => ({
      diagnostics: [
        { ...createValidDiagnostic(), entity: { agentId: 'alpha', variableId: 'MISSING' } },
      ],
      evidence: [],
    }),
  ],
  [
    'unknown diagnostic decision',
    () => ({
      diagnostics: [{ ...createValidDiagnostic(), entity: { decisionId: '1786000000000' } }],
      evidence: [],
    }),
  ],
  [
    'incorrect diagnostic adapter entity',
    () => ({
      diagnostics: [
        { ...createValidDiagnostic(), entity: { adapterId: 'other-adapter', agentId: 'alpha' } },
      ],
      evidence: [],
    }),
  ],
  [
    'located diagnostic without a path',
    () => ({
      diagnostics: [{ ...createValidDiagnostic(), path: null, pointer: '/agents/alpha' }],
      evidence: [],
    }),
  ],
];

describe('Core runtime-adapter result validation', () => {
  test.each(malformedCases)(
    'rejects %s as an operational adapter failure',
    async (_, createResult) => {
      const alphaAdapter: IRuntimeAdapter = {
        id: 'anthropic',
        inspect: () => Promise.resolve(createResult() as IRuntimeAdapterResult),
        supportedRepositoryFormatVersions: [1],
      };
      const zetaAdapter: IRuntimeAdapter = {
        id: 'openai',
        inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
        supportedRepositoryFormatVersions: [1],
      };

      await expect(
        createCore({ adapters: [zetaAdapter, alphaAdapter] }).inspectProject({
          repository: createMemoryRepositoryReader(createEntries()),
        }),
      ).rejects.toMatchObject({
        adapterId: 'anthropic',
        code: 'ADAPTER_EXECUTION_FAILED',
        message: 'A runtime adapter failed during inspection.',
        operation: 'validate-adapter',
        retryable: false,
      });
    },
  );

  test('normalizes finite details and exact duplicate adapter diagnostics', async () => {
    const diagnostic = {
      ...createValidDiagnostic(),
      details: { zeta: -0, alpha: true },
    };
    const alphaAdapter: IRuntimeAdapter = {
      id: 'anthropic',
      inspect: () =>
        Promise.resolve({ diagnostics: [diagnostic, diagnostic], evidence: [] } as never),
      supportedRepositoryFormatVersions: [1],
    };
    const zetaAdapter: IRuntimeAdapter = {
      id: 'openai',
      inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
      supportedRepositoryFormatVersions: [1],
    };
    const result = await createCore({ adapters: [zetaAdapter, alphaAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader(createEntries()),
    });

    expect(result.diagnostics).toHaveLength(1);
    expect({ ...result.diagnostics[0]?.details }).toStrictEqual({ alpha: true, zeta: 0 });
    expect(Object.getPrototypeOf(result.diagnostics[0]?.details)).toBeNull();
  });

  test('counts duplicate adapter diagnostics before deduplication', async () => {
    const diagnostic = createValidDiagnostic();
    const alphaAdapter: IRuntimeAdapter = {
      id: 'anthropic',
      inspect: () =>
        Promise.resolve({ diagnostics: [diagnostic, diagnostic], evidence: [] } as never),
      supportedRepositoryFormatVersions: [1],
    };
    const zetaAdapter: IRuntimeAdapter = {
      id: 'openai',
      inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
      supportedRepositoryFormatVersions: [1],
    };

    await expect(
      createCore({
        adapters: [zetaAdapter, alphaAdapter],
        limits: { maxDiagnostics: 1 },
      }).inspectProject({ repository: createMemoryRepositoryReader(createEntries()) }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'validate-adapter',
    });
  });

  test('accepts a complete valid adapter result', async () => {
    const candidate = createValidResult();
    const alphaAdapter: IRuntimeAdapter = {
      id: 'anthropic',
      inspect: () => Promise.resolve(candidate as unknown as IRuntimeAdapterResult),
      supportedRepositoryFormatVersions: [1],
    };
    const zetaAdapter: IRuntimeAdapter = {
      id: 'openai',
      inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
      supportedRepositoryFormatVersions: [1],
    };
    const result = await createCore({ adapters: [zetaAdapter, alphaAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader(createEntries()),
    });

    expect(result.valid).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(Object.isFrozen(candidate)).toBe(false);
    expect(Object.isFrozen((candidate['evidence'] as readonly unknown[])[0])).toBe(false);
  });

  test('classifies an adapter-result accessor failure as invalid adapter output', async () => {
    const candidate = Object.defineProperty({}, 'evidence', {
      enumerable: true,
      get: () => {
        throw new Error('unsafe adapter accessor');
      },
    });
    Object.defineProperty(candidate, 'diagnostics', { enumerable: true, value: [] });
    const alphaAdapter: IRuntimeAdapter = {
      id: 'anthropic',
      inspect: () => Promise.resolve(candidate as unknown as IRuntimeAdapterResult),
      supportedRepositoryFormatVersions: [1],
    };
    const zetaAdapter: IRuntimeAdapter = {
      id: 'openai',
      inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
      supportedRepositoryFormatVersions: [1],
    };
    const resultPromise = createCore({ adapters: [alphaAdapter, zetaAdapter] }).inspectProject({
      repository: createMemoryRepositoryReader(createEntries()),
    });

    await expect(resultPromise).rejects.toMatchObject({
      adapterId: 'anthropic',
      code: 'ADAPTER_EXECUTION_FAILED',
      operation: 'validate-adapter',
      retryable: false,
    });
  });

  test('preserves repository source failures during evidence grounding', async () => {
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'get-entry',
      path: evidencePath,
      retryable: true,
    });
    const source = createMemoryRepositoryReader(createEntries());
    const repository: IRepositoryReader = {
      getEntry: (path, options) =>
        path === evidencePath ? Promise.reject(sourceFailure) : source.getEntry(path, options),
      listEntries: (options) => source.listEntries(options),
      readFile: (path, options) => source.readFile(path, options),
    };
    const alphaAdapter: IRuntimeAdapter = {
      id: 'anthropic',
      inspect: () => Promise.resolve(createValidResult() as unknown as IRuntimeAdapterResult),
      supportedRepositoryFormatVersions: [1],
    };
    const zetaAdapter: IRuntimeAdapter = {
      id: 'openai',
      inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
      supportedRepositoryFormatVersions: [1],
    };

    await expect(
      createCore({ adapters: [alphaAdapter, zetaAdapter] }).inspectProject({ repository }),
    ).rejects.toBe(sourceFailure);
  });

  test('preserves shared cancellation during evidence grounding', async () => {
    const cancellation = new Error('evidence grounding was cancelled');
    const controller = new AbortController();
    const source = createMemoryRepositoryReader(createEntries());
    let groundingSignal: AbortSignal | undefined;
    const repository: IRepositoryReader = {
      getEntry: (path, options) => {
        if (path !== evidencePath) {
          return source.getEntry(path, options);
        }

        groundingSignal = options?.signal;
        controller.abort(cancellation);
        return source.getEntry(path);
      },
      listEntries: (options) => source.listEntries(options),
      readFile: (path, options) => source.readFile(path, options),
    };
    const alphaAdapter: IRuntimeAdapter = {
      id: 'anthropic',
      inspect: () => Promise.resolve(createValidResult() as unknown as IRuntimeAdapterResult),
      supportedRepositoryFormatVersions: [1],
    };
    const zetaAdapter: IRuntimeAdapter = {
      id: 'openai',
      inspect: () => Promise.resolve({ diagnostics: [], evidence: [] }),
      supportedRepositoryFormatVersions: [1],
    };

    await expect(
      createCore({ adapters: [alphaAdapter, zetaAdapter] }).inspectProject({
        repository,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      cause: cancellation,
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: true,
    });
    expect(groundingSignal).toBe(controller.signal);
  });
});
