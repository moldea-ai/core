import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';
import { createFilesystemRepositoryReader } from '@moldea.ai/repository-fs';

import { createGitContentTransformationGuardRepositoryReader } from '../repository-content-transformation-guard/index.js';
import { createGitSymlinkOverlayRepositoryReader } from '../repository-symlink-overlay/index.js';

import type { IWorkingTreeRepositoryReaderFactory } from './types.js';

// injectable package and overlay factories used by the composition boundary
type IFilesystemRepositoryReaderFactory = typeof createFilesystemRepositoryReader;
type IGitContentTransformationGuardRepositoryReaderFactory =
  typeof createGitContentTransformationGuardRepositoryReader;
type IGitSymlinkOverlayRepositoryReaderFactory = typeof createGitSymlinkOverlayRepositoryReader;

/**
 * Creates the private working-tree reader factory around injectable composition boundaries.
 * @param filesystemReaderFactory The exact-path filesystem snapshot factory.
 * @param symlinkOverlayFactory The logical Git symlink overlay factory.
 * @param contentTransformationGuardFactory The guarded logical regular-file reader factory.
 * @returns A factory that composes one coherent selected working-tree reader.
 */
export const createWorkingTreeRepositoryReaderFactory =
  (
    filesystemReaderFactory: IFilesystemRepositoryReaderFactory = createFilesystemRepositoryReader,
    symlinkOverlayFactory: IGitSymlinkOverlayRepositoryReaderFactory = createGitSymlinkOverlayRepositoryReader,
    contentTransformationGuardFactory: IGitContentTransformationGuardRepositoryReaderFactory = createGitContentTransformationGuardRepositoryReader,
  ): IWorkingTreeRepositoryReaderFactory =>
  async (input): Promise<IRepositoryReader> => {
    const selectedPaths = Object.freeze(input.entries.map((entry) => entry.path));
    const symlinkOverlayPaths = Object.freeze(
      input.entries.reduce<IRepositoryPath[]>((paths, entry) => {
        if (entry.requiresSymlinkOverlay) {
          paths.push(entry.path);
        }

        return paths;
      }, []),
    );
    const guardedPaths = Object.freeze(
      input.entries.reduce<IRepositoryPath[]>((paths, entry) => {
        if (entry.contentTransformation.isGuarded) {
          paths.push(entry.path);
        }

        return paths;
      }, []),
    );
    const filesystemReader = await filesystemReaderFactory({
      limits: Object.freeze({
        maxCachedBytes: input.resourceLimits.maxTotalBytes,
        maxEntries: input.resourceLimits.maxEntries,
        maxFileBytes: input.resourceLimits.maxFileBytes,
      }),
      rootDirectory: input.repositoryRoot,
      selection: Object.freeze({ kind: 'paths', paths: selectedPaths }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    const overlaidReader = symlinkOverlayFactory(filesystemReader, symlinkOverlayPaths);

    return contentTransformationGuardFactory(overlaidReader, guardedPaths);
  };

// default exact-path working-tree reader composition used by command execution
export const createWorkingTreeRepositoryReader = createWorkingTreeRepositoryReaderFactory();
