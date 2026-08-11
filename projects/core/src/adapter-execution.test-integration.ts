// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import type {
  IFrameworkAdapter,
  IFrameworkAdapterContext,
  IFrameworkAdapterEvidence,
  IFrameworkAdapterResult,
} from './adapter.js';
import { createCore } from './core.js';

interface IAdapterFixture {
  readonly manifest: string;
  readonly entries: readonly {
    readonly path: string;
    readonly text?: string;
    readonly type: 'file' | 'symlink';
  }[];
}

interface IAdapterHarnessOptions {
  readonly includeDiagnostics?: boolean;
  readonly onAlpha?: (context: IFrameworkAdapterContext) => Promise<void> | void;
  readonly onZeta?: (context: IFrameworkAdapterContext) => Promise<void> | void;
}

interface IAdapterHarness {
  readonly adapters: readonly IFrameworkAdapter[];
  readonly calls: string[];
  readonly projectAgentIds: string[][];
  readonly scopedAgentIds: string[][];
  readonly unusedCalls: string[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/core/adapter-contract/cases.json', import.meta.url),
    'utf8',
  ),
) as IAdapterFixture;
const expectedEvidence = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/core/adapter-contract/evidence.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const expectedDiagnostics = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/core/adapter-contract/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as readonly unknown[];
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');
const projectPath = parseRepositoryPath('/moldea/project.md');
const auditPath = parseRepositoryPath('/src/audit.ts');
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

const createAlphaEvidence = (): readonly IFrameworkAdapterEvidence[] => {
  const toolRegistration: IFrameworkAdapterEvidence = {
    agentId: 'alpha',
    capabilityId: 'audit',
    capabilityKind: 'tool',
    details: { symbol: 'auditRequests', constructor: 'safe', detected: true },
    kind: 'tool-registration',
    references: [{ path: evidencePath }, { path: auditPath }],
    runtimeName: 'auditRequests',
    source: 'alpha-adapter',
  };

  return [
    toolRegistration,
    {
      agentId: 'beta',
      capabilityId: null,
      capabilityKind: null,
      details: { language: 'typescript' },
      kind: 'agent-definition',
      references: [{ path: evidencePath }],
      runtimeName: 'BetaRuntime',
      source: 'alpha-adapter',
    },
    toolRegistration,
  ];
};

const createZetaEvidence = (): readonly IFrameworkAdapterEvidence[] => [
  {
    agentId: 'zeta',
    capabilityId: null,
    capabilityKind: null,
    details: { language: 'typescript' },
    kind: 'language',
    references: [{ path: evidencePath }],
    runtimeName: null,
    source: 'zeta-adapter',
  },
];

const createAdapterHarness = (options: IAdapterHarnessOptions = {}): IAdapterHarness => {
  const calls: string[] = [];
  const projectAgentIds: string[][] = [];
  const scopedAgentIds: string[][] = [];
  const unusedCalls: string[] = [];

  const observeContext = (adapterId: string, context: IFrameworkAdapterContext): void => {
    calls.push(adapterId);
    scopedAgentIds.push(context.agents.map(({ id }) => id));
    projectAgentIds.push(context.project.agents.map(({ id }) => id));
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.agents)).toBe(true);
    expect(Object.isFrozen(context.project)).toBe(true);
  };

  const alphaAdapter: IFrameworkAdapter = {
    id: 'alpha-adapter',
    supportedRepositoryFormatVersions: [1],
    inspect: async (context): Promise<IFrameworkAdapterResult> => {
      observeContext('alpha-adapter', context);
      await options.onAlpha?.(context);

      return {
        diagnostics: options.includeDiagnostics
          ? [
              {
                code: 'ALPHA_ADAPTER_TOOL_REGISTRATION_MISSING',
                details: { expected: true },
                entity: {
                  agentId: 'alpha',
                  capabilityId: 'audit',
                  capabilityKind: 'tool',
                },
                message: 'The tool registration is missing.',
                path: auditPath,
                pointer: null,
                range: null,
                source: 'alpha-adapter',
              },
            ]
          : [],
        evidence: createAlphaEvidence(),
      };
    },
  };
  const zetaAdapter: IFrameworkAdapter = {
    id: 'zeta-adapter',
    supportedRepositoryFormatVersions: [1],
    inspect: async (context): Promise<IFrameworkAdapterResult> => {
      observeContext('zeta-adapter', context);
      await options.onZeta?.(context);

      return {
        diagnostics: options.includeDiagnostics
          ? [
              {
                code: 'ZETA_ADAPTER_AGENT_DEFINITION_MISSING',
                details: { runtimeName: 'ZetaRuntime' },
                entity: { adapterId: 'zeta-adapter', agentId: 'zeta' },
                message: 'The runtime agent definition is missing.',
                path: null,
                pointer: null,
                range: null,
                source: 'zeta-adapter',
              },
            ]
          : [],
        evidence: createZetaEvidence(),
      };
    },
  };
  const unusedAdapter: IFrameworkAdapter = {
    id: 'unused-adapter',
    supportedRepositoryFormatVersions: [1],
    inspect: () => {
      unusedCalls.push('unused-adapter');
      return Promise.resolve({ diagnostics: [], evidence: [] });
    },
  };

  return {
    adapters: [zetaAdapter, unusedAdapter, alphaAdapter],
    calls,
    projectAgentIds,
    scopedAgentIds,
    unusedCalls,
  };
};

