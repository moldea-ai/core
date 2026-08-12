// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  REPOSITORY_ROOT,
  RepositoryPathException,
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
} from '@moldea.ai/repository';
import { afterAll, describe, expect, test } from 'vitest';
import { expectToRejectCode } from 'web-utils-kit';

import { describeRepositoryReaderConformance } from '../../../repository/src/conformance/reader-conformance.test-utilities.js';
import { createFilesystemRepositoryTestFixtures } from './factory.test-fixtures.js';
import { createFilesystemRepositoryReader } from './factory.js';

const fixtures = await createFilesystemRepositoryTestFixtures();

afterAll(async () => {
  await fixtures.cleanup();
});

/** Collects one reader listing into a detached array. */
const collectEntries = async (
  entries: AsyncIterable<IRepositoryEntry>,
): Promise<IRepositoryEntry[]> => {
  const collected: IRepositoryEntry[] = [];

  for await (const entry of entries) {
    collected.push(entry);
  }

  return collected;
};

describeRepositoryReaderConformance('filesystem', {
  casePaths: fixtures.primary.casePaths,
  createReader: () =>
    createFilesystemRepositoryReader({
      rootDirectory: fixtures.primary.rootDirectory,
      selection: { kind: 'directory' },
    }),
  createSnapshotMutationFixture: async () => {
    const reader = await createFilesystemRepositoryReader({
      rootDirectory: fixtures.mutation.rootDirectory,
      selection: { kind: 'directory' },
    });

    return {
      behavior: 'preserve-snapshot',
      mutateSource: () =>
        writeFile(
          path.join(fixtures.mutation.rootDirectory, 'nested', 'deep', 'data.bin'),
          new Uint8Array([99]),
        ),
      reader,
    };
  },
  emptyFilePath: '/empty.bin',
  expectedEntries: fixtures.primary.expectedEntries,
  fileBytes: fixtures.primary.fileBytes,
  filePath: '/nested/deep/data.bin',
  isRepositoryPathException: (cause) => cause instanceof RepositoryPathException,
  isRepositorySourceException: (cause) => cause instanceof RepositorySourceException,
  missingPath: '/missing.txt',
  nestedDirectoryPath: '/nested',
  nestedExpectedPaths: ['/nested/deep', '/nested/deep/data.bin', '/nested/empty'],
  parsePath: parseRepositoryPath,
  rootPath: REPOSITORY_ROOT,
  symlinkPath: '/link',
  unicodePath: fixtures.primary.unicodePath,
});

describe('createFilesystemRepositoryReader', () => {
  test('returns a frozen reader with only the source-neutral operations', async () => {
    const reader = await createFilesystemRepositoryReader({
      rootDirectory: fixtures.primary.rootDirectory,
      selection: { kind: 'directory' },
    });

    expect(Object.isFrozen(reader)).toBe(true);
    expect(Object.keys(reader).sort()).toStrictEqual(['getEntry', 'listEntries', 'readFile']);
  });

  test('exposes only selected paths and their required directory parents', async () => {
    const reader = await createFilesystemRepositoryReader({
      rootDirectory: fixtures.primary.rootDirectory,
      selection: {
        kind: 'paths',
        paths: [parseRepositoryPath('/README.md'), parseRepositoryPath('/nested/deep/data.bin')],
      },
    });
    const entries = await collectEntries(reader.listEntries());

    expect(entries.map((entry) => entry.path).sort()).toStrictEqual([
      '/README.md',
      '/nested',
      '/nested/deep',
      '/nested/deep/data.bin',
    ]);
    await expect(reader.getEntry(parseRepositoryPath('/empty.bin'))).resolves.toBeNull();
  });

  test('detaches mutable caller options before asynchronous construction continues', async () => {
    const selectedPaths: IRepositoryPath[] = [parseRepositoryPath('/README.md')];
    const limits = {
      maxCachedBytes: 1024,
      maxEntries: 4,
      maxFileBytes: 1024,
    };
    const options = {
      limits,
      rootDirectory: fixtures.primary.rootDirectory,
      selection: { kind: 'paths' as const, paths: selectedPaths },
    };
    const pendingReader = createFilesystemRepositoryReader(options);

    selectedPaths[0] = parseRepositoryPath('/missing.txt');
    limits.maxEntries = 1;
    options.rootDirectory = path.join(fixtures.primary.rootDirectory, 'missing');

    const reader = await pendingReader;

    await expect(reader.readFile(parseRepositoryPath('/README.md'))).resolves.toStrictEqual(
      new TextEncoder().encode('repository fixture\n'),
    );
  });

  test('uses the creation signal only while constructing the reader', async () => {
    const controller = new AbortController();
    const reader = await createFilesystemRepositoryReader({
      rootDirectory: fixtures.primary.rootDirectory,
      selection: { kind: 'directory' },
      signal: controller.signal,
    });

    controller.abort(new Error('creation is already complete'));

    await expect(reader.getEntry(parseRepositoryPath('/README.md'))).resolves.toStrictEqual({
      path: '/README.md',
      type: 'file',
    });
  });

  test('maps missing roots without exposing the selected host path', async () => {
    const missingRoot = path.join(fixtures.primary.rootDirectory, 'private-missing-root');
    const pendingReader = createFilesystemRepositoryReader({
      rootDirectory: missingRoot,
      selection: { kind: 'directory' },
    });

    await expectToRejectCode(pendingReader, 'ENTRY_NOT_FOUND');
    const cause: unknown = await pendingReader.then(
      () => new Error('The missing-root factory unexpectedly succeeded.'),
      (rejection: unknown) => rejection,
    );

    expect(cause).toBeInstanceOf(RepositorySourceException);

    if (!(cause instanceof RepositorySourceException)) {
      throw new Error('The missing-root factory returned the wrong exception type.');
    }

    expect(cause.message).not.toContain(missingRoot);
    expect(cause).toMatchObject({
      operation: 'create-reader',
      path: null,
      retryable: true,
    });
  });

  test('does not return a reader when construction is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by test'));

    const pendingReader = createFilesystemRepositoryReader({
      rootDirectory: fixtures.primary.rootDirectory,
      selection: { kind: 'directory' },
      signal: controller.signal,
    });

    await expectToRejectCode(pendingReader, 'ABORTED');
    await expect(pendingReader).rejects.toBeInstanceOf(RepositorySourceException);
    await expect(pendingReader).rejects.toMatchObject({
      operation: 'create-reader',
      path: null,
      retryable: true,
    });
  });
});
