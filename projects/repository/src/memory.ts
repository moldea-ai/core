import type {
  IRepositoryEntry,
  IRepositoryListOptions,
  IRepositoryOperationOptions,
  IRepositoryReader,
} from './contracts.js';
import { RepositorySourceException, type IRepositoryOperation } from './exceptions.js';
import { REPOSITORY_ROOT, parseRepositoryPath, type IRepositoryPath } from './repository-path.js';
import { hasOnlyUnicodeScalarValues } from './unicode.js';

export type IMemoryRepositoryEntry =
  | {
      readonly path: string;
      readonly type: 'file';
      readonly content: string | Uint8Array;
    }
  | {
      readonly path: string;
      readonly type: 'directory';
    }
  | {
      readonly path: string;
      readonly type: 'symlink';
    };

type IStoredRepositoryEntry =
  | {
      readonly path: IRepositoryPath;
      readonly type: 'file';
      readonly content: Uint8Array;
    }
  | {
      readonly path: IRepositoryPath;
      readonly type: 'directory' | 'symlink';
    };

const invalidSourceData = (path: IRepositoryPath | null): RepositorySourceException => {
  return new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation: 'create-reader',
    path,
    retryable: false,
  });
};

const throwIfAborted = (
  signal: AbortSignal | undefined,
  operation: IRepositoryOperation,
  path: IRepositoryPath,
): void => {
  if (!signal?.aborted) {
    return;
  }

  throw new RepositorySourceException({
    cause: signal.reason,
    code: 'ABORTED',
    operation,
    path,
    retryable: false,
  });
};

const getParentPath = (path: IRepositoryPath): IRepositoryPath | null => {
  if (path === REPOSITORY_ROOT) {
    return null;
  }

  const lastSeparatorIndex = path.lastIndexOf('/');
  const parent = lastSeparatorIndex === 0 ? REPOSITORY_ROOT : path.slice(0, lastSeparatorIndex);

  return parseRepositoryPath(parent);
};

const cloneEntry = (entry: IStoredRepositoryEntry): IRepositoryEntry => {
  return {
    path: entry.path,
    type: entry.type,
  };
};

const comparePaths = (left: IRepositoryPath, right: IRepositoryPath): number => {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
};

const normalizeEntry = (candidate: unknown): IStoredRepositoryEntry => {
  if (typeof candidate !== 'object' || candidate === null) {
    throw invalidSourceData(null);
  }

  const entry = candidate as Readonly<Record<string, unknown>>;
  const path = parseRepositoryPath(entry['path'] as string);

  if (path === REPOSITORY_ROOT) {
    throw invalidSourceData(path);
  }

  if (entry['type'] === 'directory' || entry['type'] === 'symlink') {
    return {
      path,
      type: entry['type'],
    };
  }

  if (entry['type'] !== 'file') {
    throw invalidSourceData(path);
  }

  if (typeof entry['content'] === 'string') {
    if (!hasOnlyUnicodeScalarValues(entry['content'])) {
      throw invalidSourceData(path);
    }

    return {
      content: new TextEncoder().encode(entry['content']),
      path,
      type: 'file',
    };
  }

  if (!(entry['content'] instanceof Uint8Array)) {
    throw invalidSourceData(path);
  }

  return {
    content: new Uint8Array(entry['content']),
    path,
    type: 'file',
  };
};

