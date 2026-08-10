import { describe, expect, test } from 'vitest';
import { expectToRejectCode } from 'web-utils-kit';

import type { IRepositoryEntry, IRepositoryReader } from '../contracts.js';
import { RepositoryPathException, RepositorySourceException } from '../exceptions.js';
import { REPOSITORY_ROOT, parseRepositoryPath } from '../repository-path.js';

// inputs required to run the source-neutral reader conformance contract
export interface IRepositoryReaderConformanceFixture {
  readonly caseDistinctPaths: readonly [string, string];
  readonly createReader: () => IRepositoryReader;
  readonly createSnapshotMutationFixture: () => IRepositoryReaderSnapshotMutationFixture;
  readonly emptyFilePath: string;
  readonly expectedEntries: readonly IRepositoryEntry[];
  readonly fileBytes: Uint8Array;
  readonly filePath: string;
  readonly missingPath: string;
  readonly nestedDirectoryPath: string;
  readonly nestedExpectedPaths: readonly string[];
  readonly symlinkPath: string;
  readonly unicodePath: string;
}

export interface IRepositoryReaderSnapshotMutationFixture {
  readonly behavior: 'preserve-snapshot' | 'report-snapshot-changed';
  readonly mutateSource: () => Promise<void> | void;
  readonly reader: IRepositoryReader;
}

const collectEntries = async (
  entries: AsyncIterable<IRepositoryEntry>,
): Promise<IRepositoryEntry[]> => {
  const collected: IRepositoryEntry[] = [];

  for await (const entry of entries) {
    collected.push(entry);
  }

  return collected;
};

const sortEntries = (entries: readonly IRepositoryEntry[]): IRepositoryEntry[] => {
  return [...entries].sort((left, right) => {
    if (left.path < right.path) {
      return -1;
    }

    return left.path > right.path ? 1 : 0;
  });
};

/**
 * Defines the contract checks shared by every official repository reader.
 * @param implementationName The reader name shown in the generated suite.
 * @param fixture The source-specific reader factory and expected snapshot values.
 */
