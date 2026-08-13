// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';
import type { createFilesystemRepositoryReader } from '@moldea.ai/repository-fs';

import type { createGitContentTransformationGuardRepositoryReader } from '../repository-content-transformation-guard/index.js';
import type { createGitSymlinkOverlayRepositoryReader } from '../repository-symlink-overlay/index.js';

import { createWorkingTreeRepositoryReaderFactory } from './factory.js';
import type { IWorkingTreeRepositoryReaderInput } from './types.js';

/** Creates one complete normalized reader-composition input. */
const createReaderInput = (): IWorkingTreeRepositoryReaderInput => ({
  entries: Object.freeze([
    Object.freeze({
      contentTransformation: Object.freeze({
        filter: 'private',
        ident: 'unspecified',
        isGuarded: true,
        workingTreeEncoding: 'unspecified',
      }),
      entryType: 'file' as const,
      indexEntries: Object.freeze([Object.freeze({ mode: '120000' as const, stage: 0 as const })]),
      kind: 'tracked' as const,
      path: parseRepositoryPath('/moldea/link'),
      requiresSymlinkOverlay: true,
    }),
    Object.freeze({
      contentTransformation: Object.freeze({
        filter: 'unspecified',
        ident: 'unspecified',
        isGuarded: false,
        workingTreeEncoding: 'unspecified',
      }),
      entryType: 'file' as const,
      kind: 'untracked' as const,
      path: parseRepositoryPath('/moldea/project.md'),
      requiresSymlinkOverlay: false as const,
    }),
  ]),
  repositoryRoot: '/workspace',
  resourceLimits: Object.freeze({
    maxDiagnostics: 10_000,
    maxEntries: 100_000,
    maxEvidence: 10_000,
    maxFileBytes: 8_388_608,
    maxManifestBytes: 2_097_152,
    maxTotalBytes: 134_217_728,
  }),
});

describe('createWorkingTreeRepositoryReaderFactory', () => {
  test('composes exact paths, filesystem limits, and only required symlink overlays', async () => {
    const controller = new AbortController();
    const filesystemReader = createMemoryRepositoryReader([]);
    const overlaidReader = createMemoryRepositoryReader([]);
    const guardedReader = createMemoryRepositoryReader([]);
    const filesystemReaderFactory = vi
      .fn<typeof createFilesystemRepositoryReader>()
      .mockResolvedValue(filesystemReader);
    const symlinkOverlayFactory = vi
      .fn<typeof createGitSymlinkOverlayRepositoryReader>()
      .mockReturnValue(overlaidReader);
    const contentTransformationGuardFactory = vi
      .fn<typeof createGitContentTransformationGuardRepositoryReader>()
      .mockReturnValue(guardedReader);
    const createReader = createWorkingTreeRepositoryReaderFactory(
      filesystemReaderFactory,
      symlinkOverlayFactory,
      contentTransformationGuardFactory,
    );

    await expect(createReader({ ...createReaderInput(), signal: controller.signal })).resolves.toBe(
      guardedReader,
    );
    expect(filesystemReaderFactory).toHaveBeenCalledOnce();
    expect(filesystemReaderFactory).toHaveBeenCalledWith({
      limits: {
        maxCachedBytes: 134_217_728,
        maxEntries: 100_000,
        maxFileBytes: 8_388_608,
      },
      rootDirectory: '/workspace',
      selection: {
        kind: 'paths',
        paths: [parseRepositoryPath('/moldea/link'), parseRepositoryPath('/moldea/project.md')],
      },
      signal: controller.signal,
    });
    expect(symlinkOverlayFactory).toHaveBeenCalledOnce();
    expect(symlinkOverlayFactory).toHaveBeenCalledWith(filesystemReader, [
      parseRepositoryPath('/moldea/link'),
    ]);
    expect(contentTransformationGuardFactory).toHaveBeenCalledOnce();
    expect(contentTransformationGuardFactory).toHaveBeenCalledWith(overlaidReader, [
      parseRepositoryPath('/moldea/link'),
    ]);

    const filesystemOptions = filesystemReaderFactory.mock.calls[0]?.[0];
    const symlinkPaths = symlinkOverlayFactory.mock.calls[0]?.[1];
    const guardedPaths = contentTransformationGuardFactory.mock.calls[0]?.[1];

    expect(Object.isFrozen(filesystemOptions?.limits)).toBe(true);
    expect(Object.isFrozen(filesystemOptions?.selection)).toBe(true);
    expect(
      filesystemOptions?.selection.kind === 'paths' &&
        Object.isFrozen(filesystemOptions.selection.paths),
    ).toBe(true);
    expect(Object.isFrozen(symlinkPaths)).toBe(true);
    expect(Object.isFrozen(guardedPaths)).toBe(true);
  });
});