const materializeEntries = (
  entries: unknown,
): ReadonlyMap<IRepositoryPath, IStoredRepositoryEntry> => {
  if (!Array.isArray(entries)) {
    throw invalidSourceData(null);
  }

  const explicitEntries = new Map<IRepositoryPath, IStoredRepositoryEntry>();

  for (const candidate of entries as readonly unknown[]) {
    const entry = normalizeEntry(candidate);

    if (explicitEntries.has(entry.path)) {
      throw invalidSourceData(entry.path);
    }

    explicitEntries.set(entry.path, entry);
  }

  for (const entry of explicitEntries.values()) {
    let parent = getParentPath(entry.path);

    while (parent !== null && parent !== REPOSITORY_ROOT) {
      const explicitParent = explicitEntries.get(parent);

      if (explicitParent !== undefined && explicitParent.type !== 'directory') {
        throw invalidSourceData(entry.path);
      }

      parent = getParentPath(parent);
    }
  }

  const materializedEntries = new Map<IRepositoryPath, IStoredRepositoryEntry>([
    [
      REPOSITORY_ROOT,
      {
        path: REPOSITORY_ROOT,
        type: 'directory',
      },
    ],
  ]);

  for (const entry of explicitEntries.values()) {
    materializedEntries.set(entry.path, entry);

    let parent = getParentPath(entry.path);

    while (parent !== null && parent !== REPOSITORY_ROOT) {
      if (!materializedEntries.has(parent)) {
        materializedEntries.set(parent, {
          path: parent,
          type: 'directory',
        });
      }

      parent = getParentPath(parent);
    }
  }

  return materializedEntries;
};

class MemoryRepositoryReader implements IRepositoryReader {
  readonly #entries: ReadonlyMap<IRepositoryPath, IStoredRepositoryEntry>;

  public constructor(entries: readonly IMemoryRepositoryEntry[]) {
    this.#entries = materializeEntries(entries);
  }

  public async getEntry(
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<IRepositoryEntry | null> {
    const parsedPath = parseRepositoryPath(path);
    await Promise.resolve();
    throwIfAborted(options?.signal, 'get-entry', parsedPath);

    const entry = this.#entries.get(parsedPath);

    if (entry === undefined) {
      return null;
    }

    const result = cloneEntry(entry);
    throwIfAborted(options?.signal, 'get-entry', parsedPath);

    return result;
  }

  public async readFile(
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<Uint8Array> {
    const parsedPath = parseRepositoryPath(path);
    await Promise.resolve();
    throwIfAborted(options?.signal, 'read-file', parsedPath);

    const entry = this.#entries.get(parsedPath);

    if (entry === undefined) {
      throw new RepositorySourceException({
        code: 'ENTRY_NOT_FOUND',
        operation: 'read-file',
        path: parsedPath,
        retryable: false,
      });
    }

    if (entry.type !== 'file') {
      throw new RepositorySourceException({
        code: 'ENTRY_NOT_FILE',
        operation: 'read-file',
        path: parsedPath,
        retryable: false,
      });
    }

    const result = new Uint8Array(entry.content);
    throwIfAborted(options?.signal, 'read-file', parsedPath);

    return result;
  }

  public async *listEntries(options?: IRepositoryListOptions): AsyncIterable<IRepositoryEntry> {
    const prefix =
      options?.prefix === undefined ? REPOSITORY_ROOT : parseRepositoryPath(options.prefix);
    await Promise.resolve();
    throwIfAborted(options?.signal, 'list-entries', prefix);

    const prefixEntry = this.#entries.get(prefix);

    if (prefixEntry === undefined) {
      throw new RepositorySourceException({
        code: 'ENTRY_NOT_FOUND',
        operation: 'list-entries',
        path: prefix,
        retryable: false,
      });
    }

    if (prefixEntry.type !== 'directory') {
      throw new RepositorySourceException({
        code: 'ENTRY_NOT_DIRECTORY',
        operation: 'list-entries',
        path: prefix,
        retryable: false,
      });
    }

    const descendantPrefix = prefix === REPOSITORY_ROOT ? REPOSITORY_ROOT : `${prefix}/`;
    const descendants = [...this.#entries.values()]
      .filter((entry) => entry.path !== prefix && entry.path.startsWith(descendantPrefix))
      .sort((left, right) => comparePaths(left.path, right.path));

    for (const entry of descendants) {
      throwIfAborted(options?.signal, 'list-entries', prefix);
      yield cloneEntry(entry);
    }

    throwIfAborted(options?.signal, 'list-entries', prefix);
  }
}

/** Creates an immutable in-memory repository reader. */
export const createMemoryRepositoryReader = (
  entries: readonly IMemoryRepositoryEntry[],
): IRepositoryReader => {
  return new MemoryRepositoryReader(entries);
};
