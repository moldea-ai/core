// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import { DEFAULT_CORE_RESOURCE_LIMITS } from '../constants/index.js';
import { CoreOperationException } from '../exceptions/index.js';

import { createRepositoryInspectionSession } from './index.js';

const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');
const PROJECT_PATH = parseRepositoryPath('/moldea/project.md');
const CONTEXT_PATH = parseRepositoryPath('/moldea/context/shared.md');
const OTHER_PATH = parseRepositoryPath('/moldea/context/other.md');

interface IDeferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (result: T) => void;
}

const createDeferred = <T>(): IDeferred<T> => {
  let resolvePromise!: (result: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
};

const createEntryIterable = (
  entries: readonly IRepositoryEntry[],
): AsyncIterable<IRepositoryEntry> => ({
  [Symbol.asyncIterator]: () => {
    let index = 0;

    return {
      next: () => {
        const entry = entries[index];

        if (entry === undefined) {
          return Promise.resolve({ done: true, value: undefined });
        }

        index += 1;
        return Promise.resolve({ done: false, value: entry });
      },
    };
  },
});

const createReader = (overrides?: Partial<IRepositoryReader>): IRepositoryReader => ({
  getEntry: () => Promise.resolve(null),
  listEntries: () => createEntryIterable([]),
  readFile: () => Promise.resolve(new Uint8Array()),
  ...overrides,
});

const collectEntries = async (
  entries: AsyncIterable<IRepositoryEntry>,
): Promise<IRepositoryEntry[]> => {
  const collected: IRepositoryEntry[] = [];

  for await (const entry of entries) {
    collected.push(entry);
  }

  return collected;
};

describe('repository inspection session', () => {
  test('rejects an already-aborted inspection before accessing the repository', () => {
    const cancellation = new Error('inspection cancelled');
    const controller = new AbortController();
    controller.abort(cancellation);
    let operationCount = 0;
    const repository = createReader({
      getEntry: () => {
        operationCount += 1;
        return Promise.resolve(null);
      },
    });

    let thrownError: unknown;

    try {
      createRepositoryInspectionSession(
        repository,
        DEFAULT_CORE_RESOURCE_LIMITS,
        controller.signal,
      );
    } catch (error: unknown) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(CoreOperationException);
    expect(thrownError).toMatchObject({
      cause: cancellation,
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: true,
    });
    expect(operationCount).toBe(0);
  });

  test('counts distinct paths once across exact lookups, prefixes, and repeated listings', async () => {
    const listedEntry: IRepositoryEntry = { path: PROJECT_PATH, type: 'file' };
    const repository = createReader({
      getEntry: (path) => Promise.resolve(path === PROJECT_PATH ? listedEntry : null),
      listEntries: () => createEntryIterable([listedEntry]),
    });
    const session = createRepositoryInspectionSession(repository, {
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxEntries: 2,
    });

    await expect(session.reader.getEntry(PROJECT_PATH)).resolves.toStrictEqual(listedEntry);
    await expect(collectEntries(session.reader.listEntries())).resolves.toStrictEqual([
      listedEntry,
    ]);
    await expect(collectEntries(session.reader.listEntries())).resolves.toStrictEqual([
      listedEntry,
    ]);
    await expect(session.reader.getEntry(parseRepositoryPath('/missing'))).resolves.toBeNull();
    await expect(
      collectEntries(session.reader.listEntries({ prefix: parseRepositoryPath('/moldea') })),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxEntries',
      operation: 'inspect-project',
      retryable: false,
    });
  });

  test('returns detached exact entries and rejects mismatched reader paths', async () => {
    const sourceEntry: { path: IRepositoryPath; type: 'file' | 'directory' } = {
      path: PROJECT_PATH,
      type: 'file',
    };
    const repository = createReader({
      getEntry: () => Promise.resolve(sourceEntry),
    });
    const session = createRepositoryInspectionSession(repository, DEFAULT_CORE_RESOURCE_LIMITS);
    const result = await session.reader.getEntry(PROJECT_PATH);

    expect(result).toStrictEqual({ path: PROJECT_PATH, type: 'file' });
    expect(result).not.toBe(sourceEntry);
    sourceEntry.type = 'directory';
    expect(result).toStrictEqual({ path: PROJECT_PATH, type: 'file' });

    await expect(session.reader.getEntry(CONTEXT_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'get-entry',
      path: PROJECT_PATH,
      retryable: false,
    });
  });

  test.each([
    [
      'an entry outside the requested prefix',
      [
        { path: CONTEXT_PATH, type: 'file' },
        { path: PROJECT_PATH, type: 'file' },
      ],
      PROJECT_PATH,
    ],
    [
      'a duplicate entry',
      [
        { path: CONTEXT_PATH, type: 'file' },
        { path: CONTEXT_PATH, type: 'file' },
      ],
      CONTEXT_PATH,
    ],
  ] as const)('rejects %s returned by listing', async (_description, candidates, invalidPath) => {
    const repository = createReader({
      listEntries: () => createEntryIterable(candidates),
    });
    const session = createRepositoryInspectionSession(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    await expect(
      collectEntries(
        session.reader.listEntries({ prefix: parseRepositoryPath('/moldea/context') }),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'list-entries',
      path: invalidPath,
      retryable: false,
    });
  });

  test('shares one concurrent source read and returns a fresh byte array to every caller', async () => {
    const sourceRead = createDeferred<Uint8Array>();
    let readCount = 0;
    const repository = createReader({
      readFile: () => {
        readCount += 1;
        return sourceRead.promise;
      },
    });
    const session = createRepositoryInspectionSession(repository, {
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxEntries: 1,
    });
    const firstRead = session.reader.readFile(PROJECT_PATH);
    const secondRead = session.reader.readFile(PROJECT_PATH);

    expect(readCount).toBe(1);
    sourceRead.resolve(Uint8Array.from([1, 2, 3, 4]));

    const [first, second] = await Promise.all([firstRead, secondRead]);
    expect(first).toStrictEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(second).toStrictEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(first).not.toBe(second);

    first[0] = 9;
    const third = await session.reader.readFile(PROJECT_PATH);

    expect(third).toStrictEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(third).not.toBe(second);
    expect(readCount).toBe(1);
    await expect(session.reader.getEntry(OTHER_PATH)).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxEntries',
    });
  });

  test('isolates caller cancellation from a shared in-flight read', async () => {
    const sourceRead = createDeferred<Uint8Array>();
    const inspectionController = new AbortController();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const cancellation = new Error('first caller stopped');
    let readCount = 0;
    const repository = createReader({
      readFile: () => {
        readCount += 1;
        return sourceRead.promise;
      },
    });
    const session = createRepositoryInspectionSession(
      repository,
      DEFAULT_CORE_RESOURCE_LIMITS,
      inspectionController.signal,
    );
    const firstRead = session.reader.readFile(PROJECT_PATH, {
      signal: firstController.signal,
    });
    const secondRead = session.reader.readFile(PROJECT_PATH, {
      signal: secondController.signal,
    });

    firstController.abort(cancellation);

    await expect(firstRead).rejects.toMatchObject({
      cause: cancellation,
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: true,
    });
    expect(readCount).toBe(1);

    sourceRead.resolve(Uint8Array.from([1, 2]));

    await expect(secondRead).resolves.toStrictEqual(Uint8Array.from([1, 2]));
    await expect(session.reader.readFile(PROJECT_PATH)).resolves.toStrictEqual(
      Uint8Array.from([1, 2]),
    );
    expect(readCount).toBe(1);
  });

  test('applies the manifest and ordinary file limits before caching source bytes', async () => {
    const sourceBytes = new Uint8Array(3);
    Object.defineProperty(sourceBytes, 'slice', {
      value: () => {
        throw new TypeError('Source bytes were copied before enforcing their file limit.');
      },
    });
    const repository = createReader({ readFile: () => Promise.resolve(sourceBytes) });
    const limits = {
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxFileBytes: 2,
      maxManifestBytes: 2,
    };

    await expect(
      createRepositoryInspectionSession(repository, limits).reader.readFile(MANIFEST_PATH),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxManifestBytes',
      operation: 'inspect-project',
    });
    await expect(
      createRepositoryInspectionSession(repository, limits).reader.readFile(PROJECT_PATH),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      operation: 'inspect-project',
    });

    const inclusiveRepository = createReader({
      readFile: () => Promise.resolve(new Uint8Array(2)),
    });
    const inclusiveSession = createRepositoryInspectionSession(inclusiveRepository, limits);

    await expect(inclusiveSession.reader.readFile(MANIFEST_PATH)).resolves.toHaveLength(2);
    await expect(inclusiveSession.reader.readFile(PROJECT_PATH)).resolves.toHaveLength(2);
  });

  test('counts each successfully cached file once against the total-byte limit', async () => {
    const contents = new Map<IRepositoryPath, Uint8Array>([
      [PROJECT_PATH, new Uint8Array(2)],
      [CONTEXT_PATH, new Uint8Array(2)],
      [OTHER_PATH, new Uint8Array(1)],
    ]);
    const readCounts = new Map<IRepositoryPath, number>();
    const repository = createReader({
      readFile: (path) => {
        readCounts.set(path, (readCounts.get(path) ?? 0) + 1);
        return Promise.resolve(contents.get(path) ?? new Uint8Array());
      },
    });
    const session = createRepositoryInspectionSession(repository, {
      ...DEFAULT_CORE_RESOURCE_LIMITS,
      maxFileBytes: 4,
      maxTotalBytesRead: 4,
    });

    await session.reader.readFile(PROJECT_PATH);
    await session.reader.readFile(PROJECT_PATH);
    await session.reader.readFile(CONTEXT_PATH);

    await expect(session.reader.readFile(OTHER_PATH)).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxTotalBytesRead',
      operation: 'inspect-project',
      retryable: false,
    });
    expect(readCounts).toStrictEqual(
      new Map<IRepositoryPath, number>([
        [PROJECT_PATH, 1],
        [CONTEXT_PATH, 1],
        [OTHER_PATH, 1],
      ]),
    );
  });

  test('does not cache failed reads and preserves repository source exceptions', async () => {
    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: PROJECT_PATH,
      retryable: true,
    });
    let readCount = 0;
    const repository = createReader({
      readFile: () => {
        readCount += 1;
        return Promise.reject(sourceFailure);
      },
    });
    const session = createRepositoryInspectionSession(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    await expect(session.reader.readFile(PROJECT_PATH)).rejects.toBe(sourceFailure);
    await expect(session.reader.readFile(PROJECT_PATH)).rejects.toBe(sourceFailure);
    expect(readCount).toBe(2);
  });

  test('rejects malformed file content with a repository source exception', async () => {
    const repository = createReader({
      readFile: () => Promise.resolve('not bytes' as never),
    });
    const session = createRepositoryInspectionSession(repository, DEFAULT_CORE_RESOURCE_LIMITS);

    await expect(session.reader.readFile(PROJECT_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'read-file',
      path: PROJECT_PATH,
      retryable: false,
    });
  });

  test('observes cancellation after an in-flight source read completes', async () => {
    const sourceRead = createDeferred<Uint8Array>();
    const cancellation = new Error('inspection cancelled');
    const controller = new AbortController();
    let forwardedSignal: AbortSignal | undefined;
    const repository = createReader({
      readFile: (_path, options) => {
        forwardedSignal = options?.signal;
        return sourceRead.promise;
      },
    });
    const session = createRepositoryInspectionSession(
      repository,
      DEFAULT_CORE_RESOURCE_LIMITS,
      controller.signal,
    );
    const result = session.reader.readFile(PROJECT_PATH);

    expect(forwardedSignal).toBe(controller.signal);
    controller.abort(cancellation);
    sourceRead.resolve(new Uint8Array(2));

    await expect(result).rejects.toMatchObject({
      cause: cancellation,
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: true,
    });
  });

  test('forwards the inspection signal to every source operation', async () => {
    const controller = new AbortController();
    const consumerController = new AbortController();
    const forwardedSignals: (AbortSignal | undefined)[] = [];
    const repository = createReader({
      getEntry: (path, options) => {
        expect(path).toBe(PROJECT_PATH);
        forwardedSignals.push(options?.signal);
        return Promise.resolve(null);
      },
      listEntries: (options) => {
        forwardedSignals.push(options?.signal);
        return createEntryIterable([]);
      },
      readFile: (path, options) => {
        expect(path).toBe(PROJECT_PATH);
        forwardedSignals.push(options?.signal);
        return Promise.resolve(new Uint8Array());
      },
    });
    const session = createRepositoryInspectionSession(
      repository,
      DEFAULT_CORE_RESOURCE_LIMITS,
      controller.signal,
    );

    await session.reader.getEntry(PROJECT_PATH, { signal: consumerController.signal });
    await collectEntries(session.reader.listEntries({ signal: consumerController.signal }));
    await session.reader.readFile(PROJECT_PATH, { signal: consumerController.signal });

    expect(forwardedSignals).toStrictEqual([
      controller.signal,
      controller.signal,
      controller.signal,
    ]);
  });

  test('keeps caches and budgets isolated between frozen sessions', async () => {
    let readCount = 0;
    const repository = createReader({
      readFile: () => {
        readCount += 1;
        return Promise.resolve(new Uint8Array(2));
      },
    });
    const limits = { ...DEFAULT_CORE_RESOURCE_LIMITS, maxTotalBytesRead: 2 };
    const firstSession = createRepositoryInspectionSession(repository, limits);
    const secondSession = createRepositoryInspectionSession(repository, limits);

    await firstSession.reader.readFile(PROJECT_PATH);
    await secondSession.reader.readFile(PROJECT_PATH);

    expect(readCount).toBe(2);
    expect(Object.isFrozen(firstSession)).toBe(true);
    expect(Object.isFrozen(firstSession.reader)).toBe(true);
    expect(Object.isFrozen(secondSession)).toBe(true);
    expect(Object.isFrozen(secondSession.reader)).toBe(true);
  });
});
