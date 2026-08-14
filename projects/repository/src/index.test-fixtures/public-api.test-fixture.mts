import {
  REPOSITORY_ROOT,
  RepositoryPathException,
  RepositorySourceException,
  isRepositoryPath,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryEntryType,
  type IRepositoryListOptions,
  type IRepositoryOperation,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
  type IRepositoryPathExceptionOptions,
  type IRepositoryReader,
  type IRepositorySourceErrorCode,
  type IRepositorySourceExceptionOptions,
} from '@moldea.ai/repository';
import {
  createMemoryRepositoryReader,
  type IMemoryRepositoryEntry,
} from '@moldea.ai/repository/memory';

const repositoryPath: IRepositoryPath = parseRepositoryPath('/file.txt');
const root: IRepositoryPath = REPOSITORY_ROOT;
const entryType: IRepositoryEntryType = 'file';
const entry: IRepositoryEntry = { path: repositoryPath, type: entryType };
const operationOptions: IRepositoryOperationOptions = {
  signal: new AbortController().signal,
};
const listOptions: IRepositoryListOptions = { prefix: root, ...operationOptions };
const operation: IRepositoryOperation = 'read-file';
const sourceCode: IRepositorySourceErrorCode = 'ENTRY_NOT_FOUND';
const pathExceptionOptions: IRepositoryPathExceptionOptions = { cause: new Error('cause') };
const sourceExceptionOptions: IRepositorySourceExceptionOptions = {
  code: sourceCode,
  operation,
  path: repositoryPath,
  retryable: false,
};
const memoryEntries: readonly IMemoryRepositoryEntry[] = [
  { content: new Uint8Array([1]), path: repositoryPath, type: 'file' },
];
const reader: IRepositoryReader = createMemoryRepositoryReader(memoryEntries);
const pathException = new RepositoryPathException(pathExceptionOptions);
const sourceException = new RepositorySourceException(sourceExceptionOptions);

if (!isRepositoryPath(repositoryPath)) {
  throw new Error('The packaged repository path predicate rejected a valid path.');
}

void [entry, listOptions, reader, pathException, sourceException];

// @ts-expect-error A plain string has not passed runtime repository-path validation.
const forgedPath: IRepositoryPath = '/unvalidated.txt';
void forgedPath;
