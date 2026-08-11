// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { type IRepositoryEntry, type IRepositoryReader } from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

import { discoverCanonicalAssets } from './canonical-discovery.js';
import { createCore } from './core.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { normalizeCoreOptions } from './options.js';
import { createRepositoryInspectionSession } from './repository-inspection-session.js';
import { validateRepositoryReferences } from './repository-reference-validation.js';

interface IExpectedDiagnostic {
  readonly code: string;
  readonly details: Readonly<Record<string, string>>;
  readonly entity: Readonly<Record<string, string>> | null;
  readonly path: string;
  readonly pointer: string | null;
}

interface IRepositoryReferenceFixture {
  readonly cases: readonly {
    readonly name: string;
    readonly manifest: string;
    readonly entries: readonly IMemoryRepositoryEntry[];
    readonly expectedDiagnostics: readonly IExpectedDiagnostic[];
  }[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/core/repository-references/cases.json', import.meta.url),
    'utf8',
  ),
) as IRepositoryReferenceFixture;
const options = normalizeCoreOptions(undefined);

const createRepositoryEntries = (
  fixtureCase: IRepositoryReferenceFixture['cases'][number],
): readonly IMemoryRepositoryEntry[] => [
  { content: fixtureCase.manifest, path: '/moldea/moldea.yaml', type: 'file' },
  { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
  ...fixtureCase.entries,
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

const validateFixture = async (sourceRepository: IRepositoryReader) => {
  const session = createRepositoryInspectionSession(sourceRepository, options.limits);
  const discovery = await discoverCanonicalAssets(session.reader, options.limits);
  const manifestPath = discovery.inventory.manifest;

  expect(discovery.diagnostics).toStrictEqual([]);
  if (manifestPath === null) {
    throw new TypeError('The repository-reference fixture must include a manifest.');
  }

  const manifestResult = await createCore().parseManifest({
    content: await session.reader.readFile(manifestPath),
    path: manifestPath,
  });

  expect(manifestResult.diagnostics).toStrictEqual([]);
  if (manifestResult.manifest === null) {
    throw new TypeError('The repository-reference fixture manifest must be valid.');
  }

  return validateRepositoryReferences(
    session.reader,
    manifestPath,
    manifestResult.manifest,
    discovery,
    options.limits,
  );
};

describe('Core repository references through the memory repository reader', () => {
  test.each(fixture.cases)('returns exact repository diagnostics for $name', async (case_) => {
    const repository = createMemoryRepositoryReader(createRepositoryEntries(case_));
    const diagnostics = await validateFixture(repository);

    expect(simplifyDiagnostics(diagnostics)).toStrictEqual(case_.expectedDiagnostics);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
  });

  test('is independent of repository enumeration and fixture insertion order', async () => {
    const fixtureCase = fixture.cases[1];
    if (fixtureCase === undefined) {
      throw new TypeError('The invalid repository-reference fixture is required.');
    }

    const entries = createRepositoryEntries(fixtureCase);
    const expected = await validateFixture(createMemoryRepositoryReader(entries));
    const reorderedRepository = reverseEnumeration(
      createMemoryRepositoryReader([...entries].reverse()),
    );

    expect(await validateFixture(reorderedRepository)).toStrictEqual(expected);
  });
});
