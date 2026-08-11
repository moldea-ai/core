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

import type { IProjectInspectionInput } from '../contracts/index.js';
import { normalizeCoreOptions, type ICoreOptionsSnapshot } from '../options/index.js';
import { createRepositoryInspectionSession } from '../repository-inspection-session/index.js';

import { inspectUniversalProject as inspectUniversalProjectWithSession } from './index.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink';
  readonly text?: string;
  readonly bytes?: readonly number[];
}

interface IProjectIndexFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly manifest: string;
    readonly entries: readonly IFixtureEntry[];
    readonly expectedFormatVersion: 1;
    readonly expectedProjectFixture: string | null;
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/project-index/cases.json', import.meta.url),
    'utf8',
  ),
) as IProjectIndexFixture;
const completeExpectedProject = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/project-index/complete.expected.json', import.meta.url),
    'utf8',
  ),
) as unknown;
const expectedDiagnosticsByCase = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/project-index/diagnostics.expected.json', import.meta.url),
    'utf8',
  ),
) as Readonly<Record<string, readonly unknown[]>>;
const options = normalizeCoreOptions(undefined);
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

/** Executes the internal universal phase with the same session ownership as public inspection. */
const inspectUniversalProject = async (
  input: IProjectInspectionInput,
  inspectionOptions: ICoreOptionsSnapshot,
) => {
  const session = createRepositoryInspectionSession(
    input.repository,
    inspectionOptions.limits,
    input.signal,
  );

  return await inspectUniversalProjectWithSession(
    { session, ...(input.signal === undefined ? {} : { signal: input.signal }) },
    inspectionOptions,
  );
};

const createEntries = (
  fixtureCase: IProjectIndexFixture['cases'][number],
): readonly IMemoryRepositoryEntry[] => [
  { content: fixtureCase.manifest, path: manifestPath, type: 'file' },
  ...fixtureCase.entries.map((entry): IMemoryRepositoryEntry => {
    if (entry.type !== 'file') {
      return { path: entry.path, type: entry.type };
    }

    if (entry.bytes !== undefined) {
      return { content: Uint8Array.from(entry.bytes), path: entry.path, type: 'file' };
    }

    if (entry.text === undefined) {
      throw new TypeError('A project-index file fixture must include text or bytes.');
    }

    return { content: entry.text, path: entry.path, type: 'file' };
  }),
];

const reverseEnumeration = (repository: IRepositoryReader): IRepositoryReader => ({
  getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
  listEntries: (operationOptions): AsyncIterable<IRepositoryEntry> => ({
    async *[Symbol.asyncIterator]() {
      const entries: IRepositoryEntry[] = [];

      for await (const entry of repository.listEntries(operationOptions)) {
        entries.push(entry);
      }

      for (const entry of entries.reverse()) {
        yield entry;
      }
    },
  }),
  readFile: (path, operationOptions) => repository.readFile(path, operationOptions),
});

const toJsonValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

