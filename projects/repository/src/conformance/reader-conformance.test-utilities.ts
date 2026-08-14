import { describe, expect, test } from 'vitest';
import { expectToRejectCode } from 'web-utils-kit';

// host-sensitive behavior for logical paths that differ only by case
export type IRepositoryReaderCasePathFixture =
  | {
      readonly kind: 'distinct';
      readonly paths: readonly [string, string];
    }
  | {
      readonly existingPath: string;
      readonly kind: 'mismatch';
      readonly missingPath: string;
    };

// structural reader contract that avoids coupling test consumers to one package build location
export interface IRepositoryReaderConformanceEntry<TPath extends string> {
  readonly path: TPath;
  readonly type: 'file' | 'directory' | 'symlink';
}

export interface IRepositoryReaderConformanceReader<TPath extends string> {
  readonly getEntry: (
    path: TPath,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<IRepositoryReaderConformanceEntry<TPath> | null>;
  readonly listEntries: (options?: {
    readonly prefix?: TPath;
    readonly signal?: AbortSignal;
  }) => AsyncIterable<IRepositoryReaderConformanceEntry<TPath>>;
  readonly readFile: (
    path: TPath,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<Uint8Array>;
}

// inputs required to run the source-neutral reader conformance contract
export interface IRepositoryReaderConformanceFixture<TPath extends string> {
  readonly casePaths: IRepositoryReaderCasePathFixture;
  readonly createReader: () =>
    IRepositoryReaderConformanceReader<TPath> | Promise<IRepositoryReaderConformanceReader<TPath>>;
  readonly createSnapshotMutationFixture: () =>
    | IRepositoryReaderSnapshotMutationFixture<TPath>
    | Promise<IRepositoryReaderSnapshotMutationFixture<TPath>>;
  readonly emptyFilePath: string;
  readonly expectedEntries: readonly IRepositoryReaderConformanceEntry<TPath>[];
  readonly fileBytes: Uint8Array;
  readonly filePath: string;
  readonly isRepositoryPathException: (cause: unknown) => boolean;
  readonly isRepositorySourceException: (cause: unknown) => boolean;
  readonly missingPath: string;
  readonly nestedDirectoryPath: string;
  readonly nestedExpectedPaths: readonly string[];
  readonly parsePath: (candidate: string) => TPath;
  readonly rootPath: TPath;
  readonly symlinkPath: string;
  readonly unicodePath: string;
}

// source mutation scenario used to verify snapshot behavior after reader creation
export interface IRepositoryReaderSnapshotMutationFixture<TPath extends string> {
  readonly behavior: 'preserve-snapshot' | 'report-snapshot-changed';
  readonly mutateSource: () => Promise<void> | void;
  readonly reader: IRepositoryReaderConformanceReader<TPath>;
}

const collectEntries = async <TPath extends string>(
  entries: AsyncIterable<IRepositoryReaderConformanceEntry<TPath>>,
): Promise<IRepositoryReaderConformanceEntry<TPath>[]> => {
  const collected: IRepositoryReaderConformanceEntry<TPath>[] = [];

  for await (const entry of entries) {
    collected.push(entry);
  }

  return collected;
};

const sortEntries = <TPath extends string>(
  entries: readonly IRepositoryReaderConformanceEntry<TPath>[],
): IRepositoryReaderConformanceEntry<TPath>[] => {
  return [...entries].sort((left, right) => {
    if (left.path < right.path) {
      return -1;
    }

    return left.path > right.path ? 1 : 0;
  });
};

/** Verifies one rejection against the implementation-specific exception class. */
const expectRejectedException = async (
  operation: PromiseLike<unknown>,
  isExpectedException: (cause: unknown) => boolean,
): Promise<void> => {
  const cause = await operation.then(
    () => new Error('The conformance operation unexpectedly succeeded.'),
    (rejection: unknown) => rejection,
  );

  expect(isExpectedException(cause)).toBe(true);
};

/**
 * Defines the contract checks shared by every official repository reader.
 * @param implementationName The reader name shown in the generated suite.
 * @param fixture The source-specific reader factory and expected snapshot values.
 */
export const describeRepositoryReaderConformance = <TPath extends string>(
  implementationName: string,
  fixture: IRepositoryReaderConformanceFixture<TPath>,
): void => {
  describe(`${implementationName} repository reader conformance`, () => {
    test('returns exact root, file, directory, symlink, and absent entries', async () => {
      const reader = await fixture.createReader();

      await expect(reader.getEntry(fixture.rootPath)).resolves.toStrictEqual({
        path: fixture.rootPath,
        type: 'directory',
      });

      const filePath = fixture.parsePath(fixture.filePath);
      const directoryPath = fixture.parsePath(fixture.nestedDirectoryPath);
      const symlinkPath = fixture.parsePath(fixture.symlinkPath);
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
      await expect(reader.getEntry(fixture.parsePath(fixture.missingPath))).resolves.toBeNull();
    });

    test('isolates mutable and frozen returned entries from reader state', async () => {
      const reader = await fixture.createReader();
      const filePath = fixture.parsePath(fixture.filePath);
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
      const reader = await fixture.createReader();
      const actual = await collectEntries(reader.listEntries());

      expect(sortEntries(actual)).toStrictEqual(sortEntries(fixture.expectedEntries));
      expect(new Set(actual.map((entry) => entry.path)).size).toBe(actual.length);
      expect(actual.some((entry) => entry.path === fixture.rootPath)).toBe(false);
    });

    test('recursively lists only descendants of a nested directory', async () => {
      const reader = await fixture.createReader();
      const prefix = fixture.parsePath(fixture.nestedDirectoryPath);
      const actual = await collectEntries(reader.listEntries({ prefix }));

      expect(actual.map((entry) => entry.path).sort()).toStrictEqual(
        [...fixture.nestedExpectedPaths].sort(),
      );
      expect(actual.some((entry) => entry.path === prefix)).toBe(false);
    });

    test('preserves exact and zero-length file bytes and returns fresh buffers', async () => {
      const reader = await fixture.createReader();
      const filePath = fixture.parsePath(fixture.filePath);
      const emptyFilePath = fixture.parsePath(fixture.emptyFilePath);
      const firstRead = await reader.readFile(filePath);
      const secondRead = await reader.readFile(filePath);

      expect(firstRead).toStrictEqual(fixture.fileBytes);
      expect(secondRead).toStrictEqual(fixture.fileBytes);
      expect(firstRead).not.toBe(secondRead);
      firstRead[0] = 99;
      await expect(reader.readFile(filePath)).resolves.toStrictEqual(fixture.fileBytes);
      await expect(reader.readFile(emptyFilePath)).resolves.toStrictEqual(new Uint8Array());
    });

    test('preserves or rejects case-mismatched logical paths according to the source', async () => {
      const reader = await fixture.createReader();

      if (fixture.casePaths.kind === 'distinct') {
        const firstPath = fixture.parsePath(fixture.casePaths.paths[0]);
        const secondPath = fixture.parsePath(fixture.casePaths.paths[1]);

        await expect(reader.getEntry(firstPath)).resolves.toMatchObject({
          path: firstPath,
          type: 'file',
        });
        await expect(reader.getEntry(secondPath)).resolves.toMatchObject({
          path: secondPath,
          type: 'file',
        });
        return;
      }

      const existingPath = fixture.parsePath(fixture.casePaths.existingPath);
      const missingPath = fixture.parsePath(fixture.casePaths.missingPath);

      await expect(reader.getEntry(existingPath)).resolves.toMatchObject({
        path: existingPath,
        type: 'file',
      });
      await expect(reader.getEntry(missingPath)).resolves.toBeNull();
    });

    test('preserves non-normalized Unicode paths exactly', async () => {
      const reader = await fixture.createReader();
      const unicodePath = fixture.parsePath(fixture.unicodePath);

      await expect(reader.getEntry(unicodePath)).resolves.toMatchObject({
        path: unicodePath,
        type: 'file',
      });

      const alternateUnicodePath =
        fixture.unicodePath === fixture.unicodePath.normalize('NFC')
          ? fixture.unicodePath.normalize('NFD')
          : fixture.unicodePath.normalize('NFC');
      const alternatePath = fixture.parsePath(alternateUnicodePath);

      if (alternatePath !== unicodePath) {
        await expect(reader.getEntry(alternatePath)).resolves.toBeNull();
      }
    });

    test('never follows symlinks and reports missing and wrong-type operations precisely', async () => {
      const reader = await fixture.createReader();
      const symlinkPath = fixture.parsePath(fixture.symlinkPath);
      const directoryPath = fixture.parsePath(fixture.nestedDirectoryPath);
      const filePath = fixture.parsePath(fixture.filePath);
      const missingPath = fixture.parsePath(fixture.missingPath);

      const symlinkRead = reader.readFile(symlinkPath);
      await expectToRejectCode(symlinkRead, 'ENTRY_NOT_FILE');
      await expectRejectedException(symlinkRead, fixture.isRepositorySourceException);
      await expect(symlinkRead).rejects.toMatchObject({
        operation: 'read-file',
        path: symlinkPath,
        retryable: false,
      });

      const directoryRead = reader.readFile(directoryPath);
      await expectToRejectCode(directoryRead, 'ENTRY_NOT_FILE');
      await expectRejectedException(directoryRead, fixture.isRepositorySourceException);
      await expect(directoryRead).rejects.toMatchObject({
        operation: 'read-file',
        path: directoryPath,
        retryable: false,
      });

      const missingRead = reader.readFile(missingPath);
      await expectToRejectCode(missingRead, 'ENTRY_NOT_FOUND');
      await expectRejectedException(missingRead, fixture.isRepositorySourceException);
      await expect(missingRead).rejects.toMatchObject({
        operation: 'read-file',
        path: missingPath,
        retryable: false,
      });

      const fileList = collectEntries(reader.listEntries({ prefix: filePath }));
      await expectToRejectCode(fileList, 'ENTRY_NOT_DIRECTORY');
      await expectRejectedException(fileList, fixture.isRepositorySourceException);
      await expect(fileList).rejects.toMatchObject({
        operation: 'list-entries',
        path: filePath,
        retryable: false,
      });

      const missingList = collectEntries(reader.listEntries({ prefix: missingPath }));
      await expectToRejectCode(missingList, 'ENTRY_NOT_FOUND');
      await expectRejectedException(missingList, fixture.isRepositorySourceException);
      await expect(missingList).rejects.toMatchObject({
        operation: 'list-entries',
        path: missingPath,
        retryable: false,
      });
    });

    test('runtime-validates forged logical paths in every public operation', async () => {
      const reader = await fixture.createReader();
      const forgedPath = '../host-secret' as never;

      const getEntry = reader.getEntry(forgedPath);
      await expectToRejectCode(getEntry, 'INVALID_REPOSITORY_PATH');
      await expectRejectedException(getEntry, fixture.isRepositoryPathException);

      const readFile = reader.readFile(forgedPath);
      await expectToRejectCode(readFile, 'INVALID_REPOSITORY_PATH');
      await expectRejectedException(readFile, fixture.isRepositoryPathException);

      const forgedPrefixList = collectEntries(reader.listEntries({ prefix: forgedPath }));
      await expectToRejectCode(forgedPrefixList, 'INVALID_REPOSITORY_PATH');
      await expectRejectedException(forgedPrefixList, fixture.isRepositoryPathException);

      const nullPrefixList = collectEntries(reader.listEntries({ prefix: null as never }));
      await expectToRejectCode(nullPrefixList, 'INVALID_REPOSITORY_PATH');
      await expectRejectedException(nullPrefixList, fixture.isRepositoryPathException);
    });

    test('honors cancellation before and during operations without partial success', async () => {
      const reader = await fixture.createReader();
      const path = fixture.parsePath(fixture.filePath);
      const aborted = new AbortController();
      aborted.abort(new Error('cancelled by test'));

      const getEntry = reader.getEntry(path, { signal: aborted.signal });
      await expectToRejectCode(getEntry, 'ABORTED');
      await expectRejectedException(getEntry, fixture.isRepositorySourceException);
      await expect(getEntry).rejects.toMatchObject({
        operation: 'get-entry',
        path,
        retryable: false,
      });

      const readFile = reader.readFile(path, { signal: aborted.signal });
      await expectToRejectCode(readFile, 'ABORTED');
      await expectRejectedException(readFile, fixture.isRepositorySourceException);
      await expect(readFile).rejects.toMatchObject({
        operation: 'read-file',
        path,
        retryable: false,
      });

      const listEntries = collectEntries(reader.listEntries({ signal: aborted.signal }));
      await expectToRejectCode(listEntries, 'ABORTED');
      await expectRejectedException(listEntries, fixture.isRepositorySourceException);
      await expect(listEntries).rejects.toMatchObject({
        operation: 'list-entries',
        path: fixture.rootPath,
        retryable: false,
      });

      const during = new AbortController();
      const iterator = reader.listEntries({ signal: during.signal })[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);
      during.abort();
      const nextEntry = iterator.next();
      await expectToRejectCode(nextEntry, 'ABORTED');
      await expectRejectedException(nextEntry, fixture.isRepositorySourceException);
      await expect(nextEntry).rejects.toMatchObject({
        operation: 'list-entries',
        path: fixture.rootPath,
      });
      await expect(iterator.next()).resolves.toStrictEqual({ done: true, value: undefined });
    });

    test('supports concurrent and stable repeated reads from one snapshot', async () => {
      const reader = await fixture.createReader();
      const path = fixture.parsePath(fixture.filePath);
      const results = await Promise.all(Array.from({ length: 16 }, () => reader.readFile(path)));

      for (const result of results) {
        expect(result).toStrictEqual(fixture.fileBytes);
      }

      expect(new Set(results).size).toBe(results.length);
    });

    test('preserves one snapshot across source mutation or reports SNAPSHOT_CHANGED', async () => {
      const scenario = await fixture.createSnapshotMutationFixture();
      const path = fixture.parsePath(fixture.filePath);
      const entryBeforeMutation = await scenario.reader.getEntry(path);
      const bytesBeforeMutation = await scenario.reader.readFile(path);
      const listingBeforeMutation = sortEntries(
        await collectEntries(scenario.reader.listEntries()),
      ).map((entry) => ({ ...entry }));

      await scenario.mutateSource();

      if (scenario.behavior === 'report-snapshot-changed') {
        const readAfterMutation = scenario.reader.readFile(path);
        await expectToRejectCode(readAfterMutation, 'SNAPSHOT_CHANGED');
        await expectRejectedException(readAfterMutation, fixture.isRepositorySourceException);
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
