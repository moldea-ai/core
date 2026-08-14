// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import { createCore } from '../core/index.js';

import { discoverCanonicalAssets } from './index.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'symlink';
  readonly text?: string;
}

interface IExpectedDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly details: Readonly<Record<string, string>>;
}

interface IInvalidLayoutsFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly entries: readonly IFixtureEntry[];
    readonly expectedDiagnostics: readonly IExpectedDiagnostic[];
  }[];
}

interface IValidProjectFixture {
  readonly entries: readonly IFixtureEntry[];
  readonly expectedInventory: Readonly<Record<string, unknown>>;
}

const readJsonFixture = <Fixture>(relativePath: string): Fixture => {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Fixture;
};

const invalidLayouts = readJsonFixture<IInvalidLayoutsFixture>(
  '../../../../fixtures/core/discovery/invalid-layouts.json',
);
const validProject = readJsonFixture<IValidProjectFixture>(
  '../../../../fixtures/core/discovery/valid-project.json',
);

const toMemoryEntries = (entries: readonly IFixtureEntry[]): readonly IMemoryRepositoryEntry[] => {
  return entries.map((entry) => {
    if (entry.type === 'file') {
      if (entry.text === undefined) {
        throw new TypeError('A discovery file fixture must include text.');
      }

      return { content: entry.text, path: entry.path, type: 'file' };
    }

    return { path: entry.path, type: entry.type };
  });
};

const simplifyDiagnostics = (
  diagnostics: Awaited<ReturnType<typeof discoverCanonicalAssets>>['diagnostics'],
) => {
  return diagnostics.map(({ code, details, path }) => ({ code, details: { ...details }, path }));
};

const reverseEnumeration = (repository: IRepositoryReader): IRepositoryReader => ({
  getEntry: (path, options) => repository.getEntry(path, options),
  listEntries: (options): AsyncIterable<IRepositoryEntry> => ({
    async *[Symbol.asyncIterator]() {
      const entries: IRepositoryEntry[] = [];

      for await (const entry of repository.listEntries(options)) {
        entries.push(entry);
      }

      for (const entry of entries.reverse()) {
        yield entry;
      }
    },
  }),
  readFile: (path, options) => repository.readFile(path, options),
});

describe('Core canonical discovery through the memory repository reader', () => {
  test('discovers one sorted deeply immutable canonical inventory', async () => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(validProject.entries));
    const result = await discoverCanonicalAssets(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(result).toMatchObject({ diagnostics: [], valid: true });
    expect(result.inventory).toStrictEqual(validProject.expectedInventory);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.inventory)).toBe(true);
    expect(Object.isFrozen(result.inventory.context)).toBe(true);
    expect(Object.isFrozen(result.inventory.agents[0])).toBe(true);
  });

  test.each(invalidLayouts.cases)('reports exact diagnostics for $name', async (fixtureCase) => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(fixtureCase.entries));
    const result = await discoverCanonicalAssets(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(result.valid).toBe(false);
    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual(fixtureCase.expectedDiagnostics);
  });

  test('is independent of repository enumeration order', async () => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(validProject.entries));
    const expected = await discoverCanonicalAssets(repository, DEFAULT_CORE_RESOURCE_LIMITS);
    const reordered = await discoverCanonicalAssets(
      reverseEnumeration(repository),
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(reordered).toStrictEqual(expected);
  });

  test('ignores empty noncanonical directory records that cannot represent committed files', async () => {
    const repository = createMemoryRepositoryReader([
      { content: 'version: 1\n', path: '/moldea/moldea.yaml', type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { path: '/moldea/local-empty-directory', type: 'directory' },
    ]);
    const result = await discoverCanonicalAssets(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(result).toMatchObject({ diagnostics: [], valid: true });
    expect(result.inventory).toMatchObject({
      context: [],
      decisions: [],
      runtimeGuidance: [],
    });
  });

  test('feeds discovered manifest and decision assets into the existing document parsers', async () => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(validProject.entries));
    const discovery = await discoverCanonicalAssets(repository, DEFAULT_CORE_RESOURCE_LIMITS);
    const manifestPath = discovery.inventory.manifest;

    if (manifestPath === null) {
      throw new TypeError('The valid discovery fixture must include the manifest.');
    }

    const core = createCore();
    const manifest = await core.parseManifest({
      content: await repository.readFile(manifestPath),
      path: manifestPath,
    });
    const decisions = await Promise.all(
      discovery.inventory.decisions.map(async (path) => {
        return core.parseDecision({ content: await repository.readFile(path), path });
      }),
    );

    expect(manifest).toMatchObject({ diagnostics: [], valid: true });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ diagnostics: [], valid: true });
  });

  test('retains immediate decision candidates for document-specific filename diagnostics', async () => {
    const decisionPath = parseRepositoryPath('/moldea/decisions/not-a-canonical-decision.md');
    const repository = createMemoryRepositoryReader([
      { content: 'version: 1\n', path: '/moldea/moldea.yaml', type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      {
        content: '---\nstatus: accepted\ncreatedAt: "2026-08-07T19:42:03.456Z"\n---\nBody.\n',
        path: decisionPath,
        type: 'file',
      },
    ]);
    const discovery = await discoverCanonicalAssets(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    expect(discovery).toMatchObject({ diagnostics: [], valid: true });
    expect(discovery.inventory.decisions).toStrictEqual([decisionPath]);

    const decision = await createCore().parseDecision({
      content: await repository.readFile(decisionPath),
      path: decisionPath,
    });

    expect(decision).toMatchObject({
      decision: null,
      diagnostics: [{ code: 'MOLDEA_DECISION_FILENAME_INVALID', path: decisionPath }],
      valid: false,
    });
  });

  test('forwards cancellation to the repository reader', async () => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(validProject.entries));
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));
    const discovery = discoverCanonicalAssets(
      repository,
      DEFAULT_CORE_RESOURCE_LIMITS,
      controller.signal,
    );

    await expect(discovery).rejects.toBeInstanceOf(RepositorySourceException);
    await expect(discovery).rejects.toMatchObject({
      code: 'ABORTED',
      operation: 'get-entry',
      path: parseRepositoryPath('/moldea'),
    });
  });

  test('preserves repository source failures without translating them into diagnostics', async () => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(validProject.entries));
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'list-entries',
      path: parseRepositoryPath('/moldea'),
      retryable: false,
    });
    const failingRepository: IRepositoryReader = {
      getEntry: (path, options) => repository.getEntry(path, options),
      listEntries: () => {
        throw sourceFailure;
      },
      readFile: (path, options) => repository.readFile(path, options),
    };

    await expect(
      discoverCanonicalAssets(failingRepository, DEFAULT_CORE_RESOURCE_LIMITS),
    ).rejects.toBe(sourceFailure);
  });

  test('rejects reader entries that violate the source-neutral contract', async () => {
    const repository = createMemoryRepositoryReader(toMemoryEntries(validProject.entries));
    const invalidRepository: IRepositoryReader = {
      getEntry: async (path, options) => {
        if (path === '/moldea/moldea.yaml') {
          return { path: parseRepositoryPath('/moldea/project.md'), type: 'file' };
        }

        return repository.getEntry(path, options);
      },
      listEntries: (options) => repository.listEntries(options),
      readFile: (path, options) => repository.readFile(path, options),
    };

    await expect(
      discoverCanonicalAssets(invalidRepository, DEFAULT_CORE_RESOURCE_LIMITS),
    ).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'get-entry',
      path: parseRepositoryPath('/moldea/project.md'),
    });
  });
});
