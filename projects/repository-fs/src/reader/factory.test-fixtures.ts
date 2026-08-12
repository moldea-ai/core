import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import type { IRepositoryReaderCasePathFixture } from '../../../repository/src/conformance/reader-conformance.test-utilities.js';

interface ICanonicalDirectoryEntry {
  readonly path: string;
  readonly type: 'directory';
}

interface ICanonicalFileEntry {
  readonly bytes?: readonly number[];
  readonly path: string;
  readonly text?: string;
  readonly type: 'file';
}

interface ICanonicalSymlinkEntry {
  readonly path: string;
  readonly type: 'symlink';
}

type ICanonicalEntry = ICanonicalDirectoryEntry | ICanonicalFileEntry | ICanonicalSymlinkEntry;

interface ICanonicalFixture {
  readonly entries: readonly ICanonicalEntry[];
}

// one materialized filesystem snapshot and its host-dependent logical contract
export interface IFilesystemRepositoryTestSnapshot {
  readonly casePaths: IRepositoryReaderCasePathFixture;
  readonly expectedEntries: readonly IRepositoryEntry[];
  readonly fileBytes: Uint8Array;
  readonly rootDirectory: string;
  readonly unicodePath: string;
}

// independent snapshots used by the public-factory suite
export interface IFilesystemRepositoryTestFixtures {
  readonly cleanup: () => Promise<void>;
  readonly primary: IFilesystemRepositoryTestSnapshot;
  readonly mutation: IFilesystemRepositoryTestSnapshot;
  readonly recovery: IFilesystemRepositoryTestSnapshot;
}

const canonicalFixturePath = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'repository-reader',
  'valid-snapshot.json',
);
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Returns whether an unknown filesystem failure represents an absent path. */
const isMissingHostPathError = (cause: unknown): boolean => {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    Reflect.get(cause, 'code') === 'ENOENT'
  );
};

/** Converts one logical fixture path into a child of the selected host root. */
const resolveFixtureHostPath = (rootDirectory: string, logicalPath: string): string => {
  return path.join(rootDirectory, ...logicalPath.slice(1).split('/'));
};

/** Reads the canonical repository-reader fixture contract. */
const readCanonicalFixture = async (): Promise<ICanonicalFixture> => {
  const candidate = JSON.parse(await readFile(canonicalFixturePath, 'utf8')) as unknown;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('entries' in candidate) ||
    !Array.isArray(Reflect.get(candidate, 'entries'))
  ) {
    throw new Error('The canonical repository-reader fixture is invalid.');
  }

  return candidate as ICanonicalFixture;
};

/** Adds every non-root directory parent required by one logical entry. */
const addExpectedDirectoryParents = (
  entriesByPath: Map<IRepositoryPath, IRepositoryEntry>,
  logicalPath: IRepositoryPath,
): void => {
  const segments = logicalPath.slice(1).split('/');

  for (let segmentCount = 1; segmentCount < segments.length; segmentCount += 1) {
    const directoryPath = parseRepositoryPath(`/${segments.slice(0, segmentCount).join('/')}`);

    entriesByPath.set(directoryPath, { path: directoryPath, type: 'directory' });
  }
};

/** Creates one regular fixture file after ensuring its parent exists. */
const writeCanonicalFile = async (
  rootDirectory: string,
  entry: ICanonicalFileEntry,
): Promise<void> => {
  const hostPath = resolveFixtureHostPath(rootDirectory, entry.path);
  const content = entry.bytes === undefined ? entry.text : new Uint8Array(entry.bytes);

  if (content === undefined || (entry.bytes !== undefined && entry.text !== undefined)) {
    throw new Error(`The canonical fixture file ${entry.path} has invalid content.`);
  }

  await mkdir(path.dirname(hostPath), { recursive: true });
  await writeFile(hostPath, content);
};

