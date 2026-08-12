import {
  parseRepositoryPath,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';
// @ts-expect-error The Repository FS package has no default export.
import repositoryFilesystemDefault from '@moldea.ai/repository-fs';
import {
  DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS,
  createFilesystemRepositoryReader,
  type IFilesystemRepositoryDirectorySelection,
  type IFilesystemRepositoryPathSelection,
  type IFilesystemRepositoryReaderOptions,
  type IFilesystemRepositoryResourceLimits,
  type IFilesystemRepositorySelection,
} from '@moldea.ai/repository-fs';
import {
  // @ts-expect-error Verified file capture remains an internal reader-building detail.
  createFilesystemRepositoryReaderState,
  // @ts-expect-error Reader lifecycle mutation remains an internal reader-building detail.
  markFilesystemRepositoryReaderInvalidated,
  // @ts-expect-error Per-path capture coordination remains an internal reader-building detail.
  coordinateFilesystemRepositoryFileCapture,
  // @ts-expect-error Capture capacity reservations remain an internal reader-building detail.
  reserveFilesystemFileCaptureCapacity,
  // @ts-expect-error Frozen inventory operations remain internal reader-building details.
  getFilesystemRepositoryEntry,
  // @ts-expect-error Frozen inventory operations remain internal reader-building details.
  listFilesystemRepositoryEntries,
  // @ts-expect-error Verified file reads remain internal until the cohesive reader is exposed.
  readFilesystemRepositoryFile,
} from '@moldea.ai/repository-fs';

const selectedPath: IRepositoryPath = parseRepositoryPath('/moldea/moldea.yaml');
const pathSelection: IFilesystemRepositoryPathSelection = {
  kind: 'paths',
  paths: [selectedPath],
};
const directorySelection: IFilesystemRepositoryDirectorySelection = { kind: 'directory' };
const selections: readonly IFilesystemRepositorySelection[] = [pathSelection, directorySelection];
const limits: IFilesystemRepositoryResourceLimits = {
  ...DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS,
};
const options: IFilesystemRepositoryReaderOptions = {
  limits,
  rootDirectory: '/absolute/repository/root',
  selection: pathSelection,
  signal: new AbortController().signal,
};
const reader: Promise<IRepositoryReader> = createFilesystemRepositoryReader(options);

void repositoryFilesystemDefault;
void reader;
void getFilesystemRepositoryEntry;
void listFilesystemRepositoryEntries;
void createFilesystemRepositoryReaderState;
void markFilesystemRepositoryReaderInvalidated;
void coordinateFilesystemRepositoryFileCapture;
void reserveFilesystemFileCaptureCapacity;
void readFilesystemRepositoryFile;
void selections;
void options;
