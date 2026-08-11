// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { ICanonicalDiscoveryResult } from './canonical-discovery.js';
import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import type { IMoldeaManifestV1 } from './format.js';
import { normalizeCoreOptions } from './options.js';
import { readProjectAssets } from './project-assets.js';

const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');
const options = normalizeCoreOptions(undefined);

interface IReaderFixture {
  readonly readPaths: IRepositoryPath[];
  readonly reader: IRepositoryReader;
}

const createEmptyEntryIterable = (): AsyncIterable<IRepositoryEntry> => ({
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true, value: undefined }),
  }),
});

const createDiscovery = (
  project: IRepositoryPath | null,
  context: readonly IRepositoryPath[],
): ICanonicalDiscoveryResult => ({
  diagnostics: [],
  inventory: {
    agents: [],
    context,
    decisions: [],
    manifest: parseRepositoryPath('/moldea/moldea.yaml'),
    project,
    runtimeGuidance: [],
  },
  valid: true,
});

const createReaderFixture = (
  contents: ReadonlyMap<IRepositoryPath, Uint8Array>,
): IReaderFixture => {
  const readPaths: IRepositoryPath[] = [];

  return {
    readPaths,
    reader: {
      getEntry: () => Promise.resolve(null),
      listEntries: () => createEmptyEntryIterable(),
      readFile: (path) => {
        readPaths.push(path);
        const content = contents.get(path);

        if (content === undefined) {
          throw new TypeError(`No test content exists for ${path}.`);
        }

        return Promise.resolve(new Uint8Array(content));
      },
    },
  };
};

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, path }) => ({ code, path }));
};

describe('Core project and focused-context asset inspection', () => {
  test('normalizes, digests, sorts, relates, and freezes project assets', async () => {
    const alphaPath = parseRepositoryPath('/moldea/context/alpha.md');
    const zetaPath = parseRepositoryPath('/moldea/context/zeta.md');
    const encoder = new TextEncoder();
    const fixture = createReaderFixture(
      new Map([
        [PROJECT_PATH, encoder.encode('\ufeff# Project\r\n')],
        [alphaPath, encoder.encode('Alpha context.\r')],
        [zetaPath, encoder.encode('Zeta context.\r\n')],
      ]),
    );
    const relationship = { affectedBy: ['/src/**'] } as const;
    const manifest: IMoldeaManifestV1 = {
      context: { [alphaPath]: relationship },
      version: 1,
    };
    const result = await readProjectAssets(
      fixture.reader,
      manifest,
      createDiscovery(PROJECT_PATH, [zetaPath, alphaPath]),
      options,
    );

    expect(result.project).toMatchObject({
      content: '# Project\n',
      digest: 'sha256:aef277fb6a70a89681a85e1b6d23f44ee2a6cc58490f9f5c95fc99db6d2d3542',
      path: PROJECT_PATH,
      scalarLength: 10,
      utf8ByteLength: 10,
    });
    expect(
      result.context.map(({ asset, relationships }) => ({
        content: asset.content,
        digest: asset.digest,
        path: asset.path,
        relationships,
      })),
    ).toStrictEqual([
      {
        content: 'Alpha context.\n',
        digest: 'sha256:ecf5e805353925e1d9070539bf06045355adc126dab2c14d5ac52d846534dfa8',
        path: alphaPath,
        relationships: relationship,
      },
      {
        content: 'Zeta context.\n',
        digest: 'sha256:e3e17876a1d7c01cb8c2afeabe7ed2f97977032e799ec29766b5c8c7c90bea57',
        path: zetaPath,
        relationships: null,
      },
    ]);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.valid).toBe(true);
    expect(fixture.readPaths).toStrictEqual([PROJECT_PATH, alphaPath, zetaPath]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context[0])).toBe(true);
  });

  test('rejects whitespace-only project and context files with specific diagnostics', async () => {
    const contextPath = parseRepositoryPath('/moldea/context/empty.md');
    const encoder = new TextEncoder();
    const fixture = createReaderFixture(
      new Map([
        [PROJECT_PATH, encoder.encode(' \n\t')],
        [contextPath, encoder.encode('\r\n\t')],
      ]),
    );
    const result = await readProjectAssets(
      fixture.reader,
      { version: 1 },
      createDiscovery(PROJECT_PATH, [contextPath]),
      options,
    );

    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual([
      { code: 'MOLDEA_CONTEXT_FILE_EMPTY', path: contextPath },
      { code: 'MOLDEA_PROJECT_FILE_EMPTY', path: PROJECT_PATH },
    ]);
    expect(result.project).toBeNull();
    expect(result.context).toStrictEqual([]);
    expect(result.valid).toBe(false);
  });

  test('preserves strict text diagnostics without adding empty cascades', async () => {
    const contextPath = parseRepositoryPath('/moldea/context/nul.md');
    const fixture = createReaderFixture(
      new Map([
        [PROJECT_PATH, Uint8Array.from([0xff])],
        [contextPath, new TextEncoder().encode('before\0after')],
      ]),
    );
    const result = await readProjectAssets(
      fixture.reader,
      { version: 1 },
      createDiscovery(PROJECT_PATH, [contextPath]),
      options,
    );

    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual([
      { code: 'MOLDEA_TEXT_NUL_FORBIDDEN', path: contextPath },
      { code: 'MOLDEA_TEXT_INVALID_UTF8', path: PROJECT_PATH },
    ]);
    expect(result.project).toBeNull();
    expect(result.context).toStrictEqual([]);
  });

  test('does not duplicate discovery-owned missing or entry-type failures', async () => {
    const fixture = createReaderFixture(new Map());
    const result = await readProjectAssets(
      fixture.reader,
      null,
      createDiscovery(null, []),
      options,
    );

    expect(result).toStrictEqual({ context: [], diagnostics: [], project: null, valid: true });
    expect(fixture.readPaths).toStrictEqual([]);
  });

  test('forwards cancellation and preserves repository source exceptions', async () => {
    const controller = new AbortController();
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: PROJECT_PATH,
      retryable: true,
    });
    let receivedSignal: AbortSignal | undefined;
    const repository: IRepositoryReader = {
      getEntry: () => Promise.resolve(null),
      listEntries: () => createEmptyEntryIterable(),
      readFile: (_path, operationOptions) => {
        receivedSignal = operationOptions?.signal;
        return Promise.reject(sourceFailure);
      },
    };

    await expect(
      readProjectAssets(
        repository,
        { version: 1 },
        createDiscovery(PROJECT_PATH, []),
        options,
        controller.signal,
      ),
    ).rejects.toBe(sourceFailure);
    expect(receivedSignal).toBe(controller.signal);
  });

  test('attributes combined asset diagnostic exhaustion to project inspection', async () => {
    const contextPath = parseRepositoryPath('/moldea/context/empty.md');
    const fixture = createReaderFixture(
      new Map([
        [PROJECT_PATH, new Uint8Array()],
        [contextPath, new Uint8Array()],
      ]),
    );

    await expect(
      readProjectAssets(
        fixture.reader,
        { version: 1 },
        createDiscovery(PROJECT_PATH, [contextPath]),
        {
          ...options,
          limits: { ...DEFAULT_CORE_RESOURCE_LIMITS, maxDiagnostics: 1 },
        },
      ),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'inspect-project',
      retryable: false,
    });
  });
});
