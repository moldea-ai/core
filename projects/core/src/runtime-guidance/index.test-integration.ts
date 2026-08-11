// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { discoverCanonicalAssets } from '../canonical-discovery/index.js';
import { createCore } from '../core/index.js';
import type { ICoreDiagnostic } from '../diagnostics/index.js';
import { normalizeCoreOptions } from '../options/index.js';

import { readRuntimeGuidance } from './index.js';

interface IFixtureEntry {
  readonly path: string;
  readonly type: 'file';
  readonly text: string;
}

interface IExpectedDiagnostic {
  readonly code: string;
  readonly details: Readonly<Record<string, string>>;
  readonly entity: Readonly<Record<string, string>> | null;
  readonly path: string;
  readonly pointer: string | null;
}

interface IRuntimeGuidanceFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly manifest: string;
    readonly entries: readonly IFixtureEntry[];
    readonly expectedRuntimes: readonly {
      readonly path: string;
      readonly content: string;
    }[];
    readonly expectedDiagnostics: readonly IExpectedDiagnostic[];
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/core/runtime-guidance/cases.json', import.meta.url),
    'utf8',
  ),
) as IRuntimeGuidanceFixture;
const options = normalizeCoreOptions(undefined);
const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

const createEntries = (
  fixtureCase: IRuntimeGuidanceFixture['cases'][number],
): readonly IMemoryRepositoryEntry[] => [
  { content: fixtureCase.manifest, path: manifestPath, type: 'file' },
  { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
  ...fixtureCase.entries.map((entry): IMemoryRepositoryEntry => ({
    content: entry.text,
    path: entry.path,
    type: entry.type,
  })),
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

const simplifyDiagnostics = (diagnostics: readonly ICoreDiagnostic[]) => {
  return diagnostics.map(({ code, details, entity, path, pointer }) => ({
    code,
    details: { ...details },
    entity: entity === null ? null : { ...entity },
    path,
    pointer,
  }));
};

const inspectFixture = async (repository: IRepositoryReader, manifestContent: string) => {
  const discovery = await discoverCanonicalAssets(repository, options.limits);
  const manifestResult = await createCore().parseManifest({
    content: manifestContent,
    path: manifestPath,
  });

  expect(discovery.diagnostics).toStrictEqual([]);
  expect(manifestResult.diagnostics).toStrictEqual([]);
  if (manifestResult.manifest === null) {
    throw new TypeError('The runtime-guidance fixture manifest must be valid.');
  }

  return readRuntimeGuidance(repository, manifestPath, manifestResult.manifest, discovery, options);
};

describe('Core runtime guidance through the memory repository reader', () => {
  test.each(fixture.cases)('returns exact repository-level results for $name', async (case_) => {
    const result = await inspectFixture(
      createMemoryRepositoryReader(createEntries(case_)),
      case_.manifest,
    );

    expect(
      result.runtimes.map(({ asset }) => ({ content: asset.content, path: asset.path })),
    ).toStrictEqual(case_.expectedRuntimes);
    expect(simplifyDiagnostics(result.diagnostics)).toStrictEqual(case_.expectedDiagnostics);
    expect(result.valid).toBe(case_.expectedDiagnostics.length === 0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.runtimes)).toBe(true);
  });

  test('is independent of repository insertion and enumeration order', async () => {
    const case_ = fixture.cases.find(({ name }) => name === 'referenced and unreferenced guidance');

    if (case_ === undefined) {
      throw new TypeError('The valid runtime-guidance fixture is required.');
    }

    const entries = createEntries(case_);
    const expected = await inspectFixture(createMemoryRepositoryReader(entries), case_.manifest);
    const reordered = await inspectFixture(
      reverseEnumeration(createMemoryRepositoryReader([...entries].reverse())),
      case_.manifest,
    );

    expect(reordered).toStrictEqual(expected);
  });

  test('reads every discovered file once even when guidance is shared', async () => {
    const sharedPath = parseRepositoryPath('/moldea/runtimes/shared.md');
    const manifest =
      'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n      guidance: /moldea/runtimes/shared.md\n  beta:\n    framework:\n      id: custom\n      guidance: /moldea/runtimes/shared.md\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { content: 'Shared runtime.\n', path: sharedPath, type: 'file' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });
    const readPaths: IRepositoryPath[] = [];
    const observedRepository: IRepositoryReader = {
      getEntry: (path, operationOptions) => repository.getEntry(path, operationOptions),
      listEntries: (operationOptions) => repository.listEntries(operationOptions),
      readFile: (path, operationOptions) => {
        readPaths.push(path);
        return repository.readFile(path, operationOptions);
      },
    };

    if (manifestResult.manifest === null) {
      throw new TypeError('The shared-guidance manifest must be valid.');
    }

    await readRuntimeGuidance(
      observedRepository,
      manifestPath,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(readPaths).toStrictEqual([sharedPath]);
  });

  test('suppresses missing-reference cascades for discovery-owned target failures', async () => {
    const symlinkPath = parseRepositoryPath('/moldea/runtimes/symlink.md');
    const wrongTypePath = parseRepositoryPath('/moldea/runtimes/directory.md');
    const manifest =
      'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n      guidance: /moldea/runtimes/symlink.md\n  beta:\n    framework:\n      id: custom\n      guidance: /moldea/runtimes/directory.md\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { path: symlinkPath, type: 'symlink' },
      { path: wrongTypePath, type: 'directory' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });

    expect(discovery.diagnostics).toMatchObject([
      { code: 'MOLDEA_ENTRY_TYPE_INVALID', path: wrongTypePath },
      { code: 'MOLDEA_CANONICAL_ASSET_SYMLINK', path: symlinkPath },
    ]);
    if (manifestResult.manifest === null) {
      throw new TypeError('The blocked-guidance manifest must be valid.');
    }

    const result = await readRuntimeGuidance(
      repository,
      manifestPath,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(result).toMatchObject({ diagnostics: [], runtimes: [], valid: true });
  });

  test('suppresses missing-reference cascades beneath a blocked structural parent', async () => {
    const runtimesPath = parseRepositoryPath('/moldea/runtimes');
    const manifest =
      'version: 1\nagents:\n  alpha:\n    framework:\n      id: custom\n      guidance: /moldea/runtimes/nested/alpha.md\n';
    const repository = createMemoryRepositoryReader([
      { content: manifest, path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { path: runtimesPath, type: 'symlink' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const manifestResult = await createCore().parseManifest({
      content: manifest,
      path: manifestPath,
    });

    expect(discovery.diagnostics).toMatchObject([
      { code: 'MOLDEA_ENTRY_TYPE_INVALID', path: runtimesPath },
    ]);
    if (manifestResult.manifest === null) {
      throw new TypeError('The blocked-runtime-parent manifest must be valid.');
    }

    const result = await readRuntimeGuidance(
      repository,
      manifestPath,
      manifestResult.manifest,
      discovery,
      options,
    );

    expect(result).toMatchObject({ diagnostics: [], runtimes: [], valid: true });
  });

  test('validates discovered guidance content when the manifest is unavailable', async () => {
    const emptyPath = parseRepositoryPath('/moldea/runtimes/empty.md');
    const repository = createMemoryRepositoryReader([
      { content: 'version: 1\nunknown: true\n', path: manifestPath, type: 'file' },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      { content: '\t\r\n', path: emptyPath, type: 'file' },
    ]);
    const discovery = await discoverCanonicalAssets(repository, options.limits);
    const result = await readRuntimeGuidance(repository, manifestPath, null, discovery, options);

    expect(result.runtimes).toStrictEqual([]);
    expect(result.diagnostics).toMatchObject([
      { code: 'MOLDEA_RUNTIME_GUIDANCE_EMPTY', path: emptyPath },
    ]);
  });
});