export const describeRepositoryReaderConformance = (
  implementationName: string,
  fixture: IRepositoryReaderConformanceFixture,
): void => {
  describe(`${implementationName} repository reader conformance`, () => {
    test('returns exact root, file, directory, symlink, and absent entries', async () => {
      const reader = fixture.createReader();

      await expect(reader.getEntry(REPOSITORY_ROOT)).resolves.toStrictEqual({
        path: REPOSITORY_ROOT,
        type: 'directory',
      });

      const filePath = parseRepositoryPath(fixture.filePath);
      const directoryPath = parseRepositoryPath(fixture.nestedDirectoryPath);
      const symlinkPath = parseRepositoryPath(fixture.symlinkPath);
      const firstEntry = await reader.getEntry(filePath);
      expect(firstEntry).toStrictEqual({ path: filePath, type: 'file' });
      await expect(reader.getEntry(directoryPath)).resolves.toStrictEqual({
        path: directoryPath,
        type: 'directory',
      });
      await expect(reader.getEntry(symlinkPath)).resolves.toStrictEqual({
        path: symlinkPath,
        type: 'symlink',
      });
      await expect(reader.getEntry(parseRepositoryPath(fixture.missingPath))).resolves.toBeNull();
    });

    test('isolates mutable and frozen returned entries from reader state', async () => {
      const reader = fixture.createReader();
      const filePath = parseRepositoryPath(fixture.filePath);
      const firstEntry = await reader.getEntry(filePath);

      expect(firstEntry).toStrictEqual({ path: filePath, type: 'file' });

      if (firstEntry === null) {
        throw new Error('The conformance fixture file is missing.');
      }

      Reflect.set(firstEntry, 'type', 'directory');
      await expect(reader.getEntry(filePath)).resolves.toStrictEqual({
        path: filePath,
        type: 'file',
      });

      const listedEntries = await collectEntries(reader.listEntries());
      const listedFile = listedEntries.find((entry) => entry.path === filePath);

      if (listedFile === undefined) {
        throw new Error('The conformance fixture file is absent from the listing.');
      }

      Reflect.set(listedFile, 'type', 'directory');
      await expect(reader.getEntry(filePath)).resolves.toStrictEqual({
        path: filePath,
        type: 'file',
      });
      expect(
        (await collectEntries(reader.listEntries())).find((entry) => entry.path === filePath),
      ).toStrictEqual({ path: filePath, type: 'file' });
    });

    test('recursively lists every root descendant once without including the prefix', async () => {
      const reader = fixture.createReader();
      const actual = await collectEntries(reader.listEntries());

      expect(sortEntries(actual)).toStrictEqual(sortEntries(fixture.expectedEntries));
      expect(new Set(actual.map((entry) => entry.path)).size).toBe(actual.length);
      expect(actual.some((entry) => entry.path === REPOSITORY_ROOT)).toBe(false);
    });

    test('recursively lists only descendants of a nested directory', async () => {
      const reader = fixture.createReader();
      const prefix = parseRepositoryPath(fixture.nestedDirectoryPath);
      const actual = await collectEntries(reader.listEntries({ prefix }));

      expect(actual.map((entry) => entry.path).sort()).toStrictEqual(
        [...fixture.nestedExpectedPaths].sort(),
      );
      expect(actual.some((entry) => entry.path === prefix)).toBe(false);
    });

    test('preserves exact and zero-length file bytes and returns fresh buffers', async () => {
      const reader = fixture.createReader();
      const filePath = parseRepositoryPath(fixture.filePath);
      const emptyFilePath = parseRepositoryPath(fixture.emptyFilePath);
      const firstRead = await reader.readFile(filePath);
      const secondRead = await reader.readFile(filePath);

      expect(firstRead).toStrictEqual(fixture.fileBytes);
      expect(secondRead).toStrictEqual(fixture.fileBytes);
      expect(firstRead).not.toBe(secondRead);
      firstRead[0] = 99;
      await expect(reader.readFile(filePath)).resolves.toStrictEqual(fixture.fileBytes);
      await expect(reader.readFile(emptyFilePath)).resolves.toStrictEqual(new Uint8Array());
    });

    test('preserves case-distinct and non-normalized Unicode paths exactly', async () => {
      const reader = fixture.createReader();
      const upperPath = parseRepositoryPath(fixture.caseDistinctPaths[0]);
      const lowerPath = parseRepositoryPath(fixture.caseDistinctPaths[1]);
      const unicodePath = parseRepositoryPath(fixture.unicodePath);

      await expect(reader.getEntry(upperPath)).resolves.toMatchObject({
        path: upperPath,
        type: 'file',
      });
      await expect(reader.getEntry(lowerPath)).resolves.toMatchObject({
        path: lowerPath,
        type: 'file',
      });
      await expect(reader.getEntry(unicodePath)).resolves.toMatchObject({
        path: unicodePath,
        type: 'file',
      });

      const decomposed = parseRepositoryPath(fixture.unicodePath.normalize('NFD'));

      if (decomposed !== unicodePath) {
        await expect(reader.getEntry(decomposed)).resolves.toBeNull();
      }
    });

    test('never follows symlinks and reports missing and wrong-type operations precisely', async () => {
      const reader = fixture.createReader();
      const symlinkPath = parseRepositoryPath(fixture.symlinkPath);
      const directoryPath = parseRepositoryPath(fixture.nestedDirectoryPath);
      const filePath = parseRepositoryPath(fixture.filePath);
      const missingPath = parseRepositoryPath(fixture.missingPath);

      const symlinkRead = reader.readFile(symlinkPath);
      await expectToRejectCode(symlinkRead, 'ENTRY_NOT_FILE');
      await expect(symlinkRead).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(symlinkRead).rejects.toMatchObject({
        operation: 'read-file',
        path: symlinkPath,
        retryable: false,
      });

      const directoryRead = reader.readFile(directoryPath);
      await expectToRejectCode(directoryRead, 'ENTRY_NOT_FILE');
      await expect(directoryRead).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(directoryRead).rejects.toMatchObject({
        operation: 'read-file',
        path: directoryPath,
        retryable: false,
      });

      const missingRead = reader.readFile(missingPath);
      await expectToRejectCode(missingRead, 'ENTRY_NOT_FOUND');
      await expect(missingRead).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(missingRead).rejects.toMatchObject({
        operation: 'read-file',
        path: missingPath,
        retryable: false,
      });

      const fileList = collectEntries(reader.listEntries({ prefix: filePath }));
      await expectToRejectCode(fileList, 'ENTRY_NOT_DIRECTORY');
      await expect(fileList).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(fileList).rejects.toMatchObject({
        operation: 'list-entries',
        path: filePath,
        retryable: false,
      });

      const missingList = collectEntries(reader.listEntries({ prefix: missingPath }));
      await expectToRejectCode(missingList, 'ENTRY_NOT_FOUND');
      await expect(missingList).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(missingList).rejects.toMatchObject({
        operation: 'list-entries',
        path: missingPath,
        retryable: false,
      });
    });

    test('runtime-validates forged logical paths in every public operation', async () => {
      const reader = fixture.createReader();
      const forgedPath = '../host-secret' as never;

      const getEntry = reader.getEntry(forgedPath);
      await expectToRejectCode(getEntry, 'INVALID_REPOSITORY_PATH');
      await expect(getEntry).rejects.toBeInstanceOf(RepositoryPathException);

      const readFile = reader.readFile(forgedPath);
      await expectToRejectCode(readFile, 'INVALID_REPOSITORY_PATH');
      await expect(readFile).rejects.toBeInstanceOf(RepositoryPathException);

      const forgedPrefixList = collectEntries(reader.listEntries({ prefix: forgedPath }));
      await expectToRejectCode(forgedPrefixList, 'INVALID_REPOSITORY_PATH');
      await expect(forgedPrefixList).rejects.toBeInstanceOf(RepositoryPathException);

      const nullPrefixList = collectEntries(reader.listEntries({ prefix: null as never }));
      await expectToRejectCode(nullPrefixList, 'INVALID_REPOSITORY_PATH');
      await expect(nullPrefixList).rejects.toBeInstanceOf(RepositoryPathException);
    });

    test('honors cancellation before and during operations without partial success', async () => {
      const reader = fixture.createReader();
      const path = parseRepositoryPath(fixture.filePath);
      const aborted = new AbortController();
      aborted.abort(new Error('cancelled by test'));

      const getEntry = reader.getEntry(path, { signal: aborted.signal });
      await expectToRejectCode(getEntry, 'ABORTED');
      await expect(getEntry).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(getEntry).rejects.toMatchObject({
        operation: 'get-entry',
        path,
        retryable: false,
      });

      const readFile = reader.readFile(path, { signal: aborted.signal });
      await expectToRejectCode(readFile, 'ABORTED');
      await expect(readFile).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(readFile).rejects.toMatchObject({
        operation: 'read-file',
        path,
        retryable: false,
      });

      const listEntries = collectEntries(reader.listEntries({ signal: aborted.signal }));
      await expectToRejectCode(listEntries, 'ABORTED');
      await expect(listEntries).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(listEntries).rejects.toMatchObject({
        operation: 'list-entries',
        path: REPOSITORY_ROOT,
        retryable: false,
      });

      const during = new AbortController();
      const iterator = reader.listEntries({ signal: during.signal })[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);
      during.abort();
      const nextEntry = iterator.next();
      await expectToRejectCode(nextEntry, 'ABORTED');
      await expect(nextEntry).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(nextEntry).rejects.toMatchObject({
        operation: 'list-entries',
        path: REPOSITORY_ROOT,
      });
      await expect(iterator.next()).resolves.toStrictEqual({ done: true, value: undefined });
    });

    test('supports concurrent and stable repeated reads from one snapshot', async () => {
      const reader = fixture.createReader();
      const path = parseRepositoryPath(fixture.filePath);
      const results = await Promise.all(Array.from({ length: 16 }, () => reader.readFile(path)));

      for (const result of results) {
        expect(result).toStrictEqual(fixture.fileBytes);
      }

      expect(new Set(results).size).toBe(results.length);
    });

    test('preserves one snapshot across source mutation or reports SNAPSHOT_CHANGED', async () => {
      const scenario = fixture.createSnapshotMutationFixture();
      const path = parseRepositoryPath(fixture.filePath);
      const entryBeforeMutation = await scenario.reader.getEntry(path);
      const bytesBeforeMutation = await scenario.reader.readFile(path);
      const listingBeforeMutation = sortEntries(
        await collectEntries(scenario.reader.listEntries()),
      ).map((entry) => ({ ...entry }));

      await scenario.mutateSource();

      if (scenario.behavior === 'report-snapshot-changed') {
        const readAfterMutation = scenario.reader.readFile(path);
        await expectToRejectCode(readAfterMutation, 'SNAPSHOT_CHANGED');
        await expect(readAfterMutation).rejects.toBeInstanceOf(RepositorySourceException);
        await expect(readAfterMutation).rejects.toMatchObject({
          operation: 'read-file',
          path,
        });
        return;
      }

      await expect(scenario.reader.getEntry(path)).resolves.toStrictEqual(entryBeforeMutation);
      await expect(scenario.reader.readFile(path)).resolves.toStrictEqual(bytesBeforeMutation);
      expect(sortEntries(await collectEntries(scenario.reader.listEntries()))).toStrictEqual(
        listingBeforeMutation,
      );
    });
  });
};