const toJsonValue = (candidate: unknown): unknown =>
  JSON.parse(JSON.stringify(candidate)) as unknown;

describe('Core framework-adapter execution', () => {
  test('invokes applicable adapters canonically through one mutation-isolated reader session', async () => {
    const source = createMemoryRepositoryReader(createEntries());
    const readCounts = new Map<IRepositoryPath, number>();
    const repository: IRepositoryReader = {
      getEntry: (path, options) => source.getEntry(path, options),
      listEntries: (options) => source.listEntries(options),
      readFile: (path, options) => {
        readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
        return source.readFile(path, options);
      },
    };
    let zetaProjectText = '';
    const harness = createAdapterHarness({
      onAlpha: async (context) => {
        const operationOptions =
          context.signal === undefined ? undefined : { signal: context.signal };
        const bytes = await context.repository.readFile(projectPath, operationOptions);
        bytes[0] = 0;
      },
      onZeta: async (context) => {
        const operationOptions =
          context.signal === undefined ? undefined : { signal: context.signal };
        const bytes = await context.repository.readFile(projectPath, operationOptions);
        zetaProjectText = new TextDecoder().decode(bytes);
      },
    });
    const result = await createCore({ adapters: harness.adapters }).inspectProject({ repository });

    expect(result.valid).toBe(true);
    expect(result.project?.agents.map(({ id }) => id)).toStrictEqual([
      'alpha',
      'beta',
      'custom-agent',
      'zeta',
    ]);
    expect(toJsonValue(result.evidence)).toStrictEqual(expectedEvidence);
    expect(result.diagnostics).toStrictEqual([]);
    expect(harness.calls).toStrictEqual(['alpha-adapter', 'zeta-adapter']);
    expect(harness.scopedAgentIds).toStrictEqual([['alpha', 'beta'], ['zeta']]);
    expect(harness.projectAgentIds).toStrictEqual([
      ['alpha', 'beta', 'custom-agent', 'zeta'],
      ['alpha', 'beta', 'custom-agent', 'zeta'],
    ]);
    expect(harness.unusedCalls).toStrictEqual([]);
    expect(zetaProjectText).toBe('# Adapter project\n');
    expect(readCounts.get(projectPath)).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence[0]?.details)).toBe(true);
    expect(Object.getPrototypeOf(result.evidence[0]?.details)).toBeNull();
  });

  test('retains exact evidence while adapter diagnostics withhold the project', async () => {
    const harness = createAdapterHarness({ includeDiagnostics: true });
    const result = await createCore({ adapters: harness.adapters }).inspectProject({
      repository: createMemoryRepositoryReader(createEntries()),
    });

    expect(toJsonValue(result)).toMatchObject({
      diagnostics: expectedDiagnostics,
      evidence: expectedEvidence,
      formatVersion: 1,
      project: null,
      valid: false,
    });
    expect(toJsonValue(result.diagnostics)).toStrictEqual(expectedDiagnostics);
    expect(toJsonValue(result.evidence)).toStrictEqual(expectedEvidence);
    expect(harness.calls).toStrictEqual(['alpha-adapter', 'zeta-adapter']);
  });

  test('does not invoke any adapter after universal validation fails', async () => {
    const harness = createAdapterHarness();
    const entries = createEntries().filter(({ path }) => path !== projectPath);
    const result = await createCore({ adapters: harness.adapters }).inspectProject({
      repository: createMemoryRepositoryReader(entries),
    });

    expect(result.valid).toBe(false);
    expect(result.project).toBeNull();
    expect(result.evidence).toStrictEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'MOLDEA_PROJECT_FILE_MISSING' }),
    );
    expect(harness.calls).toStrictEqual([]);
    expect(harness.unusedCalls).toStrictEqual([]);
  });

  test('wraps unexpected adapter failures with safe adapter metadata and cause', async () => {
    const failure = new Error('private adapter failure');
    const harness = createAdapterHarness({
      onAlpha: () => {
        throw failure;
      },
    });

    await expect(
      createCore({ adapters: harness.adapters }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
      }),
    ).rejects.toMatchObject({
      adapterId: 'alpha-adapter',
      cause: failure,
      code: 'ADAPTER_EXECUTION_FAILED',
      message: 'A framework adapter failed during inspection.',
      operation: 'inspect-project',
      retryable: false,
    });
    expect(harness.calls).toStrictEqual(['alpha-adapter']);
  });

  test('preserves repository source exceptions raised through an adapter reader', async () => {
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'get-entry',
      path: parseRepositoryPath('/source-error'),
      retryable: true,
    });
    const source = createMemoryRepositoryReader(createEntries());
    const repository: IRepositoryReader = {
      getEntry: (path, options) =>
        path === '/source-error' ? Promise.reject(sourceFailure) : source.getEntry(path, options),
      listEntries: (options) => source.listEntries(options),
      readFile: (path, options) => source.readFile(path, options),
    };
    const harness = createAdapterHarness({
      onAlpha: async (context) => {
        const operationOptions =
          context.signal === undefined ? undefined : { signal: context.signal };
        await context.repository.getEntry(parseRepositoryPath('/source-error'), operationOptions);
      },
    });

    await expect(
      createCore({ adapters: harness.adapters }).inspectProject({ repository }),
    ).rejects.toBe(sourceFailure);
  });

  test('stops adapter execution when the shared signal is aborted', async () => {
    const controller = new AbortController();
    const harness = createAdapterHarness({
      onAlpha: () => controller.abort(new Error('adapter cancellation')),
    });

    await expect(
      createCore({ adapters: harness.adapters }).inspectProject({
        repository: createMemoryRepositoryReader(createEntries()),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: false,
    });
    expect(harness.calls).toStrictEqual(['alpha-adapter']);
  });

  test('charges adapter enumeration to the shared entry budget', async () => {
    const source = createMemoryRepositoryReader(createEntries());
    let universalEntryCount = 0;
    const observedRepository: IRepositoryReader = {
      getEntry: (path, options) => source.getEntry(path, options),
      listEntries: (options): AsyncIterable<IRepositoryEntry> => ({
        async *[Symbol.asyncIterator]() {
          for await (const entry of source.listEntries(options)) {
            universalEntryCount += 1;
            yield entry;
          }
        },
      }),
      readFile: (path, options) => source.readFile(path, options),
    };
    const baselineHarness = createAdapterHarness();

    await createCore({ adapters: baselineHarness.adapters }).inspectProject({
      repository: observedRepository,
    });

    const budgetHarness = createAdapterHarness({
      onAlpha: async (context) => {
        const operationOptions =
          context.signal === undefined ? undefined : { signal: context.signal };

        for await (const entry of context.repository.listEntries(operationOptions)) {
          void entry;
        }
      },
    });

    await expect(
      createCore({
        adapters: budgetHarness.adapters,
        limits: { maxEntries: universalEntryCount },
      }).inspectProject({ repository: createMemoryRepositoryReader(createEntries()) }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxEntries',
      operation: 'inspect-project',
      retryable: false,
    });
  });

  test('enforces the diagnostic budget across every completed adapter', async () => {
    const harness = createAdapterHarness({ includeDiagnostics: true });

    await expect(
      createCore({
        adapters: harness.adapters,
        limits: { maxDiagnostics: 1 },
      }).inspectProject({ repository: createMemoryRepositoryReader(createEntries()) }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'inspect-project',
      retryable: false,
    });
    expect(harness.calls).toStrictEqual(['alpha-adapter', 'zeta-adapter']);
  });
});