/** Materializes one canonical snapshot without assuming host case behavior. */
const materializeFilesystemRepositorySnapshot = async (
  suiteDirectory: string,
  snapshotName: string,
  canonicalFixture: ICanonicalFixture,
): Promise<IFilesystemRepositoryTestSnapshot> => {
  const rootDirectory = path.join(suiteDirectory, snapshotName);
  const linkTargetDirectory = path.join(suiteDirectory, `${snapshotName}-link-target`);

  await mkdir(rootDirectory);
  await mkdir(linkTargetDirectory);

  const upperCaseEntry = canonicalFixture.entries.find((entry) => entry.path === '/Case.txt');
  const lowerCaseEntry = canonicalFixture.entries.find((entry) => entry.path === '/case.txt');
  const unicodeEntry = canonicalFixture.entries.find(
    (entry) => entry.path === '/unicode/café-😀.txt',
  );
  const symlinkEntry = canonicalFixture.entries.find((entry) => entry.type === 'symlink');

  if (
    upperCaseEntry?.type !== 'file' ||
    lowerCaseEntry?.type !== 'file' ||
    unicodeEntry?.type !== 'file' ||
    symlinkEntry === undefined
  ) {
    throw new Error('The canonical repository-reader fixture is incomplete.');
  }

  for (const entry of canonicalFixture.entries) {
    if (
      entry.path === upperCaseEntry.path ||
      entry.path === lowerCaseEntry.path ||
      entry.path === unicodeEntry.path ||
      entry.path === symlinkEntry.path
    ) {
      continue;
    }

    const hostPath = resolveFixtureHostPath(rootDirectory, entry.path);

    if (entry.type === 'directory') {
      await mkdir(hostPath, { recursive: true });
    } else if (entry.type === 'file') {
      await writeCanonicalFile(rootDirectory, entry);
    }
  }

  await writeCanonicalFile(rootDirectory, upperCaseEntry);

  const lowerCaseHostPath = resolveFixtureHostPath(rootDirectory, lowerCaseEntry.path);
  let isCaseDistinct = false;

  try {
    await readFile(lowerCaseHostPath);
  } catch (cause) {
    if (!isMissingHostPathError(cause)) {
      throw cause;
    }

    await writeCanonicalFile(rootDirectory, lowerCaseEntry);
    isCaseDistinct = true;
  }

  await writeCanonicalFile(rootDirectory, unicodeEntry);
  const unicodeDirectory = path.dirname(resolveFixtureHostPath(rootDirectory, unicodeEntry.path));
  const unicodeNames = await readdir(unicodeDirectory, { encoding: 'buffer' });

  if (unicodeNames.length !== 1 || unicodeNames[0] === undefined) {
    throw new Error('The materialized Unicode fixture directory is not deterministic.');
  }

  const actualUnicodePath = parseRepositoryPath(`/unicode/${textDecoder.decode(unicodeNames[0])}`);
  const symlinkHostPath = resolveFixtureHostPath(rootDirectory, symlinkEntry.path);

  await symlink(
    linkTargetDirectory,
    symlinkHostPath,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  const entriesByPath = new Map<IRepositoryPath, IRepositoryEntry>();

  for (const entry of canonicalFixture.entries) {
    if (!isCaseDistinct && entry.path === lowerCaseEntry.path) {
      continue;
    }

    const logicalPath =
      entry.path === unicodeEntry.path ? actualUnicodePath : parseRepositoryPath(entry.path);

    addExpectedDirectoryParents(entriesByPath, logicalPath);
    entriesByPath.set(logicalPath, { path: logicalPath, type: entry.type });
  }

  const fileEntry = canonicalFixture.entries.find(
    (entry) => entry.path === '/nested/deep/data.bin',
  );

  if (fileEntry?.type !== 'file' || fileEntry.bytes === undefined) {
    throw new Error('The canonical byte fixture is missing.');
  }

  const casePaths: IRepositoryReaderCasePathFixture = isCaseDistinct
    ? { kind: 'distinct', paths: ['/Case.txt', '/case.txt'] }
    : { existingPath: '/Case.txt', kind: 'mismatch', missingPath: '/case.txt' };

  return Object.freeze({
    casePaths,
    expectedEntries: Object.freeze([...entriesByPath.values()]),
    fileBytes: new Uint8Array(fileEntry.bytes),
    rootDirectory,
    unicodePath: actualUnicodePath,
  });
};

/**
 * Creates the independent real-filesystem snapshots needed by the public reader tests.
 * @returns The isolated snapshots and idempotent cleanup operation.
 */
export const createFilesystemRepositoryTestFixtures =
  async (): Promise<IFilesystemRepositoryTestFixtures> => {
    const suiteDirectory = await mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-reader-'));

    try {
      const canonicalFixture = await readCanonicalFixture();
      const primary = await materializeFilesystemRepositorySnapshot(
        suiteDirectory,
        'primary',
        canonicalFixture,
      );
      const mutation = await materializeFilesystemRepositorySnapshot(
        suiteDirectory,
        'mutation',
        canonicalFixture,
      );
      const recovery = await materializeFilesystemRepositorySnapshot(
        suiteDirectory,
        'recovery',
        canonicalFixture,
      );

      return Object.freeze({
        cleanup: () => rm(suiteDirectory, { force: true, recursive: true }),
        mutation,
        primary,
        recovery,
      });
    } catch (cause) {
      await rm(suiteDirectory, { force: true, recursive: true });
      throw cause;
    }
  };