const readExpectedProject = (fixtureCase: IProjectIndexFixture['cases'][number]): unknown => {
  if (fixtureCase.expectedProjectFixture === null) {
    return null;
  }

  return JSON.parse(
    readFileSync(
      new URL(
        `../../../../fixtures/core/project-index/${fixtureCase.expectedProjectFixture}`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
};

const getFixtureCase = (name: string): IProjectIndexFixture['cases'][number] => {
  const fixtureCase = fixture.cases.find((candidate) => candidate.name === name);

  if (fixtureCase === undefined) {
    throw new TypeError(`The ${name} project-index fixture is required.`);
  }

  return fixtureCase;
};

describe('Core universal project inspection through the memory repository reader', () => {
  test.each(fixture.cases)('returns exact all-or-nothing results for $name', async (case_) => {
    const result = await inspectUniversalProject(
      { repository: createMemoryRepositoryReader(createEntries(case_)) },
      options,
    );

    const expectedDiagnostics = expectedDiagnosticsByCase[case_.name];

    if (expectedDiagnostics === undefined) {
      throw new TypeError(`The ${case_.name} diagnostic golden is required.`);
    }

    expect(toJsonValue(result)).toStrictEqual({
      diagnostics: expectedDiagnostics,
      formatVersion: case_.expectedFormatVersion,
      project: readExpectedProject(case_),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(result.project === null || Object.isFrozen(result.project)).toBe(true);
  });

  test('creates the complete deterministic JSON-safe project index', async () => {
    const case_ = getFixtureCase('complete universal project');
    const result = await inspectUniversalProject(
      { repository: createMemoryRepositoryReader(createEntries(case_)) },
      options,
    );
    const project = result.project;

    expect(project).not.toBeNull();
    if (project === null) {
      throw new TypeError('The complete universal fixture must produce a project index.');
    }

    expect(toJsonValue(project)).toStrictEqual(completeExpectedProject);
    expect(JSON.parse(JSON.stringify(project))).toMatchObject({
      agents: [
        {
          context: ['/moldea/context/security.md'],
          decisions: ['/moldea/decisions/1767225600000-use-security.md'],
          id: 'alpha',
          mirrors: [
            {
              path: '/apps/alpha.md',
            },
          ],
        },
        { context: [], decisions: [], id: 'zeta', mirrors: [] },
      ],
      context: [
        {
          asset: {
            content: 'Security context.\n',
            path: '/moldea/context/security.md',
          },
          relationships: {
            bindings: [{ path: '/src/security.ts' }],
          },
        },
        {
          asset: {
            content: 'Unreferenced context.\n',
            path: '/moldea/context/unreferenced.md',
          },
          relationships: null,
        },
      ],
      decisions: [
        {
          decision: {
            id: '1767225600000',
            path: '/moldea/decisions/1767225600000-use-security.md',
            status: 'accepted',
          },
          relationships: { affectedBy: ['/src/**'] },
        },
      ],
      formatVersion: 1,
      manifest: { value: { version: 1 } },
      project: {
        content: '# Project\n\nUniversal project.\n',
        path: '/moldea/project.md',
      },
      runtimes: [
        {
          asset: {
            content: 'Node runtime guidance.\n',
            path: '/moldea/runtimes/node.md',
          },
        },
      ],
      unresolved: {
        'release-owner': {
          category: 'ownership',
          description: 'Release ownership is unresolved.',
          effect: 'warning',
          resolution: 'Assign one release owner.',
        },
      },
    });
    expect(() => JSON.stringify(project)).not.toThrow();
    const assets = [
      project.manifest.asset,
      project.project,
      ...project.context.map(({ asset }) => asset),
      ...project.decisions.map(({ decision }) => decision.asset),
      ...project.runtimes.map(({ asset }) => asset),
      ...project.agents.flatMap(({ description, handoffDescription, instruction }) => [
        description.asset,
        instruction,
        ...(handoffDescription === null ? [] : [handoffDescription.asset]),
      ]),
    ];

    expect(
      Object.fromEntries(
        assets.map(({ digest, path, scalarLength, utf8ByteLength }) => [
          path,
          { digest, scalarLength, utf8ByteLength },
        ]),
      ),
    ).toStrictEqual({
      '/moldea/agents/alpha/description.md': {
        digest: 'sha256:7710224bb7f3b89cac874f403e799bf3d9bfa551318c28c732312739373b235c',
        scalarLength: 13,
        utf8ByteLength: 13,
      },
      '/moldea/agents/alpha/handoff-description.md': {
        digest: 'sha256:3c50760556e660f7476207c76ba91a3fcdf1f8b320f542b4e9921c83802ee85a',
        scalarLength: 22,
        utf8ByteLength: 22,
      },
      '/moldea/agents/alpha/instruction.md': {
        digest: 'sha256:08bd85d6e1246e203458e6c91225d17d375b5d5d9ed94aee42457a8d3dcbd2e5',
        scalarLength: 50,
        utf8ByteLength: 50,
      },
      '/moldea/agents/zeta/description.md': {
        digest: 'sha256:c6d17a5d1c0c1002f234ee4bd06024a1a5167574653ee4d4888949b04e418882',
        scalarLength: 12,
        utf8ByteLength: 12,
      },
      '/moldea/agents/zeta/instruction.md': {
        digest: 'sha256:875a2877c0332d079797634c1e2a7b01dcccaa285b63c7fc4dba494ca1accbfa',
        scalarLength: 26,
        utf8ByteLength: 26,
      },
      '/moldea/context/security.md': {
        digest: 'sha256:7f8acd291cb86f94ab4b4c1080eeaad33dc4fcf7962082df45e3d9deb7c2412a',
        scalarLength: 18,
        utf8ByteLength: 18,
      },
      '/moldea/context/unreferenced.md': {
        digest: 'sha256:cac5a47c7541b6ef7acacc00feeeaebf1a1a157ab72ada044727baeb1f3771a0',
        scalarLength: 22,
        utf8ByteLength: 22,
      },
      '/moldea/decisions/1767225600000-use-security.md': {
        digest: 'sha256:3d57555c7b4281fb6d05ce64e8e537a52fc4580aef080508b3b5c0e6507e55a3',
        scalarLength: 86,
        utf8ByteLength: 86,
      },
      '/moldea/moldea.yaml': {
        digest: 'sha256:101738600c6df7cfd5b14625008837d9276926f1853d7212120e1594e1537352',
        scalarLength: 1315,
        utf8ByteLength: 1315,
      },
      '/moldea/project.md': {
        digest: 'sha256:5b862e20cf4653aaf9087a59a4eb66515083d052167684143396df2e8c79887e',
        scalarLength: 30,
        utf8ByteLength: 30,
      },
      '/moldea/runtimes/node.md': {
        digest: 'sha256:3d629d0d523897c03eff3ab31bf2646539bb3ca041606f7566b3ef99aaea9705',
        scalarLength: 23,
        utf8ByteLength: 23,
      },
    });
    expect(project.agents.map(({ description, id }) => ({ id, ...description }))).toMatchObject([
      { id: 'alpha', scalarLength: 12, value: 'Alpha agent.' },
      { id: 'zeta', scalarLength: 11, value: 'Zeta agent.' },
    ]);
    expect(project.agents[0]?.mirrors).toStrictEqual([
      {
        canonicalDigest: 'sha256:08bd85d6e1246e203458e6c91225d17d375b5d5d9ed94aee42457a8d3dcbd2e5',
        digest: 'sha256:08bd85d6e1246e203458e6c91225d17d375b5d5d9ed94aee42457a8d3dcbd2e5',
        path: '/apps/alpha.md',
      },
    ]);
    expect(JSON.parse(JSON.stringify(project.unresolved))).toStrictEqual({
      'release-owner': {
        category: 'ownership',
        description: 'Release ownership is unresolved.',
        effect: 'warning',
        related: [{ path: '/src/release.ts' }],
        resolution: 'Assign one release owner.',
      },
    });
    expect(Object.isFrozen(project.agents[0]?.instruction)).toBe(true);
    expect(Object.isFrozen(project.context[0]?.relationships)).toBe(true);
  });

  test('is independent of repository insertion and enumeration order', async () => {
    const case_ = getFixtureCase('complete universal project');
    const entries = createEntries(case_);
    const expected = await inspectUniversalProject(
      { repository: createMemoryRepositoryReader(entries) },
      options,
    );
    const reordered = await inspectUniversalProject(
      {
        repository: reverseEnumeration(createMemoryRepositoryReader([...entries].reverse())),
      },
      options,
    );

    expect(reordered).toStrictEqual(expected);
  });

  test('reads each indexed source file once through the shared inspection session', async () => {
    const case_ = getFixtureCase('complete universal project');
    const repository = createMemoryRepositoryReader(createEntries(case_));
    const readCounts = new Map<IRepositoryPath, number>();
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: (path, operationOptions) => {
        readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
        return repository.readFile(path, operationOptions);
      },
    };

    await inspectUniversalProject({ repository: observedRepository }, options);

    expect(Object.fromEntries(readCounts)).toStrictEqual({
      '/apps/alpha.md': 1,
      '/moldea/agents/alpha/description.md': 1,
      '/moldea/agents/alpha/handoff-description.md': 1,
      '/moldea/agents/alpha/instruction.md': 1,
      '/moldea/agents/zeta/description.md': 1,
      '/moldea/agents/zeta/instruction.md': 1,
      '/moldea/context/security.md': 1,
      '/moldea/context/unreferenced.md': 1,
      '/moldea/decisions/1767225600000-use-security.md': 1,
      '/moldea/moldea.yaml': 1,
      '/moldea/project.md': 1,
      '/moldea/runtimes/node.md': 1,
    });
  });

  test('skips manifest-dependent agent interpretation after manifest failure', async () => {
    const case_ = getFixtureCase('invalid manifest with independent failures');
    const result = await inspectUniversalProject(
      { repository: createMemoryRepositoryReader(createEntries(case_)) },
      options,
    );

    expect(result.diagnostics.some(({ code }) => code.includes('AGENT'))).toBe(false);
    expect(result.diagnostics).toMatchObject([
      { code: 'MOLDEA_CONTEXT_FILE_EMPTY' },
      { code: 'MOLDEA_DECISION_SUPERSEDED_ORPHAN' },
      { code: 'MOLDEA_MANIFEST_PROPERTY_UNKNOWN' },
      { code: 'MOLDEA_PROJECT_FILE_EMPTY' },
      { code: 'MOLDEA_RUNTIME_GUIDANCE_EMPTY' },
    ]);
  });

  test('rejects pre-aborted inspection before accessing the repository', async () => {
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));
    let hasAccessedRepository = false;
    const repository: IRepositoryReader = {
      getEntry: () => {
        hasAccessedRepository = true;
        return Promise.resolve(null);
      },
      listEntries: () => {
        hasAccessedRepository = true;
        throw new TypeError('The aborted repository must not be listed.');
      },
      readFile: () => {
        hasAccessedRepository = true;
        return Promise.resolve(new Uint8Array());
      },
    };

    await expect(
      inspectUniversalProject({ repository, signal: controller.signal }, options),
    ).rejects.toMatchObject({
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: false,
    });
    expect(hasAccessedRepository).toBe(false);
  });

  test('preserves repository source exceptions unchanged', async () => {
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'get-entry',
      path: parseRepositoryPath('/moldea'),
      retryable: true,
    });
    const repository: IRepositoryReader = {
      getEntry: () => Promise.reject(sourceFailure),
      listEntries: () => {
        throw new TypeError('The failed repository must not be listed.');
      },
      readFile: () => Promise.resolve(new Uint8Array()),
    };

    await expect(inspectUniversalProject({ repository }, options)).rejects.toBe(sourceFailure);
  });

  test('reads and parses foundation files before canonical enumeration', async () => {
    const repository = createMemoryRepositoryReader([
      { content: 'version: 1\n', path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
    ]);
    const operations: string[] = [];
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => {
        operations.push(`get:${path}`);
        return repository.getEntry(path, operationOptions);
      },
      listEntries: (operationOptions) => {
        operations.push(`list:${operationOptions?.prefix ?? '/'}`);
        return repository.listEntries(operationOptions);
      },
      readFile: (path, operationOptions) => {
        operations.push(`read:${path}`);
        return repository.readFile(path, operationOptions);
      },
    };

    await inspectUniversalProject({ repository: observedRepository }, options);

    expect(operations).toStrictEqual([
      'get:/moldea',
      'get:/moldea/moldea.yaml',
      'read:/moldea/moldea.yaml',
      'get:/moldea/project.md',
      'read:/moldea/project.md',
      'list:/moldea',
    ]);
  });

  test('preserves a manifest read failure without starting canonical enumeration', async () => {
    const repository = createMemoryRepositoryReader([
      { content: 'version: 1\n', path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
    ]);
    const manifestFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: manifestPath,
      retryable: true,
    });
    let hasStartedEnumeration = false;
    const failingRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: () => {
        hasStartedEnumeration = true;
        throw new TypeError('Canonical enumeration must not start after a manifest read failure.');
      },
      readFile: (path, operationOptions) =>
        path === manifestPath
          ? Promise.reject(manifestFailure)
          : repository.readFile(path, operationOptions),
    };

    await expect(inspectUniversalProject({ repository: failingRepository }, options)).rejects.toBe(
      manifestFailure,
    );
    expect(hasStartedEnumeration).toBe(false);
  });

  test('enforces the diagnostic limit across independently valid phases', async () => {
    const manifest = 'version: 1\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: ' ', path: '/moldea/project.md', type: 'file' },
      { content: ' ', path: '/moldea/runtimes/empty.md', type: 'file' },
      {
        content: '---\nstatus: accepted\ncreatedAt: "2026-01-01T00:00:00.000Z"\n---\n \n',
        path: '/moldea/decisions/1767225600000-empty.md',
        type: 'file',
      },
    ]);

    await expect(
      inspectUniversalProject(
        { repository },
        normalizeCoreOptions({ limits: { maxDiagnostics: 2 } }),
      ),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'inspect-project',
      retryable: false,
    });
  });

  test('attributes manifest diagnostic overflow to project inspection', async () => {
    const sourceRepository = createMemoryRepositoryReader([
      {
        content: 'version: 1\nfirst: true\nsecond: true\n',
        path: manifestPath,
        type: 'file',
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
    ]);
    let hasAccessedProject = false;
    const repository: IRepositoryReader = {
      getEntry: (path, operationOptions) => {
        if (path === '/moldea/project.md') {
          hasAccessedProject = true;
        }

        return sourceRepository.getEntry(path, operationOptions);
      },
      listEntries: (operationOptions) => sourceRepository.listEntries(operationOptions),
      readFile: (path, operationOptions) => sourceRepository.readFile(path, operationOptions),
    };

    await expect(
      inspectUniversalProject(
        { repository },
        normalizeCoreOptions({ limits: { maxDiagnostics: 1 } }),
      ),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxDiagnostics',
      operation: 'inspect-project',
      retryable: false,
    });
    expect(hasAccessedProject).toBe(false);
  });
});
