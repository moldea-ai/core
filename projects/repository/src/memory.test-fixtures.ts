import { readFileSync } from 'node:fs';

import type { IMemoryRepositoryEntry } from './memory.js';

interface IFixtureEntry {
  readonly bytes?: readonly number[];
  readonly path: string;
  readonly text?: string;
  readonly type: string;
}

interface IInvalidDefinitionsFixture {
  readonly cases: readonly {
    readonly entries: readonly IFixtureEntry[];
    readonly expectedPath: string;
    readonly name: string;
  }[];
  readonly invalidPathEntries: readonly IFixtureEntry[];
}

interface IValidSnapshotFixture {
  readonly entries: readonly IFixtureEntry[];
}

const readJSONFixture = <T>(relativePath: string): T => {
  const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

  return JSON.parse(contents) as T;
};

const invalidDefinitions = readJSONFixture<IInvalidDefinitionsFixture>(
  '../../../fixtures/repository-reader/invalid-memory-definitions.json',
);
const validSnapshot = readJSONFixture<IValidSnapshotFixture>(
  '../../../fixtures/repository-reader/valid-snapshot.json',
);

const toMemoryEntry = (entry: IFixtureEntry): IMemoryRepositoryEntry => {
  switch (entry.type) {
    case 'directory':
      return { path: entry.path, type: 'directory' };
    case 'symlink':
      return { path: entry.path, type: 'symlink' };
    case 'file':
      if (entry.text !== undefined) {
        return { content: entry.text, path: entry.path, type: 'file' };
      }

      if (entry.bytes !== undefined) {
        return { content: new Uint8Array(entry.bytes), path: entry.path, type: 'file' };
      }

      throw new TypeError('A file fixture must define text or bytes.');
    default:
      throw new TypeError('A repository fixture contains an unknown entry type.');
  }
};

/** @returns Fresh memory entries for the shared valid repository snapshot fixture. */
export const createValidMemoryEntries = (): readonly IMemoryRepositoryEntry[] => {
  return validSnapshot.entries.map(toMemoryEntry);
};

// invalid memory definitions expected to fail with source-data exceptions
export const invalidMemoryDefinitionCases = invalidDefinitions.cases.map((fixtureCase) => ({
  entries: fixtureCase.entries.map(toMemoryEntry),
  expectedPath: fixtureCase.expectedPath,
  name: fixtureCase.name,
}));

// invalid logical-path definitions expected to fail with a path exception
export const invalidPathMemoryEntries = invalidDefinitions.invalidPathEntries.map(toMemoryEntry);
